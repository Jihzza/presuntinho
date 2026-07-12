// Friend DMs over Supabase — same `couple_messages` table, keyed by the
// canonical conversation id `dm:<uuidA>:<uuidB>` (uuids sorted ascending).
// RLS (0013_social_v2) grants the two ACCEPTED contacts and forces
// sender = auth.uid(), so neither side can forge the other's bubbles.
// Text-only in v1 — the mensagens page hides the media controls for DMs.
//
// Structurally a drop-in for ChatStore/CoupleChatStore: the mensagens page
// only touches the shared surface (messages/ready/offline/send/retry/…).

import { type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '$lib/multiplayer/client';
import type { ChatProfile } from '$lib/chat/client';
import type { LocalChatMessage } from '$lib/chat/store.svelte';

import { dmConversationId } from '$lib/chat/dm-id';

const READ_KEY_PREFIX = 'presuntinho-dm-read';

export { dmConversationId };

interface Row {
  id: string;
  couple_id: string;
  conversation_id: string;
  sender: string;
  kind: 'text' | 'image' | 'audio';
  body: string | null;
  media_url: string | null;
  created_at: string;
}

export class DmChatStore {
  /** My account uuid — the page compares m.from against this. */
  readonly profile: string;
  readonly otherId: string;
  readonly dmId: string;

  messages = $state<LocalChatMessage[]>([]);
  ready = $state(false);
  offline = $state(false);
  authError = $state(false); // interface parity with ChatStore

  #sb: SupabaseClient;
  #channel: RealtimeChannel | null = null;
  #readKey: string;
  #onVis: (() => void) | null = null;
  #stopped = false;
  #pollTimer: ReturnType<typeof setInterval> | null = null;
  static #chanSeq = 0; // nome de canal único por (re)subscrição

  constructor(meId: string, otherId: string) {
    this.profile = meId;
    this.otherId = otherId;
    this.dmId = dmConversationId(meId, otherId);
    this.#readKey = `${READ_KEY_PREFIX}-${this.dmId}`;
    this.#sb = getSupabaseClient();
  }

  #rowToMsg(row: Row): LocalChatMessage {
    return {
      id: row.id,
      // ChatMessage.from is typed on the legacy pair; DM senders are account
      // uuids at runtime (same pragmatic widening CoupleChatStore uses).
      from: row.sender as ChatProfile,
      text: row.body ?? undefined,
      conversationId: 'main',
      ts: new Date(row.created_at).getTime()
    };
  }

  #sortMerge(list: LocalChatMessage[]): void {
    const byId = new Map<string, LocalChatMessage>();
    for (const m of list) byId.set(m.id, m);
    this.messages = [...byId.values()].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
  }

  #ingest(row: Row): void {
    const msg = this.#rowToMsg(row);
    if (this.messages.some((m) => m.id === msg.id)) return;
    const withoutOptimistic = this.messages.filter(
      (m) => !(m.pending && m.from === msg.from && (m.text ?? '') === (msg.text ?? ''))
    );
    this.#sortMerge([...withoutOptimistic, msg]);
  }

  start(): void {
    this.#stopped = false;
    void (async () => {
      await this.#load();
      if (this.#stopped) return;
      this.#openChannel();
      // Rede de segurança contra sockets mortos em background (ver
      // couple-chat-store): poll suave com a página visível + revive do canal.
      this.#pollTimer = setInterval(() => {
        if (this.#stopped || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
        const st = String(this.#channel?.state ?? '');
        if (st === 'closed' || st === 'errored') this.#openChannel();
        void this.#load();
      }, 10_000);
    })();
    if (typeof document !== 'undefined') {
      this.#onVis = () => {
        if (document.visibilityState !== 'visible') return;
        const st = String(this.#channel?.state ?? '');
        if (st === 'closed' || st === 'errored') this.#openChannel();
        void this.#load();
      };
      document.addEventListener('visibilitychange', this.#onVis);
      window.addEventListener('focus', this.#onVis);
    }
  }

  #openChannel(): void {
    if (this.#channel) void this.#sb.removeChannel(this.#channel);
    this.#channel = this.#sb
      .channel(`dm:${this.dmId}:${++DmChatStore.#chanSeq}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'couple_messages', filter: `couple_id=eq.${this.dmId}` },
        (payload) => this.#ingest(payload.new as Row)
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          void this.#load();
        }
      });
  }

  stop(): void {
    this.#stopped = true;
    if (this.#channel) void this.#sb.removeChannel(this.#channel);
    this.#channel = null;
    if (this.#pollTimer) clearInterval(this.#pollTimer);
    this.#pollTimer = null;
    if (this.#onVis && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.#onVis);
      window.removeEventListener('focus', this.#onVis);
      this.#onVis = null;
    }
  }

  async #load(): Promise<void> {
    try {
      const { data, error } = await this.#sb
        .from('couple_messages')
        .select('*')
        .eq('couple_id', this.dmId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const loaded = (data ?? []).map((r) => this.#rowToMsg(r as Row));
      this.#sortMerge([...this.messages, ...loaded]);
      this.offline = false;
    } catch (e) {
      console.warn('[dm-chat] load failed', e);
      this.offline = true;
    }
    this.ready = true;
  }

  async sendTextMessage(text: string): Promise<'sent' | 'queued' | 'failed'> {
    const localId = `local-${crypto.randomUUID()}`;
    const optimistic: LocalChatMessage = {
      id: localId,
      from: this.profile as ChatProfile,
      text,
      conversationId: 'main',
      ts: Date.now(),
      pending: true
    };
    this.#sortMerge([...this.messages, optimistic]);
    try {
      const { data, error } = await this.#sb
        .from('couple_messages')
        .insert({ couple_id: this.dmId, conversation_id: 'main', sender: this.profile, kind: 'text', body: text })
        .select()
        .single();
      if (error) throw error;
      this.messages = this.messages.map((m) => (m.id === localId ? this.#rowToMsg(data as Row) : m));
      this.#pushAfterSend(text);
      return 'sent';
    } catch {
      this.messages = this.messages.map((m) => (m.id === localId ? { ...m, pending: false, failed: true } : m));
      return 'failed';
    }
  }

  /** Push no telemóvel do amigo (fire-and-forget, com throttle por thread). */
  #pushAfterSend(preview: string): void {
    void (async () => {
      try {
        const [{ sendPushNotify, shouldPushMessage }, { accountState }] = await Promise.all([
          import('$lib/push'),
          import('$lib/account/account-store.svelte')
        ]);
        if (!shouldPushMessage(this.dmId)) return;
        const me = accountState.account;
        if (!me) return;
        await sendPushNotify('message', {
          to: this.otherId,
          title: `💬 ${me.display_name || `@${me.handle}`}`,
          body: preview.slice(0, 120),
          url: `/mensagens/?dm=${me.handle}`
        });
      } catch {
        /* best-effort */
      }
    })();
  }

  // DMs are text-only in v1 (the composer hides media controls).
  async sendMediaMessage(_file: Blob, _name: string): Promise<'sent' | 'queued' | 'failed'> {
    return 'failed';
  }

  async retryMessage(localId: string): Promise<'sent' | 'queued' | 'failed'> {
    const msg = this.messages.find((m) => m.id === localId);
    if (!msg?.text) return 'failed';
    this.messages = this.messages.filter((m) => m.id !== localId);
    return this.sendTextMessage(msg.text);
  }

  mediaSrc(_m: LocalChatMessage): string | null {
    return null;
  }

  get otherLastRead(): number {
    return 0; // no cross-device "seen" ticks in v1
  }
  get latestIncomingTs(): number {
    let t = 0;
    for (const m of this.messages) if (m.from === this.otherId) t = Math.max(t, m.ts);
    return t;
  }
  get unreadCount(): number {
    const r = this.#readLocal();
    return this.messages.filter((m) => m.from === this.otherId && m.ts > r).length;
  }
  async markReadUpTo(ts: number): Promise<void> {
    try {
      localStorage.setItem(this.#readKey, String(ts));
    } catch {
      /* storage unavailable */
    }
  }
  #readLocal(): number {
    try {
      return Number(localStorage.getItem(this.#readKey)) || 0;
    } catch {
      return 0;
    }
  }
}
