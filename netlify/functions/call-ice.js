// @ts-nocheck -- Netlify runtime globals live outside the Svelte TS build.
// Issues WebRTC ICE configuration only to an authenticated participant of the
// requested call. Provider API secrets remain server-side; browsers receive
// only short-lived TURN credentials or explicitly-labelled STUN-only config.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE_RE = /^[A-Za-z0-9._:-]{16,160}$/;
const DIRECT_KEY_RE = /^dm:([0-9a-f-]{36}):([0-9a-f-]{36})$/i;
const ICE_URL_RE = /^(stun|stuns|turn|turns):((?:\[[0-9a-f:.]+\])|(?:[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?))(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/i;
const MAX_REQUEST_BYTES = 1024;
const MAX_UPSTREAM_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 2500;
const TURN_TIMEOUT_MS = 3500;
const REQUEST_DEADLINE_MS = 9000;
// The app does not yet refresh RTCPeerConnection configuration mid-call, so
// credentials must outlive a realistically long 1:1 call and any ICE restart.
const TURN_TTL_SECONDS = 24 * 60 * 60;

class RequestFailure extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

class UpstreamTimeout extends Error {}

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      vary: 'authorization'
    }
  });

function env(name, fallback = '') {
  return Netlify.env.get(name) || fallback;
}

function safeSupabaseOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname && url.pathname !== '/')
    ) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function safeIceUrl(value) {
  if (typeof value !== 'string' || value.length > 512 || value !== value.trim() || /[\u0000-\u0020\u007f]/.test(value)) {
    return null;
  }
  const match = ICE_URL_RE.exec(value);
  if (!match) return null;
  const port = match[3] ? Number(match[3]) : null;
  if (port !== null && (port < 1 || port > 65535)) return null;
  const hostname = match[2];
  if (!hostname.startsWith('[') && (hostname.includes('..') || hostname.startsWith('.') || hostname.endsWith('.'))) {
    return null;
  }
  return value;
}

function urlsFrom(value) {
  const seen = new Set();
  const result = [];
  for (const item of String(value || '').split(/[\s,]+/)) {
    const url = safeIceUrl(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
    if (result.length >= 16) break;
  }
  return result;
}

function safeCredential(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : '';
}

export function sanitizeIceServers(value) {
  if (!Array.isArray(value)) return [];
  const servers = [];
  let totalUrls = 0;
  for (const entry of value) {
    if (servers.length >= 8 || totalUrls >= 16) break;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const rawUrls = Array.isArray(entry.urls) ? entry.urls : [entry.urls];
    const cleanUrls = [];
    const seen = new Set();
    for (const candidate of rawUrls) {
      const url = safeIceUrl(candidate);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      cleanUrls.push(url);
      totalUrls += 1;
      if (cleanUrls.length >= 8 || totalUrls >= 16) break;
    }
    if (!cleanUrls.length) continue;
    const server = { urls: cleanUrls };
    const hasTurn = cleanUrls.some((url) => /^turns?:/i.test(url));
    const username = safeCredential(entry.username, 512);
    const credential = safeCredential(entry.credential, 1024);
    // TURN entries without the complete credential pair are not usable and
    // must not make the response claim that a relay exists.
    if (hasTurn && (!username || !credential)) {
      const stunOnly = cleanUrls.filter((url) => /^stuns?:/i.test(url));
      totalUrls -= cleanUrls.length - stunOnly.length;
      if (stunOnly.length) servers.push({ urls: stunOnly });
      continue;
    }
    if (hasTurn) {
      server.username = username;
      server.credential = credential;
    }
    servers.push(server);
  }
  return servers;
}

export function hasRelay(iceServers) {
  return iceServers.some((server) => {
    const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
    return urls.some((url) => typeof url === 'string' && /^turns?:/i.test(url)) &&
      typeof server?.username === 'string' && server.username.length > 0 &&
      typeof server?.credential === 'string' && server.credential.length > 0;
  });
}

async function readBoundedJson(message, maxBytes, tooLargeCode = 'body_too_large') {
  const declared = message.headers.get('content-length');
  if (declared !== null) {
    if (!/^\d{1,10}$/.test(declared)) throw new RequestFailure(400, 'bad_content_length');
    if (Number(declared) > maxBytes) throw new RequestFailure(413, tooLargeCode);
  }
  if (!message.body) throw new RequestFailure(400, 'bad_json');
  const reader = message.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestFailure(413, tooLargeCode);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new RequestFailure(400, 'bad_encoding');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestFailure(400, 'bad_json');
  }
}

