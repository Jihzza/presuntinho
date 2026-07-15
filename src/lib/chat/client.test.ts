import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushOutbox,
  queueOutbox,
  readOutbox,
  sendText,
  setChatToken,
  type ChatProfile
} from './client';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); }
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  setChatToken('fatma', 'secret');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('legacy chat delivery', () => {
  it('sends the stable client id to the Netlify API', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        message: { id: 'server-1', from: 'fatma', text: payload.text, clientId: payload.clientId, ts: 1 },
        meta: {}
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await sendText('fatma', 'olá', 'main', 'local-1721000000000-fatma-ab12');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      text: 'olá',
      conversationId: 'main',
      clientId: 'local-1721000000000-fatma-ab12'
    });
  });

  it('serializes flushes per profile and never mixes conversation topics', async () => {
    queueOutbox('fatma', {
      localId: 'local-1721000000000-fatma-main',
      kind: 'text',
      text: 'principal',
      conversationId: 'main',
      queuedAt: 1
    });
    queueOutbox('fatma', {
      localId: 'local-1721000000001-fatma-memories',
      kind: 'text',
      text: 'memória',
      conversationId: 'memories',
      queuedAt: 2
    });

    let active = 0;
    let maxActive = 0;
    const conversations: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      active += 1;
      maxActive = Math.max(maxActive, active);
      conversations.push(payload.conversationId);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return new Response(JSON.stringify({
        message: {
          id: `server-${payload.clientId}`,
          from: 'fatma' as ChatProfile,
          text: payload.text,
          conversationId: payload.conversationId,
          clientId: payload.clientId,
          ts: Date.now()
        },
        meta: {}
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const [main, duplicateMain, memories] = await Promise.all([
      flushOutbox('fatma', 'main'),
      flushOutbox('fatma', 'main'),
      flushOutbox('fatma', 'memories')
    ]);

    expect(maxActive).toBe(1);
    expect(main).toHaveLength(1);
    expect(duplicateMain).toEqual([]);
    expect(memories).toHaveLength(1);
    expect(conversations).toEqual(['main', 'memories']);
    expect(readOutbox('fatma')).toEqual([]);
  });

  it('re-queueing the same local id replaces rather than duplicates it', () => {
    const item = {
      localId: 'local-1721000000000-fatma-ab12',
      kind: 'text' as const,
      text: 'primeira',
      conversationId: 'main',
      queuedAt: 1
    };
    expect(queueOutbox('fatma', item)).toBe(true);
    expect(queueOutbox('fatma', { ...item, text: 'segunda', queuedAt: 2 })).toBe(true);
    expect(readOutbox('fatma')).toEqual([{ ...item, text: 'segunda', queuedAt: 2 }]);
  });
});
