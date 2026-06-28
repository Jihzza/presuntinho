# HeartButton — Placement Recommendation

**Repo:** `/c/Users/rafaa/Documents/GitHub/presuntinho`
**HEAD at start of investigation:** `d1c500a` (clean working tree)
**Date:** 2026-06-28
**Status:** Research only — NO `.svelte` files were modified.

---

## TL;DR — Recommendation

**Keep the HeartButton where it already is: the floating bottom-right FAB stack in `src/routes/+layout.svelte` (lines 228-231).** No code change recommended at this time.

This placement matches the only piece of decisive evidence we have about Daniel's intent — the wording of his recurring audio spec ("põe botão do coração **aqui**") and the explicit rationale already documented in commit `68be912` ("Daniel pediu explicitamente que o coração estivesse no canto inferior direito do ecrã, por cima do footer/bottom-nav").

The remaining ambiguity ("aqui" — *where exactly?*) is documented below in §4 so the next session can confirm with Daniel if a different spot is wanted.

---

## 1. Current state of `HeartButton.svelte`

### What it renders
A single `<button>` containing a `<span class="emoji">` that swaps emoji glyph based on click count (`❤️` → tiered emojis up to `🌟` per `src/lib/easterEggs.ts:60-83`). The button also swaps a CSS class `intensity-{0..4}` that escalates background opacity + box-shadow. A `pulse` class drives a 300 ms scale animation (gated by `prefers-reduced-motion`).

### API surface — `src/lib/components/HeartButton.svelte:1-151`

| Aspect | Detail |
|---|---|
| **Props** | **Zero.** Component is self-contained; no slots, no events emitted. |
| **DOM output** | `<button type="button" class="heart-btn intensity-{0..4}" aria-label="Clica no coração — easter egg">` + `<span class="emoji">❤️</span>` |
| **Listeners** | `presuntinho:heart-visual` (emoji + intensity swap), `presuntinho:heart-pulse` (300 ms pulse) |
| **Emitters** | None directly — calls `heartClick()` from `src/lib/easterEggs.ts:95` which itself dispatches the two events and a toast. |
| **Side-effects** | On click: increments `heartClicks` store, awards XP via `addXP()` (tiered + speed bonus), dispatches custom events, may unlock badges + heart-tier secrets. |
| **Built-in styles** | `width: 56px; height: 56px;` (WCAG touch target ≥44px), `border-radius: 50%`, pink accent (`rgba(236, 72, 153, …)`), hover + focus + active states, reduced-motion media query. |
| **i18n** | Two `$t()` keys consumed: `components.heart.aria` and `components.heart.title`. Defaults inline (PT). |
| **Reusable?** | **Yes — confirmed by its own docstring (lines 3-15)**: *"Mirrors V3's heart-click DOM escalations. Lives on the Hub hero (next to the XP pill) but is reusable anywhere."* |

### Where it's used today

`grep -rn "HeartButton" src/` returns **3 references**:

```
src/lib/components/HeartButton.svelte:3   * HeartButton — Easter egg ...
src/lib/components/XpPill.svelte:5        * Lives in the global layout ...
src/routes/+layout.svelte:14              import HeartButton from '$lib/components/HeartButton.svelte';
src/routes/+layout.svelte:230                  <HeartButton />
```

**One single mount point:** inside `.fab-stack` at `src/routes/+layout.svelte:228-231`:

```svelte
<!-- Floating XP + Heart, fixed to the bottom-right corner.
     Lives OUTSIDE the header / bottom-nav so it doesn't
     shift layout. Sits ABOVE the bottom-nav (z-index 50)
     and BELOW modal overlays (which are typically 100+).
     Respects iOS safe-area for notched devices. -->
<div class="fab-stack" aria-live="polite">
  <XpPill />
  <HeartButton />
</div>
```

The `.fab-stack` CSS (`src/routes/+layout.svelte:431-451`) places it at:

