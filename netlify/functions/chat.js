// netlify/functions/chat.js
//
// Private 1:1 chat between fatma and daniel, persisted in Netlify Blobs.
//
// Scaffolding mirrors love-lock.js: connectLambda(event) before EVERY
// getStore() (Lambda-compat mode does NOT auto-inject NETLIFY_BLOBS_CONTEXT),
// Origin/Referer allow-list on writes, and no-store cache headers throughout.
//
// AUTH: every request must carry the header `x-chat-token`, compared in
// constant time against the CHAT_TOKEN_FATMA / CHAT_TOKEN_DANIEL env secrets.
// The matching secret determines the profile ('fatma' | 'daniel'); anything
// else is a 401. Tokens are handed out out-of-band (they never transit here
// except as the header itself).
//
// DATA MODEL (store 'chat'):
//   'log:<YYYY-MM-DD>'  → JSON array of {id, from, text?, mediaKey?,
//                          mediaType?, name?, conversationId?, ts}
//                          (UTC day chunks)
//   'meta'              → { latestTs, lastRead: { fatma, daniel } }
//   'media:<id>'        → dataURL string for the message with that id
//
// ENDPOINTS (httpMethod + query):
//   GET  ?since=<ms>  → { messages: [...], meta }  (fast path: latestTs<=since)
//   GET  ?media=<id>  → { dataUrl }
//   POST { text }                       → append text message, return it
//   POST { media: dataURL, name }      → store blob + append media message
//   POST { read: <ms> }                → meta.lastRead[profile] = max(old, ms)
//
// Bodies larger than ~4MB are rejected with 413; media payloads are capped
// at 3MB decoded and must be image/* or audio/*.

import { connectLambda, getStore } from '@netlify/blobs';
import crypto from 'crypto';
import {
  chatIdempotencyKey,
  chatPayloadFingerprint,
  claimChatMessage,
  normalizeChatClientId,
} from './_shared/chat-idempotency.js';

const STORE_NAME = 'chat';
const META_KEY = 'meta';
const MAX_BODY_BYTES = 4.2 * 1024 * 1024; // ~4MB JSON envelope
const MAX_MEDIA_BYTES = 3 * 1024 * 1024; // 3MB decoded media
const MAX_TEXT_LEN = 4000;
const MAX_NAME_LEN = 180;
const MAX_CONVERSATION_ID_LEN = 64;
const MAX_DAY_CHUNKS = 7; // never scan more than a week of chunks
const DAY_MS = 24 * 60 * 60 * 1000;
// ── couple sync (shared points + love/nudge pings + async game scores) ──
const MAX_POINT_BATCH = 100; // a single tap-flush can carry at most this many
const MAX_COUPLE_POINTS = 100_000_000; // hard ceiling so a bug can't run away
const MAX_GAME_SCORE = 10_000_000;
const MAX_GAME_ID_LEN = 40;
const MAX_GAME_IDS = 64; // cap distinct games so scores{} can't grow unbounded
const COUPLE_KINDS = new Set(['point', 'love', 'nudge', 'score']);

const clampPoints = (v) => Math.max(0, Math.min(MAX_COUPLE_POINTS, Math.floor(v)));
const clampScore = (v) => Math.max(0, Math.min(MAX_GAME_SCORE, Math.floor(v)));

