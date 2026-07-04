<script lang="ts">
  /**
   * DailyQuests — self-contained hub card for the V8 daily quest loop.
   *
   * Renders today's 3 quests (deterministic per day — see
   * $lib/gamification/quests) with live done-ticks read from REAL
   * Dexie data. The engine pays the XP; this component only displays
   * state and celebrates (confetti + toast fire exactly once per day,
   * when the 3/3 bonus is paid during a refresh triggered here).
   *
   * Refresh triggers:
   *   - 'presuntinho:xp-changed'    (any sub-app action that moved XP)
   *   - 'presuntinho:mood-changed'  (mood check-ins may complete a quest)
   *   - visibilitychange → visible  (user returns to the tab / PWA)
   *
   * No props required — safe to drop into any page.
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import {
    getDailyQuests,
    QUEST_TITLE_FALLBACKS,
    type DailyQuest
  } from '$lib/gamification/quests';
  import { fireConfettiEvent, showToast } from '$lib/components/events';
  import { playSfx, vibrate } from '$lib/gamification/sound';
  import { XP_CHANGED_EVENT } from '$lib/state/xp-actions';
  import ChestModal from '$lib/components/ChestModal.svelte';

  const MOOD_CHANGED_EVENT = 'presuntinho:mood-changed';

  let quests = $state<DailyQuest[]>([]);
  let allDone = $state(false);
  let loading = $state(true);
  // V10 — the 3/3 bonus opens a variable-reward chest (once per day, tied
  // to the engine's idempotent allJustCompleted flag).
  let chestOpen = $state(false);

  let doneCount = $derived(quests.filter((q) => q.done).length);
  let totalCount = $derived(quests.length || 3);

  // Re-entrancy guard: paying quest XP fires 'presuntinho:xp-changed',
  // which lands back here. While a refresh is running we queue exactly
  // one follow-up instead of recursing; the follow-up finds everything
  // already paid (idempotent bookkeeping) and the chain stops.
  let refreshing = false;
  let refreshQueued = false;

  async function refresh(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      loading = false;
      return;
    }
    if (refreshing) {
      refreshQueued = true;
      return;
    }
    refreshing = true;
    try {
      const res = await getDailyQuests();
      quests = res.quests;
      allDone = res.allDone;
      // V10 — a freshly completed quest earns its "ding" (the 3/3 bonus
      // below has its own bigger celebration, so skip the small one then).
      if (res.newlyCompleted.length > 0 && !res.allJustCompleted) {
        playSfx('ding');
      }
      if (res.allJustCompleted) {
        fireConfettiEvent({ count: 80, origin: 'center' });
        playSfx('fanfare');
        vibrate('success');
        showToast(
          $t('components.quests.toast_all', {
            default: '🏆 Missões diárias completas! +20 XP'
          }),
          3500
        );
        chestOpen = true;
      }
    } catch (e) {
      console.error('[quests] refresh failed', e);
    } finally {
      refreshing = false;
      loading = false;
      if (refreshQueued) {
        refreshQueued = false;
        void refresh();
      }
    }
  }

  onMount(() => {
    void refresh();

    const onExternalChange = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    window.addEventListener(XP_CHANGED_EVENT, onExternalChange);
    window.addEventListener(MOOD_CHANGED_EVENT, onExternalChange);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener(XP_CHANGED_EVENT, onExternalChange);
      window.removeEventListener(MOOD_CHANGED_EVENT, onExternalChange);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });
</script>

<section
  class="card quests-card"
  aria-label={$t('components.quests.aria', { default: 'Missões diárias' })}
  aria-busy={loading}
>
  <header class="quests-head">
    <span class="head-icon" aria-hidden="true">🎯</span>
    <div class="head-text">
      <h3>{$t('components.quests.title', { default: 'Missões de hoje' })}</h3>
      <p class="hint">
        {$t('components.quests.hint', {
          default: 'Cada missão vale +10 XP · as três juntas dão +20 de bónus'
        })}
      </p>
    </div>
    {#if !loading}
      <span class="count" aria-hidden="true">{doneCount}/{totalCount}</span>
    {/if}
  </header>

  <div
    class="track"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax={totalCount}
    aria-valuenow={doneCount}
    aria-label={$t('components.quests.progress_aria', {
      values: { done: doneCount, total: totalCount },
      default: '{done} de {total} missões feitas'
    })}
  >
    {#each Array(totalCount) as _, i (i)}
      <span class="seg" class:filled={i < doneCount}></span>
    {/each}
  </div>

  {#if loading}
    <div class="rows" aria-hidden="true">
      {#each Array(3) as _, i (i)}
        <div class="quest skeleton-row">
          <span class="tick skeleton-blob"></span>
          <span class="skeleton-line"></span>
        </div>
      {/each}
    </div>
    <p class="sr-only">
      {$t('components.quests.loading', { default: 'A preparar as missões de hoje…' })}
    </p>
  {:else}
    {#if allDone}
      <div class="all-done" role="status">
        <span class="all-done-icon" aria-hidden="true">🏆</span>
        <div>
          <p class="all-done-title">
            {$t('components.quests.all_done.title', { default: 'Tudo feito por hoje! 🎉' })}
          </p>
          <p class="all-done-body">
            {$t('components.quests.all_done.body', {
              default: 'As três missões completas — ganhaste o bónus de +20 XP. Orgulho em ti!'
            })}
          </p>
        </div>
      </div>
    {/if}
    <div class="rows">
      {#each quests as q (q.id)}
        <a class="quest" class:done={q.done} href={q.href}>
          <span class="tick" class:checked={q.done} aria-hidden="true">
            {#if q.done}✓{/if}
          </span>
          <span class="q-icon" aria-hidden="true">{q.icon}</span>
          <span class="q-title">
            {$t(q.titleKey, { default: QUEST_TITLE_FALLBACKS[q.id] ?? q.id })}
          </span>
          <span class="q-state">
            {#if q.done}
              <span class="q-state-done">
                {$t('components.quests.done_label', { default: 'Feita' })}
              </span>
            {:else}
              <span class="q-arrow" aria-hidden="true">→</span>
              <span class="sr-only">
                {$t('components.quests.todo_label', { default: 'Por fazer' })}
              </span>
            {/if}
          </span>
        </a>
      {/each}
    </div>
  {/if}
</section>

{#if chestOpen}
  <ChestModal onclose={() => (chestOpen = false)} />
{/if}

<style>
  .quests-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 0.75rem);
    padding: var(--space-4, 1rem);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl, 1rem);
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.08));
  }

  .quests-head {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3, 0.75rem);
  }
  .head-icon {
    font-size: 1.5rem;
    line-height: 1;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }
  .head-text {
    flex: 1;
    min-width: 0;
  }
  .head-text h3 {
    margin: 0;
    font-size: var(--fs-md, 1rem);
    font-weight: 700;
    color: var(--txt);
  }
  .hint {
    margin: 0.125rem 0 0 0;
    font-size: var(--fs-xs, 0.75rem);
    color: var(--txt3);
  }
  .count {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    font-size: var(--fs-sm, 0.875rem);
    font-weight: 700;
    color: var(--accent);
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 0.5rem);
    padding: 0.25rem 0.5rem;
  }

  .track {
    display: flex;
    gap: 0.375rem;
  }
  .seg {
    flex: 1;
    height: 0.375rem;
    border-radius: 999px;
    background: var(--bg-elev);
    transition: background var(--motion-base, 220ms) ease;
  }
  .seg.filled {
    background: var(--accent);
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 0.5rem);
  }

  .quest {
    display: flex;
    align-items: center;
    gap: var(--space-3, 0.75rem);
    min-height: 44px;
    padding: 0.5rem 0.625rem;
    border-radius: var(--radius-md, 0.75rem);
    border: 1px solid var(--border);
    background: var(--bg-elev);
    color: var(--txt);
    text-decoration: none;
    transition:
      background var(--motion-fast, 120ms) ease,
      border-color var(--motion-fast, 120ms) ease,
      transform var(--motion-fast, 120ms) ease;
  }
  .quest:hover {
    background: var(--card-hover);
    transform: translateY(-1px);
  }
  .quest:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .quest.done {
    border-color: color-mix(in srgb, var(--success) 45%, transparent);
    background: color-mix(in srgb, var(--success) 10%, transparent);
  }

  .tick {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    border: 2px solid var(--border);
    background: transparent;
    color: var(--on-accent, #fff);
    font-size: 0.8125rem;
    font-weight: 800;
    line-height: 1;
    transition:
      background var(--motion-base, 220ms) ease,
      border-color var(--motion-base, 220ms) ease;
  }
  .tick.checked {
    background: var(--success);
    border-color: var(--success);
  }

  .q-icon {
    flex-shrink: 0;
    font-size: 1.125rem;
    line-height: 1;
  }
  .q-title {
    flex: 1;
    min-width: 0;
    font-size: var(--fs-sm, 0.875rem);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .quest.done .q-title {
    color: var(--txt2);
  }

  .q-state {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
  }
  .q-state-done {
    font-size: var(--fs-xs, 0.75rem);
    font-weight: 700;
    color: var(--success);
  }
  .q-arrow {
    color: var(--accent);
    font-size: 1rem;
  }

  .all-done {
    display: flex;
    align-items: center;
    gap: var(--space-3, 0.75rem);
    padding: var(--space-3, 0.75rem);
    border-radius: var(--radius-md, 0.75rem);
    border: 1px solid color-mix(in srgb, var(--success) 45%, transparent);
    background: color-mix(in srgb, var(--success) 12%, transparent);
  }
  .all-done-icon {
    font-size: 1.75rem;
    line-height: 1;
    flex-shrink: 0;
  }
  .all-done-title {
    margin: 0;
    font-size: var(--fs-sm, 0.875rem);
    font-weight: 700;
    color: var(--txt);
  }
  .all-done-body {
    margin: 0.125rem 0 0 0;
    font-size: var(--fs-xs, 0.75rem);
    color: var(--txt2);
  }

  /* Loading skeleton (shimmer animation is killed globally by the
     prefers-reduced-motion switch in app.css). */
  .skeleton-row {
    pointer-events: none;
  }
  .skeleton-blob,
  .skeleton-line {
    background: linear-gradient(
      90deg,
      var(--bg-elev) 25%,
      var(--card-hover) 50%,
      var(--bg-elev) 75%
    );
    background-size: 200% 100%;
    animation: quests-shimmer 1.4s ease-in-out infinite;
  }
  .skeleton-blob {
    border-color: transparent;
  }
  .skeleton-line {
    flex: 1;
    height: 0.875rem;
    border-radius: var(--radius-sm, 0.5rem);
  }
  @keyframes quests-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
