# Architecture — Presuntinho V4

> A SvelteKit 2 PWA built on top of the V3 study site that Fatma has been using since 2023. Este documento descreve a forma como o código se organiza, como o estado é persistido, e como cada sub-app encaixa no registry.

## Overview

Presuntinho is a single-user, single-device **Progressive Web App** (PWA) built with **SvelteKit 2 + Svelte 5 + Vite 5** and bundled by **`adapter-static`** as a static SPA on Netlify. The original V3 site (vanilla HTML/JS) is preserved at `/legacy/` so users always have an escape hatch to the familiar interface while the new SvelteKit shell takes over. The app is pt-PT-first (English fallback) and ships with 5 plugin-style sub-apps (Escola, Trabalhos, Finanças, Hábitos, Biblioteca) registered in a single `registry.ts`. State lives in **IndexedDB via Dexie 4** and is migrated idempotently from `localStorage.presuntinho` on first boot.

## Stack

| Dependency | Version | Role |
| --- | --- | --- |
| `@sveltejs/kit` | ^2.5 | App framework, routing, layouts, SSR shell. |
| `svelte` | ^5.0 | UI layer with runes (`$props()` / `$state()` / `$derived()` / `$effect()`). |
| `@sveltejs/vite-plugin-svelte` | ^4 | Svelte 5 / Vite bridge. |
| `vite` | ^5.4 | Dev server + production bundler. |
| `@sveltejs/adapter-static` | ^3 | Builds the app as a static SPA into `build/`. |
| `dexie` | ^4 | IndexedDB wrapper for the state + per-sub-app tables. |
| `@vite-pwa/sveltekit` | ^0.6 | Service worker + manifest plumbing (`generateSW` strategy). |
| `svelte-i18n` | ^4 | Locale store, message formatter, fallback chain. |
| `chart.js` | ^4.4 | Doughnut / line charts used by Finanças. |
| `date-fns` | ^3.6 | Locale-aware date math (Hábitos heatmap, Escola lessons). |
| `lucide-svelte` | ^0.400 | Icon set for sub-app UI chrome. |
| `vitest` | ^2 | Unit tests (`npm test`). |
| `@playwright/test` | ^1.45 | E2E harness (`npm run test:e2e`). |
| `typescript` | ^5.5 | Strict mode on the whole `src/` tree. |

## Folder layout

```
presuntinho/
├── docs/                            ← dev documentation (you are here)
├── src/
│   ├── app.html                     ← viewport-fit=cover, theme-color, skip-link
│   ├── app.css                      ← V3 design tokens (CSS variables)
│   ├── app.d.ts                     ← SvelteKit ambient types
│   ├── routes/
│   │   ├── +layout.svelte           ← nav + Confetti/Toast + global key handler
│   │   ├── +layout.ts               ← ssr=false, prerender=false, trailingSlash='always'
│   │   ├── +page.svelte             ← Hub (greeting + sub-apps + progress + badges)
│   │   ├── splash/+page.svelte      ← PBKDF2 password gate
│   │   ├── definicoes/+page.svelte  ← theme, lang, clear/export/import
│   │   ├── escola/                  ← 5 lessons + 5 quizzes (JSON-driven)
│   │   ├── trabalhos/               ← assignments with countdown
│   │   ├── financas/                ← dashboard, transactions, budget, categories
│   │   ├── habitos/                 ← daily check-in + 90-day heatmap
│   │   └── biblioteca/              ← bookmarks + multi-tag search
│   └── lib/
│       ├── registry.ts              ← sub-app plugin registry
│       ├── easterEggs.ts            ← heart / logo / konami / keyword / footer / sroom
│       ├── biblioteca.ts            ← CRUD for the biblioteca table
│       ├── financas.ts              ← CRUD for transacoes / orcamentos / categorias
│       ├── habitos.ts               ← CRUD + streak helpers for habits
│       ├── auth/
│       │   ├── hash.ts              ← Web Crypto PBKDF2-SHA256 verifier
│       │   └── session.ts           ← sessionStorage + lockout
│       ├── components/              ← HubCard, ProgressBar, BadgeGrid, Confetti, Toast, …
│       ├── data/                    ← JSON seeds (lessons, assignments, quizzes)
│       ├── i18n/
│       │   ├── index.ts             ← init + setLocale + locale store
│       │   ├── pt-PT.json           ← primary (49 keys)
│       │   └── en.json              ← fallback (49 keys)
│       └── state/
│           ├── db.ts                ← Dexie schema v4 (cumulative)
│           ├── migration.ts         ← localStorage → Dexie one-shot
│           └── stores.ts            ← Svelte writables backed by Dexie rows
├── static/
│   ├── favicon.svg
│   ├── manifest.webmanifest         ← PWA manifest (copied verbatim into build)
│   ├── icons/                       ← icon-{192,512}.png + icon.svg
│   ├── auth/hashes.json             ← PBKDF2 hash + salt for the two passwords
│   ├── quizzes/                     ← q1..q4 + ptq (JSON)
│   ├── lessons/equivalenza/         ← 5 lesson JSONs
│   ├── data/assignments/            ← equivalenza.json
│   └── legacy/                      ← V3 site preserved verbatim
├── svelte.config.js                 ← adapter-static + SPA fallback
├── vite.config.ts                   ← sveltekit() + SvelteKitPWA + vitest
├── tsconfig.json                    ← strict
├── netlify.toml                     ← build, headers, redirects
└── package.json
```

