// Gamification — global activity streak (V8, Duolingo-inspired loop).
//
// Unlike the per-habit streak in `$lib/habitos.ts`, this streak counts
// ANY meaningful activity in the app as an "active day":
//   * a habit log marked done          (habit_logs.date, done === true)
//   * a quiz score update              (quizScores.updatedAt on that local day)
//   * a transaction created            (transacoes.data — the user-facing date)
//   * a lesson visited                 (visited rows 'lesson:*', visitedAt on that day)
//
// Rules mirror `getStreak()` in habitos.ts:
//   * All date keys are LOCAL 'YYYY-MM-DD' strings — a quiz finished at
//     23:50 in Lisbon belongs to "today", not tomorrow-in-UTC.
//   * 1-day grace: if today has no activity yet, we anchor on yesterday
//     so the streak doesn't read 0 every morning.
//
// Persistence: the best-ever streak + last computed day live on the
// singleton Dexie `state` row ('main') as NEW NON-INDEXED fields
// (`streakBest`, `streakLastDay`) — no schema bump needed. This module
// also hosts the shared typed read/update helpers for those V8 fields
// (quests.ts reuses them for `questsPaid`).
//
// SSR safety: same contract as $lib/habitos.ts — callers MUST invoke
// these helpers from onMount / behind a browser check (Dexie needs
// IndexedDB).

import type { UpdateSpec } from 'dexie';
import { db } from '$lib/state/db';
import type { StateRow } from '$lib/state/db';
import { initStores } from '$lib/state/stores';
import {
  earnFreezeIfDue,
  nextMilestoneToCelebrate,
  walkStreak,
  FREEZE_EARN_INTERVAL,
  MAX_FREEZES,
  STREAK_MILESTONES
} from './streak-core';

export { MAX_FREEZES, STREAK_MILESTONES };

// ---------------------------------------------------------------------------
// V8/V10 non-indexed state-row fields (shared with quests.ts)
// ---------------------------------------------------------------------------

/** Per-day record of which daily-quest rewards have already been paid. */
export interface QuestsPaid {
  date: string;    // LOCAL 'YYYY-MM-DD' the record applies to
  ids: string[];   // paid quest ids (+ ALL_BONUS_ID once the 3/3 bonus is paid)
}

/**
 * V8/V10 additions to the singleton `state` row. These are plain,
 * NON-indexed columns — Dexie stores whatever extra fields we put on
 * the object, so no schema/version bump is required.
 */
export interface GamificationStateFields {
  /** Best activity streak ever observed (days). */
  streakBest?: number;
  /** LOCAL 'YYYY-MM-DD' of the last getActivityStreak() computation. */
  streakLastDay?: string;
  /** Daily-quest payout bookkeeping (see quests.ts). */
  questsPaid?: QuestsPaid;
  /** V10 — freeze tokens currently held (0–2). */
  streakFreezes?: number;
  /** V10 — streak length at which the last freeze token was earned. */
  streakFreezeLastEarn?: number;
  /** V10 — LOCAL date keys bridged by consumed freezes. */
  streakFrozenDays?: string[];
  /** V10 — highest streak milestone already celebrated (7/14/30/…). */
  streakMilestoneCelebrated?: number;
  /** V10 — LOCAL 'YYYY-MM-DD' of the last flame-ignition celebration. */
  streakFlameDay?: string;
  /** V10 — chest XP boost: active until this timestamp (ms). */
  xpBoostUntil?: number;
  /** V10 — chest XP boost multiplier (2 = double XP). */
  xpBoostMult?: number;
  /** V10 — LOCAL 'YYYY-MM-DD' of the last "all habits done" victory flow. */
  habitsFlowDay?: string;
  /** V10 — LOCAL 'YYYY-MM-DD' of the last streak-risk notification. */
  streakNotifDay?: string;
}

export type StateRowV8 = StateRow & GamificationStateFields;

/** Read the singleton state row, typed with the V8 extra fields. */
export async function readStateV8(): Promise<StateRowV8 | undefined> {
  return (await db().state.get('main')) as StateRowV8 | undefined;
}

