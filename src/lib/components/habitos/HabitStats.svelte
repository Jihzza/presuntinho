<!--
  HabitStats.svelte — stats card for one habit (task-040, V8).

  Renders a compact summary card with:
    - Streak (current) + best-ever streak
    - 7-day / 30-day % completion (cadence-aware; computed upstream)
    - Weekday breakdown (last 90 days) with the weakest day highlighted
    - Meta / reminder (structured { time, days } with legacy fallback)
-->
<script lang="ts">
  import { locale, t } from 'svelte-i18n';
  import {
    parseReminder,
    weekdayShortName,
    type Habit,
    type HabitWindowStats,
    type WeekdayStat
  } from '$lib/habitos';

  interface Props {
    habit: Habit;
    stats7: HabitWindowStats | null;
    stats30: HabitWindowStats | null;
    streak: number;
    /** Best-ever streak (V8).  null → hide the metric. */
    bestStreak?: number | null;
    /** Per-weekday completion over 90d (V8).  null → hide the chart. */
    weekdayStats?: WeekdayStat[] | null;
  }

  let { habit, stats7, stats30, streak, bestStreak = null, weekdayStats = null }: Props = $props();

  const dateLocale = $derived($locale || 'pt-PT');
  let percent7 = $derived(stats7?.percent ?? 0);
  let percent30 = $derived(stats30?.percent ?? 0);

  // Monday-first display order, values in JS getDay() numbering.
  const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

  // Weakest weekday = lowest percent among days with >= 2 scheduled
  // occurrences (a single data point isn't a pattern yet).
  let weakDay = $derived.by<WeekdayStat | null>(() => {
    if (!weekdayStats) return null;
    const eligible = weekdayStats.filter((w) => w.scheduled >= 2);
    if (eligible.length < 2) return null;
    const weakest = eligible.reduce((min, w) => (w.percent < min.percent ? w : min), eligible[0]);
    // Only call it "weak" if it's meaningfully below perfect.
    return weakest.percent < 80 ? weakest : null;
  });

  let reminderStructured = $derived(parseReminder(habit.reminder));
  let reminderLegacy = $derived(
    typeof habit.reminder === 'string' && !parseReminder(habit.reminder) ? habit.reminder : null
  );

  function reminderDaysLabel(days: number[] | undefined): string {
    if (!days || days.length === 0) return '';
    return days.map((d) => weekdayShortName(dateLocale, d)).join(', ');
  }
</script>

<div class="habit-stats" aria-label={$t('habitos.stats.card_aria', { values: { name: habit.name }, default: `Estatísticas de ${habit.name}` })}>
  <div class="row">
    <span class="icon" aria-hidden="true">{habit.icon}</span>
    <span class="name">{habit.name}</span>
    {#if habit.meta}
      <span class="meta-pill">{habit.meta}</span>
    {/if}
  </div>

  <div class="metrics" class:four={bestStreak !== null}>
    <div class="metric">
      <span class="metric-value" style="color: {habit.color}">{streak}</span>
      <span class="metric-label">{$t('habitos.stats.streak', { default: 'Streak' })}</span>
    </div>
    {#if bestStreak !== null}
      <div class="metric">
        <span class="metric-value">{bestStreak} 🏆</span>
        <span class="metric-label">{$t('habitos.stats.best', { default: 'Melhor' })}</span>
      </div>
    {/if}
    <div class="metric">
      <span class="metric-value">{percent7}%</span>
      <span class="metric-label">{$t('habitos.stats.completion_7d', { default: '7 dias' })}</span>
    </div>
    <div class="metric">
      <span class="metric-value">{percent30}%</span>
      <span class="metric-label">{$t('habitos.stats.completion_30d', { default: '30 dias' })}</span>
    </div>
  </div>

  {#if weekdayStats && weekdayStats.some((w) => w.scheduled > 0)}
    <div class="weekdays" role="img" aria-label={$t('habitos.stats.weekdays_aria', { default: 'Conclusão por dia da semana (últimos 90 dias)' })}>
      {#each WEEKDAY_ORDER as d (d)}
        {@const ws = weekdayStats.find((w) => w.weekday === d)}
        <div class="wd-col" class:weak={weakDay?.weekday === d} class:off={!ws || ws.scheduled === 0}>
          <div class="wd-bar-track">
            <div
              class="wd-bar"
              style="height: {ws && ws.scheduled > 0 ? Math.max(ws.percent, 6) : 0}%; background: {habit.color}"
            ></div>
          </div>
          <span class="wd-label">{weekdayShortName(dateLocale, d)}</span>
        </div>
      {/each}
    </div>
    {#if weakDay}
      <p class="weak-hint">
        💡 {$t('habitos.stats.weak_day', {
          values: { day: weekdayShortName(dateLocale, weakDay.weekday), percent: weakDay.percent },
          default: `${weekdayShortName(dateLocale, weakDay.weekday)} é o teu dia mais difícil (${weakDay.percent}%). Um pequeno lembrete pode ajudar.`
        })}
      </p>
    {/if}
  {/if}

  {#if reminderStructured}
    <div class="reminder">
      ⏰ {reminderStructured.time}
      {#if reminderStructured.days && reminderStructured.days.length > 0}
        · {reminderDaysLabel(reminderStructured.days)}
      {/if}
    </div>
  {:else if reminderLegacy}
    <div class="reminder">
      ⏰ {reminderLegacy}
    </div>
  {/if}
</div>

<style>
  .habit-stats {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent);
    border-radius: var(--radius-sm, 0.5rem);
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
    color: var(--txt);
    font-size: 0.9375rem;
  }
  .meta-pill {
    background: var(--bg-elev, var(--card));
    color: var(--txt2);
    border-radius: 999px;
    padding: 0.0625rem 0.5rem;
    font-size: var(--fs-xs, 0.75rem);
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  .metrics.four {
    grid-template-columns: repeat(4, 1fr);
  }
  .metric {
    background: var(--bg-elev, var(--card));
    border-radius: var(--radius-sm, 0.375rem);
    padding: 0.375rem 0.25rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .metric-value {
    font-size: var(--fs-lg, 1.125rem);
    font-weight: 700;
    color: var(--txt);
  }
  .metric-label {
    font-size: 0.6875rem;
    color: var(--txt3);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.375rem;
    margin-top: 0.25rem;
  }
  .wd-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }
  .wd-bar-track {
    width: 100%;
    max-width: 1.75rem;
    height: 2.5rem;
    background: var(--bg-elev, var(--card));
    border-radius: var(--radius-sm, 0.25rem);
    display: flex;
    align-items: flex-end;
    overflow: hidden;
  }
  .wd-bar {
    width: 100%;
    border-radius: var(--radius-sm, 0.25rem) var(--radius-sm, 0.25rem) 0 0;
    transition: height var(--motion-base, 220ms) ease;
  }
  .wd-col.off .wd-bar-track {
    opacity: 0.35;
  }
  .wd-col.weak .wd-label {
    color: var(--warning, var(--txt2));
    font-weight: 700;
  }
  .wd-label {
    font-size: 0.6875rem;
    color: var(--txt3);
    text-transform: capitalize;
  }
  .weak-hint {
    margin: 0;
    font-size: var(--fs-xs, 0.8125rem);
    color: var(--txt2);
  }
  .reminder {
    font-size: var(--fs-sm, 0.8125rem);
    color: var(--txt2);
  }
</style>
