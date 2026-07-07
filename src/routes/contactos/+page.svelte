<script lang="ts">
  /**
   * /contactos — find people by @handle, send connect requests, accept incoming
   * ones, and see your contacts. Phase 2 of the social layer. Requires a
   * signed-in account.
   */
  import { onMount, onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import { showToast } from '$lib/components/events';
  import { searchAccounts, type Account } from '$lib/account/auth';
  import { accountState, startAccountSync } from '$lib/account/account-store.svelte';
  import {
    listContacts,
    listIncoming,
    listOutgoing,
    sendConnect,
    acceptConnect,
    removeConnection,
    subscribeConnections,
    type Contact
  } from '$lib/account/contacts';

  let query = $state('');
  let results = $state<Account[]>([]);
  let searching = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  let contacts = $state<Contact[]>([]);
  let incoming = $state<Contact[]>([]);
  let outgoing = $state<Contact[]>([]);
  let unsub: (() => void) | null = null;

  // Map accountId → relationship, so search results show the right action.
  const rel = $derived.by(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    for (const c of incoming) m.set(c.id, c);
    for (const c of outgoing) m.set(c.id, c);
    return m;
  });

  async function refresh(): Promise<void> {
    if (!accountState.account) return;
    try {
      [contacts, incoming, outgoing] = await Promise.all([listContacts(), listIncoming(), listOutgoing()]);
    } catch (e) {
      console.warn('[contactos] refresh failed', e);
    }
  }

  onMount(() => {
    void (async () => {
      await startAccountSync();
      await refresh();
      unsub = subscribeConnections(() => void refresh());
    })();
  });
  onDestroy(() => unsub?.());

  function onInput(): void {
    if (timer) clearTimeout(timer);
    const q = query.trim();
    if (q.length < 2) {
      results = [];
      return;
    }
    searching = true;
    timer = setTimeout(async () => {
      try {
        results = await searchAccounts(q);
      } catch (e) {
        console.warn('[contactos] search failed', e);
        results = [];
      } finally {
        searching = false;
      }
    }, 350);
  }

  async function onConnect(a: Account): Promise<void> {
    try {
      const r = await sendConnect(a.id);
      if (r === 'sent') showToast($t('contactos.req_sent', { values: { handle: a.handle }, default: 'Pedido enviado a @{handle} ✅' }), 2200);
      else if (r === 'accepted') showToast($t('contactos.now_contact', { values: { handle: a.handle }, default: 'Agora és contacto de @{handle}! 🎉' }), 2400);
      else showToast($t('contactos.already', { default: 'Já tens uma ligação com esta pessoa.' }), 2200);
      await refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    }
  }

  async function onAccept(c: Contact): Promise<void> {
    try {
      await acceptConnect(c.connectionId);
      showToast($t('contactos.accepted', { values: { handle: c.handle }, default: '@{handle} é agora teu contacto! 🎉' }), 2400);
      await refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    }
  }

  async function onRemove(c: Contact): Promise<void> {
    try {
      await removeConnection(c.connectionId);
      await refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    }
  }
</script>

<svelte:head>
  <title>{$t('contactos.meta.title', { default: 'Contactos · Presuntinho' })}</title>
</svelte:head>

