// netlify/functions/saikan-auth-callback.js
//
// "Continuar com Saikan ID" — step 2 of the OIDC bridge (see
// saikan-auth-start.js for the flow overview).
//
// Receives the authorization code from id.saikan.io, and — entirely
// server-side —
//   1. validates state against the HttpOnly cookie set at start,
//   2. exchanges the code at /oauth/token (client secret + PKCE verifier),
//   3. verifies the RS256 id_token against Saikan's published JWKS
//      (issuer, audience, expiry, nonce, email_verified),
//   4. finds-or-creates the matching Presuntinho Supabase account
//      (Admin API, service role — NEVER exposed to the client), and
//   5. hands the browser a one-time Supabase token_hash in the URL FRAGMENT
//      (never sent to servers/logs); /splash/ turns it into a real session
//      via supabase.auth.verifyOtp and the existing session bridge takes over.
//
// ENV (Netlify → Environment variables, functions scope):
//   SAIKAN_OIDC_ISSUER         e.g. https://id.saikan.io
//   SAIKAN_CLIENT_ID           e.g. presuntinho
//   SAIKAN_CLIENT_SECRET       secret — pairs with the oauth_clients row
//   VITE_SUPABASE_URL          the Presuntinho Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  secret — Presuntinho project service role

import crypto from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createClient } from '@supabase/supabase-js';

const COOKIE_NAME = 'saikan_oidc';

// Cache the JWKS across warm invocations of this lambda.
let jwks = null;
function getJwks(issuer) {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  }
  return jwks;
}

function getHeader(headers, name) {
  if (!headers) return undefined;
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
}

function readStateCookie(event) {
  const cookieHeader = getHeader(event.headers, 'cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) {
      try {
        return JSON.parse(Buffer.from(rest.join('='), 'base64url').toString('utf8'));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const CLEAR_COOKIE = `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/.netlify/functions/; Max-Age=0`;

/** Send the user back to the splash screen with a machine-readable error. */
function failToSplash(origin, code) {
  return {
    statusCode: 302,
    headers: {
      Location: `${origin || ''}/splash/?saikan_error=${encodeURIComponent(code)}`,
      'Set-Cookie': CLEAR_COOKIE,
      'Cache-Control': 'no-store'
    },
    body: ''
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const issuer = (process.env.SAIKAN_OIDC_ISSUER || '').replace(/\/+$/, '');
  const clientId = process.env.SAIKAN_CLIENT_ID || '';
  const clientSecret = process.env.SAIKAN_CLIENT_SECRET || '';
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const stateCookie = readStateCookie(event);
  const origin = stateCookie && typeof stateCookie.o === 'string' ? stateCookie.o : process.env.URL || '';

  if (!issuer || !clientId || !clientSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('[saikan-callback] missing configuration');
    return failToSplash(origin, 'config');
  }

  const params = event.queryStringParameters || {};

  // The IdP said no (user cancelled, etc.) — surface it gently.
  if (params.error) {
    return failToSplash(origin, params.error === 'access_denied' ? 'cancelled' : 'idp');
  }

  if (!stateCookie || !stateCookie.v || !stateCookie.s || !stateCookie.n || !stateCookie.o) {
    return failToSplash(origin, 'expired');
  }
  if (!params.state || !timingSafeEqualStr(params.state, stateCookie.s)) {
    return failToSplash(origin, 'state');
  }
  if (!params.code) {
    return failToSplash(origin, 'missing_code');
  }

  // ── 1. code → tokens (server-to-server, client secret + PKCE verifier) ──
  const redirectUri = `${stateCookie.o}/.netlify/functions/saikan-auth-callback`;
  let tokens;
  try {
    const basic = Buffer.from(
      `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`
    ).toString('base64');
    const response = await fetch(`${issuer}/oauth/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${basic}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: params.code,
        redirect_uri: redirectUri,
        code_verifier: stateCookie.v
      }).toString()
    });
    tokens = await response.json();
    if (!response.ok || !tokens.id_token) {
      console.error('[saikan-callback] token exchange failed', tokens.error || response.status);
      return failToSplash(origin, 'exchange');
    }
  } catch (err) {
    console.error('[saikan-callback] token exchange error', err);
    return failToSplash(origin, 'exchange');
  }

  // ── 2. verify the id_token against Saikan's JWKS ──
  let claims;
  try {
    const { payload } = await jwtVerify(tokens.id_token, getJwks(issuer), {
      issuer,
      audience: clientId,
      algorithms: ['RS256']
    });
    claims = payload;
  } catch (err) {
    console.error('[saikan-callback] id_token verification failed', err);
    return failToSplash(origin, 'token');
  }
  if (!claims.nonce || !timingSafeEqualStr(claims.nonce, stateCookie.n)) {
    return failToSplash(origin, 'nonce');
  }
  // Email is the account-linking key — it must exist and be verified, or an
  // attacker could squat an unverified address and inherit the account.
  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
  if (!email || claims.email_verified !== true) {
    return failToSplash(origin, 'email');
  }

  // ── 3. find-or-create the Presuntinho account (service role, server-only) ──
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const metadata = {
      saikan_sub: claims.sub,
      full_name: typeof claims.name === 'string' ? claims.name : undefined,
      avatar_url: typeof claims.picture === 'string' ? claims.picture : undefined
    };

    const { error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true, // Saikan already verified this address
      user_metadata: metadata
    });
    if (createError && !/already|exists|registered/i.test(createError.message || '')) {
      console.error('[saikan-callback] createUser failed', createError.message);
      return failToSplash(origin, 'account');
    }

    // ── 4. mint a one-time login token for the browser (no secrets exposed) ──
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error('[saikan-callback] generateLink failed', linkError?.message);
      return failToSplash(origin, 'account');
    }

    // Keep the Saikan profile fresh on repeat logins (best-effort).
    if (linkData.user?.id) {
      await admin.auth.admin
        .updateUserById(linkData.user.id, {
          user_metadata: { ...linkData.user.user_metadata, ...metadata }
        })
        .catch(() => undefined);
    }

    // Fragment (#…) never leaves the browser — not sent to servers, not logged.
    return {
      statusCode: 302,
      headers: {
        Location: `${stateCookie.o}/splash/#saikan_token_hash=${encodeURIComponent(tokenHash)}`,
        'Set-Cookie': CLEAR_COOKIE,
        'Cache-Control': 'no-store'
      },
      body: ''
    };
  } catch (err) {
    console.error('[saikan-callback] unexpected failure', err);
    return failToSplash(origin, 'account');
  }
};
