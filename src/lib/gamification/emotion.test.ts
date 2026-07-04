import { describe, expect, it } from 'vitest';
import {
	emotionOverlay,
	hoursUntilMidnight,
	mascotEmotion,
	EUPHORIC_WINDOW_MINUTES,
	WORRIED_HOURS_THRESHOLD
} from './emotion';

const base = {
	streakCurrent: 5,
	streakBest: 10,
	activeToday: true,
	hoursUntilMidnight: 12,
	minutesSinceLastAction: null
};

describe('mascotEmotion', () => {
	it('is euphoric right after an action today', () => {
		expect(
			mascotEmotion({ ...base, minutesSinceLastAction: 0 })
		).toBe('euphoric');
		expect(
			mascotEmotion({ ...base, minutesSinceLastAction: EUPHORIC_WINDOW_MINUTES })
		).toBe('euphoric');
	});

	it('settles into happy once the euphoric window passes', () => {
		expect(
			mascotEmotion({ ...base, minutesSinceLastAction: EUPHORIC_WINDOW_MINUTES + 1 })
		).toBe('happy');
		expect(mascotEmotion({ ...base, minutesSinceLastAction: null })).toBe('happy');
	});

	it('never goes euphoric on an idle day, even with a recent timestamp', () => {
		expect(
			mascotEmotion({ ...base, activeToday: false, minutesSinceLastAction: 1 })
		).toBe('neutral');
	});

	it('worries in the evening when the streak is at risk', () => {
		expect(
			mascotEmotion({
				...base,
				activeToday: false,
				hoursUntilMidnight: WORRIED_HOURS_THRESHOLD
			})
		).toBe('worried');
		expect(
			mascotEmotion({ ...base, activeToday: false, hoursUntilMidnight: 1 })
		).toBe('worried');
	});

	it('stays neutral earlier in the day even when idle', () => {
		expect(
			mascotEmotion({
				...base,
				activeToday: false,
				hoursUntilMidnight: WORRIED_HOURS_THRESHOLD + 1
			})
		).toBe('neutral');
	});

	it('is sad when a previous streak is broken', () => {
		expect(
			mascotEmotion({
				...base,
				activeToday: false,
				streakCurrent: 0,
				streakBest: 7,
				hoursUntilMidnight: 12
			})
		).toBe('sad');
	});

	it('is neutral for a brand-new profile with no streak history', () => {
		expect(
			mascotEmotion({
				...base,
				activeToday: false,
				streakCurrent: 0,
				streakBest: 0,
				hoursUntilMidnight: 12
			})
		).toBe('neutral');
	});

	it('a broken streak in the evening reads neutral-sad, not worried', () => {
		// streakCurrent 0 → nothing left to protect tonight.
		expect(
			mascotEmotion({
				...base,
				activeToday: false,
				streakCurrent: 0,
				streakBest: 3,
				hoursUntilMidnight: 2
			})
		).toBe('sad');
	});
});

describe('emotionOverlay', () => {
	it('keeps happy and neutral clean', () => {
		expect(emotionOverlay('happy')).toBeNull();
		expect(emotionOverlay('neutral')).toBeNull();
	});

	it('decorates the strong emotions', () => {
		expect(emotionOverlay('euphoric')).toBe('🎉');
		expect(emotionOverlay('worried')).toBe('😰');
		expect(emotionOverlay('sad')).toBe('💧');
	});
});

describe('hoursUntilMidnight', () => {
	it('is ~24 right after midnight and small before midnight', () => {
		expect(hoursUntilMidnight(new Date(2026, 5, 10, 0, 0, 1))).toBeGreaterThan(23.9);
		expect(hoursUntilMidnight(new Date(2026, 5, 10, 23, 30))).toBeLessThan(0.6);
	});

	it('is exactly 12 at noon', () => {
		expect(hoursUntilMidnight(new Date(2026, 5, 10, 12, 0, 0))).toBe(12);
	});
});