/**
 * Patch V8 gamification fields on the singleton state row.
 * The cast is deliberate: the fields are additive + non-indexed, and
 * db.ts (owned by the foundation) must not be edited for them.
 */
export async function updateStateV8(patch: Partial<GamificationStateFields>): Promise<void> {
  await db().state.update('main', patch as unknown as UpdateSpec<StateRow>);
}

// ---------------------------------------------------------------------------
// Local date helpers
// ---------------------------------------------------------------------------

/** Format a Date as a LOCAL 'YYYY-MM-DD' key (no UTC conversion). */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local date key for a Unix-ms timestamp. */
function tsToDateKey(ts: number): string {
  return localDateKey(new Date(ts));
}

/** Return a new Date `n` days before `d` (DST-safe local arithmetic). */
function daysBefore(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);
}

// How far back we look when building the active-day set. Bounds every
// query to a single index range; 400 days comfortably covers a year-long
// streak plus the 1-day grace.
const LOOKBACK_DAYS = 400;

// ---------------------------------------------------------------------------
// Active-day set
// ---------------------------------------------------------------------------

/**
 * Build the set of LOCAL 'YYYY-MM-DD' keys on which the user did
 * anything that counts as activity (see module docblock for sources).
 *
 * One read per table (4 total) instead of N-per-day walks — the streak
 * walk below is then a pure in-memory Set lookup.
 */
