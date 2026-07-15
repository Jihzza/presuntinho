<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { listContacts } from '$lib/account/contacts';
	import { CallAudioManager } from './call-audio';
	import {
		callTimeToMinutes,
		defaultCallPreferences,
		loadCallPreferences,
		isCallPreferencesStorageKey,
		readCallPreferencesSync,
		minutesToCallTime,
		saveCallPreferences,
		updateKnownCallContacts,
		type CallPermission,
		type CallPreferences,
		type CallRingtone
	} from './call-preferences';

	interface Props { accountId: string; }
	let { accountId }: Props = $props();

	function initialPreferences(): CallPreferences { return defaultCallPreferences(accountId); }
	let preferences = $state<CallPreferences>(initialPreferences());
	let ready = $state(false);
	let saveState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let contactsState = $state<'idle' | 'syncing' | 'synced' | 'offline'>('idle');
	let saveRevision = 0;
	let saveChain: Promise<void> = Promise.resolve();
	let previewAudio: CallAudioManager | null = null;
	let previewTimer: ReturnType<typeof setTimeout> | null = null;
	let destroyed = false;

	onMount(() => {
		let active = true;
		void loadCallPreferences(accountId).then((value) => {
			if (!active) return;
			preferences = value;
			ready = true;
			void refreshContacts();
		}).catch(() => {
			if (!active) return;
			ready = true;
			saveState = 'error';
		});
		return () => { active = false; };
	});

	onMount(() => {
		const onStorage = (event: StorageEvent) => {
			if (isCallPreferencesStorageKey(event.key, accountId)) preferences = readCallPreferencesSync(accountId);
		};
		window.addEventListener('storage', onStorage);
		return () => window.removeEventListener('storage', onStorage);
	});

	onDestroy(() => {
		destroyed = true;
		stopPreview();
	});

	function enqueueSave(patch: Partial<CallPreferences>): void {
		preferences = { ...preferences, ...patch };
		const revision = ++saveRevision;
		saveState = 'saving';
		saveChain = saveChain.catch(() => undefined).then(async () => {
			try {
				preferences = await saveCallPreferences(accountId, patch);
				if (revision === saveRevision) {
					saveState = 'saved';
					setTimeout(() => {
						if (revision === saveRevision && saveState === 'saved') saveState = 'idle';
					}, 1400);
				}
			} catch {
				if (revision === saveRevision) saveState = 'error';
			}
		});
	}

	async function refreshContacts(): Promise<void> {
		if (contactsState === 'syncing') return;
		contactsState = 'syncing';
		try {
			const contacts = await listContacts();
			if (destroyed) return;
			const refreshed = await updateKnownCallContacts(accountId, contacts.map((contact) => contact.id));
			if (destroyed) return;
			preferences = refreshed;
			contactsState = 'synced';
		} catch {
			contactsState = 'offline';
		}
	}

	function updateDndTime(field: 'dndStartMinutes' | 'dndEndMinutes', value: string): void {
		const minutes = callTimeToMinutes(value);
		if (minutes !== null) enqueueSave({ [field]: minutes });
	}

	function stopPreview(): void {
		if (previewTimer) clearTimeout(previewTimer);
		previewTimer = null;
		previewAudio?.stop();
		previewAudio = null;
	}

	function previewRingtone(): void {
		stopPreview();
		previewAudio = new CallAudioManager();
		previewAudio.configure({
			ringtone: preferences.ringtone,
			ringtoneVolume: preferences.ringtoneVolume,
			ringbackVolume: preferences.ringbackVolume,
			vibration: false
		});
		previewAudio.primeFromGesture();
		previewAudio.startIncoming();
		previewTimer = setTimeout(stopPreview, 1900);
	}

	function percent(value: number): string {
		return `${Math.round(value * 100)}%`;
	}
</script>

