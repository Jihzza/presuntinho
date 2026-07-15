import { describe, expect, it } from 'vitest';
import {
  isAuthorizedGameInviteForJoin,
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

  it('binds an invite deep link to the exact recipient, room and active row', () => {
    const proof = { ...base, to_account: 'account-2' };
    const now = Date.parse('2026-07-15T10:10:00.000Z');
    expect(isAuthorizedGameInviteForJoin(proof, 'invite-1', 'account-2', ' abcd23 ', now)).toBe(true);
    expect(isAuthorizedGameInviteForJoin(proof, 'invite-2', 'account-2', 'ABCD23', now)).toBe(false);
    expect(isAuthorizedGameInviteForJoin(proof, 'invite-1', 'account-3', 'ABCD23', now)).toBe(false);
    expect(isAuthorizedGameInviteForJoin(proof, 'invite-1', 'account-2', 'XYZ567', now)).toBe(false);
    expect(isAuthorizedGameInviteForJoin({ ...proof, game: 'other' }, 'invite-1', 'account-2', 'ABCD23', now)).toBe(false);
    expect(isAuthorizedGameInviteForJoin(proof, 'invite-1', 'account-2', 'ABCD23', Date.parse(base.expires_at))).toBe(false);
  });
});
