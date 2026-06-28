<!--
  Heatmap.svelte — 90-day SVG calendar heatmap for one habit.

  Layout: 13 columns × 7 rows.  Each column is one week; each row is
  a fixed weekday (Mon..Sun, top to bottom).  The first column may
  start partway down because the 90-day window rarely begins on a
  Monday; we render a faint placeholder rect for the leading empty
  cells so the rest of the grid stays aligned to real calendar weeks.

  Intensity buckets:
    0   no log                → rgba(255,255,255,0.05)  (empty cell)
    1   1 log in the day      → #ec4899 @ 25%
    2   2 logs                → #ec4899 @ 50%
    3   3 logs                → #ec4899 @ 75%
    4+  4 or more             → #ec4899 @ 100%

  The MVP records at most 1 log per (habit, day) — bucket 1 is the
  only state that ever appears in practice — but we still render
  the higher buckets so the scale stays stable if the schema ever
  allows multi-tap logging.

  Accessibility:
    * Each cell is a <rect> with role="img" and a verbose aria-label
      like "2026-04-12: feito" / "2026-04-13: por fazer".
    * Hover surfaces a tooltip via <title> (works on touch too — long
      press shows the native browser tooltip).
-->
<script lang="ts">
  import { subDays } from 'date-fns';
  import { t } from 'svelte-i18n';
  import type { HeatmapData } from '$lib/habitos';

  interface Props {
    /** Map of 'YYYY-MM-DD' → true for days the habit was logged. */
    data: HeatmapData;
    /** Number of days to show. Defaults to 90. */
    days?: number;
    /** Optional accent colour override; defaults to the project pink. */
    color?: string;
    /** Optional CSS hex/rgba used for the empty cell. */
    emptyColor?: string;
  }

  let {
    data,
    days = 90,
    color = '#ec4899',
    emptyColor = 'rgba(255,255,255,0.05)'
  }: Props = $props();

  // ---------------------------------------------------------------------
  // Derived grid geometry
  // ---------------------------------------------------------------------

  /**
   * Build the cell list, oldest-first.  Each entry carries:
   *   - `date`:  ISO 'YYYY-MM-DD'
   *   - `col`/`row`: position in the 13×7 grid
   *   - `count`: 0..n logs on this day (drives the colour bucket)
   */
  interface Cell {
    date: string;
    col: number;
    row: number;
    count: number;
  }

  let cells = $derived.by<Cell[]>(() => {
    const today = new Date();
    const out: Cell[] = [];

    // Find the start of the week (Monday) for the day `days - 1`
    // ago.  We anchor to Monday so every column lines up with the
    // same weekday.  date-fns `getDay` returns 0 (Sun) .. 6 (Sat);
    // we shift so Monday=0.
    const start = subDays(today, days - 1);
    const dow = start.getDay(); // 0..6
    const offsetToMonday = (dow + 6) % 7; // Mon=0, ..., Sun=6
    const gridStart = subDays(start, offsetToMonday);

    const totalDays = days + offsetToMonday;
    const cols = Math.ceil(totalDays / 7);

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const col = Math.floor(i / 7);
      const row = i % 7;
      const count = data[iso] ? 1 : 0;
      out.push({ date: iso, col, row, count });
    }

    return out;
  });

  let cols = $derived(Math.max(...cells.map((c) => c.col)) + 1);

  // ---------------------------------------------------------------------
  // Sizing
  // ---------------------------------------------------------------------

  const CELL = 14;          // px square
  const GAP  = 3;           // px between cells
  const PAD_X = 4;          // left/right padding inside the SVG
  const PAD_Y = 4;          // top/bottom padding
  const WIDTH = $derived(PAD_X * 2 + cols * CELL + (cols - 1) * GAP);
  const HEIGHT = PAD_Y * 2 + 7 * CELL + 6 * GAP;

  // ---------------------------------------------------------------------
  // Colour buckets
  // ---------------------------------------------------------------------

  /**
   * Map a log count to a fill colour.
   * count=0 → empty cell, otherwise opacity scales with bucket.
   */
  function fillFor(count: number): string {
    if (count <= 0) return emptyColor;
    if (count === 1) return hexWithAlpha(color, 0.25);
    if (count === 2) return hexWithAlpha(color, 0.5);
    if (count === 3) return hexWithAlpha(color, 0.75);
    return color; // 4+
  }

  /**
   * Lightweight `#rrggbb` + alpha → `rgba(...)` converter.  Handles
   * 3-digit shorthand too.  Falls back to `color` if parsing fails.
   */
  function hexWithAlpha(hex: string, alpha: number): string {
    let h = hex.trim().replace(/^#/, '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // ---------------------------------------------------------------------
  // Cell labels
  // ---------------------------------------------------------------------

  function humanLabel(date: string, count: number): string {
    const [y, m, d] = date.split('-');
    const dd = `${d}/${m}/${y}`;
    return count > 0 ? `${dd}: feito` : `${dd}: por fazer`;
  }

  function tooltip(date: string, count: number): string {
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}${count > 0 ? ' · feito' : ''}`;
  }
</script>

<div class="heatmap-wrap" role="figure" aria-label="{$t('a11y.aria.mapa_de_calor_dos_ultimos_dias', { default: 'Mapa de calor dos últimos {days} dias' })}">
  <svg
    class="heatmap"
    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    width={WIDTH}
    height={HEIGHT}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="false"
  >
    {#each cells as cell (cell.date)}
      {@const x = PAD_X + cell.col * (CELL + GAP)}
      {@const y = PAD_Y + cell.row * (CELL + GAP)}
      <rect
        x={x}
        y={y}
        width={CELL}
        height={CELL}
        rx="2"
        ry="2"
        fill={fillFor(cell.count)}
        stroke="rgba(255,255,255,0.08)"
        stroke-width="1"
        role="img"
        aria-label={humanLabel(cell.date, cell.count)}
      >
        <title>{tooltip(cell.date, cell.count)}</title>
      </rect>
    {/each}
  </svg>
</div>

<style>
  .heatmap-wrap {
    width: 100%;
    overflow-x: auto;
    /* A subtle backdrop so the empty cells are visible against any
       background the page might use. */
    background: rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
    padding: 0.5rem;
  }
  .heatmap {
    display: block;
    margin: 0 auto;
  }
</style>