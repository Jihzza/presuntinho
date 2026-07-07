// Hábitos sub-app helpers — Phase 7, upgraded for V8 ("Duolingo-level").
//
// All functions are pure async wrappers around the Dexie tables defined
// in `$lib/state/db.ts`:
//   habitos     — habit definitions
//   habit_logs  — per-day completion records (compound [habitId+date] index)
//
// V8 changes (this file):
//   * `localDateKey` is now EXPORTED and is the single source of truth
//     for 'YYYY-MM-DD' local date keys (fixes the UTC drift bug where
//     `new Date().toISOString().slice(0,10)` flipped "today" after 23:00
//     Lisbon time in winter / 22:00 in summer... wrong for the user).
//   * Cadence widened to 'daily' | 'weekly' | { days: number[] }.
//     The stored column in db.ts is still typed 'daily' (non-indexed, so
//     no schema bump is needed) — we type the union locally and cast at
//     the Dexie boundary.  See `HabitCadence` + `normalizeCadence`.
//   * `getStreak` is cadence-aware and widens its fetch window
//     progressively, so streaks are no longer capped at ~120 days.
//   * Streak milestones use crossed-threshold semantics
//     (prev < t <= next) so retro-fills and long streaks award correctly.
//   * Structured reminders: { time: 'HH:MM', days?: number[] } with a
//     legacy free-text fallback (`reminder` may still be a string).
//   * Analytics: best-ever streak + weekday breakdowns (weak days).
//
// Design notes:
//   * We never mutate the DB outside of these helpers — components
//     import from here so the schema is a single point of change.
//   * All date keys are 'YYYY-MM-DD' in the user's LOCAL timezone.
//   * SSR safety: every helper calls `db()` lazily and the table
//     queries will throw in Node (no IndexedDB).  Callers MUST be
//     guarded behind an `onMount` / `browser` check.

import { addDays, format, subDays } from 'date-fns';
import { weekdayShort } from './i18n/dates';
import { db } from './state/db';
import { awardXP } from './state/xp-actions';
import type { HabitoRow, HabitLogRow } from './state/db';

// ---------------------------------------------------------------------------
// Public types — re-exported so component code only imports from one place.
// ---------------------------------------------------------------------------

/**
 * V8 cadence union.  The db.ts row still declares `cadence: 'daily'`
 * (we cannot edit db.ts from this module's owner) — the column is NOT
 * indexed so any JSON-serialisable value round-trips fine through
 * Dexie.  A handoff note asks for the db.ts type to be widened.
 */
export type HabitCadence = 'daily' | 'weekly' | { days: number[] };

/** V8 structured reminder.  `days` uses JS getDay() numbering (0=Sun..6=Sat). */
export interface HabitReminder {
  time: string; // 'HH:MM'
  days?: number[]; // subset of 0..6; undefined/empty = every scheduled day
}

/**
 * A habit row with the V8 widened fields and the auto-incremented `id`
 * resolved (i.e. it's a saved row).  `reminder` may be a legacy
 * free-text string from pre-V8 data — use `parseReminder` to read it.
 */
export interface Habit extends Omit<HabitoRow, 'id' | 'cadence' | 'reminder'> {
  id: number;
  cadence: HabitCadence;
  reminder?: string | HabitReminder;
}

/** A single day's log, with the auto-incremented `id` resolved. */
export interface HabitLog extends HabitLogRow {
  id: number;
}

/** Input shape for `addHabito` — caller does NOT pass `id` or `createdAt`. */
export type NewHabitInput = Omit<Habit, 'id' | 'createdAt'>;

/** Map<date, logged> for the heatmap and quick "any log today?" checks. */
export type HeatmapData = Record<string, boolean>;

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

const SEED_HABIT_NAME_KEYS: Record<string, string> = {
  'Exercício 30min': 'exercicio-30min',
  'Leitura 20min': 'leitura-20min',
  'Estudar PT': 'estudar-pt',
  'Hidratação 2L': 'hidratacao-2l',
  'Dormir 8h': 'dormir-8h'
};

