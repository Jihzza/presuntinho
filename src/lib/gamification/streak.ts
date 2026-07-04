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

// ---------------------------------------------------------------------------
// V8 non-indexed state-row fields (shared with quests.ts)
// ---------------------------------------------------------------------------

/** Per-day record of which daily-quest rewards have already been paid. */
export interface QuestsPaid {
  date: string;    // LOCAL 'YYYY-MM-DD' the record applies to
  ids: string[];   // paid quest ids (+ ALL_BONUS_ID once the 3/3 bonus is paid)
}

/**
 * V8 additions to the singleton `state` row. These are plain,
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
}

/**
 * Compute the global activity streak and persist the best-ever value.
 *
 * Grace rule (same as habits): when today has no activity yet, the walk
 * anchors on yesterday, so yesterday's streak stays visible all morning
 * instead of resetting to 0 at midnight.
 */
export async function getActivityStreak(): Promise<ActivityStreak> {
  const today = new Date();
  const todayKey = localDateKey(today);
  const days = await getActiveDaySet();

  const activeToday = days.has(todayKey);

  // Anchor: today if already active, else yesterday (1-day grace).
  let cursor = activeToday ? today : daysBefore(today, 1);
  let current = 0;
  for (let i = 0; i < LOOKBACK_DAYS; i++) {
    if (days.has(localDateKey(cursor))) {
      current += 1;
      cursor = daysBefore(cursor, 1);
    } else {
      break;
    }
  }

  // Persist best-ever + lastComputed. Non-fatal on failure — a stats
  // write must never break the read path.
  let best = current;
  try {
    const row = await readStateV8();
    const storedBest = typeof row?.streakBest === 'number' ? row.streakBest : 0;
    best = Math.max(storedBest, current);
    if (best !== storedBest || row?.streakLastDay !== todayKey) {
      await updateStateV8({ streakBest: best, streakLastDay: todayKey });
    }
  } catch (err) {
    console.warn('[gamification] streak persistence failed (non-fatal):', err);
  }

  return { current, best, activeToday };
}