## Routing

The app uses SvelteKit's file-based router under [`src/routes/`](../src/routes/). Each sub-app lives in its own folder:

```
src/routes/<slug>/
├── +page.svelte          ← list view
├── novo/+page.svelte     ← create form
├── item/[id]/+page.svelte ← detail view
└── ...
```

Adding a new sub-app = add one folder + one entry in [`src/lib/registry.ts`](../src/lib/registry.ts). The hub renders cards straight from that array, so any new entry shows up immediately on `/`.

The root layout ([`src/routes/+layout.svelte`](../src/routes/+layout.svelte)) is responsible for:

- Loading `app.css`, mounting `Confetti` + `Toast`, installing the global keyboard listener that drives Konami + keyword detection.
- Registering the PWA service worker via `virtual:pwa-register`.
- Running `initStores()` (which triggers the V3→V4 migration).
- Redirecting unauthenticated users to `/splash/`.

`+layout.ts` forces `ssr = false`, `prerender = false`, and `trailingSlash = 'always'` so every URL ends with `/` (matching the Netlify SPA fallback and avoiding redirect hops).

## Sub-app registry

[`src/lib/registry.ts`](../src/lib/registry.ts) exports `SubApp` + the `subApps` array. Each entry has `id`, `name`, `icon`, `color`, `description`, `route`, `enabled`, `order`. `legacySubApp` is a separate entry pointing at `/legacy` (V3 iframe) so users can always get back to the original site.

The Hub iterates the registry and feeds each entry to [`HubCard.svelte`](../src/lib/components/HubCard.svelte). See [`docs/adding-a-sub-app.md`](./adding-a-sub-app.md) for the full walkthrough.

## State management

All persistent state lives in IndexedDB through Dexie 4. The schema is defined in [`src/lib/state/db.ts`](../src/lib/state/db.ts) and is **cumulative**: each Dexie version re-declares every prior store so old databases upgrade cleanly.

### Singleton row — `state`

One row keyed by `'main'` holds the V3 scalar state fields:

- `xp`, `heartClicks`, `heartMaxClicks`, `logoClicks`
- `logoTimer` (transient in V3, stored as `0`)
- `konamiProg` (rolling buffer of keyCodes)
- `keyBuf` (rolling buffer of typed letters)
- `footerClicks`, `mascotShown`, `sroomOpened`
- `updatedAt` timestamp

### Per-row collections

| Table | Primary key | Secondary indexes | Phase |
| --- | --- | --- | --- |
| `badges` | id (b1..b15) | — | 1 |
| `visited` | page key | — | 1 |
| `quizScores` | quiz id (q1..q4, ptq) | — | 1 |
| `secrets` | secret id | — | 1 |
| `settings` | `'main'` (singleton) | — | 1 |
| `transacoes` | `++id` | `tipo`, `data`, `[tipo+data]`, `categoria` | 6 (Finanças) |
| `orcamentos` | id (categoria slug) | `mes` | 6 (Finanças) |
| `categorias` | id (slug) | `tipo` | 6 (Finanças) |
| `habitos` | `++id` | `createdAt` | 7 (Hábitos) |
| `habit_logs` | `++id` | `[habitId+date]`, `habitId`, `date`, `createdAt` | 7 (Hábitos) |
| `biblioteca` | `++id` | `*tags` (multi-entry), `createdAt` | 8 (Biblioteca) |

