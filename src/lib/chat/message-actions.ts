export type MessageDeliveryState = 'pending' | 'queued' | 'failed' | 'sent' | 'delivered' | 'read';

export const CHAT_EDIT_WINDOW_MS = 15 * 60 * 1_000;

export interface MessageStateLike {
  ts: number;
  createdAt?: string;
  pending?: boolean;
  queued?: boolean;
  failed?: boolean;
}

function cursorCoversMessage(message: MessageStateLike, cursorMs: number, cursorExact?: string): boolean {
  if (cursorExact && message.createdAt) return cursorExact >= message.createdAt;
  return cursorMs >= message.ts;
}

/** Delivery ticks are derived only from durable peer cursors. A successful
 * send is not labelled delivered until the other account has actually synced
 * the row and advanced its delivery cursor. */
export function messageDeliveryState(
  message: MessageStateLike,
  peerLastRead: number,
  peerLastDelivered = 0,
  peerLastReadAt = '',
  peerLastDeliveredAt = ''
): MessageDeliveryState {
  if (message.pending) return 'pending';
  if (message.queued) return 'queued';
  if (message.failed) return 'failed';
  if (cursorCoversMessage(message, peerLastRead, peerLastReadAt)) return 'read';
  if (cursorCoversMessage(message, peerLastDelivered, peerLastDeliveredAt)) return 'delivered';
  return 'sent';
}

export interface EditableMessageLike extends MessageStateLike {
  from: string;
  text?: string;
  kind?: string;
  deleted?: boolean;
}

/** The server remains authoritative, but mirroring its 15 minute rule in the
 * UI avoids offering an action that is guaranteed to fail. */
export function canEditChatMessage(
  message: EditableMessageLike,
  profile: string,
  now = Date.now()
): boolean {
  return (
    message.from === profile &&
    (message.kind ?? 'text') === 'text' &&
    Boolean(message.text?.trim()) &&
    !message.deleted &&
    !message.pending &&
    !message.queued &&
    !message.failed &&
    now - message.ts <= CHAT_EDIT_WINDOW_MS
  );
}

export interface ConversationReadContext {
  pageActive: boolean;
  threadVisible: boolean;
  searchOpen: boolean;
  atBottom: boolean;
}

/** A message is read only when the actual conversation tail is on screen.
 * Merely having the route mounted (list/search/history) is not sufficient. */
export function shouldMarkConversationRead(context: ConversationReadContext): boolean {
  return context.pageActive && context.threadVisible && !context.searchOpen && context.atBottom;
}

export function shouldClearVoiceDraft(result: 'sent' | 'queued' | 'failed'): boolean {
  return result === 'sent' || result === 'queued';
}

export interface ClipboardEnvironment {
  clipboard?: { writeText(text: string): Promise<void> } | null;
  document?: Pick<Document, 'body' | 'createElement' | 'execCommand'> | null;
}

/** Clipboard API first, selection-based fallback second. Returns a factual
 * result so the UI can announce success or failure to assistive tech. */
export async function copyTextToClipboard(
  text: string,
  environment: ClipboardEnvironment = {
    clipboard: typeof navigator === 'undefined' ? null : navigator.clipboard,
    document: typeof document === 'undefined' ? null : document
  }
): Promise<boolean> {
  if (!text) return false;
  if (environment.clipboard?.writeText) {
    try {
      await environment.clipboard.writeText(text);
      return true;
    } catch {
      // Some browsers expose the API but reject it outside a secure/active
      // context. The synchronous selection fallback can still work.
    }
  }

  const doc = environment.document;
  if (!doc?.body || typeof doc.createElement !== 'function' || typeof doc.execCommand !== 'function') return false;
  const textarea = doc.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  doc.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
