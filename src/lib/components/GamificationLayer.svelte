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
	import { XP_CHANGED_EVENT, initXpBoost } from '$lib/state/xp-actions';
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
		BADGE_UNLOCKED_EVENT,
		FLAME_IGNITED_EVENT,
		LEVEL_UP_EVENT,
		STREAK_CHANGED_EVENT
	} from '$lib/gamification/gamification-events';
	import { DEFAULT_MASCOT_ID, getActiveMascot, MASCOT_CHANGED_EVENT } from '$lib/gamification/mascots';
	import { awardBadge } from '$lib/state/stores';
	import { db } from '$lib/state/db';
	import { claimHabitsFlowDay, claimStreakNotifDay } from '$lib/gamification/streak';
	import { allDueHabitsDoneToday } from '$lib/habitos';
	import { hoursUntilMidnight, mascotEmotion } from '$lib/gamification/emotion';
	import { minutesSinceLastAction } from '$lib/gamification/gamification-events';
	import {
		applyMascotFavicon,
		applyTitlePrefix,
		notifPermission,
		readNotifStreakEnabled,
		showStreakRiskNotification,
		STREAK_NOTIF_FALLBACKS,
		STREAK_NOTIF_VARIANTS
	} from '$lib/gamification/presence';
	import { get as getStore } from 'svelte/store';
	import { t } from 'svelte-i18n';
	import LevelUpModal from './LevelUpModal.svelte';
	import StreakMilestoneModal from './StreakMilestoneModal.svelte';
	import BadgeUnlockModal from './BadgeUnlockModal.svelte';
	import VictoryFlow from './VictoryFlow.svelte';

	type Celebration =
		| { kind: 'levelup'; level: number; xpTotal: number }
		| { kind: 'milestone'; milestone: number; earnedFreeze: boolean }
		| { kind: 'badge'; badgeId: string }
		| { kind: 'flow'; context: 'habits' | 'trabalho'; amount: number };

	let queue = $state<Celebration[]>([]);
	let active = $state<Celebration | null>(null);
	let mascotId = $state(DEFAULT_MASCOT_ID);

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
		// Never fight a QuizVictory/chest overlay for the screen/focus — defer
		// the celebration until it closes so the parade order stays sensible.
		if (
			typeof document !== 'undefined' &&
			document.querySelector('.victory-overlay, .chest-overlay')
		) {
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
			// b1 "Primeiros Passos": first XP-earning action ever (idempotent).
			void awardBadge('b1');
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
			// b6 "Exploradora": 8+ distinct PAGES visited — lesson markers
			// ('lesson:'/'lesson-done:') and path chests are progress rows,
			// not exploration.
			try {
				const pages = await db()
					.visited.filter(
						(v) =>
							typeof v.id === 'string' &&
							!/^(lesson[:-]|path-chest:)/.test(v.id) &&
							v.visitedAt > 0
					)
					.count();
				if (pages >= 8) void awardBadge('b6');
			} catch {
				// non-fatal
			}
			// Victory parades: "all habits done" (once per day) and
			// "trabalho entregue" (every submission deserves the parade).
			// `delta` is the amount ACTUALLY paid (assignment xpReward varies
			// 15–150, and any active boost is already applied).
			if (reason === 'habito_mark_done' || reason === 'habito_log_today') {
				try {
					if ((await allDueHabitsDoneToday()) && (await claimHabitsFlowDay())) {
						enqueue({ kind: 'flow', context: 'habits', amount: delta });
					}
				} catch {
					// non-fatal
				}
			}
			if (reason === 'assignment_status_done') {
				enqueue({ kind: 'flow', context: 'trabalho', amount: delta });
			}
		} catch (err) {
			console.warn('[gamification-layer] streak refresh failed', err);
		} finally {
			processing = false;
		}
	}

	function onBadgeUnlocked(e: Event): void {
		const id = (e as CustomEvent<{ id?: string }>).detail?.id;
		if (typeof id === 'string' && id) {
			enqueue({ kind: 'badge', badgeId: id });
		}
	}

	// ── presence: favicon/título emocional + notificação de streak em risco ──
	async function presenceTick(): Promise<void> {
		if (!hydrated) return;
		try {
			const streak = await getActivityStreak();
			const emotion = mascotEmotion({
				streakCurrent: streak.current,
				streakBest: streak.best,
				activeToday: streak.activeToday,
				hoursUntilMidnight: hoursUntilMidnight(),
				minutesSinceLastAction: minutesSinceLastAction()
			});
			applyMascotFavicon(emotion);
			applyTitlePrefix(emotion);

			// Local notification (page open): evening, streak alive, day idle,
			// user opted in via /definicoes, permission granted — once per day.
			const evening = new Date().getHours() >= 20;
			if (
				evening &&
				!streak.activeToday &&
				streak.current > 0 &&
				notifPermission() === 'granted' &&
				(await readNotifStreakEnabled()) &&
				(await claimStreakNotifDay())
			) {
				const v = 1 + Math.floor(Math.random() * STREAK_NOTIF_VARIANTS);
				const body = getStore(t)(`notif.streak.v${v}`, {
					default: STREAK_NOTIF_FALLBACKS[v - 1]
				});
				showStreakRiskNotification(body);
			}
		} catch (e) {
			console.warn('[gamification-layer] presence tick failed', e);
		}
	}

	onMount(() => {
		// Sound prefs + celebrations only after the session profile's stores
		// are hydrated (initStores is idempotent) — avoids reading the wrong
		// profile's DB and false level-ups from pre-hydration XP values.
		void initStores().then(() => {
			hydrated = true;
			void initSoundPrefs();
			void initXpBoost();
			void presenceTick();
		});
		// Emotion depends on the clock (worried evenings) — refresh per minute.
		const presenceTimer = setInterval(() => void presenceTick(), 60_000);
		void getActiveMascot()
			.then((m) => (mascotId = m.id))
			.catch(() => undefined);
		const onMascotChanged = (e: Event) => {
			const id = (e as CustomEvent<{ id?: string }>).detail?.id;
			if (id) mascotId = id;
		};
		window.addEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);
		const handler = (e: Event) => void onXpChanged(e);
		window.addEventListener(XP_CHANGED_EVENT, handler);
		window.addEventListener(BADGE_UNLOCKED_EVENT, onBadgeUnlocked);
		return () => {
			window.removeEventListener(XP_CHANGED_EVENT, handler);
			window.removeEventListener(BADGE_UNLOCKED_EVENT, onBadgeUnlocked);
			window.removeEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);
			clearInterval(presenceTimer);
			if (advanceTimer) clearTimeout(advanceTimer);
		};
	});
