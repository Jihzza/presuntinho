import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => {
  const insertPayloads: Array<Record<string, unknown>> = [];
  const insertResults: Array<{ data: unknown; error: unknown }> = [];
  const lookupResults: Array<{ data: unknown; error: unknown }> = [];
  const uploads: Array<{ path: string; body: Blob }> = [];
  const removals: string[][] = [];
  const rpcCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const messageRows: unknown[] = [];
  const memberRows: unknown[] = [];
  const searchRows: unknown[] = [];
  const contextRows: unknown[] = [];
  const mediaPages: unknown[][] = [];
  const ensureResults: Array<{ data: unknown; error: unknown }> = [];

  const client = {
    from(table: string) {
      if (table === 'chat_messages') {
        return {
          insert(payload: Record<string, unknown>) {
            insertPayloads.push(payload);
            return {
              select() {
                return { single: async () => insertResults.shift() ?? { data: null, error: new Error('missing insert result') } };
              }
            };
          },
          select() {
            const chain = {
              eq() { return chain; },
              order() { return chain; },
              limit() { return chain; },
              or() { return chain; },
              in() { return chain; },
              then(resolve: (value: { data: unknown[]; error: null }) => void) {
                return Promise.resolve({ data: [...messageRows], error: null }).then(resolve);
              },
              maybeSingle: async () => lookupResults.shift() ?? { data: null, error: null }
            };
            return chain;
          }
        };
      }
      if (table === 'chat_members') {
        const chain = {
          select() { return chain; },
          update() { return chain; },
          eq() { return chain; },
          then(resolve: (value: { data: unknown[]; error: null }) => void) {
            return Promise.resolve({ data: [...memberRows], error: null }).then(resolve);
          }
        };
        return chain;
      }
      if (table === 'chat_conversations') {
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          maybeSingle: async () => ({
            data: {
              disappearing_seconds: 0,
              disappearing_updated_at: null,
              disappearing_updated_by: null
            },
            error: null
          })
        };
        return chain;
      }
      if (table === 'chat_reactions') {
        return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
      }
      if (table === 'chat_stars') {
        return { select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) };
      }
      if (table === 'chat_reminders') {
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          in() { return chain; },
          then(resolve: (value: { data: unknown[]; error: null }) => void) {
            return Promise.resolve({ data: [], error: null }).then(resolve);
          }
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from() {
        return {
          upload: async (path: string, body: Blob) => {
            uploads.push({ path, body });
            return { error: null };
          },
          remove: async (paths: string[]) => {
            removals.push(paths);
            return { error: null };
          },
          createSignedUrls: async (paths: string[]) => ({
            data: paths.map((path) => ({ signedUrl: `https://media.invalid/${path}` })),
            error: null
          })
        };
      }
    },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === 'ensure_chat_conversation') {
        return ensureResults.shift() ?? { data: '10000000-0000-4000-8000-000000000003', error: null };
      }
      if (name === 'mark_chat_delivered') return { data: args?.p_delivered_at, error: null };
      if (name === 'search_chat_messages') return { data: [...searchRows], error: null };
      if (name === 'load_chat_message_context') return { data: [...contextRows], error: null };
      if (name === 'list_chat_media') return { data: mediaPages.shift() ?? [], error: null };
      return { data: null, error: null };
    },
    channel() {
      const channel = {
        state: 'joined',
        on() { return channel; },
        subscribe(callback?: (status: string) => void) { callback?.('SUBSCRIBED'); return channel; },
        track: async () => undefined,
        untrack: async () => undefined,
        presenceState: () => ({}),
        send: async () => ({ status: 'ok' })
      };
      return channel;
    },
    removeChannel: async () => undefined
  };
  return {
    client,
    insertPayloads,
    insertResults,
    lookupResults,
    uploads,
    removals,
    rpcCalls,
    messageRows,
    memberRows,
    searchRows,
    contextRows,
    mediaPages,
    ensureResults
  };
});

vi.mock('$lib/multiplayer/client', () => ({ getSupabaseClient: () => mock.client }));

import { AccountChatStore } from './account-chat-store.svelte';
import {
  AccountChatStorageError,
  accountChatOutboxKey,
  accountChatTargetKey,
  accountChatVoiceDraftKey,
  type AccountChatOutboxEntry,
  type AccountChatPersistence,
  type AccountChatVoiceDraft
} from './account-chat-outbox';

const ME = '10000000-0000-4000-8000-000000000001';
const PEER = '10000000-0000-4000-8000-000000000002';
const CONVERSATION = '10000000-0000-4000-8000-000000000003';

