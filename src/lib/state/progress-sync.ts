// Layer A — cross-device ACHIEVEMENT sync (XP, badges, visited pages, secrets,
// quiz scores). Mirrors each person's forward-only progress to the Supabase
// `progress` table (keyed by couple_id + profile) and live-syncs it, so your XP
// and unlocks follow you to any device.
//
// The whole design rests on ONE invariant: every field merges NON-DESTRUCTIVELY.
//   - xp:      max (never regresses below either device)
//   - badges:  unlock-once  → keep unlocked, earliest unlockedAt
//   - secrets: discover-once → keep discovered, earliest discoveredAt
//   - visited: visit-once   → keep visited, earliest visitedAt
//   - quiz:    best score + UNION of answered question indices
// Because a merge can only ever move a value forward, a stale writer can never
// erase the other device's progress. That is what makes auto-sync safe to ship
// (collections with real deletes — habits/finances/… — are deliberately NOT
// here; they get explicit backup/restore in Layer B).

import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isMultiplayerConfigured } from '$lib/multiplayer/config';
import { COUPLE_ID } from '$lib/couple/couple-supabase';
import { db } from '$lib/state/db';
import { xp as xpStore } from '$lib/state/stores';
import type { ProfileId } from '$lib/auth/hash';

/** Fired whenever a local achievement mutation happens (see stores.ts). The
 *  sync loop listens for this to debounce a push. */
export const PROGRESS_CHANGED_EVENT = 'presuntinho:progress-changed';
/** Fired after remote progress is merged into the local DB, so UI (badge/quest
 *  counters) can refresh without a reload. */
export const PROGRESS_SYNCED_EVENT = 'presuntinho:progress-synced';

export interface ProgressSnapshot {
  xp: number;
  badges: Record<string, number>; // id -> unlockedAt (ms); presence = unlocked
  visited: Record<string, number>; // id -> visitedAt (ms)
  secrets: Record<string, number>; // id -> discoveredAt (ms)
  quiz: Record<string, { score: number; answered: number[] }>;
}

export function progressSyncEnabled(): boolean {
  return isMultiplayerConfigured();
}

// ── Supabase client (lazy singleton, no session persistence) ────────────────
let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase not configured');
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 5 } }
    });
  }
  return client;
}

// ── local snapshot / apply ──────────────────────────────────────────────────

export async function snapshotLocal(profile: ProfileId): Promise<ProgressSnapshot> {
  const d = db(profile);
  const [state, badges, visited, secrets, quiz] = await Promise.all([
    d.state.get('main'),
    d.badges.toArray(),
    d.visited.toArray(),
    d.secrets.toArray(),
    d.quizScores.toArray()
  ]);
  const snap: ProgressSnapshot = { xp: state?.xp ?? 0, badges: {}, visited: {}, secrets: {}, quiz: {} };
  for (const b of badges) if (b.unlocked) snap.badges[b.id] = b.unlockedAt || 1;
  for (const v of visited) if (v.visited) snap.visited[v.id] = v.visitedAt || 1;
  for (const s of secrets) if (s.discovered) snap.secrets[s.id] = s.discoveredAt || 1;
  for (const q of quiz) snap.quiz[q.id] = { score: q.score ?? 0, answered: Array.isArray(q.answered) ? q.answered : [] };
  return snap;
}

/** Earliest positive timestamp (0 = unknown). Keeps the true first-unlock time. */
function earliest(a: number, b: number): number {
  if (a > 0 && b > 0) return Math.min(a, b);
  return a > 0 ? a : b;
}

export function mergeSnapshots(a: ProgressSnapshot, b: ProgressSnapshot): ProgressSnapshot {
  const out: ProgressSnapshot = { xp: Math.max(a.xp || 0, b.xp || 0), badges: {}, visited: {}, secrets: {}, quiz: {} };
  const mergeStamped = (x: Record<string, number>, y: Record<string, number>): Record<string, number> => {
    const r: Record<string, number> = {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) r[k] = earliest(x[k] ?? 0, y[k] ?? 0) || 1;
    return r;
  };
  out.badges = mergeStamped(a.badges, b.badges);
  out.visited = mergeStamped(a.visited, b.visited);
  out.secrets = mergeStamped(a.secrets, b.secrets);
  for (const k of new Set([...Object.keys(a.quiz), ...Object.keys(b.quiz)])) {
    const qa = a.quiz[k] ?? { score: 0, answered: [] };
    const qb = b.quiz[k] ?? { score: 0, answered: [] };
    out.quiz[k] = { score: Math.max(qa.score || 0, qb.score || 0), answered: [...new Set([...qa.answered, ...qb.answered])].sort((m, n) => m - n) };
  }
  return out;
}

/** True when `merged` carries anything `local` doesn't (so we know to push). */
export function isAhead(merged: ProgressSnapshot, local: ProgressSnapshot): boolean {
  if (merged.xp > local.xp) return true;
  for (const key of ['badges', 'visited', 'secrets'] as const) {
    if (Object.keys(merged[key]).length > Object.keys(local[key]).length) return true;
  }
  for (const k of Object.keys(merged.quiz)) {
    const lq = local.quiz[k];
    if (!lq || merged.quiz[k].score > lq.score || merged.quiz[k].answered.length > lq.answered.length) return true;
  }
  return false;
}

