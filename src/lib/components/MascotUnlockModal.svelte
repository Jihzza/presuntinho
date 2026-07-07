<script lang="ts">
	// Full-screen mascot-unlock celebration (queued by GamificationLayer). Mirrors
	// BadgeUnlockModal — mascot unlocks used to fire nothing at all, so crossing
	// 100/250/500/750 XP or 10 badges gave zero feedback that a collectible landed.
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { fireConfettiEvent } from '$lib/components/events';
	import { playSfx, vibrate } from '$lib/gamification/sound';
	import { mascotById } from '$lib/gamification/mascots';
	import MascotAvatar from './MascotAvatar.svelte';

	interface Props {
		mascotId: string;
		onclose?: () => void;
	}
	let { mascotId, onclose }: Props = $props();

	const def = $derived(mascotById(mascotId));
	const name = $derived($t(`mascots.${mascotId}.name`, { default: mascotId }));

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

<div class="mascot-overlay" role="dialog" aria-modal="true" aria-labelledby="mascot-unlock-title">
	<div class="mascot-card">
		<span class="mascot-art" aria-hidden="true">
			<MascotAvatar mascot={mascotId} pose="cheer" size={132} entrance eager />
		</span>
		<p class="eyebrow">{$t('mascotunlock.eyebrow', { default: 'Nova mascote desbloqueada!' })}</p>
		<h2 id="mascot-unlock-title" class="title">{def?.emoji ?? '🐾'} {name}</h2>
		<p class="subtitle">{$t('mascotunlock.subtitle', { default: 'Já podes escolhê-la nas Mascotes.' })}</p>
		<button type="button" class="cta" bind:this={primaryEl} onclick={() => onclose?.()}>
			{$t('mascotunlock.cta', { default: 'Boa! 🎉' })}
		</button>
	</div>
</div>

<style>
	.mascot-overlay {
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
	.mascot-card {
		width: min(360px, 100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.55rem;
		padding: calc(var(--space-4, 1rem) * 1.4) var(--space-4, 1rem);
		text-align: center;
		background: var(--card, #22314f);
		border: 1px solid color-mix(in srgb, var(--accent, #db2777) 45%, transparent);
		border-radius: var(--radius-xl, 1rem);
		box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.4));
		animation: victory-pop var(--motion-base, 220ms) cubic-bezier(0.22, 1, 0.36, 1);
	}
	.mascot-art { line-height: 1; }
	.eyebrow {
		margin: 0;
		font-size: var(--fs-xs, 0.78rem);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--accent, #db2777);
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
	.cta {
		min-height: 44px;
		padding: 0 1.4rem;
		margin-top: 0.35rem;
		font-size: var(--fs-md, 1rem);
		font-weight: 700;
		color: var(--on-accent, #fff);
		background: var(--accent, #db2777);
		border: none;
		border-radius: var(--radius-lg, 0.75rem);
		cursor: pointer;
		transition: transform var(--motion-fast, 120ms) ease;
	}
	.cta:hover {
		transform: translateY(-1px);
	}
	@keyframes victory-fade {
		from { opacity: 0; }
		to { opacity: 1; }
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
	/* Mobile: full-page celebration with the CTA anchored at the bottom. */
	@media (max-width: 639px) {
		.mascot-overlay {
			padding: 0;
			background: var(--bg, #1f2e4a);
			backdrop-filter: none;
		}
		.mascot-card {
			width: 100%;
			height: 100dvh;
			max-height: none;
			border-radius: 0;
			border: none;
			justify-content: center;
			padding: calc(1.6rem + env(safe-area-inset-top)) 1.4rem calc(1.8rem + env(safe-area-inset-bottom));
		}
		.mascot-card > :first-child {
			margin-top: auto;
		}
		.mascot-card .cta {
			margin-top: auto;
			width: 100%;
		}
	}
</style>
