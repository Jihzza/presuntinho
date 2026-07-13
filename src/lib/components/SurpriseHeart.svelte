<script lang="ts">
  /**
   * SurpriseHeart projects the database-owned heart window.  There is no
   * device-local schedule: both partners receive the same session/timestamps
   * and taps are awarded atomically by the authenticated RPC.
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { couple } from '$lib/couple/couple-store.svelte';
  import {
    fetchCoupleHeartState,
    heartWindowDelays,
    subscribeCoupleHeart,
    tapCoupleHeart,
    type CoupleHeartSessionChange,
    type CoupleHeartState,
    type CoupleHeartWindow
  } from '$lib/couple/couple-heart';
  import { playSfx, vibrate } from '$lib/gamification/sound';
  import { fireConfettiEvent, prefersReducedMotion } from './events';

  const RATE_WINDOW = 1300;
  const MAX_LEVEL = 12;
  const MAX_POPS = 28;
  const BOUNDARY_GRACE_MS = 220;
  const RETRY_DELAYS_MS = [1500, 3000, 6000, 12_000, 30_000] as const;
  const POP_SPREAD = [-38, 28, -18, 44, -50, 12, 35, -30] as const;
  const POP_ROTATIONS = [-42, 31, -18, 48, -34, 16, 39, -27] as const;

  let visible = $state(false);
  let reduced = $state(false);
  let currentSessionId = $state<string | null>(null);
  let pops = $state<
    { id: number; dx: number; dy: number; rot: number; scale: number; big: boolean }[]
  >([]);
  let heartEl = $state<HTMLButtonElement | null>(null);
  let mounted = false;

  let popSeq = 0;
  let tapTimes: number[] = [];
  let lastSeenTapSeq = 0;
  let requestAuthoritativeRefresh: (() => void) | null = null;
  const popTimers = new Set<ReturnType<typeof setTimeout>>();
  const feedbackTimers = new Set<ReturnType<typeof setTimeout>>();

  function clearPops(): void {
    for (const timer of popTimers) clearTimeout(timer);
    popTimers.clear();
    pops = [];
  }

  function clearFeedbackTimers(): void {
    for (const timer of feedbackTimers) clearTimeout(timer);
    feedbackTimers.clear();
  }

  /** Both phones project the same server-owned beat instead of reacting at
   *  their different network-response times. A late device fires immediately. */
  function atSharedBeat(feedbackAtMs: number, serverOffsetMs: number, feedback: () => void): void {
    const delay = Math.max(0, feedbackAtMs - (Date.now() + serverOffsetMs));
    const timer = setTimeout(() => {
      feedbackTimers.delete(timer);
      feedback();
    }, delay);
    feedbackTimers.add(timer);
  }

  function addPops(level: number, remote = false): void {
    if (reduced) return;
    const count = Math.min(6, 1 + Math.floor(level / 2) + (remote ? 1 : 0));
    const batch = Array.from({ length: count }, (_, offset) => {
      const id = ++popSeq;
      const pattern = (id + offset + level) % POP_SPREAD.length;
      return {
        id,
        dx: POP_SPREAD[pattern] + (remote ? (offset % 2 === 0 ? -5 : 5) : 0),
        dy: -(30 + level * 5 + (offset % 3) * 7),
        rot: POP_ROTATIONS[pattern],
        scale: Math.min(2.1, 1 + level * 0.08),
        big: remote || level >= 7
      };
    });
    pops = [...pops, ...batch].slice(-MAX_POPS);
    const ids = new Set(batch.map((pop) => pop.id));
    const timer = setTimeout(() => {
      popTimers.delete(timer);
      pops = pops.filter((pop) => !ids.has(pop.id));
    }, 850);
    popTimers.add(timer);
  }

  function shake(level: number, remote = false): void {
    if (!heartEl || reduced) return;
    const amplitude = Math.min(18, 3 + level + (remote ? 3 : 0));
    const rotation = Math.min(16, 3 + level);
    const scale = 1 + Math.min(0.3, level * 0.022 + (remote ? 0.05 : 0));
    heartEl.animate(
      [
        { transform: 'translateX(-50%) rotate(0) scale(1)' },
        {
          transform: `translateX(calc(-50% - ${amplitude}px)) rotate(-${rotation}deg) scale(${scale})`
        },
        {
          transform: `translateX(calc(-50% + ${amplitude}px)) rotate(${rotation}deg) scale(${scale})`
        },
        { transform: 'translateX(-50%) rotate(0) scale(1)' }
      ],
      {
        duration: Math.max(130, 300 - level * 9),
        easing: 'cubic-bezier(.2,.9,.3,1)'
      }
    );
  }

  function localTapFeedback(): void {
    const now = performance.now();
    tapTimes = tapTimes.filter((timestamp) => now - timestamp < RATE_WINDOW);
    tapTimes.push(now);
    const level = Math.min(MAX_LEVEL, tapTimes.length);

    playSfx('pop');
    if (level >= 6 && level % 3 === 0) playSfx('milestone');
    vibrate(level < 4 ? 'tap' : level < 8 ? 'success' : 'warning');
    if (!reduced) {
      fireConfettiEvent({
        origin: 'heart',
        count: Math.min(10 + level * 6, 90),
        intensity: 1 + level * 0.35
      });
      addPops(level);
      shake(level);
    }
  }

  /** A committed partner tap arrives through Postgres Realtime. */
  function remoteTapFeedback(delta: number): void {
    const level = Math.min(MAX_LEVEL, Math.max(2, delta + 2));
    playSfx('pop');
    vibrate(delta > 1 ? 'success' : 'tap');
    if (!reduced) {
      fireConfettiEvent({
        origin: 'heart',
        count: Math.min(18 + delta * 5, 48),
        intensity: Math.min(2.5, 1.25 + delta * 0.18)
      });
      addPops(level, true);
      shake(level, true);
    }
  }

  function noteTapSequence(
    tapSeq: number,
    lastTapper: string | null,
    myId: string,
    partnerId: string,
    feedbackAtMs: number | null,
    serverOffsetMs: number
  ): void {
    if (tapSeq <= lastSeenTapSeq) return;
    const delta = tapSeq - lastSeenTapSeq;
    lastSeenTapSeq = tapSeq;
    if (lastTapper === partnerId && lastTapper !== myId) {
      if (feedbackAtMs === null) remoteTapFeedback(delta);
      else atSharedBeat(feedbackAtMs, serverOffsetMs, () => remoteTapFeedback(delta));
    }
  }

  /**
   * The component is normally mounted only for an account couple, but it also
   * validates all four identity fields itself so a stale layout can never show
   * an inert or cross-couple heart.
   */
  function startHeartSync(coupleId: string, myId: string, partnerId: string): () => void {
    let disposed = false;
    let initialized = false;
    let refreshing = false;
    let refreshQueued = false;
    let serverOffsetMs: number | null = null;
    let retryAttempt = 0;
    let queuedChange: CoupleHeartSessionChange | null = null;
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function clearWindowTimers(): void {
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      showTimer = null;
      hideTimer = null;
      refreshTimer = null;
    }

    function clearRetry(): void {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    }

    function failClosed(): void {
      clearWindowTimers();
      visible = false;
      currentSessionId = null;
      tapTimes = [];
      clearPops();
    }

    function scheduleRetry(): void {
      if (disposed || retryTimer) return;
      failClosed();
      const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
      retryAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void refreshState();
      }, delay);
    }

    function scheduleWindow(window: CoupleHeartWindow): void {
      if (disposed || serverOffsetMs === null) return;
      clearWindowTimers();
      clearRetry();

      const projectedServerNow = Date.now() + serverOffsetMs;
      const delays = heartWindowDelays({
        visibleFromMs: window.visibleFromMs,
        visibleUntilMs: window.visibleUntilMs,
        serverNowMs: projectedServerNow
      });

      if (delays.phase === 'expired') {
        visible = false;
        refreshTimer = setTimeout(() => void refreshState(), BOUNDARY_GRACE_MS);
        return;
      }

      if (delays.phase === 'scheduled') {
        visible = false;
        showTimer = setTimeout(() => {
          if (disposed || currentSessionId !== window.sessionId) return;
          visible = document.visibilityState === 'visible';
        }, delays.showInMs);
      } else {
        visible = document.visibilityState === 'visible';
      }

      hideTimer = setTimeout(() => {
        if (currentSessionId === window.sessionId) visible = false;
      }, delays.hideInMs);
      refreshTimer = setTimeout(
        () => void refreshState(),
        delays.refreshInMs + BOUNDARY_GRACE_MS
      );
    }

    function applyWindow(window: CoupleHeartWindow, baseline = false): void {
      const offset = serverOffsetMs;
      if (offset === null) return;
      const changedSession = currentSessionId !== window.sessionId;
      if (changedSession) {
        currentSessionId = window.sessionId;
        lastSeenTapSeq = window.tapSeq;
        tapTimes = [];
        clearPops();
      } else if (baseline) {
        lastSeenTapSeq = Math.max(lastSeenTapSeq, window.tapSeq);
      } else {
        noteTapSequence(
          window.tapSeq,
          window.lastTapper,
          myId,
          partnerId,
          window.feedbackAtMs,
          offset
        );
      }
      scheduleWindow(window);
    }

    async function refreshState(): Promise<void> {
      if (disposed) return;
      if (refreshing) {
        refreshQueued = true;
        return;
      }
      refreshing = true;
      const wasInitialized = initialized;
      try {
        const state: CoupleHeartState = await fetchCoupleHeartState(coupleId);
        if (disposed) return;
        serverOffsetMs = state.serverOffsetMs;
        retryAttempt = 0;
        clearRetry();
        applyWindow(state, !wasInitialized);
        initialized = true;

        // A Realtime row can arrive while the initial RPC is in flight. Apply
        // it after the RPC establishes the server clock; sequence checks make
        // stale/duplicate payloads harmless.
        if (queuedChange) {
          const change = queuedChange;
          queuedChange = null;
          applyWindow(change);
        }
      } catch {
        if (!disposed) scheduleRetry();
      } finally {
        refreshing = false;
        if (!disposed && refreshQueued) {
          refreshQueued = false;
          queueMicrotask(() => void refreshState());
        }
      }
    }

    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeCoupleHeart(
        coupleId,
        (change) => {
          if (disposed) return;
          if (!initialized || serverOffsetMs === null) {
            if (!queuedChange || change.updatedAtMs >= queuedChange.updatedAtMs) queuedChange = change;
            return;
          }
          applyWindow(change);
        },
        {
          // Fetch again once the channel is live. This closes the small gap
          // between the first RPC response and Realtime subscription readiness.
          onStatus: (status) => {
            if (status === 'SUBSCRIBED') void refreshState();
          },
          onError: () => scheduleRetry()
        }
      );
    } catch {
      scheduleRetry();
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        visible = false;
      } else {
        void refreshState();
      }
    };
    const onOnline = () => void refreshState();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);
    const requestRefresh = () => void refreshState();
    requestAuthoritativeRefresh = requestRefresh;

    // Subscribe first, then fetch; the SUBSCRIBED refresh heals the readiness
    // gap and the RPC remains the authority if Realtime is unavailable.
    void refreshState();

    return () => {
      disposed = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
      clearWindowTimers();
      clearRetry();
      clearFeedbackTimers();
      failClosed();
      if (requestAuthoritativeRefresh === requestRefresh) requestAuthoritativeRefresh = null;
    };
  }

  async function onTap(): Promise<void> {
    const coupleId = couple.accountCouple ? couple.coupleId : null;
    const sessionId = currentSessionId;
    if (!visible || !coupleId || !sessionId || !couple.me || !couple.partnerId) return;

    try {
      const result = await tapCoupleHeart(coupleId, sessionId);
      // The response can arrive after this component re-scopes to another
      // couple/session. The point was committed, but must not animate here.
      if (!mounted || couple.coupleId !== coupleId) return;

      couple.myPoints = Math.max(couple.myPoints, result.memberPoints);
      couple.partnerPoints = Math.max(
        couple.partnerPoints,
        Math.max(0, result.totalPoints - result.memberPoints)
      );
      couple.points = Math.max(
        couple.points,
        result.totalPoints,
        couple.myPoints + couple.partnerPoints
      );
      couple.online = true;
      lastSeenTapSeq = Math.max(lastSeenTapSeq, result.tapSeq);
      if (currentSessionId === sessionId) {
        atSharedBeat(result.feedbackAtMs, result.serverOffsetMs, () => {
          if (mounted && couple.coupleId === coupleId) localTapFeedback();
        });
      }
    } catch {
      // Expired/mismatched sessions and transport failures both fail closed;
      // the authoritative state fetch decides whether/when it can reappear.
      visible = false;
      currentSessionId = null;
      requestAuthoritativeRefresh?.();
    }
  }

  onMount(() => {
    mounted = true;
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const updateReduced = () => {
      reduced = media?.matches ?? prefersReducedMotion();
      if (reduced) clearPops();
    };
    updateReduced();
    media?.addEventListener?.('change', updateReduced);
    return () => {
      mounted = false;
      media?.removeEventListener?.('change', updateReduced);
      clearPops();
      clearFeedbackTimers();
    };
  });

  $effect(() => {
    const enabled = couple.accountCouple;
    const coupleId = couple.coupleId;
    const myId = couple.me;
    const partnerId = couple.partnerId;
    if (!enabled || !coupleId || !myId || !partnerId) {
      visible = false;
      currentSessionId = null;
      return;
    }
    return startHeartSync(coupleId, myId, partnerId);
  });