/** Write the merged snapshot into local Dexie — UPGRADES ONLY, never deletes. */
async function applyToLocal(profile: ProfileId, merged: ProgressSnapshot): Promise<void> {
  const d = db(profile);
  const prev = await snapshotLocal(profile);
  // xp via the store so the UI reflects it immediately (the store persists to
  // Dexie itself); only ever raise it.
  if (merged.xp > prev.xp) xpStore.set(merged.xp);

  const badgeRows = Object.entries(merged.badges)
    .filter(([id]) => !prev.badges[id])
    .map(([id, ts]) => ({ id, unlocked: true, unlockedAt: ts }));
  const visitedRows = Object.entries(merged.visited)
    .filter(([id]) => !prev.visited[id])
    .map(([id, ts]) => ({ id, visited: true, visitedAt: ts }));
  const secretRows = Object.entries(merged.secrets)
    .filter(([id]) => !prev.secrets[id])
    .map(([id, ts]) => ({ id, discovered: true, discoveredAt: ts }));
  const quizRows = Object.entries(merged.quiz)
    .filter(([id, q]) => {
      const lq = prev.quiz[id];
      return !lq || q.score > lq.score || q.answered.length > lq.answered.length;
    })
    .map(([id, q]) => ({ id, score: q.score, answered: q.answered, updatedAt: Date.now() }));

  if (badgeRows.length) await d.badges.bulkPut(badgeRows);
  if (visitedRows.length) await d.visited.bulkPut(visitedRows);
  if (secretRows.length) await d.secrets.bulkPut(secretRows);
  if (quizRows.length) await d.quizScores.bulkPut(quizRows);

  if (typeof window !== 'undefined' && (badgeRows.length || visitedRows.length || secretRows.length || quizRows.length || merged.xp > prev.xp)) {
    window.dispatchEvent(new CustomEvent(PROGRESS_SYNCED_EVENT));
  }
}

// ── remote I/O ──────────────────────────────────────────────────────────────

export async function fetchRemote(profile: ProfileId): Promise<ProgressSnapshot | null> {
  const { data, error } = await sb()
    .from('progress')
    .select('data')
    .eq('couple_id', COUPLE_ID)
    .eq('profile', profile)
    .maybeSingle();
  if (error) throw error;
  return (data?.data as ProgressSnapshot) ?? null;
}

export async function pushRemote(profile: ProfileId, snap: ProgressSnapshot): Promise<void> {
  const { error } = await sb()
    .from('progress')
    .upsert({ couple_id: COUPLE_ID, profile, data: snap, updated_at: new Date().toISOString() }, { onConflict: 'couple_id,profile' });
  if (error) throw error;
}

// ── live sync loop ──────────────────────────────────────────────────────────

let channel: RealtimeChannel | null = null;
let activeProfile: ProfileId | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let suppressPushUntil = 0;
let unsubXp: (() => void) | null = null;
let onChanged: (() => void) | null = null;

/** Debounced push: re-snapshot local and mirror it to the cloud. */
function schedulePush(): void {
  if (!activeProfile) return;
  if (Date.now() < suppressPushUntil) return; // just applied a remote merge — don't echo
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    pushTimer = null;
    if (!activeProfile) return;
    try {
      await pushRemote(activeProfile, await snapshotLocal(activeProfile));
    } catch (e) {
      console.warn('[progress-sync] push failed', e);
    }
  }, 1500);
}

/** Fetch → merge → apply → push, then wire realtime + local-change pushes. */
export async function startProgressSync(profile: ProfileId): Promise<void> {
  if (!progressSyncEnabled()) return;
  if (activeProfile === profile && channel) return; // already running for this profile
  stopProgressSync();
  activeProfile = profile;
  try {
    const local = await snapshotLocal(profile);
    const remote = await fetchRemote(profile).catch(() => null);
    const merged = remote ? mergeSnapshots(local, remote) : local;
    suppressPushUntil = Date.now() + 2500;
    await applyToLocal(profile, merged);
    // Push if we now hold anything the cloud didn't (first run, or this device
    // was ahead). Skips a redundant write when the cloud was already complete.
    if (!remote || isAhead(merged, remote)) await pushRemote(profile, merged).catch((e) => console.warn('[progress-sync] initial push', e));
  } catch (e) {
    console.warn('[progress-sync] initial sync failed', e);
  }

  // Realtime: another device's update lands here → merge (upgrades only).
  channel = sb()
    .channel(`progress:${COUPLE_ID}:${profile}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'progress', filter: `couple_id=eq.${COUPLE_ID}` },
      (payload) => {
        const row = payload.new as { profile?: string; data?: ProgressSnapshot } | null;
        if (!row || row.profile !== profile || !row.data) return;
        void (async () => {
          try {
            const local = await snapshotLocal(profile);
            const merged = mergeSnapshots(local, row.data as ProgressSnapshot);
            suppressPushUntil = Date.now() + 2500;
            await applyToLocal(profile, merged);
          } catch (e) {
            console.warn('[progress-sync] remote merge failed', e);
          }
        })();
      }
    )
    .subscribe();

  // Local achievement mutations → debounced push.
  unsubXp = xpStore.subscribe(() => schedulePush());
  if (typeof window !== 'undefined') {
    onChanged = () => schedulePush();
    window.addEventListener(PROGRESS_CHANGED_EVENT, onChanged);
    window.addEventListener('presuntinho:badge-unlocked', onChanged);
  }
}

export function stopProgressSync(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  if (channel) {
    void sb().removeChannel(channel);
    channel = null;
  }
  if (unsubXp) unsubXp();
  unsubXp = null;
  if (onChanged && typeof window !== 'undefined') {
    window.removeEventListener(PROGRESS_CHANGED_EVENT, onChanged);
    window.removeEventListener('presuntinho:badge-unlocked', onChanged);
  }
  onChanged = null;
  activeProfile = null;
}
