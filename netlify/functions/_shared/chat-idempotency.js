import crypto from 'crypto';

const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,96}$/;

/** @param {unknown} value @returns {string | null | undefined} */
export function normalizeChatClientId(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  return CLIENT_ID_RE.test(id) ? id : undefined;
}

/**
 * @param {string} profile
 * @param {string} conversationId
 * @param {string} clientId
 */
export function chatIdempotencyKey(profile, conversationId, clientId) {
  return `send:${profile}:${conversationId}:${clientId}`;
}

/**
 * @param {{ conversationId: string, text?: string | null, media?: string | null, name?: string | null }} input
 */
export function chatPayloadFingerprint({ conversationId, text, media, name }) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ conversationId, text: text ?? null, media: media ?? null, name: name ?? null }))
    .digest('hex');
}

/** Atomically claim `(sender, conversation, clientId)`. The stored message is
 * the canonical response for every replay, including media uploads.
 * @template T
 * @param {{
 *   setJSON: (key: string, value: unknown, options: { onlyIfNew: boolean }) => Promise<{ modified?: boolean } | void>,
 *   get: (key: string, options: { type: 'json', consistency: 'strong' }) => Promise<unknown>
 * }} store
 * @param {{ key: string, fingerprint: string, message: T }} input
 * @returns {Promise<{ status: 'claimed' | 'replay' | 'conflict', message: T }>}
 */
export async function claimChatMessage(store, { key, fingerprint, message }) {
  const claim = { fingerprint, message };
  const result = await store.setJSON(key, claim, { onlyIfNew: true });
  if (result?.modified) return { status: 'claimed', message };

  const raw = await store.get(key, { type: 'json', consistency: 'strong' });
  const existing = /** @type {{ fingerprint?: unknown, message?: unknown } | null} */ (
    raw && typeof raw === 'object' ? raw : null
  );
  if (!existing?.message || typeof existing.fingerprint !== 'string') {
    throw new Error('idempotency_claim_unavailable');
  }
  const canonical = /** @type {T} */ (existing.message);
  if (existing.fingerprint !== fingerprint) return { status: 'conflict', message: canonical };
  return { status: 'replay', message: canonical };
}
