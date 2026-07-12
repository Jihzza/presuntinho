<script lang="ts">
  /**
   * /u/?h=<handle> — public profile. The heart of the social flow:
   * search someone → open their profile → ONE clear action per state:
   * add friend → accepted → message + couple request → couple active.
   * Works logged-out too (accounts are public rows) with a sign-up CTA.
   */
  import { onMount, onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { showToast } from '$lib/components/events';
  import { accountsEnabled, getAccountByHandle, normalizeHandle, type Account } from '$lib/account/auth';
  import { accountState, startAccountSync } from '$lib/account/account-store.svelte';
  import {
    sendConnect,
    acceptConnect,
    removeConnection,
    statusWith,
    subscribeConnections
  } from '$lib/account/contacts';
  import { listSpaces, isCoupleActive, otherMember, subscribeSpaces, type Space } from '$lib/account/spaces';
  import { requestCouple, profileUrl, pokeCoupleLink } from '$lib/account/couple-link';

  type Phase = 'loading' | 'notfound' | 'ready';
  let phase = $state<Phase>('loading');
  let person = $state<Account | null>(null);
  let conn = $state<Awaited<ReturnType<typeof statusWith>>>(null);
  let coupleSpace = $state<Space | null>(null);
  let busy = $state(false);
  let unsubC: (() => void) | null = null;
  let unsubS: (() => void) | null = null;

  const meId = $derived(accountState.account?.id ?? '');
  const isSelf = $derived(Boolean(person && meId && person.id === meId));
  const coupleState = $derived.by<'none' | 'active' | 'pending-in' | 'pending-out'>(() => {
    if (!coupleSpace || !meId) return 'none';
    if (isCoupleActive(coupleSpace)) return 'active';
    const mine = coupleSpace.members.find((m) => m.id === meId);
    return mine?.status === 'pending' ? 'pending-in' : 'pending-out';
  });

  async function refreshRelation(): Promise<void> {
    if (!person || !accountState.account || person.id === accountState.account.id) return;
    try {
      const [c, spaces] = await Promise.all([statusWith(person.id), listSpaces()]);
      conn = c;
      coupleSpace =
        spaces.find((s) => s.kind === 'couple' && s.members.some((m) => m.id === person!.id) && s.members.some((m) => m.id === meId)) ??
        null;
    } catch (e) {
      console.warn('[u] relation refresh failed', e);
    }
  }

  onMount(() => {
    void (async () => {
      const handle = normalizeHandle(page.url.searchParams.get('h') ?? '');
      if (!handle || !accountsEnabled()) {
        phase = 'notfound';
        return;
      }
      await startAccountSync();
      try {
        person = await getAccountByHandle(handle);
      } catch {
        person = null;
      }
      if (!person) {
        phase = 'notfound';
        return;
      }
      await refreshRelation();
      phase = 'ready';
      unsubC = subscribeConnections(() => void refreshRelation());
      unsubS = subscribeSpaces(() => void refreshRelation());
    })();
  });
  onDestroy(() => {
    unsubC?.();
    unsubS?.();
  });

  async function onAddFriend(): Promise<void> {
    if (!person || busy) return;
    busy = true;
    try {
      const r = await sendConnect(person.id);
      if (r === 'sent') showToast($t('uprofile.friend_sent', { values: { handle: person.handle }, default: 'Pedido de amizade enviado a @{handle} ✅' }), 2400);
      else if (r === 'accepted') showToast($t('uprofile.now_friends', { values: { handle: person.handle }, default: 'Vocês agora são amigos! 🎉' }), 2600);
      await refreshRelation();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    } finally {
      busy = false;
    }
  }

  async function onCoupleRequest(): Promise<void> {
    if (!person || busy) return;
    busy = true;
    try {
      const r = await requestCouple(person);
      if (r === 'sent')
        showToast($t('uprofile.couple_sent', { values: { handle: person.handle }, default: '💌 Pedido de casal enviado! Quando @{handle} aceitar, ficam ligados.' }), 3000);
      else if (r === 'proposed')
        showToast($t('uprofile.couple_proposed', { values: { handle: person.handle }, default: '💌 Pedido de casal enviado a @{handle}!' }), 2600);
      else if (r === 'active') pokeCoupleLink(); // both consents present → celebrate
      else if (r === 'taken')
        showToast($t('couplelink.taken', { default: 'Um de vocês já tem um casal ativo — só há um de cada vez. 💔' }), 3200);
      else if (r === 'already')
        showToast($t('couplelink.already', { default: 'Já têm um pedido de casal entre vocês. 💞' }), 2400);
      await refreshRelation();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    } finally {
      busy = false;
    }
  }

  async function onAcceptFriend(): Promise<void> {
    if (!conn || busy) return;
    busy = true;
    try {
      const { coupleActive } = await acceptConnect(conn.connectionId);
      showToast($t('uprofile.now_friends', { values: { handle: person?.handle ?? '' }, default: 'Vocês agora são amigos! 🎉' }), 2600);
      if (coupleActive) pokeCoupleLink();
      await refreshRelation();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    } finally {
      busy = false;
    }
  }

  async function onRemoveConnection(): Promise<void> {
    if (!conn || busy) return;
    busy = true;
    try {
      await removeConnection(conn.connectionId);
      conn = null;
      await refreshRelation();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    } finally {
      busy = false;
    }
  }

  async function shareProfile(): Promise<void> {
    if (!person) return;
    const url = profileUrl(person.handle);
    try {
      if (navigator.share) {
        await navigator.share({ url, title: `@${person.handle} · Presuntinho` });
        return;
      }
    } catch {
      /* cancelled — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast($t('uprofile.link_copied', { default: 'Link do perfil copiado! 📋' }), 2200);
    } catch {
      showToast(url, 4000);
    }
  }

  const displayName = $derived(person?.display_name || (person ? `@${person.handle}` : ''));
</script>

<svelte:head>
  <title>{person ? `@${person.handle}` : $t('uprofile.meta.title', { default: 'Perfil' })} · Presuntinho</title>
</svelte:head>

<div class="uprofile">
  <header class="topbar">
    <a class="back" href="/contactos/" aria-label={$t('contactos.title', { default: 'Contactos' })}>←</a>
    <h1>{$t('uprofile.title', { default: 'Perfil' })}</h1>
  </header>

  {#if phase === 'loading'}
    <p class="hint center">{$t('uprofile.loading', { default: 'A carregar…' })}</p>
  {:else if phase === 'notfound'}
    <div class="card center">
      <span class="big" aria-hidden="true">🔍</span>
      <h2>{$t('uprofile.notfound_title', { default: 'Perfil não encontrado' })}</h2>
      <p class="sub">{$t('uprofile.notfound_body', { default: 'Este @handle não existe (ou o link veio incompleto).' })}</p>
      <a class="cta" href="/contactos/">{$t('uprofile.search_people', { default: '🔍 Procurar pessoas' })}</a>
    </div>
  {:else if person}
    <div class="card profile">
      <span class="avatar" aria-hidden="true">{person.emoji ?? '🙂'}</span>
      <h2 class="name">{displayName}</h2>
      <p class="handle">@{person.handle}</p>
      {#if person.bio}<p class="bio">{person.bio}</p>{/if}

      {#if isSelf}
        <p class="state-tag self-tag">{$t('uprofile.self', { default: 'Este perfil és tu 😄' })}</p>
        <div class="actions">
          <button type="button" class="btn primary" onclick={shareProfile}>📤 {$t('uprofile.share', { default: 'Partilhar perfil' })}</button>
          <a class="btn" href="/conta/">{$t('uprofile.edit', { default: 'Editar conta' })}</a>
        </div>
      {:else if !accountState.account}
        <p class="sub">{$t('uprofile.visitor_hint', { default: 'Cria a tua conta para adicionares esta pessoa.' })}</p>
        <div class="actions">
          <a class="btn primary" href="/conta/">{$t('uprofile.create_account', { default: 'Criar a minha conta 🐷' })}</a>
        </div>
      {:else}
        <!-- relationship state → ONE clear next action -->
        {#if coupleState === 'active'}
          <p class="state-tag couple">💞 {$t('uprofile.state_couple', { default: 'Vocês são um casal' })}</p>
          <div class="actions">
            <a class="btn primary" href={`/mensagens/?dm=${person.handle}`}>💬 {$t('uprofile.message', { default: 'Mensagem' })}</a>
          </div>
        {:else if coupleState === 'pending-in' && coupleSpace}
          <p class="state-tag couple">💌 {$t('uprofile.state_couple_in', { default: 'Pediu para serem um casal!' })}</p>
          <div class="actions">
            <a class="btn primary" href={`/casal/pedido/?space=${coupleSpace.id}`}>💞 {$t('uprofile.answer_couple', { default: 'Responder ao pedido' })}</a>
          </div>
        {:else if conn?.status === 'pending' && conn.direction === 'in' && conn.wantsCouple}
          <p class="state-tag couple">💌 {$t('uprofile.state_couple_in', { default: 'Pediu para serem um casal!' })}</p>
          <div class="actions">
            <a class="btn primary" href={`/casal/pedido/?conn=${conn.connectionId}`}>💞 {$t('uprofile.answer_couple', { default: 'Responder ao pedido' })}</a>
          </div>
        {:else}
          {#if conn?.status === 'accepted'}
            <p class="state-tag">✓ {$t('uprofile.state_friends', { default: 'Amigos' })}</p>
          {:else if conn?.status === 'pending' && conn.direction === 'out'}
            <p class="state-tag">{conn.wantsCouple ? `💌 ${$t('uprofile.state_couple_out', { default: 'Pedido de casal enviado' })}` : `⏳ ${$t('uprofile.state_pending_out', { default: 'Pedido enviado' })}`}</p>
          {:else if conn?.status === 'pending' && conn.direction === 'in'}
            <p class="state-tag">👋 {$t('uprofile.state_pending_in', { default: 'Quer ser teu amigo' })}</p>
          {/if}

          <div class="actions">
            {#if !conn}
              <button type="button" class="btn primary" disabled={busy} onclick={onAddFriend}>➕ {$t('uprofile.add_friend', { default: 'Adicionar amigo' })}</button>
              <button type="button" class="btn couple-btn" disabled={busy} onclick={onCoupleRequest}>💞 {$t('uprofile.ask_couple', { default: 'Pedir casal' })}</button>
            {:else if conn.status === 'pending' && conn.direction === 'in'}
              <button type="button" class="btn primary" disabled={busy} onclick={onAcceptFriend}>{$t('contactos.accept', { default: 'Aceitar' })}</button>
              <button type="button" class="btn subtle" disabled={busy} onclick={onRemoveConnection}>{$t('contactos.decline', { default: 'Recusar' })}</button>
            {:else if conn.status === 'pending' && conn.direction === 'out'}
              {#if !conn.wantsCouple}
                <button type="button" class="btn couple-btn" disabled={busy} onclick={onCoupleRequest}>💞 {$t('uprofile.ask_couple', { default: 'Pedir casal' })}</button>
              {/if}
              <button type="button" class="btn subtle" disabled={busy} onclick={onRemoveConnection}>{$t('contactos.cancel', { default: 'Cancelar' })}</button>
            {:else}
              <a class="btn primary" href={`/mensagens/?dm=${person.handle}`}>💬 {$t('uprofile.message', { default: 'Mensagem' })}</a>
              {#if coupleState === 'pending-out'}
                <span class="btn ghost">💌 {$t('uprofile.state_couple_out', { default: 'Pedido de casal enviado' })}</span>
              {:else}
                <button type="button" class="btn couple-btn" disabled={busy} onclick={onCoupleRequest}>💞 {$t('uprofile.ask_couple', { default: 'Pedir casal' })}</button>
              {/if}
            {/if}
          </div>
          {#if conn?.status === 'accepted'}
            <button type="button" class="unfriend" disabled={busy} onclick={onRemoveConnection}>{$t('uprofile.unfriend', { default: 'Remover amizade' })}</button>
          {/if}
        {/if}
      {/if}
    </div>

    <button type="button" class="share-row" onclick={shareProfile}>
      🔗 {$t('uprofile.share_link', { default: 'Partilhar o link deste perfil' })}
    </button>
  {/if}
</div>

<style>
  .uprofile { max-width: 480px; margin: 0 auto; padding: 1rem 1rem 8rem; color: var(--txt); }
  .topbar { display: flex; align-items: center; gap: .75rem; padding: .25rem 0 1rem; }
  .back { color: var(--txt); text-decoration: none; font-size: 1.4rem; width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; }
  .back:hover { background: var(--card-hover, var(--card)); }
  .topbar h1 { margin: 0; font-size: 1.4rem; font-weight: 800; }
  .hint { color: var(--txt3); font-size: .9rem; }
  .center { text-align: center; }
  .card {
    display: flex; flex-direction: column; align-items: center; gap: .35rem;
    padding: 2rem 1.4rem 1.6rem; text-align: center;
    background: var(--card); border: 1px solid var(--border);
    border-radius: var(--radius-xl, 1.25rem); box-shadow: var(--shadow-md);
  }
  .big { font-size: 2.6rem; }
  .avatar {
    width: 96px; height: 96px; display: grid; place-items: center; font-size: 3rem;
    border-radius: 999px; background: color-mix(in srgb, var(--accent) 14%, var(--bg-elev));
    border: 3px solid color-mix(in srgb, var(--accent) 45%, var(--border));
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .name { margin: .6rem 0 0; font-size: 1.35rem; font-weight: 800; }
  .handle { margin: 0; color: var(--txt3); font-weight: 700; }
  .bio { margin: .4rem 0 0; color: var(--txt2); font-size: .92rem; line-height: 1.5; max-width: 34ch; }
  .sub { margin: .4rem 0 0; color: var(--txt2); font-size: .9rem; line-height: 1.5; }
  .state-tag {
    margin: .8rem 0 0; font-weight: 800; font-size: .85rem; color: var(--txt2);
    background: var(--bg-elev); border: 1px solid var(--border);
    padding: .35rem .9rem; border-radius: 999px;
  }
  .state-tag.couple { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .state-tag.self-tag { color: var(--accent); }
  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: .6rem; margin-top: .9rem; width: 100%; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: .35rem;
    min-height: 46px; padding: 0 1.15rem; border-radius: 999px; font: inherit; font-weight: 800;
    border: 1px solid var(--border); background: var(--bg-elev); color: var(--txt);
    text-decoration: none; cursor: pointer;
  }
  .btn:disabled { opacity: .6; cursor: wait; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent, #fff); }
  .btn.primary:hover { filter: brightness(1.06); }
  .btn.couple-btn { border-color: color-mix(in srgb, var(--accent) 65%, transparent); background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }
  .btn.couple-btn:hover { background: color-mix(in srgb, var(--accent) 22%, transparent); }
  .btn.subtle { color: var(--txt2); }
  .btn.ghost { border-style: dashed; color: var(--txt3); cursor: default; }
  .unfriend {
    margin-top: .9rem; background: none; border: 0; color: var(--txt3);
    font: inherit; font-size: .8rem; text-decoration: underline; cursor: pointer;
  }
  .unfriend:hover { color: var(--error, #ef4444); }
  .cta {
    display: inline-flex; align-items: center; justify-content: center; min-height: 46px;
    padding: 0 1.5rem; margin-top: .6rem; font-weight: 800; text-decoration: none;
    color: var(--on-accent, #fff); background: var(--accent); border-radius: 999px;
  }
  .share-row {
    display: block; width: 100%; margin-top: .8rem; padding: .8rem 1rem; text-align: center;
    background: transparent; border: 1px dashed var(--border); border-radius: var(--radius-lg, 1rem);
    color: var(--txt2); font: inherit; font-weight: 700; cursor: pointer;
  }
  .share-row:hover { border-color: var(--accent); color: var(--accent); }
</style>
