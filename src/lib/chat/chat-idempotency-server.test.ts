import { describe, expect, it } from 'vitest';
import {
  chatIdempotencyKey,
  chatPayloadFingerprint,
  claimChatMessage,
  normalizeChatClientId
} from '../../../netlify/functions/_shared/chat-idempotency.js';

function fakeStore() {
  const values = new Map<string, unknown>();
  return {
    async setJSON(key: string, value: unknown, options: { onlyIfNew?: boolean } = {}) {
      if (options.onlyIfNew && values.has(key)) return { modified: false };
      values.set(key, structuredClone(value));
      return { modified: true, etag: String(values.size) };
    },
    async get(key: string) {
      return values.has(key) ? structuredClone(values.get(key)) : null;
    }
  };
}

describe('Netlify legacy chat idempotency', () => {
  it('validates browser local ids and rejects path punctuation', () => {
    expect(normalizeChatClientId('local-1721000000000-fatma-ab12')).toBe('local-1721000000000-fatma-ab12');
    expect(normalizeChatClientId('../escape')).toBeUndefined();
    expect(normalizeChatClientId(null)).toBeNull();
  });

  it('returns one canonical message for concurrent retries', async () => {
    const store = fakeStore();
    const key = chatIdempotencyKey('fatma', 'main', 'local-1721000000000-fatma-ab12');
    const fingerprint = chatPayloadFingerprint({ conversationId: 'main', text: 'olá' });
    const results = await Promise.all([
      claimChatMessage(store, { key, fingerprint, message: { id: 'message-1' } }),
      claimChatMessage(store, { key, fingerprint, message: { id: 'message-2' } })
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['claimed', 'replay']);
    expect(results.map((result) => result.message.id)).toEqual(['message-1', 'message-1']);
  });

  it('rejects reusing the same identity for a different payload', async () => {
    const store = fakeStore();
    const key = chatIdempotencyKey('daniel', 'memories', 'local-1721000000000-daniel-ab12');
    await claimChatMessage(store, {
      key,
      fingerprint: chatPayloadFingerprint({ conversationId: 'memories', text: 'a' }),
      message: { id: 'message-1' }
    });
    await expect(claimChatMessage(store, {
      key,
      fingerprint: chatPayloadFingerprint({ conversationId: 'memories', text: 'b' }),
      message: { id: 'message-2' }
    })).resolves.toMatchObject({ status: 'conflict', message: { id: 'message-1' } });
  });

  it('deduplicates media by content and name as well as conversation', async () => {
    const store = fakeStore();
    const key = chatIdempotencyKey('fatma', 'photos', 'local-1721000000000-fatma-photo');
    const firstFingerprint = chatPayloadFingerprint({
      conversationId: 'photos',
      media: 'data:image/png;base64,YQ==',
      name: 'foto.png'
    });
    await claimChatMessage(store, { key, fingerprint: firstFingerprint, message: { id: 'media-1' } });
    await expect(claimChatMessage(store, {
      key,
      fingerprint: firstFingerprint,
      message: { id: 'media-2' }
    })).resolves.toMatchObject({ status: 'replay', message: { id: 'media-1' } });
    await expect(claimChatMessage(store, {
      key,
      fingerprint: chatPayloadFingerprint({
        conversationId: 'photos',
        media: 'data:image/png;base64,Yg==',
        name: 'foto.png'
      }),
      message: { id: 'media-3' }
    })).resolves.toMatchObject({ status: 'conflict', message: { id: 'media-1' } });
  });
});
