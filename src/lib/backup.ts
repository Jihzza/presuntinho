/**
 * src/lib/backup.ts
 *
 * Export / import the user's full local dataset as a single JSON blob.
 *
 * Scope of a "backup":
 *   - Every Dexie table (state, settings, badges, visited, quizScores,
 *     secrets, transacoes, orcamentos, categorias, habitos, habit_logs,
 *     biblioteca, notes, chat_messages, assignments).
 *   - Every `localStorage` entry (theme, language, session, prefs).
 *   - The whitelisted `sessionStorage` keys the app uses.
 *
 * Out of scope (intentionally):
 *   - IndexedDB of OTHER profiles (each profile keeps its own DB on
 *     disk; we only touch the active one).
 *   - The V3 /legacy localStorage, which is read-only and not part of
 *     the V4 app state.
 *
 * Schema (BACKUP_VERSION = 6):
 *   {
 *     version:    6,
 *     exportedAt: ISO-8601 string,
 *     profile:    ProfileId,
 *     dexie:      { [table]: Row[] },
 *     localStorage:    { [key]: string },
 *     sessionStorage:  { [key]: string },
 *     meta:       { appVersion, userAgent, counts } // task-051
 *   }
 *
 * Versioning rule: bump `BACKUP_VERSION` whenever you add or remove a
 * Dexie table or rename a storage key.  `validateSchema` accepts any
 * version >= 3 so older exports still import cleanly; later fields
 * are ignored when missing.
 *
 * task-051: also exposed the brief-mandated helpers
 *   - `exportAllData()`            → BackupPayload v6
 *   - `downloadBackup()`           → triggers a browser file download
 *   - `importBackup(file, mode)`   → merge | replace, returns ImportReport
 *   - `validateBackup(payload)`    → ValidationResult (typed errors)
 * The legacy `exportData`/`parseBackup`/`payloadToBlob`/`importData`
 * surface is preserved so the existing /definicoes page keeps working.
 */

import { browser } from '$app/environment';
import { db, ensureDefaults } from '$lib/state/db';
import type { ProfileId } from '$lib/auth/hash';
import { VERSION } from '$lib/version';

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
  'notes',
  // task-051: the v6/v7 tables were previously missing — adding them
  // here closes the round-trip gap so chat history and Trabalhos
  // assignments survive backup/export.
  'chat_messages',
  'assignments',
  // v7 (app V8): mood history, calendar events and savings goals.
  'mood_logs',
  'events',
  'metas',
  // v8 (app V9): agent multi-conversation support.
  'chat_conversations'
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/** sessionStorage keys we include in the backup.  Add keys here as the
 *  app starts using sessionStorage. */
export const BACKUP_SESSION_KEYS = ['fat-quiz-session'] as const;

export type BackupSessionKey = (typeof BACKUP_SESSION_KEYS)[number];

/** Current backup payload version.  Increment when the schema changes.
 *  v6 adds: chat_messages + assignments in BACKUP_TABLES, optional `meta`
 *  block, and i18n-keyed typed errors.
 *  v7 (app V8) adds: mood_logs, events and metas tables.
 *  v8 (app V9) adds: chat_conversations. */
export const BACKUP_VERSION = 8 as const;

/** Minimum version that `validateSchema` will still accept. */
export const BACKUP_MIN_VERSION = 3 as const;

/** Optional metadata captured at export-time (task-051). */
export interface BackupMeta {
  appVersion: string;
  userAgent: string;
  counts: Record<string, number>;
}

/** JSON-safe representation of a Blob/File stored inside Dexie rows. */
interface SerializedBlob {
  __presuntinhoBlob: true;
  type: string;
  name?: string;
  data: string;
}

/**
 * Backup payload (current version 6).
 *
 *   - `dexie` is keyed by the table name; missing tables are tolerated
 *     by the importer so legacy payloads round-trip cleanly.
 *   - `meta` was introduced in v6 — older payloads omit it, the
 *     importer falls back to deriving counts on demand.
 */
export interface BackupPayload {
  version: number;
  exportedAt: string;        // ISO-8601
  profile: ProfileId;
  dexie: Partial<Record<BackupTable, unknown[]>>;
  localStorage: Record<string, string>;
  sessionStorage: Partial<Record<BackupSessionKey, string>>;
  meta?: BackupMeta;
}

