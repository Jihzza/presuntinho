<script lang="ts">
  /**
   * OfflineIndicator — fixed top connectivity banner.
   *
   * Shows a persistent offline state and a short success state when the
   * browser comes back online. The retry action is intentionally simple:
   * when offline it asks the browser to re-check by reloading the current
   * route; when online it dismisses the transient banner.
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  type BannerState = 'hidden' | 'offline' | 'online';

  let state: BannerState = $state('hidden');
  let wasOffline = false;
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;

  function clearDismissTimer(): void {
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
  }

  function showOnlineThenDismiss(): void {
    clearDismissTimer();
    state = 'online';
    dismissTimer = setTimeout(() => {
      state = 'hidden';
      dismissTimer = null;
    }, 3000);
  }

  function syncFromNavigator(initial = false): void {
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    if (!online) {
      clearDismissTimer();
      wasOffline = true;
      state = 'offline';
      return;
    }

    if (!initial && wasOffline) {
      wasOffline = false;
      showOnlineThenDismiss();
      return;
    }

    state = 'hidden';
  }

  onMount(() => {
    syncFromNavigator(true);

    const onOnline = () => syncFromNavigator(false);
    const onOffline = () => syncFromNavigator(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      clearDismissTimer();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  });

  function retry(): void {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      showOnlineThenDismiss();
      return;
    }

    location.reload();
  }
</script>

{#if state !== 'hidden'}
  <div
    class="connectivity-banner connectivity-banner--{state}"
    role="status"
    aria-live="polite"
  >
    <span class="icon" aria-hidden="true">{state === 'offline' ? '📡' : '✓'}</span>
    <span class="text">{state === 'offline' ? $t('offline.banner.offline', { default: 'Estás offline 🐷' }) : $t('offline.banner.online', { default: 'Volta a estar online! ✓' })}</span>
    {#if state === 'offline'}
      <button
        type="button"
        class="retry-btn"
        onclick={retry}
        aria-label={$t('offline.retry.aria', { default: 'Tentar novamente' })}
      >
        {$t('offline.retry', { default: 'Retry' })}
      </button>
    {/if}
  </div>
{/if}

<style>
  .connectivity-banner {
    position: fixed;
    top: max(0.5rem, env(safe-area-inset-top));
    left: 50%;
    z-index: 120;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    max-width: calc(100vw - 1.5rem);
    min-height: 42px;
    padding: 0.55rem 0.75rem;
    border-radius: 999px;
    border: 1px solid transparent;
    font-size: 0.9rem;
    font-weight: 700;
    text-align: center;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    animation: banner-in 0.18s ease-out;
  }

  .connectivity-banner--offline {
    background: rgba(127, 29, 29, 0.94);
    color: #fee2e2;
    border-color: rgba(248, 113, 113, 0.55);
  }

  .connectivity-banner--online {
    background: rgba(6, 95, 70, 0.94);
    color: #d1fae5;
    border-color: rgba(52, 211, 153, 0.55);
  }

  .icon {
    line-height: 1;
  }

  .text {
    line-height: 1.15;
    white-space: nowrap;
  }

  .retry-btn {
    min-height: 30px;
    padding: 0.25rem 0.65rem;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    color: inherit;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 800;
    cursor: pointer;
  }

  .retry-btn:hover,
  .retry-btn:focus-visible {
    background: rgba(255, 255, 255, 0.2);
    outline: none;
  }

  .retry-btn:focus-visible {
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.55);
  }

  @keyframes banner-in {
    from {
      opacity: 0;
      transform: translate(-50%, -0.5rem);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  @media (max-width: 420px) {
    .connectivity-banner {
      width: calc(100vw - 1rem);
      justify-content: space-between;
      border-radius: 0.85rem;
    }

    .text {
      white-space: normal;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .connectivity-banner {
      animation: none;
    }
  }
</style>
