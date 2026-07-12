<script lang="ts">
  /**
   * /casal/pedido/?conn=<id> | ?space=<id> — answer a couple request.
   * This is the page the notification opens: who's asking, what it unlocks,
   * and two honest buttons. Accepting routes into the couple onboarding
   * (/casal/bemvindos) where the congrats animation + basic settings live.
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { showToast } from '$lib/components/events';
  import type { Account } from '$lib/account/auth';
  import { accountState, startAccountSync } from '$lib/account/account-store.svelte';
  import { listIncoming, acceptConnect, removeConnection, type Contact } from '$lib/account/contacts';
  import { listSpaces, otherMember, leaveSpace, type Space } from '$lib/account/spaces';
  import { acceptCoupleInvite, markCoupleCelebrated, pokeCoupleLink } from '$lib/account/couple-link';
  import { invalidateCoupleId } from '$lib/couple/couple-supabase';
  import { refreshCoupleEnabled } from '$lib/couple/couple-store.svelte';

  type Phase = 'loading' | 'ready' | 'gone' | 'busy';
  let phase = $state<Phase>('loading');
  let from = $state<Account | null>(null);
  let conn = $state<Contact | null>(null);
  let space = $state<Space | null>(null);

  onMount(() => {
    void (async () => {
      await startAccountSync();
      if (!accountState.account) {
        void goto('/conta/');
        return;
      }
      const connId = page.url.searchParams.get('conn');
      const spaceId = page.url.searchParams.get('space');
      try {
        if (connId) {
          const incoming = await listIncoming();
          conn = incoming.find((c) => c.connectionId === connId && c.wantsCouple) ?? null;
          from = conn;
        } else if (spaceId) {
          const spaces = await listSpaces();
          const s = spaces.find(
            (x) => x.id === spaceId && x.kind === 'couple' && x.members.some((m) => m.id === accountState.account!.id && m.status === 'pending')
          );
          space = s ?? null;
          from = s ? otherMember(s, accountState.account.id) : null;
        }
      } catch (e) {
        console.warn('[casal/pedido] load failed', e);
      }
      phase = from ? 'ready' : 'gone';
    })();
  });

  async function accept(): Promise<void> {
    if (phase === 'busy') return;
    phase = 'busy';
    try {
      let activatedSpace: string | null = null;
      if (conn) {
        const r = await acceptConnect(conn.connectionId);
        if (r.coupleBlocked) {
          showToast($t('casal.pedido.blocked', { default: 'Ficaram amigos, mas um de vocês já tem um casal ativo — só há um de cada vez. 💔' }), 4200);
          void goto('/contactos/');
          return;
        }
        if (r.coupleActive) activatedSpace = r.coupleSpace;
      } else if (space) {
        const active = await acceptCoupleInvite(space.id);
        if (active) activatedSpace = space.id;
      }
      if (activatedSpace) {
        // The wizard IS the celebration — silence the layout overlay for it.
        await markCoupleCelebrated(activatedSpace);
        invalidateCoupleId();
        refreshCoupleEnabled();
        pokeCoupleLink(); // partner's side celebrates via realtime
        void goto(`/casal/bemvindos/?space=${activatedSpace}`);
      } else {
        void goto('/contactos/');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3200, 'error');
      phase = 'ready';
    }
  }

  async function decline(): Promise<void> {
    if (phase === 'busy') return;
    phase = 'busy';
    try {
      if (conn) await removeConnection(conn.connectionId);
      else if (space) await leaveSpace(space.id);
      showToast($t('casal.pedido.declined', { default: 'Pedido recusado.' }), 2200);
      void goto('/contactos/');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3200, 'error');
      phase = 'ready';
    }
  }

  const fromLabel = $derived(from?.display_name || (from ? `@${from.handle}` : ''));
</script>

<svelte:head>
  <title>{$t('casal.pedido.meta', { default: 'Pedido de casal · Presuntinho' })}</title>
</svelte:head>

<div class="pedido">
  <div class="card">
    {#if phase === 'loading'}
      <p class="sub">{$t('uprofile.loading', { default: 'A carregar…' })}</p>
    {:else if phase === 'gone'}
      <span class="art" aria-hidden="true">💌</span>
      <h1>{$t('casal.pedido.gone_title', { default: 'Este pedido já não está aqui' })}</h1>
      <p class="sub">{$t('casal.pedido.gone_body', { default: 'Pode já ter sido respondido. Vê os teus contactos para confirmar.' })}</p>
      <a class="btn primary" href="/contactos/">{$t('couplelink.landing.contacts', { default: 'Ver os meus contactos' })}</a>
    {:else if from}
      <span class="art" aria-hidden="true">
        <img src="/art/couple-hug.webp" alt="" width="170" height="170" loading="eager" />
      </span>
      <span class="avatar" aria-hidden="true">{from.emoji ?? '🙂'}</span>
      <h1>{$t('casal.pedido.title', { values: { name: fromLabel }, default: '{name} quer ser teu casal! 💞' })}</h1>
      <p class="sub">{$t('casal.pedido.body', { default: 'Aceitar liga as vossas contas em modo casal: coração surpresa, pontos partilhados, pings de amor e o vosso chat.' })}</p>
      <a class="peek" href={`/u/?h=${from.handle}`}>@{from.handle} →</a>
      <div class="actions">
        <button type="button" class="btn primary" disabled={phase === 'busy'} onclick={accept}>
          {phase === 'busy' ? $t('casal.pedido.accepting', { default: 'A ligar…' }) : $t('casal.pedido.accept', { default: 'Aceitar 💞' })}
        </button>
        <button type="button" class="btn subtle" disabled={phase === 'busy'} onclick={decline}>
          {$t('casal.pedido.decline', { default: 'Agora não' })}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .pedido {
    min-height: calc(100dvh - 8rem);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .card {
    width: min(420px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    text-align: center;
    padding: 2rem 1.4rem;
    background: var(--card);
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
    border-radius: var(--radius-xl, 1.6rem);
    box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.35));
  }
  .art { line-height: 1; font-size: 3rem; }
  .art img { width: clamp(130px, 40vw, 170px); height: auto; filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.18)); }
  .avatar {
    margin-top: -1.4rem;
    width: 58px; height: 58px; display: grid; place-items: center; font-size: 1.8rem;
    border-radius: 999px; background: var(--bg-elev);
    border: 3px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  h1 { margin: 0.2rem 0 0; font-size: var(--fs-xl, 1.35rem); color: var(--txt); }
  .sub { margin: 0; color: var(--txt2); font-size: var(--fs-sm, 0.92rem); line-height: 1.55; }
  .peek { color: var(--accent); font-weight: 800; font-size: 0.85rem; text-decoration: none; }
  .actions { display: flex; flex-direction: column; gap: 0.55rem; width: 100%; margin-top: 0.6rem; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center;
    min-height: 48px; padding: 0 1.4rem; border-radius: 999px;
    font: inherit; font-weight: 800; text-decoration: none; cursor: pointer;
    border: 1px solid var(--border); background: var(--bg-elev); color: var(--txt);
  }
  .btn:disabled { opacity: 0.65; cursor: wait; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent, #fff); font-size: 1.02rem; }
  .btn.primary:hover { filter: brightness(1.06); }
  .btn.subtle { background: transparent; color: var(--txt3); border-color: transparent; }
  .btn.subtle:hover { color: var(--txt); }
</style>
