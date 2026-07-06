// Snake 1v1 — pure, deterministic simulation for the head-to-head duel.
//
// Two snakes share ONE grid and compete for the same food. The rule the design
// asks for: if your head reaches a segment of the OTHER snake's body, you STEAL
// a point and bite its tail off from that segment (it shrinks; you keep going).
// Hitting a wall, your own body, or a head-on collision kills you — and a death
// ends the round in the survivor's favour.
//
// This module is transport-agnostic ON PURPOSE. In the netcode the HOST runs
// this sim authoritatively and broadcasts `state()`; the guest just renders the
// snapshot and sends its turns back. Keeping the rules here (with no canvas, no
// network, no timers) makes them unit-testable and desync-proof.

import type { Direction } from '../engine';
import { isOpposite } from '../engine';

export type PlayerId = 0 | 1;

export interface VCell {
  x: number;
  y: number;
}

export interface SnakeState {
  body: VCell[]; // body[0] is the head
  dir: Direction;
  alive: boolean;
  score: number;
}

export interface VersusState {
  cols: number;
  rows: number;
  snakes: [SnakeState, SnakeState];
  food: VCell;
  tick: number;
  /** null while playing; the winner (or 'draw') once the round ends. */
  result: PlayerId | 'draw' | null;
}

export type VersusEvent =
  | { type: 'food'; player: PlayerId }
  | { type: 'steal'; by: PlayerId; from: PlayerId; at: VCell }
  | { type: 'death'; player: PlayerId; cause: 'wall' | 'self' | 'headon' }
  | { type: 'result'; winner: PlayerId | 'draw' };

