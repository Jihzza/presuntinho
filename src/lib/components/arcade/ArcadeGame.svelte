<script lang="ts">
  // Arcade shell — owns the canvas, the RAF loop, all input (keyboard + swipe +
  // drag + on-screen controls), the HUD, sound/haptic/confetti feedback and the
  // result overlay. Game logic lives in the per-game engines (src/lib/arcade).
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { ArcadeGameDefinition } from '$lib/arcade/games';
  import { highScoreKey, lastScoreKey, readArcadeScore, writeArcadeScore } from '$lib/arcade/games';
  import { FIELD_W, FIELD_H, type ArcadeEngine, type ArcadeInput, type Direction } from '$lib/arcade/engine';
  import { prefersReducedMotion, fireConfettiEvent } from '$lib/components/events';
  import { playSfx, vibrate } from '$lib/gamification/sound';
  import ArcadeTouchHud from './ArcadeTouchHud.svelte';

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
    } else if (status === 'paused') {
      status = 'playing';
      lastTs = performance.now();
    }
  }

  function restart(): void {
    reset();
    start();
  }

  function finish(end: 'won' | 'over'): void {
    status = end;
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
    if (engine && ctx) engine.draw({ ctx, t: elapsed, reduced });
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
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      shellEl?.removeEventListener('touchmove', stopTouch);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('keyup', onKeyup);
    };
  });
</script>

<div class="shell" bind:this={shellEl} data-game={game.id} style="--accent: {game.accent};">
  <header class="head">
    <a href="/secrets/" class="back">{$t('arcade.game.back', { default: '← Voltar à sala' })}</a>
    <div class="title">
      <p class="kicker">{$t(game.difficultyKey)} · {$t('arcade.game.kicker', { default: 'Máquina arcade' })}</p>
      <h1><span aria-hidden="true">{game.icon}</span> {$t(game.titleKey)}</h1>
    </div>
  </header>

  <div class="hud" aria-label={$t('arcade.score.aria', { default: 'Pontuação do jogo' })}>
    <span><small>{$t('arcade.score.current', { default: 'Pontuação' })}</small><strong>{score}</strong></span>
    <span><small>{$t('arcade.score.best', { default: 'Melhor pontuação' })}</small><strong>{high}</strong></span>
    <span><small>{$t('arcade.score.last', { default: 'Última' })}</small><strong>{last}</strong></span>
  </div>

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

      {#if status === 'playing'}
        <!-- Free-Fire-style overlay controls float over the canvas corners -->
        <ArcadeTouchHud move={game.hud.move} action={game.hud.action} {onTurn} {onHold} {onAction} />
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
    <p class="status-line" aria-live="polite">{$t(statusKey)}</p>
  </div>

  <section class="howto">
    <p class="mobile">{$t(game.controlsKey)}</p>
    <p class="keys">⌨️ {$t(game.keysKey)}</p>
  </section>
</div>

<style>
  .shell {
    max-width: 560px;
    margin: 0 auto;
    padding: 0.75rem 0.9rem calc(6rem + env(safe-area-inset-bottom));
    color: var(--txt, #fff);
  }
  .head { display: grid; gap: 0.4rem; margin-bottom: 0.6rem; }
  .back { color: #bfdbfe; text-decoration: none; font-weight: 850; font-size: 0.9rem; }
  .kicker { margin: 0; color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.68rem; font-weight: 900; }
  h1 { margin: 0.05rem 0 0; font-size: clamp(1.5rem, 6vw, 2.2rem); line-height: 1.05; }

  .hud { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.45rem; margin-bottom: 0.7rem; }
  .hud span { padding: 0.5rem 0.6rem; border-radius: 0.85rem; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); text-align: center; }
  .hud small, .hud strong { display: block; }
  .hud small { color: var(--txt3, #94a3b8); font-size: 0.66rem; }
  .hud strong { font-size: 1.2rem; font-variant-numeric: tabular-nums; }

  .cabinet { max-width: 420px; margin: 0 auto; }
  /* Mobile-first: the canvas sits in the TOP of the stage and the bottom
     padding is a reserved "control deck" where the floating HUD lives, so the
     thumb controls never cover the playfield (racing car / paddle / pig all
     live at the bottom of the field). Desktop removes the deck (HUD hidden). */
  .stage {
    position: relative;
    padding: 0.6rem 0.6rem 9.25rem;
    border: 1px solid color-mix(in srgb, var(--accent) 42%, transparent);
    border-radius: 1.3rem;
    background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 46%), rgba(0, 0, 0, 0.4);
    box-shadow: 0 22px 54px rgba(0, 0, 0, 0.4);
  }
  canvas {
    display: block;
    width: 100%;
    aspect-ratio: 360 / 480;
    max-height: min(40vh, 350px);
    margin: 0 auto;
    border-radius: 0.9rem;
    background: #0a1120;
    touch-action: none;
    image-rendering: auto;
  }
  /* pause / restart mini cluster — floats top-right over the stage */
  .mini-cluster {
    position: absolute;
    top: 0.85rem;
    right: 0.85rem;
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
  /* thumb HUD is for touch; on real pointers we rely on keyboard + mini
     cluster, so drop the reserved control deck and give the canvas more room. */
  @media (pointer: fine) {
    .stage { padding: 0.6rem; }
    canvas { max-height: min(58vh, 520px); }
    .stage :global(.hud-overlay) { display: none; }
  }
  .overlay {
    position: absolute;
    inset: 0.6rem;
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
  .status-line { margin: 0.55rem 0 0; text-align: center; color: var(--txt2, #cbd5e1); font-weight: 800; font-size: 0.85rem; }

  .howto { margin-top: 0.6rem; text-align: center; }
  .howto p { margin: 0.2rem 0; color: var(--txt3, #94a3b8); font-size: 0.78rem; line-height: 1.45; }
  .howto .keys { display: none; }
  /* keyboard hint only where a real keyboard/mouse is likely */
  @media (pointer: fine) {
    .howto .keys { display: block; }
  }
</style>
