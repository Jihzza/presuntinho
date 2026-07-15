/**
 * Account-wide durable chat sender.
 *
 * The conversation store still gives instant optimistic feedback, but delivery
 * must not depend on that exact thread remaining mounted. This pump drains every
 * queued conversation owned by the authenticated account from the app layout.
 * Stable client ids and Storage paths make concurrent tabs idempotent.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '$lib/multiplayer/client';
import { mediaExtension } from './account-chat-model';
import {
  getAccountChatPersistence,
  type AccountChatOutboxEntry,
  type AccountChatPersistence
} from './account-chat-outbox';
import {
  accountChatRetryAt,
  isExistingStorageObject,
  isRetryableAccountChatError
} from './account-chat-retry';

const PUMP_INTERVAL_MS = 15_000;
const activePumpStops = new Map<string, Set<() => void>>();

export interface AccountChatOutboxGateway {
  lookup(entry: AccountChatOutboxEntry): Promise<'found' | 'absent' | { error: unknown }>;
  conversationKind(conversationId: string): Promise<'couple' | 'direct'>;
  upload(input: {
    bucket: string;
    path: string;
    blob: Blob;
    contentType: string;
  }): Promise<void>;
  insert(entry: AccountChatOutboxEntry): Promise<void>;
}

export interface AccountChatOutboxPassResult {
  inspected: number;
  sent: number;
  queued: number;
  failed: number;
}

function failureLabel(error: unknown): string {
  if (!error || typeof error !== 'object') return 'send_failed';
  const record = error as { code?: unknown; name?: unknown };
  return String(record.code ?? record.name ?? 'send_failed').slice(0, 120);
}

async function retainFailure(
  persistence: AccountChatPersistence,
  entry: AccountChatOutboxEntry,
  error: unknown,
  now: number
): Promise<'queued' | 'failed'> {
  const retryable = isRetryableAccountChatError(error);
  const attempts = entry.attempts + 1;
  await persistence.putOutbox({
    ...entry,
    attempts,
    updatedAt: now,
    nextAttemptAt: retryable ? accountChatRetryAt(attempts, now) : 0,
    state: retryable ? 'queued' : 'failed',
    lastError: failureLabel(error)
  });
  return retryable ? 'queued' : 'failed';
}

/** One deterministic pass, separated from browser events for focused tests. */
export async function runAccountChatOutboxPass(input: {
  accountId: string;
  persistence: AccountChatPersistence;
  gateway: AccountChatOutboxGateway;
  force?: boolean;
  now?: number;
  stopped?: () => boolean;
}): Promise<AccountChatOutboxPassResult> {
  const now = input.now ?? Date.now();
  const result: AccountChatOutboxPassResult = { inspected: 0, sent: 0, queued: 0, failed: 0 };
  const entries = await input.persistence.listOutbox(input.accountId);
  for (const original of entries) {
    if (input.stopped?.()) break;
    if (original.accountId !== input.accountId || original.state !== 'queued') continue;
    if (!input.force && (original.nextAttemptAt ?? 0) > now) continue;
    result.inspected += 1;
    let entry = original;
    try {
      const before = await input.gateway.lookup(entry);
      if (before === 'found') {
        await input.persistence.deleteOutbox(entry.key);
        result.sent += 1;
        continue;
      }
      if (before !== 'absent') throw before.error;
      if (input.stopped?.()) break;

      if (entry.kind === 'media') {
        const blob = entry.mediaBlob;
        if (!blob) throw new Error('missing_media_blob');
        let bucket = entry.mediaBucket;
        let path = entry.mediaPath;
        const contentType = entry.mediaType || blob.type || 'application/octet-stream';
        if (!bucket || !path) {
          const kind = await input.gateway.conversationKind(entry.conversationId);
          if (input.stopped?.()) break;
          bucket = kind === 'couple' ? 'couple-chat' : 'chat-media';
          const extension = mediaExtension(entry.mediaName ?? 'ficheiro', contentType);
          path = `${entry.conversationId}/${entry.accountId}/${entry.clientId}.${extension}`;
          await input.gateway.upload({ bucket, path, blob, contentType });
          if (input.stopped?.()) break;
          entry = {
            ...entry,
            mediaBucket: bucket,
            mediaPath: path,
            mediaType: contentType,
            mediaSize: blob.size,
            updatedAt: now
          };
          await input.persistence.putOutbox(entry);
        }
      }

      if (input.stopped?.()) break;
      entry = { ...entry, insertAttempted: true, updatedAt: now };
      await input.persistence.putOutbox(entry);
      if (input.stopped?.()) break;
      await input.gateway.insert(entry);
      await input.persistence.deleteOutbox(entry.key);
      result.sent += 1;
    } catch (error) {
      // The request may have committed even when its response was lost. Never
      // mutate retry state until the stable client id has been reconciled.
      let reconciliation: Awaited<ReturnType<AccountChatOutboxGateway['lookup']>>;
      try {
        reconciliation = await input.gateway.lookup(entry);
      } catch (lookupError) {
        reconciliation = { error: lookupError };
      }
      if (reconciliation === 'found') {
        await input.persistence.deleteOutbox(entry.key);
        result.sent += 1;
        continue;
      }
      try {
        const state = await retainFailure(input.persistence, entry, error, now);
        result[state] += 1;
      } catch (storageError) {
        // The original row is still durable and idempotent. A metadata write
        // failure must never delete it or pretend that delivery succeeded.
        console.warn('[account-chat] outbox pump could not retain retry metadata', storageError);
        result.queued += 1;
      }
    }
  }
  return result;
}