const ALLOWED_ORIGINS = new Set([
  'https://presuntinho.love',
  'https://presuntinho.netlify.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:4175',
  'http://127.0.0.1:4175',
  'http://localhost:4180',
  'http://127.0.0.1:4180',
  // `netlify dev` proxy (functions only exist locally behind this port).
  'http://localhost:8888',
  'http://127.0.0.1:8888',
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

export function isAllowedOrigin(event) {
  const origin = requestOrigin(event);
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin) || NETLIFY_PREVIEW_ORIGIN_RE.test(origin);
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

function blobStore(event) {
  // Lambda-compat bootstrap — MUST run before every getStore(). See the long
  // comment in love-lock.js: NETLIFY_BLOBS_CONTEXT is not auto-injected in
  // Lambda-compat mode; only the Lambda event carries the blobs config, and
  // connectLambda is idempotent + cheap, so we re-bind per request.
  connectLambda(event);
  return getStore(STORE_NAME);
}

/**
 * Constant-time token comparison. Hashing both sides first gives us
 * equal-length buffers for crypto.timingSafeEqual regardless of input
 * lengths, so neither content nor length leaks through timing.
 */
function tokensMatch(provided, expected) {
  if (!provided || !expected) return false;
  const a = crypto.createHash('sha256').update(String(provided)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Resolve the authenticated profile from x-chat-token, or null. */
function authProfile(event) {
  const token = getHeader(event?.headers, 'x-chat-token');
  if (!token || typeof token !== 'string') return null;
  const candidates = [
    ['fatma', process.env.CHAT_TOKEN_FATMA],
    ['daniel', process.env.CHAT_TOKEN_DANIEL],
  ];
  let matched = null;
  // Always test both candidates so the loop cost doesn't depend on which
  // profile matched.
  for (const [profile, secret] of candidates) {
    if (secret && tokensMatch(token, secret) && !matched) matched = profile;
  }
  return matched;
}

/** UTC day key for a timestamp — deterministic on the server, no DST games. */
function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function logKey(ts) {
  return `log:${dayKey(ts)}`;
}

function defaultCouple() {
  return {
    // per-profile tally — total shared points = fatma + daniel. Splitting the
    // counter by author keeps the two partners' increments race-free.
    points: { fatma: 0, daniel: 0 },
    // async game competition: high score per game per profile.
    scores: {},
    // transient "someone pinged you" markers; the partner's poller reacts once
    // to a ts it hasn't seen and then ignores it.
    pings: { fatma: null, daniel: null },
  };
}

function normalizePing(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if ((raw.kind !== 'love' && raw.kind !== 'nudge') || typeof raw.ts !== 'number') return null;
  return { kind: raw.kind, ts: raw.ts };
}

function normalizeCouple(raw) {
  const couple = defaultCouple();
  if (!raw || typeof raw !== 'object') return couple;
  if (raw.points && typeof raw.points === 'object') {
    // Clamp on READ too so a corrupted/oversized historical value can't leak
    // past the write-side ceilings via the max() merge later.
    if (Number.isFinite(raw.points.fatma)) couple.points.fatma = clampPoints(raw.points.fatma);
    if (Number.isFinite(raw.points.daniel)) couple.points.daniel = clampPoints(raw.points.daniel);
  }
  if (raw.scores && typeof raw.scores === 'object') {
    for (const [gameId, entry] of Object.entries(raw.scores)) {
      // Also bound the number of distinct games kept on read, so an already
      // bloated blob is trimmed rather than re-persisted in full.
      if (Object.keys(couple.scores).length >= MAX_GAME_IDS) break;
      if (!/^[a-zA-Z0-9_-]{1,40}$/.test(gameId) || !entry || typeof entry !== 'object') continue;
      const e = {};
      if (Number.isFinite(entry.fatma)) e.fatma = clampScore(entry.fatma);
      if (Number.isFinite(entry.daniel)) e.daniel = clampScore(entry.daniel);
      if ('fatma' in e || 'daniel' in e) couple.scores[gameId] = e;
    }
  }
  if (raw.pings && typeof raw.pings === 'object') {
    couple.pings.fatma = normalizePing(raw.pings.fatma);
    couple.pings.daniel = normalizePing(raw.pings.daniel);
  }
  return couple;
}

function defaultMeta() {
  return { latestTs: 0, lastRead: { fatma: 0, daniel: 0 }, couple: defaultCouple() };
}

function normalizeMeta(raw) {
  const meta = defaultMeta();
  if (raw && typeof raw === 'object') {
    if (typeof raw.latestTs === 'number' && Number.isFinite(raw.latestTs)) {
      meta.latestTs = raw.latestTs;
    }
    if (raw.lastRead && typeof raw.lastRead === 'object') {
      if (typeof raw.lastRead.fatma === 'number') meta.lastRead.fatma = raw.lastRead.fatma;
      if (typeof raw.lastRead.daniel === 'number') meta.lastRead.daniel = raw.lastRead.daniel;
    }
    meta.couple = normalizeCouple(raw.couple);
  }
  return meta;
}

async function readMeta(store) {
  try {
    const raw = await store.get(META_KEY, { type: 'json' });
    return normalizeMeta(raw);
  } catch (e) {
    console.error('[chat] meta read failed', e);
    return defaultMeta();
  }
}

async function readChunk(store, key) {
  try {
    const raw = await store.get(key, { type: 'json' });
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    console.error('[chat] chunk read failed', key, e);
    return [];
  }
}

/** Idempotent, CAS-backed append. It protects both replayed client ids and
 * unrelated concurrent messages from the read-modify-write lost-update race. */
async function ensureMessageLogged(store, message) {
  const key = logKey(message.ts);
  for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
    const current = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const chunk = Array.isArray(current?.data) ? current.data : [];
    if (chunk.some((candidate) => candidate?.id === message.id)) return;
    const next = [...chunk.filter((candidate) => candidate?.id !== message.id), message]
      .sort((a, b) => (a?.ts || 0) - (b?.ts || 0) || String(a?.id || '').localeCompare(String(b?.id || '')));
    const conditions = current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true };
    const result = await store.setJSON(key, next, conditions);
    if (result?.modified) return;
  }
  throw new Error('chat_log_contention');
}

/** Monotonic meta cursor update; preserves concurrent read/couple fields. */
async function bumpMessageCursor(store, ts) {
  for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
    const current = await store.getWithMetadata(META_KEY, { type: 'json', consistency: 'strong' });
    const meta = normalizeMeta(current?.data);
    if (meta.latestTs >= ts) return meta;
    meta.latestTs = ts;
    const conditions = current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true };
    const result = await store.setJSON(META_KEY, meta, conditions);
    if (result?.modified) return meta;
  }
  throw new Error('chat_meta_contention');
}

