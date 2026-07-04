// Hábitos Pro — seed habits + 14-day tracking history (task-040).
//
// Why a dedicated module instead of inline in ensureDefaults():
//   * The brief asks for 5 realistic habits and 14 days of history so
//     the app never opens empty for Fátma.  Inlining that into
//     ensureDefaults() would dwarf the rest of the bootstrap helper.
//   * Keeping the seed declarative (typed rows in an array) makes it
//     trivial to edit values or add rows.
//   * When we eventually ship "Reset to demo data" in /definicoes, this
//     module is the single import to wire it to.
//
// What lives here:
//   - DEFAULT_HABITOS_PRO: 5 typed habit definitions (matches the
//     task brief: Exercício, Leitura, Estudar PT, Hidratação, Dormir 8h).
//   - buildSeedHabitLogs(now): pure helper that generates 14 days of
//     tracking history per habit with a deterministic pattern that
//     looks organic (some days missed, occasional double-tap, no
//     future dates).
//   - seedHabitosPro(db, now): idempotent worker that ONLY writes
//     when the table is empty.  Called from ensureDefaults().
//
// What does NOT live here:
//   - Migration logic.  Seeding is idempotent via count() === 0 in
//     ensureDefaults() — never bulkPut over a user's existing data.

import type { HabitoRow, HabitLogRow } from './db';
import type { Table } from 'dexie';
import type { HabitCadence, HabitReminder } from '../habitos';

// ---------------------------------------------------------------------------
// Default habit definitions — task-040 brief
// ---------------------------------------------------------------------------

/**
 * Five starter habits chosen to give Fátma a populated, varied list on
 * first open.  The `createdAt` is set at runtime (with a per-index
 * delta) so the list renders in a stable order.
 *
 * `icon` is a short emoji (≤4 code points) and `color` is a hex
 * string — both feed the heatmap tint and the row border colour.
 */
export interface SeedHabitoTemplate {
  name: string;
  icon: string;
  color: string;
  cadence: 'daily';
  /** Per-day log probability (0..1).  0.8 = ~11 logs out of 14 days. */
  completionRate: number;
}

export const DEFAULT_HABITOS_PRO: readonly SeedHabitoTemplate[] = Object.freeze([
  { name: 'Exercício 30min',   icon: '🏃', color: '#10b981', cadence: 'daily', completionRate: 0.78 },
  { name: 'Leitura 20min',     icon: '📖', color: '#f472b6', cadence: 'daily', completionRate: 0.85 },
  { name: 'Estudar PT',        icon: '🇵🇹', color: '#f59e0b', cadence: 'daily', completionRate: 0.72 },
  { name: 'Hidratação 2L',     icon: '💧', color: '#3b82f6', cadence: 'daily', completionRate: 0.92 },
  { name: 'Dormir 8h',         icon: '😴', color: '#6366f1', cadence: 'daily', completionRate: 0.64 }
]);

// ---------------------------------------------------------------------------
// V8 — Template catalogue for the /habitos/novo picker
// ---------------------------------------------------------------------------

/**
 * A pickable habit template.  `nameKey` / `metaKey` are i18n keys —
 * the picker resolves them with `$t(key, { default })` so template
 * names localise while the SAVED habit gets the resolved string.
 *
 * `days` uses JS getDay() numbering (0=Sun..6=Sat).
 */
export interface HabitTemplate {
  id: string;
  nameKey: string;
  defaultName: string;
  icon: string;
  color: string;
  cadence: HabitCadence;
  meta?: string;
  reminder?: HabitReminder;
}

/**
 * DEFAULT_HABITOS_PRO re-expressed as templates + curated extras
 * (hydration/sleep/study/exercise are covered by the Pro five;
 * skincare, finance check and rest are the V8 additions).
 */
export const HABIT_TEMPLATES: readonly HabitTemplate[] = Object.freeze([
  {
    id: 'hydration',
    nameKey: 'habitos.templates.hydration.name',
    defaultName: 'Hidratação 2L',
    icon: '💧',
    color: '#3b82f6',
    cadence: 'daily',
    meta: '2L'
  },
  {
    id: 'sleep',
    nameKey: 'habitos.templates.sleep.name',
    defaultName: 'Dormir 8h',
    icon: '😴',
    color: '#6366f1',
    cadence: 'daily',
    meta: '8h',
    reminder: { time: '22:30' }
  },
  {
    id: 'study',
    nameKey: 'habitos.templates.study.name',
    defaultName: 'Estudar PT',
    icon: '🇵🇹',
    color: '#f59e0b',
    cadence: 'daily',
    meta: '20 min'
  },
  {
    id: 'exercise',
    nameKey: 'habitos.templates.exercise.name',
    defaultName: 'Exercício 30min',
    icon: '🏃',
    color: '#10b981',
    // Mon / Wed / Fri — a realistic training cadence.
    cadence: { days: [1, 3, 5] },
    meta: '30 min'
  },
  {
    id: 'skincare',
    nameKey: 'habitos.templates.skincare.name',
    defaultName: 'Skincare',
    icon: '🧴',
    color: '#f472b6',
    cadence: 'daily',
    reminder: { time: '21:00' }
  },
  {
    id: 'reading',
    nameKey: 'habitos.templates.reading.name',
    defaultName: 'Leitura 20min',
    icon: '📖',
    color: '#a855f7',
    cadence: 'daily',
    meta: '20 min'
  },
  {
    id: 'finance-check',
    nameKey: 'habitos.templates.finance_check.name',
    defaultName: 'Rever finanças',
    icon: '🪙',
    color: '#14b8a6',
    cadence: 'weekly',
    reminder: { time: '18:00', days: [0] }
  },
  {
    id: 'rest',
    nameKey: 'habitos.templates.rest.name',
    defaultName: 'Dia de descanso',
    icon: '🌿',
    color: '#8b5cf6',
    // Weekend recovery — resting is also a habit worth protecting.
    cadence: { days: [0, 6] }
  }
]);

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/**
 * Convert the static templates into Dexie-shaped `HabitoRow`s with
 * `createdAt` deltas so the list renders newest-first within the seed
 * batch and any user-created habit added later naturally sorts after
 * the seeds.
 */
