// netlify/functions/pairing.js
//
// Cross-device PAIRING rendezvous for the multi-user spaces (Phase 1A).
//
// The problem it solves: two phones that don't yet share any secret need a way
// to agree on ONE shared "space token" so they can later sync shared data. This
// function is ONLY the handshake — it never stores user data, only short-lived
// invite codes that hand out a random token. It is deliberately SEPARATE from
// chat.js so the working fatma/daniel channel is never touched.
//
// Scaffolding mirrors chat.js: connectLambda(event) before every getStore(),
// an Origin/Referer allow-list on writes, and no-store cache headers.
//
// DATA MODEL (store 'pairing'):
//   'invite:<code>' -> { token, createdAt, expiresAt, redeemed }
//
// ENDPOINTS (POST { action }):
//   POST { action: 'create' }          -> { code, token, expiresAt }
//        Mints a high-entropy code + a fresh space token. The CREATOR keeps the
//        token; the code is shared out-of-band (link / QR / spoken).
//   POST { action: 'redeem', code }    -> { token }
//        One-time: validates + marks redeemed, returns the SAME token so both
//        devices now hold it. Expired / unknown / already-redeemed -> 4xx.

import { connectLambda, getStore } from '@netlify/blobs';
import crypto from 'crypto';

const STORE_NAME = 'pairing';
const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_BODY_BYTES = 8 * 1024;

const ALLOWED_ORIGINS = new Set([
  'https://presuntinho.netlify.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:4175',
  'http://127.0.0.1:4175',
  'http://localhost:4180',
  'http://127.0.0.1:4180',
  'http://localhost:8888',
  'http://127.0.0.1:8888'
]);
const NETLIFY_PREVIEW_ORIGIN_RE = /^https:\/\/[a-z0-9][a-z0-9-]*--presuntinho\.netlify\.app$/;

function getHeader(headers, name) {
  if (!headers) return undefined;
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
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

function isAllowedOrigin(event) {
  const origin = requestOrigin(event);
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin) || NETLIFY_PREVIEW_ORIGIN_RE.test(origin);
}

function buildResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
    body: JSON.stringify(body)
  };
}

function blobStore(event) {
  connectLambda(event);
  return getStore(STORE_NAME);
}

/** Human-friendly, unambiguous code: 8 chars from a Crockford-ish alphabet. */
function mintCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function normalizeCode(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{6,16}$/.test(code) ? code : null;
}

async function handleCreate(event) {
  const store = blobStore(event);
  const now = Date.now();
  const code = mintCode();
  const token = crypto.randomBytes(24).toString('hex');
  const invite = { token, createdAt: now, expiresAt: now + INVITE_TTL_MS, redeemed: false };
  try {
    await store.setJSON(`invite:${code}`, invite);
  } catch (e) {
    console.error('[pairing] create write failed', e);
    return buildResponse(500, { error: 'create_failed' });
  }
  return buildResponse(200, { code, token, expiresAt: invite.expiresAt });
}

async function handleRedeem(event, payload) {
  const code = normalizeCode(payload.code);
  if (!code) return buildResponse(400, { error: 'invalid_code' });
  const store = blobStore(event);
  let invite;
  try {
    invite = await store.get(`invite:${code}`, { type: 'json' });
  } catch (e) {
    console.error('[pairing] redeem read failed', e);
    return buildResponse(500, { error: 'redeem_failed' });
  }
  if (!invite || typeof invite !== 'object') return buildResponse(404, { error: 'not_found' });
  if (invite.redeemed) return buildResponse(409, { error: 'already_redeemed' });
  if (typeof invite.expiresAt === 'number' && invite.expiresAt < Date.now()) {
    return buildResponse(410, { error: 'expired' });
  }
  invite.redeemed = true;
  invite.redeemedAt = Date.now();
  try {
    await store.setJSON(`invite:${code}`, invite);
  } catch (e) {
    console.error('[pairing] redeem write failed', e);
    return buildResponse(500, { error: 'redeem_failed' });
  }
  return buildResponse(200, { token: invite.token });
}

export const handler = async (event) => {
  const method = event.httpMethod || 'GET';
  if (method !== 'POST') return buildResponse(405, { error: 'method_not_allowed' });
  if (!isAllowedOrigin(event)) return buildResponse(403, { error: 'forbidden_origin' });

  const rawBody = event.body || '';
  const bodyBytes = event.isBase64Encoded
    ? Math.floor((rawBody.length * 3) / 4)
    : Buffer.byteLength(rawBody, 'utf8');
  if (bodyBytes > MAX_BODY_BYTES) return buildResponse(413, { error: 'payload_too_large' });

  let payload;
  try {
    const text = event.isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf8') : rawBody;
    payload = JSON.parse(text || '{}');
  } catch {
    return buildResponse(400, { error: 'invalid_json' });
  }

  try {
    if (payload.action === 'create') return await handleCreate(event);
    if (payload.action === 'redeem') return await handleRedeem(event, payload);
    return buildResponse(400, { error: 'invalid_action' });
  } catch (e) {
    console.error('[pairing] unhandled error', e);
    return buildResponse(500, { error: 'internal_error' });
  }
};
