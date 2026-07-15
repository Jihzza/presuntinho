import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '$lib/multiplayer/client';
import type { LocalChatMessage } from './store.svelte';
import {
  accountChatOutboxKey,
  getAccountChatPersistence,
  type AccountChatOutboxEntry,
  type AccountChatPersistence
} from './account-chat-outbox';
import {
  createSupabaseAccountChatOutboxGateway,
  runAccountChatOutboxPass
} from './account-chat-outbox-pump';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ChatForwardResult = 'sent' | 'queued' | 'failed' | 'unsupported';

export function canForwardAccountChatMessage(message: LocalChatMessage): boolean {
  if (!UUID_RE.test(message.id) || message.deleted || message.pending || message.queued || message.failed) return false;
  if (message.kind === 'call' || message.kind === 'system') return false;
  if (message.text) return true;
  return Boolean(message.mediaType && (message.localBlob || message.localDataUrl || message.signedUrl));
}

export function forwardedMessagePreview(message: LocalChatMessage): string {
  if (message.text) return message.text.slice(0, 160);
  if (message.mediaVariant === 'sticker') return 'Sticker';
  if (message.mediaVariant === 'gif' || message.mediaType === 'image/gif') return 'GIF';
  if (message.mediaType?.startsWith('image/')) return 'Imagem';
  if (message.mediaType?.startsWith('audio/')) return 'Áudio';
  if (message.mediaType?.startsWith('video/')) return 'Vídeo';
  return message.name || 'Ficheiro';
}

async function committedMessageId(
  client: SupabaseClient,
  entry: AccountChatOutboxEntry
): Promise<string | null> {
  const { data } = await client
    .from('chat_messages')
    .select('id')
    .eq('conversation_id', entry.conversationId)
    .eq('sender_id', entry.accountId)
    .eq('client_id', entry.clientId)
    .maybeSingle();
  return data && typeof data.id === 'string' ? data.id : null;
}

/** A confirmed forward owns one client id. The app-level pump remains
 * account-wide, but this action must not report another pending message's
 * success as the result of the forward the user just confirmed. */
function scopedForwardPersistence(
  persistence: AccountChatPersistence,
  conversationId: string,
  clientId: string
): AccountChatPersistence {
  return {
    putOutbox: (entry) => persistence.putOutbox(entry),
    listOutbox: async (accountId) => (await persistence.listOutbox(accountId, conversationId))
      .filter((entry) => entry.clientId === clientId),
    deleteOutbox: (key) => persistence.deleteOutbox(key),
    putVoiceDraft: (draft) => persistence.putVoiceDraft(draft),
    getVoiceDraft: (accountId, targetConversationId) =>
      persistence.getVoiceDraft(accountId, targetConversationId),
    deleteVoiceDraft: (accountId, targetConversationId) =>
      persistence.deleteVoiceDraft(accountId, targetConversationId),
    purgeAccount: (accountId) => persistence.purgeAccount(accountId),
    purgeAccountsExcept: (accountId) => persistence.purgeAccountsExcept(accountId),
    purgeAll: () => persistence.purgeAll()
  };
}

/**
 * Queue one confirmed forward into the target conversation.
 *
 * Text provenance is server-checked: `forwarded_from_id` is accepted only when
 * the body exactly matches the source row. Media is downloaded/re-uploaded as
 * an independent attachment and intentionally carries no provenance badge,
 * because Postgres cannot attest bytes held by the Storage service.
 */
export async function forwardAccountChatMessage(input: {
  accountId: string;
  targetConversationId: string;
  targetAccountId?: string;
  senderLabel?: string;
  message: LocalChatMessage;
  mediaBlob?: Blob;
  persistence?: AccountChatPersistence;
  client?: SupabaseClient;
  clientId?: string;
  now?: number;
}): Promise<ChatForwardResult> {
  if (
    !UUID_RE.test(input.accountId) ||
    !UUID_RE.test(input.targetConversationId) ||
    !canForwardAccountChatMessage(input.message)
  ) return 'unsupported';

  const client = input.client ?? getSupabaseClient();
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user.id !== input.accountId) return 'failed';

  const clientId = input.clientId ?? crypto.randomUUID();
  if (!UUID_RE.test(clientId)) return 'failed';
  const now = input.now ?? Date.now();
  // Preserve the source body byte-for-byte: the database accepts a provenance
  // badge only when this value is exactly equal to the visible source row.
  const text = input.message.text;
  const blob = input.mediaBlob;
  if ((!text || !text.trim()) && (!blob || blob.size <= 0)) return 'unsupported';

  const entry: AccountChatOutboxEntry = text
    ? {
        key: accountChatOutboxKey(input.accountId, input.targetConversationId, clientId),
        accountId: input.accountId,
        conversationId: input.targetConversationId,
        clientId,
        targetKey: `forward|${input.targetConversationId}`,
        kind: 'text',
        text,
        forwardedFromId: input.message.id,
        createdAt: now,
        updatedAt: now,
        attempts: 0,
        nextAttemptAt: 0,
        insertAttempted: false,
        state: 'queued'
      }
    : {
        key: accountChatOutboxKey(input.accountId, input.targetConversationId, clientId),
        accountId: input.accountId,
        conversationId: input.targetConversationId,
        clientId,
        targetKey: `forward|${input.targetConversationId}`,
        kind: 'media',
        mediaBlob: blob,
        mediaName: input.message.name || (input.message.mediaVariant === 'sticker' ? 'sticker.png' : 'ficheiro'),
        mediaType: blob?.type || input.message.mediaType || 'application/octet-stream',
        mediaSize: blob?.size,
        mediaVariant: input.message.mediaVariant,
        createdAt: now,
        updatedAt: now,
        attempts: 0,
        nextAttemptAt: 0,
        insertAttempted: false,
        state: 'queued'
      };

  const persistence = input.persistence ?? getAccountChatPersistence();
  try {
    await persistence.putOutbox(entry);
  } catch {
    return 'failed';
  }

  const pass = await runAccountChatOutboxPass({
    accountId: input.accountId,
    persistence: scopedForwardPersistence(persistence, input.targetConversationId, clientId),
    gateway: createSupabaseAccountChatOutboxGateway(client),
    force: true,
    now
  }).catch(() => null);
  if (pass?.sent) {
    // The source insert atomically created the durable push outbox. Returning
    // sent here means only the chat row is committed, never that a device saw
    // a notification.
    const eventId = await committedMessageId(client, entry);
    if (eventId && input.targetAccountId && UUID_RE.test(input.targetAccountId)) {
      void import('$lib/push').then(({ sendPushNotify, shouldPushMessage }) => {
        if (!shouldPushMessage(`chat:${input.targetConversationId}`)) return;
        return sendPushNotify('message', {
          to: input.targetAccountId as string,
          title: `💬 ${input.senderLabel?.trim() || 'Presuntinho'}`,
          body: forwardedMessagePreview(input.message).slice(0, 120),
          url: `/mensagens/?conversation=${encodeURIComponent(input.targetConversationId)}`,
          eventId
        });
      }).catch(() => undefined);
    }
    return 'sent';
  }

  const retained = await persistence.listOutbox(input.accountId, input.targetConversationId)
    .then((rows) => rows.find((row) => row.clientId === clientId))
    .catch(() => undefined);
  return retained?.state === 'queued' ? 'queued' : 'failed';
}