/** Stable error code → i18n key suffix.  The UI surfaces the human
 *  message via `t(\`settings.backup.errors.${code}\`)`. */
export type BackupErrorCode =
  | 'parse_failed'      // JSON.parse threw
  | 'shape_invalid'     // validateSchema rejected it
  | 'too_old'           // version < BACKUP_MIN_VERSION
  | 'unsupported_version'// version > BACKUP_VERSION (forward-compat)
  | 'empty_payload'     // dexie + storage are both empty
  | 'browser_only'      // called in SSR
  | 'file_missing'      // file input had no file
  | 'read_failed'       // FileReader / text() rejected
  | 'import_failed';    // Dexie transaction aborted

/** Typed error.  Use `err.code` for the i18n key; the `message` is a
 *  English fallback suitable for logs only — never display directly. */
export class BackupError extends Error {
  public readonly code: BackupErrorCode;
  public readonly cause?: unknown;
  constructor(code: BackupErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
    this.cause = cause;
  }
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  /** When !ok, a stable i18n key fragment identifying the cause. */
  code?: BackupErrorCode;
}

/** Per-table counts returned from `importBackup` so the UI can say
 *  "X transações importadas, Y substituídas". */
export interface ImportReport {
  mode: 'merge' | 'replace';
  inserted: Record<string, number>;   // new rows added per table
  replaced: Record<string, number>;   // existing rows overwritten per table
  skipped: Record<string, number>;    // rows ignored (missing PK)
  totals: { inserted: number; replaced: number; skipped: number };
  localStorageKeys: number;
  sessionStorageKeys: number;
}

// ---------------------------------------------------------------------------
// Meta helpers
// ---------------------------------------------------------------------------

/** Read the row count of every table we know about, in parallel. */
export async function getTableCounts(
  profile: ProfileId = 'fatma'
): Promise<Record<string, number>> {
  if (!browser) return {};
  try {
    const d = db(profile);
    const entries = await Promise.all(
      BACKUP_TABLES.map(async (t) => [t, await d[t].count()] as const)
    );
    const out: Record<string, number> = {};
    for (const [t, n] of entries) out[t] = n;
    return out;
  } catch {
    // Closed DB, etc. — counts stay empty; not fatal.
    return {};
  }
}

function captureMeta(counts: Record<string, number>): BackupMeta {
  return {
    appVersion: VERSION,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'ssr',
    counts
  };
}

// ---------------------------------------------------------------------------
// Export (task-051 brief)
// ---------------------------------------------------------------------------

/**
 * Snapshot every Dexie table + every `localStorage` entry + the known
 * `sessionStorage` keys into a `BackupPayload`.  This function never
 * touches the page — it just returns the object so callers can do
 * whatever they want with it (download, upload to Drive, etc.).
 *
 * Safe to call during SSR: returns an empty payload (no Dexie, no
 * storage).  Browser-only callers always go through the real path.
 *
 * The `meta.counts` block is filled in here so consumers can show
 * "X rows exported per table" without re-opening Dexie.
 */
export async function exportAllData(profile: ProfileId = 'fatma'): Promise<BackupPayload> {
  return exportData(profile);
}

/**
 * Build a `BackupPayload` AND trigger a browser file download in one
 * call.  Equivalent to `exportAllData()` → `payloadToBlob()` →
 * anchor click.  Filename is `presuntinho-backup-YYYY-MM-DD.json`.
 *
 * Returns the payload so callers can chain (e.g. upload to Drive).
 * Throws `BackupError` (`code: 'browser_only'`) outside the browser.
 */
export async function downloadBackup(
  profile: ProfileId = 'fatma'
): Promise<BackupPayload> {
  if (!browser) {
    throw new BackupError(
      'browser_only',
      'downloadBackup() may only run in the browser'
    );
  }
  const payload = await exportAllData(profile);
  triggerDownload(payload, suggestedFilename());
  return payload;
}

/** Anchor-click download — shared between `downloadBackup()` and the
 *  `definicoes` "Exportar tudo" button. */