The `*tags` prefix on `biblioteca.tags` is Dexie's multi-entry index syntax — every element of the array is added to the index so `where('tags').equals('python')` returns every row tagged "python" without scanning.

### Migration

[`src/lib/state/migration.ts`](../src/lib/state/migration.ts) runs once per browser:

1. Reads the legacy blob from `localStorage.presuntinho`.
2. Parses it (matching the V3 `state` object shape).
3. Calls `ensureDefaults()` to seed the singleton + default category rows.
4. Writes the parsed data into the corresponding Dexie tables.
5. Sets the flag `presuntinho-migrated-v4 = "done"` in `localStorage`.

The legacy `localStorage` key is **not** deleted — kept for one rollback cycle per the project brief. If the flag is already set, the function is a no-op and `ensureDefaults()` only runs the first time.

### Svelte stores

[`src/lib/state/stores.ts`](../src/lib/state/stores.ts) exposes classic `writable` stores that hydrate from Dexie on creation and write back on every update. The Hub (`+page.svelte`) and the easter-egg handlers import these stores directly; Dexie reads happen lazily via the `db()` accessor so SSR does not crash.

## Auth flow

1. User lands on `/`. `+layout.svelte` checks `sessionStorage['presuntinho-session']`.
2. No session → `goto('/splash/')`.
3. Splash ([`src/routes/splash/+page.svelte`](../src/routes/splash/+page.svelte)) reads `/auth/hashes.json` (no cache) and runs the entered password through **PBKDF2-SHA256 600 000 iterations** ([`src/lib/auth/hash.ts`](../src/lib/auth/hash.ts)).
4. On match → `setSession(method)` writes to sessionStorage + `resetAttempts()` + `goto('/')`.
5. On mismatch → `recordFailedAttempt()` increments the counter in `localStorage`.
6. After **3 failed attempts** → 30-second lockout (`LOCKOUT_KEY` in `localStorage`); the UI disables the input and shows a countdown.

Two passwords are accepted: a primary one (the normal daily password) and a secret one (grants the same access but is recognised by `setSession({ method: 'secret' })` so the Hub can show a small badge later).

## i18n

Locale lives in [`src/lib/i18n/`](../src/lib/i18n/index.ts):

- `pt-PT.json` (primary, 49 keys) + `en.json` (fallback, 49 keys).
- `init({ fallbackLocale: 'pt-PT', initialLocale })` runs at module load.
- `initialLocale` is read from `localStorage['fat-pref-lang']` before the first render so the very first paint already shows the right strings (no flash of fallback).
- `setLocale(loc)` writes back to `localStorage['fat-pref-lang']` and updates the locale store.

Components call `$t('section.key')`; the `definicoes` route wires the language toggle.

## Easter eggs

All V3 easter eggs are ported to [`src/lib/easterEggs.ts`](../src/lib/easterEggs.ts) and persist via Dexie. The high-level triggers:

| Trigger | Handler | Reward |
| --- | --- | --- |
| ❤️ Heart click (5 tier system — 23 tiers total) | `heartClick()` | XP, confetti, badges (b10, b12, b13) |
| 🐷 Logo triple-click (3 / 6–8 click) | `logoClick()` | Confetti + b14 + Secret Room opens |
| 🎮 Konami code (↑↑↓↓←→←→BA) | `handleKonamiKey()` | b8 + 100 XP |
| ⌨️ Keyword detector (perfume / behi / fatma / help) | `handleKeywordKey()` | b7 / b9 / b14 / hint toast |
| 👣 Footer click (5 clicks) | `footerClick()` | b15 + hint toast |
| 🚪 Secret Room open / close | `closeSRoom()` | `presuntinho:open-secret-room` event |

