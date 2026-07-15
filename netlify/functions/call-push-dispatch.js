// @ts-nocheck -- Netlify runtime globals live outside the Svelte TS build.
// Background dispatcher for retryable incoming-call Web Push deliveries.
//
// Netlify runs this asynchronously (HTTP callers immediately receive 202) for
// up to 15 minutes. This loop deliberately has a much smaller bound: the live
// call's expires_at timestamp, currently about 45 seconds. It stores all work
// in Postgres, so concurrent/replayed invocations are safe and claim leases
// recover an interrupted provider call.
//
// ENV (same as push-ping): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, optional VAPID_SUBJECT.
// Operational bounds: 1 KiB signed request, 5s DB/provider timeouts, at most
// 64 claim rounds with <=5s sleeps, SQL-owned maximum of four attempts/device,
// and hard termination at call expiry (normally ~45s, far below Netlify's
// 15-minute background limit). The route is limited to 120 jobs/IP/domain/min.

import {
  callStartDispatchSignature,
  callDispatchSignature,
  communicationDispatchSignature,
  configureWebPush,
  dispatchCallDeliveryBatch,
  dispatchCallTerminalBatch,
  dispatchCommunicationPush,
  parseRows,
  validCallDispatchSignature,
  validCallStartDispatchSignature,
  validCommunicationDispatchSignature
} from './_shared/push-delivery.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REQUEST_BYTES = 1024;
const DB_TIMEOUT_MS = 5000;
const MAX_ROUNDS = 128;
const MIN_WAIT_MS = 250;
const MAX_WAIT_MS = 5000;
const LEASE_RECOVERY_MS = 20_500;
// A queued worker can start before a call transaction waits on participant
// locks. Stay below the 45-second ring lifetime but well beyond the endpoint's
// 8-second upstream timeout so response-loss retries still find late commits.
const START_COMMIT_WAIT_MS = 30_000;
const START_COMMIT_POLL_MS = 200;
const COMMUNICATION_JOB_MS = 75_000;
const CALL_SELECT =
  'id,caller,callee,kind,status,expires_at,caller_lease_expires_at,client_request_id';

export const config = {
  background: true,
  // A custom path is required for Netlify's function-level rateLimit config to
  // be applied. No browser code uses this route; push-ping and call-start sign
  // each request with a server-only secret.
  path: '/api/internal/call-push-dispatch',
  method: 'POST',
  // Signature validation protects data/provider actions. Platform rate limiting
  // additionally bounds the cost of invalid jobs, which background mode queues
  // before user code can reject their payload.
  rateLimit: {
    windowLimit: 120,
    windowSize: 60,
    aggregateBy: ['ip', 'domain']
  }
};

