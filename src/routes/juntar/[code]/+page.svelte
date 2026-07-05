<script lang="ts">
  /**
   * /juntar/[code] — the OTHER phone redeems an invite code (multi-user 1A).
   *
   * Redeems the code against the pairing rendezvous, stashes the returned shared
   * token, then sends the visitor to /onboarding to create their own member —
   * which binds the pending token, completing the pairing. No data is created
   * here; a failed/expired/used code just shows a friendly message.
   */
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { t } from 'svelte-i18n';
  import { redeemInvite, setPendingSpaceToken, PairingError } from '$lib/space/pairing';

  type Status = 'redeeming' | 'ok' | 'error';
  let status = $state<Status>('redeeming');
  let errorKey = $state('juntar.error.generic');

  const code = $derived(page.params.code ?? '');

  function mapError(e: unknown): string {
    if (e instanceof PairingError) {
      switch (e.code) {
        case 'invalid_code':
        case 'not_found':
          return 'juntar.error.invalid';
        case 'expired':
          return 'juntar.error.expired';
        case 'already_redeemed':
          return 'juntar.error.redeemed';
        default:
          return 'juntar.error.generic';
      }
    }
    // fetch/TypeError = offline or the function isn't reachable (local preview).
    return 'juntar.error.network';
  }

  onMount(() => {
    void (async () => {
      try {
        const { token } = await redeemInvite(code);
        setPendingSpaceToken(token);
        status = 'ok';
      } catch (e) {
        console.error('[juntar] redeem failed', e);
        errorKey = mapError(e);
        status = 'error';
      }
    })();
  });
</script>

<svelte:head>
  <title>{$t('juntar.title', { default: 'Juntar-se a um espaço — Presuntinho' })}</title>
</svelte:head>

<div class="join">
  {#if status === 'redeeming'}
    <p class="emoji" aria-hidden="true">🔗</p>
    <h1>{$t('juntar.redeeming', { default: 'A validar o convite…' })}</h1>
  {:else if status === 'ok'}
    <p class="emoji" aria-hidden="true">🎉</p>
    <h1>{$t('juntar.ok_title', { default: 'Convite aceite!' })}</h1>
    <p class="lead">{$t('juntar.ok_body', { default: 'Cria a tua conta para entrarem no mesmo espaço.' })}</p>
    <a class="cta" href="/onboarding/">{$t('juntar.ok_cta', { default: 'Criar a minha conta →' })}</a>
  {:else}
    <p class="emoji" aria-hidden="true">😕</p>
    <h1>{$t('juntar.error_title', { default: 'Não deu para juntar' })}</h1>
    <p class="lead">{$t(errorKey, { default: 'Este convite não é válido. Pede um novo à outra pessoa.' })}</p>
    <a class="ghost" href="/splash/">{$t('juntar.back', { default: '← Voltar' })}</a>
  {/if}
</div>

<style>
  .join { max-width: 460px; margin: 0 auto; min-height: 100dvh; display: grid; place-content: center; justify-items: center; text-align: center; gap: 0.5rem; padding: 2rem 1.2rem calc(2rem + env(safe-area-inset-bottom)); color: var(--txt, #fff); }
  .emoji { font-size: 3.2rem; margin: 0; }
  h1 { margin: 0; font-size: clamp(1.5rem, 6vw, 2.1rem); }
  .lead { color: var(--txt2, #cbd5e1); line-height: 1.5; margin: 0.2rem 0 0.8rem; }
  .cta { min-height: 48px; padding: 0.75rem 1.5rem; border-radius: 0.9rem; border: 0; background: linear-gradient(135deg, var(--accent, #ec4899), #a78bfa); color: #fff; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; }
  .ghost { color: #bfdbfe; text-decoration: none; font-weight: 800; padding: 0.5rem; }
</style>
