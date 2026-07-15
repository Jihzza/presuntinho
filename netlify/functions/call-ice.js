// Issues WebRTC ICE configuration only to an authenticated participant of the
// requested call. Provider API secrets remain server-side; Cloudflare returns
// short-lived TURN credentials that are safe to hand to the two peers.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE_RE = /^[A-Za-z0-9._:-]{16,160}$/;
const ALLOWED_SCHEMES = /^(?:stun|stuns|turn|turns):/i;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' }
  });

function env(name, fallback = '') {
  return Netlify.env.get(name) || fallback;
}

function urlsFrom(value) {
  return String(value || '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter((item) => item && ALLOWED_SCHEMES.test(item))
    .slice(0, 12);
}

function sanitizeIceServers(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const urls = Array.isArray(entry.urls) ? entry.urls : [entry.urls];
    const cleanUrls = urls
      .filter((url) => typeof url === 'string' && url.length <= 500 && ALLOWED_SCHEMES.test(url))
      .slice(0, 12);
    if (!cleanUrls.length) return [];
    const server = { urls: cleanUrls };
    if (typeof entry.username === 'string' && entry.username.length <= 512) server.username = entry.username;
    if (typeof entry.credential === 'string' && entry.credential.length <= 1024) server.credential = entry.credential;
    return [server];
  });
}

function validDevice(value) {
  return typeof value === 'string' && value.length <= 160 && DEVICE_RE.test(value);
}

function futureDate(value, now) {
  const timestamp = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) && timestamp > now;
}

function fallbackIceServers() {
  const stunUrls = urlsFrom(env('CALL_STUN_URLS', 'stun:stun.cloudflare.com:3478')).filter((url) => /^stuns?:/i.test(url));
  const servers = stunUrls.length ? [{ urls: stunUrls }] : [];
  const turnUrls = urlsFrom(env('CALL_TURN_URLS', env('TURN_URLS'))).filter((url) => /^turns?:/i.test(url));
  const username = env('CALL_TURN_USERNAME', env('TURN_USERNAME'));
  const credential = env('CALL_TURN_CREDENTIAL', env('TURN_CREDENTIAL'));
  if (turnUrls.length && username && credential) servers.push({ urls: turnUrls, username, credential });
  return servers;
}