/** Deterministic RNG (mulberry32) so food placement is reproducible in tests
 *  and identical on both peers if they ever replay from the same seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FOOD_POINTS = 1;
const STEAL_POINTS = 1;

export class SnakeVersusSim {
  readonly cols: number;
  readonly rows: number;
  private rng: () => number;
  private snakes: [SnakeState, SnakeState];
  private queues: [Direction[], Direction[]] = [[], []];
  private food: VCell = { x: 0, y: 0 };
  private tick = 0;
  private result: PlayerId | 'draw' | null = null;

  constructor(cols: number, rows: number, seed = 1) {
    this.cols = cols;
    this.rows = rows;
    this.rng = mulberry32(seed);
    // Player 0 starts left-facing-right, player 1 right-facing-left.
    const midY = Math.floor(rows / 2);
    this.snakes = [
      { body: this.line(3, 3, midY, 'right'), dir: 'right', alive: true, score: 0 },
      { body: this.line(3, cols - 4, midY, 'left'), dir: 'left', alive: true, score: 0 }
    ];
    this.placeFood();
  }

  private line(len: number, headX: number, y: number, dir: Direction): VCell[] {
    const body: VCell[] = [];
    const dx = dir === 'right' ? -1 : dir === 'left' ? 1 : 0;
    const dy = dir === 'down' ? -1 : dir === 'up' ? 1 : 0;
    for (let i = 0; i < len; i += 1) body.push({ x: headX + dx * i, y: y + dy * i });
    return body;
  }

  private occupied(cell: VCell): boolean {
    return this.snakes.some((s) => s.body.some((c) => c.x === cell.x && c.y === cell.y));
  }

  private placeFood(): void {
    // Bounded attempts; fall back to first free scan so a near-full board can't
    // spin forever.
    for (let i = 0; i < 200; i += 1) {
      const cell = { x: Math.floor(this.rng() * this.cols), y: Math.floor(this.rng() * this.rows) };
      if (!this.occupied(cell)) {
        this.food = cell;
        return;
      }
    }
    for (let y = 0; y < this.rows; y += 1)
      for (let x = 0; x < this.cols; x += 1)
        if (!this.occupied({ x, y })) {
          this.food = { x, y };
          return;
        }
  }

  /** Queue a turn for a player (rejects reversals + same-dir, caps the buffer). */
  setTurn(p: PlayerId, turn: Direction): void {
    if (this.result !== null) return;
    const q = this.queues[p];
    const ref = q.length ? q[q.length - 1] : this.snakes[p].dir;
    if (turn === ref || isOpposite(turn, ref)) return;
    if (q.length < 2) q.push(turn);
  }

  private nextHead(s: SnakeState): VCell {
    const h = s.body[0];
    if (s.dir === 'up') return { x: h.x, y: h.y - 1 };
    if (s.dir === 'down') return { x: h.x, y: h.y + 1 };
    if (s.dir === 'left') return { x: h.x - 1, y: h.y };
    return { x: h.x + 1, y: h.y };
  }

  private outOfBounds(c: VCell): boolean {
    return c.x < 0 || c.y < 0 || c.x >= this.cols || c.y >= this.rows;
  }

  /**
   * Advance the whole board by one grid step. Returns the events that happened
   * this tick (for sfx/haptics on the shell). Idempotent once the round is over.
   */
  advance(): VersusEvent[] {
    const events: VersusEvent[] = [];
    if (this.result !== null) return events;
    this.tick += 1;

    // 1) commit queued turns
    for (const p of [0, 1] as PlayerId[]) {
      const s = this.snakes[p];
      if (!s.alive) continue;
      const q = this.queues[p];
      if (q.length) s.dir = q.shift() as Direction;
    }

    // 2) compute intended heads for the alive snakes
    const heads: (VCell | null)[] = this.snakes.map((s) => (s.alive ? this.nextHead(s) : null));

    // 3) wall + self death (evaluate against CURRENT bodies)
    const dead: Record<number, 'wall' | 'self' | 'headon'> = {};
    for (const p of [0, 1] as PlayerId[]) {
      const h = heads[p];
      if (!h) continue;
      if (this.outOfBounds(h)) dead[p] = 'wall';
      // Exclude the vacating tail: it moves away this tick, so entering that cell
      // is legal. (Food never spawns on a snake, so this never coincides with
      // growth, where the tail would stay.)
      else if (this.snakes[p].body.slice(0, -1).some((c) => c.x === h.x && c.y === h.y)) dead[p] = 'self';
    }

    // 4) head-on: both heads target the same cell (or swap places) → both die
    const h0 = heads[0];
    const h1 = heads[1];
    if (h0 && h1) {
      const sameCell = h0.x === h1.x && h0.y === h1.y;
      const swap =
        h0.x === this.snakes[1].body[0].x &&
        h0.y === this.snakes[1].body[0].y &&
        h1.x === this.snakes[0].body[0].x &&
        h1.y === this.snakes[0].body[0].y;
      if (sameCell || swap) {
        dead[0] = dead[0] ?? 'headon';
        dead[1] = dead[1] ?? 'headon';
      }
    }

    // 5) steal: a head entering the OTHER snake's body (segment index >= 1) bites
    //    the tail off there and steals a point. Done before growth so the victim
    //    shrinks this tick. A snake already dying this tick can't steal.
    for (const p of [0, 1] as PlayerId[]) {
      const o = (1 - p) as PlayerId;
      const h = heads[p];
      if (!h || dead[p]) continue;
      const victim = this.snakes[o];
      if (!victim.alive) continue;
      const idx = victim.body.findIndex((c, i) => i >= 1 && c.x === h.x && c.y === h.y);
      if (idx >= 1) {
        victim.body = victim.body.slice(0, idx); // bite off the tail from the hit segment
        victim.score = Math.max(0, victim.score - STEAL_POINTS);
        this.snakes[p].score += STEAL_POINTS;
        events.push({ type: 'steal', by: p, from: o, at: { x: h.x, y: h.y } });
      }
    }

    // 6) apply deaths
    for (const p of [0, 1] as PlayerId[]) {
      if (dead[p] && this.snakes[p].alive) {
        this.snakes[p].alive = false;
        events.push({ type: 'death', player: p, cause: dead[p] });
      }
    }

    // 7) move the survivors: unshift head, eat-or-pop
    let ate = false;
    for (const p of [0, 1] as PlayerId[]) {
      const s = this.snakes[p];
      if (!s.alive) continue;
      const h = heads[p]!;
      s.body.unshift(h);
      if (h.x === this.food.x && h.y === this.food.y) {
        s.score += FOOD_POINTS;
        ate = true;
        events.push({ type: 'food', player: p });
      } else {
        s.body.pop();
      }
    }
    if (ate) this.placeFood();

    // 8) resolve the round if anyone died
    const aliveCount = this.snakes.filter((s) => s.alive).length;
    if (aliveCount < 2) {
      let winner: PlayerId | 'draw';
      if (aliveCount === 1) winner = this.snakes[0].alive ? 0 : 1;
      else {
        // both died same tick → higher score wins, else draw
        const [a, b] = this.snakes;
        winner = a.score > b.score ? 0 : b.score > a.score ? 1 : 'draw';
      }
      this.result = winner;
      events.push({ type: 'result', winner });
    }
    return events;
  }

  state(): VersusState {
    return {
      cols: this.cols,
      rows: this.rows,
      snakes: [this.cloneSnake(0), this.cloneSnake(1)],
      food: { ...this.food },
      tick: this.tick,
      result: this.result
    };
  }

  private cloneSnake(p: PlayerId): SnakeState {
    const s = this.snakes[p];
    return { body: s.body.map((c) => ({ ...c })), dir: s.dir, alive: s.alive, score: s.score };
  }

  /** Guest side: replace local state with the host's authoritative snapshot. */
  load(s: VersusState): void {
    this.snakes = [
      { ...s.snakes[0], body: s.snakes[0].body.map((c) => ({ ...c })) },
      { ...s.snakes[1], body: s.snakes[1].body.map((c) => ({ ...c })) }
    ];
    this.food = { ...s.food };
    this.tick = s.tick;
    this.result = s.result;
  }

  get finished(): boolean {
    return this.result !== null;
  }
  get winner(): PlayerId | 'draw' | null {
    return this.result;
  }
  scores(): [number, number] {
    return [this.snakes[0].score, this.snakes[1].score];
  }
}
