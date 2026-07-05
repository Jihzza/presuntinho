<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { ArcadeGameDefinition, ArcadeGameId } from '$lib/arcade/games';
  import { highScoreKey, lastScoreKey, readArcadeScore, writeArcadeScore } from '$lib/arcade/games';

  let { game }: { game: ArcadeGameDefinition } = $props();

  let canvas: HTMLCanvasElement;
  let score = $state(0);
  let highScore = $state(0);
  let lastScore = $state(0);
  let status = $state<'ready' | 'playing' | 'paused' | 'won' | 'over'>('ready');
  let messageKey = $state('arcade.state.ready');

  const W = 360;
  const H = 360;
  type Direction = 'up' | 'down' | 'left' | 'right';

  const keyState = new Set<string>();
  let raf = 0;
  let last = 0;
  let direction: Direction = 'right';
  let nextDirection: Direction = 'right';
  let snake: Array<{ x: number; y: number }> = [];
  let food = { x: 9, y: 9 };
  let player = { x: 1, y: 1, vx: 0, vy: 0, grounded: false };
  let enemies: Array<{ x: number; y: number; dx: number; dy: number }> = [];
  let pellets = new Set<string>();
  let obstacles: Array<{ x: number; y: number; w: number; h: number; speed: number }> = [];
  let bricks: Array<{ x: number; y: number; w: number; h: number; alive: boolean }> = [];
  let ball = { x: 180, y: 230, vx: 120, vy: -150 };
  let tick = 0;

  const walls = new Set<string>([
    '3,3','4,3','5,3','7,3','8,3','9,3','11,3','12,3','13,3',
    '3,6','5,6','7,6','9,6','11,6','13,6','3,9','4,9','5,9','8,9','9,9','10,9','13,9',
    '6,12','7,12','8,12','9,12','10,12','11,12'
  ]);

  function reset(): void {
    score = 0;
    status = 'ready';
    messageKey = 'arcade.state.ready';
    direction = 'right';
    nextDirection = 'right';
    tick = 0;
    snake = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
    food = { x: 14, y: 8 };
    player = game.id === 'racing'
      ? { x: 170, y: 296, vx: 0, vy: 0, grounded: false }
      : game.id === 'platformer'
        ? { x: 24, y: 286, vx: 0, vy: 0, grounded: true }
        : game.id === 'maze'
          ? { x: 1, y: 1, vx: 0, vy: 0, grounded: false }
          : { x: 160, y: 318, vx: 0, vy: 0, grounded: false };
    enemies = game.id === 'maze'
      ? [{ x: 13, y: 13, dx: -1, dy: 0 }, { x: 8, y: 5, dx: 0, dy: 1 }]
      : [];
    pellets = new Set<string>();
    if (game.id === 'maze') {
      for (let y = 1; y < 15; y += 1) for (let x = 1; x < 15; x += 1) if (!walls.has(`${x},${y}`)) pellets.add(`${x},${y}`);
      pellets.delete('1,1');
    }
    obstacles = [];
    bricks = [];
    if (game.id === 'breakout') {
      for (let r = 0; r < 4; r += 1) for (let c = 0; c < 7; c += 1) bricks.push({ x: 24 + c * 45, y: 42 + r * 24, w: 36, h: 14, alive: true });
      ball = { x: 180, y: 230, vx: 120, vy: -150 };
    }
    draw();
  }

  function start(): void {
    if (status === 'playing') return;
    if (status === 'over' || status === 'won') reset();
    status = 'playing';
    messageKey = 'arcade.state.playing';
    last = performance.now();
  }

  function pause(): void {
    if (status === 'playing') {
      status = 'paused';
      messageKey = 'arcade.state.paused';
    } else if (status === 'paused') {
      status = 'playing';
      messageKey = 'arcade.state.playing';
      last = performance.now();
    }
  }

  function finish(next: 'won' | 'over'): void {
    status = next;
    messageKey = next === 'won' ? 'arcade.state.won' : 'arcade.state.over';
    lastScore = score;
    highScore = Math.max(highScore, score);
    writeArcadeScore(lastScoreKey(game.id), lastScore);
    writeArcadeScore(highScoreKey(game.id), highScore);
  }

  function setDir(dir: typeof direction): void {
    const opposite = direction === 'up' && dir === 'down' || direction === 'down' && dir === 'up' || direction === 'left' && dir === 'right' || direction === 'right' && dir === 'left';
    if (!opposite) nextDirection = dir;
    keyState.add(dir);
    start();
  }

  function action(): void {
    start();
    if (game.id === 'platformer' && player.grounded) {
      player.vy = -250;
      player.grounded = false;
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d',' ','enter','p'].includes(k)) e.preventDefault();
    if (k === 'p') return pause();
    if (k === ' ' || k === 'enter') return action();
    if (k === 'arrowup' || k === 'w') setDir('up');
    if (k === 'arrowdown' || k === 's') setDir('down');
    if (k === 'arrowleft' || k === 'a') setDir('left');
    if (k === 'arrowright' || k === 'd') setDir('right');
  }

  function onKeyup(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w') keyState.delete('up');
    if (k === 'arrowdown' || k === 's') keyState.delete('down');
    if (k === 'arrowleft' || k === 'a') keyState.delete('left');
    if (k === 'arrowright' || k === 'd') keyState.delete('right');
  }

  function loop(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (status === 'playing') update(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }

  function update(dt: number): void {
    if (game.id === 'snake') updateSnake(dt);
    if (game.id === 'maze') updateMaze(dt);
    if (game.id === 'racing') updateRacing(dt);
    if (game.id === 'platformer') updatePlatformer(dt);
    if (game.id === 'breakout') updateBreakout(dt);
  }

  function updateSnake(dt: number): void {
    tick += dt;
    if (tick < 0.115) return;
    tick = 0;
    direction = nextDirection;
    const head = { ...snake[0] };
    if (direction === 'up') head.y -= 1;
    if (direction === 'down') head.y += 1;
    if (direction === 'left') head.x -= 1;
    if (direction === 'right') head.x += 1;
    if (head.x < 0 || head.y < 0 || head.x >= 18 || head.y >= 18 || snake.some((p) => p.x === head.x && p.y === head.y)) return finish('over');
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      do food = { x: Math.floor(Math.random() * 18), y: Math.floor(Math.random() * 18) }; while (snake.some((p) => p.x === food.x && p.y === food.y));
    } else snake.pop();
  }

  function updateMaze(dt: number): void {
    tick += dt;
    if (tick > 0.12) {
      tick = 0;
      const nx = player.x + (nextDirection === 'left' ? -1 : nextDirection === 'right' ? 1 : 0);
      const ny = player.y + (nextDirection === 'up' ? -1 : nextDirection === 'down' ? 1 : 0);
      if (nx >= 1 && ny >= 1 && nx < 15 && ny < 15 && !walls.has(`${nx},${ny}`)) { player.x = nx; player.y = ny; }
      const key = `${player.x},${player.y}`;
      if (pellets.delete(key)) score += 3;
      if (pellets.size === 0) finish('won');
      for (const e of enemies) {
        const ex = e.x + e.dx; const ey = e.y + e.dy;
        if (ex <= 0 || ey <= 0 || ex >= 15 || ey >= 15 || walls.has(`${ex},${ey}`)) { e.dx *= -1; e.dy *= -1; }
        else { e.x = ex; e.y = ey; }
        if (e.x === player.x && e.y === player.y) finish('over');
      }
    }
  }

  function updateRacing(dt: number): void {
    if (keyState.has('left')) player.x -= 180 * dt;
    if (keyState.has('right')) player.x += 180 * dt;
    player.x = Math.max(74, Math.min(254, player.x));
    score += Math.floor(25 * dt);
    tick += dt;
    if (tick > Math.max(0.35, 0.9 - score / 800)) {
      tick = 0;
      obstacles.push({ x: 76 + Math.floor(Math.random() * 5) * 38, y: -28, w: 30, h: 42, speed: 105 + score / 4 });
    }
    for (const o of obstacles) o.y += o.speed * dt;
    obstacles = obstacles.filter((o) => o.y < H + 60);
    for (const o of obstacles) if (rectHit(player.x, player.y, 28, 42, o.x, o.y, o.w, o.h)) finish('over');
  }

  function updatePlatformer(dt: number): void {
    player.vx = (keyState.has('left') ? -140 : keyState.has('right') ? 140 : 0);
    player.x += player.vx * dt;
    player.vy += 520 * dt;
    player.y += player.vy * dt;
    const platforms = [{ x: 0, y: 328, w: 360, h: 18 }, { x: 62, y: 262, w: 84, h: 12 }, { x: 180, y: 206, w: 86, h: 12 }, { x: 54, y: 146, w: 78, h: 12 }, { x: 224, y: 104, w: 78, h: 12 }];
    player.grounded = false;
    for (const p of platforms) if (player.vy >= 0 && rectHit(player.x, player.y, 22, 28, p.x, p.y, p.w, p.h)) { player.y = p.y - 28; player.vy = 0; player.grounded = true; }
    player.x = Math.max(0, Math.min(338, player.x));
    score = Math.max(score, Math.floor((328 - player.y) / 2));
    if (player.y < 72 && player.x > 230) finish('won');
    if (player.y > H + 40) finish('over');
  }

  function updateBreakout(dt: number): void {
    if (keyState.has('left')) player.x -= 190 * dt;
    if (keyState.has('right')) player.x += 190 * dt;
    player.x = Math.max(12, Math.min(268, player.x));
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.x < 8 || ball.x > W - 8) ball.vx *= -1;
    if (ball.y < 8) ball.vy *= -1;
    if (rectHit(ball.x - 7, ball.y - 7, 14, 14, player.x, 318, 80, 12)) ball.vy = -Math.abs(ball.vy);
    for (const b of bricks) if (b.alive && rectHit(ball.x - 7, ball.y - 7, 14, 14, b.x, b.y, b.w, b.h)) { b.alive = false; ball.vy *= -1; score += 5; }
    if (bricks.every((b) => !b.alive)) finish('won');
    if (ball.y > H + 20) finish('over');
  }

  function rectHit(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function draw(): void {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#09111f'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    if (game.id === 'snake') drawSnake(ctx);
    if (game.id === 'maze') drawMaze(ctx);
    if (game.id === 'racing') drawRacing(ctx);
    if (game.id === 'platformer') drawPlatformer(ctx);
    if (game.id === 'breakout') drawBreakout(ctx);
    if (status !== 'playing') drawOverlay(ctx);
  }

  function drawSnake(ctx: CanvasRenderingContext2D): void {
    const s = 20;
    ctx.fillStyle = '#22c55e'; for (const p of snake) round(ctx, p.x * s + 2, p.y * s + 2, 16, 16, 5);
    ctx.fillStyle = '#f97316'; round(ctx, food.x * s + 3, food.y * s + 3, 14, 14, 7);
  }
  function drawMaze(ctx: CanvasRenderingContext2D): void {
    const s = 22;
    ctx.fillStyle = '#1e3a8a'; for (const key of walls) { const [x,y] = key.split(',').map(Number); round(ctx, x*s+4, y*s+4, 16, 16, 4); }
    ctx.fillStyle = '#fde68a'; for (const key of pellets) { const [x,y] = key.split(',').map(Number); ctx.beginPath(); ctx.arc(x*s+12, y*s+12, 3, 0, Math.PI*2); ctx.fill(); }
    ctx.fillStyle = '#fb7185'; for (const e of enemies) round(ctx, e.x*s+5, e.y*s+5, 14, 14, 7);
    ctx.fillStyle = '#38bdf8'; round(ctx, player.x*s+4, player.y*s+4, 16, 16, 8);
  }
  function drawRacing(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#1f2937'; round(ctx, 64, 0, 232, H, 18);
    ctx.strokeStyle = '#f8fafc'; ctx.setLineDash([16,14]); ctx.beginPath(); ctx.moveTo(180, 0); ctx.lineTo(180, H); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ef4444'; for (const o of obstacles) round(ctx, o.x, o.y, o.w, o.h, 7);
    ctx.fillStyle = '#38bdf8'; round(ctx, player.x, player.y, 28, 42, 8);
  }
  function drawPlatformer(ctx: CanvasRenderingContext2D): void {
    const platforms = [{ x: 0, y: 328, w: 360, h: 18 }, { x: 62, y: 262, w: 84, h: 12 }, { x: 180, y: 206, w: 86, h: 12 }, { x: 54, y: 146, w: 78, h: 12 }, { x: 224, y: 104, w: 78, h: 12 }];
    ctx.fillStyle = '#64748b'; for (const p of platforms) round(ctx, p.x, p.y, p.w, p.h, 6);
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(270, 82, 12, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#a78bfa'; round(ctx, player.x, player.y, 22, 28, 8);
  }
  function drawBreakout(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#38bdf8'; for (const b of bricks) if (b.alive) round(ctx, b.x, b.y, b.w, b.h, 5);
    ctx.fillStyle = '#e879f9'; round(ctx, player.x, 318, 80, 12, 6);
    ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(ball.x, ball.y, 7, 0, Math.PI*2); ctx.fill();
  }
  function drawOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.fillRect(0,0,W,H);
  }
  function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  }

  onMount(() => {
    highScore = readArcadeScore(highScoreKey(game.id));
    lastScore = readArcadeScore(lastScoreKey(game.id));
    reset();
    window.addEventListener('keydown', onKeydown, { passive: false });
    window.addEventListener('keyup', onKeyup);
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKeydown); window.removeEventListener('keyup', onKeyup); };
  });
