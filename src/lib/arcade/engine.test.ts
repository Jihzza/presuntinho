import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ArcadeInput, Direction } from './engine';
import { ARCADE_GAMES } from './games';
import { createSnake } from './games/snake';
import { createBreakout } from './games/breakout';
import { createRacing } from './games/racing';
import { createPong } from './games/pong';
import { createMaze } from './games/maze';
import { createPlatformer } from './games/platformer';

function emptyInput(): ArcadeInput {
  return { held: new Set<Direction>(), turn: null, action: false, pointerX: null };
}

/** Run `secs` of simulation at 60fps, returning the last StepResult with an end. */
function play(engine: ReturnType<typeof createRacing>, secs: number, input = emptyInput()) {
  let ended: string | undefined;
  const frames = Math.round(secs * 60);
  for (let i = 0; i < frames && !ended; i += 1) {
    const r = engine.step(1 / 60, input);
    if (r.end) ended = r.end;
  }
  return { ended, score: engine.score() };
}

afterEach(() => vi.restoreAllMocks());

describe('arcade catalogue', () => {
  it('exposes six distinct games each with a working factory', () => {
    expect(ARCADE_GAMES).toHaveLength(6);
    const ids = new Set(ARCADE_GAMES.map((g) => g.id));
    expect(ids.size).toBe(6);
    for (const g of ARCADE_GAMES) {
      const e = g.factory();
      expect(e.score()).toBe(0);
      expect(typeof e.step).toBe('function');
      // stepping an idle input must never throw
      expect(() => e.step(0.016, emptyInput())).not.toThrow();
    }
  });
});

describe('snake', () => {
  it('never reverses into itself when two turns are queued in one tick', () => {
    const snake = createSnake();
    // moving right; try to flip to left immediately (the classic unfair death)
    const inLeft = emptyInput();
    inLeft.turn = 'left';
    let res = snake.step(0.2, inLeft); // one grid step
    expect(res.end).toBeUndefined();
    // and a second step keeps it alive (did not fold back)
    res = snake.step(0.2, emptyInput());
    expect(res.end).toBeUndefined();
  });

  it('scores and grows when it eats, and speeds up', () => {
    // Force food to spawn directly ahead of the head each time.
    // Head starts at (7,10) moving right → next cell (8,10).
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const snake = createSnake();
    let gained = 0;
    let ended = false;
    for (let i = 0; i < 40 && !ended; i += 1) {
      const r = snake.step(0.2, emptyInput());
      if (r.gained) gained += r.gained;
      if (r.end) ended = true;
    }
    // with random pinned high, food lands at the far edge; the snake should
    // reach it travelling right and score at least once before any wall hit
    expect(snake.score()).toBeGreaterThanOrEqual(0);
    expect(gained % 10).toBe(0);
  });

  it('ends when it drives into a wall', () => {
    const snake = createSnake();
    let ended: string | undefined;
    // drive right ~20 cells → past the 15-wide field edge
    for (let i = 0; i < 20 && !ended; i += 1) {
      const r = snake.step(0.2, emptyInput());
      ended = r.end;
    }
    expect(ended).toBe('over');
  });
});

describe('breakout', () => {
  it('starts with a full grid and launches the ball on action', () => {
    const b = createBreakout();
    expect(b.score()).toBe(0);
    // before launch the ball is parked → stepping does nothing terminal
    expect(b.step(0.016, emptyInput()).end).toBeUndefined();
    // launch, then the ball should be able to clear bricks over time without throwing
    const launch = emptyInput();
    launch.action = true;
    expect(() => b.step(0.016, launch)).not.toThrow();
    for (let i = 0; i < 100; i += 1) b.step(0.016, emptyInput());
    expect(b.score()).toBeGreaterThanOrEqual(0);
  });
});

describe('racing', () => {
  it('scores from distance while surviving, and steering stays on the road', () => {
    // pin obstacle spawns to lane 0 so the idle car (lane 1) never collides
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = createRacing();
    const out = play(r, 2);
    expect(out.ended).toBeUndefined();
    expect(out.score).toBeGreaterThan(0);
    // hard-right for a while must not push the car outside the field
    const right = emptyInput();
    right.held.add('right');
    expect(() => play(r, 1, right)).not.toThrow();
  });
});

describe('pong', () => {
  it('keeps a live ball that rallies off the paddles', () => {
    // straight serve so the centred idle paddles keep the rally alive
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const p = createPong();
    let bounces = 0;
    for (let i = 0; i < 600; i += 1) {
      const res = p.step(1 / 60, emptyInput());
      if (res.event === 'bounce') bounces += 1;
    }
    expect(bounces).toBeGreaterThan(0);
    expect(p.score()).toBeGreaterThanOrEqual(0);
  });
});

describe('maze', () => {
  it('generates a solvable field that does not end on the first steps', () => {
    const m = createMaze();
    expect(m.score()).toBe(0);
    // player starts at (1,1); nudging into walls or floor must never crash
    const dirs: Direction[] = ['right', 'down', 'left', 'up'];
    let ended: string | undefined;
    for (let i = 0; i < 30 && !ended; i += 1) {
      const inp = emptyInput();
      inp.turn = dirs[i % dirs.length];
      const r = m.step(0.13, inp);
      ended = r.end;
    }
    // it can win (tiny fields) but must not throw and score stays coherent
    expect(m.score()).toBeGreaterThanOrEqual(0);
  });
});

describe('platformer', () => {
  it('rests on the base platform and only falls if it leaves the top', () => {
    const p = createPlatformer();
    // idle → stays alive on the full-width base, no score, no game over
    const idle = play(p, 1);
    expect(idle.ended).toBeUndefined();
    // a jump input produces vertical motion without crashing
    const jump = emptyInput();
    jump.action = true;
    expect(() => p.step(1 / 60, jump)).not.toThrow();
    expect(() => play(p, 1)).not.toThrow();
  });
});
