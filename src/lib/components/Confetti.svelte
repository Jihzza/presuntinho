<script lang="ts">
  import { onMount } from 'svelte';
  import { CONFETTI_EVENT, prefersReducedMotion, type ConfettiBurst } from './events';

  interface Props {
    count?: number;
  }
  let { count = 60 }: Props = $props();

  let layer = $state<HTMLDivElement | null>(null);

  const COLORS = ['#d4af37', '#b8945a', '#9b7ede', '#e8b4b8', '#4ecdc4', '#ff6b9d', '#c47891'];
  const HEART_SHAPES = ['♥', '✦', '●', '✧'];

  function fire(detail: number | ConfettiBurst) {
    if (!layer) return;
    if (prefersReducedMotion()) return;

    const burst = typeof detail === 'number' ? null : detail;
    const total = Math.min(320, typeof detail === 'number' && detail > 0 ? detail : (burst?.count ?? count));
    const origin = burst?.origin ?? 'top';
    const intensity = Math.max(1, burst?.intensity ?? 1);
    const palette = burst?.palette ?? COLORS;

    for (let i = 0; i < total; i++) {
      const piece = document.createElement('div');
      piece.className = `confetti-piece confetti-${origin}`;
      const color = palette[Math.floor(Math.random() * palette.length)];
      piece.style.setProperty('--c', color);
      piece.style.setProperty('--dx', `${(Math.random() - 0.5) * (origin === 'heart' ? 320 + intensity * 38 : 90)}px`);
      piece.style.setProperty('--spin', `${(Math.random() * 900 + 360) * (Math.random() > 0.5 ? 1 : -1)}deg`);
      piece.style.setProperty('--scale', String(0.75 + Math.random() * Math.min(1.2, 0.42 + intensity * 0.13)));
      piece.style.left = origin === 'heart' ? `calc(100vw - ${40 + Math.random() * 52}px)` : Math.random() * 100 + 'vw';
      piece.style.top = origin === 'heart' ? `calc(100vh - ${118 + Math.random() * 60}px)` : '-12px';
      piece.style.animationDuration = origin === 'heart' ? (Math.random() * 0.9 + 1.15) + 's' : (Math.random() * 2 + 2) + 's';
      piece.style.animationDelay = (Math.random() * 0.18) + 's';
      if (origin === 'heart' && Math.random() > 0.48) {
        piece.textContent = HEART_SHAPES[Math.floor(Math.random() * HEART_SHAPES.length)];
      }
      layer.appendChild(piece);
      setTimeout(() => { piece.remove(); }, 4600);
    }
  }

  onMount(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<number | ConfettiBurst>;
      fire(ce.detail ?? count);
    };
    let shakeTimer: ReturnType<typeof setTimeout> | null = null;
    const shake = () => {
      if (prefersReducedMotion()) return;
      // Shake the main content area (and the sticky nav bars), NEVER
      // document.body or .app: animating transform on an ancestor of
      // position:fixed elements re-anchors them to the animated box,
      // making the heart button / fab stack "jump" for the whole 420ms.
      const targets = [
        document.getElementById('main-content'),
        document.querySelector('header.nav'),
        document.querySelector('nav.bottom-nav')
      ].filter((el): el is HTMLElement => el instanceof HTMLElement);
      if (shakeTimer) clearTimeout(shakeTimer);
      for (const el of targets) {
        // Cancel any in-flight shake so a rapid re-trigger restarts cleanly
        // (no forced-reflow layout thrash needed).
        el.getAnimations().forEach((a) => a.cancel());
        el.classList.remove('presuntinho-shake');
        el.classList.add('presuntinho-shake');
      }
      shakeTimer = setTimeout(() => {
        shakeTimer = null;
        for (const el of targets) el.classList.remove('presuntinho-shake');
      }, 420);
    };
    window.addEventListener(CONFETTI_EVENT, handler);
    window.addEventListener('presuntinho:screen-shake', shake);
    return () => {
      window.removeEventListener(CONFETTI_EVENT, handler);
      window.removeEventListener('presuntinho:screen-shake', shake);
      if (shakeTimer) clearTimeout(shakeTimer);
    };
  });
</script>

<div class="confetti-layer" bind:this={layer} aria-hidden="true"></div>

<style>
  .confetti-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9999;
    overflow: hidden;
  }
  :global(.confetti-piece) {
    position: absolute;
    top: -10px;
    width: 10px;
    height: 16px;
    border-radius: 4px;
    background: var(--c, #ff6b9d);
    animation: fall 3.2s cubic-bezier(.17,.67,.2,1) forwards;
  }
  :global(.confetti-heart) {
    width: 10px;
    height: 10px;
    display: grid;
    place-items: center;
    background: var(--c, #ff6b9d);
    color: var(--c, #ff6b9d);
    border-radius: 999px;
    font-size: 14px;
    font-weight: 900;
    box-shadow: 0 0 14px color-mix(in srgb, var(--c, #ff6b9d) 42%, transparent);
    animation: heartBurst 1.45s cubic-bezier(.16,.84,.25,1) forwards;
  }
  :global(.confetti-heart:not(:empty)) {
    width: auto;
    height: auto;
    background: transparent;
  }
  /* Applied to #main-content + the sticky nav bars (never body/.app —
     a transform there re-anchors every position:fixed element). */
  :global(.presuntinho-shake) {
    animation: presuntinho-screen-shake 420ms cubic-bezier(.36,.07,.19,.97) both;
  }
  @keyframes presuntinho-screen-shake {
    0%, 100% { transform: translate3d(0,0,0) rotate(0); }
    12% { transform: translate3d(-3px,2px,0) rotate(-0.35deg); }
    24% { transform: translate3d(4px,-2px,0) rotate(0.35deg); }
    36% { transform: translate3d(-5px,1px,0) rotate(-0.25deg); }
    48% { transform: translate3d(5px,2px,0) rotate(0.25deg); }
    60% { transform: translate3d(-3px,-1px,0) rotate(-0.18deg); }
    72% { transform: translate3d(3px,1px,0) rotate(0.18deg); }
    84% { transform: translate3d(-1px,0,0) rotate(-0.08deg); }
  }
  @keyframes fall {
    0% { transform: translateY(0) rotate(0deg); opacity: 1; }
    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
  }
  @keyframes heartBurst {
    0% { transform: translate3d(0,0,0) rotate(0deg) scale(var(--scale, 1)); opacity: 1; }
    55% { opacity: .95; }
    100% { transform: translate3d(var(--dx, -120px), -58vh, 0) rotate(var(--spin, 720deg)) scale(.3); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.confetti-piece) {
      animation: none;
      display: none;
    }
    :global(.presuntinho-shake) {
      animation: none;
    }
  }
</style>