</script>

<div class="game-shell" data-game={game.id}>
  <header class="game-head">
    <a href="/secrets/" class="back">{$t('arcade.game.back', { default: '← Voltar à sala' })}</a>
    <div>
      <p class="kicker">{$t('arcade.game.kicker', { default: 'Máquina arcade' })}</p>
      <h1><span aria-hidden="true">{game.icon}</span> {$t(game.titleKey)}</h1>
      <p>{$t(game.descriptionKey)}</p>
    </div>
  </header>

  <section class="score-panel" aria-label={$t('arcade.score.aria', { default: 'Pontuação do jogo' })}>
    <span><small>{$t('arcade.score.current', { default: 'Pontuação' })}</small><strong>{score}</strong></span>
    <span><small>{$t('arcade.score.best', { default: 'Melhor pontuação' })}</small><strong>{highScore}</strong></span>
    <span><small>{$t('arcade.score.last', { default: 'Última' })}</small><strong>{lastScore}</strong></span>
  </section>

  <div class="cabinet">
    <canvas bind:this={canvas} width={W} height={H} aria-label={$t('arcade.game.canvas', { default: 'Área de jogo arcade' })}></canvas>
    <div class="status" aria-live="polite">
      <strong>{$t(messageKey)}</strong>
    </div>
  </div>

  <div class="actions">
    <button type="button" onclick={start}>{$t('arcade.actions.play', { default: 'Jogar' })}</button>
    <button type="button" onclick={pause}>{$t('arcade.actions.pause', { default: 'Pausa' })}</button>
    <button type="button" onclick={reset}>{$t('arcade.actions.restart', { default: 'Recomeçar' })}</button>
  </div>

  <section class="controls" aria-label={$t('arcade.controls.aria', { default: 'Controlos' })}>
    <div class="dpad">
      <button type="button" aria-label={$t('arcade.controls.up', { default: 'Cima' })} onpointerdown={() => setDir('up')}>↑</button>
      <button type="button" aria-label={$t('arcade.controls.left', { default: 'Esquerda' })} onpointerdown={() => setDir('left')}>←</button>
      <button type="button" aria-label={$t('arcade.controls.right', { default: 'Direita' })} onpointerdown={() => setDir('right')}>→</button>
      <button type="button" aria-label={$t('arcade.controls.down', { default: 'Baixo' })} onpointerdown={() => setDir('down')}>↓</button>
    </div>
    <button type="button" class="action" onpointerdown={action}>{$t('arcade.controls.action', { default: 'Acção' })}</button>
    <p>{$t(game.controlsKey)}</p>
  </section>
