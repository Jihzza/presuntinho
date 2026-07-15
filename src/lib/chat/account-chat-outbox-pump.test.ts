import { describe, expect, it, vi } from 'vitest';
import {
  runAccountChatOutboxPass,
  type AccountChatOutboxGateway
} from './account-chat-outbox-pump';
import {
  accountChatOutboxKey,
  type AccountChatOutboxEntry,
  type AccountChatPersistence,
  type AccountChatVoiceDraft
} from './account-chat-outbox';

const ACCOUNT = '10000000-0000-4000-8000-000000000001';
const OTHER_ACCOUNT = '10000000-0000-4000-8000-000000000002';
const CONVERSATION_A = '10000000-0000-4000-8000-000000000003';
const CONVERSATION_B = '10000000-0000-4000-8000-000000000004';

class MemoryPersistence implements AccountChatPersistence {
  outbox = new Map<string, AccountChatOutboxEntry>();
  drafts = new Map<string, AccountChatVoiceDraft>();
  async putOutbox(entry: AccountChatOutboxEntry) { this.outbox.set(entry.key, entry); }
  async listOutbox(accountId: string, conversationId?: string) {
    return [...this.outbox.values()].filter((entry) =>
      entry.accountId === accountId && (!conversationId || entry.conversationId === conversationId)
    );
  }
  async deleteOutbox(key: string) { this.outbox.delete(key); }
  async putVoiceDraft(draft: AccountChatVoiceDraft) { this.drafts.set(draft.key, draft); }
  async getVoiceDraft(accountId: string, conversationId: string) {
    return [...this.drafts.values()].find((draft) =>
      draft.accountId === accountId && draft.conversationId === conversationId
    ) ?? null;
  }
  async deleteVoiceDraft(accountId: string, conversationId: string) {
    for (const [key, draft] of this.drafts) {
      if (draft.accountId === accountId && draft.conversationId === conversationId) this.drafts.delete(key);
    }
  }
  async purgeAccount(accountId: string) {
    for (const [key, entry] of this.outbox) if (entry.accountId === accountId) this.outbox.delete(key);
    for (const [key, draft] of this.drafts) if (draft.accountId === accountId) this.drafts.delete(key);
  }
  async purgeAccountsExcept(accountId: string) {
    for (const [key, entry] of this.outbox) if (entry.accountId !== accountId) this.outbox.delete(key);
    for (const [key, draft] of this.drafts) if (draft.accountId !== accountId) this.drafts.delete(key);
  }
  async purgeAll() { this.outbox.clear(); this.drafts.clear(); }
}

function textEntry(conversationId: string, clientId: string, accountId = ACCOUNT): AccountChatOutboxEntry {
  return {
    key: accountChatOutboxKey(accountId, conversationId, clientId),
    accountId,
    conversationId,
    clientId,
    kind: 'text',
    text: `message-${clientId}`,
    createdAt: 1,
    updatedAt: 1,
    attempts: 0,
    nextAttemptAt: 0,
    state: 'queued'
  };
}

function gateway(overrides: Partial<AccountChatOutboxGateway> = {}): AccountChatOutboxGateway {
  return {
    lookup: vi.fn(async (): Promise<'absent'> => 'absent'),
    conversationKind: vi.fn(async (): Promise<'direct'> => 'direct'),
    upload: vi.fn(async () => undefined),
    insert: vi.fn(async () => undefined),
    ...overrides
  };
}

