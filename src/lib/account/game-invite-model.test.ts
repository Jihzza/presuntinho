import { describe, expect, it } from 'vitest';
import {
  isFreshGameInvite,
  isInviteNewerThanTombstone,
  normalizeGameInviteRow,
  type GameInviteRow
} from './game-invite-model';

const base: GameInviteRow = {
  id: 'invite-1',
  from_account: 'account-1',
  room_code: 'ABCD23',
  game: 'versus',
  created_at: '2026-07-15T10:00:00.000Z',
  expires_at: '2026-07-15T10:15:00.000Z',
  cancelled_at: null
};

describe('game invite model', () => {
  it('accepts a well-formed invite before its expiry', () => {
    expect(isFreshGameInvite(base, Date.parse('2026-07-15T10:14:59.000Z'))).toBe(true);
  });

  it('rejects expired and malformed invites', () => {
    expect(isFreshGameInvite(base, Date.parse(base.expires_at))).toBe(false);
    expect(isFreshGameInvite({ ...base, room_code: 'BAD' }, Date.parse(base.created_at))).toBe(false);
    expect(isFreshGameInvite({ ...base, expires_at: 'not-a-date' }, Date.parse(base.created_at))).toBe(false);
    expect(isFreshGameInvite({ ...base, cancelled_at: base.created_at }, Date.parse(base.created_at))).toBe(false);
  });

  it('normalizes the room code received from the database', () => {
    expect(normalizeGameInviteRow({ ...base, room_code: ' abcd23 ' }).room_code).toBe('ABCD23');
  });

  it('blocks a stale fetch after cancellation but permits a later re-send', () => {
    const cancelledAt = Date.parse('2026-07-15T10:05:00.000Z');
    expect(isInviteNewerThanTombstone(base.created_at, cancelledAt)).toBe(false);
    expect(isInviteNewerThanTombstone('2026-07-15T10:06:00.000Z', cancelledAt)).toBe(true);
    expect(isInviteNewerThanTombstone('not-a-date', cancelledAt)).toBe(false);
  });
});
