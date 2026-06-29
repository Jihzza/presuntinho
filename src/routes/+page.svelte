<script lang="ts">
  /**
   * Presuntinho — Hub (`/`).
   *
   * Sections:
   *   1. Hero greeting + XP counter (PRESERVATION.md #3)
   *   2. Sub-app grid (5 cards from $lib/registry)
   *   3. Module progress — 3 ProgressBar cards (PRESERVATION.md #10)
   *      - Leituras  : count of visited lessons (key starts with `lesson:`)
   *      - Quizzes   : count of quizzes with at least one answered question
   *      - Escrita   : count of assignments with status !== 'open'
   *   4. Badge grid — 8 BadgeCards (PRESERVATION.md #11)
   *   5. Legacy V3 section
   *
   * State sources:
   *   - `xp` from `$lib/state/stores` (writable, auto-persisted)
   *   - Dexie tables (`db`) read on mount + on `visibilitychange` so the
   *     hub stays in sync when the user returns from a sub-app.
   */

  import { onMount } from 'svelte';
  import { get } from 'svelte/store';

  import HubCard from '$lib/components/HubCard.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import BadgeGrid from '$lib/components/BadgeGrid.svelte';
  import InstallButton from '$lib/components/InstallButton.svelte';
  // InstallButton is mounted globally in +layout.svelte's fab-stack
  // (gap-066 polish) so it appears on every authenticated page and never
  // overlaps content on small screens. Import kept for source-of-truth.
  void InstallButton;
  import OnboardingModal from '$lib/components/OnboardingModal.svelte';

  import { subApps, legacySubApp, v3Content, agentEntry } from '$lib/registry';
  import { db } from '$lib/state/db';
  import { xp, initStores } from '$lib/state/stores';
  import { getSession } from '$lib/auth/session';
  import { t } from 'svelte-i18n';

  // ---------------------------------------------------------------------------
  // XP — direct subscription to the exported writable store.  We `await
  // initStores()` first so the hydration read in `stores.ts` runs before
  // our subscribe, eliminating any chance the first frame shows the
  // default 0 (which was the source of the "XP volta a 0 ao refresh" bug).
  // ---------------------------------------------------------------------------
  let currentXp = $state(0);
  // Active profile — drives the personalised greeting on the hub.
  // Read once on mount from sessionStorage; updated if the user logs
  // out and back in via another tab (storage event).
  let activeProfile = $state<'fatma' | 'daniel' | null>(null);
  onMount(() => {
    activeProfile = getSession()?.profile ?? null;
    void (async () => {
      await initStores();
      // After hydration, mirror the latest XP value once.
      currentXp = get(xp);
      // Then keep it in sync if XP changes while the hub is mounted.
      xp.subscribe((v) => (currentXp = v));
    })();
  });

  // Locale-formatted XP (pt-PT thousands separator: e.g. 1,250)
  let xpLabel = $derived(
    new Intl.NumberFormat('pt-PT').format(currentXp) + ' XP'
  );

  // ---------------------------------------------------------------------------
  // Lesson + quiz + assignment totals (could move to a registry later)
  // ---------------------------------------------------------------------------
  const TOTAL_LESSONS = 5; // equivalenza course (escola/+page.svelte)
  const TOTAL_QUIZZES = 5; // q1, q2, q3, q4, ptq
  const TOTAL_ASSIGNMENTS = 1; // equivalenza-midterm (trabalhos/+page.svelte)

  // ---------------------------------------------------------------------------
  // Badge / progress state — read from Dexie (no writable store exists yet)
  // ---------------------------------------------------------------------------
  interface BadgeStatus {
    unlocked: boolean;
    unlockedAt?: number;
  }
  interface QuizStatus {
    answeredCount: number;
  }

  let badgesMap = $state<Record<string, BadgeStatus>>({});
  let quizzesAnswered = $state(0);
  let lessonsVisited = $state(0);
  let assignmentsDone = $state(0);

  /**
   * Reload the dashboard counters from Dexie. Cheap (4 small table
   * reads); called on mount and whenever the tab regains focus.
   */
  async function refreshDashboard(): Promise<void> {
    if (typeof indexedDB === 'undefined') return; // SSR safety
    try {
      const d = db();
      const [badgeRows, quizRows, visitedRows] = await Promise.all([
        d.badges.toArray(),
        d.quizScores.toArray(),
        d.visited.toArray()
      ]);

      // Badges → sparse record
      const nextBadges: Record<string, BadgeStatus> = {};
      for (const row of badgeRows) {
        nextBadges[row.id] = {
          unlocked: Boolean(row.unlocked),
          unlockedAt: row.unlockedAt
        };
      }
      badgesMap = nextBadges;

      // Quizzes answered — count rows where at least 1 question has been
      // answered. V3 semantics: a quiz is "started" once any index is in
      // the `answered` array; "complete" when answered === total. We
      // surface the same range V3 did (started/answered).
      quizzesAnswered = quizRows.filter(
        (r) => Array.isArray(r.answered) && r.answered.length > 0
      ).length;

      // Lessons visited — count `visited` rows whose id starts with `lesson:`
      lessonsVisited = visitedRows.filter(
        (r) => typeof r.id === 'string' && r.id.startsWith('lesson:')
      ).length;

      // Assignments done — mirror V3: an assignment is "done" when its
      // status is not 'open'. Assignments are not stored per-user in V4
      // Dexie yet, so we read from the static JSON via fetch (relative
      // path resolves to /data/assignments/<id>.json under static/) and
      // count those whose `status` is 'submitted' or 'late'. If the
      // fetch fails we keep the previous value (0 on first load).
      try {
        const res = await fetch('/data/assignments/equivalenza.json');
        if (res.ok) {
          const a = (await res.json()) as { status?: string };
          assignmentsDone =
            a.status && a.status !== 'open' ? 1 : 0;
        }
      } catch {
        // Ignore — keep current value.
      }
    } catch (e) {
      console.error('[hub] refreshDashboard failed', e);
    }
  }

  onMount(() => {
    void refreshDashboard();
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshDashboard();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  });

  // ---------------------------------------------------------------------------
  // First-visit onboarding — show the welcome modal once, then never again.
  // Flag lives in localStorage under `fat-onboarded`. SSR-safe: we only touch
  // localStorage inside onMount, so the first render is identical on both
  // server and client (open=false). The flag check runs after hydration.
  // ---------------------------------------------------------------------------
  let showOnboarding = $state(false);

  function handleOnboardingClose(): void {
    try {
      localStorage.setItem('fat-onboarded', '1');
    } catch {
      // localStorage may be unavailable (private mode / quota); silently
      // ignore — the modal will simply re-appear next visit, which is fine.
    }
    showOnboarding = false;
  }

  onMount(() => {
    try {
      showOnboarding = localStorage.getItem('fat-onboarded') === null;
    } catch {
      showOnboarding = false;
    }
  });

  // ---------------------------------------------------------------------------
  // Phase 25: hero greeting entry animation — fade-in + 8 px slide-up, runs
  // once on mount. Flag starts false so SSR markup has no transform; the
  // flag flips true on mount and a CSS class drives the keyframes. Reduced-
  // motion users get no animation (the class still toggles but the
  // keyframes duration is set to 0.001ms by the global reduced-motion rule).
  // ---------------------------------------------------------------------------
  let heroIn = $state(false);
  onMount(() => {
    heroIn = true;
  });
