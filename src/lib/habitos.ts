// Hábitos sub-app helpers — Phase 7.
//
// All functions are pure async wrappers around the Dexie tables defined
// in `$lib/state/db.ts` (v3 schema):
//   habitos     — habit definitions
//   habit_logs  — per-day completion records (compound [habitId+date] index)
//
// Design notes:
//   * We never mutate the DB outside of these helpers — components
//     import from here so the schema is a single point of change.
//   * All date keys are 'YYYY-MM-DD' in the user's LOCAL timezone.  We
//     never use UTC date components because a habit logged at 23:50 in
//     Lisbon must still belong to "today" for the user, not tomorrow
//     in UTC.
//   * `getStreak` allows a 1-day grace for "today not done yet" so
//     yesterday's streak is visible before the user has logged today
//     — see the per-step comment in that function.
//   * SSR safety: every helper calls `db()` lazily and the table
//     queries will throw in Node (no IndexedDB).  Callers MUST be
//     guarded behind an `onMount` / `browser` check, the same way the
//     splash route already does.

import { format, subDays } from 'date-fns';
import { db } from './state/db';
import type { HabitoRow, HabitLogRow } from './state/db';

// ---------------------------------------------------------------------------
// Public types — re-exported so component code only imports from one place.
// ---------------------------------------------------------------------------

/** A habit row with the auto-incremented `id` resolved (i.e. it's a saved row). */
export interface Habit extends HabitoRow {
  id: number;
}

/** A single day's log, with the auto-incremented `id` resolved. */
export interface HabitLog extends HabitLogRow {
  id: number;
}

/** Input shape for `addHabito` — caller does NOT pass `id` or `createdAt`. */
export type NewHabitInput = Omit<HabitoRow, 'id' | 'createdAt'>;

/** Map<date, logged> for the heatmap and quick "any log today?" checks. */
export type HeatmapData = Record<string, boolean>;

// ---------------------------------------------------------------------------
// Date helpers (kept private — exported only as utilities used below)
// ---------------------------------------------------------------------------

/**
 * Format a Date as a 'YYYY-MM-DD' string in the user's local timezone.
 *
 * NOTE: `date-fns/format` uses the local timezone for date components
 * by default (pattern 'yyyy-MM-dd' expands local year/month/day), which
 * is exactly what we want for "is this habit logged today?".
 */
function localDateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

// ---------------------------------------------------------------------------
// CRUD on habit definitions
// ---------------------------------------------------------------------------

/**
 * List every habit, newest-first.  Uses the `createdAt` index so the
 * sort is index-driven rather than a table scan.
 */
export async function listHabitos(): Promise<Habit[]> {
  const rows = await db().habitos.orderBy('createdAt').reverse().toArray();
  return rows.filter((r): r is Habit => typeof r.id === 'number');
}

/**
 * Insert a new habit.  Returns the auto-assigned id so the caller can
 * navigate to the detail route immediately.
 */
export async function addHabito(input: NewHabitInput): Promise<number> {
  const row: HabitoRow = {
    name: input.name.trim(),
    icon: input.icon || '✅',
    color: input.color || '#ec4899',
    cadence: input.cadence || 'daily',
    createdAt: Date.now()
  };
  return await db().habitos.add(row) as number;
}

/**
 * Delete a habit AND every log row that references it.  We do the
 * delete in a single `transaction()` so a crash mid-delete never leaves
 * orphan log rows pointing at a non-existent habit.
 */
export async function deleteHabito(id: number): Promise<void> {
  await db().transaction('rw', db().habitos, db().habit_logs, async () => {
    await db().habit_logs.where('habitId').equals(id).delete();
    await db().habitos.delete(id);
  });
}

// ---------------------------------------------------------------------------
// Log reads / writes
// ---------------------------------------------------------------------------

/**
 * Return every log for a habit whose `date` >= `since` (a 'YYYY-MM-DD'
 * key).  Ordered ascending by date so the heatmap can iterate without
 * re-sorting.  Uses the compound [habitId+date] index.
 */
export async function getHabitLogs(habitId: number, since: string): Promise<HabitLog[]> {
  const rows = await db().habit_logs
    .where('[habitId+date]')
    .between([habitId, since], [habitId, '\uffff'])
    .toArray();
  return rows
    .filter((r): r is HabitLog => typeof r.id === 'number')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Mark a habit as done on `date` (default = today).  Idempotent — if
 * a log already exists for that (habitId, date), we leave it alone so
 * `createdAt` stays stable and the streak counter doesn't wobble.
 */
export async function logHabit(habitId: number, date: string = localDateKey(new Date())): Promise<void> {
  const existing = await db().habit_logs
    .where('[habitId+date]')
    .equals([habitId, date])
    .first();
  if (existing) return;
  await db().habit_logs.add({
    habitId,
    date,
    done: true,
    createdAt: Date.now()
  });
}

/**
 * Remove the log for a habit on `date` (default = today).  Used by the
 * "desfazer" button on the detail page.  No-op if no log exists.
 */
export async function unlogHabit(habitId: number, date: string = localDateKey(new Date())): Promise<void> {
  await db().habit_logs
    .where('[habitId+date]')
    .equals([habitId, date])
    .delete();
}

// ---------------------------------------------------------------------------
// Streak & heatmap
// ---------------------------------------------------------------------------

/**
 * Consecutive-day streak ending today.
 *
 * Rules (per the Phase 7 brief):
 *   - Today is "day 0".
 *   - Walk backward day by day; if a log exists for that day, +1.
 *   - Stop at the first missing day.
 *   - Grace: if today has NO log yet, we look at yesterday as if it
 *     were the anchor — so the streak from yesterday backward is
 *     returned.  This stops the displayed streak from going to zero
 *     every morning before the user has logged today's habit.
 */
export async function getStreak(habitId: number): Promise<number> {
  const today = new Date();
  const todayKey = localDateKey(today);

  // Pull the last ~120 days of logs; 120 is plenty for any realistic
  // streak and bounds the worst-case read to a single index range.
  const since = localDateKey(subDays(today, 120));
  const logs = await getHabitLogs(habitId, since);
  const loggedDates = new Set(logs.map((l) => l.date));

  // Decide the anchor day.  If today is logged, count from today.
  // Otherwise, count from yesterday (1-day grace).
  let cursor = today;
  if (!loggedDates.has(todayKey)) {
    cursor = subDays(today, 1);
  }

  let streak = 0;
  // Walk back until we find a day with no log.
  // Guard with a 365-day cap so a buggy import can't infinite-loop.
  for (let i = 0; i < 365; i++) {
    const key = localDateKey(cursor);
    if (loggedDates.has(key)) {
      streak += 1;
      cursor = subDays(cursor, 1);
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Build the heatmap data structure: a `Record<date, true>` of every
 * day the habit was logged in the last `days` days (default 90).
 *
 * The returned shape intentionally only contains days that ARE
 * logged — missing days are not present.  The Heatmap component
 * walks a continuous date range and checks `.hasOwnProperty(key)`
 * to decide whether to render an empty cell.
 */
export async function getHeatmapData(habitId: number, days: number = 90): Promise<HeatmapData> {
  const today = new Date();
  const since = localDateKey(subDays(today, days - 1));
  const logs = await getHabitLogs(habitId, since);
  const out: HeatmapData = {};
  for (const log of logs) {
    if (log.done) out[log.date] = true;
  }
  return out;
}