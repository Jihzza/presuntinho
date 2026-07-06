// Durable, real-time couple points over a Supabase table (postgres_changes).
// Replaces the Netlify-Blobs chat-token store for POINTS when Supabase is
// configured — so the shared heart counter persists across reloads and syncs
// live between the two phones with NO manual key to enter.
//
// couple_id scopes the data: a shared secret both devices hold (VITE_COUPLE_ID),
// defaulting to a constant for the single legacy pair. See supabase/migrations.

import { isMultiplayerConfigured } from '$lib/multiplayer/config';
import { getSupabaseClient as sb } from '$lib/multiplayer/client';

// The couple_id scopes ALL couple data (points, chat, profiles, progress).
//
// Phase 3b (redesigned): resolved ONCE at boot. If the signed-in account has an
// ACTIVE couple space (both people accepted — mutual consent), that space's
// uuid becomes the couple_id, giving each couple its own private data. Until a
// couple is formed AND accepted it stays the legacy shared id, so the existing
// 2-person flow is untouched. `export let` is a LIVE binding, so setting it
// before the couple features start transparently rescopes them.
//
// The resolve is TIMEOUT-GUARDED (<=3s): a slow/expired auth token can never
// stall the couple features — they just start on the legacy id and pick up the
// couple space on the next fast boot.
export const LEGACY_COUPLE_ID: string =
  (import.meta.env.VITE_COUPLE_ID as string | undefined) || 'presuntinho-couple-v1';
export let COUPLE_ID: string = LEGACY_COUPLE_ID;

let _resolved: Promise<string> | null = null;
export function resolveCoupleId(): Promise<string> {
  if (_resolved) return _resolved;
  _resolved = (async () => {
    let timedOut = false;
    const work = (async () => {
      try {
        const { getActiveCoupleSpaceId } = await import('$lib/account/spaces');
        const id = await getActiveCoupleSpaceId();
        if (id && !timedOut) COUPLE_ID = id;
      } catch {
        /* signed-out / accounts off — keep the legacy id */
      }
    })();
    await Promise.race([work, new Promise<void>((r) => setTimeout(r, 3000))]);
    timedOut = true; // a late-completing work must not reassign after the race
    return COUPLE_ID;
  })();
  return _resolved;
}

/** Force a re-resolve on the next call (after forming/accepting a couple). */
export function invalidateCoupleId(): void {
  _resolved = null;
}

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
