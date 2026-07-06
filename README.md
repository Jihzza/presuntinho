# 🐷 Presuntinho

**A personal, gamified life companion — study, finances, habits, moods, love and a private AI agent, all in one installable app.**

Presuntinho is a private Progressive Web App built as a gift: an intimate, cute-but-professional daily hub for one person (Fatma), with a shared couple layer for two. It blends a Duolingo-style study companion, a simple personal-finance tracker, habit streaks, mood tracking, a memories timeline, a private WhatsApp-style chat, and an AI agent — all local-first, offline-capable, and multilingual.

🔗 **Live:** https://presuntinho.netlify.app · **Splash gate:** https://presuntinho.netlify.app/splash/

> This is a personal project for two people, not a generic product. The design is deliberately warm and personalised.

---

## ✨ What's inside

### Daily hub
A mood-aware home screen: time-of-day greeting, activity streak 🔥, XP level, **daily quests** (Duolingo-style), today's agenda with one-tap actions, a week strip, and a quick map of every corner of the app.

### Study — Escola
Courses, lessons and quizzes (221 lessons, 52 quizzes) with a **progression path** (winding map of unlocked/current/completed units), a real **academic dashboard** (per-subject progress, "continue where you left off", upcoming deadlines), **quiz victory screens** (accuracy ring, XP, streak flame, mascot reactions, confetti), quiz history + answer review, and assignments/deadlines (Trabalhos).

### Finances — Finanças
Transactions CRUD, categories, monthly **budgets** with warnings + "safe to spend", recurring transactions, **savings goals** (metas), month-comparison reports, and mobile-readable theme-aware charts. Gentle and non-judgmental by design.

### Habits — Hábitos
Daily / weekly / custom-weekday cadences, streaks with milestone rewards, templates, weak-day analytics, and satisfying completion celebrations.

### Moods — Humor
A gentle daily check-in (feeling + tags), full mood history persisted locally, a month heatmap, and soft pattern insights. Three app-wide "vibes" (Sick / Soft / Love) adapt the app's tone and pressure.

### Love & delight
A **memories timeline** (Memórias) built from badges, secrets, special dates and love notes; a private **Mensagens** app (WhatsApp-style chat, just the two of them); date-aware and keyword easter eggs; a **secret arcade** with mini-games (including a real-time *versus* mode); collectible **mascots** 🐷🧴⚽🐱🏍️🦅💖; and a couple layer with shared points and presence.

