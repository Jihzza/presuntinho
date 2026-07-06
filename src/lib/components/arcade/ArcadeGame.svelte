<script lang="ts">
  // Arcade shell — owns the canvas, the RAF loop, all input (keyboard + swipe +
  // drag + on-screen controls), the HUD, sound/haptic/confetti feedback and the
  // result overlay. Game logic lives in the per-game engines (src/lib/arcade).
  import { onMount, onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { ArcadeGameDefinition } from '$lib/arcade/games';
  import { highScoreKey, lastScoreKey, readArcadeScore, writeArcadeScore } from '$lib/arcade/games';
  import { FIELD_W, FIELD_H, setViewport, setSafeInsets, type ArcadeEngine, type ArcadeInput, type Direction } from '$lib/arcade/engine';
  import { prefersReducedMotion, fireConfettiEvent } from '$lib/components/events';
  import { playSfx, vibrate } from '$lib/gamification/sound';
  import { arcadeHud } from '$lib/arcade/hud-state';
  import { getActiveMascot, MASCOT_CHANGED_EVENT } from '$lib/gamification/mascots';
  import {
    startArcadeMusic,
    stopArcadeMusic,
    toggleArcadeMusic,
    isArcadeMusicEnabled,
    initArcadeMusicPrefs
  } from '$lib/arcade/audio';
  import CrtOverlay from '$lib/components/arcade/CrtOverlay.svelte';
  import { couple, submitCoupleScore, partnerBest } from '$lib/couple/couple-store.svelte';

  let { game }: { game: ArcadeGameDefinition } = $props();

  // Async "play against her": her synced best for this game (null until synced).
  const herBest = $derived(couple.enabled ? partnerBest(game.id) : null);

  type Status = 'ready' | 'playing' | 'paused' | 'won' | 'over';

  let canvas = $state<HTMLCanvasElement | null>(null);
  let shellEl = $state<HTMLDivElement | null>(null);
  let topbarEl = $state<HTMLDivElement | null>(null);
  let score = $state(0);
  let high = $state(0);
  let last = $state(0);
  let status = $state<Status>('ready');
  let newRecord = $state(false);

  let engine: ArcadeEngine | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let raf = 0;
  let lastTs = 0;
  let elapsed = 0;
  let reduced = false;
  let avatar = $state<string | null>(null); // active mascot emoji, drawn as the player
  let isFullscreen = $state(false);
  let musicOn = $state(true); // per-session chiptune toggle (reflects the audio engine)
  let fieldH = $state(FIELD_H); // responsive logical height (reactive for the canvas aspect)
  let playStartTs = 0; // when the current round began (for resize-vs-restart calls)
  const fsSupported =
    typeof document !== 'undefined' &&
    typeof document.documentElement.requestFullscreen === 'function';

  function toggleFullscreen(): void {
    if (typeof document === 'undefined') return;
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.();
    } catch {
      // some browsers reject without a user gesture / in an iframe — ignore
    }
  }

  function onToggleMusic(): void {
    // The button click is a user gesture, so flipping this on can unlock audio
    // and resume the active theme immediately.
    musicOn = toggleArcadeMusic();
  }

  const input: ArcadeInput = { held: new Set<Direction>(), turn: null, action: false, pointerX: null };
  let dragging = false;
  let downX = 0;
  let downY = 0;

  // ── lifecycle ────────────────────────────────────────────────────────────
  function reset(): void {
    engine?.reset();
    score = 0;
    status = 'ready';
    newRecord = false;
    input.held.clear();
    input.turn = null;
    input.action = false;
    input.pointerX = null;
    dragging = false;
  }

  /** Match the logical field to the SCREEN aspect (FIELD_W stays 360) so a
   *  full-width canvas fills the whole screen — no letterbox, no distortion. */
  function resizeField(): void {
    if (typeof window === 'undefined') return;
    fieldH = setViewport(window.innerWidth, window.innerHeight);
    measureSafeInsets();
    if (canvas) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = FIELD_W * dpr;
      canvas.height = fieldH * dpr;
      ctx = canvas.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  /** Measure the real HUD (top) and control cluster (bottom) so games keep
   *  full-width edge elements (e.g. the Pong paddles) clear of the chrome. */
  function measureSafeInsets(): void {
    if (typeof window === 'undefined') return;
    const h = window.innerHeight;
    const topPx = (topbarEl?.getBoundingClientRect().height ?? 54) + 6;
    let bottomPx = 120; // sensible floor even before the controls have rendered
    const cluster = typeof document !== 'undefined' ? document.querySelector('.hud-overlay .cluster') : null;
    const clRect = cluster?.getBoundingClientRect();
    if (clRect && clRect.height > 0) bottomPx = Math.max(bottomPx, h - clRect.top + 10);
    setSafeInsets(topPx, bottomPx, h);
  }

  /** On resize / rotate / entering fullscreen the screen aspect changes, so the
   *  field is re-measured. If it changed meaningfully we rebuild the engine's
   *  layout — but only when idle or in the first instant of a round, so a game
   *  in progress is never yanked. */
  function onViewportChange(): void {
    const prev = fieldH;
    resizeField();
    if (Math.abs(fieldH - prev) <= 2) return;
    const justStarted =
      typeof performance !== 'undefined' && performance.now() - playStartTs < 1500;
    if (status !== 'playing' || justStarted) {
      engine?.reset();
      score = engine?.score() ?? 0;
      if (status === 'playing') lastTs = performance.now();
    }
  }

  function requestGameFullscreen(): void {
    if (typeof document === 'undefined' || !fsSupported || document.fullscreenElement) return;
    try {
      void document.documentElement.requestFullscreen?.();
    } catch {
      // rejected without a gesture / in an iframe — the immersive CSS still fills
    }
  }

  function start(): void {
    if (status === 'playing') return;
    if (status === 'won' || status === 'over') reset();
    status = 'playing';
    lastTs = performance.now();
    playStartTs = lastTs;
    // start() is only ever reached via a user gesture (tap / key / button), so
    // this is a valid moment to unlock audio AND request true fullscreen.
    startArcadeMusic(game.id);
    requestGameFullscreen();
    // The touch controls are on-screen now, so re-measure the real chrome and
    // rebuild the layout — edge elements (e.g. Pong paddles) then sit clear of
    // it. Imperceptible: the round has just begun.
    resizeField();
    engine?.reset();
    score = engine?.score() ?? 0;
  }

  function pause(): void {
    if (status === 'playing') {
      status = 'paused';
      // Pausing unmounts the touch HUD; a held rocker button then never fires
      // its pointerup, so clear held input here (mirrors the window-blur guard)
      // — otherwise the avatar would keep sliding on resume with no finger down.
      input.held.clear();
      dragging = false;
      input.pointerX = null;
      stopArcadeMusic();
    } else if (status === 'paused') {
      status = 'playing';
      lastTs = performance.now();
      startArcadeMusic(game.id);
    }
  }

  function restart(): void {
    reset();
    start();
  }

  function finish(end: 'won' | 'over'): void {
    status = end;
    stopArcadeMusic(); // let the win/lose jingle ring out without the loop under it
    last = score;
    newRecord = score > high && score > 0;
    high = Math.max(high, score);
    writeArcadeScore(lastScoreKey(game.id), last);
    writeArcadeScore(highScoreKey(game.id), high);
    // Async competition: push a new personal best to the couple backend so the
    // partner sees it on her device (fire-and-forget; no-op without a token).
    if (newRecord) submitCoupleScore(game.id, high);
    if (end === 'won') {
      playSfx('fanfare');
      vibrate('success');
    } else {
      playSfx('wrong');
      vibrate('warning');
    }
    if (newRecord) {
      fireConfettiEvent({ count: 120, origin: 'center' });
      window.setTimeout(() => playSfx('milestone'), 220);
    }
  }

  // ── feedback ─────────────────────────────────────────────────────────────
  function juice(gained: number, event?: string): void {
    if (gained > 0) {
      playSfx('pop');
      vibrate('tap');
    } else if (event === 'bounce') {
      vibrate('tap');
    }
  }

  // ── loop ─────────────────────────────────────────────────────────────────
  function frame(now: number): void {
    const dt = Math.max(0, Math.min(0.05, (now - lastTs) / 1000 || 0.016));
    lastTs = now;
    elapsed += dt;
    if (status === 'playing' && engine) {
      const res = engine.step(dt, input);
      score = engine.score();
      if (res.gained || res.event) juice(res.gained ?? 0, res.event);
      if (res.end) finish(res.end);
      input.turn = null;
      input.action = false;
    }
    if (engine && ctx) engine.draw({ ctx, t: elapsed, reduced, avatar });
    raf = requestAnimationFrame(frame);
  }

  // ── keyboard ─────────────────────────────────────────────────────────────
  const DIR_KEYS: Record<string, Direction> = {
    arrowup: 'up',
    w: 'up',
    arrowdown: 'down',
    s: 'down',
    arrowleft: 'left',
    a: 'left',
    arrowright: 'right',
    d: 'right'
  };

  // Don't hijack the key when a focusable control (or a text field) has focus —
  // otherwise preventDefault would stop Space/Enter from activating the visible
  // Jogar/Pausa/Recomeçar buttons and the Voltar links (keyboard a11y).
  function isInteractiveTarget(e: KeyboardEvent): boolean {
    const el = e.target as HTMLElement | null;
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(el.tagName)) return true;
    return el.getAttribute('role') === 'button';
  }

  function onKeydown(e: KeyboardEvent): void {
    if (isInteractiveTarget(e)) return;
    const k = e.key.toLowerCase();
    if (k === 'p' || k === 'escape') {
      e.preventDefault();
      pause();
      return;
    }
    if (k === ' ' || k === 'enter') {
      e.preventDefault();
      input.action = true;
      start();
      return;
    }
    const dir = DIR_KEYS[k];
    if (dir) {
      e.preventDefault();
      input.held.add(dir);
      input.turn = dir;
      // "up" doubles as jump on jump-scheme games (platformer)
      if (dir === 'up' && game.control === 'jump') input.action = true;
      start();
    }
  }

  function onKeyup(e: KeyboardEvent): void {
    const dir = DIR_KEYS[e.key.toLowerCase()];
    if (dir) input.held.delete(dir);
  }

  // ── pointer (swipe + paddle drag) ─────────────────────────────────────────
  function mapX(clientX: number): number {
    if (!canvas) return FIELD_W / 2;
    const r = canvas.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * FIELD_W;
  }

  function onPointerDown(e: PointerEvent): void {
    canvas?.setPointerCapture?.(e.pointerId);
    downX = e.clientX;
    downY = e.clientY;
    if (status === 'ready' || status === 'paused') start();
    if (game.control !== 'turn') {
      dragging = true;
      input.pointerX = mapX(e.clientX);
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (dragging) input.pointerX = mapX(e.clientX);
  }

  function onPointerUp(e: PointerEvent): void {
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    const moved = Math.hypot(dx, dy);
    if (game.control === 'turn' && moved > 24) {
      input.turn = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    } else if (moved <= 12 && (game.control === 'jump' || game.control === 'paddle')) {
      // a tap on the canvas = the action (jump / launch / serve)
      input.action = true;
    }
    dragging = false;
    input.pointerX = null;
  }

  // ── on-screen controls ─────────────────────────────────────────────────────
  function onTurn(dir: Direction): void {
    input.turn = dir;
    start();
  }
  function onHold(dir: Direction, down: boolean): void {
    if (down) {
      input.held.add(dir);
      start();
    } else {
      // release only removes the key — never (re)starts, so a release that
      // arrives during a pause (button unmounting) can't re-unpause the game.
      input.held.delete(dir);
    }
  }
  function onAction(down: boolean): void {
    if (down) {
      input.action = true;
      start();
    }
  }

  // Publish the touch HUD to the root layout for the WHOLE time the game page is
  // open (not just while playing): that hides the app nav (immersive) and shows
  // the controls, and pressing a control starts the game — Free Fire style. The
  // mascot/heart FABs are hidden while this is set. Cleared on destroy.
  $effect(() => {
    arcadeHud.set({ left: game.hud.left, right: game.hud.right, onTurn, onHold, onAction });
  });
  onDestroy(() => arcadeHud.set(null));

  const statusKey = $derived(
    status === 'ready'
      ? 'arcade.state.ready'
      : status === 'playing'
        ? 'arcade.state.playing'
        : status === 'paused'
          ? 'arcade.state.paused'
          : status === 'won'
            ? 'arcade.state.won'
            : 'arcade.state.over'
  );

  onMount(() => {
    reduced = prefersReducedMotion();
    high = readArcadeScore(highScoreKey(game.id));
    last = readArcadeScore(lastScoreKey(game.id));
    // Size the logical field to the screen BEFORE the engine builds its layout,
    // then size the canvas bitmap to match.
    if (typeof window !== 'undefined') setViewport(window.innerWidth, window.innerHeight);
    engine = game.factory();
    resizeField();
    reset();
    // block page scroll / pull-to-refresh anywhere on the game surface WHILE
    // playing (not just the canvas), so a stray drag can't scroll the page mid-run
    const stopTouch = (ev: TouchEvent) => {
      if (status === 'playing') ev.preventDefault();
    };
    shellEl?.addEventListener('touchmove', stopTouch, { passive: false });
    // a lost window focus never delivers keyup → clear held keys so nothing
    // keeps sliding on its own when the player returns (alt-tab, app switch)
    const onBlur = () => {
      input.held.clear();
      dragging = false;
      input.pointerX = null;
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onKeydown, { passive: false });
    window.addEventListener('keyup', onKeyup);

    // Draw the player as the chosen mascot; keep it live if the pick changes.
    const loadAvatar = () => {
      void getActiveMascot()
        .then((m) => (avatar = m.emoji))
        .catch(() => undefined);
    };
    loadAvatar();
    const onMascotChanged = (e: Event) => {
      const emoji = (e as CustomEvent<{ emoji?: string }>).detail?.emoji;
      if (emoji) avatar = emoji;
      else loadAvatar();
    };
    window.addEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);

    const onFsChange = () => {
      isFullscreen = !!document.fullscreenElement;
      onViewportChange();
    };
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);

    // Hydrate the persisted music toggle so the ♪ button shows the real state.
    void initArcadeMusicPrefs().then(() => (musicOn = isArcadeMusicEnabled()));

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      stopArcadeMusic();
      shellEl?.removeEventListener('touchmove', stopTouch);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('keyup', onKeyup);
      window.removeEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
      // leave fullscreen when navigating away from a game
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => undefined);
      }
    };
  });
