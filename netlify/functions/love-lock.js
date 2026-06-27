// netlify/functions/love-lock.js
//
// Love Lock cross-browser persistence via HttpOnly cookie.
//
// Why a function instead of localStorage: cookies are domain-scoped, not
// browser-scoped, so the lock follows the user across browsers/incognito
// windows on the same domain. HttpOnly prevents the client from tampering
// with the lock state via DevTools.
//
// Endpoints:
//   GET    /  → { active: bool, kind: 'sad'|'love'|null, expiresAt: ts }
//   POST   /  body { kind: 'sad'|'love' } → sets cookie, returns state
//   DELETE /  → clears cookie, returns { active: false }
//
// The client (src/lib/auth/loveLock.ts) is responsible for already validating
// that the password IS an emotional trigger (PBKDF2-first rule still holds on
// the splash page). The function trusts the kind passed in but does a tiny
// shape check to avoid storing nonsense.

const COOKIE_NAME = 'lovelock';
const ONE_HOUR_MS = 60 * 60 * 1000;

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('='));
  }
  return out;
}

function serializeCookie(value, maxAgeSeconds) {
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (process.env.CONTEXT === 'production') attrs.push('Secure');
  return attrs.join('; ');
}

function readState(cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  const raw = cookies[COOKIE_NAME];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.expiresAt !== 'number') return null;
    if (Date.now() > parsed.expiresAt) return null;
    if (parsed.kind !== 'sad' && parsed.kind !== 'love') return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const method = event.httpMethod || 'GET';

  // ── GET ── read current state ──
  if (method === 'GET') {
    const state = readState(event.headers.cookie);
    if (!state) {
      return buildResponse(200, { active: false, kind: null, expiresAt: null });
    }
    return buildResponse(200, {
      active: true,
      kind: state.kind,
      expiresAt: state.expiresAt,
    });
  }

  // ── POST ── activate a lock ──
  if (method === 'POST') {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return buildResponse(400, { error: 'invalid_json' });
    }
    const kind = payload.kind;
    if (kind !== 'sad' && kind !== 'love') {
      return buildResponse(400, { error: 'invalid_kind' });
    }
    const now = Date.now();
    const state = { kind, startedAt: now, expiresAt: now + ONE_HOUR_MS };
    const cookie = serializeCookie(JSON.stringify(state), 3600);
    return buildResponse(
      200,
      { active: true, kind, expiresAt: state.expiresAt },
      { 'Set-Cookie': cookie }
    );
  }

  // ── DELETE ── clear the lock ──
  if (method === 'DELETE') {
    const expiredCookie = [
      `${COOKIE_NAME}=`,
      'Path=/',
      'Max-Age=0',
      'HttpOnly',
      'SameSite=Lax',
    ].join('; ');
    return buildResponse(
      200,
      { active: false, kind: null, expiresAt: null },
      { 'Set-Cookie': expiredCookie }
    );
  }

  return buildResponse(405, { error: 'method_not_allowed' });
};