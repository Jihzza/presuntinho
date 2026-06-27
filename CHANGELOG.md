# Changelog

All notable changes to Presuntinho are documented in this file.

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