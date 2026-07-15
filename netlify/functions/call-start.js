// @ts-nocheck -- Netlify runtime globals live outside the Svelte TS build.
// Reliable incoming-call start. A background dispatcher is durably accepted
// before Postgres is allowed to create the call session.

import {
  callStartDispatchSignature
} from './_shared/push-delivery.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE_RE = /^[A-Za-z0-9._:-]{16,160}$/;
const MAX_REQUEST_BYTES = 4 * 1024;
const SERVER_DEADLINE_MS = 8_500;
const UPSTREAM_STEP_TIMEOUT_MS = 8_000;

export const config = {
  path: '/api/call-start',
  method: 'POST',
  rateLimit: {
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: ['ip', 'domain']
  }
};

function reply(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

async function readJsonObject(req) {
  const declared = req.headers.get('content-length');
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0) return { status: 400, value: null };
    if (length > MAX_REQUEST_BYTES) return { status: 413, value: null };
  }
  const raw = await req.text().catch(() => null);
  if (raw === null) return { status: 400, value: null };
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    return { status: 413, value: null };
  }
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { status: 200, value }
      : { status: 400, value: null };
  } catch {
    return { status: 400, value: null };
  }
}

export function validCallStartPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.some((key) => !['conversationId', 'kind', 'device', 'requestId'].includes(key))) {
    return null;
  }
  if (
    typeof value.conversationId !== 'string' ||
    !UUID_RE.test(value.conversationId) ||
    !['audio', 'video'].includes(value.kind) ||
    typeof value.device !== 'string' ||
    !DEVICE_RE.test(value.device) ||
    typeof value.requestId !== 'string' ||
    !UUID_RE.test(value.requestId)
  ) return null;
  return {
    conversationId: value.conversationId,
    kind: value.kind,
    device: value.device,
    requestId: value.requestId
  };
}

function publicRpcError(responseStatus, body) {
  const raw = typeof body?.message === 'string' ? body.message.toLowerCase() : '';
  if (responseStatus === 401 || raw.includes('not authenticated')) {
    return { status: 401, error: 'call_unauthorized', message: 'not authenticated' };
  }
  if (raw.includes('invalid call kind') || raw.includes('invalid call device') || raw.includes('invalid call request')) {
    return { status: 400, error: 'call_invalid', message: raw };
  }
  if (raw.includes('call request mismatch')) {
    return { status: 409, error: 'call_request_mismatch', message: 'call request mismatch' };
  }
  if (raw.includes('already in a call')) {
    return { status: 409, error: 'call_peer_busy', message: 'one of the participants is already in a call' };
  }
  if (raw.includes('please wait before calling again')) {
    return { status: 429, error: 'call_rate_limited', message: 'please wait before calling again' };
  }
  if (raw.includes('conversation is not active')) {
    return { status: 409, error: 'call_conversation_inactive', message: 'conversation is not active' };
  }
  if (raw.includes('calls require a two-person conversation')) {
    return { status: 409, error: 'call_conversation_invalid', message: 'calls require a two-person conversation' };
  }
  return { status: 503, error: 'call_start_unavailable', message: 'call start unavailable' };
}

function deadlineSignal(deadlineAt, stepLimit = UPSTREAM_STEP_TIMEOUT_MS) {
  const remaining = Math.max(1, deadlineAt - Date.now());
  return AbortSignal.timeout(Math.min(stepLimit, remaining));
}

async function queueStartDispatcher(req, serviceRole, caller, requestId, deadlineAt) {
  const endpoint = new URL('/api/internal/call-push-dispatch', req.url);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-presuntinho-dispatch-signature': callStartDispatchSignature(
          serviceRole,
          caller,
          requestId
        )
      },
      body: JSON.stringify({ caller, requestId }),
      signal: deadlineSignal(deadlineAt, 5_000)
    });
    return response.status === 202;
  } catch {
    return false;
  }
}