</script>

<div class="shell" bind:this={shellEl} class:playing={status === 'playing'} class:fullscreen={isFullscreen} data-game={game.id} style="--accent: {game.accent};">
  <!-- Floating top HUD over the fullscreen playfield (Free Fire style). -->
  <div class="topbar" bind:this={topbarEl}>
    <a href="/secrets/" class="tb back" aria-label={$t('arcade.game.back', { default: '← Voltar à sala' })}>←</a>
    <div class="mini-score" aria-label={$t('arcade.score.aria', { default: 'Pontuação do jogo' })}>
      <span class="cur">{score}</span>
      <span class="best" title={$t('arcade.score.best', { default: 'Melhor pontuação' })}>◆ {high}</span>
    </div>
    <div class="tb-actions">
      {#if status === 'playing'}
        <button type="button" class="tb" onclick={pause} aria-label={$t('arcade.actions.pause', { default: 'Pausa' })}>⏸</button>
        <button type="button" class="tb" onclick={restart} aria-label={$t('arcade.actions.restart', { default: 'Recomeçar' })}>⟲</button>
      {/if}
      <button
        type="button"
        class="tb music-toggle"
        class:muted={!musicOn}
        onclick={onToggleMusic}
        aria-pressed={musicOn}
        aria-label={musicOn ? $t('arcade.music.off', { default: 'Desligar música' }) : $t('arcade.music.on', { default: 'Ligar música' })}
      ><span aria-hidden="true">♪</span></button>
      {#if fsSupported}
        <button
          type="button"
          class="tb"
          onclick={toggleFullscreen}
          aria-pressed={isFullscreen}
          aria-label={isFullscreen ? $t('arcade.fullscreen.exit', { default: 'Sair do ecrã inteiro' }) : $t('arcade.fullscreen.enter', { default: 'Ecrã inteiro' })}
        >{isFullscreen ? '⤢' : '⛶'}</button>
      {/if}
    </div>
  </div>
  <p class="sr-live" aria-live="polite">{$t(statusKey)}</p>

  <div class="stage">
    <canvas
      bind:this={canvas}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      aria-label={$t('arcade.game.canvas', { default: 'Área de jogo arcade' })}
    ></canvas>
    <!-- CRT sheen edge-to-edge (pointer-events:none; glare off under reduced-motion). -->
    <CrtOverlay radius="0" />
  </div>

  {#if status !== 'playing'}
    <div class="overlay" class:win={status === 'won'} class:over={status === 'over'}>
      {#if status === 'ready'}
        <p class="big">{game.icon}</p>
        <h2 class="ov-game">{$t(game.titleKey)}</h2>
        <button type="button" class="cta" onclick={start}>{$t('arcade.actions.play', { default: 'Jogar' })}</button>
        <p class="sub">{$t('arcade.overlay.tap_start', { default: 'Toca para começar' })}</p>
        <p class="hint">{$t(game.controlsKey)}</p>
      {:else if status === 'paused'}
        <p class="big">⏸️</p>
        <strong class="ov-title">{$t('arcade.state.paused', { default: 'Em pausa' })}</strong>
        <button type="button" class="cta" onclick={pause}>{$t('arcade.actions.resume', { default: 'Continuar' })}</button>
        <a class="ghost" href="/secrets/">{$t('arcade.game.back', { default: '← Voltar à sala' })}</a>
      {:else}
        <strong class="ov-title">
          {status === 'won' ? $t('arcade.result.won', { default: 'Conseguiste! 🎉' }) : $t('arcade.result.over', { default: 'Fim de jogo' })}
        </strong>
        {#if newRecord}<span class="record">⭐ {$t('arcade.overlay.new_record', { default: 'Novo recorde!' })}</span>{/if}
        <p class="ov-score">{$t('arcade.result.score_line', { values: { score, best: high }, default: 'Pontuação {score} · recorde {best}' })}</p>
        {#if herBest !== null}
          <p class="ov-versus">
            {$t('arcade.versus.her_best', { values: { best: herBest }, default: 'Recorde dela: {best}' })}
            {#if high > herBest}
              <span class="lead win">{$t('arcade.versus.you_lead', { default: '🏆 estás à frente!' })}</span>
            {:else if high === herBest}
              <span class="lead tie">{$t('arcade.versus.tie', { default: '🤝 empate!' })}</span>
            {:else}
              <span class="lead behind">{$t('arcade.versus.she_leads', { default: '🔥 apanha-a!' })}</span>
            {/if}
          </p>
        {/if}
        <div class="ov-actions">
          <button type="button" class="cta" onclick={restart}>{$t('arcade.actions.play_again', { default: 'Jogar de novo' })}</button>
          <a class="ghost" href="/secrets/">{$t('arcade.game.back', { default: '← Voltar à sala' })}</a>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* The game page is a FULLSCREEN playfield: the shell breaks out of page flow
     to cover the whole viewport, a slim translucent HUD floats over the top, and
     the touch controls (rendered by the root layout) float over the bottom
     corners — so the game fills the ENTIRE screen, not a centred window.
     NOTE: the shell must NOT create a stacking context (no z-index/transform)
     so the result overlay (z-60) can sit ABOVE the layout's floating controls
     (z-45) while the canvas sits below them. */
  .shell {
    position: fixed;
    inset: 0;
    background: #0a1120;
    color: var(--txt, #fff);
    overflow: hidden;
    touch-action: none;
  }

  /* Floating top HUD: back · score · actions, over a soft top gradient. */
  .topbar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 8;
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: max(0.5rem, env(safe-area-inset-top)) max(0.7rem, env(safe-area-inset-right)) 0.5rem
      max(0.7rem, env(safe-area-inset-left));
    /* No full-width backdrop — only the corner controls paint, so the CENTRE of
       the top stays clear (e.g. the Pong opponent paddle is never hidden). */
    pointer-events: none; /* click-through; only the corner controls catch taps */
  }
  .topbar > *,
  .tb-actions > * {
    pointer-events: auto;
  }
  .tb-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .tb {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    color: #fff;
    font-size: 1.05rem;
    background: rgba(10, 16, 30, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(6px);
    cursor: pointer;
    text-decoration: none;
  }
  .tb.back { color: #bfdbfe; font-size: 1.3rem; font-weight: 850; }
  .tb:hover,
  .tb:focus-visible { background: color-mix(in srgb, var(--accent) 26%, rgba(10, 16, 30, 0.5)); outline: none; }
  .tb:active { transform: scale(0.92); }
  .tb:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 55%, transparent); }

  .music-toggle span { transition: opacity 120ms ease; }
  .music-toggle.muted { color: var(--txt3, #94a3b8); position: relative; }
  .music-toggle.muted::after {
    content: '';
    position: absolute;
    left: 22%;
    right: 22%;
    top: 50%;
    height: 2px;
    background: currentColor;
    transform: rotate(-20deg);
    border-radius: 2px;
  }

  .mini-score {
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
  }
  .mini-score .cur { font-size: 1.5rem; font-weight: 900; }
  .mini-score .best { font-size: 0.82rem; font-weight: 800; color: var(--accent); }
  .sr-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); margin: -1px; padding: 0; border: 0; }

  /* The playfield fills the whole shell; the canvas keeps its screen-matched
     aspect and is centred — on a phone that means edge-to-edge with no bars. */
  .stage {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: #0a1120;
  }
  canvas {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    margin: auto;
    background: #0a1120;
    touch-action: none;
    image-rendering: auto;
  }

  /* Ready / paused / result = a fullscreen modal ABOVE the floating controls. */
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-content: center;
    gap: 0.55rem;
    justify-items: center;
    text-align: center;
    padding: 2rem 1.2rem calc(2rem + env(safe-area-inset-bottom));
    background: rgba(6, 10, 22, 0.82);
    backdrop-filter: blur(4px);
  }
  .overlay.win { background: rgba(8, 20, 12, 0.86); }
  .overlay .big { margin: 0; font-size: 3rem; }
  .ov-game { margin: 0; font-size: 1.5rem; }
  .ov-title { font-size: 1.5rem; }
  .record {
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    background: linear-gradient(135deg, #fbbf24, #f472b6);
    color: #1a1206;
    font-weight: 900;
    font-size: 0.82rem;
  }
  .ov-score { margin: 0; color: var(--txt2, #cbd5e1); font-size: 0.95rem; }
  .ov-versus {
    margin: 0.15rem 0 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    color: var(--txt2, #cbd5e1);
    font-size: 0.86rem;
  }
  .ov-versus .lead { font-weight: 900; }
  .ov-versus .lead.win { color: #4ade80; }
  .ov-versus .lead.tie { color: #fbbf24; }
  .ov-versus .lead.behind { color: #f472b6; }
  .ov-actions { display: grid; gap: 0.45rem; justify-items: center; margin-top: 0.3rem; }
  .cta {
    min-height: 52px;
    min-width: 180px;
    padding: 0.8rem 1.6rem;
    border-radius: 0.9rem;
    border: none;
    background: linear-gradient(135deg, var(--accent), #a78bfa);
    color: #06121f;
    font: inherit;
    font-weight: 900;
    font-size: 1.05rem;
    cursor: pointer;
  }
  .cta:active { transform: scale(0.97); }
  .cta:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 55%, transparent); }
  .sub { margin: 0; color: var(--txt3, #94a3b8); font-size: 0.85rem; }
  .hint { margin: 0.4rem 0 0; color: var(--txt3, #94a3b8); font-size: 0.78rem; line-height: 1.45; max-width: 26ch; }
  .ghost { color: #bfdbfe; text-decoration: none; font-weight: 800; font-size: 0.9rem; padding: 0.4rem; }
</style>
