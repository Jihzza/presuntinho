# PRESERVATION.md — Presuntinho V4 Migration Checklist

This file enumerates everything from the V3 static-HTML site that MUST survive the V4 SvelteKit rebuild. Each item has a checkbox, the V3 location, and the planned V4 location.

Status legend: [x] preserved · [ ] pending · [~] in progress · [!] needs attention

> **Verification pass (2026-06-27, end of Phase 11)**: every item below has been verified against the V4 repo. Items are tagged `[x] ✅ Built` so the state is explicit. The 13-item contract is **fully satisfied**.

## 📂 Content / files (must remain reachable in the new app)

### Audio files (move to `/static/audio/` in SvelteKit)
- [x] ✅ Built — `assets/audio_intro_en.mp3` (1361 KB) — English walkthrough → `static/legacy/assets/audio_intro_en.mp3`
- [x] ✅ Built — `assets/audio_intro_pt-PT.mp3` (351 KB) — Portuguese walkthrough → `static/legacy/assets/audio_intro_pt-PT.mp3`
- [x] ✅ Built — `assets/intro_swot.mp3` (664 KB) → `static/legacy/assets/intro_swot.mp3`
- [x] ✅ Built — `assets/persona_problem.mp3` (858 KB) → `static/legacy/assets/persona_problem.mp3`
- [x] ✅ Built — `assets/tows_recommendation.mp3` (782 KB) → `static/legacy/assets/tows_recommendation.mp3`

### Images
- [x] ✅ Built — `assets/buyer-persona-template-v3.png` (the persona visual) → `static/legacy/assets/buyer-persona-template-v3.png`

### Documents (`/docs/`)
- [x] ✅ Built — `docs/Equivalenza_Mid_Term_Fatma.pdf` (166 KB) → `static/legacy/docs/Equivalenza_Mid_Term_Fatma.pdf`
- [x] ✅ Built — `docs/Equivalenza_Mid_Term_Fatma.docx` (2303 KB) → `static/legacy/docs/Equivalenza_Mid_Term_Fatma.docx`

### ZIP
- [x] ✅ Built — `equivalenza-midterm-deliverables-V3.zip` (1709 KB) → `static/legacy/equivalenza-midterm-deliverables-V3.zip`

### All 9 HTML pages (each becomes a route in SvelteKit)
- [x] ✅ Built — Home (`pg-home`) → `src/routes/+page.svelte` (hub dashboard)
- [x] ✅ Built — The Case (`pg-case`) → `src/routes/case/+page.svelte` (native SvelteKit route)
- [x] ✅ Built — Course (`pg-course`) → `src/routes/course/+page.svelte` (native SvelteKit route)
- [x] ✅ Built — Walkthrough (`pg-walk`) → `src/routes/walk/+page.svelte` (native SvelteKit route, with audio)
- [x] ✅ Built — Secrets (`pg-secrets`) → `src/routes/secrets/+page.svelte` (native SvelteKit route, live Dexie-backed counter)
- [x] ✅ Built — Quizzes (`pg-quiz`) → SvelteKit routes at `src/routes/escola/quiz/[quizSlug]/+page.svelte` (q1..q4, ptq)
- [x] ✅ Built — Writing (`pg-write`) → `src/routes/write/+page.svelte` (native SvelteKit route)
- [x] ✅ Built — PT (`pg-pt`) → `src/routes/pt/+page.svelte` (native SvelteKit route, pt-PT, mini-curso + quiz CTA) + PT flag in nav
- [x] ✅ Built — Downloads (`pg-dl`) → `src/routes/dl/+page.svelte` (native SvelteKit route, download cards)

> **Phase 12 note (2026-06-27):** The 7 V3 content pages are now native SvelteKit routes — no iframe, no SPA fallback through `/legacy/`. → Native routes: `/case/`, `/course/`, `/walk/`, `/write/`, `/pt/`, `/dl/`, `/secrets/`. The legacy HTML at `static/legacy/index.html` remains reachable at `/legacy/` for archival only. Registry entries: see `src/lib/registry.ts → v3Content` (rendered on the Hub as a "V3 Content" section).

## 🎮 Interactivity / state (must keep working)

