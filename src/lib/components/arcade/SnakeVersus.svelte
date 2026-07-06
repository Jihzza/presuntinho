<script lang="ts">
  /**
   * SnakeVersus — the live 1v1 snake duel. Two snakes share one grid and fight
   * over the same food; biting the other's tail steals a point. Host-authoritative
   * over a realtime Room (see versus-net.ts): the host runs the sim, the guest
   * renders + sends turns. Self-contained chrome (score bar on top, d-pad on the
   * bottom) so nothing sits under shared HUD/controls.
   */
  import { onMount, onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { Room } from '$lib/multiplayer/realtime';
  import { VersusNet } from '$lib/arcade/multiplayer/versus-net';
  import type { VersusState, Direction } from '$lib/arcade/multiplayer/snake-versus-sim';
  import { mascotById } from '$lib/gamification/mascots';
  import { playSfx, vibrate } from '$lib/gamification/sound';

  interface Props {
    room: Room;
    /** Local player's mascot id, for the head avatar + score chip. */
    mascot: string;
    /** Fixed shared board — both peers MUST agree, so these are constants. */
    cols?: number;
    rows?: number;
    onExit?: () => void;
  }
  let { room, mascot, cols = 16, rows = 22, onExit }: Props = $props();

  const P0 = '#f472b6'; // host (player 0) — pink
  const P1 = '#38bdf8'; // guest (player 1) — cyan

  let canvas = $state<HTMLCanvasElement | null>(null);
  let ctx: CanvasRenderingContext2D | null = null;
  // Named `board` (not `state`) so it can't collide with the `$state` rune —
  // that shadow made svelte-check treat `$state<…>()` as an untyped call and
  // cascade `any` through the render loop.
  let board = $state<VersusState | null>(null);
  let net: VersusNet | null = null;
  const localP = $derived(room.role === 'host' ? 0 : 1);
  let lastScores: [number, number] = [0, 0];
  let raf = 0;
  let cell = 18;

  const localEmoji = $derived(mascotById(mascot)?.emoji ?? '🐷');

  function seed(): number {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0];
  }

  function resize(): void {
    if (!canvas) return;
    const maxW = Math.min(window.innerWidth - 16, 460);
    const maxH = window.innerHeight - 210; // leave room for score bar + d-pad
    cell = Math.max(10, Math.floor(Math.min(maxW / cols, maxH / rows)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = cols * cell * dpr;
    canvas.height = rows * cell * dpr;
    canvas.style.width = `${cols * cell}px`;
    canvas.style.height = `${rows * cell}px`;
    ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  let seededScores = false;
  function onState(s: VersusState): void {
    const prev = board;
    board = s;
    // Seed the score baseline from the first state / a fresh round so we don't
    // play a pickup sound for the jump 0 → current on join or on rematch.
    if (!seededScores || (prev?.result != null && s.result === null) || s.tick <= 1) {
      lastScores = [s.snakes[0].score, s.snakes[1].score];
      seededScores = true;
    }
    if (s.snakes[0].score !== lastScores[0] || s.snakes[1].score !== lastScores[1]) {
      const mineUp =
        (localP === 0 && s.snakes[0].score > lastScores[0]) ||
        (localP === 1 && s.snakes[1].score > lastScores[1]);
      playSfx(mineUp ? 'pop' : 'ding');
      vibrate('tap');
      lastScores = [s.snakes[0].score, s.snakes[1].score];
    }
    if (s.result !== null) {
      playSfx(s.result === localP ? 'fanfare' : 'wrong');
      vibrate(s.result === localP ? 'success' : 'warning');
    }
  }

  function turn(dir: Direction): void {
    net?.setLocalTurn(dir);
  }

  // ── input: keyboard + swipe + d-pad ────────────────────────────────────────
  function onKey(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    const map: Record<string, Direction> = {
      arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
      arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right'
    };
    if (map[k]) {
      e.preventDefault();
      turn(map[k]);
    }
  }
  let downX = 0;
  let downY = 0;
  function onPointerDown(e: PointerEvent): void {
    downX = e.clientX;
    downY = e.clientY;
  }
  function onPointerUp(e: PointerEvent): void {
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    if (Math.hypot(dx, dy) < 24) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  }

  function draw(): void {
    raf = requestAnimationFrame(draw);
    if (!ctx || !canvas) return;
    const c = ctx;
    const W = cols * cell;
    const H = rows * cell;
    // board
    c.fillStyle = '#0a1120';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,0.04)';
    c.lineWidth = 1;
    for (let x = 0; x <= cols; x += 1) {
      c.beginPath();
      c.moveTo(x * cell + 0.5, 0);
      c.lineTo(x * cell + 0.5, H);
      c.stroke();
    }
    for (let y = 0; y <= rows; y += 1) {
      c.beginPath();
      c.moveTo(0, y * cell + 0.5);
      c.lineTo(W, y * cell + 0.5);
      c.stroke();
    }
    const s = board;
    if (!s) return;
    // food
    c.fillStyle = '#fbbf24';
    c.beginPath();
    c.arc(s.food.x * cell + cell / 2, s.food.y * cell + cell / 2, cell * 0.32, 0, Math.PI * 2);
    c.fill();
    // snakes
    const colors = [P0, P1];
    s.snakes.forEach((sn, pi) => {
      if (!sn.body.length) return;
      c.fillStyle = colors[pi];
      c.globalAlpha = sn.alive ? 1 : 0.4;
      sn.body.forEach((seg, i) => {
        const isHead = i === 0;
        const pad = isHead ? 1 : 2;
        c.fillStyle = isHead ? '#fff' : colors[pi];
        if (isHead) {
          // head ring in the player colour + a dot
          c.fillStyle = colors[pi];
          c.fillRect(seg.x * cell + pad, seg.y * cell + pad, cell - pad * 2, cell - pad * 2);
          c.fillStyle = '#0a1120';
          c.font = `${Math.round(cell * 0.7)}px sans-serif`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
        } else {
          c.fillRect(seg.x * cell + pad, seg.y * cell + pad, cell - pad * 2, cell - pad * 2);
        }
      });
      c.globalAlpha = 1;
    });
  }

  onMount(() => {
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKey);
    net = new VersusNet({
      room,
      cols,
      rows,
      onState,
      onEvents: () => {}
    });
    net.onRematchRequest(() => net?.rematch(seed()));
    net.start(seed());
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      net?.stop();
    };
  });
  onDestroy(() => cancelAnimationFrame(raf));

  const myScore = $derived(board ? board.snakes[localP].score : 0);
  const theirScore = $derived(board ? board.snakes[1 - localP].score : 0);
  const finished = $derived(board?.result != null);
  const iWon = $derived(board?.result === localP);
  const isDraw = $derived(board?.result === 'draw');