The handlers dispatch two well-known window events that components listen for:

- `presuntinho:confetti` → [`Confetti.svelte`](../src/lib/components/Confetti.svelte) paints coloured pieces.
- `presuntinho:toast` → [`Toast.svelte`](../src/lib/components/Toast.svelte) shows ephemeral notifications.

Both respect `prefers-reduced-motion: reduce` via the helper in [`src/lib/components/events.ts`](../src/lib/components/events.ts).

## PWA

- Plugin: [`@vite-pwa/sveltekit`](https://vite-pwa-org.netlify.app/frameworks/sveltekit.html) with the **`generateSW`** strategy.
- Manifest lives at [`static/manifest.webmanifest`](../static/manifest.webmanifest) (the plugin is configured with `manifest: false` so this file is copied verbatim into `build/`).
- Icons: [`static/icons/icon-192.png`](../static/icons/icon-192.png), [`static/icons/icon-512.png`](../static/icons/icon-512.png), [`static/icons/icon.svg`](../static/icons/icon.svg).
- The service worker is registered manually inside `+layout.svelte` via `virtual:pwa-register` so we can hook `onNeedRefresh` / `onOfflineReady` into our own toast pipeline.
- `workbox.runtimeCaching` pre-caches `/quizzes/*`, `/lessons/*`, and images (`CacheFirst`, 30-day expiry) so the app keeps working offline after the first visit.

## Netlify

[`netlify.toml`](../netlify.toml) is the source of truth for the deploy. Highlights:

```toml
[build]
  publish = "build"
  command = "npm run build"

[build.environment]
  NODE_VERSION = "20"
  NPM_FLAGS = "--legacy-peer-deps"

[[redirects]]
  from = "/*"
  to   = "/index.html"
  status = 200   # SPA fallback (static-file-first precedence keeps /legacy/*)
```

Cache headers:

- `/_app/immutable/*` → `public, max-age=31536000, immutable` (hashed SvelteKit bundles).
- `/legacy/assets/*`, `/legacy/docs/*`, `/legacy/*.zip` → immutable, 1 year.
- `/*.html`, `/sw.js`, `/manifest.webmanifest` → `public, max-age=0, must-revalidate`.

Security headers (applies to `/*`):

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`

Pretty URL aliases (preserved from V3):

- `/home` → `/index.html` (301)
- `/downloads` → `/legacy/index.html#pg-dl` (301)
- `/v3` → `/legacy/index.html` (301)

## Migration phases (overview)

[`PRESERVATION.md`](../PRESERVATION.md) is the source of truth for "must not break" items. Phase summary:

| Phase | Scope | Commit |
| --- | --- | --- |
| 0 | Recon + `PRESERVATION.md` inventory | `1b85a32` |
| 1 | SvelteKit + Vite + iframe legacy (`/legacy`) | `897057f` |
| 2 | PBKDF2 auth splash + Hub + sub-app registry | `a0cd7c5` |
| 3 | Dexie schema + migration + Svelte stores + easter eggs + quiz JSONs | `441d527` |
| 4 | Escola sub-app (lessons + quizzes) | — |
| 5 | Trabalhos sub-app (assignments + countdown) | — |
| 6 | Finanças sub-app (dashboard, transactions, budget, categories) | — |
| 7 | Hábitos sub-app (daily check-in + 90-day heatmap) | — |
| 8 | Biblioteca sub-app (bookmarks + multi-tag search) | — |
| 9 | Settings page (theme, language, clear/export/import) | — |
| 10 | PWA manifest + a11y + responsive polish | — |
| 11 | Documentation + final tag | — |

## Accessibility

- `<a class="skip-link" href="#main-content">Saltar para o conteúdo principal</a>` is the first focusable element in [`src/app.html`](../src/app.html).
- Every interactive control is a `44×44` minimum touch target (see `.icon-btn` in `+layout.svelte`).
- `:focus-visible` is styled with a 2px accent ring instead of removing the default outline.
- Confetti + body-pulse animations are guarded by `prefers-reduced-motion: reduce` in [`src/lib/components/events.ts`](../src/lib/components/events.ts).
- The XP pill uses `aria-label` with the localised "Pontos de experiência: 1.234 XP" string.