// Agent DB helpers — persist multi-conversation chat history to Dexie.
//
// V9: chat is split into conversations (chat_conversations table).
// Every message row carries a `conversationId`; per-conversation
// chronological reads use the `[conversationId+createdAt]` compound
// index added in the v9 schema. The v9 upgrade (src/lib/state/db.ts)
// migrated pre-V9 messages into one default conversation whose
// `hermesSessionId` is '' — the sentinel for the legacy per-profile
// Hermes session (`presuntinho-<profile>`).

import Dexie from 'dexie';
import { db } from '../state/db';
import type { ChatMessageRow, ChatConversationRow } from '../state/db';
import type { ProfileId } from '../auth/hash';

const ACTIVE_CONV_KEY_PREFIX = 'presuntinho-agente-conv';

function activeConvKey(profile: ProfileId): string {
  return `${ACTIVE_CONV_KEY_PREFIX}-${profile}`;
}

/** How many characters of the last message the conversation list previews. */
const PREVIEW_LEN = 80;

/**
 * Fresh, collision-free Hermes session id for a brand-new conversation.
 * Base36 timestamp + a short random suffix so two conversations created
 * in the same millisecond (or on two devices) still never collide.
 */
function freshHermesSessionId(profile: ProfileId): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `presuntinho-${profile}-c${Date.now().toString(36)}${rand}`;
}

/** All conversations, most recently touched first. */
export async function listConversations(): Promise<ChatConversationRow[]> {
  return db().chat_conversations.orderBy('updatedAt').reverse().toArray();
}

export async function getConversation(id: number): Promise<ChatConversationRow | undefined> {
  return db().chat_conversations.get(id);
}

/**
 * Create a conversation. The Hermes session id is generated HERE, at
 * creation time, so it is unique for the lifetime of the row and never
 * collides with the legacy sentinel ('').
 */
export async function createConversation(profile: ProfileId, title: string): Promise<number> {
  const now = Date.now();
  const row: ChatConversationRow = {
    title,
    createdAt: now,
    updatedAt: now,
    lastPreview: '',
    hermesSessionId: freshHermesSessionId(profile)
  };
  return (await db().chat_conversations.add(row)) as number;
}

export async function renameConversation(id: number, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;
  await db().chat_conversations.update(id, { title: trimmed });
}

/**
 * Delete a conversation AND all its messages atomically.
 * (Best-effort server-side Hermes session deletion is the caller's job —
 * it needs the network and must never block the local delete.)
 */
export async function deleteConversation(id: number): Promise<void> {
  const d = db();
  await d.transaction('rw', d.chat_messages, d.chat_conversations, async () => {
    await d.chat_messages.where('conversationId').equals(id).delete();
    await d.chat_conversations.delete(id);
  });
}

/**
 * Clear one conversation's messages but keep the conversation row
 * (same semantics the old "clear history" had, scoped per-conversation).
 */
export async function clearConversation(id: number): Promise<void> {
  const d = db();
  await d.transaction('rw', d.chat_messages, d.chat_conversations, async () => {
    await d.chat_messages.where('conversationId').equals(id).delete();
    await d.chat_conversations.update(id, { lastPreview: '', updatedAt: Date.now() });
  });
}

/** Messages of one conversation, chronological, capped to the last `limit`. */
export async function listChatMessages(conversationId: number, limit = 200): Promise<ChatMessageRow[]> {
  const rows = await db()
    .chat_messages.where('[conversationId+createdAt]')
    .between([conversationId, Dexie.minKey], [conversationId, Dexie.maxKey], true, true)
    .reverse()
    .limit(limit)
    .toArray();
  return rows.reverse();
}

/**
 * Append a message to a conversation and bump the conversation's
 * `updatedAt` + `lastPreview` so the drawer list stays fresh.
 */
export async function appendChatMessage(
  conversationId: number,
  role: ChatMessageRow['role'],
  content: string,
  attachment?: ChatMessageRow['attachment']
): Promise<number> {
  const now = Date.now();
  const row: ChatMessageRow = {
    role,
    content,
    attachment,
    createdAt: now,
    conversationId
  };
  const d = db();
  return d.transaction('rw', d.chat_messages, d.chat_conversations, async () => {
    const id = (await d.chat_messages.add(row)) as number;
    await d.chat_conversations.update(conversationId, {
      updatedAt: now,
      lastPreview: content.slice(0, PREVIEW_LEN)
    });
    return id;
  });
}

/** Persist which conversation is active for this profile (per device). */
export function setActiveConversationId(profile: ProfileId, id: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(activeConvKey(profile), String(id));
  } catch {
    /* storage full / private mode — non-fatal */
  }
}

/**
 * Resolve the active conversation:
 *   1. the id remembered in localStorage, if that row still exists;
 *   2. else the most recently updated conversation;
 *   3. else a brand-new one titled `defaultTitle`.
 * Always re-persists the winning id.
 */
export async function getOrCreateActiveConversation(
  profile: ProfileId,
  defaultTitle = 'Conversa'
): Promise<ChatConversationRow> {
  let remembered: number | null = null;
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(activeConvKey(profile));
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) remembered = n;
    }
  }
  if (remembered !== null) {
    const row = await db().chat_conversations.get(remembered);
    if (row) return row;
  }
  const mostRecent = await db().chat_conversations.orderBy('updatedAt').last();
  if (mostRecent?.id !== undefined) {
    setActiveConversationId(profile, mostRecent.id);
    return mostRecent;
  }
  const id = await createConversation(profile, defaultTitle);
  setActiveConversationId(profile, id);
  return (await db().chat_conversations.get(id)) as ChatConversationRow;
}

/** One gallery entry: an attached message + its conversation caption. */
export interface AttachmentEntry {
  message: ChatMessageRow;
  conversationId: number | null;
  conversationTitle: string;
}

/**
 * Every message that carries an attachment, newest first, joined with
 * its conversation title for gallery captions.
 */
export async function listAllAttachments(): Promise<AttachmentEntry[]> {
  const [msgs, convs] = await Promise.all([
    db().chat_messages.orderBy('createdAt').reverse().filter((m) => !!m.attachment).toArray(),
    db().chat_conversations.toArray()
  ]);
  const titles = new Map<number, string>();
  for (const c of convs) if (c.id !== undefined) titles.set(c.id, c.title);
  return msgs.map((m) => ({
    message: m,
    conversationId: m.conversationId ?? null,
    conversationTitle: m.conversationId !== undefined ? (titles.get(m.conversationId) ?? '') : ''
  }));
}

/** Every message, newest first — used by the gallery's link extractor. */
export async function listAllMessages(): Promise<ChatMessageRow[]> {
  return db().chat_messages.orderBy('createdAt').reverse().toArray();
}
