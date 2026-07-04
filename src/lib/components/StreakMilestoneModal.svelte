<script lang="ts">
	// V10 — full-screen streak milestone celebration (7/14/30/50/100/365 days).
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { fireConfettiEvent } from '$lib/components/events';
	import { playSfx, vibrate } from '$lib/gamification/sound';
	import WeekCircles from './WeekCircles.svelte';
	import { getWeekActivity, type WeekDayActivity } from '$lib/gamification/streak';

	interface Props {
		milestone: number;
		mascotEmoji?: string;
		/** True when this computation also earned a freeze token. */
		earnedFreeze?: boolean;
		onclose?: () => void;
	}
	let { milestone, mascotEmoji = '🐷', earnedFreeze = false, onclose }: Props = $props();

	let week = $state<WeekDayActivity[]>([]);
	let primaryEl = $state<HTMLButtonElement | null>(null);

	onMount(() => {
		fireConfettiEvent({ count: 200, origin: 'center' });
		playSfx('milestone');
		vibrate('success');
		void getWeekActivity()
			.then((w) => (week = w))
			.catch(() => (week = []));
		requestAnimationFrame(() => primaryEl?.focus());
	});

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') onclose?.();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="milestone-overlay" role="dialog" aria-modal="true" aria-labelledby="milestone-title">
	<div class="milestone-card">
		<span class="flame" aria-hidden="true">🔥</span>
		<h2 id="milestone-title" class="title">
			{$t('streak.milestone.title', {
				values: { days: milestone },
				default: '{days} dias seguidos!'
			})}
		</h2>
		<p class="subtitle">
			<span aria-hidden="true">{mascotEmoji}</span>
			{$t('streak.milestone.subtitle', {
				default: 'Incrível! A tua dedicação está a dar frutos.'
			})}
		</p>
		{#if week.length > 0}
			<WeekCircles {week} />
		{/if}
		{#if earnedFreeze}
			<p class="freeze-note">
				<span aria-hidden="true">❄️</span>
				{$t('streak.milestone.freeze_earned', {
					default: 'Ganhaste um congelamento de streak!'
				})}
			</p>
		{/if}
		<button type="button" class="cta" bind:this={primaryEl} onclick={() => onclose?.()}>
			{$t('streak.milestone.cta', { default: 'Continuar' })}
		</button>
	</div>
</div>

<style>
	.milestone-overlay {
		position: fixed;
		inset: 0;
		/* Below QuizVictory (9000) — GamificationLayer also defers while a
		   victory overlay is open, this is belt-and-braces. */
		z-index: 8900;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4, 1rem);
		background: color-mix(in srgb, var(--bg, #1f2e4a) 72%, transparent);
		backdrop-filter: blur(6px);
		animation: victory-fade var(--motion-base, 220ms) ease;
	}

	.milestone-card {
		width: min(380px, 100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.7rem;
		padding: calc(var(--space-4, 1rem) * 1.4) var(--space-4, 1rem);
		text-align: center;
		background: var(--card, #22314f);
		border: 1px solid color-mix(in srgb, #f97316 55%, transparent);
		border-radius: var(--radius-xl, 1rem);
		box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.4));
		animation: victory-pop var(--motion-base, 220ms) cubic-bezier(0.22, 1, 0.36, 1);
	}

	.flame {
		font-size: 3.6rem;
		line-height: 1;
		animation: milestone-flame 1100ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.title {
		margin: 0;
		font-size: var(--fs-2xl, 1.8rem);
		color: var(--txt, #fff);
	}

	.subtitle {
		margin: 0;
		font-size: var(--fs-sm, 0.9rem);
		color: var(--txt2, #cbd5e1);
	}

	.freeze-note {
		margin: 0;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.7rem;
		font-size: var(--fs-xs, 0.78rem);
		font-weight: 600;
		color: #dbeafe;
		background: color-mix(in srgb, #60a5fa 25%, transparent);
		border-radius: 999px;
	}

	.cta {
		min-height: 44px;
		padding: 0 1.4rem;
		margin-top: 0.35rem;
		font-size: var(--fs-md, 1rem);
		font-weight: 700;
		color: var(--on-accent, #fff);
		background: var(--accent, #ec4899);
		border: none;
		border-radius: var(--radius-lg, 0.75rem);
		cursor: pointer;
		transition: transform var(--motion-fast, 120ms) ease;
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

	@keyframes milestone-flame {
		0% {
			transform: scale(0.3);
			opacity: 0;
		}
		55% {
			transform: scale(1.35) rotate(-6deg);
			opacity: 1;
		}
		100% {
			transform: scale(1) rotate(0deg);
		}
	}
</style>
