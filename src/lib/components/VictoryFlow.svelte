<script lang="ts">
	// V10 — Duolingo-style victory PARADE: a queue of 2–4 full-screen cards.
	//   1. splash   — mascot cheer + title (+ accuracy ring for quizzes)
	//   2. rewards  — XP breakdown, one line at a time, total counting up
	//   3. streak   — flame + week circles + daily-quest progress, final CTAs
	// Used by QuizRunner (quiz context) and by GamificationLayer for the
	// "all habits done" and "trabalho entregue" celebrations.
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { fireConfettiEvent, prefersReducedMotion } from '$lib/components/events';
	import { playSfx, vibrate } from '$lib/gamification/sound';
	import {
		getActivityStreak,
		getWeekActivity,
		type ActivityStreak,
		type WeekDayActivity
	} from '$lib/gamification/streak';
	import { peekDailyQuests } from '$lib/gamification/quests';
	import { getActiveMascot, DEFAULT_MASCOT_ID, mascotById } from '$lib/gamification/mascots';
	import { nextLesson, type NextLessonTarget } from '$lib/escola/progress';
	import { schoolCourses, courseForUnit } from '$lib/escola/catalog';
	import WeekCircles from './WeekCircles.svelte';
	import PigMascot from './PigMascot.svelte';

	export interface XpEntry {
		label: string;
		amount: number;
	}

	interface Props {
		context: 'quiz' | 'habits' | 'trabalho';
		title: string;
		mascotLine?: string;
		/** Quiz accuracy ring (card 1). */
		correct?: number;
		total?: number;
		/** Reward lines for card 2 (empty → card skipped). */
		xpEntries?: XpEntry[];
		/** Perfect-quiz style celebration (confetti + fanfare on card 1). */
		celebrate?: boolean;
		confettiCount?: number;
		/** Quiz-only CTAs. */
		courseSlug?: string;
		wrongCount?: number;
		onretry?: () => void;
		onclose?: () => void;
	}

	let {
		context,
		title,
		mascotLine = '',
		correct = 0,
		total = 0,
		xpEntries = [],
		celebrate = true,
		confettiCount = 80,
		courseSlug,
		wrongCount = 0,
		onretry,
		onclose
	}: Props = $props();

	type CardKind = 'splash' | 'rewards' | 'streak';
	const cards = $derived.by<CardKind[]>(() => {
		const list: CardKind[] = ['splash'];
		if (xpEntries.length > 0) list.push('rewards');
		list.push('streak');
		return list;
	});
	let cardIndex = $state(0);
	const card = $derived(cards[Math.min(cardIndex, cards.length - 1)]);

	let mascotEmoji = $state(mascotById(DEFAULT_MASCOT_ID)?.emoji ?? '🐷');
	let streak = $state<ActivityStreak | null>(null);
	let week = $state<WeekDayActivity[]>([]);
	let questsDone = $state(0);
	let questsTotal = $state(3);
	let next = $state<NextLessonTarget | null>(null);
	let primaryEl = $state<HTMLElement | null>(null);
	let mounted = $state(false);

	// Accuracy ring (quiz card 1).
	const percent = $derived(total > 0 ? Math.round((correct / total) * 100) : 0);
	const R = 52;
	const CIRC = 2 * Math.PI * R;
	const dash = $derived(mounted ? (percent / 100) * CIRC : 0);

	// Card 2 — staggered reward lines + count-up total.
	const xpTotal = $derived(xpEntries.reduce((s, e) => s + e.amount, 0));
	let visibleEntries = $state(0);
	let displayTotal = $state(0);
	let rewardTimers: ReturnType<typeof setTimeout>[] = [];
	let countRaf = 0;

	function clearRewardsAnimation(): void {
		rewardTimers.forEach(clearTimeout);
		rewardTimers = [];
		cancelAnimationFrame(countRaf);
	}

	function runRewardsAnimation(): void {
		clearRewardsAnimation();
		if (prefersReducedMotion()) {
			visibleEntries = xpEntries.length;
			displayTotal = xpTotal;
			return;
		}
		visibleEntries = 0;
		displayTotal = 0;
		const stagger = 220;
		xpEntries.forEach((_, i) => {
			rewardTimers.push(
				setTimeout(() => {
					visibleEntries = i + 1;
					playSfx('correct');
				}, 200 + i * stagger)
			);
		});
		const start = performance.now() + 200 + xpEntries.length * stagger;
		const DUR = 800;
		const tick = (now: number) => {
			const p = Math.max(0, Math.min(1, (now - start) / DUR));
			const eased = 1 - Math.pow(1 - p, 3);
			displayTotal = Math.round(xpTotal * eased);
			if (p < 1) countRaf = requestAnimationFrame(tick);
		};
		countRaf = requestAnimationFrame(tick);
	}

	function advanceCard(): void {
		if (cardIndex < cards.length - 1) {
			cardIndex += 1;
			if (cards[cardIndex] === 'rewards') runRewardsAnimation();
			requestAnimationFrame(() => primaryEl?.focus());
		} else {
			onclose?.();
		}
	}

	function resolveCourseSlug(slug: string | undefined): string | null {
		if (!slug) return null;
		if (schoolCourses.some((c) => c.slug === slug)) return slug;
		return courseForUnit(slug)?.slug ?? null;
	}

	onMount(() => {
		if (celebrate) {
			fireConfettiEvent({ count: confettiCount, origin: 'center' });
			playSfx('fanfare');
			vibrate('success');
		} else {
			playSfx(percent >= 70 ? 'correct' : 'wrong');
		}

		void (async () => {
			try {
				mascotEmoji = (await getActiveMascot()).emoji;
			} catch {
				// keep default
			}
			try {
				streak = await getActivityStreak();
				week = await getWeekActivity();
			} catch (e) {
				console.warn('[victoryflow] streak read failed', e);
			}
			try {
				// READ-ONLY peek — getDailyQuests() here would consume the
				// once-per-day 3/3 chest flag on pages without the quests card.
				const q = await peekDailyQuests();
				questsDone = q.quests.filter((x) => x.done).length;
				questsTotal = q.quests.length || 3;
			} catch {
				// quests card degrades to streak-only
			}
			const target = resolveCourseSlug(courseSlug);
			if (target) {
				try {
					next = await nextLesson(target);
				} catch {
					next = null;
				}
			}
		})();

		const raf = requestAnimationFrame(() => {
			mounted = true;
			primaryEl?.focus();
		});
		return () => {
			cancelAnimationFrame(raf);
			clearRewardsAnimation();
		};
	});

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onclose?.();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div
	class="victory-overlay"
	role="dialog"
	aria-modal="true"
	aria-label={$t('victoryflow.aria', { default: 'Celebração' })}
