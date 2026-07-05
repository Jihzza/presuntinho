// Cristais de Néon — breakout with real paddle-angle physics: where the ball
// hits the paddle steers its bounce, so it never gets stuck in a flat loop.
// Drag the paddle (or hold left/right). Press action to launch. Clear the
// crystals to win; three balls before game over.
import {
  FIELD_W,
  FIELD_H,
  clamp,
  drawAvatar,
  glowCircle,
  glowRect,
  paintBackground,
  type ArcadeEngine,
  type ArcadeInput,
  type DrawEnv,
  type StepResult
} from '../engine';

const PADDLE_W = 78;
const PADDLE_H = 12;
const PADDLE_Y = FIELD_H - 40;
const BALL_R = 7;
const COLS = 7;
const ROWS = 5;
const BRICK_W = 42;
const BRICK_H = 16;
const GAP = 6;
const GRID_X = (FIELD_W - (COLS * BRICK_W + (COLS - 1) * GAP)) / 2;
const ACCENT = '#22d3ee';
const BRICK_COLORS = ['#f472b6', '#c084fc', '#38bdf8', '#34d399', '#fbbf24'];

interface Brick {
  x: number;
  y: number;
  alive: boolean;
  color: string;
}

export function createBreakout(): ArcadeEngine {
  let paddleX = 0;
  let ball = { x: 0, y: 0, vx: 0, vy: 0 };
  let launched = false;
  let lives = 3;
  let points = 0;
  let bricks: Brick[] = [];
  let baseSpeed = 240;

  function resetBall(): void {
    paddleX = FIELD_W / 2;
    ball = { x: FIELD_W / 2, y: PADDLE_Y - BALL_R - 2, vx: 0, vy: 0 };
    launched = false;
  }

  function reset(): void {
    lives = 3;
    points = 0;
    baseSpeed = 240;
    bricks = [];
    for (let r = 0; r < ROWS; r += 1)
      for (let c = 0; c < COLS; c += 1)
        bricks.push({
          x: GRID_X + c * (BRICK_W + GAP),
          y: 60 + r * (BRICK_H + GAP),
          alive: true,
          color: BRICK_COLORS[r % BRICK_COLORS.length]
        });
    resetBall();
  }

  function launch(): void {
    if (launched) return;
    launched = true;
    const angle = (-Math.PI / 2) + (Math.random() * 0.5 - 0.25);
    ball.vx = Math.cos(angle) * baseSpeed;
    ball.vy = Math.sin(angle) * baseSpeed;
  }

  function step(dt: number, input: ArcadeInput): StepResult {
    // paddle
    if (input.pointerX != null) paddleX = input.pointerX;
    else {
      if (input.held.has('left')) paddleX -= 300 * dt;
      if (input.held.has('right')) paddleX += 300 * dt;
    }
    paddleX = clamp(paddleX, PADDLE_W / 2, FIELD_W - PADDLE_W / 2);

    if (!launched) {
      ball.x = paddleX;
      if (input.action) launch();
      return {};
    }

    let result: StepResult = {};
    // integrate in small sub-steps so fast balls don't tunnel bricks
    const steps = 3;
    const sdt = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      ball.x += ball.vx * sdt;
      ball.y += ball.vy * sdt;
      if (ball.x < BALL_R) {
        ball.x = BALL_R;
        ball.vx = Math.abs(ball.vx);
      }
      if (ball.x > FIELD_W - BALL_R) {
        ball.x = FIELD_W - BALL_R;
        ball.vx = -Math.abs(ball.vx);
      }
      if (ball.y < BALL_R) {
        ball.y = BALL_R;
        ball.vy = Math.abs(ball.vy);
      }
      // paddle
      if (
        ball.vy > 0 &&
        ball.y + BALL_R >= PADDLE_Y &&
        ball.y - BALL_R <= PADDLE_Y + PADDLE_H &&
        ball.x >= paddleX - PADDLE_W / 2 &&
        ball.x <= paddleX + PADDLE_W / 2
      ) {
        const rel = (ball.x - paddleX) / (PADDLE_W / 2); // -1..1
        const angle = -Math.PI / 2 + rel * (Math.PI / 3); // steer ±60°
        const sp = Math.min(baseSpeed + 40, 420);
        ball.vx = Math.cos(angle) * sp;
        ball.vy = Math.sin(angle) * sp;
        ball.y = PADDLE_Y - BALL_R - 1;
        result = { event: 'bounce' };
      }
      // bricks
      for (const b of bricks) {
        if (!b.alive) continue;
        if (
          ball.x + BALL_R > b.x &&
          ball.x - BALL_R < b.x + BRICK_W &&
          ball.y + BALL_R > b.y &&
          ball.y - BALL_R < b.y + BRICK_H
        ) {
          b.alive = false;
          points += 10;
          baseSpeed = Math.min(360, baseSpeed + 4);
          // bounce off the shorter overlap axis
          const overlapX = Math.min(ball.x + BALL_R - b.x, b.x + BRICK_W - (ball.x - BALL_R));
          const overlapY = Math.min(ball.y + BALL_R - b.y, b.y + BRICK_H - (ball.y - BALL_R));
          if (overlapX < overlapY) ball.vx *= -1;
          else ball.vy *= -1;
          result = { gained: 10, event: 'pickup' };
          break;
        }
      }
      if (bricks.every((b) => !b.alive)) return { end: 'won', gained: result.gained };
      if (ball.y > FIELD_H + BALL_R) {
        lives -= 1;
        if (lives <= 0) return { end: 'over', event: 'crash' };
        resetBall();
        return { event: 'crash' };
      }
    }
    return result;
  }

  function draw(env: DrawEnv): void {
    const { ctx } = env;
    paintBackground(env, ACCENT);
    // bricks
    for (const b of bricks) if (b.alive) glowRect(env, b.x, b.y, BRICK_W, BRICK_H, 4, b.color, 8);
    // paddle with the chosen mascot riding it
    glowRect(env, paddleX - PADDLE_W / 2, PADDLE_Y, PADDLE_W, PADDLE_H, 6, ACCENT, 14);
    drawAvatar(env, paddleX, PADDLE_Y + PADDLE_H / 2, PADDLE_H + 8);
    // ball
    glowCircle(env, ball.x, ball.y, BALL_R, '#fde68a', 14);
    // lives
    ctx.fillStyle = '#f9a8d4';
    for (let i = 0; i < lives; i += 1) {
      ctx.beginPath();
      ctx.arc(14 + i * 16, FIELD_H - 14, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  reset();
  return {
    control: 'paddle',
    reset,
    step,
    draw,
    score: () => points
  };
}
