<!--
  /biblioteca — list of bookmarks + tag filter + search.

  Loads `listItems()` on mount, shows a friendly empty state when the
  user has no bookmarks yet, and links each row to its detail page.

  Filter UX:
    * Search box filters by title (case-insensitive substring).
    * Tag chips below the search box show every distinct tag; tapping
      a chip toggles it as the active tag filter.  Tapping a chip that
      is already active clears the filter.
    * When a tag filter is active, the corresponding chip is styled as
      "selected" so the user knows what's filtering their view.

  Slug strategy:
    The detail route is keyed by the numeric id (e.g.
    `/biblioteca/item/3/`).  Dexie's primary key is numeric, and we
    don't need pretty URLs for an internal bookmark store.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import {
    listItems,
    listTags,
    deleteItem,
    type Item
  } from '$lib/biblioteca';
  import { subApps } from '$lib/registry';
  import { showToast } from '$lib/components/events';

  let items = $state<Item[]>([]);
  let allTags = $state<string[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let query = $state('');
  let activeTag = $state<string | null>(null);
  let confirmingDelete = $state<number | null>(null);

  const bibliotecaApp = subApps.find((a) => a.id === 'biblioteca');

  // Re-run whenever the inputs that affect the filtered query change.
  // `untrack()` on the body prevents the effect from re-running when
  // `items` / `allTags` mutate as a side-effect (would loop forever).
  $effect(() => {
    const q = query;
    const t = activeTag;
    untrack(() => {
      void refreshInternal(q, t);
    });
  });

  async function refreshInternal(q: string, t: string | null): Promise<void> {
    loading = true;
    error = null;
    try {
      const [list, tags] = await Promise.all([
        listItems({ query: q, tag: t ?? undefined }),
        listTags()
      ]);
      items = list;
      // If the active tag no longer exists (user just deleted its last
      // bookmark), drop the filter so the chip row doesn't show a
      // dangling selection.
      if (activeTag && !tags.includes(activeTag)) {
        activeTag = null;
      }
      allTags = tags;
    } catch (e) {
      console.error('[biblioteca] refresh failed', e);
      error = e instanceof Error ? e.message : 'Erro a carregar biblioteca';
    } finally {
      loading = false;
    }
  }

  async function refresh(): Promise<void> {
    // Used by delete-handler: re-run the current filter set.
    await refreshInternal(query, activeTag);
  }

  function toggleTag(tag: string): void {
    activeTag = activeTag === tag ? null : tag;
  }

  function clearFilters(): void {
    query = '';
    activeTag = null;
  }

  async function confirmDelete(id: number): Promise<void> {
    if (confirmingDelete !== id) {
      confirmingDelete = id;
      // Auto-cancel after 4s so the UI doesn't get stuck in confirm mode.
      setTimeout(() => {
        if (confirmingDelete === id) confirmingDelete = null;
      }, 4000);
      return;
    }
    confirmingDelete = null;
    try {
      await deleteItem(id);
      await refresh();
      showToast('Marcador removido');
    } catch (e) {
      console.error('[biblioteca] delete failed', e);
      showToast('Erro a remover marcador');
    }
  }

  function hostFromUrl(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  function formatCreatedAt(ts: number): string {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  // Cosmetic cap so the description preview doesn't dominate the card.
  function preview(text: string, max: number = 140): string {
    if (!text) return '';
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }
</script>

<svelte:head>
  <title>Biblioteca · Bookmarks · Presuntinho</title>
  <meta name="description" content="Bookmarks, links e referências" />
  <meta property="og:title" content="Biblioteca · Bookmarks" />
  <meta property="og:description" content="Bookmarks, links e referências" />
  <meta property="og:url" content="https://presuntinho.netlify.app/biblioteca/" />
  <meta name="twitter:title" content="Biblioteca · Bookmarks" />
  <meta name="twitter:description" content="Bookmarks, links e referências" />
</svelte:head>

<div class="biblioteca-page">
  <header class="hero">
    <h1>📚 Biblioteca</h1>
    <p class="sub">Bookmarks, links e referências com tags.</p>
  </header>

  <nav class="crumbs" aria-label="Caminho de navegação">
    <a href="/">← Hub</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">Biblioteca</span>
  </nav>

  <section class="actions" aria-label="Ações">
    <a class="btn-primary" href="/biblioteca/novo/">+ Novo marcador</a>
  </section>

  <section class="filters" aria-label="Filtros">
    <div class="search-row">
      <label class="search">
        <span class="search-label">{$t('common.search')}</span>
        <input
          type="search"
          bind:value={query}
          placeholder="Ex.: Python decorators"
          autocomplete="off"
          aria-label="Pesquisar marcadores por título"
        />
      </label>
      {#if query || activeTag}
        <button
          type="button"
          class="clear-btn"
          onclick={clearFilters}
          aria-label="Limpar filtros"
        >
          {$t('common.filter')}: limpar
        </button>
      {/if}
    </div>

    {#if allTags.length > 0}
      <div class="tag-chips" role="group" aria-label="Filtrar por tag">
        {#each allTags as tag (tag)}
          <button
            type="button"
            class="chip"
            class:active={activeTag === tag}
            aria-pressed={activeTag === tag}
            onclick={() => toggleTag(tag)}
          >
            #{tag}
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <section class="list" aria-label="Lista de marcadores">
    {#if loading}
      <p class="empty">A carregar…</p>
    {:else if error}
      <p class="empty error" role="alert">⚠️ {error}</p>
    {:else if items.length === 0}
      <div class="empty">
        {#if query || activeTag}
          <p class="empty-msg">Nenhum marcador corresponde aos filtros.</p>
          <p class="empty-hint">
            Tenta limpar os filtros ou <button type="button" class="link-btn" onclick={clearFilters}>mostra tudo</button>.
          </p>
        {:else}
          <p class="empty-msg">Ainda não tens marcadores.</p>
          <p class="empty-hint">
            Adiciona o primeiro — por exemplo, a documentação de uma tecnologia
            ou um artigo que queres voltar a ler.
          </p>
          <a class="btn-primary" href="/biblioteca/novo/">+ Adicionar marcador</a>
        {/if}
      </div>
    {:else}
      <ul class="cards">
        {#each items as item (item.id)}
          <li class="card">
            <a class="card-main" href={`/biblioteca/item/${item.id}/`}>
              <span class="content">
                <span class="title">{item.title}</span>
                <span class="url">{hostFromUrl(item.url)}</span>
                {#if item.description}
                  <span class="desc">{preview(item.description)}</span>
                {/if}
                {#if item.tags.length > 0}
                  <span class="tags">
                    {#each item.tags as tag (tag)}
                      <span class="tag-pill">#{tag}</span>
                    {/each}
                  </span>
                {/if}
                <span class="meta">Adicionado a {formatCreatedAt(item.createdAt)}</span>
              </span>
              <span class="arrow" aria-hidden="true">→</span>
            </a>
            <button
              type="button"
              class="delete-btn"
              onclick={() => confirmDelete(item.id)}
              aria-label={confirmingDelete === item.id ? 'Confirmar remoção' : 'Remover marcador'}
              data-confirming={confirmingDelete === item.id}
            >
              {confirmingDelete === item.id ? 'Confirmar?' : '🗑️'}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if bibliotecaApp}
    <footer class="page-footer" aria-hidden="true">
      <span style="--swatch: {bibliotecaApp.color}">{bibliotecaApp.icon}</span>
      <span>Sub-app #{bibliotecaApp.order} no hub</span>
    </footer>
  {/if}
</div>

<style>
  .biblioteca-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 2rem;
  }
  .hero {
    text-align: center;
    margin-bottom: 1.5rem;
  }
  .hero h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem 0;
    color: var(--txt, #fff);
  }
  .sub {
    color: var(--txt2, #cbd5e1);
    margin: 0;
    font-size: 1rem;
  }
  .crumbs {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.875rem;
    color: var(--txt3, #94a3b8);
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .crumbs a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .crumbs a:hover,
  .crumbs a:focus-visible {
    text-decoration: underline;
  }
  .actions {
    margin-bottom: 1rem;
    display: flex;
    justify-content: flex-end;
  }
  .btn-primary {
    display: inline-block;
    background: var(--accent, #ec4899);
    color: #fff;
    text-decoration: none;
    padding: 0.625rem 1.25rem;
    border-radius: 0.5rem;
    font-weight: 600;
    border: 0;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-primary:hover,
  .btn-primary:focus-visible {
    background: #d63384;
    outline: none;
  }
  .btn-primary:focus-visible {
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.4);
  }
  .filters {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1rem;
    margin-bottom: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .search-row {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .search {
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .search-label {
    font-size: 0.8125rem;
    color: var(--txt3, #94a3b8);
  }
  .search input {
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: 0.5rem;
    color: var(--txt, #fff);
    font-size: 1rem;
    font-family: inherit;
  }
  .search input:focus-visible {
    outline: none;
    border-color: var(--accent, #ec4899);
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.25);
  }
  .clear-btn {
    background: transparent;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    color: var(--txt2, #cbd5e1);
    padding: 0.5rem 0.875rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .clear-btn:hover,
  .clear-btn:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    color: var(--txt, #fff);
    outline: none;
  }
  .tag-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .chip {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    color: var(--txt2, #cbd5e1);
    font-size: 0.8125rem;
    padding: 0.25rem 0.625rem;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .chip:hover,
  .chip:focus-visible {
    background: rgba(255, 255, 255, 0.1);
    color: var(--txt, #fff);
    outline: none;
  }
  .chip.active {
    background: var(--accent, #ec4899);
    border-color: var(--accent, #ec4899);
    color: #fff;
    font-weight: 600;
  }
  .empty {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1.5rem;
    text-align: center;
    color: var(--txt2, #cbd5e1);
  }
  .empty.error {
    border-color: var(--error, #ef4444);
    color: var(--error, #ef4444);
  }
  .empty-msg {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    color: var(--txt, #fff);
  }
  .empty-hint {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    color: var(--txt3, #94a3b8);
  }
  .link-btn {
    background: none;
    border: 0;
    color: var(--accent, #ec4899);
    cursor: pointer;
    padding: 0;
    font: inherit;
    text-decoration: underline;
  }
  .link-btn:hover,
  .link-btn:focus-visible {
    color: #d63384;
    outline: none;
  }
  .cards {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .card {
    display: flex;
    align-items: stretch;
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-left: 4px solid var(--accent, #ec4899);
    border-radius: 0.75rem;
    overflow: hidden;
    transition: transform 0.15s, background 0.2s;
  }
  .card:hover {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
  }
  .card-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    color: var(--txt, #fff);
    text-decoration: none;
    min-width: 0;
  }
  .content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .title {
    font-size: 1.0625rem;
    font-weight: 600;
    color: var(--txt, #fff);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .url {
    font-size: 0.8125rem;
    color: var(--accent, #ec4899);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .desc {
    font-size: 0.875rem;
    color: var(--txt2, #cbd5e1);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.125rem;
  }
  .tag-pill {
    font-size: 0.75rem;
    background: rgba(236, 72, 153, 0.12);
    color: var(--accent, #ec4899);
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    border: 1px solid rgba(236, 72, 153, 0.25);
  }
  .meta {
    font-size: 0.75rem;
    color: var(--txt3, #94a3b8);
    margin-top: 0.125rem;
  }
  .arrow {
    color: var(--accent, #ec4899);
    font-size: 1.25rem;
    flex-shrink: 0;
    align-self: center;
  }
  .delete-btn {
    border: 0;
    background: transparent;
    color: var(--txt3, #94a3b8);
    font-size: 1.125rem;
    padding: 0 1rem;
    cursor: pointer;
    border-left: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    transition: background 0.15s, color 0.15s;
  }
  .delete-btn:hover,
  .delete-btn:focus-visible {
    background: rgba(239, 68, 68, 0.1);
    color: var(--error, #ef4444);
    outline: none;
  }
  .delete-btn[data-confirming='true'] {
    background: var(--error, #ef4444);
    color: #fff;
    font-weight: 600;
    font-size: 0.875rem;
  }
  .page-footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
    margin-top: 2rem;
    color: var(--txt3, #94a3b8);
    font-size: 0.8125rem;
  }
  .page-footer span:first-child {
    color: var(--swatch, #ec4899);
    font-size: 1.125rem;
  }
  @media (min-width: 640px) {
    .biblioteca-page {
      padding: 2rem 1.5rem 3rem;
    }
    .hero h1 {
      font-size: 2.5rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .card { transition: none; transform: none; }
    .delete-btn { transition: none; }
    .chip { transition: none; }
    .clear-btn { transition: none; }
  }
</style>