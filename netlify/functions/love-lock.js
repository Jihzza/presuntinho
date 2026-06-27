// netlify/functions/love-lock.js
//
// Love Lock cross-browser persistence via Netlify Blobs + opaque id cookie.
//
// Why a function + blob instead of cookie-as-state: cookies are domain-scoped
// in theory, but the HttpOnly flag prevented the client from ever seeing or
// rotating the lock state across browsers, so a lock set in Chrome was
// invisible to Edge on the same domain. We move the state to a server-side
// blob at `love-lock:current`; the cookie now carries only an opaque
// HMAC-signed 18-byte session token (lovelock_id), rotated on every POST.
//
// Endpoints:
//   GET    /  → { active: bool, kind: 'sad'|'love'|null, expiresAt: ts|null }
//   POST   /  body { kind: 'sad'|'love' } → sets blob + new id cookie
//   DELETE /  → clears blob + cookie
//
// The client (src/lib/auth/loveLock.ts) is responsible for already validating
// that the password IS an emotional trigger (PBKDF2-first rule still holds on
// the splash page). The function trusts the kind passed in but does a tiny
// shape check to avoid storing nonsense.

import { connectLambda, getStore } from '@netlify/blobs';
import crypto from 'crypto';

const COOKIE_NAME = 'lovelock_id';
const BLOB_KEY = 'love-lock:current';
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MONTH_SECONDS = 30 * 24 * 60 * 60; // 2592000
const ALLOWED_ORIGIN = 'https://presuntinho.netlify.app';

