# CHECKLIST — Depth Gates (task-063)

This checklist covers the **5 manual gates** of the phase-depth plan
derived from the task-049 audit. The other 5 gates (1, 4, 5, 8, 9) are
fully automated by `scripts/depth-gates.mjs` and run via:

```bash
npm run check:depth
```

Manual gates require a human eye (or an out-of-process tool like
Lighthouse / axe-core / Playwright) and intentionally live here as a
markdown checklist rather than as code.

---

## How to run the full audit

1. `npm run check:depth` — runs gates 1, 4, 5, 8, 9.
2. Walk through sections [G2], [G3], [G6], [G7], [G10] below.
3. Anything not ticked is a release blocker.

---

## [G2] — Empty-state is informative per sub-app

**Why manual:** an empty-state is a UX judgement call — "informative"
means it tells the user (a) what the section is for, (b) what to do
next, and (c) optionally a primary CTA. A grep cannot tell.

For each sub-app, open it on a *fresh* browser profile (or after
`IndexedDB` clear) and verify:

| Sub-app           | Route                          | Empty-state shows                                            | OK |
| ----------------- | ------------------------------ | ------------------------------------------------------------ | -- |
| Finanças          | `/financas`                    | What finanças is + "Adicionar transação" CTA                | ☐  |
| Finanças — Trans. | `/financas/transacoes`         | Same                                                          | ☐  |
| Finanças — Cat.   | `/financas/categorias`         | Same                                                          | ☐  |
| Finanças — Orç.   | `/financas/orcamento`          | Same                                                          | ☐  |
| Finanças — Rel.   | `/financas/relatorios`         | Same                                                          | ☐  |
| Hábitos           | `/habitos`                     | What hábitos is + "Criar hábito" CTA                        | ☐  |
| Hábitos — Novo    | `/habitos/novo`                | Form, not an empty-state                                     | ☐  |
| Biblioteca        | `/biblioteca`                  | What biblioteca is + "Adicionar marcador" CTA               | ☐  |
| Trabalhos         | `/trabalhos`                   | What trabalhos is + "Adicionar trabalho" CTA                | ☐  |
| Escola — Hub      | `/escola`                      | What escola is + link to curso                               | ☐  |
| Curso             | `/escola/curso/<slug>`         | Lessons list, not empty-state                                 | ☐  |
| Lição             | `/escola/licao/<c>/<l>`        | Lesson body + nav                                            | ☐  |
| Caderno           | `/escola/caderno`              | What caderno is + create-assignment CTA                       | ☐  |
| Quiz              | `/escola/quiz/<slug>`          | First question, not empty-state                               | ☐  |
| Walkthrough       | `/escola/walkthrough/<slug>`   | First step                                                   | ☐  |
| Aulas             | `/aulas`                       | Class schedule or "no class" empty-state                     | ☐  |
| Agente            | `/agente`                      | Welcome + input                                               | ☐  |
| Login             | `/login`                       | Profile picker or login form                                  | ☐  |
| Splash            | `/splash`                      | Branding + continue                                           | ☐  |
| PT                | `/pt`                          | Portuguese practice intro + start                             | ☐  |
| Definições        | `/definicoes`                  | Settings always render (no empty-state needed)               | ☐  |
| Casa (Home)       | `/`                            | Hub tiles — never "empty"                                    | ☐  |

Each empty-state must mention the **name of the section** and a
**single primary action** the user can take. Generic "No data" copy
fails this gate.

---

## [G3] — End-to-end smoke per sub-app

**Why manual:** end-to-end means clicking through the real UI with
seed data present, on a real browser, with a real IndexedDB. A curl
loop would only verify that the SPA shell loads.

For each sub-app, perform the canonical user journey:

| Sub-app     | Journey (must complete without console errors)                                                                                              | OK |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -- |
| Finanças    | Add categoria → add transação → edit → filter by month → delete → check `finanças.heatmap` updates                                       | ☐  |
| Hábitos     | Create hábito → tick it today → check streak counter → mark 5/14d → see calendar paint                                                      | ☐  |
| Biblioteca  | Add marcador → link to assignment → open assignment → export JSON → re-import JSON → confirm row count                                    | ☐  |
| Trabalhos   | Add assignment → set deadline → change status (todo → doing → done) → see XP increment                                                      | ☐  |
| Escola      | Open curso → click lição → complete lição → take quiz → see progress bar in caderno                                                       | ☐  |
| Agente      | Ask a question → receive answer → check tokens/XP recorded                                                                                  | ☐  |
| Login       | Select Daniel → enter demo hash → land on `/` → select Fatma → land on `/`                                                                  | ☐  |

**Tools**

* DevTools console (no red errors).
* DevTools Network tab (no 4xx/5xx for own origin).
* `localStorage` / `IndexedDB` (verify rows actually persisted across reload).

---

## [G6] — XP wiring per action (refers to task-062)

