// ─────────────────────────────────────────────────────────────────────────────
// Presuntinho V10 — mascot emotional state (pure functions, no Dexie/DOM)
//
// The active mascot keeps its chosen emoji as the "happy" base; the emotion
// only decorates it (overlay emoji + localized speech line picked by the UI).
// Derived Duolingo-style from a single question: is today's streak safe?
// ─────────────────────────────────────────────────────────────────────────────

export type MascotEmotion = 'happy' | 'neutral' | 'worried' | 'sad' | 'euphoric';

export interface EmotionContext {
	/** Current activity streak in days (0 = broken/none). */
	streakCurrent: number;
	/** Best streak ever recorded (used to tell "broken" apart from "new user"). */
	streakBest: number;
	/** Whether today already has a qualifying activity. */
	activeToday: boolean;
	/** Hours remaining until local midnight (0–24). */
	hoursUntilMidnight: number;
	/** Minutes since the last XP-earning action, or null when unknown. */
	minutesSinceLastAction?: number | null;
}

/** Evening threshold: with fewer hours than this left, an idle day feels risky. */
export const WORRIED_HOURS_THRESHOLD = 6;
/** Freshly rewarded window: an action in the last few minutes reads as a win. */
export const EUPHORIC_WINDOW_MINUTES = 2;

export function mascotEmotion(ctx: EmotionContext): MascotEmotion {
	const minutes = ctx.minutesSinceLastAction;
	if (
		ctx.activeToday &&
		typeof minutes === 'number' &&
		minutes >= 0 &&
		minutes <= EUPHORIC_WINDOW_MINUTES
	) {
		return 'euphoric';
	}
	if (ctx.activeToday) return 'happy';
	// Idle today from here on.
	if (ctx.streakCurrent > 0 && ctx.hoursUntilMidnight <= WORRIED_HOURS_THRESHOLD) {
		return 'worried';
	}
	if (ctx.streakCurrent === 0 && ctx.streakBest > 0) return 'sad';
	return 'neutral';
}

/** Small overlay emoji rendered next to the mascot; null keeps it clean. */
export function emotionOverlay(emotion: MascotEmotion): string | null {
	switch (emotion) {
		case 'euphoric':
			return '🎉';
		case 'worried':
			return '😰';
		case 'sad':
			return '💧';
		case 'happy':
		case 'neutral':
			return null;
	}
}

/** Hours until local midnight for a given date (defaults to now). */
export function hoursUntilMidnight(now: Date = new Date()): number {
	const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	return (midnight.getTime() - now.getTime()) / 3_600_000;
}