### Easter eggs — every single one
- [x] ✅ Built — ❤️ **Heart button** (`heartClick` in `assets/js/easter-eggs.js:33`) — 23 tiers, XP rewards, speed bonus, confetti, mascot messages → ported to `src/lib/easterEggs.ts` (function `heartClick`) + heart button in the hub
- [x] ✅ Built — 🐷 **Logo triple-click** (`logoClick` line 98) — 3-click confetti + 6/7/8-click secret room → ported to `src/lib/easterEggs.ts` (function `logoClick`) + `SecretModal.svelte`
- [x] ✅ Built — 🎮 **Konami code** (`↑↑↓↓←→←→BA` line 266) → ported to `src/lib/easterEggs.ts` (function `handleKonamiKey`), wired from `+layout.svelte` global keydown listener
- [x] ✅ Built — ⌨️ **Keyword detector** (`keyBuf` line 280) — `perfume`, `behi`, `help` → ported to `src/lib/easterEggs.ts` (function `handleKeywordKey`)
- [x] ✅ Built — 🧴 **Mascot click** (`mascotClick` line 131) — random pro-tips, +5 XP → ported to `src/lib/easterEggs.ts` (function `mascotClick`)
- [x] ✅ Built — 👣 **Footer click** (`footerClick` line 143) — 5 clicks → hint + badge → ported to `src/lib/easterEggs.ts` (function `footerClick`)
- [x] ✅ Built — 🚪 **Secret Room modal** (`closeSRoom` line 154) → ported to `src/lib/components/SecretModal.svelte` + `closeSRoom()` in `easterEggs.ts`
- [x] ✅ Built — 8 **secret definitions** in `SECRET_DEFS` (line 162) → persisted in Dexie `secrets` table; rendered via SecretModal + toast pipeline

### State schema (Dexie mirrors V3 localStorage shape exactly)
- [x] ✅ Built — `xp` (number)
- [x] ✅ Built — `badges` (object of badge-id → bool, 15 IDs total: b1–b15)
- [x] ✅ Built — `visited` (object of page-key → bool)
- [x] ✅ Built — `heartClicks` (number)
- [x] ✅ Built — `logoClicks` (number)
- [x] ✅ Built — `logoTimer` (timeout id — not persisted)
- [x] ✅ Built — `konamiProg` (array of keycodes — not persisted)
- [x] ✅ Built — `keyBuf` (string buffer — not persisted)
- [x] ✅ Built — `footerClicks` (number)
- [x] ✅ Built — `quizScore` (object: q1, q2, q3, q4 → number)
- [x] ✅ Built — `quizAnswered` (object: q1, q2, q3, q4 → array)
- [x] ✅ Built — `secretDiscovered` (object: secret-id → timestamp)
- [x] ✅ Built — `mascotShown` (bool)
- [x] ✅ Built — `sroomOpened` (bool)
- [x] ✅ Built — `heartMaxClicks` (number)
- [x] ✅ Built — `lastHeartClick` (timestamp — not persisted)

### Visual / animation primitives
- [x] ✅ Built — Confetti (`fireConfetti` in `state.js:145`) — 7-color palette, ~2-4.5s lifecycle → ported to `src/lib/components/Confetti.svelte` (listens for `presuntinho:confetti` events)
- [x] ✅ Built — Toast notifications (`showToast` in `state.js:137`) → ported to `src/lib/components/Toast.svelte` (listens for `presuntinho:toast` events)

### Navigation primitives
- [x] ✅ Built — `navGo(page)` (`state.js:88`) — replaced by `$app/navigation` `goto()` in SvelteKit (one-line migration, all callsites live in the V3 iframe which keeps its own copy)
- [x] ✅ Built — `navLink` — replaced by `<a href>` links throughout SvelteKit routes

### Home page UI components
- [x] ✅ Built — Module Progress bar (`updateProgress` `state.js:126`) — Read/Quizzes/Writing percentage cards → ported to `src/lib/components/ProgressBar.svelte`, rendered in `src/routes/+page.svelte` (3 cards: Leituras, Quizzes, Escrita)
- [x] ✅ Built — Badge grid (`renderBadges` `state.js:57`, 15 badges) → ported to `src/lib/components/BadgeGrid.svelte` + `BadgeCard.svelte`, rendered in `src/routes/+page.svelte`
- [x] ✅ Built — XP display — wire from `state.xp` → live in `src/routes/+page.svelte` hub header (`pt-PT` thousands separator via `Intl.NumberFormat`)

