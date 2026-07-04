# Changelog

All notable changes to Presuntinho are documented in this file.

## [10.0.0] - 2026-07-04 — "Juice Update"

Atualização Duolingo-inspired em 3 tiers: som, níveis, streak de primeira
classe, mascote emocional, parade de vitória, baús e notificações com
personalidade. 4 commits de feature (`4dcd195`, `1a3271c`, `4fd1b77` + release)
e 2 de fixes guiados por reviews adversariais multi-agente (`5bc334b`, `cbc2470`).

### Added
- **Som + haptics** — 8 efeitos sintetizados em Web Audio (zero mp3s): chime de
  acerto (pitch sobe com combos até +10 semitons), thud suave no erro, fanfarra,
  whoosh da chama, ding de missão, baú, marco e level-up. `navigator.vibrate`
  em vitórias. Toggles "Sons"/"Vibração" em /definicoes (Dexie, aditivo); som
  desligado por default com `prefers-reduced-motion`. (`src/lib/gamification/sound.ts`)
- **Níveis** — curva exponencial `50·N^1.6` (Nv2=152 XP, Nv5=656, Nv10=1990) com
  funções puras testadas; modal de level-up full-screen (confetti + fanfarra +
  vibração); barra de progresso no hub; nível no XpPill e no perfil.
  (`levels.ts`, `LevelUpModal.svelte`)
- **Streak de primeira classe** — chama 🔥 no header (cinzenta até à 1.ª
  atividade do dia, ignição animada com whoosh 1×/dia) com popover (círculos da
  semana, congelamentos, recorde); **streak freeze**: 1 token ganho a cada 7
  dias (máx. 2), consumido automaticamente num dia falhado — o dia congelado
  mantém a cadeia sem contar; marcos 7/14/30/50/100/365 em cartão full-screen;
  baseline pós-upgrade evita celebrações retroativas. (`streak-core.ts` +
  `StreakFlame/WeekCircles/StreakMilestoneModal`)
- **Mascote emocional** — 5 estados (feliz/neutro/preocupado/triste/eufórico)
  derivados de streak + hora + última ação; overlay e animações no FAB; fala
  localizada no hub; favicon e título do separador mudam com a emoção (o truque
  do ícone do Duolingo). (`emotion.ts`, `presence.ts`)
- **Parade de vitória** — `VictoryFlow.svelte`: fila de 2-4 cartões (splash com
  anel de precisão → recompensas com stagger e count-up de 800ms → streak +
  semana + missões com CTAs). Usada nos quizzes, ao completar todos os hábitos
  do dia (1×/dia) e ao entregar trabalhos (mostra o XP real pago, 15-150).
- **Badges a sério** — catálogo corrigido para o contrato V3 (os labels V4-V9
  estavam trocados: b8 é Konami, b10 é coração, b14 é Sala Secreta…); 17 badges
  todos atribuíveis (novos: b1 primeira ação, b2 primeira lição, b4 dez
  respostas, b5 primeira nota, b6 oito páginas); famílias com tiers
  bronze/prata/ouro; modal de desbloqueio com confetti + fanfarra; /secrets
  renderiza do mesmo catálogo. (`badge-catalog.ts`, `BadgeUnlockModal.svelte`)
- **Baús de recompensa variável** — 3/3 missões diárias → baú shake-then-burst
  (55% XP 10-50, 25% freeze, 20% **boost 2x/15min** que multiplica de facto o
  `awardXP`); flag persistida sobrevive a reloads até ser recolhido; indicador
  ⚡2x no XpPill. (`ChestModal.svelte`)
- **Notificações com personalidade** — Notification API local para "streak em
  risco" (≥20h, 1×/dia, opt-in em /definicoes, permissão só por gesto) com 5
  variantes passivo-agressivas do porquinho, localizadas nos 5 idiomas.
- **Polish** — transição fade/slide entre rotas; entrada staggered nas listas
  principais; dip `scale(0.97)` nos botões; número de XP com tween; preview de
  paleta real nos 13 temas; marcos 25/50/75% nas metas com celebração; barra de
  progresso de desbloqueio na galeria de mascotes; insight "dia mais feliz" em
  /humor; skeletons consistentes em 7 páginas.

