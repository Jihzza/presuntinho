<script lang="ts">
	import { accountState } from '$lib/account/account-store.svelte';
	import { t } from 'svelte-i18n';
	import CallInCallTools from './CallInCallTools.svelte';
	import { pictureInPictureMode, setPictureInPicture } from './call-runtime';
	import { callStore } from './call-store.svelte';

	let remoteVideo = $state<HTMLVideoElement | null>(null);
	let localVideo = $state<HTMLVideoElement | null>(null);
	let remoteAudio = $state<HTMLAudioElement | null>(null);
	let dialogElement = $state<HTMLDivElement | null>(null);
	let clock = $state(Date.now());
	let playbackBlocked = $state(false);
	let pictureInPictureSupported = $state(false);
	let pictureInPictureActive = $state(false);
	let pictureInPictureError = $state<string | null>(null);

	const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
	const label = $derived(callStore.peerProfile?.label || $t('calls.someone', { default: 'Alguém especial' }));
	const isVideo = $derived(callStore.kind === 'video');
	const showHandoffOffer = $derived(callStore.phase === 'idle' && Boolean(callStore.handoffOffer));
	const showCall = $derived(callStore.phase !== 'idle' || showHandoffOffer);
	const canMinimize = $derived(callStore.phase === 'active' || callStore.phase === 'reconnecting');
	const showMiniCall = $derived(showCall && canMinimize && callStore.minimized);
	const showExpandedCall = $derived(showCall && !showMiniCall);
	const miniQuality = $derived(callStore.connectionQuality?.rating ?? 'unknown');
	const showTerminalActions = $derived(
		Boolean(callStore.conversationId) &&
		(callStore.outcome === 'declined' || callStore.outcome === 'busy' || callStore.outcome === 'unreachable')
	);
	const chatHref = $derived(
		callStore.conversationId
			? `/mensagens/?conversation=${encodeURIComponent(callStore.conversationId)}`
			: '/mensagens/'
	);
	const remoteMediaElement = $derived<HTMLMediaElement | null>(isVideo ? remoteVideo : remoteAudio);
	const outputSelectionSupported = $derived(
		typeof (remoteMediaElement as (HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }) | null)?.setSinkId === 'function'
	);
	const awaitingOutgoing = $derived(
		callStore.direction === 'outgoing' ||
		['preparing', 'creating', 'notifying', 'contacting', 'ringing'].includes(callStore.phase)
	);
	const showTimeline = $derived(
		awaitingOutgoing && ['preparing', 'creating', 'notifying', 'contacting', 'ringing', 'connecting'].includes(callStore.phase)
	);

	$effect(() => {
		callStore.bindUser(accountState.user?.id ?? null);
		return () => callStore.bindUser(null);
	});

	$effect(() => {
		if (!showExpandedCall || typeof document === 'undefined') return;
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
		if (!showExpandedCall || !dialogElement || typeof requestAnimationFrame === 'undefined') return;
		const frame = requestAnimationFrame(() => focusInitialControl(phase, accepting));
		return () => cancelAnimationFrame(frame);
	});

	$effect(() => {
		const stream = callStore.remoteStream;
		const target = isVideo ? remoteVideo : remoteAudio;
		if (!target) return;
		target.srcObject = stream;
		if (stream) void target.play().then(() => (playbackBlocked = false)).catch(() => (playbackBlocked = true));
		else playbackBlocked = false;
	});

	$effect(() => {
		if (!localVideo) return;
		localVideo.srcObject = callStore.localStream;
		if (callStore.localStream) void localVideo.play().catch(() => undefined);
	});

	$effect(() => {
		const video = remoteVideo;
		const eligible = isVideo &&
			(callStore.phase === 'active' || callStore.phase === 'reconnecting') &&
			Boolean(callStore.remoteStream);
		if (!video || !eligible || typeof document === 'undefined') {
			pictureInPictureSupported = false;
			pictureInPictureActive = false;
			return;
		}
		const extended = video as HTMLVideoElement & {
			webkitPresentationMode?: string;
		};
		const syncPictureInPicture = () => {
			pictureInPictureActive = document.pictureInPictureElement === video ||
				extended.webkitPresentationMode === 'picture-in-picture';
		};
		pictureInPictureSupported = pictureInPictureMode(video, document) !== null;
		syncPictureInPicture();
		video.addEventListener('enterpictureinpicture', syncPictureInPicture);
		video.addEventListener('leavepictureinpicture', syncPictureInPicture);
		video.addEventListener('webkitpresentationmodechanged', syncPictureInPicture);
		return () => {
			video.removeEventListener('enterpictureinpicture', syncPictureInPicture);
			video.removeEventListener('leavepictureinpicture', syncPictureInPicture);
			video.removeEventListener('webkitpresentationmodechanged', syncPictureInPicture);
			const active = document.pictureInPictureElement === video ||
				extended.webkitPresentationMode === 'picture-in-picture';
			if (active) void setPictureInPicture(video, false, document);
			pictureInPictureActive = false;
		};
	});

	$effect(() => {
		if (callStore.phase !== 'active' && callStore.phase !== 'reconnecting') return;
		clock = Date.now();
		const timer = setInterval(() => (clock = Date.now()), 1000);
		return () => clearInterval(timer);
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

	function qualityText(): string {
		switch (miniQuality) {
			case 'good': return $t('calls.quality.good', { default: 'Ligação boa' });
			case 'fair': return $t('calls.quality.fair', { default: 'Ligação razoável' });
			case 'poor': return $t('calls.quality.poor', { default: 'Ligação fraca' });
			default: return $t('calls.quality.unknown', { default: 'A medir ligação' });
		}
	}

	function followupText(action: 'call_back' | 'cant_now'): string {
		return action === 'call_back'
			? $t('calls.followup.call_back_message', { default: 'Já te ligo' })
			: $t('calls.followup.cant_now_message', { default: 'Agora não consigo' });
	}

	function resumeRemotePlayback(): void {
		const target = isVideo ? remoteVideo : remoteAudio;
		if (!target) return;
		void target.play().then(() => (playbackBlocked = false)).catch(() => (playbackBlocked = true));
	}

	function selectSpeaker(deviceId: string): void {
		const target = isVideo ? remoteVideo : remoteAudio;
		if (!target) return;
		void callStore.selectSpeaker(target, deviceId);
	}

	async function togglePictureInPicture(): Promise<void> {
		const video = remoteVideo;
		if (!video || !pictureInPictureSupported || typeof document === 'undefined') return;
		pictureInPictureError = null;
		const result = await setPictureInPicture(video, !pictureInPictureActive, document);
		if (result.status === 'failed') {
			pictureInPictureError = result.reason === 'not-allowed' ? 'permission_denied' : 'generic';
			return;
		}
		if (result.status === 'unsupported') {
			pictureInPictureSupported = false;
			return;
		}
		if (result.status === 'not-active') {
			pictureInPictureActive = false;
			return;
		}
		pictureInPictureActive = result.status === 'entered';
	}

	function phaseText(): string {
		switch (callStore.phase) {
			case 'preparing': return $t('calls.status.preparing', { default: 'A preparar microfone e câmara…' });
			case 'creating': return $t('calls.status.creating', { default: 'A criar uma ligação segura…' });
			case 'notifying': return $t('calls.status.notifying', { default: `A avisar ${label}…` });
			case 'contacting': {
				if (callStore.deliveryIssue === 'no_push_devices') {
					return $t('calls.status.no_push_devices', {
						default: 'Não encontrámos um dispositivo disponível — a chamada continua se a app abrir.'
					});
				}
				if (callStore.deliveryStage === 'opened') {
					return $t('calls.status.opened', { default: 'A app foi aberta — à espera de resposta…' });
				}
				if (callStore.deliveryStage === 'presented') {
					return $t('calls.status.presented', { default: 'Aviso apresentado num dispositivo' });
				}
				if (callStore.deliveryStage === 'received') {
					return $t('calls.status.received', { default: 'O outro telemóvel recebeu o pedido' });
				}
				if (callStore.deliveryStage === 'provider_accepted') {
					return $t('calls.status.provider_accepted', { default: 'Aviso enviado — à espera do dispositivo…' });
				}
				if (callStore.deliveryStage === 'failed' || callStore.deliveryStage === 'stale') {
					return $t('calls.status.delivery_retry', { default: 'A procurar outro dispositivo disponível…' });
				}
				return $t('calls.status.contacting', { default: `A contactar ${label}…` });
			}
			case 'ringing': return $t('calls.status.ringing_confirmed', { default: `A tocar no telemóvel de ${label}…` });
			case 'incoming': return isVideo
				? $t('calls.status.incoming_video', { values: { name: label }, default: `${label} está a ligar por vídeo` })
				: $t('calls.status.incoming_audio', { values: { name: label }, default: `${label} está a ligar por voz` });
			case 'connecting': return $t('calls.status.connecting', { default: 'Atendida — a ligar os dois…' });
			case 'active': return elapsed();
			case 'reconnecting': return $t('calls.status.reconnecting', { default: `Ligação instável — a recuperar… ${elapsed()}` });
			case 'ended': return outcomeText();
			case 'error': return errorText();
			default: return '';
		}
	}

	function outcomeText(): string {
		switch (callStore.outcome) {
			case 'declined': return $t('calls.status.declined', { default: 'Chamada recusada' });
			case 'cancelled': return $t('calls.status.cancelled', { default: 'Chamada cancelada' });
			case 'missed': return $t('calls.status.missed', { default: 'Chamada não atendida' });
			case 'busy': return $t('calls.status.busy', { default: `${label} está noutra chamada` });
			case 'unreachable': return $t('calls.status.unreachable', { default: 'Não foi possível chegar ao outro dispositivo' });
			case 'answered_elsewhere': return $t('calls.status.answered_elsewhere', { default: 'Atendida noutro dispositivo' });
			case 'transferred': return $t('calls.handoff.moved', { default: 'A chamada continua no outro dispositivo' });
			case 'connection_lost': return $t('calls.status.connection_lost', { default: 'A ligação foi perdida' });
			case 'failed': return $t('calls.status.failed', { default: 'A chamada falhou' });
			default: return $t('calls.status.ended', { default: 'Chamada terminada' });
		}
	}

	function handoffPlatform(platform: string): string {
		switch (platform) {
			case 'ios': return $t('calls.handoff.platform.ios', { default: 'iPhone ou iPad' });
			case 'android': return $t('calls.handoff.platform.android', { default: 'Android' });
			case 'windows': return $t('calls.handoff.platform.windows', { default: 'Windows' });
			case 'macos': return $t('calls.handoff.platform.macos', { default: 'Mac' });
			case 'linux': return $t('calls.handoff.platform.linux', { default: 'Linux' });
			default: return $t('calls.handoff.platform.other', { default: 'Outro dispositivo' });
		}
	}

	function handoffTargetLabel(platform: string, installationId: string): string {
		return `${handoffPlatform(platform)} · ${installationId.slice(-4)}`;
	}

	function handoffErrorText(): string {
		switch (callStore.handoffError) {
			case 'handoff_expired': return $t('calls.handoff.error.expired', { default: 'O outro dispositivo não respondeu. A chamada continua aqui.' });
			case 'handoff_declined': return $t('calls.handoff.error.declined', { default: 'A transferência foi recusada. A chamada continua aqui.' });
			case 'handoff_claimed_elsewhere': return $t('calls.handoff.error.claimed', { default: 'Outro separador recebeu a chamada primeiro.' });
			case 'handoff_unavailable': return $t('calls.handoff.error.unavailable', { default: 'Esse dispositivo deixou de estar disponível.' });
			case 'media_denied': return $t('calls.handoff.error.permission', { default: 'Permite o microfone e a câmara antes de continuar a chamada aqui.' });
			case 'media_missing': return $t('calls.handoff.error.media', { default: 'Este dispositivo não tem o microfone ou a câmara necessários.' });
			case 'call_relay_required_unavailable': return $t('calls.error.relay_unavailable', { default: 'O modo apenas relay não está disponível. A chamada continua segura no dispositivo atual.' });
			default: return $t('calls.handoff.error.generic', { default: 'Não foi possível mover a chamada. Ela continua no dispositivo atual.' });
		}
	}

	function errorText(): string {
		switch (callStore.error) {
			case 'call_account_not_ready': return $t('calls.error.account_not_ready', { default: 'A tua conta ainda está a iniciar. Espera um instante e tenta novamente.' });
			case 'call_offline': return $t('calls.error.offline', { default: 'Sem ligação à internet. Liga os dados ou Wi-Fi e tenta novamente.' });
			case 'media_denied': return isVideo
				? $t('calls.error.permission_video', { default: 'Permite o acesso ao microfone e à câmara nas definições do navegador.' })
				: $t('calls.error.permission_audio', { default: 'Permite o acesso ao microfone nas definições do navegador.' });
			case 'media_missing': return $t('calls.error.missing', { default: 'Não foi encontrado um microfone ou uma câmara disponível.' });
			case 'media_unsupported': return $t('calls.error.unsupported', { default: 'Este navegador não permite chamadas. Atualiza-o ou abre a app noutro dispositivo.' });
			case 'call_negotiation_timeout': return $t('calls.error.timeout', { default: 'A outra pessoa atendeu, mas a ligação demorou demasiado. Tenta outra vez.' });
			case 'call_connection_lost': return $t('calls.error.connection_lost', { default: 'A ligação caiu e não foi possível recuperá-la.' });
			case 'call_conversation_missing': return $t('calls.error.conversation_missing', { default: 'Abre primeiro uma conversa para iniciar a chamada.' });
			case 'call_peer_busy': return $t('calls.error.busy', { default: `${label} já está noutra chamada.` });
			case 'call_rate_limited': return $t('calls.error.rate_limited', { default: 'Espera alguns segundos antes de voltar a ligar.' });
			case 'call_conversation_inactive': return $t('calls.error.conversation_inactive', { default: 'Esta conversa já não permite chamadas.' });
			case 'call_relay_required_unavailable': return $t('calls.error.relay_unavailable', { default: 'Pediste uma chamada apenas por relay, mas este serviço não está disponível agora. Desativa “Apenas relay” nas definições ou tenta mais tarde.' });
			default: return $t('calls.error.generic', { default: 'Não foi possível fazer a chamada. Podes tentar novamente.' });
		}
	}

	function timelineStep(): number {
		if (callStore.phase === 'preparing' || callStore.phase === 'creating') return 0;
		if (callStore.phase === 'notifying' || callStore.phase === 'contacting') return 1;
		if (callStore.phase === 'ringing') return 2;
		if (callStore.phase === 'connecting') return 3;
		if (callStore.phase === 'active' || callStore.phase === 'reconnecting') return 4;
		return 0;
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
		const preferred = phase === 'incoming' && accepting ? null : dialogElement.querySelector<HTMLElement>(selector);
		const target = preferred && !preferred.matches(':disabled') ? preferred : focusableControls()[0] ?? dialogElement;
		target.focus({ preventScroll: true });
	}

	function handleDialogKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			if (showHandoffOffer && !callStore.handoffBusy) void callStore.declineHandoffOffer();
			else if (callStore.phase === 'incoming' && !callStore.accepting) void callStore.decline();
			else if (['preparing', 'creating', 'notifying', 'contacting', 'ringing', 'connecting'].includes(callStore.phase)) void callStore.end();
			else if (callStore.phase === 'ended' || callStore.phase === 'error') callStore.dismiss();
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
	{#if showHandoffOffer}
		<div
			bind:this={dialogElement}
			class="handoff-offer-layer"
			role="dialog"
			aria-modal="true"
			aria-labelledby="presuntinho-handoff-title"
			aria-describedby="presuntinho-handoff-copy"
			aria-busy={callStore.handoffBusy}
			tabindex="-1"
			onkeydown={handleDialogKeydown}
		>
			<div class="call-backdrop" aria-hidden="true"></div>
			<section class="handoff-offer-card">
				<div class="handoff-icon" aria-hidden="true">📲</div>
				<p class="handoff-kicker">{$t('calls.handoff.offer_kicker', { default: 'Transferência segura' })}</p>
				<h2 id="presuntinho-handoff-title">{$t('calls.handoff.offer_title', { default: 'Continuar a chamada neste dispositivo?' })}</h2>
				<p id="presuntinho-handoff-copy">{$t('calls.handoff.offer_body', { default: 'O dispositivo atual só desliga depois de este assumir a mesma chamada.' })}</p>
				{#if callStore.handoffError}<p class="handoff-error" role="alert">{handoffErrorText()}</p>{/if}
				<div class="handoff-offer-actions">
					<button type="button" class="handoff-decline" disabled={callStore.handoffBusy} onclick={() => void callStore.declineHandoffOffer()}>
						{$t('calls.handoff.decline', { default: 'Agora não' })}
					</button>
					<button type="button" class="handoff-accept" disabled={callStore.handoffBusy} onclick={() => void callStore.acceptHandoffOffer()}>
						{callStore.handoffBusy ? $t('calls.handoff.joining', { default: 'A preparar…' }) : $t('calls.handoff.accept', { default: 'Continuar aqui' })}
					</button>
				</div>
			</section>
		</div>
	{:else if showMiniCall}
		<aside
			class="call-mini"
			data-phase={callStore.phase}
			data-quality={miniQuality}
			role="region"
			aria-label={$t('calls.mini.region', { values: { name: label }, default: `Chamada em curso com ${label}` })}
		>
			<button
				type="button"
				class="mini-identity"
				onclick={() => callStore.restore()}
				aria-label={$t('calls.mini.restore', { default: 'Voltar à chamada' })}
			>
				<span class="mini-avatar" aria-hidden="true">
					{#if callStore.peerProfile?.avatarUrl}<img src={callStore.peerProfile.avatarUrl} alt="" />{:else}{callStore.peerProfile?.emoji || '💞'}{/if}
				</span>
				<span class="mini-copy">
					<strong>{label}</strong>
					<span aria-live="polite">{callStore.phase === 'reconnecting' ? $t('calls.status.reconnecting_short', { default: 'A recuperar ligação' }) : elapsed()}</span>
				</span>
			</button>
			<span class="mini-quality" title={qualityText()} aria-label={qualityText()}>
				<i aria-hidden="true"></i><span>{qualityText()}</span>
			</span>
			<div class="mini-actions">
				<button
					type="button"
					class:active={callStore.muted}
					onclick={() => callStore.toggleMute()}
					aria-label={callStore.muted ? $t('calls.unmute', { default: 'Ativar microfone' }) : $t('calls.mute', { default: 'Silenciar microfone' })}
					aria-pressed={callStore.muted}
				><span aria-hidden="true">{callStore.muted ? '🔇' : '🎙️'}</span></button>
				<button
					type="button"
					class="mini-restore"
					onclick={() => callStore.restore()}
					aria-label={$t('calls.mini.restore', { default: 'Voltar à chamada' })}
				><span aria-hidden="true">↗</span></button>
				<button
					type="button"
					class="mini-hangup"
					onclick={() => void callStore.end()}
					aria-label={$t('calls.hangup', { default: 'Desligar' })}
				><span aria-hidden="true">☎</span></button>
			</div>
		</aside>
	{:else}
	<div
		bind:this={dialogElement}
		class="call-layer"
		class:video-call={isVideo}
		class:attention={callStore.phase === 'incoming' || callStore.phase === 'ringing'}
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
					<div class="video-wait" aria-hidden="true"><span>{callStore.peerProfile?.emoji || '💞'}</span></div>
				{/if}
				{#if callStore.localStream}
					<video bind:this={localVideo} class="local-video" class:screen-sharing={callStore.screenSharing} autoplay muted playsinline aria-label={$t('calls.local_preview', { default: 'A tua câmara' })}></video>
				{/if}
			</div>
		{:else}
			<audio bind:this={remoteAudio} autoplay></audio>
		{/if}

		<div class="call-panel">
			<div class="call-meta">
				<span class="kind-pill">{isVideo ? '📹 ' : '☎ '}{isVideo ? $t('calls.video', { default: 'Vídeo' }) : $t('calls.audio', { default: 'Voz' })}</span>
				{#if callStore.realtimeHealth === 'degraded' || callStore.realtimeHealth === 'offline'}
					<span class="network-pill" role="status">{callStore.realtimeHealth === 'offline' ? $t('calls.network.offline', { default: 'Sem rede' }) : $t('calls.network.unstable', { default: 'Rede instável' })}</span>
				{/if}
				{#if callStore.relayOnlyActive && callStore.relayAvailable === true}
					<span class="privacy-pill" role="status">🛡 {$t('calls.relay.active', { default: 'Apenas relay' })}</span>
				{/if}
				{#if canMinimize}
					<button type="button" class="minimize-call" onclick={() => callStore.minimize()} aria-label={$t('calls.mini.minimize', { default: 'Minimizar chamada' })}>
						<span aria-hidden="true">—</span> {$t('calls.mini.minimize_short', { default: 'Minimizar' })}
					</button>
				{/if}
			</div>

			<div class="avatar-stage" aria-hidden="true">
				<div class="signal-rings"><i></i><i></i><i></i></div>
				<div class="call-avatar">
					{#if callStore.peerProfile?.avatarUrl}
						<img src={callStore.peerProfile.avatarUrl} alt="" />
					{:else}
						<span>{callStore.peerProfile?.emoji || (isVideo ? '📹' : '💞')}</span>
					{/if}
				</div>
			</div>
			<h2 id="presuntinho-call-title">{label}</h2>
			<p id="presuntinho-call-status" class="call-status" aria-live={callStore.phase === 'incoming' || callStore.phase === 'error' ? 'assertive' : 'polite'} aria-atomic="true">{phaseText()}</p>
			{#if playbackBlocked && (callStore.phase === 'active' || callStore.phase === 'reconnecting')}
				<button type="button" class="playback-unlock" onclick={resumeRemotePlayback}>🔊 {$t('calls.audio.tap_to_hear', { default: 'Toca para ouvir a chamada' })}</button>
			{/if}
			{#if (callStore.phase === 'active' || callStore.phase === 'reconnecting') && callStore.localStream}
				<CallInCallTools
					kind={callStore.kind}
					quality={callStore.connectionQuality}
					devices={callStore.mediaDevices}
					microphoneId={callStore.selectedMicrophoneId}
					cameraId={callStore.selectedCameraId}
					speakerId={callStore.selectedSpeakerId}
					mediaAction={callStore.mediaAction}
					mediaError={callStore.mediaError ?? pictureInPictureError}
					screenSharing={callStore.screenSharing}
					screenShareSupported={callStore.screenShareSupported}
					pictureInPictureSupported={pictureInPictureSupported}
					pictureInPictureActive={pictureInPictureActive}
					{outputSelectionSupported}
					onRefreshDevices={() => callStore.refreshMediaDevices()}
					onSelectMicrophone={(deviceId) => callStore.selectMicrophone(deviceId)}
					onSelectCamera={(deviceId) => callStore.selectCamera(deviceId)}
					onSelectSpeaker={selectSpeaker}
					onToggleScreenShare={() => callStore.toggleScreenShare()}
					onTogglePictureInPicture={togglePictureInPicture}
				/>
			{/if}
			{#if callStore.phase === 'active' || callStore.phase === 'reconnecting'}
				<section class="handoff-panel" aria-label={$t('calls.handoff.title', { default: 'Mudar de dispositivo' })}>
					{#if callStore.handoffOutgoing}
						<div class="handoff-waiting" role="status" aria-live="polite">
							<span aria-hidden="true">📲</span>
							<div>
								<strong>{$t('calls.handoff.waiting', { default: 'À espera do outro dispositivo…' })}</strong>
								<small>{$t('calls.handoff.waiting_hint', { default: 'Esta chamada continua aqui até o outro aceitar.' })}</small>
							</div>
							{#if callStore.handoffOutgoing.status === 'requested'}
								<button type="button" disabled={callStore.handoffBusy} onclick={() => void callStore.cancelOutgoingHandoff()}>{$t('calls.handoff.cancel', { default: 'Cancelar' })}</button>
							{/if}
						</div>
					{:else}
						<button type="button" class="handoff-open" disabled={!callStore.canHandoff || callStore.handoffBusy} onclick={() => void callStore.openHandoffPicker()}>
							<span aria-hidden="true">📲</span> {$t('calls.handoff.action', { default: 'Mudar de dispositivo' })}
						</button>
					{/if}

					{#if callStore.handoffPickerOpen && !callStore.handoffOutgoing}
						<div class="handoff-picker">
							<div class="handoff-picker-head">
								<div><strong>{$t('calls.handoff.title', { default: 'Mudar de dispositivo' })}</strong><small>{$t('calls.handoff.choose', { default: 'Escolhe outro dispositivo ativo nesta conta.' })}</small></div>
								<button type="button" disabled={callStore.handoffBusy} onclick={() => callStore.closeHandoffPicker()} aria-label={$t('calls.close', { default: 'Fechar' })}>×</button>
							</div>
							{#if callStore.handoffBusy}
								<p class="handoff-loading">{$t('calls.handoff.loading', { default: 'A procurar dispositivos ativos…' })}</p>
							{:else if callStore.handoffTargets.length === 0}
								<p class="handoff-empty">{$t('calls.handoff.none', { default: 'Abre o Presuntinho no outro dispositivo para ele aparecer aqui.' })}</p>
							{:else}
								<div class="handoff-targets">
									{#each callStore.handoffTargets as target (target.installationId)}
										<button type="button" disabled={callStore.handoffBusy} onclick={() => void callStore.requestHandoff(target.installationId)}>
											<span aria-hidden="true">📱</span>
											<span><strong>{handoffTargetLabel(target.platform, target.installationId)}</strong><small>{$t('calls.handoff.active_now', { default: 'Ativo agora' })}</small></span>
											<span aria-hidden="true">›</span>
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
					{#if callStore.handoffError}<p class="handoff-error" role="alert">{handoffErrorText()}</p>{/if}
				</section>
			{/if}
			{#if callStore.phase === 'incoming' && callStore.error}
				<p class="inline-error" role="alert">{errorText()}</p>
			{/if}

			{#if showTimeline}
				<ol class="call-timeline" aria-label={$t('calls.progress', { default: 'Progresso da chamada' })}>
					{#each [
						$t('calls.progress.prepare', { default: 'Preparar' }),
						callStore.deliveryStage === 'presented' ? $t('calls.progress.presented', { default: 'Aviso visível' }) : $t('calls.progress.notify', { default: 'Avisar' }),
						$t('calls.progress.ringing', { default: 'A tocar' }),
						$t('calls.progress.connected', { default: 'Ligados' })
					] as step, index}
						<li class:done={timelineStep() > index} class:current={timelineStep() === index} aria-current={timelineStep() === index ? 'step' : undefined}>
							<span>{timelineStep() > index ? '✓' : index + 1}</span><small>{step}</small>
						</li>
					{/each}
				</ol>
			{/if}

			{#if callStore.phase === 'incoming'}
				<p class="incoming-hint">{$t('calls.incoming_hint', { default: 'O Presuntinho está a chamar-te 💗' })}</p>
				{#if callStore.attentionPreferenceReason === 'dnd'}
					<p class="preference-hint" role="status">🔕 {$t('calls.dnd.silenced', { default: 'Toque e vibração silenciados pelas tuas horas tranquilas. Podes ligar o som só para esta chamada.' })}</p>
				{/if}
				<div class="incoming-actions">
					<button type="button" class="round decline" data-call-action="decline" disabled={callStore.accepting} onclick={() => void callStore.decline()} aria-label={$t('calls.decline', { default: 'Recusar' })}>
						<span aria-hidden="true">☎</span><small>{callStore.responseAction === 'decline' ? $t('calls.declining', { default: 'A recusar…' }) : $t('calls.decline', { default: 'Recusar' })}</small>
					</button>
					<button type="button" class="round accept" data-call-action="accept" disabled={callStore.accepting} onclick={() => void callStore.accept()} aria-label={$t('calls.accept', { default: 'Atender' })}>
						<span aria-hidden="true">☎</span><small>{callStore.responseAction === 'accept' ? $t('calls.accepting', { default: 'A atender…' }) : $t('calls.accept', { default: 'Atender' })}</small>
					</button>
				</div>
				<button type="button" class="attention-toggle" onclick={() => callStore.toggleAttentionMuted()} aria-pressed={callStore.attentionMuted}>
					{callStore.attentionMuted ? '🔕 ' + $t('calls.sound.enable', { default: 'Ligar som' }) : '🔔 ' + $t('calls.sound.disable', { default: 'Silenciar toque' })}
				</button>
			{:else if callStore.phase === 'error'}
				<div class="result-actions">
					<button type="button" class="retry" onclick={() => callStore.retryLastStart()}>{$t('calls.retry', { default: 'Tentar novamente' })}</button>
					<button type="button" class="dismiss" data-call-action="dismiss" onclick={() => callStore.dismiss()}>{$t('calls.close', { default: 'Fechar' })}</button>
				</div>
			{:else if callStore.phase === 'ended'}
				<button type="button" class="dismiss" data-call-action="dismiss" onclick={() => callStore.dismiss()}>{$t('calls.close', { default: 'Fechar' })}</button>
			{:else}
				<div class="call-controls">
					{#if callStore.localStream}
						<button type="button" class:active={callStore.muted} onclick={() => callStore.toggleMute()} aria-label={callStore.muted ? $t('calls.unmute', { default: 'Ativar microfone' }) : $t('calls.mute', { default: 'Silenciar microfone' })}>
							<span aria-hidden="true">{callStore.muted ? '🔇' : '🎙️'}</span><small>{callStore.muted ? $t('calls.unmute.short', { default: 'Ativar' }) : $t('calls.mute.short', { default: 'Silenciar' })}</small>
						</button>
						{#if isVideo}
							<button type="button" class:active={callStore.cameraOff} onclick={() => callStore.toggleCamera()} aria-label={callStore.cameraOff ? $t('calls.camera_on', { default: 'Ligar câmara' }) : $t('calls.camera_off', { default: 'Desligar câmara' })}>
								<span aria-hidden="true">{callStore.cameraOff ? '🚫' : '📹'}</span><small>{$t('calls.camera.short', { default: 'Câmara' })}</small>
							</button>
							<button type="button" disabled={callStore.screenSharing} onclick={() => void callStore.flipCamera()} aria-label={$t('calls.camera_flip', { default: 'Trocar câmara' })}>
								<span aria-hidden="true">🔄</span><small>{$t('calls.flip.short', { default: 'Rodar' })}</small>
							</button>
						{/if}
					{:else}
						<button type="button" class:active={callStore.attentionMuted} onclick={() => callStore.toggleAttentionMuted()} aria-label={callStore.attentionMuted ? $t('calls.sound.enable', { default: 'Ligar som' }) : $t('calls.sound.disable', { default: 'Silenciar toque' })}>
							<span aria-hidden="true">{callStore.attentionMuted ? '🔕' : '🔔'}</span><small>{$t('calls.sound.short', { default: 'Toque' })}</small>
						</button>
					{/if}
					<button type="button" class="hangup" data-call-action="hangup" onclick={() => void callStore.end()} aria-label={$t('calls.hangup', { default: 'Desligar' })}>
						<span aria-hidden="true">☎</span><small>{$t('calls.hangup', { default: 'Desligar' })}</small>
					</button>
				</div>
			{/if}

			{#if showTerminalActions}
				<section class="terminal-actions" aria-label={$t('calls.followup.actions', { default: 'O que queres fazer agora' })}>
					<a class="open-chat" href={chatHref} onclick={() => callStore.dismiss()}>
						<span aria-hidden="true">💬</span> {$t('calls.followup.open_chat', { default: 'Abrir conversa' })}
					</a>
					{#if callStore.canSendCallFollowup}
						<div class="quick-replies" aria-label={$t('calls.followup.quick_replies', { default: 'Respostas rápidas' })}>
							<button
								type="button"
								disabled={callStore.followupStatus === 'sending' || callStore.followupStatus === 'sent'}
								onclick={() => void callStore.sendCallFollowup('call_back', followupText('call_back'))}
							>
								{callStore.followupStatus === 'sent' && callStore.followupAction === 'call_back' ? '✓ ' : ''}{followupText('call_back')}
							</button>
							<button
								type="button"
								disabled={callStore.followupStatus === 'sending' || callStore.followupStatus === 'sent'}
								onclick={() => void callStore.sendCallFollowup('cant_now', followupText('cant_now'))}
							>
								{callStore.followupStatus === 'sent' && callStore.followupAction === 'cant_now' ? '✓ ' : ''}{followupText('cant_now')}
							</button>
						</div>
						<p class="followup-feedback" role="status" aria-live="polite">
							{#if callStore.followupStatus === 'sending'}{$t('calls.followup.sending', { default: 'A enviar…' })}
							{:else if callStore.followupStatus === 'sent'}{$t('calls.followup.sent', { default: 'Mensagem enviada ✓' })}
							{:else if callStore.followupStatus === 'failed'}{$t('calls.followup.failed', { default: 'Não foi enviada. Toca novamente para tentar.' })}{/if}
						</p>
					{/if}
				</section>
			{/if}
		</div>
	</div>
	{/if}
{/if}

<style>
	.handoff-offer-layer { position: fixed; z-index: 11010; inset: 0; display: grid; place-items: center; padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); color: #fff; }
	.handoff-offer-card { position: relative; z-index: 1; width: min(100%, 29rem); display: grid; justify-items: center; gap: .72rem; padding: clamp(1.35rem, 5vw, 2.2rem); border: 1px solid rgba(255,255,255,.25); border-radius: 2rem; background: linear-gradient(155deg, rgba(30,41,67,.98), rgba(10,18,34,.98)); box-shadow: 0 30px 90px rgba(0,0,0,.55), 0 0 80px rgba(244,114,182,.16); text-align: center; }
	.handoff-icon { width: 82px; height: 82px; display: grid; place-items: center; border-radius: 50%; background: linear-gradient(145deg, rgba(244,114,182,.32), rgba(96,165,250,.3)); box-shadow: 0 0 0 10px rgba(255,255,255,.05); font-size: 2.65rem; animation: handoff-float 1.8s ease-in-out infinite; }
	.handoff-kicker { margin: .25rem 0 -.35rem; color: #f9a8d4; font-size: .72rem; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; }
	.handoff-offer-card h2 { margin: 0; font-size: clamp(1.35rem, 5vw, 1.85rem); }
	.handoff-offer-card > p:not(.handoff-kicker):not(.handoff-error) { margin: 0; color: rgba(255,255,255,.7); font-size: .88rem; line-height: 1.5; }
	.handoff-offer-actions { width: 100%; display: grid; grid-template-columns: 1fr 1.2fr; gap: .65rem; margin-top: .35rem; }
	.handoff-offer-actions button { min-height: 50px; border: 1px solid rgba(255,255,255,.22); border-radius: 999px; color: #fff; font: inherit; font-weight: 850; cursor: pointer; }
	.handoff-offer-actions button:disabled { opacity: .58; cursor: wait; }
	.handoff-decline { background: rgba(255,255,255,.08); }
	.handoff-accept { background: linear-gradient(135deg, #ec4899, #8b5cf6); box-shadow: 0 12px 28px rgba(236,72,153,.28); }
	.handoff-panel { width: min(100%, 31rem); display: grid; justify-items: center; gap: .48rem; }
	.handoff-open { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: .42rem; padding: .5rem .82rem; border: 1px solid rgba(255,255,255,.22); border-radius: 999px; background: rgba(8,15,29,.58); color: #fff; font: inherit; font-size: .72rem; font-weight: 800; cursor: pointer; }
	.handoff-open:disabled { opacity: .5; cursor: wait; }
	.handoff-picker, .handoff-waiting { width: 100%; border: 1px solid rgba(255,255,255,.23); border-radius: 1.15rem; background: rgba(8,15,29,.93); box-shadow: 0 18px 48px rgba(0,0,0,.36); backdrop-filter: blur(18px); }
	.handoff-picker { padding: .75rem; text-align: start; }
	.handoff-picker-head { display: flex; align-items: flex-start; justify-content: space-between; gap: .6rem; }
	.handoff-picker-head > div { min-width: 0; display: grid; gap: .15rem; }
	.handoff-picker-head strong { font-size: .84rem; }
	.handoff-picker-head small { color: rgba(255,255,255,.62); font-size: .68rem; }
	.handoff-picker-head > button { width: 34px; height: 34px; flex: 0 0 34px; border: 0; border-radius: 50%; background: rgba(255,255,255,.1); color: #fff; font: inherit; font-size: 1.25rem; cursor: pointer; }
	.handoff-loading, .handoff-empty { margin: .65rem 0 .1rem; padding: .65rem; border-radius: .75rem; background: rgba(255,255,255,.06); color: rgba(255,255,255,.72); font-size: .72rem; line-height: 1.45; }
	.handoff-targets { display: grid; gap: .42rem; margin-top: .65rem; }
	.handoff-targets button { width: 100%; min-height: 58px; display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: .58rem; padding: .55rem .65rem; border: 1px solid rgba(255,255,255,.15); border-radius: .85rem; background: rgba(255,255,255,.07); color: #fff; text-align: start; font: inherit; cursor: pointer; }
	.handoff-targets button > span:nth-child(2) { min-width: 0; display: grid; gap: .12rem; }
	.handoff-targets strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .76rem; }
	.handoff-targets small { color: #86efac; font-size: .65rem; font-weight: 750; }
	.handoff-waiting { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: .65rem; padding: .65rem .75rem; text-align: start; }
	.handoff-waiting > span { font-size: 1.4rem; animation: handoff-float 1.8s ease-in-out infinite; }
	.handoff-waiting > div { min-width: 0; display: grid; gap: .12rem; }
	.handoff-waiting strong { font-size: .75rem; }
	.handoff-waiting small { color: rgba(255,255,255,.62); font-size: .64rem; }
	.handoff-waiting button { min-height: 36px; padding: .35rem .65rem; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; background: rgba(255,255,255,.1); color: #fff; font: inherit; font-size: .65rem; font-weight: 800; cursor: pointer; }
	.handoff-error { width: min(100%, 31rem); margin: 0; padding: .52rem .68rem; border: 1px solid rgba(253,164,175,.4); border-radius: .75rem; background: rgba(127,29,29,.42); color: #ffe4e6; font-size: .7rem; font-weight: 720; text-align: center; }
	.call-mini { position: fixed; z-index: 10950; inset-inline: max(.65rem, env(safe-area-inset-left)) max(.65rem, env(safe-area-inset-right)); bottom: calc(5.35rem + var(--page-bottom-inset, 0px) + env(safe-area-inset-bottom)); width: min(44rem, calc(100vw - 1.3rem)); min-height: 72px; margin-inline: auto; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: .65rem; padding: .58rem .68rem; border: 1px solid rgba(255,255,255,.2); border-radius: 1.25rem; background: linear-gradient(135deg, rgba(20,32,54,.97), rgba(8,15,29,.98)); color: #fff; box-shadow: 0 20px 54px rgba(0,0,0,.42), 0 0 0 1px rgba(244,114,182,.1); backdrop-filter: blur(20px); animation: mini-enter .24s ease-out both; }
	.mini-identity { min-width: 0; min-height: 52px; display: flex; align-items: center; gap: .65rem; padding: 0; border: 0; background: transparent; color: inherit; text-align: start; font: inherit; cursor: pointer; }
	.mini-avatar { width: 48px; height: 48px; flex: 0 0 48px; display: grid; place-items: center; overflow: hidden; border: 1px solid rgba(255,255,255,.42); border-radius: 50%; background: linear-gradient(145deg, rgba(244,114,182,.55), rgba(96,165,250,.3)); font-size: 1.7rem; }
	.mini-avatar img { width: 100%; height: 100%; object-fit: cover; }
	.mini-copy { min-width: 0; display: grid; gap: .12rem; }
	.mini-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .88rem; }
	.mini-copy > span { color: rgba(255,255,255,.68); font-size: .72rem; font-variant-numeric: tabular-nums; }
	.mini-quality { display: inline-flex; align-items: center; gap: .35rem; color: rgba(255,255,255,.72); font-size: .68rem; font-weight: 750; }
	.mini-quality i { width: 9px; height: 9px; border-radius: 50%; background: #94a3b8; box-shadow: 0 0 0 4px rgba(148,163,184,.12); }
	.call-mini[data-quality='good'] .mini-quality i { background: #4ade80; box-shadow: 0 0 0 4px rgba(74,222,128,.14); }
	.call-mini[data-quality='fair'] .mini-quality i { background: #facc15; box-shadow: 0 0 0 4px rgba(250,204,21,.14); }
	.call-mini[data-quality='poor'] .mini-quality i { background: #fb7185; box-shadow: 0 0 0 4px rgba(251,113,133,.14); }
	.mini-actions { display: flex; align-items: center; gap: .38rem; }
	.mini-actions button { width: 43px; height: 43px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.18); border-radius: 50%; background: rgba(255,255,255,.11); color: #fff; font: inherit; cursor: pointer; }
	.mini-actions button.active { background: #fff; color: #17233a; }
	.mini-actions .mini-hangup { background: #ef4444; border-color: #fb7185; }
	.mini-hangup span { display: inline-block; transform: rotate(135deg); }
	.call-layer { position: fixed; inset: 0; z-index: 11000; display: grid; place-items: center; padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); isolation: isolate; color: #fff; overflow: auto; }
	.call-backdrop { position: absolute; inset: 0; z-index: -2; background: radial-gradient(circle at 50% 22%, rgba(244,114,182,.38), transparent 34%), radial-gradient(circle at 15% 90%, rgba(96,165,250,.2), transparent 36%), linear-gradient(155deg, #1b2942, #080f1d 70%); backdrop-filter: blur(20px); }
	.attention .call-backdrop::after { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 50% 42%, rgba(251,113,133,.23), transparent 46%); animation: backdrop-beat 1.25s ease-in-out infinite; }
	.video-stage { position: absolute; inset: 0; z-index: -1; overflow: hidden; background: #050914; }
	.remote-video { width: 100%; height: 100%; object-fit: cover; }
	.video-wait { position: absolute; inset: 0; display: grid; place-items: center; background: radial-gradient(circle, #374665, #0a1222 70%); }
	.video-wait span { font-size: clamp(5rem, 22vw, 10rem); filter: drop-shadow(0 18px 34px rgba(0,0,0,.35)); animation: breathe 1.8s ease-in-out infinite; }
	.local-video { position: absolute; top: max(1rem, env(safe-area-inset-top)); inset-inline-end: max(1rem, env(safe-area-inset-right)); width: min(31vw, 150px); aspect-ratio: 3 / 4; object-fit: cover; border-radius: 1.1rem; border: 2px solid rgba(255,255,255,.75); box-shadow: 0 12px 30px rgba(0,0,0,.4); transform: scaleX(-1); }
	.local-video.screen-sharing { width: min(42vw, 220px); aspect-ratio: 16 / 10; transform: none; }
	.call-panel { width: min(94vw, 34rem); min-height: min(730px, calc(100dvh - 2rem)); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: .5rem; }
	.video-call .call-panel { justify-content: flex-end; min-height: calc(100dvh - max(2rem, env(safe-area-inset-top) + env(safe-area-inset-bottom))); padding-bottom: clamp(.5rem, 3vh, 2rem); text-shadow: 0 2px 10px rgba(0,0,0,.8); }
	.call-meta { display: flex; align-items: center; justify-content: center; gap: .5rem; min-height: 30px; margin-bottom: .5rem; }
	.kind-pill, .network-pill, .privacy-pill, .minimize-call { padding: .32rem .68rem; border: 1px solid rgba(255,255,255,.2); border-radius: 999px; background: rgba(255,255,255,.11); color: #fff; font: inherit; font-size: .78rem; font-weight: 800; letter-spacing: .02em; backdrop-filter: blur(12px); }
	.minimize-call { position: fixed; z-index: 3; top: max(.75rem, env(safe-area-inset-top)); inset-inline-start: max(.75rem, env(safe-area-inset-left)); min-height: 42px; cursor: pointer; }
	.network-pill { color: #fde68a; background: rgba(146,64,14,.28); }
	.privacy-pill { color: #bbf7d0; background: rgba(20,83,45,.35); border-color: rgba(74,222,128,.32); }
	.avatar-stage { position: relative; width: clamp(126px, 35vw, 178px); aspect-ratio: 1; display: grid; place-items: center; margin: .35rem; }
	.call-avatar { position: relative; z-index: 2; width: 86%; aspect-ratio: 1; display: grid; place-items: center; border-radius: 50%; background: linear-gradient(145deg, rgba(244,114,182,.58), rgba(96,165,250,.32)); border: 2px solid rgba(255,255,255,.72); box-shadow: 0 22px 55px rgba(0,0,0,.4), 0 0 50px rgba(244,114,182,.28); animation: call-pulse 1.8s ease-in-out infinite; overflow: hidden; }
	.signal-rings, .signal-rings i { position: absolute; inset: 0; border-radius: 50%; }
	.signal-rings i { border: 2px solid rgba(251,113,133,.45); opacity: 0; }
	.attention .signal-rings i { animation: signal-ring 1.8s ease-out infinite; }
	.attention .signal-rings i:nth-child(2) { animation-delay: .55s; }
	.attention .signal-rings i:nth-child(3) { animation-delay: 1.1s; }
	.attention .call-avatar { animation: urgent-pulse .72s ease-in-out infinite; }
	.video-call .avatar-stage { width: 86px; }
	.call-avatar img { width: 100%; height: 100%; object-fit: cover; }
	.call-avatar span { font-size: clamp(4rem, 17vw, 6.7rem); }
	.video-call .call-avatar span { font-size: 3rem; }
	h2 { margin: .7rem 0 0; font-size: clamp(1.75rem, 6vw, 2.55rem); line-height: 1.1; text-wrap: balance; }
	.call-status { min-height: 1.55em; margin: .1rem 0 .65rem; color: rgba(255,255,255,.82); font-weight: 720; text-wrap: balance; }
	.inline-error { max-width: 30rem; margin: -.25rem 0 .5rem; padding: .55rem .75rem; border: 1px solid rgba(253,164,175,.42); border-radius: .8rem; background: rgba(127,29,29,.34); color: #ffe4e6; font-size: .82rem; font-weight: 720; }
	.playback-unlock { min-height: 46px; margin: -.25rem 0 .5rem; padding: .58rem .9rem; border: 1px solid #fde68a; border-radius: 999px; background: rgba(146,64,14,.72); color: #fff; font: inherit; font-size: .82rem; font-weight: 800; cursor: pointer; }
	.call-timeline { position: relative; width: min(100%, 30rem); display: grid; grid-template-columns: repeat(4, 1fr); gap: .2rem; padding: 0; margin: .25rem 0 1.1rem; list-style: none; }
	.call-timeline::before { content: ''; position: absolute; top: 15px; left: 12.5%; right: 12.5%; height: 2px; background: rgba(255,255,255,.17); }
	.call-timeline li { position: relative; z-index: 1; display: grid; justify-items: center; gap: .32rem; color: rgba(255,255,255,.5); font-weight: 700; font-size: .7rem; }
	.call-timeline li > span { width: 31px; height: 31px; display: grid; place-items: center; border-radius: 50%; background: #26344d; border: 2px solid rgba(255,255,255,.18); font-size: .72rem; }
	.call-timeline li.done, .call-timeline li.current { color: #fff; }
	.call-timeline li.done > span { background: #ec4899; border-color: #f9a8d4; }
	.call-timeline li.current > span { background: #fff; color: #17233a; border-color: #fff; box-shadow: 0 0 0 6px rgba(244,114,182,.17); animation: step-pulse 1.4s ease-in-out infinite; }
	.incoming-hint { margin: .1rem 0 .45rem; color: #fbcfe8; font-weight: 780; }
	.preference-hint { max-width: 29rem; margin: -.1rem 0 .25rem; padding: .55rem .72rem; border: 1px solid rgba(251,191,36,.28); border-radius: .8rem; background: rgba(120,53,15,.26); color: #fef3c7; font-size: .73rem; line-height: 1.4; }
	.incoming-actions { display: flex; gap: clamp(3.2rem, 18vw, 7rem); margin-top: .5rem; }
	.round { min-width: 88px; min-height: 106px; display: flex; flex-direction: column; align-items: center; gap: .58rem; border: 0; background: transparent; color: #fff; font: inherit; cursor: pointer; }
	.round:disabled { opacity: .52; cursor: wait; }
	.round > span { width: 78px; height: 78px; display: grid; place-items: center; border-radius: 50%; font-size: 2rem; box-shadow: 0 15px 34px rgba(0,0,0,.32); }
	.round small { font-weight: 800; }
	.decline > span { background: linear-gradient(145deg, #fb7185, #dc2626); transform: rotate(135deg); }
	.accept > span { background: linear-gradient(145deg, #4ade80, #16a34a); animation: accept-pop 1.05s ease-in-out infinite; }
	.attention-toggle { min-height: 44px; margin-top: .3rem; padding: .45rem .9rem; border: 0; background: transparent; color: rgba(255,255,255,.74); font: inherit; font-size: .82rem; font-weight: 700; cursor: pointer; }
	.call-controls { display: flex; align-items: flex-start; justify-content: center; flex-wrap: wrap; gap: .7rem; margin-top: .6rem; }
	.call-controls button { min-width: 64px; min-height: 76px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .3rem; padding: .35rem; border: 1px solid rgba(255,255,255,.2); border-radius: 1.25rem; background: rgba(255,255,255,.14); color: #fff; font: inherit; cursor: pointer; backdrop-filter: blur(12px); }
	.call-controls button > span { font-size: 1.35rem; }
	.call-controls button small { font-size: .67rem; font-weight: 750; }
	.call-controls button.active { background: rgba(255,255,255,.9); color: #18243b; }
	.call-controls button:disabled { opacity: .42; cursor: not-allowed; }
	.call-controls .hangup { min-width: 76px; background: #ef4444; border-color: #fb7185; }
	.call-controls .hangup > span { font-size: 1.7rem; transform: rotate(135deg); }
	.result-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: .65rem; }
	.dismiss, .retry { min-height: 48px; padding: .72rem 1.45rem; border: 1px solid rgba(255,255,255,.24); border-radius: 999px; background: rgba(255,255,255,.12); color: #fff; font: inherit; font-weight: 850; cursor: pointer; }
	.retry { background: #fff; color: #18243b; }
	.terminal-actions { width: min(100%, 30rem); display: grid; justify-items: center; gap: .55rem; margin-top: .35rem; }
	.open-chat, .quick-replies button { min-height: 44px; border: 1px solid rgba(255,255,255,.23); border-radius: 999px; color: #fff; font: inherit; font-size: .8rem; font-weight: 800; }
	.open-chat { display: inline-flex; align-items: center; justify-content: center; gap: .4rem; padding: .58rem 1rem; background: rgba(255,255,255,.13); text-decoration: none; }
	.quick-replies { display: flex; flex-wrap: wrap; justify-content: center; gap: .45rem; }
	.quick-replies button { padding: .5rem .78rem; background: rgba(244,114,182,.2); cursor: pointer; }
	.quick-replies button:disabled { opacity: .58; cursor: default; }
	.followup-feedback { min-height: 1.2em; margin: 0; color: rgba(255,255,255,.72); font-size: .73rem; font-weight: 700; }
	button:focus-visible { outline: 3px solid #f9a8d4; outline-offset: 4px; }
	.call-layer[data-phase='ended'] .call-avatar, .call-layer[data-phase='error'] .call-avatar { animation: none; filter: grayscale(.22); }
	.call-layer[data-phase='reconnecting'] .call-avatar { animation: reconnect-pulse .9s ease-in-out infinite; }
	@keyframes call-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.045); box-shadow: 0 22px 55px rgba(0,0,0,.4), 0 0 60px rgba(244,114,182,.42); } }
	@keyframes urgent-pulse { 0%,100% { transform: scale(.98) rotate(-1deg); } 50% { transform: scale(1.085) rotate(1deg); } }
	@keyframes signal-ring { 0% { transform: scale(.76); opacity: .8; } 90%,100% { transform: scale(1.42); opacity: 0; } }
	@keyframes backdrop-beat { 0%,100% { opacity: .45; } 50% { opacity: 1; } }
	@keyframes accept-pop { 0%,100% { transform: scale(1); } 50% { transform: scale(1.13); } }
	@keyframes breathe { 0%,100% { transform: scale(.94); } 50% { transform: scale(1.06); } }
	@keyframes step-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.09); } }
	@keyframes reconnect-pulse { 0%,100% { opacity: .66; transform: scale(.96); } 50% { opacity: 1; transform: scale(1.03); } }
	@keyframes mini-enter { from { opacity: 0; transform: translateY(12px) scale(.98); } to { opacity: 1; transform: none; } }
	@keyframes handoff-float { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-6px) rotate(2deg); } }
	@media (max-width: 560px) { .call-mini { grid-template-columns: minmax(0, 1fr) auto; gap: .45rem; } .mini-quality { grid-column: 1; padding-inline-start: 3.35rem; margin-top: -.55rem; } .mini-quality span { display: none; } .mini-actions { grid-column: 2; grid-row: 1 / span 2; } .mini-actions button { width: 40px; height: 40px; } }
	@media (max-width: 380px) { .call-mini { padding-inline: .5rem; } .mini-avatar { width: 42px; height: 42px; flex-basis: 42px; } .mini-restore { display: none !important; } }
	@media (max-height: 700px) { .call-panel { min-height: calc(100dvh - 2rem); } .avatar-stage { width: 112px; } .call-meta { margin-bottom: 0; } .call-timeline { margin-bottom: .45rem; } h2 { margin-top: .25rem; } }
	@media (orientation: landscape) and (max-height: 540px) { .call-panel { display: grid; grid-template-columns: 130px minmax(220px, 1fr); grid-auto-rows: min-content; column-gap: 1.2rem; align-content: center; } .call-meta, .avatar-stage { grid-column: 1; } h2, .call-status, .call-timeline, .incoming-hint, .incoming-actions, .attention-toggle, .call-controls, .handoff-panel, .result-actions, .dismiss { grid-column: 2; } .avatar-stage { grid-row: 2 / span 5; align-self: center; } .call-meta { grid-row: 1; } h2 { margin-top: 0; } }
	@media (prefers-reduced-motion: reduce) { .call-mini, .call-avatar, .signal-rings i, .accept > span, .video-wait span, .call-backdrop::after, .call-timeline li.current > span, .handoff-icon, .handoff-waiting > span { animation: none !important; } }
</style>
