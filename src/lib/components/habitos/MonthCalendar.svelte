<!--
  MonthCalendar.svelte — monthly grid for one habit (task-040, V8).

  Renders a single month as a 7-column grid (Mon..Sun).  The user can
  tap a day cell to toggle its logged state — the parent supplies a
  callback so the actual Dexie write happens in the page (which owns
  the XP / confetti / toast side-effects).

  V8:
    * cadence-aware — non-scheduled days (custom-weekday habits) are
      rendered muted with a dashed border.  They're still tappable
      (logging on a rest day is allowed; it just doesn't feed the
      streak), and the aria-label says so.
    * date keys come from `localDateKey` (LOCAL timezone, no UTC drift).
    * hex fallbacks replaced with design tokens.

  Props:
    - year / month0   : which month to render (month0 = 0..11)
    - data            : HeatmapData (YYYY-MM-DD → true) for the month
    - color           : accent colour for the "logged" cell
    - cadence         : habit cadence (defaults to 'daily')
    - today           : today's 'YYYY-MM-DD' (defaults to local now)
    - onToggle(date)  : fired when the user taps a cell.
-->
<script lang="ts">
  import { locale, t } from 'svelte-i18n';
  import {
    isScheduledOn,
    localDateKey,
    normalizeCadence,
    type HabitCadence,
    type HeatmapData
  } from '$lib/habitos';
  import { weekdayShort } from '$lib/i18n/dates';

  interface Props {
    year: number;
    month0: number;
    data: HeatmapData;
    color?: string;
    cadence?: HabitCadence;
    today?: string;
    onToggle?: (date: string) => void | Promise<void>;
  }

  let {
    year,
    month0,
    data,
    color = 'var(--accent)',
    cadence = 'daily',
    today,
    onToggle
  }: Props = $props();

  let todayResolved = $derived(today ?? localDateKey());
  const dateLocale = $derived($locale || 'pt-PT');
  const normalizedCadence = $derived(normalizeCadence(cadence));

  interface Cell {
    date: string;
    day: number;
    inMonth: boolean;
    logged: boolean;
    isToday: boolean;
    scheduled: boolean;
  }

  let cells = $derived.by<Cell[]>(() => {
    // Build a grid aligned Monday-first.  Leading cells from the
    // previous month are rendered as `inMonth: false` so the CSS can
    // mute them.
    const first = new Date(year, month0, 1);
    const last = new Date(year, month0 + 1, 0);
    const daysInMonth = last.getDate();
    // Monday=0..Sunday=6
    const leading = (first.getDay() + 6) % 7;
    const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
    const out: Cell[] = [];
    for (let i = 0; i < totalCells; i++) {
      const offset = i - leading;
      const d = new Date(year, month0, 1 + offset);
      const iso = localDateKey(d);
      out.push({
        date: iso,
        day: d.getDate(),
        inMonth: d.getMonth() === month0,
        logged: Boolean(data[iso]),
        isToday: iso === todayResolved,
        scheduled: isScheduledOn(normalizedCadence, d)
      });
    }
    return out;
  });

  let monthLabel = $derived.by(() => {
    return new Date(year, month0, 1).toLocaleDateString(dateLocale, {
      month: 'long',
      year: 'numeric'
    });
  });

  let weekdayLabels = $derived.by(() => {
    // 2024-01-01 is a Monday; keep the app's existing Monday-first habit grid.
    return Array.from({ length: 7 }, (_, i) => weekdayShort(new Date(2024, 0, 1 + i), dateLocale));
  });

  function cellFill(cell: Cell): string {
    if (!cell.inMonth) return 'transparent';
    if (cell.logged) return color;
    return 'var(--bg-elev, transparent)';
  }

  function cellAria(cell: Cell): string {
    const state = cell.logged
      ? $t('habitos.calendar.marked', { default: 'marcado' })
      : $t('habitos.calendar.unmarked', { default: 'por marcar' });
    if (!cell.scheduled) {
      return `${cell.date}: ${state} · ${$t('habitos.calendar.rest_day', { default: 'dia de descanso' })}`;
    }
    return `${cell.date}: ${state}`;
  }
</script>

<div class="month-calendar" role="group" aria-label={$t('habitos.calendar.aria', { values: { month: monthLabel }, default: `Calendário de ${monthLabel}` })}>
  <h3 class="month-label">{monthLabel}</h3>
  <div class="weekdays" aria-hidden="true">
    {#each weekdayLabels as label, i (i)}
      <span class="weekday">{label}</span>
    {/each}
  </div>
  <div class="grid">
    {#each cells as cell, i (i)}
      <button
        type="button"
        class="cell"
        class:logged={cell.logged}
        class:other={!cell.inMonth}
        class:today={cell.isToday}
        class:rest={cell.inMonth && !cell.scheduled}
        disabled={!cell.inMonth || !onToggle}
        aria-pressed={cell.logged}
        aria-label={cellAria(cell)}
        style="--cell-fill: {cellFill(cell)}"
        onclick={() => {
          if (cell.inMonth && onToggle) void onToggle(cell.date);
        }}
      >
        {cell.day}
      </button>
    {/each}
  </div>
  {#if typeof normalizedCadence === 'object'}
    <p class="legend">
      {$t('habitos.calendar.rest_legend', { default: 'Dias a tracejado são dias de descanso — não contam para o streak.' })}
    </p>
  {/if}
</div>

<style>
  .month-calendar {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 0.75rem);
    padding: var(--space-3, 1rem);
  }
  .month-label {
    margin: 0 0 0.5rem 0;
    font-size: var(--fs-md, 1rem);
    color: var(--txt);
    text-transform: capitalize;
    font-weight: 600;
  }
  .weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.25rem;
    margin-bottom: 0.25rem;
  }
  .weekday {
    text-align: center;
    font-size: var(--fs-xs, 0.75rem);
    color: var(--txt3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.25rem;
  }
  .cell {
    aspect-ratio: 1;
    min-height: 2.25rem;
    background: var(--cell-fill, var(--bg-elev));
    color: var(--txt);
    border: 1px solid transparent;
    border-radius: var(--radius-sm, 0.375rem);
    font-size: var(--fs-sm, 0.875rem);
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform var(--motion-fast, 120ms), border-color var(--motion-fast, 120ms);
    padding: 0;
  }
  .cell:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .cell:focus-visible:not(:disabled) {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .cell.logged {
    font-weight: 700;
    color: var(--on-accent, #fff);
  }
  .cell.today {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .cell.rest:not(.logged) {
    border: 1px dashed var(--border);
    color: var(--txt3);
    opacity: 0.75;
  }
  .cell.other {
    color: var(--txt3);
    opacity: 0.4;
    cursor: not-allowed;
  }
  .cell:disabled {
    cursor: not-allowed;
  }
  .legend {
    margin: 0.5rem 0 0 0;
    font-size: var(--fs-xs, 0.75rem);
    color: var(--txt3);
  }
  @media (min-width: 640px) {
    .cell { font-size: 0.9375rem; }
  }
</style>