### Changed
- i18n: +117 chaves novas e ~20 valores corrigidos em **todos os 5 locales**
  (pt-PT/en/tn/fr/ar) — paridade 3229 chaves.
- `awardBadge` dispara `presuntinho:badge-unlocked`; `awardXP` aplica o boost
  ativo a ganhos (nunca a perdas) via `boostedXp()` partilhado com o display.
- Campos aditivos não-indexados (sem bump de schema Dexie): state row
  (`streakFreezes`, `streakFreezeLastEarn`, `streakFrozenDays`,
  `streakMilestoneCelebrated`, `streakFlameDay`, `xpBoostUntil`, `xpBoostMult`,
  `habitsFlowDay`, `streakNotifDay`, `chestPendingDay`) e settings row
  (`soundEnabled`, `hapticsEnabled`, `notifStreakEnabled`).

### Fixed
- 21 findings da review adversarial do Tier 1 (falso level-up pós-reload,
  ratchet de freezes após quebra, escrita destrutiva em leitura falhada, RTL,
  overflow do nav ≤520px, sons duplicados…) e 16 do Tier 2 (o VictoryFlow
  consumia a flag do baú, parade do trabalho com XP errado, b6 contava
  marcadores de lição, timers por limpar, 20 chaves i18n em falta…).
- Gate 1 pré-existente do check:depth ("Em breve" em CaminhoPath) — 5/5 gates.

### Testing
- 47 testes vitest novos (curva de níveis, walk do streak com freezes,
  earn/reset de tokens, marcos, estados emocionais do mascote).

## [6.0.3] - 2026-06-27

### Added
- **Two-profile auth (Daniel + Fatma)** — splash now shows two buttons ("Sou a Fatma" / "Sou o Daniel"). Daniel's password is `princesa`. Storage is fully isolated per profile: separate `sessionStorage` keys, separate `IndexedDB` databases (`presuntinho-fatma` vs `presuntinho-daniel`), separate `sessionStorage` keys for lockout counter and failed-attempt tracking. Cross-profile reads are impossible by design.
- **Multi-language UI (i18n)** — full app now ships with 5 locales: `pt-PT` (default), `en`, `tn` (Tunisian Arabic transliterated to Latin script — no Arabic characters, no font fallback needed), `fr`, `ar` (Arabic with proper RTL + character shaping). `LanguageSwitcher` dropdown in the header persists the choice to localStorage and to Dexie `settings.lang` so it follows the user across sessions. All navigation, buttons, errors, splash copy and page titles are translated. Source: `src/lib/i18n/{pt-PT,en,tn,fr,ar}.json` + `src/lib/components/LanguageSwitcher.svelte`.

### Changed
- `SettingsRow.lang` extended from `'pt-PT' | 'en'` to `'pt-PT' | 'en' | 'tn' | 'fr' | 'ar'`.
- `HashSlot` extended with `'daniel'` slot, `ProfileId = 'fatma' | 'daniel'`.
- Splash card replaces single password input with profile picker + contextual placeholder (`princesa` when Daniel selected, translated placeholder when Fatma selected).

## [6.0.2] - 2026-06-27

### Fixed
- **Love Lock cross-browser persistence** — Netlify Functions runtime never auto-injects `NETLIFY_BLOBS_CONTEXT` into Function invocations. Switched `netlify/functions/love-lock.js` to use `connectLambda(event)` from `@netlify/blobs` so the context is reconstructed from the event payload, working identically on Chrome, Edge, Safari, Firefox and any other browser/device.

## [6.0.1] - 2026-06-27

### Added
- **Cross-browser Love Lock persistence** — `netlify/functions/love-lock.js` Netlify Function stores the emotional lock in an HttpOnly cookie scoped to the origin. Opening the app in a fresh browser, incognito, or different device now honors the lock without depending on `localStorage`. Function exposes GET / POST / DELETE verbs; client `src/lib/auth/loveLock.ts` rewritten to call the Function and fall back to a localStorage mirror when offline.

