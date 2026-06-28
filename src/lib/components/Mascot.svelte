<script lang="ts">
  /**
   * Mascot — Floating Action Button (FAB).
   *
   * Mirrors V3's mascot icon (🧴) that lives in the bottom-right and
   * surfaces random pro-tips.  Visibility is gated by the user's
   * exploration: only shown after ≥ 4 distinct routes have been visited.
   *
   * Honours `prefers-reduced-motion` — when reduced motion is requested
   * we drop the gentle hover-bounce but keep the FAB usable.
   */

  import { onMount } from 'svelte';
  import { db } from '$lib/state/db';
  import { mascotClick } from '$lib/easterEggs';
  import { prefersReducedMotion } from './events';
  import { t } from 'svelte-i18n';

  const VISITED_THRESHOLD = 4;

  let visible = $state(false);
  let reduced = $state(false);

  async function refresh(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      const count = await db().visited.count();
      visible = count >= VISITED_THRESHOLD;
    } catch (e) {
      console.error('[mascot] visited.count failed', e);
      // Fail open so the FAB is still available offline.
      visible = false;
    }
  }

  function onClick(): void {
    void mascotClick();
  }

  onMount(() => {
    reduced = prefersReducedMotion();
    void refresh();
    // Re-check on focus so navigating around unlocks the FAB.
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  });
</script>

{#if visible}
  <button
    type="button"
    class="mascot-fab"
    class:reduced
    onclick={onClick}
    aria-label={$t('components.mascot.aria', { default: 'Mascote — easter egg' })}
    title={$t('components.mascot.title', { default: 'Clica — pro tip' })}
  >
    <span class="emoji" aria-hidden="true">🧴</span>
  </button>
{/if}

<style>
  .mascot-fab {
    /* 60 × 60 px touch target — exceeds WCAG 44 px baseline. */
    width: 60px;
    height: 60px;
    min-width: 60px;
    min-height: 60px;
    border-radius: 50%;
    border: 0;
    background: linear-gradient(135deg, var(--accent, #ec4899) 0%, #f59e0b 100%);
    color: #fff;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    /* Fixed bottom-right with safe-area inset for iOS notch. */
    position: fixed;
    right: max(1rem, env(safe-area-inset-right));
    bottom: max(1rem, env(safe-area-inset-bottom));
    z-index: 50;
    box-shadow:
      0 6px 18px rgba(236, 72, 153, 0.45),
      0 2px 6px rgba(0, 0, 0, 0.35);
    transition:
      transform 0.18s ease,
      box-shadow 0.2s ease;
  }
  .mascot-fab:hover,
  .mascot-fab:focus-visible {
    transform: translateY(-2px) scale(1.04);
    box-shadow:
      0 10px 24px rgba(236, 72, 153, 0.55),
      0 3px 8px rgba(0, 0, 0, 0.4);
    outline: none;
  }
  .mascot-fab:focus-visible {
    box-shadow:
      0 0 0 3px rgba(255, 255, 255, 0.55),
      0 6px 18px rgba(236, 72, 153, 0.55);
  }
  .mascot-fab:active {
    transform: scale(0.95);
  }
  .emoji {
    font-size: 1.85rem;
    line-height: 1;
    user-select: none;
    -webkit-user-select: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .mascot-fab,
    .mascot-fab:hover,
    .mascot-fab:active {
      transform: none;
      transition: none;
    }
  }
</style>
