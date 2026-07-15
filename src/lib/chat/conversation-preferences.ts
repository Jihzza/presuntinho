export type ConversationMuteMode = 'eight_hours' | 'forever' | 'off';

export interface ConversationPreferenceState {
  conversationId: string;
  lastMessageAt: number;
  pinnedAt: number;
  mutedUntil: number;
  archivedAt: number;
}

export interface ConversationPreferencePatch {
  pinnedAt?: number;
  mutedUntil?: number;
  archivedAt?: number;
}

export const EIGHT_HOURS_MS = 8 * 60 * 60 * 1_000;
export const FOREVER_MUTE_AT = Date.UTC(9999, 11, 31, 23, 59, 59, 999);
export const CHAT_PREFERENCES_CHANGED_EVENT = 'presuntinho:chat-preferences-changed';

export interface ChatPreferencesChangedDetail {
  conversationId: string;
  mutedUntil: number;
}

/** Durable mute timestamp. `0` is the client representation of SQL NULL. */
export function mutedUntilFor(mode: ConversationMuteMode, now = Date.now()): number {
  if (mode === 'off') return 0;
  if (mode === 'forever') return FOREVER_MUTE_AT;
  return now + EIGHT_HOURS_MS;
}

export function isConversationMuted(mutedUntil: number, now = Date.now()): boolean {
  return Number.isFinite(mutedUntil) && mutedUntil > now;
}

export function isConversationMutedForever(mutedUntil: number): boolean {
  // Treat any date at least a century away as "always" so old clients that
  // used a different far-future sentinel still render the right label.
  return mutedUntil >= Date.now() + 100 * 365.25 * 24 * 60 * 60 * 1_000;
}

export function parseChatPreferencesChangedDetail(value: unknown): ChatPreferencesChangedDetail | null {
  if (!value || typeof value !== 'object') return null;
  const detail = value as Record<string, unknown>;
  if (
    typeof detail.conversationId !== 'string' ||
    !detail.conversationId.trim() ||
    typeof detail.mutedUntil !== 'number' ||
    !Number.isFinite(detail.mutedUntil) ||
    detail.mutedUntil < 0 ||
    detail.mutedUntil > FOREVER_MUTE_AT
  ) return null;
  return { conversationId: detail.conversationId, mutedUntil: detail.mutedUntil };
}

/** Merge a fresh local mute/unmute into a possibly unavailable RPC snapshot.
 * A local mute is authoritative immediately; a local unmute with no snapshot
 * preserves fail-open semantics. */
export function overrideMutedConversations(
  current: ReadonlySet<string> | null,
  detail: ChatPreferencesChangedDetail,
  now = Date.now()
): Set<string> | null {
  if (current === null && detail.mutedUntil <= now) return null;
  const next = new Set(current ?? []);
  if (detail.mutedUntil > now) next.add(detail.conversationId);
  else next.delete(detail.conversationId);
  return next;
}

export function announceChatPreferencesChanged(detail: ChatPreferencesChangedDetail): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHAT_PREFERENCES_CHANGED_EVENT, { detail }));
}

/** WhatsApp-style ordering: pinned first, then newest activity, then stable id. */
export function compareConversationPreference(
  a: ConversationPreferenceState,
  b: ConversationPreferenceState
): number {
  const aPinned = a.pinnedAt > 0;
  const bPinned = b.pinnedAt > 0;
  if (aPinned !== bPinned) return aPinned ? -1 : 1;
  if (aPinned && a.pinnedAt !== b.pinnedAt) return b.pinnedAt - a.pinnedAt;
  if (a.lastMessageAt !== b.lastMessageAt) return b.lastMessageAt - a.lastMessageAt;
  return a.conversationId.localeCompare(b.conversationId);
}

export function withConversationPreference<T extends ConversationPreferenceState>(
  item: T,
  patch: ConversationPreferencePatch
): T {
  return { ...item, ...patch };
}
