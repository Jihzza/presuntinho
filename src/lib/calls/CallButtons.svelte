<script lang="ts">
	import { t } from 'svelte-i18n';
	import CallStartAction from './CallStartAction.svelte';
	import type { CallStartBlockReason } from './call-start-state';

	interface Props {
		conversationId: string | null;
		disabled?: boolean;
		disabledReason?: CallStartBlockReason | null;
		compact?: boolean;
	}

	let { conversationId, disabled = false, disabledReason = null, compact = true }: Props = $props();
	const explicitReason = $derived(disabledReason ?? (disabled ? 'call_unavailable' : null));
</script>

<div class:compact class="call-buttons" aria-label={$t('calls.actions', { default: 'Opções de chamada' })}>
	<CallStartAction {conversationId} kind="audio" disabledReason={explicitReason} descriptionId="header-audio" />
	<CallStartAction {conversationId} kind="video" disabledReason={explicitReason} descriptionId="header-video" />
</div>

<style>
	.call-buttons { display: inline-flex; align-items: center; gap: .4rem; }
</style>
