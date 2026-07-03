<!--
  MonthCalendar.svelte — task-040 monthly grid for one habit.

  Renders a single month as a 7-column grid (Mon..Sun).  The user can
  tap a day cell to toggle its logged state — the parent supplies a
  callback so the actual Dexie write happens in the page (which can
  fire the XP / toast side-effects).

  Props:
    - year / month0   : which month to render (month0 = 0..11)
    - data            : HeatmapData (YYYY-MM-DD → true) for the month
    - color           : accent colour for the "logged" cell
    - today           : today's 'YYYY-MM-DD' (defaults to local now)
    - onToggle(date)  : async (date: string) => void — fired when the
                        user taps a cell.  We don't await it here;
                        the parent re-reads Dexie and updates `data`.
-->
<script lang="ts">
  import { locale, t } from 'svelte-i18n';
  import type { HeatmapData } from '$lib/habitos';

  interface Props {
    year: number;
    month0: number;
    data: HeatmapData;
    color?: string;
    today?: string;
    onToggle?: (date: string) => void | Promise<void>;
  }

  let {
    year,
    month0,
    data,
    color = '#ec4899',
    today,
    onToggle
  }: Props = $props();

  // Resolve "today" once per render so SSR / hydration doesn't drift.
  // In Svelte 5, `$derived` keeps it fresh across reactive updates.
  function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  let todayResolved = $derived(today ?? todayKey());
  const dateLocale = $derived($locale || 'pt-PT');

  interface Cell {
    date: string;
    day: number;
    inMonth: boolean;
    logged: boolean;
    isToday: boolean;
  }

  let cells = $derived.by<Cell[]>(() => {
    // Build a 6-row × 7-col grid (max days a month can occupy with
    // alignment).  Leading cells from the previous month are
    // rendered as `inMonth: false` so the CSS can mute them.
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
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({
        date: iso,
        day: d.getDate(),
        inMonth: d.getMonth() === month0,
        logged: Boolean(data[iso]),
        isToday: iso === todayResolved
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
    const formatter = new Intl.DateTimeFormat(dateLocale, { weekday: 'short' });
    // 2024-01-01 is a Monday; keep the app's existing Monday-first habit grid.
    return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(2024, 0, 1 + i)));
  });

  function cellFill(logged: boolean, inMonth: boolean): string {
    if (!inMonth) return 'transparent';
    if (!logged) return 'rgba(255, 255, 255, 0.06)';
    return color;
  }
</script>

<div class="month-calendar" role="group" aria-label={`Calendar for ${monthLabel}`}>
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
        disabled={!cell.inMonth || !onToggle}
        aria-pressed={cell.logged}
        aria-label={cell.logged
          ? `${cell.date}: ${$t('habitos.calendar.marked', { default: 'marcado' })}`
          : `${cell.date}: ${$t('habitos.calendar.unmarked', { default: 'por marcar' })}`}
        style="--cell-fill: {cellFill(cell.logged, cell.inMonth)}"
        onclick={() => {
          if (cell.inMonth && onToggle) void onToggle(cell.date);
        }}
      >
        {cell.day}
      </button>
    {/each}
  </div>
</div>

<style>
  .month-calendar {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1rem;
  }
  .month-label {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    color: var(--txt, #fff);
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
    font-size: 0.75rem;
    color: var(--txt3, #94a3b8);
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
    background: var(--cell-fill, rgba(255, 255, 255, 0.06));
    color: var(--txt, #fff);
    border: 1px solid transparent;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.1s, border-color 0.15s;
    padding: 0;
  }
  .cell:hover:not(:disabled),
  .cell:focus-visible:not(:disabled) {
    border-color: var(--accent, #ec4899);
    outline: none;
  }
  .cell.logged {
    font-weight: 700;
  }
  .cell.today {
    box-shadow: 0 0 0 2px var(--accent, #ec4899);
  }
  .cell.other {
    color: var(--txt3, #94a3b8);
    opacity: 0.4;
    cursor: not-allowed;
  }
  .cell:disabled {
    cursor: not-allowed;
  }
  @media (min-width: 640px) {
    .cell { font-size: 0.9375rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    .cell { transition: none; }
  }
</style>
