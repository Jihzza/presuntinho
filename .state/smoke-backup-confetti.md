# Smoke test — Backup/Export (gap-013) & Confetti easter-egg flow (gap-014)

- **Repo HEAD:** `584a04d` — `fix(i18n): gap-029 — 22 missing i18n keys (financas nova/transacoes/editar + habitos)`
- **Working tree:** clean (verified `git status --short` → empty)
- **Production URL:** https://presuntinho.netlify.app/
- **Browser smoke:** splash route `/splash/` loaded in browser; **0 console errors, 0 JS errors**. Auth gate is enforced (radio Fatma/Daniel + password form), so post-auth flows were not live-fired — verification is by static audit per task brief ("DO NOT try to brute-force the password").
- **Date:** 2026-06-28

---

## TL;DR

| Area | Status |
|---|---|
| **Backup / Export** | 🟢 **GREEN** — end-to-end solid (export + validate + import + Blob download). No tests exist; recommendation below. |
| **Confetti easter-egg flow** | 🟢 **GREEN** — all 5 trigger entry points correctly wired through `fireConfettiEvent` → window CustomEvent → `Confetti.svelte`. Layer mounted at `src/routes/+layout.svelte:139`. Reduced-motion respected at two layers (CSS + JS). |

---

## PART A — Backup / Export (gap-013)

### Entry point found

- **Module:** `src/lib/backup.ts` (293 lines, comprehensive)
- **UI consumer:** `src/routes/definicoes/+page.svelte` lines **25-31** (imports), **214-233** (`exportData()` button handler), **420-423** (the actual `<button onclick={exportData}>` in the **Data** card).
- **Import path:** same page, lines **258-316** (file → parse → modal confirm → `importData` → reload).

### Verifying the export payload shape (`src/lib/backup.ts`)

| Requirement | Status | Evidence |
|---|---|---|
| `exportData(profile)` returns JSON payload | ✅ | lines **101-154** — builds `{version, exportedAt, profile, dexie, localStorage, sessionStorage}` |
| `version` constant | ✅ | line **69**: `BACKUP_VERSION = 5 as const`, `BACKUP_MIN_VERSION = 3` (lines 72) → `validateSchema` accepts v3+ for legacy support |
| Includes **transactions** | ✅ | table `transacoes` in `BACKUP_TABLES` line **51** |
| Includes **habits** | ✅ | `habitos` + `habit_logs` lines **54-55** |
| Includes **bookmarks / biblioteca** | ✅ | `biblioteca` line **56** |
| Includes **XP** | ✅ | `state` table line **45** (XP rows live in `state`) |
| Includes **completed courses / visited** | ✅ | `visited` line **48**, `notes` line **57** |
| Includes **quiz scores** | ✅ | `quizScores` line **49** |
| Includes **badges** | ✅ | `badges` line **47** |
| Includes **secrets / easter egg state** | ✅ | `secrets` line **50** |
| Includes **settings + budgets + categories** | ✅ | `settings`, `orcamentos`, `categorias` lines **46, 52-53** |
| localStorage copy | ✅ | lines **129-139** — copies every key verbatim |
| sessionStorage (whitelisted) | ✅ | lines **143-151** — only `fat-quiz-session` per `BACKUP_SESSION_KEYS` (line 64) |
| Profile isolation | ✅ | only the active profile's Dexie is touched (line 115 `db(profile)`) |

### Verifying the download mechanism (`src/routes/definicoes/+page.svelte:214-233`)

```ts
async function exportData(): Promise<void> {
  if (exporting) return;          // re-entrancy guard
  exporting = true;
  try {
    const payload = await backupExport();         // from $lib/backup
    const blob = payloadToBlob(payload);          // Blob, mime application/json
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedFilename();             // presuntinho-backup-YYYY-MM-DD.json
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);                     // cleanup
  } catch (e) {
    console.error('[definicoes] export failed', e);
  } finally {
    exporting = false;
  }
}
```

- ✅ **Blob** (line 219) — `payloadToBlob` at `backup.ts:160` uses `new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })` — MIME `application/json`, pretty-printed (2-space indent for diff-friendliness).
- ✅ **URL.createObjectURL** (line 220)
- ✅ **Anchor `.click()`** (line 225) with appended-to-body + removed after click.
- ✅ **URL.revokeObjectURL** (line 227) — no memory leak.
- ✅ **File name**: `suggestedFilename()` (`backup.ts:168`) → `presuntinho-backup-YYYY-MM-DD.json`.
- ✅ **Error handling**: caught + logged; user is shown the button re-enabled via `exporting=false` in `finally`.

### Import path — also wired end-to-end

- **File picker** (line 425 button → hidden `<input type="file" accept="application/json,.json">` at lines 429-435).
- **Parse + validate** (`onFileSelected`, lines 258-282) — `parseBackup` calls `validateSchema`; schema violations surface in the UI hint.
- **Confirmation modal** (lines 245-256 + 284-289) — `pendingPayload` stashed in memory between file-select and confirm.
- **Destructive apply** (`confirmImport`, lines 291-316) — clears Dexie tables + localStorage, restores whitelisted sessionStorage keys, then `setTimeout(location.reload, 600)` so stores rehydrate.
- `validateSchema` (`backup.ts:185-206`) rejects non-objects, missing/non-number version, version < 3, and non-object `dexie`/`localStorage`/`sessionStorage`.

