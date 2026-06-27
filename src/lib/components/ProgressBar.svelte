<script lang="ts">
  /**
   * ProgressBar — card with icon, label, current/total, animated bar.
   *
   * Matches the visual language of HubCard.svelte:
   *   - dark translucent card on the navy background
   *   - left accent border for category colour (driven by --accent)
   *   - flex row icon + content layout
   *
   * The bar fills via CSS width animation; width is computed on mount and
   * any time `current`/`total` change. prefers-reduced-motion is honoured
   * globally in app.css (transitions killed) and locally we skip the
   * animation flag on the inline style.
   */

  interface Props {
    label: string;
    current: number;
    total: number;
    icon?: string;
    /** Optional accent colour for the left border + filled bar. */
    accent?: string;
  }

  let { label, current, total, icon, accent = '#ec4899' }: Props = $props();

  // Defensive clamp — `total` could be 0 (no lessons yet), `current`
  // could be greater than `total` after migration from V3.
  let safeTotal = $derived(Math.max(0, total));
  let safeCurrent = $derived(Math.max(0, Math.min(current, safeTotal)));
  let percent = $derived(
    safeTotal === 0 ? 0 : Math.round((safeCurrent / safeTotal) * 100)
  );

  // Reduced-motion guard: set inline transition only when motion is OK.
  // We can't import the prefers-reduced-motion media-query easily in SSR,
  // so default to `false` (animate) and let CSS take over with its global
  // `*` rule that forces transitions to 0.001ms.
  let motionOk = $state(typeof window === 'undefined' ? false : !window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  $effect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => (motionOk = !mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  });
</script>

<div
  class="card"
  style="--accent: {accent};"
  role="group"
  aria-label="Progresso de {label}: {percent}%"
>
  {#if icon}
    <div class="icon" aria-hidden="true">{icon}</div>
  {/if}
  <div class="content">
    <div class="head">
      <span class="label">{label}</span>
      <span class="count" aria-hidden="true">
        {safeCurrent}/{safeTotal}
      </span>
    </div>
    <div class="bar" aria-hidden="true">
      <div
        class="fill"
        style="
          width: {percent}%;
          transition: {motionOk ? 'width 600ms ease-out' : 'none'};
        "
      ></div>
    </div>
    <div class="percent" aria-hidden="true">{percent}%</div>
  </div>
</div>

<style>
  .card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-left: 4px solid var(--accent);
    border-radius: 0.75rem;
    color: #fff;
    min-height: 72px;
  }
  .icon {
    font-size: 2rem;
    line-height: 1;
    flex-shrink: 0;
    width: 2.5rem;
    text-align: center;
  }
  .content {
    flex: 1;
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }
  .label {
    font-size: 0.95rem;
    font-weight: 600;
    color: #fff;
  }
  .count {
    font-size: 0.8125rem;
    color: #cbd5e1;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    position: relative;
    width: 100%;
    height: 8px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
  }
  .percent {
    margin-top: 0.35rem;
    font-size: 0.75rem;
    color: #94a3b8;
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none !important;
    }
  }
</style>