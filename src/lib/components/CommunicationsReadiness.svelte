<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { CallAudioManager } from '$lib/calls/call-audio';
	import type { PushState } from '$lib/push';
	import {
		buildReadinessItems,
		probeMediaCapture,
		type BrowserReadinessSignals,
		type MediaProbeResult,
		type ReadinessCapability,
		type ReadinessItem,
		type ReadinessLevel
	} from '$lib/communications/readiness';

	interface Props {
		pushState: PushState;
		refreshPush?: () => Promise<void> | void;
	}

	let { pushState, refreshPush }: Props = $props();

	const EMPTY_SIGNALS: BrowserReadinessSignals = {
		online: true,
		secureContext: false,
		serviceWorkerSupported: false,
		serviceWorkerActive: null,
		mediaCaptureSupported: false,
		audioOutputSupported: false,
		vibrationSupported: false,
		ios: false,
		installed: false
	};

	let signals = $state<BrowserReadinessSignals>(EMPTY_SIGNALS);
	let attentionTesting = $state(false);
	let mediaTesting = $state(false);
	let refreshing = $state(false);
	let mediaResult = $state<MediaProbeResult | null>(null);
	let reducedMotion = $state(false);
	let attentionTimer: ReturnType<typeof setTimeout> | null = null;
	let attentionAudio: CallAudioManager | null = null;
	let mounted = false;

	const items = $derived(buildReadinessItems(signals, pushState));
	const canTestAttention = $derived(signals.audioOutputSupported || signals.vibrationSupported);
	const canTestMedia = $derived(signals.secureContext && signals.mediaCaptureSupported);

	const capabilityIcons: Record<ReadinessCapability, string> = {
		network: '↗',
		push: '🔔',
		serviceWorker: '⚙',
		media: '🎙',
		audio: '🔊',
		vibration: '〰'
	};

	function capabilityLabel(capability: ReadinessCapability): string {
		return `comms.readiness.capability.${capability}`;
	}

	function detailLabel(item: ReadinessItem): string {
		return `comms.readiness.detail.${item.detail}`;
	}

	function levelLabel(level: ReadinessLevel): string {
		return `comms.readiness.level.${level}`;
	}

	function readPlatformSignals(serviceWorkerActive: boolean | null): BrowserReadinessSignals {
		const nav = navigator as Navigator & { standalone?: boolean };
		const ios =
			/iphone|ipad|ipod/i.test(nav.userAgent) ||
			(/macintosh/i.test(nav.userAgent) && nav.maxTouchPoints > 1);
		const installed =
			window.matchMedia('(display-mode: standalone)').matches ||
			window.matchMedia('(display-mode: fullscreen)').matches ||
			nav.standalone === true;
		const WindowWithWebkitAudio = window as typeof window & {
			webkitAudioContext?: typeof AudioContext;
		};

		return {
			online: nav.onLine,
			secureContext: window.isSecureContext,
			serviceWorkerSupported: 'serviceWorker' in nav,
			serviceWorkerActive,
			mediaCaptureSupported: typeof nav.mediaDevices?.getUserMedia === 'function',
			audioOutputSupported: Boolean(window.AudioContext || WindowWithWebkitAudio.webkitAudioContext),
			vibrationSupported: typeof nav.vibrate === 'function',
			ios,
			installed
		};
	}

	async function refreshServiceWorker(): Promise<void> {
		if (!('serviceWorker' in navigator)) return;
		try {
			const registration = await navigator.serviceWorker.getRegistration();
			if (!mounted) return;
			signals = readPlatformSignals(Boolean(registration?.active || navigator.serviceWorker.controller));
		} catch {
			if (mounted) signals = readPlatformSignals(false);
		}
	}

	async function refreshDiagnostics(): Promise<void> {
		if (refreshing) return;
		refreshing = true;
		await Promise.allSettled([refreshServiceWorker(), Promise.resolve(refreshPush?.())]);
		if (mounted) refreshing = false;
	}

	function stopAttentionTest(): void {
		if (attentionTimer) clearTimeout(attentionTimer);
		attentionTimer = null;
		attentionAudio?.stop();
		attentionTesting = false;
	}

	function toggleAttentionTest(): void {
		if (attentionTesting) {
			stopAttentionTest();
			return;
		}
		// This entire start path is synchronous from the tap/click. That is
		// required by mobile autoplay and vibration gesture policies.
		attentionAudio ??= new CallAudioManager();
		attentionAudio.setReducedMotion(reducedMotion);
		attentionAudio.primeFromGesture();
		attentionAudio.startIncoming();
		attentionTesting = true;
		attentionTimer = setTimeout(stopAttentionTest, 8_000);
	}

	async function runMediaTest(): Promise<void> {
		if (mediaTesting || !canTestMedia) return;
		mediaTesting = true;
		mediaResult = null;
		const result = await probeMediaCapture((constraints) =>
			navigator.mediaDevices.getUserMedia(constraints)
		);
		if (mounted) {
			mediaResult = result;
			mediaTesting = false;
		}
	}

	onMount(() => {
		mounted = true;
		const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateReducedMotion = () => {
			reducedMotion = reducedMotionQuery.matches;
			attentionAudio?.setReducedMotion(reducedMotion);
		};
		updateReducedMotion();
		signals = readPlatformSignals('serviceWorker' in navigator ? null : false);
		void refreshServiceWorker();

		const refreshOnlineState = () => {
			signals = { ...signals, online: navigator.onLine };
		};
		const stopWhenHidden = () => {
			if (document.visibilityState === 'hidden') stopAttentionTest();
			else void refreshServiceWorker();
		};
		window.addEventListener('online', refreshOnlineState);
		window.addEventListener('offline', refreshOnlineState);
		window.addEventListener('focus', refreshServiceWorker);
		window.addEventListener('pagehide', stopAttentionTest);
		document.addEventListener('visibilitychange', stopWhenHidden);
		reducedMotionQuery.addEventListener?.('change', updateReducedMotion);

		return () => {
			mounted = false;
			stopAttentionTest();
			window.removeEventListener('online', refreshOnlineState);
			window.removeEventListener('offline', refreshOnlineState);
			window.removeEventListener('focus', refreshServiceWorker);
			window.removeEventListener('pagehide', stopAttentionTest);
			document.removeEventListener('visibilitychange', stopWhenHidden);
			reducedMotionQuery.removeEventListener?.('change', updateReducedMotion);
		};
	});