### Tests — gap

- ❌ **No tests exist** for `src/lib/backup.ts` (or anywhere in the repo).
- Search: `find . -type f \( -name "*.test.ts" -o -name "*.spec.ts" \) -not -path "*/node_modules/*"` → **0 files**.
- `package.json` declares `"test": "vitest run --passWithNoTests"` and `"test:e2e": "playwright test"` — both pass through silently today.
- Ran `npx vitest run -t export` → exit code 1, `No test files found`. This is **not a code bug**; the feature is unverified by CI. Recommendation (non-blocking, separate ticket): add `src/lib/backup.test.ts` covering `validateSchema` matrix + a round-trip `exportData → payloadToBlob → parseBackup → importData` against a stub Dexie.

### Browser smoke

- Splash route loads, no console errors. Auth-gated routes not exercised (per task brief).

### Verdict — Backup/Export: 🟢 **GREEN**

End-to-end functional and correctly wired:
- Snapshot covers every Dexie table + every localStorage key + whitelisted sessionStorage.
- Download uses Blob → ObjectURL → anchor.click → revoke; filename `presuntinho-backup-YYYY-MM-DD.json`, MIME `application/json`.
- Import is safe-by-design (file-select → schema-validate → user-confirmation modal → destructive write → reload).
- Versioned (`BACKUP_VERSION = 5`) and backward-compatible with v3.

**Caveat (yellow note, not red):** No unit/integration tests for `backup.ts`. The logic is simple enough that this is low risk, but it is the only meaningful gap.

---

## PART B — Confetti easter-egg flow (gap-014)

### Confetti component API (`src/lib/components/Confetti.svelte`)

