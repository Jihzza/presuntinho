// netlify/functions/push-ping.js
//
// Entrega um ping de casal (amor/saudades) como WEB PUSH real nos dispositivos
// do parceiro — funciona com a app fechada, ao contrário do broadcast realtime.
//
// SEGURANÇA — a função NÃO tem service role. Tudo corre com o JWT do
// remetente (header Authorization) contra a API pública do Supabase:
//   1. /auth/v1/user valida o token e identifica o remetente;
//   2. rpc/couple_partner devolve o parceiro do casal ATIVO (ou null);
//   3. push_subscriptions do parceiro só é legível porque a RLS
//      (0014_push_subscriptions) concede select ao parceiro de casal.
// A única coisa privilegiada aqui é a chave VAPID privada (env), que assina
// os pushes — e essa nunca sai do servidor.
//
// ENV: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
//      VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (as mesmas do build).
//
// POST { eventId?, kind: 'love'|'nudge'|'message'|'test', to?, title?, body?, url? }
//   → { sent: n }
//   • love/nudge → destinatário = parceiro do casal ativo (couple_partner)
//   • message    → destinatário = `to`; a RLS só devolve subscrições de
//                  contactos ligados/casal, por isso não há como notificar
//                  estranhos — a query volta vazia.

import webpush from 'web-push';
import { randomUUID } from 'node:crypto';

// 'test' entrega ao PRÓPRIO remetente (auto-diagnóstico do botão de teste).
const KINDS = new Set(['love', 'nudge', 'message', 'test']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUSH_EVENT_TYPE = 'presuntinho:push-event';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });

  const SUPABASE_URL = Netlify.env.get('VITE_SUPABASE_URL');
  const ANON = Netlify.env.get('VITE_SUPABASE_ANON_KEY');
  const PUB = Netlify.env.get('VAPID_PUBLIC_KEY');
  const PRIV = Netlify.env.get('VAPID_PRIVATE_KEY');
  const SUBJECT = Netlify.env.get('VAPID_SUBJECT') || 'mailto:noreply@presuntinho.love';
  if (!SUPABASE_URL || !ANON || !PUB || !PRIV) return json(503, { error: 'not configured' });

  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'no token' });

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'bad json' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json(400, { error: 'bad json' });
  }
  const kind = KINDS.has(payload.kind) ? payload.kind : null;
  if (!kind) return json(400, { error: 'bad kind' });
  // Texto vem do cliente (já localizado); só limitamos o tamanho. O url tem
  // de ser um path interno (a notificação abre a própria app).
  const title = String(payload.title || (kind === 'love' ? '💛 Amo-te muito!' : kind === 'nudge' ? '👀 Saudades tuas!' : '💬 Nova mensagem')).slice(0, 80);
  const body = String(payload.body || '').slice(0, 160);
  const rawUrl = String(payload.url || '/');
  const url = rawUrl.startsWith('/') && !rawUrl.startsWith('//') ? rawUrl.slice(0, 120) : '/';
  const eventId = typeof payload.eventId === 'string' && UUID_RE.test(payload.eventId) ? payload.eventId : randomUUID();
  // Destinatário explícito é exclusivo de mensagens/DMs. Love/nudge ignoram
  // qualquer `to` fornecido pelo cliente e resolvem sempre o parceiro no servidor.
  const explicitTo =
    kind === 'message' && typeof payload.to === 'string' && UUID_RE.test(payload.to) ? payload.to : null;

  const sb = (path, init = {}) =>
    fetch(`${SUPABASE_URL}${path}`, {
      ...init,
      headers: { apikey: ANON, authorization: auth, 'content-type': 'application/json', ...(init.headers || {}) }
    });

  // 1) o token é válido? (guarda o id — o modo teste entrega a si próprio)
  const userRes = await sb('/auth/v1/user');
  if (!userRes.ok) return json(401, { error: 'bad token' });
  const user = await userRes.json().catch(() => null);
  const senderId = typeof user?.id === 'string' && UUID_RE.test(user.id) ? user.id : null;
  if (!senderId) return json(401, { error: 'bad token' });

  // 2) destinatário: explícito (mensagens), o próprio (teste) ou o parceiro
  //    do casal ativo (pings)
  let target = kind === 'test' ? senderId : explicitTo;
  if (!target) {
    const partnerRes = await sb('/rest/v1/rpc/couple_partner', { method: 'POST', body: '{}' });
    if (!partnerRes.ok) return json(502, { error: 'partner lookup failed' });
    const partner = await partnerRes.json();
    if (!partner) return json(200, { sent: 0, reason: 'no active couple' });
    target = partner;
  }

  // 3) subscrições do destinatário (RLS: só contactos ligados/casal as veem —
  //    para um estranho a query volta simplesmente vazia)
  const subsRes = await sb(`/rest/v1/push_subscriptions?account=eq.${target}&select=endpoint,p256dh,auth`);
  if (!subsRes.ok) return json(502, { error: 'subscriptions lookup failed' });
  const subs = await subsRes.json();
  if (!Array.isArray(subs) || subs.length === 0) return json(200, { sent: 0, reason: 'no subscriptions' });

  webpush.setVapidDetails(SUBJECT, PUB, PRIV);
  const message = JSON.stringify({
    type: PUSH_EVENT_TYPE,
    eventId,
    kind,
    title,
    body,
    url,
    senderId
  });

  let sent = 0;
  const results = [];
  await Promise.all(
    subs.map(async (s) => {
      const host = (() => {
        try {
          return new URL(s.endpoint).host;
        } catch {
          return '?';
        }
      })();
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
          { TTL: 60 * 60, urgency: 'high' }
        );
        sent++;
        results.push({ host, ok: true });
        console.log('[push-ping] delivered', kind, '→', host);
      } catch (e) {
        // 404/410 = subscrição morta (limpa quando o dono reativar); resto é
        // best-effort — o broadcast realtime continua a ser o caminho rápido.
        const status = e?.statusCode || 0;
        results.push({ host, ok: false, status });
        console.warn('[push-ping] send FAILED', kind, '→', host, 'status', status, e?.body || e?.message || '');
      }
    })
  );

  return json(200, { sent, of: subs.length, results });
}
