export type AccountConversationKind = 'couple' | 'direct';

export type RichMessageKind = 'text' | 'image' | 'audio' | 'video' | 'file' | 'call' | 'system';

export type ChatCallKind = 'audio' | 'video';
export type ChatCallStatus = 'ringing' | 'accepted' | 'declined' | 'cancelled' | 'ended' | 'missed' | 'failed';

export interface ChatCallMeta {
  callId: string;
  kind: ChatCallKind;
  status: ChatCallStatus;
  caller: string;
  callee: string;
  answeredAt?: string;
  endedAt?: string;
}

export type ChatCallDirection = 'outgoing' | 'incoming';

export function chatCallDirection(
  call: Pick<ChatCallMeta, 'caller' | 'callee'>,
  accountId: string
): ChatCallDirection | null {
  if (call.caller === accountId) return 'outgoing';
  if (call.callee === accountId) return 'incoming';
  return null;
}

export interface ChatReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface ChatReplyPreview {
  id: string;
  from: string;
  text?: string;
  kind: RichMessageKind;
  deleted?: boolean;
}

export interface MergeableChatMessage {
  id: string;
  clientId?: string;
  /** Exact Postgres timestamp. Keep this alongside `ts`: JavaScript dates
   * discard the microseconds needed for a lossless pagination cursor. */
  createdAt?: string;
  ts: number;
  pending?: boolean;
}

export interface ReplyReconcileMessage extends MergeableChatMessage {
  from: string;
  text?: string;
  kind?: RichMessageKind;
  name?: string;
  deleted?: boolean;
  reply?: ChatReplyPreview;
  starred?: boolean;
  reactions?: ChatReactionSummary[];
}

export interface ChatPageCursor {
  createdAt: string;
  id: string;
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
  'text/plain': 'txt'
};

/** Map a browser MIME type to the durable message kind used by Postgres. */
export function mediaKind(type: string): 'image' | 'audio' | 'video' | 'file' {
  const normalized = type.toLowerCase();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('audio/')) return 'audio';
  if (normalized.startsWith('video/')) return 'video';
  return 'file';
}

/** Decode the private trigger's call-history JSON without ever leaking raw
 * machine payloads into chat bubbles. Unknown/old shapes degrade safely. */
export function parseCallBody(body: string | null | undefined): ChatCallMeta | null {
  if (!body) return null;
  try {
    const value = JSON.parse(body) as Record<string, unknown>;
    const kind = value.kind;
    const status = value.status;
    if (kind !== 'audio' && kind !== 'video') return null;
    if (!['ringing', 'accepted', 'declined', 'cancelled', 'ended', 'missed', 'failed'].includes(String(status))) {
      return null;
    }
    if (typeof value.callId !== 'string' || typeof value.caller !== 'string' || typeof value.callee !== 'string') {
      return null;
    }
    return {
      callId: value.callId,
      kind,
      status: status as ChatCallStatus,
      caller: value.caller,
      callee: value.callee,
      answeredAt: typeof value.answeredAt === 'string' ? value.answeredAt : undefined,
      endedAt: typeof value.endedAt === 'string' ? value.endedAt : undefined
    };
  } catch {
    return null;
  }
}

/** Safe, short extension for Storage object paths. Never trusts path separators. */
export function mediaExtension(name: string, type: string): string {
  const basename = name.split(/[\\/]/).pop() ?? '';
  const dot = basename.lastIndexOf('.');
  const fromName = dot > 0 && dot < basename.length - 1
    ? basename
        .slice(dot + 1)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 10)
    : '';
  if (fromName) return fromName;
  return MIME_EXTENSIONS[type.toLowerCase()] ?? 'bin';
}

/** Deterministic merge for initial pages, realtime rows and optimistic sends.
 * A server row replaces the optimistic row carrying the same client_id. */
