<!--
  StatTile — design-system stat/KPI primitive (V8).

  label (small, muted) over value (big) over optional hint. `tone`
  colours the value with the matching semantic token — never judgy,
  just informative.
-->
<script lang="ts">
  interface Props {
    /** Small caption above the value (e.g. "Este mês"). */
    label: string;
    /** The stat itself — preformatted string or number. */
    value: string | number;
    /** Optional helper line under the value. */
    hint?: string;
    /** Semantic tone for the value colour. */
    tone?: 'default' | 'accent' | 'success' | 'warning' | 'error';
    /** Extra classes appended to the root element. */
    class?: string;
    [key: string]: unknown;
  }

  let {
    label,
    value,
    hint,
    tone = 'default',
    class: extraClass = '',
    ...rest
  }: Props = $props();
</script>

<div class="card stat-tile stat-tile--{tone} {extraClass}" {...rest}>
  <span class="stat-label">{label}</span>
  <span class="stat-value overflow-safe">{value}</span>
  {#if hint}
    <span class="stat-hint">{hint}</span>
  {/if}
</div>

<style>
  .stat-tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    min-width: 0;
  }
  .stat-label {
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    color: var(--txt3);
  }
  .stat-value {
    font-size: var(--fs-xl);
    font-weight: 700;
    line-height: 1.15;
    color: var(--txt);
    font-variant-numeric: tabular-nums;
  }
  .stat-hint {
    font-size: var(--fs-sm);
    color: var(--txt2);
  }
  .stat-tile--accent .stat-value { color: var(--accent); }
  .stat-tile--success .stat-value { color: var(--success); }
  .stat-tile--warning .stat-value { color: var(--warning); }
  .stat-tile--error .stat-value { color: var(--error); }
</style>
