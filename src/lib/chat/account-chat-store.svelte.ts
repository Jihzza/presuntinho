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
  chatPageFilter,
  chatMediaVariant,
  exactReadTimestamp,
  mediaExtension,
  mediaKind,
  mergeChatMessages,
  parseCallBody,
  reconcileMessageReferences,
  summarizeReactions,
  type AccountConversationKind,
  type ChatPageCursor,
  type ChatCallMeta,
  type ChatMediaVariant,
  type ChatReplyPreview,
  type RichMessageKind
} from './account-chat-model';
import { FOREVER_MUTE_AT, type ConversationPreferencePatch } from './conversation-preferences';
import {
  canRemoveUploadAfterFailure,
  lookupCommittedMessage,
  type CommitLookup
} from './account-chat-delivery';
import { canEditChatMessage } from './message-actions';
import {
  accountChatTargetKey,
  accountChatOutboxKey,
  getAccountChatPersistence,
  AccountChatStorageError,
  type AccountChatOutboxEntry,
  type AccountChatPersistence,
  type AccountChatStorageErrorCode
} from './account-chat-outbox';
import {
  accountChatRetryAt,
  isExistingStorageObject,
  isMissingStorageObject,
  isRetryableAccountChatError
} from './account-chat-retry';

const PAGE_SIZE = 45;
const SEARCH_PAGE_SIZE = 30;
const MEDIA_PAGE_SIZE = 30;
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
export type DiscardFailedMessageResult = 'discarded' | 'reconciled' | 'blocked' | 'missing';

export interface AccountChatOptions {
  meId: string;
  peerId: string;
  kind: AccountConversationKind;
  spaceId?: string | null;
  topic?: string;
  /** Test seam; production uses the browser IndexedDB implementation. */
  persistence?: AccountChatPersistence;
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
  media_variant?: string | null;
  forwarded_from_id?: string | null;
  expires_at?: string | null;
  edited_at: string | null;
  deleted_at?: string | null;
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

interface StarredRow {
  message_id: string;
  conversation_id: string;
  conversation_kind: string;
  topic: string;
  sender_id: string;
  message_kind: string;
  body: string | null;
  media_name: string | null;
  media_mime: string | null;
  media_variant: string | null;
  forwarded_from_id: string | null;
  expires_at: string | null;
  message_created_at: string;
  starred_at: string;
}

interface ReminderRow {
  id: string;
  message_id: string;
  conversation_id: string;
  remind_at: string;
  status: string;
  notified_at: string | null;
  message_kind: string;
  message_body: string | null;
  media_name: string | null;
  created_at: string;
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

export interface AccountChatStarredItem {
  messageId: string;
  conversationId: string;
  conversationKind: AccountConversationKind;
  topic: string;
  senderId: string;
  kind: RichMessageKind;
  body: string | null;
  mediaName: string | null;
  mediaMime: string | null;
  mediaVariant: ChatMediaVariant;
  forwardedFromId: string | null;
  expiresAt: number;
  messageCreatedAt: number;
  starredAt: number;
  starredAtExact: string;
}

export interface AccountChatReminderItem {
  id: string;
  messageId: string;
  conversationId: string;
  remindAt: number;
  status: 'pending' | 'notified';
  notifiedAt: number;
  kind: RichMessageKind;
  body: string | null;
  mediaName: string | null;
  createdAt: number;
}

export interface AccountChatDisappearingEvent {
  id: string;
  conversationId: string;
  actorId: string | null;
  seconds: number;
  createdAt: number;
}

export async function listAccountChatStars(
  cursor?: { starredAt: string; messageId: string },
  limit = 30
): Promise<AccountChatStarredItem[]> {
  const { data, error } = await getSupabaseClient().rpc('list_starred_chat_messages', {
    p_before_at: cursor?.starredAt ?? null,
    p_before_id: cursor?.messageId ?? null,
    p_limit: Math.max(1, Math.min(limit, 100))
  });
  if (error) throw error;
  return ((data ?? []) as StarredRow[]).map((row) => ({
    messageId: row.message_id,
    conversationId: row.conversation_id,
    conversationKind: row.conversation_kind === 'couple' ? 'couple' : 'direct',
    topic: row.topic,
    senderId: row.sender_id,
    kind: richKind(row.message_kind),
    body: row.body,
    mediaName: row.media_name,
    mediaMime: row.media_mime,
    mediaVariant: row.media_variant === 'sticker'
      ? 'sticker'
      : row.media_variant === 'gif'
        ? 'gif'
        : 'attachment',
    forwardedFromId: row.forwarded_from_id,
    expiresAt: asTime(row.expires_at),
    messageCreatedAt: asTime(row.message_created_at),
    starredAt: asTime(row.starred_at),
    starredAtExact: row.starred_at
  }));
}

export async function listAccountChatReminders(): Promise<AccountChatReminderItem[]> {
  const { data, error } = await getSupabaseClient().rpc('list_chat_reminders');
  if (error) throw error;
  return ((data ?? []) as ReminderRow[]).map((row) => ({
    id: row.id,
    messageId: row.message_id,
    conversationId: row.conversation_id,
    remindAt: asTime(row.remind_at),
    status: row.status === 'notified' ? 'notified' : 'pending',
    notifiedAt: asTime(row.notified_at),
    kind: richKind(row.message_kind),
    body: row.message_body,
    mediaName: row.media_name,
    createdAt: asTime(row.created_at)
  }));
}

export async function listAccountChatDisappearingEvents(
  conversationId: string,
  limit = 10
): Promise<AccountChatDisappearingEvent[]> {
  if (!UUID_RE.test(conversationId)) throw new AccountChatError('invalid_conversation');
  const { data, error } = await getSupabaseClient()
    .from('chat_disappearing_events')
    .select('id,conversation_id,actor_id,seconds,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 30)));
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    conversationId: String(row.conversation_id),
    actorId: typeof row.actor_id === 'string' ? row.actor_id : null,
    seconds: Number(row.seconds) || 0,
    createdAt: asTime(row.created_at)
  }));
}

/** Update only this authenticated account's private conversation settings.
 * RLS owns the authorization boundary; the account predicate also prevents a
 * compromised UI from accidentally touching another local account's row. */
