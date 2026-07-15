/**
 * Unified authenticated chat for account couples and direct friends.
 *
 * The database owns membership, sender identity and mutations through RLS/RPC.
 * This store owns optimistic UI, pagination, signed media URLs, Realtime recovery,
 * read cursors and ephemeral typing/presence. Legacy Fatma/Daniel sessions never
 * instantiate it; they keep using ChatStore + the private Netlify endpoint.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '$lib/multiplayer/client';
import type { LocalChatMessage } from './store.svelte';
import {
  mediaExtension,
  mediaKind,
  mergeChatMessages,
  parseCallBody,
  summarizeReactions,
  type AccountConversationKind,
  type ChatCallMeta,
  type ChatReplyPreview,
  type RichMessageKind
} from './account-chat-model';

const PAGE_SIZE = 45;
const SIGN_TTL_SECONDS = 60 * 60 * 8;
const POLL_MS = 8_000;
const TYPING_TTL_MS = 5_000;
const TYPING_IDLE_MS = 2_800;
// Keep the client gate identical to the private Storage buckets and the
// chat_messages integrity constraint in the rich-chat migration.
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_LENGTH = 4_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SendResult = 'sent' | 'queued' | 'failed';

export interface AccountChatOptions {
  meId: string;
  peerId: string;
  kind: AccountConversationKind;
  spaceId?: string | null;
  topic?: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_id: string | null;
  kind: string;
  body: string | null;
  reply_to_id: string | null;
  media_bucket: string | null;
  media_path: string | null;
  media_mime: string | null;
  media_name: string | null;
  media_size: number | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

interface ReactionRow {
  message_id: string;
  account_id: string;
  emoji: string;
}

interface MemberRow {
  conversation_id: string;
  account: string;
  last_read_at: string | null;
  last_delivered_at: string | null;
  last_seen_at: string | null;
  typing_until: string | null;
}

interface InboxRow {
  conversation_id: string;
  kind: string;
  topic: string;
  space_id: string | null;
  direct_key: string | null;
  other_account: string | null;
  other_handle: string | null;
  other_display_name: string | null;
  other_emoji: string | null;
  other_avatar_url: string | null;
  last_message_id: string | null;
  last_message_kind: string | null;
  last_message_body: string | null;
  last_message_at: string | null;
  unread_count: number | string | null;
  pinned_at: string | null;
  muted_until: string | null;
  archived_at: string | null;
}

export interface AccountChatInboxItem {
  conversationId: string;
  kind: AccountConversationKind;
  topic: string;
  spaceId: string | null;
  directKey: string | null;
  otherAccount: string | null;
  otherHandle: string | null;
  otherDisplayName: string | null;
  otherEmoji: string | null;
  otherAvatarUrl: string | null;
  lastMessageId: string | null;
  lastMessageKind: RichMessageKind | null;
  lastMessageBody: string | null;
  lastMessageAt: number;
  lastCall: ChatCallMeta | null;
  unreadCount: number;
  pinnedAt: number;
  mutedUntil: number;
  archivedAt: number;
}

type PresencePayload = { userId?: string; typing?: boolean; onlineAt?: string };

function richKind(value: string): RichMessageKind {
  return value === 'image' || value === 'audio' || value === 'video' || value === 'file' || value === 'call' || value === 'system'
    ? value
    : 'text';
}

function asTime(value: string | null | undefined): number {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** RPCs can be returned by PostgREST as a scalar, a row, or a one-row array. */
export function rpcUuid(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate === 'string') return UUID_RE.test(candidate) ? candidate : null;
  if (!candidate || typeof candidate !== 'object') return null;
  const row = candidate as Record<string, unknown>;
  for (const key of ['id', 'conversation_id', 'ensure_chat_conversation']) {
    if (typeof row[key] === 'string' && UUID_RE.test(row[key] as string)) return row[key] as string;
  }
  return null;
}

