// src/lib/chat/store.svelte.ts
//
// Rune-based chat store + poller for /mensagens.
//
// Polling contract:
//   - while the page is visible, poll every 4s;
//   - after 5 consecutive empty polls, back off to 15s;
//   - any send or received message resets the backoff;
//   - while hidden the loop idles (no network) and fires immediately when
//     the tab becomes visible again.
//
// Messages are merged + deduped by id. Optimistic local sends get a
// 'local-…' id and pending/queued/failed flags; on server ack the local
// bubble is swapped for the canonical server message.

import {
  ChatApiError,
  fetchMedia,
  fetchSince,
  flushOutbox,
  isNetworkError,
  markRead,
  mintLocalId,
  otherProfile,
  prepareMediaDataUrl,
  queueOutbox,
  readOutbox,
  sendMediaDataUrl,
  sendText,
  type ChatMessage,
  type ChatMeta,
  type ChatProfile
} from './client';

export interface LocalChatMessage extends ChatMessage {
  /** In-flight to the server right now. */
  pending?: boolean;
  /** Waiting in the offline outbox for connectivity. */
  queued?: boolean;
  /** Send failed and is NOT queued — needs a manual retry. */
  failed?: boolean;
  /** Local preview for optimistic media bubbles (before the server ack). */
  localDataUrl?: string;
}

const POLL_MS = 4000;
const POLL_SLOW_MS = 15000;
const EMPTY_POLLS_BEFORE_BACKOFF = 5;

export class ChatStore {
  readonly profile: ChatProfile;
  readonly other: ChatProfile;

  messages = $state<LocalChatMessage[]>([]);
  meta = $state<ChatMeta>({ latestTs: 0, lastRead: { fatma: 0, daniel: 0 } });
  /** First poll (or first failure) has completed — safe to render states. */
  ready = $state(false);
  offline = $state(false);
  /** Server said 401 — the stored token is wrong; re-ask for it. */
  authError = $state(false);
  /** id → dataURL cache for media bubbles. */
  mediaCache = $state<Record<string, string>>({});

