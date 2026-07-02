<script lang="ts">
  import { onMount } from 'svelte';
  import { CONFETTI_EVENT, prefersReducedMotion } from './events';

  interface Props {
    count?: number;
  }
  let { count = 60 }: Props = $props();

  let layer = $state<HTMLDivElement | null>(null);

  // V3 palette (state.js line 148)
  const COLORS = ['#d4af37','#b8945a','#9b7ede','#e8b4b8','#4ecdc4','#ff6b9d','#c47891'];

  function fire(n: number) {
    if (!layer) return;
    // OS-level a11y: do not spawn particles if the user prefers reduced motion.
    if (prefersReducedMotion()) return;
    const total = typeof n === 'number' && n > 0 ? n : count;
    for (let i = 0; i < total; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
      piece.style.animationDuration = (Math.random() * 2 + 2) + 's';
      piece.style.animationDelay = (Math.random() * 0.5) + 's';
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      layer.appendChild(piece);
      setTimeout(() => { piece.remove(); }, 4500);
    }
  }

  onMount(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<number>;
      fire(ce.detail ?? count);
    };
    const shake = () => {
      if (prefersReducedMotion()) return;
      document.body.classList.remove('presuntinho-shake');
      void document.body.offsetWidth;
      document.body.classList.add('presuntinho-shake');
      setTimeout(() => document.body.classList.remove('presuntinho-shake'), 420);
    };
    window.addEventListener(CONFETTI_EVENT, handler);
    window.addEventListener('presuntinho:screen-shake', shake);
    return () => {
      window.removeEventListener(CONFETTI_EVENT, handler);
      window.removeEventListener('presuntinho:screen-shake', shake);
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
    animation: fall 3.2s cubic-bezier(.17,.67,.2,1) forwards;
  }
  :global(body.presuntinho-shake) {
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
  @media (prefers-reduced-motion: reduce) {
    :global(.confetti-piece) {
      animation: none;
      display: none;
    }
    :global(body.presuntinho-shake) {
      animation: none;
    }
  }
</style>