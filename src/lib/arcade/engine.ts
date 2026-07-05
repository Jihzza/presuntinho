// ─────────────────────────────────────────────────────────────────────────────
// Arcade engine contract (V11) — every game is a self-contained factory that
// returns an ArcadeEngine. The shell (ArcadeGame.svelte) owns the canvas, the
// RAF loop, input collection (keyboard + swipe + on-screen controls), scoring
// UI, sound/haptic/confetti feedback and the result overlay. Games own ONLY
// their state, their step() logic and their draw().
//
// Logical resolution is a portrait 360×480 playfield; the shell scales the
// canvas to the device pixel ratio and letterboxes to keep the aspect ratio.
// ─────────────────────────────────────────────────────────────────────────────

export type Direction = 'up' | 'down' | 'left' | 'right';
export type EndState = 'won' | 'over';

/** Logical playfield size shared by every engine. */
export const FIELD_W = 360;
export const FIELD_H = 480;

/** Snapshot of player input for one step. Owned/cleared by the shell. */
export interface ArcadeInput {
  /** Continuously held directions (steer / paddle / walk). */
  held: Set<Direction>;
  /** One-shot discrete turn this step (snake/maze). Cleared after each step. */
  turn: Direction | null;
  /** Action pressed this step (jump / launch). Cleared after each step. */
  action: boolean;
  /** Absolute pointer X on the playfield (0..FIELD_W) while dragging, else null. */
  pointerX: number | null;
}

export interface DrawEnv {
  ctx: CanvasRenderingContext2D;
  /** Elapsed seconds since mount — for idle shimmer/animations. */
  t: number;
  /** Honour prefers-reduced-motion (skip heavy glow/particle work). */
  reduced: boolean;
}

export interface StepResult {
  /** Set when the round finishes. */
  end?: EndState;
  /** Points gained THIS step — the shell turns >0 into a blip + haptic tick. */
  gained?: number;
  /** Flavour of what happened, so the shell can pick a sound. */
  event?: 'pickup' | 'bounce' | 'crash';
}

/** Which on-screen control cluster the shell renders for a game. */
export type ControlScheme = 'turn' | 'steer' | 'jump' | 'paddle';

export interface ArcadeEngine {
  readonly control: ControlScheme;
  /** (Re)initialise all state for a fresh round. */
  reset(): void;
  /** Advance the simulation by dt seconds using the given input. */
  step(dt: number, input: ArcadeInput): StepResult;
  /** Render the current state. Called every frame, even when paused. */
  draw(env: DrawEnv): void;
  /** Current score (read by the shell for the HUD). */
  score(): number;
}

// ── shared drawing helpers ───────────────────────────────────────────────────

/** Rounded-rect fill, with a manual-path fallback for engines/WebViews that
 *  predate CanvasRenderingContext2D.roundRect (e.g. iOS Safari < 16). */
export function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
  ctx.fill();
}

/** Fill with a soft neon glow (skipped under reduced motion for perf). */
export function glowRect(
  env: DrawEnv,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
  blur = 14
): void {
  const { ctx, reduced } = env;
  ctx.save();
  ctx.fillStyle = color;
  if (!reduced) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
  }
  rr(ctx, x, y, w, h, r);
  ctx.restore();
}

export function glowCircle(
  env: DrawEnv,
  x: number,
  y: number,
  radius: number,
  color: string,
  blur = 14
): void {
  const { ctx, reduced } = env;
  ctx.save();
  ctx.fillStyle = color;
  if (!reduced) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
  }
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Deep-space background gradient every game shares. */
export function paintBackground(env: DrawEnv, accent: string): void {
  const { ctx } = env;
  const g = ctx.createLinearGradient(0, 0, 0, FIELD_H);
  g.addColorStop(0, '#0a1120');
  g.addColorStop(1, '#0d0a1f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  // faint accent vignette top-left
  const rad = ctx.createRadialGradient(60, 40, 10, 60, 40, 320);
  rad.addColorStop(0, accent + '22');
  rad.addColorStop(1, 'transparent');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function rectHit(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** Opposite-direction test — used to reject illegal snake/maze reversals. */
export function isOpposite(a: Direction, b: Direction): boolean {
  return (
    (a === 'up' && b === 'down') ||
    (a === 'down' && b === 'up') ||
    (a === 'left' && b === 'right') ||
    (a === 'right' && b === 'left')
  );
}
