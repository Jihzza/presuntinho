<script lang="ts">
  /**
   * XpPill — Compact "N XP" badge with a glowing dot.
   *
   * Lives in the global layout (next to the floating HeartButton)
   * so the user can see their XP at any time, not just on the hub.
   *
   * Reactivity: subscribes to the persisted `xp` store from
   * `$lib/state/stores`. The subscription is set up in onMount so
   * SSR renders an empty placeholder (matching initial client paint).
   *
   * Design notes:
   *   - Uses $derived for the formatted label so the display updates
   *     automatically without manual $state plumbing.
   *   - Pulse animation on every increment is gated behind
   *     `prefers-reduced-motion` to honour user OS preferences.
   *   - aria-live="polite" via the parent <div class="fab-stack"> means
   *     screen readers announce XP changes without interrupting.
   */

  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { xp, initStores } from '$lib/state/stores';
  import { t } from 'svelte-i18n';

  let currentXp = $state(0);
  let pulse = $state(false);
  let pulseTimer: ReturnType<typeof setTimeout> | null = null;

  // Derived label — recomputes whenever currentXp changes.
  let label = $derived(new Intl.NumberFormat('pt-PT').format(currentXp) + ' XP');

  onMount(() => {
    void (async () => {
      // Make sure the store is hydrated before subscribing so the
      // first frame shows the real value, not the default 0.
      try {
        await initStores();
      } catch {
        /* fall through — defaults will render */
      }
      currentXp = get(xp);
      xp.subscribe((v) => {
        if (v !== currentXp) {
          currentXp = v;
          triggerPulse();
        }
      });
    })();
  });

  function triggerPulse(): void {
    if (prefersReducedMotion()) return;
    pulse = true;
    if (pulseTimer) clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => {
      pulse = false;
      pulseTimer = null;
    }, 350);
  }

  function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }
</script>

<span
  class="xp-pill"
  class:pulse
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
    transition: transform 0.18s ease, box-shadow 0.2s ease, background 0.2s ease;
    user-select: none;
  }
  .xp-pill:hover,
  .xp-pill:focus-visible {
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
