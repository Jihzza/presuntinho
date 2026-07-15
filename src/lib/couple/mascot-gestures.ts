/**
 * Pure gesture rules for the floating mascot.
 *
 * Keeping the thresholds and intensity curve outside the Svelte component
 * makes the slightly unusual one/two/many-tap interaction deterministic and
 * testable.  The curve is intentionally exponential (with conservative caps):
 * every extra tap must feel stronger without letting a long tap streak fling
 * the FAB outside the viewport or run an unbounded particle animation.
 */

export const NUDGE_TAP_THRESHOLD = 4;

export type MascotTapAction = 'agent' | 'messages' | 'nudge';
export type MascotTapHaptic = 'tap' | 'success' | 'warning';

export interface MascotTapFeedback {
	level: number;
	amplitude: number;
	rotation: number;
	scale: number;
	particles: number;
	duration: number;
	haptic: MascotTapHaptic;
}

/** Resolve the action after the user has stopped tapping. */
export function mascotTapAction(count: number): MascotTapAction {
	const taps = Math.max(0, Math.floor(count));
	if (taps >= NUDGE_TAP_THRESHOLD) return 'nudge';
	if (taps >= 2) return 'messages';
	return 'agent';
}

/**
 * Return a bounded, monotonic feedback profile for a tap in the current burst.
 * Values are CSS/Web Animations friendly pixels/degrees/unitless scale/ms.
 */
export function mascotTapFeedback(count: number): MascotTapFeedback {
	const level = Math.min(10, Math.max(1, Math.floor(count)));
	const energy = Math.pow(1.36, level - 1);
	return {
		level,
		amplitude: Math.min(22, 3 + energy * 3.2),
		rotation: Math.min(25, 4 + energy * 3.2),
		scale: Math.min(1.88, 1.03 + energy * 0.13),
		particles: Math.min(12, 2 + Math.ceil(energy * 1.6)),
		duration: Math.max(120, 270 - level * 16),
		haptic: level >= NUDGE_TAP_THRESHOLD ? 'warning' : level === 3 ? 'success' : 'tap'
	};
}
