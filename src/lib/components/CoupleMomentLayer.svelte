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
		love: 5400,
		nudge: 5200,
		message: 4800,
		'heart-tap': 2600
	};

	let active = $state<CoupleMoment | null>(null);
	let queue = $state<CoupleMoment[]>([]);
	let mascotId = $state(DEFAULT_MASCOT_ID);
	let reduced = $state(false);
	let dismissTimer: ReturnType<typeof setTimeout> | null = null;
	let dismissDeadline = 0;
	let remainingDisplayMs = 0;
	let hoverPaused = false;
	let focusPaused = false;

	function copyFor(moment: CoupleMoment): { title: string; body: string } {
		const partner = moment.senderName || $t('couple.name.partner', { default: 'O teu amor' });
		const fallbackTitle =
			moment.kind === 'love'
				? $t('couple.ping.love.received', { values: { name: partner }, default: `💛 ${partner} ama-te muito!` })
				: moment.kind === 'nudge'
					? $t('couple.ping.nudge.received', { values: { name: partner }, default: `👀 ${partner} tem saudades tuas!` })
					: moment.kind === 'message'
						? moment.count && moment.count > 1
							? $t('couple.moment.message.title_many', {
									values: { count: moment.count, name: partner },
									default: `💬 ${moment.count} novas mensagens de ${partner}`
								})
							: $t('couple.moment.message.title', { values: { name: partner }, default: `💬 Nova mensagem de ${partner}` })
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
			playSfx('levelup');
			vibrateLove();
			if (!reduced) {
				fireConfettiEvent({ count: 118, intensity: 3.2, origin: 'heart', palette: ['#fb7185', '#f472b6', '#fda4af', '#fef3c7'] });
				window.dispatchEvent(new CustomEvent('presuntinho:screen-shake'));
			}
		} else if (moment.kind === 'nudge') {
			playSfx('milestone');
			vibrateNudge();
			if (!reduced) {
				fireConfettiEvent({ count: 78, intensity: 2.6, origin: 'center', palette: ['#f59e0b', '#facc15', '#f472b6', '#a78bfa'] });
				window.dispatchEvent(new CustomEvent('presuntinho:screen-shake'));
			}
		} else if (moment.kind === 'message') {
			playSfx('ding');
			vibrate('success');
			if (!reduced) fireConfettiEvent({ count: 30, intensity: 0.9, origin: 'top', palette: ['#60a5fa', '#93c5fd', '#f9a8d4', '#fff'] });
		} else {
			playSfx('pop');
			vibrate('tap');
			if (!reduced) fireConfettiEvent({ count: 18, intensity: 0.65, origin: 'heart' });
		}
	}

	function clearDismissTimer(): void {
		if (dismissTimer) clearTimeout(dismissTimer);
		dismissTimer = null;
		dismissDeadline = 0;
	}

	function armDismiss(ms: number): void {
		clearDismissTimer();
		remainingDisplayMs = Math.max(500, ms);
		if (hoverPaused || focusPaused || !active) return;
		dismissDeadline = Date.now() + remainingDisplayMs;
		dismissTimer = setTimeout(dismiss, remainingDisplayMs);
	}

	function pauseDismiss(): void {
		if (!dismissTimer) return;
		remainingDisplayMs = Math.max(500, dismissDeadline - Date.now());
		clearDismissTimer();
	}

	function resumeDismiss(): void {
		if (!active || hoverPaused || focusPaused || dismissTimer) return;
		armDismiss(remainingDisplayMs || DISPLAY_MS[active.kind]);
	}

	function showNext(): void {
		clearDismissTimer();
		hoverPaused = false;
		focusPaused = false;
		const next = queue[0] ?? null;
		queue = queue.slice(1);
		active = next;
		if (!next) return;
		runFeedback(next);
		armDismiss(DISPLAY_MS[next.kind]);
	}

	function sameMessageStream(first: CoupleMoment, second: CoupleMoment): boolean {
		return (
			first.kind === 'message' &&
			second.kind === 'message' &&
			(first.senderId ?? '') === (second.senderId ?? '') &&
			(first.href ?? '') === (second.href ?? '')
		);
	}

	function priority(moment: CoupleMoment): number {
		if (moment.kind === 'love' || moment.kind === 'nudge') return 0;
		if (moment.kind === 'message') return 1;
		return 2;
	}

	function enqueue(moment: CoupleMoment): void {
		// Refresh server-backed inbox data immediately; the visual queue must not
		// delay the global unread badge during a burst of messages.
		if (moment.kind === 'message') void refreshNotifBadge(true);
		// A fast chat burst should feel like one coherent notification, not ten
		// delayed buzzes. Keep the newest preview/count and extend the current card
		// without replaying sound, vibration or its entrance animation.
		if (active && sameMessageStream(active, moment)) {
			active = {
				...moment,
				id: active.id,
				count: Math.min(99, (active.count ?? 1) + (moment.count ?? 1))
			};
			armDismiss(DISPLAY_MS.message);
			return;
		}
		const matchingQueued = queue.findIndex((candidate) => sameMessageStream(candidate, moment));
		if (matchingQueued >= 0) {
			const previous = queue[matchingQueued];
			queue = queue.map((candidate, index) =>
				index === matchingQueued
					? {
							...moment,
							count: Math.min(99, (previous.count ?? 1) + (moment.count ?? 1))
						}
					: candidate
			);
			return;
		}

		// Love/saudades are time-sensitive. If a message banner is currently up,
		// let the emotional moment take the stage immediately instead of waiting.
		if (active && priority(moment) < priority(active)) {
			clearDismissTimer();
			active = null;
			queue = [moment, ...queue].slice(0, MAX_QUEUE);
			showNext();
			return;
		}

		const insertion = queue.findIndex((candidate) => priority(moment) < priority(candidate));
		queue = (insertion < 0
			? [...queue, moment]
			: [...queue.slice(0, insertion), moment, ...queue.slice(insertion)]
		).slice(0, MAX_QUEUE);
		if (!active) showNext();
	}

	function dismiss(): void {
		clearDismissTimer();
		active = null;
		if (queue.length > 0) showNext();
	}

	function onMouseEnter(): void {
		hoverPaused = true;
		pauseDismiss();
	}

	function onMouseLeave(): void {
		hoverPaused = false;
		resumeDismiss();
	}

	function onFocusIn(): void {
		focusPaused = true;
		pauseDismiss();
	}

	function onFocusOut(event: FocusEvent): void {
		const current = event.currentTarget as HTMLElement;
		if (event.relatedTarget instanceof Node && current.contains(event.relatedTarget)) return;
		focusPaused = false;
		resumeDismiss();
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
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && active) dismiss();
		};
		window.addEventListener(COUPLE_MOMENT_EVENT, onMoment);
		window.addEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			unbindWorker();
			window.removeEventListener(COUPLE_MOMENT_EVENT, onMoment);
			window.removeEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);
			window.removeEventListener('keydown', onKeyDown);
			clearDismissTimer();
		};
	});
