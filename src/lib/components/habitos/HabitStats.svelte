<!--
  HabitStats.svelte — task-040 stats card for one habit.

  Renders a compact summary card with:
    - Streak (current)
    - 7-day % completion
    - 30-day % completion
    - Meta / reminder (if set)

  Used inside the /habitos list to give the user a one-glance
  overview of their progress without opening the detail page.
-->
<script lang="ts">
  import { t } from 'svelte-i18n';
  import type { Habit, HabitWindowStats } from '$lib/habitos';

  interface Props {
    habit: Habit;
    stats7: HabitWindowStats | null;
    stats30: HabitWindowStats | null;
    streak: number;
  }

  let { habit, stats7, stats30, streak }: Props = $props();

  let percent7 = $derived(stats7?.percent ?? 0);
  let percent30 = $derived(stats30?.percent ?? 0);
</script>

<div class="habit-stats" aria-label="Stats for {habit.name}">
  <div class="row">
    <span class="icon" aria-hidden="true">{habit.icon}</span>
    <span class="name">{habit.name}</span>
    {#if habit.meta}
      <span class="meta-pill">{habit.meta}</span>
    {/if}
  </div>

  <div class="metrics">
    <div class="metric">
      <span class="metric-value" style="color: {habit.color}">{streak}</span>
      <span class="metric-label">{$t('habitos.stats.streak', { default: 'Streak' })}</span>
    </div>
    <div class="metric">
      <span class="metric-value">{percent7}%</span>
      <span class="metric-label">{$t('habitos.stats.completion_7d', { default: '7 dias' })}</span>
    </div>
    <div class="metric">
      <span class="metric-value">{percent30}%</span>
      <span class="metric-label">{$t('habitos.stats.completion_30d', { default: '30 dias' })}</span>
    </div>
  </div>

  {#if habit.reminder}
    <div class="reminder">
      ⏰ {habit.reminder}
    </div>
  {/if}
</div>

<style>
  .habit-stats {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-left: 4px solid var(--accent, #ec4899);
    border-radius: 0.5rem;
    padding: 0.75rem 0.875rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .icon {
    font-size: 1.25rem;
  }
  .name {
    font-weight: 600;
    color: var(--txt, #fff);
    font-size: 0.9375rem;
  }
  .meta-pill {
    background: rgba(255, 255, 255, 0.08);
    color: var(--txt2, #cbd5e1);
    border-radius: 999px;
    padding: 0.0625rem 0.5rem;
    font-size: 0.75rem;
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  .metric {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 0.375rem;
    padding: 0.375rem 0.25rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .metric-value {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--txt, #fff);
  }
  .metric-label {
    font-size: 0.6875rem;
    color: var(--txt3, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .reminder {
    font-size: 0.8125rem;
    color: var(--txt2, #cbd5e1);
  }
</style>