function isValidMessageShape(m) {
  return m && typeof m === 'object' && typeof m.id === 'string' && typeof m.ts === 'number';
}

function normalizeConversationId(value) {
  if (typeof value !== 'string') return 'main';
  const id = value.trim().slice(0, MAX_CONVERSATION_ID_LEN);
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id) ? id : 'main';
}

// data:image/...;base64,xxxx  or  data:audio/...;base64,xxxx
const MEDIA_DATA_URL_RE = /^data:((?:image|audio)\/[\w.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

function mintId(ts, profile) {
  const rand4 = crypto.randomBytes(3).toString('base64url').slice(0, 4);
  return `${ts}-${profile}-${rand4}`;
}

// ── GET ── history since a timestamp, or a media blob ──
async function handleGet(event, profile) {
  const store = blobStore(event);
  const query = event.queryStringParameters || {};

  if (query.media) {
    const id = String(query.media);
    if (!/^[\w-]{1,80}$/.test(id)) {
      return buildResponse(400, { error: 'invalid_media_id' });
    }
    let dataUrl;
    try {
      dataUrl = await store.get(`media:${id}`);
    } catch (e) {
      console.error('[chat] media read failed', e);
      return buildResponse(500, { error: 'media_read_failed' });
    }
    if (!dataUrl || typeof dataUrl !== 'string') {
      return buildResponse(404, { error: 'media_not_found' });
    }
    return buildResponse(200, { dataUrl });
  }

  const sinceRaw = Number(query.since || 0);
  const since = Number.isFinite(sinceRaw) && sinceRaw > 0 ? sinceRaw : 0;
  const conversationId = normalizeConversationId(query.conversationId);

  const meta = await readMeta(store);
  // Fast path — nothing newer than the caller's cursor: one blob read total.
  // Do not use it for since=0: if a previous meta write failed after the log
  // append, a cold reload would otherwise skip the chunk scan and hide stored
  // messages. Scanning recent chunks on initial load is cheap and self-heals
  // the user-visible timeline.
  if (since > 0 && meta.latestTs <= since) {
    return buildResponse(200, { messages: [], meta, profile });
  }

  const now = Date.now();
  // Scan window: from the `since` day up to today, capped at 7 day-chunks.
  const earliest = Math.max(since, now - (MAX_DAY_CHUNKS - 1) * DAY_MS);
  const keys = [];
  // Walk backwards from today so the cap trims the OLDEST days first.
  for (let ts = now; keys.length < MAX_DAY_CHUNKS; ts -= DAY_MS) {
    keys.unshift(logKey(ts));
    if (dayKey(ts) <= dayKey(earliest)) break;
  }

  const chunks = await Promise.all(keys.map((k) => readChunk(store, k)));
  const messages = [];
  for (const chunk of chunks) {
    for (const m of chunk) {
      if (isValidMessageShape(m) && m.ts > since && ((m.conversationId || 'main') === conversationId)) messages.push(m);
    }
  }
  messages.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));

  return buildResponse(200, { messages, meta, profile });
}

/**
 * Compare-and-swap the shared meta blob for couple writes. Reads the current
 * meta WITH its etag, applies `mutate(meta)` (which may return an error string
 * to abort), then writes only if the etag still matches — retrying on conflict
 * so concurrent writers can't silently clobber each other. Sustained
 * contention is returned to the client; an unconditional fallback would
 * overwrite a partner's points, ping, score or read cursor.
 */
