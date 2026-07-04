<script lang="ts">
	// V10 — full-screen level-up celebration (QuizVictory-style overlay).
	// Shown by GamificationLayer when the level derived from total XP rises.
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { fireConfettiEvent } from '$lib/components/events';
	import { progressToNext } from '$lib/gamification/levels';
	import { playSfx, vibrate } from '$lib/gamification/sound';

	interface Props {
		level: number;
		xpTotal: number;
		mascotEmoji?: string;
		onclose?: () => void;
	}
	let { level, xpTotal, mascotEmoji = '🐷', onclose }: Props = $props();

	const progress = $derived(progressToNext(xpTotal));
	let primaryEl = $state<HTMLButtonElement | null>(null);

	onMount(() => {
		fireConfettiEvent({ count: 160, origin: 'center' });
		playSfx('levelup');
		vibrate('success');
		requestAnimationFrame(() => primaryEl?.focus());
	});

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') onclose?.();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="levelup-overlay" role="dialog" aria-modal="true" aria-labelledby="levelup-title">
	<div class="levelup-card">
		<span class="mascot" aria-hidden="true">{mascotEmoji}</span>
		<p class="eyebrow">{$t('levelup.eyebrow', { default: 'Subiste de nível!' })}</p>
		<h2 id="levelup-title" class="title">
			{$t('levelup.title', { values: { level }, default: 'Nível {level}!' })}
		</h2>
		<p class="subtitle">
			{$t('levelup.subtitle', {
				values: { xp: progress.nextAt },
				default: 'Continua assim — próximo nível aos {xp} XP.'
			})}
		</p>
		<div
			class="bar-wrap"
			role="progressbar"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={progress.pct}
			aria-label={$t('levelup.progress.aria', { default: 'Progresso para o próximo nível' })}
		>
			<div class="bar" style="width: {progress.pct}%"></div>
		</div>
		<button type="button" class="cta" bind:this={primaryEl} onclick={() => onclose?.()}>
			{$t('levelup.cta', { default: 'Continuar' })}
		</button>
	</div>
</div>

<style>
	.levelup-overlay {
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

	.levelup-card {
		width: min(380px, 100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.65rem;
		padding: calc(var(--space-4, 1rem) * 1.4) var(--space-4, 1rem);
		text-align: center;
		background: var(--card, #22314f);
		border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
		border-radius: var(--radius-xl, 1rem);
		box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.4));
		animation: victory-pop var(--motion-base, 220ms) cubic-bezier(0.22, 1, 0.36, 1);
	}

	.mascot {
		font-size: 3.4rem;
		line-height: 1;
		animation: mascot-cheer 900ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.eyebrow {
		margin: 0;
		font-size: var(--fs-xs, 0.78rem);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--accent, #ec4899);
		font-weight: 700;
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

	.bar-wrap {
		width: 100%;
		height: 10px;
		background: var(--bg-elev, rgba(255, 255, 255, 0.08));
		border-radius: 999px;
		overflow: hidden;
	}

	.bar {
		height: 100%;
		background: var(--accent, #ec4899);
		border-radius: 999px;
		transition: width 900ms cubic-bezier(0.22, 1, 0.36, 1);
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