</script>

{#if active?.kind === 'levelup'}
	<LevelUpModal
		level={active.level}
		xpTotal={active.xpTotal}
		{mascotId}
		onclose={advance}
	/>
{:else if active?.kind === 'milestone'}
	<StreakMilestoneModal
		milestone={active.milestone}
		earnedFreeze={active.earnedFreeze}
		{mascotId}
		onclose={advance}
	/>
{:else if active?.kind === 'badge'}
	<BadgeUnlockModal badgeId={active.badgeId} onclose={advance} />
{:else if active?.kind === 'flow'}
	<VictoryFlow
		context={active.context}
		title={active.context === 'habits'
			? $t('victoryflow.habits.title', { default: 'Todos os hábitos feitos! 🌱' })
			: $t('victoryflow.trabalho.title', { default: 'Trabalho entregue! 📬' })}
		mascotLine={active.context === 'habits'
			? $t('victoryflow.habits.line', { default: 'Dia impecável — cuidaste de ti do princípio ao fim.' })
			: $t('victoryflow.trabalho.line', { default: 'Mais um da lista — que orgulho!' })}
		xpEntries={[
			{
				label:
					active.context === 'habits'
						? $t('victoryflow.entry.habit_done', { default: 'Hábito concluído' })
						: $t('victoryflow.entry.assignment_done', { default: 'Trabalho entregue' }),
				amount: active.amount
			}
		]}
		onclose={advance}
	/>
{/if}
