import { isValidRoomCode, normalizeRoomCode } from '$lib/multiplayer/room-code';

export const GAME_INVITE_TTL_MS = 15 * 60 * 1000;

export interface GameInviteRow {
  id: string;
  from_account: string;
  room_code: string;
  game: string;
  created_at: string;
  expires_at: string;
  cancelled_at: string | null;
}

export function isFreshGameInvite(
  row: Pick<GameInviteRow, 'room_code' | 'expires_at' | 'cancelled_at'>,
  now = Date.now()
): boolean {
  const expiresAt = Date.parse(row.expires_at);
  return row.cancelled_at === null && isValidRoomCode(row.room_code) && Number.isFinite(expiresAt) && expiresAt > now;
}

export function normalizeGameInviteRow(row: GameInviteRow): GameInviteRow {
  return { ...row, room_code: normalizeRoomCode(row.room_code) };
}

/** Distinguish a stale fetch from a genuine re-send of the same upserted row. */
export function isInviteNewerThanTombstone(createdAt: string, tombstone: number): boolean {
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) && timestamp > tombstone;
}
