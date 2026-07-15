const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ChatDeepLink {
  conversationId: string;
  messageId: string | null;
}

/** Parse only canonical UUID deep links; invalid query text never reaches an
 * RPC or a CSS selector. A message is meaningful only inside a conversation. */
export function parseChatDeepLink(params: Pick<URLSearchParams, 'get'>): ChatDeepLink | null {
  const conversationId = params.get('conversation');
  const messageId = params.get('message');
  if (!conversationId || !UUID_RE.test(conversationId)) return null;
  if (messageId !== null && !UUID_RE.test(messageId)) return null;
  return { conversationId, messageId };
}

export function chatMessageHref(conversationId: string, messageId: string): string | null {
  if (!UUID_RE.test(conversationId) || !UUID_RE.test(messageId)) return null;
  return `/mensagens/?conversation=${encodeURIComponent(conversationId)}&message=${encodeURIComponent(messageId)}`;
}
