// @ts-nocheck -- Netlify runtime globals live outside the Svelte TS build.
// Durable Web Push delivery for couple pings, DMs and incoming calls.
//
// Calls use a transactional outbox + one delivery per installation. Claiming
// is only a short sending lease; provider acceptance is recorded after the
// external side effect. A replay therefore sends only pending/retryable rows.

import { randomUUID } from 'node:crypto';
import {
  callDispatchSignature,
  communicationDispatchSignature,
  configureWebPush,
  dispatchCallDeliveryBatch,
  dispatchCallTerminalBatch,
  dispatchCommunicationPush,
  emptyDeliveryResult as emptyResult,
  parseRows,
  retryableProviderStatus,
  safeSubscription
} from './_shared/push-delivery.js';

export { retryableProviderStatus, safeSubscription };

const KINDS = new Set(['love', 'nudge', 'message', 'call', 'test', 'game_invite']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_ORIGIN = 'https://presuntinho.love';
const MAX_REQUEST_BYTES = 16 * 1024;

export const config = {
  // Keep the default historical route explicitly: installed PWAs can execute
  // cached bundles for days after this release.
  path: ['/api/push-ping', '/.netlify/functions/push-ping'],
  method: 'POST',
  // Authentication and durable claims remain authoritative. This platform
  // bound prevents replay of one valid call id from creating unbounded DB,
  // provider and background-function work.
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ['ip', 'domain']
  }
};

function reply(httpStatus, result = emptyResult(httpStatus >= 500 ? 'unavailable' : 'failed')) {
  return new Response(JSON.stringify(result), {
    status: httpStatus,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

export function canonicalAppUrl(value) {
  if (typeof value !== 'string' || value.length > 160) return '/';
  try {
    const parsed = new URL(value, APP_ORIGIN);
    if (parsed.origin !== APP_ORIGIN || parsed.username || parsed.password) return '/';
    const relative = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return relative.length <= 160 ? relative : '/';
  } catch {
    return '/';
  }
}

function callDeepLink(callId) {
  return `/mensagens/?callId=${encodeURIComponent(callId)}`;
}

async function queueBackgroundDispatch(req, callId, serviceRole) {
  const endpoint = new URL('/api/internal/call-push-dispatch', req.url);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-presuntinho-dispatch-signature': callDispatchSignature(serviceRole, callId)
      },
      body: JSON.stringify({ callId }),
      signal: AbortSignal.timeout(5000)
    });
    // A Background Function acknowledges durable platform queueing with 202;
    // no other response is treated as proof that the worker will run.
    return response.status === 202;
  } catch (error) {
    console.warn('[push-ping] background dispatcher could not be queued', error?.message || error);
    return false;
  }
}

async function queueCommunicationDispatch(req, eventId, serviceRole) {
  const endpoint = new URL('/api/internal/call-push-dispatch', req.url);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-presuntinho-dispatch-signature': communicationDispatchSignature(serviceRole, eventId)
      },
      body: JSON.stringify({ eventId }),
      signal: AbortSignal.timeout(5000)
    });
    return response.status === 202;
  } catch (error) {
    console.warn('[push-ping] communication dispatcher could not be queued', error?.message || error);
    return false;
  }
}

