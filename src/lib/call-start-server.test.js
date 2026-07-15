// @ts-nocheck -- deterministic Netlify Function harness.
import { afterEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import callStartHandler, {
  config as callStartConfig,
  validCallStartPayload
} from '../../netlify/functions/call-start.js';
import backgroundHandler, {
  resolveQueuedCall,
  signedStartDispatchRequest
} from '../../netlify/functions/call-push-dispatch.js';
import { validCallStartDispatchSignature } from '../../netlify/functions/_shared/push-delivery.js';

const CALLER = '11111111-1111-4111-8111-111111111111';
const OTHER_CALLER = '22222222-2222-4222-8222-222222222222';
const CALLEE = '33333333-3333-4333-8333-333333333333';
const CONVERSATION = '44444444-4444-4444-8444-444444444444';
const REQUEST_ID = '55555555-5555-4555-8555-555555555555';
const CALL_ID = '66666666-6666-4666-8666-666666666666';
const DEVICE = 'installation-00000001.tab-00000001';
const SERVICE_ROLE = 'service-role-'.padEnd(64, 's');

function environment() {
  vi.stubGlobal('Netlify', {
    env: {
      get: (key) => ({
        VITE_SUPABASE_URL: 'https://project.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
        VAPID_PUBLIC_KEY: 'vapid-public',
        VAPID_PRIVATE_KEY: 'vapid-private',
        VAPID_SUBJECT: 'mailto:test@presuntinho.love'
      })[key]
    }
  });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function payload(overrides = {}) {
  return {
    conversationId: CONVERSATION,
    kind: 'audio',
    device: DEVICE,
    requestId: REQUEST_ID,
    ...overrides
  };
}

function request(body = payload(), token = 'caller-token') {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request('https://presuntinho.love/api/call-start', {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

function callRow(overrides = {}) {
  const now = Date.now();
  return {
    id: CALL_ID,
    conversation_id: CONVERSATION,
    caller: CALLER,
    callee: CALLEE,
    caller_device: DEVICE,
    callee_device: null,
    kind: 'audio',
    status: 'ringing',
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 45_000).toISOString(),
    caller_heartbeat_at: new Date(now).toISOString(),
    callee_heartbeat_at: null,
    caller_lease_expires_at: new Date(now + 120_000).toISOString(),
    callee_lease_expires_at: null,
    push_sent_at: null,
    answered_at: null,
    ended_at: null,
    client_request_id: REQUEST_ID,
    ...overrides
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('reliable call-start Netlify endpoint', () => {
  it('has a bounded public route and strict body contract', () => {
    expect(callStartConfig).toEqual({
      path: '/api/call-start',
      method: 'POST',
      rateLimit: {
        windowLimit: 20,
        windowSize: 60,
        aggregateBy: ['ip', 'domain']
      }
    });
    expect(validCallStartPayload(payload())).toEqual(payload());
    expect(validCallStartPayload(payload({ caller: CALLER }))).toBeNull();
    expect(validCallStartPayload(payload({ device: 'short' }))).toBeNull();
  });

  it('authenticates, queues caller+requestId first, then creates via the service-only gateway RPC', async () => {
    environment();
    const effects = [];
    const fetchMock = vi.fn(async (input, init = {}) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/user') {
        effects.push('auth');
        return json({ id: CALLER });
      }
      if (url.pathname === '/rest/v1/call_sessions') {
        effects.push('lookup');
        return json([]);
      }
      if (url.pathname.endsWith('/rpc/preflight_call_start')) {
        effects.push('preflight');
        return json(true);
      }
      if (url.pathname === '/api/internal/call-push-dispatch') {
        const body = JSON.parse(String(init.body));
        const signature = new Headers(init.headers).get('x-presuntinho-dispatch-signature');
        expect(body).toEqual({ caller: CALLER, requestId: REQUEST_ID });
        expect(validCallStartDispatchSignature(
          SERVICE_ROLE,
          CALLER,
          REQUEST_ID,
          signature
        )).toBe(true);
        effects.push('queue');
        return new Response(null, { status: 202 });
      }
      if (url.pathname.endsWith('/rpc/start_call_from_gateway')) {
        effects.push('rpc');
        expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${SERVICE_ROLE}`);
        expect(JSON.parse(String(init.body))).toEqual({
          p_caller: CALLER,
          p_conversation: CONVERSATION,
          p_kind: 'audio',
          p_device: DEVICE,
          p_request_id: REQUEST_ID
        });
        return json(callRow());
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await callStartHandler(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      requestId: REQUEST_ID,
      call: { id: CALL_ID, caller: CALLER, client_request_id: REQUEST_ID }
    });
    expect(effects).toEqual(['auth', 'lookup', 'preflight', 'queue', 'rpc']);
  });

  it('does not call the creating RPC when Netlify does not acknowledge the queue', async () => {
    environment();
    const fetchMock = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/user') return json({ id: CALLER });
      if (url.pathname === '/rest/v1/call_sessions') return json([]);
      if (url.pathname.endsWith('/rpc/preflight_call_start')) return json(true);
      if (url.pathname === '/api/internal/call-push-dispatch') {
        return new Response(null, { status: 503 });
      }
      throw new Error(`creation must not run after queue failure: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await callStartHandler(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'call_dispatch_unavailable' });
    expect(fetchMock.mock.calls.some(([input]) =>
      new URL(String(input)).pathname.endsWith('/rpc/start_call_from_gateway')
    )).toBe(false);
  });

  it('rejects unauthenticated and malformed requests before external I/O', async () => {
    environment();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await callStartHandler(request(payload(), ''))).status).toBe(401);
    expect((await callStartHandler(request(payload({ requestId: 'wrong' })))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when the RPC result does not match authenticated caller/request', async () => {
    environment();
    const fetchMock = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/user') return json({ id: CALLER });
      if (url.pathname === '/rest/v1/call_sessions') return json([]);
      if (url.pathname.endsWith('/rpc/preflight_call_start')) return json(true);
      if (url.pathname === '/api/internal/call-push-dispatch') {
        return new Response(null, { status: 202 });
      }
      if (url.pathname.endsWith('/rpc/start_call_from_gateway')) {
        return json(callRow({ caller: OTHER_CALLER }));
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await callStartHandler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'call_start_mismatch' });
  });

  it('rejects a new inactive conversation before queueing any worker', async () => {
    environment();
    const paths = [];
    const fetchMock = vi.fn(async (input) => {
      const url = new URL(String(input));
      paths.push(url.pathname);
      if (url.pathname === '/auth/v1/user') return json({ id: CALLER });
      if (url.pathname === '/rest/v1/call_sessions') return json([]);
      if (url.pathname.endsWith('/rpc/preflight_call_start')) return json(false);
      throw new Error(`must not queue an invalid conversation: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await callStartHandler(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'call_conversation_inactive' });
    expect(paths).not.toContain('/api/internal/call-push-dispatch');
  });

  it('skips relationship preflight for a matching committed replay', async () => {
    environment();
    const paths = [];
    const fetchMock = vi.fn(async (input) => {
      const url = new URL(String(input));
      paths.push(url.pathname);
      if (url.pathname === '/auth/v1/user') return json({ id: CALLER });
      if (url.pathname === '/rest/v1/call_sessions') return json([callRow()]);
      if (url.pathname === '/api/internal/call-push-dispatch') {
        return new Response(null, { status: 202 });
      }
      if (url.pathname.endsWith('/rpc/start_call_from_gateway')) return json(callRow());
      throw new Error(`unexpected replay fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await callStartHandler(request());
    expect(response.status).toBe(200);
    expect(paths.some((path) => path.endsWith('/rpc/preflight_call_start'))).toBe(false);
  });

  it('rejects reuse of an existing request id with a changed tuple before queueing', async () => {
    environment();
    const paths = [];
    const fetchMock = vi.fn(async (input) => {
      const url = new URL(String(input));
      paths.push(url.pathname);
      if (url.pathname === '/auth/v1/user') return json({ id: CALLER });
      if (url.pathname === '/rest/v1/call_sessions') {
        return json([callRow({ kind: 'video' })]);
      }
      throw new Error(`must not queue mismatched replay: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await callStartHandler(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'call_request_mismatch' });
    expect(paths).not.toContain('/api/internal/call-push-dispatch');
  });
});

describe('queue-before-commit dispatcher resolution', () => {
  it('polls caller+requestId until the creating transaction becomes visible', async () => {
    let reads = 0;
    let clock = 0;
    const paths = [];
    const sbAdmin = vi.fn(async (path) => {
      paths.push(path);
      reads += 1;
      return json(reads < 3 ? [] : [callRow()]);
    });

    const resolved = await resolveQueuedCall(
      sbAdmin,
      { caller: CALLER, requestId: REQUEST_ID },
      {
        now: () => clock,
        sleepFn: async (ms) => { clock += ms; },
        waitMs: 2_000,
        pollMs: 100
      }
    );

    expect(resolved.call?.id).toBe(CALL_ID);
    expect(reads).toBe(3);
    expect(paths.every((path) =>
      path.includes(`caller=eq.${CALLER}`) &&
      path.includes(`client_request_id=eq.${REQUEST_ID}`)
    )).toBe(true);
  });

  it('binds the worker signature to both caller and request id', () => {
    const signed = signedStartDispatchRequest(
      'https://presuntinho.love/api/internal/call-push-dispatch',
      SERVICE_ROLE,
      CALLER,
      REQUEST_ID
    );
    const signature = signed.headers.get('x-presuntinho-dispatch-signature');
    expect(validCallStartDispatchSignature(SERVICE_ROLE, CALLER, REQUEST_ID, signature)).toBe(true);
    expect(validCallStartDispatchSignature(SERVICE_ROLE, OTHER_CALLER, REQUEST_ID, signature)).toBe(false);
  });

  it('wires the signed start selector into the existing terminal-safe worker flow', async () => {
    environment();
    vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/rest/v1/call_sessions') {
        return json([callRow({ status: 'cancelled', ended_at: new Date().toISOString() })]);
      }
      if (url.pathname === '/rest/v1/accounts') return json([{ display_name: 'Rafael' }]);
      if (url.pathname.endsWith('/rpc/claim_call_terminal_delivery_batch')) return json([]);
      if (url.pathname === '/rest/v1/call_terminal_outbox') return json([{ status: 'sent' }]);
      if (url.pathname === '/rest/v1/call_deliveries') return json([]);
      throw new Error(`unexpected reliable worker fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await backgroundHandler(signedStartDispatchRequest(
      'https://presuntinho.love/api/internal/call-push-dispatch',
      SERVICE_ROLE,
      CALLER,
      REQUEST_ID
    ));

    expect(response.status).toBe(204);
    const firstCallQuery = new URL(String(fetchMock.mock.calls[0][0]));
    expect(firstCallQuery.searchParams.get('caller')).toBe(`eq.${CALLER}`);
    expect(firstCallQuery.searchParams.get('client_request_id')).toBe(`eq.${REQUEST_ID}`);
  });
});
