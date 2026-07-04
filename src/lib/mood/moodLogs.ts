// src/lib/mood/moodLogs.ts
//
// Domain helper for the V8 `mood_logs` Dexie table (mood history).
//
// This is the ONLY module that touches `db().mood_logs` — components and
// route pages go through these helpers so the storage shape stays in one
// place. Two row "families" live in the same table:
//
//   * episodes  — Sick / Soft / Love moods started via activateMood()
//                 (source 'password' | 'manual' | 'agent'). They stay open
//                 (clearedAt === undefined) until the mood is cleared.
//   * check-ins — the gentle daily check-in (source 'checkin'). One row per
//                 local day; kind is a feeling ('low'..'loved') and the row
//                 is point-in-time (clearedAt === startedAt).
//
// Care actions ticked in MoodLayer are persisted on the episode row both as
// a non-indexed `careDone` map and as `care:<actionId>` tags so insight
// queries can use either.

import { browser } from '$app/environment';
import type { Table } from 'dexie';
import { db, type MoodLogRow } from '$lib/state/db';
import { awardXP } from '$lib/state/xp-actions';
import type { MoodKind, MoodTriggerSource } from '$lib/mood';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

/** Feelings offered by the daily check-in, in display order. */
export type CheckinKind = 'low' | 'meh' | 'ok' | 'happy' | 'loved';

export const CHECKIN_KINDS: readonly CheckinKind[] = ['low', 'meh', 'ok', 'happy', 'loved'];

export const CHECKIN_EMOJI: Record<CheckinKind, string> = {
  low: '😞',
  meh: '😐',
  ok: '🙂',
  happy: '😄',
  loved: '🥰'
};

/** Optional context tags the user can attach to a check-in. */
export const CHECKIN_TAGS = [
  'tired',
  'stressed',
  'study',
  'money',
  'relationship',
  'sleep',
  'sick',
  'happy'
] as const;
export type CheckinTag = (typeof CHECKIN_TAGS)[number];

/**
 * mood_logs row with the non-indexed care map used by episode rows.
 * (MoodLogRow itself lives in $lib/state/db — extra fields are fine in
 * IndexedDB, we just widen the type here.)
 */
export interface MoodEpisodeRow extends MoodLogRow {
  careDone?: Record<string, boolean>;
}

/**
 * Soft data-viz colours per kind, used by the /humor heatmap + timeline.
 * Kept here (not in components) so calendar/insight views agree.
 */
export const KIND_COLORS: Record<string, string> = {
  // episodes
  sick: '#60a5fa',
  sad: '#f472b6',
  love: 'var(--accent, #db2777)',
  // check-in feelings
  low: '#64748b',
  meh: '#a8a29e',
  ok: '#34d399',
  happy: '#fbbf24',
  loved: '#fb7185'
};

export const KIND_EMOJI_ALL: Record<string, string> = {
  sick: '🤍',
  sad: '🥺',
  love: '💕',
  ...CHECKIN_EMOJI
};

/** Window CustomEvent fired after a check-in is saved/updated. */
export const CHECKIN_SAVED_EVENT = 'presuntinho:mood-checkin';

export function isCheckinKind(value: unknown): value is CheckinKind {
  return typeof value === 'string' && (CHECKIN_KINDS as readonly string[]).includes(value);
}

/** LOCAL 'YYYY-MM-DD' key (never UTC — matches the rest of the app). */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function table(): Table<MoodEpisodeRow, number> {
  return db().mood_logs as unknown as Table<MoodEpisodeRow, number>;
}

// ---------------------------------------------------------------------------
// Episodes (Sick / Soft / Love)
// ---------------------------------------------------------------------------

/** Open a new episode row. Returns its id, or null if storage failed. */
export async function startMoodEpisode(
  kind: MoodKind,
  source: MoodTriggerSource,
  startedAt: number = Date.now()
): Promise<number | null> {
  if (!browser) return null;
  try {
    const row: MoodEpisodeRow = {
      kind,
      source,
      tags: [],
      date: localDateKey(new Date(startedAt)),
      startedAt,
      careDone: {}
    };
    return await table().add(row);
  } catch (e) {
    console.warn('[moodLogs] startMoodEpisode failed', e);
    return null;
  }
}