<div class="contactos">
  <header class="topbar">
    <a class="back" href="/conta/" aria-label={$t('conta.title', { default: 'A minha conta' })}>←</a>
    <h1>{$t('contactos.title', { default: 'Contactos' })}</h1>
  </header>

  {#if accountState.ready && !accountState.account}
    <p class="note">
      {$t('contactos.need_account', { default: 'Cria a tua conta primeiro para encontrar e ligar pessoas.' })}
      <a href="/conta/">{$t('conta.title', { default: 'A minha conta' })} →</a>
    </p>
  {:else}
    <label class="search">
      <span class="at">@</span>
      <input type="text" bind:value={query} oninput={onInput} placeholder={$t('contactos.search_ph', { default: 'procurar por handle…' })} autocapitalize="none" autocomplete="off" spellcheck="false" />
    </label>

    {#if searching}
      <p class="hint">{$t('contactos.searching', { default: 'A procurar…' })}</p>
    {:else if query.trim().length >= 2 && results.length === 0}
      <p class="hint">{$t('contactos.none', { default: 'Ninguém com esse handle.' })}</p>
    {/if}

    {#if results.length > 0}
      <ul class="list">
        {#each results as a (a.id)}
          {@const r = rel.get(a.id)}
          <li>
            <span class="av">{a.emoji ?? '🙂'}</span>
            <span class="who"><strong>{a.display_name || `@${a.handle}`}</strong><small>@{a.handle}</small></span>
            {#if r?.status === 'accepted'}
              <span class="tag">✓ {$t('contactos.contact', { default: 'Contacto' })}</span>
            {:else if r?.status === 'pending' && r.direction === 'in'}
              <button type="button" class="connect" onclick={() => onAccept(r)}>{$t('contactos.accept', { default: 'Aceitar' })}</button>
            {:else if r?.status === 'pending' && r.direction === 'out'}
              <span class="tag">{$t('contactos.pending', { default: 'Pendente' })}</span>
            {:else}
              <button type="button" class="connect" onclick={() => onConnect(a)}>{$t('contactos.connect', { default: 'Ligar' })}</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if incoming.length > 0}
      <h2 class="section">{$t('contactos.requests', { default: 'Pedidos' })} <span class="count">{incoming.length}</span></h2>
      <ul class="list">
        {#each incoming as c (c.connectionId)}
          <li>
            <span class="av">{c.emoji ?? '🙂'}</span>
            <span class="who"><strong>{c.display_name || `@${c.handle}`}</strong><small>@{c.handle}</small></span>
            <button type="button" class="connect" onclick={() => onAccept(c)}>{$t('contactos.accept', { default: 'Aceitar' })}</button>
            <button type="button" class="decline" onclick={() => onRemove(c)} aria-label={$t('contactos.decline', { default: 'Recusar' })}>✕</button>
          </li>
        {/each}
      </ul>
    {/if}

    <h2 class="section">{$t('contactos.mine', { default: 'Os meus contactos' })}{#if contacts.length}<span class="count">{contacts.length}</span>{/if}</h2>
    {#if contacts.length === 0}
      <p class="hint">{$t('contactos.empty', { default: 'Ainda não tens contactos. Procura um @handle acima e liga-te! 👆' })}</p>
    {:else}
      <ul class="list">
        {#each contacts as c (c.connectionId)}
          <li>
            <span class="av">{c.emoji ?? '🙂'}</span>
            <span class="who"><strong>{c.display_name || `@${c.handle}`}</strong><small>@{c.handle}</small></span>
            <button type="button" class="decline" onclick={() => onRemove(c)} aria-label={$t('contactos.remove', { default: 'Remover contacto' })}>✕</button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if outgoing.length > 0}
      <h2 class="section">{$t('contactos.sent', { default: 'Pedidos enviados' })}</h2>
      <ul class="list">
        {#each outgoing as c (c.connectionId)}
          <li>
            <span class="av">{c.emoji ?? '🙂'}</span>
            <span class="who"><strong>{c.display_name || `@${c.handle}`}</strong><small>@{c.handle}</small></span>
            <span class="tag">{$t('contactos.pending', { default: 'Pendente' })}</span>
            <button type="button" class="decline" onclick={() => onRemove(c)} aria-label={$t('contactos.cancel', { default: 'Cancelar' })}>✕</button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .contactos { max-width: 560px; margin: 0 auto; padding: 1rem 1rem 8rem; color: var(--txt); }
  .topbar { display: flex; align-items: center; gap: .75rem; padding: .25rem 0 1rem; }
  .back { color: var(--txt); text-decoration: none; font-size: 1.4rem; width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; }
  .back:hover { background: var(--card-hover, var(--card)); }
  .topbar h1 { margin: 0; font-size: 1.4rem; font-weight: 800; }
  .note { color: var(--txt2); text-align: center; padding: 2rem 1rem; line-height: 1.5; }
  .note a { color: var(--accent); font-weight: 700; }
  .search { display: flex; align-items: center; gap: .4rem; padding: 0 .85rem; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-elev, rgba(255,255,255,.04)); }
  .search .at { color: var(--txt3); font-weight: 800; }
  .search input { flex: 1; font: inherit; padding: .75rem 0; border: 0; background: transparent; color: var(--txt); min-height: 44px; }
  .search input:focus-visible { outline: none; }
  .search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent); }
  .hint { color: var(--txt3); font-size: .85rem; padding: .6rem .25rem; }
  .section { margin: 1.4rem 0 .3rem; font-size: .78rem; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: var(--txt3); display: flex; align-items: center; gap: .5rem; }
  .count { background: var(--accent); color: var(--on-accent, #fff); font-size: .7rem; min-width: 1.2rem; height: 1.2rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; padding: 0 .35rem; }
  .list { list-style: none; margin: .2rem 0 0; padding: 0; display: flex; flex-direction: column; }
  .list li { display: flex; align-items: center; gap: .8rem; padding: .7rem .25rem; border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent); }
  .av { font-size: 1.8rem; line-height: 1; width: 2.4rem; text-align: center; }
  .who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .who strong { font-weight: 700; }
  .who small { color: var(--txt3); font-size: .8rem; }
  .connect { flex-shrink: 0; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); font: inherit; font-weight: 700; border-radius: 999px; padding: .45rem 1rem; min-height: 40px; cursor: pointer; }
  .connect:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }
  .decline { flex-shrink: 0; width: 40px; height: 40px; border-radius: 999px; border: 0; background: transparent; color: var(--txt3); font-size: .95rem; cursor: pointer; }
  .decline:hover { color: var(--error, #ef4444); background: color-mix(in srgb, var(--error, #ef4444) 10%, transparent); }
  .tag { flex-shrink: 0; color: var(--txt3); font-size: .8rem; font-weight: 700; padding: .3rem .1rem; }
</style>
