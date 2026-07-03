// Hermes gateway client — streams chat through the OpenAI-compatible API
// server that ships with hermes-agent (profile "presuntinho").
//
// Transport notes:
//   - The gateway CORS layer only allows the request headers
//     `Authorization, Content-Type, Idempotency-Key`, so the browser cannot
//     send `X-Hermes-Session-Id`. We therefore use the *path-based* session
//     endpoints: POST /api/sessions (create) and
//     POST /api/sessions/{id}/chat/stream (SSE).
//   - EventSource cannot attach an Authorization header, so streaming is
//     implemented with fetch + ReadableStream and a small SSE parser.
//
// Config (tunnel URL + API key) is entered once in /definicoes and lives in
// localStorage — per device, never baked into the deployed bundle.

import type { ProfileId } from '../auth/hash';

export interface HermesConfig {
  url: string;
  key: string;
}

const URL_KEY = 'presuntinho-hermes-url';
const KEY_KEY = 'presuntinho-hermes-key';

export function getHermesConfig(): HermesConfig | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const url = (localStorage.getItem(URL_KEY) ?? '').trim().replace(/\/+$/, '');
    const key = (localStorage.getItem(KEY_KEY) ?? '').trim();
    if (!url || !key) return null;
    return { url, key };
  } catch {
    return null;
  }
}

export function setHermesConfig(cfg: { url: string; key: string }): void {
  if (typeof localStorage === 'undefined') return;
  const url = cfg.url.trim().replace(/\/+$/, '');
  const key = cfg.key.trim();
  if (url) localStorage.setItem(URL_KEY, url);
  else localStorage.removeItem(URL_KEY);
  if (key) localStorage.setItem(KEY_KEY, key);
  else localStorage.removeItem(KEY_KEY);
  // Config change may point at a different gateway — forget ensure cache.
  ensuredSessions.clear();
}

export function hermesSessionId(profile: ProfileId): string {
  return `presuntinho-${profile}`;
}

function authHeaders(cfg: HermesConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.key}`,
    'Content-Type': 'application/json'
  };
}

export class HermesError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'HermesError';
    this.status = status;
  }
}

// Session ids we already created (or confirmed) against the current config,
// so we don't POST /api/sessions on every message.
const ensuredSessions = new Set<string>();

/** Forget the ensure cache for one session (after clearing history). */
export function forgetHermesSession(sessionId: string): void {
  ensuredSessions.delete(sessionId);
}

export async function ensureHermesSession(cfg: HermesConfig, sessionId: string, title?: string): Promise<void> {
  if (ensuredSessions.has(sessionId)) return;
  const res = await fetch(`${cfg.url}/api/sessions`, {
    method: 'POST',
    headers: authHeaders(cfg),
    body: JSON.stringify({ id: sessionId, title: title ?? `Presuntinho ${sessionId}` })
  });
  // 409 = session already exists — that's the normal steady-state case.
  if (!res.ok && res.status !== 409) {
    throw new HermesError(`session create failed (${res.status})`, res.status);
  }
  ensuredSessions.add(sessionId);
}

export async function deleteHermesSession(cfg: HermesConfig, sessionId: string): Promise<void> {
  const res = await fetch(`${cfg.url}/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: authHeaders(cfg)
  });
  if (!res.ok && res.status !== 404) {
    throw new HermesError(`session delete failed (${res.status})`, res.status);
  }
  ensuredSessions.delete(sessionId);
}

export async function checkHermesHealth(cfg: HermesConfig): Promise<boolean> {
  try {
    const res = await fetch(`${cfg.url}/health`, { headers: { Authorization: `Bearer ${cfg.key}` } });
    return res.ok;
  } catch {
    return false;
  }
}

export interface StreamChatOptions {
  cfg: HermesConfig;
  sessionId: string;
  message: string;
  systemMessage?: string;
  signal: AbortSignal;
  onDelta: (delta: string) => void;
}

/**
 * Stream one chat turn. Resolves with the final assistant text
 * (`assistant.completed` payload when present, else the accumulated deltas).
 * Throws HermesError on HTTP/stream errors and DOMException(AbortError) when
 * cancelled via the signal.
 */
export async function streamHermesChat(opts: StreamChatOptions): Promise<string> {
  const { cfg, sessionId, message, systemMessage, signal, onDelta } = opts;
  const res = await fetch(`${cfg.url}/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`, {
    method: 'POST',
    headers: authHeaders(cfg),
    body: JSON.stringify(systemMessage ? { message, system_message: systemMessage } : { message }),
    signal
  });
  if (!res.ok || !res.body) {
    throw new HermesError(`chat stream failed (${res.status})`, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  let finalText: string | null = null;

  const handleFrame = (frame: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith(':')) continue; // keepalive comment
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) return;
    let payload: any;
    try {
      payload = JSON.parse(dataLines.join('\n'));
    } catch {
      return; // ignore malformed frames
    }
    const body = payload?.payload ?? payload;
    if (event === 'assistant.delta') {
      const delta = typeof body?.delta === 'string' ? body.delta : '';
      if (delta) {
        accumulated += delta;
        onDelta(delta);
      }
    } else if (event === 'assistant.completed') {
      if (typeof body?.content === 'string') finalText = body.content;
    } else if (event === 'error') {
      throw new HermesError(String(body?.message ?? 'stream error'));
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep).replace(/\r/g, '');
        buffer = buffer.slice(sep + 2);
        if (frame.trim()) handleFrame(frame);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return finalText ?? accumulated;
}
