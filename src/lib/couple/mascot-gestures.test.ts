import { describe, expect, it } from 'vitest';
import {
	NUDGE_TAP_THRESHOLD,
	mascotTapAction,
	mascotTapFeedback
} from './mascot-gestures';

describe('mascot gesture rules', () => {
	it('keeps the existing single, double and many tap actions unambiguous', () => {
		expect(mascotTapAction(1)).toBe('agent');
		expect(mascotTapAction(2)).toBe('messages');
		expect(mascotTapAction(3)).toBe('messages');
		expect(mascotTapAction(NUDGE_TAP_THRESHOLD)).toBe('nudge');
		expect(mascotTapAction(20)).toBe('nudge');
	});

	it('makes every tap stronger while capping extreme bursts', () => {
		const profiles = Array.from({ length: 10 }, (_, index) => mascotTapFeedback(index + 1));
		for (let index = 1; index < profiles.length; index += 1) {
			expect(profiles[index].amplitude).toBeGreaterThanOrEqual(profiles[index - 1].amplitude);
			expect(profiles[index].rotation).toBeGreaterThanOrEqual(profiles[index - 1].rotation);
			expect(profiles[index].scale).toBeGreaterThanOrEqual(profiles[index - 1].scale);
			expect(profiles[index].particles).toBeGreaterThanOrEqual(profiles[index - 1].particles);
		}
		const earlyAmplitudeSteps = profiles
			.slice(0, 5)
			.slice(1)
			.map((profile, index) => profile.amplitude - profiles[index].amplitude);
		for (let index = 1; index < earlyAmplitudeSteps.length; index += 1) {
			expect(earlyAmplitudeSteps[index]).toBeGreaterThan(earlyAmplitudeSteps[index - 1]);
		}
		const capped = mascotTapFeedback(999);
		expect(capped.level).toBe(10);
		expect(capped.amplitude).toBeLessThanOrEqual(22);
		expect(capped.rotation).toBeLessThanOrEqual(25);
		expect(capped.scale).toBeLessThanOrEqual(1.88);
		expect(capped.particles).toBe(12);
		expect(capped.duration).toBe(120);
		expect(capped.haptic).toBe('warning');
	});
});
