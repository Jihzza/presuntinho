<script lang="ts">
  /**
   * XpPill — Compact "N XP" badge with visibility on change.
   *
   * Lives in the global layout (next to the floating HeartButton)
   * so the user can see their XP changing, but only when it does.
   *
   * Modes:
   *   - "always"  : always visible (legacy behaviour, default off in V7)
   *   - "onChange": hidden by default; animates IN 250ms when xp changes,
   *                 stays visible 3.0s after last change, animates OUT 250ms,
   *                 then display:none.
   *
   * Reactivity: subscribes to the persisted `xp` store from
   * `$lib/state/stores`. The subscription is set up in onMount so
   * SSR renders an empty placeholder (matching initial client paint).
   *
   * Design notes:
   *   - aria-live="polite" via the parent <div class="fab-stack"> means
   *     screen readers announce XP changes without interrupting.
   *   - prefers-reduced-motion: skip all animations; toggle instantly.
   */

  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { xp, initStores } from '$lib/state/stores';
  import { t } from 'svelte-i18n';

  type Visibility = 'always' | 'onChange';

  // Props — default to "onChange" to satisfy the V7 brief (Daniel's P1).
  let { mode = 'onChange' as Visibility }: { mode?: Visibility } = $props();

  let currentXp = $state(0);
  let visible = $state(false);
  let hidden = $state(true); // display:none when true
  let pulse = $state(false);
  let delta = $state<number | null>(null);
  let pulseTimer: ReturnType<typeof setTimeout> | null = null;
  let deltaTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSeenXp = $state<number | null>(null);

  let label = $derived(new Intl.NumberFormat('pt-PT').format(currentXp) + ' XP');
  let deltaLabel = $derived(delta === null ? '' : `${delta > 0 ? '+' : ''}${delta} XP`);

  function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  function show(): void {
    if (prefersReducedMotion()) {
      visible = true;
      hidden = false;
      return;
    }
    hidden = false;
    // next frame so the CSS transition fires
    requestAnimationFrame(() => {
      visible = true;
    });
  }

  function scheduleHide(delayMs: number): void {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      visible = false;
      // After fade-out finishes, set display:none
      setTimeout(() => {
        if (!visible) hidden = true;
      }, 260);
    }, delayMs);
  }

  function triggerPulse(): void {
    if (prefersReducedMotion()) return;
    pulse = true;
    if (pulseTimer) clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => {
      pulse = false;
      pulseTimer = null;
    }, 350);
  }

  function showDelta(amount: number): void {
    delta = amount;
    if (deltaTimer) clearTimeout(deltaTimer);
    deltaTimer = setTimeout(() => {
      delta = null;
      deltaTimer = null;
    }, prefersReducedMotion() ? 3000 : 2400);
  }

  function onXpChanged(newXp: number): void {
    currentXp = newXp;
    if (lastSeenXp !== null && newXp !== lastSeenXp) {
      // Real change → show +/-N badge, make visible + pulse + restart hide timer
      showDelta(newXp - lastSeenXp);
      show();
      triggerPulse();
      if (mode === 'onChange') scheduleHide(3000);
    }
    lastSeenXp = newXp;
  }

  onMount(() => {
    void (async () => {
      try {
        await initStores();
      } catch {
        /* fall through — defaults will render */
      }
      const initial = get(xp);
      currentXp = initial;
      lastSeenXp = initial;

      // "always" mode shows immediately on mount; "onChange" stays hidden
      if (mode === 'always') {
        show();
      }

      xp.subscribe((v) => onXpChanged(v));
    })();

    return () => {
      if (pulseTimer) clearTimeout(pulseTimer);
      if (deltaTimer) clearTimeout(deltaTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  });
</script>

<span
  class="xp-pill"
  class:xp-pill--visible={visible}
  class:xp-pill--hidden={hidden}
  class:pulse
  aria-hidden={hidden ? 'true' : undefined}
  aria-label={$t('a11y.xp_label', { default: 'Pontos de experiência: {n}' }).replace(
    '{n}',
    String(currentXp)
  )}
  title={$t('a11y.xp_label', { default: 'Pontos de experiência: {n}' }).replace(
    '{n}',
    String(currentXp)
  )}
>
  <span class="dot" aria-hidden="true"></span>
  <span class="label">{label}</span>
  {#if delta !== null}
    <span class="delta" class:delta--positive={delta > 0} class:delta--negative={delta < 0}>
      {deltaLabel}
    </span>
  {/if}
</span>

<style>
  .xp-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #fff;
    font-size: 0.8rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    transition:
      opacity 0.25s ease,
      transform 0.25s ease,
      box-shadow 0.2s ease,
      background 0.2s ease;
    user-select: none;
  }
  /* Hidden base — translateY lifts it slightly so the IN animation has motion */
  .xp-pill--hidden {
    opacity: 0;
    transform: translateY(8px);
    pointer-events: none;
    display: none;
  }
  .xp-pill--visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
    display: inline-flex;
  }
  .xp-pill:hover:not(.xp-pill--hidden),
  .xp-pill:focus-visible:not(.xp-pill--hidden) {
    background: rgba(0, 0, 0, 0.7);
    border-color: rgba(255, 255, 255, 0.32);
    outline: none;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent, #ec4899);
    box-shadow: 0 0 6px rgba(236, 72, 153, 0.7);
  }
  .label {
    letter-spacing: 0.02em;
  }
  .delta {
    margin-left: 0.15rem;
    padding: 0.12rem 0.38rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
    font-size: 0.72rem;
    font-weight: 800;
    line-height: 1;
    animation: xp-delta-in 0.24s ease both;
  }
  .delta--positive {
    background: rgba(16, 185, 129, 0.28);
    color: #d1fae5;
  }
  .delta--negative {
    background: rgba(239, 68, 68, 0.28);
    color: #fee2e2;
  }
  @keyframes xp-delta-in {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.92);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  /* Pulse animation when XP changes. */
  .xp-pill.pulse {
    animation: xp-pulse 0.35s ease;
  }
  @keyframes xp-pulse {
    0% {
      transform: scale(1);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    }
    50% {
      transform: scale(1.08);
      box-shadow: 0 4px 22px rgba(236, 72, 153, 0.5);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .xp-pill,
    .xp-pill.pulse {
      transition: none;
      animation: none;
    }
  }
</style>