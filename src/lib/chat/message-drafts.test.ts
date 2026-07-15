import { describe, expect, it } from 'vitest';
import {
  chatDraftPreview,
  chatDraftStorageKey,
  chatDraftText,
  clearChatDraftsForAccount,
  parseChatDrafts,
  readChatDrafts,
  withoutConfirmedChatDraft,
  withChatDraft,
  writeChatDrafts,
  type DraftStorage
} from './message-drafts';

function memoryStorage(): DraftStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key)
  };
}

describe('local chat drafts', () => {
  it('keeps drafts isolated by account and conversation', () => {
    const storage = memoryStorage();
    const fatma = withChatDraft([], 'couple:space:main', 'Olá Fatma', 10);
    const daniel = withChatDraft([], 'direct:friend:main', 'Olá Daniel', 20);
    expect(writeChatDrafts(storage, 'fatma-account', fatma)).toBe(true);
    expect(writeChatDrafts(storage, 'daniel-account', daniel)).toBe(true);

    expect(chatDraftText(readChatDrafts(storage, 'fatma-account'), 'couple:space:main')).toBe('Olá Fatma');
    expect(chatDraftText(readChatDrafts(storage, 'fatma-account'), 'direct:friend:main')).toBe('');
    expect(chatDraftText(readChatDrafts(storage, 'daniel-account'), 'direct:friend:main')).toBe('Olá Daniel');
    expect(chatDraftStorageKey('fatma-account')).not.toBe(chatDraftStorageKey('daniel-account'));
  });

  it('removes only the selected draft for whitespace input', () => {
    const drafts = withChatDraft(
      withChatDraft([], 'one', 'first', 1),
      'two',
      'second',
      2
    );
    const next = withChatDraft(drafts, 'two', '   ', 3);
    expect(next).toEqual([{ conversationKey: 'one', text: 'first', updatedAt: 1 }]);
  });

  it('clears only the exact draft confirmed by the server', () => {
    const submitted = withChatDraft([], 'chat', 'first message', 1);
    expect(withoutConfirmedChatDraft(submitted, 'chat', 'first message')).toEqual([]);

    const newer = withChatDraft(submitted, 'chat', 'new words typed while sending', 2);
    expect(withoutConfirmedChatDraft(newer, 'chat', 'first message')).toBe(newer);
    expect(chatDraftText(newer, 'chat')).toBe('new words typed while sending');
  });

  it('rejects corrupt data, invalid rows and duplicate older entries', () => {
    expect(parseChatDrafts('{oops')).toEqual([]);
    expect(parseChatDrafts(JSON.stringify({ version: 2, drafts: [] }))).toEqual([]);
    expect(parseChatDrafts(JSON.stringify({
      version: 1,
      drafts: [
        { conversationKey: 'one', text: 'new', updatedAt: 2 },
        { conversationKey: 'one', text: 'old', updatedAt: 1 },
        { conversationKey: '', text: 'leak', updatedAt: 3 },
        { conversationKey: 'two', text: ' ', updatedAt: 4 }
      ]
    }))).toEqual([{ conversationKey: 'one', text: 'new', updatedAt: 2 }]);
  });

  it('clears an account scope on logout without touching another account', () => {
    const storage = memoryStorage();
    writeChatDrafts(storage, 'one', withChatDraft([], 'chat', 'private one'));
    writeChatDrafts(storage, 'two', withChatDraft([], 'chat', 'private two'));
    clearChatDraftsForAccount('one', storage);
    expect(readChatDrafts(storage, 'one')).toEqual([]);
    expect(chatDraftText(readChatDrafts(storage, 'two'), 'chat')).toBe('private two');
  });

  it('creates a safe, compact list preview', () => {
    expect(chatDraftPreview('  olá\n\n   mundo  ')).toBe('olá mundo');
    expect(chatDraftPreview('abcdefgh', 5)).toBe('abcd…');
  });
});
