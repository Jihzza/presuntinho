<!--
  XpToast — centred, top-of-viewport toast that announces an XP delta
  whenever the global xp store changes (via the
  `presuntinho:xp-changed` window event fired by src/lib/state/xp-actions.ts).

  Contract:
    - Hidden by default; appears only after a non-zero XP delta.
    - Standard motion: fade/slide in 600ms, hold 1800ms, fade/slide out 600ms.
    - prefers-reduced-motion: fade only and no auto-hide; dismiss by click or key.
    - Fixed top-centre; z-index 200 (above content/nav, below modals).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { prefersReducedMotion } from './events';
  import { XP_CHANGED_EVENT } from '$lib/state/xp-actions';

  let visible = $state(false);
  let hiding = $state(false);
  let amount = $state(0);

  let timerIn: ReturnType<typeof setTimeout> | null = null;
  let timerHold: ReturnType<typeof setTimeout> | null = null;
  let timerOut: ReturnType<typeof setTimeout> | null = null;

  const FADE_IN_MS = 600;
  const HOLD_MS = 1800;
  const FADE_OUT_MS = 600;

  let label = $derived(
    amount > 0
      ? $t('xp.toast.gained', { values: { n: amount }, default: `+${amount} XP` })
      : $t('xp.toast.lost', { values: { n: Math.abs(amount) }, default: `-${Math.abs(amount)} XP` })
  );

  let ariaLabel = $derived($t('xp.toast.ariaLabel', { default: 'Mudança de XP' }));

  function clearTimers(): void {
    if (timerIn) {
      clearTimeout(timerIn);
      timerIn = null;
    }
    if (timerHold) {
      clearTimeout(timerHold);
      timerHold = null;
    }
    if (timerOut) {
      clearTimeout(timerOut);
      timerOut = null;
    }
  }

  function show(): void {
    clearTimers();
    hiding = false;
    visible = true;

    // Reduced motion: no auto-hide. User dismisses via click/Enter/Space/Escape.
    if (prefersReducedMotion()) return;

    timerIn = setTimeout(() => {
      timerIn = null;
      timerHold = setTimeout(() => {
        startHide();
      }, HOLD_MS);
    }, FADE_IN_MS);
  }

  function startHide(): void {
    if (!visible) return;
    hiding = true;
    timerOut = setTimeout(() => {
      visible = false;
      hiding = false;
      timerOut = null;
    }, prefersReducedMotion() ? 1 : FADE_OUT_MS);
  }

  function dismiss(): void {
    clearTimers();
    startHide();
  }

  function onKey(e: KeyboardEvent): void {
    if (!visible) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
    }
  }

  onMount(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ amount?: number; delta?: number }>;
      const delta = ce.detail?.delta ?? ce.detail?.amount;
      if (typeof delta !== 'number' || delta === 0) return;
      amount = delta;
      show();
    };

    window.addEventListener(XP_CHANGED_EVENT, handler);
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener(XP_CHANGED_EVENT, handler);
      window.removeEventListener('keydown', onKey);
      clearTimers();
    };
  });
</script>

{#if visible}
  <div class="xp-toast-region" role="status" aria-live="polite" aria-label={ariaLabel}>
    <button
      type="button"
      class="xp-toast"
      class:xp-toast--positive={amount > 0}
      class:xp-toast--negative={amount < 0}
      class:xp-toast--hiding={hiding}
      aria-label={`${ariaLabel}: ${label}`}
      onclick={dismiss}
    >
      <span class="xp-toast__label">{label}</span>
    </button>
  </div>
{/if}

<style>
  .xp-toast-region {
    position: fixed;
    top: max(1.25rem, env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    pointer-events: none;
  }

  .xp-toast {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.7rem 1.1rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    background: rgba(31, 46, 74, 0.92);
    color: #fff;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    cursor: pointer;
    font: inherit;
    font-size: 1rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    line-height: 1;
    pointer-events: auto;
    user-select: none;
    animation: xp-toast-in 600ms ease both;
  }

  .xp-toast:focus-visible {
    outline: none;
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.35),
      0 0 0 3px rgba(255, 255, 255, 0.42);
  }

  .xp-toast--positive {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.92), rgba(5, 150, 105, 0.92));
    border-color: rgba(167, 243, 208, 0.45);
  }

  .xp-toast--negative {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.92), rgba(194, 65, 12, 0.92));
    border-color: rgba(254, 202, 202, 0.45);
  }

  .xp-toast--hiding {
    animation: xp-toast-out 600ms ease both;
  }

  .xp-toast__label {
    font-variant-numeric: tabular-nums;
  }

  @keyframes xp-toast-in {
    from {
      opacity: 0;
      transform: translateY(-0.5rem) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes xp-toast-out {
    from {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    to {
      opacity: 0;
      transform: translateY(-0.4rem) scale(0.98);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .xp-toast,
    .xp-toast--hiding {
      animation-duration: 1ms;
      transform: none;
    }

    @keyframes xp-toast-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes xp-toast-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }
  }
</style>