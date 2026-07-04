import { describe, expect, it } from 'vitest';
import { level, progressToNext, xpForLevel, MAX_LEVEL } from './levels';

describe('xpForLevel', () => {
	it('level 1 and below cost 0 XP', () => {
		expect(xpForLevel(1)).toBe(0);
		expect(xpForLevel(0)).toBe(0);
		expect(xpForLevel(-5)).toBe(0);
	});

	it('follows round(50 · N^1.6)', () => {
		expect(xpForLevel(2)).toBe(Math.round(50 * Math.pow(2, 1.6))); // 152
		expect(xpForLevel(3)).toBe(Math.round(50 * Math.pow(3, 1.6))); // 290
		expect(xpForLevel(10)).toBe(Math.round(50 * Math.pow(10, 1.6))); // 1990
	});

	it('is strictly increasing', () => {
		for (let n = 2; n <= 60; n++) {
			expect(xpForLevel(n)).toBeGreaterThan(xpForLevel(n - 1));
		}
	});

	it('treats non-finite input as level 1 territory', () => {
		expect(xpForLevel(Number.NaN)).toBe(0);
		expect(xpForLevel(Number.POSITIVE_INFINITY)).toBe(0);
	});

	it('clamps huge finite levels to MAX_LEVEL', () => {
		expect(xpForLevel(MAX_LEVEL + 500)).toBe(xpForLevel(MAX_LEVEL));
	});
});

describe('level', () => {
	it('starts at level 1 for 0 or negative XP', () => {
		expect(level(0)).toBe(1);
		expect(level(-10)).toBe(1);
		expect(level(Number.NaN)).toBe(1);
	});

	it('stays level 1 just below the level-2 threshold', () => {
		expect(level(xpForLevel(2) - 1)).toBe(1);
	});

	it('bumps exactly at each threshold', () => {
		for (const n of [2, 3, 5, 10, 25]) {
			expect(level(xpForLevel(n))).toBe(n);
			expect(level(xpForLevel(n) - 1)).toBe(n - 1);
		}
	});

	it('agrees with a linear scan for the first 5000 XP', () => {
		let expected = 1;
		for (let xp = 0; xp <= 5000; xp += 7) {
			while (xpForLevel(expected + 1) <= xp) expected += 1;
			expect(level(xp)).toBe(expected);
		}
	});
});

describe('progressToNext', () => {
	it('reports a fresh level at the exact threshold', () => {
		const p = progressToNext(xpForLevel(3));
		expect(p.level).toBe(3);
		expect(p.current).toBe(0);
		expect(p.pct).toBe(0);
		expect(p.nextAt).toBe(xpForLevel(4));
	});

	it('reports partial progress mid-level', () => {
		const base = xpForLevel(2);
		const span = xpForLevel(3) - base;
		const p = progressToNext(base + Math.floor(span / 2));
		expect(p.level).toBe(2);
		expect(p.pct).toBeGreaterThanOrEqual(49);
		expect(p.pct).toBeLessThanOrEqual(51);
	});

	it('clamps bad input to level 1 at 0%', () => {
		const p = progressToNext(Number.NaN);
		expect(p.level).toBe(1);
		expect(p.current).toBe(0);
		expect(p.pct).toBe(0);
	});

	it('never exceeds 100%', () => {
		for (let xp = 0; xp <= 3000; xp += 13) {
			const p = progressToNext(xp);
			expect(p.pct).toBeGreaterThanOrEqual(0);
			expect(p.pct).toBeLessThanOrEqual(100);
			expect(p.current).toBeLessThanOrEqual(p.needed);
		}
	});
});
