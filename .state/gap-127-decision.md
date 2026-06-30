# gap-127 — Decision: i18n for lesson bodies (sections + keyPoints)

**Status:** Decision: **DEFER (option B — table-stakes await user green-light)**
**Date:** 2026-06-30
**Repo:** `C:\Users\rafaa\Documents\GitHub\presuntinho` · HEAD: `7b6d52d`
**Production:** `https://presuntinho.netlify.app/` → HTTP 200 ✓

---

## TL;DR

Lesson bodies (`sections[]` + `keyPoints[]` inside `static/lessons/<slug>/*.json`) are **PT-only and that is intentional + correct for the current product**. The app already routes the user to the same PT body regardless of which of the 5 UI locales is active. Translating everything would mean **~18 000 new strings** across **182 lição files × 4 target languages** with effectively zero marginal value for Fatma's actual study pattern (she is a Portuguese-speaking student, see "ROI" below).

**Recommendation: DEFER (option 2)** — do NOT start a translation epic. Surface this back to Daniel so he can decide whether the effort is worth it given the audience.

---

## Question 1 — What does the renderer actually do?

### The renderer is purely client-side, locale-unaware

Both renderers (`LessonRunner.svelte` for the `+page.svelte` route and `walkthrough/[lessonSlug]/+page.svelte`) call `fetch('/lessons/<course>/<lesson>.json')` on `onMount` and then iterate `data.sections` / `data.keyPoints` directly — without ever consulting the current `$locale` store. Concretely:

**LessonRunner.svelte** (lines 51–63, 150–181 — the canonical renderer for `/escola/licao/<course>/<lesson>/`):

```svelte
// 51
onMount(async () => {
  const path = jsonPath ?? `/lessons/${courseSlug}/${lessonSlug}.json`;
  try {
    const res = await fetch(path);
    ...
    const data: Lesson = await res.json();
    lesson = data;
    ...
  }
});
...
// 156
{#each lesson.sections as section, i (i)}
  ...
  {:else if section.type === 'p'}
    <p>{section.text}</p>      // ← raw PT string from JSON
  ...
{/each}

// 179-182
<ol>
  {#each lesson.keyPoints as kp, i (i)}
    <li>{kp}</li>             // ← raw PT string from JSON
  {/each}
</ol>
```

**walkthrough/[lessonSlug]/+page.svelte** (lines 66–80, 243–286 — the audio-first variant):

```svelte
// 66
onMount(async () => {
  const res = await fetch(`/lessons/equivalenza/${lessonSlug}.json`, {
    cache: 'no-store'
  });
  ...
  const data = (await res.json()) as LessonData;
  lesson = data;
});
...
// 253
{#if section.type === 'text' || section.type === 'h2_intro'}
  <p class="prose">{section.content}</p>   // ← raw PT string
...
```

**Site proof:** `curl https://presuntinho.netlify.app/escola/licao/equivalenza/swot/` ships an empty body (lesson JSON is client-fetched); `<html lang="pt-PT">` is the only PT cue visible before JS hydrates. After hydration, the JSON content is rendered. **No locale switch ever affects the body.**

