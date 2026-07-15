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

export interface IncomingGameInviteProof extends GameInviteRow {
  to_account: string;
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

/** A URL is only a hint. Before an invite-bearing deep link joins anything,
 * bind it back to a fresh database row addressed to this exact account and
 * room. Public room links deliberately omit `invite` and do not use this
 * authorization proof. */
export function isAuthorizedGameInviteForJoin(
  row: IncomingGameInviteProof,
  inviteId: string,
  recipientId: string,
  roomCode: string,
  now = Date.now()
): boolean {
  const normalized = normalizeRoomCode(roomCode);
  return row.id === inviteId &&
    row.to_account === recipientId &&
    row.game === 'versus' &&
    normalizeRoomCode(row.room_code) === normalized &&
    isFreshGameInvite({ ...row, room_code: normalized }, now);
}

/** Distinguish a stale fetch from a genuine re-send of the same upserted row. */
export function isInviteNewerThanTombstone(createdAt: string, tombstone: number): boolean {
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) && timestamp > tombstone;
}
