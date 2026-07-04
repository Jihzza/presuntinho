<script lang="ts">
	// V10 — first-class streak flame for the top nav.
	// Grey until today's first activity; ignites (animation + whoosh handled by
	// GamificationLayer) once the day is earned. Click opens a popover with the
	// week circles, freeze tokens and best streak.
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import {
		getActivityStreak,
		getWeekActivity,
		type ActivityStreak,
		type WeekDayActivity
	} from '$lib/gamification/streak';
	import { XP_CHANGED_EVENT } from '$lib/state/xp-actions';
	import { STREAK_CHANGED_EVENT, FLAME_IGNITED_EVENT } from '$lib/gamification/gamification-events';
	import WeekCircles from './WeekCircles.svelte';

	let streak = $state<ActivityStreak | null>(null);
	let week = $state<WeekDayActivity[]>([]);
	let open = $state(false);
	let igniting = $state(false);
	let panelEl = $state<HTMLDivElement | null>(null);
	let buttonEl = $state<HTMLButtonElement | null>(null);

	const lit = $derived(Boolean(streak?.activeToday));
	const count = $derived(streak?.current ?? 0);

	async function refresh(): Promise<void> {
		if (typeof indexedDB === 'undefined') return;
		try {
			streak = await getActivityStreak();
			if (open) week = await getWeekActivity();
		} catch (e) {
			console.warn('[streak-flame] refresh failed', e);
		}
	}

	async function toggle(): Promise<void> {
		open = !open;
		if (open) {
			try {
				week = await getWeekActivity();
			} catch {
				week = [];
			}
		}
	}

	function onDocClick(e: MouseEvent): void {
		if (!open) return;
		const target = e.target as Node;
		if (panelEl?.contains(target) || buttonEl?.contains(target)) return;
		open = false;
	}

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape' && open) {
			open = false;
			buttonEl?.focus();
		}
	}

	function onIgnited(): void {
		igniting = true;
		setTimeout(() => (igniting = false), 900);
		void refresh();
	}

	onMount(() => {
		void refresh();
		const onXp = () => void refresh();
		const onStreak = () => void refresh();
		window.addEventListener(XP_CHANGED_EVENT, onXp);
		window.addEventListener(STREAK_CHANGED_EVENT, onStreak);
		window.addEventListener(FLAME_IGNITED_EVENT, onIgnited);
		document.addEventListener('click', onDocClick);
		window.addEventListener('keydown', onKeydown);
		const onVisible = () => {
			if (document.visibilityState === 'visible') void refresh();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			window.removeEventListener(XP_CHANGED_EVENT, onXp);
			window.removeEventListener(STREAK_CHANGED_EVENT, onStreak);
			window.removeEventListener(FLAME_IGNITED_EVENT, onIgnited);
			document.removeEventListener('click', onDocClick);
			window.removeEventListener('keydown', onKeydown);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});
</script>

<div class="flame-wrap">
	<button
		type="button"
		class="flame-btn"
		class:lit
		class:igniting
		bind:this={buttonEl}
		onclick={toggle}
		aria-expanded={open}
		aria-haspopup="dialog"
		aria-label={lit
			? $t('streak.flame.aria.lit', {
					values: { count },
					default: 'Streak: {count} dias — hoje já contou!'
				})
			: $t('streak.flame.aria.unlit', {
					values: { count },
					default: 'Streak: {count} dias — faz uma atividade hoje para manter'
				})}
		title={lit
			? $t('streak.flame.title.lit', { default: 'Hoje já contou! 🔥' })
			: $t('streak.flame.title.unlit', { default: 'Ainda sem atividade hoje' })}
	>
		<span class="flame-emoji" aria-hidden="true">🔥</span>
		<span class="flame-count" aria-hidden="true">{count}</span>
	</button>

	{#if open}
		<div
			class="flame-panel"
			bind:this={panelEl}
			role="dialog"
			aria-label={$t('streak.popover.title', { default: 'A tua streak' })}
		>
			<p class="panel-title">
				<span aria-hidden="true">🔥</span>
				{$t('streak.popover.days', { values: { count }, default: '{count} dias seguidos' })}
			</p>
			<p class="panel-status" class:ok={lit}>
				{lit
					? $t('streak.popover.active_today', { default: 'Hoje já contou — a chama está acesa!' })
					: $t('streak.popover.idle_today', {
							default: 'Faz uma atividade hoje para acender a chama.'
						})}
			</p>
			<WeekCircles {week} />
			<div class="panel-meta">
				<span class="meta-chip">
					<span aria-hidden="true">❄️</span>
					{$t('streak.popover.freezes', {
						values: { count: streak?.freezes ?? 0 },
						default: '{count} congelamentos'
					})}
				</span>
				<span class="meta-chip">
					<span aria-hidden="true">🏆</span>
					{$t('streak.popover.best', {
						values: { count: streak?.best ?? 0 },
						default: 'melhor: {count}'
					})}
				</span>
			</div>
			<p class="panel-hint">
				{$t('streak.popover.freezes.hint', {
					default: 'Um congelamento protege a streak num dia falhado. Ganhas 1 a cada 7 dias.'
				})}
			</p>
			<a class="panel-link" href="/streaks/" onclick={() => (open = false)}>
				{$t('streak.popover.full_page', { default: 'Ver página completa →' })}
			</a>
		</div>
	{/if}
</div>

<style>
	.flame-wrap {
		position: relative;
	}

	.flame-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.55rem;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: var(--radius-md, 0.5rem);
		background: transparent;
		color: var(--txt, #fff);
		cursor: pointer;
		transition:
			background var(--motion-fast, 120ms) ease,
			transform var(--motion-fast, 120ms) ease;
	}

	.flame-btn:hover {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
	}

	.flame-emoji {
		font-size: 1.1rem;
		filter: grayscale(1) opacity(0.55);
		transition: filter var(--motion-base, 220ms) ease;
	}

	.flame-btn.lit .flame-emoji {
		filter: none;
	}

	.flame-btn.igniting .flame-emoji {
		animation: flame-ignite 900ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.flame-count {
		font-size: var(--fs-sm, 0.9rem);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.flame-panel {
		position: absolute;
		top: calc(100% + 8px);
		/* Logical property so the panel anchors correctly under RTL (ar). */
		inset-inline-end: 0;
		z-index: 80;
		width: min(290px, calc(100vw - 2rem));
		padding: var(--space-3, 0.75rem);
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		background: var(--card, #22314f);
		border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
		border-radius: var(--radius-lg, 0.75rem);
		box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.4));
		animation: flame-panel-in var(--motion-base, 220ms) ease;
	}

	.panel-title {
		margin: 0;
		font-size: var(--fs-md, 1rem);
		font-weight: 700;
		color: var(--txt, #fff);
	}

	.panel-status {
		margin: 0;
		font-size: var(--fs-xs, 0.78rem);
		color: var(--txt2, #cbd5e1);
	}

	.panel-status.ok {
		color: var(--success, #10b981);
	}

	.panel-meta {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.meta-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.25rem 0.55rem;
		font-size: var(--fs-xs, 0.78rem);
		color: var(--txt2, #cbd5e1);
		background: var(--bg-elev, rgba(255, 255, 255, 0.06));
		border-radius: 999px;
	}

	.panel-hint {
		margin: 0;
		font-size: var(--fs-xs, 0.78rem);
		color: var(--txt3, #94a3b8);
		line-height: 1.4;
	}

	.panel-link {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--accent, #ec4899);
		font-size: var(--fs-sm, 0.85rem);
		font-weight: 700;
		text-decoration: none;
	}

	.panel-link:hover,
	.panel-link:focus-visible {
		text-decoration: underline;
		outline: none;
	}

	@keyframes flame-ignite {
		0% {
			transform: scale(1);
		}
		35% {
			transform: scale(1.55) rotate(-8deg);
		}
		65% {
			transform: scale(1.25) rotate(6deg);
		}
		100% {
			transform: scale(1);
		}
	}

	@keyframes flame-panel-in {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 480px) {
		.flame-count {
			font-size: var(--fs-xs, 0.78rem);
		}

		.flame-btn {
			padding: 0 0.4rem;
		}
	}

	/* Narrow screens (both LTR and RTL): pin the panel to the viewport so it
	   can never clip off-screen when the header row is tight. */
	@media (max-width: 520px) {
		.flame-panel {
			position: fixed;
			top: 4.2rem;
			inset-inline: 1rem;
			width: auto;
		}
	}
</style>
