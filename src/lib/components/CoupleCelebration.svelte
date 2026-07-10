<script lang="ts">
	// Full-screen "vocês são um casal!" celebration. Fires once per couple space
	// per device (marker written by couple-link's watcher) on BOTH sides — the
	// acceptor right after accepting, the proposer via the realtime spaces
	// subscription. Mirrors MascotUnlockModal's presentation.
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { fireConfettiEvent } from '$lib/components/events';
	import { playSfx, vibrate } from '$lib/gamification/sound';

	interface Props {
		/** Partner display label — "@fatma" / display name. */
		partnerLabel: string;
		onclose?: () => void;
	}
	let { partnerLabel, onclose }: Props = $props();

	let primaryEl = $state<HTMLButtonElement | null>(null);

	onMount(() => {
		fireConfettiEvent({ count: 160, origin: 'center', palette: ['#f472b6', '#fb7185', '#fda4af', '#fecdd3'] });
		playSfx('fanfare');
		vibrate('success');
		requestAnimationFrame(() => primaryEl?.focus());
	});

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') onclose?.();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="couple-overlay" role="dialog" aria-modal="true" aria-labelledby="couple-celebration-title">
	<div class="couple-card">
		<span class="couple-art" aria-hidden="true">
			<img src="/art/couple-hug.webp" alt="" width="180" height="162" loading="eager" />
		</span>
		<p class="eyebrow">{$t('couplelink.celebrate.eyebrow', { default: 'Modo casal ativado!' })}</p>
		<h2 id="couple-celebration-title" class="title">
			💞 {$t('couplelink.celebrate.title', { values: { name: partnerLabel }, default: 'Tu e {name} são um casal!' })}
		</h2>
		<p class="subtitle">
			{$t('couplelink.celebrate.subtitle', {
				default: 'As vossas contas estão ligadas: coração surpresa, pontos partilhados e pings de amor desbloqueados.'
			})}
		</p>
		<ul class="perks" aria-label={$t('couplelink.celebrate.perks_aria', { default: 'Novidades de casal' })}>
			<li>❤️ {$t('couplelink.celebrate.perk_heart', { default: 'O coração surpresa vai aparecer de vez em quando — toca-lhe!' })}</li>
			<li>💌 {$t('couplelink.celebrate.perk_pings', { default: 'Envia "amo-te" e "saudades" a partir da mascote.' })}</li>
			<li>🏆 {$t('couplelink.celebrate.perk_points', { default: 'Os pontos do casal somam dos dois lados.' })}</li>
		</ul>
		<button type="button" class="cta" bind:this={primaryEl} onclick={() => onclose?.()}>
			{$t('couplelink.celebrate.cta', { default: 'Que fofos! 💕' })}
		</button>
	</div>
</div>

<style>
	.couple-overlay {
		position: fixed;
		inset: 0;
		z-index: 8950;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4, 1rem);
		background: color-mix(in srgb, var(--bg, #1f2e4a) 72%, transparent);
		backdrop-filter: blur(6px);
		animation: couple-fade var(--motion-base, 220ms) ease;
	}
	.couple-card {
		width: min(380px, 100%);
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
		animation: couple-pop var(--motion-base, 220ms) cubic-bezier(0.22, 1, 0.36, 1);
	}
	.couple-art {
		line-height: 1;
	}
	.couple-art img {
		width: clamp(150px, 42vw, 190px);
		height: auto;
		filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.18));
	}
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
	.perks {
		margin: 0.35rem 0 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: var(--fs-sm, 0.9rem);
		color: var(--txt2, #cbd5e1);
		text-align: left;
	}
	.cta {
		min-height: 44px;
		padding: 0 1.4rem;
		margin-top: 0.55rem;
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
	@keyframes couple-fade {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	@keyframes couple-pop {
		from {
			opacity: 0;
			transform: scale(0.92) translateY(14px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}
	@media (max-width: 639px) {
		.couple-overlay {
			padding: 0;
			background: var(--bg, #1f2e4a);
			backdrop-filter: none;
		}
		.couple-card {
			width: 100%;
			height: 100dvh;
			max-height: none;
			border-radius: 0;
			border: none;
			justify-content: center;
			padding: calc(1.6rem + env(safe-area-inset-top)) 1.4rem calc(1.8rem + env(safe-area-inset-bottom));
		}
		.couple-card > :first-child {
			margin-top: auto;
		}
		.couple-card .cta {
			margin-top: auto;
			width: 100%;
		}
	}
</style>