</script>

<section class="readiness" aria-labelledby="communications-readiness-title">
	<div class="heading">
		<div>
			<h3 id="communications-readiness-title">{$t('comms.readiness.title')}</h3>
			<p>{$t('comms.readiness.intro')}</p>
		</div>
		<button
			type="button"
			class="refresh"
			disabled={refreshing}
			onclick={() => void refreshDiagnostics()}
			aria-label={$t('comms.readiness.refresh')}
			title={$t('comms.readiness.refresh')}
		>
			<span class:spinning={refreshing} aria-hidden="true">↻</span>
		</button>
	</div>

	<ul class="capabilities">
		{#each items as item (item.capability)}
			<li>
				<span class="capability-icon" aria-hidden="true">{capabilityIcons[item.capability]}</span>
				<span class="capability-copy">
					<strong>{$t(capabilityLabel(item.capability))}</strong>
					<small>{$t(detailLabel(item))}</small>
				</span>
				<span class:ready={item.level === 'ready'} class:attention={item.level === 'attention'} class:unavailable={item.level === 'unavailable'} class:unknown={item.level === 'unknown'} class="state">
					{$t(levelLabel(item.level))}
				</span>
			</li>
		{/each}
	</ul>

	<div class="tests" aria-label={$t('comms.readiness.tests')}>
		<button
			type="button"
			class="test-button attention-test"
			class:running={attentionTesting}
			aria-pressed={attentionTesting}
			disabled={!canTestAttention}
			onclick={toggleAttentionTest}
		>
			<span aria-hidden="true">{attentionTesting ? '■' : '▶'}</span>
			{attentionTesting
				? $t('comms.readiness.attention.stop')
				: $t('comms.readiness.attention.start')}
		</button>
		<button
			type="button"
			class="test-button"
			disabled={!canTestMedia || mediaTesting}
			onclick={() => void runMediaTest()}
		>
			<span aria-hidden="true">🎙</span>
			{mediaTesting
				? $t('comms.readiness.media.testing')
				: $t('comms.readiness.media.test')}
		</button>
	</div>

	<div class="test-feedback" role="status" aria-live="polite">
		{#if attentionTesting}
			<p>
				{$t(reducedMotion
					? 'comms.readiness.attention.running_reduced'
					: 'comms.readiness.attention.running')}
			</p>
		{:else if mediaResult}
			<p class:success={mediaResult === 'passed'}>
				{$t(`comms.readiness.media.${mediaResult}`)}
			</p>
		{/if}
	</div>

	<p class="privacy">🔒 {$t('comms.readiness.media.privacy')}</p>
	<div class="system-limit">
		<strong>{$t('comms.readiness.system.title')}</strong>
		<p>{$t('comms.readiness.system.body')}</p>
	</div>
</section>

<style>
	.readiness {
		width: 100%;
		margin-top: 0.8rem;
		padding-top: 0.9rem;
		border-top: 1px solid var(--border);
		text-align: start;
	}
	.heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}
	h3 {
		margin: 0;
		font-size: 0.96rem;
		color: var(--txt);
	}
	.heading p {
		margin: 0.2rem 0 0;
		font-size: 0.78rem;
		line-height: 1.4;
		color: var(--txt3);
	}
	.refresh {
		flex: 0 0 44px;
		width: 44px;
		height: 44px;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: var(--card);
		color: var(--txt2);
		font: inherit;
		font-size: 1.2rem;
		cursor: pointer;
	}
	.refresh:hover,
	.refresh:focus-visible {
		border-color: var(--accent);
		color: var(--accent);
		outline: none;
	}
	.refresh:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.spinning {
		display: inline-block;
		animation: readiness-spin 0.8s linear infinite;
	}
	@keyframes readiness-spin {
		to { transform: rotate(360deg); }
	}
	.capabilities {
		list-style: none;
		padding: 0;
		margin: 0.75rem 0;
		display: grid;
		gap: 0.4rem;
	}
	.capabilities li {
		display: grid;
		grid-template-columns: 1.75rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.5rem;
		min-height: 52px;
		padding: 0.45rem 0.55rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		background: color-mix(in srgb, var(--card) 78%, transparent);
	}
	.capability-icon {
		display: grid;
		place-items: center;
		font-size: 0.95rem;
		color: var(--txt2);
	}
	.capability-copy {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 0.08rem;
	}
	.capability-copy strong {
		font-size: 0.82rem;
		color: var(--txt);
	}
	.capability-copy small {
		font-size: 0.7rem;
		line-height: 1.3;
		color: var(--txt3);
	}
	.state {
		padding: 0.22rem 0.4rem;
		border-radius: 999px;
		font-size: 0.64rem;
		font-weight: 800;
		line-height: 1.15;
		color: var(--txt2);
		background: color-mix(in srgb, var(--txt3) 12%, transparent);
		white-space: nowrap;
	}
	.state.ready {
		color: var(--success, #15803d);
		background: color-mix(in srgb, var(--success, #22c55e) 14%, transparent);
	}
	.state.attention {
		color: #b45309;
		background: color-mix(in srgb, #f59e0b 15%, transparent);
	}
	.state.unavailable {
		color: var(--danger, #dc2626);
		background: color-mix(in srgb, var(--danger, #ef4444) 12%, transparent);
	}
	.tests {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.45rem;
	}
	.test-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		min-height: 46px;
		padding: 0.5rem 0.7rem;
		border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
		border-radius: 0.7rem;
		background: color-mix(in srgb, var(--accent) 8%, var(--card));
		color: var(--txt);
		font: inherit;
		font-size: 0.78rem;
		font-weight: 750;
		cursor: pointer;
	}
	.test-button:hover:not(:disabled),
	.test-button:focus-visible:not(:disabled) {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 15%, var(--card));
		outline: none;
	}
	.test-button.running {
		border-color: var(--danger, #ef4444);
		color: var(--danger, #dc2626);
	}
	.test-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.test-feedback {
		min-height: 1.5rem;
	}
	.test-feedback p {
		margin: 0.4rem 0 0;
		font-size: 0.74rem;
		line-height: 1.35;
		color: #b45309;
	}
	.test-feedback p.success {
		color: var(--success, #15803d);
	}
	.privacy {
		margin: 0.2rem 0 0;
		font-size: 0.69rem;
		line-height: 1.35;
		color: var(--txt3);
	}
	.system-limit {
		margin-top: 0.65rem;
		padding: 0.65rem 0.7rem;
		border-radius: 0.7rem;
		background: color-mix(in srgb, #f59e0b 8%, var(--card));
		border: 1px solid color-mix(in srgb, #f59e0b 22%, var(--border));
	}
	.system-limit strong {
		font-size: 0.72rem;
		color: var(--txt2);
	}
	.system-limit p {
		margin: 0.2rem 0 0;
		font-size: 0.69rem;
		line-height: 1.42;
		color: var(--txt3);
	}
	@media (min-width: 420px) {
		.tests {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		*,
		*::before,
		*::after {
			scroll-behavior: auto !important;
			transition: none !important;
			animation: none !important;
		}
	}
</style>