/** RLS-filtered, compact inbox used by the WhatsApp-style list view. */
export async function listAccountChatInbox(): Promise<AccountChatInboxItem[]> {
  const { data, error } = await getSupabaseClient().rpc('list_chat_inbox');
  if (error) throw error;
  return ((data ?? []) as InboxRow[]).map((row) => {
    const lastMessageKind = row.last_message_kind ? richKind(row.last_message_kind) : null;
    return {
      conversationId: row.conversation_id,
      kind: row.kind === 'couple' ? 'couple' : 'direct',
      topic: row.topic,
      spaceId: row.space_id,
      directKey: row.direct_key,
      otherAccount: row.other_account,
      otherHandle: row.other_handle,
      otherDisplayName: row.other_display_name,
      otherEmoji: row.other_emoji,
      otherAvatarUrl: row.other_avatar_url,
      lastMessageId: row.last_message_id,
      lastMessageKind,
      lastMessageBody: lastMessageKind === 'call' ? null : row.last_message_body,
      lastMessageAt: asTime(row.last_message_at),
      lastCall: lastMessageKind === 'call' ? parseCallBody(row.last_message_body) : null,
      unreadCount: Math.max(0, Number(row.unread_count) || 0),
      pinnedAt: asTime(row.pinned_at),
      mutedUntil: asTime(row.muted_until),
      archivedAt: asTime(row.archived_at)
    };
  });
}

