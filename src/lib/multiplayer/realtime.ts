// Realtime room transport — a thin, game-agnostic wrapper over Supabase
// Realtime "broadcast" + "presence". A room is just a named channel
// (`arcade:<code>`); two peers join it, presence tells us when both are
// connected, and broadcast carries the game messages (host state / guest input).
//
// Nothing here is snake-specific and nothing is persisted: broadcast messages
// are fire-and-forget fan-out, so game state never hits the database. Swapping
// Supabase for Ably/PartyKit later means re-implementing only this file against
// the same `Room` shape.

import { type RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient as supabase } from './client';
import { normalizeRoomCode } from './room-code';
import { matchesSeatEnvelope, retainSeat, seatConflicts } from './room-presence';

export { makeRoomCode } from './room-code';

export type RoomRole = 'host' | 'guest';

export interface PeerMeta {
  role: RoomRole;
  name: string;
  mascot: string;
}

export interface Room {
  readonly role: RoomRole;
  readonly self: PeerMeta;
  /** Broadcast a game message to the other peer. */
  send(event: string, payload: unknown): void;
  /** Subscribe to a game message from the other peer. Returns an unsubscribe. */
  on(event: string, cb: (payload: any) => void): () => void;
  /** Fires with the peer's meta when the OTHER player is present, or null when
   *  they leave. Also fires immediately with the current state on subscribe. */
  onPeerChange(cb: (peer: PeerMeta | null) => void): () => void;
  /** Fires when another client has already claimed this same host/guest role.
   * Game lobbies use it to reject a third participant deterministically. */
  onConflict?(cb: (reason: 'role_taken' | null) => void): () => void;
  /** Is the other player currently connected? */
  peerPresent(): boolean;
  /** Leave the room and tear everything down. */
  leave(): Promise<void>;
}

const MSG_EVENT = 'g';
const SEAT_EVENT = 'seat';
const SEAT_REQUEST_EVENT = 'seat-request';
const SEAT_RELEASE_GRACE_MS = 1200;

interface SeatGrant {
  hostKey: string;
  winner: string | null;
  epoch: string | null;
}

interface GameEnvelope {
  v: 1;
  from: string;
  to: string;
  epoch: string;
  event: string;
  data: unknown;
}

interface PresenceMeta extends PeerMeta {
  protocol?: number;
}

const PROTOCOL_VERSION = 2;
const SEAT_REQUEST_RETRIES = 5;

