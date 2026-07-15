import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { LocalChatMessage } from './store.svelte';
import {
  canForwardAccountChatMessage,
  forwardAccountChatMessage,
  forwardedMessagePreview
} from './chat-forwarding';
import type {
  AccountChatOutboxEntry,
  AccountChatPersistence,
  AccountChatVoiceDraft
} from './account-chat-outbox';

const ME = '10000000-0000-4000-8000-000000000001';
const TARGET = '10000000-0000-4000-8000-000000000002';
const SOURCE = '20000000-0000-4000-8000-000000000003';
const CLIENT = '30000000-0000-4000-8000-000000000004';
const COMMITTED = '40000000-0000-4000-8000-000000000005';

class MemoryPersistence implements AccountChatPersistence {
  outbox = new Map<string, AccountChatOutboxEntry>();
  async putOutbox(entry: AccountChatOutboxEntry) { this.outbox.set(entry.key, entry); }
  async listOutbox(accountId: string, conversationId?: string) {
    return [...this.outbox.values()].filter((entry) =>
      entry.accountId === accountId && (!conversationId || entry.conversationId === conversationId)
    );
  }
  async deleteOutbox(key: string) { this.outbox.delete(key); }
  async putVoiceDraft(_draft: AccountChatVoiceDraft) {}
  async getVoiceDraft(_accountId: string, _conversationId: string) { return null; }
  async deleteVoiceDraft(_accountId: string, _conversationId: string) {}
  async purgeAccount(accountId: string) {
    for (const [key, entry] of this.outbox) if (entry.accountId === accountId) this.outbox.delete(key);
  }
  async purgeAccountsExcept(accountId: string) {
    for (const [key, entry] of this.outbox) if (entry.accountId !== accountId) this.outbox.delete(key);
  }
  async purgeAll() { this.outbox.clear(); }
}

function textMessage(text = '  texto original  '): LocalChatMessage {
  return { id: SOURCE, from: ME as LocalChatMessage['from'], text, kind: 'text', ts: Date.now() };
}

function mockClient(inserted: Record<string, unknown>[], uploaded: Array<{ bucket: string; path: string; type: string }>) {
  const lookupRows = [null, { id: COMMITTED }];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: ME } } }, error: null })
    },
    from(table: string) {
      if (table === 'chat_messages') {
        return {
          select() {
            const chain = {
              eq() { return chain; },
              maybeSingle: async () => ({ data: lookupRows.shift() ?? null, error: null })
            };
            return chain;
          },
          insert: async (payload: Record<string, unknown>) => {
            inserted.push(payload);
            return { error: null };
          }
        };
      }
      if (table === 'chat_conversations') {
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          maybeSingle: async () => ({ data: { kind: 'direct' }, error: null })
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (path: string, blob: Blob, options: { contentType: string }) => {
            uploaded.push({ bucket, path, type: options.contentType || blob.type });
            return { error: null };
          }
        };
      }
    }
  };
  return client as unknown as SupabaseClient;
}

describe('confirmed chat forwarding', () => {
  it('preserves exact text and its server-checkable source through the durable outbox', async () => {
    const inserted: Record<string, unknown>[] = [];
    const persistence = new MemoryPersistence();
    const unrelated: AccountChatOutboxEntry = {
      key: `${ME}:50000000-0000-4000-8000-000000000006:60000000-0000-4000-8000-000000000007`,
      accountId: ME,
      conversationId: '50000000-0000-4000-8000-000000000006',
      clientId: '60000000-0000-4000-8000-000000000007',
      kind: 'text',
      text: 'outra mensagem pendente',
      createdAt: 1,
      updatedAt: 1,
      attempts: 0,
      state: 'queued'
    };
    persistence.outbox.set(unrelated.key, unrelated);
    const result = await forwardAccountChatMessage({
      accountId: ME,
      targetConversationId: TARGET,
      message: textMessage(),
      persistence,
      client: mockClient(inserted, []),
      clientId: CLIENT,
      now: 123
    });

    expect(result).toBe('sent');
    expect(inserted).toEqual([expect.objectContaining({
      conversation_id: TARGET,
      client_id: CLIENT,
      body: '  texto original  ',
      forwarded_from_id: SOURCE
    })]);
    expect(persistence.outbox.size).toBe(1);
    expect(persistence.outbox.get(unrelated.key)).toEqual(unrelated);
  });

  it('re-uploads media into the target conversation without an unverifiable provenance badge', async () => {
    const inserted: Record<string, unknown>[] = [];
    const uploaded: Array<{ bucket: string; path: string; type: string }> = [];
    const persistence = new MemoryPersistence();
    const blob = new Blob(['gif89a'], { type: 'image/gif' });
    const message: LocalChatMessage = {
      id: SOURCE,
      from: ME as LocalChatMessage['from'],
      kind: 'image',
      ts: Date.now(),
      name: 'abraço.gif',
      mediaType: 'image/gif',
      mediaVariant: 'gif',
      localBlob: blob
    };

    const result = await forwardAccountChatMessage({
      accountId: ME,
      targetConversationId: TARGET,
      message,
      mediaBlob: blob,
      persistence,
      client: mockClient(inserted, uploaded),
      clientId: CLIENT,
      now: 123
    });

    expect(result).toBe('sent');
    expect(uploaded).toEqual([expect.objectContaining({ bucket: 'chat-media', type: 'image/gif' })]);
    expect(inserted).toEqual([expect.objectContaining({
      media_variant: 'gif',
      forwarded_from_id: null
    })]);
    expect(String(inserted[0].media_path)).toContain(`${TARGET}/${ME}/${CLIENT}`);
  });

  it('rejects transient/call rows and produces bounded human previews', () => {
    expect(canForwardAccountChatMessage({ ...textMessage(), pending: true })).toBe(false);
    expect(canForwardAccountChatMessage({ ...textMessage(), kind: 'call' })).toBe(false);
    expect(forwardedMessagePreview({ ...textMessage('x'.repeat(300)) })).toHaveLength(160);
    expect(forwardedMessagePreview({ ...textMessage(), text: undefined, mediaVariant: 'sticker', mediaType: 'image/png' })).toBe('Sticker');
  });
});
