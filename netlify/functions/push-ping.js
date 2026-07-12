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
// POST { kind: 'love'|'nudge', title?, body? } → { sent: n }

import webpush from 'web-push';

const KINDS = new Set(['love', 'nudge']);

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const ANON = process.env.VITE_SUPABASE_ANON_KEY;
  const PUB = process.env.VAPID_PUBLIC_KEY;
  const PRIV = process.env.VAPID_PRIVATE_KEY;
  const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:noreply@presuntinho.love';
  if (!SUPABASE_URL || !ANON || !PUB || !PRIV) return json(503, { error: 'not configured' });

  const auth = event.headers.authorization || event.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'no token' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'bad json' });
  }
  const kind = KINDS.has(payload.kind) ? payload.kind : null;
  if (!kind) return json(400, { error: 'bad kind' });
  // Texto vem do cliente (já localizado); só limitamos o tamanho.
  const title = String(payload.title || (kind === 'love' ? '💛 Amo-te muito!' : '👀 Saudades tuas!')).slice(0, 80);
  const body = String(payload.body || '').slice(0, 160);

  const sb = (path, init = {}) =>
    fetch(`${SUPABASE_URL}${path}`, {
      ...init,
      headers: { apikey: ANON, authorization: auth, 'content-type': 'application/json', ...(init.headers || {}) }
    });

  // 1) o token é válido?
  const userRes = await sb('/auth/v1/user');
  if (!userRes.ok) return json(401, { error: 'bad token' });

  // 2) parceiro do casal ativo (null → nada a entregar)
  const partnerRes = await sb('/rest/v1/rpc/couple_partner', { method: 'POST', body: '{}' });
  if (!partnerRes.ok) return json(502, { error: 'partner lookup failed' });
  const partner = await partnerRes.json();
  if (!partner) return json(200, { sent: 0, reason: 'no active couple' });

  // 3) subscrições do parceiro (RLS: só o casal as vê)
  const subsRes = await sb(`/rest/v1/push_subscriptions?account=eq.${partner}&select=endpoint,p256dh,auth`);
  if (!subsRes.ok) return json(502, { error: 'subscriptions lookup failed' });
  const subs = await subsRes.json();
  if (!Array.isArray(subs) || subs.length === 0) return json(200, { sent: 0, reason: 'no subscriptions' });

  webpush.setVapidDetails(SUBJECT, PUB, PRIV);
  const message = JSON.stringify({ kind, title, body, url: '/' });

  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
          { TTL: 60 * 60, urgency: 'high' }
        );
        sent++;
      } catch (e) {
        // 404/410 = subscrição morta (limpa quando o dono reativar); resto é
        // best-effort — o broadcast realtime continua a ser o caminho rápido.
        console.warn('[push-ping] send failed', e?.statusCode || e?.message);
      }
    })
  );

  return json(200, { sent });
};