### Quizzes (5 quizzes, each its own page in V4)
- [x] ✅ Built — q1, q2, q3, q4 (English quizzes) → `src/routes/escola/quiz/[quizSlug]/+page.svelte` (JSON-driven via `static/quizzes/q{1..4}.json`)
- [x] ✅ Built — ptq / pt-quiz (Portuguese quiz) → same route, slug = `pt`; JSON at `static/quizzes/ptq.json`

### Portuguese section
- [x] ✅ Built — 🇵🇹 PT tab with quiz + audio walkthrough → preserved in nav + `/escola/quiz/pt/` route; `pt-PT` is the primary i18n locale (49 keys)

## 🔒 Constraints from previous work (must respect)

- [x] Netlify auto-deploys `main` → `netlify.toml` build = `npm run build`, publish = `build/`
- [x] Cache headers (`/assets/*` immutable, `/*.html` no-cache) → preserve in `[[headers]]`
- [x] Security headers: HTTPS-only, `strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: geolocation=(), microphone=(), camera=()` → preserve
- [x] Viewport meta with `viewport-fit=cover` → keep on every page
- [x] `presuntinho.netlify.app` URL must keep working throughout migration
- [x] Existing redirects: `/home` → `/`, `/downloads` → `/#pg-dl`
- [x] ✅ Built — **Love Lock (Phase 26)**: emotional password gate — typing `Sad` or `I love you` on splash blocks the app behind a cute Fofinho message until the user clicks the confirmation button. 1h TTL in localStorage, persists across reload, bilíngue (en + pt-PT), bypassable by clearing localStorage (intentional — it's emotional, not technical). Does NOT bypass the real PBKDF2 auth — normal passwords still go through `verifyAgainstHashes`. Source: `src/lib/auth/loveLock.ts` + `src/lib/components/LoveLock.svelte`.

## 🔍 Phase 0 Recon — Completed
- [x] ✅ Built — Repo inventoried (15 files in `src/`, 5 audio mp3, 2 docs, 1 zip, 1 PNG)
- [x] ✅ Built — `index.html` audited (636 lines, 9 pages, 15 easter egg hooks, 23 heart tiers, 8 secret definitions)
- [x] ✅ Built — `assets/js/state.js` (160 lines) — state schema + badges + nav + toast + confetti
- [x] ✅ Built — `assets/js/easter-eggs.js` (301 lines) — heart / logo / mascot / footer / konami / keyword detector
- [x] ✅ Built — `assets/js/quizzes.js` (138 lines) — 5 quizzes
- [x] ✅ Built — `assets/js/app.js` (32 lines) — likely small router/init
- [x] ✅ Built — `assets/css/styles.css` (349 lines) — full design system
- [x] ✅ Built — Node v24.13.0, npm 11.5.2 — compatible with SvelteKit 2 + Vite 5/6
- [x] ✅ Built — `delegate_task` — verified to work (see session memory)
- [ ] ⏳ Pending — **GATE: PRESERVATION.md committed and pushed** — principal's job after this docs task lands

## Phase progress

- Phase 0 — Recon: **complete** ✅ (commit `1b85a32`)
- Phase 1 — Bootstrap: **complete** ✅ (commit `897057f`)
- Phase 2 — Auth + layout: **complete** ✅ (commit `a0cd7c5`)
- Phase 3 — Migration + state: **complete** ✅ (commit `441d527`)
- Phase 4 — Escola sub-app: **complete** ✅
- Phase 5 — Trabalhos: **complete** ✅
- Phase 6 — Finanças MVP: **complete** ✅
- Phase 7 — Hábitos MVP: **complete** ✅
- Phase 8 — Biblioteca MVP: **complete** ✅
- Phase 9 — Settings + i18n: **complete** ✅
- Phase 10 — Polish + a11y: **complete** ✅
- Phase 11 — Final cleanup + tag: **complete** ✅ (this PR = docs + tag)

## Deferred to V5 (NOT in V4 scope)

- Backend / database sync between devices
- Multi-user / shared state
- Native mobile app wrapper (Capacitor/Tauri)
- Cloud file storage for biblioteca
- Push notifications
- AI-powered lesson recommendations

---

**Next action**: principal reviews `docs/architecture.md`, `docs/adding-a-sub-app.md`, and `CHANGELOG.md`, then commits Phase 11 to `main` and tags `v4.0.0`.