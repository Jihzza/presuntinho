// ─────────────────────────────────────────────────────────────────────────────
// Presuntinho — cross-device pairing client (multi-user Phase 1A)
//
// Talks to netlify/functions/pairing.js to exchange an invite code for ONE
// shared "space token" that both phones then hold. This is the handshake only —
// it establishes the shared secret two devices need before they can sync shared
// data. The token is stored locally per member so a later sync layer can use it.
//
// NOTE: the Netlify function only runs on a deployed site (or `netlify dev`),
// never in the plain SvelteKit preview — so this path is validated on deploy.
// ─────────────────────────────────────────────────────────────────────────────

const ENDPOINT = '/.netlify/functions/pairing';
const SPACE_TOKEN_PREFIX = 'presuntinho-space-token';

export interface CreatedInvite {
  code: string;
  token: string;
  expiresAt: number;
}

export class PairingError extends Error {
  code: string;
  constructor(code: string) {
    super(`pairing: ${code}`);
    this.name = 'PairingError';
    this.code = code;
  }
}

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err =
      data && typeof data === 'object' && typeof (data as { error?: string }).error === 'string'
        ? (data as { error: string }).error
        : 'request_failed';
    throw new PairingError(err);
  }
  return data as T;
}

/** Store the shared space token for a member (both paired devices hold it). */
export function setSpaceToken(memberId: string, token: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(`${SPACE_TOKEN_PREFIX}-${memberId}`, token);
}

export function getSpaceToken(memberId: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(`${SPACE_TOKEN_PREFIX}-${memberId}`);
}

/**
 * Create an invite. The creator keeps the returned token; the returned `code`
 * (or the URL from inviteUrl) is shared with the other device out-of-band.
 */
export async function createInvite(): Promise<CreatedInvite> {
  return post<CreatedInvite>({ action: 'create' });
}

/** Redeem a code on the second device — returns the SAME shared token. */
export async function redeemInvite(code: string): Promise<{ token: string }> {
  return post<{ token: string }>({ action: 'redeem', code: code.trim().toUpperCase() });
}

/** The shareable link that opens the redemption route on the other phone. */
export function inviteUrl(code: string): string {
  const origin = typeof location !== 'undefined' ? location.origin : 'https://presuntinho.netlify.app';
  return `${origin}/juntar/${encodeURIComponent(code)}`;
}

// ── pending token handoff (redeem happens before the member exists) ──────────

const PENDING_TOKEN_KEY = 'presuntinho-pending-space-token';

/** Stash a just-redeemed token until onboarding creates the member to bind it. */
export function setPendingSpaceToken(token: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(PENDING_TOKEN_KEY, token);
}

/** Read + clear the pending token (called by onboarding after member creation). */
export function takePendingSpaceToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const t = localStorage.getItem(PENDING_TOKEN_KEY);
  if (t) localStorage.removeItem(PENDING_TOKEN_KEY);
  return t;
}
