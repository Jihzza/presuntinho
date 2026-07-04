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
	import { xp } from '$lib/state/stores';
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

	let knownLevel = 0;
	let processing = false;

	function enqueue(c: Celebration): void {
		queue = [...queue, c];
		if (!active) advance();
	}

	function advance(): void {
		active = queue[0] ?? null;
		queue = queue.slice(1);
	}

	async function onXpChanged(e: Event): Promise<void> {
		const detail = (e as CustomEvent<{ delta?: number; amount?: number; total?: number }>).detail;
		const delta = detail?.delta ?? detail?.amount ?? 0;
		const total = typeof detail?.total === 'number' ? detail.total : get(xp);

		if (delta > 0) {
			registerComboHit();
			playSfx('correct');
			vibrate('tap');
			recordActionPulse();
		} else if (delta < 0) {
			playSfx('wrong');
		}

		// Level-up detection (curve lives in levels.ts).
		const newLevel = level(total);
		if (knownLevel > 0 && newLevel > knownLevel) {
			enqueue({ kind: 'levelup', level: newLevel, xpTotal: total });
			dispatchGamificationEvent(LEVEL_UP_EVENT, { level: newLevel });
		}
		knownLevel = Math.max(knownLevel, newLevel);

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
		void initSoundPrefs();
		knownLevel = level(get(xp));
		const unsubXp = xp.subscribe((v) => {
			// Keeps the baseline honest after initStores() hydration.
			if (knownLevel === 0) knownLevel = level(v);
		});
		void getActiveMascot()
			.then((m) => (mascotEmoji = m.emoji))
			.catch(() => undefined);
		const handler = (e: Event) => void onXpChanged(e);
		window.addEventListener(XP_CHANGED_EVENT, handler);
		return () => {
			window.removeEventListener(XP_CHANGED_EVENT, handler);
			unsubXp();
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