function sleep(ms) {
  const delay = Number.isFinite(ms) ? Math.max(0, ms) : MIN_WAIT_MS;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function boundedWait(target, deadline, now = Date.now()) {
  const delay = Math.max(
    MIN_WAIT_MS,
    Math.min(MAX_WAIT_MS, Math.max(0, target - now), Math.max(0, deadline - now))
  );
  return Number.isFinite(delay) ? delay : MIN_WAIT_MS;
}

function nextPendingAt(rows, now = Date.now()) {
  const candidates = [];
  for (const row of rows) {
    const status = String(row?.status || '');
    const attemptCount = Number(row?.attempt_count || 0);
    if (status === 'dispatching') {
      const updatedAt = Date.parse(String(row?.updated_at || ''));
      candidates.push(Number.isFinite(updatedAt) ? updatedAt + LEASE_RECOVERY_MS : now + 1000);
      continue;
    }
    if (status !== 'queued' && status !== 'failed') continue;
    if (status === 'failed' && (!Number.isFinite(attemptCount) || attemptCount >= 4)) continue;
    const retryAt = Date.parse(String(row?.next_attempt_at || ''));
    // Postgres serializes infinity as a non-date string; it is terminal here.
    if (Number.isFinite(retryAt)) candidates.push(retryAt);
  }
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

async function readBody(req) {
  const declared = req.headers.get('content-length');
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_REQUEST_BYTES) return null;
  }
  const raw = await req.text().catch(() => '');
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function callDeepLink(callId) {
  return `/mensagens/?callId=${encodeURIComponent(callId)}`;
}

async function loadCall(sbAdmin, callId) {
  const response = await sbAdmin(
    `/rest/v1/call_sessions?id=eq.${callId}` +
      `&select=${CALL_SELECT}&limit=1`
  ).catch(() => null);
  if (!response?.ok) return { unavailable: true, call: null };
  const rows = await parseRows(response);
  const call = rows[0];
  if (
    !call ||
    call.id !== callId ||
    !UUID_RE.test(String(call.caller || '')) ||
    !UUID_RE.test(String(call.callee || '')) ||
    !['audio', 'video'].includes(call.kind) ||
    typeof call.expires_at !== 'string' ||
    !Number.isFinite(Date.parse(call.expires_at))
  ) return { unavailable: false, call: null };
  return { unavailable: false, call };
}

async function loadCallByRequest(sbAdmin, caller, requestId) {
  const response = await sbAdmin(
    `/rest/v1/call_sessions?caller=eq.${caller}` +
      `&client_request_id=eq.${requestId}&select=${CALL_SELECT}&limit=1`
  ).catch(() => null);
  if (!response?.ok) return { unavailable: true, call: null };
  const rows = await parseRows(response);
  const call = rows[0];
  if (
    !call ||
    call.caller !== caller ||
    call.client_request_id !== requestId ||
    !UUID_RE.test(String(call.id || '')) ||
    !UUID_RE.test(String(call.callee || '')) ||
    !['audio', 'video'].includes(call.kind) ||
    typeof call.expires_at !== 'string' ||
    !Number.isFinite(Date.parse(call.expires_at))
  ) return { unavailable: false, call: null };
  return { unavailable: false, call };
}

/**
 * A reliable-start worker is intentionally queued before the creating
 * transaction. Resolve its idempotency key for a short bounded window; a
 * failed start simply leaves nothing to dispatch and this job exits.
 */
export async function resolveQueuedCall(
  sbAdmin,
  selector,
  {
    now = () => Date.now(),
    sleepFn = sleep,
    waitMs = START_COMMIT_WAIT_MS,
    pollMs = START_COMMIT_POLL_MS,
    maxPollMs = 1_000
  } = {}
) {
  if (selector?.callId) return loadCall(sbAdmin, selector.callId);
  const caller = selector?.caller;
  const requestId = selector?.requestId;
  if (!UUID_RE.test(String(caller || '')) || !UUID_RE.test(String(requestId || ''))) {
    return { unavailable: false, call: null };
  }
  const deadline = now() + Math.max(0, waitMs);
  let lastUnavailable = false;
  let delay = Math.max(1, pollMs);
  const maxDelay = Math.max(delay, maxPollMs);
  while (true) {
    const state = await loadCallByRequest(sbAdmin, caller, requestId);
    if (state.call) return state;
    lastUnavailable = state.unavailable;
    const remaining = deadline - now();
    if (remaining <= 0) return { unavailable: lastUnavailable, call: null };
    await sleepFn(Math.max(1, Math.min(delay, remaining)));
    delay = Math.min(maxDelay, Math.ceil(delay * 1.6));
  }
}

function callIsLive(call, now = Date.now()) {
  const expiresAt = Date.parse(String(call?.expires_at || ''));
  const callerLease = Date.parse(String(call?.caller_lease_expires_at || ''));
  return call?.status === 'ringing' &&
    Number.isFinite(expiresAt) &&
    expiresAt > now &&
    Number.isFinite(callerLease) &&
    callerLease > now;
}

async function loadCallerName(sbAdmin, caller) {
  const response = await sbAdmin(
    `/rest/v1/accounts?id=eq.${caller}&select=display_name,handle&limit=1`
  ).catch(() => null);
  if (!response?.ok) return 'Alguém especial';
  const rows = await parseRows(response);
  const profile = rows[0];
  return String(
    profile?.display_name || (profile?.handle ? `@${profile.handle}` : 'Alguém especial')
  ).slice(0, 54);
}

async function inspectPending(sbAdmin, callId) {
  const [callState, deliveryResponse] = await Promise.all([
    loadCall(sbAdmin, callId),
    sbAdmin(
      `/rest/v1/call_deliveries?call_id=eq.${callId}` +
        '&channel=eq.push&select=status,attempt_count,next_attempt_at,updated_at&limit=50'
    ).catch(() => null)
  ]);
  if (callState.unavailable || !deliveryResponse?.ok) return { unavailable: true };
  if (!callState.call || !callIsLive(callState.call)) return { unavailable: false, live: false };
  const rows = await parseRows(deliveryResponse);
  return {
    unavailable: false,
    live: true,
    nextAt: nextPendingAt(rows)
  };
}

async function inspectTerminalPending(sbAdmin, callId) {
  const [outboxResponse, deliveryResponse] = await Promise.all([
    sbAdmin(
      `/rest/v1/call_terminal_outbox?call_id=eq.${callId}` +
        '&select=status,next_attempt_at&limit=1'
    ).catch(() => null),
    sbAdmin(
      `/rest/v1/call_deliveries?call_id=eq.${callId}` +
        '&channel=eq.push_terminal&select=status,attempt_count,next_attempt_at,updated_at&limit=50'
    ).catch(() => null)
  ]);
  if (!outboxResponse?.ok || !deliveryResponse?.ok) return { unavailable: true };
  const [outboxes, rows] = await Promise.all([
    parseRows(outboxResponse),
    parseRows(deliveryResponse)
  ]);
  const status = String(outboxes[0]?.status || '');
  if (status === 'sent' || status === 'failed' || !status) {
    return { unavailable: false, nextAt: null };
  }
  return { unavailable: false, nextAt: nextPendingAt(rows) ?? Date.now() + 500 };
}

async function expireCallForDelivery(sbAdmin, callId) {
  const response = await sbAdmin('/rest/v1/rpc/expire_call_for_delivery', {
    method: 'POST',
    body: JSON.stringify({ p_call: callId })
  }).catch(() => null);
  return response?.ok === true;
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const body = await readBody(req);
  const directCallId = typeof body?.callId === 'string' && UUID_RE.test(body.callId)
    ? body.callId
    : null;
  const startCaller = typeof body?.caller === 'string' && UUID_RE.test(body.caller)
    ? body.caller
    : null;
  const startRequestId = typeof body?.requestId === 'string' && UUID_RE.test(body.requestId)
    ? body.requestId
    : null;
  const communicationEventId = typeof body?.eventId === 'string' && UUID_RE.test(body.eventId)
    ? body.eventId
    : null;
  const bodyKeys = body ? Object.keys(body) : [];
  const directMode = Boolean(
    directCallId && bodyKeys.length === 1 && bodyKeys[0] === 'callId'
  );
  const reliableStartMode = Boolean(
    !directCallId &&
    startCaller &&
    startRequestId &&
    bodyKeys.length === 2 &&
    bodyKeys.every((key) => key === 'caller' || key === 'requestId')
  );
  const communicationMode = Boolean(
    !directCallId && !startCaller && !startRequestId && communicationEventId &&
    bodyKeys.length === 1 && bodyKeys[0] === 'eventId'
  );

  const supabaseUrl = Netlify.env.get('VITE_SUPABASE_URL');
  const serviceRole = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublic = Netlify.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Netlify.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Netlify.env.get('VAPID_SUBJECT') || 'mailto:noreply@presuntinho.love';
  const signature = req.headers.get('x-presuntinho-dispatch-signature') || '';
  const validSignature = directMode
    ? validCallDispatchSignature(serviceRole, directCallId, signature)
    : reliableStartMode
      ? validCallStartDispatchSignature(
          serviceRole,
          startCaller,
          startRequestId,
          signature
        )
      : communicationMode
        ? validCommunicationDispatchSignature(serviceRole, communicationEventId, signature)
      : false;
  if (
    (!directMode && !reliableStartMode && !communicationMode) ||
    !supabaseUrl ||
    !serviceRole ||
    !vapidPublic ||
    !vapidPrivate ||
    !validSignature
  ) return new Response(null, { status: 403 });

  try {
    configureWebPush(vapidSubject, vapidPublic, vapidPrivate);
  } catch {
    return new Response(null, { status: 503 });
  }

  const sbAdmin = (path, init = {}) =>
    fetch(`${supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: serviceRole,
        authorization: `Bearer ${serviceRole}`,
        'content-type': 'application/json',
        ...(init.headers || {})
      },
      signal: init.signal || AbortSignal.timeout(DB_TIMEOUT_MS)
    });

  if (communicationMode) {
    const jobDeadline = Date.now() + COMMUNICATION_JOB_MS;
    for (let round = 0; round < MAX_ROUNDS && Date.now() < jobDeadline; round++) {
      const dispatch = await dispatchCommunicationPush({
        sbAdmin,
        eventId: communicationEventId
      });
      if (dispatch.httpStatus >= 500) {
        await sleep(Math.min(1000, Math.max(1, jobDeadline - Date.now())));
        continue;
      }
      if (dispatch.result.status !== 'retrying') {
        return new Response(null, { status: 204 });
      }
      const response = await sbAdmin(
        `/rest/v1/communication_push_outbox?event_id=eq.${communicationEventId}` +
          '&select=status,next_attempt_at,expires_at&limit=1'
      ).catch(() => null);
      if (!response?.ok) {
        await sleep(1000);
        continue;
      }
      const row = (await parseRows(response))[0];
      if (!row || !['queued', 'failed', 'dispatching'].includes(String(row.status || ''))) {
        return new Response(null, { status: 204 });
      }
      const nextAt = Date.parse(String(row.next_attempt_at || ''));
      const expiresAt = Date.parse(String(row.expires_at || ''));
      if (!Number.isFinite(nextAt) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        return new Response(null, { status: 204 });
      }
      await sleep(boundedWait(nextAt + 50, Math.min(expiresAt, jobDeadline)));
    }
    return new Response(null, { status: 204 });
  }

  let callState = await resolveQueuedCall(
    sbAdmin,
    directMode
      ? { callId: directCallId }
      : { caller: startCaller, requestId: startRequestId }
  );
  if (callState.unavailable) return new Response(null, { status: 503 });
  if (!callState.call) return new Response(null, { status: 204 });
  const initialCall = callState.call;
  const callId = initialCall.id;
  const deadline = Date.parse(initialCall.expires_at);
  const callerName = await loadCallerName(sbAdmin, initialCall.caller);
  const title = initialCall.kind === 'video' ? '📹 Videochamada recebida' : '📞 Chamada recebida';
  const bodyText = `${callerName} está a ligar-te.`.slice(0, 160);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    callState = await loadCall(sbAdmin, callId);
    if (callState.unavailable) {
      await sleep(750);
      continue;
    }
    const call = callState.call;
    if (!call) return new Response(null, { status: 204 });

    if (call.status === 'ringing') {
      if (!callIsLive(call)) {
        // Only the service-role worker can call this RPC. The SQL predicate is
        // objective, so a delayed/forged wakeup cannot end a live call early.
        await expireCallForDelivery(sbAdmin, callId);
        await sleep(250);
        continue;
      }

      const dispatch = await dispatchCallDeliveryBatch({
        sbAdmin,
        callId,
        target: call.callee,
        eventId: callId,
        title,
        body: bodyText,
        url: callDeepLink(callId),
        senderId: call.caller
      });
      if (dispatch.httpStatus >= 500) {
        await sleep(boundedWait(Date.now() + 1000, deadline));
        continue;
      }

      const pending = await inspectPending(sbAdmin, callId);
      if (pending.unavailable) {
        await sleep(boundedWait(Date.now() + 1000, deadline));
        continue;
      }
      // Stay alive after provider acceptance. A terminal transition must be
      // observed by this server-side worker even if both browser tabs close.
      const nextCheck = pending.nextAt === null
        ? Date.now() + 750
        : pending.nextAt + 50;
      await sleep(boundedWait(nextCheck, deadline + 1000));
      continue;
    }

    if (
      ['accepted', 'declined', 'cancelled', 'ended', 'missed', 'failed'].includes(call.status)
    ) {
      const terminal = await dispatchCallTerminalBatch({
        sbAdmin,
        callId,
        target: call.callee,
        eventId: callId,
        url: callDeepLink(callId),
        senderId: call.caller,
        callerName
      });
      if (terminal.httpStatus >= 500) {
        await sleep(1000);
        continue;
      }
      const pending = await inspectTerminalPending(sbAdmin, callId);
      if (pending.unavailable) {
        await sleep(1000);
        continue;
      }
      if (pending.nextAt === null) return new Response(null, { status: 204 });
      await sleep(Math.max(MIN_WAIT_MS, Math.min(MAX_WAIT_MS, pending.nextAt - Date.now() + 50)));
      continue;
    }

    return new Response(null, { status: 204 });
  }

  return new Response(null, { status: 204 });
}

// Exported only for deterministic unit tests; production callers send the
// HMAC header generated by push-ping and never receive the service-role key.
export function signedDispatchRequest(url, secret, callId) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-presuntinho-dispatch-signature': callDispatchSignature(secret, callId)
    },
    body: JSON.stringify({ callId })
  });
}

export function signedStartDispatchRequest(url, secret, caller, requestId) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-presuntinho-dispatch-signature': callStartDispatchSignature(
        secret,
        caller,
        requestId
      )
    },
    body: JSON.stringify({ caller, requestId })
  });
}

export function signedCommunicationDispatchRequest(url, secret, eventId) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-presuntinho-dispatch-signature': communicationDispatchSignature(secret, eventId)
    },
    body: JSON.stringify({ eventId })
  });
}
