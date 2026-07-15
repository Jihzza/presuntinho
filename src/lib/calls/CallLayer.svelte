<script lang="ts">
	import { accountState } from '$lib/account/account-store.svelte';
	import { playSfx } from '$lib/gamification/sound';
	import { t } from 'svelte-i18n';
	import { callStore } from './call-store.svelte';

	let remoteVideo = $state<HTMLVideoElement | null>(null);
	let localVideo = $state<HTMLVideoElement | null>(null);
	let remoteAudio = $state<HTMLAudioElement | null>(null);
	let dialogElement = $state<HTMLDivElement | null>(null);
	let clock = $state(Date.now());

	const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

	const label = $derived(callStore.peerProfile?.label || $t('calls.someone', { default: 'Alguém especial' }));
	const isVideo = $derived(callStore.kind === 'video');
	const showCall = $derived(callStore.phase !== 'idle');

	$effect(() => {
		callStore.bindUser(accountState.user?.id ?? null);
		return () => callStore.bindUser(null);
	});

	$effect(() => {
		if (!showCall || typeof document === 'undefined') return;
		const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previousOverflow;
			if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
		};
	});

	$effect(() => {
		const phase = callStore.phase;
		const accepting = callStore.accepting;
		if (!showCall || !dialogElement || typeof requestAnimationFrame === 'undefined') return;
		const frame = requestAnimationFrame(() => focusInitialControl(phase, accepting));
		return () => cancelAnimationFrame(frame);
	});

	$effect(() => {
		const stream = callStore.remoteStream;
		const target = isVideo ? remoteVideo : remoteAudio;
		if (!target) return;
		target.srcObject = stream;
		if (stream) void target.play().catch(() => undefined);
	});

	$effect(() => {
		if (!localVideo) return;
		localVideo.srcObject = callStore.localStream;
		if (callStore.localStream) void localVideo.play().catch(() => undefined);
	});

	$effect(() => {
		if (callStore.phase !== 'active') return;
		clock = Date.now();
		const timer = setInterval(() => (clock = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	$effect(() => {
		const phase = callStore.phase;
		if (phase !== 'incoming') {
			if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(0);
			return;
		}
		const ring = () => {
			playSfx('ding');
			if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
				navigator.vibrate([180, 100, 180, 550, 180, 100, 180]);
			}
		};
		ring();
		const timer = setInterval(ring, 2600);
		return () => {
			clearInterval(timer);
			if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(0);
		};
	});

	function elapsed(): string {
		if (!callStore.connectedAt) return '00:00';
		const seconds = Math.max(0, Math.floor((clock - callStore.connectedAt) / 1000));
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const rest = seconds % 60;
		return hours > 0
			? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
			: `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
	}

	function phaseText(): string {
		switch (callStore.phase) {
			case 'preparing': return $t('calls.status.preparing', { default: 'A preparar a chamada…' });
			case 'incoming': return isVideo
				? $t('calls.status.incoming_video', { default: 'Videochamada recebida' })
				: $t('calls.status.incoming_audio', { default: 'Chamada de voz recebida' });
			case 'outgoing': return $t('calls.status.ringing', { default: 'A chamar…' });
			case 'connecting': return $t('calls.status.connecting', { default: 'A ligar os dois…' });
			case 'active': return elapsed();
			case 'ended': {
				if (callStore.session?.status === 'declined') return $t('calls.status.declined', { default: 'Chamada recusada' });
				if (callStore.session?.status === 'missed') return $t('calls.status.missed', { default: 'Chamada não atendida' });
				return $t('calls.status.ended', { default: 'Chamada terminada' });
			}
			case 'error': return errorText();
			default: return '';
		}
	}

	function errorText(): string {
		if (callStore.error === 'media_denied') return $t('calls.error.permission', { default: 'Precisamos de acesso ao microfone e à câmara.' });
		if (callStore.error === 'media_missing') return $t('calls.error.missing', { default: 'Não foi encontrado microfone ou câmara.' });
		return $t('calls.error.generic', { default: 'Não foi possível fazer a chamada. Tenta novamente.' });
	}

	function focusableControls(): HTMLElement[] {
		if (!dialogElement) return [];
		return [...dialogElement.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
			(element) => element.getAttribute('aria-hidden') !== 'true' && element.offsetParent !== null
		);
	}

	function focusInitialControl(phase: typeof callStore.phase, accepting: boolean): void {
		if (!dialogElement) return;
		const selector = phase === 'incoming'
			? '[data-call-action="decline"]'
			: phase === 'ended' || phase === 'error'
				? '[data-call-action="dismiss"]'
				: '[data-call-action="hangup"]';
		const preferred = phase === 'incoming' && accepting
			? null
			: dialogElement.querySelector<HTMLElement>(selector);
		const target = preferred && !preferred.matches(':disabled')
			? preferred
			: focusableControls()[0] ?? dialogElement;
		target.focus({ preventScroll: true });
	}

	function handleDialogKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			if (callStore.phase === 'incoming' && !callStore.accepting) void callStore.decline();
			else if (callStore.phase === 'preparing' || callStore.phase === 'outgoing' || callStore.phase === 'connecting') void callStore.end();
			else if (callStore.phase === 'ended' || callStore.phase === 'error') callStore.dismiss();
			// During an active call Escape is deliberately a no-op: ending media
			// must remain an explicit action, not an accidental keyboard dismissal.
			return;
		}
		if (event.key !== 'Tab') return;
		const controls = focusableControls();
		if (controls.length === 0) {
			event.preventDefault();
			dialogElement?.focus({ preventScroll: true });
			return;
		}
		const first = controls[0];
		const last = controls[controls.length - 1];
		const active = document.activeElement;
		if (event.shiftKey && (active === first || active === dialogElement || !dialogElement?.contains(active))) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && (active === last || active === dialogElement || !dialogElement?.contains(active))) {
			event.preventDefault();
			first.focus();
		}
	}
</script>

{#if showCall}
	<div
		bind:this={dialogElement}
		class="call-layer"
		class:video-call={isVideo}
		data-phase={callStore.phase}
		role="dialog"
		aria-modal="true"
		aria-labelledby="presuntinho-call-title"
		aria-describedby="presuntinho-call-status"
		aria-busy={callStore.accepting}
		tabindex="-1"
		onkeydown={handleDialogKeydown}
	>
		<div class="call-backdrop" aria-hidden="true"></div>
		{#if isVideo && callStore.phase !== 'incoming' && callStore.phase !== 'error'}
			<div class="video-stage">
				<video bind:this={remoteVideo} class="remote-video" autoplay playsinline></video>
				{#if !callStore.remoteStream}
					<div class="video-wait" aria-hidden="true">
						<span>{callStore.peerProfile?.emoji || '💞'}</span>
					</div>
				{/if}
				{#if callStore.localStream}
					<video bind:this={localVideo} class="local-video" autoplay muted playsinline aria-label={$t('calls.local_preview', { default: 'A tua câmara' })}></video>
				{/if}
			</div>
		{:else}
			<audio bind:this={remoteAudio} autoplay></audio>
		{/if}

		<div class="call-panel">
			<div class="call-avatar" aria-hidden="true">
				{#if callStore.peerProfile?.avatarUrl}
					<img src={callStore.peerProfile.avatarUrl} alt="" />
				{:else}
					<span>{callStore.peerProfile?.emoji || (isVideo ? '📹' : '💞')}</span>
				{/if}
			</div>
			<h2 id="presuntinho-call-title">{label}</h2>
			<p id="presuntinho-call-status" aria-live="polite">{phaseText()}</p>

			{#if callStore.phase === 'incoming'}
				<div class="incoming-actions">
					<button type="button" class="round decline" data-call-action="decline" disabled={callStore.accepting} onclick={() => void callStore.decline()} aria-label={$t('calls.decline', { default: 'Recusar' })}>
						<span aria-hidden="true">☎</span><small>{$t('calls.decline', { default: 'Recusar' })}</small>
					</button>
					<button type="button" class="round accept" data-call-action="accept" disabled={callStore.accepting} onclick={() => void callStore.accept()} aria-label={$t('calls.accept', { default: 'Atender' })}>
						<span aria-hidden="true">☎</span><small>{$t('calls.accept', { default: 'Atender' })}</small>
					</button>
				</div>
			{:else if callStore.phase === 'error'}
				<button type="button" class="dismiss" data-call-action="dismiss" onclick={() => callStore.dismiss()}>{$t('calls.close', { default: 'Fechar' })}</button>
			{:else if callStore.phase === 'ended'}
				<button type="button" class="dismiss" data-call-action="dismiss" onclick={() => callStore.dismiss()}>{$t('calls.close', { default: 'Fechar' })}</button>
			{:else}
				<div class="call-controls">
					{#if callStore.localStream}
						<button type="button" class:active={callStore.muted} onclick={() => callStore.toggleMute()} aria-label={callStore.muted ? $t('calls.unmute', { default: 'Ativar microfone' }) : $t('calls.mute', { default: 'Silenciar microfone' })}>
							<span aria-hidden="true">{callStore.muted ? '🔇' : '🎙️'}</span>
						</button>
						{#if isVideo}
							<button type="button" class:active={callStore.cameraOff} onclick={() => callStore.toggleCamera()} aria-label={callStore.cameraOff ? $t('calls.camera_on', { default: 'Ligar câmara' }) : $t('calls.camera_off', { default: 'Desligar câmara' })}>
								<span aria-hidden="true">{callStore.cameraOff ? '🚫' : '📹'}</span>
							</button>
							<button type="button" onclick={() => void callStore.flipCamera()} aria-label={$t('calls.camera_flip', { default: 'Trocar câmara' })}>
								<span aria-hidden="true">🔄</span>
							</button>
						{/if}
					{/if}
					<button type="button" class="hangup" data-call-action="hangup" onclick={() => void callStore.end()} aria-label={$t('calls.hangup', { default: 'Desligar' })}>
						<span aria-hidden="true">☎</span>
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.call-layer {
		position: fixed;
		inset: 0;
		z-index: 11000;
		display: grid;
		place-items: center;
		padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
		isolation: isolate;
		color: #fff;
	}
	.call-backdrop {
		position: absolute;
		inset: 0;
		z-index: -2;
		background:
			radial-gradient(circle at 50% 26%, rgba(244, 114, 182, .34), transparent 36%),
			linear-gradient(155deg, #18243b, #08101f 68%);
		backdrop-filter: blur(18px);
	}
	.video-stage { position: absolute; inset: 0; z-index: -1; overflow: hidden; background: #050914; }
	.remote-video { width: 100%; height: 100%; object-fit: cover; }
	.video-wait { position: absolute; inset: 0; display: grid; place-items: center; background: radial-gradient(circle, #374665, #0a1222 70%); }
	.video-wait span { font-size: clamp(5rem, 22vw, 10rem); filter: drop-shadow(0 18px 34px rgba(0,0,0,.35)); animation: breathe 1.8s ease-in-out infinite; }
	.local-video {
		position: absolute;
		top: max(1rem, env(safe-area-inset-top));
		inset-inline-end: max(1rem, env(safe-area-inset-right));
		width: min(31vw, 150px);
		aspect-ratio: 3 / 4;
		object-fit: cover;
		border-radius: 1.1rem;
		border: 2px solid rgba(255,255,255,.7);
		box-shadow: 0 12px 30px rgba(0,0,0,.4);
		transform: scaleX(-1);
	}
	.call-panel { width: min(92vw, 31rem); display: flex; flex-direction: column; align-items: center; text-align: center; gap: .45rem; }
	.video-call .call-panel { align-self: end; padding-bottom: clamp(1rem, 5vh, 3rem); text-shadow: 0 2px 10px rgba(0,0,0,.8); }
	.call-avatar {
		width: clamp(108px, 30vw, 154px);
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: linear-gradient(145deg, rgba(244,114,182,.45), rgba(96,165,250,.28));
		border: 2px solid rgba(255,255,255,.58);
		box-shadow: 0 22px 55px rgba(0,0,0,.4), 0 0 45px rgba(244,114,182,.22);
		animation: call-pulse 1.8s ease-in-out infinite;
		overflow: hidden;
	}
	.video-call .call-avatar { width: 76px; }
	.call-avatar img { width: 100%; height: 100%; object-fit: cover; }
	.call-avatar span { font-size: clamp(3.9rem, 16vw, 6.5rem); }
	.video-call .call-avatar span { font-size: 3rem; }
	h2 { margin: 1rem 0 0; font-size: clamp(1.65rem, 6vw, 2.4rem); line-height: 1.12; }
	p { margin: .15rem 0 1.2rem; color: rgba(255,255,255,.76); font-weight: 650; }
	.incoming-actions { display: flex; gap: clamp(2.8rem, 16vw, 6rem); margin-top: 1rem; }
	.round { display: flex; flex-direction: column; align-items: center; gap: .55rem; border: 0; background: transparent; color: #fff; font: inherit; cursor: pointer; }
	.round:disabled { opacity: .52; cursor: wait; }
	.round > span { width: 68px; height: 68px; display: grid; place-items: center; border-radius: 50%; font-size: 1.8rem; box-shadow: 0 12px 28px rgba(0,0,0,.28); }
	.round small { font-weight: 750; }
	.decline > span { background: #ef4444; transform: rotate(135deg); }
	.accept > span { background: #22c55e; animation: accept-pop 1.15s ease-in-out infinite; }
	.call-controls { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: .72rem; margin-top: .55rem; }
	.call-controls button {
		width: 56px;
		height: 56px;
		display: grid;
		place-items: center;
		border: 1px solid rgba(255,255,255,.2);
		border-radius: 50%;
		background: rgba(255,255,255,.15);
		color: #fff;
		font: inherit;
		font-size: 1.35rem;
		cursor: pointer;
		backdrop-filter: blur(12px);
	}
	.call-controls button.active { background: rgba(255,255,255,.9); color: #18243b; }
	.call-controls .hangup { width: 66px; height: 66px; margin-inline-start: .35rem; background: #ef4444; border-color: #fb7185; font-size: 1.75rem; transform: rotate(135deg); }
	.dismiss { min-height: 46px; padding: .65rem 1.4rem; border: 0; border-radius: 999px; background: #fff; color: #18243b; font: inherit; font-weight: 850; cursor: pointer; }
	button:focus-visible { outline: 3px solid #f9a8d4; outline-offset: 4px; }
	.call-layer[data-phase='ended'] .call-avatar, .call-layer[data-phase='error'] .call-avatar { animation: none; filter: grayscale(.25); }
	@keyframes call-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.045); box-shadow: 0 22px 55px rgba(0,0,0,.4), 0 0 58px rgba(244,114,182,.38); } }
	@keyframes accept-pop { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
	@keyframes breathe { 0%,100% { transform: scale(.94); } 50% { transform: scale(1.06); } }
	@media (prefers-reduced-motion: reduce) { .call-avatar, .accept > span, .video-wait span { animation: none; } }
</style>
