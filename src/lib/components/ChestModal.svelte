<script lang="ts">
	// V10 — variable-reward chest, opened when the 3/3 daily quests complete.
	// Duolingo-style: shake → tap → burst → reveal. Rewards (weighted):
	//   55%  random XP 10–50
	//   25%  +1 streak freeze (falls back to XP 20 when already at max)
	//   20%  2x XP boost for 15 minutes (actually multiplies awardXP)
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { fireConfettiEvent } from '$lib/components/events';
	import { playSfx, vibrate } from '$lib/gamification/sound';
	import { awardXP, boostedXp, setXpBoost } from '$lib/state/xp-actions';
	import { readStateV8, updateStateV8, MAX_FREEZES } from '$lib/gamification/streak';
	import { dispatchGamificationEvent, STREAK_CHANGED_EVENT } from '$lib/gamification/gamification-events';

	interface Props {
		onclose?: () => void;
	}
	let { onclose }: Props = $props();

	type Reward =
		| { kind: 'xp'; amount: number }
		| { kind: 'freeze' }
		| { kind: 'boost' };

	let phase = $state<'closed' | 'opening' | 'revealed'>('closed');
	let reward = $state<Reward | null>(null);
	let chestEl = $state<HTMLButtonElement | null>(null);

	const BOOST_MINUTES = 15;

	async function pickReward(): Promise<Reward> {
		const roll = Math.random();
		if (roll < 0.55) {
			return { kind: 'xp', amount: 10 + Math.floor(Math.random() * 41) };
		}
		if (roll < 0.8) {
			try {
				const row = await readStateV8();
				const freezes = typeof row?.streakFreezes === 'number' ? row.streakFreezes : 0;
				if (freezes < MAX_FREEZES) return { kind: 'freeze' };
			} catch {
				// fall through to XP
			}
			return { kind: 'xp', amount: 20 };
		}
		return { kind: 'boost' };
	}

	async function applyReward(r: Reward): Promise<void> {
		if (r.kind === 'xp') {
			await awardXP('chest_reward', r.amount);
		} else if (r.kind === 'freeze') {
			try {
				const row = await readStateV8();
				const freezes = typeof row?.streakFreezes === 'number' ? row.streakFreezes : 0;
				await updateStateV8({ streakFreezes: Math.min(MAX_FREEZES, freezes + 1) });
				dispatchGamificationEvent(STREAK_CHANGED_EVENT);
			} catch (e) {
				console.warn('[chest] freeze grant failed', e);
			}
		} else {
			setXpBoost(Date.now() + BOOST_MINUTES * 60_000, 2);
		}
	}

	async function open(): Promise<void> {
		if (phase !== 'closed') return;
		phase = 'opening';
		playSfx('chest');
		vibrate('success');
		const r = await pickReward();
		// Let the shake play before the burst.
		setTimeout(() => {
			reward = r;
			phase = 'revealed';
			fireConfettiEvent({ count: 100, origin: 'center' });
			void applyReward(r);
		}, 650);
	}

	onMount(() => {
		requestAnimationFrame(() => chestEl?.focus());
	});

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape' && phase === 'revealed') onclose?.();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="chest-overlay" role="dialog" aria-modal="true" aria-labelledby="chest-title">
	<div class="chest-card">
		<h2 id="chest-title" class="title">
			{$t('chest.title', { default: 'Missões completas — ganhaste um baú!' })}
		</h2>
		{#if phase !== 'revealed'}
			<button
				type="button"
				class="chest"
				class:shaking={phase === 'opening'}
				bind:this={chestEl}
				onclick={open}
				aria-label={$t('chest.tap', { default: 'Toca para abrir o baú' })}
			>
				<span aria-hidden="true">🎁</span>
			</button>
			<p class="hint">{$t('chest.tap', { default: 'Toca para abrir o baú' })}</p>
		{:else if reward}
			<div class="reward" role="status">
				{#if reward.kind === 'xp'}
					<span class="reward-icon" aria-hidden="true">⚡</span>
					<p class="reward-label">
						{$t('chest.reward.xp', { values: { n: boostedXp(reward.amount) }, default: '+{n} XP' })}
					</p>
				{:else if reward.kind === 'freeze'}
					<span class="reward-icon" aria-hidden="true">❄️</span>
					<p class="reward-label">
						{$t('chest.reward.freeze', { default: '+1 congelamento de streak' })}
					</p>
				{:else}
					<span class="reward-icon" aria-hidden="true">⚡✨</span>
					<p class="reward-label">
						{$t('chest.reward.boost', {
							values: { min: BOOST_MINUTES },
							default: 'XP a dobrar durante {min} minutos!'
						})}
					</p>
				{/if}
			</div>
			<button type="button" class="cta" onclick={() => onclose?.()}>
				{$t('chest.cta', { default: 'Recolher' })}
			</button>
		{/if}
	</div>
</div>

<style>
	.chest-overlay {
		position: fixed;
		inset: 0;
		z-index: 8900;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4, 1rem);
		background: color-mix(in srgb, var(--bg, #1f2e4a) 72%, transparent);
		backdrop-filter: blur(6px);
		animation: chest-fade var(--motion-base, 220ms) ease;
	}

	.chest-card {
		width: min(340px, 100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.8rem;
		padding: calc(var(--space-4, 1rem) * 1.4) var(--space-4, 1rem);
		text-align: center;
		background: var(--card, #22314f);
		border: 1px solid color-mix(in srgb, #d4af37 45%, transparent);
		border-radius: var(--radius-xl, 1rem);
		box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.4));
		animation: chest-pop var(--motion-base, 220ms) cubic-bezier(0.22, 1, 0.36, 1);
	}

	.title {
		margin: 0;
		font-size: var(--fs-lg, 1.15rem);
		color: var(--txt, #fff);
	}

	.chest {
		font-size: 4rem;
		line-height: 1;
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0.5rem;
		min-width: 44px;
		min-height: 44px;
		transition: transform var(--motion-fast, 120ms) ease;
	}

	.chest:hover {
		transform: scale(1.06);
	}

	.chest.shaking {
		animation: chest-shake 650ms cubic-bezier(0.36, 0.07, 0.19, 0.97);
	}

	.hint {
		margin: 0;
		font-size: var(--fs-sm, 0.9rem);
		color: var(--txt2, #cbd5e1);
	}

	.reward {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		animation: reward-burst 600ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.reward-icon {
		font-size: 3rem;
		line-height: 1;
	}

	.reward-label {
		margin: 0;
		font-size: var(--fs-lg, 1.15rem);
		font-weight: 800;
		color: var(--accent, #ec4899);
	}

	.cta {
		min-height: 44px;
		padding: 0 1.4rem;
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

	@keyframes chest-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes chest-pop {
		from {
			opacity: 0;
			transform: scale(0.92) translateY(14px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	@keyframes chest-shake {
		0%, 100% {
			transform: rotate(0deg) scale(1);
		}
		20% {
			transform: rotate(-8deg) scale(1.05);
		}
		40% {
			transform: rotate(8deg) scale(1.1);
		}
		60% {
			transform: rotate(-6deg) scale(1.15);
		}
		80% {
			transform: rotate(6deg) scale(1.2);
		}
	}

	@keyframes reward-burst {
		0% {
			transform: scale(0.2);
			opacity: 0;
		}
		60% {
			transform: scale(1.25);
			opacity: 1;
		}
		100% {
			transform: scale(1);
		}
	}
</style>
