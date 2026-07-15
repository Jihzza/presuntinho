// netlify/functions/push-ping.js
//
// Entrega um ping de casal (amor/saudades) como WEB PUSH real nos dispositivos
// do parceiro — funciona com a app fechada, ao contrário do broadcast realtime.
//
// SEGURANÇA — o JWT do remetente valida a identidade e a relação/call row.
// As chaves privadas de entrega em push_subscriptions são lidas apenas aqui,
// com a service role do ambiente Netlify; nunca ficam legíveis por contactos
// através da API pública e nunca são devolvidas ao browser.
//
// ENV: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
//      VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
//
// POST { eventId?, kind: 'love'|'nudge'|'message'|'call'|'test', callId?, to?, title?, body?, url? }
//   → { sent: n }
//   • love/nudge → destinatário = parceiro do casal ativo (couple_partner)
//   • message    → destinatário = `to`; a RLS só devolve subscrições de
//                  contactos ligados/casal, por isso não há como notificar
//                  estranhos — a query volta vazia.

import webpush from 'web-push';
import { randomUUID } from 'node:crypto';

// 'test' entrega ao PRÓPRIO remetente (auto-diagnóstico do botão de teste).
const KINDS = new Set(['love', 'nudge', 'message', 'call', 'test']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64URL_RE = /^[A-Za-z0-9_-]+={0,2}$/;
const PUSH_EVENT_TYPE = 'presuntinho:push-event';
const APP_ORIGIN = 'https://presuntinho.love';
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_P256DH_LENGTH = 256;
const MAX_AUTH_LENGTH = 128;
const MAX_SUBSCRIPTIONS = 10;
const MAX_SUBSCRIPTION_ROWS = 50;
const WEB_PUSH_TIMEOUT_MS = 8000;

// Keep the public response deliberately opaque. The caller only needs the
// delivery count; provider hosts/statuses and internal failure reasons stay in
// server logs.
const reply = (status, sent = 0) =>
  new Response(JSON.stringify({ sent }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

function canonicalAppUrl(value) {
  if (typeof value !== 'string' || value.length > 120) return '/';
  try {
    const parsed = new URL(value, APP_ORIGIN);
    if (
      parsed.origin !== APP_ORIGIN ||
      parsed.username ||
      parsed.password
    ) return '/';
    const relative = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return relative.length <= 120 ? relative : '/';
  } catch {
    return '/';
  }
}

function allowedPushHost(hostname) {
  return hostname === 'fcm.googleapis.com' ||
    hostname === 'updates.push.services.mozilla.com' ||
    hostname === 'web.push.apple.com' ||
    hostname === 'notify.windows.com' ||
    hostname.endsWith('.notify.windows.com');
}

function validPushKey(value, maxLength) {
  return typeof value === 'string' &&
    value.length >= 16 &&
    value.length <= maxLength &&
    BASE64URL_RE.test(value);
}

function safeSubscription(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  if (
    typeof row.endpoint !== 'string' ||
    row.endpoint.length === 0 ||
    row.endpoint.length > MAX_ENDPOINT_LENGTH ||
    !validPushKey(row.p256dh, MAX_P256DH_LENGTH) ||
    !validPushKey(row.auth, MAX_AUTH_LENGTH)
  ) return null;
  try {
    const endpoint = new URL(row.endpoint);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.port !== '' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash ||
      !allowedPushHost(endpoint.hostname)
    ) return null;
    return {
      endpoint: endpoint.href,
      keys: { p256dh: row.p256dh, auth: row.auth }
    };
  } catch {
    return null;
  }
}

export default async (req) => {
  if (req.method !== 'POST') return reply(405);

  const contentLength = req.headers.get('content-length');
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength < 0 ||
      declaredLength > MAX_REQUEST_BYTES
    ) return reply(413);
  }

  const SUPABASE_URL = Netlify.env.get('VITE_SUPABASE_URL');
  const ANON = Netlify.env.get('VITE_SUPABASE_ANON_KEY');
  const SERVICE_ROLE = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const PUB = Netlify.env.get('VAPID_PUBLIC_KEY');
  const PRIV = Netlify.env.get('VAPID_PRIVATE_KEY');
  const SUBJECT = Netlify.env.get('VAPID_SUBJECT') || 'mailto:noreply@presuntinho.love';
  if (!SUPABASE_URL || !ANON || !SERVICE_ROLE || !PUB || !PRIV) {
    return reply(503);
  }

  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return reply(401);

  let rawPayload;
  try {
    rawPayload = await req.text();
  } catch {
    return reply(400);
  }
  if (new TextEncoder().encode(rawPayload).byteLength > MAX_REQUEST_BYTES) return reply(413);
  let payload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return reply(400);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return reply(400);
  }
  const kind = KINDS.has(payload.kind) ? payload.kind : null;
  if (!kind) return reply(400);
  const callId = kind === 'call' && typeof payload.callId === 'string' && UUID_RE.test(payload.callId)
    ? payload.callId
    : null;
  if (kind === 'call' && !callId) return reply(400);
  // Texto vem do cliente (já localizado); só limitamos o tamanho. O url tem
  // de ser um path interno (a notificação abre a própria app).
  let title = String(payload.title || (kind === 'love' ? '💛 Amo-te muito!' : kind === 'nudge' ? '👀 Saudades tuas!' : '💬 Nova mensagem')).slice(0, 80);
  let body = String(payload.body || '').slice(0, 160);
  let url = canonicalAppUrl(typeof payload.url === 'string' ? payload.url : '/');
  const suppliedEventId = typeof payload.eventId === 'string' && UUID_RE.test(payload.eventId)
    ? payload.eventId
    : null;
  if ((kind === 'love' || kind === 'nudge') && !suppliedEventId) return reply(400);
  const eventId = suppliedEventId || randomUUID();
  // Destinatário explícito é exclusivo de mensagens/DMs. Love/nudge ignoram
  // qualquer `to` fornecido pelo cliente e resolvem sempre o parceiro no servidor.
  const explicitTo =
    kind === 'message' && typeof payload.to === 'string' && UUID_RE.test(payload.to) ? payload.to : null;

  const sbUser = (path, init = {}) =>
    fetch(`${SUPABASE_URL}${path}`, {
      ...init,
      headers: { apikey: ANON, authorization: auth, 'content-type': 'application/json', ...(init.headers || {}) }
    });
  const sbAdmin = (path, init = {}) =>
    fetch(`${SUPABASE_URL}${path}`, {
      ...init,
      headers: {
        apikey: SERVICE_ROLE,
        authorization: `Bearer ${SERVICE_ROLE}`,
        'content-type': 'application/json',
        ...(init.headers || {})
      }
    });

  // 1) o token é válido? (guarda o id — o modo teste entrega a si próprio)
  const userRes = await sbUser('/auth/v1/user');
  if (!userRes.ok) return reply(401);
  const user = await userRes.json().catch(() => null);
  const senderId = typeof user?.id === 'string' && UUID_RE.test(user.id) ? user.id : null;
  if (!senderId) return reply(401);

  // 2) Calls are never routed from browser-supplied identities. Validate the
  //    live row under the caller's own RLS policy, then derive the callee.
  let target = kind === 'test' ? senderId : explicitTo;
  let callExpiresAt = null;
  if (kind === 'call') {
    const callRes = await sbUser(
      `/rest/v1/call_sessions?id=eq.${callId}&select=id,caller,callee,kind,status,expires_at&limit=1`
    );
    if (!callRes.ok) return reply(502);
    const calls = await callRes.json().catch(() => []);
    const call = Array.isArray(calls) ? calls[0] : null;
    if (!call || call.caller !== senderId || !UUID_RE.test(String(call.callee || ''))) {
      return reply(403);
    }
    if (call.status !== 'ringing' || !call.expires_at || Date.parse(call.expires_at) <= Date.now()) {
      return reply(409);
    }
    callExpiresAt = call.expires_at;
    target = call.callee;
    const profileRes = await sbUser(`/rest/v1/accounts?id=eq.${senderId}&select=display_name,handle&limit=1`);
    const profiles = profileRes.ok ? await profileRes.json().catch(() => []) : [];
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    const callerName = String(profile?.display_name || (profile?.handle ? `@${profile.handle}` : 'Alguém especial')).slice(0, 54);
    title = call.kind === 'video' ? '📹 Videochamada recebida' : '📞 Chamada recebida';
    body = `${callerName} está a ligar-te.`.slice(0, 160);
    url = '/mensagens/';
  } else if (kind === 'message') {
    // Derive the peer from this exact recent message. Old cached couple clients
    // do not send `to`; new clients may send it, but it is only a consistency
    // check and never the source of authority.
    const targetRes = await sbUser('/rest/v1/rpc/chat_push_target', {
      method: 'POST',
      body: JSON.stringify({ p_message: eventId })
    });
    if (!targetRes.ok) return reply(502);
    const derivedTarget = await targetRes.json().catch(() => null);
    if (typeof derivedTarget !== 'string' || !UUID_RE.test(derivedTarget)) {
      return reply(403);
    }
    if (explicitTo && explicitTo !== derivedTarget) return reply(403);
    target = derivedTarget;
  } else if (!target) {
    const partnerRes = await sbUser('/rest/v1/rpc/couple_partner', { method: 'POST', body: '{}' });
    if (!partnerRes.ok) return reply(502);
    const partner = await partnerRes.json().catch(() => null);
    if (typeof partner !== 'string' || !UUID_RE.test(partner)) return reply(200);
    target = partner;
  }

  // 3) As chaves de entrega são dados privados. Só esta função server-side as
  //    lê; a autorização do destino já foi provada acima com o JWT do remetente.
  const subsRes = await sbAdmin(
    `/rest/v1/push_subscriptions?account=eq.${target}` +
      `&select=endpoint,p256dh,auth&order=created_at.desc&limit=${MAX_SUBSCRIPTION_ROWS}`
  );
  if (!subsRes.ok) return reply(502);
  const subscriptionRows = await subsRes.json().catch(() => []);
  const subs = (Array.isArray(subscriptionRows) ? subscriptionRows : [])
    .map(safeSubscription)
    .filter(Boolean)
    .slice(0, MAX_SUBSCRIPTIONS);
  if (subs.length === 0) return reply(200);

  if (kind === 'love' || kind === 'nudge') {
    // The persisted ping row is the authority and the claim is atomic. Resolve
    // the couple first, but claim only now, immediately before Web Push.
    const claimRes = await sbUser('/rest/v1/rpc/claim_couple_ping_push', {
      method: 'POST',
      body: JSON.stringify({ p_ping: eventId, p_kind: kind })
    });
    if (!claimRes.ok) return reply(502);
    const claimedTarget = await claimRes.json().catch(() => null);
    if (
      typeof claimedTarget !== 'string' ||
      !UUID_RE.test(claimedTarget) ||
      claimedTarget !== target
    ) return reply(200);
  }

  if (kind === 'call') {
    // Claim immediately before the external side effect, after all delivery
    // prerequisites exist. Concurrent/replayed requests may reach this point,
    // but exactly one can receive `true` and send the push.
    const claimRes = await sbUser('/rest/v1/rpc/claim_call_push', {
      method: 'POST',
      body: JSON.stringify({ p_call: callId })
    });
    if (!claimRes.ok) return reply(502);
    const claimed = await claimRes.json().catch(() => false);
    if (claimed !== true) {
      return reply(200);
    }
  }

  try {
    webpush.setVapidDetails(SUBJECT, PUB, PRIV);
  } catch {
    return reply(503);
  }
  const message = JSON.stringify({
    type: PUSH_EVENT_TYPE,
    eventId,
    kind,
    title,
    body,
    url,
    senderId,
    ...(callId ? { callId, expiresAt: callExpiresAt } : {})
  });

  const callTtl = callExpiresAt
    ? Math.max(1, Math.min(90, Math.ceil((Date.parse(callExpiresAt) - Date.now()) / 1000)))
    : 90;

  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          s,
          message,
          {
            TTL: kind === 'call' ? callTtl : 60 * 60,
            urgency: 'high',
            timeout: WEB_PUSH_TIMEOUT_MS
          }
        );
        sent++;
      } catch (e) {
        // 404/410 = subscrição morta (limpa quando o dono reativar); resto é
        // best-effort — o broadcast realtime continua a ser o caminho rápido.
        const status = e?.statusCode || 0;
        console.warn('[push-ping] delivery failed', kind, 'status', status);
      }
    })
  );

  return reply(200, sent);
}
