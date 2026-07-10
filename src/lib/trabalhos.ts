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
//   * createAssignment(input)    — insert a user-authored trabalho.
//   * updateAssignment(id,patch) — edit title/course/deadline/notes/status.
//   * setAssignmentStatus()      — lifecycle transition (pending →
//                                 in_progress → submitted → graded);
//                                 thin wrapper over updateAssignment().
//   * deleteAssignment(id)       — remove a trabalho (no XP penalty).
//   * listAssignmentCursos()     — distinct curso slugs for the
//                                 filter dropdown.
//   * ensureAssignmentDefaults() — seed the table on first boot
//                                 (delegates to assignments-seed.ts).
//
// XP rewards for lifecycle transitions use the XP_TABLE reasons from
// `xp-actions.ts`: `assignment_status_in_progress` (+3) and
// `assignment_status_done` on submit.  V8: the submit reward pays the
// row's own `xpReward` (the number shown on the card); rows without a
// positive xpReward fall back to the XP_TABLE default (+15).  There is no
// `assignment_create`/`assignment_edit`/`assignment_delete` reason in
// XP_TABLE by design, so those actions award no XP (we do NOT invent keys).
// Each milestone pays only the FIRST time it is reached — recorded in the
// non-indexed `xpPaidStatuses` field on the row (mirrors
// `HabitoRow.xpPaidDates`) so undoing a submit and re-submitting can't farm
// XP.  That field is additive (absent on legacy/seed rows = "nothing paid
// yet"), so no Dexie schema/version change is required.
//
// SSR safety: `db()` is lazy and the helpers throw if called on the
// server.  Callers MUST guard with an `onMount` / `browser` check —
// the same pattern as the habitos/financas wrappers.

import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { db } from './state/db';
import type { AssignmentRow } from './state/db';
import { locale } from './i18n';
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

/**
 * Input for {@link createAssignment}.  The caller passes only the
 * user-facing fields — `id`, `createdAt` and `updatedAt` are stamped by
 * the helper so they can't be forged.  UI naming: `curso` is the "course"
 * dropdown value and `description` is the optional "notes" textarea.
 * `status` defaults to 'pending' and `xpReward` to
 * {@link DEFAULT_ASSIGNMENT_XP} when omitted.
 */
export interface NovaAssignmentInput {
  title: string;
  curso: string;
  deadline: number;          // timestamp ms
  description?: string;      // UI "notes"
  cadeira?: string;
  status?: AssignmentStatus; // initial status (default 'pending')
  xpReward?: number;         // reward paid on submit (default DEFAULT_ASSIGNMENT_XP)
}

/**
 * Patch for {@link updateAssignment}.  Every field is optional — only the
 * keys actually present are written (mirrors `updateTransacao` /
 * `updateMeta` in `financas.ts`).  UI naming: `curso` = "course",
 * `description` = "notes".
 */
export interface AssignmentPatch {
  title?: string;
  curso?: string;
  cadeira?: string;
  deadline?: number;
  description?: string;
  status?: AssignmentStatus;
}

/** Default XP reward for a user-created assignment (paid once, on submit). */
export const DEFAULT_ASSIGNMENT_XP = 50;

/**
 * Internal row shape = the persisted `AssignmentRow` plus the non-indexed
 * `xpPaidStatuses` guard.  Kept private (the public `Assignment` type stays
 * `AssignmentRow` so the biblioteca / escola / agenda consumers are
 * untouched); Dexie persists the extra column verbatim because the schema
 * string only declares indexes.  Same technique `financas.ts` uses to add
 * `recorrente*` fields without a schema bump.
 */
type AssignmentRowExt = AssignmentRow & { xpPaidStatuses?: AssignmentStatus[] };

/** Lifecycle ordering — used to tell forward transitions from undos. */
const STATUS_ORDER: Record<AssignmentStatus, number> = {
  pending: 0,
  in_progress: 1,
  submitted: 2,
  graded: 3
};

/** Canonical status list, in lifecycle order — SINGLE source for dropdowns.
 *  Derived from STATUS_ORDER so adding a status updates every consumer. */
