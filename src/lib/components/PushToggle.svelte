<script lang="ts">
  /**
   * PushToggle — ativa/desativa as notificações push DESTE dispositivo para os
   * pings de casal. Mostra o caminho certo em cada plataforma (iPhone precisa
   * da app instalada no ecrã principal; vibração própria é Android).
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { showToast } from '$lib/components/events';
  import { enablePush, disablePush, getPushState, type PushState } from '$lib/push';

  let pushState = $state<PushState>('off');
  let busy = $state(false);

  onMount(() => {
    void getPushState().then((s) => (pushState = s));
  });

  async function toggle(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      if (pushState === 'on') {
        await disablePush();
        pushState = 'off';
        showToast($t('push.disabled', { default: 'Notificações desativadas neste dispositivo.' }), 2400);
      } else {
        pushState = await enablePush();
        if (pushState === 'on')
          showToast($t('push.enabled', { default: '🔔 Notificações ativas! Os pings chegam mesmo com a app fechada.' }), 3000);
        else if (pushState === 'denied')
          showToast($t('push.denied', { default: 'O browser bloqueou as notificações — ativa-as nas definições do site.' }), 3800, 'error');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3200, 'error');
    } finally {
      busy = false;
    }
  }
</script>

<div class="push-toggle">
  {#if pushState === 'ios-needs-install'}
    <p class="hint">
      📲 {$t('push.ios_hint', { default: 'No iPhone: abre no Safari → Partilhar → "Adicionar ao ecrã principal", e ativa as notificações dentro da app instalada.' })}
    </p>
  {:else if pushState === 'unsupported'}
    <p class="hint">{$t('push.unsupported', { default: 'Este browser não suporta notificações push.' })}</p>
  {:else}
    <button type="button" class="btn" class:on={pushState === 'on'} disabled={busy} onclick={toggle}>
      {#if pushState === 'on'}
        ✓ {$t('push.on', { default: 'Notificações ativas' })}
      {:else}
        🔔 {$t('push.enable', { default: 'Ativar notificações no telemóvel' })}
      {/if}
    </button>
    {#if pushState === 'denied'}
      <p class="hint">{$t('push.denied_hint', { default: 'Bloqueadas pelo browser — permite notificações nas definições deste site e tenta de novo.' })}</p>
    {/if}
  {/if}
</div>

<style>
  .push-toggle { display: flex; flex-direction: column; gap: 0.45rem; width: 100%; align-items: center; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
    min-height: 46px; padding: 0 1.3rem; width: 100%; max-width: 340px;
    border-radius: 999px; font: inherit; font-weight: 800; cursor: pointer;
    border: 1.5px solid color-mix(in srgb, var(--accent) 65%, transparent);
    background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent);
  }
  .btn:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }
  .btn.on { background: color-mix(in srgb, var(--success, #22c55e) 14%, transparent); border-color: color-mix(in srgb, var(--success, #22c55e) 55%, transparent); color: var(--success, #16a34a); }
  .btn:disabled { opacity: 0.65; cursor: wait; }
  .hint { margin: 0; color: var(--txt3); font-size: 0.82rem; line-height: 1.45; text-align: center; max-width: 40ch; }
</style>