export function localizedHabit(t: TranslateFn, habit: Habit): Habit {
  const key = SEED_HABIT_NAME_KEYS[habit.name];
  if (!key) return habit;
  return { ...habit, name: t(`seed.habits.${key}.name`, { default: habit.name }) };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date as a 'YYYY-MM-DD' string in the user's LOCAL timezone.
 * EXPORTED (V8): every component must use this instead of
 * `toISOString().slice(0, 10)` — the ISO version is UTC and flips the
 * day too early/late depending on the timezone offset.
 */
export function localDateKey(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd');
}

/** Start of the (Monday-first) week containing `d`, as a local Date. */
function startOfWeekMonday(d: Date): Date {
  const back = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
  return subDays(d, back);
}

// ---------------------------------------------------------------------------
// Cadence helpers
// ---------------------------------------------------------------------------

/**
 * Coerce whatever is stored in Dexie into a valid `HabitCadence`.
 * Unknown / corrupt values collapse to 'daily' (the pre-V8 behavior).
 */
export function normalizeCadence(raw: unknown): HabitCadence {
  if (raw === 'weekly') return 'weekly';
  if (raw && typeof raw === 'object' && Array.isArray((raw as { days?: unknown[] }).days)) {
    const days = (raw as { days: unknown[] }).days
      .filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6);
    const unique = [...new Set(days)].sort((a, b) => a - b);
    if (unique.length > 0 && unique.length < 7) return { days: unique };
    if (unique.length === 7) return 'daily';
  }
  return 'daily';
}

/**
 * Is the habit scheduled on this calendar day?
 *   - 'daily'  → every day.
 *   - 'weekly' → every day is a valid day to do it (the streak engine
 *     counts weeks, not days — see `getStreak`).
 *   - custom   → only the listed weekdays (JS getDay numbering).
 */
export function isScheduledOn(cadence: HabitCadence, d: Date): boolean {
  const c = normalizeCadence(cadence);
  if (c === 'daily' || c === 'weekly') return true;
  return c.days.includes(d.getDay());
}

/** Same check from a 'YYYY-MM-DD' key (parsed as LOCAL midnight). */
export function isScheduledOnKey(cadence: HabitCadence, dateKey: string): boolean {
  const [y, m, day] = dateKey.split('-').map(Number);
  return isScheduledOn(cadence, new Date(y, (m ?? 1) - 1, day ?? 1));
}

/**
 * Read a habit's reminder into the structured shape.  Legacy strings
 * that look like 'HH:MM' (or 'H:MM') are upgraded on the fly; any
 * other free text returns null (display the raw string instead).
 */
