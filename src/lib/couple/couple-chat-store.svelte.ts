// Couple chat over Supabase — durable messages in `couple_messages` + live
// delivery via postgres_changes, with media uploaded to the `couple-media`
// Storage bucket (public URL stored on the row, so the realtime payload stays
// tiny). Drop-in for ChatStore: the mensagens page treats them structurally the
// same and picks this one only when Supabase is configured.

import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '$lib/multiplayer/config';
import { COUPLE_ID } from '$lib/couple/couple-supabase';
import type { ChatProfile } from '$lib/chat/client';
import type { LocalChatMessage } from '$lib/chat/store.svelte';

const BUCKET = 'couple-media';
const READ_KEY_PREFIX = 'presuntinho-couple-chat-read';

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

/** Downscale an image blob to <=1280px so uploads (and previews) stay small. */
async function shrinkImage(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('decode'));
      i.src = url;
    });
    const max = 1280;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    URL.revokeObjectURL(url);
    if (scale >= 1) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export class CoupleChatStore {
  readonly profile: ChatProfile;
  readonly other: ChatProfile;
  readonly conversationId: string;

  messages = $state<LocalChatMessage[]>([]);
  ready = $state(false);
  offline = $state(false);
  authError = $state(false); // never for Supabase — kept for interface parity

  #sb: SupabaseClient;
  #channel: RealtimeChannel | null = null;
  #readKey: string;
  #onVis: (() => void) | null = null;

  constructor(profile: ChatProfile, conversationId = 'main') {
    this.profile = profile;
    this.other = profile === 'fatma' ? 'daniel' : 'fatma';
    this.conversationId = conversationId;
    this.#readKey = `${READ_KEY_PREFIX}-${conversationId}`;
    this.#sb = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } }
    });
  }

  #rowToMsg(row: Row): LocalChatMessage {
    return {
      id: row.id,
      from: row.sender as ChatProfile,
      text: row.body ?? undefined,
      mediaType: row.kind === 'image' ? 'image/*' : row.kind === 'audio' ? 'audio/*' : undefined,
      mediaKey: row.media_url ?? undefined, // holds the public URL; mediaSrc returns it
      conversationId: row.conversation_id,
      ts: new Date(row.created_at).getTime()
    };
  }

  #sortMerge(list: LocalChatMessage[]): void {
    const byId = new Map<string, LocalChatMessage>();
    for (const m of list) byId.set(m.id, m);
    this.messages = [...byId.values()].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
  }

  #ingest(row: Row): void {
    if (row.conversation_id !== this.conversationId) return;
    const msg = this.#rowToMsg(row);
    if (this.messages.some((m) => m.id === msg.id)) return;
    // Drop a matching optimistic bubble from this sender (same text or a media send).
    const withoutOptimistic = this.messages.filter(
      (m) => !(m.pending && m.from === msg.from && (m.text ?? '') === (msg.text ?? '') && Boolean(m.mediaType) === Boolean(msg.mediaType))
    );
    this.#sortMerge([...withoutOptimistic, msg]);
  }

  start(): void {
    void this.#load();
    this.#channel = this.#sb
      .channel(`couple_msg:${COUPLE_ID}:${this.conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'couple_messages', filter: `couple_id=eq.${COUPLE_ID}` },
        (payload) => this.#ingest(payload.new as Row)
      )
      .subscribe((status) => {
        // A dropped/rejoined socket can miss inserts — re-load on (re)subscribe
        // and on any terminal status so no message is permanently lost.
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          void this.#load();
        }
      });
    if (typeof document !== 'undefined') {
      this.#onVis = () => {
        if (document.visibilityState === 'visible') void this.#load();
      };
      document.addEventListener('visibilitychange', this.#onVis);
    }
  }

  stop(): void {
    if (this.#channel) void this.#sb.removeChannel(this.#channel);
    this.#channel = null;
    if (this.#onVis && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.#onVis);
      this.#onVis = null;
    }
  }

  async #load(): Promise<void> {
    try {
      // Newest 500 (a busy thread's oldest history would otherwise be fetched
      // and the recent messages dropped by the limit). #sortMerge re-orders
      // ascending and MERGES with what we already have, so optimistic bubbles
      // and already-loaded rows are preserved, not replaced.
      const { data, error } = await this.#sb
        .from('couple_messages')
        .select('*')
        .eq('couple_id', COUPLE_ID)
        .eq('conversation_id', this.conversationId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      this.#sortMerge([...this.messages, ...(data ?? []).map((r) => this.#rowToMsg(r as Row))]);
      this.offline = false;
    } catch (e) {
      console.warn('[couple-chat] load failed', e);
      this.offline = true;
    }
    this.ready = true;
  }

  // ── sending ────────────────────────────────────────────────────────────
  async sendTextMessage(text: string): Promise<'sent' | 'queued' | 'failed'> {
    const localId = `local-${crypto.randomUUID()}`;
    const optimistic: LocalChatMessage = {
      id: localId, from: this.profile, text, conversationId: this.conversationId, ts: Date.now(), pending: true
    };
    this.#sortMerge([...this.messages, optimistic]);
    try {
      const { data, error } = await this.#sb
        .from('couple_messages')
        .insert({ couple_id: COUPLE_ID, conversation_id: this.conversationId, sender: this.profile, kind: 'text', body: text })
        .select()
        .single();
      if (error) throw error;
      this.messages = this.messages.map((m) => (m.id === localId ? this.#rowToMsg(data as Row) : m));
      return 'sent';
    } catch (e) {
      this.messages = this.messages.map((m) => (m.id === localId ? { ...m, pending: false, failed: true } : m));
      return 'failed';
    }
  }

  async sendMediaMessage(file: Blob, name: string): Promise<'sent' | 'queued' | 'failed'> {
    const isAudio = file.type.startsWith('audio/');
    const kind: 'image' | 'audio' = isAudio ? 'audio' : 'image';
    const localId = `local-${crypto.randomUUID()}`;
    const previewUrl = await blobToDataUrl(file).catch(() => undefined);
    const optimistic: LocalChatMessage = {
      id: localId, from: this.profile, mediaType: file.type || `${kind}/*`, localDataUrl: previewUrl,
      name, conversationId: this.conversationId, ts: Date.now(), pending: true
    };
    this.#sortMerge([...this.messages, optimistic]);
    try {
      const upload = isAudio ? file : await shrinkImage(file);
      const ext = isAudio ? (name.split('.').pop() || 'webm') : 'webp';
      const path = `${COUPLE_ID}/${this.conversationId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await this.#sb.storage.from(BUCKET).upload(path, upload, {
        contentType: isAudio ? file.type || 'audio/webm' : 'image/webp',
        upsert: false
      });
      if (upErr) throw upErr;
      const publicUrl = this.#sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const { data, error } = await this.#sb
        .from('couple_messages')
        .insert({ couple_id: COUPLE_ID, conversation_id: this.conversationId, sender: this.profile, kind, media_url: publicUrl })
        .select()
        .single();
      if (error) throw error;
      this.messages = this.messages.map((m) => (m.id === localId ? this.#rowToMsg(data as Row) : m));
      return 'sent';
    } catch (e) {
      console.warn('[couple-chat] media send failed', e);
      this.messages = this.messages.map((m) => (m.id === localId ? { ...m, pending: false, failed: true } : m));
      return 'failed';
    }
  }

  async retryMessage(localId: string): Promise<'sent' | 'queued' | 'failed'> {
    const msg = this.messages.find((m) => m.id === localId);
    if (!msg) return 'failed';
    if (msg.text) {
      this.messages = this.messages.filter((m) => m.id !== localId);
      return this.sendTextMessage(msg.text);
    }
    // Media retry: we still hold the preview data-URI — rebuild a Blob from it.
    if (msg.localDataUrl) {
      try {
        const blob = await (await fetch(msg.localDataUrl)).blob();
        this.messages = this.messages.filter((m) => m.id !== localId);
        return this.sendMediaMessage(blob, msg.name || 'ficheiro');
      } catch {
        return 'failed';
      }
    }
    return 'failed';
  }

  mediaSrc(m: LocalChatMessage): string | null {
    return m.localDataUrl ?? m.mediaKey ?? null;
  }

  // ── read state (local only in v1 — no cross-device "seen" ticks yet) ─────
  get otherLastRead(): number {
    return 0;
  }
  get latestIncomingTs(): number {
    let t = 0;
    for (const m of this.messages) if (m.from === this.other) t = Math.max(t, m.ts);
    return t;
  }
  get unreadCount(): number {
    const r = this.#readLocal();
    return this.messages.filter((m) => m.from === this.other && m.ts > r).length;
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
