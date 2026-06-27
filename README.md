# Presuntinho — Equivalenza Study Hub

A single-user PWA built with SvelteKit 2 + Svelte 5 + Vite 5 for Fatma's Equivalenza perfume-fragrance mid-term project (2024-2026). Mobile-first, installable, offline-capable, pt-PT.

## Features

- **5 sub-apps**: Escola (courses + lessons + quizzes), Trabalhos (assignments + countdowns), Finanças (transactions + budgets), Hábitos (daily check-ins + heatmap), Biblioteca (bookmarks + multi-tag search)
- **V3 content preserved**: 7 native pages (`/case`, `/course`, `/walk`, `/write`, `/pt`, `/dl`, `/secrets`), 5 audio walkthroughs, 4 downloads, 9+ easter eggs, 8+ secret discoveries
- **PWA**: install to home screen, offline-ready service worker, push notifications-ready
- **Auth**: PBKDF2-SHA256 password gate + 3-strike lockout
- **State**: Dexie (IndexedDB) with idempotent localStorage migration
- **i18n**: pt-PT primary, English fallback
- **A11y**: skip-link, focus-visible rings, prefers-reduced-motion, 44×44 touch targets
- **Responsive**: mobile / tablet / desktop / TV

## Quick start

```bash
npm install --legacy-peer-deps
npm run dev          # http://localhost:5173
npm run build        # outputs to ./build
npm run preview      # preview the production build
npm run check        # type-check (must exit 0)
npm test             # vitest (no tests yet, exits 0)
```

## Live

- Production: https://presuntinho.netlify.app/
- Splash gate: https://presuntinho.netlify.app/splash/

## Project structure

```
src/
├── routes/             # 26 routes (15 pages + 11 sub-routes)
├── lib/
│   ├── components/     # 16 Svelte components
│   ├── state/          # Dexie + stores + migration
│   ├── auth/           # PBKDF2 + session
│   ├── i18n/           # pt-PT + en
│   ├── registry.ts     # sub-app registry
│   ├── easterEggs.ts   # V3 easter-egg port
│   └── {biblioteca,financas,habitos}.ts  # sub-app helpers
├── app.html
└── app.css
static/                # PWA assets + legacy V3 content + downloads
docs/                  # architecture.md + adding-a-sub-app.md
```

See `docs/architecture.md` for the deep dive.

## Adding a sub-app

See `docs/adding-a-sub-app.md`.

## Status

- ✅ Phase 0-15 complete
- ✅ 26 routes, 5 sub-apps, 9+ easter eggs
- ✅ All 13 PRESERVATION contract items satisfied
- 🚀 Ready for delivery to Fatma

## License

Personal project. Single user (Fatma).