export function mergeChatMessages<T extends MergeableChatMessage>(current: T[], incoming: T[]): T[] {
  const combined = [...current, ...incoming];
  // A committed row wins even when the local copy is already `failed` rather
  // than `pending` (for example: the insert committed but its HTTP response
  // was lost). Build this index across both sides of the merge so a later
  // refresh also heals a failed bubble left by an earlier request.
  const canonicalByClient = new Map<string, string>();
  for (const message of combined) {
    if (message.clientId && !message.id.startsWith('local-')) {
      canonicalByClient.set(message.clientId, message.id);
    }
  }
  const byId = new Map<string, T>();
  for (const message of combined) {
    if (
      message.clientId &&
      canonicalByClient.has(message.clientId) &&
      canonicalByClient.get(message.clientId) !== message.id
    ) continue;
    const previous = byId.get(message.id);
    byId.set(message.id, previous ? ({ ...previous, ...message } as T) : message);
  }
  return [...byId.values()].sort(compareChatMessages);
}

/** Reply previews are snapshots for fast rendering, but edits/deletes arriving
 * over Realtime must reconcile every visible quote. Tombstones also clear
 * local decoration state immediately. */
export function reconcileMessageReferences<T extends ReplyReconcileMessage>(
  messages: T[],
  updated: ReplyReconcileMessage
): T[] {
  const preview: ChatReplyPreview = {
    id: updated.id,
    from: updated.from,
    text: updated.deleted ? undefined : updated.text,
    kind: updated.kind ?? 'text',
    deleted: Boolean(updated.deleted)
  };
  return messages.map((message) => {
    let next = message;
    if (message.id === updated.id && updated.deleted) {
      next = { ...next, starred: false, reactions: [] } as T;
    }
    if (message.reply?.id === updated.id) {
      next = { ...next, reply: preview } as T;
    }
    return next;
  });
}

/** Stable timeline ordering that retains Postgres microseconds where present. */
export function compareChatMessages(a: MergeableChatMessage, b: MergeableChatMessage): number {
  if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
    return a.createdAt.localeCompare(b.createdAt);
  }
  return a.ts - b.ts || a.id.localeCompare(b.id);
}

/** PostgREST disjunction for descending `(created_at, id)` keyset paging. */
export function chatPageFilter(cursor: ChatPageCursor): string {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

/** Preserve the newest exact server timestamp covered by a millisecond UI
 * cursor, so read receipts do not get stuck just before `.123456`. */
export function exactReadTimestamp(
  messages: Array<Pick<MergeableChatMessage, 'ts' | 'createdAt'>>,
  throughTs: number
): string {
  let latest: string | undefined;
  for (const message of messages) {
    if (message.ts > throughTs || !message.createdAt) continue;
    if (!latest || message.createdAt > latest) latest = message.createdAt;
  }
  return latest ?? new Date(throughTs).toISOString();
}

export function summarizeReactions(
  rows: Array<{ emoji: string; account_id: string }>,
  me: string
): ChatReactionSummary[] {
  const groups = new Map<string, { count: number; reactedByMe: boolean }>();
  for (const row of rows) {
    const emoji = row.emoji.trim();
    if (!emoji) continue;
    const current = groups.get(emoji) ?? { count: 0, reactedByMe: false };
    current.count += 1;
    if (row.account_id === me) current.reactedByMe = true;
    groups.set(emoji, current);
  }
  return [...groups.entries()]
    .map(([emoji, value]) => ({ emoji, ...value }))
    .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}

export function replyLabel(message: {
  text?: string;
  kind?: RichMessageKind;
  name?: string;
  deleted?: boolean;
}): string {
  if (message.deleted) return '🚫';
  // Call rows store JSON in Postgres; call previews must always stay human.
  if (message.kind === 'call') return '📞';
  const text = message.text?.trim();
  if (text) return text.slice(0, 120);
  if (message.kind === 'image') return '📷';
  if (message.kind === 'audio') return '🎙️';
  if (message.kind === 'video') return '🎬';
  if (message.kind === 'file') return `📎 ${message.name ?? ''}`.trim();
  return '💬';
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes < 1) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