/** Fetch a single row by id (used to re-attach after reloads). */
export async function getEpisode(id: number): Promise<MoodEpisodeRow | null> {
  if (!browser) return null;
  try {
    return (await table().get(id)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Close an episode (sets clearedAt). Also sweeps any other dangling open
 * episode rows — e.g. moods activated in another browser and cleared here —
 * so the history never shows two "still active" episodes at once.
 */
export async function closeMoodEpisode(
  id: number | null,
  clearedAt: number = Date.now()
): Promise<void> {
  if (!browser) return;
  try {
    const tbl = table();
    if (id != null) await tbl.update(id, { clearedAt });
    const dangling = await tbl
      .filter((row) => row.source !== 'checkin' && row.clearedAt === undefined)
      .toArray();
    for (const row of dangling) {
      if (row.id != null) await tbl.update(row.id, { clearedAt });
    }
  } catch (e) {
    console.warn('[moodLogs] closeMoodEpisode failed', e);
  }
}

/**
 * Persist MoodLayer care-action ticks on the episode row: both as a
 * `careDone` map and as `care:<actionId>` tags (scope: insights).
 */
export async function setEpisodeCare(
  id: number,
  careDone: Record<string, boolean>
): Promise<void> {
  if (!browser) return;
  try {
    const tbl = table();
    const row = await tbl.get(id);
    if (!row) return;
    const otherTags = (row.tags ?? []).filter((tag) => !tag.startsWith('care:'));
    const careTags = Object.keys(careDone)
      .filter((key) => careDone[key])
      .map((key) => `care:${key}`);
    await tbl.update(id, { careDone: { ...careDone }, tags: [...otherTags, ...careTags] });
  } catch (e) {
    console.warn('[moodLogs] setEpisodeCare failed', e);
  }
}

// ---------------------------------------------------------------------------
// Daily check-in
// ---------------------------------------------------------------------------

/** The check-in row for today (local date), or null. */
export async function getTodayCheckin(): Promise<MoodEpisodeRow | null> {
  if (!browser) return null;
  try {
    const rows = await table().where('date').equals(localDateKey()).toArray();
    return rows.find((row) => row.source === 'checkin') ?? null;
  } catch {
    return null;
  }
}

export interface SaveCheckinResult {
  /** true when this was today's first check-in (XP was awarded). */
  isNew: boolean;
}

/**
 * Save (or gently update) today's check-in. XP ('mood_checkin', +2) is
 * awarded only for the first check-in of the day — editing later never
 * double-awards.
 */
export async function saveCheckin(
  kind: CheckinKind,
  tags: string[],
  note: string
): Promise<SaveCheckinResult | null> {
  if (!browser) return null;
  try {
    const tbl = table();
    const existing = await getTodayCheckin();
    const trimmedNote = note.trim();
    const cleanTags = tags.filter((tag) => tag && !tag.startsWith('care:'));

    if (existing?.id != null) {
      await tbl.update(existing.id, {
        kind,
        tags: cleanTags,
        note: trimmedNote || undefined
      });
      return { isNew: false };
    }

    const now = Date.now();
    const row: MoodEpisodeRow = {
      kind,
      source: 'checkin',
      tags: cleanTags,
      date: localDateKey(),
      startedAt: now,
      clearedAt: now
    };
    if (trimmedNote) row.note = trimmedNote;
    await tbl.add(row);
    void awardXP('mood_checkin');
    return { isNew: true };
  } catch (e) {
    console.warn('[moodLogs] saveCheckin failed', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Queries for /humor (calendar + timeline + insights)
// ---------------------------------------------------------------------------

/** All rows whose local date falls inside the given month (0-based month). */
export async function getLogsForMonth(
  year: number,
  monthIndex0: number
): Promise<MoodEpisodeRow[]> {
  if (!browser) return [];
  const mm = String(monthIndex0 + 1).padStart(2, '0');
  const first = `${year}-${mm}-01`;
  const last = `${year}-${mm}-31`; // string compare — inclusive upper bound is safe
  try {
    return await table().where('date').between(first, last, true, true).sortBy('startedAt');
  } catch {
    return [];
  }
}

/** Most recent rows, newest first (timeline). */
export async function getRecentLogs(limit = 20): Promise<MoodEpisodeRow[]> {
  if (!browser) return [];
  try {
    return await table().orderBy('startedAt').reverse().limit(limit).toArray();
  } catch {
    return [];
  }
}