function getHeader(headers, name) {
  if (!headers) return undefined;
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  try {
    for (const part of header.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (!k) continue;
      out[k] = decodeURIComponent(rest.join('='));
    }
  } catch {
    return {};
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

function serializeIdCookie(value, maxAgeSeconds, event) {
  // NO HttpOnly — the cookie is just an opaque session token. Tamper resistance
  // is provided by the optional HMAC signature, NOT by hiding the cookie from
  // the client. The actual lock state lives in the blob; the cookie alone
  // grants nothing if the secret is rotated.
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
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

function mintId(secret) {
  // 18 random bytes → 24 base64url chars, optionally suffixed with an HMAC
  // for tamper detection. Verified on read by extractId(); invalid tokens
  // are simply ignored, not 400'd — we treat unknown state as "no lock".
  const raw = base64url(crypto.randomBytes(18));
  if (!secret) {
    console.warn('[love-lock] LOVE_LOCK_SECRET not set — id is unsigned');
    return raw;
  }
  return `${raw}.${hmac(raw, secret)}`;
}

function extractId(raw, secret) {
  if (!raw) return null;
  const parts = raw.split('.');
  if (secret) {
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [payload, signature] = parts;
    const expected = hmac(payload, secret);
    const provided = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (provided.length !== expectedBuffer.length) return null;
    try {
      if (!crypto.timingSafeEqual(provided, expectedBuffer)) return null;
    } catch {
      return null;
    }
    return payload;
  }
  // Unsigned mode: accept the whole token as the id (24 base64url chars).
  return parts[0] || null;
}

function readId(cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  const raw = cookies[COOKIE_NAME];
  if (!raw) return null;
  return extractId(raw, process.env.LOVE_LOCK_SECRET);
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
  return serializeIdCookie('', 0, event);
}

function blobStore(event) {
  // Lambda-compat bootstrap: the Netlify Functions runtime injects the blobs
  // configuration in the Lambda event (`event.blobs` is a base64 JSON blob
  // containing `{ url, token }`, plus `x-nf-site-id` / `x-nf-deploy-id`
  // headers). We MUST call connectLambda(event) before every getStore(), per
  // the @netlify/blobs docs:
  // https://github.com/netlify/blobs#lambda-compatibility-mode
  //
  // Why per-request: connectLambda is idempotent and cheap, and re-binding on
  // every invocation guarantees we pick up the right per-request token (tokens
  // can rotate). NETLIFY_BLOBS_CONTEXT is NOT auto-injected in Lambda-compat
  // mode (verified 2026-06-27: runtime did not populate it; only the Lambda
  // event carries the blobs config). Earlier attempts to call
  // setEnvironmentContext(process.env.NETLIFY_BLOBS_CONTEXT) at module load
  // silently failed because the env var was empty.
  connectLambda(event);
  const storeName = process.env.LOVE_LOCK_BLOB_STORE || 'lovelock';
  return getStore(storeName);
}

export const handler = async (event) => {
  const method = event.httpMethod || 'GET';

  // ── GET ── read current state from the blob ──
  if (method === 'GET') {
    // Cookie parse failure is silently ignored — unknown cookie = unknown lock.
    try {
      readId(getHeader(event.headers, 'cookie'));
    } catch (e) {
      console.error('[love-lock] cookie parse failed', e);
    }

    let blob;
    try {
      blob = await blobStore(event).get(BLOB_KEY, { type: 'json' });
    } catch (e) {
      console.error('[love-lock] blob read failed', e);
      // Lock invisible to client, NOT a 500. The client will see no lock.
      return buildResponse(200, { active: false, kind: null, expiresAt: null });
    }

    if (!blob || typeof blob !== 'object') {
      return buildResponse(200, { active: false, kind: null, expiresAt: null });
    }

    const now = Date.now();
    if (typeof blob.expiresAt !== 'number' || now > blob.expiresAt) {
      // Lazy GC — fire-and-forget delete so the blob doesn't accumulate.
      // Failures here are non-fatal; the next GET will try again.
      try {
        blobStore(event).delete(BLOB_KEY).catch((e) => {
          console.warn('[love-lock] lazy gc delete failed', e?.message || e);
        });
      } catch {
        /* swallow — getStore threw synchronously, very unlikely */
      }
      return buildResponse(200, { active: false, kind: null, expiresAt: null });
    }

    if (blob.kind !== 'sad' && blob.kind !== 'love') {
      // Blob is corrupt (shape mismatch). Treat as expired + try to clear it.
      try {
        blobStore(event).delete(BLOB_KEY).catch(() => {});
      } catch {
        /* swallow */
      }
      return buildResponse(200, { active: false, kind: null, expiresAt: null });
    }

    return buildResponse(200, {
      active: true,
      kind: blob.kind,
      expiresAt: blob.expiresAt,
    });
  }

  // ── POST ── activate a lock (set blob + rotate id cookie) ──
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

    try {
      await blobStore(event).setJSON(BLOB_KEY, state);
    } catch (e) {
      console.error('[love-lock] blob write failed', e);
      return buildResponse(500, { error: 'server_misconfigured' });
    }

    let cookie;
    try {
      const id = mintId(process.env.LOVE_LOCK_SECRET);
      cookie = serializeIdCookie(id, ONE_MONTH_SECONDS, event);
    } catch (e) {
      console.error('[love-lock] id mint failed', e);
      // Blob is already set — try to roll it back so we don't strand a lock
      // with no cookie. If rollback fails too, surface server_misconfigured.
      try {
        await blobStore(event).delete(BLOB_KEY);
      } catch (cleanupErr) {
        console.error('[love-lock] rollback failed', cleanupErr);
      }
      return buildResponse(500, { error: 'server_misconfigured' });
    }

    return buildResponse(
      200,
      { active: true, kind, expiresAt: state.expiresAt },
      { 'Set-Cookie': cookie }
    );
  }

  // ── DELETE ── clear the lock (blob + cookie) ──
  if (method === 'DELETE') {
    try {
      await blobStore(event).delete(BLOB_KEY);
    } catch (e) {
      console.error('[love-lock] blob delete failed', e);
      // Still clear the cookie — the GET will eventually see an absent blob
      // and lazy-expire on its own. We don't 500 here because the user-visible
      // effect ("no lock active") will still hold on the next read.
    }
    return buildResponse(
      200,
      { active: false, kind: null, expiresAt: null },
      { 'Set-Cookie': buildCookieClear(event) }
    );
  }

  return buildResponse(405, { error: 'method_not_allowed' });
};
