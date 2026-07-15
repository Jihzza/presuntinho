<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { ConnectionQualityReason, ConnectionQualitySample } from './connection-quality';
	import type { CallMediaDevice, CallMediaDeviceKind } from './media-controls';
	import type { CallKind } from './types';

	type MediaAction =
		| 'refresh-devices'
		| 'microphone'
		| 'camera'
		| 'speaker'
		| 'screen-share'
		| 'picture-in-picture'
		| null;

	interface Props {
		kind: CallKind | null;
		quality: ConnectionQualitySample | null;
		devices: CallMediaDevice[];
		microphoneId: string | null;
		cameraId: string | null;
		speakerId: string | null;
		mediaAction?: MediaAction;
		mediaError?: string | null;
		screenSharing?: boolean;
		screenShareSupported?: boolean;
		pictureInPictureSupported?: boolean;
		pictureInPictureActive?: boolean;
		outputSelectionSupported?: boolean;
		onRefreshDevices: () => void | Promise<void>;
		onSelectMicrophone: (deviceId: string) => void | Promise<void>;
		onSelectCamera: (deviceId: string) => void | Promise<void>;
		onSelectSpeaker: (deviceId: string) => void | Promise<void>;
		onToggleScreenShare: () => void | Promise<void>;
		onTogglePictureInPicture: () => void | Promise<void>;
	}

	let {
		kind,
		quality,
		devices,
		microphoneId,
		cameraId,
		speakerId,
		mediaAction = null,
		mediaError = null,
		screenSharing = false,
		screenShareSupported = false,
		pictureInPictureSupported = false,
		pictureInPictureActive = false,
		outputSelectionSupported = false,
		onRefreshDevices,
		onSelectMicrophone,
		onSelectCamera,
		onSelectSpeaker,
		onToggleScreenShare,
		onTogglePictureInPicture
	}: Props = $props();

	let toolsOpen = $state(false);
	let qualityOpen = $state(false);
	const microphones = $derived(devices.filter((device) => device.kind === 'audioinput'));
	const cameras = $derived(devices.filter((device) => device.kind === 'videoinput'));
	const speakers = $derived(devices.filter((device) => device.kind === 'audiooutput'));
	const qualityRating = $derived(quality?.rating ?? 'unknown');
	const busy = $derived(mediaAction !== null);

	function selected(event: Event): string {
		return (event.currentTarget as HTMLSelectElement).value;
	}

	function deviceLabel(device: CallMediaDevice): string {
		if (device.label) return device.label;
		const prefix = device.kind === 'audioinput'
			? $t('calls.devices.microphone_fallback', { default: 'Microfone {number}', values: { number: device.fallbackOrdinal } })
			: device.kind === 'videoinput'
				? $t('calls.devices.camera_fallback', { default: 'Câmara {number}', values: { number: device.fallbackOrdinal } })
				: $t('calls.devices.speaker_fallback', { default: 'Altifalante {number}', values: { number: device.fallbackOrdinal } });
		return prefix;
	}

	function emptyDeviceLabel(kind: CallMediaDeviceKind): string {
		if (kind === 'audioinput') return $t('calls.devices.no_microphone', { default: 'Nenhum microfone encontrado' });
		if (kind === 'videoinput') return $t('calls.devices.no_camera', { default: 'Nenhuma câmara encontrada' });
		return $t('calls.devices.no_speaker', { default: 'Nenhum altifalante encontrado' });
	}

	function qualityLabel(): string {
		return $t(`calls.quality.${qualityRating}`, {
			default: qualityRating === 'good'
				? 'Ligação boa'
				: qualityRating === 'fair'
					? 'Ligação razoável'
					: qualityRating === 'poor'
						? 'Ligação fraca'
						: 'A medir ligação'
		});
	}

	function qualityReason(reason: ConnectionQualityReason): string {
		const defaults: Record<ConnectionQualityReason, string> = {
			'high-rtt': 'A resposta da rede está lenta',
			'high-jitter': 'O áudio pode oscilar',
			'packet-loss': 'A rede está a perder dados',
			'low-bitrate': 'A velocidade disponível está baixa',
			'telemetry-unavailable': 'O navegador não fornece detalhes da ligação'
		};
		return $t(`calls.quality.reason.${reason.replaceAll('-', '_')}`, { default: defaults[reason] });
	}

	function metric(value: number | null | undefined, unit: string): string {
		return value == null
			? $t('calls.quality.unavailable', { default: 'Indisponível' })
			: `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} ${unit}`;
	}
</script>

