// Biblioteca sub-app helpers — Phase 8.
//
// All functions are pure async wrappers around the Dexie `biblioteca`
// table defined in `$lib/state/db.ts` (v4 schema):
//
//   biblioteca:  ++id, *tags, createdAt
//
// `*tags` is Dexie's multi-entry index syntax: every entry of the
// `tags` array is added to the index, so `where('tags').equals('python')`
// returns every row whose `tags` array contains the string 'python'
// — no full-table scan.
//
// Design notes:
//   * We never mutate the DB outside of these helpers — components
//     import from here so the schema is a single point of change.
//   * `tags` are always stored normalised (trimmed + lower-case) so
//     the index doesn't fragment on case-only differences
//     ('Python' vs 'python').  Display rendering can re-capitalise
//     at the call-site if needed.
//   * SSR safety: every helper calls `db()` lazily and the table
//     queries will throw in Node (no IndexedDB).  Callers MUST be
//     guarded behind an `onMount` / `browser` check, the same way
//     the splash and hábitos routes already do.

import { db } from './state/db';
import { awardXP } from './state/xp-actions';
import type { BibliotecaRow } from './state/db';

// ---------------------------------------------------------------------------
// Public types — re-exported so component code only imports from one place.
// ---------------------------------------------------------------------------

/** A bookmark row with the auto-incremented `id` resolved (i.e. saved). */
export interface Item extends BibliotecaRow {
  id: number;
}

/** Input shape for `addItem` — caller does NOT pass `id` or `createdAt`. */
export type NewItemInput = Omit<BibliotecaRow, 'id' | 'createdAt'>;

/**
 * Sparse update payload for `updateItem()`.  Every field is OPTIONAL;
 * only the keys the caller passes are written.  This lets the edit
 * route PATCH one field at a time without rebuilding the whole row.
 */
export type UpdateItemInput = Partial<Pick<BibliotecaRow, 'title' | 'url' | 'description' | 'tags' | 'curso_id' | 'assignment_id'>>;

/**
 * Optional filter passed to `listItems()`.  All fields are AND-ed
 * together; the `query` filter is a case-insensitive substring match
 * against `title` and the `tag` filter is an exact match against any
 * element of the `tags` array.
 */
export interface ListFilter {
  query?: string;
  tag?: string;
}

// ---------------------------------------------------------------------------
// Tag normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a user-entered tag:
 *   - trim surrounding whitespace
 *   - collapse internal whitespace runs to a single space
 *   - lower-case for index-friendly equality
 *   - return null for empty / too-short strings so callers can filter
 *     them out instead of writing bogus index entries.
 *
 * The 100-char cap matches the URL length used elsewhere; tags longer
 * than that are almost certainly a paste mistake.
 */
function normaliseTag(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  if (t.length > 100) return null;
  return t;
}

/**
 * Convert a comma-separated user string (e.g. "Python, docs, AI") into
 * a deduped, normalised array of tags.  Empty / too-short entries are
 * dropped silently — see `normaliseTag()`.
 */
