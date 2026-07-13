<script lang="ts">
	/**
	 * Global, non-modal presentation for incoming couple moments. Transport
	 * modules only dispatch canonical events; this layer owns copy, animation,
	 * sound, haptics and queueing so each moment is celebrated in one place.
	 */
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import {
		COUPLE_MOMENT_EVENT,
		bindCoupleMomentServiceWorker,
		type CoupleMoment
	} from '$lib/couple/couple-moments';
	import {
		DEFAULT_MASCOT_ID,
		MASCOT_CHANGED_EVENT,
		getActiveMascot,
		type MascotPose
	} from '$lib/gamification/mascots';
	import { playSfx, vibrate, vibrateLove, vibrateNudge } from '$lib/gamification/sound';
	import { refreshNotifBadge } from '$lib/vida/notif-badge.svelte';
	import { fireConfettiEvent, prefersReducedMotion } from './events';
	import MascotAvatar from './MascotAvatar.svelte';

	const MAX_QUEUE = 10;
	const DISPLAY_MS: Record<CoupleMoment['kind'], number> = {
		love: 4400,
		nudge: 4400,
		message: 3600,
		'heart-tap': 2100
	};

	let active = $state<CoupleMoment | null>(null);
	let queue = $state<CoupleMoment[]>([]);
	let mascotId = $state(DEFAULT_MASCOT_ID);
	let reduced = $state(false);
	let dismissTimer: ReturnType<typeof setTimeout> | null = null;

	function copyFor(moment: CoupleMoment): { title: string; body: string } {
		const partner = moment.senderName || $t('couple.name.partner', { default: 'O teu amor' });
		const fallbackTitle =
			moment.kind === 'love'
				? $t('couple.ping.love.received', { values: { name: partner }, default: `💛 ${partner} ama-te muito!` })
				: moment.kind === 'nudge'
					? $t('couple.ping.nudge.received', { values: { name: partner }, default: `👀 ${partner} tem saudades tuas!` })
					: moment.kind === 'message'
						? $t('couple.moment.message.title', { values: { name: partner }, default: `💬 Nova mensagem de ${partner}` })
						: $t('couple.moment.heart.title', { values: { name: partner }, default: `💞 ${partner} tocou no vosso coração!` });
		const fallbackBody =
			moment.kind === 'love'
				? $t('couple.moment.love.body', { default: 'Um abraço apertadinho acabou de chegar ao teu ecrã.' })
				: moment.kind === 'nudge'
					? $t('couple.moment.nudge.body', { default: 'Anda cá — alguém está mesmo a pensar em ti.' })
					: moment.kind === 'message'
						? $t('couple.moment.message.body', { default: 'Toca para abrir a conversa.' })
						: $t('couple.moment.heart.body', { default: 'Os pontos do casal subiram em sintonia.' });
		return { title: moment.title || fallbackTitle, body: moment.body || fallbackBody };
	}

	const copy = $derived(active ? copyFor(active) : { title: '', body: '' });
	const pose = $derived.by<MascotPose>(() => {
		if (active?.kind === 'love') return 'love';
		if (active?.kind === 'nudge') return 'jump';
		if (active?.kind === 'message') return 'wave';
		return 'cheer';
	});

	function runFeedback(moment: CoupleMoment): void {
		if (moment.kind === 'love') {
			playSfx('ding');
			vibrateLove();
			if (!reduced) {
				fireConfettiEvent({ count: 90, intensity: 1.5, origin: 'center', palette: ['#fb7185', '#f472b6', '#fda4af', '#fef3c7'] });
			}
		} else if (moment.kind === 'nudge') {
			playSfx('milestone');
			vibrateNudge();
			if (!reduced) fireConfettiEvent({ count: 52, intensity: 1.15, origin: 'center' });
		} else if (moment.kind === 'message') {
			playSfx('ding');
			vibrate('tap');
			if (!reduced) fireConfettiEvent({ count: 24, intensity: 0.75, origin: 'top' });
		} else {
			playSfx('pop');
			vibrate('tap');
			if (!reduced) fireConfettiEvent({ count: 18, intensity: 0.65, origin: 'heart' });
		}
	}

	function showNext(): void {
		if (dismissTimer) clearTimeout(dismissTimer);
		dismissTimer = null;
		const next = queue[0] ?? null;
		queue = queue.slice(1);
		active = next;
		if (!next) return;
		runFeedback(next);
		dismissTimer = setTimeout(dismiss, DISPLAY_MS[next.kind]);
	}

	function enqueue(moment: CoupleMoment): void {
		// Refresh server-backed inbox data immediately; the visual queue must not
		// delay the global unread badge during a burst of messages.
		if (moment.kind === 'message') void refreshNotifBadge(true);
		queue = [...queue, moment].slice(-MAX_QUEUE);
		if (!active) showNext();
	}

	function dismiss(): void {
		if (dismissTimer) clearTimeout(dismissTimer);
		dismissTimer = null;
		active = null;
		if (queue.length > 0) showNext();
	}

	function openMoment(): void {
		const href = active?.href;
		if (href && href.startsWith('/') && !href.startsWith('//')) void goto(href);
		dismiss();
	}

	async function refreshMascot(): Promise<void> {
		try {
			mascotId = (await getActiveMascot()).id;
		} catch {
			mascotId = DEFAULT_MASCOT_ID;
		}
	}

	onMount(() => {
		reduced = prefersReducedMotion();
		void refreshMascot();
		const unbindWorker = bindCoupleMomentServiceWorker();
		const onMoment = (event: Event) => {
			const moment = (event as CustomEvent<CoupleMoment>).detail;
			if (moment?.id) enqueue(moment);
		};
		const onMascotChanged = (event: Event) => {
			const id = (event as CustomEvent<{ id?: string }>).detail?.id;
			if (id) mascotId = id;
			else void refreshMascot();
		};
		window.addEventListener(COUPLE_MOMENT_EVENT, onMoment);
		window.addEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);
		return () => {
			unbindWorker();
			window.removeEventListener(COUPLE_MOMENT_EVENT, onMoment);
			window.removeEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);
			if (dismissTimer) clearTimeout(dismissTimer);
		};
	});
