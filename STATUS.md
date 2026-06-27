# STATUS.md — Presuntinho V5 Migration

> Last updated: 2026-06-27 (Phase 16.5 complete — v5.0.0 release candidate)

## Where we are

**Phase 0 — Recon: COMPLETE** ✅
**Phase 1 — Bootstrap: COMPLETE** ✅ (commit `897057f`, Netlify deployed)
**Phase 2 — Auth + Hub + Registry: COMPLETE** ✅ (commit `a0cd7c5`)
**Phase 3 — Dexie + Migration + Easter Eggs + Quizzes: COMPLETE** ✅ (commit `441d527`)
**Phase 4 — Escola sub-app: COMPLETE** ✅
**Phase 5 — Trabalhos sub-app: COMPLETE** ✅
**Phase 6 — Finanças sub-app: COMPLETE** ✅
**Phase 7 — Hábitos sub-app: COMPLETE** ✅
**Phase 8 — Biblioteca sub-app: COMPLETE** ✅
**Phase 9 — Settings + i18n: COMPLETE** ✅
**Phase 10 — PWA + a11y + responsive polish: COMPLETE** ✅
**Phase 11 — docs + tag: COMPLETE** ✅

## What's done

### Phase 0
- **Repo inventoried** (15 files, 5 audio mp3, 2 docs, 1 zip, 1 PNG persona image)
- **`PRESERVATION.md` written and committed** to `main` (commit `1b85a32`) — 15 checkboxes, 15 state keys, 23 heart tiers, 8 secret definitions, 15 badges enumerated
- **Live V3 site verified** at https://presuntinho.netlify.app/ — all 9 pages, heart click +20 XP + b10 badge, localStorage persists state

