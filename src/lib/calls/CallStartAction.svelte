<script lang="ts">
	import { t } from 'svelte-i18n';
	import { callStore } from './call-store.svelte';
	import {
		CALL_START_REASON_COPY,
		resolveCallStartBlockReason,
		type CallStartBlockReason
	} from './call-start-state';
	import type { CallKind } from './types';

	interface Props {
		conversationId: string | null;
		kind: CallKind;
		variant?: 'icon' | 'history';
		disabledReason?: CallStartBlockReason | null;
		descriptionId: string;
	}

	let {
		conversationId,
		kind,
		variant = 'icon',
		disabledReason = null,
		descriptionId
	}: Props = $props();

	const storeReason = $derived(callStore.getStartDisabledReason(conversationId));
	const blockedReason = $derived(resolveCallStartBlockReason(storeReason, disabledReason));
	const blocked = $derived(blockedReason !== null);
	const reasonElementId = $derived(`call-start-reason-${descriptionId.replace(/[^A-Za-z0-9_-]/g, '-')}-${kind}`);

	function translatedReason(): string {
		if (!blockedReason) return '';
		const copy = CALL_START_REASON_COPY[blockedReason];
		return $t(copy.key, { default: copy.default });
	}

	function actionLabel(): string {
		if (variant === 'history') {
			return kind === 'video'
				? $t('mensagens.call.call_again.video', { default: 'Voltar a ligar por vídeo' })
				: $t('mensagens.call.call_again.audio', { default: 'Voltar a ligar por voz' });
		}
		return kind === 'video'
			? $t('calls.start.video', { default: 'Iniciar videochamada' })
			: $t('calls.start.audio', { default: 'Iniciar chamada de voz' });
	}

	function title(): string {
		return translatedReason() ? `${actionLabel()} — ${translatedReason()}` : actionLabel();
	}

	function start(): void {
		if (!conversationId || blocked) return;
		void callStore.startCall(conversationId, kind);
	}
</script>

<div class="call-start" class:history={variant === 'history'} data-readiness={callStore.readiness}>
	<button
		type="button"
		class="call-action"
		class:history-action={variant === 'history'}
		disabled={blocked}
		onclick={start}
		aria-label={title()}
		aria-describedby={blocked ? reasonElementId : undefined}
		title={title()}
	>
		{#if kind === 'video'}
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
		{:else}
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92z" /></svg>
		{/if}
		{#if variant === 'history'}
			<span>{$t('mensagens.call.call_again', { default: 'Voltar a ligar' })}</span>
		{/if}
	</button>
	{#if blocked}
		<small id={reasonElementId} class:sr-only={variant === 'icon'} class="blocked-reason" role="status">{translatedReason()}</small>
	{/if}
</div>

<style>
	.call-start { display: inline-flex; align-items: center; }
	.call-start.history { display: grid; justify-items: center; gap: 0.2rem; min-width: 0; }
	.call-action {
		width: 44px;
		height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
		border-radius: 999px;
		background: color-mix(in srgb, var(--accent) 9%, var(--card));
		color: var(--accent);
		cursor: pointer;
		transition: transform 130ms ease, background 130ms ease, opacity 130ms ease, box-shadow 130ms ease;
	}
	.call-action:hover:not(:disabled),
	.call-action:focus-visible:not(:disabled) {
		background: color-mix(in srgb, var(--accent) 18%, var(--card));
		transform: translateY(-1px);
		outline: none;
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent);
	}
	.call-action:active:not(:disabled) { transform: scale(0.92); }
	.call-action:disabled { opacity: 0.48; cursor: not-allowed; }
	.call-action svg { width: 21px; height: 21px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
	.history-action {
		width: auto;
		min-width: 44px;
		min-height: 44px;
		height: auto;
		gap: 0.42rem;
		padding: 0.42rem 0.78rem;
		font: inherit;
		font-size: var(--fs-xs);
		font-weight: 750;
		white-space: nowrap;
	}
	.history-action svg { width: 17px; height: 17px; }
	.blocked-reason { max-width: 15rem; color: var(--txt3); font-size: 0.68rem; line-height: 1.25; text-align: center; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
	.call-start[data-readiness='connecting'] .call-action:not(:disabled) { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent); }
	@media (prefers-reduced-motion: reduce) {
		.call-action { transition: none; }
		.call-action:hover:not(:disabled),
		.call-action:focus-visible:not(:disabled),
		.call-action:active:not(:disabled) { transform: none; }
	}
</style>
