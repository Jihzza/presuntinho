<script lang="ts">
  // Arcade shell — owns the canvas, the RAF loop, all input (keyboard + swipe +
  // drag + on-screen controls), the HUD, sound/haptic/confetti feedback and the
  // result overlay. Game logic lives in the per-game engines (src/lib/arcade).
  import { onMount, onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { ArcadeGameDefinition } from '$lib/arcade/games';
  import { highScoreKey, lastScoreKey, readArcadeScore, writeArcadeScore } from '$lib/arcade/games';
  import { FIELD_W, FIELD_H, type ArcadeEngine, type ArcadeInput, type Direction } from '$lib/arcade/engine';
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

  let { game }: { game: ArcadeGameDefinition } = $props();

  type Status = 'ready' | 'playing' | 'paused' | 'won' | 'over';

  let canvas = $state<HTMLCanvasElement | null>(null);
  let shellEl = $state<HTMLDivElement | null>(null);
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

  function start(): void {
    if (status === 'playing') return;
    if (status === 'won' || status === 'over') reset();
    status = 'playing';
    lastTs = performance.now();
    // start() is only ever reached via a user gesture (tap / key / button), so
    // this is a valid moment to unlock + start the game's chiptune theme.
    startArcadeMusic(game.id);
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

  // Publish the touch HUD to the root layout while playing (it renders the
  // controls fixed at the viewport bottom and hides the mascot/heart FABs).
  $effect(() => {
    arcadeHud.set(
      status === 'playing'
        ? { left: game.hud.left, right: game.hud.right, onTurn, onHold, onAction }
        : null
    );
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
    engine = game.factory();
    if (canvas) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = FIELD_W * dpr;
      canvas.height = FIELD_H * dpr;
      ctx = canvas.getContext('2d');
      ctx?.scale(dpr, dpr);
    }
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

    const onFsChange = () => (isFullscreen = !!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);

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
    };
  });
</script>