>
	<div class="flow-card">
		<div class="steps" aria-hidden="true">
			{#each cards as c, i (c)}
				<span class="step" class:on={i <= cardIndex}></span>
			{/each}
		</div>

		{#if card === 'splash'}
			<div class="mascot" aria-hidden="true">
				<PigMascot emotion={celebrate ? 'euphoric' : 'happy'} size={76} />
				{#if mascotEmoji !== '🐷'}
					<span class="mascot-companion">{mascotEmoji}</span>
				{/if}
			</div>
			<h2 class="v-title">{title}</h2>
			{#if mascotLine}
				<p class="v-line">{mascotLine}</p>
			{/if}
			{#if context === 'quiz' && total > 0}
				<div
					class="ring-wrap"
					role="img"
					aria-label={$t('quizvictory.accuracy_aria', {
						values: { percent },
						default: 'Precisão: {percent}%'
					})}
				>
					<svg viewBox="0 0 128 128" class="ring" aria-hidden="true">
						<circle class="ring-track" cx="64" cy="64" r={R} />
						<circle class="ring-fill" cx="64" cy="64" r={R} style="stroke-dasharray: {dash} {CIRC};" />
					</svg>
					<div class="ring-center">
						<strong class="ring-percent">{percent}%</strong>
						<small class="ring-score">
							{$t('quizvictory.score', { values: { correct, total }, default: '{correct} de {total}' })}
						</small>
					</div>
				</div>
			{/if}
			<button type="button" class="cta primary" bind:this={primaryEl} onclick={advanceCard}>
				{$t('victoryflow.cta.continue', { default: 'Continuar →' })}
			</button>
		{:else if card === 'rewards'}
			<h2 class="v-title">{$t('victoryflow.rewards.title', { default: 'Recompensas' })}</h2>
			<ul class="xp-list">
				{#each xpEntries as entry, i (entry.label)}
					<li class="xp-line" class:shown={i < visibleEntries}>
						<span>{entry.label}</span>
						<strong>{$t('victoryflow.rewards.line', {
							values: { n: entry.amount },
							default: '+{n} XP'
						})}</strong>
					</li>
				{/each}
			</ul>
			<p class="xp-total">
				<span aria-hidden="true">⚡</span>
				{$t('victoryflow.rewards.total', { values: { n: displayTotal }, default: '+{n} XP' })}
			</p>
			<button type="button" class="cta primary" bind:this={primaryEl} onclick={advanceCard}>
				{$t('victoryflow.cta.continue', { default: 'Continuar →' })}
			</button>
		{:else}
			<div class="flame-big" class:lit={streak?.activeToday} aria-hidden="true">🔥</div>
			<h2 class="v-title">
				{$t('victoryflow.streak.title', {
					values: { n: streak?.current ?? 0 },
					default: '{n} dias seguidos'
				})}
			</h2>
			{#if week.length > 0}
				<WeekCircles {week} />
			{/if}
			<div
				class="quests-progress"
				role="progressbar"
				aria-valuemin="0"
				aria-valuemax={questsTotal}
				aria-valuenow={questsDone}
				aria-label={$t('victoryflow.quests.aria', { default: 'Missões diárias' })}
			>
				<span class="quests-label">
					{$t('victoryflow.quests.label', {
						values: { done: questsDone, total: questsTotal },
						default: 'Missões diárias: {done}/{total}'
					})}
				</span>
				<div class="quests-bar-wrap">
					<div class="quests-bar" style="width: {questsTotal ? (questsDone / questsTotal) * 100 : 0}%"></div>
				</div>
			</div>
			<div class="ctas">
				{#if context === 'quiz'}
					{#if next}
						<a class="cta primary" href={next.href} bind:this={primaryEl}>
							{$t('quizvictory.cta.next', { default: 'Próxima lição →' })}
						</a>
					{:else}
						<a class="cta primary" href="/escola/" bind:this={primaryEl}>
							{$t('quizvictory.cta.escola', { default: '← Escola' })}
						</a>
					{/if}
					{#if wrongCount > 0}
						<button type="button" class="cta" onclick={() => onclose?.()}>
							{$t('quizvictory.cta.review', { values: { n: wrongCount }, default: 'Rever erros ({n})' })}
						</button>
					{:else}
						<button type="button" class="cta" onclick={() => onclose?.()}>
							{$t('quizvictory.cta.close', { default: 'Fechar' })}
						</button>
					{/if}
					{#if onretry}
						<button type="button" class="cta ghost" onclick={() => onretry?.()}>
							{$t('quizvictory.cta.retry', { default: 'Tentar novamente' })}
						</button>
					{/if}
				{:else}
					<button type="button" class="cta primary" bind:this={primaryEl} onclick={() => onclose?.()}>
						{$t('quizvictory.cta.close', { default: 'Fechar' })}
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	/* V10.2 — em mobile a celebração é uma PÁGINA inteira (como no Duolingo):
	   conteúdo centrado, CTAs ancorados em baixo. Em ecrãs largos volta a
	   ser um cartão centrado. */
	.victory-overlay {
		position: fixed;
		inset: 0;
		z-index: 9000;
		display: grid;
		place-items: stretch;
		padding: 0;
		background: var(--bg, #0b1020);
		animation: victory-fade var(--motion-base, 220ms) ease both;
	}

	.flow-card {
		width: 100%;
		height: 100dvh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.8rem;
		text-align: center;
		padding: calc(1.2rem + env(safe-area-inset-top)) 1.4rem calc(1.4rem + env(safe-area-inset-bottom));
		background: var(--card, #22314f);
		animation: victory-pop var(--motion-base, 220ms) cubic-bezier(0.22, 1, 0.36, 1);
	}

	.flow-card > .steps {
		margin-bottom: auto;
		padding-top: 0.4rem;
	}

	.flow-card > .ctas,
	.flow-card > .cta {
		margin-top: auto;
	}

	@media (min-width: 640px) {
		.victory-overlay {
			place-items: center;
			padding: var(--space-4, 1rem);
			background: color-mix(in srgb, var(--bg, #0b1020) 78%, transparent);
			backdrop-filter: blur(6px);
		}

		.flow-card {
			width: min(430px, 100%);
			height: auto;
			max-height: calc(100vh - 2rem);
			justify-content: flex-start;
			padding: 1.4rem 1.4rem 1.3rem;
			border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
			border-radius: var(--radius-xl, 1rem);
			box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.4));
		}

		.flow-card > .steps {
			margin-bottom: 0;
		}

		.flow-card > .ctas,
		.flow-card > .cta {
			margin-top: 0;
		}
	}

	.steps {
		display: flex;
		gap: 0.35rem;
	}

	.step {
		width: 26px;
		height: 5px;
		border-radius: 999px;
		background: var(--bg-elev, rgba(255, 255, 255, 0.1));
	}

	.step.on {
		background: var(--accent, #ec4899);
	}

	.mascot {
		position: relative;
		line-height: 1;
		animation: mascot-cheer 900ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.mascot-companion {
		position: absolute;
		right: -10px;
		bottom: 0;
		font-size: 1.4rem;
	}

	.v-title {
		margin: 0;
		font-size: var(--fs-xl, 1.4rem);
		color: var(--txt, #fff);
	}

	.v-line {
		margin: 0;
		font-size: var(--fs-sm, 0.9rem);
		color: var(--txt2, #cbd5e1);
	}

	.ring-wrap {
		position: relative;
		width: 128px;
		height: 128px;
	}

	.ring {
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}

	.ring-track {
		fill: none;
		stroke: var(--bg-elev, rgba(255, 255, 255, 0.08));
		stroke-width: 10;
	}

	.ring-fill {
		fill: none;
		stroke: var(--accent, #ec4899);
		stroke-width: 10;
		stroke-linecap: round;
		transition: stroke-dasharray 900ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.ring-center {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.1rem;
	}

	.ring-percent {
		font-size: var(--fs-xl, 1.4rem);
		color: var(--txt, #fff);
	}

	.ring-score {
		font-size: var(--fs-xs, 0.75rem);
		color: var(--txt3, #94a3b8);
	}

	.xp-list {
		list-style: none;
		margin: 0;
		padding: 0;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.xp-line {
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
		padding: 0.5rem 0.75rem;
		background: var(--bg-elev, rgba(255, 255, 255, 0.06));
		border-radius: var(--radius-md, 0.5rem);
		font-size: var(--fs-sm, 0.9rem);
		color: var(--txt2, #cbd5e1);
		opacity: 0;
		transform: translateY(6px);
		transition:
			opacity var(--motion-base, 220ms) ease,
			transform var(--motion-base, 220ms) ease;
	}

	.xp-line.shown {
		opacity: 1;
		transform: translateY(0);
	}

	.xp-line strong {
		color: var(--accent, #ec4899);
		font-variant-numeric: tabular-nums;
	}

	.xp-total {
		margin: 0.2rem 0 0;
		font-size: var(--fs-xl, 1.4rem);
		font-weight: 800;
		color: var(--txt, #fff);
		font-variant-numeric: tabular-nums;
	}

	.flame-big {
		font-size: 3.2rem;
		line-height: 1;
		filter: grayscale(1) opacity(0.55);
	}

	.flame-big.lit {
		filter: none;
		animation: mascot-cheer 900ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.quests-progress {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.quests-label {
		font-size: var(--fs-xs, 0.78rem);
		color: var(--txt2, #cbd5e1);
	}

	.quests-bar-wrap {
		width: 100%;
		height: 8px;
		background: var(--bg-elev, rgba(255, 255, 255, 0.08));
		border-radius: 999px;
		overflow: hidden;
	}

	.quests-bar {
		height: 100%;
		background: var(--success, #10b981);
		border-radius: 999px;
		transition: width var(--motion-base, 220ms) ease;
	}

	.ctas {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
		margin-top: 0.3rem;
	}

	.cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 0 1.2rem;
		font-size: var(--fs-md, 1rem);
		font-weight: 700;
		color: var(--txt, #fff);
		background: var(--bg-elev, rgba(255, 255, 255, 0.06));
		border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
		border-radius: var(--radius-lg, 0.75rem);
		cursor: pointer;
		text-decoration: none;
		transition: transform var(--motion-fast, 120ms) ease;
	}

	.cta.primary {
		color: var(--on-accent, #fff);
		background: var(--accent, #ec4899);
		border-color: transparent;
	}

	.cta.ghost {
		background: transparent;
	}

	.cta:hover {
		transform: translateY(-1px);
	}

	@keyframes victory-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes victory-pop {
		from {
			opacity: 0;
			transform: scale(0.92) translateY(14px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	@keyframes mascot-cheer {
		0% {
			transform: scale(0.4) rotate(-12deg);
		}
		55% {
			transform: scale(1.18) rotate(6deg);
		}
		100% {
			transform: scale(1) rotate(0deg);
		}
	}
</style>