</script>

{#if active}
	{#key active.id}
		<div class="moment-announcer" role="status" aria-live="polite" aria-atomic="true">
			{copy.title}. {copy.body}
		</div>
		<div class="moment-layer" class:reduced data-kind={active.kind}>
			<span class="wash" aria-hidden="true"></span>
			<div class="sparkles" aria-hidden="true">
				{#each Array(12) as _, i}
					<span style={`--left:${5 + i * 8.2}%; --delay:${i * 42}ms; --size:${0.85 + (i % 4) * 0.2}rem`}>{active.kind === 'nudge' ? (i % 3 === 0 ? '💭' : '✨') : active.kind === 'message' ? (i % 3 === 0 ? '✨' : '💌') : '💗'}</span>
				{/each}
			</div>
			<div
				class="moment-card"
				role="group"
				aria-label={copy.title}
				onmouseenter={onMouseEnter}
				onmouseleave={onMouseLeave}
				onfocusin={onFocusIn}
				onfocusout={onFocusOut}
			>
				<span class="card-shine" aria-hidden="true"></span>
				<button type="button" class="moment-main" onclick={openMoment} aria-label={`${copy.title}. ${copy.body}`}>
					<span class="mascot-wrap" aria-hidden="true">
						<span class="reaction-ring reaction-ring-one"></span>
						<span class="reaction-ring reaction-ring-two"></span>
						<MascotAvatar mascot={mascotId} {pose} size={96} entrance={!reduced} animate={!reduced} eager />
					</span>
					<span class="moment-copy">
						<strong>{copy.title}</strong>
						<small>{copy.body}</small>
					</span>
					{#if active.count && active.count > 1}<span class="moment-count" aria-hidden="true">+{active.count - 1}</span>{/if}
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
	.moment-announcer {
		position: fixed;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
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
		background:
			radial-gradient(circle at 50% 17%, color-mix(in srgb, var(--moment, #f472b6) 32%, transparent), transparent 43%),
			linear-gradient(to bottom, color-mix(in srgb, var(--moment, #f472b6) 8%, transparent), transparent 48%);
		animation: wash-in 1150ms ease-out both;
	}
	.moment-card {
		position: relative;
		width: min(470px, calc(100vw - 1.5rem));
		pointer-events: auto;
		isolation: isolate;
		border: 1px solid color-mix(in srgb, var(--moment, #f472b6) 62%, rgba(255,255,255,.35));
		border-radius: 1.55rem;
		background:
			linear-gradient(135deg, color-mix(in srgb, var(--moment, #f472b6) 24%, var(--card, #22314f)), var(--card, #22314f));
		box-shadow: 0 22px 70px rgba(8, 15, 32, 0.54), 0 0 42px color-mix(in srgb, var(--moment, #f472b6) 36%, transparent);
		animation: moment-pop 620ms cubic-bezier(.16, 1.48, .35, 1) both;
	}
	.card-shine {
		position: absolute;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		border-radius: inherit;
		pointer-events: none;
	}
	.card-shine::after {
		content: '';
		position: absolute;
		top: -80%;
		left: -32%;
		width: 26%;
		height: 250%;
		background: linear-gradient(90deg, transparent, rgba(255,255,255,.32), transparent);
		transform: rotate(22deg);
		animation: card-shine 1.1s 180ms ease-out both;
	}
	.moment-layer[data-kind='love'] { --moment: #fb7185; }
	.moment-layer[data-kind='nudge'] { --moment: #f59e0b; }
	.moment-layer[data-kind='message'] { --moment: #60a5fa; }
	.moment-layer[data-kind='heart-tap'] { --moment: #f472b6; }
	.moment-layer[data-kind='nudge'] .moment-card { animation: moment-pop 480ms ease-out both, nudge-shake 820ms 470ms cubic-bezier(.36,.07,.19,.97) both; }
	.moment-layer[data-kind='love'] .moment-card { animation: moment-pop 600ms cubic-bezier(.16,1.55,.35,1) both, love-card-beat 780ms 600ms ease-out both; }
	.moment-main {
		position: relative;
		z-index: 1;
		width: 100%;
		min-height: 132px;
		display: grid;
		grid-template-columns: 104px 1fr auto auto;
		align-items: center;
		gap: 0.65rem;
		padding: 0.75rem 2.65rem 0.75rem 0.55rem;
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
		position: relative;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		filter: drop-shadow(0 8px 14px color-mix(in srgb, var(--moment) 26%, transparent));
		animation: mascot-react 980ms cubic-bezier(.16, 1.72, .3, 1) both;
	}
	.moment-layer[data-kind='love'] .mascot-wrap { animation: mascot-love 1150ms cubic-bezier(.15, 1.7, .3, 1) both; }
	.moment-layer[data-kind='nudge'] .mascot-wrap { animation: mascot-nudge 1050ms cubic-bezier(.36,.07,.19,.97) both; }
	.reaction-ring {
		position: absolute;
		left: 50%;
		bottom: 2px;
		z-index: 0;
		width: 66px;
		height: 66px;
		border: 3px solid color-mix(in srgb, var(--moment) 76%, #fff);
		border-radius: 999px;
		transform: translateX(-50%) scale(.45);
		animation: reaction-ring 1.15s ease-out both;
	}
	.reaction-ring-two { animation-delay: 180ms; }
	.mascot-wrap > :global(.mavatar) { position: relative; z-index: 1; }
	.moment-copy { min-width: 0; display: flex; flex-direction: column; gap: 0.3rem; }
	.moment-copy strong { font-size: clamp(1rem, 3.8vw, 1.18rem); line-height: 1.2; }
	.moment-copy small { color: var(--txt2, #d7deea); font-size: 0.86rem; line-height: 1.35; }
	.arrow { font-size: 2rem; line-height: 1; color: var(--moment); }
	.moment-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2rem;
		height: 2rem;
		padding: 0 .42rem;
		border-radius: 999px;
		background: var(--moment);
		color: #101827;
		font-size: .78rem;
		font-weight: 900;
		box-shadow: 0 0 16px color-mix(in srgb, var(--moment) 58%, transparent);
		animation: count-pop 260ms cubic-bezier(.2,1.5,.35,1) both;
	}
	.moment-close {
		position: absolute;
		top: 0.45rem;
		right: 0.5rem;
		z-index: 3;
		width: 42px;
		height: 42px;
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
		from { opacity: 0; transform: translateY(-42px) scale(.68) rotate(-2.5deg); }
		68% { opacity: 1; transform: translateY(7px) scale(1.055) rotate(.8deg); }
		to { opacity: 1; transform: none; }
	}
	@keyframes love-card-beat {
		0%, 100% { transform: scale(1); }
		18% { transform: scale(1.045); }
		34% { transform: scale(.985); }
		52% { transform: scale(1.03); }
		70% { transform: scale(.995); }
	}
	@keyframes nudge-shake {
		0%, 100% { transform: translateX(0) rotate(0); }
		18% { transform: translateX(-8px) rotate(-1.2deg); }
		36% { transform: translateX(8px) rotate(1.2deg); }
		54% { transform: translateX(-5px) rotate(-.7deg); }
		72% { transform: translateX(5px) rotate(.7deg); }
	}
	@keyframes mascot-react {
		from { opacity: 0; transform: translateY(28px) scale(.34) rotate(-13deg); }
		58% { opacity: 1; transform: translateY(-15px) scale(1.34) rotate(8deg); }
		78% { transform: translateY(4px) scale(.9) rotate(-4deg); }
		to { opacity: 1; transform: none; }
	}
	@keyframes mascot-love {
		0% { opacity: 0; transform: scale(.2) rotate(-12deg); }
		32% { opacity: 1; transform: scale(1.62) rotate(-9deg); }
		44% { transform: scale(.72) rotate(8deg); }
		60% { transform: scale(1.42) rotate(-6deg); }
		76% { transform: scale(.9) rotate(4deg); }
		90% { transform: scale(1.12) rotate(-2deg); }
		100% { opacity: 1; transform: none; }
	}
	@keyframes mascot-nudge {
		0% { opacity: 0; transform: translateY(24px) scale(.45); }
		20% { opacity: 1; transform: translate(-15px,-12px) rotate(-16deg) scale(1.34); }
		36% { transform: translate(16px,2px) rotate(17deg) scale(1.18); }
		52% { transform: translate(-12px,-9px) rotate(-12deg) scale(1.28); }
		68% { transform: translate(10px,1px) rotate(10deg) scale(1.12); }
		84% { transform: translate(-4px,-4px) rotate(-4deg) scale(1.06); }
		100% { opacity: 1; transform: none; }
	}
	@keyframes reaction-ring {
		0% { opacity: .95; transform: translateX(-50%) scale(.38); border-width: 6px; }
		100% { opacity: 0; transform: translateX(-50%) scale(2); border-width: 1px; }
	}
	@keyframes card-shine {
		from { opacity: 0; transform: translateX(0) rotate(22deg); }
		28% { opacity: 1; }
		to { opacity: 0; transform: translateX(620%) rotate(22deg); }
	}
	@keyframes count-pop {
		from { opacity: 0; transform: scale(.4); }
		to { opacity: 1; transform: none; }
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
	.moment-layer.reduced .sparkles,
	.moment-layer.reduced .reaction-ring,
	.moment-layer.reduced .card-shine { display: none; }
	.moment-layer.reduced .moment-card,
	.moment-layer.reduced .mascot-wrap { animation: none; }
	@media (max-width: 480px) {
		.moment-layer { padding-top: calc(env(safe-area-inset-top) + 4.25rem); }
		.moment-main { grid-template-columns: 88px 1fr auto; min-height: 120px; padding: .65rem 2.45rem .65rem .25rem; }
		.arrow { display: none; }
		.moment-count { grid-column: 3; }
	}
	@media (prefers-reduced-motion: reduce) {
		.wash, .sparkles, .reaction-ring, .card-shine { display: none; }
		.moment-card, .mascot-wrap, .moment-count { animation: none !important; }
	}
</style>
