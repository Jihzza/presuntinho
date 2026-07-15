// Durable game invites. Rows stay pending until accepted/declined and are
// loaded on app start, so the recipient does not need the app open at send time.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '$lib/multiplayer/client';
import { isMultiplayerConfigured } from '$lib/multiplayer/config';
import { isValidRoomCode, normalizeRoomCode } from '$lib/multiplayer/room-code';
import { getAuthUser, type Account } from './auth';
import { sendPushNotify } from '$lib/push';
import {
  isAuthorizedGameInviteForJoin,
  isFreshGameInvite,
  normalizeGameInviteRow,
  type GameInviteRow,
  type IncomingGameInviteProof
} from './game-invite-model';

export interface GameInvite {
  id: string;
  from: Account;
  roomCode: string;
  game: string;
  createdAt: string;
  expiresAt: string;
}

const sb = () => getSupabaseClient();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Invite a contact. Repeated taps replace the previous pending invite. */
export async function inviteToGame(toAccountId: string, roomCode: string, game = 'versus'): Promise<void> {
  const normalized = normalizeRoomCode(roomCode);
  if (!isValidRoomCode(normalized)) throw new Error('invalid room code');

  const user = await getAuthUser();
  if (!user) throw new Error('not signed in');

  const { data, error } = await sb().rpc('send_game_invite', {
    p_to_account: toAccountId,
    p_room_code: normalized,
    p_game: game
  });
  if (error) throw error;
  const inviteId = typeof data === 'string' ? data : null;
  if (inviteId) {
    // The database trigger already committed the durable outbox. Awaiting this
    // wakeup makes the usual path immediate; the scheduled sweep still covers
    // a closed tab, lost response or transient Netlify failure.
    await sendPushNotify('game_invite', {
      eventId: inviteId,
      title: '🎮 Convite para jogar',
      body: `Entra na sala ${normalized} com um toque.`,
      url: `/secrets/versus/?join=${encodeURIComponent(normalized)}&invite=${encodeURIComponent(inviteId)}`
    });
  }
}

export async function dismissInvite(id: string, expectedRoomCode?: string): Promise<void> {
  let request = sb().from('game_invites').delete().eq('id', id);
  if (expectedRoomCode !== undefined) {
    const normalized = normalizeRoomCode(expectedRoomCode);
    if (!isValidRoomCode(normalized)) throw new Error('invalid room code');
    request = request.eq('room_code', normalized);
  }
  const { error } = await request;
  if (error) throw error;
}

/** Fail-closed validation for an invite-bearing deep link. The authenticated
 * SELECT and RLS prove recipient ownership/current friendship; the explicit
 * comparisons stop a valid invite id being paired with a different room.
 * Links without an `invite` parameter remain public room-capability links and
 * intentionally bypass this helper. */