<div class="shell" bind:this={shellEl} class:playing={status === 'playing'} class:fullscreen={isFullscreen} data-game={game.id} style="--accent: {game.accent};">
  <!-- Slim top bar so the playfield gets the screen; score rides along here. -->
  <div class="topbar">
    <a href="/secrets/" class="back" aria-label={$t('arcade.game.back', { default: '← Voltar à sala' })}>←</a>
    <h1><span aria-hidden="true">{game.icon}</span> {$t(game.titleKey)}</h1>
    <div class="mini-score" aria-label={$t('arcade.score.aria', { default: 'Pontuação do jogo' })}>
      <span class="cur">{score}</span>
      <span class="best" title={$t('arcade.score.best', { default: 'Melhor pontuação' })}>◆ {high}</span>
    </div>
    <button
      type="button"
      class="fs-toggle music-toggle"
      class:muted={!musicOn}
      onclick={onToggleMusic}
      aria-pressed={musicOn}
      aria-label={musicOn
        ? $t('arcade.music.off', { default: 'Desligar música' })
        : $t('arcade.music.on', { default: 'Ligar música' })}
      title={musicOn
        ? $t('arcade.music.off', { default: 'Desligar música' })
        : $t('arcade.music.on', { default: 'Ligar música' })}
    ><span aria-hidden="true">♪</span></button>
    {#if fsSupported}
      <button
        type="button"
        class="fs-toggle"
        onclick={toggleFullscreen}
        aria-pressed={isFullscreen}
        aria-label={isFullscreen
          ? $t('arcade.fullscreen.exit', { default: 'Sair do ecrã inteiro' })
          : $t('arcade.fullscreen.enter', { default: 'Ecrã inteiro' })}
      >{isFullscreen ? '⤢' : '⛶'}</button>
    {/if}
  </div>
  <p class="sr-live" aria-live="polite">{$t(statusKey)}</p>

  <div class="cabinet">
    <div class="stage">
      <canvas
        bind:this={canvas}
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
        aria-label={$t('arcade.game.canvas', { default: 'Área de jogo arcade' })}
      ></canvas>

      <!-- Tasteful CRT sheen over the whole screen (pointer-events:none, so the
           canvas still gets taps; the animated glare self-disables under
           prefers-reduced-motion). -->
      <CrtOverlay radius="1.25rem" />

      {#if status === 'playing'}
        <div class="mini-cluster">
          <button type="button" class="mini" onclick={pause} aria-label={$t('arcade.actions.pause', { default: 'Pausa' })}>⏸</button>
          <button type="button" class="mini" onclick={restart} aria-label={$t('arcade.actions.restart', { default: 'Recomeçar' })}>⟲</button>
        </div>
      {/if}

      {#if status !== 'playing'}
        <div class="overlay" class:win={status === 'won'} class:over={status === 'over'}>
          {#if status === 'ready'}
            <p class="big">{game.icon}</p>
            <button type="button" class="cta" onclick={start}>{$t('arcade.actions.play', { default: 'Jogar' })}</button>
            <p class="sub">{$t('arcade.overlay.tap_start', { default: 'Toca para começar' })}</p>
          {:else if status === 'paused'}
            <p class="big">⏸️</p>
            <strong class="ov-title">{$t('arcade.state.paused', { default: 'Em pausa' })}</strong>
            <button type="button" class="cta" onclick={pause}>{$t('arcade.actions.resume', { default: 'Continuar' })}</button>
          {:else}
            <strong class="ov-title">
              {status === 'won'
                ? $t('arcade.result.won', { default: 'Conseguiste! 🎉' })
                : $t('arcade.result.over', { default: 'Fim de jogo' })}
            </strong>
            {#if newRecord}
              <span class="record">⭐ {$t('arcade.overlay.new_record', { default: 'Novo recorde!' })}</span>
            {/if}
            <p class="ov-score">{$t('arcade.result.score_line', { values: { score, best: high }, default: 'Pontuação {score} · recorde {best}' })}</p>
            <div class="ov-actions">
              <button type="button" class="cta" onclick={restart}>{$t('arcade.actions.play_again', { default: 'Jogar de novo' })}</button>
              <a class="ghost" href="/secrets/">{$t('arcade.game.back', { default: '← Voltar à sala' })}</a>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  {#if status !== 'playing'}
    <section class="howto">
      <p class="mobile">{$t(game.controlsKey)}</p>
      <p class="keys">⌨️ {$t(game.keysKey)}</p>
    </section>
  {/if}
</div>

<style>
  .shell {
    max-width: 560px;
    margin: 0 auto;
    padding: 0.5rem 0.7rem calc(1rem + env(safe-area-inset-bottom));
    color: var(--txt, #fff);
  }
  /* Slim top bar: back arrow · title · live score. */
  .topbar {
    display: grid;
    grid-template-columns: auto 1fr auto auto auto;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .music-toggle span { transition: opacity 120ms ease; }
  .music-toggle.muted { color: var(--txt3, #94a3b8); }
  /* struck-through note when muted, drawn with a rotated pseudo-element so it
     works regardless of emoji/glyph support */
  .music-toggle.muted { position: relative; }
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
  .fs-toggle {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    color: #fff;
    font-size: 1.05rem;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    cursor: pointer;
  }
  .fs-toggle:hover, .fs-toggle:focus-visible { background: color-mix(in srgb, var(--accent) 20%, transparent); outline: none; }
  .fs-toggle:active { transform: scale(0.92); }
  .back {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    color: #bfdbfe;
    text-decoration: none;
    font-size: 1.3rem;
    font-weight: 850;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .back:hover, .back:focus-visible { background: color-mix(in srgb, var(--accent) 20%, transparent); outline: none; }
  h1 { margin: 0; font-size: clamp(1.05rem, 4.5vw, 1.4rem); line-height: 1.1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini-score { display: flex; align-items: baseline; gap: 0.55rem; font-variant-numeric: tabular-nums; }
  .mini-score .cur { font-size: 1.35rem; font-weight: 900; }
  .mini-score .best { font-size: 0.82rem; font-weight: 800; color: var(--accent); }
  .sr-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); margin: -1px; padding: 0; border: 0; }

  /* Immersive playfield: the canvas fills the width and most of the height
     (the touch controls live OUTSIDE it, fixed over the footer via the root
     layout), so the game isn't a tiny window any more. */
  .cabinet { max-width: 460px; margin: 0 auto; }
  .stage {
    position: relative;
    padding: 0.55rem;
    border: 1px solid color-mix(in srgb, var(--accent) 42%, transparent);
    border-radius: 1.3rem;
    background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 46%), rgba(0, 0, 0, 0.4);
    box-shadow: 0 22px 54px rgba(0, 0, 0, 0.4);
  }
  canvas {
    display: block;
    width: 100%;
    aspect-ratio: 360 / 480;
    /* During play the app chrome is hidden, so the canvas gets almost the whole
       screen; the reserve leaves room for the top bar AND the full footprint of
       the TALLEST fixed control cluster (the platformer's stacked Jump+▶ ≈ 155px
       at bottom 1.6rem) plus the home-indicator safe area, so no control ever
       covers the playfield even on the shortest phones. Tall phones stay
       aspect-ratio-bound and large. */
    max-height: min(calc(100dvh - 16.5rem - env(safe-area-inset-bottom)), 700px);
    margin: 0 auto;
    border-radius: 0.9rem;
    background: #0a1120;
    touch-action: none;
    image-rendering: auto;
  }
  /* pause / restart mini cluster — floats top-right over the stage */
  .mini-cluster {
    position: absolute;
    top: 0.9rem;
    right: 0.9rem;
    display: flex;
    gap: 0.4rem;
    z-index: 6;
  }
  .mini {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 1.05rem;
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(10, 16, 30, 0.55);
    backdrop-filter: blur(6px);
    cursor: pointer;
  }
  .mini:active { transform: scale(0.92); }
  .mini:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 55%, transparent); }
  /* desktop plays with the keyboard, so the canvas can take the full height */
  @media (pointer: fine) {
    canvas { max-height: min(72vh, 640px); }
  }
  /* landscape: controls sit on the side edges, so the canvas can use the full
     (short) height; it stays aspect-ratio-bound and centred between them. */
  @media (orientation: landscape) and (max-height: 540px) {
    canvas { max-height: min(calc(100dvh - 5.5rem - env(safe-area-inset-bottom)), 700px); }
  }
  /* Browser-fullscreen ("ecrã inteiro"): no URL bar, so the machine takes the
     whole width and the playfield can breathe a little taller. */
  .shell.fullscreen { max-width: none; }
  .shell.fullscreen .cabinet { max-width: 560px; }
  .shell.fullscreen canvas { max-height: min(calc(100dvh - 15rem - env(safe-area-inset-bottom)), 860px); }
  .overlay {
    position: absolute;
    inset: 0.6rem;
    z-index: 7; /* above the CRT overlay (z-4) and mini-cluster (z-6) */
    display: grid;
    place-content: center;
    gap: 0.5rem;
    justify-items: center;
    text-align: center;
    border-radius: 0.9rem;
    background: rgba(6, 10, 22, 0.78);
    backdrop-filter: blur(3px);
    padding: 1rem;
  }
  .overlay.win { background: rgba(8, 20, 12, 0.82); }
  .overlay .big { margin: 0; font-size: 2.6rem; }
  .ov-title { font-size: 1.35rem; }
  .record {
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    background: linear-gradient(135deg, #fbbf24, #f472b6);
    color: #1a1206;
    font-weight: 900;
    font-size: 0.82rem;
  }
  .ov-score { margin: 0; color: var(--txt2, #cbd5e1); font-size: 0.9rem; }
  .ov-actions { display: grid; gap: 0.45rem; justify-items: center; margin-top: 0.3rem; }
  .cta {
    min-height: 48px;
    min-width: 160px;
    padding: 0.7rem 1.5rem;
    border-radius: 0.9rem;
    border: none;
    background: linear-gradient(135deg, var(--accent), #a78bfa);
    color: #06121f;
    font: inherit;
    font-weight: 900;
    cursor: pointer;
  }
  .cta:active { transform: scale(0.97); }
  .cta:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 55%, transparent); }
  .sub { margin: 0; color: var(--txt3, #94a3b8); font-size: 0.8rem; }
  .ghost { color: #bfdbfe; text-decoration: none; font-weight: 800; font-size: 0.88rem; padding: 0.4rem; }

  .howto { margin-top: 0.6rem; text-align: center; }
  .howto p { margin: 0.2rem 0; color: var(--txt3, #94a3b8); font-size: 0.78rem; line-height: 1.45; }
  .howto .keys { display: none; }
  /* keyboard hint only where a real keyboard/mouse is likely */
  @media (pointer: fine) {
    .howto .keys { display: block; }
  }
</style>