async function shrinkImage(file: Blob): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file;
  let url: string | null = null;
  try {
    const objectUrl = URL.createObjectURL(file);
    url = objectUrl;
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('image_decode_failed'));
      element.src = objectUrl;
    });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    if (scale >= 1 && file.type === 'image/webp') return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return (
      (await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86))) ?? file
    );
  } catch {
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

export class AccountChatError extends Error {
  constructor(
    readonly code: 'too_large' | 'invalid_conversation' | 'upload_failed' | 'send_failed',
    message: string = code
  ) {
    super(message);
    this.name = 'AccountChatError';
  }
}

export class AccountChatStore {
  readonly profile: string;
  readonly other: string;
  readonly kind: AccountConversationKind;
  readonly spaceId: string | null;
  readonly topic: string;

  conversationId = $state<string | null>(null);
  messages = $state<LocalChatMessage[]>([]);
  ready = $state(false);
  offline = $state(false);
  authError = $state(false);
  loadingOlder = $state(false);
  hasOlder = $state(true);
  otherTyping = $state(false);
  otherOnline = $state(false);
  otherLastSeen = $state(0);
  ownLastRead = $state(0);
  peerLastRead = $state(0);

  #sb: SupabaseClient;
  #channel: RealtimeChannel | null = null;
  #stopped = true;
  #sequence = 0;
  #pollTimer: ReturnType<typeof setInterval> | null = null;
  #typingIdleTimer: ReturnType<typeof setTimeout> | null = null;
  #peerTypingTimer: ReturnType<typeof setTimeout> | null = null;
  #lastTypingWrite = 0;
  #objectUrls = new Set<string>();
  #onVisible: (() => void) | null = null;

  constructor(options: AccountChatOptions) {
    this.profile = options.meId;
    this.other = options.peerId;
    this.kind = options.kind;
    this.spaceId = options.spaceId ?? null;
    this.topic = options.topic?.trim() || 'main';
    this.#sb = getSupabaseClient();
  }

  get otherLastRead(): number {
    return this.peerLastRead;
  }

  get latestIncomingTs(): number {
    let latest = 0;
    for (const message of this.messages) {
      if (message.from === this.other && message.ts > latest) latest = message.ts;
    }
    return latest;
  }

  get unreadCount(): number {
    return this.messages.filter(
      (message) => !message.deleted && message.from === this.other && message.ts > this.ownLastRead
    ).length;
  }

  start(): void {
    this.stop();
    this.#stopped = false;
    const generation = ++this.#sequence;
    void this.#bootstrap(generation);
    if (typeof document !== 'undefined') {
      this.#onVisible = () => {
        if (this.#stopped || document.visibilityState !== 'visible') return;
        void this.#recover();
      };
      document.addEventListener('visibilitychange', this.#onVisible);
      window.addEventListener('focus', this.#onVisible);
    }
  }

  stop(): void {
    this.#stopped = true;
    if (this.#typingIdleTimer) clearTimeout(this.#typingIdleTimer);
    if (this.#peerTypingTimer) clearTimeout(this.#peerTypingTimer);
    if (this.#pollTimer) clearInterval(this.#pollTimer);
    this.#typingIdleTimer = null;
    this.#peerTypingTimer = null;
    this.#pollTimer = null;
    if (this.#channel) {
      void this.#channel.untrack().catch(() => undefined);
      void this.#sb.removeChannel(this.#channel);
      this.#channel = null;
    }
    if (this.#onVisible && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.#onVisible);
      window.removeEventListener('focus', this.#onVisible);
      this.#onVisible = null;
    }
    for (const url of this.#objectUrls) URL.revokeObjectURL(url);
    this.#objectUrls.clear();
  }

  async #bootstrap(generation: number): Promise<void> {
    try {
      const { data, error } = await this.#sb.rpc('ensure_chat_conversation', {
        p_kind: this.kind,
        p_peer: this.other,
        p_space: this.spaceId,
        p_topic: this.topic
      });
      if (error) throw error;
      const id = rpcUuid(data);
      if (!id) throw new AccountChatError('invalid_conversation');
      if (this.#stopped || generation !== this.#sequence) return;
      this.conversationId = id;
      await Promise.all([this.#loadPage(), this.#loadMembers()]);
      if (this.#stopped || generation !== this.#sequence) return;
      this.#openChannel();
      this.#pollTimer = setInterval(() => {
        if (this.#stopped || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return;
        void this.#recover();
      }, POLL_MS);
      this.offline = false;
    } catch (error) {
      console.warn('[account-chat] start failed', error);
      this.offline = true;
      this.authError = true;
    } finally {
      if (generation === this.#sequence) this.ready = true;
    }
  }

  async #recover(): Promise<void> {
    if (!this.conversationId) return;
    const state = String(this.#channel?.state ?? '');
    if (state === 'closed' || state === 'errored') this.#openChannel();
    await Promise.all([this.#loadPage(), this.#loadMembers()]);
    await this.#refreshDecorations();
  }

  #openChannel(): void {
    const conversationId = this.conversationId;
    if (!conversationId || this.#stopped) return;
    if (this.#channel) void this.#sb.removeChannel(this.#channel);
    const channel = this.#sb.channel(`chat:${conversationId}`, {
      config: { private: true, presence: { key: this.profile }, broadcast: { ack: true } }
    });
    this.#channel = channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = String((payload.old as Record<string, unknown>)?.id ?? '');
            if (id) this.messages = this.messages.filter((message) => message.id !== id);
            return;
          }
          void this.#ingest(payload.new as unknown as MessageRow);
        }
      )
      .on('broadcast', { event: 'decorations' }, ({ payload }) => {
        const messageId = String((payload as { messageId?: unknown })?.messageId ?? '');
        if (this.messages.some((message) => message.id === messageId)) void this.#refreshDecorations();
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_members', filter: `conversation_id=eq.${conversationId}` },
        () => void this.#loadMembers()
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => this.#receiveTyping(payload as PresencePayload))
      .on('presence', { event: 'sync' }, () => this.#syncPresence())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.offline = false;
          void channel.track({ userId: this.profile, typing: false, onlineAt: new Date().toISOString() });
          void this.#touchMember(false);
          void this.#loadPage();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.offline = true;
        }
      });
  }

  #syncPresence(): void {
    if (!this.#channel) return;
    const state = this.#channel.presenceState() as Record<string, PresencePayload[]>;
    this.otherOnline = Object.values(state).some((entries) =>
      entries.some((entry) => entry.userId === this.other)
    );
  }

  #receiveTyping(payload: PresencePayload): void {
    if (payload.userId !== this.other) return;
    if (this.#peerTypingTimer) clearTimeout(this.#peerTypingTimer);
    this.otherTyping = payload.typing === true;
    if (this.otherTyping) {
      this.#peerTypingTimer = setTimeout(() => {
        this.otherTyping = false;
      }, TYPING_TTL_MS + 500);
    }
  }

  setTyping(active: boolean): void {
    if (!this.conversationId || this.#stopped) return;
    if (this.#typingIdleTimer) clearTimeout(this.#typingIdleTimer);
    void this.#channel?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: this.profile, typing: active }
    });
    const now = Date.now();
    if (!active || now - this.#lastTypingWrite > 2_000) {
      this.#lastTypingWrite = now;
      void this.#touchMember(active);
    }
    if (active) {
      this.#typingIdleTimer = setTimeout(() => this.setTyping(false), TYPING_IDLE_MS);
    }
  }

  async #touchMember(typing: boolean): Promise<void> {
    const conversationId = this.conversationId;
    if (!conversationId) return;
    const now = new Date();
    await this.#sb
      .from('chat_members')
      .update({
        last_seen_at: now.toISOString(),
        typing_until: typing ? new Date(now.getTime() + TYPING_TTL_MS).toISOString() : null
      })
      .eq('conversation_id', conversationId)
      .eq('account', this.profile);
  }

  async #loadMembers(): Promise<void> {
    const conversationId = this.conversationId;
    if (!conversationId) return;
    const { data, error } = await this.#sb
      .from('chat_members')
      .select('conversation_id,account,last_read_at,last_delivered_at,last_seen_at,typing_until')
      .eq('conversation_id', conversationId);
    if (error) return;
    for (const raw of data ?? []) {
      const row = raw as MemberRow;
      if (row.account === this.profile) this.ownLastRead = asTime(row.last_read_at);
      if (row.account === this.other) {
        this.peerLastRead = asTime(row.last_read_at);
        this.otherLastSeen = asTime(row.last_seen_at);
        this.otherTyping = asTime(row.typing_until) > Date.now();
      }
    }
  }

  async #loadPage(before?: string): Promise<void> {
    const conversationId = this.conversationId;
    if (!conversationId) return;
    const hadServerMessages = this.messages.some((message) => UUID_RE.test(message.id));
    let query = this.#sb
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (before) query = query.lt('created_at', before);
    const { data, error } = await query;
    if (error) {
      this.offline = true;
      return;
    }
    const rows = (data ?? []) as MessageRow[];
    const replies = await this.#loadReplyRows(rows);
    let loaded = rows.map((row) => this.#rowToMessage(row, replies));
    await this.#signMedia(loaded);
    loaded = await this.#decorate(loaded);
    this.messages = mergeChatMessages(this.messages, loaded);
    // Background refreshes only fetch the newest page. They must not undo an
    // earlier "end of history" result after the user has paged backwards.
    if (before || !hadServerMessages) {
      this.hasOlder = rows.length === PAGE_SIZE;
    }
    this.offline = false;
  }

  async loadOlder(): Promise<void> {
    if (this.loadingOlder || !this.hasOlder || !this.conversationId) return;
    const oldest = this.messages.find((message) => !message.id.startsWith('local-'));
    if (!oldest) return;
    this.loadingOlder = true;
    try {
      await this.#loadPage(new Date(oldest.ts).toISOString());
    } finally {
      this.loadingOlder = false;
    }
  }

  async #loadReplyRows(rows: MessageRow[]): Promise<Map<string, MessageRow>> {
    const ids = [...new Set(rows.map((row) => row.reply_to_id).filter((id): id is string => Boolean(id)))];
    const out = new Map<string, MessageRow>();
    for (const message of this.messages) {
      if (!ids.includes(message.id)) continue;
      out.set(message.id, {
        id: message.id,
        conversation_id: this.conversationId ?? '',
        sender_id: String(message.from),
        client_id: message.clientId ?? null,
        kind: message.kind ?? 'text',
        body: message.text ?? null,
        reply_to_id: null,
        media_bucket: message.mediaBucket ?? null,
        media_path: message.mediaKey ?? null,
        media_mime: message.mediaType ?? null,
        media_name: message.name ?? null,
        media_size: message.mediaSize ?? null,
        edited_at: message.editedAt ? new Date(message.editedAt).toISOString() : null,
        deleted_at: message.deleted ? new Date(message.ts).toISOString() : null,
        created_at: new Date(message.ts).toISOString()
      });
    }
    const missing = ids.filter((id) => !out.has(id));
    if (!missing.length) return out;
    const { data } = await this.#sb.from('chat_messages').select('*').in('id', missing);
    for (const row of (data ?? []) as MessageRow[]) out.set(row.id, row);
    return out;
  }

  #rowToMessage(row: MessageRow, replyRows = new Map<string, MessageRow>()): LocalChatMessage {
    const kind = richKind(row.kind);
    const call = kind === 'call' ? parseCallBody(row.body) : null;
    const replyRow = row.reply_to_id ? replyRows.get(row.reply_to_id) : null;
    const reply: ChatReplyPreview | undefined = replyRow
      ? {
          id: replyRow.id,
          from: replyRow.sender_id,
          text: replyRow.deleted_at ? undefined : replyRow.body ?? undefined,
          kind: richKind(replyRow.kind),
          deleted: Boolean(replyRow.deleted_at)
        }
      : undefined;
    return {
      id: row.id,
      clientId: row.client_id ?? undefined,
      from: row.sender_id as LocalChatMessage['from'],
      // `call` bodies are trigger-owned JSON. Never expose them as message
      // copy; the page renders the validated metadata below as a call card.
      text: row.deleted_at || kind === 'call' ? undefined : row.body ?? undefined,
      kind,
      call: call ?? undefined,
      conversationId: this.topic,
      ts: asTime(row.created_at),
      replyToId: row.reply_to_id ?? undefined,
      reply,
      mediaBucket: row.media_bucket ?? undefined,
      mediaKey: row.deleted_at ? undefined : row.media_path ?? undefined,
      mediaType: row.deleted_at ? undefined : row.media_mime ?? undefined,
      name: row.deleted_at ? undefined : row.media_name ?? undefined,
      mediaSize: row.media_size ?? undefined,
      editedAt: asTime(row.edited_at) || undefined,
      deleted: Boolean(row.deleted_at)
    };
  }

  async #signMedia(messages: LocalChatMessage[]): Promise<void> {
    const groups = new Map<string, LocalChatMessage[]>();
    const now = Date.now();
    for (const message of messages) {
      if (!message.mediaBucket || !message.mediaKey || message.mediaKey.startsWith('http')) continue;
      const cached = this.messages.find(
        (candidate) => candidate.mediaBucket === message.mediaBucket && candidate.mediaKey === message.mediaKey
      );
      if (cached?.signedUrl && (cached.signedUrlExpiresAt ?? 0) > now + 60_000) {
        message.signedUrl = cached.signedUrl;
        message.signedUrlExpiresAt = cached.signedUrlExpiresAt;
        continue;
      }
      groups.set(message.mediaBucket, [...(groups.get(message.mediaBucket) ?? []), message]);
    }
    await Promise.all(
      [...groups.entries()].map(async ([bucket, items]) => {
        const { data } = await this.#sb.storage
          .from(bucket)
          .createSignedUrls(items.map((item) => item.mediaKey as string), SIGN_TTL_SECONDS);
        for (let index = 0; index < items.length; index++) {
          const url = data?.[index]?.signedUrl;
          if (url) {
            items[index].signedUrl = url;
            items[index].signedUrlExpiresAt = now + SIGN_TTL_SECONDS * 1_000;
          }
        }
      })
    );
  }

  async #decorate(messages: LocalChatMessage[]): Promise<LocalChatMessage[]> {
    const ids = messages.map((message) => message.id).filter((id) => UUID_RE.test(id));
    if (!ids.length) return messages;
    const reactionRows: ReactionRow[] = [];
    const starRows: Array<{ message_id: string }> = [];
    for (let index = 0; index < ids.length; index += 100) {
      const chunk = ids.slice(index, index + 100);
      const [reactionResult, starResult] = await Promise.all([
        this.#sb.from('chat_reactions').select('message_id,account_id,emoji').in('message_id', chunk),
        this.#sb.from('chat_stars').select('message_id').eq('account_id', this.profile).in('message_id', chunk)
      ]);
      reactionRows.push(...((reactionResult.data ?? []) as ReactionRow[]));
      starRows.push(...((starResult.data ?? []) as Array<{ message_id: string }>));
    }
    const reactions = new Map<string, ReactionRow[]>();
    for (const row of reactionRows) {
      reactions.set(row.message_id, [...(reactions.get(row.message_id) ?? []), row]);
    }
    const stars = new Set(starRows.map((row) => String(row.message_id)));
    return messages.map((message) => ({
      ...message,
      reactions: summarizeReactions(
        (reactions.get(message.id) ?? []).map((row) => ({ emoji: row.emoji, account_id: row.account_id })),
        this.profile
      ),
      starred: stars.has(message.id)
    }));
  }

  async #refreshDecorations(): Promise<void> {
    const decorated = await this.#decorate(this.messages);
    const byId = new Map(decorated.map((message) => [message.id, message]));
    // A realtime message may arrive while the decoration queries are in
    // flight. Merge only the reaction/star fields so that row is never lost.
    this.messages = this.messages.map((message) => {
      const next = byId.get(message.id);
      return next ? { ...message, reactions: next.reactions, starred: next.starred } : message;
    });
  }

  async #ingest(row: MessageRow): Promise<void> {
    if (!row?.id || row.conversation_id !== this.conversationId) return;
    const replyRows = await this.#loadReplyRows([row]);
    let message = this.#rowToMessage(row, replyRows);
    const optimistic = this.messages.find(
      (candidate) => candidate.pending && candidate.clientId && candidate.clientId === message.clientId
    );
    if (optimistic?.localDataUrl) message.localDataUrl = optimistic.localDataUrl;
    await this.#signMedia([message]);
    [message] = await this.#decorate([message]);
    this.messages = mergeChatMessages(this.messages, [message]);
  }

  async sendTextMessage(text: string, replyToId?: string): Promise<SendResult> {
    const body = text.trim();
    if (!body || body.length > MAX_TEXT_LENGTH || !this.conversationId) return 'failed';
    const clientId = crypto.randomUUID();
    const localId = `local-${clientId}`;
    const optimistic: LocalChatMessage = {
      id: localId,
      clientId,
      from: this.profile as LocalChatMessage['from'],
      text: body,
      kind: 'text',
      conversationId: this.topic,
      replyToId,
      reply: this.#replyPreview(replyToId),
      ts: Date.now(),
      pending: true
    };
    this.messages = mergeChatMessages(this.messages, [optimistic]);
    try {
      const { data, error } = await this.#sb
        .from('chat_messages')
        .insert({
          conversation_id: this.conversationId,
          sender_id: this.profile,
          client_id: clientId,
          kind: 'text',
          body,
          reply_to_id: replyToId ?? null
        })
        .select()
        .single();
      if (error) throw error;
      await this.#ingest(data as MessageRow);
      this.#pushAfterSend(body, String((data as MessageRow).id));
      return 'sent';
    } catch (error) {
      console.warn('[account-chat] text send failed', error);
      this.messages = this.messages.map((message) =>
        message.id === localId ? { ...message, pending: false, failed: true } : message
      );
      return 'failed';
    }
  }

  async sendMediaMessage(file: Blob, name: string, replyToId?: string): Promise<SendResult> {
    if (!this.conversationId) return 'failed';
    if (file.size > MAX_FILE_BYTES) throw new AccountChatError('too_large');
    const kind = mediaKind(file.type);
    const clientId = crypto.randomUUID();
    const localId = `local-${clientId}`;
    const preview = typeof URL !== 'undefined' ? URL.createObjectURL(file) : undefined;
    if (preview) this.#objectUrls.add(preview);
    const optimistic: LocalChatMessage = {
      id: localId,
      clientId,
      from: this.profile as LocalChatMessage['from'],
      kind,
      mediaType: file.type || 'application/octet-stream',
      name,
      mediaSize: file.size,
      localBlob: file,
      localDataUrl: preview,
      conversationId: this.topic,
      replyToId,
      reply: this.#replyPreview(replyToId),
      ts: Date.now(),
      pending: true
    };
    this.messages = mergeChatMessages(this.messages, [optimistic]);
    let uploadedObject: { bucket: string; path: string } | null = null;
    let inserted = false;
    try {
      const uploaded = kind === 'image' ? await shrinkImage(file) : file;
      const bucket = this.kind === 'couple' ? 'couple-chat' : 'chat-media';
      const ext = kind === 'image' && uploaded.type === 'image/webp' ? 'webp' : mediaExtension(name, file.type);
      const path = `${this.conversationId}/${this.profile}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await this.#sb.storage.from(bucket).upload(path, uploaded, {
        contentType: uploaded.type || file.type || 'application/octet-stream',
        upsert: false
      });
      if (uploadError) throw new AccountChatError('upload_failed', uploadError.message);
      uploadedObject = { bucket, path };
      const { data, error } = await this.#sb
        .from('chat_messages')
        .insert({
          conversation_id: this.conversationId,
          sender_id: this.profile,
          client_id: clientId,
          kind,
          reply_to_id: replyToId ?? null,
          media_bucket: bucket,
          media_path: path,
          media_mime: uploaded.type || file.type || 'application/octet-stream',
          media_name: name,
          media_size: uploaded.size
        })
        .select()
        .single();
      if (error) throw error;
      inserted = true;
      await this.#ingest(data as MessageRow);
      const label = kind === 'image' ? '📷 Fotografia' : kind === 'audio' ? '🎙️ Áudio' : kind === 'video' ? '🎬 Vídeo' : `📎 ${name}`;
      this.#pushAfterSend(label, String((data as MessageRow).id));
      return 'sent';
    } catch (error) {
      console.warn('[account-chat] media send failed', error);
      if (uploadedObject && !inserted) {
        void this.#sb.storage.from(uploadedObject.bucket).remove([uploadedObject.path]);
      }
      this.messages = this.messages.map((message) =>
        message.id === localId ? { ...message, pending: false, failed: true } : message
      );
      if (error instanceof AccountChatError) throw error;
      return 'failed';
    }
  }

  #replyPreview(replyToId?: string): ChatReplyPreview | undefined {
    if (!replyToId) return undefined;
    const target = this.messages.find((message) => message.id === replyToId);
    if (!target) return undefined;
    return {
      id: target.id,
      from: String(target.from),
      text: target.text,
      kind: target.kind ?? (target.mediaType ? mediaKind(target.mediaType) : 'text'),
      deleted: target.deleted
    };
  }

  async retryMessage(localId: string): Promise<SendResult> {
    const message = this.messages.find((candidate) => candidate.id === localId);
    if (!message?.failed) return 'failed';
    this.messages = this.messages.filter((candidate) => candidate.id !== localId);
    if (message.localBlob) return this.sendMediaMessage(message.localBlob, message.name ?? 'ficheiro', message.replyToId);
    if (message.text) return this.sendTextMessage(message.text, message.replyToId);
    return 'failed';
  }

  async editMessage(messageId: string, body: string): Promise<void> {
    const text = body.trim();
    if (!UUID_RE.test(messageId) || !text) return;
    const { data, error } = await this.#sb.rpc('edit_chat_message', { p_message: messageId, p_body: text });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as MessageRow | null;
    if (row?.id) await this.#ingest(row);
    else {
      this.messages = this.messages.map((message) =>
        message.id === messageId ? { ...message, text, editedAt: Date.now() } : message
      );
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (!UUID_RE.test(messageId)) return;
    const existing = this.messages.find((message) => message.id === messageId);
    const ownedMedia =
      existing?.mediaBucket && existing.mediaKey && !existing.mediaKey.startsWith('http')
        ? { bucket: existing.mediaBucket, path: existing.mediaKey }
        : null;
    const { data, error } = await this.#sb.rpc('delete_chat_message', { p_message: messageId });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as MessageRow | null;
    if (row?.id) await this.#ingest(row);
    else {
      this.messages = this.messages.map((message) =>
        message.id === messageId
          ? { ...message, text: undefined, mediaKey: undefined, mediaType: undefined, deleted: true }
          : message
      );
    }
    // Storage objects must be removed through the Storage API (not direct SQL).
    // The bucket DELETE policy checks owner_id, so even a forged message path
    // cannot delete the other participant's upload.
    if (ownedMedia) {
      const { error: removeError } = await this.#sb.storage.from(ownedMedia.bucket).remove([ownedMedia.path]);
      if (removeError) console.warn('[account-chat] deleted message left orphaned media', removeError);
    }
  }

  async toggleReaction(messageId: string, emoji: string): Promise<void> {
    if (!UUID_RE.test(messageId) || !emoji.trim()) return;
    const message = this.messages.find((candidate) => candidate.id === messageId);
    const mine = message?.reactions?.find((reaction) => reaction.emoji === emoji && reaction.reactedByMe);
    const query = mine
      ? this.#sb.from('chat_reactions').delete().eq('message_id', messageId).eq('account_id', this.profile)
      : this.#sb.from('chat_reactions').upsert(
          { message_id: messageId, account_id: this.profile, emoji },
          { onConflict: 'message_id,account_id' }
        );
    const { error } = await query;
    if (error) throw error;
    await this.#refreshDecorations();
    void this.#channel?.send({ type: 'broadcast', event: 'decorations', payload: { messageId } });
  }

  async toggleStar(messageId: string): Promise<void> {
    if (!UUID_RE.test(messageId)) return;
    const message = this.messages.find((candidate) => candidate.id === messageId);
    const query = message?.starred
      ? this.#sb.from('chat_stars').delete().eq('message_id', messageId).eq('account_id', this.profile)
      : this.#sb.from('chat_stars').insert({ message_id: messageId, account_id: this.profile });
    const { error } = await query;
    if (error) throw error;
    this.messages = this.messages.map((candidate) =>
      candidate.id === messageId ? { ...candidate, starred: !candidate.starred } : candidate
    );
  }

  async markReadUpTo(ts: number): Promise<void> {
    if (!this.conversationId || !ts || ts <= this.ownLastRead) return;
    const previous = this.ownLastRead;
    this.ownLastRead = ts;
    const { error } = await this.#sb.rpc('mark_chat_read', {
      p_conversation: this.conversationId,
      p_read_at: new Date(ts).toISOString()
    });
    if (error) {
      if (this.ownLastRead === ts) this.ownLastRead = previous;
      console.warn('[account-chat] mark read failed', error);
    }
  }

  mediaSrc(message: LocalChatMessage): string | null {
    if (message.localDataUrl) return message.localDataUrl;
    if (message.signedUrl) return message.signedUrl;
    return message.mediaKey?.startsWith('http') ? message.mediaKey : null;
  }

  #pushAfterSend(preview: string, eventId: string): void {
    void (async () => {
      try {
        const [{ sendPushNotify, shouldPushMessage }, { accountState }] = await Promise.all([
          import('$lib/push'),
          import('$lib/account/account-store.svelte')
        ]);
        if (!shouldPushMessage(`chat:${this.conversationId}`)) return;
        const me = accountState.account;
        if (!me) return;
        await sendPushNotify('message', {
          to: this.other,
          title: `💬 ${me.display_name || `@${me.handle}`}`,
          body: preview.slice(0, 120),
          url: '/mensagens/',
          eventId
        });
      } catch {
        /* Realtime remains authoritative; push is best-effort. */
      }
    })();
  }
}