export async function updateAccountChatPreferences(
  conversationId: string,
  accountId: string,
  patch: ConversationPreferencePatch
): Promise<void> {
  if (!UUID_RE.test(conversationId) || !UUID_RE.test(accountId)) {
    throw new AccountChatError('invalid_conversation');
  }
  if (Object.values(patch).some(
    (value) => value !== undefined && (!Number.isFinite(value) || value < 0 || value > FOREVER_MUTE_AT)
  )) {
    throw new AccountChatError('invalid_conversation');
  }

  const update: Record<string, string | null> = {};
  if (patch.pinnedAt !== undefined) update.pinned_at = patch.pinnedAt > 0 ? new Date(patch.pinnedAt).toISOString() : null;
  if (patch.mutedUntil !== undefined) update.muted_until = patch.mutedUntil > 0 ? new Date(patch.mutedUntil).toISOString() : null;
  if (patch.archivedAt !== undefined) update.archived_at = patch.archivedAt > 0 ? new Date(patch.archivedAt).toISOString() : null;
  if (Object.keys(update).length === 0) return;

  const { data, error } = await getSupabaseClient()
    .from('chat_members')
    .update(update)
    .eq('conversation_id', conversationId)
    .eq('account', accountId)
    .select('conversation_id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AccountChatError('invalid_conversation');
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
    readonly code: 'too_large' | 'invalid_conversation' | 'upload_failed' | 'send_failed' | 'edit_expired',
    message: string = code,
    options?: ErrorOptions
  ) {
    super(message, options);
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
  ownLastReadAt = $state('');
  peerLastReadAt = $state('');
  ownLastDelivered = $state(0);
  peerLastDelivered = $state(0);
  ownLastDeliveredAt = $state('');
  peerLastDeliveredAt = $state('');
  searchResults = $state<LocalChatMessage[]>([]);
  searchLoading = $state(false);
  searchError = $state(false);
  searchHasMore = $state(false);
  searchActiveQuery = $state('');
  contextLoading = $state(false);
  contextError = $state(false);
  mediaItems = $state<LocalChatMessage[]>([]);
  mediaLoading = $state(false);
  mediaError = $state(false);
  mediaHasMore = $state(false);
  mediaLoaded = $state(false);
  disappearingSeconds = $state(0);
  disappearingUpdatedAt = $state(0);
  disappearingUpdatedBy = $state<string | null>(null);
  /** Set only when this browser could not durably retain the latest send. */
  outboxStorageError = $state<AccountChatStorageErrorCode | null>(null);

  #sb: SupabaseClient;
  #channel: RealtimeChannel | null = null;
  #stopped = true;
  #sequence = 0;
  #searchSequence = 0;
  #contextSequence = 0;
  #mediaSequence = 0;
  #pollTimer: ReturnType<typeof setInterval> | null = null;
  #expiryTimer: ReturnType<typeof setInterval> | null = null;
  #typingIdleTimer: ReturnType<typeof setTimeout> | null = null;
  #peerTypingTimer: ReturnType<typeof setTimeout> | null = null;
  #lastTypingWrite = 0;
  #objectUrls = new Set<string>();
  #onVisible: (() => void) | null = null;
  #onOnline: (() => void) | null = null;
  #persistence: AccountChatPersistence;
  #outboxDrain: Promise<void> | null = null;
  #activeSendIds = new Set<string>();
  #bootstrapRunning = false;

  constructor(options: AccountChatOptions) {
    this.profile = options.meId;
    this.other = options.peerId;
    this.kind = options.kind;
    this.spaceId = options.spaceId ?? null;
    this.topic = options.topic?.trim() || 'main';
    this.#sb = getSupabaseClient();
    this.#persistence = options.persistence ?? getAccountChatPersistence();
  }

  get otherLastRead(): number {
    return this.peerLastRead;
  }

  get otherLastDelivered(): number {
    return this.peerLastDelivered;
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
      (message) =>
        !message.deleted &&
        message.from === this.other &&
        (message.createdAt && this.ownLastReadAt
          ? message.createdAt > this.ownLastReadAt
          : message.ts > this.ownLastRead)
    ).length;
  }

  start(): void {
    this.stop();
    this.#stopped = false;
    this.ready = false;
    this.authError = false;
    const generation = ++this.#sequence;
    void this.#bootstrap(generation);
    if (typeof document !== 'undefined') {
      this.#onVisible = () => {
        if (this.#stopped || document.visibilityState !== 'visible') return;
        void this.#recover();
      };
      this.#onOnline = () => {
        if (this.#stopped) return;
        void this.#recover(true);
      };
      document.addEventListener('visibilitychange', this.#onVisible);
      window.addEventListener('focus', this.#onVisible);
      window.addEventListener('online', this.#onOnline);
    }
  }

  stop(): void {
    this.#stopped = true;
    this.#searchSequence += 1;
    this.#contextSequence += 1;
    this.#mediaSequence += 1;
    this.searchLoading = false;
    this.searchResults = [];
    this.searchError = false;
    this.searchHasMore = false;
    this.searchActiveQuery = '';
    this.contextLoading = false;
    this.contextError = false;
    this.mediaItems = [];
    this.mediaLoading = false;
    this.mediaError = false;
    this.mediaHasMore = false;
    this.mediaLoaded = false;
    if (this.#typingIdleTimer) clearTimeout(this.#typingIdleTimer);
    if (this.#peerTypingTimer) clearTimeout(this.#peerTypingTimer);
    if (this.#pollTimer) clearInterval(this.#pollTimer);
    if (this.#expiryTimer) clearInterval(this.#expiryTimer);
    this.#typingIdleTimer = null;
    this.#peerTypingTimer = null;
    this.#pollTimer = null;
    this.#expiryTimer = null;
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
    if (this.#onOnline && typeof window !== 'undefined') {
      window.removeEventListener('online', this.#onOnline);
      this.#onOnline = null;
    }
    this.#activeSendIds.clear();
    for (const url of this.#objectUrls) URL.revokeObjectURL(url);
    this.#objectUrls.clear();
  }

  async #bootstrap(generation: number): Promise<void> {
    if (this.#bootstrapRunning || this.#stopped || generation !== this.#sequence) return;
    this.#bootstrapRunning = true;
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
      await this.#hydrateOutbox();
      if (this.#stopped || generation !== this.#sequence) return;
      this.#openChannel();
      if (this.#pollTimer) clearInterval(this.#pollTimer);
      this.#pollTimer = setInterval(() => {
        if (this.#stopped || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return;
        void this.#recover();
      }, POLL_MS);
      if (this.#expiryTimer) clearInterval(this.#expiryTimer);
      this.#expiryTimer = setInterval(() => this.#pruneExpiredMessages(), 15_000);
      this.offline = false;
      this.authError = false;
      void this.#drainOutbox(true);
    } catch (error) {
      console.warn('[account-chat] start failed', error);
      if (!this.#stopped && generation === this.#sequence) {
        await this.#restoreOfflineConversation();
        this.offline = true;
        this.authError = !isRetryableAccountChatError(error);
      }
    } finally {
      this.#bootstrapRunning = false;
      if (generation === this.#sequence) this.ready = true;
    }
  }

  #targetKey(): string {
    return accountChatTargetKey({
      accountId: this.profile,
      peerId: this.other,
      kind: this.kind,
      spaceId: this.spaceId,
      topic: this.topic
    });
  }

  /** A previously durable send contains the server conversation UUID. It is
   * enough to restore the offline timeline even when ensure_chat_conversation
   * cannot currently reach Supabase. */
  async #restoreOfflineConversation(): Promise<boolean> {
    try {
      const targetKey = this.#targetKey();
      const entries = await this.#persistence.listOutbox(this.profile);
      const match = entries.find((entry) => entry.targetKey === targetKey);
      if (!match || this.#stopped) return false;
      this.conversationId = match.conversationId;
      await this.#hydrateOutbox();
      return true;
    } catch (error) {
      console.warn('[account-chat] offline bootstrap restore unavailable', error);
      return false;
    }
  }

  async #recover(forceOutbox = false): Promise<void> {
    if (!this.conversationId) {
      await this.#bootstrap(this.#sequence);
      return;
    }
    const state = String(this.#channel?.state ?? '');
    if (!this.#channel || state === 'closed' || state === 'errored') this.#openChannel();
    await Promise.all([this.#loadPage(), this.#loadMembers()]);
    await this.#refreshDecorations();
    if (!this.offline) this.authError = false;
    await this.#drainOutbox(forceOutbox);
    this.#pruneExpiredMessages();
  }

  #pruneExpiredMessages(now = Date.now()): void {
    const expired = new Set(
      [...this.messages, ...this.searchResults, ...this.mediaItems]
        .filter((message) => Boolean(message.expiresAt && (message.expiresAt as number) <= now))
        .map((message) => message.id)
    );
    if (!expired.size) return;
    for (const message of [...this.messages, ...this.searchResults, ...this.mediaItems]) {
      if (expired.has(message.id)) this.#releaseObjectUrl(message.localDataUrl);
    }
    this.messages = this.messages.filter((message) => !expired.has(message.id));
    this.searchResults = this.searchResults.filter((message) => !expired.has(message.id));
    this.mediaItems = this.mediaItems.filter((message) => !expired.has(message.id));
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
            if (id) {
              for (const message of [...this.messages, ...this.searchResults, ...this.mediaItems]) {
                if (message.id === id) this.#releaseObjectUrl(message.localDataUrl);
              }
              this.messages = this.messages.filter((message) => message.id !== id);
              this.searchResults = this.searchResults.filter((message) => message.id !== id);
              this.mediaItems = this.mediaItems.filter((message) => message.id !== id);
            }
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
      .on('broadcast', { event: 'settings' }, () => void this.#loadMembers())
      .on('presence', { event: 'sync' }, () => this.#syncPresence())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.offline = false;
          void channel.track({ userId: this.profile, typing: false, onlineAt: new Date().toISOString() });
          void this.#touchMember(false);
          void this.#loadPage();
          void this.#drainOutbox(true);
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
    const [{ data, error }, conversationResult] = await Promise.all([
      this.#sb
        .from('chat_members')
        .select('conversation_id,account,last_read_at,last_delivered_at,last_seen_at,typing_until')
        .eq('conversation_id', conversationId),
      this.#sb
        .from('chat_conversations')
        .select('disappearing_seconds,disappearing_updated_at,disappearing_updated_by')
        .eq('id', conversationId)
        .maybeSingle()
    ]);
    if (error) return;
    if (this.#stopped || conversationId !== this.conversationId) return;
    if (!conversationResult.error && conversationResult.data) {
      this.disappearingSeconds = Number(conversationResult.data.disappearing_seconds) || 0;
      this.disappearingUpdatedAt = asTime(conversationResult.data.disappearing_updated_at);
      this.disappearingUpdatedBy = typeof conversationResult.data.disappearing_updated_by === 'string'
        ? conversationResult.data.disappearing_updated_by
        : null;
    }
    for (const raw of data ?? []) {
      const row = raw as MemberRow;
      if (row.account === this.profile) {
        if (row.last_read_at && row.last_read_at > this.ownLastReadAt) {
          this.ownLastRead = asTime(row.last_read_at);
          this.ownLastReadAt = row.last_read_at;
        }
        if (row.last_delivered_at && row.last_delivered_at > this.ownLastDeliveredAt) {
          this.ownLastDelivered = asTime(row.last_delivered_at);
          this.ownLastDeliveredAt = row.last_delivered_at;
        }
      }
      if (row.account === this.other) {
        if (row.last_read_at && row.last_read_at > this.peerLastReadAt) {
          this.peerLastRead = asTime(row.last_read_at);
          this.peerLastReadAt = row.last_read_at;
        }
        if (row.last_delivered_at && row.last_delivered_at > this.peerLastDeliveredAt) {
          this.peerLastDelivered = asTime(row.last_delivered_at);
          this.peerLastDeliveredAt = row.last_delivered_at;
        }
        this.otherLastSeen = asTime(row.last_seen_at);
        this.otherTyping = asTime(row.typing_until) > Date.now();
      }
    }
  }

  async #loadPage(before?: ChatPageCursor): Promise<void> {
    const conversationId = this.conversationId;
    if (!conversationId) return;
    const hadServerMessages = this.messages.some((message) => UUID_RE.test(message.id));
    let query = this.#sb
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);
    if (before) query = query.or(chatPageFilter(before));
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
    let merged = mergeChatMessages(this.messages, loaded);
    for (const message of loaded) merged = reconcileMessageReferences(merged, message);
    this.messages = merged;
    await this.#markDeliveredRows(rows);
    // Background refreshes only fetch the newest page. They must not undo an
    // earlier "end of history" result after the user has paged backwards.
    if (before || !hadServerMessages) {
      this.hasOlder = rows.length === PAGE_SIZE;
    }
    this.offline = false;
  }

  async loadOlder(): Promise<void> {
    if (this.loadingOlder || !this.hasOlder || !this.conversationId) return;
    const oldest = this.messages.find((message) => UUID_RE.test(message.id) && message.createdAt);
    if (!oldest?.createdAt) return;
    this.loadingOlder = true;
    try {
      await this.#loadPage({ createdAt: oldest.createdAt, id: oldest.id });
    } finally {
      this.loadingOlder = false;
    }
  }

  clearSearch(): void {
    this.#searchSequence += 1;
    this.searchResults = [];
    this.searchLoading = false;
    this.searchError = false;
    this.searchHasMore = false;
    this.searchActiveQuery = '';
  }

  /** Search the complete RLS-filtered conversation through a keyset-paged RPC.
   * Local filtering is intentionally left to the page only as an explicit
   * degraded fallback when this request fails. */
  async searchMessages(rawQuery: string, append = false): Promise<void> {
    const conversationId = this.conversationId;
    const query = rawQuery.trim().slice(0, 160);
    if (!conversationId || this.#stopped || !query) {
      if (!append) this.clearSearch();
      return;
    }
    if (append && (query !== this.searchActiveQuery || !this.searchHasMore || this.searchLoading)) return;

    const sequence = append ? this.#searchSequence : ++this.#searchSequence;
    if (!append) {
      this.searchResults = [];
      this.searchHasMore = false;
      this.searchActiveQuery = query;
    }
    this.searchLoading = true;
    this.searchError = false;
    const oldest = append ? this.searchResults[0] : undefined;
    try {
      const { data, error } = await this.#sb.rpc('search_chat_messages', {
        p_conversation: conversationId,
        p_query: query,
        p_before_at: oldest?.createdAt ?? null,
        p_before_id: oldest?.createdAt ? oldest.id : null,
        p_limit: SEARCH_PAGE_SIZE
      });
      if (error) throw error;
      if (
        this.#stopped ||
        sequence !== this.#searchSequence ||
        conversationId !== this.conversationId ||
        query !== this.searchActiveQuery
      ) return;
      const rows = (data ?? []) as MessageRow[];
      const replies = await this.#loadReplyRows(rows);
      if (this.#stopped || sequence !== this.#searchSequence || conversationId !== this.conversationId) return;
      let loaded = rows.map((row) => this.#rowToMessage(row, replies));
      await this.#signMedia(loaded);
      loaded = await this.#decorate(loaded);
      if (this.#stopped || sequence !== this.#searchSequence || conversationId !== this.conversationId) return;
      let merged = mergeChatMessages(append ? this.searchResults : [], loaded);
      for (const message of loaded) merged = reconcileMessageReferences(merged, message);
      this.searchResults = merged;
      this.searchHasMore = rows.length === SEARCH_PAGE_SIZE;
    } catch (error) {
      if (
        !this.#stopped &&
        sequence === this.#searchSequence &&
        conversationId === this.conversationId &&
        query === this.searchActiveQuery
      ) {
        console.warn('[account-chat] server search failed', error);
        this.searchError = true;
        this.searchHasMore = false;
      }
    } finally {
      if (sequence === this.#searchSequence) this.searchLoading = false;
    }
  }

  /** Load a bounded membership-checked window around an exact message. The
   * RPC may legally return another conversation owned by the same account, so
   * every row is still matched against the currently open conversation before
   * it can enter the timeline. */
  async loadMessageContext(messageId: string): Promise<boolean> {
    const conversationId = this.conversationId;
    if (!conversationId || this.#stopped || !UUID_RE.test(messageId)) return false;
    if (this.messages.some((message) => message.id === messageId)) return true;
    const sequence = ++this.#contextSequence;
    this.contextLoading = true;
    this.contextError = false;
    try {
      const { data, error } = await this.#sb.rpc('load_chat_message_context', {
        p_message: messageId,
        p_before: 20,
        p_after: 20
      });
      if (error) throw error;
      if (this.#stopped || conversationId !== this.conversationId) return false;
      const rows = (data ?? []) as MessageRow[];
      if (
        !rows.some((row) => row.id === messageId) ||
        rows.some((row) => row.conversation_id !== conversationId)
      ) return false;
      const replies = await this.#loadReplyRows(rows);
      if (this.#stopped || conversationId !== this.conversationId) return false;
      let loaded = rows.map((row) => this.#rowToMessage(row, replies));
      await this.#signMedia(loaded);
      loaded = await this.#decorate(loaded);
      if (this.#stopped || conversationId !== this.conversationId) return false;
      let merged = mergeChatMessages(this.messages, loaded);
      for (const message of loaded) merged = reconcileMessageReferences(merged, message);
      this.messages = merged;
      await this.#markDeliveredRows(rows);
      return this.messages.some((message) => message.id === messageId);
    } catch (error) {
      if (!this.#stopped && conversationId === this.conversationId) {
        console.warn('[account-chat] message context failed', error);
        this.contextError = true;
      }
      return false;
    } finally {
      if (sequence === this.#contextSequence) this.contextLoading = false;
    }
  }

  clearMediaGallery(): void {
    this.#mediaSequence += 1;
    this.mediaItems = [];
    this.mediaLoading = false;
    this.mediaError = false;
    this.mediaHasMore = false;
    this.mediaLoaded = false;
  }

  /** Paginated independently from the text timeline. `append` asks for the
   * next older page using the oldest exact timestamp/id already in gallery. */
  async loadMediaGallery(append = false): Promise<void> {
    const conversationId = this.conversationId;
    if (!conversationId || this.#stopped || this.mediaLoading) return;
    if (append && (!this.mediaLoaded || !this.mediaHasMore)) return;
    const sequence = append ? this.#mediaSequence : ++this.#mediaSequence;
    if (!append) {
      this.mediaItems = [];
      this.mediaError = false;
      this.mediaHasMore = false;
    }
    this.mediaLoading = true;
    const oldest = append ? this.mediaItems[0] : undefined;
    try {
      const { data, error } = await this.#sb.rpc('list_chat_media', {
        p_conversation: conversationId,
        p_before_at: oldest?.createdAt ?? null,
        p_before_id: oldest?.createdAt ? oldest.id : null,
        p_limit: MEDIA_PAGE_SIZE
      });
      if (error) throw error;
      if (this.#stopped || sequence !== this.#mediaSequence || conversationId !== this.conversationId) return;
      const rows = (data ?? []) as MessageRow[];
      if (rows.some((row) => row.conversation_id !== conversationId)) {
        throw new AccountChatError('invalid_conversation');
      }
      const replies = await this.#loadReplyRows(rows);
      if (this.#stopped || sequence !== this.#mediaSequence || conversationId !== this.conversationId) return;
      let loaded = rows.map((row) => this.#rowToMessage(row, replies));
      await this.#signMedia(loaded);
      loaded = await this.#decorate(loaded);
      if (this.#stopped || sequence !== this.#mediaSequence || conversationId !== this.conversationId) return;
      this.mediaItems = mergeChatMessages(append ? this.mediaItems : [], loaded);
      this.mediaHasMore = rows.length === MEDIA_PAGE_SIZE;
      this.mediaLoaded = true;
      this.mediaError = false;
    } catch (error) {
      if (!this.#stopped && sequence === this.#mediaSequence && conversationId === this.conversationId) {
        console.warn('[account-chat] media gallery failed', error);
        this.mediaError = true;
        if (!append) this.mediaHasMore = false;
        this.mediaLoaded = true;
      }
    } finally {
      if (sequence === this.#mediaSequence) this.mediaLoading = false;
    }
  }

  async #loadReplyRows(rows: MessageRow[]): Promise<Map<string, MessageRow>> {
    const ids = [...new Set(rows.map((row) => row.reply_to_id).filter((id): id is string => Boolean(id)))];
    const out = new Map<string, MessageRow>();
    for (const message of mergeChatMessages(this.messages, this.mediaItems)) {
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
        media_variant: message.mediaVariant ?? 'attachment',
        forwarded_from_id: message.forwardedFromId ?? null,
        expires_at: message.expiresAt ? new Date(message.expiresAt).toISOString() : null,
        edited_at: message.editedAt ? new Date(message.editedAt).toISOString() : null,
        deleted_at: message.deleted ? new Date(message.ts).toISOString() : null,
        created_at: message.createdAt ?? new Date(message.ts).toISOString()
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
      createdAt: row.created_at,
      ts: asTime(row.created_at),
      replyToId: row.reply_to_id ?? undefined,
      reply,
      mediaBucket: row.media_bucket ?? undefined,
      mediaKey: row.deleted_at ? undefined : row.media_path ?? undefined,
      mediaType: row.deleted_at ? undefined : row.media_mime ?? undefined,
      name: row.deleted_at ? undefined : row.media_name ?? undefined,
      mediaSize: row.media_size ?? undefined,
      mediaVariant: row.deleted_at
        ? undefined
        : row.media_variant === 'sticker'
          ? 'sticker'
          : row.media_variant === 'gif'
            ? 'gif'
            : 'attachment',
      forwardedFromId: row.deleted_at ? undefined : row.forwarded_from_id ?? undefined,
      expiresAt: asTime(row.expires_at) || undefined,
      editedAt: asTime(row.edited_at) || undefined,
      deleted: Boolean(row.deleted_at)
    };
  }

  #releaseObjectUrl(url: string | undefined): void {
    if (!url || !this.#objectUrls.has(url) || typeof URL === 'undefined') return;
    URL.revokeObjectURL(url);
    this.#objectUrls.delete(url);
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
    // Once the private object has a signed remote URL, the potentially large
    // optimistic Blob URL is no longer needed. Explicitly setting undefined
    // also prevents mergeChatMessages from retaining the previous property.
    for (const message of messages) {
      if (!message.signedUrl) continue;
      const current = this.messages.find((candidate) =>
        candidate.id === message.id ||
        Boolean(message.clientId && candidate.clientId === message.clientId)
      );
      this.#releaseObjectUrl(message.localDataUrl ?? current?.localDataUrl);
      message.localDataUrl = undefined;
    }
  }

  async #decorate(messages: LocalChatMessage[]): Promise<LocalChatMessage[]> {
    const ids = messages.map((message) => message.id).filter((id) => UUID_RE.test(id));
    if (!ids.length) return messages;
    const reactionRows: ReactionRow[] = [];
    const starRows: Array<{ message_id: string }> = [];
    const reminderRows: Array<{ message_id: string; remind_at: string; status: string }> = [];
    for (let index = 0; index < ids.length; index += 100) {
      const chunk = ids.slice(index, index + 100);
      const [reactionResult, starResult, reminderResult] = await Promise.all([
        this.#sb.from('chat_reactions').select('message_id,account_id,emoji').in('message_id', chunk),
        this.#sb.from('chat_stars').select('message_id').eq('account_id', this.profile).in('message_id', chunk),
        this.#sb
          .from('chat_reminders')
          .select('message_id,remind_at,status')
          .eq('account_id', this.profile)
          .in('status', ['pending', 'notified'])
          .in('message_id', chunk)
      ]);
      reactionRows.push(...((reactionResult.data ?? []) as ReactionRow[]));
      starRows.push(...((starResult.data ?? []) as Array<{ message_id: string }>));
      reminderRows.push(...((reminderResult.data ?? []) as Array<{ message_id: string; remind_at: string; status: string }>));
    }
    const reactions = new Map<string, ReactionRow[]>();
    for (const row of reactionRows) {
      reactions.set(row.message_id, [...(reactions.get(row.message_id) ?? []), row]);
    }
    const stars = new Set(starRows.map((row) => String(row.message_id)));
    const reminders = new Map(reminderRows.map((row) => [String(row.message_id), asTime(row.remind_at)]));
    return messages.map((message) => ({
      ...message,
      reactions: message.deleted
        ? []
        : summarizeReactions(
            (reactions.get(message.id) ?? []).map((row) => ({ emoji: row.emoji, account_id: row.account_id })),
            this.profile
          ),
      starred: message.deleted ? false : stars.has(message.id),
      reminderAt: message.deleted ? undefined : reminders.get(message.id) || undefined
    }));
  }

  async #refreshDecorations(): Promise<void> {
    const all = mergeChatMessages(mergeChatMessages(this.messages, this.searchResults), this.mediaItems);
    const decorated = await this.#decorate(all);
    const byId = new Map(decorated.map((message) => [message.id, message]));
    // A realtime message may arrive while the decoration queries are in
    // flight. Merge only decoration fields so that row is never lost.
    this.messages = this.messages.map((message) => {
      const next = byId.get(message.id);
      return next ? { ...message, reactions: next.reactions, starred: next.starred, reminderAt: next.reminderAt } : message;
    });
    this.searchResults = this.searchResults.map((message) => {
      const next = byId.get(message.id);
      return next ? { ...message, reactions: next.reactions, starred: next.starred, reminderAt: next.reminderAt } : message;
    });
    this.mediaItems = this.mediaItems.map((message) => {
      const next = byId.get(message.id);
      return next ? { ...message, reactions: next.reactions, starred: next.starred, reminderAt: next.reminderAt } : message;
    });
  }

  async #ingest(row: MessageRow): Promise<void> {
    if (this.#stopped || !row?.id || row.conversation_id !== this.conversationId) return;
    const replyRows = await this.#loadReplyRows([row]);
    if (this.#stopped || row.conversation_id !== this.conversationId) return;
    let message = this.#rowToMessage(row, replyRows);
    const optimistic = this.messages.find(
      (candidate) => candidate.clientId && candidate.clientId === message.clientId
    );
    if (optimistic?.localDataUrl && message.mediaKey) message.localDataUrl = optimistic.localDataUrl;
    else if (optimistic?.localDataUrl) this.#releaseObjectUrl(optimistic.localDataUrl);
    await this.#signMedia([message]);
    if (this.#stopped || row.conversation_id !== this.conversationId) return;
    [message] = await this.#decorate([message]);
    if (this.#stopped || row.conversation_id !== this.conversationId) return;
    this.messages = reconcileMessageReferences(mergeChatMessages(this.messages, [message]), message);
    this.searchResults = reconcileMessageReferences(
      mergeChatMessages(this.searchResults, this.searchResults.some((candidate) => candidate.id === message.id) ? [message] : []),
      message
    );
    if (this.mediaLoaded) {
      this.mediaItems = message.deleted || !message.mediaKey
        ? this.mediaItems.filter((candidate) => candidate.id !== message.id)
        : mergeChatMessages(this.mediaItems, [message]);
    }
    await this.#markDeliveredRows([row]);
  }

  async #markDeliveredRows(rows: MessageRow[]): Promise<void> {
    let deliveredAt = '';
    for (const row of rows) {
      if (row.sender_id !== this.other || !row.created_at) continue;
      if (!deliveredAt || row.created_at > deliveredAt) deliveredAt = row.created_at;
    }
    if (!deliveredAt) return;
    await this.#markDeliveredAt(deliveredAt);
  }

  async #markDeliveredAt(deliveredAt: string): Promise<void> {
    const conversationId = this.conversationId;
    if (!conversationId || this.#stopped || !deliveredAt) return;
    if (this.ownLastDeliveredAt && deliveredAt <= this.ownLastDeliveredAt) return;
    const previous = this.ownLastDelivered;
    const previousExact = this.ownLastDeliveredAt;
    this.ownLastDelivered = asTime(deliveredAt);
    this.ownLastDeliveredAt = deliveredAt;
    const { data, error } = await this.#sb.rpc('mark_chat_delivered', {
      p_conversation: conversationId,
      p_delivered_at: deliveredAt
    });
    if (this.#stopped || conversationId !== this.conversationId) return;
    if (error) {
      if (this.ownLastDeliveredAt === deliveredAt) {
        this.ownLastDelivered = previous;
        this.ownLastDeliveredAt = previousExact;
      }
      console.warn('[account-chat] mark delivered failed', error);
      return;
    }
    const confirmed = typeof data === 'string' ? data : '';
    if (confirmed && confirmed > this.ownLastDeliveredAt) {
      this.ownLastDeliveredAt = confirmed;
      this.ownLastDelivered = asTime(confirmed);
    }
  }

  #outboxMessage(entry: AccountChatOutboxEntry): LocalChatMessage {
    const existing = this.messages.find((message) => message.clientId === entry.clientId);
    // The newest page may already contain the committed row while a stale
    // IndexedDB cleanup is pending. Reuse it without allocating an orphaned
    // Blob URL; the drain pass will reconcile and delete the outbox row.
    if (existing && !existing.id.startsWith('local-')) return existing;
    let preview = existing?.localDataUrl;
    if (!preview && entry.mediaBlob && typeof URL !== 'undefined') {
      preview = URL.createObjectURL(entry.mediaBlob);
      this.#objectUrls.add(preview);
    }
    const base: LocalChatMessage = {
      id: `local-${entry.clientId}`,
      clientId: entry.clientId,
      from: this.profile as LocalChatMessage['from'],
      conversationId: this.topic,
      replyToId: entry.replyToId,
      reply: this.#replyPreview(entry.replyToId),
      forwardedFromId: entry.forwardedFromId,
      ts: entry.createdAt,
      pending: false,
      queued: entry.state === 'queued',
      failed: entry.state === 'failed'
    };
    if (entry.kind === 'text') return { ...base, kind: 'text', text: entry.text };
    const blob = entry.mediaBlob as Blob;
    return {
      ...base,
      kind: mediaKind(entry.mediaType || blob.type),
      mediaType: entry.mediaType || blob.type || 'application/octet-stream',
      name: entry.mediaName,
      mediaSize: entry.mediaSize ?? blob.size,
      mediaVariant: entry.mediaVariant ?? chatMediaVariant(entry.mediaType || blob.type),
      mediaBucket: entry.mediaBucket,
      mediaKey: entry.mediaPath,
      localBlob: blob,
      localDataUrl: preview
    };
  }

  async #hydrateOutbox(): Promise<void> {
    const conversationId = this.conversationId;
    if (!conversationId || this.#stopped) return;
    try {
      const entries = await this.#persistence.listOutbox(this.profile, conversationId);
      if (this.#stopped || this.conversationId !== conversationId) return;
      this.messages = mergeChatMessages(this.messages, entries.map((entry) => this.#outboxMessage(entry)));
    } catch (error) {
      // Do not claim that anything was restored when site storage is blocked.
      console.warn('[account-chat] outbox restore unavailable', error);
    }
  }

  async #putOutbox(entry: AccountChatOutboxEntry, reportFailure = true): Promise<boolean> {
    try {
      await this.#persistence.putOutbox(entry);
      if (reportFailure) this.outboxStorageError = null;
      return true;
    } catch (error) {
      if (reportFailure) {
        this.outboxStorageError = error instanceof AccountChatStorageError ? error.code : 'storage';
      }
      console.warn('[account-chat] outbox write failed', error);
      return false;
    }
  }

  async #deleteConfirmedOutbox(key: string | undefined): Promise<void> {
    if (!key) return;
    try {
      await this.#persistence.deleteOutbox(key);
    } catch (error) {
      // The server row is authoritative and its stable client id makes a stale
      // local entry harmless: the next replay will lookup, then try cleanup.
      console.warn('[account-chat] confirmed outbox cleanup failed', error);
    }
  }

  #markLocalQueued(localId: string): void {
    if (this.#stopped) return;
    this.messages = this.messages.map((message) =>
      message.id === localId ? { ...message, pending: false, queued: true, failed: false } : message
    );
  }

  async #finishSendFailure(
    message: LocalChatMessage,
    error: unknown,
    entry?: AccountChatOutboxEntry
  ): Promise<SendResult> {
    if (!entry) {
      this.#markLocalFailed(message.id);
      return 'failed';
    }
    const retryable = isRetryableAccountChatError(error);
    const attempts = entry.attempts + 1;
    const updated: AccountChatOutboxEntry = {
      ...entry,
      attempts,
      updatedAt: Date.now(),
      nextAttemptAt: retryable ? accountChatRetryAt(attempts) : 0,
      state: retryable ? 'queued' : 'failed',
      lastError: error && typeof error === 'object'
        ? String((error as { code?: unknown; name?: unknown }).code ?? (error as { name?: unknown }).name ?? 'send_failed').slice(0, 120)
        : 'send_failed'
    };
    // The original entry is already durable. If this metadata update fails it
    // remains replayable with the same client id, so "queued" stays factual.
    await this.#putOutbox(updated, false);
    if (retryable) {
      this.#markLocalQueued(message.id);
      if (typeof navigator !== 'undefined' && navigator.onLine === false) this.offline = true;
      return 'queued';
    }
    this.#markLocalFailed(message.id);
    return 'failed';
  }

  async #deliverOutboxEntry(
    entry: AccountChatOutboxEntry,
    message: LocalChatMessage,
    reconcileFirst: boolean
  ): Promise<SendResult> {
    if (this.#activeSendIds.has(entry.clientId)) return 'queued';
    if (this.#stopped) return 'queued';
    this.#activeSendIds.add(entry.clientId);
    try {
      if (reconcileFirst) {
        const committed = await this.#lookupCommitted(entry.clientId);
        if (committed.state === 'found') {
          const label = entry.kind === 'text'
            ? entry.text ?? ''
            : mediaKind(entry.mediaType ?? entry.mediaBlob?.type ?? '') === 'image'
              ? '📷 Fotografia'
              : mediaKind(entry.mediaType ?? entry.mediaBlob?.type ?? '') === 'audio'
                ? '🎙️ Áudio'
                : mediaKind(entry.mediaType ?? entry.mediaBlob?.type ?? '') === 'video'
                  ? '🎬 Vídeo'
                  : `📎 ${entry.mediaName ?? 'Ficheiro'}`;
          return this.#acceptCommitted(committed.row, label, entry.key);
        }
      }
      if (!this.#stopped) {
        this.messages = this.messages.map((candidate) =>
          candidate.clientId === entry.clientId
            ? { ...candidate, pending: true, queued: false, failed: false }
            : candidate
        );
      }
      return entry.kind === 'text'
        ? this.#sendTextAttempt(message, entry)
        : this.#sendMediaAttempt(message, entry);
    } finally {
      this.#activeSendIds.delete(entry.clientId);
    }
  }

  async #drainOutbox(force = false): Promise<void> {
    if (this.#outboxDrain || this.#stopped || !this.conversationId) return this.#outboxDrain ?? undefined;
    const conversationId = this.conversationId;
    let drain!: Promise<void>;
    drain = (async () => {
      let entries: AccountChatOutboxEntry[];
      try {
        entries = await this.#persistence.listOutbox(this.profile, conversationId);
      } catch (error) {
        console.warn('[account-chat] outbox replay unavailable', error);
        return;
      }
      for (const entry of entries) {
        if (this.#stopped || this.conversationId !== conversationId) return;
        if (entry.state !== 'queued' || (!force && (entry.nextAttemptAt ?? 0) > Date.now())) continue;
        const message = this.messages.find((candidate) => candidate.clientId === entry.clientId)
          ?? this.#outboxMessage(entry);
        if (!this.messages.some((candidate) => candidate.clientId === entry.clientId)) {
          this.messages = mergeChatMessages(this.messages, [message]);
        }
        await this.#deliverOutboxEntry(entry, message, true);
      }
    })().finally(() => {
      if (this.#outboxDrain === drain) this.#outboxDrain = null;
    });
    this.#outboxDrain = drain;
    return drain;
  }

  async #lookupCommitted(clientId: string): Promise<CommitLookup<MessageRow>> {
    const conversationId = this.conversationId;
    if (!conversationId) return { state: 'absent' };
    return lookupCommittedMessage(async () => {
      const { data, error } = await this.#sb
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('sender_id', this.profile)
        .eq('client_id', clientId)
        .maybeSingle();
      return { data: data as MessageRow | null, error };
    });
  }

  #markLocalFailed(localId: string): void {
    if (this.#stopped) return;
    this.messages = this.messages.map((message) =>
      message.id === localId ? { ...message, pending: false, queued: false, failed: true } : message
    );
  }

  async #acceptCommitted(row: MessageRow, pushLabel: string, outboxKey?: string): Promise<SendResult> {
    try {
      await this.#ingest(row);
    } catch (error) {
      // The write is already durable. A transient signed-URL/decoration fetch
      // must not turn that success into a second send on retry.
      console.warn('[account-chat] committed row could not be decorated yet', error);
    }
    await this.#deleteConfirmedOutbox(outboxKey);
    if (!this.#stopped) this.#pushAfterSend(pushLabel, String(row.id));
    return 'sent';
  }

  async #sendTextAttempt(message: LocalChatMessage, outboxEntry?: AccountChatOutboxEntry): Promise<SendResult> {
    const conversationId = this.conversationId;
    const clientId = message.clientId;
    const body = message.text?.trim() ?? '';
    if (!conversationId || !clientId || !body) return 'failed';
    if (this.#stopped) return outboxEntry ? 'queued' : 'failed';
    try {
      const { data, error } = await this.#sb
        .from('chat_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: this.profile,
          client_id: clientId,
          kind: 'text',
          body,
          reply_to_id: message.replyToId ?? null,
          forwarded_from_id: message.forwardedFromId ?? null,
          media_variant: 'attachment'
        })
        .select()
        .single();
      if (error) throw error;
      return this.#acceptCommitted(data as MessageRow, body, outboxEntry?.key);
    } catch (error) {
      // Unique conflicts and response-lost failures are both reconciled using
      // the sender-owned client id before the optimistic row is called failed.
      if (this.#stopped) return outboxEntry ? 'queued' : 'failed';
      const committed = await this.#lookupCommitted(clientId);
      if (committed.state === 'found') return this.#acceptCommitted(committed.row, body, outboxEntry?.key);
      console.warn('[account-chat] text send failed', error, committed.state);
      return this.#finishSendFailure(message, error, outboxEntry);
    }
  }

  async sendTextMessage(
    text: string,
    replyToId?: string,
    options: { forwardedFromId?: string } = {}
  ): Promise<SendResult> {
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
      forwardedFromId: options.forwardedFromId,
      ts: Date.now(),
      pending: true
    };
    this.messages = mergeChatMessages(this.messages, [optimistic]);
    const now = optimistic.ts;
    const entry: AccountChatOutboxEntry = {
      key: accountChatOutboxKey(this.profile, this.conversationId, clientId),
      accountId: this.profile,
      conversationId: this.conversationId,
      clientId,
      targetKey: this.#targetKey(),
      kind: 'text',
      text: body,
      replyToId,
      forwardedFromId: options.forwardedFromId,
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      nextAttemptAt: 0,
      insertAttempted: false,
      state: 'queued'
    };
    const durable = await this.#putOutbox(entry);
    if (durable) return this.#deliverOutboxEntry(entry, optimistic, false);
    return this.#sendTextAttempt(optimistic);
  }

  async sendMediaMessage(
    file: Blob,
    name: string,
    replyToId?: string,
    options: { mediaVariant?: ChatMediaVariant } = {}
  ): Promise<SendResult> {
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
      mediaVariant: chatMediaVariant(file.type, options.mediaVariant),
      localBlob: file,
      localDataUrl: preview,
      conversationId: this.topic,
      replyToId,
      reply: this.#replyPreview(replyToId),
      ts: Date.now(),
      pending: true
    };
    this.messages = mergeChatMessages(this.messages, [optimistic]);
    const now = optimistic.ts;
    const entry: AccountChatOutboxEntry = {
      key: accountChatOutboxKey(this.profile, this.conversationId, clientId),
      accountId: this.profile,
      conversationId: this.conversationId,
      clientId,
      targetKey: this.#targetKey(),
      kind: 'media',
      replyToId,
      mediaBlob: file,
      mediaName: name,
      mediaType: file.type || 'application/octet-stream',
      mediaSize: file.size,
      mediaVariant: chatMediaVariant(file.type, options.mediaVariant),
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      nextAttemptAt: 0,
      insertAttempted: false,
      state: 'queued'
    };
    const durable = await this.#putOutbox(entry);
    if (durable) return this.#deliverOutboxEntry(entry, optimistic, false);
    return this.#sendMediaAttempt(optimistic);
  }

  async #sendMediaAttempt(message: LocalChatMessage, outboxEntry?: AccountChatOutboxEntry): Promise<SendResult> {
    const conversationId = this.conversationId;
    const file = message.localBlob;
    const clientId = message.clientId;
    if (!conversationId || !file || !clientId) return 'failed';
    if (this.#stopped) return outboxEntry ? 'queued' : 'failed';
    const kind = mediaKind(message.mediaType || file.type);
    let durableEntry = outboxEntry;
    let uploadedThisAttempt: { bucket: string; path: string } | null = null;
    let insertAttempted = false;
    try {
      let bucket = message.mediaBucket;
      let path = message.mediaKey;
      let mime = message.mediaType || file.type || 'application/octet-stream';
      let size = message.mediaSize ?? file.size;
      if (!bucket || !path) {
        const uploaded = kind === 'image' ? await shrinkImage(file) : file;
        bucket = this.kind === 'couple' ? 'couple-chat' : 'chat-media';
        const ext = kind === 'image' && uploaded.type === 'image/webp'
          ? 'webp'
          : mediaExtension(message.name ?? 'ficheiro', file.type);
        // Stable path: retrying the same client id can safely reuse the object.
        path = `${conversationId}/${this.profile}/${clientId}.${ext}`;
        mime = uploaded.type || file.type || 'application/octet-stream';
        size = uploaded.size;
        const { error: uploadError } = await this.#sb.storage.from(bucket).upload(path, uploaded, {
          contentType: mime,
          upsert: false
        });
        if (uploadError && !isExistingStorageObject(uploadError)) {
          throw new AccountChatError('upload_failed', uploadError.message, { cause: uploadError });
        }
        uploadedThisAttempt = { bucket, path };
        if (!this.#stopped) {
          this.messages = this.messages.map((candidate) =>
            candidate.id === message.id
              ? { ...candidate, mediaBucket: bucket, mediaKey: path, mediaType: mime, mediaSize: size }
              : candidate
          );
        }
        if (durableEntry) {
          durableEntry = {
            ...durableEntry,
            mediaBucket: bucket,
            mediaPath: path,
            mediaType: mime,
            mediaSize: size,
            updatedAt: Date.now()
          };
          await this.#putOutbox(durableEntry, false);
        }
      }
      if (this.#stopped) return durableEntry ? 'queued' : 'failed';
      insertAttempted = true;
      if (durableEntry) {
        durableEntry = { ...durableEntry, insertAttempted: true, updatedAt: Date.now() };
        await this.#putOutbox(durableEntry, false);
      }
      const { data, error } = await this.#sb
        .from('chat_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: this.profile,
          client_id: clientId,
          kind,
          reply_to_id: message.replyToId ?? null,
          forwarded_from_id: null,
          media_bucket: bucket,
          media_path: path,
          media_mime: mime,
          media_name: message.name,
          media_size: size,
          media_variant: message.mediaVariant ?? chatMediaVariant(mime)
        })
        .select()
        .single();
      if (error) throw error;
      const label = kind === 'image'
        ? '📷 Fotografia'
        : kind === 'audio'
          ? '🎙️ Áudio'
          : kind === 'video'
            ? '🎬 Vídeo'
            : `📎 ${message.name ?? 'Ficheiro'}`;
      return this.#acceptCommitted(data as MessageRow, label, durableEntry?.key);
    } catch (error) {
      if (this.#stopped) {
        if (!durableEntry && uploadedThisAttempt && canRemoveUploadAfterFailure(insertAttempted)) {
          void this.#sb.storage.from(uploadedThisAttempt.bucket).remove([uploadedThisAttempt.path]);
        }
        return durableEntry ? 'queued' : 'failed';
      }
      const committed = insertAttempted ? await this.#lookupCommitted(clientId) : { state: 'absent' as const };
      const label = kind === 'image'
        ? '📷 Fotografia'
        : kind === 'audio'
          ? '🎙️ Áudio'
          : kind === 'video'
            ? '🎬 Vídeo'
            : `📎 ${message.name ?? 'Ficheiro'}`;
      if (committed.state === 'found') return this.#acceptCommitted(committed.row, label, durableEntry?.key);
      console.warn('[account-chat] media send failed', error, committed.state);
      if (!durableEntry && uploadedThisAttempt && canRemoveUploadAfterFailure(insertAttempted)) {
        void this.#sb.storage.from(uploadedThisAttempt.bucket).remove([uploadedThisAttempt.path]);
      }
      if (durableEntry) return this.#finishSendFailure(message, error, durableEntry);
      this.#markLocalFailed(message.id);
      if (error instanceof AccountChatError) throw error;
      return 'failed';
    }
  }

  #replyPreview(replyToId?: string): ChatReplyPreview | undefined {
    if (!replyToId) return undefined;
    const target = this.messages.find((message) => message.id === replyToId)
      ?? this.searchResults.find((message) => message.id === replyToId);
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
    if (!message?.failed || !message.clientId || this.#stopped) return 'failed';
    const conversationId = this.conversationId;
    if (!conversationId) return 'failed';
    const retrying = { ...message, pending: true, queued: false, failed: false };
    this.messages = this.messages.map((candidate) => candidate.id === localId ? retrying : candidate);
    const now = Date.now();
    const entry: AccountChatOutboxEntry | null = retrying.localBlob
      ? {
          key: accountChatOutboxKey(this.profile, conversationId, message.clientId),
          accountId: this.profile,
          conversationId,
          clientId: message.clientId,
          targetKey: this.#targetKey(),
          kind: 'media',
          replyToId: message.replyToId,
          mediaBlob: retrying.localBlob,
          mediaName: retrying.name ?? 'ficheiro',
          mediaType: retrying.mediaType || retrying.localBlob.type || 'application/octet-stream',
          mediaSize: retrying.mediaSize ?? retrying.localBlob.size,
          mediaBucket: retrying.mediaBucket,
          mediaPath: retrying.mediaKey,
          mediaVariant: retrying.mediaVariant,
          createdAt: retrying.ts,
          updatedAt: now,
          attempts: 0,
          nextAttemptAt: 0,
          insertAttempted: false,
          state: 'queued'
        }
      : retrying.text
        ? {
            key: accountChatOutboxKey(this.profile, conversationId, message.clientId),
            accountId: this.profile,
            conversationId,
            clientId: message.clientId,
            targetKey: this.#targetKey(),
            kind: 'text',
            text: retrying.text,
            replyToId: message.replyToId,
            forwardedFromId: message.forwardedFromId,
            createdAt: retrying.ts,
            updatedAt: now,
            attempts: 0,
            nextAttemptAt: 0,
            insertAttempted: false,
            state: 'queued'
          }
        : null;
    if (entry) {
      const durable = await this.#putOutbox(entry);
      if (durable) return this.#deliverOutboxEntry(entry, retrying, true);
      // Persistence is unavailable, but an explicit tap may still succeed
      // immediately. Never label the result queued in this branch.
      const committed = await this.#lookupCommitted(message.clientId);
      if (committed.state === 'found') {
        const label = retrying.text ?? `📎 ${retrying.name ?? 'Ficheiro'}`;
        return this.#acceptCommitted(committed.row, label);
      }
      if (retrying.localBlob) return this.#sendMediaAttempt(retrying);
      if (retrying.text) return this.#sendTextAttempt(retrying);
    }
    this.#markLocalFailed(localId);
    return 'failed';
  }

  /** Remove a manually failed optimistic send without ever deleting media that
   * may belong to a response-lost committed row. A tri-state lookup is the
   * safety gate: unknown connectivity keeps the draft available. */
  async discardFailedMessage(localId: string): Promise<DiscardFailedMessageResult> {
    const conversationId = this.conversationId;
    const message = this.messages.find((candidate) => candidate.id === localId);
    if (
      !conversationId ||
      !message?.failed ||
      !message.clientId ||
      !message.id.startsWith('local-') ||
      this.#stopped
    ) return 'missing';

    let entry: AccountChatOutboxEntry | undefined;
    try {
      entry = (await this.#persistence.listOutbox(this.profile, conversationId))
        .find((candidate) => candidate.clientId === message.clientId);
    } catch (error) {
      console.warn('[account-chat] failed message discard could not read outbox', error);
      return 'blocked';
    }
    // A queued row can be owned by the global pump right now. Only explicit
    // permanent/manual failures are eligible for discard.
    if (entry && entry.state !== 'failed') return 'blocked';

    const committed = await this.#lookupCommitted(message.clientId);
    if (committed.state === 'unknown') return 'blocked';
    if (committed.state === 'found') {
      await this.#ingest(committed.row);
      await this.#deleteConfirmedOutbox(entry?.key);
      return 'reconciled';
    }

    const bucket = entry?.mediaBucket ?? message.mediaBucket;
    const path = entry?.mediaPath ?? message.mediaKey;
    // Delete an uploaded object only when the durable row proves that no insert
    // was ever handed to the network. Otherwise retain a harmless orphan rather
    // than risk breaking a late/response-lost committed message.
    if (bucket && path && !path.startsWith('http') && entry?.insertAttempted === false) {
      const { error } = await this.#sb.storage.from(bucket).remove([path]);
      if (error && !isMissingStorageObject(error)) return 'blocked';
    }

    if (entry) {
      try {
        await this.#persistence.deleteOutbox(entry.key);
      } catch (error) {
        console.warn('[account-chat] failed message discard could not clear outbox', error);
        return 'blocked';
      }
    }
    this.#releaseObjectUrl(message.localDataUrl);
    this.messages = this.messages.filter((candidate) => candidate.id !== localId);
    this.searchResults = this.searchResults.filter((candidate) => candidate.id !== localId);
    this.mediaItems = this.mediaItems.filter((candidate) => candidate.id !== localId);
    return 'discarded';
  }

  async editMessage(messageId: string, body: string): Promise<void> {
    const text = body.trim();
    if (!UUID_RE.test(messageId) || !text) return;
    const existing = this.messages.find((message) => message.id === messageId)
      ?? this.searchResults.find((message) => message.id === messageId);
    if (!existing || !canEditChatMessage(existing, this.profile)) throw new AccountChatError('edit_expired');
    const { data, error } = await this.#sb.rpc('edit_chat_message', { p_message: messageId, p_body: text });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as MessageRow | null;
    if (row?.id) await this.#ingest(row);
    else {
      const updated = { ...existing, text, editedAt: Date.now() };
      this.messages = reconcileMessageReferences(this.messages.map((message) =>
        message.id === messageId ? { ...message, text, editedAt: Date.now() } : message
      ), updated);
      this.searchResults = reconcileMessageReferences(
        this.searchResults.map((message) =>
          message.id === messageId ? { ...message, text, editedAt: Date.now() } : message
        ),
        updated
      );
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (!UUID_RE.test(messageId)) return;
    const existing = this.messages.find((message) => message.id === messageId)
      ?? this.searchResults.find((message) => message.id === messageId);
    const ownedMedia =
      existing?.mediaBucket && existing.mediaKey && !existing.mediaKey.startsWith('http')
        ? { bucket: existing.mediaBucket, path: existing.mediaKey }
        : null;
    this.#releaseObjectUrl(existing?.localDataUrl);
    const { data, error } = await this.#sb.rpc('delete_chat_message', { p_message: messageId });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as MessageRow | null;
    if (row?.id) await this.#ingest(row);
    else {
      const deleted = existing
        ? {
            ...existing,
            text: undefined,
            mediaBucket: undefined,
            mediaKey: undefined,
            mediaType: undefined,
            name: undefined,
            mediaSize: undefined,
            localDataUrl: undefined,
            signedUrl: undefined,
            starred: false,
            reactions: [],
            deleted: true
          }
        : null;
      if (deleted) {
        this.messages = reconcileMessageReferences(
          this.messages.map((message) => message.id === messageId ? deleted : message),
          deleted
        );
        this.searchResults = reconcileMessageReferences(
          this.searchResults.map((message) => message.id === messageId ? deleted : message),
          deleted
        );
      }
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
    const message = this.messages.find((candidate) => candidate.id === messageId)
      ?? this.searchResults.find((candidate) => candidate.id === messageId);
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
    const message = this.messages.find((candidate) => candidate.id === messageId)
      ?? this.searchResults.find((candidate) => candidate.id === messageId);
    const query = message?.starred
      ? this.#sb.from('chat_stars').delete().eq('message_id', messageId).eq('account_id', this.profile)
      : this.#sb.from('chat_stars').insert({ message_id: messageId, account_id: this.profile });
    const { error } = await query;
    if (error) throw error;
    this.messages = this.messages.map((candidate) =>
      candidate.id === messageId ? { ...candidate, starred: !candidate.starred } : candidate
    );
    this.searchResults = this.searchResults.map((candidate) =>
      candidate.id === messageId ? { ...candidate, starred: !candidate.starred } : candidate
    );
    this.mediaItems = this.mediaItems.map((candidate) =>
      candidate.id === messageId ? { ...candidate, starred: !candidate.starred } : candidate
    );
  }

  async setReminder(messageId: string, remindAt: number): Promise<void> {
    if (!UUID_RE.test(messageId) || !Number.isFinite(remindAt)) return;
    const { error } = await this.#sb.rpc('set_chat_reminder', {
      p_message: messageId,
      p_remind_at: new Date(remindAt).toISOString()
    });
    if (error) throw error;
    const apply = (message: LocalChatMessage) =>
      message.id === messageId ? { ...message, reminderAt: remindAt } : message;
    this.messages = this.messages.map(apply);
    this.searchResults = this.searchResults.map(apply);
    this.mediaItems = this.mediaItems.map(apply);
  }

  async cancelReminder(messageId: string): Promise<void> {
    if (!UUID_RE.test(messageId)) return;
    const { error } = await this.#sb.rpc('cancel_chat_reminder', { p_message: messageId });
    if (error) throw error;
    const apply = (message: LocalChatMessage) =>
      message.id === messageId ? { ...message, reminderAt: undefined } : message;
    this.messages = this.messages.map(apply);
    this.searchResults = this.searchResults.map(apply);
    this.mediaItems = this.mediaItems.map(apply);
  }

  async setDisappearingSeconds(seconds: number): Promise<void> {
    const conversationId = this.conversationId;
    if (!conversationId || ![0, 86400, 604800, 7776000].includes(seconds)) return;
    const { data, error } = await this.#sb.rpc('set_chat_disappearing', {
      p_conversation: conversationId,
      p_seconds: seconds
    });
    if (error) throw error;
    const value = Number(Array.isArray(data) ? data[0] : data);
    this.disappearingSeconds = Number.isFinite(value) ? value : seconds;
    this.disappearingUpdatedAt = Date.now();
    this.disappearingUpdatedBy = this.profile;
    void this.#channel?.send({
      type: 'broadcast',
      event: 'settings',
      payload: { disappearingSeconds: this.disappearingSeconds }
    });
  }

  async markReadUpTo(ts: number): Promise<void> {
    if (!this.conversationId || !ts) return;
    const readAt = exactReadTimestamp(
      this.messages.filter((message) => message.from === this.other),
      ts
    );
    if (this.ownLastReadAt ? readAt <= this.ownLastReadAt : ts <= this.ownLastRead) return;
    const previous = this.ownLastRead;
    const previousExact = this.ownLastReadAt;
    const previousDelivered = this.ownLastDelivered;
    const previousDeliveredExact = this.ownLastDeliveredAt;
    this.ownLastRead = ts;
    this.ownLastReadAt = readAt;
    if (!this.ownLastDeliveredAt || readAt > this.ownLastDeliveredAt) {
      this.ownLastDelivered = ts;
      this.ownLastDeliveredAt = readAt;
    }
    const { error } = await this.#sb.rpc('mark_chat_read', {
      p_conversation: this.conversationId,
      p_read_at: readAt
    });
    if (error) {
      if (this.ownLastReadAt === readAt) {
        this.ownLastRead = previous;
        this.ownLastReadAt = previousExact;
      }
      if (this.ownLastDeliveredAt === readAt) {
        this.ownLastDelivered = previousDelivered;
        this.ownLastDeliveredAt = previousDeliveredExact;
      }
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
        if (this.#stopped) return;
        if (!shouldPushMessage(`chat:${this.conversationId}`)) return;
        const me = accountState.account;
        if (!me || me.id !== this.profile) return;
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
