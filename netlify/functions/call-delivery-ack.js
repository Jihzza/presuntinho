// @ts-nocheck -- Netlify runtime globals live outside the Svelte TS build.
// Unauthenticated-by-session Web Push delivery acknowledgement.
//
// The service worker may run while no Supabase session is available. It proves
// authority with a short-lived, per-delivery random token. Only the digest is
// stored in Postgres; neither delivery ids nor stages are trusted on their own.

const MAX_REQUEST_BYTES = 4 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9._-]{36,160}$/;
const ACK_STAGES = new Set(['received', 'presented', 'opened']);
const RPC_TIMEOUT_MS = 5000;

export const config = {
  path: '/api/call-delivery-ack',
  method: 'POST',
  // Capability tokens authorize each ACK. This platform limit separately
  // bounds unauthenticated request volume before it can reach Postgres.
  rateLimit: {
    windowLimit: 240,
    windowSize: 60,
    aggregateBy: ['ip', 'domain']
  }
};

function reply(status, acknowledged = false) {
  return new Response(JSON.stringify({ acknowledged }), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

export function validAckPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const deliveryId = typeof value.deliveryId === 'string' ? value.deliveryId : '';
  const token = typeof value.token === 'string' ? value.token : '';
  const stage = typeof value.stage === 'string' ? value.stage : '';
  if (!UUID_RE.test(deliveryId) || !TOKEN_RE.test(token) || !ACK_STAGES.has(stage)) return null;
  return { deliveryId, token, stage };
}

export default async function handler(req) {
  if (req.method !== 'POST') return reply(405);
  const contentLength = req.headers.get('content-length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0 || declared > MAX_REQUEST_BYTES) {
      return reply(413);
    }
  }

  let raw;
  try {
    raw = await req.text();
  } catch {
    return reply(400);
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) return reply(413);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400);
  }
  const ack = validAckPayload(body);
  if (!ack) return reply(400);

  const supabaseUrl = Netlify.env.get('VITE_SUPABASE_URL');
  const serviceRole = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return reply(503);

  let rpcResponse;
  try {
    rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/ack_call_delivery_with_token`, {
      method: 'POST',
      headers: {
        apikey: serviceRole,
        authorization: `Bearer ${serviceRole}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        p_delivery: ack.deliveryId,
        p_token: ack.token,
        p_stage: ack.stage
      }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS)
    });
  } catch {
    return reply(503);
  }
  if (!rpcResponse.ok) return reply(502);
  const acknowledged = (await rpcResponse.json().catch(() => false)) === true;

  // A false response deliberately stays opaque: an attacker cannot use this
  // endpoint to enumerate delivery ids or distinguish expired tokens.
  return reply(202, acknowledged);
}
