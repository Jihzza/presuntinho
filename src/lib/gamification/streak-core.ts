// ─────────────────────────────────────────────────────────────────────────────
// Presuntinho V10 — pure streak-walk math (no Dexie/DOM; unit-tested)
//
// Freeze semantics (Duolingo-style "forgiveness you earn"):
//   * A frozen day KEEPS the chain alive but does NOT count towards `current`.
//   * Freezes auto-consume at computation time: when the walk hits a missing
//     day that has real activity behind it, one token bridges that day.
//   * Tokens are earned every 7 consecutive days, capped at MAX_FREEZES.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_FREEZES = 2;
export const FREEZE_EARN_INTERVAL = 7;
export const STREAK_MILESTONES = [7, 14, 30, 50, 100, 365] as const;

/** Format a Date as a LOCAL 'YYYY-MM-DD' key (no UTC conversion). */
export function localDateKeyOf(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/** Return a new Date `n` days before `d` (DST-safe local arithmetic). */
export function daysBeforeOf(d: Date, n: number): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);
}

export interface StreakWalkInput {
	/** LOCAL date keys with real user activity. */
	activeDays: ReadonlySet<string>;
	/** LOCAL date keys already bridged by previously consumed freezes. */
	frozenDays: ReadonlySet<string>;
	/** Freeze tokens available before this walk. */
	freezesAvailable: number;
	/** "Now" — injected for testability. */
	today: Date;
	/** How many days back the walk may look. */
	lookbackDays: number;
}

export interface StreakWalkResult {
	/** Consecutive ACTIVE days (frozen bridge days excluded from the count). */
	current: number;
	/** True when today already has real activity. */
	activeToday: boolean;
	/** Tokens left after any auto-consumption in this walk. */
	freezesLeft: number;
	/** Date keys newly bridged by this walk (to be persisted by the caller). */
	newlyFrozen: string[];
}

/**
 * Walk backwards from today (or yesterday, via the 1-day grace rule) counting
 * consecutive days, bridging missing days with freeze tokens when there is
 * real activity behind the gap.
 */
export function walkStreak(input: StreakWalkInput): StreakWalkResult {
	const { activeDays, frozenDays, today, lookbackDays } = input;
	let freezesLeft = Math.max(0, Math.min(MAX_FREEZES, Math.floor(input.freezesAvailable)));
	const newlyFrozen: string[] = [];

	const todayKey = localDateKeyOf(today);
	const activeToday = activeDays.has(todayKey);

	// Anchor: today if already active, else yesterday (1-day grace — today is
	// still in progress, so an idle "so far" today never burns a freeze).
	let cursor = activeToday ? today : daysBeforeOf(today, 1);
	let current = 0;

	for (let i = 0; i < lookbackDays; i++) {
		const key = localDateKeyOf(cursor);
		if (activeDays.has(key)) {
			current += 1;
			cursor = daysBeforeOf(cursor, 1);
			continue;
		}
		if (frozenDays.has(key)) {
			// Previously bridged day: chain survives, count unchanged.
			cursor = daysBeforeOf(cursor, 1);
			continue;
		}
		// Gap. Measure how many consecutive days are missing (spending at most
		// the tokens we hold) and only bridge when real or frozen history
		// resumes right behind the gap — never burn tokens padding an empty past.
		let gapLen = 0;
		let probe = cursor;
		while (gapLen < freezesLeft) {
			const k = localDateKeyOf(probe);
			if (activeDays.has(k) || frozenDays.has(k)) break;
			gapLen += 1;
			probe = daysBeforeOf(probe, 1);
		}
		const behindKey = localDateKeyOf(probe);
		const chainResumes =
			gapLen > 0 && (activeDays.has(behindKey) || frozenDays.has(behindKey));
		if (chainResumes) {
			for (let g = 0; g < gapLen; g++) {
				newlyFrozen.push(localDateKeyOf(cursor));
				cursor = daysBeforeOf(cursor, 1);
			}
			freezesLeft -= gapLen;
			continue;
		}
		break;
	}

	return { current, activeToday, freezesLeft, newlyFrozen };
}

export interface FreezeEarnInput {
	/** Current streak, as returned by walkStreak. */
	current: number;
	/** Streak length at which the last token was earned (0 = never). */
	lastEarnMilestone: number;
	/** Tokens currently available. */
	freezesAvailable: number;
}

export interface FreezeEarnResult {
	earned: boolean;
	freezes: number;
	lastEarnMilestone: number;
}

/** Earn one token when the streak crosses a new multiple of 7 (max 2 held). */
export function earnFreezeIfDue(input: FreezeEarnInput): FreezeEarnResult {
	const milestone =
		Math.floor(Math.max(0, input.current) / FREEZE_EARN_INTERVAL) * FREEZE_EARN_INTERVAL;
	const last = Math.max(0, input.lastEarnMilestone);
	const have = Math.max(0, Math.min(MAX_FREEZES, input.freezesAvailable));
	if (milestone >= FREEZE_EARN_INTERVAL && milestone > last) {
		if (have < MAX_FREEZES) {
			return { earned: true, freezes: have + 1, lastEarnMilestone: milestone };
		}
		// Full stash: still advance the marker so the same milestone can't
		// retro-pay after a token is spent.
		return { earned: false, freezes: have, lastEarnMilestone: milestone };
	}
	return { earned: false, freezes: have, lastEarnMilestone: last };
}

/**
 * Highest milestone reached by `current` that hasn't been celebrated yet,
 * or null when there is nothing new to celebrate.
 */
export function nextMilestoneToCelebrate(
	current: number,
	alreadyCelebrated: number
): number | null {
	let due: number | null = null;
	for (const m of STREAK_MILESTONES) {
		if (current >= m && m > alreadyCelebrated) due = m;
	}
	return due;
}
