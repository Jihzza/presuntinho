const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

export const ROOM_CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** A short, unambiguous room code (no easily-confused characters). */
export function makeRoomCode(): string {
  let out = '';
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  for (const byte of bytes) out += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
  return out;
}

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidRoomCode(value: string): boolean {
  return ROOM_CODE_RE.test(normalizeRoomCode(value));
}

/** Build the complete deep link that joins a room automatically. */
export function roomInviteUrl(code: string, origin: string): string {
  const normalized = normalizeRoomCode(code);
  if (!isValidRoomCode(normalized)) throw new Error('invalid room code');
  return `${origin.replace(/\/$/, '')}/secrets/versus/?join=${encodeURIComponent(normalized)}`;
}
