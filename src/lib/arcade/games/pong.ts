// Duelo de Néon — a one-on-one against the house droid. You defend the bottom,
// the droid defends the top; paddle-angle physics keep rallies alive. First to
// 7 wins; the droid getting there first ends the round. Score = your points ×
// a rally bonus, so long rallies pay off. Original theme.
import {
  FIELD_W,
  FIELD_H,
  FIELD_SAFE_TOP,
  FIELD_SAFE_BOTTOM,
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

const PADDLE_W = 74;
const PADDLE_H = 12;
const BALL_R = 7;

// Paddle Y positions keep clear of the floating HUD (top) and the corner touch
// controls (bottom) so neither paddle is ever hidden behind the chrome.
function cpuY(): number {
  return FIELD_SAFE_TOP;
}
function playerY(): number {
  return FIELD_H - FIELD_SAFE_BOTTOM - PADDLE_H;
}
const TARGET = 7;
const ACCENT = '#f472b6';

export function createPong(): ArcadeEngine {
  let playerX = 0;
  let cpuX = 0;
  let ball = { x: 0, y: 0, vx: 0, vy: 0 };
  let playerPts = 0;
  let cpuPts = 0;
  let rally = 0;
  let points = 0;
  let serveDelay = 0;

  function serve(toPlayer: boolean): void {
    playerX = FIELD_W / 2;
    cpuX = FIELD_W / 2;
    ball = { x: FIELD_W / 2, y: FIELD_H / 2, vx: 0, vy: 0 };
    rally = 0;
    serveDelay = 0.7;
    ball.vx = (Math.random() * 2 - 1) * 90;
    ball.vy = (toPlayer ? 1 : -1) * 220;
  }

  function reset(): void {
    playerPts = 0;
    cpuPts = 0;
    points = 0;
    serve(Math.random() < 0.5);
  }

  function score(): number {
    return points;
  }

  function step(dt: number, input: ArcadeInput): StepResult {
    // player paddle
    if (input.pointerX != null) playerX = input.pointerX;
    else {
      if (input.held.has('left')) playerX -= 320 * dt;
      if (input.held.has('right')) playerX += 320 * dt;
    }
    playerX = clamp(playerX, PADDLE_W / 2, FIELD_W - PADDLE_W / 2);

    // cpu tracks the ball with a capped speed (beatable)
    const cpuSpeed = 190 + Math.min(90, rally * 10);
    cpuX += clamp(ball.x - cpuX, -cpuSpeed * dt, cpuSpeed * dt);
    cpuX = clamp(cpuX, PADDLE_W / 2, FIELD_W - PADDLE_W / 2);

    if (serveDelay > 0) {
      // action (tap / launch button / space) serves immediately
      if (input.action) serveDelay = 0;
      else {
        serveDelay -= dt;
        return {};
      }
    }

    let result: StepResult = {};
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
      const pY = playerY();
      const cY = cpuY();
      // player paddle (ball moving down)
      if (
        ball.vy > 0 &&
        ball.y + BALL_R >= pY &&
        ball.y - BALL_R <= pY + PADDLE_H &&
        ball.x >= playerX - PADDLE_W / 2 &&
        ball.x <= playerX + PADDLE_W / 2
      ) {
        const rel = (ball.x - playerX) / (PADDLE_W / 2);
        const sp = Math.min(300 + rally * 8, 440);
        const ang = -Math.PI / 2 + rel * (Math.PI / 3.2);
        ball.vx = Math.cos(ang) * sp;
        ball.vy = -Math.abs(Math.sin(ang) * sp);
        ball.y = pY - BALL_R - 1;
        rally += 1;
        result = { event: 'bounce' };
      }
      // cpu paddle (ball moving up)
      if (
        ball.vy < 0 &&
        ball.y - BALL_R <= cY + PADDLE_H &&
        ball.y + BALL_R >= cY &&
        ball.x >= cpuX - PADDLE_W / 2 &&
        ball.x <= cpuX + PADDLE_W / 2
      ) {
        const rel = (ball.x - cpuX) / (PADDLE_W / 2);
        const sp = Math.min(300 + rally * 8, 440);
        const ang = Math.PI / 2 + rel * (Math.PI / 3.2);
        ball.vx = -Math.cos(ang) * sp;
        ball.vy = Math.abs(Math.sin(ang) * sp);
        ball.y = cY + PADDLE_H + BALL_R + 1;
        rally += 1;
        result = { event: 'bounce' };
      }
      // point scored
      if (ball.y > FIELD_H + BALL_R) {
        cpuPts += 1;
        if (cpuPts >= TARGET) return { end: 'over', event: 'crash' };
        serve(false);
        return { event: 'crash' };
      }
      if (ball.y < -BALL_R) {
        playerPts += 1;
        points += 10 + Math.min(40, rally * 3); // rally bonus
        if (playerPts >= TARGET) return { end: 'won', gained: 10, event: 'pickup' };
        serve(true);
        return { gained: 10, event: 'pickup' };
      }
    }
    return result;
  }

  function draw(env: DrawEnv): void {
    const { ctx } = env;
    paintBackground(env, ACCENT);
    // centre net
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(0, FIELD_H / 2);
    ctx.lineTo(FIELD_W, FIELD_H / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // scores
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(cpuPts), FIELD_W / 2, FIELD_H / 2 - 16);
    ctx.fillText(String(playerPts), FIELD_W / 2, FIELD_H / 2 + 32);
    ctx.textAlign = 'start';
    // paddles — the player's is the chosen mascot
    glowRect(env, cpuX - PADDLE_W / 2, cpuY(), PADDLE_W, PADDLE_H, 6, '#fb7185', 12);
    const pY = playerY();
    glowRect(env, playerX - PADDLE_W / 2, pY, PADDLE_W, PADDLE_H, 6, ACCENT, 14);
    // Keep the mascot within the paddle bounds so it doesn't overhang into the
    // bottom control band (the paddle itself already clears it via playerY()).
    drawAvatar(env, playerX, pY + PADDLE_H / 2, PADDLE_H);
    // ball
    glowCircle(env, ball.x, ball.y, BALL_R, '#fde68a', 14);
  }

  reset();
  return {
    control: 'paddle',
    reset,
    step,
    draw,
    score
  };
}
