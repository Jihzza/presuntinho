// netlify/functions/saikan-auth-start.js
//
// "Continuar com Saikan ID" — step 1 of the OIDC bridge.
//
// Presuntinho's hosted Supabase Auth cannot register a custom OIDC provider,
// so this function starts the standard OAuth 2.1 + PKCE dance against the
// Saikan ID authorization server (https://id.saikan.io) itself:
//
//   browser → GET /.netlify/functions/saikan-auth-start
//           ← 302 to id.saikan.io/oauth/authorize (+ a state/PKCE cookie)
//   …Saikan login + consent…
//           → GET /.netlify/functions/saikan-auth-callback?code&state
//
// The PKCE verifier, state and nonce travel in an HttpOnly SameSite=Lax
// cookie scoped to the functions path — Lax cookies ARE sent on the top-level
// GET navigation back from id.saikan.io, and the browser never exposes them
// to page JS. No server-side storage needed.
//
// ENV (Netlify → Environment variables, functions scope):
//   SAIKAN_OIDC_ISSUER  e.g. https://id.saikan.io
//   SAIKAN_CLIENT_ID    e.g. presuntinho

import crypto from 'crypto';

const COOKIE_NAME = 'saikan_oidc';
const COOKIE_TTL_SECONDS = 600; // the whole login hop should take < 10 min

/** The site origin as the BROWSER sees it (works on prod + netlify dev). */
function requestOrigin(event) {
  try {
    const url = new URL(event.rawUrl);
    // Never trust an arbitrary Host header in production: only the canonical
    // site URL (process.env.URL), deploy previews, or localhost may host the
    // callback. Anything else falls back to the canonical URL.
    const canonical = process.env.URL ? new URL(process.env.URL).origin : null;
    const allowed =
      url.origin === canonical ||
      /^https:\/\/[a-z0-9][a-z0-9-]*--presuntinho\.netlify\.app$/.test(url.origin) ||
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1';
    return allowed ? url.origin : canonical;
  } catch {
    return process.env.URL ? new URL(process.env.URL).origin : null;
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const issuer = (process.env.SAIKAN_OIDC_ISSUER || '').replace(/\/+$/, '');
  const clientId = process.env.SAIKAN_CLIENT_ID || '';
  if (!issuer || !clientId) {
    return { statusCode: 500, body: 'Saikan ID sign-in is not configured.' };
  }

  const origin = requestOrigin(event);
  if (!origin) {
    return { statusCode: 500, body: 'Cannot determine site origin.' };
  }
  const redirectUri = `${origin}/.netlify/functions/saikan-auth-callback`;

  // PKCE (S256) + CSRF state + OIDC nonce.
  const verifier = crypto.randomBytes(48).toString('base64url'); // 64 chars
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(32).toString('base64url');
  const nonce = crypto.randomBytes(32).toString('base64url');

  const payload = Buffer.from(JSON.stringify({ v: verifier, s: state, n: nonce, o: origin })).toString(
    'base64url'
  );

  const authorize = new URL(`${issuer}/oauth/authorize`);
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', 'openid email profile');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('nonce', nonce);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');

  return {
    statusCode: 302,
    headers: {
      Location: authorize.toString(),
      // Path covers the callback function; HttpOnly keeps page JS away from
      // the PKCE verifier; Lax survives the top-level redirect back.
      'Set-Cookie': `${COOKIE_NAME}=${payload}; HttpOnly; Secure; SameSite=Lax; Path=/.netlify/functions/; Max-Age=${COOKIE_TTL_SECONDS}`,
      'Cache-Control': 'no-store'
    },
    body: ''
  };
};
