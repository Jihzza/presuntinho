const DRAFT_STORAGE_PREFIX = 'presuntinho-chat-drafts-v1';
const MAX_DRAFT_LENGTH = 4_000;
const MAX_SCOPE_LENGTH = 160;
const MAX_CONVERSATION_KEY_LENGTH = 320;
const MAX_DRAFTS_PER_ACCOUNT = 100;

export interface ChatDraft {
  conversationKey: string;
  text: string;
  updatedAt: number;
}

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function validIdentifier(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

export function chatDraftStorageKey(accountId: string): string | null {
  if (!validIdentifier(accountId, MAX_SCOPE_LENGTH)) return null;
  return `${DRAFT_STORAGE_PREFIX}:${encodeURIComponent(accountId)}`;
}

/** Parse only the small, versioned shape written by this module. Corrupt or
 * hand-edited localStorage never reaches the composer. */
export function parseChatDrafts(raw: string | null): ChatDraft[] {
  if (!raw) return [];
  try {
    const payload = JSON.parse(raw) as { version?: unknown; drafts?: unknown };
    if (payload?.version !== 1 || !Array.isArray(payload.drafts)) return [];
    const byConversation = new Map<string, ChatDraft>();
    for (const candidate of payload.drafts.slice(0, MAX_DRAFTS_PER_ACCOUNT * 2)) {
      if (!candidate || typeof candidate !== 'object') continue;
      const row = candidate as Record<string, unknown>;
      if (!validIdentifier(row.conversationKey, MAX_CONVERSATION_KEY_LENGTH)) continue;
      if (typeof row.text !== 'string' || !row.text.trim()) continue;
      const updatedAt = Number(row.updatedAt);
      if (!Number.isFinite(updatedAt) || updatedAt < 0) continue;
      const draft: ChatDraft = {
        conversationKey: row.conversationKey,
        text: row.text.slice(0, MAX_DRAFT_LENGTH),
        updatedAt
      };
      const previous = byConversation.get(draft.conversationKey);
      if (!previous || previous.updatedAt <= draft.updatedAt) byConversation.set(draft.conversationKey, draft);
    }
    return [...byConversation.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt || a.conversationKey.localeCompare(b.conversationKey))
      .slice(0, MAX_DRAFTS_PER_ACCOUNT);
  } catch {
    return [];
  }
}

export function readChatDrafts(storage: DraftStorage | null | undefined, accountId: string): ChatDraft[] {
  const key = chatDraftStorageKey(accountId);
  if (!storage || !key) return [];
  try {
    return parseChatDrafts(storage.getItem(key));
  } catch {
    return [];
  }
}

/** Pure update used by the Svelte surface and tests. Whitespace-only input
 * removes the draft while preserving the user's exact spacing otherwise. */
export function withChatDraft(
  drafts: ChatDraft[],
  conversationKey: string,
  text: string,
  updatedAt = Date.now()
): ChatDraft[] {
  if (!validIdentifier(conversationKey, MAX_CONVERSATION_KEY_LENGTH)) return drafts;
  const withoutCurrent = drafts.filter((draft) => draft.conversationKey !== conversationKey);
  if (!text.trim()) return withoutCurrent;
  return [
    { conversationKey, text: text.slice(0, MAX_DRAFT_LENGTH), updatedAt: Math.max(0, updatedAt) },
    ...withoutCurrent
  ]
    .sort((a, b) => b.updatedAt - a.updatedAt || a.conversationKey.localeCompare(b.conversationKey))
    .slice(0, MAX_DRAFTS_PER_ACCOUNT);
}

export function writeChatDrafts(
  storage: DraftStorage | null | undefined,
  accountId: string,
  drafts: ChatDraft[]
): boolean {
  const key = chatDraftStorageKey(accountId);
  if (!storage || !key) return false;
  try {
    if (drafts.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ version: 1, drafts: drafts.slice(0, MAX_DRAFTS_PER_ACCOUNT) }));
    return true;
  } catch {
    return false;
  }
}

export function clearChatDraftsForAccount(
  accountId: string,
  storage: DraftStorage | null | undefined = typeof localStorage === 'undefined' ? null : localStorage
): void {
  const key = chatDraftStorageKey(accountId);
  if (!storage || !key) return;
  try {
    storage.removeItem(key);
  } catch {
    /* Logout must continue even when browser storage is unavailable. */
  }
}

export function chatDraftText(drafts: ChatDraft[], conversationKey: string | null | undefined): string {
  if (!conversationKey) return '';
  return drafts.find((draft) => draft.conversationKey === conversationKey)?.text ?? '';
}

/** Remove only the exact submission that the server has acknowledged. If the
 * user typed newer words while that request was in flight, they stay intact. */
export function withoutConfirmedChatDraft(
  drafts: ChatDraft[],
  conversationKey: string | null | undefined,
  submittedText: string
): ChatDraft[] {
  if (!conversationKey || chatDraftText(drafts, conversationKey) !== submittedText) return drafts;
  return drafts.filter((draft) => draft.conversationKey !== conversationKey);
}

export function chatDraftPreview(text: string, maxLength = 64): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}