**Why manual:** XP deltas are a UX contract — they must fire on the
*right* action, in the *right* amount, with the *right* animation.
Source review is mechanical; visual confirmation is not.

For each XP-yielding action, verify (a) the action triggers XP and
(b) the XP pill in the header increments by exactly the expected
amount:

| Action                              | Expected XP | Source of truth              | OK |
| ----------------------------------- | ----------- | ---------------------------- | -- |
| Create transação                    | +5          | `xp-actions.ts`              | ☐  |
| Create categoria                    | +3          | `xp-actions.ts`              | ☐  |
| Edit transação                      | +2          | `xp-actions.ts`              | ☐  |
| Delete transação                    | 0           | (no XP for delete)           | ☐  |
| Create hábito                       | +5          | `xp-actions.ts`              | ☐  |
| Tick hábito (today)                 | +1          | `xp-actions.ts`              | ☐  |
| Streak 7-day bonus                  | +10         | `xp-actions.ts`              | ☐  |
| Add marcador                        | +3          | `xp-actions.ts`              | ☐  |
| Add assignment                      | +5          | `xp-actions.ts`              | ☐  |
| Mark assignment done                | +10         | `xp-actions.ts`              | ☐  |
| Complete a lição                    | +8          | `xp-actions.ts`              | ☐  |
| Pass a quiz                         | +15         | `xp-actions.ts`              | ☐  |
| Daily first-login                   | +2          | `xp-actions.ts`              | ☐  |

See task-062 for the full table and rationale.

---

## [G7] — Lighthouse ≥ 95 + axe-core 0 serious (refers to task-033)

**Why manual:** both tools need a real browser engine (headless Chrome
for Lighthouse, axe-core in a Playwright run). Both are noisy in CI;
the team decided to keep them as a release-day gate rather than a
per-PR gate (see task-033).

**Lighthouse (run on `npm run preview`):**

```bash
npm run build
npm run preview -- --port 4173 &
npx lighthouse http://127.0.0.1:4173/ \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless --no-sandbox" \
  --output=json --output-path=./.audit/lh.json
node -e "const r=require('./.audit/lh.json'); for (const k of Object.keys(r.categories)) console.log(k, Math.round(r.categories[k].score*100))"
```

Score on each of the four categories must be **≥ 95**.

**axe-core (via Playwright):**

```bash
npx playwright test tests/a11y.spec.ts  # if defined; otherwise run axe.run() inline
```

Hard rule: **0** violations of `serious` or `critical` severity.

---

## [G10] — Minimum 3 functional sections per route

**Why manual:** a "functional section" is a UI region that *does*
something the user can interact with (form, list, chart, button
group). A heading + paragraph does not count. A decorative SVG does
not count.

For each top-level route, count the functional sections visible
**without scrolling**:

| Route               | Required ≥ 3 sections, e.g.                                                                                              | Count | OK |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----- | -- |
| `/`                 | Hub tiles (≥4) + greeting + nav                                                                                         |       | ☐  |
| `/financas`         | KPI strip (≥3 cards) + recent transactions + budget gauge                                                               |       | ☐  |
| `/financas/transacoes` | Filter bar + transactions table + summary footer                                                                      |       | ☐  |
| `/financas/categorias` | Categories list + create form + summary                                                                                |       | ☐  |
| `/financas/orcamento`  | Budget table + spent-vs-budget bars + remaining summary                                                                |       | ☐  |
| `/financas/relatorios` | Month picker + chart + KPI cards                                                                                       |       | ☐  |
| `/habitos`          | Habits list (≥5 rows) + calendar + streak stats                                                                         |       | ☐  |
| `/biblioteca`       | Bookmarks list + filter/search + tags                                                                                   |       | ☐  |
| `/trabalhos`        | Assignments table + status filter + deadline indicator                                                                  |       | ☐  |
| `/escola`           | Course cards + progress + nav                                                                                           |       | ☐  |
| `/escola/curso/<s>` | Lessons list + progress bar + quiz CTA                                                                                  |       | ☐  |
| `/escola/caderno`   | Assignments for course + filter + create                                                                                |       | ☐  |
| `/aulas`            | Schedule grid + day detail + tasks                                                                                      |       | ☐  |
| `/agente`           | Chat history + input + tool list                                                                                       |       | ☐  |
| `/definicoes`       | Settings groups (≥3 visible without scroll)                                                                            |       | ☐  |

If a route renders with fewer than 3 functional sections, it is a
release blocker.

---

## Release-day checklist (final pass)

- [ ] `npm run check:depth` → all 5 automated gates **PASS**.
- [ ] Section [G2] — every empty-state tick.
- [ ] Section [G3] — every user journey completes.
- [ ] Section [G6] — every XP action matches the table.
- [ ] Section [G7] — Lighthouse ≥ 95, axe-core 0 serious.
- [ ] Section [G10] — every route has ≥ 3 functional sections.

If every box is ticked, the build is **release-ready** from a
phase-depth perspective.