</script>

{#if visible && couple.accountCouple && currentSessionId}
  <button
    bind:this={heartEl}
    type="button"
    class="surprise-heart"
    class:reduced
    onclick={() => void onTap()}
    aria-label={$t('couple.heart.aria', { default: 'Coração do casal — toca para somar pontos' })}
    title={$t('couple.heart.aria', { default: 'Coração do casal — toca para somar pontos' })}
  >
    <span class="glow" aria-hidden="true"></span>
    <span class="emoji" aria-hidden="true">💞</span>
    {#if couple.points > 0}
      <span class="count" aria-hidden="true">{couple.points}</span>
    {/if}
    {#each pops as pop (pop.id)}
      <span
        class="plus"
        class:big={pop.big}
        style={`--dx:${pop.dx}px; --dy:${pop.dy}px; --rot:${pop.rot}deg; --scale:${pop.scale}`}
        aria-hidden="true">{pop.big ? '💗' : '+1'}</span
      >
    {/each}
  </button>
{/if}

<style>
  .surprise-heart {
    position: absolute;
    left: 50%;
    /* Entirely above the 78px mascot instead of overlapping its face/body. */
    bottom: calc(100% + 0.65rem);
    transform: translateX(-50%);
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--accent, #f472b6) 55%, transparent);
    background: color-mix(in srgb, var(--accent, #f472b6) 20%, rgba(10, 16, 30, 0.82));
    color: #fff;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    isolation: isolate;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    box-shadow: 0 7px 22px color-mix(in srgb, var(--accent, #f472b6) 48%, transparent);
    z-index: 4;
    animation: heart-in 260ms cubic-bezier(0.2, 1.4, 0.5, 1) both;
  }
  .surprise-heart.reduced {
    animation: none;
  }
  .surprise-heart:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--accent, #f472b6) 52%, #fff);
    outline-offset: 3px;
  }
  .surprise-heart:active .emoji {
    transform: scale(0.88);
  }
  .glow {
    position: absolute;
    inset: -0.5rem;
    border-radius: 999px;
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--accent, #f472b6) 34%, transparent),
      transparent 60%
    );
    z-index: 0;
    animation: glow-pulse 1.5s ease-in-out infinite;
  }
  .surprise-heart.reduced .glow {
    animation: none;
  }
  .emoji {
    font-size: 1.6rem;
    line-height: 1;
    z-index: 2;
    transition: transform 160ms ease;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
  }
  .count {
    position: absolute;
    top: -0.35rem;
    right: -0.35rem;
    min-width: 1.15rem;
    height: 1.15rem;
    padding: 0 0.28rem;
    border-radius: 999px;
    background: #fff;
    color: color-mix(in srgb, var(--accent, #f472b6) 80%, #7a1e4b);
    font-size: 0.62rem;
    font-weight: 900;
    line-height: 1.15rem;
    z-index: 3;
    font-variant-numeric: tabular-nums;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }
  .plus {
    position: absolute;
    left: 50%;
    top: 0;
    color: #fff;
    font-weight: 900;
    font-size: 0.85rem;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    z-index: 5;
    animation: plus-float 0.85s ease-out forwards;
  }
  .plus.big {
    font-size: 1.15rem;
    filter: drop-shadow(0 2px 6px rgba(244, 114, 182, 0.6));
  }
  @keyframes heart-in {
    from {
      opacity: 0;
      transform: translateX(-50%) scale(0.3) translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) scale(1) translateY(0);
    }
  }
  @keyframes glow-pulse {
    0%,
    100% {
      opacity: 0.5;
      transform: scale(0.85);
    }
    50% {
      opacity: 1;
      transform: scale(1.05);
    }
  }
  @keyframes plus-float {
    from {
      opacity: 1;
      transform: translate(calc(-50% + var(--dx, 0px)), 0) rotate(0deg) scale(1);
    }
    to {
      opacity: 0;
      transform: translate(calc(-50% + var(--dx, 0px)), var(--dy, -28px))
        rotate(var(--rot, 0deg)) scale(calc(1.3 * var(--scale, 1)));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .surprise-heart,
    .glow,
    .plus {
      animation: none;
    }
    .emoji {
      transition: none;
    }
  }
</style>
