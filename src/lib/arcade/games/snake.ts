// Snake do Porquinho — grid snake with a turn QUEUE so two quick turns in a
// single tick can never fold the head back on itself (the old instant-reverse
// death). Speed ramps up gently as you eat. Original pig/fruit theme.
import {
  FIELD_W,
  FIELD_H,
  FIELD_SAFE_TOP,
  FIELD_SAFE_BOTTOM,
  drawAvatar,
  glowRect,
  glowCircle,
  isOpposite,
  paintBackground,
  type ArcadeEngine,
  type ArcadeInput,
  type Direction,
  type DrawEnv,
  type StepResult
} from '../engine';

const COLS = 15;
const CELL = FIELD_W / COLS; // 24
const ACCENT = '#4ade80';

interface Cell {
  x: number;
  y: number;
}

export function createSnake(): ArcadeEngine {
  let snake: Cell[] = [];
  let dir: Direction = 'right';
  const queue: Direction[] = [];
  let food: Cell = { x: 10, y: 10 };
  let points = 0;
  let acc = 0;
  let stepEvery = 0.16;
  // Rows fill the (responsive) field height BETWEEN the safe insets so the head
  // and food never travel under the top HUD or the bottom-corner controls.
  // originY is the logical top of the grid; recomputed each round.
  let rows = 20;
  let startY = 10;
  let originY = 0;

  function placeFood(): void {
    let next: Cell;
    do {
      next = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * rows) };
    } while (snake.some((s) => s.x === next.x && s.y === next.y));
    food = next;
  }

  function reset(): void {
    // Carve the grid out of the band clear of the top HUD and bottom controls.
    const topCells = Math.ceil(FIELD_SAFE_TOP / CELL);
    const bottomCells = Math.ceil(FIELD_SAFE_BOTTOM / CELL);
    rows = Math.max(10, Math.floor(FIELD_H / CELL) - topCells - bottomCells);
    originY = topCells * CELL;
    // Guard: if measured insets are pathologically large, shrink further so the
    // grid bottom can never slide back under the bottom chrome.
    while (rows > 10 && originY + rows * CELL > FIELD_H - FIELD_SAFE_BOTTOM) rows -= 1;
    startY = Math.floor(rows / 2);
    snake = [
      { x: 7, y: startY },
      { x: 6, y: startY },
      { x: 5, y: startY }
    ];
    dir = 'right';
    queue.length = 0;
    points = 0;
    acc = 0;
    stepEvery = 0.16;
    placeFood();
  }

  function enqueue(turn: Direction): void {
    // Reject a turn that reverses the last QUEUED (or committed) direction, and
    // cap the queue at 2 so buffered inputs stay responsive but bounded.
    const ref = queue.length ? queue[queue.length - 1] : dir;
    if (turn === ref || isOpposite(turn, ref)) return;
    if (queue.length < 2) queue.push(turn);
  }

  function step(dt: number, input: ArcadeInput): StepResult {
    if (input.turn) enqueue(input.turn);
    acc += dt;
    if (acc < stepEvery) return {};
    acc = 0;

    if (queue.length) dir = queue.shift() as Direction;
    const head = { ...snake[0] };
    if (dir === 'up') head.y -= 1;
    else if (dir === 'down') head.y += 1;
    else if (dir === 'left') head.x -= 1;
    else head.x += 1;

    if (
      head.x < 0 ||
      head.y < 0 ||
      head.x >= COLS ||
      head.y >= rows ||
      snake.some((s) => s.x === head.x && s.y === head.y)
    ) {
      return { end: 'over', event: 'crash' };
    }

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      points += 10;
      stepEvery = Math.max(0.075, 0.16 - points / 2600);
      placeFood();
      return { gained: 10, event: 'pickup' };
    }
    snake.pop();
    return {};
  }

  function draw(env: DrawEnv): void {
    const { ctx } = env;
    paintBackground(env, ACCENT);
    // grid dots
    ctx.fillStyle = 'rgba(255,255,255,.04)';
    for (let y = 0; y < rows; y += 1)
      for (let x = 0; x < COLS; x += 1) {
        ctx.beginPath();
        ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2 + originY, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    // food — glowing fruit
    glowCircle(env, food.x * CELL + CELL / 2, food.y * CELL + CELL / 2 + originY, CELL * 0.34, '#f97316', 16);
    // snake body (green segments); the head is the player's mascot
    for (let i = snake.length - 1; i >= 0; i -= 1) {
      const s = snake[i];
      const head = i === 0;
      const cx = s.x * CELL + CELL / 2;
      const cy = s.y * CELL + CELL / 2 + originY;
      if (head && drawAvatar(env, cx, cy, CELL + 2)) continue;
      glowRect(env, s.x * CELL + 2, s.y * CELL + 2 + originY, CELL - 4, CELL - 4, 6, head ? '#f9a8d4' : ACCENT, head ? 16 : 8);
      if (head) {
        ctx.fillStyle = '#9d2f63';
        ctx.beginPath();
        ctx.arc(cx - 3, cy + 2, 1.6, 0, Math.PI * 2);
        ctx.arc(cx + 3, cy + 2, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  reset();
  return {
    control: 'turn',
    reset,
    step,
    draw,
    score: () => points
  };
}
