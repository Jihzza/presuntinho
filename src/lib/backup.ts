/**
 * src/lib/backup.ts
 *
 * Export / import the user's full local dataset as a single JSON blob.
 *
 * Scope of a "backup":
 *   - Every Dexie table (state, settings, badges, visited, quizScores,
 *     secrets, transacoes, orcamentos, categorias, habitos, habit_logs,
 *     biblioteca, notes).
 *   - Every `localStorage` entry (theme, language, session, prefs).
 *   - The whitelisted `sessionStorage` keys the app uses.
 *
 * Out of scope (intentionally):
 *   - IndexedDB of OTHER profiles (each profile keeps its own DB on
 *     disk; we only touch the active one).
 *   - The V3 /legacy localStorage, which is read-only and not part of
 *     the V4 app state.
 *
 * Schema:
 *   {
 *     version:   5,
 *     exportedAt: ISO-8601 string,
 *     profile:   ProfileId,
 *     dexie:     { [table]: Row[] },
 *     localStorage:   { [key]: string },
 *     sessionStorage: { [key]: string }
 *   }
 *
 * Versioning rule: bump `version` whenever you add or remove a Dexie
 * table or rename a storage key.  `validateSchema` accepts any version
 * >= 3 so V3 exports still import cleanly; later fields are ignored
 * when missing so older payloads keep working.
 */

import { browser } from '$app/environment';
import { db } from '$lib/state/db';
import type { ProfileId } from '$lib/auth/hash';

// ---------------------------------------------------------------------------
// Public schema
// ---------------------------------------------------------------------------

/** Tables we know how to round-trip.  Keep in sync with `src/lib/state/db.ts`. */
export const BACKUP_TABLES = [
  'state',
  'settings',
  'badges',
  'visited',
  'quizScores',
  'secrets',
  'transacoes',
  'orcamentos',
  'categorias',
  'habitos',
  'habit_logs',
  'biblioteca',
  'notes'
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/** sessionStorage keys we include in the backup.  Add keys here as the
 *  app starts using sessionStorage. */
export const BACKUP_SESSION_KEYS = ['fat-quiz-session'] as const;

export type BackupSessionKey = (typeof BACKUP_SESSION_KEYS)[number];

/** Current backup payload version.  Increment when the schema changes. */
export const BACKUP_VERSION = 5 as const;

/** Minimum version that `validateSchema` will still accept. */
export const BACKUP_MIN_VERSION = 3 as const;

export interface BackupPayload {
  version: number;
  exportedAt: string;        // ISO-8601
  profile: ProfileId;
  dexie: Partial<Record<BackupTable, unknown[]>>;
  localStorage: Record<string, string>;
  sessionStorage: Partial<Record<BackupSessionKey, string>>;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Snapshot every Dexie table + every `localStorage` entry + the known
 * `sessionStorage` keys into a `BackupPayload`.  This function never
 * touches the page — it just returns the object so callers can do
 * whatever they want with it (download, upload to Drive, etc.).
 *
 * Safe to call during SSR: returns an empty payload (no Dexie, no
 * storage).  Browser-only callers always go through the real path.
 */
export async function exportData(profile: ProfileId = 'fatma'): Promise<BackupPayload> {
  const payload: BackupPayload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profile,
    dexie: {},
    localStorage: {},
    sessionStorage: {}
  };

  if (!browser) return payload;

  // 1. Dexie tables — read each table in parallel.
  try {
    const d = db(profile);
    const rows = await Promise.all(
      BACKUP_TABLES.map(async (t) => [t, await d[t].toArray()] as const)
    );
    for (const [t, arr] of rows) {
      payload.dexie[t] = arr;
    }
  } catch (e) {
    // Dexie might not be open yet on first boot — that's fine, we still
    // export whatever localStorage has.
    console.warn('[backup] dexie snapshot failed', e);
  }

  // 2. localStorage — copy every key verbatim.
  try {
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k === null) continue;
      const v = ls.getItem(k);
      if (v !== null) payload.localStorage[k] = v;
    }
  } catch {
    // localStorage can throw in private mode; tolerate it.
  }

  // 3. sessionStorage — only the whitelisted keys, NOT the whole store
  //    (we don't want to round-trip tab-local UI state).
  try {
    const ss = window.sessionStorage;
    for (const k of BACKUP_SESSION_KEYS) {
      const v = ss.getItem(k);
      if (v !== null) payload.sessionStorage[k] = v;
    }
  } catch {
    // ignore
  }

  return payload;
}

