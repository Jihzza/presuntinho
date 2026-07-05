<script lang="ts">
  /**
   * MascotWalker — the arcade "attract mode" mascot that walks back and forth
   * across a floor forever, old-school-cabinet style. rAF-driven so it can flip
   * direction at the exact edge (CSS can't branch cleanly there). A 2-step CSS
   * bob sells the walk cycle; under prefers-reduced-motion it stands and bobs
   * gently in place. Decorative (aria-hidden). Pauses when the tab is hidden.
   */
  import { onMount, onDestroy } from 'svelte';
  import MascotAvatar from '$lib/components/MascotAvatar.svelte';
  import { prefersReducedMotion } from '$lib/components/events';

  interface Props {
    mascot: string;
    /** Height in px. */
    size?: number;
    /** Walk speed in px/s. */
    speed?: number;
  }
  let { mascot, size = 76, speed = 34 }: Props = $props();

  let track = $state<HTMLDivElement | null>(null);
  let x = $state(0);
  let dir = $state(1);
  let reduced = $state(false);

  let raf = 0;
  let last = 0;
  let hidden = false;

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (hidden || reduced || !track) return;
    const span = Math.max(0, track.clientWidth - size * 0.78);
    x += dir * speed * dt;
    if (x >= span) {
      x = span;
      dir = -1;
    } else if (x <= 0) {
      x = 0;
      dir = 1;
    }
  }

  onMount(() => {
    reduced = prefersReducedMotion();
    const onVis = () => {
      hidden = document.hidden;
      last = performance.now();
    };
    document.addEventListener('visibilitychange', onVis);
    last = performance.now();
    raf = requestAnimationFrame(frame);
    return () => document.removeEventListener('visibilitychange', onVis);
  });
  onDestroy(() => cancelAnimationFrame(raf));
</script>

<div class="track" bind:this={track} aria-hidden="true">
  <div class="walker" class:reduced style={`transform: translate3d(${Math.round(x)}px, 0, 0)`}>
    <MascotAvatar {mascot} pose="hero" size={size} flip={dir < 0} animate={reduced} />
  </div>
</div>

<style>
  .track {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .walker {
    position: absolute;
    bottom: 0;
    left: 0;
    will-change: transform;
  }
  /* 2-step bob → reads like an 8-bit sprite taking steps (the walk illusion). */
  .walker :global(.mavatar) {
    animation: walk-bob 0.46s steps(2, end) infinite;
    transform-origin: 50% 100%;
  }
  .walker.reduced :global(.mavatar) {
    animation: none;
  }
  @keyframes walk-bob {
    0%,
    100% {
      transform: translateY(0) rotate(-2deg);
    }
    50% {
      transform: translateY(-9%) rotate(2deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .walker :global(.mavatar) {
      animation: none;
    }
  }
</style>