- **Mounted globally** at `src/routes/+layout.svelte:7` (import) and **line 139** (`<Confetti />`) — only rendered when **not** on `/splash/` (splash doesn't need confetti).
- **API:** accepts `count?: number` prop (default 60) — line 8.
- **Trigger:** listens on `window` for `CONFETTI_EVENT` (`'presuntinho:confetti'` from `src/lib/components/events.ts:4`) — lines 33-40.
- **Self-cleanup:** each particle removed via `setTimeout(() => piece.remove(), 4500)` (line 29); listener removed in onMount return (line 39).
- **Z-index:** `z-index: 9999` (line 50) with `pointer-events: none` (49) → always on top, never blocks clicks.
- **Reduced-motion:**
  - JS guard: `prefersReducedMotion()` short-circuits in `fireConfettiEvent` (`events.ts:25`) AND again inside `Confetti.svelte fire()` (line 18).
  - CSS guard: `@media (prefers-reduced-motion: reduce)` hides particles entirely (lines 65-70).

### Dispatch helpers (`src/lib/components/events.ts`)

- `fireConfettiEvent(count = 60)` (lines 23-27) — dispatches `CustomEvent('presuntinho:confetti', {detail: count})` on window. SSR-safe + reduced-motion guarded.
- `showToast(msg, duration?)` (lines 30-33) — paired toast channel.

### Five trigger entry points — wiring audit

| # | Trigger | Source file | Call site (line) | Confetti dispatch | Status |
|---|---|---|---|---|---|
| 1 | **Heart click** | `src/lib/easterEggs.ts:95` `heartClick()` | `src/lib/components/HeartButton.svelte:18, 27` (call), `src/routes/+layout.svelte:230` (mount) | tier match: `fireConfettiEvent(tier.conf)` line **134**; mini every 10 past 100: `fireConfettiEvent(8)` line **147** | 🟢 **FIRING** — wired via `HeartButton.svelte` onclick → `heartClick()` |
| 2 | **Logo (🐷) click** | `src/lib/easterEggs.ts:176` `logoClick()` | `src/routes/+layout.svelte:13` import, line **160** onclick (`onclick={() => logoClick()}` on `.logo-pig` button) | `fireConfettiEvent()` at line **193** (3-click), `line 312` (fatma keyword, indirect) | 🟢 **FIRING** — wired via layout logo button |
| 3 | **Mascot (🧴) click** | `src/lib/easterEggs.ts:227` `mascotClick()` | `src/lib/components/Mascot.svelte:15, 37` (call) | **No confetti dispatch** — mascot shows a toast + 5 XP only (lines 228-230). This is **by design** (V3 parity). | 🟢 **FIRING-INTENTIONAL** — mascot is a *tip* easter egg, not a confetti one. Not a bug. |
| 4 | **Konami code (↑↑↓↓←→←→BA)** | `src/lib/easterEggs.ts:243` `handleKonamiKey(key, keyCode)` | `src/routes/+layout.svelte:13` import, line **111** (`onkey` handler) — global keydown listener (line 113) | `fireConfettiEvent()` at line **259** on full match | 🟢 **FIRING** — global window keydown → handler |
| 5 | **Keyword (`perfume` / `behi` / `help` / `fatma`)** | `src/lib/easterEggs.ts:283` `handleKeywordKey(key)` | Same global keydown (line 111), which calls `handleKeywordKey` at line **266** when `key.length === 1` | `perfume`: line **295** • `behi`: line **302** • `fatma`: `fireConfettiEvent(70)` line **312** • `help`: toast-only (line 306) | 🟢 **FIRING** — same global handler |
| 5b | **Quiz submission** (bonus — asked for in brief) | `src/lib/easterEggs.ts:356` `recordQuizSubmission(quizId, correct, total, answeredIndices)` | `src/lib/components/QuizRunner.svelte:3` import, line **60** (called in `submit()`) | `perfect + ptq` (Lusófono): `fireConfettiEvent(80)` line **375**; `perfect other`: `fireConfettiEvent(60)` line **378**; `score ≥ 70`: `fireConfettiEvent(30)` line **381** | 🟢 **FIRING** — quiz submit wired via QuizRunner → `recordQuizSubmission` → confetti |

### Cross-checks — things that could break the chain (none found)

- **Missing import?** All five trigger functions correctly import `fireConfettiEvent` from `$lib/components/events` (`src/lib/easterEggs.ts:39`). Confetti component imports `CONFETTI_EVENT` and `prefersReducedMotion` from the same module (`Confetti.svelte:3`). ✅
- **Conditional that prevents firing?** No silent `return` between the trigger check and `fireConfettiEvent`. The only blockers are:
  - `prefersReducedMotion()` (intentional a11y).
  - `easterEggs.ts:177-180` — if `sroomOpened`, logoClicks show a toast and `return` — by design (secret-room already found).
- **Z-index issues?** `Confetti.svelte` uses `z-index: 9999` (line 50), well above modals (~100+). No stacking-context traps because the layer is `position: fixed` and the parent layout doesn't create a stacking context above it.
- **Reduced-motion respect?** **Yes, two layers** — JS short-circuit in `fireConfettiEvent` (`events.ts:25`) and `Confetti.fire` (`Confetti.svelte:18`); CSS `@media (prefers-reduced-motion: reduce)` hides pieces (`Confetti.svelte:65-70`). Heart pulse (`HeartButton.svelte`) and mascot FAB also have reduced-motion media queries.
- **Layout mounts Confetti?** Only when **not** on `/splash/` — `src/routes/+layout.svelte:136-139` shows a conditional `{@render children?.()}` for splash, else the full shell (with `<Confetti />`). Splash route doesn't need confetti (no quizzes, no triggers), so this is correct.

### Browser smoke

- Splash loaded (auth-gated), 0 console errors, 0 JS errors. Post-auth triggers not live-fired (cannot bypass auth per brief), but the static audit shows every trigger dispatches `presuntinho:confetti` and the listener is registered at app boot in `+layout.svelte`.

### Verdict — Confetti easter-egg flow: 🟢 **GREEN**

Every entry point dispatches `presuntinho:confetti` via `fireConfettiEvent`. The `Confetti.svelte` listener is mounted once in `+layout.svelte:139`, has `z-index: 9999`, `pointer-events: none`, self-cleans particles, and respects `prefers-reduced-motion` at both JS and CSS layers. Mascot click intentionally does not fire confetti (V3 parity — mascot is a tip channel, not a celebration one).

---

## Recommendations (non-blocking)

1. **Add `src/lib/backup.test.ts`** covering `validateSchema` (good/bad inputs), `suggestedFilename` date format, and an end-to-end Dexie round-trip (export → Blob → parse → import → row count parity). Vitest is already wired (`vitest run --passWithNoTests`) — no new tooling needed.
2. **Optional UX**: in `definicoes/+page.svelte:228-231`, the export error toast is `console.error`-only — consider surfacing a user-visible toast (the import path already does this at lines 273-277). Low severity.
3. **Optional UX**: the `mascotClick` is the only trigger with no confetti — if the team wants parity with the other 4, add a small `fireConfettiEvent(8)` after the toast. This is **design intent**, not a bug.

## File references (single source of truth)

- `src/lib/backup.ts` (293 lines) — export, validation, import
- `src/routes/definicoes/+page.svelte` lines 25-31, 210-316, 419-441 — UI wiring
- `src/lib/components/Confetti.svelte` (70 lines) — listener + DOM
- `src/lib/components/events.ts` (32 lines) — dispatch + reduced-motion helper
- `src/lib/easterEggs.ts` (384 lines) — all 5 trigger handlers + quiz bridge
- `src/routes/+layout.svelte` lines 7, 13, 111, 139, 160, 213, 230 — global mounts + handlers
- `src/lib/components/HeartButton.svelte` lines 18, 27
- `src/lib/components/Mascot.svelte` lines 15, 37
- `src/lib/components/QuizRunner.svelte` lines 3, 60
- `src/routes/escola/curso/portugues/quiz/+page.svelte` lines 15, 89
- `static/config/easterEggs.json` — config-driven easter egg metadata (read by `easterEggsConfig.ts`)