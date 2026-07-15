import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_CHAT_MAX_BLOB_BYTES,
  ACCOUNT_CHAT_MAX_PENDING_BYTES,
  ACCOUNT_CHAT_MAX_VOICE_DRAFTS,
  ACCOUNT_CHAT_VOICE_DRAFT_TTL_MS,
  accountChatEntryBytes,
  accountChatOutboxKey,
  accountChatVoiceDraftKey,
  accountChatVoiceDraftExpired,
  normalizeAccountChatOutboxEntry,
  normalizeAccountChatVoiceDraft
} from './account-chat-outbox';

const ACCOUNT = '10000000-0000-4000-8000-000000000001';
const CONVERSATION = '10000000-0000-4000-8000-000000000003';
const CLIENT = '20000000-0000-4000-8000-000000000004';

describe('account chat IndexedDB rows', () => {
  it('retains the stable client id, reply and Blob required after a reload', () => {
    const blob = new Blob(['voice'], { type: 'audio/webm' });
    const entry = normalizeAccountChatOutboxEntry({
      key: accountChatOutboxKey(ACCOUNT, CONVERSATION, CLIENT),
      accountId: ACCOUNT,
      conversationId: CONVERSATION,
      clientId: CLIENT,
      kind: 'media',
      replyToId: '30000000-0000-4000-8000-000000000005',
      mediaBlob: blob,
      mediaName: 'voz.webm',
      mediaType: 'audio/webm',
      mediaBucket: 'chat-media',
      mediaPath: `${CONVERSATION}/${ACCOUNT}/${CLIENT}.webm`,
      createdAt: 10,
      updatedAt: 20,
      attempts: 2,
      nextAttemptAt: 30,
      state: 'queued'
    });

    expect(entry).toMatchObject({
      clientId: CLIENT,
      replyToId: '30000000-0000-4000-8000-000000000005',
      mediaBlob: blob,
      mediaBucket: 'chat-media',
      attempts: 2,
      nextAttemptAt: 30
    });
    expect(accountChatEntryBytes(entry!)).toBe(blob.size);
  });

  it('rejects forged keys, empty text and oversized blobs instead of replaying them', () => {
    const base = {
      key: accountChatOutboxKey(ACCOUNT, CONVERSATION, CLIENT),
      accountId: ACCOUNT,
      conversationId: CONVERSATION,
      clientId: CLIENT,
      kind: 'text',
      text: 'olá',
      createdAt: 1,
      updatedAt: 1,
      attempts: 0,
      state: 'queued'
    };
    expect(normalizeAccountChatOutboxEntry({ ...base, key: 'forged' })).toBeNull();
    expect(normalizeAccountChatOutboxEntry({ ...base, text: '   ' })).toBeNull();
    expect(normalizeAccountChatOutboxEntry({
      ...base,
      kind: 'media',
      text: undefined,
      mediaName: 'huge.bin',
      mediaBlob: new Blob([new Uint8Array(ACCOUNT_CHAT_MAX_BLOB_BYTES + 1)])
    })).toBeNull();
  });

  it('validates voice drafts independently per account and conversation', () => {
    const blob = new Blob(['voice'], { type: 'audio/webm' });
    const draft = normalizeAccountChatVoiceDraft({
      key: accountChatVoiceDraftKey(ACCOUNT, CONVERSATION),
      accountId: ACCOUNT,
      conversationId: CONVERSATION,
      blob,
      fileName: 'voz.webm',
      durationMs: 1_250,
      updatedAt: 10
    });
    expect(draft).toMatchObject({ accountId: ACCOUNT, conversationId: CONVERSATION, blob, durationMs: 1_250 });
    expect(normalizeAccountChatVoiceDraft({ ...draft, key: `${ACCOUNT}:other` })).toBeNull();
  });

  it('gives voice drafts an explicit seven-day TTL and bounded account budget', () => {
    const now = 10 * ACCOUNT_CHAT_VOICE_DRAFT_TTL_MS;
    expect(accountChatVoiceDraftExpired({ updatedAt: now - ACCOUNT_CHAT_VOICE_DRAFT_TTL_MS }, now)).toBe(false);
    expect(accountChatVoiceDraftExpired({ updatedAt: now - ACCOUNT_CHAT_VOICE_DRAFT_TTL_MS - 1 }, now)).toBe(true);
    expect(ACCOUNT_CHAT_MAX_VOICE_DRAFTS).toBe(20);
    expect(ACCOUNT_CHAT_MAX_PENDING_BYTES).toBe(75 * 1024 * 1024);
  });
});