function triggerDownload(payload: BackupPayload, filename: string): void {
  if (typeof document === 'undefined') return;
  const blob = payloadToBlob(payload);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Snapshot every Dexie table + every `localStorage` entry + the known
 * `sessionStorage` keys into a `BackupPayload`.
 *
 * Alias kept for the existing /definicoes page.  Internally identical
 * to `exportAllData`.
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
  let counts: Record<string, number> = {};
  try {
    const d = db(profile);
    const rows = await Promise.all(
      BACKUP_TABLES.map(async (t) => [t, await serializeRows(await d[t].toArray())] as const)
    );
    for (const [t, arr] of rows) {
      payload.dexie[t] = arr;
      counts[t] = arr.length;
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

  // 4. Meta block (task-051).
  payload.meta = captureMeta(counts);

  return payload;
}

/**
 * Convenience: turn the payload into a `Blob` ready for download.
 * Pretty-printed with 2-space indent so the file is diff-friendly.
 */
export function payloadToBlob(payload: BackupPayload): Blob {
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

async function serializeRows(rows: unknown[]): Promise<unknown[]> {
  return Promise.all(rows.map((row) => serializeValue(row)));
}

async function serializeValue(value: unknown): Promise<unknown> {
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    const data = await blobToBase64(value);
    const fileName = typeof File !== 'undefined' && value instanceof File ? value.name : undefined;
    const out: SerializedBlob = { __presuntinhoBlob: true, type: value.type || 'application/octet-stream', data };
    if (fileName) out.name = fileName;
    return out;
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => serializeValue(item)));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = await serializeValue(v);
    }
    return out;
  }
  return value;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('failed to read blob'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

function deserializeRows(rows: unknown[]): unknown[] {
  return rows.map((row) => deserializeValue(row));
}

function deserializeValue(value: unknown): unknown {
  if (isSerializedBlob(value)) {
    return base64ToBlob(value.data, value.type);
  }
  if (Array.isArray(value)) {
    return value.map((item) => deserializeValue(item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deserializeValue(v);
    }
    return out;
  }
  return value;
}

function isSerializedBlob(value: unknown): value is SerializedBlob {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as SerializedBlob).__presuntinhoBlob === true &&
    typeof (value as SerializedBlob).data === 'string'
  );
}

