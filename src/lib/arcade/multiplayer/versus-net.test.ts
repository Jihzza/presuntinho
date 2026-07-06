import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VersusNet } from './versus-net';
import type { Room, PeerMeta, RoomRole } from '$lib/multiplayer/realtime';

// A pair of in-process Rooms wired to each other: sending on one synchronously
// delivers to the other's handlers. Enough to exercise the host/guest netcode
// without a real Supabase connection.
function makeMockRoomPair(): [Room, Room] {
  const handlers: Record<'host' | 'guest', Map<string, Set<(p: any) => void>>> = {
    host: new Map(),
    guest: new Map()
  };
  function make(role: RoomRole, otherRole: 'host' | 'guest'): Room {
    const self: PeerMeta = { role, name: role, mascot: 'perfume' };
    return {
      role,
      self,
      send(event, payload) {
        const set = handlers[otherRole].get(event);
        if (set) for (const cb of set) cb(payload);
      },
      on(event, cb) {
        const map = handlers[role === 'host' ? 'host' : 'guest'];
        let set = map.get(event);
        if (!set) map.set(event, (set = new Set()));
        set.add(cb);
        return () => set!.delete(cb);
      },
      onPeerChange(cb) {
        cb(role === 'host' ? { role: 'guest', name: 'g', mascot: 'perfume' } : { role: 'host', name: 'h', mascot: 'perfume' });
        return () => {};
      },
      peerPresent: () => true,
      leave: async () => {}
    };
  }
  return [make('host', 'guest'), make('guest', 'host')];
}

describe('VersusNet (host-authoritative netcode)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('replicates the host board to the guest each tick', () => {
    const [hostRoom, guestRoom] = makeMockRoomPair();
    let guestState: any = null;
    const hostNet = new VersusNet({ room: hostRoom, cols: 12, rows: 12, onState: () => {}, stepMs: 100 });
    const guestNet = new VersusNet({ room: guestRoom, cols: 12, rows: 12, onState: (s) => (guestState = s), stepMs: 100 });
    hostNet.start(123);
    guestNet.start(0); // guest → sends 'hello'; host replies with current state

    // guest should have received the initial state from the host's hello reply
    expect(guestState).not.toBeNull();
    const tick0 = guestState.tick;

    vi.advanceTimersByTime(350); // ~3 host ticks
    expect(guestState.tick).toBeGreaterThan(tick0);
    // guest mirrors the host's authoritative board
    expect(guestState.snakes).toHaveLength(2);

    hostNet.stop();
    guestNet.stop();
  });

  it('applies the guest turn to player 1 on the host', () => {
    const [hostRoom, guestRoom] = makeMockRoomPair();
    let hostState: any = null;
    const hostNet = new VersusNet({ room: hostRoom, cols: 14, rows: 14, onState: (s) => (hostState = s), stepMs: 100 });
    const guestNet = new VersusNet({ room: guestRoom, cols: 14, rows: 14, onState: () => {}, stepMs: 100 });
    hostNet.start(7);
    guestNet.start(0);

    // player 1 starts facing 'left'; a guest 'down' turn is legal and should stick
    guestNet.setLocalTurn('down');
    vi.advanceTimersByTime(120); // one host tick applies the queued turn
    expect(hostState.snakes[1].dir).toBe('down');

    hostNet.stop();
    guestNet.stop();
  });

  it('exposes the correct local player id per role', () => {
    const [hostRoom, guestRoom] = makeMockRoomPair();
    const hostNet = new VersusNet({ room: hostRoom, cols: 10, rows: 10, onState: () => {}, stepMs: 100 });
    const guestNet = new VersusNet({ room: guestRoom, cols: 10, rows: 10, onState: () => {}, stepMs: 100 });
    expect(hostNet.localPlayer).toBe(0);
    expect(guestNet.localPlayer).toBe(1);
    hostNet.stop();
    guestNet.stop();
  });
});