async function timedFetch(input, init, timeoutMs, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new UpstreamTimeout('deadline');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(timeoutMs, remaining)));
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new UpstreamTimeout('upstream timeout');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function responseJson(response) {
  try {
    return await readBoundedJson(response, MAX_UPSTREAM_BYTES, 'upstream_body_too_large');
  } catch (error) {
    if (error instanceof RequestFailure) throw new Error(error.code);
    throw error;
  }
}

function validDevice(value) {
  return typeof value === 'string' && DEVICE_RE.test(value);
}

function futureDate(value, now) {
  const timestamp = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) && timestamp > now;
}

function fallbackIceServers() {
  const stunUrls = urlsFrom(env('CALL_STUN_URLS', 'stun:stun.cloudflare.com:3478'))
    .filter((url) => /^stuns?:/i.test(url));
  const servers = stunUrls.length ? [{ urls: stunUrls }] : [];
  const turnUrls = urlsFrom(env('CALL_TURN_URLS', env('TURN_URLS')))
    .filter((url) => /^turns?:/i.test(url));
  const username = safeCredential(env('CALL_TURN_USERNAME', env('TURN_USERNAME')), 512);
  const credential = safeCredential(env('CALL_TURN_CREDENTIAL', env('TURN_CREDENTIAL')), 1024);
  if (turnUrls.length && username && credential) servers.push({ urls: turnUrls, username, credential });
  return sanitizeIceServers(servers);
}

async function cloudflareIceServers(deadline) {
  const keyId = safeCredential(env('CLOUDFLARE_TURN_KEY_ID'), 256);
  const apiToken = safeCredential(env('CLOUDFLARE_TURN_API_TOKEN'), 2048);
  if (!keyId || !apiToken) return [];
  const response = await timedFetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: TURN_TTL_SECONDS })
    },
    TURN_TIMEOUT_MS,
    deadline
  );
  if (!response.ok) throw new Error(`cloudflare turn ${response.status}`);
  const body = await responseJson(response);
  return sanitizeIceServers(body?.iceServers);
}

