<script lang="ts">
  import { onMount } from 'svelte';
  import { CONFETTI_EVENT } from './events';

  interface Props {
    count?: number;
  }
  let { count = 60 }: Props = $props();

  let layer = $state<HTMLDivElement | null>(null);

  // V3 palette (state.js line 148)
  const COLORS = ['#d4af37','#b8945a','#9b7ede','#e8b4b8','#4ecdc4','#ff6b9d','#c47891'];

  function fire(n: number) {
    if (!layer) return;
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
    window.addEventListener(CONFETTI_EVENT, handler);
    return () => window.removeEventListener(CONFETTI_EVENT, handler);
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
    width: 8px;
    height: 14px;
    border-radius: 2px;
    animation: fall 4s linear forwards;
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
  }
</style>