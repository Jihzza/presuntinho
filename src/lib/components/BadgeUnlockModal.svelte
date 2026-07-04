<script lang="ts">
	// V10 — full-screen badge unlock celebration (queued by GamificationLayer).
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { fireConfettiEvent } from '$lib/components/events';
	import { playSfx, vibrate } from '$lib/gamification/sound';
	import {
		badgeDefById,
		BADGE_PT_DESCRIPTIONS,
		BADGE_PT_NAMES,
		TIER_PT_LABELS
	} from '$lib/gamification/badge-catalog';

	interface Props {
		badgeId: string;
		onclose?: () => void;
	}
	let { badgeId, onclose }: Props = $props();

	const def = $derived(badgeDefById(badgeId));
	const name = $derived(
		$t(`components.badge.catalog.${badgeId}.name`, { default: BADGE_PT_NAMES[badgeId] ?? badgeId })
	);
	const description = $derived(
		$t(`components.badge.catalog.${badgeId}.description`, {
			default: BADGE_PT_DESCRIPTIONS[badgeId] ?? ''
		})
	);
	const tierLabel = $derived(
		def?.tier ? $t(`components.badge.tier.${def.tier}`, { default: TIER_PT_LABELS[def.tier] }) : null
	);

	let primaryEl = $state<HTMLButtonElement | null>(null);

	onMount(() => {
		fireConfettiEvent({ count: 120, origin: 'center' });
		playSfx('fanfare');
		vibrate('success');
		requestAnimationFrame(() => primaryEl?.focus());
	});

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') onclose?.();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="badge-overlay" role="dialog" aria-modal="true" aria-labelledby="badge-unlock-title">
	<div class="badge-card">
		<span class="badge-icon" aria-hidden="true">{def?.icon ?? '🏅'}</span>
		<p class="eyebrow">{$t('badgeunlock.eyebrow', { default: 'Nova conquista!' })}</p>
		<h2 id="badge-unlock-title" class="title">{name}</h2>
		{#if tierLabel}
			<span class="tier-chip tier--{def?.tier}">{tierLabel}</span>
		{/if}
		<p class="subtitle">{description}</p>
		<button type="button" class="cta" bind:this={primaryEl} onclick={() => onclose?.()}>
			{$t('badgeunlock.cta', { default: 'Boa!' })}
		</button>
	</div>
</div>

<style>
	.badge-overlay {
		position: fixed;
		inset: 0;
		z-index: 8900;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4, 1rem);
		background: color-mix(in srgb, var(--bg, #1f2e4a) 72%, transparent);
		backdrop-filter: blur(6px);
		animation: victory-fade var(--motion-base, 220ms) ease;
	}

	.badge-card {
		width: min(360px, 100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.55rem;
		padding: calc(var(--space-4, 1rem) * 1.4) var(--space-4, 1rem);
		text-align: center;
		background: var(--card, #22314f);
		border: 1px solid color-mix(in srgb, #d4af37 50%, transparent);
		border-radius: var(--radius-xl, 1rem);
		box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.4));
		animation: victory-pop var(--motion-base, 220ms) cubic-bezier(0.22, 1, 0.36, 1);
	}

	.badge-icon {
		font-size: 3.6rem;
		line-height: 1;
		animation: badge-reveal 900ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.eyebrow {
		margin: 0;
		font-size: var(--fs-xs, 0.78rem);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: #f4dd8b;
		font-weight: 700;
	}

	.title {
		margin: 0;
		font-size: var(--fs-xl, 1.4rem);
		color: var(--txt, #fff);
	}

	.subtitle {
		margin: 0;
		font-size: var(--fs-sm, 0.9rem);
		color: var(--txt2, #cbd5e1);
	}

	.tier-chip {
		padding: 0.15rem 0.6rem;
		border-radius: 999px;
		font-size: 0.65rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.tier--bronze {
		background: rgba(205, 127, 50, 0.28);
		color: #f0c9a0;
	}

	.tier--prata {
		background: rgba(192, 192, 200, 0.25);
		color: #e4e4ec;
	}

	.tier--ouro {
		background: rgba(212, 175, 55, 0.3);
		color: #f4dd8b;
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

	@keyframes badge-reveal {
		0% {
			transform: scale(0.2) rotate(-20deg);
			opacity: 0;
		}
		60% {
			transform: scale(1.25) rotate(8deg);
			opacity: 1;
		}
		100% {
			transform: scale(1) rotate(0deg);
		}
	}
</style>
