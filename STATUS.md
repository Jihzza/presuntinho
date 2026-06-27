# STATUS.md — Presuntinho V4 Migration

> Last updated: 2026-06-27 (Phase 0 complete)

## Where we are

**Phase 0 — Recon: COMPLETE** ✅

## What's done

- **Repo inventoried** (15 files, 5 audio mp3, 2 docs, 1 zip, 1 PNG persona image)
- **`PRESERVATION.md` written and committed** to `main` (commit `1b85a32`)
  - 15 checkboxes for content preservation
  - 15 state keys preserved (Dexie schema mirrors exactly)
  - All 23 heart tiers, 8 secret definitions, 15 badges enumerated
- **Live site verified** at https://presuntinho.netlify.app/
  - All 9 pages load
  - Heart click: +20 XP, badge b10 unlocked, confetti fired, `localStorage.presuntinho` persists state
  - State shape matches migration plan
- **Node v24.13.0, npm 11.5.2** — compatible with SvelteKit 2 + Vite 5/6
- **delegate_task verified** (used in earlier sessions to dispatch Skander 1/2/Piccolo)

## Gate 0 — passed

Per Phase 0 rule 6, no Phase 1 work starts until PRESERVATION.md is committed and confirmed working. **Both criteria met.**

## What's next: Phase 1 — Bootstrap

**Tasks to dispatch:**
- **Piccolo** (≤2 min, task #7): create `package.json` with SvelteKit 2 deps. Verify `npm install` succeeds.
- **Skander 2** (≤15 min, task #8): scaffold SvelteKit project (`npx sv create .` non-interactive OR manual `svelte.config.js` + `vite.config.ts` + `tsconfig.json` + `src/app.html`). Add deps: dexie, @vite-pwa/sveltekit, chart.js, date-fns, lucide-svelte, svelte-i18n, vitest, @playwright/test. Verify `npm run build` produces `build/`.
- **Skander 2** (≤10 min, task #9): move current HTML/JS/CSS into `/static/legacy/`. Set `netlify.toml` build = `npm run build`, publish = `build/`. Create minimal `src/routes/+page.svelte` that serves legacy `index.html` inside `<iframe>`.
- **Skander 1** (≤10 min, task #10): review the bootstrap — verify legacy iframe actually shows current site, verify build pipeline, verify Netlify deploy config. Report blocking issues.
- **You (principal)** commit + push + verify Netlify deploys. **Gate:** site looks identical to current at https://presuntinho.netlify.app/.

## Files in the repo right now

```
presuntinho/
├── .gitignore
├── LICENSE
├── README.md
├── PRESERVATION.md                   ← NEW (Phase 0)
├── STATUS.md                          ← NEW (this file)
├── extract.py                         ← legacy extraction script (V3)
├── index.html                         ← V3 static site (KEEP, will move to static/legacy/ in Phase 1)
├── netlify.toml                       ← KEEP (update for npm build in Phase 1)
├── equivalenza-midterm-deliverables-V3.zip  ← KEEP
├── SLASH_GOAL_V4.pdf                  ← KEEP
├── SLASH_GOAL_V4.txt                  ← KEEP
├── SLASH_GOAL_V4_README.ogg           ← KEEP (TTS of slash goal)
├── SLASH_GOAL_V4_README.txt           ← KEEP
├── docs/
│   ├── Equivalenza_Mid_Term_Fatma.docx  ← KEEP
│   └── Equivalenza_Mid_Term_Fatma.pdf   ← KEEP
└── assets/
    ├── audio_intro_en.mp3             ← KEEP
    ├── audio_intro_pt-PT.mp3          ← KEEP
    ├── intro_swot.mp3                 ← KEEP
    ├── persona_problem.mp3            ← KEEP
    ├── tows_recommendation.mp3        ← KEEP
    ├── buyer-persona-template-v3.png  ← KEEP
    ├── css/styles.css                 ← KEEP
    └── js/
        ├── app.js                     ← KEEP (32 lines, init)
        ├── state.js                   ← KEEP (160 lines, state schema)
        ├── easter-eggs.js             ← KEEP (301 lines, all easter eggs)
        └── quizzes.js                 ← KEEP (138 lines, 5 quizzes)
```

## Outstanding decisions (deferred)

1. **Dark mode scope** — Phase 9, but Skander 1 should preview the CSS variables to confirm what maps cleanly.
2. **i18n default locale fallback** — pt-PT primary, fallback pt-PT (no en on first run). Finalize in Phase 9.
3. **TypeScript strict + `noUncheckedIndexedAccess`** — Phase 10 review will decide.
4. **Sub-app ordering on hub** — 5 default apps in this order: Escola, Trabalhos, Finanças, Hábitos, Biblioteca. User-configurable later.

## Risks to track

- ⚠️ SvelteKit 2 + Vite 5/6 + Node 24 — should work but Node 24 is newer than what most SvelteKit examples target. May hit edge cases.
- ⚠️ Dexie 4 schema migration must not delete existing `localStorage.presuntinho` for one rollback cycle.
- ⚠️ Netlify build command must produce a `build/` directory via `@sveltejs/adapter-static` (no SSR, no Node server).

## Next session principal

1. Read this STATUS.md first.
2. Read `PRESERVATION.md` for the full inventory.
3. Pick up at Phase 1 task #7 (Piccolo creates package.json).
4. Respect the orchestration rules (delegate, don't implement; verify every sub-agent output; gate between phases).

---

**Next action**: send user the Phase 0 status update + invite them to confirm Phase 1 starts.