<section class="call-preferences" aria-busy={!ready}>
	<div class="preference-heading">
		<div>
			<strong>{$t('settings.calls.preferences.title')}</strong>
			<p>{$t('settings.calls.preferences.account_local')}</p>
		</div>
		<span class:failed={saveState === 'error'} role="status" aria-live="polite">
			{#if !ready}{$t('settings.calls.preferences.loading')}
			{:else if saveState === 'saving'}{$t('settings.calls.preferences.saving')}
			{:else if saveState === 'saved'}{$t('settings.calls.preferences.saved')}
			{:else if saveState === 'error'}{$t('settings.calls.preferences.save_error')}{/if}
		</span>
	</div>

	<fieldset disabled={!ready}>
		<legend>{$t('settings.calls.ringtone.section')}</legend>
		<div class="field-grid ringtone-row">
			<label>
				<span>{$t('settings.calls.ringtone.label')}</span>
				<select
					value={preferences.ringtone}
					onchange={(event) => enqueueSave({ ringtone: event.currentTarget.value as CallRingtone })}
				>
					<option value="classic">{$t('settings.calls.ringtone.classic')}</option>
					<option value="soft">{$t('settings.calls.ringtone.soft')}</option>
					<option value="pulse">{$t('settings.calls.ringtone.pulse')}</option>
				</select>
			</label>
			<button type="button" class="preview" onclick={previewRingtone}>
				<span aria-hidden="true">▶</span> {$t('settings.calls.ringtone.preview')}
			</button>
		</div>
		<p class="fine-print">{$t('settings.calls.ringtone.platform_hint')}</p>
		<label class="range-field">
			<span>{$t('settings.calls.ringtone.volume')} <output>{percent(preferences.ringtoneVolume)}</output></span>
			<input
				type="range" min="0" max="1" step="0.05" value={preferences.ringtoneVolume}
				oninput={(event) => enqueueSave({ ringtoneVolume: Number(event.currentTarget.value) })}
			/>
		</label>
		<label class="range-field">
			<span>{$t('settings.calls.ringback.volume')} <output>{percent(preferences.ringbackVolume)}</output></span>
			<input
				type="range" min="0" max="1" step="0.05" value={preferences.ringbackVolume}
				oninput={(event) => enqueueSave({ ringbackVolume: Number(event.currentTarget.value) })}
			/>
		</label>
		<button
			type="button" class="switch-row" role="switch" aria-checked={preferences.vibration}
			onclick={() => enqueueSave({ vibration: !preferences.vibration })}
		>
			<span><strong>{$t('settings.calls.vibration')}</strong><small>{$t('settings.calls.vibration.hint')}</small></span>
			<i class:on={preferences.vibration} aria-hidden="true"><b></b></i>
		</button>
	</fieldset>

	<fieldset disabled={!ready}>
		<legend>{$t('settings.calls.notifications.section')}</legend>
		<button
			type="button" class="switch-row" role="switch" aria-checked={preferences.notificationPreviews}
			onclick={() => enqueueSave({ notificationPreviews: !preferences.notificationPreviews })}
		>
			<span><strong>{$t('settings.calls.previews')}</strong><small>{$t('settings.calls.previews.hint')}</small></span>
			<i class:on={preferences.notificationPreviews} aria-hidden="true"><b></b></i>
		</button>

		<button
			type="button" class="switch-row" role="switch" aria-checked={preferences.dndEnabled}
			onclick={() => enqueueSave({ dndEnabled: !preferences.dndEnabled })}
		>
			<span><strong>{$t('settings.calls.dnd')}</strong><small>{$t('settings.calls.dnd.hint')}</small></span>
			<i class:on={preferences.dndEnabled} aria-hidden="true"><b></b></i>
		</button>
		{#if preferences.dndEnabled}
			<div class="time-grid">
				<label>
					<span>{$t('settings.calls.dnd.from')}</span>
					<input type="time" value={minutesToCallTime(preferences.dndStartMinutes)} onchange={(event) => updateDndTime('dndStartMinutes', event.currentTarget.value)} />
				</label>
				<label>
					<span>{$t('settings.calls.dnd.until')}</span>
					<input type="time" value={minutesToCallTime(preferences.dndEndMinutes)} onchange={(event) => updateDndTime('dndEndMinutes', event.currentTarget.value)} />
				</label>
			</div>
			<p class="fine-print">{$t('settings.calls.dnd.timezone')}</p>
		{/if}
	</fieldset>

	<fieldset disabled={!ready}>
		<legend>{$t('settings.calls.privacy.section')}</legend>
		<label class="select-field">
			<span>{$t('settings.calls.who')}</span>
			<select
				value={preferences.whoMayCall}
				onchange={(event) => enqueueSave({ whoMayCall: event.currentTarget.value as CallPermission })}
			>
				<option value="contacts">{$t('settings.calls.who.contacts')}</option>
				<option value="direct-chats">{$t('settings.calls.who.direct')}</option>
				<option value="nobody">{$t('settings.calls.who.nobody')}</option>
			</select>
		</label>
		<div class="contact-sync" role="status">
			<span>{#if contactsState === 'syncing'}{$t('settings.calls.contacts.syncing')}
			{:else if contactsState === 'synced'}{$t('settings.calls.contacts.synced', { values: { count: preferences.knownContactIds.length } })}
			{:else if contactsState === 'offline'}{$t('settings.calls.contacts.offline')}{/if}</span>
			{#if contactsState === 'offline'}<button type="button" onclick={() => void refreshContacts()}>{$t('settings.calls.contacts.retry')}</button>{/if}
		</div>

		<button
			type="button" class="switch-row" role="switch" aria-checked={preferences.relayOnly}
			onclick={() => enqueueSave({ relayOnly: !preferences.relayOnly })}
		>
			<span><strong>{$t('settings.calls.relay_only')}</strong><small>{$t('settings.calls.relay_only.hint')}</small></span>
			<i class:on={preferences.relayOnly} aria-hidden="true"><b></b></i>
		</button>
		{#if preferences.relayOnly}
			<p class="relay-warning" role="note">⚠ {$t('settings.calls.relay_only.warning')}</p>
		{/if}
	</fieldset>
</section>

<style>
	.call-preferences { display: grid; gap: .9rem; margin-top: 1rem; }
	.preference-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: .85rem; border-radius: 1rem; background: color-mix(in srgb, var(--accent) 8%, var(--card)); }
	.preference-heading > div { min-width: 0; }
	.preference-heading strong { color: var(--txt); font-size: .92rem; }
	.preference-heading p { margin: .2rem 0 0; color: var(--txt3); font-size: .75rem; line-height: 1.35; }
	.preference-heading > span { min-width: 4.5rem; color: var(--accent); font-size: .7rem; font-weight: 750; text-align: end; }
	.preference-heading > span.failed { color: #dc2626; }
	fieldset { display: grid; gap: .68rem; min-width: 0; margin: 0; padding: .85rem; border: 1px solid var(--border); border-radius: 1rem; }
	fieldset:disabled { opacity: .62; }
	legend { padding: 0 .35rem; color: var(--txt2); font-size: .76rem; font-weight: 800; letter-spacing: .025em; }
	label > span, .range-field > span { display: block; margin-bottom: .35rem; color: var(--txt2); font-size: .78rem; font-weight: 700; }
	select, input[type='time'] { width: 100%; min-height: 44px; padding: .55rem .7rem; border: 1px solid var(--border); border-radius: .75rem; background: var(--bg); color: var(--txt); font: inherit; }
	select:focus-visible, input:focus-visible, button:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 34%, transparent); outline-offset: 2px; }
	.field-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: .65rem; }
	.preview { min-height: 44px; padding: .55rem .75rem; border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border)); border-radius: .75rem; background: color-mix(in srgb, var(--accent) 8%, var(--card)); color: var(--accent); font: inherit; font-size: .76rem; font-weight: 800; cursor: pointer; }
	.range-field { display: grid; gap: .12rem; }
	.range-field > span { display: flex; justify-content: space-between; margin: 0; }
	.range-field output { color: var(--accent); font-variant-numeric: tabular-nums; }
	input[type='range'] { width: 100%; min-height: 34px; accent-color: var(--accent); }
	.switch-row { width: 100%; min-height: 54px; display: flex; align-items: center; justify-content: space-between; gap: .8rem; padding: .62rem 0; border: 0; border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent); background: transparent; color: var(--txt); text-align: start; font: inherit; cursor: pointer; }
	.switch-row > span { min-width: 0; display: grid; gap: .14rem; }
	.switch-row strong { font-size: .84rem; }
	.switch-row small { color: var(--txt3); font-size: .7rem; line-height: 1.35; }
	.switch-row > i { position: relative; width: 44px; height: 26px; flex: 0 0 44px; border-radius: 99px; background: color-mix(in srgb, var(--txt3) 28%, var(--border)); transition: background .16s ease; }
	.switch-row > i.on { background: var(--accent); }
	.switch-row > i b { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.2); transition: transform .16s ease; }
	.switch-row > i.on b { transform: translateX(18px); }
	.time-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .65rem; padding-top: .15rem; }
	.fine-print, .relay-warning { margin: 0; color: var(--txt3); font-size: .7rem; line-height: 1.4; }
	.relay-warning { padding: .65rem .7rem; border: 1px solid color-mix(in srgb, #f59e0b 36%, var(--border)); border-radius: .75rem; background: color-mix(in srgb, #f59e0b 8%, var(--card)); color: var(--txt2); }
	.contact-sync { min-height: 1.25rem; display: flex; justify-content: space-between; gap: .6rem; color: var(--txt3); font-size: .7rem; }
	.contact-sync button { padding: 0; border: 0; background: transparent; color: var(--accent); font: inherit; font-weight: 800; cursor: pointer; }
	@media (max-width: 420px) {
		.field-grid { grid-template-columns: 1fr; }
		.preview { width: 100%; }
	}
	@media (prefers-reduced-motion: reduce) {
		.switch-row > i, .switch-row > i b { transition: none; }
	}
</style>