</script>

<svelte:head>
  <title>{$t('routes.hub.title', { default: 'Presuntinho — Hub' })}</title>
</svelte:head>

<OnboardingModal open={showOnboarding} onClose={handleOnboardingClose} profile={activeProfile} />

<div class="hub">
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

  <section class="apps" aria-label={$t('hub.section.apps.aria', { default: 'Sub-apps' })}>
    <h2 class="section-title">{$t('hub.section.apps', { default: 'Apps' })}</h2>
    <div class="grid">
      {#each subApps as app (app.id)}
        <HubCard {app} />
      {/each}
    </div>
  </section>

  <section class="progress-section" aria-label={$t('hub.section.progress.aria', { default: 'Progresso dos módulos' })}>
    <h2 class="section-title">{$t('hub.section.progress', { default: 'Progresso' })}</h2>
    <div class="progress-grid">
      <ProgressBar
        label={$t('hub.progress.lessons', { default: 'Leituras' })}
        icon="📖"
        accent="#3b82f6"
        current={lessonsVisited}
        total={TOTAL_LESSONS}
      />
      <ProgressBar
        label={$t('hub.progress.quizzes', { default: 'Quizzes' })}
        icon="❓"
        accent="#f59e0b"
        current={quizzesAnswered}
        total={TOTAL_QUIZZES}
      />
      <ProgressBar
        label={$t('hub.progress.writing', { default: 'Escrita' })}
        icon="✍️"
        accent="#10b981"
        current={assignmentsDone}
        total={TOTAL_ASSIGNMENTS}
      />
    </div>
  </section>

  <section class="badges-section" aria-label={$t('hub.section.badges.aria', { default: 'Conquistas' })}>
    <h2 class="section-title">{$t('hub.section.badges', { default: 'Conquistas' })}</h2>
    <BadgeGrid badges={badgesMap} />
  </section>

  <section class="legacy-section" aria-label={$t('hub.section.legacy.aria', { default: 'Site V3 preservado' })}>
    <h2 class="section-title">{$t('hub.section.legacy', { default: 'Site V3 preservado' })}</h2>
    <p class="legacy-desc">{$t('hub.legacy.desc', { default: 'O site V3 original mantém-se reachable como arquivo. A migração para rotas SvelteKit está concluída para os 7 módulos abaixo.' })}</p>
    <div class="legacy-grid">
      <HubCard app={legacySubApp} />
    </div>
  </section>

  <section class="v3-section" aria-label={$t('hub.section.v3.aria', { default: 'Conteúdo V3 migrado' })}>
      <h2 class="section-title">{$t('hub.section.v3', { default: 'V3 Content' })}</h2>
      <p class="v3-desc">{$t('hub.v3.desc', { default: 'As 7 páginas do V3 agora são rotas SvelteKit nativas — sem iframe, navegação rápida, prontas para SEO e PWA.' })}</p>
      <div class="v3-grid">
        <HubCard app={agentEntry as any} />
        {#each v3Content as entry (entry.id)}
          <HubCard app={legacySubApp} v3={entry} />
        {/each}
      </div>
    </section>
</div>

<style>
  .hub {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 2rem;
  }
  .hub-hero {
    margin-bottom: 2rem;
    text-align: center;
  }
  /* Phase 25: hero entry animation — fade + 8px slide-up, runs once on mount.
     The .hero-in class is only added client-side after hydration (the
     `heroIn` flag starts false during SSR), so server markup matches
     initial client render. Reduced-motion users get the final state
     immediately because the global * selector collapses animation-duration
     to 0.001ms under @media (prefers-reduced-motion: reduce). */
  .hub-hero {
    opacity: 0;
    transform: translateY(8px);
  }
  .hub-hero.hero-in {
    animation: hub-hero-in 360ms ease-out forwards;
  }
  @keyframes hub-hero-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .hub-hero h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem 0;
    color: #fff;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    line-height: 1.2;
  }
  .greeting {
    display: inline-block;
  }
  .hero-actions {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin: 0.5rem 0 0.25rem 0;
  }
  .xp {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.7rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: #fde68a;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.35);
    border-radius: 999px;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    vertical-align: middle;
  }
  .xp-dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: #f59e0b;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
  }
  .sub {
    color: #cbd5e1;
    margin: 0;
    font-size: 1rem;
  }
  .apps,
  .progress-section,
  .badges-section,
  .legacy-section,
  .v3-section {
    margin-bottom: 2rem;
  }
  .section-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
    margin: 0 0 0.75rem 0.25rem;
    font-weight: 600;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
  .progress-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
  .legacy-desc {
    font-size: 0.875rem;
    color: #94a3b8;
    margin: 0 0 0.75rem 0.25rem;
  }
  .legacy-grid,
  .v3-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
  .v3-desc {
    font-size: 0.875rem;
    color: #94a3b8;
    margin: 0 0 0.75rem 0.25rem;
  }
  @media (min-width: 640px) {
    .grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .progress-grid {
      grid-template-columns: repeat(3, 1fr);
    }
    .legacy-grid,
    .v3-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (min-width: 1024px) {
    .hub {
      max-width: 1000px;
      padding: 2rem 1.5rem 3rem;
    }
    .hub-hero h1 {
      font-size: 2.5rem;
    }
    /* .grid (apps) becomes 2-cols on 1024-1440 viewports — see 1440
       breakpoint below for the 3-col upgrade. */
    .grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .progress-grid {
      grid-template-columns: repeat(3, 1fr);
    }
    .legacy-grid,
    .v3-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  /* Large / 4K-friendly layout (Phase 15 #4). */
  @media (min-width: 1440px) {
    .hub {
      max-width: 1200px;
    }
    .grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
</style>