function base64ToBlob(data: string, type: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
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
// Validation (task-051 brief)
// ---------------------------------------------------------------------------

/**
 * Cheap structural check.  We do NOT deep-validate every row — Dexie
 * will reject malformed rows when we `bulkPut` them, and that's a
 * better error surface than 200 lines of JSON-schema noise.
 *
 * Returns `{ ok: true }` on success, or `{ ok: false, reason, code }`
 * with both a human-readable string and a stable i18n key fragment.
 */
export function validateBackup(payload: unknown): ValidationResult {
  return validateSchema(payload);
}

/**
 * Alias kept for the existing /definicoes page.
 */
export function validateSchema(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return {
      ok: false,
      code: 'shape_invalid',
      reason: 'not a JSON object'
    };
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.version !== 'number') {
    return {
      ok: false,
      code: 'shape_invalid',
      reason: 'missing `version` field'
    };
  }
  if (obj.version < BACKUP_MIN_VERSION) {
    return {
      ok: false,
      code: 'too_old',
      reason: `unsupported version ${obj.version} (need >= ${BACKUP_MIN_VERSION})`
    };
  }
  if (obj.version > BACKUP_VERSION) {
    return {
      ok: false,
      code: 'unsupported_version',
      reason: `backup version ${obj.version} is newer than this app supports (${BACKUP_VERSION})`
    };
  }
  if (obj.dexie !== undefined && (typeof obj.dexie !== 'object' || obj.dexie === null)) {
    return {
      ok: false,
      code: 'shape_invalid',
      reason: '`dexie` must be an object'
    };
  }
  if (obj.localStorage !== undefined && (typeof obj.localStorage !== 'object' || obj.localStorage === null)) {
    return {
      ok: false,
      code: 'shape_invalid',
      reason: '`localStorage` must be an object'
    };
  }
  if (obj.sessionStorage !== undefined && (typeof obj.sessionStorage !== 'object' || obj.sessionStorage === null)) {
    return {
      ok: false,
      code: 'shape_invalid',
      reason: '`sessionStorage` must be an object'
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Import (task-051 brief)
// ---------------------------------------------------------------------------

/**
 * End-to-end import: read a `File`, validate, decide between merge
 * and replace based on `mode`, return an `ImportReport` describing
 * what happened.
 *
 *   - `mode: 'replace'`  → every Dexie table listed in `BACKUP_TABLES`
 *                          is cleared before being repopulated; same
 *                          semantics as Definições → Limpar dados +
 *                          restore from backup.  `localStorage` and
 *                          `sessionStorage` are also replaced wholesale.
 *   - `mode: 'merge'`    → every row is `bulkPut` on top of the live
 *                          state.  Rows whose primary key matches an
 *                          existing row replace it (counted under
 *                          `replaced`); rows with a fresh PK are
 *                          `inserted`; rows without a usable PK are
 *                          `skipped` (Dexie would also silently
 *                          autogen one, but reporting the skip keeps
 *                          the contract honest).
 *
 * The function does NOT reload the page — that's the caller's
 * responsibility so the UI can show the ImportReport first.
 *
 * Throws `BackupError` on every error path.  `err.code` is always set.
 */
export async function importBackup(
  file: File,
  mode: 'merge' | 'replace' = 'replace',
  profile: ProfileId = 'fatma'
): Promise<ImportReport> {
  if (!browser) {
    throw new BackupError('browser_only', 'importBackup() may only run in the browser');
  }
  if (!file) {
    throw new BackupError('file_missing', 'no file provided to importBackup()');
  }

  // 1. Read text + parse.
  let text: string;
  try {
    text = await file.text();
  } catch (e) {
    throw new BackupError('read_failed', 'failed to read File as text', e);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new BackupError('parse_failed', 'failed to JSON.parse the backup file', e);
  }

  // 2. Validate shape.
  const v = validateBackup(parsed);
  if (!v.ok) {
    throw new BackupError(v.code ?? 'shape_invalid', v.reason ?? 'invalid backup payload');
  }
  const payload = parsed as BackupPayload;

  // 3. Sanity: refuse completely-empty payloads — those are usually
  //    empty {} or a stray export-of-an-empty-DB; importing would
  //    wipe the user's data for nothing.
  const hasDexie = Object.values(payload.dexie ?? {}).some(
    (rows) => Array.isArray(rows) && rows.length > 0
  );
  const hasStorage =
    Object.keys(payload.localStorage ?? {}).length > 0 ||
    Object.keys(payload.sessionStorage ?? {}).length > 0;
  if (!hasDexie && !hasStorage) {
    throw new BackupError(
      'empty_payload',
      'backup file contains no rows or storage keys — refusing to wipe live data'
    );
  }

  // 4. Apply to live DB.
  try {
    return await applyPayload(payload, mode, profile);
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError('import_failed', 'failed to apply payload to Dexie', e);
  }
}

/** Lower-level: apply a validated payload.  Returned counts are based
 *  on the payload's own rows, since Dexie does not surface
 *  "this row replaced an existing one" in `bulkPut` — every put is
 *  always counted as a write. */
async function applyPayload(
  payload: BackupPayload,
  mode: 'merge' | 'replace',
  profile: ProfileId
): Promise<ImportReport> {
  const d = db(profile);

  const inserted: Record<string, number> = {};
  const replaced: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const dexieTables = payload.dexie ?? {};
  let totalInserted = 0;
  let totalReplaced = 0;
  let totalSkipped = 0;

  await d.transaction(
    'rw',
    BACKUP_TABLES.map((table) => d[table]),
    async () => {
      for (const table of BACKUP_TABLES) {
        const arr = dexieTableToArray(dexieTables[table]);

        inserted[table] = 0;
        replaced[table] = 0;
        skipped[table] = 0;

        // Replace means “substituir tudo”: every known table is cleared even
        // when an older backup omitted that table. Without this, importing a
        // v3-v5 backup left v6/v7 data mixed into the restored profile.
        if (mode === 'replace') {
          // @ts-ignore — table typings are unions; trust the JSON contract.
          await d[table].clear();
        }

        if (!arr || arr.length === 0) continue;

        // Split rows by whether they declare a usable PK. Anything missing
        // its PK would be silently auto-assigned by Dexie — report it.
        const withPk: unknown[] = [];
        let skippedCount = 0;
        for (const row of deserializeRows(arr)) {
          if (row && typeof row === 'object' && hasPrimaryKey(row as Record<string, unknown>, table)) {
            withPk.push(row);
          } else {
            skippedCount++;
          }
        }

        if (mode === 'merge') {
          const pks = withPk
            .map((r) => (r as Record<string, unknown>).id)
            .filter((v): v is string | number => v !== undefined);
          let existing = 0;
          if (pks.length > 0) {
            try {
              // @ts-ignore
              existing = await d[table].where('id').anyOf(pks).count();
            } catch {
              existing = 0;
            }
          }
          replaced[table] = existing;
          inserted[table] = withPk.length - existing;
        } else {
          inserted[table] = withPk.length;
          replaced[table] = 0;
        }
        skipped[table] = skippedCount;

        if (withPk.length > 0) {
          // @ts-ignore — table typings are unions; trust the JSON contract.
          await d[table].bulkPut(withPk);
        }

        totalInserted += inserted[table];
        totalReplaced += replaced[table];
        totalSkipped += skipped[table];
      }
    }
  );

  // 5. localStorage — wipe wholesale in replace, merge in merge.
  let lsKeys = 0;
  try {
    const ls = window.localStorage;
    if (mode === 'replace') {
      for (let i = ls.length - 1; i >= 0; i--) {
        const k = ls.key(i);
        if (k !== null) ls.removeItem(k);
      }
    }
    for (const [k, val] of Object.entries(payload.localStorage ?? {})) {
      if (typeof val === 'string') {
        ls.setItem(k, val);
        lsKeys++;
      }
    }
  } catch (e) {
    console.warn('[backup] localStorage restore failed', e);
  }

  // 6. sessionStorage — only the whitelisted keys.
  let ssKeys = 0;
  try {
    const ss = window.sessionStorage;
    if (mode === 'replace') {
      for (const k of BACKUP_SESSION_KEYS) ss.removeItem(k);
    }
    for (const [k, val] of Object.entries(payload.sessionStorage ?? {})) {
      if (
        typeof val === 'string' &&
        (BACKUP_SESSION_KEYS as readonly string[]).includes(k)
      ) {
        ss.setItem(k, val);
        ssKeys++;
      }
    }
  } catch (e) {
    console.warn('[backup] sessionStorage restore failed', e);
  }

  // 7. Restore defaults if the singleton rows were wiped.  Idempotent.
  try {
    await ensureDefaults(profile);
  } catch {
    // already-open DB error or missing tables — non-fatal for the import.
  }

  return {
    mode,
    inserted,
    replaced,
    skipped,
    totals: { inserted: totalInserted, replaced: totalReplaced, skipped: totalSkipped },
    localStorageKeys: lsKeys,
    sessionStorageKeys: ssKeys
  };
}

/** Coerce an unknown map value into a row array.  Defensive because
 *  hand-edited JSON can give us anything. */
function dexieTableToArray(v: unknown): unknown[] | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v;
  return null;
}

/** Best-effort PK detection so we can attribute writes correctly.
 *  Returns true when the row has an `id` field that isn't `undefined`. */
function hasPrimaryKey(row: Record<string, unknown>, _table: string): boolean {
  if (!('id' in row)) return false;
  const v = row.id;
  if (v === undefined || v === null) return false;
  // Empty string is not a valid Dexie PK; treat as missing.
  if (typeof v === 'string' && v.length === 0) return false;
  return true;
}

/**
 * Apply a backup payload to the live app.  DESTRUCTIVE — every Dexie
 * table listed in `BACKUP_TABLES` is cleared before being repopulated.
 * `localStorage` and `sessionStorage` are also replaced wholesale.
 *
 * Kept as an alias of the merge-free `replace`-mode import so the
 * existing /definicoes modal keeps working.
 */
export async function importData(
  payload: BackupPayload,
  profile: ProfileId = 'fatma'
): Promise<ImportReport> {
  if (!browser) {
    throw new BackupError('browser_only', 'importData() may only run in the browser');
  }
  const v = validateBackup(payload);
  if (!v.ok) {
    throw new BackupError(v.code ?? 'shape_invalid', v.reason ?? 'invalid payload');
  }
  return applyPayload(payload, 'replace', profile);
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

/**
 * Parse a JSON string into a `BackupPayload`.  Wraps `JSON.parse` so
 * callers don't have to repeat the try/catch.  Throws `BackupError`
 * on invalid JSON or schema violations.
 */
export function parseBackup(text: string): BackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new BackupError('parse_failed', 'failed to JSON.parse the backup file', e);
  }
  const v = validateBackup(parsed);
  if (!v.ok) {
    throw new BackupError(v.code ?? 'shape_invalid', v.reason ?? 'invalid backup');
  }
  return parsed as BackupPayload;
}