  #since = 0;
  #emptyPolls = 0;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #running = false;
  #inFlight = false;
  #mediaLoading = new Set<string>();
  #onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.pokePoll();
    }
  };
  #onOnline = () => {
    this.offline = false;
    void this.#flushQueued();
    this.pokePoll();
  };

  constructor(profile: ChatProfile) {
    this.profile = profile;
    this.other = otherProfile(profile);
  }

  /** Unread messages FOR ME (badge): incoming ts beyond my own lastRead. */
  get unreadCount(): number {
    const mine = this.meta.lastRead[this.profile] || 0;
    return this.messages.filter((m) => m.from === this.other && m.ts > mine).length;
  }

  /** The other person's read cursor (drives the ✓✓ ticks on MY bubbles). */
  get otherLastRead(): number {
    return this.meta.lastRead[this.other] || 0;
  }

  get latestIncomingTs(): number {
    let latest = 0;
    for (const m of this.messages) {
      if (m.from === this.other && m.ts > latest) latest = m.ts;
    }
    return latest;
  }

  // ── lifecycle ──────────────────────────────────────────────────────────

  start(): void {
    if (this.#running || typeof window === 'undefined') return;
    this.#running = true;
    document.addEventListener('visibilitychange', this.#onVisibility);
    window.addEventListener('online', this.#onOnline);
    void this.#flushQueued();
    void this.#poll().finally(() => this.#schedule());
  }

  stop(): void {
    this.#running = false;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    if (typeof window === 'undefined') return;
    document.removeEventListener('visibilitychange', this.#onVisibility);
    window.removeEventListener('online', this.#onOnline);
  }

  /** Reset backoff and poll as soon as possible. */
  pokePoll(): void {
    if (!this.#running) return;
    this.#emptyPolls = 0;
    if (this.#timer) clearTimeout(this.#timer);
    void this.#poll().finally(() => this.#schedule());
  }

  #schedule(): void {
    if (!this.#running) return;
    if (this.#timer) clearTimeout(this.#timer);
    const delay = this.#emptyPolls >= EMPTY_POLLS_BEFORE_BACKOFF ? POLL_SLOW_MS : POLL_MS;
    this.#timer = setTimeout(() => {
      void this.#tick();
    }, delay);
  }

  async #tick(): Promise<void> {
    if (!this.#running) return;
    // Idle while hidden — the visibilitychange handler wakes us back up.
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      this.#schedule();
      return;
    }
    await this.#poll();
    this.#schedule();
  }

  async #poll(): Promise<void> {
    if (this.#inFlight) return;
    this.#inFlight = true;
    try {
      const { messages, meta } = await fetchSince(this.profile, this.#since);
      this.meta = meta;
      this.offline = false;
      this.authError = false;
      if (messages.length > 0) {
        this.#merge(messages);
        this.#emptyPolls = 0;
      } else {
        this.#emptyPolls += 1;
      }
      // Connectivity is proven — drain anything still parked in the outbox
      // (the 'online' event does not fire when the browser never noticed
      // the drop, e.g. a flaky proxy).
      if (readOutbox(this.profile).length > 0) void this.#flushQueued();
    } catch (e) {
      this.#emptyPolls += 1;
      if (e instanceof ChatApiError && e.status === 401) {
        this.authError = true;
      } else {
        this.offline = true;
      }
    } finally {
      this.#inFlight = false;
      this.ready = true;
    }
  }

  // ── merging ────────────────────────────────────────────────────────────

  #merge(incoming: ChatMessage[]): void {
    const byId = new Map<string, LocalChatMessage>();
    for (const m of this.messages) byId.set(m.id, m);
    for (const m of incoming) {
      if (!m || typeof m.id !== 'string' || typeof m.ts !== 'number') continue;
      const existing = byId.get(m.id);
      // Keep a locally cached preview if we already have one.
      byId.set(m.id, existing?.localDataUrl ? { ...m, localDataUrl: existing.localDataUrl } : m);
      if (m.ts > this.#since) this.#since = m.ts;
    }
    this.messages = [...byId.values()].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
  }

  #replaceLocal(localId: string, server: ChatMessage): void {
    const local = this.messages.find((m) => m.id === localId);
    this.messages = this.messages
      .filter((m) => m.id !== localId && m.id !== server.id)
      .concat([{ ...server, localDataUrl: local?.localDataUrl }])
      .sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
    if (server.ts > this.#since) this.#since = server.ts;
  }

  #patchLocal(localId: string, patch: Partial<LocalChatMessage>): void {
    this.messages = this.messages.map((m) => (m.id === localId ? { ...m, ...patch } : m));
  }

  // ── sending ────────────────────────────────────────────────────────────

  /** Returns 'sent' | 'queued' | 'failed'. Never throws. */
  async sendTextMessage(text: string): Promise<'sent' | 'queued' | 'failed'> {
    const trimmed = text.trim();
    if (!trimmed) return 'failed';
    const local: LocalChatMessage = {
      id: mintLocalId(this.profile),
      from: this.profile,
      text: trimmed,
      ts: Date.now(),
      pending: true
    };
    this.messages = [...this.messages, local];
    return this.#deliver(local, () => sendText(this.profile, trimmed), {
      localId: local.id,
      kind: 'text',
      text: trimmed,
      queuedAt: local.ts
    });
  }

  /**
   * Send an image/audio blob. Throws ChatApiError(413,'media_too_large') /
   * (400,'invalid_media') BEFORE creating a bubble; delivery failures after
   * that are reported via the returned status, like text.
   */
  async sendMediaMessage(
    file: File | Blob,
    name?: string
  ): Promise<'sent' | 'queued' | 'failed'> {
    const dataUrl = await prepareMediaDataUrl(file); // may throw — caller shows toast
    const mediaType = dataUrl.slice(5, dataUrl.indexOf(';'));
    const finalName = name ?? (file instanceof File ? file.name : undefined);
    const local: LocalChatMessage = {
      id: mintLocalId(this.profile),
      from: this.profile,
      mediaType,
      name: finalName,
      ts: Date.now(),
      pending: true,
      localDataUrl: dataUrl
    };
    this.messages = [...this.messages, local];
    return this.#deliver(local, () => sendMediaDataUrl(this.profile, dataUrl, finalName), {
      localId: local.id,
      kind: 'media',
      media: dataUrl,
      name: finalName,
      mediaType,
      queuedAt: local.ts
    });
  }

  async #deliver(
    local: LocalChatMessage,
    send: () => Promise<{ message: ChatMessage; meta: ChatMeta }>,
    outboxItem: Parameters<typeof queueOutbox>[1]
  ): Promise<'sent' | 'queued' | 'failed'> {
    try {
      const { message, meta } = await send();
      this.#replaceLocal(local.id, message);
      this.meta = meta;
      this.offline = false;
      this.pokePoll(); // send resets backoff
      return 'sent';
    } catch (e) {
      if (isNetworkError(e)) {
        this.offline = true;
        const queued = queueOutbox(this.profile, outboxItem);
        this.#patchLocal(local.id, { pending: false, queued, failed: !queued });
        return queued ? 'queued' : 'failed';
      }
      if (e instanceof ChatApiError && e.status === 401) {
        // Secure sync is not configured on this device yet. Keep the chat usable:
        // park the message in the local outbox and surface the connection state
        // in the UI instead of treating it as a wrong password.
        this.authError = true;
        const queued = queueOutbox(this.profile, outboxItem);
        this.#patchLocal(local.id, { pending: false, queued, failed: !queued });
        return queued ? 'queued' : 'failed';
      }
      this.#patchLocal(local.id, { pending: false, failed: true });
      return 'failed';
    }
  }

  /** Manual retry of a failed local bubble. */
  async retryMessage(localId: string): Promise<'sent' | 'queued' | 'failed'> {
    const msg = this.messages.find((m) => m.id === localId);
    if (!msg || (!msg.failed && !msg.queued)) return 'failed';
    this.#patchLocal(localId, { pending: true, failed: false, queued: false });
    const send = msg.localDataUrl
      ? () => sendMediaDataUrl(this.profile, msg.localDataUrl as string, msg.name)
      : () => sendText(this.profile, msg.text ?? '');
    const outboxItem = msg.localDataUrl
      ? {
          localId,
          kind: 'media' as const,
          media: msg.localDataUrl,
          name: msg.name,
          mediaType: msg.mediaType,
          queuedAt: Date.now()
        }
      : { localId, kind: 'text' as const, text: msg.text ?? '', queuedAt: Date.now() };
    return this.#deliver({ ...msg }, send, outboxItem);
  }

  /** Flush the offline outbox (connectivity regained / page opened). */
  async #flushQueued(): Promise<void> {
    if (readOutbox(this.profile).length === 0) return;
    try {
      const sent = await flushOutbox(this.profile);
      if (sent.length > 0) {
        this.#merge(sent);
        this.#emptyPolls = 0;
      }
      // Remove local 'queued' bubbles whose outbox entry is gone (delivered
      // or permanently rejected) — the server copies are merged above.
      const remaining = new Set(readOutbox(this.profile).map((i) => i.localId));
      this.messages = this.messages.filter((m) => !m.queued || remaining.has(m.id));
    } catch {
      /* still offline — keep the queue */
    }
  }

  // ── read receipts ──────────────────────────────────────────────────────

  /** Mark everything up to `ts` as read by ME (badge + their ticks). */
  async markReadUpTo(ts: number): Promise<void> {
    if (!ts || ts <= (this.meta.lastRead[this.profile] || 0)) return;
    // Optimistic — the badge clears immediately.
    this.meta = {
      ...this.meta,
      lastRead: { ...this.meta.lastRead, [this.profile]: ts }
    };
    try {
      const meta = await markRead(this.profile, ts);
      this.meta = meta;
    } catch {
      /* best-effort — the next poll or markRead will reconcile */
    }
  }

  // ── media ──────────────────────────────────────────────────────────────

  /** Lazily fetch a media dataURL into mediaCache (id-keyed, deduped). */
  loadMedia(id: string): void {
    if (this.mediaCache[id] || this.#mediaLoading.has(id)) return;
    this.#mediaLoading.add(id);
    void fetchMedia(this.profile, id)
      .then((dataUrl) => {
        this.mediaCache = { ...this.mediaCache, [id]: dataUrl };
      })
      .catch(() => {
        /* transient — a later bubble render retries */
      })
      .finally(() => {
        this.#mediaLoading.delete(id);
      });
  }

  /** Best display source for a media bubble: local preview, else cache. */
  mediaSrc(m: LocalChatMessage): string | null {
    if (m.localDataUrl) return m.localDataUrl;
    const cached = this.mediaCache[m.id];
    if (cached) return cached;
    if (m.mediaKey) this.loadMedia(m.id);
    return null;
  }
}
