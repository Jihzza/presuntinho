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
  import {
    DEFAULT_MASCOT_ID,
    MASCOT_CHANGED_EVENT,
    getActiveMascot,
    mascotById
  } from '$lib/gamification/mascots';
  import {
    hoursUntilMidnight,
    mascotEmotion,
    type MascotEmotion
  } from '$lib/gamification/emotion';
  import PigMascot from './PigMascot.svelte';
  import { getActivityStreak } from '$lib/gamification/streak';
  import {
    minutesSinceLastAction,
    ACTION_PULSE_EVENT,
    STREAK_CHANGED_EVENT
  } from '$lib/gamification/gamification-events';
  import { t } from 'svelte-i18n';

  const VISITED_THRESHOLD = 4;

  let visible = $state(false);
  let reduced = $state(false);
  // V9 — the FAB renders the ACTIVE mascot (picked on /mascotes/)
  // instead of the old hardcoded 🧴. Default preserves the V8 look.
  let emoji = $state(mascotById(DEFAULT_MASCOT_ID)?.emoji ?? '🧴');
  // V10 — Duolingo-style emotional state (happy/neutral/worried/sad/euphoric).
  let emotion = $state<MascotEmotion>('neutral');

  const EMOTION_FALLBACKS: Record<MascotEmotion, string> = {
    happy: 'Hoje já contou — orgulho em ti! 🎀',
    neutral: 'Pronta para a primeira vitória do dia?',
    worried: 'A chama apaga-se à meia-noite… uma coisinha rápida chega!',
    sad: 'A streak partiu-se, mas hoje é um ótimo dia para recomeçar.',
    euphoric: 'UAU! Estás imparável!'
  };
  const emotionLine = $derived(
    $t(`mascots.emotion.${emotion}`, { default: EMOTION_FALLBACKS[emotion] })
  );

  async function refreshEmotion(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      const streak = await getActivityStreak();
      emotion = mascotEmotion({
        streakCurrent: streak.current,
        streakBest: streak.best,
        activeToday: streak.activeToday,
        hoursUntilMidnight: hoursUntilMidnight(),
        minutesSinceLastAction: minutesSinceLastAction()
      });
    } catch (e) {
      console.warn('[mascot] emotion refresh failed', e);
    }
  }

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

  async function refreshMascot(): Promise<void> {
    try {
      emoji = (await getActiveMascot()).emoji;
    } catch (e) {
      console.error('[mascot] active-mascot read failed', e);
    }
  }

  function onMascotChanged(e: Event): void {
    const detail = (e as CustomEvent<{ emoji?: string }>).detail;
    if (detail?.emoji) {
      emoji = detail.emoji;
    } else {
      void refreshMascot();
    }
  }

  onMount(() => {
    reduced = prefersReducedMotion();
    void refresh();
    void refreshMascot();
    void refreshEmotion();
    // Re-check on focus so navigating around unlocks the FAB.
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
        void refreshEmotion();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);
    const onPulse = () => void refreshEmotion();
    window.addEventListener(ACTION_PULSE_EVENT, onPulse);
    window.addEventListener(STREAK_CHANGED_EVENT, onPulse);
    // The worried-evening window depends on the clock — refresh each minute.
    const emotionTimer = setInterval(() => void refreshEmotion(), 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);
      window.removeEventListener(ACTION_PULSE_EVENT, onPulse);
      window.removeEventListener(STREAK_CHANGED_EVENT, onPulse);
      clearInterval(emotionTimer);
    };
  });
</script>

{#if visible}
  <button
    type="button"
    class="mascot-fab"
    class:reduced
    class:sad={emotion === 'sad'}
    class:worried={emotion === 'worried'}
    class:euphoric={emotion === 'euphoric'}
    onclick={onClick}
    aria-label={$t('components.mascot.aria', { default: 'Mascote — easter egg' })}
    title={emotionLine}
  >
    <!-- V10.2 — a mascote oficial é o porquinho SVG com a emoção do dia;
         a mascote colecionável escolhida aparece como companheiro pequeno. -->
    <PigMascot {emotion} size={34} />
    {#if emoji !== '🐷'}
      <span class="companion" aria-hidden="true">{emoji}</span>
    {/if}
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
    color: var(--txt);
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
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-color: color-mix(in srgb, var(--accent) 26%, transparent);
    outline: none;
  }
  .mascot-fab:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .mascot-fab:active {
    transform: scale(0.95);
  }
  .companion {
    position: absolute;
    right: -3px;
    bottom: -3px;
    font-size: 0.9rem;
    line-height: 1;
    filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.5));
    user-select: none;
    -webkit-user-select: none;
  }
  .mascot-fab {
    position: relative;
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