export async function getActiveDaySet(): Promise<Set<string>> {
  const d = db();
  const since = localDateKey(daysBefore(new Date(), LOOKBACK_DAYS));

  const [habitLogs, transacoes, quizRows, visitedRows] = await Promise.all([
    // `date` is indexed on habit_logs; range read, not a table scan.
    d.habit_logs.where('date').aboveOrEqual(since).toArray(),
    // `data` is indexed on transacoes.
    d.transacoes.where('data').aboveOrEqual(since).toArray(),
    // Tiny tables (≤ 5 quiz rows, ≤ a few dozen visited rows) — full read is fine.
    d.quizScores.toArray(),
    d.visited.toArray()
  ]);

  const days = new Set<string>();
  for (const log of habitLogs) {
    if (log.done) days.add(log.date);
  }
  for (const t of transacoes) {
    days.add(t.data);
  }
  for (const q of quizRows) {
    if (typeof q.updatedAt === 'number' && q.updatedAt > 0) {
      days.add(tsToDateKey(q.updatedAt));
    }
  }
  for (const v of visitedRows) {
    // NOTE: visited rows only record the FIRST visit ever (markVisited
    // no-ops on re-visits), so this source detects new-lesson days.
    if (typeof v.id === 'string' && v.id.startsWith('lesson:') && v.visitedAt > 0) {
      days.add(tsToDateKey(v.visitedAt));
    }
  }
  return days;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ActivityStreak {
  /** Consecutive active days ending today (or yesterday, via grace). */
  current: number;
  /** Best streak ever observed (persisted on the state row). */
  best: number;
  /** True when there is already activity logged today. */
  activeToday: boolean;
  /** V10 — freeze tokens currently held (0–2). */
  freezes: number;
  /** V10 — true when this computation consumed at least one token. */
  usedFreeze: boolean;
  /** V10 — true when this computation earned a new token. */
  earnedFreeze: boolean;
}

// Single-flight: concurrent callers in one wave (GamificationLayer,
// StreakFlame, hub, QuizVictory all react to the same xp-changed event)
// share one computation, so token consumption/earning happens exactly once
// per wave and every caller sees the same usedFreeze/earnedFreeze flags.
let _inflightStreak: Promise<ActivityStreak> | null = null;

/**
 * Compute the global activity streak and persist the best-ever value.
 *
 * V10 rules on top of the V8 walk:
 *   * Grace (same as habits): when today has no activity yet, the walk
 *     anchors on yesterday, so the streak doesn't read 0 every morning.
 *   * Freeze tokens auto-consume to bridge fully missed days (the bridged
 *     day keeps the chain but doesn't increment the count).
 *   * One token is earned per 7 consecutive days, capped at 2 held.
 */
export function getActivityStreak(): Promise<ActivityStreak> {
  if (!_inflightStreak) {
    _inflightStreak = computeActivityStreak().finally(() => {
      _inflightStreak = null;
    });
  }
  return _inflightStreak;
}

async function computeActivityStreak(): Promise<ActivityStreak> {
  // Idempotent — resolves only after the session profile is set and stores
  // are hydrated, so every read/write below hits the RIGHT profile's DB.
  await initStores();

  const today = new Date();
  const todayKey = localDateKey(today);
  const days = await getActiveDaySet();

  let rowReadOk = true;
  let row: StateRowV8 | undefined;
  try {
    row = await readStateV8();
  } catch {
    rowReadOk = false;
    row = undefined;
  }

  const frozenDays = new Set(Array.isArray(row?.streakFrozenDays) ? row.streakFrozenDays : []);
  const freezesAvailable = typeof row?.streakFreezes === 'number' ? row.streakFreezes : 0;

  const walk = walkStreak({
    activeDays: days,
    frozenDays,
    freezesAvailable,
    today,
    lookbackDays: LOOKBACK_DAYS
  });

  // First V10 computation over pre-existing history: baseline the markers
  // from the CURRENT walk so seeded/legacy activity can't retro-fire a
  // "365 dias!" celebration or a burst of freeze grants right after upgrade.
  const firstV10Run =
    rowReadOk &&
    row !== undefined &&
    row.streakFreezeLastEarn === undefined &&
    row.streakMilestoneCelebrated === undefined;
  if (firstV10Run && row) {
    const baselineEarn =
      Math.floor(walk.current / FREEZE_EARN_INTERVAL) * FREEZE_EARN_INTERVAL;
    const baselineMilestone =
      STREAK_MILESTONES.filter((m) => m <= walk.current).at(-1) ?? 0;
    try {
      await updateStateV8({
        streakFreezeLastEarn: baselineEarn,
        streakMilestoneCelebrated: baselineMilestone
      });
      row = { ...row, streakFreezeLastEarn: baselineEarn, streakMilestoneCelebrated: baselineMilestone };
    } catch (err) {
      console.warn('[gamification] V10 baseline write failed (non-fatal):', err);
    }
  }

  const earn = earnFreezeIfDue({
    current: walk.current,
    lastEarnMilestone: typeof row?.streakFreezeLastEarn === 'number' ? row.streakFreezeLastEarn : 0,
    freezesAvailable: walk.freezesLeft
  });

  // Persist best-ever + token bookkeeping. Non-fatal on failure — a stats
  // write must never break the read path. When the state-row READ failed we
  // also skip the write entirely: persisting values derived from defaults
  // would wipe streakBest and the freeze bookkeeping.
  let best = walk.current;
  try {
    const storedBest = typeof row?.streakBest === 'number' ? row.streakBest : 0;
    best = Math.max(storedBest, walk.current);

    const sinceKey = localDateKey(daysBefore(today, LOOKBACK_DAYS));
    const nextFrozen = [...frozenDays, ...walk.newlyFrozen].filter((k) => k >= sinceKey);

    const dirty =
      best !== storedBest ||
      row?.streakLastDay !== todayKey ||
      walk.newlyFrozen.length > 0 ||
      earn.freezes !== freezesAvailable ||
      earn.lastEarnMilestone !== (row?.streakFreezeLastEarn ?? 0);

    if (dirty && rowReadOk) {
      await updateStateV8({
        streakBest: best,
        streakLastDay: todayKey,
        streakFreezes: earn.freezes,
        streakFreezeLastEarn: earn.lastEarnMilestone,
        streakFrozenDays: nextFrozen
      });
    }
  } catch (err) {
    console.warn('[gamification] streak persistence failed (non-fatal):', err);
  }

  return {
    current: walk.current,
    best,
    activeToday: walk.activeToday,
    freezes: earn.freezes,
    usedFreeze: walk.newlyFrozen.length > 0,
    earnedFreeze: earn.earned
  };
}

// ---------------------------------------------------------------------------
// V10 — one-shot celebrations (flame ignition + milestones) & week view
// ---------------------------------------------------------------------------

/**
 * Claim today's flame-ignition celebration. Returns true exactly once per
 * local day, and only when today already has activity — the caller then
 * plays the whoosh/flame animation.
 */
export async function claimFlameIgnition(): Promise<boolean> {
  try {
    await initStores();
    const todayKey = localDateKey(new Date());
    const row = await readStateV8();
    if (row?.streakFlameDay === todayKey) return false;
    const days = await getActiveDaySet();
    if (!days.has(todayKey)) return false;
    await updateStateV8({ streakFlameDay: todayKey });
    return true;
  } catch {
    return false;
  }
}

/**
 * Claim the next uncelebrated streak milestone (7/14/30/50/100/365).
 * Returns the milestone number exactly once, or null when nothing is due.
 * Only fires on a day with real activity so the full-screen card lands
 * right after the action that earned it.
 */
export async function claimStreakMilestone(streak: ActivityStreak): Promise<number | null> {
  if (!streak.activeToday) return null;
  try {
    await initStores();
    const row = await readStateV8();
    const stored =
      typeof row?.streakMilestoneCelebrated === 'number' ? row.streakMilestoneCelebrated : 0;
    // A marker above the current streak belongs to a PREVIOUS streak (within
    // a live chain the marker never exceeds `current`) — reset it so a
    // rebuilt streak celebrates its milestones again.
    const celebrated = stored > streak.current ? 0 : stored;
    const due = nextMilestoneToCelebrate(streak.current, celebrated);
    if (due === null) {
      if (celebrated !== stored) await updateStateV8({ streakMilestoneCelebrated: celebrated });
      return null;
    }
    await updateStateV8({ streakMilestoneCelebrated: due });
    return due;
  } catch {
    return null;
  }
}

/**
 * Claim today's "all habits done" celebration — true exactly once per
 * local day (same pattern as claimFlameIgnition).
 */
export async function claimHabitsFlowDay(): Promise<boolean> {
  try {
    await initStores();
    const todayKey = localDateKey(new Date());
    const row = await readStateV8();
    if (row?.habitsFlowDay === todayKey) return false;
    await updateStateV8({ habitsFlowDay: todayKey });
    return true;
  } catch {
    return false;
  }
}

/** Claim today's streak-risk notification slot — true exactly once per day. */
export async function claimStreakNotifDay(): Promise<boolean> {
  try {
    await initStores();
    const todayKey = localDateKey(new Date());
    const row = await readStateV8();
    if (row?.streakNotifDay === todayKey) return false;
    await updateStateV8({ streakNotifDay: todayKey });
    return true;
  } catch {
    return false;
  }
}

export interface WeekDayActivity {
  /** LOCAL 'YYYY-MM-DD'. */
  date: string;
  /** Mon=1 … Sun=7 (ISO weekday). */
  weekday: number;
  active: boolean;
  frozen: boolean;
  isToday: boolean;
}

/**
 * Activity for the current ISO week (Monday → Sunday), for the 7-circle
 * mini-calendar in victory flows and the flame popover.
 */
export async function getWeekActivity(): Promise<WeekDayActivity[]> {
  await initStores();
  const today = new Date();
  const todayKey = localDateKey(today);
  const [days, row] = await Promise.all([getActiveDaySet(), readStateV8().catch(() => undefined)]);
  const frozen = new Set(Array.isArray(row?.streakFrozenDays) ? row.streakFrozenDays : []);

  // Monday of the current week (getDay(): Sun=0 … Sat=6).
  const dow = today.getDay();
  const monday = daysBefore(today, (dow + 6) % 7);

  const out: WeekDayActivity[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const key = localDateKey(d);
    out.push({
      date: key,
      weekday: i + 1,
      active: days.has(key),
      frozen: frozen.has(key),
      isToday: key === todayKey
    });
  }
  return out;
}
