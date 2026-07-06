// Corrida do Presuntinho — endless dodger. Scrolling lane markers sell speed,
// obstacles descend in 4 lanes, difficulty ramps with distance. Steer with
// held left/right (keys, buttons) or drag the pig across the lanes.
import {
  FIELD_W,
  FIELD_H,
  FIELD_SAFE_BOTTOM,
  clamp,
  drawAvatar,
  glowRect,
  paintBackground,
  rectHit,
  rr,
  type ArcadeEngine,
  type ArcadeInput,
  type DrawEnv,
  type StepResult
} from '../engine';

const ROAD_X = 44;
const ROAD_W = FIELD_W - ROAD_X * 2;
const LANES = 4;
const LANE_W = ROAD_W / LANES;
const CAR_W = 34;
const CAR_H = 54;
const ACCENT = '#38bdf8';

interface Obstacle {
  x: number;
  y: number;
  lane: number;
  speed: number;
}

export function createRacing(): ArcadeEngine {
  let carX = 0;
  let points = 0;
  let dist = 0;
  let spawnAcc = 0;
  let scroll = 0;
  let obstacles: Obstacle[] = [];

  function laneCenter(lane: number): number {
    return ROAD_X + lane * LANE_W + LANE_W / 2;
  }

  function reset(): void {
    carX = laneCenter(1);
    points = 0;
    dist = 0;
    spawnAcc = 0;
    scroll = 0;
    obstacles = [];
  }

  function speed(): number {
    return 150 + Math.min(240, dist / 12); // px/s, ramps then caps
  }

  function step(dt: number, input: ArcadeInput): StepResult {
    // steering: pointer drag wins, else held keys/buttons
    if (input.pointerX != null) {
      carX += clamp(input.pointerX - carX, -260 * dt, 260 * dt);
    } else {
      if (input.held.has('left')) carX -= 220 * dt;
      if (input.held.has('right')) carX += 220 * dt;
    }
    carX = clamp(carX, ROAD_X + CAR_W / 2, ROAD_X + ROAD_W - CAR_W / 2);

    const sp = speed();
    dist += sp * dt;
    scroll = (scroll + sp * dt) % 48;
    points = Math.floor(dist / 10);

    spawnAcc += dt;
    const gap = clamp(0.9 - dist / 4000, 0.4, 0.9);
    if (spawnAcc >= gap) {
      spawnAcc = 0;
      const lane = Math.floor(Math.random() * LANES);
      obstacles.push({ x: laneCenter(lane), y: -CAR_H, lane, speed: sp });
    }
    for (const o of obstacles) o.y += (o.speed + 40) * dt;
    obstacles = obstacles.filter((o) => o.y < FIELD_H + CAR_H);

    const carTop = FIELD_H - CAR_H - Math.max(24, FIELD_SAFE_BOTTOM + 12);
    for (const o of obstacles) {
      if (
        rectHit(
          carX - CAR_W / 2 + 4,
          carTop + 4,
          CAR_W - 8,
          CAR_H - 8,
          o.x - CAR_W / 2 + 4,
          o.y + 4,
          CAR_W - 8,
          CAR_H - 8
        )
      ) {
        return { end: 'over', event: 'crash' };
      }
    }
    return {};
  }

  function draw(env: DrawEnv): void {
    const { ctx } = env;
    paintBackground(env, ACCENT);
    // road
    ctx.fillStyle = '#141c2e';
    ctx.fillRect(ROAD_X, 0, ROAD_W, FIELD_H);
    // edges
    ctx.fillStyle = ACCENT + '55';
    ctx.fillRect(ROAD_X - 3, 0, 3, FIELD_H);
    ctx.fillRect(ROAD_X + ROAD_W, 0, 3, FIELD_H);
    // scrolling lane dashes
    ctx.fillStyle = 'rgba(248,250,252,.55)';
    for (let l = 1; l < LANES; l += 1) {
      const x = ROAD_X + l * LANE_W - 2;
      for (let y = -48 + scroll; y < FIELD_H; y += 48) rr(ctx, x, y, 4, 26, 2);
    }
    // obstacles
    for (const o of obstacles)
      glowRect(env, o.x - CAR_W / 2, o.y, CAR_W, CAR_H, 8, '#f43f5e', 12);
    // player car with the chosen mascot at the wheel
    const carTop = FIELD_H - CAR_H - Math.max(24, FIELD_SAFE_BOTTOM + 12);
    glowRect(env, carX - CAR_W / 2, carTop, CAR_W, CAR_H, 9, ACCENT, 16);
    ctx.fillStyle = '#e0f2fe';
    rr(ctx, carX - CAR_W / 2 + 6, carTop + 8, CAR_W - 12, 16, 4);
    drawAvatar(env, carX, carTop + CAR_H * 0.36, CAR_W * 0.82);
  }

  reset();
  return {
    control: 'steer',
    reset,
    step,
    draw,
    score: () => points
  };
}
