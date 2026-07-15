import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['eq', 'is', 'gt']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = maybeSingle;
  const select = vi.fn(() => builder);
  const from = vi.fn(() => ({ select }));
  return {
    builder,
    from,
    getAuthUser: vi.fn(),
    maybeSingle,
    select
  };
});

vi.mock('$lib/multiplayer/client', () => ({
  getSupabaseClient: () => ({ from: mocks.from })
}));
vi.mock('$lib/multiplayer/config', () => ({ isMultiplayerConfigured: () => true }));
vi.mock('./auth', () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock('$lib/push', () => ({ sendPushNotify: vi.fn() }));

import { validateIncomingGameInvite } from './game-invites';

const INVITE_ID = '77777777-7777-4777-8777-777777777777';
const USER_ID = '88888888-8888-4888-8888-888888888888';

describe('game invite deep-link validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({ id: USER_ID });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: INVITE_ID,
        from_account: '99999999-9999-4999-8999-999999999999',
        to_account: USER_ID,
        room_code: 'ABC234',
        game: 'versus',
        created_at: new Date(Date.now() - 1_000).toISOString(),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        cancelled_at: null
      },
      error: null
    });
  });

  it('fails malformed invite parameters before touching auth or the database', async () => {
    await expect(validateIncomingGameInvite('not-a-uuid', 'ABC234')).resolves.toBeNull();
    await expect(validateIncomingGameInvite(INVITE_ID, 'BAD')).resolves.toBeNull();
    expect(mocks.getAuthUser).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('queries only the signed-in recipient and exact room before accepting', async () => {
    await expect(validateIncomingGameInvite(INVITE_ID, ' abc234 ')).resolves.toMatchObject({
      id: INVITE_ID,
      to_account: USER_ID,
      room_code: 'ABC234'
    });
    expect(mocks.from).toHaveBeenCalledWith('game_invites');
    expect(mocks.builder.eq).toHaveBeenCalledWith('id', INVITE_ID);
    expect(mocks.builder.eq).toHaveBeenCalledWith('to_account', USER_ID);
    expect(mocks.builder.eq).toHaveBeenCalledWith('room_code', 'ABC234');
    expect(mocks.builder.eq).toHaveBeenCalledWith('game', 'versus');
    expect(mocks.builder.is).toHaveBeenCalledWith('cancelled_at', null);
    expect(mocks.builder.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
  });

  it('fails closed for a stale/mismatched row returned by the backend', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: INVITE_ID,
        from_account: '99999999-9999-4999-8999-999999999999',
        to_account: USER_ID,
        room_code: 'XYZ567',
        game: 'versus',
        created_at: new Date(Date.now() - 1_000).toISOString(),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        cancelled_at: null
      },
      error: null
    });
    await expect(validateIncomingGameInvite(INVITE_ID, 'ABC234')).resolves.toBeNull();
  });
});
