import { describe, expect, it, vi } from 'vitest';
import {
  CHAT_EDIT_WINDOW_MS,
  canEditChatMessage,
  copyTextToClipboard,
  messageDeliveryState,
  shouldClearVoiceDraft,
  shouldMarkConversationRead
} from './message-actions';

describe('message actions', () => {
  it('derives only factual delivery states', () => {
    expect(messageDeliveryState({ ts: 10, pending: true }, 99)).toBe('pending');
    expect(messageDeliveryState({ ts: 10, queued: true }, 99)).toBe('queued');
    expect(messageDeliveryState({ ts: 10, failed: true }, 99)).toBe('failed');
    expect(messageDeliveryState({ ts: 10 }, 9)).toBe('sent');
    expect(messageDeliveryState({ ts: 10 }, 9, 10)).toBe('delivered');
    expect(messageDeliveryState({ ts: 10 }, 10, 10)).toBe('read');
    expect(messageDeliveryState(
      { ts: 10, createdAt: '2026-07-15T10:00:00.123456+00:00' },
      10,
      10,
      '2026-07-15T10:00:00.123455+00:00',
      '2026-07-15T10:00:00.123456+00:00'
    )).toBe('delivered');
  });

  it('offers editing only for owned text during the server 15 minute window', () => {
    const now = 1_800_000_000_000;
    const message = { ts: now - CHAT_EDIT_WINDOW_MS, from: 'me', text: 'olá', kind: 'text' };
    expect(canEditChatMessage(message, 'me', now)).toBe(true);
    expect(canEditChatMessage({ ...message, ts: message.ts - 1 }, 'me', now)).toBe(false);
    expect(canEditChatMessage({ ...message, from: 'peer' }, 'me', now)).toBe(false);
    expect(canEditChatMessage({ ...message, kind: 'image' }, 'me', now)).toBe(false);
    expect(canEditChatMessage({ ...message, forwardedFromId: 'source-message' }, 'me', now)).toBe(false);
    expect(canEditChatMessage({ ...message, deleted: true }, 'me', now)).toBe(false);
    expect(canEditChatMessage({ ...message, pending: true }, 'me', now)).toBe(false);
  });

  it('marks read only in the visible thread with search closed and the tail on screen', () => {
    const visibleTail = { pageActive: true, threadVisible: true, searchOpen: false, atBottom: true };
    expect(shouldMarkConversationRead(visibleTail)).toBe(true);
    expect(shouldMarkConversationRead({ ...visibleTail, pageActive: false })).toBe(false);
    expect(shouldMarkConversationRead({ ...visibleTail, threadVisible: false })).toBe(false);
    expect(shouldMarkConversationRead({ ...visibleTail, searchOpen: true })).toBe(false);
    expect(shouldMarkConversationRead({ ...visibleTail, atBottom: false })).toBe(false);
  });

  it('keeps a voice draft after a failed send', () => {
    expect(shouldClearVoiceDraft('sent')).toBe(true);
    expect(shouldClearVoiceDraft('queued')).toBe(true);
    expect(shouldClearVoiceDraft('failed')).toBe(false);
  });

  it('uses the modern clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyTextToClipboard('safe text', { clipboard: { writeText }, document: null })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('safe text');
  });

  it('falls back after a rejected clipboard permission', async () => {
    const textarea = {
      value: '',
      style: {} as CSSStyleDeclaration,
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      remove: vi.fn()
    } as unknown as HTMLTextAreaElement;
    const appendChild = vi.fn();
    const execCommand = vi.fn().mockReturnValue(true);
    const result = await copyTextToClipboard('fallback', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      document: {
        body: { appendChild } as unknown as HTMLElement,
        createElement: vi.fn().mockReturnValue(textarea),
        execCommand
      }
    });
    expect(result).toBe(true);
    expect(textarea.value).toBe('fallback');
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(textarea.remove).toHaveBeenCalled();
  });

  it('reports failure when neither safe copy path succeeds', async () => {
    await expect(copyTextToClipboard('text', { clipboard: null, document: null })).resolves.toBe(false);
  });
});
