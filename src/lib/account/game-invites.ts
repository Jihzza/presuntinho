// Game invites — Phase 4 client layer. Invite a contact to a game room and
// receive incoming invites live. Built on the game_invites table (RLS scopes
// rows to the two parties; only contacts can be invited).

import { getSupabaseClient } from '$lib/multiplayer/client';
import { getAuthUser, type Account } from './auth';

export interface GameInvite {
  id: string;
  from: Account; // resolved inviter account (for the "@X invited you" prompt)
  roomCode: string;
  game: string;
}

const sb = () => getSupabaseClient();

/** Invite a contact to a game room. */
export async function inviteToGame(toAccountId: string, roomCode: string, game = 'versus'): Promise<void> {
  const user = await getAuthUser();
  if (!user) throw new Error('not signed in');
  const { error } = await sb()
    .from('game_invites')
    .insert({ from_account: user.id, to_account: toAccountId, room_code: roomCode, game });
  if (error) throw error;
}

export async function dismissInvite(id: string): Promise<void> {
  await sb().from('game_invites').delete().eq('id', id);
}

async function resolveAccount(id: string): Promise<Account | null> {
  const { data } = await sb()
    .from('accounts')
    .select('id, handle, display_name, emoji, avatar_url, bio')
    .eq('id', id)
    .maybeSingle();
  return (data as Account) ?? null;
}

/** Subscribe to invites addressed to me (live). Resolves the inviter's account
 *  before firing so the prompt can show their @handle. Returns an unsubscribe. */
export function subscribeIncomingInvites(onInvite: (invite: GameInvite) => void): () => void {
  let userId: string | null = null;
  const channel = sb().channel('game-invites');
  void (async () => {
    const user = await getAuthUser();
    userId = user?.id ?? null;
    if (!userId) return;
    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_invites', filter: `to_account=eq.${userId}` },
        (payload) => {
          const row = payload.new as { id: string; from_account: string; room_code: string; game: string };
          void resolveAccount(row.from_account).then((from) => {
            if (from) onInvite({ id: row.id, from, roomCode: row.room_code, game: row.game });
          });
        }
      )
      .subscribe();
  })();
  return () => void sb().removeChannel(channel);
}