### Fixed
- **Love Lock `Secure` cookie flag** — `process.env.CONTEXT === 'production'` check was unreliable on Netlify (the Function runtime did not always expose it). Switched to inspecting `x-forwarded-proto` / `x-nf-ssl` headers (always set by Netlify's edge) with a `CONTEXT` fallback for local dev. Production cookie now correctly carries `Secure` when served over HTTPS, matching HSTS preload.
- **Netlify auto-deploy restored** — `vite-plugin-pwa` peer dep added (`c79e338`) so `npm run build` no longer fails on a missing peer. Combined with the Workbox fix from 6.0.0, every `git push origin main` now auto-deploys without the manual `netlify deploy --prod --no-build` workaround.

### Security
- **Love Lock CSRF hardening** — POST `/love-lock` now requires an `Origin` / `Referer` matching `https://presuntinho.netlify.app`.
- **Love Lock cookie integrity** — cookie state is HMAC-signed with `process.env.LOVE_LOCK_SECRET`; malformed or tampered cookie payloads return a safe 400 instead of trusting client-controlled JSON.

## [6.0.0] - 2026-06-27

### Added
- **Love Lock (Phase 26)** — emotional password gate. Typing `Sad` or `I love you` (case-insensitive, flexible) on the splash screen blocks the app behind a full-screen Fofinho message until the user clicks the confirmation button. Bilingual copy (en + pt-PT). 1h TTL in localStorage, persists across reload. 2 hand-painted SVG mascots (sad Fofinho with tear drop animation, heart-shaped love Fofinho with floating hearts). Localized via existing `locale` store. Source: `src/lib/auth/loveLock.ts` + `src/lib/components/LoveLock.svelte`. PRESERVATION #14.
- **PT course sub-app (Phase 18)** — native SvelteKit port of the Portuguese language course. 7 section types (intro, words, dialogue, verb, exercise, grammar, summary). Quiz route at `/escola/curso/portugues/quiz/`. 50+ words with EN/AR/FR/PT translations, 3 dialogues, 5 verb conjugation tables. JSON-driven from `static/courses/portugues.json`.
- **Walkthrough route (Phase 21)** — `/escola/walkthrough/[lessonSlug]/` renders audio player + transcript + jump-to-section for any of the 5 lessons.
- **Trabalhos status workflow (Phase 19)** — assignments hub now supports status toggle (open → in_progress → done) with localStorage persistence. Custom event dispatch for cross-component updates. 5 real Equivalenza assignments (SWOT, Persona, Problem, TOWS, Recommendation) loaded from `static/data/assignments/equivalenza.json`.
- **Easter eggs data-driven loader (Phase 23)** — `easterEggsConfig.ts` loads 12 secrets + 15 badges + 11 heart tiers + 10 mascot tips from `static/data/easter-eggs.json`. `EasterEggsCard.svelte` renders any secret with the appropriate template (link, code, image, story, etc).
- **Deep lesson expansion (Phase 17)** — 5 lessons expanded from ~300 words each to 700-850 words with real Equivalenza context, tables, matrices, quotes, callouts.
- **Onboarding modal (Phase 24)** — first-visit welcome tour on the Hub. Dismissible, persists state via Dexie `preferences` store so it only shows once. 5-step walkthrough of the sub-apps.
- **Secrets page expansion (Phase 22)** — new heart-tiers timeline section + badges-grid section alongside the existing EasterEggsCard list. `easter-eggs.json` schema now includes `tier` and `badgeCount` fields.
- **Visual polish (Phase 25)** — hover/focus micro-interactions on all interactive elements (logo, nav buttons, footer, easter eggs, hub cards). `prefers-reduced-motion` guards in `app.css` + each component.

### Fixed
- **Love Lock ordering** (`8ace130`) — PBKDF2 password check now runs FIRST so a real password containing the words "love" or "sad" (e.g. `LoveFofinho2026!`) authenticates normally instead of being intercepted as a love-lock trigger.
- **Trabalhos detail page** (`c9020ce`) — V6 cards linking to `/trabalhos/assignment/<slug>/` (slug = `swot`, `persona`, etc.) were 404'ing. Detail page now resolves the slug from the single `equivalenza.json` pack instead of expecting per-slug JSON files. All 5 V6 detail routes return 200 OK in production.
- **Secrets template** (`928ac35`) — `src/routes/secrets/+page.svelte` refactored to consume `EasterEggsCard` component instead of hand-rolled markup. Data-driven from `easter-eggs.json`.
- **Netlify auto-deploy regression** (`28dbd39`) — 9 consecutive deploys were failing in ~9s with `Build script returned non-zero exit code: 2`. Root cause: Workbox warning `prerendered/**/*.{html,json} matches no files` is non-fatal locally but treated as fatal in Netlify's build container. Fix: `maximumFileSizeToCacheInBytes 2 MiB → 5 MiB` + `globIgnores: ['prerendered/**/*']` in `vite.config.ts`. After the fix, `netlify deploy --prod --build` succeeds in 13.1s.

## [5.0.0] - 2026-06-27

### Added
- 7 native SvelteKit ports of V3 content pages: /case/, /course/, /walk/, /write/, /pt/, /dl/, /secrets/
- Hub ProgressBar section (PRESERVATION #10): Leituras, Quizzes, Escrita counters
- Hub BadgeGrid section (PRESERVATION #11): 8 badge cards with unlock animation
- PWA: vite-plugin-pwa wired + manifest + icons + service worker register + install button + offline indicator
- SEO: per-route <svelte:head> with title + meta description + og:title/og:description/og:url + twitter:title/twitter:description on all 26 routes
- robots.txt + sitemap.xml generated by SvelteKit endpoints
- Library sub-app improvements: multi-tag search + tag chips + bookmark CRUD
- Splash auth: PBKDF2 600k iterations + 3-strike lockout + clear-error UX
- Settings page (definicoes): theme, language, funMode, clear data, export, import
- i18n: pt-PT primary, English fallback, 60 keys (common + nav + splash + app)
- A11y: skip-link, :focus-visible ring, prefers-reduced-motion, 44×44 touch targets
- docs/architecture.md + docs/adding-a-sub-app.md + CHANGELOG.md
- PRESERVATION.md: 13/13 contract items verified and ticked

### Changed
- Static SPA fallback rewritten via static/_redirects (no Netlify wildcard rewrite)
- package.json version bumped to 5.0.0
- Dexie schema bumped to v4 (biblioteca table added)

### Fixed
- biblioteca/item/[id] page-title bindings (6 svelte-check errors → 0)
- LessonRunner audio control height: 32px → 44px (touch target)
- i18n drift: common.* keys migrated to $t() on most visible UI

### Security
- PBKDF2-SHA256 password hashing (600k iterations, OWASP-recommended)
- Security headers: X-Frame-Options DENY, X-Content-Type-Options nosniff, Permissions-Policy, Referrer-Policy, HSTS preload

## [4.0.0] - 2026-06-27

### Added
- SvelteKit 2 + Svelte 5 + Vite 5 + adapter-static foundation
- Dexie 4 schema with collections (transacoes, orcamentos, categorias, habitos, habit_logs, biblioteca)
- Auth splash with PBKDF2 password gate + 3-strike lockout
- Sub-app registry with 5 sub-apps:
  - Escola: 5 lessons + 5 quizzes (JSON-driven)
  - Trabalhos: assignments with countdown
  - Finanças: dashboard, transactions, budget, categories with chart.js
  - Hábitos: daily check-in + 90-day heatmap
  - Biblioteca: bookmarks with multi-tag search
- Settings page with theme, language, clear/export/import
- PWA: manifest, icons, service worker, offline-ready
- i18n (pt-PT primary, en fallback)
- Easter eggs ported from V3: heart 5-tier, konami, keywords, footer, logo 3-click, secret room
- Hub: progress bar, badge grid, XP counter
- A11y: skip-link, focus-visible, prefers-reduced-motion, 44×44 touch targets
- PRESERVATION.md contract — every V3 feature must keep working

### Changed
- Migrated from vanilla HTML/JS to SvelteKit
- State migrated from localStorage to Dexie (idempotent via `presuntinho-migrated-v4` flag)
- Audio walkthroughs preserved at static/legacy/assets/

### Security
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Permissions-Policy: geolocation/microphone/camera disabled
- PBKDF2-SHA256 600k password hashing

[4.0.0]: https://github.com/Jihzza/presuntinho/releases/tag/v4.0.0