describe('account-wide chat outbox pass', () => {
  it('drains all conversations for the account without touching another account', async () => {
    const persistence = new MemoryPersistence();
    const a = textEntry(CONVERSATION_A, 'client-a');
    const b = textEntry(CONVERSATION_B, 'client-b');
    const foreign = textEntry(CONVERSATION_A, 'client-foreign', OTHER_ACCOUNT);
    for (const entry of [a, b, foreign]) persistence.outbox.set(entry.key, entry);
    const transport = gateway();

    const result = await runAccountChatOutboxPass({ accountId: ACCOUNT, persistence, gateway: transport, now: 10 });

    expect(result).toEqual({ inspected: 2, sent: 2, queued: 0, failed: 0 });
    expect(transport.insert).toHaveBeenCalledTimes(2);
    expect(persistence.outbox.has(foreign.key)).toBe(true);
    expect(persistence.outbox.size).toBe(1);
  });

  it('passes exact text provenance but never claims provenance for media bytes', async () => {
    const persistence = new MemoryPersistence();
    const sourceId = '30000000-0000-4000-8000-000000000005';
    const forwardedText = {
      ...textEntry(CONVERSATION_A, 'client-forward-text'),
      text: '  cópia exata  ',
      forwardedFromId: sourceId
    };
    const forwardedMedia: AccountChatOutboxEntry = {
      ...textEntry(CONVERSATION_B, 'client-forward-media'),
      kind: 'media',
      text: undefined,
      forwardedFromId: sourceId,
      mediaBlob: new Blob(['png'], { type: 'image/png' }),
      mediaType: 'image/png',
      mediaName: 'sticker.png',
      mediaVariant: 'sticker'
    };
    persistence.outbox.set(forwardedText.key, forwardedText);
    persistence.outbox.set(forwardedMedia.key, forwardedMedia);
    const inserts: Record<string, unknown>[] = [];
    const transport = gateway({ insert: vi.fn(async (entry) => { inserts.push({ ...entry }); }) });

    await runAccountChatOutboxPass({ accountId: ACCOUNT, persistence, gateway: transport, now: 10 });

    expect(inserts.find((entry) => entry.clientId === 'client-forward-text')).toMatchObject({
      text: '  cópia exata  ',
      forwardedFromId: sourceId
    });
    // The Supabase gateway has a second defence and always inserts NULL for a
    // media provenance column; the durable normalizer strips it on reload.
    expect(inserts.find((entry) => entry.clientId === 'client-forward-media')).toMatchObject({
      mediaVariant: 'sticker'
    });
  });

  it('reconciles a response-lost commit before inserting again', async () => {
    const persistence = new MemoryPersistence();
    const entry = textEntry(CONVERSATION_A, 'client-committed');
    persistence.outbox.set(entry.key, entry);
    const transport = gateway({ lookup: vi.fn(async (): Promise<'found'> => 'found') });

    await runAccountChatOutboxPass({ accountId: ACCOUNT, persistence, gateway: transport, now: 10 });

    expect(transport.insert).not.toHaveBeenCalled();
    expect(persistence.outbox.size).toBe(0);
  });

  it('uploads a media row to a stable path and persists metadata before insert', async () => {
    const persistence = new MemoryPersistence();
    const clientId = 'client-media';
    const entry: AccountChatOutboxEntry = {
      ...textEntry(CONVERSATION_B, clientId),
      kind: 'media',
      text: undefined,
      mediaBlob: new Blob(['voice'], { type: 'audio/webm' }),
      mediaType: 'audio/webm',
      mediaName: 'voz.webm'
    };
    persistence.outbox.set(entry.key, entry);
    const transport = gateway({ conversationKind: vi.fn(async (): Promise<'couple'> => 'couple') });

    await runAccountChatOutboxPass({ accountId: ACCOUNT, persistence, gateway: transport, now: 10 });

    expect(transport.upload).toHaveBeenCalledWith(expect.objectContaining({
      bucket: 'couple-chat',
      path: `${CONVERSATION_B}/${ACCOUNT}/${clientId}.webm`
    }));
    expect(transport.insert).toHaveBeenCalledWith(expect.objectContaining({
      mediaBucket: 'couple-chat',
      mediaPath: `${CONVERSATION_B}/${ACCOUNT}/${clientId}.webm`,
      insertAttempted: true
    }));
    expect(persistence.outbox.size).toBe(0);
  });

  it('leaves Storage 403 failed for manual action instead of retrying forever', async () => {
    const persistence = new MemoryPersistence();
    const entry: AccountChatOutboxEntry = {
      ...textEntry(CONVERSATION_B, 'client-denied'),
      kind: 'media',
      text: undefined,
      mediaBlob: new Blob(['voice'], { type: 'audio/webm' }),
      mediaType: 'audio/webm',
      mediaName: 'voz.webm'
    };
    persistence.outbox.set(entry.key, entry);
    const denied = { name: 'StorageApiError', statusCode: '403', message: 'forbidden' };
    const transport = gateway({ upload: vi.fn(async () => { throw denied; }) });

    const result = await runAccountChatOutboxPass({ accountId: ACCOUNT, persistence, gateway: transport, now: 100 });

    expect(result.failed).toBe(1);
    expect(persistence.outbox.get(entry.key)).toMatchObject({ state: 'failed', nextAttemptAt: 0, attempts: 1 });
  });

  it('respects backoff except for an explicit connectivity recovery pass', async () => {
    const persistence = new MemoryPersistence();
    const entry = { ...textEntry(CONVERSATION_A, 'client-later'), nextAttemptAt: 500 };
    persistence.outbox.set(entry.key, entry);
    const transport = gateway();

    expect((await runAccountChatOutboxPass({ accountId: ACCOUNT, persistence, gateway: transport, now: 100 })).inspected).toBe(0);
    expect((await runAccountChatOutboxPass({ accountId: ACCOUNT, persistence, gateway: transport, now: 100, force: true })).sent).toBe(1);
  });
});