const MAX_CAS_RETRIES = 6;
export async function commitCoupleMeta(store, mutate) {
  for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
    let current;
    try {
      current = await store.getWithMetadata(META_KEY, {
        type: 'json',
        consistency: 'strong',
      });
    } catch (e) {
      console.error('[chat] couple meta read failed', e);
      continue;
    }
    const meta = normalizeMeta(current?.data);
    const err = mutate(meta);
    if (err) return { error: err };
    try {
      const opts = current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true };
      const result = await store.setJSON(META_KEY, meta, opts);
      if (result?.modified) return { meta };
    } catch (e) {
      console.error('[chat] couple CAS write failed', e);
    }
  }
  return { error: 'meta_contention', contention: true };
}

/** Monotonic read cursor update that preserves every concurrent meta field. */
export async function commitReadMeta(store, profile, readTs) {
  for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
    let current;
    try {
      current = await store.getWithMetadata(META_KEY, {
        type: 'json',
        consistency: 'strong',
      });
    } catch (e) {
      console.error('[chat] read meta CAS read failed', e);
      continue;
    }
    const meta = normalizeMeta(current?.data);
    const previous = meta.lastRead[profile] || 0;
    if (previous >= readTs) return { meta };
    meta.lastRead[profile] = Math.max(previous, readTs);
    try {
      const opts = current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true };
      const result = await store.setJSON(META_KEY, meta, opts);
      if (result?.modified) return { meta };
    } catch (e) {
      console.error('[chat] read meta CAS write failed', e);
    }
  }
  return { error: 'meta_contention', contention: true };
}