</script>

<!-- Swipe is a progressive enhancement; the d-pad buttons below are the
     accessible control, so a static-element pointer handler is fine here. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="versus" onpointerdown={onPointerDown} onpointerup={onPointerUp}>
  <div class="scorebar">
    <span class="chip me" style="--c: {localP === 0 ? P0 : P1}">
      <span class="ava">{localEmoji}</span>{$t('versus.you', { default: 'Tu' })} <b>{myScore}</b>
    </span>
    <span class="vs">VS</span>
    <span class="chip them" style="--c: {localP === 0 ? P1 : P0}">
      <b>{theirScore}</b> {$t('versus.partner', { default: 'Parceir@' })}
    </span>
  </div>

  <div class="stage">
    <canvas bind:this={canvas} aria-label={$t('versus.canvas', { default: 'Campo de snake 1 contra 1' })}></canvas>
    {#if finished}
      <div class="ov">
        <strong>{isDraw ? $t('versus.draw', { default: 'Empate! 🤝' }) : iWon ? $t('versus.win', { default: 'Ganhaste! 🏆' }) : $t('versus.lose', { default: 'Ela ganhou! 🔥' })}</strong>
        <p>{myScore} · {theirScore}</p>
        <div class="ov-actions">
          <button type="button" class="cta" onclick={() => net?.rematch(seed())}>{$t('versus.rematch', { default: 'Revanche' })}</button>
          <button type="button" class="ghost" onclick={() => onExit?.()}>{$t('versus.leave', { default: 'Sair' })}</button>
        </div>
      </div>
    {/if}
  </div>

  <div class="dpad" aria-label={$t('arcade.hud.move_aria', { default: 'Movimento' })}>
    <button type="button" class="d up" onpointerdown={(e) => { e.preventDefault(); turn('up'); }} aria-label="↑">▲</button>
    <button type="button" class="d left" onpointerdown={(e) => { e.preventDefault(); turn('left'); }} aria-label="←">◀</button>
    <button type="button" class="d right" onpointerdown={(e) => { e.preventDefault(); turn('right'); }} aria-label="→">▶</button>
    <button type="button" class="d down" onpointerdown={(e) => { e.preventDefault(); turn('down'); }} aria-label="↓">▼</button>
  </div>
</div>

<style>
  .versus {
    position: fixed;
    inset: 0;
    z-index: 41;
    background: radial-gradient(circle at 50% -10%, #171033, #070510 60%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: calc(env(safe-area-inset-top) + 0.6rem) 0.5rem calc(env(safe-area-inset-bottom) + 0.6rem);
    touch-action: none;
    color: #e8fff4;
    font-family: 'Courier New', ui-monospace, monospace;
  }
  .scorebar { display: flex; align-items: center; gap: 0.8rem; font-weight: 900; }
  .chip {
    display: inline-flex; align-items: center; gap: 0.35rem;
    padding: 0.3rem 0.7rem; border-radius: 999px;
    border: 2px solid var(--c); color: #fff;
    background: color-mix(in srgb, var(--c) 18%, transparent);
  }
  .chip b { font-size: 1.2rem; }
  .chip .ava { font-family: sans-serif; }
  .vs { color: #94a3b8; font-size: 0.8rem; }

  .stage { position: relative; display: grid; place-items: center; flex: 1; min-height: 0; }
  canvas { display: block; border-radius: 0.4rem; box-shadow: 0 0 0 2px rgba(103,232,249,0.25); image-rendering: auto; }
  .ov {
    position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 0.5rem;
    background: rgba(6,10,22,0.82); backdrop-filter: blur(3px); border-radius: 0.4rem; text-align: center;
  }
  .ov strong { font-size: 1.5rem; }
  .ov p { margin: 0; color: #cbd5e1; }
  .ov-actions { display: flex; gap: 0.6rem; }
  .cta { padding: 0.7rem 1.3rem; border-radius: 0.8rem; border: none; background: linear-gradient(135deg, #f472b6, #a78bfa); color: #06121f; font: inherit; font-weight: 900; cursor: pointer; }
  .ghost { padding: 0.7rem 1rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 0.8rem; background: transparent; color: #bfdbfe; font: inherit; font-weight: 800; cursor: pointer; }

  /* compact d-pad centred at the bottom */
  .dpad { position: relative; width: 150px; height: 108px; flex: 0 0 auto; }
  .d {
    position: absolute; width: 48px; height: 48px; display: grid; place-items: center;
    border-radius: 0.7rem; font-size: 1.1rem; font-weight: 900; color: #fff; cursor: pointer;
    border: 1.5px solid rgba(103,232,249,0.5); background: rgba(10,16,30,0.5); backdrop-filter: blur(3px);
    -webkit-tap-highlight-color: transparent; touch-action: none;
  }
  .d:active { transform: scale(0.9); background: rgba(103,232,249,0.3); }
  .d.up { left: 51px; top: 0; }
  .d.down { left: 51px; bottom: 0; }
  .d.left { left: 0; top: 30px; }
  .d.right { right: 0; top: 30px; }
</style>
