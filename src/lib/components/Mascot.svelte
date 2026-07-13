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
  import { COUPLE_MOMENT_EVENT, type CoupleMoment } from '$lib/couple/couple-moments';
  import { playSfx, vibrate } from '$lib/gamification/sound';
  import { fireConfettiEvent, prefersReducedMotion, showToast } from './events';
  import {
    DEFAULT_MASCOT_ID,
    MASCOT_CHANGED_EVENT,
    getActiveMascot,
    isSpecialMascot
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
  let burst = $state<'none' | 'tap' | 'love' | 'nudge' | 'message'>('none');
  let particles = $state<{ id: number; a: number; glyph: string; distance: number; size: number }[]>([]);
  let holdCharging = $state(false);
  let tapIntensity = $state(0);
  let mascotEl = $state<HTMLButtonElement | null>(null);
  // V10.4 — the FAB renders the ACTIVE mascot's ART (picked on /mascotes/).
  let mascotId = $state(DEFAULT_MASCOT_ID);
  // V10 — Duolingo-style emotional state (happy/neutral/worried/sad/euphoric).
  let emotion = $state<MascotEmotion>('neutral');
  // The 3 personal família mascots get a glowing aura + heartbeat idle.
  const special = $derived(isSpecialMascot(mascotId));

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
  const HOLD_MS = 900;
  const TAP_WINDOW = 500;
  let tapCount = 0;
  let holdFired = false;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  let particleTimer: ReturnType<typeof setTimeout> | null = null;
  const holdPulseTimers = new Set<ReturnType<typeof setTimeout>>();
  let pseq = 0;

  function fireParticles(kind: 'tap' | 'love' | 'nudge' | 'message', amount?: number): void {
    burst = kind;
    if (!reduced) {
      const n = amount ?? (kind === 'love' ? 32 : kind === 'nudge' ? 24 : kind === 'message' ? 18 : 3);
      const glyph = kind === 'love' ? (special ? '❤️' : '💛') : kind === 'message' ? '💌' : '💭';
      const batch = Array.from({ length: n }, (_, i) => ({
        id: ++pseq,
        a: Math.round((360 / n) * i + (Math.random() - 0.5) * 14),
        glyph,
        distance: kind === 'tap' ? 34 + tapIntensity * 3 : kind === 'love' ? 104 : 86,
        size: kind === 'tap' ? 0.75 + tapIntensity * 0.06 : 1.15 + Math.random() * 0.45
      }));
      particles = [...particles, ...batch].slice(-42);
    }
    if (particleTimer) clearTimeout(particleTimer);
    particleTimer = setTimeout(() => {
      particleTimer = null;
      burst = 'none';
      particles = [];
    }, kind === 'tap' ? 650 : 1200);
  }

  function shakeScreen(): void {
    if (typeof window !== 'undefined' && !reduced) {
      window.dispatchEvent(new CustomEvent('presuntinho:screen-shake'));
    }
  }

  function clearHoldPulses(): void {
    for (const timer of holdPulseTimers) clearTimeout(timer);
    holdPulseTimers.clear();
  }

  function beginHoldFeedback(): void {
    holdCharging = true;
    clearHoldPulses();
    for (const [delay, kind] of [[230, 'tap'], [500, 'success'], [740, 'warning']] as const) {
      const timer = setTimeout(() => {
        holdPulseTimers.delete(timer);
        if (!holdCharging) return;
        playSfx('pop');
        vibrate(kind);
      }, delay);
      holdPulseTimers.add(timer);
    }
  }

  function tapFeedback(level: number): void {
    tapIntensity = Math.min(10, level);
    playSfx('pop');
    vibrate(level < 3 ? 'tap' : level < 5 ? 'success' : 'warning');
    fireParticles('tap', Math.min(7, 2 + Math.floor(level / 2)));
    if (!mascotEl || reduced) return;
    const amp = Math.min(13, 3 + level * 1.6);
    const scale = Math.min(1.58, 1.04 + level * 0.075);
    mascotEl.animate(
      [
        { transform: 'translateX(0) rotate(0) scale(1)' },
        { transform: `translateX(-${amp}px) rotate(-${Math.min(18, 4 + level * 2)}deg) scale(${scale})` },
        { transform: `translateX(${amp}px) rotate(${Math.min(18, 4 + level * 2)}deg) scale(${scale * 0.92})` },
        { transform: 'translateX(0) rotate(0) scale(1)' }
      ],
      { duration: Math.max(150, 260 - level * 14), easing: 'cubic-bezier(.2,.9,.3,1)' }
    );
  }

  // Clear every gesture timer — called from the onMount cleanup so a pending
  // hold/tap/particle timer can't fire (and navigate/send) after unmount.
  function clearGestureTimers(): void {
    if (holdTimer) clearTimeout(holdTimer);
    if (tapTimer) clearTimeout(tapTimer);
    if (particleTimer) clearTimeout(particleTimer);
    holdTimer = tapTimer = particleTimer = null;
    holdCharging = false;
    tapIntensity = 0;
    clearHoldPulses();
  }

  function toastForResult(res: PingResult): void {
    if (res === 'cooldown') showToast($t('couple.ping.cooldown', { default: 'Espera um bocadinho 😅' }), 2000);
    else if (res === 'offline') showToast($t('couple.ping.offline', { default: 'Sem ligação — tenta já a seguir' }), 2200);
    else if (res === 'disabled') showToast($t('couple.ping.disabled', { default: 'Liga a conta do casal nas Definições 💑' }), 2600);
  }

  async function doLove(): Promise<void> {
    fireParticles('love');
    fireConfettiEvent({ origin: 'heart', count: 110, intensity: 5, palette: ['#ff4f9a', '#ff8fbd', '#ffd1e3', '#fff'] });
    shakeScreen();
    playSfx('levelup');
    vibrate('warning');
    const res = await sendLove();
    if (res === 'sent') showToast($t('couple.love.sent', { default: '💌 Amor enviado 💛' }), 2200);
    else toastForResult(res);
  }

  async function doNudge(): Promise<void> {
    fireParticles('nudge');
    fireConfettiEvent({ origin: 'heart', count: 82, intensity: 4, palette: ['#f472b6', '#a78bfa', '#fef3c7'] });
    shakeScreen();
    playSfx('whoosh');
    vibrate('warning');
    const res = await sendNudge();
    if (res === 'sent') showToast($t('couple.nudge.sent', { default: '📳 Saudades enviadas!' }), 2200);
    else toastForResult(res);
  }

  function resolveTaps(): void {
    const n = tapCount;
    tapCount = 0;
    tapIntensity = 0;
    if (n >= 4) void doNudge();
    else if (n >= 2) void goto('/mensagens');
    else void goto('/agente');
  }

  function onPointerDown(): void {
    if (!interactive) return;
    holdFired = false;
    beginHoldFeedback();
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      holdTimer = null;
      holdFired = true;
      holdCharging = false;
      clearHoldPulses();
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
    if (!holdFired) {
      holdCharging = false;
      clearHoldPulses();
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
    tapFeedback(tapCount);
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

  // The global layer owns sound/haptics.  The floating mascot only mirrors the
  // received moment visually, avoiding duplicate buzzes while still making the
  // companion react wherever the person currently is in the app.
  function onCoupleMoment(event: Event): void {
    const moment = (event as CustomEvent<CoupleMoment>).detail;
    if (moment?.kind === 'love') fireParticles('love', 34);
    else if (moment?.kind === 'nudge') fireParticles('nudge', 28);
    else if (moment?.kind === 'message') fireParticles('message', 20);
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
    window.addEventListener(COUPLE_MOMENT_EVENT, onCoupleMoment);
    const onPulse = () => void refreshEmotion();
    window.addEventListener(ACTION_PULSE_EVENT, onPulse);
    window.addEventListener(STREAK_CHANGED_EVENT, onPulse);
    // The worried-evening window depends on the clock — refresh each minute.
    const emotionTimer = setInterval(() => void refreshEmotion(), 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);
      window.removeEventListener(COUPLE_MOMENT_EVENT, onCoupleMoment);
      window.removeEventListener(ACTION_PULSE_EVENT, onPulse);
      window.removeEventListener(STREAK_CHANGED_EVENT, onPulse);
      clearInterval(emotionTimer);
      clearGestureTimers();
    };
  });
</script>

{#if visible}
  <button
    bind:this={mascotEl}
    type="button"
    class="mascot-fab"
    class:reduced
    class:special
    class:sad={emotion === 'sad'}
    class:worried={emotion === 'worried'}
    class:euphoric={emotion === 'euphoric'}
    class:loving={burst === 'love'}
    class:nudging={burst === 'nudge'}
    class:receiving={burst === 'message'}
    class:charging-love={holdCharging}
    style={`--hold-ms:${HOLD_MS}ms; --tap-intensity:${tapIntensity}`}
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
    <MascotAvatar
      mascot={mascotId}
      {emotion}
      pose={holdCharging || burst === 'love' ? 'love' : burst === 'nudge' ? 'jump' : burst === 'message' ? 'wave' : null}
      size={64}
      animate={!reduced && !holdCharging && burst === 'none'}
    />
    {#each particles as p (p.id)}
      <span
        class="particle"
        style={`--a:${p.a}deg; --distance:-${p.distance}px; --particle-size:${p.size}`}
        aria-hidden="true">{p.glyph}</span>
    {/each}
  </button>
{/if}

<style>
  .mascot-fab {
    /* 78 × 78 px — a bigger, more present companion (Daniel's ask), still a
       comfy touch target and clear of the bottom nav. */
    width: 78px;
    height: 78px;
    min-width: 78px;
    min-height: 78px;
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
  /* ── Família (especiais): aura a brilhar + batimento cardíaco suave. ── */
  .mascot-fab.special {
    opacity: 1;
    filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 60%, transparent))
      drop-shadow(0 3px 8px rgba(15, 23, 42, 0.42));
    animation: mascot-heartbeat 2.4s ease-in-out infinite;
  }
  /* Soft pulsing halo behind the special mascot. */
  .mascot-fab.special::before {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: 999px;
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--accent) 34%, transparent) 0%,
      transparent 68%
    );
    z-index: -1;
    animation: mascot-halo 2.4s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes mascot-heartbeat {
    0%, 100% { transform: scale(1); }
    18% { transform: scale(1.09); }
    32% { transform: scale(1); }
    46% { transform: scale(1.06); }
  }
  @keyframes mascot-halo {
    0%, 100% { opacity: 0.45; transform: scale(0.94); }
    40% { opacity: 0.85; transform: scale(1.12); }
  }
  /* The hold visibly charges: slow at first, then exponentially swells until
     the threshold, where the final love animation "pops" it into hearts. */
  .mascot-fab.charging-love {
    opacity: 1;
    z-index: 4;
    animation: mascot-love-charge var(--hold-ms, 900ms) cubic-bezier(.18,.78,.16,1) forwards;
    filter: drop-shadow(0 0 18px rgba(255, 79, 154, 0.82))
      drop-shadow(0 0 34px rgba(244, 114, 182, 0.45));
  }
  /* Gesture bursts — deliberately emphatic final beats. */
  .mascot-fab.loving {
    opacity: 1;
    z-index: 4;
    animation: mascot-love 1.05s cubic-bezier(0.2, 1.35, 0.35, 1);
  }
  .mascot-fab.nudging {
    opacity: 1;
    animation: mascot-shake 0.9s cubic-bezier(.36,.07,.19,.97);
  }
  .mascot-fab.receiving {
    opacity: 1;
    animation: mascot-message 0.9s cubic-bezier(.2,1.3,.35,1);
  }
  @keyframes mascot-love-charge {
    0% { transform: scale(1) rotate(0); }
    35% { transform: scale(1.08) rotate(-1deg); }
    62% { transform: scale(1.24) rotate(2deg); }
    80% { transform: scale(1.48) rotate(-3deg); }
    92% { transform: scale(1.76) rotate(4deg); }
    100% { transform: scale(2.08) rotate(-4deg); }
  }
  @keyframes mascot-love {
    0% { transform: scale(2.08) rotate(-4deg); filter: brightness(1.35); }
    12% { transform: scale(2.28) rotate(7deg); filter: brightness(1.7); }
    22% { transform: scale(0.28) rotate(-14deg); opacity: 0.2; }
    38% { transform: scale(1.5) rotate(9deg); opacity: 1; }
    55% { transform: scale(0.82) rotate(-7deg); }
    72% { transform: scale(1.28) rotate(4deg); }
    86% { transform: scale(0.94) rotate(-2deg); }
    100% { transform: scale(1) rotate(0); filter: brightness(1); }
  }
  @keyframes mascot-shake {
    0%, 100% { transform: translateX(0) rotate(0); }
    10% { transform: translateX(-15px) rotate(-19deg) scale(1.28); }
    20% { transform: translateX(16px) rotate(20deg) scale(1.38); }
    32% { transform: translateX(-14px) rotate(-17deg) scale(1.48); }
    44% { transform: translateX(14px) rotate(16deg) scale(1.55); }
    57% { transform: translateX(-11px) rotate(-13deg) scale(1.42); }
    70% { transform: translateX(10px) rotate(11deg) scale(1.3); }
    84% { transform: translateX(-5px) rotate(-6deg) scale(1.14); }
  }
  @keyframes mascot-message {
    0%, 100% { transform: translateY(0) rotate(0) scale(1); }
    28% { transform: translateY(-22px) rotate(-8deg) scale(1.35); }
    48% { transform: translateY(2px) rotate(7deg) scale(.9); }
    68% { transform: translateY(-12px) rotate(-4deg) scale(1.2); }
    84% { transform: translateY(0) rotate(2deg) scale(1.04); }
  }
  /* Radial particle burst flung from the mascot's centre — bigger + further. */
  .particle {
    position: absolute;
    left: 50%;
    top: 50%;
    font-size: calc(1rem * var(--particle-size, 1.2));
    line-height: 1;
    pointer-events: none;
    z-index: 5;
    animation: particle-fly 1.15s cubic-bezier(.15,.75,.25,1) forwards;
  }
  @keyframes particle-fly {
    from {
      opacity: 1;
      transform: translate(-50%, -50%) rotate(var(--a, 0deg)) translateY(0) scale(0.6);
    }
    to {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(var(--a, 0deg)) translateY(var(--distance, -68px)) scale(1.5);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .mascot-fab,
    .mascot-fab:hover,
    .mascot-fab:active,
    .mascot-fab.loving,
    .mascot-fab.nudging,
    .mascot-fab.receiving,
    .mascot-fab.charging-love,
    .mascot-fab.special {
      transform: none;
      transition: none;
      animation: none;
    }
    /* Keep the special aura as a static glow (no pulse) so it still reads as special. */
    .mascot-fab.special::before {
      animation: none;
      opacity: 0.5;
    }
    .particle {
      animation: none;
      display: none;
    }
  }
</style>
