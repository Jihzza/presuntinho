<script lang="ts">
  /**
   * /contactos — find people by @handle. Phase 1 ships the SEARCH (the accounts
   * table foundation); sending a connect request + the accepted-contacts list
   * land in Phase 2 (connections table). Requires a signed-in account.
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { showToast } from '$lib/components/events';
  import { searchAccounts, type Account } from '$lib/account/auth';
  import { accountState, startAccountSync } from '$lib/account/account-store.svelte';

  let query = $state('');
  let results = $state<Account[]>([]);
  let searching = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    void startAccountSync();
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

  function connect(a: Account): void {
    showToast($t('contactos.soon', { values: { handle: a.handle }, default: 'Pedir para ligar com @{handle} chega na próxima fase 🔜' }), 2600);
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
      <input
        type="text"
        bind:value={query}
        oninput={onInput}
        placeholder={$t('contactos.search_ph', { default: 'procurar por handle…' })}
        autocapitalize="none"
        autocomplete="off"
        spellcheck="false"
      />
    </label>

    {#if searching}
      <p class="hint">{$t('contactos.searching', { default: 'A procurar…' })}</p>
    {:else if query.trim().length >= 2 && results.length === 0}
      <p class="hint">{$t('contactos.none', { default: 'Ninguém com esse handle.' })}</p>
    {/if}

    <ul class="results">
      {#each results as a (a.id)}
        <li>
          <span class="av">{a.emoji ?? '🙂'}</span>
          <span class="who">
            <strong>{a.display_name || `@${a.handle}`}</strong>
            <small>@{a.handle}</small>
          </span>
          <button type="button" class="connect" onclick={() => connect(a)}>{$t('contactos.connect', { default: 'Ligar' })}</button>
        </li>
      {/each}
    </ul>
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
  .hint { color: var(--txt3); font-size: .85rem; padding: .75rem .25rem; }
  .results { list-style: none; margin: .5rem 0 0; padding: 0; display: flex; flex-direction: column; }
  .results li { display: flex; align-items: center; gap: .8rem; padding: .7rem .25rem; border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent); }
  .av { font-size: 1.8rem; line-height: 1; width: 2.4rem; text-align: center; }
  .who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .who strong { font-weight: 700; }
  .who small { color: var(--txt3); font-size: .8rem; }
  .connect { flex-shrink: 0; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); font: inherit; font-weight: 700; border-radius: 999px; padding: .45rem 1rem; min-height: 40px; cursor: pointer; }
  .connect:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }
</style>
