<script lang="ts">
  /**
   * /contactos — the people hub. A prominent 🔍 search finds anyone by @handle;
   * tapping a result opens their PUBLIC PROFILE (/u) where the clear actions
   * live (add friend → message → couple request). Incoming requests surface
   * here with one-tap answers; couple requests route to /casal/pedido for the
   * full-page moment.
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
    acceptConnect,
    removeConnection,
    subscribeConnections,
    type Contact
  } from '$lib/account/contacts';
  import {
    listSpaces,
    isCoupleActive,
    pendingCoupleInvites,
    otherMember,
    subscribeSpaces,
    type Space
  } from '$lib/account/spaces';
  import { requestCouple, pokeCoupleLink } from '$lib/account/couple-link';

  let query = $state('');
  let results = $state<Account[]>([]);
  let searching = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  let contacts = $state<Contact[]>([]);
  let incoming = $state<Contact[]>([]);
  let outgoing = $state<Contact[]>([]);
  let spaces = $state<Space[]>([]);
  let unsub: (() => void) | null = null;
  let unsubSp: (() => void) | null = null;

  const meId = $derived(accountState.account?.id ?? '');
  // Couple SPACE invites addressed to ME (they proposed, I'm pending).
  const coupleInvites = $derived(pendingCoupleInvites(spaces, meId));
  // Incoming requests split: couple requests get the full-page answer.
  const incomingCouple = $derived(incoming.filter((c) => c.wantsCouple));
  const incomingFriends = $derived(incoming.filter((c) => !c.wantsCouple));
  // Account ids I'm in ANY couple space with (active or pending) + the state.
  const coupleWith = $derived.by(() => {
    const m = new Map<string, 'active' | 'pending'>();
    for (const s of spaces) {
      if (s.kind !== 'couple') continue;
      const other = otherMember(s, meId);
      if (other) m.set(other.id, isCoupleActive(s) ? 'active' : 'pending');
    }
    return m;
  });

  // Map accountId → relationship, so search results show the current state.
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
      [contacts, incoming, outgoing, spaces] = await Promise.all([
        listContacts(),
        listIncoming(),
        listOutgoing(),
        listSpaces()
      ]);
    } catch (e) {
      console.warn('[contactos] refresh failed', e);
    }
  }

  onMount(() => {
    void (async () => {
      await startAccountSync();
      await refresh();
      unsub = subscribeConnections(() => void refresh());
      unsubSp = subscribeSpaces(() => void refresh());
    })();
  });
  onDestroy(() => {
    unsub?.();
    unsubSp?.();
  });

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

  async function onAccept(c: Contact): Promise<void> {
    try {
      const { coupleActive } = await acceptConnect(c.connectionId);
      showToast($t('contactos.accepted', { values: { handle: c.handle }, default: '@{handle} é agora teu contacto! 🎉' }), 2400);
      if (coupleActive) pokeCoupleLink();
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

  // ── Pedido de casal a um amigo (atalho da lista; o perfil também o tem) ──
  async function onCoupleRequest(a: Account): Promise<void> {
    try {
      const r = await requestCouple(a);
      if (r === 'proposed' || r === 'sent')
        showToast($t('couplelink.proposed', { values: { handle: a.handle }, default: '💌 Pedido de casal enviado a @{handle}!' }), 2600);
      else if (r === 'active') pokeCoupleLink(); // both consents → celebrate now
      else if (r === 'taken')
        showToast($t('couplelink.taken', { default: 'Um de vocês já tem um casal ativo — só há um de cada vez. 💔' }), 3200);
      else if (r === 'already')
        showToast($t('couplelink.already', { default: 'Já têm um pedido de casal entre vocês. 💞' }), 2400);
      await refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    }
  }

  function stateTag(a: Account): { label: string; couple: boolean } | null {
    const cw = coupleWith.get(a.id);
    if (cw === 'active') return { label: `💞 ${$t('couplelink.tag', { default: 'Casal' })}`, couple: true };
    if (cw === 'pending') return { label: `💌 ${$t('couplelink.pending', { default: 'Casal pendente' })}`, couple: true };
    const r = rel.get(a.id);
    if (r?.status === 'accepted') return { label: `✓ ${$t('uprofile.state_friends', { default: 'Amigos' })}`, couple: false };
    if (r?.status === 'pending' && r.wantsCouple) return { label: `💌 ${$t('couplelink.pending', { default: 'Casal pendente' })}`, couple: true };
    if (r?.status === 'pending') return { label: $t('contactos.pending', { default: 'Pendente' }), couple: false };
    return null;
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
      <span class="lupa" aria-hidden="true">🔍</span>
      <input type="text" bind:value={query} oninput={onInput} placeholder={$t('contactos.search_ph2', { default: 'procurar @handle…' })} autocapitalize="none" autocomplete="off" spellcheck="false" />
    </label>

    {#if searching}
      <p class="hint">{$t('contactos.searching', { default: 'A procurar…' })}</p>
    {:else if query.trim().length >= 2 && results.length === 0}
      <p class="hint">{$t('contactos.none', { default: 'Ninguém com esse handle.' })}</p>
    {/if}

    {#if results.length > 0}
      <ul class="list">
        {#each results as a (a.id)}
          {@const tag = stateTag(a)}
          <li>
            <a class="row-link" href={`/u/?h=${a.handle}`}>
              <span class="av">{a.emoji ?? '🙂'}</span>
              <span class="who"><strong>{a.display_name || `@${a.handle}`}</strong><small>@{a.handle}</small></span>
              {#if tag}
                <span class="tag" class:couple-tag={tag.couple}>{tag.label}</span>
              {/if}
              <span class="chev" aria-hidden="true">›</span>
            </a>
          </li>
        {/each}
      </ul>
      <p class="hint">{$t('contactos.open_profile_hint', { default: 'Toca numa pessoa para abrir o perfil e enviar o pedido. 👆' })}</p>
    {/if}

    {#if incomingCouple.length > 0 || coupleInvites.length > 0}
      <h2 class="section couple-section">💞 {$t('couplelink.invites', { default: 'Pedidos de casal' })} <span class="count">{incomingCouple.length + coupleInvites.length}</span></h2>
      <ul class="list">
        {#each incomingCouple as c (c.connectionId)}
          <li class="couple-invite">
            <span class="av">{c.emoji ?? '💞'}</span>
            <span class="who">
              <strong>{c.display_name || `@${c.handle}`}</strong>
              <small>{$t('couplelink.invite_sub', { default: 'quer ser teu casal 💘' })}</small>
            </span>
            <a class="couple-btn accept" href={`/casal/pedido/?conn=${c.connectionId}`}>{$t('contactos.answer', { default: 'Responder' })} 💞</a>
          </li>
        {/each}
        {#each coupleInvites as s (s.id)}
          {@const other = otherMember(s, meId)}
          <li class="couple-invite">
            <span class="av">{other?.emoji ?? '💞'}</span>
            <span class="who">
              <strong>{other?.display_name || (other ? `@${other.handle}` : '?')}</strong>
              <small>{$t('couplelink.invite_sub', { default: 'quer ser teu casal 💘' })}</small>
            </span>
            <a class="couple-btn accept" href={`/casal/pedido/?space=${s.id}`}>{$t('contactos.answer', { default: 'Responder' })} 💞</a>
          </li>
        {/each}
      </ul>
    {/if}

    {#if incomingFriends.length > 0}
      <h2 class="section">{$t('contactos.requests', { default: 'Pedidos' })} <span class="count">{incomingFriends.length}</span></h2>
      <ul class="list">
        {#each incomingFriends as c (c.connectionId)}
          <li>
            <a class="row-link grow" href={`/u/?h=${c.handle}`}>
              <span class="av">{c.emoji ?? '🙂'}</span>
              <span class="who"><strong>{c.display_name || `@${c.handle}`}</strong><small>@{c.handle}</small></span>
            </a>
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
          {@const cw = coupleWith.get(c.id)}
          <li>
            <a class="row-link grow" href={`/u/?h=${c.handle}`}>
              <span class="av">{c.emoji ?? '🙂'}</span>
              <span class="who"><strong>{c.display_name || `@${c.handle}`}</strong><small>@{c.handle}</small></span>
            </a>
            {#if cw === 'active'}
              <span class="tag couple-tag">💞 {$t('couplelink.tag', { default: 'Casal' })}</span>
            {:else if cw === 'pending'}
              <span class="tag">💌 {$t('couplelink.pending', { default: 'Casal pendente' })}</span>
            {:else}
              <button type="button" class="couple-btn" onclick={() => onCoupleRequest(c)}>💞 {$t('couplelink.request', { default: 'Casal' })}</button>
            {/if}
            <a class="msg-btn" href={`/mensagens/?dm=${c.handle}`} aria-label={$t('uprofile.message', { default: 'Mensagem' })}>💬</a>
          </li>
        {/each}
      </ul>
    {/if}

    {#if outgoing.length > 0}
      <h2 class="section">{$t('contactos.sent', { default: 'Pedidos enviados' })}</h2>
      <ul class="list">
        {#each outgoing as c (c.connectionId)}
          <li>
            <a class="row-link grow" href={`/u/?h=${c.handle}`}>
              <span class="av">{c.emoji ?? '🙂'}</span>
              <span class="who"><strong>{c.display_name || `@${c.handle}`}</strong><small>@{c.handle}</small></span>
            </a>
            <span class="tag">{c.wantsCouple ? `💌 ${$t('couplelink.pending', { default: 'Casal pendente' })}` : $t('contactos.pending', { default: 'Pendente' })}</span>
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
  .search { display: flex; align-items: center; gap: .5rem; padding: 0 .95rem; border-radius: 999px; border: 1.5px solid var(--border); background: var(--bg-elev, rgba(255,255,255,.04)); box-shadow: var(--shadow-sm, 0 2px 8px rgba(0,0,0,.06)); }
  .search .lupa { font-size: 1.05rem; }
  .search input { flex: 1; font: inherit; padding: .8rem 0; border: 0; background: transparent; color: var(--txt); min-height: 48px; }
  .search input:focus-visible { outline: none; }
  .search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
  .hint { color: var(--txt3); font-size: .85rem; padding: .6rem .25rem; }
  .section { margin: 1.4rem 0 .3rem; font-size: .78rem; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: var(--txt3); display: flex; align-items: center; gap: .5rem; }
  .count { background: var(--accent); color: var(--on-accent, #fff); font-size: .7rem; min-width: 1.2rem; height: 1.2rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; padding: 0 .35rem; }
  .list { list-style: none; margin: .2rem 0 0; padding: 0; display: flex; flex-direction: column; }
  .list li { display: flex; align-items: center; gap: .6rem; padding: .55rem .25rem; border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent); }
  .row-link { display: flex; align-items: center; gap: .8rem; flex: 1; min-width: 0; color: inherit; text-decoration: none; padding: .3rem .35rem; margin: -.3rem 0; border-radius: var(--radius-md, .75rem); }
  .row-link:hover, .row-link:focus-visible { background: color-mix(in srgb, var(--accent) 8%, transparent); outline: none; }
  .row-link.grow { flex: 1; }
  .chev { color: var(--txt3); font-size: 1.2rem; font-weight: 700; }
  .av { font-size: 1.8rem; line-height: 1; width: 2.4rem; text-align: center; flex-shrink: 0; }
  .who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .who strong { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .who small { color: var(--txt3); font-size: .8rem; }
  .connect { flex-shrink: 0; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); font: inherit; font-weight: 700; border-radius: 999px; padding: .45rem 1rem; min-height: 40px; cursor: pointer; }
  .connect:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }
  .decline { flex-shrink: 0; width: 40px; height: 40px; border-radius: 999px; border: 0; background: transparent; color: var(--txt3); font-size: .95rem; cursor: pointer; }
  .decline:hover { color: var(--error, #ef4444); background: color-mix(in srgb, var(--error, #ef4444) 10%, transparent); }
  .tag { flex-shrink: 0; color: var(--txt3); font-size: .8rem; font-weight: 700; padding: .3rem .1rem; }
  .couple-tag { color: var(--accent); }
  .couple-btn { flex-shrink: 0; border: 1px solid color-mix(in srgb, var(--accent) 70%, transparent); background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); font: inherit; font-weight: 700; border-radius: 999px; padding: .45rem .85rem; min-height: 40px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: .25rem; }
  .couple-btn:hover { background: color-mix(in srgb, var(--accent) 24%, transparent); }
  .couple-btn.accept { background: var(--accent); color: var(--on-accent, #fff); border-color: var(--accent); }
  .msg-btn { flex-shrink: 0; width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-elev); text-decoration: none; font-size: 1.05rem; }
  .msg-btn:hover { border-color: var(--accent); }
  .couple-section { color: var(--accent); }
  .couple-invite { background: color-mix(in srgb, var(--accent) 7%, transparent); border-radius: var(--radius-md, .6rem); padding-inline: .5rem; }
</style>