class MemoryChatPersistence implements AccountChatPersistence {
  outbox = new Map<string, AccountChatOutboxEntry>();
  voiceDrafts = new Map<string, AccountChatVoiceDraft>();

  async putOutbox(entry: AccountChatOutboxEntry): Promise<void> {
    this.outbox.set(entry.key, entry);
  }

  async listOutbox(accountId: string, conversationId?: string): Promise<AccountChatOutboxEntry[]> {
    return [...this.outbox.values()]
      .filter((entry) => entry.accountId === accountId && (!conversationId || entry.conversationId === conversationId))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async deleteOutbox(key: string): Promise<void> {
    this.outbox.delete(key);
  }

  async putVoiceDraft(draft: AccountChatVoiceDraft): Promise<void> {
    this.voiceDrafts.set(draft.key, draft);
  }

  async getVoiceDraft(accountId: string, conversationId: string): Promise<AccountChatVoiceDraft | null> {
    return this.voiceDrafts.get(accountChatVoiceDraftKey(accountId, conversationId)) ?? null;
  }

  async deleteVoiceDraft(accountId: string, conversationId: string): Promise<void> {
    this.voiceDrafts.delete(accountChatVoiceDraftKey(accountId, conversationId));
  }

  async purgeAccount(accountId: string): Promise<void> {
    for (const [key, entry] of this.outbox) if (entry.accountId === accountId) this.outbox.delete(key);
    for (const [key, draft] of this.voiceDrafts) if (draft.accountId === accountId) this.voiceDrafts.delete(key);
  }

  async purgeAccountsExcept(accountId: string): Promise<void> {
    for (const [key, entry] of this.outbox) if (entry.accountId !== accountId) this.outbox.delete(key);
    for (const [key, draft] of this.voiceDrafts) if (draft.accountId !== accountId) this.voiceDrafts.delete(key);
  }

  async purgeAll(): Promise<void> {
    this.outbox.clear();
    this.voiceDrafts.clear();
  }
}

function row(clientId: string, kind: 'text' | 'audio' = 'text', senderId = ME) {
  return {
    id: '10000000-0000-4000-8000-000000000004',
    conversation_id: CONVERSATION,
    sender_id: senderId,
    client_id: clientId,
    kind,
    body: kind === 'text' ? 'olá' : null,
    reply_to_id: null,
    media_bucket: kind === 'audio' ? 'couple-chat' : null,
    media_path: kind === 'audio' ? `${CONVERSATION}/${ME}/${clientId}.webm` : null,
    media_mime: kind === 'audio' ? 'audio/webm' : null,
    media_name: kind === 'audio' ? 'voz.webm' : null,
    media_size: kind === 'audio' ? 3 : null,
    edited_at: null,
    deleted_at: null,
    created_at: '2026-07-15T10:00:00.123456+00:00'
  };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  mock.insertPayloads.length = 0;
  mock.insertResults.length = 0;
  mock.lookupResults.length = 0;
  mock.uploads.length = 0;
  mock.removals.length = 0;
  mock.rpcCalls.length = 0;
  mock.messageRows.length = 0;
  mock.memberRows.length = 0;
  mock.searchRows.length = 0;
  mock.contextRows.length = 0;
  mock.mediaPages.length = 0;
  mock.ensureResults.length = 0;
});

afterEach(() => vi.restoreAllMocks());

