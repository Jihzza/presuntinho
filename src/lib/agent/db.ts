// Agent DB helpers — persist chat history to Dexie.

import { db } from '../state/db';
import type { ChatMessageRow } from '../state/db';

export async function listChatMessages(limit = 200): Promise<ChatMessageRow[]> {
  const rows = await db().chat_messages.orderBy('createdAt').reverse().limit(limit).toArray();
  return rows.reverse();
}

export async function appendChatMessage(
  role: ChatMessageRow['role'],
  content: string,
  attachment?: ChatMessageRow['attachment']
): Promise<number> {
  const row: ChatMessageRow = {
    role,
    content,
    attachment,
    createdAt: Date.now()
  };
  return (await db().chat_messages.add(row)) as number;
}

export async function clearChatHistory(): Promise<void> {
  await db().chat_messages.clear();
}