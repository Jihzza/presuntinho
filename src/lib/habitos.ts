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
import { awardXP } from './state/xp-actions';
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
    createdAt: Date.now(),
    // task-040: optional meta + reminder.  Trim so accidental spaces
    // don't survive into the detail view.
    meta: input.meta?.trim() || undefined,
    reminder: input.reminder?.trim() || undefined
  };
  const id = (await db().habitos.add(row)) as number;
  // M0-S2: award XP for creating a new habit
  await awardXP('habito_create');
  return id;
}

/**
 * Edit an existing habit (task-040).  Updates the mutable fields and
 * leaves `id`, `createdAt` and any existing log rows untouched.  Awards
 * the small `habito_edit` XP reward (per the XP_TABLE).
 */
export async function editHabito(
  id: number,
  patch: Partial<Omit<HabitoRow, 'id' | 'createdAt'>>
): Promise<void> {
  // Only allow whitelisted fields through so callers can't accidentally
  // (or maliciously) overwrite the primary key or createdAt.
  const safe: Partial<HabitoRow> = {};
  if (typeof patch.name === 'string') safe.name = patch.name.trim();
  if (typeof patch.icon === 'string') safe.icon = patch.icon;
  if (typeof patch.color === 'string') safe.color = patch.color;
  if (typeof patch.cadence === 'string') safe.cadence = patch.cadence;
  if (typeof patch.meta === 'string') safe.meta = patch.meta.trim() || undefined;
  if (typeof patch.reminder === 'string') safe.reminder = patch.reminder.trim() || undefined;
  await db().habitos.update(id, safe);
  await awardXP('habito_edit');
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
  // M0-S2: small XP penalty to discourage accidental deletes
  await awardXP('habito_delete');
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
 *
 * Wires XP (task-040, supersedes gap-052 / gap-053): every new log
 * awards `habito_mark_done` (+2 XP per the brief). If the resulting
 * streak crosses a milestone (7/14/30/50/100/365), also award the
 * corresponding `habito_streak_*` reward. The 7-day and 30-day
 * milestones also award a habit badge (b16 / b17) so the user gets
 * a visible unlock when the streak ticks over. XP/badge are only
 * awarded for a NEW log — re-logging an existing date is a no-op.
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

  // task-040: award XP for marking done (+2 per the brief), then
  // resolve the new streak and award any milestone that just ticked
  // over.  Wiring is in a try/catch so a failure in the XP/badges
  // path never breaks the core "I just logged a habit" action.
  try {
    const { awardXP } = await import('./state/xp-actions');
    const { awardBadge } = await import('./state/stores');

    // +2 XP for the new log
    await awardXP('habito_mark_done');

    // Resolve streak and award milestone rewards
    const streak = await getStreak(habitId);
    const milestones: Array<{
      threshold: number;
      reason: 'habito_streak_7' | 'habito_streak_14' | 'habito_streak_30' | 'habito_streak_50' | 'habito_streak_100' | 'habito_streak_365';
      badge?: string;
    }> = [
      { threshold: 7,   reason: 'habito_streak_7',   badge: 'b16' },
      { threshold: 14,  reason: 'habito_streak_14' },
      { threshold: 30,  reason: 'habito_streak_30',  badge: 'b17' },
      { threshold: 50,  reason: 'habito_streak_50' },
      { threshold: 100, reason: 'habito_streak_100' },
      { threshold: 365, reason: 'habito_streak_365' }
    ];
    for (const m of milestones) {
      if (streak === m.threshold) {
        await awardXP(m.reason);
        if (m.badge) await awardBadge(m.badge);
        break; // only one milestone per log (can't cross two at once)
      }
    }
  } catch (err) {
    // XP wiring must never break the core habit-log flow
    console.warn('[habitos] XP/badge wiring failed (non-fatal):', err);
  }
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

/**
 * Return true if `habitId` has at least one log for today (user's local
 * timezone).  Used by the habits list row so each card can render a
 * '✓ hoje' / '— pendente' badge — without this the list looks empty
 * (gap-112).  Hits the compound [habitId+date] index so it's O(1).
 */
export async function isLoggedToday(habitId: number): Promise<boolean> {
  const todayKey = localDateKey(new Date());
  const row = await db().habit_logs
    .where('[habitId+date]')
    .equals([habitId, todayKey])
    .first();
  return Boolean(row);
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

// ---------------------------------------------------------------------------
// task-040 — Hábitos Pro helpers: range reads, stats, calendar
// ---------------------------------------------------------------------------

/**
 * Read every log row across ALL habits, with `date >= since` and
 * `date <= until`.  Used by the stats engine so we only do one
 * table scan per dashboard render instead of N.
 */
export async function getAllLogsInRange(since: string, until: string): Promise<HabitLog[]> {
  const rows = await db().habit_logs
    .where('date')
    .between(since, until, true, true)
    .toArray();
  return rows
    .filter((r): r is HabitLog => typeof r.id === 'number')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Compute per-habit completion stats for a fixed-size window of days
 * ending today (default 7 / 30).  Returns a map keyed by `habitId`
 * with the number of days the habit was logged in the window, the
 * total days in the window, and the percentage as a 0..100 number.
 *
 * The percentage uses the simpler "at least one log in a day counts
 * as 1" model (the schema allows multiple rows per day, but the MVP
 * UI only ever writes one).  This matches what the user sees in the
 * calendar — a checked day is a done day.
 */
export interface HabitWindowStats {
  habitId: number;
  days: number;
  logged: number;
  percent: number; // 0..100, rounded
}

export async function getWindowStats(habitId: number, days: number): Promise<HabitWindowStats> {
  const today = new Date();
  const since = localDateKey(subDays(today, days - 1));
  const logs = await getHabitLogs(habitId, since);
  const uniqueDays = new Set(logs.filter((l) => l.done).map((l) => l.date)).size;
  const percent = days === 0 ? 0 : Math.round((uniqueDays / days) * 100);
  return { habitId, days, logged: uniqueDays, percent };
}

/**
 * Aggregate stats across every habit, for both windows.  One table
 * read + N streak queries; the page can call this in `onMount` and
 * keep the result in `$state` for fast re-renders.
 */
export interface HabitDashboardStats {
  window7: Record<number, HabitWindowStats>;
  window30: Record<number, HabitWindowStats>;
  bestStreak: { habitId: number; streak: number; name: string } | null;
  mostConsistent: { habitId: number; percent7: number; name: string } | null;
}

export async function getDashboardStats(habits: Habit[]): Promise<HabitDashboardStats> {
  const out: HabitDashboardStats = {
    window7: {},
    window30: {},
    bestStreak: null,
    mostConsistent: null
  };

  for (const h of habits) {
    if (typeof h.id !== 'number') continue;
    const [s7, s30, streak] = await Promise.all([
      getWindowStats(h.id, 7),
      getWindowStats(h.id, 30),
      getStreak(h.id)
    ]);
    out.window7[h.id] = s7;
    out.window30[h.id] = s30;

    if (out.bestStreak === null || streak > out.bestStreak.streak) {
      out.bestStreak = { habitId: h.id, streak, name: h.name };
    }
    if (
      out.mostConsistent === null ||
      s7.percent > out.mostConsistent.percent7
    ) {
      out.mostConsistent = {
        habitId: h.id,
        percent7: s7.percent,
        name: h.name
      };
    }
  }

  return out;
}

/**
 * Build the calendar map for one habit in one month: a record from
 * `YYYY-MM-DD` → true for every logged day in that month.  The page
 * uses this to render the monthly grid; we keep the render dumb and
 * the computation in Dexie so the component stays a pure renderer.
 */
export async function getMonthLogs(habitId: number, year: number, month0: number): Promise<HeatmapData> {
  const month = String(month0 + 1).padStart(2, '0');
  const since = `${year}-${month}-01`;
  // Last day of the month: first day of next month, minus 1 day.
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  const until = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
  const logs = await getHabitLogs(habitId, since);
  const out: HeatmapData = {};
  for (const l of logs) {
    if (l.date > until) continue;
    if (l.done) out[l.date] = true;
  }
  return out;
}

/**
 * Set the logged state of a habit on a given date (task-040).  When
 * `done` is true, inserts a log row if missing (idempotent — does not
 * double-write).  When false, removes any existing log.  Returns
 * whether a write happened (used to skip redundant XP awards on a
 * second tap).
 *
 * The `date` parameter defaults to today and accepts any 'YYYY-MM-DD'
 * string so callers can do retroactive edits from the calendar.
 */
export async function setHabitLog(
  habitId: number,
  date: string,
  done: boolean
): Promise<{ changed: boolean }> {
  const existing = await db().habit_logs
    .where('[habitId+date]')
    .equals([habitId, date])
    .first();
  if (done && !existing) {
    await db().habit_logs.add({
      habitId,
      date,
      done: true,
      createdAt: Date.now()
    });
    return { changed: true };
  }
  if (!done && existing) {
    await db().habit_logs
      .where('[habitId+date]')
      .equals([habitId, date])
      .delete();
    return { changed: true };
  }
  return { changed: false };
}