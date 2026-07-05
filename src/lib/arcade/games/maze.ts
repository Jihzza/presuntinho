// Labirinto das Estrelas — a freshly GENERATED maze each round (recursive
// backtracker) so it always fills the field and never repeats. Collect every
// star, dodge the neon guardians. Original theme — no protected characters.
import {
  FIELD_W,
  FIELD_H,
  glowCircle,
  glowRect,
  paintBackground,
  rr,
  type ArcadeEngine,
  type ArcadeInput,
  type Direction,
  type DrawEnv,
  type StepResult
} from '../engine';

const COLS = 15; // odd → clean walls on both edges
const ROWS = 19;
const CELL = FIELD_W / COLS; // 24
const OFFY = (FIELD_H - ROWS * CELL) / 2; // vertical centering
const ACCENT = '#a78bfa';

interface Cell {
  x: number;
  y: number;
}
interface Guardian extends Cell {
  dir: Direction;
}

export function createMaze(): ArcadeEngine {
  let wall: boolean[][] = [];
  let stars: Set<string> = new Set();
  let player: Cell = { x: 1, y: 1 };
  let want: Direction | null = null;
  const guardians: Guardian[] = [];
  let points = 0;
  let acc = 0;
  let gacc = 0;
  let totalStars = 0;

  function key(x: number, y: number): string {
    return `${x},${y}`;
  }

  function generate(): void {
    // start solid, carve passages on odd cells
    wall = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => true));
    const stack: Cell[] = [{ x: 1, y: 1 }];
    wall[1][1] = false;
    const dirs = [
      { dx: 0, dy: -2 },
      { dx: 0, dy: 2 },
      { dx: -2, dy: 0 },
      { dx: 2, dy: 0 }
    ];
    while (stack.length) {
      const c = stack[stack.length - 1];
      const options = dirs.filter(
        (d) =>
          c.x + d.dx > 0 &&
          c.x + d.dx < COLS - 1 &&
          c.y + d.dy > 0 &&
          c.y + d.dy < ROWS - 1 &&
          wall[c.y + d.dy][c.x + d.dx]
      );
      if (!options.length) {
        stack.pop();
        continue;
      }
      const d = options[Math.floor(Math.random() * options.length)];
      wall[c.y + d.dy / 2][c.x + d.dx / 2] = false;
      wall[c.y + d.dy][c.x + d.dx] = false;
      stack.push({ x: c.x + d.dx, y: c.y + d.dy });
    }
    // knock out a few extra walls so it isn't a perfect maze (more open, kinder)
    for (let i = 0; i < 16; i += 1) {
      const x = 1 + Math.floor(Math.random() * (COLS - 2));
      const y = 1 + Math.floor(Math.random() * (ROWS - 2));
      wall[y][x] = false;
    }
  }

  function isWall(x: number, y: number): boolean {
    return x < 0 || y < 0 || x >= COLS || y >= ROWS || wall[y][x];
  }

  /** Cells reachable from the start — guarantees no star is ever stranded
   *  (the extra-wall knockouts above could otherwise open isolated islands). */
  function reachableFromStart(): Set<string> {
    const seen = new Set<string>([key(1, 1)]);
    const queue: Cell[] = [{ x: 1, y: 1 }];
    for (let head = 0; head < queue.length; head += 1) {
      const c = queue[head];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ] as const) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        if (!isWall(nx, ny) && !seen.has(key(nx, ny))) {
          seen.add(key(nx, ny));
          queue.push({ x: nx, y: ny });
        }
      }
    }
    return seen;
  }

  function reset(): void {
    generate();
    const reachable = reachableFromStart();
    // stars on every reachable cell except the start — all collectible
    stars = new Set();
    for (const cell of reachable) if (cell !== key(1, 1)) stars.add(cell);
    player = { x: 1, y: 1 };
    totalStars = stars.size;
    want = null;
    points = 0;
    acc = 0;
    gacc = 0;
    guardians.length = 0;
    // guardians only on distant REACHABLE cells (never sealed behind a wall)
    const spots: Cell[] = [
      { x: COLS - 2, y: ROWS - 2 },
      { x: COLS - 2, y: 1 },
      { x: 1, y: ROWS - 2 }
    ];
    for (const s of spots) {
      if (reachable.has(key(s.x, s.y))) guardians.push({ ...s, dir: 'left' });
    }
    // fallback: if none of the fixed spots were reachable, use a far reachable cell
    if (guardians.length === 0) {
      const far = [...reachable].reverse().find((c) => c !== key(1, 1));
      if (far) {
        const [gx, gy] = far.split(',').map(Number);
        guardians.push({ x: gx, y: gy, dir: 'left' });
      }
    }
  }

  function moveGuardian(g: Guardian): void {
    const order: Direction[] = ['up', 'down', 'left', 'right'];
    const delta: Record<Direction, Cell> = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 }
    };
    // prefer continuing; otherwise pick a random open direction (light chase bias)
    const towards: Direction =
      Math.abs(player.x - g.x) > Math.abs(player.y - g.y)
        ? player.x < g.x
          ? 'left'
          : 'right'
        : player.y < g.y
          ? 'up'
          : 'down';
    const choices = [g.dir, towards, ...order].filter((d) => {
      const n = delta[d];
      return !isWall(g.x + n.x, g.y + n.y);
    });
    // 45% of the time take the chase-biased direction, else keep momentum
    const pick =
      choices.length === 0
        ? g.dir
        : Math.random() < 0.45 && choices.includes(towards)
          ? towards
          : choices[0];
    const n = delta[pick];
    if (!isWall(g.x + n.x, g.y + n.y)) {
      g.x += n.x;
      g.y += n.y;
      g.dir = pick;
    }
  }

  function step(dt: number, input: ArcadeInput): StepResult {
    if (input.turn) want = input.turn;
    let result: StepResult = {};

    acc += dt;
    if (acc >= 0.12) {
      acc = 0;
      if (want) {
        const n = {
          up: { x: 0, y: -1 },
          down: { x: 0, y: 1 },
          left: { x: -1, y: 0 },
          right: { x: 1, y: 0 }
        }[want];
        if (!isWall(player.x + n.x, player.y + n.y)) {
          player.x += n.x;
          player.y += n.y;
        }
      }
      if (stars.delete(key(player.x, player.y))) {
        points += 5;
        result = { gained: 5, event: 'pickup' };
      }
      if (stars.size === 0) return { end: 'won', gained: result.gained };
    }

    gacc += dt;
    if (gacc >= 0.2) {
      gacc = 0;
      for (const g of guardians) moveGuardian(g);
    }
    for (const g of guardians) if (g.x === player.x && g.y === player.y) return { end: 'over', event: 'crash' };
    return result;
  }

  function draw(env: DrawEnv): void {
    const { ctx, t } = env;
    paintBackground(env, ACCENT);
    ctx.save();
    ctx.translate(0, OFFY);
    // walls
    for (let y = 0; y < ROWS; y += 1)
      for (let x = 0; x < COLS; x += 1)
        if (wall[y][x]) {
          ctx.fillStyle = 'rgba(129,140,248,.20)';
          rr(ctx, x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2, 5);
        }
    // stars
    ctx.fillStyle = '#fde68a';
    for (const s of stars) {
      const [x, y] = s.split(',').map(Number);
      const tw = env.reduced ? 2.6 : 2.2 + Math.sin(t * 4 + x + y) * 0.8;
      ctx.beginPath();
      ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, tw, 0, Math.PI * 2);
      ctx.fill();
    }
    // guardians
    for (const g of guardians)
      glowRect(env, g.x * CELL + 3, g.y * CELL + 3, CELL - 6, CELL - 6, 6, '#fb7185', 14);
    // player pig
    glowCircle(env, player.x * CELL + CELL / 2, player.y * CELL + CELL / 2, CELL * 0.4, '#f9a8d4', 16);
    ctx.restore();
  }

  reset();
  return {
    control: 'turn',
    reset,
    step,
    draw,
    score: () => points + (totalStars > 0 && stars.size === 0 ? 40 : 0)
  };
}
