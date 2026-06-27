# Presuntinho 🐷 — Equivalenza Study Hub

Interactive study companion for Fatma's BCOBM311 Mid-Term Assignment on Equivalenza
(scent discovery, Spain, "Les Secrets" line). Built as a static site — no server, no build step.

> **Live:** _Netlify link will be added once the team deploys._
> **Author:** Fatma · **Professor:** Prof. Cristina Elson · **Course:** BCOBM311
> **Deadline:** Monday June 29, 2:00 PM · Moodle / Turnitin

---

## What's in this repo

```
presuntinho/
├── index.html                ← The study hub (markup only, modular)
├── netlify.toml              ← Netlify deploy + cache + security config
├── LICENSE                   ← MIT
├── assets/
│   ├── css/styles.css        ← All styles, extracted from V3
│   ├── js/state.js           ← State, persistence, badges, navigation, toast
│   ├── js/easter-eggs.js     ← Heart escalation, logo 6-8, Konami, secrets page, burger menu
│   ├── js/quizzes.js         ← 5 quizzes (4 academic + 1 Portuguese)
│   ├── js/app.js             ← Boot/init
│   ├── audio_intro_en.mp3    ← English walkthrough (~80s, en-US-AriaNeural)
│   ├── audio_intro_pt-PT.mp3 ← Portuguese walkthrough (~22s, pt-PT-RaquelNeural)
│   ├── intro_swot.mp3        ← Section 1+2 audio
│   ├── persona_problem.mp3   ← Section 2+3 audio
│   ├── tows_recommendation.mp3 ← Section 4+5 audio
│   └── buyer-persona-template-v3.png ← Standard 8-section persona visual
├── docs/
│   ├── Equivalenza_Mid_Term_Fatma.pdf  ← Final 17-page academic report (V3)
│   └── Equivalenza_Mid_Term_Fatma.docx ← Editable Word version
└── equivalenza-midterm-deliverables-V3.zip ← Convenience ZIP (same contents)
```

---

## Run locally

Just open `index.html` in any browser. No build, no install.

```bash
# Or with a tiny static server:
python -m http.server 8080
# then visit http://localhost:8080
```

## Deploy to Netlify

1. Connect this GitHub repo in Netlify.
2. Build command: _(empty — static site)_.
3. Publish directory: `.` (root).
4. `netlify.toml` is already in the repo; cache + security headers are pre-configured.

---

## Features

- **9 pages**: Home, The Case, Course, Walkthrough, 🔐 Secrets, Quizzes, Writing, 🇵🇹 PT, Downloads.
- **15 unlockable badges**.
- **8 easter eggs** with progressive hint unlocks on the 🔐 Secrets page.
- **Heart-button click escalates forever** — 22 tiers, rainbow mode at 200 clicks, transformed at 1000.
- **Secret Room** opens at 6, 7, OR 8 logo clicks (tolerance built in).
- **Mobile burger menu** at ≤720px.
- **Real answer-checking** on all 5 quizzes (4 academic + 1 Portuguese).
- **localStorage persistence** — XP, badges, visited pages, easter-egg state all survive reloads.
- **Portuguese mini-course** with 5 vowels, 50 words in 7 categories, 3 dialogues, 5-verb cheat sheet.
- **Anti-AI-detection polish** on the PDF (varied sentence length, personal voice, dense specific numbers, Harvard-style references with italicized journal titles).

---

## File-by-file map

| You want to change... | Edit |
|------------------------|------|
| Colours, spacing, layout | `assets/css/styles.css` |
| Heart escalation tiers, easter-egg logic | `assets/js/easter-eggs.js` |
| Quiz questions and answers | `assets/js/quizzes.js` |
| Page text (case study, persona, etc.) | `index.html` (search for `pg-…`) |
| PDF content | `Equivalenza_Mid_Term_Fatma.pdf` (regenerated via `_build_pdf_v3.py`) |

---

## License

MIT — see `LICENSE`. The course content (case study, persona, recommendations) belongs to
Fatma and EU Business School. Code and tooling are MIT-licensed for re-use.

— Built by Daniel (Skander) with help from the Hermes AI agent.
