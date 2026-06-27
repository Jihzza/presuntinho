// PBKDF2-SHA256 password verification using Web Crypto API.
// Browser-native, no external deps. 600k iterations is OWASP-recommended for SHA-256.

const ITERATIONS = 600_000;
const HASH_LENGTH_BITS = 256;

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuf(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
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
  // Constant-time-ish comparison (still string compare, but identical-length hex)
  if (derivedHex.length !== expectedHashHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < derivedHex.length; i++) {
    mismatch |= derivedHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function verifyAgainstHashes(password: string): Promise<'primary' | 'secret' | null> {
  const res = await fetch('/auth/hashes.json', { cache: 'no-store' });
  if (!res.ok) return null;
  const hashes = await res.json();
  const trimPwd = password.trim();

  const primaryOk = await verifyPassword(trimPwd, hashes.salts.primary, hashes.hashes.primary);
  if (primaryOk) return 'primary';

  const secretOk = await verifyPassword(trimPwd, hashes.salts.secret, hashes.hashes.secret);
  if (secretOk) return 'secret';

  return null;
}