// PBKDF2-SHA256 password verification using Web Crypto API.
// Browser-native, no external deps. 600k iterations is OWASP-recommended for SHA-256.

const ITERATIONS = 600_000;
const HASH_LENGTH_BITS = 256;

export type ProfileId = 'fatma' | 'daniel';
export type HashSlot = 'primary' | 'secret' | 'daniel';

export interface VerifyResult {
  profile: ProfileId;
  method: HashSlot;
}

interface HashesFile {
  salts: Partial<Record<HashSlot, string>>;
  hashes: Partial<Record<HashSlot, string>>;
  profiles?: Partial<Record<HashSlot, ProfileId>>;
}

/**
 * Override payload persisted to localStorage when a user changes their
 * password from Definições.  We can't write to /auth/hashes.json (it's
 * a static file on Netlify), so we shadow individual slots in
 * localStorage and `loadEffectiveHashes()` merges the two sources.
 *
 * Schema is the same as HashesFile but each entry is the *new* hash /
 * salt for that slot.  `profiles` is intentionally absent — the slot
 * already maps to a profile in the static file.
 */
export interface HashesOverride {
  salts: Partial<Record<HashSlot, string>>;
  hashes: Partial<Record<HashSlot, string>>;
  updatedAt: number;
}

const HASHES_OVERRIDE_KEY = 'presuntinho-hashes-override';

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive a PBKDF2-SHA256 hash of `password` with `salt`, hex-encoded.
 *
 * Mirrors the derivation inside `verifyPassword` exactly (same 600k
 * iterations, SHA-256, 256-bit output).  Exists so `setPassword` can
 * produce a fresh hash to overwrite the slot without changing the
 * existing verify-side API.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const saltBytes = new TextEncoder().encode(salt);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    HASH_LENGTH_BITS
  );
  return bufToHex(derivedBits);
}

export async function verifyPassword(password: string, salt: string, expectedHashHex: string): Promise<boolean> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const saltBytes = new TextEncoder().encode(salt);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    HASH_LENGTH_BITS
  );
  const derivedHex = bufToHex(derivedBits);
  if (derivedHex.length !== expectedHashHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < derivedHex.length; i++) {
    mismatch |= derivedHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function verifyAgainstHashes(password: string): Promise<VerifyResult | null> {
  const res = await fetch('/auth/hashes.json', { cache: 'no-store' });
  if (!res.ok) return null;
  const hashes = (await res.json()) as HashesFile;
  const trimPwd = password.trim();

  const slots: HashSlot[] = ['primary', 'secret', 'daniel'];
  for (const slot of slots) {
    const salt = hashes.salts?.[slot];
    const expected = hashes.hashes?.[slot];
    if (!salt || !expected) continue;
    const ok = await verifyPassword(trimPwd, salt, expected);
    if (!ok) continue;
    const profile = hashes.profiles?.[slot] ?? (slot === 'daniel' ? 'daniel' : 'fatma');
    return { profile, method: slot };
  }

  return null;
}

/**
 * Read the user-supplied override (if any) from localStorage.
 * Returns an empty override on first read / SSR / quota errors.
 */
export function readHashesOverride(): HashesOverride {
  const empty: HashesOverride = { salts: {}, hashes: {}, updatedAt: 0 };
  if (typeof localStorage === 'undefined') return empty;
  try {
    const raw = localStorage.getItem(HASHES_OVERRIDE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<HashesOverride>;
    return {
      salts: parsed.salts ?? {},
      hashes: parsed.hashes ?? {},
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
    };
  } catch {
    return empty;
  }
}

/**
 * Write the override back to localStorage.  We persist *every* slot so
 * future reads are deterministic; callers pass the full `overrides`
 * object they want stored.
 */
export function writeHashesOverride(overrides: HashesOverride): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(HASHES_OVERRIDE_KEY, JSON.stringify(overrides));
  } catch {
    // Quota / private-mode: best-effort.  Caller decides whether to
    // surface this to the user.
  }
}

/**
 * Fetch the static hashes.json and merge any localStorage override on
 * top of it.  Slots present in the override completely replace the
 * static values — both salt and hash must agree (we write them as a
 * pair in `setPassword`).
 */
export async function loadEffectiveHashes(): Promise<HashesFile> {
  const res = await fetch('/auth/hashes.json', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`loadEffectiveHashes: failed to fetch hashes.json (${res.status})`);
  }
  const base = (await res.json()) as HashesFile;
  const override = readHashesOverride();
  const slots: HashSlot[] = ['primary', 'secret', 'daniel'];
  for (const slot of slots) {
    const salt = override.salts?.[slot];
    const hash = override.hashes?.[slot];
    if (salt && hash) {
      base.salts = { ...base.salts, [slot]: salt };
      base.hashes = { ...base.hashes, [slot]: hash };
    }
  }
  return base;
}

/**
 * Same iteration order and matching logic as `verifyAgainstHashes`, but
 * uses the merged static + localStorage hashes so a user-changed
 * password is honoured on the very next login.
 */
export async function verifyAgainstEffectiveHashes(password: string): Promise<VerifyResult | null> {
  let hashes: HashesFile;
  try {
    hashes = await loadEffectiveHashes();
  } catch {
    return null;
  }
  const trimPwd = password.trim();

  const slots: HashSlot[] = ['primary', 'secret', 'daniel'];
  for (const slot of slots) {
    const salt = hashes.salts?.[slot];
    const expected = hashes.hashes?.[slot];
    if (!salt || !expected) continue;
    const ok = await verifyPassword(trimPwd, salt, expected);
    if (!ok) continue;
    const profile = hashes.profiles?.[slot] ?? (slot === 'daniel' ? 'daniel' : 'fatma');
    return { profile, method: slot };
  }

  return null;
}

/**
 * Which static slot maps to each profile.  Mirrors hashes.json's
 * `profiles` field so callers don't need to fetch the file twice just
 * to find the right slot to overwrite.
 */
const PROFILE_TO_SLOT: Record<ProfileId, HashSlot> = {
  fatma: 'primary',
  daniel: 'daniel'
};

/**
 * Persist a new password for the active profile by re-hashing it with
 * PBKDF2-SHA256 (600k iterations, 256-bit output — same params as
 * `verifyPassword`) and writing it to localStorage.  Returns the slot
 * that was overwritten.
 *
 * The static /auth/hashes.json cannot be mutated from the browser
 * (it's deployed via Netlify), so the new hash lives in
 * `presuntinho-hashes-override` and is merged in by
 * `loadEffectiveHashes` on every subsequent login attempt.
 *
 * gap-116: this is the write-side of the new reset_password flow.
 */
export async function setPassword(profileId: ProfileId, newPassword: string): Promise<HashSlot> {
  const slot = PROFILE_TO_SLOT[profileId];
  if (!slot) {
    throw new Error(`setPassword: unknown profileId ${String(profileId)}`);
  }
  // Fresh salt per write.  16 random bytes → 32 hex chars.  We append
  // the slot name so the salt is still self-describing in the override
  // file (matches the static-file convention).
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const saltHex = bufToHex(saltBytes.buffer);
  const newSalt = `presuntinho-${slot}-override-${saltHex}`;
  const newHash = await hashPassword(newPassword, newSalt);

  const existing = readHashesOverride();
  const next: HashesOverride = {
    salts: { ...existing.salts, [slot]: newSalt },
    hashes: { ...existing.hashes, [slot]: newHash },
    updatedAt: Date.now()
  };
  writeHashesOverride(next);
  return slot;
}
