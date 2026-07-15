/**
 * App-wide foreground delivery for Supabase-backed chat messages.
 *
 * RLS remains the authority for which rows reach the browser. Account sessions
 * subscribe only to canonical `chat_messages`; compatibility writes are
 * mirrored there by the database trigger. Before presenting sound/card/mascot
 * feedback, the listener reads this account's own `muted_until` values through
 * `list_chat_inbox()`. Messages and unread counts still arrive normally.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { get } from 'svelte/store';
import { t } from 'svelte-i18n';
import { chatMessageHref } from '$lib/chat/chat-deep-link';
import {
	CHAT_PREFERENCES_CHANGED_EVENT,
	overrideMutedConversations,
	parseChatPreferencesChangedDetail
} from '$lib/chat/conversation-preferences';
import { presentCoupleMoment } from '$lib/couple/couple-moments';
import { getSupabaseClient } from '$lib/multiplayer/client';

type ForegroundMessageKind = 'text' | 'image' | 'audio' | 'video' | 'file';

export interface ForegroundMessageRow {
	id: string;
	conversationId: string;
	sender: string;
	kind: ForegroundMessageKind;
	body: string | null;
	mediaName: string | null;
	createdAt: string;
}

let channelSequence = 0;
const MUTE_CACHE_MS = 3_000;
const LOCAL_MUTE_OVERRIDE_MS = 15_000;

function text(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed || null;
}

/** Validate a row from the canonical rich-chat stream. Call history is owned
 * by CallLayer and is deliberately not re-announced as a normal message. */
export function parseRichMessageRow(value: unknown): ForegroundMessageRow | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	const id = text(raw.id);
	const conversationId = text(raw.conversation_id);
	const sender = text(raw.sender_id);
	const createdAt = text(raw.created_at);
	const kind = raw.kind;
	if (
		!id ||
		!conversationId ||
		!sender ||
		!createdAt ||
		(kind !== 'text' && kind !== 'image' && kind !== 'audio' && kind !== 'video' && kind !== 'file')
	) {
		return null;
	}
	return {
		id,
		conversationId,
		sender,
		kind,
		body: text(raw.body),
		mediaName: text(raw.media_name),
		createdAt
	};
}

/** Parse only currently-active own mute preferences from the inbox RPC. */
export function mutedConversationIdsFromInbox(value: unknown, now = Date.now()): Set<string> {
	const muted = new Set<string>();
	if (!Array.isArray(value)) return muted;
	for (const candidate of value) {
		if (!candidate || typeof candidate !== 'object') continue;
		const row = candidate as Record<string, unknown>;
		const conversationId = text(row.conversation_id);
		const until = text(row.muted_until);
		if (!conversationId || !until) continue;
		const timestamp = until.toLowerCase() === 'infinity' ? Number.POSITIVE_INFINITY : Date.parse(until);
		if (timestamp > now) muted.add(conversationId);
	}
	return muted;
}

export function shouldPresentForegroundMessage(
	row: ForegroundMessageRow,
	accountId: string,
	mutedConversations: ReadonlySet<string> | null
): boolean {
	return row.sender !== accountId && (mutedConversations === null || !mutedConversations.has(row.conversationId));
}

export function foregroundMessageHref(row: Pick<ForegroundMessageRow, 'id' | 'conversationId'>): string {
	return chatMessageHref(row.conversationId, row.id) ?? '/mensagens/';
}

function previewFor(row: ForegroundMessageRow): string {
	// Resolve at delivery time so changing language does not leave this global
	// listener frozen in the locale that was active when it subscribed.
	const translate = get(t);
	if (row.kind === 'image') {
		return translate('couple.moment.message.preview.image', {
			default: '📷 Enviou-te uma fotografia'
		});
	}
	if (row.kind === 'audio') {
		return translate('couple.moment.message.preview.audio', {
			default: '🎙️ Enviou-te uma mensagem de voz'
		});
	}
	if (row.kind === 'video') {
		return translate('couple.moment.message.preview.video', {
			default: '🎬 Enviou-te um vídeo'
		});
	}
	if (row.kind === 'file') {
		return row.mediaName
			? translate('couple.moment.message.preview.named_file', {
					values: { name: row.mediaName },
					default: `📎 Enviou-te ${row.mediaName}`
				})
			: translate('couple.moment.message.preview.file', {
					default: '📎 Enviou-te um ficheiro'
				});
	}
	return (
		row.body ??
		translate('couple.moment.message.preview.generic', {
			default: 'Enviou-te uma mensagem'
		})
	);
}

/**
 * Subscribe to every canonical message row visible through membership RLS.
 * Preferences come from the existing inbox RPC, which exposes only the current
 * member's mute/pin/archive fields. A short cache coalesces message bursts; an
 * RPC failure deliberately fails open so a transient preference read cannot
 * make a real message alert disappear.
 */
