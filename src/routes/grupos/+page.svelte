<script lang="ts">
  /**
   * /grupos — your shared spaces: couples (2) and groups (N), built on real
   * accounts + connections. Create a group, add your contacts to it, form a
   * couple with a contact, and leave. Phase 3 of the social layer.
   */
  import { onMount, onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import { showToast } from '$lib/components/events';
  import { accountState, startAccountSync } from '$lib/account/account-store.svelte';
  import { listContacts, type Contact } from '$lib/account/contacts';
  import {
    listSpaces,
    createGroup,
    addToGroup,
    proposeCouple,
    acceptCouple,
    isCoupleActive,
    pendingCoupleInvites,
    leaveSpace,
    otherMember,
    subscribeSpaces,
    type Space
  } from '$lib/account/spaces';
  import { invalidateCoupleId } from '$lib/couple/couple-supabase';

  let spaces = $state<Space[]>([]);
  let contacts = $state<Contact[]>([]);
  let newGroupName = $state('');
  let busy = $state(false);
  let addingTo = $state<string | null>(null); // space id whose picker is open
  let unsub: (() => void) | null = null;

  const myId = $derived(accountState.user?.id ?? '');
  const allCouples = $derived(spaces.filter((s) => s.kind === 'couple'));
  const activeCouples = $derived(allCouples.filter(isCoupleActive));
  // Couple invites waiting for MY acceptance (they proposed, I'm pending).
  const invites = $derived(pendingCoupleInvites(spaces, myId));
  // Couples I proposed that the other hasn't accepted yet.
  const sentCouples = $derived(
    allCouples.filter((s) => !isCoupleActive(s) && s.members.some((m) => m.id === myId && m.status === 'accepted'))
  );
  const groups = $derived(spaces.filter((s) => s.kind === 'group'));
  // Contacts already in ANY couple with me (so we don't offer a duplicate).
  const coupleWith = $derived(new Set(allCouples.flatMap((s) => s.members.map((m) => m.id))));

  async function refresh(): Promise<void> {
    if (!accountState.account) return;
    try {
      [spaces, contacts] = await Promise.all([listSpaces(), listContacts()]);
    } catch (e) {
      console.warn('[grupos] refresh failed', e);
    }
  }

  onMount(() => {
    void (async () => {
      await startAccountSync();
      await refresh();
      unsub = subscribeSpaces(() => void refresh());
    })();
  });
  onDestroy(() => unsub?.());

  async function onCreateGroup(): Promise<void> {
    const name = newGroupName.trim();
    if (!name || busy) return;
    busy = true;
    try {
      await createGroup(name);
      newGroupName = '';
      await refresh();
      showToast($t('grupos.created', { values: { name }, default: 'Grupo «{name}» criado! 🎉' }), 2200);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    } finally {
      busy = false;
    }
  }

  /** Both people are now a couple → the couple data rescopes on reload. */
  function activateAndReload(handle: string): void {
    invalidateCoupleId();
    showToast($t('grupos.couple_active', { values: { handle }, default: 'Casal com @{handle} ativo! A recarregar para sincronizar… 💞' }), 2400);
    setTimeout(() => location.reload(), 1400);
  }

  async function onProposeCouple(c: Contact): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const { active } = await proposeCouple(c.id);
      await refresh();
      if (active) activateAndReload(c.handle);
      else showToast($t('grupos.couple_proposed', { values: { handle: c.handle }, default: 'Pedido de casal enviado a @{handle} — falta ela aceitar 💌' }), 2800);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    } finally {
      busy = false;
    }
  }

  async function onAcceptCouple(s: Space): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const active = await acceptCouple(s.id);
      await refresh();
      const other = otherMember(s, myId);
      if (active) activateAndReload(other?.handle ?? '');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    } finally {
      busy = false;
    }
  }

  async function onAdd(spaceId: string, c: Contact): Promise<void> {
    try {
      await addToGroup(spaceId, c.id);
      addingTo = null;
      await refresh();
      showToast($t('grupos.added', { values: { handle: c.handle }, default: '@{handle} adicionado ao grupo ✅' }), 2000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    }
  }

  async function onLeave(s: Space): Promise<void> {
    try {
      await leaveSpace(s.id);
      await refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 3000, 'error');
    }
  }

  function membersNotIn(space: Space): Contact[] {
    const inSpace = new Set(space.members.map((m) => m.id));
    return contacts.filter((c) => !inSpace.has(c.id));
  }
</script>

<svelte:head>
  <title>{$t('grupos.meta.title', { default: 'Casal e grupos · Presuntinho' })}</title>
</svelte:head>

