// Trabalhos (Escola sub-app) helpers — Phase 11 / Task-004.
//
// Thin wrappers around the `assignments` Dexie table added in v7
// (`src/lib/state/db.ts`).  All UI code should import from here so the
// schema is a single point of change — the same convention used by
// `financas.ts` and `habitos.ts`.
//
// Responsibilities:
//   * listAssignments()         — every row, ordered by deadline asc.
//   * getAssignment(id)          — fetch one by slug id (PK).
//   * setAssignmentStatus()      — lifecycle transition (pending →
//                                 in_progress → submitted → graded).
//   * listAssignmentCursos()     — distinct curso slugs for the
//                                 filter dropdown.
//   * ensureAssignmentDefaults() — seed the table on first boot
//                                 (delegates to assignments-seed.ts).
//
// XP rewards for lifecycle transitions reuse the existing XP_TABLE
// entries from `xp-actions.ts`: `assignment_status_in_progress` (+3)
// and `assignment_status_done` (+15) when a trabalho is submitted.
// This keeps the Dexie `submitted` lifecycle aligned with the older
// localStorage "done" reward reason without changing the XP schema.
//
// SSR safety: `db()` is lazy and the helpers throw if called on the
// server.  Callers MUST guard with an `onMount` / `browser` check —
// the same pattern as the habitos/financas wrappers.

import { browser } from '$app/environment';
import { db } from './state/db';
import type { AssignmentRow } from './state/db';
import { buildDefaultAssignments } from './state/assignments-seed';
import { awardXP } from './state/xp-actions';

// Re-export the Dexie row type so consumers don't need to also import
// from $lib/state/db (keeps the schema boundary narrow — same pattern
// as the TransacaoRow re-export in financas.ts).
export type { AssignmentRow };

/** A saved assignment with the stable string `id` resolved. */
export type Assignment = AssignmentRow;

/** Lifecycle states — mirrors `AssignmentRow['status']`. */
export type AssignmentStatus = AssignmentRow['status'];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Seed the default 10 assignments on first run.  Idempotent: a
 * bulkPut is only fired when the table is empty so users who have
 * already added their own rows (or whose seed has already run) never
 * see their data stomped.  Mirrors the pattern used for `categorias`
 * in `financas.ts`.
 *
 * Deadlines are computed at seed time as `Date.now() + N days` so a
 * fresh install always sees realistic urgencies.
 */
export async function ensureAssignmentDefaults(): Promise<void> {
  const d = db();
  const count = await d.assignments.count();
  if (count === 0) {
    const rows = buildDefaultAssignments();
    await d.assignments.bulkPut(rows);
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * List every assignment, ordered by deadline ascending (earliest
 * urgency first — the same mental model the user has when they
 * open `/trabalhos`).  Uses the `deadline` secondary index so the
 * sort is index-driven rather than a table scan.
 *
 * Status filter and curso filter are intentionally applied in the
 * caller (page-level) so the same data can power the
 * status/curso/ordem controls without round-tripping back to the DB.
 */
export async function listAssignments(): Promise<Assignment[]> {
  return await db().assignments.orderBy('deadline').toArray();
}

/** Fetch a single assignment by its stable slug id.  Null if not found. */
export async function getAssignment(id: string): Promise<Assignment | null> {
  if (!id) return null;
  const row = await db().assignments.get(id);
  return row ?? null;
}

/**
 * Distinct curso slugs across every assignment, sorted
 * alphabetically.  Used by the list page's curso filter dropdown.
 * Returns 'todos' as a synthetic first entry so the dropdown always
 * has a "show all" option.
 */
export async function listAssignmentCursos(): Promise<string[]> {
  const rows = await db().assignments.toArray();
  const set = new Set<string>();
  for (const r of rows) set.add(r.curso);
  const loc = typeof localStorage === 'undefined' ? 'pt-PT' : localStorage.getItem('fat-pref-lang') || 'pt-PT';
  return ['todos', ...Array.from(set).sort((a, b) => a.localeCompare(b, loc))];
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Transition an assignment to a new status.  Refuses no-op writes
 * (same status) and stamps `updatedAt` on every successful change so
 * the `updatedAt` index keeps reflecting the latest user action.
 *
 * XP rewards:
 *   * `in_progress` → +3 XP via `assignment_status_in_progress`.
 *   * `submitted`   → +15 XP via the existing legacy-compatible
 *                     `assignment_status_done` reward reason.
 *
 * Returns the updated row, or null if the id doesn't exist.  Throws
 * on Dexie errors so the UI can surface a toast.
 */
export async function setAssignmentStatus(
  id: string,
  status: AssignmentStatus
): Promise<Assignment | null> {
  if (!browser) return null;
  const d = db();
  const existing = await d.assignments.get(id);
  if (!existing) return null;
  if (existing.status === status) return existing;

  const updated: Assignment = {
    ...existing,
    status,
    updatedAt: Date.now()
  };
  await d.assignments.put(updated);

  // Award XP for the two explicit MVP lifecycle milestones.
  if (status === 'in_progress') {
    await awardXP('assignment_status_in_progress');
  } else if (status === 'submitted') {
    await awardXP('assignment_status_done');
  }

  return updated;
}
