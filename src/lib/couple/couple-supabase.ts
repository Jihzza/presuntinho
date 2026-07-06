// Durable, real-time couple points over a Supabase table (postgres_changes).
// Replaces the Netlify-Blobs chat-token store for POINTS when Supabase is
// configured — so the shared heart counter persists across reloads and syncs
// live between the two phones with NO manual key to enter.
//
// couple_id scopes the data: a shared secret both devices hold (VITE_COUPLE_ID),
// defaulting to a constant for the single legacy pair. See supabase/migrations.

import { isMultiplayerConfigured } from '$lib/multiplayer/config';
import { getSupabaseClient as sb } from '$lib/multiplayer/client';

export const COUPLE_ID: string =
  (import.meta.env.VITE_COUPLE_ID as string | undefined) || 'presuntinho-couple-v1';

export function coupleDbEnabled(): boolean {
  return isMultiplayerConfigured();
}

/** Current per-profile point tallies for this couple. */
export async function fetchCouplePoints(): Promise<Record<string, number>> {
  const { data, error } = await sb()
    .from('couple_points')
    .select('profile, points')
    .eq('couple_id', COUPLE_ID);
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const row of data ?? []) out[row.profile as string] = row.points as number;
  return out;
}

/** Atomically add `delta` to a member's tally; returns the new authoritative total. */
export async function bumpCouplePoints(profile: string, delta: number): Promise<number> {
  const { data, error } = await sb().rpc('couple_points_bump', {
    p_couple_id: COUPLE_ID,
    p_profile: profile,
    p_delta: delta
  });
  if (error) throw error;
  return typeof data === 'number' ? data : Number(data ?? 0);
}

/** Live-subscribe to every couple_points change for this couple. Returns unsub. */
export function subscribeCouplePoints(
  onChange: (profile: string, points: number) => void
): () => void {
  const channel = sb()
    .channel(`couple_points:${COUPLE_ID}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'couple_points', filter: `couple_id=eq.${COUPLE_ID}` },
      (payload) => {
        const row = (payload.new ?? {}) as { profile?: string; points?: number };
        if (row.profile && typeof row.points === 'number') onChange(row.profile, row.points);
      }
    )
    .subscribe();
  return () => void sb().removeChannel(channel);
}
