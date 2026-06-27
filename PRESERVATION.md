# PRESERVATION.md — Presuntinho V4 Migration Checklist

This file enumerates everything from the V3 static-HTML site that MUST survive the V4 SvelteKit rebuild. Each item has a checkbox, the V3 location, and the planned V4 location.

Status legend: [x] preserved · [ ] pending · [~] in progress · [!] needs attention

## 📂 Content / files (must remain reachable in the new app)

### Audio files (move to `/static/audio/` in SvelteKit)
- [x] `assets/audio_intro_en.mp3` (1361 KB) — English walkthrough → `static/audio/audio_intro_en.mp3`
- [x] `assets/audio_intro_pt-PT.mp3` (351 KB) — Portuguese walkthrough → `static/audio/audio_intro_pt-PT.mp3`
- [x] `assets/intro_swot.mp3` (664 KB) → `static/audio/intro_swot.mp3`
- [x] `assets/persona_problem.mp3` (858 KB) → `static/audio/persona_problem.mp3`
- [x] `assets/tows_recommendation.mp3` (782 KB) → `static/audio/tows_recommendation.mp3`

### Images
- [x] `assets/buyer-persona-template-v3.png` (the persona visual) → `static/images/buyer-persona-template-v3.png`

### Documents (`/docs/`)
- [x] `docs/Equivalenza_Mid_Term_Fatma.pdf` (166 KB) → `static/docs/Equivalenza_Mid_Term_Fatma.pdf`
- [x] `docs/Equivalenza_Mid_Term_Fatma.docx` (2303 KB) → `static/docs/Equivalenza_Mid_Term_Fatma.docx`

### ZIP
- [x] `equivalenza-midterm-deliverables-V3.zip` (1709 KB) → `static/downloads/equivalenza-midterm-deliverables-V3.zip`

### All 9 HTML pages (each becomes a route in SvelteKit)
- [x] Home (`pg-home`) → `src/routes/+page.svelte` (hub dashboard)
- [x] The Case (`pg-case`) → `src/routes/(legacy)/case/+page.svelte`
- [x] Course (`pg-course`) → `src/routes/(legacy)/course/+page.svelte`
- [x] Walkthrough (`pg-walk`) → `src/routes/(legacy)/walk/+page.svelte`
- [x] Secrets (`pg-secrets`) → `src/routes/(legacy)/secrets/+page.svelte`
- [x] Quizzes (`pg-quiz`) → `src/routes/(legacy)/quiz/+page.svelte`
- [x] Writing (`pg-write`) → `src/routes/(legacy)/write/+page.svelte`
- [x] PT (`pg-pt`) → `src/routes/(legacy)/pt/+page.svelte`
- [x] Downloads (`pg-dl`) → `src/routes/(legacy)/dl/+page.svelte`

## 🎮 Interactivity / state (must keep working)

### Easter eggs — every single one
- [x] ❤️ **Heart button** (`heartClick` in `assets/js/easter-eggs.js:33`) — 23 tiers, XP rewards, speed bonus, confetti, mascot messages → port to `src/lib/easterEggs/heart.ts` + `HeartButton.svelte`
- [x] 🐷 **Logo triple-click** (`logoClick` line 98) — 3-click confetti + 6/7/8-click secret room → port to `src/lib/easterEggs/logo.ts`
- [x] 🎮 **Konami code** (`↑↑↓↓←→←→BA` line 266) → port to `src/lib/easterEggs/keyboard.ts`
- [x] ⌨️ **Keyword detector** (`keyBuf` line 280) — `perfume`, `behi`, `help` → port to `src/lib/easterEggs/keyboard.ts`
- [x] 🧴 **Mascot click** (`mascotClick` line 131) — random pro-tips, +5 XP → port to `src/lib/easterEggs/mascot.ts`
- [x] 👣 **Footer click** (`footerClick` line 143) — 5 clicks → hint + badge → port to `src/lib/easterEggs/footer.ts`
- [x] 🚪 **Secret Room modal** (`closeSRoom` line 154) → port to `SecretModal.svelte`
- [x] 8 **secret definitions** in `SECRET_DEFS` (line 162) → port to `src/lib/data/secrets.json` + `renderSecrets()` Svelte component

