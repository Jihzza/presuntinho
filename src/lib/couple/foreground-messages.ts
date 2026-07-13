/**
 * App-wide foreground delivery for Supabase-backed chat messages.
 *
 * RLS remains the authority for which rows reach the browser.  The checks in
 * this module are a second, local boundary: a stale channel must never surface
 * another account's message after logout/re-link, and only the currently
 * active couple space or a canonical DM containing this account is accepted.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { dmConversationId } from '$lib/chat/dm-id';
import { presentCoupleMoment } from '$lib/couple/couple-moments';
import { getSupabaseClient } from '$lib/multiplayer/client';

interface CoupleMessageRow {
	id: string;
	couple_id: string;
	conversation_id: string;
	sender: string;
	kind: 'text' | 'image' | 'audio';
	body: string | null;
	created_at: string;
}

let channelSequence = 0;

function text(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed || null;
}

function parseRow(value: unknown): CoupleMessageRow | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	const id = text(raw.id);
	const coupleId = text(raw.couple_id);
	const conversationId = text(raw.conversation_id);
	const sender = text(raw.sender);
	const createdAt = text(raw.created_at);
	const kind = raw.kind;
	if (
		!id ||
		!coupleId ||
		!conversationId ||
		!sender ||
		!createdAt ||
		(kind !== 'text' && kind !== 'image' && kind !== 'audio')
	) {
		return null;
	}
	return {
		id,
		couple_id: coupleId,
		conversation_id: conversationId,
		sender,
		kind,
		body: text(raw.body),
		created_at: createdAt
	};
}

/** A DM id is valid only when it is canonical and one participant is `me`. */
function isCanonicalDmFor(coupleId: string, me: string): boolean {
	const parts = coupleId.split(':');
	if (parts.length !== 3 || parts[0] !== 'dm') return false;
	const [, first, second] = parts;
	if (!first || !second || first === second || (first !== me && second !== me)) return false;
	return coupleId === dmConversationId(first, second);
}

function previewFor(row: CoupleMessageRow): string {
	if (row.kind === 'image') return '📷 Enviou-te uma fotografia';
	if (row.kind === 'audio') return '🎙️ Enviou-te uma mensagem de voz';
	return row.body ?? 'Enviou-te uma mensagem';
}

/**
 * Subscribe to every message row visible through RLS, then narrow it to the
 * current account at delivery time.  `getActiveCoupleId` is deliberately a
 * callback so re-linking a couple does not require reopening the channel.
 */
export function subscribeForegroundMessages(
	me: string,
	getActiveCoupleId: () => string | null
): () => void {
	const accountId = me.trim();
	if (!accountId) return () => {};

	const client = getSupabaseClient();
	let stopped = false;
	const channel: RealtimeChannel = client
		.channel(`foreground_messages:${accountId}:${++channelSequence}`)
		.on(
			'postgres_changes',
			{ event: 'INSERT', schema: 'public', table: 'couple_messages' },
			(payload) => {
				if (stopped) return;
				const row = parseRow(payload.new);
				if (!row || row.sender === accountId) return;

				const activeCoupleId = getActiveCoupleId();
				const isActiveCouple = !!activeCoupleId && row.couple_id === activeCoupleId;
				if (!isActiveCouple && !isCanonicalDmFor(row.couple_id, accountId)) return;

				presentCoupleMoment({
					id: row.id,
					kind: 'message',
					senderId: row.sender,
					body: previewFor(row),
					href: '/mensagens/',
					createdAt: row.created_at,
					source: 'postgres'
				});
			}
		)
		.subscribe();

	return () => {
		if (stopped) return;
		stopped = true;
		void client.removeChannel(channel);
	};
}