export async function validateIncomingGameInvite(
  inviteId: string,
  roomCode: string
): Promise<IncomingGameInviteProof | null> {
  const normalized = normalizeRoomCode(roomCode);
  if (!UUID_RE.test(inviteId) || !isValidRoomCode(normalized)) return null;

  const user = await getAuthUser();
  if (!user) return null;
  const { data, error } = await sb()
    .from('game_invites')
    .select('id, from_account, to_account, room_code, game, created_at, expires_at, cancelled_at')
    .eq('id', inviteId)
    .eq('to_account', user.id)
    .eq('room_code', normalized)
    .eq('game', 'versus')
    .is('cancelled_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  const row = data as IncomingGameInviteProof | null;
  if (!row || !isAuthorizedGameInviteForJoin(row, inviteId, user.id, normalized)) return null;
  return { ...row, room_code: normalized };
}

/** Cancel any still-pending invites sent for a room when its host leaves or a
 * player arrives. RLS limits the deletion to rows involving this account. */
export async function cancelGameInvitesForRoom(roomCode: string): Promise<void> {
  const normalized = normalizeRoomCode(roomCode);
  if (!isValidRoomCode(normalized)) return;
  if (!(await getAuthUser())) return;
  const { error } = await sb().rpc('cancel_game_invites', {
    p_room_code: normalized,
    p_game: 'versus'
  });
  if (error) throw error;
}

async function resolveAccounts(ids: string[]): Promise<Map<string, Account>> {
  const accounts = new Map<string, Account>();
  const unique = [...new Set(ids)];
  if (!unique.length) return accounts;

  const { data, error } = await sb()
    .from('accounts')
    .select('id, handle, display_name, emoji, avatar_url, bio')
    .in('id', unique);
  if (error) throw error;
  for (const account of (data as Account[]) ?? []) accounts.set(account.id, account);
  return accounts;
}

function toInvite(row: GameInviteRow, accounts: Map<string, Account>): GameInvite | null {
  const normalized = normalizeGameInviteRow(row);
  if (!isFreshGameInvite(normalized)) return null;
  const from = accounts.get(normalized.from_account);
  if (!from) return null;
  return {
    id: normalized.id,
    from,
    roomCode: normalized.room_code,
    game: normalized.game,
    createdAt: normalized.created_at,
    expiresAt: normalized.expires_at
  };
}

/** Pending, non-expired invites addressed to the signed-in account. */
export async function listIncomingGameInvites(): Promise<GameInvite[]> {
  if (!isMultiplayerConfigured()) return [];
  const user = await getAuthUser();
  if (!user) return [];

  const now = new Date().toISOString();
  // Recipient deletion is allowed by RLS. Cleanup is best-effort; loading fresh
  // rows must continue even if cleanup is temporarily unavailable.
  void (async () => {
    await sb().from('game_invites').delete().eq('to_account', user.id).lte('expires_at', now);
  })().catch(() => undefined);

  const { data, error } = await sb()
    .from('game_invites')
    .select('id, from_account, room_code, game, created_at, expires_at, cancelled_at')
    .eq('to_account', user.id)
    .gt('expires_at', now)
    .is('cancelled_at', null)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;

  const rows = ((data as GameInviteRow[]) ?? []).filter((row) => isFreshGameInvite(row));
  const accounts = await resolveAccounts(rows.map((row) => row.from_account));
  return rows.map((row) => toInvite(row, accounts)).filter((invite): invite is GameInvite => invite !== null);
}

let inviteSubSeq = 0;

/** Listen for newly created or replaced invites. Initial pending rows are loaded
 * separately by listIncomingGameInvites(); callers should deduplicate by id. */
export function subscribeIncomingInvites(
  onInvite: (invite: GameInvite) => void,
  onReady?: () => void,
  onRemove?: (id: string, cancelledAt: string) => void
): () => void {
  if (!isMultiplayerConfigured()) return () => {};

  let active = true;
  let channel: RealtimeChannel | null = null;

  const handleRow = (raw: unknown) => {
    const row = raw as GameInviteRow;
    if (!active) return;
    if (row.cancelled_at !== null) {
      onRemove?.(row.id, row.cancelled_at);
      return;
    }
    if (!isFreshGameInvite(row)) return;
    void resolveAccounts([row.from_account])
      .then((accounts) => {
        if (!active) return;
        const invite = toInvite(row, accounts);
        if (invite) onInvite(invite);
      })
      .catch(() => undefined);
  };

  void (async () => {
    const user = await getAuthUser();
    if (!active || !user) return;

    channel = sb()
      .channel(`game-invites-${user.id}-${++inviteSubSeq}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_invites', filter: `to_account=eq.${user.id}` },
        (payload) => handleRow(payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_invites', filter: `to_account=eq.${user.id}` },
        (payload) => handleRow(payload.new)
      )
      .subscribe((status) => {
        if (active && status === 'SUBSCRIBED') onReady?.();
      });
  })();

  return () => {
    active = false;
    if (channel) void sb().removeChannel(channel);
  };
}
