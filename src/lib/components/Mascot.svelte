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
  import {
    NUDGE_TAP_THRESHOLD,
    mascotTapAction,
    mascotTapFeedback
  } from '$lib/couple/mascot-gestures';
  import { playSfx, vibrate, vibrateLove, vibrateNudge } from '$lib/gamification/sound';
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
  let tapEnergy = $state(1);
  let tapCount = $state(0);
  let sendingMoment = $state<'love' | 'nudge' | null>(null);
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
  const gestureStatus = $derived.by(() => {
    if (sendingMoment === 'love') {
      return $t('mascot.gesture.sending_love', { default: 'A enviar um amo-te… 💌' });
    }
    if (sendingMoment === 'nudge') {
      return $t('mascot.gesture.sending_nudge', { default: 'A enviar as saudades… 💭' });
    }
    if (holdCharging) {
      return $t('mascot.gesture.charging', { default: 'A encher de amor… não largues! 💗' });
    }
    if (tapCount >= NUDGE_TAP_THRESHOLD) {
      return $t('mascot.gesture.nudge_ready', { default: 'SAUDADES carregadas! 💥' });
    }
    if (tapCount === 3) {
      return $t('mascot.gesture.one_more', { default: 'Só mais um toque…' });
    }
    if (tapCount === 2) {
      return $t('mascot.gesture.keep_tapping', { default: 'Continua para enviar saudades' });
    }
    if (tapCount === 1) {
      return $t('mascot.gesture.first_tap', { default: 'Outra vez abre a conversa' });
    }
    return '';
  });

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
  let holdFired = false;
  let primaryPointerId: number | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  let particleTimer: ReturnType<typeof setTimeout> | null = null;
  const holdPulseTimers = new Set<ReturnType<typeof setTimeout>>();
  let tapAnimation: Animation | null = null;
  let pseq = 0;

  function fireParticles(kind: 'tap' | 'love' | 'nudge' | 'message', amount?: number): void {
    burst = kind;
    if (!reduced) {
      const n = amount ?? (kind === 'love' ? 42 : kind === 'nudge' ? 32 : kind === 'message' ? 22 : 3);
      const glyph = kind === 'love' ? (special ? '❤️' : '💛') : kind === 'message' ? '💌' : '💭';
      const batch = Array.from({ length: n }, (_, i) => ({
        id: ++pseq,
        a: Math.round((360 / n) * i + (Math.random() - 0.5) * 14),
        glyph,
        distance: kind === 'tap' ? 36 + tapIntensity * 4 : kind === 'love' ? 132 : kind === 'nudge' ? 108 : 92,
        size: kind === 'tap' ? 0.78 + tapIntensity * 0.065 : 1.18 + Math.random() * 0.55
      }));
      particles = [...particles, ...batch].slice(-64);
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
    const feedback = mascotTapFeedback(level);
    tapIntensity = feedback.level;
    tapEnergy = feedback.scale;
    playSfx('pop');
    vibrate(feedback.haptic);
    fireParticles('tap', feedback.particles);
    if (!mascotEl || reduced || typeof mascotEl.animate !== 'function') return;
    tapAnimation?.cancel();
    tapAnimation = mascotEl.animate(
      [
        { transform: 'translateX(0) rotate(0) scale(1)' },
        { transform: `translateX(-${feedback.amplitude}px) rotate(-${feedback.rotation}deg) scale(${feedback.scale})` },
        { transform: `translateX(${feedback.amplitude}px) rotate(${feedback.rotation}deg) scale(${feedback.scale * 0.94})` },
        { transform: 'translateX(0) rotate(0) scale(1)' }
      ],
      { duration: feedback.duration, easing: 'cubic-bezier(.18,1.15,.28,1)' }
    );
    tapAnimation.addEventListener('finish', () => (tapAnimation = null), { once: true });
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
    tapEnergy = 1;
    primaryPointerId = null;
    tapAnimation?.cancel();
    tapAnimation = null;
    clearHoldPulses();
  }

  function toastForResult(res: PingResult): void {
    if (res === 'cooldown') showToast($t('couple.ping.cooldown', { default: 'Espera um bocadinho 😅' }), 2000);
    else if (res === 'offline') showToast($t('couple.ping.offline', { default: 'Sem ligação — tenta já a seguir' }), 2200);
    else if (res === 'disabled') showToast($t('couple.ping.disabled', { default: 'Liga a conta do casal nas Definições 💑' }), 2600);
  }

  async function doLove(): Promise<void> {
    if (sendingMoment) return;
    sendingMoment = 'love';
    fireParticles('love');
    fireConfettiEvent({ origin: 'heart', count: 138, intensity: 5, palette: ['#ff4f9a', '#ff8fbd', '#ffd1e3', '#fff'] });
    shakeScreen();
    playSfx('levelup');
    vibrateLove();
    try {
      const res = await sendLove();
      if (res === 'sent') showToast($t('couple.love.sent', { default: '💌 Amor enviado 💛' }), 2200);
      else toastForResult(res);
    } finally {
      sendingMoment = null;
    }
  }

  async function doNudge(): Promise<void> {
    if (sendingMoment) return;
    sendingMoment = 'nudge';
    fireParticles('nudge');
    fireConfettiEvent({ origin: 'heart', count: 104, intensity: 4.5, palette: ['#f472b6', '#a78bfa', '#fef3c7'] });
    shakeScreen();
    playSfx('whoosh');
    vibrateNudge();
    try {
      const res = await sendNudge();
      if (res === 'sent') showToast($t('couple.nudge.sent', { default: '📳 Saudades enviadas!' }), 2200);
      else toastForResult(res);
    } finally {
      sendingMoment = null;
    }
  }

  function resolveTaps(): void {
    const n = tapCount;
    tapCount = 0;
    tapIntensity = 0;
    tapEnergy = 1;
    const action = mascotTapAction(n);
    if (action === 'nudge') void doNudge();
    else if (action === 'messages') void goto('/mensagens');
    else void goto('/agente');
  }

  function scheduleTapResolution(): void {
    if (tapTimer) clearTimeout(tapTimer);
    if (tapCount < 1) {
      tapTimer = null;
      return;
    }
    tapTimer = setTimeout(() => {
      tapTimer = null;
      resolveTaps();
    }, TAP_WINDOW);
  }

  function startHoldGesture(): void {
    holdFired = false;
    // A second press belongs to the same tap burst. Pause its resolution while
    // the pointer is down so changing one's mind into a long hold can never
    // navigate away halfway through the love charge.
    if (tapTimer) {
      clearTimeout(tapTimer);
      tapTimer = null;
    }
    if (burst === 'tap') {
      burst = 'none';
      particles = [];
      if (particleTimer) {
        clearTimeout(particleTimer);
        particleTimer = null;
      }
    }
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

  function finishHoldGesture(): void {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (!holdFired) {
      holdCharging = false;
      clearHoldPulses();
      scheduleTapResolution();
    }
  }

  function onPointerDown(event: PointerEvent): void {
    if (!interactive || sendingMoment || event.button !== 0 || !event.isPrimary) return;
    primaryPointerId = event.pointerId;
    startHoldGesture();
  }

  function onPointerEnd(event: PointerEvent): void {
    if (primaryPointerId === null || event.pointerId !== primaryPointerId) return;
    primaryPointerId = null;
    finishHoldGesture();
  }

  function onKeyDown(event: KeyboardEvent): void {
    // Native Space dispatches a click on key-up, so it can mirror the pointer
    // hold exactly: a short press remains a tap; a 900ms press sends love.
    if (event.key !== ' ' || event.repeat || !interactive || sendingMoment) return;
    startHoldGesture();
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (event.key === ' ') finishHoldGesture();
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
    if (sendingMoment) return;
    tapCount += 1;
    tapFeedback(tapCount);
    scheduleTapResolution();
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
    class:tapping={burst === 'tap'}
    class:charging-love={holdCharging}
    class:sending={sendingMoment !== null}
    style={`--hold-ms:${HOLD_MS}ms; --tap-energy:${tapEnergy}; --tap-glow:${8 + tapIntensity * 2}px`}
    onpointerdown={onPointerDown}
    onpointerup={onPointerEnd}
    onpointercancel={onPointerEnd}
    onpointerleave={onPointerEnd}
    onkeydown={onKeyDown}
    onkeyup={onKeyUp}
    onclick={onClick}
    oncontextmenu={(e) => e.preventDefault()}
    aria-busy={sendingMoment ? 'true' : undefined}
    aria-describedby="mascot-gesture-help mascot-gesture-status"
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
    {#if gestureStatus}
      <span class="gesture-bubble" aria-hidden="true">
        <span>{gestureStatus}</span>
        {#if tapCount > 0 && !holdCharging}
          <i class="tap-meter" style={`--progress:${Math.min(1, tapCount / NUDGE_TAP_THRESHOLD)}`}></i>
        {/if}
      </span>
    {/if}
    {#each particles as p (p.id)}
      <span
        class="particle"
        style={`--a:${p.a}deg; --distance:-${p.distance}px; --particle-size:${p.size}`}
        aria-hidden="true">{p.glyph}</span>
    {/each}
  </button>
  <span id="mascot-gesture-help" class="sr-only">
    {$t('mascot.gesture.help', { default: 'Um toque abre o agente, dois abrem as mensagens, quatro ou mais enviam saudades; mantém premido com o dedo, rato ou tecla Espaço para enviar amor.' })}
  </span>
  <span id="mascot-gesture-status" class="sr-only" aria-live="polite" aria-atomic="true">{gestureStatus}</span>
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
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    -webkit-user-select: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    /* The .mascot-corner in +layout owns the on-screen placement; this stays
       non-fixed so it isn't hidden behind the Vida footer tab. `relative` also
       makes it the positioning context for the gesture particles below. */
    position: relative;
    isolation: isolate;
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
  .mascot-fab.sending {
    cursor: progress;
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
    transform-origin: 78% 82%;
    animation: mascot-love-charge var(--hold-ms, 900ms) cubic-bezier(.18,.78,.16,1) forwards;
    filter: drop-shadow(0 0 18px rgba(255, 79, 154, 0.82))
      drop-shadow(0 0 34px rgba(244, 114, 182, 0.45));
  }
  .mascot-fab.charging-love::after {
    content: '';
    position: absolute;
    inset: -12px;
    z-index: -1;
    border: 4px solid rgba(255, 143, 189, 0.88);
    border-top-color: rgba(255, 255, 255, 0.95);
    border-radius: 999px;
    box-shadow: 0 0 22px rgba(255, 79, 154, 0.68), inset 0 0 15px rgba(255, 79, 154, 0.25);
    animation: mascot-charge-ring var(--hold-ms, 900ms) cubic-bezier(.2,.85,.2,1) both;
    pointer-events: none;
  }
  /* Gesture bursts — deliberately emphatic final beats. */
  .mascot-fab.loving {
    opacity: 1;
    z-index: 4;
    transform-origin: 78% 82%;
    animation: mascot-love 1.05s cubic-bezier(0.2, 1.35, 0.35, 1);
  }
  .mascot-fab.loving::after {
    content: '';
    position: absolute;
    inset: -18px;
    z-index: -1;
    border: 5px solid rgba(255, 111, 165, 0.9);
    border-radius: 999px;
    animation: mascot-love-shockwave 820ms ease-out both;
    pointer-events: none;
  }
  .mascot-fab.nudging {
    opacity: 1;
    animation: mascot-shake 0.9s cubic-bezier(.36,.07,.19,.97);
  }
  .mascot-fab.receiving {
    opacity: 1;
    animation: mascot-message 0.9s cubic-bezier(.2,1.3,.35,1);
  }
  .mascot-fab.tapping::after {
    content: '';
    position: absolute;
    inset: -10px;
    z-index: -1;
    border-radius: 999px;
    border: 3px solid color-mix(in srgb, var(--accent) 72%, #fff);
    opacity: 0.82;
    transform: scale(var(--tap-energy, 1));
    box-shadow: 0 0 var(--tap-glow, 8px) color-mix(in srgb, var(--accent) 62%, transparent);
    pointer-events: none;
  }
  @keyframes mascot-charge-ring {
    0% { opacity: .2; transform: scale(.72) rotate(0); border-width: 2px; }
    55% { opacity: .85; transform: scale(1.08) rotate(210deg); border-width: 5px; }
    100% { opacity: 1; transform: scale(1.42) rotate(520deg); border-width: 7px; }
  }
  @keyframes mascot-love-shockwave {
    0% { opacity: 1; transform: scale(.42); border-width: 9px; }
    55% { opacity: .85; }
    100% { opacity: 0; transform: scale(2.7); border-width: 1px; }
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
  .gesture-bubble {
    position: absolute;
    right: -2px;
    bottom: calc(100% + 0.55rem);
    width: max-content;
    max-width: min(13rem, calc(100vw - 2rem));
    display: grid;
    gap: 0.38rem;
    padding: 0.55rem 0.72rem;
    border: 1px solid color-mix(in srgb, var(--accent) 48%, rgba(255,255,255,.28));
    border-radius: 0.9rem 0.9rem 0.2rem 0.9rem;
    background: color-mix(in srgb, var(--card, #22314f) 92%, var(--accent) 8%);
    color: var(--txt, #fff);
    box-shadow: 0 10px 26px rgba(8, 15, 32, 0.38), 0 0 18px color-mix(in srgb, var(--accent) 20%, transparent);
    font-size: 0.75rem;
    font-weight: 800;
    line-height: 1.2;
    text-align: left;
    pointer-events: none;
    animation: gesture-bubble-pop 180ms cubic-bezier(.2,1.35,.35,1) both;
  }
  .tap-meter {
    position: relative;
    display: block;
    width: 100%;
    height: 4px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--txt) 14%, transparent);
  }
  .tap-meter::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, #f9a8d4, #fb7185, #facc15);
    transform: scaleX(var(--progress, 0));
    transform-origin: left center;
    transition: transform 120ms ease-out;
  }
  @keyframes gesture-bubble-pop {
    from { opacity: 0; transform: translateY(6px) scale(.86); }
    to { opacity: 1; transform: none; }
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
    .mascot-fab::after,
    .gesture-bubble,
    .tap-meter::after {
      animation: none;
      transition: none;
      transform: none;
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
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
