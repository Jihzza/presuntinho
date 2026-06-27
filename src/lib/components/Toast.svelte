<script lang="ts">
  import { onMount } from 'svelte';
  import { TOAST_EVENT } from './events';

  let message = $state('');
  let visible = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function show(msg: string, duration = 3000) {
    message = msg;
    visible = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      visible = false;
    }, duration);
  }

  onMount(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ msg: string; duration?: number }>;
      show(ce.detail.msg, ce.detail.duration);
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => {
      window.removeEventListener(TOAST_EVENT, handler);
      if (timer) clearTimeout(timer);
    };
  });
</script>

{#if visible}
  <div class="toast" role="status" aria-live="polite">{message}</div>
{/if}

<style>
  .toast {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(31, 46, 74, 0.95);
    color: #fff;
    padding: 0.75rem 1.25rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(236, 72, 153, 0.4);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 10000;
    font-size: 0.95rem;
    max-width: 90vw;
    text-align: center;
    animation: toast-in 0.2s ease-out;
  }
  @keyframes toast-in {
    from { transform: translate(-50%, 0.5rem); opacity: 0; }
    to   { transform: translate(-50%, 0);     opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast { animation: none; }
  }
</style>