export function subscribeForegroundMessages(
	me: string,
	_getActiveCoupleId: () => string | null
): () => void {
	const accountId = me.trim();
	if (!accountId) return () => {};

	const client = getSupabaseClient();
	const senderLabels = new Map<string, Promise<string | undefined>>();
	const localMuteOverrides = new Map<string, { mutedUntil: number; expiresAt: number }>();
	let muteCache: { expiresAt: number; ids: Set<string> } | null = null;
	let muteRequest: Promise<Set<string> | null> | null = null;
	let muteGeneration = 0;
	let stopped = false;
	let channel: RealtimeChannel | null = null;
	let subscribed = false;
	let reconnectAttempts = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	function senderName(sender: string): Promise<string | undefined> {
		const cached = senderLabels.get(sender);
		if (cached) return cached;
		const pending = (async () => {
			try {
				const { data } = await client
					.from('accounts')
					.select('display_name,handle')
					.eq('id', sender)
					.maybeSingle();
				const row = data as { display_name?: unknown; handle?: unknown } | null;
				return text(row?.display_name) ?? (text(row?.handle) ? `@${text(row?.handle)}` : undefined);
			} catch {
				return undefined;
			}
		})();
		senderLabels.set(sender, pending);
		return pending;
	}

	function withLocalMuteOverrides(current: ReadonlySet<string> | null): Set<string> | null {
		const now = Date.now();
		let effective: Set<string> | null = current === null ? null : new Set(current);
		for (const [conversationId, override] of localMuteOverrides) {
			if (override.expiresAt <= now) {
				localMuteOverrides.delete(conversationId);
				continue;
			}
			effective = overrideMutedConversations(
				effective,
				{ conversationId, mutedUntil: override.mutedUntil },
				now
			);
		}
		return effective;
	}

	function mutedConversations(): Promise<Set<string> | null> {
		const now = Date.now();
		if (muteCache && muteCache.expiresAt > now) return Promise.resolve(withLocalMuteOverrides(muteCache.ids));
		if (muteRequest) return muteRequest;
		const generation = muteGeneration;
		muteRequest = (async () => {
			try {
				const { data, error } = await client.rpc('list_chat_inbox');
				if (error) return withLocalMuteOverrides(null);
				const ids = mutedConversationIdsFromInbox(data, Date.now());
				if (generation === muteGeneration) {
					muteCache = { ids, expiresAt: Date.now() + MUTE_CACHE_MS };
				}
				return withLocalMuteOverrides(ids);
			} catch {
				return withLocalMuteOverrides(null);
			} finally {
				muteRequest = null;
			}
		})();
		return muteRequest;
	}

	const onPreferencesChanged = (event: Event) => {
		const detail = parseChatPreferencesChangedDetail((event as CustomEvent<unknown>).detail);
		if (!detail) return;
		muteGeneration += 1;
		muteCache = null;
		localMuteOverrides.set(detail.conversationId, {
			mutedUntil: detail.mutedUntil,
			expiresAt: Date.now() + LOCAL_MUTE_OVERRIDE_MS
		});
	};

	function present(row: ForegroundMessageRow | null): void {
		if (stopped || !row || row.sender === accountId) return;
		// Hidden tabs intentionally leave background delivery to Web Push. Avoid a
		// preference/profile lookup that can finish after the tab becomes visible.
		if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
		void (async () => {
			const muted = await mutedConversations();
			if (
				stopped ||
				(typeof document !== 'undefined' && document.visibilityState !== 'visible') ||
				!shouldPresentForegroundMessage(row, accountId, muted)
			) return;
			const label = await senderName(row.sender);
			// Profile lookup can be slow. Re-read preferences afterwards so a mute
			// tapped during that await suppresses the still-pending foreground card.
			const latestMuted = await mutedConversations();
			if (
				stopped ||
				(typeof document !== 'undefined' && document.visibilityState !== 'visible') ||
				!shouldPresentForegroundMessage(row, accountId, latestMuted)
			) return;
			presentCoupleMoment({
				id: row.id,
				kind: 'message',
				senderId: row.sender,
				senderName: label,
				body: previewFor(row),
				href: foregroundMessageHref(row),
				createdAt: row.createdAt,
				source: 'postgres'
			});
		})();
	}

	function scheduleReconnect(): void {
		if (stopped || reconnectTimer) return;
		const delay = Math.min(15_000, 800 * 2 ** Math.min(reconnectAttempts, 5));
		reconnectAttempts += 1;
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			connect();
		}, delay);
	}

	function connect(): void {
		if (stopped) return;
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		const previous = channel;
		channel = null;
		subscribed = false;
		if (previous) void client.removeChannel(previous);

		const next = client
			.channel(`foreground_messages:${accountId}:${++channelSequence}`)
			.on(
				'postgres_changes',
				{ event: 'INSERT', schema: 'public', table: 'chat_messages' },
				(payload) => present(parseRichMessageRow(payload.new))
			);
		channel = next;
		next.subscribe((status) => {
			if (stopped || channel !== next) return;
			if (status === 'SUBSCRIBED') {
				subscribed = true;
				reconnectAttempts = 0;
			} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
				subscribed = false;
				scheduleReconnect();
			}
		});
	}

	const onOnline = () => {
		if (!subscribed) connect();
	};
	const onVisibility = () => {
		if (document.visibilityState === 'visible' && !subscribed) connect();
	};
	if (typeof window !== 'undefined') window.addEventListener('online', onOnline);
	if (typeof window !== 'undefined') window.addEventListener(CHAT_PREFERENCES_CHANGED_EVENT, onPreferencesChanged);
	if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
	connect();

	return () => {
		if (stopped) return;
		stopped = true;
		if (reconnectTimer) clearTimeout(reconnectTimer);
		reconnectTimer = null;
		if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
		if (typeof window !== 'undefined') window.removeEventListener(CHAT_PREFERENCES_CHANGED_EVENT, onPreferencesChanged);
		if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
		const current = channel;
		channel = null;
		if (current) void client.removeChannel(current);
	};
}
