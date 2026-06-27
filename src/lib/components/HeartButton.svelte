<script lang="ts">
  /**
   * HeartButton — Easter egg ❤️ click target.
   *
   * Mirrors V3's heart-click DOM escalations. Lives on the Hub hero
   * (next to the XP pill) but is reusable anywhere.
   *
   * Behaviour:
   *   - click → heartClick() (22-tier XP escalation + custom events)
   *   - listens for `presuntinho:heart-visual` → swaps emoji + class
   *     `intensity-0..4` based on click count
   *   - listens for `presuntinho:heart-pulse` → 300 ms pulse animation
   *
   * All animations are gated by `prefers-reduced-motion`.
   */

  import { onMount } from 'svelte';
  import { heartClick } from '$lib/easterEggs';
  import { prefersReducedMotion } from './events';

  let emoji = $state('❤️');
  let intensity = $state(0);
  let pulsing = $state(false);

  function onClick(): void {
    void heartClick();
  }

  onMount(() => {
    function onVisual(e: Event): void {
      const ce = e as CustomEvent<{ clicks: number; intensity: number; emoji: string }>;
      emoji = ce.detail.emoji ?? '❤️';
      intensity = Math.max(0, Math.min(4, ce.detail.intensity ?? 0));
    }
    function onPulse(): void {
      // Skip the pulse entirely when reduced motion is preferred.
      if (prefersReducedMotion()) return;
      pulsing = true;
      setTimeout(() => (pulsing = false), 320);
    }
    window.addEventListener('presuntinho:heart-visual', onVisual as EventListener);
    window.addEventListener('presuntinho:heart-pulse', onPulse as EventListener);
    return () => {
      window.removeEventListener('presuntinho:heart-visual', onVisual as EventListener);
      window.removeEventListener('presuntinho:heart-pulse', onPulse as EventListener);
    };
  });
</script>

<button
  type="button"
  class="heart-btn intensity-{intensity}"
  class:pulse={pulsing}
  onclick={onClick}
  aria-label="Clica no coração — easter egg"
  title="Clica — easter egg"
>
  <span class="emoji" aria-hidden="true">{emoji}</span>
</button>

<style>
  .heart-btn {
    /* 56 × 56 px touch target — exceeds the 44 px WCAG baseline. */
    width: 56px;
    height: 56px;
    min-width: 56px;
    min-height: 56px;
    border-radius: 50%;
    border: 1px solid rgba(236, 72, 153, 0.35);
    background: rgba(236, 72, 153, 0.08);
    color: #fff;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition:
      transform 0.15s ease,
      background 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease;
    /* Lift above neighbours; the hero uses flex so size is intrinsic. */
    align-self: center;
  }
  .heart-btn:hover,
  .heart-btn:focus-visible {
    background: rgba(236, 72, 153, 0.18);
    border-color: rgba(236, 72, 153, 0.6);
    outline: none;
  }
  .heart-btn:focus-visible {
    box-shadow: 0 0 0 2px var(--accent, #ec4899);
  }
  .heart-btn:active {
    transform: scale(0.92);
  }
  .emoji {
    font-size: 1.75rem;
    line-height: 1;
    display: inline-block;
    transition: transform 0.2s ease;
    /* Make emoji selection feel snappy. */
    user-select: none;
    -webkit-user-select: none;
  }
  .heart-btn:hover .emoji {
    transform: scale(1.1);
  }
  /* Intensity escalation (V3 DOM-class hints). */
  .heart-btn.intensity-1 {
    background: rgba(236, 72, 153, 0.14);
    box-shadow: 0 0 0 2px rgba(236, 72, 153, 0.18);
  }
  .heart-btn.intensity-2 {
    background: rgba(236, 72, 153, 0.22);
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.28);
  }
  .heart-btn.intensity-3 {
    background: rgba(236, 72, 153, 0.32);
    box-shadow: 0 0 0 4px rgba(236, 72, 153, 0.4);
  }
  .heart-btn.intensity-4 {
    background: linear-gradient(135deg, #ec4899 0%, #f59e0b 100%);
    box-shadow: 0 0 0 4px rgba(236, 72, 153, 0.6), 0 6px 18px rgba(236, 72, 153, 0.45);
  }
  /* 300 ms pulse — emitted every click past 100 (V3 behaviour).
     Phase 25 audit: pulse already present + prefers-reduced-motion guard
     already present (see both @media block below and the
     prefersReducedMotion() runtime check in the script). No change needed. */
  .heart-btn.pulse {
    animation: heart-pulse 0.3s ease;
  }
  @keyframes heart-pulse {
    0%   { transform: scale(1); }
    50%  { transform: scale(1.18); }
    100% { transform: scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .heart-btn {
      transition: none;
    }
    .heart-btn:active,
    .heart-btn:hover .emoji {
      transform: none;
    }
    .heart-btn.pulse {
      animation: none;
    }
  }
</style>