<div class="grupos">
  <header class="topbar">
    <a class="back" href="/conta/" aria-label={$t('conta.title', { default: 'A minha conta' })}>←</a>
    <h1>{$t('grupos.title', { default: 'Casal e grupos' })}</h1>
  </header>

  {#if accountState.ready && !accountState.account}
    <p class="note">
      {$t('grupos.need_account', { default: 'Cria a tua conta e liga-te a pessoas primeiro.' })}
      <a href="/conta/">{$t('conta.title', { default: 'A minha conta' })} →</a>
    </p>
  {:else}
    <!-- ── Couple invites waiting for me ── -->
    {#if invites.length > 0}
      <h2 class="section">💌 {$t('grupos.invites', { default: 'Pedidos de casal' })}</h2>
      {#each invites as s (s.id)}
        {@const other = otherMember(s, myId)}
        <div class="space-card invite">
          <span class="sp-emoji">{other?.emoji ?? '💞'}</span>
          <span class="sp-copy">
            <strong>{other?.display_name || (other ? `@${other.handle}` : '')}</strong>
            <small>{$t('grupos.invite_sub', { default: 'quer formar casal contigo' })}</small>
          </span>
          <button type="button" class="chip accept" onclick={() => onAcceptCouple(s)} disabled={busy}>{$t('grupos.accept', { default: 'Aceitar' })}</button>
          <button type="button" class="leave" onclick={() => onLeave(s)} aria-label={$t('contactos.decline', { default: 'Recusar' })}>✕</button>
        </div>
      {/each}
    {/if}

    <!-- ── Couple ── -->
    <h2 class="section">💞 {$t('grupos.couple', { default: 'Casal' })}</h2>
    {#each activeCouples as s (s.id)}
      {@const other = otherMember(s, myId)}
      <div class="space-card">
        <span class="sp-emoji">{other?.emoji ?? '💞'}</span>
        <span class="sp-copy">
          <strong>{other?.display_name || (other ? `@${other.handle}` : $t('grupos.couple', { default: 'Casal' }))}</strong>
          <small>{$t('grupos.couple_sub', { default: 'modo casal ativo' })}</small>
        </span>
        <button type="button" class="leave" onclick={() => onLeave(s)} aria-label={$t('grupos.leave', { default: 'Sair' })}>✕</button>
      </div>
    {/each}
    {#each sentCouples as s (s.id)}
      {@const other = otherMember(s, myId)}
      <div class="space-card pending">
        <span class="sp-emoji">{other?.emoji ?? '💞'}</span>
        <span class="sp-copy">
          <strong>{other?.display_name || (other ? `@${other.handle}` : '')}</strong>
          <small>{$t('grupos.couple_pending', { default: 'à espera que aceite…' })}</small>
        </span>
        <button type="button" class="leave" onclick={() => onLeave(s)} aria-label={$t('contactos.cancel', { default: 'Cancelar' })}>✕</button>
      </div>
    {/each}
    {#if activeCouples.length === 0 && sentCouples.length === 0}
      <p class="hint">{$t('grupos.couple_hint', { default: 'Forma casal com um contacto para sincronizarem pontos, chat e mais.' })}</p>
    {/if}
    {#if contacts.filter((c) => !coupleWith.has(c.id)).length > 0}
      <div class="pick-row">
        <span class="pick-label">{$t('grupos.form_couple', { default: 'Formar casal com:' })}</span>
        <div class="chips">
          {#each contacts.filter((c) => !coupleWith.has(c.id)) as c (c.id)}
            <button type="button" class="chip" onclick={() => onProposeCouple(c)} disabled={busy}>{c.emoji ?? '🙂'} @{c.handle}</button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ── Groups ── -->
    <h2 class="section">👥 {$t('grupos.groups', { default: 'Grupos' })}</h2>
    {#each groups as s (s.id)}
      <div class="space-card group">
        <span class="sp-emoji">{s.emoji ?? '👥'}</span>
        <span class="sp-copy">
          <strong>{s.name}</strong>
          <small>{s.members.map((m) => `@${m.handle}`).join(', ')}</small>
        </span>
        {#if s.owner === myId}
          <button type="button" class="add-btn" onclick={() => (addingTo = addingTo === s.id ? null : s.id)}>+</button>
        {/if}
        <button type="button" class="leave" onclick={() => onLeave(s)} aria-label={$t('grupos.leave', { default: 'Sair' })}>✕</button>
      </div>
      {#if addingTo === s.id}
        <div class="chips add-chips">
          {#if membersNotIn(s).length === 0}
            <span class="hint">{$t('grupos.all_added', { default: 'Todos os teus contactos já estão neste grupo.' })}</span>
          {/if}
          {#each membersNotIn(s) as c (c.id)}
            <button type="button" class="chip" onclick={() => onAdd(s.id, c)}>{c.emoji ?? '🙂'} @{c.handle}</button>
          {/each}
        </div>
      {/if}
    {/each}
    {#if groups.length === 0}
      <p class="hint">{$t('grupos.groups_hint', { default: 'Ainda não tens grupos.' })}</p>
    {/if}

    <div class="create">
      <input type="text" bind:value={newGroupName} maxlength="30" placeholder={$t('grupos.new_ph', { default: 'Nome do novo grupo…' })} />
      <button type="button" class="cta" onclick={onCreateGroup} disabled={busy || !newGroupName.trim()}>{$t('grupos.create', { default: 'Criar grupo' })}</button>
    </div>

    <p class="foot">{$t('grupos.foot', { default: 'Só podes adicionar pessoas que são teus contactos.' })} <a href="/contactos/">{$t('contactos.title', { default: 'Contactos' })} →</a></p>
  {/if}
</div>

<style>
  .grupos { max-width: 560px; margin: 0 auto; padding: 1rem 1rem 8rem; color: var(--txt); }
  .topbar { display: flex; align-items: center; gap: .75rem; padding: .25rem 0 1rem; }
  .back { color: var(--txt); text-decoration: none; font-size: 1.4rem; width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; }
  .back:hover { background: var(--card-hover, var(--card)); }
  .topbar h1 { margin: 0; font-size: 1.4rem; font-weight: 800; }
  .note { color: var(--txt2); text-align: center; padding: 2rem 1rem; line-height: 1.5; }
  .note a { color: var(--accent); font-weight: 700; }
  .section { margin: 1.5rem 0 .5rem; font-size: .9rem; font-weight: 800; color: var(--txt); }
  .hint { color: var(--txt3); font-size: .84rem; padding: .3rem .25rem; line-height: 1.4; }
  .space-card { display: flex; align-items: center; gap: .8rem; padding: .8rem; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg, 1rem); margin-bottom: .5rem; }
  .space-card.group { border-color: color-mix(in srgb, var(--accent) 25%, var(--border)); }
  .space-card.invite { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); background: color-mix(in srgb, var(--accent) 8%, var(--card)); }
  .space-card.pending { opacity: .82; }
  .chip.accept { border-color: var(--success, #10b981); color: var(--success, #10b981); background: color-mix(in srgb, var(--success, #10b981) 12%, transparent); }
  .chip.accept:hover { background: color-mix(in srgb, var(--success, #10b981) 22%, transparent); }
  .chip:disabled { opacity: .55; cursor: not-allowed; }
  .sp-emoji { font-size: 1.9rem; line-height: 1; }
  .sp-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .sp-copy strong { font-weight: 700; }
  .sp-copy small { color: var(--txt3); font-size: .78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .leave, .add-btn { flex-shrink: 0; width: 38px; height: 38px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--txt3); font-size: 1rem; cursor: pointer; }
  .add-btn { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); font-size: 1.3rem; font-weight: 700; }
  .leave:hover { color: var(--error, #ef4444); border-color: color-mix(in srgb, var(--error, #ef4444) 40%, transparent); }
  .add-btn:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .pick-row { margin: .3rem 0 .5rem; }
  .pick-label { display: block; color: var(--txt3); font-size: .8rem; margin-bottom: .35rem; }
  .chips { display: flex; flex-wrap: wrap; gap: .4rem; }
  .add-chips { margin: -.2rem 0 .6rem .5rem; }
  .chip { border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); color: var(--accent); font: inherit; font-size: .82rem; font-weight: 700; border-radius: 999px; padding: .4rem .8rem; min-height: 38px; cursor: pointer; }
  .chip:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }
  .create { display: flex; gap: .5rem; margin-top: 1rem; }
  .create input { flex: 1; font: inherit; padding: .7rem .85rem; border-radius: var(--radius-md, .6rem); border: 1px solid var(--border); background: var(--bg-elev, rgba(255,255,255,.04)); color: var(--txt); min-height: 46px; }
  .create input:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent); }
  .cta { flex-shrink: 0; border: 0; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-weight: 800; border-radius: var(--radius-md, .6rem); padding: 0 1.1rem; min-height: 46px; cursor: pointer; }
  .cta:disabled { opacity: .55; cursor: not-allowed; }
  .foot { margin-top: 1.5rem; color: var(--txt3); font-size: .82rem; }
  .foot a { color: var(--accent); font-weight: 700; }
</style>
