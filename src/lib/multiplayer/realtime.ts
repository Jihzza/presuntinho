// Realtime room transport — a thin, game-agnostic wrapper over Supabase
// Realtime "broadcast" + "presence". A room is just a named channel
// (`arcade:<code>`); two peers join it, presence tells us when both are
// connected, and broadcast carries the game messages (host state / guest input).
//
// Nothing here is snake-specific and nothing is persisted: broadcast messages
// are fire-and-forget fan-out, so game state never hits the database. Swapping
// Supabase for Ably/PartyKit later means re-implementing only this file against
// the same `Room` shape.

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

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
  /** Is the other player currently connected? */
  peerPresent(): boolean;
  /** Leave the room and tear everything down. */
  leave(): Promise<void>;
}

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Multiplayer not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 30 } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}

/** A short, unambiguous room code (no easily-confused characters). */
export function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  for (const n of arr) out += alphabet[n % alphabet.length];
  return out;
}

const MSG_EVENT = 'g'; // single broadcast event; the payload carries its own type

/**
 * Join (or create) a room and resolve once we're subscribed. `role` only labels
 * this peer for presence + picks who is authoritative in the netcode; the
 * channel itself is symmetric.
 */
export function joinRoom(code: string, self: PeerMeta): Promise<Room> {
  const sb = supabase();
  const selfKey = `${self.role}-${Math.random().toString(36).slice(2, 8)}`;
  const channel: RealtimeChannel = sb.channel(`arcade:${code.toUpperCase()}`, {
    config: { broadcast: { self: false, ack: false }, presence: { key: selfKey } }
  });

  const msgHandlers = new Map<string, Set<(p: any) => void>>();
  const peerHandlers = new Set<(p: PeerMeta | null) => void>();
  let peer: PeerMeta | null = null;

  function recomputePeer(): void {
    const stateMap = channel.presenceState<PeerMeta & { key?: string }>();
    let found: PeerMeta | null = null;
    for (const [key, metas] of Object.entries(stateMap)) {
      if (key === selfKey) continue;
      const m = metas[0];
      if (m) found = { role: m.role, name: m.name, mascot: m.mascot };
    }
    const changed = JSON.stringify(found) !== JSON.stringify(peer);
    peer = found;
    if (changed) for (const cb of peerHandlers) cb(peer);
  }

  channel.on('broadcast', { event: MSG_EVENT }, ({ payload }) => {
    const type = (payload as { t?: string })?.t;
    if (!type) return;
    const set = msgHandlers.get(type);
    if (set) for (const cb of set) cb(payload);
  });
  channel.on('presence', { event: 'sync' }, recomputePeer);
  channel.on('presence', { event: 'join' }, recomputePeer);
  channel.on('presence', { event: 'leave' }, recomputePeer);

  return new Promise<Room>((resolve, reject) => {
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track(self);
        recomputePeer();
        resolve({
          role: self.role,
          self,
          send(event, payload) {
            void channel.send({
              type: 'broadcast',
              event: MSG_EVENT,
              payload: { ...(payload as object), t: event }
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
          peerPresent() {
            return peer !== null;
          },
          async leave() {
            try {
              await channel.untrack();
            } catch {
              /* already gone */
            }
            await sb.removeChannel(channel);
          }
        });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(`Realtime channel ${status}`));
      }
    });
  });
}