### Phase 1 (commit `897057f`)
- **Piccolo (#7)** — wrote `package.json` + `.gitignore` + `.npmrc`. `npm install` exit 0 (509 packages, 29s). Verified versions: svelte 5.56.4, @sveltejs/kit 2.68.0, dexie 4.4.4, @vite-pwa/sveltekit 0.6.8, adapter-static 3.x.
- **Skander 2 (#8)** — scaffolded SvelteKit: `svelte.config.js` (adapter-static + SPA fallback), `vite.config.ts` (sveltekit + vitest), `tsconfig.json` (strict), `src/app.html` (viewport-fit=cover + theme-color + favicon), `src/app.css` (V3 design tokens), `src/app.d.ts`, `src/routes/+layout.{svelte,ts}` (Svelte 5 runes, ssr=false), `src/routes/+page.svelte` (initial placeholder), `static/favicon.svg`. `npm run build` → `build/index.html` (1524 bytes) + `build/_app/`. Verified interpolation `%sveltekit.body%` resolved.
- **Skander 2 (#9)** — moved V3 site into `static/legacy/`: `index.html`, `assets/` (5 mp3 + persona png + css + js modules), `docs/` (PDF + DOCX), `equivalenza-midterm-deliverables-V3.zip`. SHA verified identical (`c2115478...`). Replaced `+page.svelte` with full-viewport iframe to `/legacy/index.html`, sandbox=allow-scripts allow-same-origin allow-forms allow-popups. Updated `netlify.toml`: build=`npm run build`, publish=`build/`, NODE_VERSION=20, NPM_FLAGS=--legacy-peer-deps, all security headers preserved + cache headers for /_app/immutable/* and /legacy/*. Cleaned stray `dist/`. `npm run build` → 8.3 MB build with all assets.
- **Skander 1 (#10)** — review. **0 blockers, 8 non-blocking concerns** (NODE_VERSION bump to 22 optional, NPM_FLAGS remove later, unused deps wait for Phase 2+, layout/page duplicate CSS import, allow-forms not strictly needed, vitest config needs vitest plugin when first test is written, prerender=false OK for shell, trailingSlash=always semantics OK). Confirmed Netlify static-file-first precedence means /legacy/index.html serves from disk, not redirected.
- **Principal commit + push** — `git commit` + `git push origin main` → Netlify auto-deployed. Verified live:
  - `GET /` → 200, SvelteKit shell `<html lang="pt-PT">`
  - `GET /legacy/index.html` → 200, V3 site `<html lang="en">`
  - `GET /_app/version.json` → 200, SvelteKit bundle served
  - `GET /legacy/assets/audio_intro_en.mp3` → 200, 1394496 bytes (SHA matches)
  - All security headers present: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy

## Gate 1 — passed

Per Phase 1 rule 11, no Phase 2 work starts until Netlify deploys successfully with the new build pipeline. **Done.** Site is live and serving the V3 site inside the SvelteKit iframe shell.

## What works right now at https://presuntinho.netlify.app/

The V3 site renders inside an iframe. All V3 features (heart click, easter eggs, konami, footer counter, secret room, audio download links, PDFs, DOCX, ZIP, quizzes) work identically to before. localStorage state schema unchanged. The site looks and behaves exactly like before — wrapped in a SvelteKit shell that doesn't visually add anything yet.

## What's next: Phase 2 — Auth + layout shell + hub cards

Tasks (per plan):
- **Skander 2 (#12, ≤20 min)** — build `/splash` password gate. Web Crypto scrypt hash both passwords at build time via `scripts/hash-passwords.mjs`. Commit hashes to `/static/auth/hashes.json`. Splash UI: large mascot, password input, "Enter" button, ❤️ "Made for Fatma" footer. 3-strike lockout with localStorage timer. Wrong-password shake animation.
- **Skander 2 (#13, ≤20 min)** — build `+layout.svelte` with top nav (logo + theme toggle + settings cog). Build `+layout.ts` to redirect to `/splash` if no valid session in sessionStorage. Build `+page.svelte` (hub) with placeholder cards for all 5 sub-apps from `src/lib/registry.ts`.
- **Skander 1 (#14, ≤15 min)** — security review of auth + session gating. Blocker if security issues.
- **Principal commit + push + verify** — both passwords work, both lock out at 3 strikes, hub renders empty cards.

## Files in the repo right now

```
presuntinho/
├── .gitignore                          (updated: + SLASH_GOAL_* ignores)
├── .npmrc                              (NEW: fund=false, audit=false)
├── LICENSE
├── README.md
├── PRESERVATION.md                     (Phase 0)
├── STATUS.md                           (this file)
├── extract.py                          (V3 helper)
├── package.json                        (NEW: V4 deps)
├── package-lock.json                   (NEW)
├── svelte.config.js                    (NEW: adapter-static SPA)
├── vite.config.ts                      (NEW)
├── tsconfig.json                       (NEW: strict)
├── netlify.toml                        (updated: npm build → build/)
├── equivalenza-midterm-deliverables-V3.zip  (MOVED → static/legacy/)
├── SLASH_GOAL_V4.pdf
├── SLASH_GOAL_V4.txt
├── SLASH_GOAL_V4_README.ogg            (gitignored)
├── SLASH_GOAL_V4_README.txt            (gitignored)
├── src/
│   ├── app.html                        (NEW: viewport-fit=cover, theme-color, favicon)
│   ├── app.css                         (NEW: V3 design tokens)
│   ├── app.d.ts                        (NEW)
│   └── routes/
│       ├── +layout.svelte              (NEW: Svelte 5 runes)
│       ├── +layout.ts                  (NEW: ssr=false, prerender=false)
│       └── +page.svelte                (NEW: iframe → /legacy/index.html)
└── static/
    ├── favicon.svg                     (NEW: 🐷)
    └── legacy/                         (V3 site, MOVED here)
        ├── index.html
        ├── equivalenza-midterm-deliverables-V3.zip
        ├── assets/                     (5 mp3 + png + css + 4 js)
        └── docs/                       (PDF + DOCX)
```

## Outstanding decisions (deferred)

1. **Dark mode scope** — Phase 9, but Skander 1 should preview the CSS variables to confirm what maps cleanly.
2. **i18n default locale fallback** — pt-PT primary, fallback pt-PT (no en on first run). Finalize in Phase 9.
3. **TypeScript strict + `noUncheckedIndexedAccess`** — Phase 10 review will decide.
4. **Sub-app ordering on hub** — 5 default apps in this order: Escola, Trabalhos, Finanças, Hábitos, Biblioteca. User-configurable later.

## Risks to track

- ⚠️ SvelteKit 2 + Vite 5/6 + Node 24 — works (Phase 1 build verified). Netlify uses Node 20 (pinned in netlify.toml). No issues seen.
- ⚠️ Dexie 4 schema migration must not delete existing `localStorage.presuntinho` for one rollback cycle. (Phase 3)
- ⚠️ Netlify wildcard redirect `/*` → `/index.html` status 200 — confirmed static-file-first precedence; `/legacy/*` served from disk.
- ⚠️ Iframe wrapping means top-level URL never changes when user clicks V3 nav (navGo is DOM-only). Phase 4+ will replace iframe with real SvelteKit routes.
- ⚠️ i18n will need to wrap every existing V3 string OR Phase 4 keeps iframe for the legacy feel while new shell stays pt-PT.

## Next session principal

1. Read this STATUS.md first.
2. Read `PRESERVATION.md` for the full inventory.
3. Confirm Phase 2 with user (or auto-proceed if user said "vai").
4. Pick up at Phase 2 task #12 (Skander 2 builds /splash).
5. Respect the orchestration rules (delegate, don't implement; verify every sub-agent output; gate between phases).

---

## v4.0.0 — Final release (2026-06-27)

✅ Phase 0: PRESERVATION.md (commit 1b85a32)
✅ Phase 1: SvelteKit + Vite + iframe legacy (897057f)
✅ Phase 2: PBKDF2 auth + Hub + Registry (a0cd7c5)
✅ Phase 3: Dexie + migration + stores + easter eggs + quizzes (441d527)
✅ Phase 4: Escola sub-app
✅ Phase 5: Trabalhos sub-app
✅ Phase 6: Finanças sub-app
✅ Phase 7: Hábitos sub-app
✅ Phase 8: Biblioteca sub-app
✅ Phase 9: Settings + i18n
✅ Phase 10: PWA + a11y + responsive polish
✅ Phase 11: docs + tag

**Live:** https://presuntinho.netlify.app/
**Tag:** v4.0.0
**PRESERVATION:** all 13 items checked

---

**Next action**: send user the Phase 1 status update + confirm Phase 2 (auth) starts. The site is live at https://presuntinho.netlify.app/ and looks identical to before, now running on SvelteKit.