export default async function handler(req, context) {
  if (req.method !== 'POST') return reply(405, emptyResult('invalid'));

  const contentLength = req.headers.get('content-length');
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength < 0 ||
      declaredLength > MAX_REQUEST_BYTES
    ) return reply(413, emptyResult('invalid'));
  }

  const supabaseUrl = Netlify.env.get('VITE_SUPABASE_URL');
  const anon = Netlify.env.get('VITE_SUPABASE_ANON_KEY');
  const serviceRole = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublic = Netlify.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Netlify.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Netlify.env.get('VAPID_SUBJECT') || 'mailto:noreply@presuntinho.love';
  if (!supabaseUrl || !anon || !serviceRole || !vapidPublic || !vapidPrivate) {
    return reply(503, emptyResult('unavailable'));
  }

  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return reply(401, emptyResult('unauthorized'));

  let rawPayload;
  try {
    rawPayload = await req.text();
  } catch {
    return reply(400, emptyResult('invalid'));
  }
  if (new TextEncoder().encode(rawPayload).byteLength > MAX_REQUEST_BYTES) {
    return reply(413, emptyResult('invalid'));
  }
  let payload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return reply(400, emptyResult('invalid'));
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return reply(400, emptyResult('invalid'));
  }

  const kind = KINDS.has(payload.kind) ? payload.kind : null;
  if (!kind) return reply(400, emptyResult('invalid'));
  const callId = kind === 'call' && typeof payload.callId === 'string' && UUID_RE.test(payload.callId)
    ? payload.callId
    : null;
  if (kind === 'call' && !callId) return reply(400, emptyResult('invalid'));

  let title = String(
    payload.title ||
      (kind === 'love'
        ? '💛 Amo-te muito!'
        : kind === 'nudge'
          ? '👀 Saudades tuas!'
          : kind === 'game_invite'
            ? '🎮 Convite para jogar'
            : '💬 Nova mensagem')
  ).slice(0, 80);
  let body = String(payload.body || '').slice(0, 160);
  let url = canonicalAppUrl(typeof payload.url === 'string' ? payload.url : '/');
  const suppliedEventId = typeof payload.eventId === 'string' && UUID_RE.test(payload.eventId)
    ? payload.eventId
    : null;
  if ((kind === 'love' || kind === 'nudge' || kind === 'message' || kind === 'game_invite') && !suppliedEventId) {
    return reply(400, emptyResult('invalid'));
  }
  // A call keeps the same semantic id across provider retries, so foreground
  // clients and notification tags can deduplicate a replay.
  const eventId = kind === 'call' ? callId : (suppliedEventId || randomUUID());
  const explicitTo =
    kind === 'message' && typeof payload.to === 'string' && UUID_RE.test(payload.to)
      ? payload.to
      : null;

  const sbUser = (path, init = {}) =>
    fetch(`${supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: anon,
        authorization: auth,
        'content-type': 'application/json',
        ...(init.headers || {})
      }
    });
  const sbAdmin = (path, init = {}) =>
    fetch(`${supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: serviceRole,
        authorization: `Bearer ${serviceRole}`,
        'content-type': 'application/json',
        ...(init.headers || {})
      }
    });

  let callCallerName = 'Alguém especial';

  const userRes = await sbUser('/auth/v1/user').catch(() => null);
  if (!userRes?.ok) return reply(401, emptyResult('unauthorized'));
  const user = await userRes.json().catch(() => null);
  const senderId = typeof user?.id === 'string' && UUID_RE.test(user.id) ? user.id : null;
  if (!senderId) return reply(401, emptyResult('unauthorized'));

  let target = kind === 'test' ? senderId : explicitTo;
  if (kind === 'game_invite') {
    const inviteRes = await sbUser(
      `/rest/v1/game_invites?id=eq.${eventId}&from_account=eq.${senderId}` +
        '&select=id,from_account,to_account,room_code,game,expires_at,cancelled_at&limit=1'
    ).catch(() => null);
    if (!inviteRes?.ok) return reply(502, emptyResult('unavailable'));
    const invite = (await parseRows(inviteRes))[0];
    if (
      !invite ||
      invite.game !== 'versus' ||
      invite.cancelled_at !== null ||
      !UUID_RE.test(String(invite.to_account || '')) ||
      !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(String(invite.room_code || '')) ||
      !Number.isFinite(Date.parse(String(invite.expires_at || ''))) ||
      Date.parse(invite.expires_at) <= Date.now()
    ) return reply(409, emptyResult('expired'));
    target = invite.to_account;
    title = '🎮 Convite para jogar';
    body = `Entra na sala ${invite.room_code} com um toque.`;
    url = `/secrets/versus/?join=${invite.room_code}&invite=${eventId}`;
  }
  if (kind === 'call') {
    const callRes = await sbUser(
      `/rest/v1/call_sessions?id=eq.${callId}&select=id,caller,callee,kind,status,expires_at&limit=1`
    ).catch(() => null);
    if (!callRes?.ok) return reply(502, emptyResult('unavailable'));
    const calls = await parseRows(callRes);
    const call = calls[0];
    if (
      !call ||
      !UUID_RE.test(String(call.caller || '')) ||
      !UUID_RE.test(String(call.callee || '')) ||
      ![call.caller, call.callee].includes(senderId)
    ) {
      return reply(403, emptyResult('forbidden'));
    }
    if (call.status === 'ringing' && call.caller !== senderId) {
      return reply(403, emptyResult('forbidden'));
    }
    if (
      !['ringing', 'accepted', 'declined', 'cancelled', 'ended', 'missed', 'failed'].includes(call.status)
    ) {
      return reply(409, emptyResult('expired'));
    }
    target = call.callee;
    const profileRes = await sbAdmin(
      `/rest/v1/accounts?id=eq.${call.caller}&select=display_name,handle&limit=1`
    ).catch(() => null);
    const profiles = profileRes?.ok ? await parseRows(profileRes) : [];
    const profile = profiles[0];
    callCallerName = String(
      profile?.display_name || (profile?.handle ? `@${profile.handle}` : 'Alguém especial')
    ).slice(0, 54);
    title = call.kind === 'video' ? '📹 Videochamada recebida' : '📞 Chamada recebida';
    body = `${callCallerName} está a ligar-te.`.slice(0, 160);
    url = callDeepLink(callId);
  }

  // Calls have a separate, durable and retryable delivery path.
  if (kind === 'call') {
    try {
      configureWebPush(vapidSubject, vapidPublic, vapidPrivate);
    } catch {
      return reply(503, emptyResult('unavailable'));
    }
    const queued = await queueBackgroundDispatch(req, callId, serviceRole);
    const callRes = await sbAdmin(
      `/rest/v1/call_sessions?id=eq.${callId}` +
        '&select=id,caller,callee,status&limit=1'
    ).catch(() => null);
    const currentCall = callRes?.ok ? (await parseRows(callRes))[0] : null;
    if (!currentCall) return reply(502, emptyResult('unavailable'));

    if (currentCall.status !== 'ringing') {
      const terminal = await dispatchCallTerminalBatch({
        sbAdmin,
        callId,
        target: currentCall.callee,
        eventId,
        url,
        senderId: currentCall.caller,
        callerName: callCallerName
      });
      if (!queued && terminal.result.status === 'retrying') {
        return reply(503, { ...terminal.result, status: 'retrying' });
      }
      return reply(terminal.httpStatus, terminal.result);
    }

    const dispatch = await dispatchCallDeliveryBatch({
      sbAdmin,
      callId,
      target,
      eventId,
      title,
      body,
      url,
      senderId
    });
    if (!queued) {
      return reply(503, { ...dispatch.result, status: 'retrying' });
    }
    return reply(dispatch.httpStatus, dispatch.result);
  }

  // Source validation/claim and outbox creation are one Postgres transaction.
  // A crash after this point can only delay or duplicate the stable event; it
  // can no longer consume a chat/couple claim and lose the notification.
  let queuedEvent;
  if (kind === 'game_invite') {
    // The INSERT trigger is the durability boundary. This request only wakes
    // the worker and may arrive after the browser has already navigated away.
    const outboxRes = await sbAdmin(
      `/rest/v1/communication_push_outbox?event_id=eq.${eventId}` +
        '&select=event_id,status,target,sender,kind&limit=1'
    ).catch(() => null);
    if (!outboxRes?.ok) return reply(502, emptyResult('unavailable'));
    queuedEvent = (await parseRows(outboxRes))[0];
    if (
      !queuedEvent ||
      queuedEvent.kind !== 'game_invite' ||
      queuedEvent.sender !== senderId ||
      queuedEvent.target !== target
    ) return reply(403, emptyResult('forbidden'));
    if (queuedEvent.status === 'expired') return reply(409, emptyResult('expired'));
  } else {
    const enqueueRes = await sbUser('/rest/v1/rpc/enqueue_communication_push', {
      method: 'POST',
      body: JSON.stringify({
        p_event: eventId,
        p_kind: kind,
        p_title: title,
        p_body: body,
        p_url: url
      })
    }).catch(() => null);
    if (!enqueueRes?.ok) return reply(502, emptyResult('unavailable'));
    const enqueueRows = await parseRows(enqueueRes);
    queuedEvent = enqueueRows[0];
  }
  if (
    !queuedEvent ||
    queuedEvent.event_id !== eventId ||
    !UUID_RE.test(String(queuedEvent.target || ''))
  ) return reply(200, emptyResult('already-processed'));
  if (explicitTo && explicitTo !== queuedEvent.target) {
    return reply(403, emptyResult('forbidden'));
  }

  try {
    configureWebPush(vapidSubject, vapidPublic, vapidPrivate);
  } catch {
    // The committed outbox remains recoverable by the scheduled worker after
    // a transient/misconfigured function instance is repaired.
    return reply(503, emptyResult('retrying'));
  }

  const queued = await queueCommunicationDispatch(req, eventId, serviceRole);
  const dispatch = await dispatchCommunicationPush({ sbAdmin, eventId });
  if (!queued && dispatch.result.status === 'retrying') {
    return reply(503, { ...dispatch.result, status: 'retrying' });
  }
  return reply(dispatch.httpStatus, dispatch.result);
}