export function parseReminder(raw: string | HabitReminder | undefined | null): HabitReminder | null {
  if (!raw) return null;
  if (typeof raw === 'object') {
    if (typeof raw.time === 'string' && /^\d{1,2}:\d{2}$/.test(raw.time)) {
      const days = Array.isArray(raw.days)
        ? [...new Set(raw.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
        : undefined;
      return { time: raw.time.padStart(5, '0'), days: days && days.length > 0 && days.length < 7 ? days : undefined };
    }
    return null;
  }
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) {
    return { time: `${m[1].padStart(2, '0')}:${m[2]}` };
  }
  return null;
}

/** Localised short weekday name for a JS getDay() index (0=Sun..6=Sat). */
export function weekdayShortName(locale: string, weekday: number): string {
  // 2024-01-07 is a Sunday → offset by getDay index gives each weekday.
  const ref = new Date(2024, 0, 7 + weekday);
  try {
    return weekdayShort(ref, locale);
  } catch {
    return String(weekday);
  }
}

// ---------------------------------------------------------------------------
// CRUD on habit definitions
// ---------------------------------------------------------------------------

/** Cast helper at the Dexie boundary — see `HabitCadence` note above. */
function toRow(habit: Omit<Habit, 'id'> & { id?: number }): HabitoRow {
  return habit as unknown as HabitoRow;
}

function fromRow(row: HabitoRow): Habit | null {
  if (typeof row.id !== 'number') return null;
  const h = row as unknown as Habit;
  return { ...h, cadence: normalizeCadence(h.cadence) };
}

/**
 * List every habit, newest-first.  Uses the `createdAt` index so the
 * sort is index-driven rather than a table scan.
 */
export async function listHabitos(): Promise<Habit[]> {
  const rows = await db().habitos.orderBy('createdAt').reverse().toArray();
  return rows.map(fromRow).filter((r): r is Habit => r !== null);
}

/** Fetch one habit by id (or null). */
export async function getHabito(id: number): Promise<Habit | null> {
  const row = await db().habitos.get(id);
  return row ? fromRow(row) : null;
}

/**
 * Insert a new habit.  Returns the auto-assigned id so the caller can
 * navigate / highlight it immediately.
 */
export async function addHabito(input: NewHabitInput): Promise<number> {
  const reminder = typeof input.reminder === 'string'
    ? (input.reminder.trim() || undefined)
    : (parseReminder(input.reminder) ?? undefined);
  const row = toRow({
    name: input.name.trim(),
    icon: input.icon || '✅',
    color: input.color || '#f472b6',
    cadence: normalizeCadence(input.cadence),
    createdAt: Date.now(),
    meta: input.meta?.trim() || undefined,
    reminder
  });
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
  patch: Partial<Omit<Habit, 'id' | 'createdAt'>>
): Promise<void> {
  // Only allow whitelisted fields through so callers can't accidentally
  // overwrite the primary key or createdAt.
  const safe: Record<string, unknown> = {};
  if (typeof patch.name === 'string') safe.name = patch.name.trim();
  if (typeof patch.icon === 'string') safe.icon = patch.icon;
  if (typeof patch.color === 'string') safe.color = patch.color;
  if (patch.cadence !== undefined) safe.cadence = normalizeCadence(patch.cadence);
  if (typeof patch.meta === 'string') safe.meta = patch.meta.trim() || undefined;
  if (patch.reminder !== undefined) {
    safe.reminder = typeof patch.reminder === 'string'
      ? (patch.reminder.trim() || undefined)
      : (parseReminder(patch.reminder) ?? undefined);
  }
  await db().habitos.update(id, safe as Partial<HabitoRow>);
  await awardXP('habito_edit');
}

/**
 * Delete a habit AND every log row that references it.  Single
 * transaction so a crash mid-delete never leaves orphan log rows.
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
 * key).  Ordered ascending by date.  Uses the compound [habitId+date]
 * index.
 */
export async function getHabitLogs(habitId: number, since: string): Promise<HabitLog[]> {
  const rows = await db().habit_logs
    .where('[habitId+date]')
    .between([habitId, since], [habitId, '￿'])
    .toArray();
  return rows
    .filter((r): r is HabitLog => typeof r.id === 'number')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Streak engine (cadence-aware, V8)
// ---------------------------------------------------------------------------

/** Streak milestone table — thresholds must be ascending. */
export interface StreakMilestone {
  threshold: number;
  reason: 'habito_streak_7' | 'habito_streak_14' | 'habito_streak_30' | 'habito_streak_50' | 'habito_streak_100' | 'habito_streak_365';
  badge?: string;
}

export const STREAK_MILESTONES: ReadonlyArray<StreakMilestone> = Object.freeze([
  { threshold: 7,   reason: 'habito_streak_7',   badge: 'b16' },
  { threshold: 14,  reason: 'habito_streak_14' },
  { threshold: 30,  reason: 'habito_streak_30',  badge: 'b17' },
  { threshold: 50,  reason: 'habito_streak_50' },
  { threshold: 100, reason: 'habito_streak_100' },
  { threshold: 365, reason: 'habito_streak_365' }
]);

/**
 * Milestones crossed going from `prev` to `next` streak values.
 * Crossed-threshold semantics (prev < t <= next) — a retro-fill that
 * bridges a gap can legitimately cross several milestones at once.
 */
export function crossedMilestones(prev: number, next: number): StreakMilestone[] {
  return STREAK_MILESTONES.filter((m) => prev < m.threshold && m.threshold <= next);
}

interface StreakWalkResult {
  streak: number;
  /** True when the streak was still alive at the edge of the fetched
   *  window — the caller must refetch with a wider window. */
  hitBoundary: boolean;
}

/**
 * Pure streak walk over a set of logged 'YYYY-MM-DD' keys.
 *
 * Rules:
 *   - daily  : consecutive days ending today; if today has no log yet,
 *     the anchor moves to yesterday (grace) so the streak doesn't read
 *     as zero every morning.
 *   - custom : only SCHEDULED weekdays count; unscheduled days are
 *     skipped (they neither add nor break).  Grace applies to the most
 *     recent scheduled day.
 *   - weekly : consecutive Monday-first weeks with >= 1 log; the
 *     current (incomplete) week gets grace if it has no log yet.
 */
function walkStreak(
  logged: Set<string>,
  cadence: HabitCadence,
  today: Date,
  sinceKey: string
): StreakWalkResult {
  const c = normalizeCadence(cadence);

  if (c === 'weekly') {
    const loggedWeeks = new Set<string>();
    for (const key of logged) {
      const [y, m, d] = key.split('-').map(Number);
      loggedWeeks.add(localDateKey(startOfWeekMonday(new Date(y, (m ?? 1) - 1, d ?? 1))));
    }
    let week = startOfWeekMonday(today);
    // Grace: current week not yet logged → anchor previous week.
    if (!loggedWeeks.has(localDateKey(week))) week = subDays(week, 7);
    let streak = 0;
    for (;;) {
      const key = localDateKey(week);
      if (key < sinceKey) return { streak, hitBoundary: true };
      if (!loggedWeeks.has(key)) return { streak, hitBoundary: false };
      streak += 1;
      week = subDays(week, 7);
    }
  }

  // daily / custom weekdays — walk day by day, counting scheduled days.
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Move to the most recent scheduled day (<= today).
  let guard = 0;
  while (!isScheduledOn(c, cursor) && guard++ < 7) cursor = subDays(cursor, 1);
  // Grace: anchor day not logged yet → step to the previous scheduled day.
  if (!logged.has(localDateKey(cursor))) {
    cursor = subDays(cursor, 1);
    guard = 0;
    while (!isScheduledOn(c, cursor) && guard++ < 7) cursor = subDays(cursor, 1);
  }

  let streak = 0;
  for (;;) {
    const key = localDateKey(cursor);
    if (key < sinceKey) return { streak, hitBoundary: true };
    if (isScheduledOn(c, cursor)) {
      if (!logged.has(key)) return { streak, hitBoundary: false };
      streak += 1;
    }
    cursor = subDays(cursor, 1);
  }
}

/** Hard ceiling on how far back we'll ever look (~10 years). */
const STREAK_MAX_WINDOW_DAYS = 3660;

/**
 * Current streak ending today (cadence-aware).
 *
 * V8 fix: the old implementation fetched a fixed 120-day window, which
 * silently capped long streaks.  We now start at 180 days and DOUBLE
 * the window whenever the walk is still alive at the window edge,
 * until the streak breaks naturally or we hit the 10-year ceiling.
 *
 * `cadence` is optional for backwards compatibility (hub card calls
 * `getStreak(id)`) — when omitted we read the habit row first.
 */
export async function getStreak(habitId: number, cadence?: HabitCadence): Promise<number> {
  const cad = cadence !== undefined
    ? normalizeCadence(cadence)
    : normalizeCadence((await db().habitos.get(habitId))?.cadence);

  const today = new Date();
  let windowDays = 180;
  for (;;) {
    const sinceKey = localDateKey(subDays(today, windowDays));
    const logs = await getHabitLogs(habitId, sinceKey);
    const loggedDates = new Set(logs.filter((l) => l.done).map((l) => l.date));
    const result = walkStreak(loggedDates, cad, today, sinceKey);
    if (!result.hitBoundary || windowDays >= STREAK_MAX_WINDOW_DAYS) return result.streak;
    windowDays = Math.min(windowDays * 2, STREAK_MAX_WINDOW_DAYS);
  }
}

/**
 * Best-EVER streak for a habit (cadence-aware).  Scans the habit's
 * full log history once — bounded by real usage (a few years of daily
 * logs is ~1000 rows), so a single read is cheaper than paging.
 */
export async function getBestStreak(habitId: number, cadence?: HabitCadence): Promise<number> {
  const cad = cadence !== undefined
    ? normalizeCadence(cadence)
    : normalizeCadence((await db().habitos.get(habitId))?.cadence);

  const logs = await getHabitLogs(habitId, '0000-01-01');
  const done = logs.filter((l) => l.done);
  if (done.length === 0) return 0;

  if (cad === 'weekly') {
    const weeks = new Set<string>();
    for (const l of done) {
      const [y, m, d] = l.date.split('-').map(Number);
      weeks.add(localDateKey(startOfWeekMonday(new Date(y, (m ?? 1) - 1, d ?? 1))));
    }
    const sorted = [...weeks].sort();
    let best = 0;
    let run = 0;
    let prev: string | null = null;
    for (const wk of sorted) {
      if (prev !== null) {
        const [y, m, d] = prev.split('-').map(Number);
        const expected = localDateKey(new Date(y, (m ?? 1) - 1, (d ?? 1) + 7));
        run = wk === expected ? run + 1 : 1;
      } else {
        run = 1;
      }
      prev = wk;
      if (run > best) best = run;
    }
    return best;
  }

  // daily / custom: iterate the calendar from the first log to today,
  // tracking runs over scheduled days only.
  const loggedDates = new Set(done.map((l) => l.date));
  const [fy, fm, fd] = done[0].date.split('-').map(Number);
  let cursor = new Date(fy, (fm ?? 1) - 1, fd ?? 1);
  const endKey = localDateKey(new Date());
  let best = 0;
  let run = 0;
  // Safety cap mirrors STREAK_MAX_WINDOW_DAYS.
  for (let i = 0; i <= STREAK_MAX_WINDOW_DAYS; i++) {
    const key = localDateKey(cursor);
    if (key > endKey) break;
    if (isScheduledOn(cad, cursor)) {
      if (loggedDates.has(key)) {
        run += 1;
        if (run > best) best = run;
      } else if (key !== endKey) {
        // A missed scheduled day breaks the run — except today, which
        // may simply not be logged yet (grace, mirrors walkStreak).
        run = 0;
      }
    }
    cursor = addDays(cursor, 1);
  }
  return best;
}

/**
 * Mark a habit as done on `date` (default = today).  Idempotent — if a
 * log already exists for that (habitId, date), we leave it alone.
 *
 * XP wiring (V8): every NEW log awards `habito_mark_done` (+2).  We
 * compute the streak BEFORE and AFTER the insert and award every
 * milestone crossed (prev < t <= next) — so retro-fills that bridge a
 * gap and long streaks award correctly (the old exact-equality check
 * missed them).
 *
 * Returns what happened so callers can celebrate (confetti/toast):
 *   { logged, streak, milestones } — `milestones` holds the crossed
 *   thresholds (usually empty, occasionally [7] etc.).
 */
export interface LogHabitResult {
  logged: boolean;
  streak: number;
  milestones: number[];
}

export async function logHabit(
  habitId: number,
  date: string = localDateKey()
): Promise<LogHabitResult> {
  const existing = await db().habit_logs
    .where('[habitId+date]')
    .equals([habitId, date])
    .first();
  if (existing) {
    return { logged: false, streak: await getStreak(habitId), milestones: [] };
  }

  const habit = await db().habitos.get(habitId);
  const cadence = normalizeCadence(habit?.cadence);
  // Este dia já pagou XP alguma vez? (sobrevive a desmarcar/remarcar) — se sim,
  // registamos a conclusão mas NÃO voltamos a pagar +2 nem a repetir milestones.
  const alreadyPaid = (habit?.xpPaidDates ?? []).includes(date);
  // Streak before the insert — used for crossed-threshold detection.
  let prevStreak = 0;
  try {
    prevStreak = await getStreak(habitId, cadence);
  } catch {
    prevStreak = 0;
  }

  await db().habit_logs.add({
    habitId,
    date,
    done: true,
    createdAt: Date.now()
  });

  let newStreak = prevStreak;
  const crossed: number[] = [];
  // XP wiring in try/catch so a failure never breaks the core
  // "I just logged a habit" action.
  try {
    newStreak = await getStreak(habitId, cadence);
    if (!alreadyPaid) {
      const { awardXP } = await import('./state/xp-actions');
      const { awardBadge } = await import('./state/stores');

      // +2 XP for the new log
      await awardXP('habito_mark_done');

      for (const m of crossedMilestones(prevStreak, newStreak)) {
        await awardXP(m.reason);
        if (m.badge) await awardBadge(m.badge);
        crossed.push(m.threshold);
      }

      // Marca o dia como pago (capado a 400 dias — chega para qualquer
      // deteção de milestone e mantém a linha pequena).
      if (habit && typeof habit.id === 'number') {
        const paid = [...(habit.xpPaidDates ?? []), date].sort();
        while (paid.length > 400) paid.shift();
        await db().habitos.update(habit.id, { xpPaidDates: paid });
      }
    }
  } catch (err) {
    console.warn('[habitos] XP/badge wiring failed (non-fatal):', err);
  }

  return { logged: true, streak: newStreak, milestones: crossed };
}

/**
 * Remove the log for a habit on `date` (default = today).  No-op if no
 * log exists.
 */
export async function unlogHabit(habitId: number, date: string = localDateKey()): Promise<void> {
  await db().habit_logs
    .where('[habitId+date]')
    .equals([habitId, date])
    .delete();
}

/**
 * Return true if `habitId` has at least one log for today (user's
 * local timezone).  Hits the compound [habitId+date] index — O(1).
 */
export async function isLoggedToday(habitId: number): Promise<boolean> {
  const todayKey = localDateKey();
  const row = await db().habit_logs
    .where('[habitId+date]')
    .equals([habitId, todayKey])
    .first();
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

/**
 * Build the heatmap data structure: a `Record<date, true>` of every
 * day the habit was logged in the last `days` days (default 90).
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
// Stats: windows, dashboards, weekday breakdowns
// ---------------------------------------------------------------------------

/**
 * Read every log row across ALL habits, with `date >= since` and
 * `date <= until`.  Used by the weak-day aggregation so the dashboard
 * does one table scan instead of N.
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
 * Per-habit completion stats for a window of `days` ending today.
 * V8: cadence-aware — the denominator is the number of SCHEDULED days
 * in the window (for 'weekly', the number of weeks touched by the
 * window) so a Mon/Wed/Fri habit at 3/3 shows 100%, not 43%.
 */
export interface HabitWindowStats {
  habitId: number;
  days: number;
  /** Days (or weeks, for 'weekly') actually completed in the window. */
  logged: number;
  /** Scheduled opportunities in the window (denominator of percent). */
  scheduled: number;
  percent: number; // 0..100, rounded
}

export async function getWindowStats(
  habitId: number,
  days: number,
  cadence?: HabitCadence
): Promise<HabitWindowStats> {
  const cad = cadence !== undefined
    ? normalizeCadence(cadence)
    : normalizeCadence((await db().habitos.get(habitId))?.cadence);

  const today = new Date();
  const since = localDateKey(subDays(today, days - 1));
  const logs = await getHabitLogs(habitId, since);
  const loggedDates = new Set(logs.filter((l) => l.done).map((l) => l.date));

  if (cad === 'weekly') {
    // Count Monday-first weeks touched by the window and how many of
    // them have >= 1 log.
    const loggedWeeks = new Set<string>();
    for (const key of loggedDates) {
      const [y, m, d] = key.split('-').map(Number);
      loggedWeeks.add(localDateKey(startOfWeekMonday(new Date(y, (m ?? 1) - 1, d ?? 1))));
    }
    let week = startOfWeekMonday(today);
    let scheduled = 0;
    let done = 0;
    while (localDateKey(subDays(week, -6)) >= since) {
      scheduled += 1;
      if (loggedWeeks.has(localDateKey(week))) done += 1;
      week = subDays(week, 7);
    }
    if (scheduled === 0) scheduled = 1; // window always touches >= 1 week
    const percent = Math.round((done / scheduled) * 100);
    return { habitId, days, logged: done, scheduled, percent: Math.min(percent, 100) };
  }

  let scheduled = 0;
  let done = 0;
  for (let i = 0; i < days; i++) {
    const d = subDays(today, i);
    if (!isScheduledOn(cad, d)) continue;
    scheduled += 1;
    if (loggedDates.has(localDateKey(d))) done += 1;
  }
  const percent = scheduled === 0 ? 0 : Math.round((done / scheduled) * 100);
  return { habitId, days, logged: done, scheduled, percent };
}

/**
 * Per-weekday completion for ONE habit over the last `days` days.
 * Only scheduled occurrences count.  Index = JS getDay() (0=Sun..6=Sat).
 */
export interface WeekdayStat {
  weekday: number; // 0=Sun .. 6=Sat
  scheduled: number;
  done: number;
  percent: number; // 0..100 (0 when never scheduled)
}

export async function getWeekdayStats(
  habitId: number,
  cadence?: HabitCadence,
  days: number = 90
): Promise<WeekdayStat[]> {
  const cad = cadence !== undefined
    ? normalizeCadence(cadence)
    : normalizeCadence((await db().habitos.get(habitId))?.cadence);

  const today = new Date();
  const since = localDateKey(subDays(today, days - 1));
  const logs = await getHabitLogs(habitId, since);
  const loggedDates = new Set(logs.filter((l) => l.done).map((l) => l.date));

  const scheduled = new Array<number>(7).fill(0);
  const done = new Array<number>(7).fill(0);
  for (let i = 0; i < days; i++) {
    const d = subDays(today, i);
    // 'weekly' habits have no meaningful per-weekday schedule — count
    // every day so the chart shows WHICH days the user tends to pick.
    if (cad !== 'weekly' && !isScheduledOn(cad, d)) continue;
    const wd = d.getDay();
    scheduled[wd] += 1;
    if (loggedDates.has(localDateKey(d))) done[wd] += 1;
  }

  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    scheduled: scheduled[weekday],
    done: done[weekday],
    percent: scheduled[weekday] === 0 ? 0 : Math.round((done[weekday] / scheduled[weekday]) * 100)
  }));
}