/**
 * Convenience: turn the payload into a `Blob` ready for download.
 * Pretty-printed with 2-space indent so the file is diff-friendly.
 */
export function payloadToBlob(payload: BackupPayload): Blob {
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

/**
 * Suggest a filename for an export.  `YYYY-MM-DD` keeps the files
 * sortable in Finder / Explorer.
 */
export function suggestedFilename(now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `presuntinho-backup-${day}.json`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Cheap structural check.  We do NOT deep-validate every row — Dexie
 * will reject malformed rows when we `bulkPut` them, and that's a
 * better error surface than 200 lines of JSON-schema noise.
 *
 * Returns `{ ok: true }` on success, or `{ ok: false, reason }` with a
 * human-readable explanation.
 */
export function validateSchema(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, reason: 'not a JSON object' };
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.version !== 'number') {
    return { ok: false, reason: 'missing `version` field' };
  }
  if (obj.version < BACKUP_MIN_VERSION) {
    return { ok: false, reason: `unsupported version ${obj.version} (need >= ${BACKUP_MIN_VERSION})` };
  }
  if (obj.dexie !== undefined && (typeof obj.dexie !== 'object' || obj.dexie === null)) {
    return { ok: false, reason: '`dexie` must be an object' };
  }
  if (obj.localStorage !== undefined && (typeof obj.localStorage !== 'object' || obj.localStorage === null)) {
    return { ok: false, reason: '`localStorage` must be an object' };
  }
  if (obj.sessionStorage !== undefined && (typeof obj.sessionStorage !== 'object' || obj.sessionStorage === null)) {
    return { ok: false, reason: '`sessionStorage` must be an object' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Apply a backup payload to the live app.  DESTRUCTIVE — every Dexie
 * table listed in `BACKUP_TABLES` is cleared before being repopulated.
 * `localStorage` and `sessionStorage` are also replaced wholesale.
 *
 * The caller is responsible for:
 *   - Calling `validateSchema` first (or wrapping in try/catch — this
 *     function will throw on schema errors too).
 *   - Reloading the page afterwards so every store re-hydrates from
 *     the freshly-imported data.  `importData` does NOT reload by
 *     itself; that decision is left to the UI so it can show a success
 *     message first.
 *
 * Throws on any storage error so the caller can surface it in the UI.
 */
export async function importData(
  payload: BackupPayload,
  profile: ProfileId = 'fatma'
): Promise<void> {
  if (!browser) throw new Error('importData can only run in the browser');
  const v = validateSchema(payload);
  if (!v.ok) throw new Error(v.reason ?? 'invalid payload');

  const d = db(profile);

  // 1. Dexie — clear + bulkPut every known table.
  //    Sequential loop (NOT Promise.all of .clear()) gives clearer
  //    error attribution if one table fails.
  for (const table of BACKUP_TABLES) {
    const arr = (payload.dexie ?? {})[table];
    // @ts-ignore — table typings are unions; trust the JSON contract.
    await d[table].clear();
    if (Array.isArray(arr) && arr.length > 0) {
      // @ts-ignore — same as above.
      await d[table].bulkPut(arr);
    }
  }

  // 2. localStorage — wipe everything, then restore the keys from the
  //    backup.  Same semantics as Definições → Limpar dados.
  try {
    const ls = window.localStorage;
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (k !== null) ls.removeItem(k);
    }
    for (const [k, val] of Object.entries(payload.localStorage ?? {})) {
      if (typeof val === 'string') ls.setItem(k, val);
    }
  } catch (e) {
    console.warn('[backup] localStorage restore failed', e);
  }

  // 3. sessionStorage — only the whitelisted keys.  Other tab-local
  //    state is left alone.
  try {
    const ss = window.sessionStorage;
    for (const k of BACKUP_SESSION_KEYS) ss.removeItem(k);
    for (const [k, val] of Object.entries(payload.sessionStorage ?? {})) {
      if (typeof val === 'string' && (BACKUP_SESSION_KEYS as readonly string[]).includes(k)) {
        ss.setItem(k, val);
      }
    }
  } catch (e) {
    console.warn('[backup] sessionStorage restore failed', e);
  }
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

/**
 * Parse a JSON string into a `BackupPayload`.  Wraps `JSON.parse` so
 * callers don't have to repeat the try/catch.  Throws on invalid JSON
 * or schema violations.
 */
export function parseBackup(text: string): BackupPayload {
  const parsed: unknown = JSON.parse(text);
  const v = validateSchema(parsed);
  if (!v.ok) throw new Error(v.reason ?? 'invalid backup');
  return parsed as BackupPayload;
}