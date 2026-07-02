# Backup module — schema versioning & destructive-delivery pattern

> Dev-facing docs for `src/lib/backup.ts`. User-facing labels live in
> `src/routes/definicoes/+page.svelte` and are i18n'd in 5 locales
> (`src/lib/i18n/*.json`).

## Scope of a "backup"

A backup captures everything the user can lose between sessions:

- **All Dexie tables** the active profile owns:
  `state, settings, badges, visited, quizScores, secrets,
   transacoes, orcamentos, categorias, habitos, habit_logs,
   biblioteca, notes, chat_messages, assignments`.
- **All `localStorage` keys** the app writes
  (theme, language, session, prefs).
- **Whitelisted `sessionStorage` keys** declared in `BACKUP_SESSION_KEYS`.

Out of scope, on purpose:

- IndexedDB of *other* profiles (each profile keeps its own DB).
- The legacy V3 `localStorage` (read-only, not part of V4+ state).

## Current shape

```ts
export const BACKUP_VERSION    = 6;
export const BACKUP_MIN_VERSION = 3;
```

`validateBackup()` accepts any payload with `version >= BACKUP_MIN_VERSION`.
Anything older is rejected with `'too_old'`; anything newer is rejected with
`'unsupported_version'` (forward-compat is forward, not backward).

## Version history (commit-by-commit)

| Version | Commit    | Change |
| ------- | --------- | ------ |
| 1       | (legacy, pre-export helpers) | flat export, no schema header |
| 3       | `559066d` feat(backup): export/import user data as JSON | adds `version`, `exportedAt`, typed `BackupPayload`; sets baseline accept-anywhere `>= 3` |
| 4       | (no bump)        | merged into v3 line via optional fields (counts, sessionStorage) |
| 5       | (no bump)        | merged into v3 line via optional fields (meta.appVersion, userAgent) |
| 6       | `c733a8a` feat(settings): harden backup import export | exposes `exportAllData / downloadBackup / importBackup / validateBackup`; adds `BackupMeta`, `BackupError`, typed `ImportReport` |
| 6       | `9ef01d0` fix(settings): harden backup restore semantics | replace-mode now runs as a single Dexie transaction across all `BACKUP_TABLES`; UI shows per-table counts from `ImportReport`; legacy `too_old/unsupported_version/import_failed` mapping tightened |

> Note: versions 4 and 5 were additive fields under the v3 envelope — they
> did **not** bump the wire `version`. That is why `BACKUP_VERSION = 6` today
> covers everything from v3 to v6 inclusively. When you add a column that
> breaks round-trip, **bump `BACKUP_VERSION`**; when you only add an
> optional field, **don't**.

## Bump rules

1. Adding / removing / renaming a Dexie table → **bump** (importer relies
   on `BACKUP_TABLES` enumeration; a stale payload would silently lose
   data on replace).
2. Adding an optional field to `BackupPayload` that older payloads can
   leave `undefined` → **don't bump** (importer falls back to deriving
   counts on demand).
3. Removing a field that older payloads populated → **bump + add a
   migration branch in `validateBackup`**.
4. Renaming a `localStorage` / `sessionStorage` key that `BACKUP_SESSION_KEYS`
   cares about → **bump** (otherwise the import would carry stale keys
   back into a fresh install).

## Destructive-delivery pattern (replace-mode)

Replace-mode import is the most dangerous thing this module can do — it
wipes every `BACKUP_TABLE` row for the active profile before writing the
payload. Commit `9ef01d0` locked it down with four guarantees. Re-use
the same shape any time you add a new "destructive" entry-point:

| Guarantee | Where it lives | What it prevents |
| --------- | -------------- | ---------------- |
| (a) Atomic transaction | `importBackup(..., 'replace')` opens one Dexie `rw` transaction across every `BACKUP_TABLE` | partial-replace: a crash mid-import would leave the DB half-wiped. Atomic = either all or nothing. |
| (b) Pre-op backup | `downloadBackup()` exposed next to the destructive action in UI; called automatically before replace when payload < 5 MB | "I clicked replace and lost last week". Always offer the user a snapshot to roll back to. |
| (c) Post-op validation | `ImportReport` returns `{ [table]: { before, after, imported } }`; UI shows the per-table delta | silent mismatch: the user sees *exactly* what was imported (or what was already there when nothing was added). |
| (d) Recovering action copy | error messages in `BackupError` + i18n keys `backup.error.*` | users never see a raw stack trace, always see the next thing they can try (download the broken payload, restore the pre-op backup, file a bug). |

## UI integration

The user surface is **`/definicoes`**. The destructive action is gated
behind:

1. Confirm modal with the post-op warning.
2. Optional "download current state first" checkbox (default ON).
3. Final call to `importBackup(file, 'replace')`.

Merge-mode skips the wipe — additive rows only, never deletes — and is
the recommended default for first-time importers.

## Verifying after a payload change

```bash
npm run check                          # 0/0
npm run build                          # exit 0
node -e "console.log(require('./src/lib/backup.ts'))" 2>&1 | head -5  # confirm BUMP
```

For an end-to-end Playwright smoke that proves roundtrip across a fresh
DB, see **task-096** (`scripts/test-backup-roundtrip.mjs` — *not yet
written; tracked separately*).