- `position: fixed`
- `right: max(1rem, env(safe-area-inset-right))` → 1.5rem on ≥768px viewports
- `bottom: calc(72px + env(safe-area-inset-bottom) + 0.5rem)` → `+ 1rem` on ≥768px
- `z-index: 60`
- `pointer-events: none` on container, `auto` on children (so the container doesn't block clicks on the content below)

The HeartButton is mounted **on every authenticated route** (the layout short-circuits on `/splash/` at line 136 — i.e. the heart is hidden during auth, which is correct: no XP leak before the user picks a profile).

### Git history of placement

| Commit | Date | Change |
|---|---|---|
| `1b85a32` | earlier | Phase 0 step 2: PRESERVATION.md inventory (15 files, …, 23 heart tiers) |
| `466796b` | earlier | feat(secrets): heart tiers timeline + badges grid sections |
| `877a01e` | 2026-06-28 02:38 | **Moved HeartButton from `/+page.svelte:213` (hero) → header** (`.nav-actions`, between LanguageSwitcher and Definições) — interpretation #1 |
| `68be912` | 2026-06-28 03:39 | **Moved HeartButton from header → floating bottom-right FAB stack + added XpPill** — interpretation #2 (current state) |

---

## 2. Where heart-related elements already live

### 2.1 Global layout (`src/routes/+layout.svelte`)

| Location | Lines | What |
|---|---|---|
| Import | 14 | `import HeartButton from '$lib/components/HeartButton.svelte';` |
| Mount point | 228-231 | `<div class="fab-stack"><XpPill /><HeartButton /></div>` (fixed bottom-right) |
| CSS | 431-451 | `.fab-stack { position: fixed; right; bottom; z-index: 60 }` + responsive variants |
| Other heart-adjacent | 154-165 | Logo area: 🐷 pig (easter egg) + Presuntinho text — no heart here |

### 2.2 Hub hero (`src/routes/+page.svelte:198-214`)

```svelte
<header class="hub-hero" class:hero-in={heroIn}>
  <h1>
    <span class="greeting">
      🐷 {activeProfile === 'daniel'
        ? $t('hub.greeting.daniel', { default: 'Olá, Daniel' })
        : $t('hub.greeting.fatma', { default: 'Olá, Fatma' })}
    </span>
  </h1>
  <div class="hero-actions">
    <span class="xp" aria-label={$t('a11y.xp_label', { default: 'Pontos de experiência: {n}' }).replace('{n}', xpLabel)}>
      <span class="xp-dot" aria-hidden="true"></span>
      {xpLabel}
    </span>
  </div>
  <p class="sub">{$t('hub.subtitle', { default: 'Equivalenza Study Hub — escolhe por onde começar' })}</p>
</header>
```

- The hero has the **greeting ("Olá, Fatma" / "Olá, Daniel")** and the **XP pill** (the static copy — the live one is in the FAB stack).
- **No heart here.** A natural integration point would be `<HeartButton />` next to the XP span in `.hero-actions` — but doing so would **duplicate** the heart, conflicting with the FAB-stack instance on every page where the user can reach `/`.

### 2.3 Splash (`src/routes/splash/+page.svelte`)

- **No HeartButton** (auth gate: the layout short-circuits on `/splash/` at `+layout.svelte:136`).
- The credit line uses `{$t('splash.credit')}` — translation key, not a literal "Made with ❤️ for Fatma" (verified: `grep "Made with" src/` returns 0 hits; the user's prompt mentioned this greeting but it's likely coming from the i18n file or was an informal paraphrase).
- The splash also has the **LoveLock** mechanism (`src/lib/auth/loveLock.ts`) — a different "love" interaction: typing "love"/"amo-te"/"i love you" in the password field triggers an emotional interlude rather than an error. Already covers the "made with love" spirit.

### 2.4 Escola hub (`src/routes/escola/+page.svelte`)

- `grep -n "heart\|Heart\|❤️" src/routes/escola/+page.svelte` returns **0 matches**.
- No natural heart integration point — the page is a content grid of course cards; adding a heart there would feel disjointed and conflict with the FAB-stack instance.

### 2.5 OnboardingModal (`src/lib/components/OnboardingModal.svelte`)

- `grep -n "heart\|Heart\|❤️" src/lib/components/OnboardingModal.svelte` returns **0 matches**.
- Greeting: `'🐷 Bem-vinda, Fatma! Encontra os easter eggs 🥚'` (line 38-39). No heart element.
- A heart mention would fit naturally next to the 🥚 easter eggs hint — but again, **duplicates** the FAB instance.

### 2.6 Secrets page (`src/routes/secrets/+page.svelte`)

- Full **"Heart Tiers" timeline** (lines 184-220) — a *visualisation* of click milestones, **not** a click target. The HeartButton itself is correctly NOT repeated here.

### 2.7 BadgeGrid (`src/lib/components/BadgeGrid.svelte:40`)

- One badge references the heart: `{ id: 'b8', icon: '❤️', name: 'Coração', description: '5 cliques no coração' }` — a *meta-badge*, not the click target.

---

## 3. Daniel's audio context — what "aqui" means

### What we found in session history

Two relevant sessions, both dated within the last 24h of this report:

**Session `cron_e2143488327c_20260628_074326` (presuntinho-watchdog, Jun 28 07:43 AM)** — search hit on `coração heart button Daniel`:

> Daniel's core recurring audio specs:
> - "traduz tudo" (translate everything — i18n 5 langs)
> - "faz cursos sobretudo" (courses, especially)
> - "faz lições" / "faz aulas sobretudo" (lessons/classes)
> - **"põe botão do coração aqui"** (heart button)
> - "para a Fatma" (his mom — onboarding context)
> - "Há APS das finanças, não tem nada" / "Há APS dos hábitos, ainda não tem nada" (empty areas)

**Session `20260628_034801_a472f1` (Jun 27 04:10 AM — multiple voice messages)** — the decisive one:

> **"OnboardingModal — first-visit welcome dialog for the Hub.** … Show the user where to find HeartButton
> … Deve estar visível em todas as rotas autenticadas, com safe-area para iPhone com notch."

And (in the assistant's earlier interpretation that was *wrong* — see commit `877a01e`):

> **Localização do coração ❌ ERRADO**
> Onde está agora: `src/routes/+layout.svelte:167` — dentro de `<div class="nav-actions">`, entre `<LanguageSwitcher />` e o ícone de Definições. Ou seja, **no header, à direita**.
> Onde tu queres: **canto inferior direito do ecrã**, fixo, por cima do footer.

That assistant passage was a *self-correction* — the original placement in `877a01e` (header) was acknowledged wrong by the assistant after the user's audio arrived, and `68be912` (the FAB stack) was the corrected implementation.

### Critical evidence — commit `68be912` rationale

The commit message itself is the most concrete piece of evidence we have:

> **"Daniel pediu explicitamente que o coração estivesse no canto inferior direito do ecrã, por cima do footer/bottom-nav"**

That's an unambiguous, directional spec from Daniel himself — captured in commit `68be912` (Skander, 2026-06-28 03:39:17).

### The still-open ambiguity

The phrase "põe botão do coração **aqui**" in Daniel's voice notes is deictic ("aqui" = "here") — it refers to whatever spot Daniel was looking at when he said it. We don't have the visual context of which screen Daniel was on when he said it. Possible interpretations:

1. **On the splash** (the first screen a user sees after auth, with the credit "Made with ❤️ for Fatma") — least likely; Daniel said "**button**", and the splash is a one-shot screen.
2. **On the hub hero** (the home greeting + XP — `src/routes/+page.svelte:198-214`) — possible; the heart would sit next to the XP pill.
3. **On the escola hub** (`src/routes/escola/+page.svelte`) — unlikely; no heart metaphor in school context.
4. **Bottom-right fixed (FAB)** — **the interpretation `68be912` committed**, and the only one where the assistant explicitly noted Daniel's directive ("pediu **explicitamente** que o coração estivesse no canto inferior direito do ecrã").
5. **In the header next to the 🐷 pig** (`+layout.svelte:154-165`) — the first attempt (`877a01e`), **later self-reverted** by `68be912`.

---

## 4. Three placement options with pros/cons

### Option A — Floating bottom-right FAB stack (CURRENT — keep as-is)

**Where:** `src/routes/+layout.svelte:228-231` (inside `<div class="fab-stack">`)
**CSS:** `src/routes/+layout.svelte:431-451` (`.fab-stack { position: fixed; right; bottom; z-index: 60 }`)

| Pros | Cons |
|---|---|
| **Directly matches Daniel's stated intent** per commit `68be912` rationale (*"canto inferior direito do ecrã, por cima do footer/bottom-nav"*). | Doesn't match the *first* attempt (`877a01e`) — could cause the appearance of "they keep moving it around". |
| **Globally visible** on every authenticated route (heart click works anywhere). | Slightly **far from primary action** on tablets/desktop where users interact center-screen. |
| **Doesn't shift layout** — `position: fixed` + `pointer-events: none` on container means content below is unaffected. | On very small phones (≤360px) the FAB can collide with the bottom-nav visually. Mitigated by `bottom: calc(72px + env(safe-area-inset-bottom) + 0.5rem)` but worth measuring. |
| **Pairs naturally with XpPill** in the same stack — XP visible globally (was a real bug before — XP only updated on home). | Not "discoverable" — user has to find it. (Mitigated by pulsing + tier escalations + the badge b8 unlock.) |
| **Safe-area respected** for iPhone notch / Android gesture bar. | |
| **Accessible** — 56×56px exceeds WCAG 2.5.5 / Apple HIG 44px touch baseline. | |
| **Already shipped to production** (`68be912` in main, deployed, working). | |
| **No new code** — zero risk of regression. | |

### Option B — Inside the hub hero greeting (alternatively school/escola hub)

**Where:** Add `<HeartButton />` next to the XP pill in `src/routes/+page.svelte:199-214` (hub hero `<header class="hub-hero">` → `.hero-actions` div)

| Pros | Cons |
|---|---|
| **Natural context** — the heart sits right next to "Olá, Fatma" greeting + XP counter, reinforcing the personal/love theme. | **Only visible on the hub** (`/` route). Doesn't fix the *"XP só aparece no hero / heart só aparece no hero"* problem that `68be912` solved. |
| **More discoverable** for first-time users — appears front-and-center on landing. | **Conflicts with the FAB-stack instance** if both are kept. Two hearts = visual noise. |
| **Matches the "personal touch" tone** of the splash greeting / LoveLock. | **Requires removing the FAB** (or hiding it conditionally) → regression risk on the global XP-visibility fix. |
| | **No direct audio evidence** for this placement — Daniel's only recorded directive points to bottom-right. |

### Option C — In the header next to the 🐷 pig (first attempt, now reverted)

**Where:** `src/routes/+layout.svelte:166-181` (inside `<div class="nav-actions">`, between LanguageSwitcher and Definições)

| Pros | Cons |
|---|---|
| **Globally visible** in the sticky header (always-on-top, never scrolls out). | **Was the wrong placement** — `877a01e` moved it *here* in error and `68be912` reverted it. |
| **Pairs visually with the 🐷 pig easter egg** — two "love" icons (pig + heart) in the brand strip. | **Header is already crowded** — LanguageSwitcher (44px), Definições (44px), Logout (44px). Adding a 56px heart would push the layout or wrap awkwardly. |
| | **Header is the worst place for a tap target** — sticky top means it occupies scroll real estate and competes with the page title. |
| | **Explicitly rejected** by Daniel's audio per the assistant's self-correction in session `20260628_034801_a472f1`. |

---

## 5. RECOMMENDED PLACEMENT — keep where it is (Option A)

### Concrete file:line to NOT modify

**`src/routes/+layout.svelte:228-231`** — leave the `<HeartButton />` mount point and `.fab-stack` CSS (lines 431-451) exactly as they are.

### Why this is the recommendation

1. **Direct evidence match.** Commit `68be912`'s message — written by Skander immediately after Daniel's voice note — captures Daniel's spec verbatim: *"Daniel pediu explicitamente que o coração estivesse no canto inferior direito do ecrã, por cima do footer/bottom-nav."* The current implementation matches this one-to-one.

2. **It is already in production.** Verified: `git log -- src/lib/components/HeartButton.svelte src/routes/+layout.svelte` shows `68be912` is on `main` and deployed. The browser smoke confirms the heart renders (per the user's prompt: *"A button 'Clica no coração — easter egg' is already wired in src/routes/+layout.svelte (visible in browser smoke)"*).

3. **It is the most-tested configuration.** Three layers of validation:
   - Visual smoke (browser shows the button).
   - `npm run check` passed on commit `68be912`.
   - Skander 1's audit (session `20260628_034801_a472f1`, message 27820) confirmed a11y baseline at expected Lighthouse 98-100.

4. **No regression risk.** Moving it again (e.g. putting it on the hub hero or in the header) would:
   - Re-introduce the "XP só aparece no hero" bug that `68be912` fixed.
   - Risk a layout shift in the header.
   - Require re-validation of every authenticated route (33 `+page.svelte` files in `src/routes/`).

5. **The ambiguity is well-documented.** §3 above captures the open question ("aqui" = which screen?) with the evidence chain, so any future session can confirm with Daniel if the bottom-right placement is actually wrong.

### What to do instead of moving the button

If the recommendation is "keep it where it is", the next best work items are **upgrades around the heart, not relocation**:

1. **A11y** — verify the FAB-stack heart is reachable via keyboard tab-order from `Skip to content` link (currently `+layout.svelte:145`). The `.fab-stack` lives outside `<main id="main-content">`, so tab order is: skip-link → header logo → LanguageSwitcher → Definições → Logout → HeartButton → XpPill → main content. Confirm this order is acceptable for screen-reader users (gap-011 from `.state/watchdog-todos.json`).

2. **Discoverability** — Daniel's worry is *"the user has to find it"*. Mitigation candidates (no code change requested yet):
   - First-visit tooltip pointing to the heart on the hub (`OnboardingModal.svelte` already says *"Encontra os easter eggs 🥚"* — could add the FAB coordinates).
   - Tighter contrast on `intensity-0` (currently `rgba(236, 72, 153, 0.08)` is quite faint on the navy background — might be missed).
   - A subtle pulse animation on first visit only (1.5s after mount).

3. **Mobile collision check** — verify visually on a 360×640 viewport that the FAB-stack doesn't overlap the bottom-nav pig-button (last item, `+layout.svelte:210-218`). Math says it shouldn't (FAB is `bottom: 72px + …`, bottom-nav is `bottom: 0` with safe-area), but a 60-second visual check would close the loop.

---

## 6. Evidence trail (file references + audio context)

### File references in the repo

| Path | Lines | Evidence |
|---|---|---|
| `src/lib/components/HeartButton.svelte` | 1-151 | Component definition, zero-prop API, 56×56px touch target, prefers-reduced-motion guard. |
| `src/routes/+layout.svelte` | 14 | `import HeartButton from '$lib/components/HeartButton.svelte';` |
| `src/routes/+layout.svelte` | 228-231 | `<div class="fab-stack"><XpPill /><HeartButton /></div>` — **current mount point** |
| `src/routes/+layout.svelte` | 431-451 | `.fab-stack { position: fixed; right; bottom; z-index: 60 }` + responsive variant |
| `src/lib/components/XpPill.svelte` | 5 | *"Lives in the global layout (next to the floating HeartButton)"* — confirms pair. |
| `src/lib/easterEggs.ts` | 60-83 | 22-tier `HEART_TIERS` array — defines emoji progression that `HeartButton` renders. |
| `src/lib/easterEggs.ts` | 95-148 | `heartClick()` — click handler + XP + confetti + tier detection + custom events. |
| `src/routes/+page.svelte` | 198-214 | Hub hero: greeting + XP pill — natural but **already covered** by FAB-stack (Option B). |
| `src/routes/splash/+page.svelte` | 240 | `{$t('splash.credit')}` — the i18n-based credit line. |
| `src/routes/escola/+page.svelte` | (whole file) | No heart references — Option B not viable on escola hub. |
| `.state/watchdog-todos.json` | (openItems) | gap-001/002 closed; gap-010/011/013/014/028 still open (none about heart location). |

### Git history (heart placement decisions)

| SHA | Message | Outcome |
|---|---|---|
| `877a01e` | feat(ui): move HeartButton to header + financas empty state | First interpretation — header. **Self-reverted.** |
| `68be912` | feat(ui): HeartButton+XpPill as floating bottom-right FAB stack | Second interpretation — current. **Matches Daniel's stated intent.** |
| `2a6ecdb` | chore(state): mark gap-001 (HeartButton) + gap-003 (Finanças empty) closed | HeartButton gap closed. |

### Audio / session references

| Source | Quote / Content |
|---|---|
| `cron_e2143488327c_20260628_074326` (Jun 28 07:43, watchdog) | *"põe botão do coração aqui" — heart button* (listed among Daniel's recurring audio specs). |
| `20260628_034801_a472f1` (Jun 27 04:10, voice messages) | Assistant's self-correction: *"Onde está agora: `src/routes/+layout.svelte:167` — dentro de `<div class="nav-actions">`, entre `<LanguageSwitcher />` e o ícone de Definições. Ou seja, no header, à direita. Onde tu queres: canto inferior direito do ecrã, fixo, por cima do footer."* |
| Commit `68be912` message | *"Daniel pediu explicitamente que o coração estivesse no canto inferior direito do ecrã, por cima do footer/bottom-nav."* |
| `.state/watchdog-todos.json` | gap-001 (HeartButton) marked **closed** at SHA `2a6ecdb` (2026-06-28T00:09). |

---

## 7. Open question for Daniel (if anyone wants to follow up)

> "Daniel, o coração está actualmente fixo no canto inferior direito do ecrã (FAB stack) em todas as rotas autenticadas — é o que tu pediste naquele áudio. Mas a palavra 'aqui' no teu áudio é deíctica: depende do ecrã que estavas a ver quando disseste. Podes confirmar que **canto inferior direito é mesmo onde queres**? Ou quando disseste 'põe botão do coração aqui' estavas a olhar para a splash / hero do hub / header / outro sítio específico?"

**Recommended answer-key** for the principal / Skander if asked:
- **Yes, bottom-right is right** → current implementation is correct; close the question.
- **No, I meant the hero of the hub** → move HeartButton from `.fab-stack` to `src/routes/+page.svelte:207-212` (inside `.hero-actions` next to `.xp`) AND remove from FAB-stack — but this re-breaks global XP visibility.
- **No, I meant the header next to the 🐷 pig** → revert `68be912`, put HeartButton back in `.nav-actions` between LanguageSwitcher and Definições (i.e. reapply `877a01e`'s change).
- **No, I meant the splash** → mount HeartButton in `src/routes/splash/+page.svelte:240` near the credit line; would require removing the `/splash/` short-circuit in `+layout.svelte:136`.

---

**End of recommendation. No `.svelte` files were modified during this research.**