export const STATUS_OPTIONS: readonly AssignmentStatus[] = (
  Object.keys(STATUS_ORDER) as AssignmentStatus[]
).sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b]);

/** i18n key + pt-PT fallback per status — routes wrap this with $t so the
 *  label mapping can't drift between the three pages that render it. */
export const STATUS_LABELS: Record<AssignmentStatus, { key: string; fallback: string }> = {
  pending: { key: 'trabalhos.status.pending', fallback: 'Por começar' },
  in_progress: { key: 'trabalhos.status.in_progress', fallback: 'Em curso' },
  submitted: { key: 'trabalhos.status.submitted', fallback: 'Entregue' },
  graded: { key: 'trabalhos.status.graded', fallback: 'Avaliado' }
};

/** Timestamp → 'YYYY-MM-DDTHH:mm' local string for datetime-local inputs
 *  ('' when invalid). Shared by the new-assignment and edit forms. */
export function toDatetimeLocal(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Default deadline for a NEW assignment: 7 days from now at 23:59 local. */
export function defaultDeadlineLocal(): string {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  d.setHours(23, 59, 0, 0);
  return toDatetimeLocal(d.getTime());
}

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function localizedAssignment(t: TranslateFn, assignment: Assignment): Assignment {
  if (!/^a\d+$/.test(assignment.id)) return assignment;
  return {
    ...assignment,
    title: t(`seed.assignments.${assignment.id}.title`, { default: assignment.title }),
    description: t(`seed.assignments.${assignment.id}.description`, { default: assignment.description }),
    cadeira: t(`seed.assignments.${assignment.id}.cadeira`, { default: assignment.cadeira })
  };
}

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
  const loc = get(locale) || 'pt-PT';
  return ['todos', ...Array.from(set).sort((a, b) => a.localeCompare(b, loc))];
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Generate a stable id for a user-created assignment.  The `t` prefix keeps
 * these rows out of the seed's `/^a\d+$/` namespace so
 * `localizedAssignment()` never tries to translate them against
 * non-existent `seed.assignments.*` keys.
 */
function newAssignmentId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * The milestone statuses (in_progress / submitted) already "reached" by a
 * row that is BORN into `status` — used to pre-mark them as paid so an
 * initial 'in_progress' / 'submitted' / 'graded' choice never pays XP and
 * can't be farmed by create → delete → create.
 */
function milestonesReachedBy(status: AssignmentStatus): AssignmentStatus[] {
  const reached: AssignmentStatus[] = [];
  if (STATUS_ORDER[status] >= STATUS_ORDER.in_progress) reached.push('in_progress');
  if (STATUS_ORDER[status] >= STATUS_ORDER.submitted) reached.push('submitted');
  return reached;
}

/**
 * Insert a new user-authored assignment.  `title` and `curso` are required
 * and `deadline` must be a finite timestamp; everything else falls back to
 * a sensible default.  Returns the saved row so the caller can navigate to
 * it or the list immediately.
 *
 * No XP is awarded: there is no `assignment_create` reason in XP_TABLE and
 * the design forbids inventing one — creating a tracker entry is not itself
 * an accomplishment.  XP is paid only when the work is actually progressed
 * (see {@link updateAssignment}).  Any milestone the row is created into is
 * recorded in `xpPaidStatuses` so it is never retroactively rewarded.
 */
export async function createAssignment(input: NovaAssignmentInput): Promise<Assignment> {
  if (!browser) throw new Error('createAssignment: fora do browser');
  const title = input.title.trim();
  if (!title) throw new Error('assignment_title_vazio');
  const curso = input.curso.trim();
  if (!curso) throw new Error('assignment_curso_vazio');
  if (!Number.isFinite(input.deadline)) throw new Error('assignment_deadline_invalido');

  const now = Date.now();
  const status: AssignmentStatus = input.status ?? 'pending';
  const xpReward =
    typeof input.xpReward === 'number' && input.xpReward > 0
      ? Math.round(input.xpReward)
      : DEFAULT_ASSIGNMENT_XP;

  const row: AssignmentRowExt = {
    id: newAssignmentId(),
    title: title.slice(0, 160),
    description: (input.description ?? '').trim(),
    curso,
    cadeira: input.cadeira?.trim() || undefined,
    deadline: input.deadline,
    status,
    xpReward,
    createdAt: now,
    updatedAt: now
  };
  const bornPaid = milestonesReachedBy(status);
  if (bornPaid.length > 0) row.xpPaidStatuses = bornPaid;

  await db().assignments.put(row);
  return row;
}

/**
 * Update an existing assignment.  Only the patch keys present are written;
 * `updatedAt` is always re-stamped so the `updatedAt` index reflects the
 * latest edit.  Returns the updated row, or null if the id doesn't exist.
 *
 * XP: a milestone (in_progress / submitted) pays the FIRST time it is
 * reached, recorded in `xpPaidStatuses`.  So undoing a submit (submitted →
 * in_progress/pending) and re-submitting never re-pays, and the
 * informational 'graded' state never pays — mirroring the anti-farm guard
 * `logHabit` uses.  Submit pays the row's own `xpReward` (falling back to
 * the XP_TABLE default when non-positive).
 */
export async function updateAssignment(
  id: string,
  patch: AssignmentPatch
): Promise<Assignment | null> {
  if (!browser) return null;
  const d = db();
  const existing = (await d.assignments.get(id)) as AssignmentRowExt | undefined;
  if (!existing) return null;

  const next: AssignmentRowExt = { ...existing };
  if (patch.title !== undefined) next.title = patch.title.trim().slice(0, 160) || existing.title;
  if (patch.curso !== undefined) next.curso = patch.curso.trim() || existing.curso;
  if (patch.cadeira !== undefined) next.cadeira = patch.cadeira.trim() || undefined;
  if (patch.description !== undefined) next.description = patch.description.trim();
  if (patch.deadline !== undefined) {
    if (!Number.isFinite(patch.deadline)) throw new Error('assignment_deadline_invalido');
    next.deadline = patch.deadline;
  }
  if (patch.status !== undefined) next.status = patch.status;
  next.updatedAt = Date.now();

  // Decide whether this write crosses a not-yet-paid milestone.
  const paid = new Set<AssignmentStatus>(existing.xpPaidStatuses ?? []);
  let reason: string | null = null;
  let amount: number | undefined;
  if (
    patch.status !== undefined &&
    next.status !== existing.status &&
    (next.status === 'in_progress' || next.status === 'submitted') &&
    !paid.has(next.status)
  ) {
    paid.add(next.status);
    next.xpPaidStatuses = [...paid];
    if (next.status === 'in_progress') {
      reason = 'assignment_status_in_progress';
    } else {
      reason = 'assignment_status_done';
      amount =
        typeof existing.xpReward === 'number' && existing.xpReward > 0
          ? existing.xpReward
          : undefined;
    }
  }

  await d.assignments.put(next);
  if (reason) await awardXP(reason, amount);
  return next;
}

/**
 * Transition an assignment to a new status.  Refuses no-op writes (same
 * status) and otherwise delegates to {@link updateAssignment} so the XP
 * milestone guard and `updatedAt` stamping live in one place.  Returns the
 * updated row, or null if the id doesn't exist.
 */
export async function setAssignmentStatus(
  id: string,
  status: AssignmentStatus
): Promise<Assignment | null> {
  if (!browser) return null;
  const existing = await db().assignments.get(id);
  if (!existing) return null;
  if (existing.status === status) return existing;
  return updateAssignment(id, { status });
}

/**
 * Delete an assignment by id.  No-op if the id doesn't exist.  Never
 * carries an XP penalty — removing a tracker row is legitimate tidying, not
 * something to punish (same stance as `transacao_delete: 0`,
 * `habito_delete: 0` and `deleteMeta`).
 */
export async function deleteAssignment(id: string): Promise<void> {
  if (!browser) return;
  await db().assignments.delete(id);
}