// ── POST ── send text / send media / mark read ──
async function handlePost(event, profile) {
  if (!isAllowedOrigin(event)) {
    return buildResponse(403, { error: 'forbidden_origin' });
  }

  const rawBody = event.body || '';
  const bodyBytes = event.isBase64Encoded
    ? Math.floor((rawBody.length * 3) / 4)
    : Buffer.byteLength(rawBody, 'utf8');
  if (bodyBytes > MAX_BODY_BYTES) {
    return buildResponse(413, { error: 'payload_too_large' });
  }

  let payload;
  try {
    const text = event.isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf8') : rawBody;
    payload = JSON.parse(text || '{}');
  } catch {
    return buildResponse(400, { error: 'invalid_json' });
  }

  const store = blobStore(event);

  // ── mark read ──
  if (typeof payload.read === 'number' && Number.isFinite(payload.read)) {
    const outcome = await commitReadMeta(store, profile, payload.read);
    if (outcome.error) {
      return buildResponse(outcome.contention ? 409 : 500, { error: outcome.error });
    }
    return buildResponse(200, { ok: true, meta: outcome.meta });
  }

  // ── couple sync: shared points / love / nudge / async game score ──
  if (payload.couple && typeof payload.couple === 'object') {
    const kind = payload.couple.kind;
    if (!COUPLE_KINDS.has(kind)) {
      return buildResponse(400, { error: 'invalid_couple_kind' });
    }
    const now = Date.now();

    // Pre-validate the score payload once (outside the CAS retry loop) so a bad
    // request 400s deterministically instead of burning retries.
    let gameId = null;
    let score = 0;
    if (kind === 'score') {
      gameId = String(payload.couple.gameId || '');
      if (!/^[a-zA-Z0-9_-]{1,40}$/.test(gameId) || gameId.length > MAX_GAME_ID_LEN) {
        return buildResponse(400, { error: 'invalid_game_id' });
      }
      score = clampScore(Number.isFinite(Number(payload.couple.score)) ? Number(payload.couple.score) : 0);
    }

    // The mutation, applied to the freshest meta on every CAS attempt. Additive
    // point increments are NOT idempotent, so they must run against a snapshot
    // guarded by an etag (commitCoupleMeta re-reads + re-applies on conflict).
    const mutate = (meta) => {
      if (kind === 'point') {
        let n = Number(payload.couple.n);
        n = Number.isFinite(n) ? Math.floor(n) : 1;
        n = Math.max(1, Math.min(MAX_POINT_BATCH, n));
        meta.couple.points[profile] = clampPoints((meta.couple.points[profile] || 0) + n);
      } else if (kind === 'love' || kind === 'nudge') {
        meta.couple.pings[profile] = { kind, ts: now };
      } else if (kind === 'score') {
        const isNew = !meta.couple.scores[gameId];
        if (isNew && Object.keys(meta.couple.scores).length >= MAX_GAME_IDS) {
          return 'too_many_games';
        }
        const entry = { ...(meta.couple.scores[gameId] || {}) };
        entry[profile] = Math.max(entry[profile] || 0, score);
        meta.couple.scores[gameId] = entry;
      }
      return null;
    };

    const outcome = await commitCoupleMeta(store, mutate);
    if (outcome.error) {
      return buildResponse(outcome.contention ? 409 : 400, { error: outcome.error });
    }
    if (!outcome.meta) return buildResponse(500, { error: 'couple_write_failed' });
    return buildResponse(200, { ok: true, meta: outcome.meta });
  }

  const ts = Date.now();
  const id = mintId(ts, profile);
  const conversationId = normalizeConversationId(payload.conversationId);
  const clientId = normalizeChatClientId(payload.clientId);
  if (clientId === undefined) return buildResponse(400, { error: 'invalid_client_id' });
  let message = null;
  let mediaPayload = null;
  let normalizedText = null;
  let normalizedName = null;

  // ── text message ──
  if (typeof payload.text === 'string') {
    const text = payload.text.trim();
    if (!text) return buildResponse(400, { error: 'empty_text' });
    if (text.length > MAX_TEXT_LEN) return buildResponse(400, { error: 'text_too_long' });
    message = { id, from: profile, text, conversationId, ts };
    normalizedText = text;
  }

  // ── media message ──
  if (!message && typeof payload.media === 'string') {
    const match = MEDIA_DATA_URL_RE.exec(payload.media);
    if (!match) return buildResponse(400, { error: 'invalid_media' });
    const mediaType = match[1];
    const base64 = match[2];
    // Decoded size from base64 length (minus '=' padding).
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const decodedBytes = Math.floor((base64.length * 3) / 4) - padding;
    if (decodedBytes > MAX_MEDIA_BYTES) {
      return buildResponse(413, { error: 'media_too_large' });
    }
    const name =
      typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim().slice(0, MAX_NAME_LEN)
        : undefined;
    message = { id, from: profile, mediaKey: `media:${id}`, mediaType, conversationId, ts };
    if (name) message.name = name;
    mediaPayload = payload.media;
    normalizedName = name ?? null;
  }

  if (!message) {
    return buildResponse(400, { error: 'invalid_payload' });
  }

  if (clientId) {
    message.clientId = clientId;
    try {
      const outcome = await claimChatMessage(store, {
        key: chatIdempotencyKey(profile, conversationId, clientId),
        fingerprint: chatPayloadFingerprint({
          conversationId,
          text: normalizedText,
          media: mediaPayload,
          name: normalizedName,
        }),
        message,
      });
      if (outcome.status === 'conflict') {
        return buildResponse(409, { error: 'client_id_conflict' });
      }
      message = outcome.message;
      if (
        !isValidMessageShape(message) ||
        message.from !== profile ||
        (message.conversationId || 'main') !== conversationId ||
        message.clientId !== clientId
      ) {
        return buildResponse(500, { error: 'invalid_idempotency_claim' });
      }
    } catch (e) {
      console.error('[chat] idempotency claim failed', e);
      return buildResponse(500, { error: 'idempotency_failed' });
    }
  }

  // Claim first, then materialise media. A retry after a crash uses the
  // winner's canonical media key and repairs any missing object/log entry.
  if (mediaPayload && message.mediaKey) {
    try {
      await store.set(message.mediaKey, mediaPayload);
    } catch (e) {
      console.error('[chat] media write failed', e);
      return buildResponse(500, { error: 'media_write_failed' });
    }
  }

  // Replays and unrelated concurrent sends converge on one CAS-backed row.
  try {
    await ensureMessageLogged(store, message);
  } catch (e) {
    console.error('[chat] log write failed', e);
    return buildResponse(500, { error: 'log_write_failed' });
  }

  // Bump the meta cursor so pollers wake up.
  let meta;
  try {
    meta = await bumpMessageCursor(store, message.ts);
  } catch (e) {
    // Non-fatal: message is stored; the next successful write fixes latestTs.
    console.error('[chat] meta bump failed', e);
    meta = await readMeta(store);
    meta.latestTs = Math.max(meta.latestTs, message.ts);
  }

  return buildResponse(200, { message, meta });
}

export const handler = async (event) => {
  const method = event.httpMethod || 'GET';

  if (method !== 'GET' && method !== 'POST') {
    return buildResponse(405, { error: 'method_not_allowed' });
  }

  const profile = authProfile(event);
  if (!profile) {
    return buildResponse(401, { error: 'unauthorized' });
  }

  try {
    if (method === 'GET') return await handleGet(event, profile);
    return await handlePost(event, profile);
  } catch (e) {
    console.error('[chat] unhandled error', e);
    return buildResponse(500, { error: 'internal_error' });
  }
};