/**
 * GLOBAL weekday activity across every habit, over the last `days`
 * days — feeds the "weak day" summary card.  Returns log counts per
 * weekday (index = JS getDay()).  Reuses the previously-dead
 * `getAllLogsInRange` so it's one table scan.
 */
export async function getGlobalWeekdayActivity(days: number = 90): Promise<number[]> {
  const today = new Date();
  const since = localDateKey(subDays(today, days - 1));
  const until = localDateKey(today);
  const logs = await getAllLogsInRange(since, until);
  const counts = new Array<number>(7).fill(0);
  for (const l of logs) {
    if (!l.done) continue;
    const [y, m, d] = l.date.split('-').map(Number);
    counts[new Date(y, (m ?? 1) - 1, d ?? 1).getDay()] += 1;
  }
  return counts;
}

/**
 * Aggregate stats across every habit, for both windows plus best-ever
 * streak.  The page calls this in `onMount` and keeps the result in
 * `$state` for fast re-renders.
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
      getWindowStats(h.id, 7, h.cadence),
      getWindowStats(h.id, 30, h.cadence),
      getStreak(h.id, h.cadence)
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
 * `YYYY-MM-DD` → true for every logged day in that month.
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
 * Set the logged state of a habit on a given date WITHOUT any XP side
 * effects (used for toggling OFF, or for bulk edits).  For toggling a
 * day ON, prefer `logHabit(habitId, date)` — it owns the XP + streak
 * milestone wiring (V8 bug fix: the old page called setHabitLog first
 * and then logHabit, which saw the row already present and never
 * awarded XP).
 */
/**
 * V10 — true when EVERY habit scheduled for today already has a done log.
 * Powers the "all habits done" victory flow (GamificationLayer). Returns
 * false when nothing is scheduled today (an empty day is not a victory).
 */
export async function allDueHabitsDoneToday(): Promise<boolean> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayKey = `${y}-${m}-${d}`;

  const habits = await listHabitos();
  const due = habits.filter((h) => isScheduledOnKey(h.cadence, todayKey));
  if (due.length === 0) return false;

  const logs = await db().habit_logs.where('date').equals(todayKey).toArray();
  const doneIds = new Set(logs.filter((l) => l.done).map((l) => l.habitId));
  return due.every((h) => doneIds.has(h.id));
}

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
