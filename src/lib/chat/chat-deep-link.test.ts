import { describe, expect, it } from 'vitest';
import { chatMessageHref, parseChatDeepLink } from './chat-deep-link';

const conversation = 'a346c38c-646a-454e-b073-af7d17769c3b';
const message = '16ea1bcc-f191-4f39-837f-273daf72c504';

describe('chat deep links', () => {
  it('parses an exact conversation/message target', () => {
    expect(parseChatDeepLink(new URLSearchParams({ conversation, message }))).toEqual({
      conversationId: conversation,
      messageId: message
    });
    expect(chatMessageHref(conversation, message)).toBe(
      `/mensagens/?conversation=${conversation}&message=${message}`
    );
  });

  it('fails closed for malformed or unscoped message ids', () => {
    expect(parseChatDeepLink(new URLSearchParams({ message }))).toBeNull();
    expect(parseChatDeepLink(new URLSearchParams({ conversation, message: '../bad' }))).toBeNull();
    expect(chatMessageHref('bad', message)).toBeNull();
  });
});