### AI agent — Agente
An in-app chatbot backed by a self-hosted [Hermes](https://github.com/NousResearch/hermes-agent) gateway, with streaming replies, multiple conversations, a media gallery (images / audio / files / links), and an **offline keyword-engine fallback** so it still answers without the gateway.

### Everything else
Calendar (unified agenda across habits, school, finances, moods, events), a notifications center, a bookmark library (Biblioteca), a notebook (Caderno), profiles & device pairing, and a rich settings page (13 themes, 5 languages, backup export/import).

---

## 🧱 Tech stack

| Layer | Choice |
|---|---|
| Framework | **SvelteKit 2** + **Svelte 5** (runes) + **Vite 5** + **TypeScript 5** |
| Rendering | SPA — `@sveltejs/adapter-static` (SSR disabled), deployed on **Netlify** |
| Local data | **Dexie** (IndexedDB), schema v9, per-profile databases — local-first & offline |
| PWA | `@vite-pwa/sveltekit` (Workbox), installable, offline app shell, update-on-prompt |
| i18n | `svelte-i18n` — **pt-PT** (canonical), **en**, **fr**, **ar** (RTL), **tn** (Tunisian, Latin script) |
| Charts | Chart.js · **Icons** lucide-svelte + emoji · **Dates** date-fns |
| Realtime | **Supabase Realtime** (couple presence, versus arcade, profile/progress sync) |
| Serverless | **Netlify Functions** (private chat, mood/love sync, pairing) + **Edge Function** (AI agent proxy), all over `@netlify/blobs` |

---

## 🏛️ Architecture notes

- **Local-first.** Almost everything lives in the browser's IndexedDB via Dexie and works fully offline. Cross-device features are additive layers on top, never a hard dependency.
- **AI agent path.** The browser calls a same-origin Netlify **edge function** (`/api/agent/*`) that injects the API key server-side and forwards to a self-hosted Hermes gateway (exposed via a Tailscale Funnel). No key ships in the client bundle; every device works with zero setup. See [`docs/`](docs/) and the memory notes for the gateway runbook.
- **Private messaging.** A Netlify function stores an append-only, day-chunked message log in Netlify Blobs, gated by per-person bearer tokens; the client polls with a `since` cursor and keeps an offline outbox.
- **i18n is a product gate.** Every user-facing string is a `$t('key')` lookup; the five locale files are kept at exact key parity, `ar` renders RTL, and `tn` is validated to contain no Arabic-script characters.
- **Gamification economy.** All XP flows through a single audited table (`awardXP('reason')`) with anti-farming guards; streaks, levels, quests, badges and mascots read from shared helpers.

---

## 📁 Project structure

```
src/
├── routes/                 # ~54 routes (hub, escola, financas, habitos, humor,
│                           #   memorias, agente, mensagens, calendario, secrets, …)
├── lib/
│   ├── agent/              # Hermes client, streaming, conversations, offline engine
│   ├── state/              # Dexie schema (db.ts) + stores + backup
│   ├── auth/ · account/    # local PBKDF2 password gate + Supabase accounts (@handle)
│   ├── i18n/               # 5 locale JSONs + setup
│   ├── gamification/       # xp/levels/streaks/quests/badges/mascots
│   ├── escola/             # course catalog + progress
│   ├── couple/ · multiplayer/   # Supabase realtime (couple sync + versus arcade)
│   ├── arcade/             # secret mini-games engine + games
│   ├── chat/ · mood/ · vida/ · profile/ · pwa/
│   ├── components/         # 61 Svelte components (incl. ui/ primitives)
│   └── {financas,habitos,biblioteca,trabalhos}.ts   # sub-app helpers
├── app.html · app.css
static/                     # PWA assets, icons, lessons (221), quizzes (52), legacy content
netlify/functions/          # chat.js · love-lock.js · pairing.js
netlify/edge-functions/     # hermes-proxy.ts
scripts/                    # validation gates + tooling
docs/                       # architecture, runbooks, audits
```

See [`docs/architecture.md`](docs/architecture.md) for the deep dive and [`docs/adding-a-sub-app.md`](docs/adding-a-sub-app.md) to extend it.

---

## 🚀 Quick start

```bash
npm install --legacy-peer-deps
npm run dev            # http://localhost:5173
npm run build          # static build → ./build
npm run preview        # preview the production build
```

The app runs fully offline out of the box — the local-first features (study, finances, habits, moods, easter eggs) need no configuration. The networked layers (AI agent, private chat, couple sync) require the environment variables below.

### Environment variables (optional networked features)

| Variable | Purpose |
|---|---|
| `HERMES_GATEWAY_URL`, `HERMES_API_KEY` | AI agent — Netlify edge proxy → self-hosted Hermes gateway |
| `CHAT_TOKEN_FATMA`, `CHAT_TOKEN_DANIEL` | Private Mensagens — per-person bearer tokens |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase Realtime — couple sync + versus arcade |
| `VITE_COUPLE_CHANNEL`, `VITE_COUPLE_ID` | (optional) scope the couple channel |

Server-side secrets (`HERMES_*`, `CHAT_TOKEN_*`) live only in Netlify's environment — never in the client bundle. See [`docs/runbook-chat-tokens-netlify.md`](docs/runbook-chat-tokens-netlify.md) and [`docs/MULTIPLAYER_SETUP.md`](docs/MULTIPLAYER_SETUP.md).

---

## ✅ Quality gates

```bash
npm run check          # svelte-check — must be 0 errors / 0 warnings
npm run check:i18n     # locale key parity across all 5 languages
npm run scan:i18n      # no hardcoded user-facing strings outside i18n
npm run check:depth    # feature-depth gates (seeds, TODO ban, build, routes 200)
npm run quota:gate     # bundle/quota budget
npm test               # vitest (unit tests where present)
```

CI-style conventions the codebase holds itself to: Svelte 5 runes throughout, Dexie schema changes are **additive** (bump the version, never mutate old ones), every new UI string is added to **all five** locale files in the same change, and design tokens (CSS variables) are used instead of hardcoded colors.

---

## ☁️ Deployment

Pushes to `main` deploy automatically to Netlify (`netlify.toml`): `npm run build` → `build/` served as an SPA (all unknown paths rewrite to `index.html`). The service worker precaches the app shell for offline use, and updates surface as an in-app "new version" prompt rather than a silent reload.

---

## 📄 License

Personal project — made with 💕 for Fatma. Not licensed for redistribution.