<div class="in-call-tools">
	<div class="quick-tools">
		<button
			type="button"
			class="quality-pill"
			class:good={qualityRating === 'good'}
			class:fair={qualityRating === 'fair'}
			class:poor={qualityRating === 'poor'}
			data-quality={qualityRating}
			aria-expanded={qualityOpen}
			aria-controls="call-quality-details"
			onclick={() => (qualityOpen = !qualityOpen)}
		>
			<span class="quality-bars" aria-hidden="true"><i></i><i></i><i></i></span>
			{qualityLabel()}
		</button>
		<button
			type="button"
			class="tools-toggle"
			aria-expanded={toolsOpen}
			aria-controls="call-media-tools"
			onclick={() => (toolsOpen = !toolsOpen)}
		>
			<span aria-hidden="true">⚙️</span>
			{$t('calls.tools.open', { default: 'Dispositivos e opções' })}
		</button>
	</div>

	{#if qualityOpen}
		<section id="call-quality-details" class="quality-details" aria-label={$t('calls.quality.details', { default: 'Detalhes da ligação' })}>
			<strong>{qualityLabel()}</strong>
			{#if quality?.reasons.length}
				<ul>
					{#each quality.reasons as reason}
						<li>{qualityReason(reason)}</li>
					{/each}
				</ul>
			{/if}
			<dl>
				<div><dt>{$t('calls.quality.latency', { default: 'Latência' })}</dt><dd>{metric(quality?.metrics.rttMs, 'ms')}</dd></div>
				<div><dt>{$t('calls.quality.jitter', { default: 'Oscilação' })}</dt><dd>{metric(quality?.metrics.jitterMs, 'ms')}</dd></div>
				<div><dt>{$t('calls.quality.packet_loss', { default: 'Perda de dados' })}</dt><dd>{metric(quality?.metrics.packetLossPercent, '%')}</dd></div>
				<div><dt>{$t('calls.quality.bitrate', { default: 'Velocidade de media' })}</dt><dd>{metric(quality?.metrics.totalBitrateKbps, 'kb/s')}</dd></div>
			</dl>
		</section>
	{/if}

	{#if toolsOpen}
		<section id="call-media-tools" class="media-tools" aria-label={$t('calls.tools.title', { default: 'Dispositivos da chamada' })}>
			<div class="tools-heading">
				<strong>{$t('calls.tools.title', { default: 'Dispositivos da chamada' })}</strong>
				<button type="button" class="close-tools" onclick={() => (toolsOpen = false)} aria-label={$t('calls.close', { default: 'Fechar' })}>×</button>
			</div>

			<label>
				<span>🎙️ {$t('calls.devices.microphone', { default: 'Microfone' })}</span>
				<select value={microphoneId ?? ''} disabled={busy || microphones.length === 0} onchange={(event) => void onSelectMicrophone(selected(event))}>
					{#if microphones.length === 0}<option value="">{emptyDeviceLabel('audioinput')}</option>{/if}
					{#each microphones as device}<option value={device.deviceId} disabled={!device.selectable}>{deviceLabel(device)}</option>{/each}
				</select>
			</label>

			{#if kind === 'video'}
				<label>
					<span>📹 {$t('calls.devices.camera', { default: 'Câmara' })}</span>
					<select value={cameraId ?? ''} disabled={busy || cameras.length === 0} onchange={(event) => void onSelectCamera(selected(event))}>
						{#if cameras.length === 0}<option value="">{emptyDeviceLabel('videoinput')}</option>{/if}
						{#each cameras as device}<option value={device.deviceId} disabled={!device.selectable}>{deviceLabel(device)}</option>{/each}
					</select>
				</label>
			{/if}

			{#if outputSelectionSupported}
				<label>
					<span>🔊 {$t('calls.devices.speaker', { default: 'Altifalante' })}</span>
					<select value={speakerId ?? ''} disabled={busy || speakers.length === 0} onchange={(event) => void onSelectSpeaker(selected(event))}>
						{#if speakers.length === 0}<option value="">{emptyDeviceLabel('audiooutput')}</option>{/if}
						{#each speakers as device}<option value={device.deviceId} disabled={!device.selectable}>{deviceLabel(device)}</option>{/each}
					</select>
				</label>
			{:else}
				<p class="capability-note">{$t('calls.devices.speaker_unsupported', { default: 'Este dispositivo não permite escolher o altifalante na app.' })}</p>
			{/if}

			<div class="tool-actions">
				<button type="button" disabled={busy} onclick={() => void onRefreshDevices()}>
					<span aria-hidden="true">↻</span>
					{mediaAction === 'refresh-devices' ? $t('calls.devices.refreshing', { default: 'A atualizar…' }) : $t('calls.devices.refresh', { default: 'Atualizar dispositivos' })}
				</button>
				{#if kind === 'video' && screenShareSupported}
					<button type="button" class:active={screenSharing} disabled={busy} onclick={() => void onToggleScreenShare()}>
						<span aria-hidden="true">🖥️</span>
						{screenSharing ? $t('calls.screen_share.stop', { default: 'Parar partilha' }) : $t('calls.screen_share.start', { default: 'Partilhar ecrã' })}
					</button>
				{/if}
				{#if kind === 'video' && pictureInPictureSupported}
					<button type="button" class:active={pictureInPictureActive} disabled={busy} onclick={() => void onTogglePictureInPicture()}>
						<span aria-hidden="true">▣</span>
						{pictureInPictureActive ? $t('calls.pip.exit', { default: 'Sair da janela flutuante' }) : $t('calls.pip.enter', { default: 'Janela flutuante' })}
					</button>
				{/if}
			</div>

			{#if mediaError}
				<p class="media-error" role="alert">{$t(`calls.media_error.${mediaError}`, { default: $t('calls.media_error.generic', { default: 'Não foi possível alterar esta opção. A chamada continua ligada.' }) })}</p>
			{/if}
		</section>
	{/if}
</div>

<style>
	.in-call-tools { width: min(100%, 31rem); display: grid; gap: .55rem; margin-top: .15rem; text-shadow: none; }
	.quick-tools { display: flex; flex-wrap: wrap; justify-content: center; gap: .45rem; }
	.quick-tools button { min-height: 38px; display: inline-flex; align-items: center; justify-content: center; gap: .42rem; padding: .4rem .7rem; border: 1px solid rgba(255,255,255,.25); border-radius: 999px; background: rgba(12,20,36,.66); color: #fff; font: inherit; font-size: .72rem; font-weight: 780; cursor: pointer; backdrop-filter: blur(14px); }
	.quality-pill.good { border-color: rgba(134,239,172,.75); color: #dcfce7; }
	.quality-pill.fair { border-color: rgba(253,224,71,.75); color: #fef9c3; }
	.quality-pill.poor { border-color: rgba(251,113,133,.82); color: #ffe4e6; }
	.quality-bars { height: 14px; display: flex; align-items: end; gap: 2px; }
	.quality-bars i { width: 3px; border-radius: 2px; background: currentColor; opacity: .34; }
	.quality-bars i:nth-child(1) { height: 5px; opacity: 1; }
	.quality-bars i:nth-child(2) { height: 9px; }
	.quality-bars i:nth-child(3) { height: 13px; }
	.good .quality-bars i { opacity: 1; }
	.fair .quality-bars i:nth-child(2) { opacity: 1; }
	.poor .quality-bars i:not(:first-child) { opacity: .18; }
	.quality-details, .media-tools { width: 100%; border: 1px solid rgba(255,255,255,.22); border-radius: 1.15rem; background: rgba(8,15,29,.9); box-shadow: 0 18px 48px rgba(0,0,0,.38); backdrop-filter: blur(18px); }
	.quality-details { padding: .8rem .9rem; text-align: start; }
	.quality-details > strong { display: block; margin-bottom: .38rem; }
	.quality-details ul { margin: .2rem 0 .65rem; padding-inline-start: 1.1rem; color: rgba(255,255,255,.75); font-size: .75rem; }
	.quality-details dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .4rem; margin: 0; }
	.quality-details dl div { padding: .45rem .55rem; border-radius: .72rem; background: rgba(255,255,255,.07); }
	.quality-details dt { color: rgba(255,255,255,.62); font-size: .67rem; }
	.quality-details dd { margin: .12rem 0 0; font-size: .79rem; font-weight: 800; }
	.media-tools { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .7rem; padding: .85rem; text-align: start; }
	.tools-heading { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; }
	.close-tools { width: 34px; height: 34px; border: 0; border-radius: 50%; background: rgba(255,255,255,.1); color: #fff; font: inherit; font-size: 1.3rem; cursor: pointer; }
	.media-tools label { min-width: 0; display: grid; gap: .3rem; color: rgba(255,255,255,.82); font-size: .7rem; font-weight: 750; }
	.media-tools select { width: 100%; min-height: 43px; padding: .45rem .55rem; border: 1px solid rgba(255,255,255,.22); border-radius: .72rem; background: #17233a; color: #fff; font: inherit; font-size: .76rem; }
	.media-tools select:disabled { opacity: .55; }
	.capability-note { align-self: end; margin: 0; padding: .52rem .62rem; border-radius: .72rem; background: rgba(255,255,255,.06); color: rgba(255,255,255,.66); font-size: .69rem; }
	.tool-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: .45rem; }
	.tool-actions button { min-height: 43px; display: inline-flex; align-items: center; justify-content: center; gap: .38rem; flex: 1 1 120px; padding: .45rem .7rem; border: 1px solid rgba(255,255,255,.2); border-radius: .78rem; background: rgba(255,255,255,.1); color: #fff; font: inherit; font-size: .7rem; font-weight: 780; cursor: pointer; }
	.tool-actions button.active { background: #fff; color: #17233a; }
	.tool-actions button:disabled { opacity: .55; cursor: wait; }
	.media-error { grid-column: 1 / -1; margin: 0; padding: .55rem .65rem; border: 1px solid rgba(253,164,175,.42); border-radius: .72rem; background: rgba(127,29,29,.38); color: #ffe4e6; font-size: .72rem; font-weight: 700; }
	button:focus-visible, select:focus-visible { outline: 3px solid #f9a8d4; outline-offset: 3px; }
	@media (max-width: 480px) { .media-tools { grid-template-columns: 1fr; max-height: min(55dvh, 420px); overflow: auto; } .quality-details dl { grid-template-columns: 1fr 1fr; } }
</style>