async function handle(req, deadline) {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const contentType = (req.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') return json(415, { error: 'content_type' });

  const supabaseUrl = safeSupabaseOrigin(env('VITE_SUPABASE_URL'));
  const anon = safeCredential(env('VITE_SUPABASE_ANON_KEY'), 8192);
  if (!supabaseUrl || !anon) return json(503, { error: 'not_configured' });

  const authorization = req.headers.get('authorization') || '';
  const authMatch = /^Bearer ([^\s,]{20,8192})$/.exec(authorization);
  if (!authMatch) return json(401, { error: 'no_token' });
  const auth = `Bearer ${authMatch[1]}`;

  const payload = await readBoundedJson(req, MAX_REQUEST_BYTES);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json(400, { error: 'bad_payload' });
  }
  const callId = typeof payload.callId === 'string' ? payload.callId : '';
  const device = typeof payload.device === 'string' ? payload.device : '';
  const handoffId = typeof payload.handoffId === 'string' ? payload.handoffId : '';
  const handoffRecoveryId = typeof payload.handoffRecoveryId === 'string' ? payload.handoffRecoveryId : '';
  if (!UUID_RE.test(callId)) return json(400, { error: 'bad_call' });
  if (!validDevice(device)) return json(400, { error: 'bad_device' });
  if (handoffId && !UUID_RE.test(handoffId)) return json(400, { error: 'bad_handoff' });
  if (handoffRecoveryId && (!handoffId || !UUID_RE.test(handoffRecoveryId))) {
    return json(400, { error: 'bad_handoff_recovery' });
  }

  const sb = (path, init = {}) => timedFetch(
    `${supabaseUrl}${path}`,
    {
      ...init,
      headers: {
        apikey: anon,
        authorization: auth,
        'content-type': 'application/json',
        ...(init.headers || {})
      }
    },
    UPSTREAM_TIMEOUT_MS,
    deadline
  );

  const userRes = await sb('/auth/v1/user');
  if (!userRes.ok) return json(401, { error: 'bad_token' });
  const user = await responseJson(userRes).catch(() => null);
  const userId = typeof user?.id === 'string' && UUID_RE.test(user.id) ? user.id : null;
  if (!userId) return json(401, { error: 'bad_token' });

  const callRes = await sb(
    `/rest/v1/call_sessions?id=eq.${encodeURIComponent(callId)}` +
      '&select=conversation_id,caller,callee,caller_device,callee_device,status,expires_at,' +
      'caller_lease_expires_at,callee_lease_expires_at,handoff_generation&limit=1'
  );
  if (!callRes.ok) return json(502, { error: 'call_lookup_failed' });
  const calls = await responseJson(callRes).catch(() => []);
  const call = Array.isArray(calls) ? calls[0] : null;
  if (
    !call ||
    !UUID_RE.test(String(call.conversation_id || '')) ||
    !UUID_RE.test(String(call.caller || '')) ||
    !UUID_RE.test(String(call.callee || '')) ||
    (call.caller !== userId && call.callee !== userId)
  ) return json(403, { error: 'not_participant' });
  if (!['ringing', 'accepted'].includes(call.status)) return json(409, { error: 'call_ended' });

  const now = Date.now();
  if (!validDevice(call.caller_device) || !futureDate(call.caller_lease_expires_at, now)) {
    return json(409, { error: 'call_lease_expired' });
  }
  if (call.status === 'ringing') {
    if (!futureDate(call.expires_at, now)) return json(409, { error: 'call_expired' });
    // The callee has no durable device claim until accepting. The claimed
    // caller remains device-bound; the authenticated callee may prefetch ICE.
    if (call.caller === userId && call.caller_device !== device) {
      return json(403, { error: 'wrong_call_device' });
    }
  } else {
    if (!validDevice(call.callee_device) || !futureDate(call.callee_lease_expires_at, now)) {
      return json(409, { error: 'call_lease_invalid' });
    }
    if ((call.caller === userId ? call.caller_device : call.callee_device) !== device) {
      // A not-yet-authoritative handoff target can preflight TURN only through a
      // narrowly scoped database authorization. This never grants another
      // arbitrary device on the same account access to relay credentials.
      if (!handoffId || !handoffRecoveryId) return json(403, { error: 'wrong_call_device' });
      const handoffAuthorization = await sb('/rest/v1/rpc/authorize_call_handoff_ice', {
        method: 'POST',
        body: JSON.stringify({
          p_call: callId,
          p_handoff: handoffId,
          p_device: device,
          p_recovery_id: handoffRecoveryId || null
        })
      });
      if (!handoffAuthorization.ok) return json(403, { error: 'handoff_not_authorized' });
      const handoffAllowed = await responseJson(handoffAuthorization).catch(() => false);
      if (handoffAllowed !== true) return json(403, { error: 'handoff_not_authorized' });
    }
  }

  const conversationRes = await sb(
    `/rest/v1/chat_conversations?id=eq.${encodeURIComponent(call.conversation_id)}` +
      '&select=id,kind,space_id,direct_key&limit=1'
  );
  if (!conversationRes.ok) return json(502, { error: 'conversation_lookup_failed' });
  const conversations = await responseJson(conversationRes).catch(() => []);
  const conversation = Array.isArray(conversations) ? conversations[0] : null;
  if (!conversation || conversation.id !== call.conversation_id) {
    return json(403, { error: 'inactive_relationship' });
  }

  let relationshipRes;
  if (conversation.kind === 'direct' && typeof conversation.direct_key === 'string') {
    const direct = DIRECT_KEY_RE.exec(conversation.direct_key);
    const directAccounts = direct ? [direct[1], direct[2]] : [];
    if (
      directAccounts.length !== 2 ||
      directAccounts[0].toLowerCase() >= directAccounts[1].toLowerCase() ||
      !directAccounts.includes(call.caller) ||
      !directAccounts.includes(call.callee)
    ) return json(403, { error: 'inactive_relationship' });
    relationshipRes = await sb('/rest/v1/rpc/is_dm_member', {
      method: 'POST',
      body: JSON.stringify({ p_id: conversation.direct_key, p_uid: userId })
    });
  } else if (conversation.kind === 'couple' && UUID_RE.test(String(conversation.space_id || ''))) {
    const membersRes = await sb(
      `/rest/v1/space_members?space_id=eq.${encodeURIComponent(conversation.space_id)}` +
        '&status=eq.accepted&select=account'
    );
    if (!membersRes.ok) return json(502, { error: 'relationship_lookup_failed' });
    const memberRows = await responseJson(membersRes).catch(() => []);
    const memberAccounts = (Array.isArray(memberRows) ? memberRows : [])
      .map((member) => member?.account)
      .filter((account) => typeof account === 'string' && UUID_RE.test(account));
    if (
      memberAccounts.length !== 2 ||
      new Set(memberAccounts).size !== 2 ||
      !memberAccounts.includes(call.caller) ||
      !memberAccounts.includes(call.callee)
    ) return json(403, { error: 'inactive_relationship' });
    relationshipRes = await sb('/rest/v1/rpc/is_active_couple_member', {
      method: 'POST',
      body: JSON.stringify({ p_space: conversation.space_id, p_account: userId })
    });
  } else {
    return json(403, { error: 'inactive_relationship' });
  }

  if (!relationshipRes.ok) return json(502, { error: 'relationship_validation_failed' });
  const relationshipActive = await responseJson(relationshipRes).catch(() => false);
  if (relationshipActive !== true) return json(403, { error: 'inactive_relationship' });

  const configured = fallbackIceServers();
  let cloudflare = [];
  try {
    cloudflare = await cloudflareIceServers(deadline);
  } catch (error) {
    console.warn('[call-ice] ephemeral TURN unavailable; using configured fallback', error?.message || 'provider error');
  }
  const cloudflareRelay = hasRelay(cloudflare);
  const configuredRelay = hasRelay(configured);
  const iceServers = cloudflareRelay ? cloudflare : configuredRelay ? configured : cloudflare.length ? cloudflare : configured;
  if (!iceServers.length) return json(503, { error: 'ice_unavailable' });
  const relayAvailable = hasRelay(iceServers);
  const source = cloudflareRelay ? 'cloudflare' : configuredRelay ? 'static' : 'stun-only';
  return json(200, {
    iceServers,
    relayAvailable,
    source,
    expiresAt: source === 'cloudflare' ? new Date(Date.now() + TURN_TTL_SECONDS * 1000).toISOString() : null
  });
}

export default async (req) => {
  try {
    return await handle(req, Date.now() + REQUEST_DEADLINE_MS);
  } catch (error) {
    if (error instanceof RequestFailure) return json(error.status, { error: error.code });
    if (error instanceof UpstreamTimeout) return json(504, { error: 'upstream_timeout' });
    console.error('[call-ice] request failed', error instanceof Error ? error.message : 'unknown error');
    return json(502, { error: 'upstream_failed' });
  }
};

// Keep the legacy function URL while cached clients move to the stable API
// route. New clients also fall back to the legacy URL against an older deploy.
export const config = {
  path: ['/api/call-ice', '/.netlify/functions/call-ice'],
  method: 'POST',
  rateLimit: {
    windowLimit: 120,
    windowSize: 60,
    aggregateBy: ['ip', 'domain']
  }
};
