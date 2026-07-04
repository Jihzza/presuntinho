// ─────────────────────────────────────────────────────────────────────────────
// Presuntinho V10 — gamification window-event contracts
// (same convention as src/lib/components/events.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** Streak state may have changed — flame chips etc. should refresh. */
export const STREAK_CHANGED_EVENT = 'presuntinho:streak-changed';

/** Today's flame was just earned — detail: { current: number }. */
export const FLAME_IGNITED_EVENT = 'presuntinho:flame-ignited';

/** Level increased — detail: { level: number }. */
export const LEVEL_UP_EVENT = 'presuntinho:level-up';

/** An XP-earning action just happened (used for the euphoric mascot state). */
export const ACTION_PULSE_EVENT = 'presuntinho:action-pulse';

export function dispatchGamificationEvent(name: string, detail?: unknown): void {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(new CustomEvent(name, { detail }));
}

// ── last-action pulse (module memory, feeds the euphoric mascot state) ──────

let lastActionAt: number | null = null;

/** Record "the user just did something rewarding" (called on XP gains). */
export function recordActionPulse(): void {
	lastActionAt = Date.now();
	dispatchGamificationEvent(ACTION_PULSE_EVENT);
}

/** Minutes since the last rewarding action this session, or null. */
export function minutesSinceLastAction(): number | null {
	if (lastActionAt === null) return null;
	return (Date.now() - lastActionAt) / 60_000;
}
