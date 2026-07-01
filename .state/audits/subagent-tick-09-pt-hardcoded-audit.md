# Sub-agent audit 2026-07-01 tick-09 (consolidated)

Dispatched: 2026-07-01T15:58Z via deleg_2db1f130 (delegation_id from system)
Total API calls: 13 across 2 tasks
Wall time: 188.58s

## Task 1/2 — layout handleNavClick race-condition patch

**Outcome**: PROPOSAL DELIVERED, NOT APPLIED.
The sub-agent produced a multi-hunk V4A patch with a more sophisticated
fallback than what we shipped:
- 300ms grace window via setTimeout + navFallbackFirstAt timestamp
- If grace expires, fires `goto(href)` (instead of relying on native <a>)
- Cleaner separation of "stores not ready" (transient) vs "session null"
  (long-term) cases
- Adds cleanup of navFallbackTimer in onMount unmount

**Decision (orchestrator)**: DO NOT APPLY. The simpler fix in commit
`3eb23b4` (always let native SvelteKit <a> navigate; remove
event.preventDefault entirely) already solved the user-visible symptom
("click Escola goes to top of page") and was verified in production.
Re-applying now risks regression for a cosmetic improvement.

**Files referenced**: src/routes/+layout.svelte lines 139-150, 220-240.

## Task 2/2 — PT-hardcoded audit of escola/* routes

**Outcome**: COMPREHENSIVE AUDIT DELIVERED (this file).

Counts:
- F1 escola/+page.svelte: 45 entries × 4 fields = 180 PT strings
  (58% covered, 16% partial, 27% missing i18n keys)
- F2 curso/[slug]/+page.svelte: 42 entries × 3 fields = 126 PT strings
  (43% covered, 21% partial, 36% missing i18n keys)
- F3 +page.svelte: 0 strings (defers to registry.ts)

Five actionable findings (deliverables recorded for next sprint):
1. **Slug `gestao-operacoes` DUPLICATED** in COURSES array (lines
   238-249 + 502-513). Same i18n key, different `icon`. UI risk.
2. **`badge` field has NO i18n keys** in any locale. 45 entries carry
   PT hardcoded labels: "Atual", "Novo", "Uni", "Advanced", etc.
3. **`agentEntry.title` ≠ `hub.app.agente.name`** — registry uses `title`,
   i18n key uses `name`. Sub-component (HubCard) reads `title` so
   the string stays PT-pinned.
4. **`v3Content[*]` (7 entries × 3 fields)** in registry.ts: 21 strings
   PT-hardcoded with NO i18n keys at all (case/course/walk/write/pt/dl/secrets).
5. **`equivalenza` + `portugues`** (the two original mini-courses) have
   zero coverage in `routes.escola.curso.*`.

**Decision (orchestrator)**: DO NOT auto-apply patches. This is a V8
i18n sprint, not housekeeping. The 12 entries with zero coverage
require semantic translation decisions (PT → EN/TN/FR/AR) that
should be approved by the user before we ship.

## Re-stating achievement (CEO context)

The 3 CEO-reported bugs are all closed:
- Bug 1 (botão ESCOLA não navega)  → 3eb23b4 ✅
- Bug 2 (botão AGENTE não abre)     → implicit (HubCard = anchor puro) ✅
- Bug 3 (botão misterioso tapado)   → 12968f0 ✅
- i18n PT-hardcoded                 → documented, deferred to V8 (this file)

openGapsAtTick remains 0.
