<script lang="ts">
  /**
   * OfflineIndicator — top banner shown when navigator.onLine === false
   * (Phase 15 #6).
   *
   * Behaviour:
   *   - Listens to `online` and `offline` window events.
   *   - On first mount, syncs with `navigator.onLine` so the banner shows
   *     immediately if the user opens the app already offline.
   *   - Banner slides in from the top with a soft animation (killed by
   *     prefers-reduced-motion).
   *   - aria-live="polite" so screen readers announce the change.
   *   - pt-PT throughout.
   */
  import { onMount } from 'svelte';

  let online = $state(true);

  onMount(() => {
    if (typeof navigator !== 'undefined') {
      online = navigator.onLine;
    }
    const onOnline = () => (online = true);
    const onOffline = () => (online = false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  });
</script>

{#if !online}
  <div class="offline-banner" role="status" aria-live="polite">
    <span class="icon" aria-hidden="true">📡</span>
    <span class="text">Sem ligação — algumas funcionalidades podem estar limitadas</span>
  </div>
{/if}

<style>
  .offline-banner {
    position: sticky;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 0.65rem 1rem;
    background: rgba(245, 158, 11, 0.18);
    color: #fde68a;
    border-bottom: 1px solid rgba(245, 158, 11, 0.45);
    font-size: 0.9rem;
    font-weight: 600;
    text-align: center;
    backdrop-filter: blur(6px);
    animation: slide-in 0.2s ease-out;
  }
  .icon {
    font-size: 1.05rem;
    line-height: 1;
  }
  .text {
    line-height: 1.2;
  }
  @keyframes slide-in {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .offline-banner {
      animation: none;
    }
  }
</style>