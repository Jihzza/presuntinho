// Salto das Nuvens — cute vertical climber. Hop across neon clouds, grab the
// stars for score, reach the crown cloud at the top to win. Coyote-time keeps
// jumps fair. Original theme — no protected characters/assets.
import {
  FIELD_W,
  FIELD_H,
  clamp,
  drawAvatar,
  glowCircle,
  glowRect,
  paintBackground,
  rectHit,
  type ArcadeEngine,
  type ArcadeInput,
  type DrawEnv,
  type StepResult
} from '../engine';

const GRAV = 900;
const MOVE = 150;
const JUMP = 380;
const PW = 22;
const PH = 26;
const ACCENT = '#c084fc';

interface Platform {
  x: number;
  y: number;
  w: number;
}
interface Star {
  x: number;
  y: number;
  got: boolean;
}

// Hand-tuned climb: reachable gaps (~66px rise), goal at the top.
const PLATFORMS: Platform[] = [
  { x: 0, y: 452, w: 360 },
  { x: 40, y: 388, w: 96 },
  { x: 210, y: 356, w: 104 },
  { x: 96, y: 300, w: 96 },
  { x: 236, y: 250, w: 90 },
  { x: 60, y: 210, w: 92 },
  { x: 190, y: 158, w: 96 },
  { x: 70, y: 110, w: 92 },
  { x: 150, y: 58, w: 120 } // goal cloud
];
const STARS: Star[] = [
  { x: 88, y: 360, got: false },
  { x: 262, y: 328, got: false },
  { x: 144, y: 272, got: false },
  { x: 281, y: 222, got: false },
  { x: 106, y: 182, got: false },
  { x: 238, y: 130, got: false },
  { x: 116, y: 82, got: false }
];

export function createPlatformer(): ArcadeEngine {
  let px = 0;
  let py = 0;
  let vy = 0;
  let grounded = false;
  let coyote = 0;
  let points = 0;
  let stars: Star[] = [];

  function reset(): void {
    px = 40;
    py = 452 - PH;
    vy = 0;
    grounded = true;
    coyote = 0;
    points = 0;
    stars = STARS.map((s) => ({ ...s, got: false }));
  }

  function step(dt: number, input: ArcadeInput): StepResult {
    let vx = 0;
    if (input.held.has('left')) vx -= MOVE;
    if (input.held.has('right')) vx += MOVE;
    if (input.pointerX != null) vx = clamp((input.pointerX - (px + PW / 2)) * 6, -MOVE, MOVE);
    px = clamp(px + vx * dt, 0, FIELD_W - PW);

    // jump with coyote-time (grounded within the last 0.1s counts)
    if (input.action && coyote > 0) {
      vy = -JUMP;
      grounded = false;
      coyote = 0;
    }

    vy += GRAV * dt;
    py += vy * dt;

    grounded = false;
    for (const p of PLATFORMS) {
      if (
        vy >= 0 &&
        rectHit(px, py, PW, PH, p.x, p.y, p.w, 12) &&
        py + PH - vy * dt <= p.y + 6
      ) {
        py = p.y - PH;
        vy = 0;
        grounded = true;
      }
    }
    coyote = grounded ? 0.1 : Math.max(0, coyote - dt);

    let gained = 0;
    for (const s of stars) {
      if (!s.got && rectHit(px, py, PW, PH, s.x - 8, s.y - 8, 16, 16)) {
        s.got = true;
        points += 15;
        gained += 15;
      }
    }

    // win at the goal cloud (top platform)
    const goal = PLATFORMS[PLATFORMS.length - 1];
    if (grounded && py + PH <= goal.y + 2 && px + PW / 2 >= goal.x && px + PW / 2 <= goal.x + goal.w) {
      points += 50;
      return { end: 'won', gained: gained + 50 };
    }
    if (py > FIELD_H + 40) return { end: 'over', event: 'crash' };
    return gained ? { gained, event: 'pickup' } : {};
  }

  function draw(env: DrawEnv): void {
    const { ctx, t } = env;
    paintBackground(env, ACCENT);
    // drifting background stars
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    for (let i = 0; i < 22; i += 1) {
      const sx = (i * 53) % FIELD_W;
      const sy = (i * 71 + (env.reduced ? 0 : t * 6)) % FIELD_H;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // clouds
    for (let i = 0; i < PLATFORMS.length; i += 1) {
      const p = PLATFORMS[i];
      const goal = i === PLATFORMS.length - 1;
      glowRect(env, p.x, p.y, p.w, 12, 8, goal ? '#fde68a' : '#7dd3fc', goal ? 18 : 8);
    }
    // stars
    for (const s of stars)
      if (!s.got) glowCircle(env, s.x, s.y, 6, '#fbbf24', 12);
    // player — the chosen mascot
    if (!drawAvatar(env, px + PW / 2, py + PH / 2, PH + 8)) {
      glowRect(env, px, py, PW, PH, 7, '#f9a8d4', 16);
      ctx.fillStyle = '#9d2f63';
      ctx.beginPath();
      ctx.arc(px + PW / 2 - 3, py + PH / 2, 1.6, 0, Math.PI * 2);
      ctx.arc(px + PW / 2 + 3, py + PH / 2, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  reset();
  return {
    control: 'jump',
    reset,
    step,
    draw,
    score: () => points
  };
}
