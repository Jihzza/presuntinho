<script lang="ts">
	// V10 — invisible gamification orchestrator, mounted once in +layout.svelte.
	//
	// On every XP change it:
	//   * plays the correct/wrong chime + tap haptic (combo raises the pitch)
	//   * detects level-ups (levels.ts curve) → LevelUpModal + fanfare
	//   * refreshes the streak → flame ignition (once/day, whoosh) and
	//     milestone celebrations (7/14/30/50/100/365) → StreakMilestoneModal
	// Modals queue so a level-up and a milestone never overlap.
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { xp, initStores } from '$lib/state/stores';
	import { XP_CHANGED_EVENT } from '$lib/state/xp-actions';
	import { level } from '$lib/gamification/levels';
	import {
		claimFlameIgnition,
		claimStreakMilestone,
		getActivityStreak
	} from '$lib/gamification/streak';
	import { initSoundPrefs, playSfx, registerComboHit, vibrate } from '$lib/gamification/sound';
	import {
		dispatchGamificationEvent,
		recordActionPulse,
		FLAME_IGNITED_EVENT,
		LEVEL_UP_EVENT,
		STREAK_CHANGED_EVENT
	} from '$lib/gamification/gamification-events';
	import { getActiveMascot } from '$lib/gamification/mascots';
	import LevelUpModal from './LevelUpModal.svelte';
	import StreakMilestoneModal from './StreakMilestoneModal.svelte';

	type Celebration =
		| { kind: 'levelup'; level: number; xpTotal: number }
		| { kind: 'milestone'; milestone: number; earnedFreeze: boolean };

	let queue = $state<Celebration[]>([]);
	let active = $state<Celebration | null>(null);
	let mascotEmoji = $state('🐷');

	let hydrated = false;
	let processing = false;
	let advanceTimer: ReturnType<typeof setTimeout> | null = null;

	// Sources that play their own celebration SFX — the generic chime/haptic
	// would stack on top of them (level-up/streak detection still runs).
	const SELF_CELEBRATED = new Set([
		'quest_daily_complete',
		'quest_all_daily',
		'quiz_perfect_score',
		'lesson_complete'
	]);

	function enqueue(c: Celebration): void {
		queue = [...queue, c];
		if (!active) advance();
	}

	function advance(): void {
		// Never fight a QuizVictory overlay for the screen/focus — defer the
		// celebration until it closes so the parade order stays sensible.
		if (typeof document !== 'undefined' && document.querySelector('.victory-overlay')) {
			active = null;
			if (advanceTimer) clearTimeout(advanceTimer);
			advanceTimer = setTimeout(() => {
				advanceTimer = null;
				if (!active && queue.length > 0) advance();
			}, 700);
			return;
		}
		active = queue[0] ?? null;
		queue = queue.slice(1);
	}

	async function onXpChanged(e: Event): Promise<void> {
		const detail = (
			e as CustomEvent<{ delta?: number; amount?: number; total?: number; reason?: string; source?: string }>
		).detail;
		const delta = detail?.delta ?? detail?.amount ?? 0;
		const total = typeof detail?.total === 'number' ? detail.total : get(xp);
		const reason = detail?.reason ?? detail?.source ?? '';

		if (delta > 0) {
			registerComboHit();
			recordActionPulse();
			if (!SELF_CELEBRATED.has(reason)) {
				playSfx('correct');
				vibrate('tap');
			}
		} else if (delta < 0) {
			playSfx('wrong');
		}

		// Level-up detection — the baseline comes from the EVENT itself
		// (total is captured after the award, so total - delta is the
		// pre-award XP). No mount-time store race, no hydration guard needed;
		// `hydrated` only blocks the window between mount and initStores().
		if (hydrated && delta > 0) {
			const prevLevel = level(total - delta);
			const newLevel = level(total);
			if (newLevel > prevLevel) {
				enqueue({ kind: 'levelup', level: newLevel, xpTotal: total });
				dispatchGamificationEvent(LEVEL_UP_EVENT, { level: newLevel });
			}
		}

		// Streak side-effects — guarded so a Dexie hiccup never breaks UX.
		if (processing || delta <= 0) return;
		processing = true;
		try {
			const streak = await getActivityStreak();
			dispatchGamificationEvent(STREAK_CHANGED_EVENT);
			if (await claimFlameIgnition()) {
				playSfx('whoosh');
				dispatchGamificationEvent(FLAME_IGNITED_EVENT, { current: streak.current });
			}
			const milestone = await claimStreakMilestone(streak);
			if (milestone !== null) {
				enqueue({ kind: 'milestone', milestone, earnedFreeze: streak.earnedFreeze });
			}
		} catch (err) {
			console.warn('[gamification-layer] streak refresh failed', err);
		} finally {
			processing = false;
		}
	}

	onMount(() => {
		// Sound prefs + celebrations only after the session profile's stores
		// are hydrated (initStores is idempotent) — avoids reading the wrong
		// profile's DB and false level-ups from pre-hydration XP values.
		void initStores().then(() => {
			hydrated = true;
			void initSoundPrefs();
		});
		void getActiveMascot()
			.then((m) => (mascotEmoji = m.emoji))
			.catch(() => undefined);
		const handler = (e: Event) => void onXpChanged(e);
		window.addEventListener(XP_CHANGED_EVENT, handler);
		return () => {
			window.removeEventListener(XP_CHANGED_EVENT, handler);
			if (advanceTimer) clearTimeout(advanceTimer);
		};
	});
</script>

{#if active?.kind === 'levelup'}
	<LevelUpModal
		level={active.level}
		xpTotal={active.xpTotal}
		{mascotEmoji}
		onclose={advance}
	/>
{:else if active?.kind === 'milestone'}
	<StreakMilestoneModal
		milestone={active.milestone}
		earnedFreeze={active.earnedFreeze}
		{mascotEmoji}
		onclose={advance}
	/>
{/if}
