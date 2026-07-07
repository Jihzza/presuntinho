<script lang="ts">
  import { onMount } from 'svelte';
  import { TOAST_EVENT, type ToastDetail, type ToastType } from './events';

  interface QueuedToast {
    id: number;
    msg: string;
    type: ToastType;
    duration: number;
  }

  // Up to 3 toasts stack; further ones queue and surface as slots free up.
  const MAX_VISIBLE = 3;
  let nextId = 0;
  let visible = $state<QueuedToast[]>([]);
  let pending: QueuedToast[] = [];
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  const ICONS: Record<ToastType, string> = {
    info: 'ℹ️',
    success: '✅',
    error: '⚠️',
    warning: '⚠️'
  };

  function pump() {
    while (visible.length < MAX_VISIBLE && pending.length > 0) {
      const next = pending.shift()!;
      visible = [...visible, next];
      timers.set(
        next.id,
        setTimeout(() => dismiss(next.id), next.duration)
      );
    }
  }

  function dismiss(id: number) {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    visible = visible.filter((t) => t.id !== id);
    pump();
  }

  function enqueue(detail: ToastDetail) {
    pending.push({
      id: nextId++,
      msg: detail.msg,
      type: detail.type ?? 'info',
      duration: detail.duration ?? 3000
    });
    pump();
  }

  onMount(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<ToastDetail>;
      if (ce.detail?.msg) enqueue(ce.detail);
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => {
      window.removeEventListener(TOAST_EVENT, handler);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  });
</script>

{#if visible.length > 0}
  <div class="toast-stack" role="status" aria-live="polite" aria-label="Notificações">
    {#each visible as toast (toast.id)}
      <button
        type="button"
        class="toast toast-{toast.type}"
        aria-label="Dispensar notificação"
        onclick={() => dismiss(toast.id)}
      >
        <span class="toast-icon" aria-hidden="true">{ICONS[toast.type]}</span>
        <span class="toast-msg">{toast.msg}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .toast-stack {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: center;
    z-index: 10000;
    max-width: 90vw;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    background: rgba(31, 46, 74, 0.95);
    color: #fff;
    padding: 0.75rem 1.25rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border-strong, rgba(236, 72, 153, 0.4));
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    font-size: 0.95rem;
    max-width: 100%;
    text-align: left;
    font-family: inherit;
    cursor: pointer;
    animation: toast-in 0.2s ease-out;
  }
  .toast-success {
    border-color: var(--success, #22c55e);
  }
  .toast-error,
  .toast-warning {
    border-color: var(--warning, #f59e0b);
  }
  .toast-icon {
    flex: 0 0 auto;
    font-size: 1rem;
    line-height: 1;
  }
  .toast-msg {
    flex: 1 1 auto;
  }
  @keyframes toast-in {
    from {
      transform: translateY(0.5rem);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }
</style>
