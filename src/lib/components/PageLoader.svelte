<script lang="ts">
  /**
   * PageLoader — top progress bar that shows WHILE a SvelteKit navigation is
   * in flight (not after it lands). Driven by `navigating` from $app/state:
   *   - a ~120ms delay avoids flashing on instant same-bundle navigations;
   *   - once shown it stays for a ~350ms minimum so it never strobes;
   *   - it hides when navigation settles.
   * This gives real feedback on slow route/chunk loads (cold PWA start, 3G),
   * which the old page.url-watcher could not — page.url only changes AFTER a
   * navigation has already completed.
   */
  import { navigating } from '$app/state';
  import { onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';

  const SHOW_DELAY = 120;
  const MIN_VISIBLE = 350;

  let visible = $state(false);
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let shownAt = 0;

  function clearTimers(): void {
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }

  $effect(() => {
    const busy = Boolean(navigating.to);
    if (busy) {
      if (visible || showTimer) return;
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      showTimer = setTimeout(() => {
        showTimer = null;
        visible = true;
        shownAt = performance.now();
      }, SHOW_DELAY);
    } else {
      // Navigation settled: cancel a pending show, or keep the bar for the
      // remainder of its minimum visible window before hiding.
      if (showTimer) { clearTimeout(showTimer); showTimer = null; }
      if (!visible || hideTimer) return;
      const elapsed = performance.now() - shownAt;
      const wait = Math.max(0, MIN_VISIBLE - elapsed);
      hideTimer = setTimeout(() => {
        hideTimer = null;
        visible = false;
      }, wait);
    }
  });

  onDestroy(clearTimers);
</script>

{#if visible}
  <div class="page-loader" role="status" aria-live="polite" aria-label={$t('common.loading')}></div>
{/if}

<style>
  .page-loader {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 3px;
    z-index: 10001;
    pointer-events: none;
    overflow: hidden;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .page-loader::before {
    content: '';
    display: block;
    width: 45%;
    height: 100%;
    border-radius: 999px;
    background: var(--accent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 65%, transparent);
    animation: page-loader-slide 1100ms ease-in-out infinite;
  }

  @keyframes page-loader-slide {
    from {
      transform: translateX(-110%);
      opacity: 0.4;
    }
    30% {
      opacity: 1;
    }
    to {
      transform: translateX(235%);
      opacity: 0.85;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .page-loader::before {
      width: 100%;
      animation: none;
    }
  }
</style>
