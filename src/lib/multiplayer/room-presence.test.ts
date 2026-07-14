import { describe, expect, it } from 'vitest';
import { matchesSeatEnvelope, retainSeat, seatConflicts } from './room-presence';

describe('multiplayer seat ownership', () => {
  it('chooses one deterministic guest for an empty seat', () => {
    expect(retainSeat(null, ['guest-c', 'guest-b'])).toBe('guest-b');
  });

  it('does not let a later lexically smaller guest evict the current player', () => {
    expect(retainSeat('guest-c', ['guest-b', 'guest-c'])).toBe('guest-c');
  });

  it('hands the seat to a waiting guest only after the current player leaves', () => {
    expect(retainSeat('guest-c', ['guest-b'])).toBe('guest-b');
    expect(retainSeat('guest-c', [])).toBeNull();
  });

  it('only rejects a guest after the host names a different winner', () => {
    expect(seatConflicts(null, 'guest-c')).toBe(false);
    expect(seatConflicts('guest-c', 'guest-c')).toBe(false);
    expect(seatConflicts('guest-b', 'guest-c')).toBe(true);
  });

  it('rejects input from another guest and from the previous seat epoch', () => {
    expect(
      matchesSeatEnvelope(
        { from: 'guest-c', to: 'host-a', epoch: 'epoch-2' },
        'guest-c',
        'host-a',
        'epoch-2'
      )
    ).toBe(true);
    expect(
      matchesSeatEnvelope(
        { from: 'guest-b', to: 'host-a', epoch: 'epoch-2' },
        'guest-c',
        'host-a',
        'epoch-2'
      )
    ).toBe(false);
    expect(
      matchesSeatEnvelope(
        { from: 'guest-c', to: 'host-a', epoch: 'epoch-1' },
        'guest-c',
        'host-a',
        'epoch-2'
      )
    ).toBe(false);
  });
});
