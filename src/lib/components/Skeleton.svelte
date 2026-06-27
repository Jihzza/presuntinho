<!--
  Skeleton — animated placeholder shown while a list is loading.

  Usage:
    Skeleton lines={3}
    Skeleton variant="card"     [one taller card-shaped block]
    Skeleton variant="list" lines={4}  [N thin rows, default]

  Accessibility:
    * The wrapper is `aria-busy="true"` + `aria-live="polite"` so the
      loading state is announced without being noisy.
    * `role="status"` + a visually-hidden "A carregar…" message gives
      screen readers something to read; the shimmer is hidden from a11y.
    * The CSS animation is suppressed under prefers-reduced-motion so
      vestibular-sensitive users see a static placeholder instead.

  Theming:
    * Uses the same card/border CSS vars as the rest of the app so it
      blends with both light and dark themes without extra config.
-->
<script lang="ts">
  type Variant = 'list' | 'card';

  interface Props {
    /** Visual shape.  Default 'list' (N thin rows). */
    variant?: Variant;
    /** How many rows/blocks to render.  Default 3. */
    lines?: number;
    /** Optional override for the hidden status message (i18n). */
    label?: string;
  }

  let { variant = 'list', lines = 3, label = 'A carregar…' }: Props = $props();

  // Clamp the input so a typo can't render 10 000 rows.
  let count = $derived(Math.max(1, Math.min(20, Math.floor(lines))));
</script>

<div
  class="skeleton skeleton--{variant}"
  role="status"
  aria-busy="true"
  aria-live="polite"
>
  {#each Array.from({ length: count }, (_, i) => i) as i (i)}
    <div class="block block--{variant}" aria-hidden="true"></div>
  {/each}
  <span class="sr-only">{label}</span>
</div>

<style>
  .skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.25rem 0;
  }
  .block {
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.04) 0%,
      rgba(255, 255, 255, 0.10) 50%,
      rgba(255, 255, 255, 0.04) 100%
    );
    background-size: 200% 100%;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: 0.5rem;
    animation: shimmer 1.4s ease-in-out infinite;
  }
  .block--list {
    height: 1rem;
  }
  /* Slightly varied widths so consecutive rows don't look mechanical. */
  .block--list:nth-child(3n) { width: 92%; }
  .block--list:nth-child(3n+1) { width: 78%; }
  .block--list:nth-child(3n+2) { width: 88%; }

  .block--card {
    height: 5rem;
    width: 100%;
  }

  @keyframes shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* WCAG — visually hidden but available to assistive tech. */
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

  @media (prefers-reduced-motion: reduce) {
    .block { animation: none; }
  }
</style>