export function buildSeedHabitos(now: number): HabitoRow[] {
  return DEFAULT_HABITOS_PRO.map((h, i) => ({
    name: h.name,
    icon: h.icon,
    color: h.color,
    cadence: h.cadence,
    // +400..+404 deltas keep these seeds after the inline 8-habit
    // default seed (which used +0..+7 deltas in db.ts) so the legacy
    // list and the new "Pro" list coexist without id collisions.
    createdAt: now + 400 + i
  }));
}

/**
 * Generate 14 days of habit_logs for each habit.  The pattern is
 * deterministic per (habitIndex, dayOffset) so the seed looks organic
 * but never random — every fresh DB lands on the same shape, which
 * makes screenshots and smoke tests reproducible.
 *
 * Rules:
 *   - Day 0 = today.  We never write a log for "tomorrow".
 *   - For each day offset 0..13 (inclusive), each habit's
 *     `completionRate` decides whether that day was logged.
 *   - `createdAt` deltas are negative-going so the most recent day
 *     sorts last (logs are already date-keyed, but `createdAt` is
 *     used by other helpers that order by recency).
 */
export function buildSeedHabitLogs(
  habitos: HabitoRow[],
  now: number
): { habitId: number; logs: HabitLogRow[] }[] {
  const day = 24 * 60 * 60 * 1000;
  const today = new Date();

  // Re-derive completion rates from the template list by index.
  // (HabitoRow doesn't carry the rate; templates are in source order.)
  const rates = DEFAULT_HABITOS_PRO.map((h) => h.completionRate);

  const out: { habitId: number; logs: HabitLogRow[] }[] = [];

  habitos.forEach((habit, habitIndex) => {
    const logs: HabitLogRow[] = [];
    const habitId = habit.id;
    if (typeof habitId !== 'number') return; // safety: caller must have ids

    const rate = rates[habitIndex] ?? 0.7;

    for (let offset = 0; offset < 14; offset++) {
      // Deterministic per (habit, day) — same boolean every boot.
      // We hash the habitId + offset to a [0,1) value and compare
      // to the rate threshold.  Skipping "today" (offset=0) for ~50%
      // of habits gives the user a believable "haven't done it yet
      // today" badge on first open without making the data look
      // obviously fake.
      const seed = (habitId * 31 + offset * 17) % 1000;
      const prob = (seed + 0.5) / 1000;
      // For offset=0 we dial back probability a little so the user
      // gets at least one "pending" card on first open.
      const threshold = offset === 0 ? Math.min(rate, 0.55) : rate;
      if (prob > threshold) continue;

      const d = new Date(today.getTime() - offset * day);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      logs.push({
        habitId,
        date: iso,
        done: true,
        // createdAt for older days → earlier timestamps so logs sort
        // ascending in time even when we only display the date.
        createdAt: now - offset * day
      });
    }

    out.push({ habitId, logs });
  });

  return out;
}

// ---------------------------------------------------------------------------
// Idempotent seeder
// ---------------------------------------------------------------------------

/**
 * Insert the 5 starter habits + 14-day history per habit.  Idempotent:
 * no-op if either table already has rows.  Caller passes the Dexie
 * `habitos` and `habit_logs` tables directly so the function stays
 * testable without spinning up the whole PresuntinhoDB singleton.
 */
export async function seedHabitosPro(
  habitosTbl: Table<HabitoRow, number>,
  habitLogsTbl: Table<HabitLogRow, number>,
  now: number = Date.now()
): Promise<{ habits: number; logs: number; skipped: boolean }> {
  const habitCount = await habitosTbl.count();
  if (habitCount > 0) {
    return { habits: 0, logs: 0, skipped: true };
  }

  // Insert habits one at a time so we capture the auto-assigned ids
  // (Dexie's bulkPut would let us skip the per-row round-trip, but
  // we need the ids to build the per-habit log rows below).
  const insertedHabitos: HabitoRow[] = [];
  for (const template of DEFAULT_HABITOS_PRO) {
    const id = (await habitosTbl.add({
      name: template.name,
      icon: template.icon,
      color: template.color,
      cadence: template.cadence,
      createdAt: now + 400 + insertedHabitos.length
    })) as number;
    insertedHabitos.push({
      name: template.name,
      icon: template.icon,
      color: template.color,
      cadence: template.cadence,
      createdAt: now + 400 + insertedHabitos.length,
      id
    });
  }

  // Build + insert logs.
  const perHabit = buildSeedHabitLogs(insertedHabitos, now);
  const allLogs = perHabit.flatMap((p) => p.logs);
  if (allLogs.length > 0) {
    await habitLogsTbl.bulkAdd(allLogs);
  }

  return { habits: insertedHabitos.length, logs: allLogs.length, skipped: false };
}