### State schema (Dexie mirrors V3 localStorage shape exactly)
- [x] `xp` (number)
- [x] `badges` (object of badge-id → bool, 15 IDs total: b1–b15)
- [x] `visited` (object of page-key → bool)
- [x] `heartClicks` (number)
- [x] `logoClicks` (number)
- [x] `logoTimer` (timeout id — not persisted)
- [x] `konamiProg` (array of keycodes — not persisted)
- [x] `keyBuf` (string buffer — not persisted)
- [x] `footerClicks` (number)
- [x] `quizScore` (object: q1, q2, q3, q4 → number)
- [x] `quizAnswered` (object: q1, q2, q3, q4 → array)
- [x] `secretDiscovered` (object: secret-id → timestamp)
- [x] `mascotShown` (bool)
- [x] `sroomOpened` (bool)
- [x] `heartMaxClicks` (number)
- [x] `lastHeartClick` (timestamp — not persisted)

### Visual / animation primitives
- [x] Confetti (`fireConfetti` in `state.js:145`) — 7-color palette, ~2-4.5s lifecycle → port to `Confetti.svelte`
- [x] Toast notifications (`showToast` in `state.js:137`) — port to `Toast.svelte`

### Navigation primitives
- [x] `navGo(page)` (`state.js:88`) — keep function name, refactor to SvelteKit router
- [x] `navLink` — replaced by `<a href>` links in SvelteKit

### Home page UI components
- [x] Module Progress bar (`updateProgress` `state.js:126`) — Read/Quizzes/Writing percentage cards → port to `ProgressBar.svelte`
- [x] Badge grid (`renderBadges` `state.js:57`, 15 badges) → port to `Badge.svelte` + `BadgeGrid.svelte`
- [x] XP display — wire from `state.xp` → preserve XP counter on home

### Quizzes (5 quizzes, each its own page in V4)
- [x] q1, q2, q3, q4 (English quizzes) → `src/routes/escola/quiz/[quizSlug]/+page.svelte`
- [x] ptq / pt-quiz (Portuguese quiz) → same route, slug = `pt`

### Portuguese section
- [x] 🇵🇹 PT tab with quiz + audio walkthrough → keep in nav + route group

## 🔒 Constraints from previous work (must respect)

- [x] Netlify auto-deploys `main` → `netlify.toml` build = `npm run build`, publish = `build/`
- [x] Cache headers (`/assets/*` immutable, `/*.html` no-cache) → preserve in `[[headers]]`
- [x] Security headers: HTTPS-only, `strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: geolocation=(), microphone=(), camera=()` → preserve
- [x] Viewport meta with `viewport-fit=cover` → keep on every page
- [x] `presuntinho.netlify.app` URL must keep working throughout migration
- [x] Existing redirects: `/home` → `/`, `/downloads` → `/#pg-dl`

## 🔍 Phase 0 Recon — Completed
- [x] Repo inventoried (15 files in `src/`, 5 audio mp3, 2 docs, 1 zip, 1 PNG)
- [x] `index.html` audited (636 lines, 9 pages, 15 easter egg hooks, 23 heart tiers, 8 secret definitions)
- [x] `assets/js/state.js` (160 lines) — state schema + badges + nav + toast + confetti
- [x] `assets/js/easter-eggs.js` (301 lines) — heart / logo / mascot / footer / konami / keyword detector
- [x] `assets/js/quizzes.js` (138 lines) — 5 quizzes
- [x] `assets/js/app.js` (32 lines) — likely small router/init
- [x] `assets/css/styles.css` (349 lines) — full design system
- [x] Node v24.13.0, npm 11.5.2 — compatible with SvelteKit 2 + Vite 5/6
- [x] `delegate_task` — verified to work (see session memory)
- [ ] **GATE: PRESERVATION.md committed and pushed** — do this next

## Phase progress

- Phase 0 — Recon: **in progress** (just finished inventory, need commit)
- Phase 1 — Bootstrap: pending
- Phase 2 — Auth + layout: pending
- Phase 3 — Migration + state: pending
- Phase 4 — Escola sub-app: pending
- Phase 5 — Trabalhos: pending
- Phase 6 — Finanças MVP: pending
- Phase 7 — Hábitos MVP: pending
- Phase 8 — Biblioteca MVP: pending
- Phase 9 — Settings + i18n: pending
- Phase 10 — Polish + a11y: pending
- Phase 11 — Final cleanup + tag: pending

## Deferred to V5 (NOT in V4 scope)

- Backend / database sync between devices
- Multi-user / shared state
- Native mobile app wrapper (Capacitor/Tauri)
- Cloud file storage for biblioteca
- Push notifications
- AI-powered lesson recommendations

---

**Next action**: commit `PRESERVATION.md` to `main`, then dispatch Phase 1 tasks.