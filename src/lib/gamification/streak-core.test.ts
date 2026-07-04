import { describe, expect, it } from 'vitest';
import {
	daysBeforeOf,
	earnFreezeIfDue,
	localDateKeyOf,
	nextMilestoneToCelebrate,
	walkStreak,
	MAX_FREEZES
} from './streak-core';

const TODAY = new Date(2026, 6, 4); // 2026-07-04 local

/** Build a set of date keys for `days` offsets before TODAY. */
function daysSet(...offsets: number[]): Set<string> {
	return new Set(offsets.map((n) => localDateKeyOf(daysBeforeOf(TODAY, n))));
}

function walk(opts: {
	active: Set<string>;
	frozen?: Set<string>;
	freezes?: number;
}) {
	return walkStreak({
		activeDays: opts.active,
		frozenDays: opts.frozen ?? new Set(),
		freezesAvailable: opts.freezes ?? 0,
		today: TODAY,
		lookbackDays: 400
	});
}

describe('walkStreak — base rules (no freezes)', () => {
	it('counts consecutive days ending today', () => {
		const r = walk({ active: daysSet(0, 1, 2) });
		expect(r).toMatchObject({ current: 3, activeToday: true, newlyFrozen: [] });
	});

	it('applies the 1-day grace when today is idle', () => {
		const r = walk({ active: daysSet(1, 2, 3) });
		expect(r).toMatchObject({ current: 3, activeToday: false });
	});

	it('breaks on a 1-day gap with no tokens', () => {
		const r = walk({ active: daysSet(0, 2, 3) });
		expect(r.current).toBe(1);
	});

	it('returns 0 for an empty history', () => {
		const r = walk({ active: new Set() });
		expect(r).toMatchObject({ current: 0, activeToday: false, freezesLeft: 0 });
	});
});

describe('walkStreak — freeze consumption', () => {
	it('bridges a 1-day gap with one token (bridge day not counted)', () => {
		const r = walk({ active: daysSet(0, 2, 3), freezes: 1 });
		expect(r.current).toBe(3);
		expect(r.freezesLeft).toBe(0);
		expect(r.newlyFrozen).toEqual([localDateKeyOf(daysBeforeOf(TODAY, 1))]);
	});

	it('bridges a 2-day gap with two tokens', () => {
		const r = walk({ active: daysSet(0, 3, 4), freezes: 2 });
		expect(r.current).toBe(3);
		expect(r.freezesLeft).toBe(0);
		expect(r.newlyFrozen).toHaveLength(2);
	});

	it('does not bridge when nothing exists behind the gap', () => {
		const r = walk({ active: daysSet(0), freezes: 2 });
		expect(r.current).toBe(1);
		expect(r.freezesLeft).toBe(2);
		expect(r.newlyFrozen).toEqual([]);
	});

	it('grace + gap: idle today, idle yesterday, active before → bridge yesterday', () => {
		// Today idle → anchor yesterday; yesterday idle but day-2/3 active.
		const r = walk({ active: daysSet(2, 3), freezes: 1 });
		expect(r.current).toBe(2);
		expect(r.freezesLeft).toBe(0);
		expect(r.newlyFrozen).toEqual([localDateKeyOf(daysBeforeOf(TODAY, 1))]);
	});

	it('previously frozen days keep the chain without consuming new tokens', () => {
		const frozen = daysSet(1);
		const r = walk({ active: daysSet(0, 2, 3), frozen, freezes: 0 });
		expect(r.current).toBe(3);
		expect(r.freezesLeft).toBe(0);
		expect(r.newlyFrozen).toEqual([]);
	});

	it('clamps token input to MAX_FREEZES', () => {
		const r = walk({ active: daysSet(0), freezes: 99 });
		expect(r.freezesLeft).toBe(MAX_FREEZES);
	});
});

describe('earnFreezeIfDue', () => {
	it('earns at 7 days', () => {
		expect(earnFreezeIfDue({ current: 7, lastEarnMilestone: 0, freezesAvailable: 0 })).toEqual({
			earned: true,
			freezes: 1,
			lastEarnMilestone: 7
		});
	});

	it('does not double-earn the same milestone', () => {
		expect(
			earnFreezeIfDue({ current: 8, lastEarnMilestone: 7, freezesAvailable: 1 }).earned
		).toBe(false);
	});

	it('earns again at the next multiple of 7', () => {
		const r = earnFreezeIfDue({ current: 14, lastEarnMilestone: 7, freezesAvailable: 1 });
		expect(r).toEqual({ earned: true, freezes: 2, lastEarnMilestone: 14 });
	});

	it('caps at MAX_FREEZES but still advances the marker', () => {
		const r = earnFreezeIfDue({ current: 21, lastEarnMilestone: 14, freezesAvailable: 2 });
		expect(r.earned).toBe(false);
		expect(r.freezes).toBe(2);
		expect(r.lastEarnMilestone).toBe(21);
	});

	it('nothing due below 7 days', () => {
		expect(
			earnFreezeIfDue({ current: 6, lastEarnMilestone: 0, freezesAvailable: 0 }).earned
		).toBe(false);
	});

	it('resets the marker after a break: rebuilt streak earns again at day 7', () => {
		// Old streak reached 14 (marker 14), broke, rebuilt to 7.
		const r = earnFreezeIfDue({ current: 7, lastEarnMilestone: 14, freezesAvailable: 0 });
		expect(r).toEqual({ earned: true, freezes: 1, lastEarnMilestone: 7 });
	});

	it('reset does not fire early on a rebuilt streak below 7', () => {
		const r = earnFreezeIfDue({ current: 3, lastEarnMilestone: 14, freezesAvailable: 1 });
		expect(r.earned).toBe(false);
		expect(r.freezes).toBe(1);
	});

	it('still blocks retro-pay within a live streak', () => {
		// Marker 7 with current 8 — same streak, nothing new due.
		expect(
			earnFreezeIfDue({ current: 8, lastEarnMilestone: 7, freezesAvailable: 1 }).earned
		).toBe(false);
	});
});

describe('nextMilestoneToCelebrate', () => {
	it('returns the first milestone at 7', () => {
		expect(nextMilestoneToCelebrate(7, 0)).toBe(7);
	});

	it('returns null when already celebrated', () => {
		expect(nextMilestoneToCelebrate(7, 7)).toBeNull();
		expect(nextMilestoneToCelebrate(10, 7)).toBeNull();
	});

	it('jumps to the highest uncelebrated milestone', () => {
		expect(nextMilestoneToCelebrate(35, 7)).toBe(30);
		expect(nextMilestoneToCelebrate(400, 100)).toBe(365);
	});

	it('returns null below the first milestone', () => {
		expect(nextMilestoneToCelebrate(6, 0)).toBeNull();
	});
});
