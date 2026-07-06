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
  import { goto } from '$app/navigation';
  import { db } from '$lib/state/db';
  import { sendLove, sendNudge, type PingResult } from '$lib/couple/couple-store.svelte';
  import { playSfx, vibrate } from '$lib/gamification/sound';
  import { prefersReducedMotion, showToast } from './events';
  import {
    DEFAULT_MASCOT_ID,
    MASCOT_CHANGED_EVENT,
    getActiveMascot
  } from '$lib/gamification/mascots';
  import {
    hoursUntilMidnight,
    mascotEmotion,
    type MascotEmotion
  } from '$lib/gamification/emotion';
  import MascotAvatar from './MascotAvatar.svelte';
  import { getActivityStreak } from '$lib/gamification/streak';
  import {
    minutesSinceLastAction,
    ACTION_PULSE_EVENT,
    STREAK_CHANGED_EVENT
  } from '$lib/gamification/gamification-events';
  import { t } from 'svelte-i18n';

  const VISITED_THRESHOLD = 4;

  let { interactive = true }: { interactive?: boolean } = $props();

  let visible = $state(false);
  let reduced = $state(false);
  // Gesture burst overlay: 'love' (hold) or 'nudge' (multi-tap) or none.
  let burst = $state<'none' | 'love' | 'nudge'>('none');
  let particles = $state<{ id: number; a: number }[]>([]);
  // V10.4 — the FAB renders the ACTIVE mascot's ART (picked on /mascotes/).
  let mascotId = $state(DEFAULT_MASCOT_ID);
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

  // ── gesture disambiguation ─────────────────────────────────────────────
  //   1 tap  → agent · 2 taps → couple chat · ≥4 taps → nudge (saudades)
  //   hold   → send love (💛) with an "explode" burst
  const HOLD_MS = 550;
  const TAP_WINDOW = 320;
  let tapCount = 0;
  let holdFired = false;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  let particleTimer: ReturnType<typeof setTimeout> | null = null;
  let pseq = 0;

  function fireParticles(kind: 'love' | 'nudge'): void {
    burst = kind;
    if (!reduced) {
      const n = 12;
      particles = Array.from({ length: n }, (_, i) => ({ id: ++pseq, a: Math.round((360 / n) * i) }));
    }
    if (particleTimer) clearTimeout(particleTimer);
    particleTimer = setTimeout(() => {
      particleTimer = null;
      burst = 'none';
      particles = [];
    }, 900);
  }

  // Clear every gesture timer — called from the onMount cleanup so a pending
  // hold/tap/particle timer can't fire (and navigate/send) after unmount.
  function clearGestureTimers(): void {
    if (holdTimer) clearTimeout(holdTimer);
    if (tapTimer) clearTimeout(tapTimer);
    if (particleTimer) clearTimeout(particleTimer);
    holdTimer = tapTimer = particleTimer = null;
  }

  function toastForResult(res: PingResult): void {
    if (res === 'cooldown') showToast($t('couple.ping.cooldown', { default: 'Espera um bocadinho 😅' }), 2000);
    else if (res === 'offline') showToast($t('couple.ping.offline', { default: 'Sem ligação — tenta já a seguir' }), 2200);
    else if (res === 'disabled') showToast($t('couple.ping.disabled', { default: 'Liga a conta do casal nas Definições 💑' }), 2600);
  }

  async function doLove(): Promise<void> {
    fireParticles('love');
    playSfx('milestone');
    vibrate('success');
    const res = await sendLove();
    if (res === 'sent') showToast($t('couple.love.sent', { default: '💌 Amor enviado 💛' }), 2200);
    else toastForResult(res);
  }

  async function doNudge(): Promise<void> {
    fireParticles('nudge');
    playSfx('whoosh');
    vibrate('warning');
    const res = await sendNudge();
    if (res === 'sent') showToast($t('couple.nudge.sent', { default: '📳 Saudades enviadas!' }), 2200);
    else toastForResult(res);
  }

  function resolveTaps(): void {
    const n = tapCount;
    tapCount = 0;
    if (n >= 4) void doNudge();
    else if (n >= 2) void goto('/mensagens');
    else void goto('/agente');
  }

  function onPointerDown(): void {
    if (!interactive) return;
    holdFired = false;
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      holdTimer = null;
      holdFired = true;
      tapCount = 0;
      if (tapTimer) {
        clearTimeout(tapTimer);
        tapTimer = null;
      }
      void doLove();
    }, HOLD_MS);
  }

  function onPointerEnd(): void {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  // Click carries the taps (fires for mouse, touch-tap AND keyboard Enter/Space,
  // so the gesture stays accessible); a completed hold suppresses the trailing
  // click so it isn't double-counted as a tap.
  function onClick(): void {
    if (!interactive) {
      void goto('/agente');
      return;
    }
    if (holdFired) {
      holdFired = false;
      return;
    }
    tapCount += 1;
    if (tapTimer) clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      tapTimer = null;
      resolveTaps();
    }, TAP_WINDOW);
  }

  async function refreshMascot(): Promise<void> {
    try {
      mascotId = (await getActiveMascot()).id;
    } catch (e) {
      console.error('[mascot] active-mascot read failed', e);
    }
  }

  function onMascotChanged(e: Event): void {
    const detail = (e as CustomEvent<{ id?: string }>).detail;
    if (detail?.id) {
      mascotId = detail.id;
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
      clearGestureTimers();
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
    class:loving={burst === 'love'}
    class:nudging={burst === 'nudge'}
    onpointerdown={onPointerDown}
    onpointerup={onPointerEnd}
    onpointercancel={onPointerEnd}
    onpointerleave={onPointerEnd}
    onclick={onClick}
    oncontextmenu={(e) => e.preventDefault()}
    aria-label={$t('mascot.gesture.aria', { default: 'Mascote — toca para o agente, duas vezes para a conversa, mantém para enviar amor' })}
    title={emotionLine}
  >
    <!-- V10.4 — a mascote ESCOLHIDA (arte real) com a emoção do dia. -->
    <MascotAvatar mascot={mascotId} {emotion} size={48} animate={!reduced} />
    {#each particles as p (p.id)}
      <span class="particle" style={`--a:${p.a}deg`} aria-hidden="true">{burst === 'love' ? '💛' : '💭'}</span>
    {/each}
  </button>
{/if}

<style>
  .mascot-fab {
    /* 60 × 60 px — bigger & more present than before, still a comfy touch target. */
    width: 60px;
    height: 60px;
    min-width: 60px;
    min-height: 60px;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--txt);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    /* The .mascot-corner in +layout owns the on-screen placement; this stays
       non-fixed so it isn't hidden behind the Vida footer tab. `relative` also
       makes it the positioning context for the gesture particles below. */
    position: relative;
    opacity: 0.82;
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
  /* Gesture bursts — love (hold) pulses HARD, nudge (multi-tap) shakes wildly. */
  .mascot-fab.loving {
    animation: mascot-love 0.72s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .mascot-fab.nudging {
    animation: mascot-shake 0.6s ease;
  }
  @keyframes mascot-love {
    0% { transform: scale(1) rotate(0); }
    30% { transform: scale(1.5) rotate(-6deg); }
    55% { transform: scale(1.32) rotate(6deg); }
    75% { transform: scale(1.42) rotate(-3deg); }
    100% { transform: scale(1) rotate(0); }
  }
  @keyframes mascot-shake {
    0%, 100% { transform: translateX(0) rotate(0); }
    15% { transform: translateX(-9px) rotate(-13deg); }
    30% { transform: translateX(9px) rotate(13deg); }
    45% { transform: translateX(-7px) rotate(-10deg); }
    60% { transform: translateX(7px) rotate(10deg); }
    80% { transform: translateX(-4px) rotate(-5deg); }
  }
  /* Radial particle burst flung from the mascot's centre — bigger + further. */
  .particle {
    position: absolute;
    left: 50%;
    top: 50%;
    font-size: 1.35rem;
    line-height: 1;
    pointer-events: none;
    z-index: 5;
    animation: particle-fly 0.95s ease-out forwards;
  }
  @keyframes particle-fly {
    from {
      opacity: 1;
      transform: translate(-50%, -50%) rotate(var(--a, 0deg)) translateY(0) scale(0.6);
    }
    to {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(var(--a, 0deg)) translateY(-68px) scale(1.3);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .mascot-fab,
    .mascot-fab:hover,
    .mascot-fab:active,
    .mascot-fab.loving,
    .mascot-fab.nudging {
      transform: none;
      transition: none;
      animation: none;
    }
    .particle {
      animation: none;
      display: none;
    }
  }
</style>