export default async function handler(req) {
  // The browser waits longer than this whole budget. Per-step timeouts consume
  // only the remaining budget, so one semantic request is never retried while
  // its previous endpoint invocation can still be creating the call.
  const deadlineAt = Date.now() + SERVER_DEADLINE_MS;
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const parsed = await readJsonObject(req);
  if (parsed.status !== 200) return reply(parsed.status, { error: 'invalid_request' });
  const payload = validCallStartPayload(parsed.value);
  if (!payload) return reply(400, { error: 'invalid_request' });

  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ') || auth.length <= 'Bearer '.length) {
    return reply(401, { error: 'call_unauthorized', message: 'not authenticated' });
  }

  const supabaseUrl = Netlify.env.get('VITE_SUPABASE_URL');
  const anon = Netlify.env.get('VITE_SUPABASE_ANON_KEY');
  const serviceRole = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anon || !serviceRole || serviceRole.length < 32) {
    return reply(503, { error: 'call_start_unavailable', message: 'call start unavailable' });
  }

  const sbUser = (path, init = {}) =>
    fetch(`${supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: anon,
        authorization: auth,
        'content-type': 'application/json',
        ...(init.headers || {})
      },
      signal: init.signal || deadlineSignal(deadlineAt)
    });
  const sbAdmin = (path, init = {}) =>
    fetch(`${supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: serviceRole,
        authorization: `Bearer ${serviceRole}`,
        'content-type': 'application/json',
        ...(init.headers || {})
      },
      signal: init.signal || deadlineSignal(deadlineAt)
    });

  const userResponse = await sbUser('/auth/v1/user').catch(() => null);
  if (!userResponse?.ok) {
    return reply(401, { error: 'call_unauthorized', message: 'not authenticated' });
  }
  const user = await userResponse.json().catch(() => null);
  const caller = typeof user?.id === 'string' && UUID_RE.test(user.id) ? user.id : null;
  if (!caller) return reply(401, { error: 'call_unauthorized', message: 'not authenticated' });

  // A committed replay remains recoverable even if the relationship changed
  // after call creation. Only a genuinely new request needs admission preflight.
  const existingResponse = await sbUser(
    `/rest/v1/call_sessions?caller=eq.${caller}` +
      `&client_request_id=eq.${payload.requestId}` +
      '&select=id,caller,conversation_id,caller_device,kind,client_request_id&limit=1'
  ).catch(() => null);
  if (!existingResponse?.ok) {
    return reply(503, { error: 'call_start_unavailable', message: 'call start unavailable' });
  }
  const existingBody = await existingResponse.json().catch(() => null);
  const existing = Array.isArray(existingBody) ? existingBody[0] : null;
  if (existing) {
    if (
      existing.caller !== caller ||
      existing.client_request_id !== payload.requestId ||
      existing.conversation_id !== payload.conversationId ||
      existing.kind !== payload.kind ||
      existing.caller_device !== payload.device
    ) {
      return reply(409, { error: 'call_request_mismatch', message: 'call request mismatch' });
    }
  } else {
    const preflightResponse = await sbUser('/rest/v1/rpc/preflight_call_start', {
      method: 'POST',
      body: JSON.stringify({ p_conversation: payload.conversationId })
    }).catch(() => null);
    if (!preflightResponse?.ok) {
      return reply(503, { error: 'call_start_unavailable', message: 'call start unavailable' });
    }
    const allowed = await preflightResponse.json().catch(() => false);
    if (allowed !== true) {
      return reply(409, {
        error: 'call_conversation_inactive',
        message: 'conversation is not active'
      });
    }
  }

  // This ordering is the contract: if Netlify does not acknowledge its durable
  // background queue, no call-creation RPC is attempted.
  const queued = await queueStartDispatcher(
    req,
    serviceRole,
    caller,
    payload.requestId,
    deadlineAt
  );
  if (!queued) {
    return reply(503, {
      error: 'call_dispatch_unavailable',
      message: 'call dispatcher was not accepted'
    });
  }

  // Only the service-role gateway wrapper can create a call. The browser JWT
  // was verified above, and the background worker has already been accepted;
  // authenticated clients have no direct EXECUTE grant on either start RPC.
  const rpcResponse = await sbAdmin('/rest/v1/rpc/start_call_from_gateway', {
    method: 'POST',
    body: JSON.stringify({
      p_caller: caller,
      p_conversation: payload.conversationId,
      p_kind: payload.kind,
      p_device: payload.device,
      p_request_id: payload.requestId
    })
  }).catch(() => null);
  if (!rpcResponse) {
    return reply(503, { error: 'call_start_unavailable', message: 'call start unavailable' });
  }
  const rpcBody = await rpcResponse.json().catch(() => null);
  if (!rpcResponse.ok) {
    const failure = publicRpcError(rpcResponse.status, rpcBody);
    return reply(failure.status, failure);
  }
  const call = Array.isArray(rpcBody) ? rpcBody[0] : rpcBody;
  if (
    !call ||
    typeof call !== 'object' ||
    call.caller !== caller ||
    call.client_request_id !== payload.requestId ||
    call.conversation_id !== payload.conversationId ||
    call.kind !== payload.kind ||
    call.caller_device !== payload.device ||
    typeof call.id !== 'string' ||
    !UUID_RE.test(call.id)
  ) {
    return reply(502, { error: 'call_start_mismatch', message: 'call start response mismatch' });
  }

  return reply(200, { call, requestId: payload.requestId });
}
