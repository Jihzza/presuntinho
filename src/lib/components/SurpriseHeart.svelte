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
  import { prefersReducedMotion, fireConfettiEvent } from './events';

  // Timing (ms). First appearance is soon-ish so it's discoverable; later gaps
  // are longer so it stays a treat. Each visit lasts a short, limited window.
  const FIRST_MIN = 12_000;
  const FIRST_MAX = 28_000;
  const GAP_MIN = 45_000;
  const GAP_MAX = 120_000;
  const SHOW_MIN = 7_000;
  const SHOW_MAX = 11_000;

  // Feedback escalation — the FASTER you tap, the more (and wilder) the reaction
  // grows, exponentially, but capped so a frantic tapper can never lag the app.
  const RATE_WINDOW = 1300; // ms sliding window used to measure tap speed
  const MAX_LEVEL = 12; // hard ceiling on intensity (the "upper limit")
  const MAX_POPS = 28; // hard ceiling on concurrent floating particles

  let visible = $state(false);
  let reduced = $state(false);
  let pops = $state<
    { id: number; dx: number; dy: number; rot: number; scale: number; big: boolean }[]
  >([]);
  let popSeq = 0;
  let tapTimes: number[] = [];
  let heartEl = $state<HTMLButtonElement | null>(null);

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

  /** A short, level-scaled shake of the heart via the Web Animations API
   *  (retriggerable + capped). Skipped under reduced motion. */
  function shake(level: number): void {
    if (!heartEl || reduced) return;
    const amp = Math.min(16, 2 + level); // px, capped
    const rot = Math.min(14, level); // deg, capped
    const s = 1 + Math.min(0.24, level * 0.02);
    heartEl.animate(
      [
        { transform: 'translateX(-50%) rotate(0) scale(1)' },
        { transform: `translateX(calc(-50% - ${amp}px)) rotate(-${rot}deg) scale(${s})` },
        { transform: `translateX(calc(-50% + ${amp}px)) rotate(${rot}deg) scale(${s})` },
        { transform: 'translateX(-50%) rotate(0) scale(1)' }
      ],
      { duration: Math.max(120, 260 - level * 10), easing: 'ease-in-out' }
    );
  }

  function onTap(): void {
    tapCouplePoint();

    // Measure tap speed over a sliding window → an intensity level, capped.
    const now = performance.now();
    tapTimes = tapTimes.filter((ts) => now - ts < RATE_WINDOW);
    tapTimes.push(now);
    const level = Math.min(MAX_LEVEL, tapTimes.length);

    // Sound + haptics escalate with level.
    playSfx('pop');
    if (level >= 6 && level % 3 === 0) playSfx('milestone');
    vibrate(level < 4 ? 'tap' : level < 8 ? 'success' : 'warning');

    if (!reduced) {
      // Confetti — Confetti.svelte keeps its OWN decaying heat/tier, so rapid
      // taps ramp the burst size, glow and screen-flash exponentially; we scale
      // the base burst with the local tap rate too. Both sides are hard-capped.
      fireConfettiEvent({
        origin: 'heart',
        count: Math.min(10 + level * 6, 90),
        intensity: 1 + level * 0.35
      });

      // More floating hearts/points per tap the faster you go (capped), flung
      // wider and bigger as it heats up.
      const n = Math.min(6, 1 + Math.floor(level / 2));
      const batch = Array.from({ length: n }, () => ({
        id: ++popSeq,
        dx: Math.round(rand(-12 - level * 3, 12 + level * 3)),
        dy: -(24 + level * 5),
        rot: Math.round(rand(-50, 50)),
        scale: Math.min(2, 1 + level * 0.08),
        big: level >= 7
      }));
      pops = [...pops, ...batch].slice(-MAX_POPS);
      const ids = new Set(batch.map((b) => b.id));
      const timer = setTimeout(() => {
        popTimers.delete(timer);
        pops = pops.filter((p) => !ids.has(p.id));
      }, 800);
      popTimers.add(timer);

      shake(level);
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
    bind:this={heartEl}
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
      <span
        class="plus"
        class:big={p.big}
        style={`--dx:${p.dx}px; --dy:${p.dy}px; --rot:${p.rot}deg; --scale:${p.scale}`}
        aria-hidden="true">{p.big ? '💗' : '+1'}</span>
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
    animation: plus-float 0.8s ease-out forwards;
  }
  .plus.big {
    font-size: 1.15rem;
    filter: drop-shadow(0 2px 6px rgba(244, 114, 182, 0.6));
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
      transform: translate(calc(-50% + var(--dx, 0px)), 0) rotate(0deg) scale(1);
    }
    to {
      opacity: 0;
      transform: translate(calc(-50% + var(--dx, 0px)), var(--dy, -28px))
        rotate(var(--rot, 0deg)) scale(calc(1.3 * var(--scale, 1)));
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