export function parseTagsInput(input: string): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of input.split(',')) {
    const t = normaliseTag(piece);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Return every bookmark, newest-first.
 *
 * Uses the `createdAt` secondary index so the sort is index-driven
 * rather than a table scan.  Optional `filter` is applied in memory
 * after the index read — for the MVP (dozens of items, not thousands)
 * this is fine; if the table ever grows past ~1k rows we'd push the
 * tag filter down into the index, but that's not a Phase 8 concern.
 *
 * The post-read `filter((r): r is Item => typeof r.id === 'number')`
 * guards the auto-increment has resolved (it always will for stored
 * rows, but TS doesn't know that without the predicate).
 */
export async function listItems(filter?: ListFilter): Promise<Item[]> {
  const rows = await db().biblioteca.orderBy('createdAt').reverse().toArray();
  let out = rows.filter((r): r is Item => typeof r.id === 'number');

  if (filter?.query) {
    const q = filter.query.trim().toLowerCase();
    if (q) {
      out = out.filter((r) => r.title.toLowerCase().includes(q));
    }
  }
  if (filter?.tag) {
    const t = normaliseTag(filter.tag);
    if (t) {
      // The `tags` array may contain pre-normalised strings; equality
      // here is already case-folded by normaliseTag().
      out = out.filter((r) => r.tags.includes(t));
    }
  }
  return out;
}

/**
 * Insert a new bookmark.  Returns the auto-assigned id so the caller
 * can navigate to the detail route immediately.
 *
 * `title` and `url` are trimmed; empty `tags` and `description` are
 * coerced to `[]` and `''` respectively so we never store undefined.
 * Optional `curso_id` / `assignment_id` are stored verbatim (no
 * validation that the slug/id exists — phase 11 schema doesn't have
 * foreign-key enforcement, and the user can attach/reattach freely).
 */
export async function addItem(input: NewItemInput): Promise<number> {
  const row: BibliotecaRow = {
    title: input.title.trim(),
    url: input.url.trim(),
    tags: Array.isArray(input.tags) ? input.tags.map((t) => t).filter(Boolean) : [],
    description: input.description?.trim() ?? '',
    createdAt: Date.now(),
    curso_id: input.curso_id?.trim() || undefined,
    assignment_id: input.assignment_id?.trim() || undefined
  };
  const id = await db().biblioteca.add(row) as number;
  await awardXP('biblioteca_add');

  // gap-055: award XP for each NEW tag used for the first time
  try {
    if (row.tags.length > 0) {
      const existingTags = new Set(await listTags());
      let firstUseCount = 0;
      for (const tag of row.tags) {
        if (!existingTags.has(tag)) firstUseCount += 1;
      }
      for (let i = 0; i < firstUseCount; i += 1) {
        await awardXP('biblioteca_use_tag');
      }
    }
  } catch (err) {
    // XP wiring must never break the core bookmark-add flow
    console.warn('[biblioteca] awardXP(use_tag) failed (non-fatal):', err);
  }

  return id;
}

/**
 * Delete a single bookmark by id.  No-op (and not an error) if the id
 * doesn't exist; this matches Dexie's own delete() semantics.
 */
export async function deleteItem(id: number): Promise<void> {
  await db().biblioteca.delete(id);
}

/**
 * Fetch a single bookmark by id.  Returns `null` if the row was
 * deleted between the list render and the detail page mount — the
 * detail route shows a friendly "não encontrado" state in that case.
 */
export async function getItem(id: number): Promise<Item | null> {
  const row = await db().biblioteca.get(id);
  if (!row || typeof row.id !== 'number') return null;
  return row as Item;
}

/**
 * Update one or more fields of a bookmark.  Only the keys the caller
 * passes are written; everything else stays untouched.  Returns the
 * updated row so the caller can refresh its local snapshot.
 *
 * Empty-string trimming rules mirror `addItem`:
 *   - title / url / description: trim, store `''` as-is
 *   - tags: keep array (empty ok)
 *   - curso_id / assignment_id: trim; if the trimmed value is `''`,
 *     store as `undefined` so the row no longer claims a link.
 */
export async function updateItem(id: number, patch: UpdateItemInput): Promise<Item | null> {
  const existing = await db().biblioteca.get(id);
  if (!existing || typeof existing.id !== 'number') return null;

  const next: BibliotecaRow = { ...existing };

  if ('title' in patch) next.title = (patch.title ?? '').trim();
  if ('url' in patch) next.url = (patch.url ?? '').trim();
  if ('description' in patch) next.description = (patch.description ?? '').trim();
  if ('tags' in patch) {
    next.tags = Array.isArray(patch.tags) ? patch.tags.map((t) => t).filter(Boolean) : [];
  }
  if ('curso_id' in patch) {
    const c = (patch.curso_id ?? '').trim();
    next.curso_id = c ? c : undefined;
  }
  if ('assignment_id' in patch) {
    const a = (patch.assignment_id ?? '').trim();
    next.assignment_id = a ? a : undefined;
  }

  await db().biblioteca.put(next);
  return next as Item;
}

/**
 * Attach an existing bookmark to a Trabalho.  Writes
 * `assignment_id` (and optionally `curso_id`) on the bookmark row.
 *
 * Awards `biblioteca_attach` XP ONCE per (bookmark, assignment)
 * pair — re-attaching the same bookmark to the same assignment is a
 * no-op for the XP table.  We track the awarded pairs in a Set on
 * the module so the award is in-memory idempotent for the lifetime
 * of the page; durability of this idempotency is NOT required (the
 * XP rules will be tightened in task-007 once the central XP table
 * ships).
 *
 * Pass `null` as the second arg to detach (clears the field).
 */
const _attachedAwarded = new Set<string>();
export async function attachBookmarkToAssignment(
  bookmarkId: number,
  assignmentId: string | null,
  cursoId?: string | null
): Promise<Item | null> {
  if (assignmentId === null) {
    return await updateItem(bookmarkId, { assignment_id: undefined as never });
  }
  const updated = await updateItem(bookmarkId, {
    assignment_id: assignmentId,
    curso_id: cursoId ?? undefined
  });
  const key = `${bookmarkId}:${assignmentId}`;
  if (updated && !_attachedAwarded.has(key)) {
    _attachedAwarded.add(key);
    try {
      await awardXP('biblioteca_attach');
    } catch (err) {
      // XP is best-effort — a write must never fail because of the XP bus.
      console.warn('[biblioteca] awardXP(attach) failed (non-fatal):', err);
    }
  }
  return updated;
}

/**
 * Find every bookmark attached to a given Trabalho id.  Used by the
 * assignment detail page to render the bookmarks as linked resources.
 */
export async function listBookmarksForAssignment(assignmentId: string): Promise<Item[]> {
  if (!assignmentId) return [];
  const rows = await db().biblioteca
    .where('tags') // we don't have a secondary index on assignment_id, so scan
    .equals('')
    .toArray()
    .catch(() => []);
  // Fallback / correctness: scan the whole table and filter client-side.
  // For the MVP (<= a few hundred bookmarks) this is well within budget.
  const all = await db().biblioteca.toArray();
  return all
    .filter((r): r is Item => typeof r.id === 'number' && r.assignment_id === assignmentId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ---------------------------------------------------------------------------
// Searches
// ---------------------------------------------------------------------------

/**
 * Case-insensitive substring search on `title`, newest-first.  The
 * list page uses this behind its search box; in practice it goes
 * through `listItems({ query })` so the helper is also exported for
 * callers that want a narrower contract.
 */
export async function searchByTitle(query: string): Promise<Item[]> {
  return listItems({ query });
}

/**
 * Exact-match search by tag, newest-first.  Uses the multi-entry
 * `*tags` index for the candidate set, then re-sorts by `createdAt`
 * (the index doesn't preserve insertion order — multi-entry indexes
 * sort by the indexed value, not by row position).
 *
 * Tag is normalised the same way `addItem()` stores it (lower-case,
 * trimmed) so a query for "Python" hits rows stored as "python".
 */
export async function searchByTag(tag: string): Promise<Item[]> {
  const normalised = normaliseTag(tag);
  if (!normalised) return [];
  const rows = await db().biblioteca.where('tags').equals(normalised).toArray();
  return rows
    .filter((r): r is Item => typeof r.id === 'number')
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Return every distinct tag across all bookmarks, sorted
 * alphabetically.  Used by the list page to render the tag chips.
 *
 * Implementation is a flat-map + Set dedupe — fine for an MVP.  If
 * the table ever grows past a few thousand rows we'd switch to a
 * Dexie `uniqueKeys()` query against the `*tags` index.
 */
export async function listTags(): Promise<string[]> {
  const rows = await db().biblioteca.toArray();
  const set = new Set<string>();
  for (const r of rows) {
    if (!Array.isArray(r.tags)) continue;
    for (const t of r.tags) {
      if (typeof t === 'string' && t.trim()) set.add(t);
    }
  }
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// Export / Import JSON (task-025)
// ---------------------------------------------------------------------------

/** Payload shape for `exportBookmarksJson()` — versioned for forward compat. */
export interface BibliotecaExportV1 {
  schema_version: 'v1';
  exported_at: number;        // Date.now() at the moment of the export
  generator: string;          // e.g. 'presuntinho-biblioteca'
  bookmarks: BibliotecaRow[];
}

/**
 * Serialise every bookmark to JSON in the canonical export shape.
 *
 * Used by the /biblioteca "Export JSON" button.  Caller is
 * responsible for wrapping the JSON string in a Blob and triggering
 * a download; we keep the pure serialisation here so the same
 * function can be reused by tests.
 *
 * The schema_version field lets a future importer reject exports
 * from incompatible schemas instead of crashing mid-merge.
 */
export async function exportBookmarksJson(): Promise<BibliotecaExportV1> {
  const rows = await db().biblioteca.toArray();
  // Drop live Dexie-only fields (none yet — but defensive for the future).
  const clean: BibliotecaRow[] = rows.map((r) => {
    const out: BibliotecaRow = {
      id: r.id,
      title: r.title,
      url: r.url,
      tags: Array.isArray(r.tags) ? r.tags : [],
      description: r.description ?? '',
      createdAt: r.createdAt
    };
    if (r.curso_id) out.curso_id = r.curso_id;
    if (r.assignment_id) out.assignment_id = r.assignment_id;
    return out;
  });
  return {
    schema_version: 'v1',
    exported_at: Date.now(),
    generator: 'presuntinho-biblioteca',
    bookmarks: clean
  };
}

/**
 * Trigger a browser download of the current Biblioteca export.
 * No-op on the server (returns false).  Returns true on success.
 *
 * File name is `presuntinho-biblioteca-YYYY-MM-DD.json` so multiple
 * exports on different days don't collide and the user can sort
 * their Downloads folder chronologically.
 */
export async function downloadBookmarksJson(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const payload = await exportBookmarksJson();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const yyyy = new Date(payload.exported_at);
  const yyyyStr = yyyy.getFullYear();
  const mmStr = String(yyyy.getMonth() + 1).padStart(2, '0');
  const ddStr = String(yyyy.getDate()).padStart(2, '0');
  a.href = url;
  a.download = `presuntinho-biblioteca-${yyyyStr}-${mmStr}-${ddStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a small delay so the click can complete in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return true;
}

export interface ImportResult {
  /** Number of new rows actually written. */
  inserted: number;
  /** Number of incoming rows skipped because their id already exists. */
  skipped: number;
  /** Number of incoming rows that were invalid (bad shape); not written. */
  invalid: number;
  /** Total rows in the payload (for UX feedback). */
  total: number;
}

/**
 * Validate a BibliotecaExportV1 payload shape.  Returns true if every
 * required field looks like what we expect.
 *
 * Strict enough to reject JSON that came from a different schema,
 * but lenient enough to accept rows missing optional fields
 * (the same way `updateItem()` does).
 */
export function isValidBookmarksExport(value: unknown): value is BibliotecaExportV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.schema_version !== 'v1') return false;
  if (!Array.isArray(v.bookmarks)) return false;
  for (const row of v.bookmarks) {
    if (!row || typeof row !== 'object') return false;
    const r = row as Record<string, unknown>;
    if (typeof r.title !== 'string') return false;
    if (typeof r.url !== 'string') return false;
    if (!Array.isArray(r.tags)) return false;
    if (typeof r.createdAt !== 'number') return false;
  }
  return true;
}

/**
 * Merge a BibliotecaExportV1 payload into the current DB.
 *
 * Rules (deterministic, easy to explain to the user):
 *   * If a row has an `id` that already exists in the local table,
 *     skip it (the user's local copy wins).
 *   * If a row has no `id` OR the id is free, insert as new.
 *   * If a row is invalid (failed validation), count it as `invalid`
 *     but don't throw — keep going so a single bad row doesn't kill
 *     the whole import.
 *
 * Returns a per-bucket tally so the UI can show "12 added, 3 skipped,
 * 1 invalid" feedback.
 */
export async function importBookmarksJson(payload: BibliotecaExportV1): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, skipped: 0, invalid: 0, total: payload.bookmarks.length };
  if (!payload?.bookmarks?.length) return result;

  const existingIds = new Set<number>(
    (await db().biblioteca.toArray())
      .map((r) => r.id)
      .filter((id): id is number => typeof id === 'number')
  );

  const toInsert: BibliotecaRow[] = [];
  for (const row of payload.bookmarks) {
    if (!row || typeof row.title !== 'string' || typeof row.url !== 'string' || !Array.isArray(row.tags)) {
      result.invalid += 1;
      continue;
    }
    const id = typeof row.id === 'number' ? row.id : undefined;
    if (id !== undefined && existingIds.has(id)) {
      result.skipped += 1;
      continue;
    }
    const clean: BibliotecaRow = {
      title: row.title.trim(),
      url: row.url.trim(),
      tags: row.tags.map((t) => String(t).trim()).filter(Boolean),
      description: typeof row.description === 'string' ? row.description.trim() : '',
      createdAt: typeof row.createdAt === 'number' ? row.createdAt : Date.now()
    };
    if (typeof row.curso_id === 'string' && row.curso_id.trim()) clean.curso_id = row.curso_id.trim();
    if (typeof row.assignment_id === 'string' && row.assignment_id.trim()) clean.assignment_id = row.assignment_id.trim();
    // Don't write the incoming id — let Dexie allocate a new PK.  This is
    // a safety net against the import payload colliding with a different
    // profile (e.g. Daniel importing a Fatma backup or vice versa).
    toInsert.push(clean);
  }

  if (toInsert.length > 0) {
    await db().biblioteca.bulkAdd(toInsert);
    result.inserted = toInsert.length;
  }
  return result;
}

/**
 * Convenience wrapper for the `<input type=file>` change handler.
 * Reads the File, JSON-parses it, validates the shape, and calls
 * `importBookmarksJson()`.  Returns the per-bucket tally.
 *
 * On any error (no file, invalid JSON, wrong schema) returns null
 * so the caller can show a generic "ficheiro inválido" toast.
 */
export async function importBookmarksFromFile(file: File): Promise<ImportResult | null> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    if (!isValidBookmarksExport(parsed)) return null;
    return await importBookmarksJson(parsed);
  } catch (err) {
    console.warn('[biblioteca] importBookmarksFromFile failed:', err);
    return null;
  }
}