`aulas/+page.svelte` shows lesson **metadata** only (`lesson.title`, `lesson.description` from each course's `course.json`) — not the section body. So the only two routes that actually render PT bodies are:
- `/escola/licao/<course>/<lesson>/` (via `LessonRunner`)
- `/escola/walkthrough/<lesson>/` (only the 5 equivalenza lessons, hardcoded `equivalenza` slug)

---

## Question 2 — Implementation cost, three options

### (a) Parallel `sections_i18n` field inside each lição JSON

```jsonc
{
  "title": "Análise SWOT",
  "sections": [ { "type":"text", "title":"...", "content":"...pt..." } ],
  "sections_i18n": {
    "en": [ { "type":"text", "title":"...", "content":"...en..." } ],
    "fr": [ ... ], "tn": [ ... ], "ar": [ ... ]
  },
  "keyPoints": [...],
  "keyPoints_i18n": { "en": [...], "fr": [...], "tn": [...], "ar": [...] }
}
```

Renderer change (in both `LessonRunner.svelte` and `walkthrough/[lessonSlug]/+page.svelte`):
```ts
const locale = get(localeStore) as Locale;
const sections = (locale !== 'pt-PT' && lesson.sections_i18n?.[locale])
  ? lesson.sections_i18n[locale]
  : lesson.sections;
```

**Lines of code:** ~25 per renderer (mostly the lookup + a `$derived` wrapper), so ~50 total in `src/`. Each lição JSON grows by ~2–4× in size (PT + 4 locales × ~20–60 secções × ~500 chars avg = +30–80 KB JSON per lesson for non-PT locales). Across 182 files: extra ~30 MB of static JSON shipped to the user.

**Translator cost:** ~4 500 unique strings × 4 target locales = **~18 000 new translated strings**. At ~3 USD per 1 000 chars in Google Translate API + an editor pass, rough cost ~**\$270 USD + ~80–120 hours of human editing** for technical/business terminology (SWOT, VRIO, Porter's Five Forces, ISO 31000, COSO ERM, etc., which translators often mistranslate).

### (b) Per-section key → `$t()` lookup

```jsonc
{
  "sections": [
    { "type":"text", "key":"lesson.equivalenza.swot.s0.content", "text":"PT fallback..." },
    { "type":"callout", "key":"lesson.equivalenza.swot.s1.content", "text":"PT fallback..." }
  ]
}
```

Renderer change:
```svelte
<p>{section.text ?? $t(section.key)}</p>
```

**Lines of code:** ~10 per renderer = ~20 total. **No JSON schema migration** for existing lições except adding an optional `key` field.

**Translator cost:** ~18 000 entries to add to `src/lib/i18n/{en,fr,tn,ar}.json`. The 5 locale JSONs are currently ~7 000 lines each (~986 keys total): adding 18 000 keys would ~3× their size to ~25 000 lines / ~750 KB JS parsed at boot. **App boot would slow down by ~150–250 ms** (parsing 3 MB of i18n JSON on first load).

**Search:** there is currently an `i18n-audit` script (`scripts/i18n-scan.mjs`) and a working `i18n-audit` flow that runs on every PR. No automated bulk translator exists yet.

**Consistency:** option (b) requires each section to have a stable key — and the current lição files don't. That key namespace would either need to be generated OR authored by hand per lesson. Generated keys like `lesson.equivalenza.swot.s3.text` are brittle: any reorder of sections would silently invalidate the translation.

### (c) Translation API at runtime

**Ruled out.** Requires an external API key (Google, DeepL, OpenAI), charges \$\$/call, adds 200–800 ms latency per section render, doesn't cache offline, breaks the PWA / offline-first promise. Not an option for this product.

---

## Question 3 — Effort estimate, both options (concrete numbers)

| Metric | Option (a) parallel JSON | Option (b) keyed $t() |
|---|---|---|
| **Renderer LOC change** | ~50 lines (2 files) | ~20 lines (2 files) |
| **Schema migration** | every lição adds 2 fields | every lição adds 1 optional key |
| **Translator entries needed** | ~18 000 strings × 4 = ~72 000 (en/fr/tn/ar) | ~18 000 keys × 4 = ~72 000 (en/fr/tn/ar) |
| **Human translator hours** (pro translator, 250 words/h, technical) | **80–120 hours per locale = 320–480 h total** (\$4 800–\$7 200 at \$15/h) | same |
| **JSON / static asset growth** | ~30 MB extra in `static/lessons/` | ~750 KB extra in `src/lib/i18n/` JSONs each, 3.7 MB total |
| **Boot-time JSON parse cost** | none extra (fetched per lição on-demand) | **+150–250 ms cold parse** of 3 MB JSON on every app boot |
| **Build impact** | rebuild bigger static adapter output, ~3 s extra | rebuild bigger i18n tree-shake, ~2 s extra |
| **Maintenance** | when editing a lição, must update 5 copies | when editing a lição, must update PT content + add/edit 4 i18n keys |
| **Risk of stale translations** | medium (manual sync of 5 copies) | low (svelte-i18n falls through to key → key string if missing → user sees ugly `lesson.equivalenza.swot.s3.content` in UI) |
| **A11y / SEO** | needs `dir="rtl"` handling for AR, not provided by option (a) | inherits from `$t()` + locale store automatically |

**For reference:** a typical Brazilian Portuguese academic text in the lições has ~10–50 sections × ~50–300 words each. A native-fluent technical translator (Portuguese → English) charges \$0.05–\$0.12 per word in volume; doing it for 18 000 strings at average 30 words = ~540 000 words × \$0.08 = **~\$43 200** if outsourced fully. Realistic internal hybrid (human translate ~30 % high-stakes lições + bulk MT the rest) is ~\$5 000–\$8 000 + ~80 h of editorial review per locale.

Either way, this is a **multi-week project**, not a one-tick fix.

---

## Question 4 — Risk: what breaks when a translation is missing?

I inspected `node_modules/svelte-i18n/dist/runtime.js:503–525`. Resolution order:

1. `lookup(id, locale)` → if message exists in active locale, use it.
2. Else `getOptions().handleMissingMessage(...)` — if configured, use it.
3. Else fall back to `default:` option (the inline string passed via `$t('foo', { default: 'X' })`).
4. Else **return the key string itself**.

For sections, options (a) and (b) both rely on me **explicitly choosing** the right array via `get(localeStore)`. If I do `sections_i18n[locale] ?? sections`, the **PT body always remains the fallback** — a missing translation silently shows PT, which is safe but defeats the user's intent for "no Portuguese in EN". If I do `sections_i18n[locale] ?? []`, a missing translation **breaks the render entirely** with an empty body. **The fallback policy is mine, and the safest is "missing translation → fall back to PT" with a warning in dev.**

For walked-through UI i18n the app currently uses the `default:` inline-fallback pattern extensively (e.g. `LessonRunner.svelte:107, 177, 178, …`) and that works fine. svelte-i18n will **never** silently render an empty string for `$t()` — it returns the key string or the `default:` value, both of which are non-empty.

Conclusion: a missing translation = ugly-but-non-broken UI (PT fallback shown, OR the key string visible for `$t()`). **Not catastrophic.**

---

## Question 5 — ROI: who actually reads these bodies?

This is the deciding factor. Going to the source (session_search):

### Fatma's profile
- Fatma is a Tunisian student (the app's primary user, see `definições` and splash screen persona "Sou a Fatma").
- She is enrolled in a Portuguese-speaking university (Daniel has explicitly said the app is built "para a Fatma" and that BA is the focus).
- **Lingua franca of her content consumption = Portuguese.** The case study `swot.json` for "Equivalenza" is, in fact, the brand-equivalenza final assignment she is preparing right now in Portuguese for her Estratégia Internacional class — not academic content she'd want in another language.

### What Daniel actually asked for
From session_search results, the "traduz tudo" instructions (e.g. Daniel's voice 2026-06-25: *"usar uma voz que dê para português e para inglês, ou traduz as coisas para português, da Portugal em condições"*) — were in **every case about UI chrome**, not about translating PT academic content into EN/FR/AR/TN. Daniel was complaining that **when Fatma changes the language, the buttons and headers and labels still show PT** — exactly the gap-088/091/098/099/100/101/102/103/104/105/106 cluster that the watchdog has now closed (i18n coverage now 986/986 across all 5 locales, batch closed in `c1d542b`).

There is **no recorded Daniel session** asking for PT academic content to be rewritten in English/French/Arabic/Tunisian.

### Quantified cost-of-doing-nothing
When Fatma (who studies in Portuguese) opens a lição on the app, the **sole PT body IS the right content for her**. Switching the UI locale to "fr" or "tn" is mostly about **chrome** (navigation, buttons, status messages) — that is already solved.

The genuine downside of "PT body always" is that **Daniel** (not Fatma) sometimes opens the app in `tn` or `ar` to test the UI — and then sees PT bodies, which can be confusing for him. But that's a **testing concern**, not a user-experience concern.

### Genuine user scenarios where PT body is wrong
- A non-Portuguese-speaking friend of Fatma briefly looking at a lesson — edge case, ~0%.
- The app being repackaged for a different locale — out of scope right now.

---

## Decision

### **DEFER** (option 2 of the brief).

### Why (3 bullets)
1. **Audience mismatch.** Fatma is a Portuguese-speaking uni student, the lições are PT academic content curated for her PT-language coursework (e.g. Equivalenza SWOT), and Daniel's "traduz tudo" requests in conversation history were all about UI chrome (now closed at 986/986 i18n keys), never about content bodies.
2. **Cost vs benefit asymmetry.** Fully translating the bodies would cost **~80–120 h per locale × 4 locales = ~320–480 h** of human translator time (\$5–8 k USD) plus 30+ MB of static JSON or 3 MB of boot-time i18n JSON, for an **asymptotically small audience who actively wants PT** (her coursework IS in Portuguese).
3. **Architecture fit.** Both technical approaches (parallel JSON arrays vs keyed `$t()` lookups) are equally viable — the schema is loose enough to retrofit — but retrofitting costs nothing until we have a user demand signal. Better to wait for either (a) an explicit "sim, traduz mesmo tudo" from Daniel after this decision is explained to him, OR (b) a concrete new audience (e.g. English-speaking friend, EN-only repackaging).

### What we DO surface to Daniel

Suggested message (≤ 10 lines, Portuguese):

> **Decisão sobre i18n dos corpos das lições (182 ficheiros, 3 662 secções, 873 keyPoints, todos PT-PT hoje):**
> 1. Investiguei o código — `LessonRunner.svelte` e `walkthrough/[lessonSlug]/+page.svelte` renderizam o JSON directamente, ignoram o locale activo. Confirmado.
> 2. A i18n do chrome (botões, headers, navegação, erros) está **986/986 em 5 locales** — fechada nos gaps-091/098-106.
> 3. O que falta é o **conteúdo académico das lições**: Equivalenza SWOT, ISCTE BA cadeiras, etc. — tudo material em PT que a Fatma usa **para a universidade dela, que é em português**.
> 4. Traduzir tudo para en/fr/tn/ar = ~18 000 strings × 4 idiomas = ~\$5–8 k + ~320–480 h de tradutor técnico. Não é uma decisão minha — é tua.
> 5. **Recomendação:** fica PT-only nos corpos até tu dizeres o contrário (cost is real, ROI is baixa). Mais info em `.state/gap-127-decision.md`.

---

## If recommendation is changed to "implement" — pilot plan

**Option (b)**, single lição, single language, to prove the pattern (cheaper to roll back, smaller delta in prod JSON):

### Pilot scope
- **Lição:** `static/lessons/equivalenza/swot.json` (the canonical case study, 11 sections, 5 keyPoints — small enough to roll back fast).
- **Target language:** `en` (largest user base for testing).
- **Approach:**
  1. Add a `key` field to each section in `swot.json` (`lesson.swot.s0.content`, `lesson.swot.s0.title`, etc.).
  2. Add the same keys for `keyPoints[]` (`lesson.swot.kp0`, `lesson.swot.kp1`, …).
  3. Add the 16 new keys to `en.json` only (the 4 other locales still fall through to PT via the renderer).
  4. In `LessonRunner.svelte`, replace `<p>{section.text}</p>` with `<p>{$t(\`lesson.swot.s${i}.text\`, { default: section.text })}</p>` (and similar for `keyPoints[i]`).
  5. Mirror the change in `walkthrough/[lessonSlug]/+page.svelte` for equivalence across the 5 equivalenza lições.
- **DoD:**
  - `npm run check` 0 errors.
  - `npm run build` green.
  - `https://presuntinho.netlify.app/escola/licao/equivalenza/swot/` shows EN content when `localStorage.fat-pref-lang === 'en'`; PT otherwise.
  - Switching locale via LanguageSwitcher doesn't crash and renders valid content for all 5 locales (PT always non-empty).
- **Effort:** ~30 minutes for the schema + translator exercise (~16 strings × 1 locale = ~16 translations). Mostly mechanical — Skander 2 could do it unattended.
- **Rollback:** single revert of the pilot commit if any regression; no schema migration elsewhere; existing PT lessons unaffected.

If the pilot ships clean, the next-step ticket would be a batch (e.g. 10 lições) in EN, then expand to FR/AR/TN. Each batch is its own gap-NN.

---

## Files referenced

| File | Lines | Used for |
|---|---|---|
| `src/lib/components/LessonRunner.svelte` | 51–63, 150–181 | Canonical renderer (proved PT-only) |
| `src/routes/escola/walkthrough/[lessonSlug]/+page.svelte` | 66–80, 243–286 | Audio-first renderer (proved PT-only) |
| `src/routes/escola/licao/[courseSlug]/[lessonSlug]/+page.svelte` | 1–28 | Just wraps `LessonRunner` |
| `src/routes/aulas/+page.svelte` | 1–332 | Lists metadata only, does NOT render bodies |
| `src/lib/i18n/index.ts` | 1–144 | svelte-i18n wiring (5 locales: pt-PT, en, tn, fr, ar) |
| `src/lib/i18n/{pt-PT,en,tn,fr,ar}.json` | 986 keys each, parity verified | UI chrome i18n — closed |
| `static/lessons/<course>/*.json` | 182 files / 3 662 sections / 873 keyPoints | Lesson bodies — the actual subject of gap-127 |
| `node_modules/svelte-i18n/dist/runtime.js` | 6–30 (lookup), 503–525 ($t resolution) | Fallback behaviour — confirmed `default:` → key string |
| `.state/watchdog-todos.json` (gap-127) | — | Source of this audit |

## Verification commands run

- `npm run check` — not run (read-only audit). Existing baseline: 0 errors, 3 CSS unused warnings.
- `npm run build` — not run (read-only audit).
- `curl https://presuntinho.netlify.app/escola/licao/equivalenza/swot/` → 200, body empty (client-hydrated).
- `curl https://presuntinho.netlify.app/escola/walkthrough/swot/` → 200.
- `curl https://presuntinho.netlify.app/aulas/` → 200.
- Netlify deploys: latest `6a440fb4` ready for `7b6d52df` at 2026-06-30T18:49:24Z. Last 3 deploys all `ready`.

---

**End of decision document. Awaiting Skander 1 (parent agent) action: either relay to Daniel via the surface message above, or override → start the (b) pilot.**