</div>

<style>
  .game-shell { max-width: 920px; margin: 0 auto; padding: 1rem 1rem 8rem; color: var(--txt, #fff); touch-action: manipulation; }
  .game-head { display: grid; gap: .85rem; margin-bottom: 1rem; }
  .back { color: #bfdbfe; text-decoration: none; font-weight: 850; }
  .kicker { margin: 0; color: #67e8f9; text-transform: uppercase; letter-spacing: .09em; font-size: .72rem; font-weight: 900; }
  h1 { margin: .15rem 0 .35rem; font-size: clamp(2rem, 8vw, 3.3rem); line-height: 1; }
  .game-head p { color: var(--txt2); margin: 0; line-height: 1.5; }
  .score-panel { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: .55rem; margin-bottom: .85rem; }
  .score-panel span { padding: .7rem; border-radius: 1rem; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); }
  .score-panel small, .score-panel strong { display: block; } .score-panel small { color: var(--txt3); font-size: .72rem; } .score-panel strong { font-size: 1.25rem; }
  .cabinet { position: relative; max-width: 480px; margin: 0 auto; padding: .8rem; border: 1px solid rgba(103,232,249,.38); border-radius: 1.5rem; background: radial-gradient(circle at top, rgba(103,232,249,.18), transparent 42%), rgba(0,0,0,.35); box-shadow: 0 24px 60px rgba(0,0,0,.34); }
  canvas { display: block; width: 100%; aspect-ratio: 1; border-radius: 1rem; background: #09111f; image-rendering: pixelated; }
  .status { position: absolute; left: 1.2rem; right: 1.2rem; bottom: 1.2rem; display: flex; justify-content: center; pointer-events: none; }
  .status strong { padding: .45rem .75rem; border-radius: 999px; background: rgba(0,0,0,.62); border: 1px solid rgba(255,255,255,.18); }
  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: .55rem; margin: .85rem 0; }
  button { min-height: 44px; border: 1px solid rgba(255,255,255,.16); border-radius: .9rem; padding: .65rem .9rem; color: white; background: rgba(255,255,255,.09); font-weight: 850; cursor: pointer; }
  button:hover, button:focus-visible { background: rgba(103,232,249,.18); outline: 2px solid rgba(103,232,249,.45); outline-offset: 2px; }
  .controls { display: grid; grid-template-columns: auto 1fr; gap: .85rem; align-items: center; max-width: 560px; margin: 0 auto; padding: .9rem; border-radius: 1rem; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.1); }
  .controls p { grid-column: 1 / -1; margin: 0; color: var(--txt2); }
  .dpad { display: grid; grid-template-columns: repeat(3, 52px); grid-template-rows: repeat(3, 52px); gap: .25rem; }
  .dpad button:nth-child(1) { grid-column: 2; grid-row: 1; } .dpad button:nth-child(2) { grid-column: 1; grid-row: 2; } .dpad button:nth-child(3) { grid-column: 3; grid-row: 2; } .dpad button:nth-child(4) { grid-column: 2; grid-row: 3; }
  .action { min-width: 96px; min-height: 96px; border-radius: 999px; background: linear-gradient(135deg, #fb7185, #a78bfa); }
  @media (max-width: 520px) { .game-shell { padding-inline: .7rem; } .score-panel { grid-template-columns: 1fr 1fr 1fr; } .score-panel span { padding: .55rem; } .controls { grid-template-columns: 1fr; justify-items: center; } .controls p { text-align: center; } }
</style>
