<script lang="ts">
  /**
   * /convite/?de=<handle> — landing page for a couple invite link.
   *
   * Someone shared their link ("vem ser meu casal 💞"). Two states:
   *   • visitor already has an account  → send the couple request right away
   *     and point them at /contactos to watch it land;
   *   • visitor is new                  → stash the inviter's handle and walk
   *     them to account creation; after the @handle claim, /conta auto-sends
   *     the couple request (sendPendingCoupleInvite).
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { accountsEnabled, searchAccounts, normalizeHandle, type Account } from '$lib/account/auth';
  import { accountState, startAccountSync } from '$lib/account/account-store.svelte';
  import { stashInviteFrom } from '$lib/account/couple-link';

  type Phase = 'loading' | 'invalid' | 'new-user' | 'sending' | 'sent' | 'self' | 'error';
  let phase = $state<Phase>('loading');
  let inviter = $state<Account | null>(null);
  let inviterHandle = $state('');

  onMount(() => {
    void (async () => {
      const raw = page.url.searchParams.get('de') ?? '';
      const handle = normalizeHandle(raw);
      if (!handle || !accountsEnabled()) {
        phase = 'invalid';
        return;
      }
      inviterHandle = handle;
      await startAccountSync();

      // Resolve the inviter (best-effort — the page still works offline-ish).
      try {
        const matches = await searchAccounts(handle);
        inviter = matches.find((a) => a.handle.toLowerCase() === handle.toLowerCase()) ?? null;
      } catch {
        inviter = null;
      }

      if (!accountState.account) {
        // New visitor: remember who invited them, then let them sign up.
        stashInviteFrom(handle);
        phase = 'new-user';
        return;
      }
      if (accountState.account.handle.toLowerCase() === handle.toLowerCase()) {
        phase = 'self';
        return;
      }
      if (!inviter) {
        phase = 'error';
        return;
      }
      // Signed-in visitor → their public profile has the explicit 💞 action;
      // no silent auto-send (the old opaque flow confused everyone).
      void goto(`/u/?h=${inviter.handle}`);
    })();
  });

  const inviterLabel = $derived(inviter?.display_name || `@${inviterHandle}`);
</script>

<svelte:head>
  <title>{$t('couplelink.landing.meta', { default: 'Convite de casal · Presuntinho' })}</title>
</svelte:head>

<div class="convite">
  <div class="card">
    <span class="art" aria-hidden="true">
      <img src="/art/hero-wave.webp" alt="" width="150" height="167" loading="eager" />
    </span>

    {#if phase === 'loading' || phase === 'sending'}
      <p class="sub">{$t('couplelink.landing.loading', { default: 'Um segundinho… 💞' })}</p>
    {:else if phase === 'invalid'}
      <h1>{$t('couplelink.landing.invalid_title', { default: 'Convite não encontrado' })}</h1>
      <p class="sub">{$t('couplelink.landing.invalid_body', { default: 'Este link de convite não é válido. Pede à tua pessoa para o enviar outra vez.' })}</p>
      <a class="cta" href="/">{$t('couplelink.landing.home', { default: 'Ir para a app' })}</a>
    {:else if phase === 'new-user'}
      <h1>{$t('couplelink.landing.title', { values: { name: inviterLabel }, default: '{name} quer ser teu casal! 💞' })}</h1>
      <p class="sub">{$t('couplelink.landing.body', { default: 'Cria a tua conta no Presuntinho e o pedido de casal liga-vos automaticamente — coração surpresa, pontos partilhados e pings de amor.' })}</p>
      <a class="cta" href="/conta/">{$t('couplelink.landing.cta', { default: 'Criar a minha conta 🐷' })}</a>
    {:else if phase === 'sent'}
      <h1>{$t('couplelink.landing.sent_title', { default: 'Pedido de casal enviado! 💌' })}</h1>
      <p class="sub">{$t('couplelink.landing.sent_body', { values: { name: inviterLabel }, default: 'Quando {name} aceitar, as vossas apps ficam ligadas em modo casal.' })}</p>
      <a class="cta" href="/contactos/">{$t('couplelink.landing.contacts', { default: 'Ver os meus contactos' })}</a>
    {:else if phase === 'self'}
      <h1>{$t('couplelink.landing.self_title', { default: 'Este convite é o teu! 😄' })}</h1>
      <p class="sub">{$t('couplelink.landing.self_body', { default: 'Partilha-o com a tua pessoa — quando abrir o link, ficam ligados.' })}</p>
      <a class="cta" href="/conta/">{$t('couplelink.landing.back_conta', { default: 'Voltar à conta' })}</a>
    {:else}
      <h1>{$t('couplelink.landing.error_title', { default: 'Não consegui enviar o pedido' })}</h1>
      <p class="sub">{$t('couplelink.landing.error_body', { values: { handle: inviterHandle }, default: 'Tenta outra vez em /contactos — procura @{handle} e toca em 💞.' })}</p>
      <a class="cta" href="/contactos/">{$t('couplelink.landing.contacts', { default: 'Ver os meus contactos' })}</a>
    {/if}
  </div>
</div>

<style>
  .convite {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .card {
    width: min(400px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.7rem;
    text-align: center;
    padding: 2rem 1.4rem;
    background: var(--card);
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
    border-radius: var(--radius-xl, 1.25rem);
    box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.4));
  }
  .art { line-height: 1; }
  .art img {
    width: clamp(120px, 36vw, 160px);
    height: auto;
    filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.18));
  }
  h1 {
    margin: 0;
    font-size: var(--fs-xl, 1.4rem);
    color: var(--txt);
  }
  .sub {
    margin: 0;
    color: var(--txt2);
    font-size: var(--fs-sm, 0.92rem);
    line-height: 1.5;
  }
  .cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 46px;
    padding: 0 1.5rem;
    margin-top: 0.5rem;
    font-weight: 800;
    text-decoration: none;
    color: var(--on-accent, #fff);
    background: var(--accent);
    border-radius: 999px;
  }
</style>
