<script lang="ts">
  /**
   * SurpriseHeart — a couple-points heart that only appears at random moments
   * for a short window, floating ON TOP of the mascot (bottom-right). Tapping it
   * adds a SHARED point synced across both partners' devices (couple-store).
   *
   * It replaces the always-on HeartButton: love is a surprise, not furniture.
   * Decorative-but-interactive; fully removed from the DOM while hidden so it
   * never blocks the mascot's own gestures underneath it.
   */
  import { onMount, onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import { couple, tapCouplePoint } from '$lib/couple/couple-store.svelte';
  import { playSfx, vibrate } from '$lib/gamification/sound';
  import { prefersReducedMotion } from './events';

  // Timing (ms). First appearance is soon-ish so it's discoverable; later gaps
  // are longer so it stays a treat. Each visit lasts a short, limited window.
  const FIRST_MIN = 12_000;
  const FIRST_MAX = 28_000;
  const GAP_MIN = 45_000;
  const GAP_MAX = 120_000;
  const SHOW_MIN = 7_000;
  const SHOW_MAX = 11_000;

  let visible = $state(false);
  let reduced = $state(false);
  let pops = $state<{ id: number; dx: number }[]>([]);
  let popSeq = 0;

  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  // Track the short "+1" pop timers so none survive an unmount mid-animation.
  const popTimers = new Set<ReturnType<typeof setTimeout>>();

  function rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  function scheduleAppearance(first = false): void {
    if (showTimer) clearTimeout(showTimer);
    const delay = first ? rand(FIRST_MIN, FIRST_MAX) : rand(GAP_MIN, GAP_MAX);
    showTimer = setTimeout(appear, delay);
  }

  function appear(): void {
    if (document.hidden) {
      // Don't burn the window while the tab is backgrounded — try again soon.
      scheduleAppearance();
      return;
    }
    visible = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(vanish, rand(SHOW_MIN, SHOW_MAX));
  }

  function vanish(): void {
    visible = false;
    pops = [];
    scheduleAppearance();
  }

  function onTap(): void {
    tapCouplePoint();
    playSfx('pop');
    vibrate('tap');
    if (!reduced) {
      const id = ++popSeq;
      pops = [...pops, { id, dx: Math.round(rand(-14, 14)) }];
      const timer = setTimeout(() => {
        popTimers.delete(timer);
        pops = pops.filter((p) => p.id !== id);
      }, 750);
      popTimers.add(timer);
    }
    // Reward a keen tapper by keeping the heart a touch longer, capped so it
    // still disappears promptly.
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(vanish, 2600);
    }
  }

  onMount(() => {
    reduced = prefersReducedMotion();
    scheduleAppearance(true);
  });
  onDestroy(() => {
    if (showTimer) clearTimeout(showTimer);
    if (hideTimer) clearTimeout(hideTimer);
    for (const t of popTimers) clearTimeout(t);
    popTimers.clear();
  });
</script>

{#if visible}
  <button
    type="button"
    class="surprise-heart"
    class:reduced
    onclick={onTap}
    aria-label={$t('couple.heart.aria', { default: 'Coração do casal — toca para somar pontos' })}
    title={$t('couple.heart.aria', { default: 'Coração do casal — toca para somar pontos' })}
  >
    <span class="glow" aria-hidden="true"></span>
    <span class="emoji" aria-hidden="true">💞</span>
    {#if couple.points > 0}
      <span class="count" aria-hidden="true">{couple.points}</span>
    {/if}
    {#each pops as p (p.id)}
      <span class="plus" style={`--dx:${p.dx}px`} aria-hidden="true">+1</span>
    {/each}
  </button>
{/if}

<style>
  .surprise-heart {
    position: absolute;
    left: 50%;
    bottom: 2.4rem; /* sit ON TOP of the ~3rem mascot below it */
    transform: translateX(-50%);
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--accent, #f472b6) 55%, transparent);
    background: color-mix(in srgb, var(--accent, #f472b6) 20%, rgba(10, 16, 30, 0.35));
    color: #fff;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    isolation: isolate;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    box-shadow: 0 6px 20px color-mix(in srgb, var(--accent, #f472b6) 45%, transparent);
    z-index: 3;
    animation: heart-in 260ms cubic-bezier(0.2, 1.4, 0.5, 1) both;
  }
  .surprise-heart.reduced {
    animation: none;
  }
  .surprise-heart:active .emoji {
    transform: scale(0.9);
  }
  .glow {
    position: absolute;
    inset: -0.5rem;
    border-radius: 999px;
    background: radial-gradient(circle, color-mix(in srgb, var(--accent, #f472b6) 34%, transparent), transparent 60%);
    z-index: 0;
    animation: glow-pulse 1.5s ease-in-out infinite;
  }
  .surprise-heart.reduced .glow {
    animation: none;
  }
  .emoji {
    font-size: 1.6rem;
    line-height: 1;
    z-index: 2;
    transition: transform 160ms ease;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
  }
  .count {
    position: absolute;
    top: -0.35rem;
    right: -0.35rem;
    min-width: 1.15rem;
    height: 1.15rem;
    padding: 0 0.28rem;
    border-radius: 999px;
    background: #fff;
    color: color-mix(in srgb, var(--accent, #f472b6) 80%, #7a1e4b);
    font-size: 0.62rem;
    font-weight: 900;
    line-height: 1.15rem;
    z-index: 3;
    font-variant-numeric: tabular-nums;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }
  .plus {
    position: absolute;
    left: 50%;
    top: 0;
    color: #fff;
    font-weight: 900;
    font-size: 0.85rem;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    z-index: 4;
    animation: plus-float 0.75s ease-out forwards;
  }
  @keyframes heart-in {
    from {
      opacity: 0;
      transform: translateX(-50%) scale(0.3) translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) scale(1) translateY(0);
    }
  }
  @keyframes glow-pulse {
    0%,
    100% {
      opacity: 0.5;
      transform: scale(0.85);
    }
    50% {
      opacity: 1;
      transform: scale(1.05);
    }
  }
  @keyframes plus-float {
    from {
      opacity: 1;
      transform: translate(calc(-50% + var(--dx, 0px)), 0) scale(1);
    }
    to {
      opacity: 0;
      transform: translate(calc(-50% + var(--dx, 0px)), -28px) scale(1.3);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .surprise-heart,
    .glow,
    .plus {
      animation: none;
    }
  }
</style>
