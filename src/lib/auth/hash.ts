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

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
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
