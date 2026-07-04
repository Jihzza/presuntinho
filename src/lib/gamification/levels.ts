// ─────────────────────────────────────────────────────────────────────────────
// Presuntinho V10 — level curve (pure functions, no Dexie/DOM dependencies)
//
// Curve: reaching level N requires round(50 · N^1.6) cumulative XP.
// Level 1 starts at 0 XP so a brand-new profile is never "level 0".
// Examples: L2 = 152 XP, L3 = 290, L5 = 656, L10 = 1 990, L20 = 6 034.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_LEVEL = 999;

/** Cumulative XP required to reach `level`. Level 1 (and below) costs 0. */
export function xpForLevel(level: number): number {
	if (!Number.isFinite(level) || level <= 1) return 0;
	const n = Math.min(Math.floor(level), MAX_LEVEL);
	return Math.round(50 * Math.pow(n, 1.6));
}

/** Current level for a cumulative XP total. Always >= 1. */
export function level(xp: number): number {
	if (!Number.isFinite(xp) || xp <= 0) return 1;
	// xpForLevel is strictly increasing for n >= 2 — binary search the highest
	// level whose threshold is <= xp.
	let lo = 1;
	let hi = MAX_LEVEL;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi + 1) / 2);
		if (xpForLevel(mid) <= xp) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

export interface LevelProgress {
	/** Current level (>= 1). */
	level: number;
	/** XP gained since the current level started. */
	current: number;
	/** XP span between the current level and the next one. */
	needed: number;
	/** 0–100 progress towards the next level. */
	pct: number;
	/** Absolute XP threshold of the next level. */
	nextAt: number;
}

/** Progress from the current level towards the next one. */
export function progressToNext(xp: number): LevelProgress {
	const safeXp = Number.isFinite(xp) && xp > 0 ? xp : 0;
	const lvl = level(safeXp);
	const base = xpForLevel(lvl);
	const nextAt = xpForLevel(lvl + 1);
	const needed = Math.max(1, nextAt - base);
	const current = Math.max(0, safeXp - base);
	const pct = Math.max(0, Math.min(100, Math.round((current / needed) * 100)));
	return { level: lvl, current, needed, pct, nextAt };
}