export function createSupabaseAccountChatOutboxGateway(
  client: SupabaseClient = getSupabaseClient()
): AccountChatOutboxGateway {
  return {
    async lookup(entry) {
      const { data, error } = await client
        .from('chat_messages')
        .select('id')
        .eq('conversation_id', entry.conversationId)
        .eq('sender_id', entry.accountId)
        .eq('client_id', entry.clientId)
        .maybeSingle();
      if (error) return { error };
      return data ? 'found' : 'absent';
    },

    async conversationKind(conversationId) {
      const { data, error } = await client
        .from('chat_conversations')
        .select('kind')
        .eq('id', conversationId)
        .maybeSingle();
      if (error) throw error;
      if (data?.kind !== 'couple' && data?.kind !== 'direct') throw new Error('invalid_conversation');
      return data.kind;
    },

    async upload({ bucket, path, blob, contentType }) {
      const { error } = await client.storage.from(bucket).upload(path, blob, {
        contentType,
        upsert: false
      });
      if (error && !isExistingStorageObject(error)) throw error;
    },

    async insert(entry) {
      const payload: Record<string, unknown> = entry.kind === 'text'
        ? {
            conversation_id: entry.conversationId,
            sender_id: entry.accountId,
            client_id: entry.clientId,
            kind: 'text',
            body: entry.text,
            reply_to_id: entry.replyToId ?? null
          }
        : {
            conversation_id: entry.conversationId,
            sender_id: entry.accountId,
            client_id: entry.clientId,
            kind: entry.mediaType?.startsWith('image/')
              ? 'image'
              : entry.mediaType?.startsWith('audio/')
                ? 'audio'
                : entry.mediaType?.startsWith('video/')
                  ? 'video'
                  : 'file',
            reply_to_id: entry.replyToId ?? null,
            media_bucket: entry.mediaBucket,
            media_path: entry.mediaPath,
            media_mime: entry.mediaType,
            media_name: entry.mediaName,
            media_size: entry.mediaSize ?? entry.mediaBlob?.size
          };
      const { error } = await client.from('chat_messages').insert(payload as never);
      if (error) throw error;
    }
  };
}

/** Start the browser runtime; caller owns the returned cleanup function. */
export function startAccountChatOutboxPump(
  accountId: string,
  options: {
    persistence?: AccountChatPersistence;
    client?: SupabaseClient;
    intervalMs?: number;
  } = {}
): () => void {
  const persistence = options.persistence ?? getAccountChatPersistence();
  const client = options.client ?? getSupabaseClient();
  const gateway = createSupabaseAccountChatOutboxGateway(client);
  let stopped = false;
  let running: Promise<void> | null = null;

  const trigger = (force = false): void => {
    if (stopped || running) return;
    const pass = (async () => {
      // `getSession` reads the locally restored Supabase session. Do not turn
      // an app-shell/local-profile race into permanent 401 failures.
      const { data } = await client.auth.getSession();
      if (data.session?.user.id !== accountId || stopped) return;
      await runAccountChatOutboxPass({
        accountId,
        persistence,
        gateway,
        force,
        stopped: () => stopped
      });
    })()
      .catch((error) => console.warn('[account-chat] global outbox pass unavailable', error))
      .finally(() => {
        if (running === pass) running = null;
      });
    running = pass;
  };

  const onOnline = () => trigger(true);
  const onVisible = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') trigger(true);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
  }
  const interval = setInterval(() => trigger(false), options.intervalMs ?? PUMP_INTERVAL_MS);
  const auth = client.auth.onAuthStateChange((_event, session) => {
    // Leave the auth callback before consulting getSession again; Supabase
    // serialises parts of this callback and nested auth calls can otherwise
    // wait on the callback that initiated them.
    if (session?.user.id === accountId) setTimeout(() => trigger(true), 0);
  });
  trigger(true);

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    auth.data.subscription.unsubscribe();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    }
    const stops = activePumpStops.get(accountId);
    stops?.delete(cleanup);
    if (stops?.size === 0) activePumpStops.delete(accountId);
  };
  const stops = activePumpStops.get(accountId) ?? new Set<() => void>();
  stops.add(cleanup);
  activePumpStops.set(accountId, stops);
  return cleanup;
}

export function stopAccountChatOutboxPumps(accountId?: string): void {
  const groups = accountId
    ? [[accountId, activePumpStops.get(accountId)] as const]
    : [...activePumpStops.entries()];
  for (const [, stops] of groups) {
    for (const stop of [...(stops ?? [])]) stop();
  }
}

/** Ordered shared-device logout: stop network work before deleting its Blobs. */
export async function stopAndPurgeAccountChatOutbox(accountId: string): Promise<void> {
  stopAccountChatOutboxPumps(accountId);
  await getAccountChatPersistence().purgeAccount(accountId);
}
