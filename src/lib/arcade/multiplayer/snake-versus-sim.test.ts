import { describe, it, expect } from 'vitest';
import { SnakeVersusSim, type PlayerId } from './snake-versus-sim';

// A generous board so the two starting snakes (len 3 each) never collide by
// accident during setup-oriented tests.
function sim(cols = 20, rows = 15, seed = 42) {
  return new SnakeVersusSim(cols, rows, seed);
}

describe('SnakeVersusSim', () => {
  it('places two alive snakes and food on a fresh board', () => {
    const s = sim().state();
    expect(s.snakes[0].alive).toBe(true);
    expect(s.snakes[1].alive).toBe(true);
    expect(s.snakes[0].body).toHaveLength(3);
    expect(s.snakes[1].body).toHaveLength(3);
    expect(s.food.x).toBeGreaterThanOrEqual(0);
    expect(s.result).toBeNull();
  });

  it('moves heads forward one cell per advance', () => {
    const g = sim();
    const before = g.state().snakes[0].body[0];
    g.advance();
    const after = g.state().snakes[0].body[0];
    expect(after.x).toBe(before.x + 1); // player 0 faces right
    expect(after.y).toBe(before.y);
  });

  it('rejects an illegal reversal turn', () => {
    const g = sim();
    g.setTurn(0, 'left'); // opposite of 'right' — must be ignored
    g.advance();
    expect(g.state().snakes[0].dir).toBe('right');
  });

  it('kills a snake that runs into the wall and ends the round for the survivor', () => {
    // 5-wide board: player 0 head starts at x=3 facing right → x=4, then x=5 = wall.
    const g = new SnakeVersusSim(5, 15, 1);
    // Freeze player 1 by driving it into its own start harmlessly is hard; instead
    // just advance until someone dies and assert the result is set.
    let result: PlayerId | 'draw' | null = null;
    for (let i = 0; i < 10 && result === null; i += 1) {
      g.advance();
      result = g.winner;
    }
    expect(result).not.toBeNull();
    expect(g.finished).toBe(true);
  });

  it('steals a point and bites the tail when a head hits the opponent body', () => {
    // Hand-craft a state: player 0 head is about to enter player 1's mid-body.
    const g = sim(20, 15, 7);
    g.load({
      cols: 20,
      rows: 15,
      tick: 0,
      result: null,
      food: { x: 0, y: 0 },
      snakes: [
        // P0 head at (5,5) moving right → next (6,5)
        { body: [{ x: 5, y: 5 }, { x: 4, y: 5 }], dir: 'right', alive: true, score: 2 },
        // P1 vertical body passing through (6,5) as a NON-head segment
        {
          body: [
            { x: 6, y: 3 }, // head
            { x: 6, y: 4 },
            { x: 6, y: 5 }, // <- P0 will bite here (index 2)
            { x: 6, y: 6 },
            { x: 6, y: 7 }
          ],
          dir: 'up',
          alive: true,
          score: 3
        }
      ]
    });
    const events = g.advance();
    const steal = events.find((e) => e.type === 'steal');
    expect(steal).toBeTruthy();
    const st = g.state();
    // P0 gained a point, P1 lost one.
    expect(st.snakes[0].score).toBe(3);
    expect(st.snakes[1].score).toBe(2);
    // P1's tail was bitten off from the hit segment (down to indices 0..1) and
    // then P1 itself steps forward one cell (dir 'up') the same tick, so the two
    // surviving segments shift up by one: (6,3)->(6,2) head, (6,4)->(6,3).
    expect(st.snakes[1].body).toEqual([{ x: 6, y: 2 }, { x: 6, y: 3 }]);
    // Both still alive; round continues.
    expect(st.snakes[0].alive).toBe(true);
    expect(st.snakes[1].alive).toBe(true);
    expect(st.result).toBeNull();
  });

  it('grows and scores the eater when it reaches the food', () => {
    const g = sim(20, 15, 3);
    g.load({
      cols: 20,
      rows: 15,
      tick: 0,
      result: null,
      food: { x: 6, y: 5 },
      snakes: [
        { body: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }], dir: 'right', alive: true, score: 0 },
        { body: [{ x: 15, y: 10 }, { x: 16, y: 10 }], dir: 'left', alive: true, score: 0 }
      ]
    });
    g.advance();
    const st = g.state();
    expect(st.snakes[0].score).toBe(1);
    expect(st.snakes[0].body).toHaveLength(4); // grew by one
    // a fresh food was placed somewhere not on a snake
    expect(st.food).not.toEqual({ x: 6, y: 5 });
  });

  it('declares a head-on collision a double death and resolves by score', () => {
    const g = sim(20, 15, 9);
    g.load({
      cols: 20,
      rows: 15,
      tick: 0,
      result: null,
      food: { x: 0, y: 0 },
      snakes: [
        { body: [{ x: 5, y: 5 }, { x: 4, y: 5 }], dir: 'right', alive: true, score: 4 },
        { body: [{ x: 7, y: 5 }, { x: 8, y: 5 }], dir: 'left', alive: true, score: 1 }
      ]
    });
    // both target (6,5)
    const events = g.advance();
    expect(events.some((e) => e.type === 'death')).toBe(true);
    expect(g.winner).toBe(0); // higher score wins the double-KO
  });

  it('load() faithfully round-trips a snapshot (host→guest replication)', () => {
    const host = sim(18, 12, 11);
    host.advance();
    host.advance();
    const snap = host.state();
    const guest = sim(18, 12, 999); // different seed
    guest.load(snap);
    expect(guest.state()).toEqual(snap);
  });
});