</script>

{#if active}
	{#key active.id}
		<div class="moment-layer" class:reduced data-kind={active.kind} role="status" aria-live="polite" aria-atomic="true">
			<span class="wash" aria-hidden="true"></span>
			<div class="sparkles" aria-hidden="true">
				{#each Array(8) as _, i}
					<span style={`--left:${12 + i * 11}%; --delay:${i * 55}ms; --size:${0.85 + (i % 3) * 0.22}rem`}>{active.kind === 'nudge' ? '✨' : active.kind === 'message' ? '💌' : '💗'}</span>
				{/each}
			</div>
			<div class="moment-card">
				<button type="button" class="moment-main" onclick={openMoment} aria-label={copy.title}>
					<span class="mascot-wrap" aria-hidden="true">
						<MascotAvatar mascot={mascotId} {pose} size={84} entrance={!reduced} animate={!reduced} eager />
					</span>
					<span class="moment-copy">
						<strong>{copy.title}</strong>
						<small>{copy.body}</small>
					</span>
					{#if active.href}<span class="arrow" aria-hidden="true">›</span>{/if}
				</button>
				<button
					type="button"
					class="moment-close"
					onclick={dismiss}
					aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}
				>×</button>
			</div>
		</div>
	{/key}
{/if}

<style>
	.moment-layer {
		position: fixed;
		inset: 0;
		z-index: 10020;
		pointer-events: none;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: calc(env(safe-area-inset-top) + 4.65rem) 0.75rem 0;
	}
	.wash {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at 50% 18%, rgba(244, 114, 182, 0.25), transparent 46%);
		animation: wash-in 900ms ease-out both;
	}
	.moment-card {
		position: relative;
		width: min(430px, calc(100vw - 1.5rem));
		pointer-events: auto;
		isolation: isolate;
		border: 1px solid color-mix(in srgb, var(--moment, #f472b6) 62%, rgba(255,255,255,.35));
		border-radius: 1.35rem;
		background:
			linear-gradient(135deg, color-mix(in srgb, var(--moment, #f472b6) 24%, var(--card, #22314f)), var(--card, #22314f));
		box-shadow: 0 18px 55px rgba(8, 15, 32, 0.48), 0 0 32px color-mix(in srgb, var(--moment, #f472b6) 30%, transparent);
		animation: moment-pop 520ms cubic-bezier(.2, 1.5, .45, 1) both;
	}
	.moment-layer[data-kind='love'] { --moment: #fb7185; }
	.moment-layer[data-kind='nudge'] { --moment: #f59e0b; }
	.moment-layer[data-kind='message'] { --moment: #60a5fa; }
	.moment-layer[data-kind='heart-tap'] { --moment: #f472b6; }
	.moment-layer[data-kind='nudge'] .moment-card { animation: moment-pop 420ms ease-out both, nudge-shake 620ms 430ms ease both; }
	.moment-main {
		width: 100%;
		min-height: 112px;
		display: grid;
		grid-template-columns: 92px 1fr auto;
		align-items: center;
		gap: 0.65rem;
		padding: 0.65rem 2.25rem 0.65rem 0.55rem;
		border: 0;
		border-radius: inherit;
		background: transparent;
		color: var(--txt, #fff);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.moment-main:focus-visible { outline: 3px solid color-mix(in srgb, var(--moment) 70%, #fff); outline-offset: 3px; }
	.mascot-wrap {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		filter: drop-shadow(0 8px 14px color-mix(in srgb, var(--moment) 26%, transparent));
		animation: mascot-react 820ms cubic-bezier(.2, 1.7, .35, 1) both;
	}
	.moment-layer[data-kind='love'] .mascot-wrap { animation: mascot-love 950ms cubic-bezier(.2, 1.65, .35, 1) both; }
	.moment-copy { min-width: 0; display: flex; flex-direction: column; gap: 0.3rem; }
	.moment-copy strong { font-size: clamp(1rem, 3.8vw, 1.18rem); line-height: 1.2; }
	.moment-copy small { color: var(--txt2, #d7deea); font-size: 0.86rem; line-height: 1.35; }
	.arrow { font-size: 2rem; line-height: 1; color: var(--moment); }
	.moment-close {
		position: absolute;
		top: 0.45rem;
		right: 0.5rem;
		z-index: 3;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: 999px;
		background: color-mix(in srgb, var(--card, #22314f) 72%, transparent);
		color: var(--txt2, #d7deea);
		font-size: 1.25rem;
		cursor: pointer;
	}
	.moment-close:focus-visible { outline: 2px solid var(--moment); }
	.sparkles { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
	.sparkles span {
		position: absolute;
		left: var(--left);
		top: 5.1rem;
		font-size: var(--size);
		animation: sparkle-fly 1.45s var(--delay) ease-out both;
	}
	@keyframes moment-pop {
		from { opacity: 0; transform: translateY(-28px) scale(.82) rotate(-1.5deg); }
		70% { opacity: 1; transform: translateY(4px) scale(1.035) rotate(.5deg); }
		to { opacity: 1; transform: none; }
	}
	@keyframes nudge-shake {
		0%, 100% { transform: translateX(0) rotate(0); }
		18% { transform: translateX(-8px) rotate(-1.2deg); }
		36% { transform: translateX(8px) rotate(1.2deg); }
		54% { transform: translateX(-5px) rotate(-.7deg); }
		72% { transform: translateX(5px) rotate(.7deg); }
	}
	@keyframes mascot-react {
		from { opacity: 0; transform: translateY(18px) scale(.55) rotate(-8deg); }
		65% { opacity: 1; transform: translateY(-9px) scale(1.18) rotate(5deg); }
		to { opacity: 1; transform: none; }
	}
	@keyframes mascot-love {
		0% { opacity: 0; transform: scale(.4); }
		45% { opacity: 1; transform: scale(1.38) rotate(-6deg); }
		70% { transform: scale(1.12) rotate(5deg); }
		100% { opacity: 1; transform: none; }
	}
	@keyframes sparkle-fly {
		from { opacity: 0; transform: translateY(28px) scale(.45) rotate(-20deg); }
		35% { opacity: 1; }
		to { opacity: 0; transform: translateY(-95px) scale(1.3) rotate(24deg); }
	}
	@keyframes wash-in {
		from { opacity: 0; }
		35% { opacity: 1; }
		to { opacity: 0; }
	}
	.moment-layer.reduced .wash,
	.moment-layer.reduced .sparkles { display: none; }
	.moment-layer.reduced .moment-card,
	.moment-layer.reduced .mascot-wrap { animation: none; }
	@media (max-width: 480px) {
		.moment-layer { padding-top: calc(env(safe-area-inset-top) + 4.25rem); }
		.moment-main { grid-template-columns: 78px 1fr; min-height: 104px; padding-left: 0.35rem; }
		.arrow { display: none; }
	}
	@media (prefers-reduced-motion: reduce) {
		.wash, .sparkles { display: none; }
		.moment-card, .mascot-wrap { animation: none !important; }
	}
</style>