describe('AccountChatStore delivery identity', () => {
  it('marks an incoming row delivered only after it is loaded into the local timeline', async () => {
    const incoming = row('peer-client', 'text', PEER);
    incoming.body = 'mensagem recebida';
    mock.messageRows.push(incoming);
    const store = new AccountChatStore({ meId: ME, peerId: PEER, kind: 'direct' });

    store.start();
    await vi.waitFor(() => expect(store.messages).toHaveLength(1));
    await vi.waitFor(() => expect(mock.rpcCalls.some((call) => call.name === 'mark_chat_delivered')).toBe(true));

    const delivery = mock.rpcCalls.find((call) => call.name === 'mark_chat_delivered');
    expect(delivery?.args).toEqual({
      p_conversation: CONVERSATION,
      p_delivered_at: incoming.created_at
    });
    expect(store.ownLastDeliveredAt).toBe(incoming.created_at);
    store.stop();
  });

  it('searches the complete server conversation with the exact compound cursor contract', async () => {
    const store = new AccountChatStore({ meId: ME, peerId: PEER, kind: 'direct' });
    store.start();
    await vi.waitFor(() => expect(store.ready).toBe(true));
    const match = row('search-client', 'text', PEER);
    match.body = 'um olá antigo';
    mock.searchRows.push(match);

    await store.searchMessages('  olá  ');

    expect(store.searchResults).toHaveLength(1);
    expect(store.searchResults[0].text).toBe('um olá antigo');
    expect(mock.rpcCalls.find((call) => call.name === 'search_chat_messages')?.args).toEqual({
      p_conversation: CONVERSATION,
      p_query: 'olá',
      p_before_at: null,
      p_before_id: null,
      p_limit: 30
    });
    store.stop();
  });

  it('retries with the same client id and heals a commit whose response was lost', async () => {
    const store = new AccountChatStore({ meId: ME, peerId: PEER, kind: 'direct' });
    store.start();
    await vi.waitFor(() => expect(store.ready).toBe(true));
    mock.insertResults.push({ data: null, error: new TypeError('response lost') });
    mock.lookupResults.push({ data: null, error: null });

    await expect(store.sendTextMessage('olá')).resolves.toBe('failed');
    const failed = store.messages[0];
    expect(failed.id).toBe(`local-${failed.clientId}`);

    mock.lookupResults.push({ data: row(failed.clientId as string), error: null });
    await expect(store.retryMessage(failed.id)).resolves.toBe('sent');

    expect(mock.insertPayloads).toHaveLength(1);
    expect(mock.insertPayloads[0].client_id).toBe(failed.clientId);
    expect(store.messages.map((message) => message.id)).toEqual(['10000000-0000-4000-8000-000000000004']);
    store.stop();
  });

  it('keeps an uploaded blob when an insert outcome and reconciliation are ambiguous', async () => {
    const store = new AccountChatStore({ meId: ME, peerId: PEER, kind: 'couple', spaceId: CONVERSATION });
    store.start();
    await vi.waitFor(() => expect(store.ready).toBe(true));
    mock.insertResults.push({ data: null, error: new TypeError('response lost') });
    mock.lookupResults.push({ data: null, error: new TypeError('still offline') });

    await expect(store.sendMediaMessage(new Blob(['voz'], { type: 'audio/webm' }), 'voz.webm')).resolves.toBe('failed');
    expect(mock.uploads).toHaveLength(1);
    expect(mock.removals).toHaveLength(0);
    expect(store.messages[0]).toMatchObject({ failed: true, mediaBucket: 'couple-chat' });

    const failed = store.messages[0];
    mock.lookupResults.push({ data: row(failed.clientId as string, 'audio'), error: null });
    await expect(store.retryMessage(failed.id)).resolves.toBe('sent');
    expect(mock.uploads).toHaveLength(1);
    store.stop();
  });

  it('replays a text outbox after reload with the same client id and deletes it only after confirmation', async () => {
    const persistence = new MemoryChatPersistence();
    const first = new AccountChatStore({ meId: ME, peerId: PEER, kind: 'direct', persistence });
    first.start();
    await vi.waitFor(() => expect(first.ready).toBe(true));
    mock.insertResults.push({ data: null, error: new TypeError('offline') });
    mock.lookupResults.push({ data: null, error: new TypeError('offline') });

    await expect(first.sendTextMessage('fica guardada', '30000000-0000-4000-8000-000000000005'))
      .resolves.toBe('queued');
    const [durable] = [...persistence.outbox.values()];
    expect(durable).toMatchObject({
      kind: 'text',
      text: 'fica guardada',
      replyToId: '30000000-0000-4000-8000-000000000005',
      state: 'queued'
    });
    first.stop();

    mock.lookupResults.push({ data: null, error: null });
    const committed = row(durable.clientId);
    committed.body = 'fica guardada';
    mock.insertResults.push({ data: committed, error: null });
    const reloaded = new AccountChatStore({ meId: ME, peerId: PEER, kind: 'direct', persistence });
    reloaded.start();

    await vi.waitFor(() => expect(persistence.outbox.size).toBe(0));
    expect(mock.insertPayloads.map((payload) => payload.client_id)).toEqual([durable.clientId, durable.clientId]);
    expect(reloaded.messages).toMatchObject([{ id: committed.id, clientId: durable.clientId, text: 'fica guardada' }]);
    reloaded.stop();
  });

  it('restores media metadata and does not upload the same stable object again after reload', async () => {
    const persistence = new MemoryChatPersistence();
    const first = new AccountChatStore({
      meId: ME,
      peerId: PEER,
      kind: 'couple',
      spaceId: CONVERSATION,
      persistence
    });
    first.start();
    await vi.waitFor(() => expect(first.ready).toBe(true));
    mock.insertResults.push({ data: null, error: new TypeError('response lost') });
    mock.lookupResults.push({ data: null, error: new TypeError('offline') });
    await expect(first.sendMediaMessage(new Blob(['voz'], { type: 'audio/webm' }), 'voz.webm'))
      .resolves.toBe('queued');
    expect(mock.uploads).toHaveLength(1);
    const [durable] = [...persistence.outbox.values()];
    expect(durable).toMatchObject({ mediaBucket: 'couple-chat' });
    expect(durable.mediaPath).toContain(durable.clientId);
    first.stop();

    mock.lookupResults.push({ data: null, error: null });
    mock.insertResults.push({ data: row(durable.clientId, 'audio'), error: null });
    const reloaded = new AccountChatStore({
      meId: ME,
      peerId: PEER,
      kind: 'couple',
      spaceId: CONVERSATION,
      persistence
    });
    reloaded.start();
    await vi.waitFor(() => expect(persistence.outbox.size).toBe(0));

    expect(mock.uploads).toHaveLength(1);
    expect(mock.insertPayloads.at(-1)).toMatchObject({
      client_id: durable.clientId,
      media_bucket: 'couple-chat',
      media_path: durable.mediaPath
    });
    reloaded.stop();
  });

  it('keeps permanent backend errors for a factual manual retry without auto-looping', async () => {
    const persistence = new MemoryChatPersistence();
    const first = new AccountChatStore({ meId: ME, peerId: PEER, kind: 'direct', persistence });
    first.start();
    await vi.waitFor(() => expect(first.ready).toBe(true));
    mock.insertResults.push({ data: null, error: { status: 403, code: '42501' } });
    mock.lookupResults.push({ data: null, error: null });
    await expect(first.sendTextMessage('sem permissão')).resolves.toBe('failed');
    const [durable] = [...persistence.outbox.values()];
    expect(durable.state).toBe('failed');
    first.stop();

    const reloaded = new AccountChatStore({ meId: ME, peerId: PEER, kind: 'direct', persistence });
    reloaded.start();
    await vi.waitFor(() => expect(reloaded.ready).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mock.insertPayloads).toHaveLength(1);
    expect(reloaded.messages[0]).toMatchObject({ clientId: durable.clientId, failed: true, queued: false });

    mock.lookupResults.push({ data: null, error: null });
    mock.insertResults.push({ data: row(durable.clientId), error: null });
    await expect(reloaded.retryMessage(`local-${durable.clientId}`)).resolves.toBe('sent');
    expect(persistence.outbox.size).toBe(0);
    reloaded.stop();
  });

  it('never reports queued when IndexedDB rejected the durable write', async () => {
    const persistence = new MemoryChatPersistence();
    persistence.putOutbox = async () => {
      throw new AccountChatStorageError('quota');
    };
    const store = new AccountChatStore({ meId: ME, peerId: PEER, kind: 'direct', persistence });
    store.start();
    await vi.waitFor(() => expect(store.ready).toBe(true));
    mock.insertResults.push({ data: null, error: new TypeError('offline') });
    mock.lookupResults.push({ data: null, error: new TypeError('offline') });

    await expect(store.sendTextMessage('não prometas guardar')).resolves.toBe('failed');
    expect(store.outboxStorageError).toBe('quota');
    expect(store.messages[0]).toMatchObject({ failed: true, queued: false });
    store.stop();
  });

  it('loads an exact bounded context window and merges the target into the timeline', async () => {
    const target = row('context-client', 'text', PEER);
    target.id = '10000000-0000-4000-8000-000000000006';
    target.body = 'mensagem antiga exata';
    mock.contextRows.push(target);
    const store = new AccountChatStore({ meId: ME, peerId: PEER, kind: 'direct' });
    store.start();
    await vi.waitFor(() => expect(store.ready).toBe(true));

    await expect(store.loadMessageContext(target.id)).resolves.toBe(true);

    expect(store.messages.some((message) => message.id === target.id && message.text === target.body)).toBe(true);
    expect(mock.rpcCalls.find((call) => call.name === 'load_chat_message_context')?.args).toEqual({
      p_message: target.id,
      p_before: 20,
      p_after: 20
    });
    store.stop();
  });

  it('paginates the media gallery independently with the exact oldest cursor', async () => {
    const firstPage = Array.from({ length: 30 }, (_, index) => {
      const item = row(`media-${index}`, 'audio', index % 2 ? ME : PEER);
      item.id = `10000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`;
      item.created_at = new Date(Date.UTC(2026, 6, 15, 10, 0, 30 - index)).toISOString();
      return item;
    });
    const older = row('media-older', 'audio', PEER);
    older.id = '10000000-0000-4000-8000-000000000099';
    older.created_at = '2026-07-15T09:00:00.000000+00:00';
    mock.mediaPages.push(firstPage, [older]);
    const store = new AccountChatStore({ meId: ME, peerId: PEER, kind: 'direct' });
    store.start();
    await vi.waitFor(() => expect(store.ready).toBe(true));

    await store.loadMediaGallery();
    expect(store.mediaItems).toHaveLength(30);
    expect(store.mediaHasMore).toBe(true);
    const oldest = store.mediaItems[0];
    await store.loadMediaGallery(true);

    const calls = mock.rpcCalls.filter((call) => call.name === 'list_chat_media');
    expect(calls[1]?.args).toMatchObject({
      p_conversation: CONVERSATION,
      p_before_at: oldest.createdAt,
      p_before_id: oldest.id,
      p_limit: 30
    });
    expect(store.mediaItems.some((message) => message.id === older.id)).toBe(true);
    expect(store.mediaHasMore).toBe(false);
    store.stop();
  });

  it('restores its durable thread while ensure_chat_conversation is offline', async () => {
    const persistence = new MemoryChatPersistence();
    const clientId = 'offline-bootstrap';
    const targetKey = accountChatTargetKey({
      accountId: ME,
      peerId: PEER,
      kind: 'direct',
      topic: 'main'
    });
    const entry: AccountChatOutboxEntry = {
      key: accountChatOutboxKey(ME, CONVERSATION, clientId),
      accountId: ME,
      conversationId: CONVERSATION,
      clientId,
      targetKey,
      kind: 'text',
      text: 'guardada sem rede',
      createdAt: 1,
      updatedAt: 1,
      attempts: 1,
      nextAttemptAt: 2_000,
      state: 'queued'
    };
    persistence.outbox.set(entry.key, entry);
    mock.ensureResults.push({ data: null, error: new TypeError('offline') });
    const store = new AccountChatStore({ meId: ME, peerId: PEER, kind: 'direct', persistence });

    store.start();
    await vi.waitFor(() => expect(store.ready).toBe(true));

    expect(store.conversationId).toBe(CONVERSATION);
    expect(store.messages).toMatchObject([{ clientId, text: 'guardada sem rede', queued: true }]);
    expect(store.offline).toBe(true);
    expect(store.authError).toBe(false);
    store.stop();
  });

  it('blocks an ambiguous discard, then removes a proven-absent failed Blob and revokes only its URL', async () => {
    const persistence = new MemoryChatPersistence();
    const clientId = 'failed-media';
    const entry: AccountChatOutboxEntry = {
      key: accountChatOutboxKey(ME, CONVERSATION, clientId),
      accountId: ME,
      conversationId: CONVERSATION,
      clientId,
      targetKey: accountChatTargetKey({ accountId: ME, peerId: PEER, kind: 'direct', topic: 'main' }),
      kind: 'media',
      mediaBlob: new Blob(['voice'], { type: 'audio/webm' }),
      mediaName: 'voz.webm',
      mediaType: 'audio/webm',
      mediaBucket: 'chat-media',
      mediaPath: `${CONVERSATION}/${ME}/${clientId}.webm`,
      mediaSize: 5,
      createdAt: 1,
      updatedAt: 1,
      attempts: 1,
      nextAttemptAt: 0,
      insertAttempted: true,
      state: 'failed'
    };
    persistence.outbox.set(entry.key, entry);
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:failed-media');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const store = new AccountChatStore({ meId: ME, peerId: PEER, kind: 'direct', persistence });
    store.start();
    await vi.waitFor(() => expect(store.messages[0]?.failed).toBe(true));

    mock.lookupResults.push({ data: null, error: new TypeError('status unknown') });
    await expect(store.discardFailedMessage(`local-${clientId}`)).resolves.toBe('blocked');
    expect(persistence.outbox.has(entry.key)).toBe(true);
    expect(revokeUrl).not.toHaveBeenCalled();

    mock.lookupResults.push({ data: null, error: null });
    await expect(store.discardFailedMessage(`local-${clientId}`)).resolves.toBe('discarded');
    expect(persistence.outbox.has(entry.key)).toBe(false);
    expect(store.messages).toHaveLength(0);
    expect(mock.removals).toHaveLength(0);
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledWith('blob:failed-media');
    store.stop();
  });
});
