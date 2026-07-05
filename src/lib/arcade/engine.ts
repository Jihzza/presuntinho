// ─────────────────────────────────────────────────────────────────────────────
// Arcade engine contract (V11) — every game is a self-contained factory that
// returns an ArcadeEngine. The shell (ArcadeGame.svelte) owns the canvas, the
// RAF loop, input collection (keyboard + swipe + on-screen controls), scoring
// UI, sound/haptic/confetti feedback and the result overlay. Games own ONLY
// their state, their step() logic and their draw().
//
// Logical width is a fixed 360; logical HEIGHT is RESPONSIVE — the shell calls
// setViewport() with the real canvas box so FIELD_H matches the screen's aspect
// ratio. That lets a full-width canvas fill the whole screen edge-to-edge (no
// letterbox, no distortion) while every HORIZONTAL layout stays put at 360.
// Engines that use FIELD_H must read it live (or recompute in reset()) — never
// capture it in a module-level const.
// ─────────────────────────────────────────────────────────────────────────────

export type Direction = 'up' | 'down' | 'left' | 'right';
export type EndState = 'won' | 'over';

/** Logical playfield width — fixed, so horizontal layouts never shift. */
export const FIELD_W = 360;
/** Logical playfield height — RESPONSIVE (set by the shell). Read this live. */
export let FIELD_H = 480;

/**
 * Set the logical field height from the real canvas box so the aspect ratio
 * matches the screen. FIELD_W stays 360; FIELD_H = 360 × (h / w), clamped to a
 * sane portrait-ish range so wide/short viewports stay playable. Returns the
 * new FIELD_H so the shell can size the canvas bitmap to match.
 */
export function setViewport(cssW: number, cssH: number): number {
  if (cssW > 0 && cssH > 0) {
    FIELD_H = Math.min(1000, Math.max(480, Math.round((FIELD_W * cssH) / cssW)));
  }
  return FIELD_H;
}

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
  /** The player's chosen mascot as an emoji, drawn as the player avatar. */
  avatar?: string | null;
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

/**
 * Draw the player's mascot emoji centred at (x, y) at `size` px. Returns true
 * when it drew (an avatar was set) so engines can skip their fallback shape.
 */
export function drawAvatar(env: DrawEnv, x: number, y: number, size: number): boolean {
  if (!env.avatar) return false;
  const { ctx } = env;
  ctx.save();
  ctx.font = `${Math.round(size)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(env.avatar, x, y);
  ctx.restore();
  return true;
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
