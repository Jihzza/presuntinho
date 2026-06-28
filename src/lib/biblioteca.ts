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
 */
export async function addItem(input: NewItemInput): Promise<number> {
  const row: BibliotecaRow = {
    title: input.title.trim(),
    url: input.url.trim(),
    tags: Array.isArray(input.tags) ? input.tags.map((t) => t).filter(Boolean) : [],
    description: input.description?.trim() ?? '',
    createdAt: Date.now()
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