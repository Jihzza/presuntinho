<script lang="ts">
	import { t } from 'svelte-i18n';
	import { callStore } from './call-store.svelte';

	interface Props {
		conversationId: string | null;
		disabled?: boolean;
		compact?: boolean;
	}

	let { conversationId, disabled = false, compact = true }: Props = $props();
	const blocked = $derived(disabled || !conversationId || callStore.busy);

	function start(kind: 'audio' | 'video'): void {
		if (!conversationId || blocked) return;
		void callStore.startCall(conversationId, kind);
	}
</script>

<div class:compact class="call-buttons" aria-label={$t('calls.actions', { default: 'Opções de chamada' })}>
	<button
		type="button"
		class="call-action"
		disabled={blocked}
		onclick={() => start('audio')}
		aria-label={$t('calls.start.audio', { default: 'Iniciar chamada de voz' })}
		title={$t('calls.start.audio', { default: 'Iniciar chamada de voz' })}
	>
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92z" />
		</svg>
	</button>
	<button
		type="button"
		class="call-action"
		disabled={blocked}
		onclick={() => start('video')}
		aria-label={$t('calls.start.video', { default: 'Iniciar videochamada' })}
		title={$t('calls.start.video', { default: 'Iniciar videochamada' })}
	>
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M23 7l-7 5 7 5V7z" />
			<rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
		</svg>
	</button>
</div>

<style>
	.call-buttons { display: inline-flex; align-items: center; gap: .35rem; }
	.call-action {
		width: 42px;
		height: 42px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
		border-radius: 999px;
		background: color-mix(in srgb, var(--accent) 9%, var(--card));
		color: var(--accent);
		cursor: pointer;
		transition: transform 130ms ease, background 130ms ease, opacity 130ms ease;
	}
	.call-action:hover:not(:disabled), .call-action:focus-visible:not(:disabled) {
		background: color-mix(in srgb, var(--accent) 18%, var(--card));
		transform: translateY(-1px);
		outline: none;
	}
	.call-action:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 36%, transparent); }
	.call-action:active:not(:disabled) { transform: scale(.92); }
	.call-action:disabled { opacity: .42; cursor: not-allowed; }
	.call-action svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
	.compact .call-action { width: 38px; height: 38px; }
	@media (prefers-reduced-motion: reduce) { .call-action { transition: none; } }
</style>