async function cloudflareIceServers() {
  const keyId = env('CLOUDFLARE_TURN_KEY_ID');
  const apiToken = env('CLOUDFLARE_TURN_API_TOKEN');
  if (!keyId || !apiToken) return [];
  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: 3600 }),
      signal: AbortSignal.timeout(5000)
    }
  );
  if (!response.ok) throw new Error(`cloudflare turn ${response.status}`);
  const body = await response.json();
  return sanitizeIceServers(body?.iceServers);
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const supabaseUrl = env('VITE_SUPABASE_URL');
  const anon = env('VITE_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anon) return json(503, { error: 'not configured' });

  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'no token' });
  let payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'bad json' });
  }
  const callId = payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.callId === 'string'
    ? payload.callId
    : '';
  const device = payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.device === 'string'
    ? payload.device
    : '';
  if (!UUID_RE.test(callId)) return json(400, { error: 'bad call' });
  if (!validDevice(device)) return json(400, { error: 'bad device' });

  const sb = (path, init = {}) =>
    fetch(`${supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: anon,
        authorization: auth,
        'content-type': 'application/json',
        ...(init.headers || {})
      }
    });
  const userRes = await sb('/auth/v1/user');
  if (!userRes.ok) return json(401, { error: 'bad token' });
  const user = await userRes.json().catch(() => null);
  const userId = typeof user?.id === 'string' && UUID_RE.test(user.id) ? user.id : null;
  if (!userId) return json(401, { error: 'bad token' });

  const callRes = await sb(
    `/rest/v1/call_sessions?id=eq.${callId}` +
      '&select=conversation_id,caller,callee,caller_device,callee_device,status,expires_at,' +
      'caller_lease_expires_at,callee_lease_expires_at&limit=1'
  );
  if (!callRes.ok) return json(502, { error: 'call lookup failed' });
  const calls = await callRes.json().catch(() => []);
  const call = Array.isArray(calls) ? calls[0] : null;
  if (!call || (call.caller !== userId && call.callee !== userId)) return json(403, { error: 'not participant' });
  if (!['ringing', 'accepted'].includes(call.status)) return json(409, { error: 'call ended' });

  const now = Date.now();
  if (!validDevice(call.caller_device) || !futureDate(call.caller_lease_expires_at, now)) {
    return json(409, { error: 'call lease expired' });
  }
  if (call.status === 'ringing') {
    if (!futureDate(call.expires_at, now)) return json(409, { error: 'call expired' });
    // The callee has no durable device claim until accepting. Ringing ICE is
    // therefore useful to the claimed caller and harmless to the authenticated
    // callee; once accepted, both sides are strictly device-bound below.
    if (call.caller === userId && call.caller_device !== device) {
      return json(403, { error: 'wrong call device' });
    }
  } else {
    if (
      !validDevice(call.callee_device) ||
      !futureDate(call.callee_lease_expires_at, now)
    ) {
      return json(409, { error: 'call lease invalid' });
    }
    if ((call.caller === userId ? call.caller_device : call.callee_device) !== device) {
      return json(403, { error: 'wrong call device' });
    }
  }

  const conversationRes = await sb(
    `/rest/v1/chat_conversations?id=eq.${encodeURIComponent(call.conversation_id)}` +
      '&select=id,kind,space_id,direct_key&limit=1'
  );
  if (!conversationRes.ok) return json(502, { error: 'conversation lookup failed' });
  const conversations = await conversationRes.json().catch(() => []);
  const conversation = Array.isArray(conversations) ? conversations[0] : null;
  if (!conversation) return json(403, { error: 'inactive relationship' });

  let relationshipRes;
  if (conversation.kind === 'direct' && typeof conversation.direct_key === 'string') {
    const directAccounts = conversation.direct_key.split(':').slice(1);
    if (
      directAccounts.length !== 2 ||
      !directAccounts.includes(call.caller) ||
      !directAccounts.includes(call.callee)
    ) {
      return json(403, { error: 'inactive relationship' });
    }
    relationshipRes = await sb('/rest/v1/rpc/is_dm_member', {
      method: 'POST',
      body: JSON.stringify({ p_id: conversation.direct_key, p_uid: userId })
    });
  } else if (conversation.kind === 'couple' && UUID_RE.test(String(conversation.space_id || ''))) {
    const membersRes = await sb(
      `/rest/v1/space_members?space_id=eq.${encodeURIComponent(conversation.space_id)}` +
        '&status=eq.accepted&select=account'
    );
    if (!membersRes.ok) return json(502, { error: 'relationship lookup failed' });
    const memberRows = await membersRes.json().catch(() => []);
    const memberAccounts = (Array.isArray(memberRows) ? memberRows : [])
      .map((member) => member && member.account)
      .filter((account) => typeof account === 'string');
    if (
      memberAccounts.length !== 2 ||
      !memberAccounts.includes(call.caller) ||
      !memberAccounts.includes(call.callee)
    ) {
      return json(403, { error: 'inactive relationship' });
    }
    relationshipRes = await sb('/rest/v1/rpc/is_active_couple_member', {
      method: 'POST',
      body: JSON.stringify({ p_space: conversation.space_id, p_account: userId })
    });
  } else {
    return json(403, { error: 'inactive relationship' });
  }

  if (!relationshipRes.ok) return json(502, { error: 'relationship validation failed' });
  const relationshipActive = await relationshipRes.json().catch(() => false);
  if (relationshipActive !== true) return json(403, { error: 'inactive relationship' });

  let iceServers = [];
  try {
    iceServers = await cloudflareIceServers();
  } catch (error) {
    console.warn('[call-ice] ephemeral TURN unavailable; using configured fallback', error?.message || error);
  }
  if (!iceServers.length) iceServers = sanitizeIceServers(fallbackIceServers());
  if (!iceServers.length) return json(503, { error: 'ice unavailable' });
  return json(200, { iceServers });
};
