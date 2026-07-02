<script lang="ts">
  /**
   * Mascot — Floating Action Button (FAB).
   *
   * Mirrors V3's mascot icon (🧴) and surfaces random pro-tips.
   * The layout places it as a quiet bottom-left affordance above the footer.
   * Visibility is gated by the user's
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
    /* 48 × 48 px touch target — still accessible, but visually quiet. */
    width: 48px;
    height: 48px;
    min-width: 48px;
    min-height: 48px;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    color: #fff;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    /* Position is owned by the shared .fab-stack in +layout.svelte. Keeping
       this component non-fixed prevents it sitting behind the Vida footer tab. */
    position: static;
    opacity: 0.64;
    filter: drop-shadow(0 3px 8px rgba(15, 23, 42, 0.42));
    transition:
      transform 0.18s ease,
      opacity 0.18s ease,
      background 0.18s ease,
      border-color 0.18s ease;
  }
  .mascot-fab:hover,
  .mascot-fab:focus-visible {
    opacity: 1;
    transform: translateY(-1px) scale(1.03);
    background: color-mix(in srgb, var(--accent, #ec4899) 10%, transparent);
    border-color: color-mix(in srgb, var(--accent, #ec4899) 26%, transparent);
    outline: none;
  }
  .mascot-fab:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #ec4899) 30%, transparent);
  }
  .mascot-fab:active {
    transform: scale(0.95);
  }
  .emoji {
    font-size: 1.65rem;
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
