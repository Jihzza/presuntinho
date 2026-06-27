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

import crypto from 'crypto';

const COOKIE_NAME = 'lovelock';
const ONE_HOUR_MS = 60 * 60 * 1000;
const ALLOWED_ORIGIN = 'https://presuntinho.netlify.app';

function getHeader(headers, name) {
  if (!headers) return undefined;
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
}

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

function isHttps(event) {
  // Netlify sets x-forwarded-proto on every request. Origin URL is the
  // authoritative check; fall back to env for unit tests / netlify dev.
  const fwd = getHeader(event?.headers, 'x-forwarded-proto');
  if (fwd) return String(fwd).toLowerCase() === 'https';
  if (getHeader(event?.headers, 'x-nf-ssl') === 'on') return true;
  const context = process.env.CONTEXT || '';
  return context === 'production' || context === 'deploy-preview' || context === 'branch-deploy';
}

function serializeCookie(value, maxAgeSeconds, event) {
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (isHttps(event)) attrs.push('Secure');
  return attrs.join('; ');
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function hmac(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function signState(state) {
  const secret = process.env.LOVE_LOCK_SECRET;
  if (!secret) {
    throw new Error('LOVE_LOCK_SECRET is not configured');
  }
  const payload = base64url(JSON.stringify(state));
  return `${payload}.${hmac(payload, secret)}`;
}

function verifySignedState(raw) {
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { error: 'malformed_cookie' };
  }

  const secret = process.env.LOVE_LOCK_SECRET;
  if (!secret) {
    throw new Error('LOVE_LOCK_SECRET is not configured');
  }

  const [payload, signature] = parts;
  const expected = hmac(payload, secret);
  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length || !crypto.timingSafeEqual(provided, expectedBuffer)) {
    return { error: 'invalid_cookie_signature' };
  }

  try {
    return { state: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) };
  } catch {
    return { error: 'malformed_cookie' };
  }
}

function readState(cookieHeader) {
  let cookies;
  try {
    cookies = parseCookies(cookieHeader);
  } catch {
    return { error: 'malformed_cookie' };
  }

  const raw = cookies[COOKIE_NAME];
  if (!raw) return { state: null };

  const verified = verifySignedState(raw);
  if (verified.error) return verified;

  const parsed = verified.state;
  if (typeof parsed.expiresAt !== 'number') return { error: 'malformed_cookie' };
  if (Date.now() > parsed.expiresAt) return { state: null };
  if (parsed.kind !== 'sad' && parsed.kind !== 'love') return { error: 'malformed_cookie' };
  return { state: parsed };
}

function requestOrigin(event) {
  const origin = getHeader(event?.headers, 'origin');
  if (origin) return origin;

  const referer = getHeader(event?.headers, 'referer');
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function isAllowedPostOrigin(event) {
  return requestOrigin(event) === ALLOWED_ORIGIN;
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

function buildCookieClear(event) {
  return serializeCookie('', 0, event);
}

export const handler = async (event) => {
  const method = event.httpMethod || 'GET';

  // ── GET ── read current state ──
  if (method === 'GET') {
    let result;
    try {
      result = readState(getHeader(event.headers, 'cookie'));
    } catch (e) {
      console.error('[love-lock] read failed', e);
      return buildResponse(500, { error: 'server_misconfigured' });
    }

    if (result.error) {
      return buildResponse(400, { error: result.error });
    }
    if (!result.state) {
      return buildResponse(200, { active: false, kind: null, expiresAt: null });
    }
    return buildResponse(200, {
      active: true,
      kind: result.state.kind,
      expiresAt: result.state.expiresAt,
    });
  }

  // ── POST ── activate a lock ──
  if (method === 'POST') {
    if (!isAllowedPostOrigin(event)) {
      return buildResponse(403, { error: 'forbidden_origin' });
    }

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
    let cookie;
    try {
      cookie = serializeCookie(signState(state), 3600, event);
    } catch (e) {
      console.error('[love-lock] signing failed', e);
      return buildResponse(500, { error: 'server_misconfigured' });
    }
    return buildResponse(
      200,
      { active: true, kind, expiresAt: state.expiresAt },
      { 'Set-Cookie': cookie }
    );
  }

  // ── DELETE ── clear the lock ──
  if (method === 'DELETE') {
    return buildResponse(
      200,
      { active: false, kind: null, expiresAt: null },
      { 'Set-Cookie': buildCookieClear(event) }
    );
  }

  return buildResponse(405, { error: 'method_not_allowed' });
};