function randomToken(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Join (or create) a room and resolve once we're subscribed. `role` only labels
 * this peer for presence + picks who is authoritative in the netcode; the
 * channel itself is symmetric.
 */
export function joinRoom(code: string, self: PeerMeta): Promise<Room> {
  const sb = supabase();
  // The timestamp keeps duplicate-host arbitration biased towards the host that
  // actually created the room; the random suffix separates same-tick tabs.
  const selfKey = `${self.role}-${Date.now().toString(36)}-${randomToken()}`;
  const channel: RealtimeChannel = sb.channel(`arcade:${normalizeRoomCode(code)}`, {
    config: { broadcast: { self: false, ack: false }, presence: { key: selfKey } }
  });

  const msgHandlers = new Map<string, Set<(p: any) => void>>();
  const peerHandlers = new Set<(p: PeerMeta | null) => void>();
  const conflictHandlers = new Set<(reason: 'role_taken' | null) => void>();
  let peer: PeerMeta | null = null;
  let conflict: 'role_taken' | null = null;
  let authoritativeHostKey: string | null = null;
  let claimedGuestKey: string | null = null;
  let seatWinnerKey: string | null = null;
  let seatEpoch: string | null = null;
  let legacyPeer = false;
  let seatReleaseTimer: ReturnType<typeof setTimeout> | null = null;
  let seatRequestTimer: ReturnType<typeof setTimeout> | null = null;
  let presenceRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let seatRequestsRemaining = 0;
  let presenceRetriesRemaining = 0;
  let presenceTracked = false;
  let closed = false;
  const seatClaims = new Map<string, SeatGrant>();

  const newSeatEpoch = () => randomToken();

  function clearSeatRelease(): void {
    if (seatReleaseTimer) clearTimeout(seatReleaseTimer);
    seatReleaseTimer = null;
  }

  function stopSeatRequests(): void {
    if (seatRequestTimer) clearTimeout(seatRequestTimer);
    seatRequestTimer = null;
    seatRequestsRemaining = 0;
  }

  function startSeatRequests(reset = false): void {
    if (self.role !== 'guest' || closed || !presenceTracked || peer || conflict || legacyPeer) {
      stopSeatRequests();
      return;
    }
    if (reset) seatRequestsRemaining = SEAT_REQUEST_RETRIES;
    if (seatRequestTimer || seatRequestsRemaining <= 0) return;

    const request = () => {
      seatRequestTimer = null;
      if (closed || !presenceTracked || peer || conflict || legacyPeer || seatRequestsRemaining <= 0) {
        stopSeatRequests();
        return;
      }
      seatRequestsRemaining -= 1;
      void channel.send({
        type: 'broadcast',
        event: SEAT_REQUEST_EVENT,
        payload: { guestKey: selfKey }
      });
      if (seatRequestsRemaining > 0) seatRequestTimer = setTimeout(request, 900);
    };
    request();
  }

  function broadcastSeat(): void {
    if (self.role !== 'host' || conflict || authoritativeHostKey !== selfKey) return;
    void channel.send({
      type: 'broadcast',
      event: SEAT_EVENT,
      payload: { hostKey: selfKey, winner: claimedGuestKey, epoch: seatEpoch } satisfies SeatGrant
    });
  }

  function recomputePeer(): void {
    if (closed) return;
    const stateMap = channel.presenceState<PresenceMeta & { key?: string }>();
    const entries = Object.entries(stateMap).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const hostKeys = entries.filter(([, metas]) => metas[0]?.role === 'host').map(([key]) => key);
    const guestKeys = entries.filter(([, metas]) => metas[0]?.role === 'guest').map(([key]) => key);
    authoritativeHostKey = hostKeys[0] ?? null;

    let nextConflict: 'role_taken' | null = null;
    let found: PeerMeta | null = null;
    legacyPeer = false;
    if (self.role === 'host') {
      nextConflict = authoritativeHostKey !== null && authoritativeHostKey !== selfKey ? 'role_taken' : null;
      if (!nextConflict) {
        if (claimedGuestKey && !guestKeys.includes(claimedGuestKey)) {
          // Presence can briefly flicker during a mobile reconnect. Keep the
          // seat sticky for a short grace instead of handing it to a late tab.
          if (!seatReleaseTimer) {
            seatReleaseTimer = setTimeout(() => {
              seatReleaseTimer = null;
              claimedGuestKey = null;
              seatEpoch = null;
              recomputePeer();
            }, SEAT_RELEASE_GRACE_MS);
          }
        } else {
          clearSeatRelease();
          const nextGuest = retainSeat(claimedGuestKey, guestKeys);
          if (nextGuest !== claimedGuestKey) {
            claimedGuestKey = nextGuest;
            seatEpoch = nextGuest ? newSeatEpoch() : null;
          }
        }
        if (claimedGuestKey && guestKeys.includes(claimedGuestKey)) {
          const meta = entries.find(([key]) => key === claimedGuestKey)?.[1][0];
          if (meta) {
            legacyPeer = meta.protocol !== PROTOCOL_VERSION;
            found = { role: meta.role, name: meta.name, mascot: meta.mascot };
          }
        }
      } else {
        clearSeatRelease();
      }
    } else {
      const hostMeta = authoritativeHostKey
        ? entries.find(([key]) => key === authoritativeHostKey)?.[1][0]
        : undefined;
      legacyPeer = !!hostMeta && hostMeta.protocol !== PROTOCOL_VERSION;
      if (legacyPeer) {
        const legacyWinner = guestKeys[0] ?? null;
        nextConflict = seatConflicts(legacyWinner, selfKey) ? 'role_taken' : null;
        seatWinnerKey = nextConflict ? legacyWinner : selfKey;
        seatEpoch = null;
        if (!nextConflict && hostMeta) {
          found = { role: hostMeta.role, name: hostMeta.name, mascot: hostMeta.mascot };
        }
      } else {
        const grant = authoritativeHostKey ? seatClaims.get(authoritativeHostKey) : undefined;
        seatWinnerKey = grant?.winner ?? null;
        seatEpoch = grant?.epoch ?? null;
        const winnerStillPresent = seatWinnerKey !== null && guestKeys.includes(seatWinnerKey);
        nextConflict = winnerStillPresent && seatConflicts(seatWinnerKey, selfKey) ? 'role_taken' : null;
        if (!nextConflict && seatWinnerKey === selfKey && seatEpoch && authoritativeHostKey && hostMeta) {
          found = { role: hostMeta.role, name: hostMeta.name, mascot: hostMeta.mascot };
        }
      }
    }

    if (nextConflict !== conflict) {
      conflict = nextConflict;
      for (const cb of conflictHandlers) cb(conflict);
    }
    const changed = JSON.stringify(found) !== JSON.stringify(peer);
    peer = found;
    if (changed) for (const cb of peerHandlers) cb(peer);
    if (self.role === 'host') broadcastSeat();
    else if (peer || conflict || legacyPeer) stopSeatRequests();
  }

  channel.on('broadcast', { event: MSG_EVENT }, ({ payload }) => {
    if (closed || conflict || !peer) return;
    if (legacyPeer) {
      const event = (payload as { t?: unknown })?.t;
      if (typeof event !== 'string') return;
      const set = msgHandlers.get(event);
      if (set) for (const cb of set) cb(payload);
      return;
    }
    const envelope = payload as Partial<GameEnvelope>;
    if (
      envelope.v !== 1 ||
      typeof envelope.from !== 'string' ||
      typeof envelope.to !== 'string' ||
      typeof envelope.epoch !== 'string' ||
      typeof envelope.event !== 'string'
    ) return;
    const expectedFrom = self.role === 'host' ? claimedGuestKey : authoritativeHostKey;
    if (
      !matchesSeatEnvelope(
        { from: envelope.from, to: envelope.to, epoch: envelope.epoch },
        expectedFrom,
        selfKey,
        seatEpoch
      )
    ) return;
    const set = msgHandlers.get(envelope.event);
    if (set) for (const cb of set) cb(envelope.data);
  });
  channel.on('broadcast', { event: SEAT_EVENT }, ({ payload }) => {
    if (closed || self.role !== 'guest') return;
    const grant = payload as Partial<SeatGrant>;
    if (
      typeof grant.hostKey !== 'string' ||
      (grant.winner !== null && typeof grant.winner !== 'string') ||
      (grant.epoch !== null && typeof grant.epoch !== 'string')
    ) return;
    seatClaims.set(grant.hostKey, grant as SeatGrant);
    recomputePeer();
  });
  channel.on('broadcast', { event: SEAT_REQUEST_EVENT }, () => {
    if (self.role === 'host' && !closed) {
      recomputePeer();
    }
  });
  const handlePresenceChange = () => {
    recomputePeer();
    if (self.role === 'guest' && !peer && !conflict && !legacyPeer) startSeatRequests(true);
  };
  channel.on('presence', { event: 'sync' }, handlePresenceChange);
  channel.on('presence', { event: 'join' }, handlePresenceChange);
  channel.on('presence', { event: 'leave' }, handlePresenceChange);

  const roomApi: Room = {
    role: self.role,
    self,
    send(event, payload) {
      if (closed || conflict || !peer) return;
      if (legacyPeer) {
        const legacyPayload =
          payload !== null && typeof payload === 'object' && !Array.isArray(payload)
            ? { ...(payload as Record<string, unknown>), t: event }
            : { data: payload, t: event };
        void channel.send({ type: 'broadcast', event: MSG_EVENT, payload: legacyPayload });
        return;
      }
      const to = self.role === 'host' ? claimedGuestKey : authoritativeHostKey;
      if (!to || !seatEpoch) return;
      void channel.send({
        type: 'broadcast',
        event: MSG_EVENT,
        payload: {
          v: 1,
          from: selfKey,
          to,
          epoch: seatEpoch,
          event,
          data: payload
        } satisfies GameEnvelope
      });
    },
    on(event, cb) {
      let set = msgHandlers.get(event);
      if (!set) msgHandlers.set(event, (set = new Set()));
      set.add(cb);
      return () => set!.delete(cb);
    },
    onPeerChange(cb) {
      peerHandlers.add(cb);
      cb(peer);
      return () => peerHandlers.delete(cb);
    },
    onConflict(cb) {
      conflictHandlers.add(cb);
      cb(conflict);
      return () => conflictHandlers.delete(cb);
    },
    peerPresent() {
      return peer !== null;
    },
    async leave() {
      if (closed) return;
      closed = true;
      presenceTracked = false;
      clearSeatRelease();
      stopSeatRequests();
      if (presenceRetryTimer) clearTimeout(presenceRetryTimer);
      presenceRetryTimer = null;
      try {
        await channel.untrack();
      } catch {
        /* already gone */
      }
      await sb.removeChannel(channel);
    }
  };

  return new Promise<Room>((resolve, reject) => {
    let settled = false;
    let tracking = false;

    const trackPresence = async (): Promise<void> => {
      if (closed || tracking) return;
      tracking = true;
      try {
        const result = await channel.track({ ...self, protocol: PROTOCOL_VERSION });
        if (closed) return;
        if (result !== 'ok') throw new Error(`Realtime presence track ${result}`);
        presenceTracked = true;
        presenceRetriesRemaining = 0;
        recomputePeer();
        if (self.role === 'guest' && !peer && !conflict && !legacyPeer) startSeatRequests(true);
        if (!settled) {
          settled = true;
          resolve(roomApi);
        }
      } catch (error) {
        presenceTracked = false;
        stopSeatRequests();
        if (!settled) {
          settled = true;
          closed = true;
          clearSeatRelease();
          void sb.removeChannel(channel);
          reject(error instanceof Error ? error : new Error('Realtime presence track failed'));
        } else if (!closed && presenceRetriesRemaining > 0) {
          // A reconnect can subscribe before presence tracking is ready. Retry
          // briefly; later socket rejoins will also call trackPresence().
          presenceRetriesRemaining -= 1;
          if (presenceRetryTimer) clearTimeout(presenceRetryTimer);
          presenceRetryTimer = setTimeout(() => {
            presenceRetryTimer = null;
            void trackPresence();
          }, 1200);
        }
      } finally {
        tracking = false;
      }
    };

    channel.subscribe((status) => {
      if (closed) return;
      if (status === 'SUBSCRIBED') {
        if (presenceRetryTimer) clearTimeout(presenceRetryTimer);
        presenceRetryTimer = null;
        presenceRetriesRemaining = 3;
        void trackPresence();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        presenceTracked = false;
        stopSeatRequests();
        if (presenceRetryTimer) clearTimeout(presenceRetryTimer);
        presenceRetryTimer = null;
        if (peer) {
          peer = null;
          for (const cb of peerHandlers) cb(null);
        }
        if (settled) return;
        // Terminal before we ever subscribed: on flaky mobile the socket can
        // close before the join replies, so CLOSED must settle the promise too —
        // otherwise the caller's await hangs forever. Tear the errored channel
        // down (it would keep auto-rejoining) and reject once.
        settled = true;
        closed = true;
        clearSeatRelease();
        void sb.removeChannel(channel);
        reject(new Error(`Realtime channel ${status}`));
      }
    });
  });
}
