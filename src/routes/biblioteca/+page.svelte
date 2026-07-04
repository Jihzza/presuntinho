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
  import { locale, t } from 'svelte-i18n';
  import {
    listItems,
    listTags,
    deleteItem,
    type Item
  } from '$lib/biblioteca';
  import { subApps } from '$lib/registry';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { showToast } from '$lib/components/events';
  import { PageHeader, Button } from '$lib/components/ui';

  let items = $state<Item[]>([]);
  let allTags = $state<string[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let query = $state('');
  let activeTag = $state<string | null>(null);
  let confirmingDelete = $state<number | null>(null);
  const dateLocale = $derived($locale || 'pt-PT');

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
      showToast($t('biblioteca.toast.removed', { default: 'Marcador removido' }));
    } catch (e) {
      console.error('[biblioteca] delete failed', e);
      showToast($t('biblioteca.toast.delete_failed', { default: 'Erro a remover marcador' }));
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
    return new Date(ts).toLocaleDateString(dateLocale, {
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
  <title>{$t('routes.biblioteca.title', { default: 'Biblioteca · Bookmarks' })} · Presuntinho</title>
  <meta name="description" content={$t('routes.biblioteca.meta.description', { default: 'Bookmarks, links e referências' })} />
  <meta property="og:title" content={$t('routes.biblioteca.meta.og_title', { default: 'Biblioteca · Bookmarks' })} />
  <meta property="og:description" content={$t('routes.biblioteca.meta.og_description', { default: 'Bookmarks, links e referências' })} />
  <meta property="og:url" content="https://presuntinho.netlify.app/biblioteca/" />
  <meta name="twitter:title" content={$t('routes.biblioteca.meta.twitter_title', { default: 'Biblioteca · Bookmarks' })} />
  <meta name="twitter:description" content={$t('routes.biblioteca.meta.twitter_description', { default: 'Bookmarks, links e referências' })} />
</svelte:head>

<div class="biblioteca-page">
  <PageHeader
    title={$t('biblioteca.hero.title', { default: '📚 Biblioteca' })}
    subtitle={$t('biblioteca.hero.sub', { default: 'Bookmarks, links e referências com tags.' })}
    align="center"
  >
    {#snippet breadcrumbs()}
      <a href="/">{$t('biblioteca.crumbs.home', { default: '← Hub' })}</a>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{$t('biblioteca.crumbs.current', { default: 'Biblioteca' })}</span>
    {/snippet}
  </PageHeader>

  <section class="actions" aria-label={$t('biblioteca.actions.aria', { default: 'Ações' })}>
    <Button href="/biblioteca/novo/">{$t('biblioteca.new', { default: '+ Novo marcador' })}</Button>
  </section>

  <section class="filters" aria-label={$t('biblioteca.filters.aria', { default: 'Filtros' })}>
    <div class="search-row">
      <label class="search">
        <span class="search-label">{$t('common.search')}</span>
        <input
          type="search"
          bind:value={query}
          placeholder={$t('biblioteca.search.placeholder', { default: 'Ex.: Python decorators' })}
          autocomplete="off"
          aria-label={$t('biblioteca.search.aria', { default: 'Pesquisar marcadores por título' })}
        />
      </label>
      {#if query || activeTag}
        <button
          type="button"
          class="clear-btn"
          onclick={clearFilters}
          aria-label={$t('biblioteca.clear.aria', { default: 'Limpar filtros' })}
        >
          {$t('common.filter')}: {$t('biblioteca.clear', { default: 'limpar' })}
        </button>
      {/if}
    </div>

    {#if allTags.length > 0}
      <div class="tag-chips" role="group" aria-label={$t('biblioteca.tags.aria', { default: 'Filtrar por tag' })}>
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

  <section class="list" aria-label="{$t('a11y.aria.lista_de_marcadores', { default: 'Lista de marcadores' })}">
    {#if loading}
      <Skeleton variant="list" lines={4} label={$t('common.loading')} />
    {:else if error}
      <p class="empty error" role="alert">⚠️ {error}</p>
    {:else if items.length === 0}
        {#if query || activeTag}
          <EmptyState
            emoji="🔎"
            title={$t('empty.biblioteca.filter.title')}
            description={$t('empty.biblioteca.filter.desc')}
            ctaLabel={$t('actions.cta.showAll')}
            onCta={clearFilters}
          />
        {:else}
          <EmptyState
            emoji="🔖"
            title={$t('empty.biblioteca.empty.title')}
            description={$t('empty.biblioteca.empty.desc')}
            ctaLabel={$t('actions.cta.addBookmark')}
            ctaHref="/biblioteca/novo/"
          />
        {/if}
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
                <span class="meta">{$t('biblioteca.added', { default: 'Adicionado a' })} {formatCreatedAt(item.createdAt)}</span>
              </span>
              <span class="arrow" aria-hidden="true">→</span>
            </a>
            <button
              type="button"
              class="delete-btn"
              onclick={() => confirmDelete(item.id)}
              aria-label={confirmingDelete === item.id ? $t('biblioteca.delete.confirm', { default: 'Confirmar remoção' }) : $t('biblioteca.delete.aria', { default: 'Remover marcador' })}
              data-confirming={confirmingDelete === item.id}
            >
              {confirmingDelete === item.id ? $t('biblioteca.delete.confirm_short', { default: 'Confirmar?' }) : '🗑️'}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if bibliotecaApp}
    <footer class="page-footer" aria-hidden="true">
      <span style="--swatch: {bibliotecaApp.color}">{bibliotecaApp.icon}</span>
      <span>{$t('biblioteca.footer.position', { default: 'Hub · Biblioteca' })}</span>
    </footer>
  {/if}
</div>

<style>
  .biblioteca-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 2rem;
  }
  /* Hero + breadcrumbs now come from the shared PageHeader primitive;
     the primary action uses the shared Button primitive. */
  .actions {
    margin-bottom: 1rem;
    display: flex;
    justify-content: flex-end;
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
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #ec4899) 25%, transparent);
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
    background: var(--card-hover, rgba(255, 255, 255, 0.08));
    color: var(--txt, #fff);
    outline: none;
  }
  .clear-btn:focus-visible {
    box-shadow: var(--focus-ring);
  }
  .tag-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .chip {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    color: var(--txt2, #cbd5e1);
    font-size: 0.8125rem;
    padding: 0.25rem 0.625rem;
    border-radius: 999px;
    cursor: pointer;
    transition: background var(--motion-fast, 120ms), color var(--motion-fast, 120ms), border-color var(--motion-fast, 120ms);
  }
  .chip:hover,
  .chip:focus-visible {
    background: var(--card-hover, rgba(255, 255, 255, 0.1));
    color: var(--txt, #fff);
    outline: none;
  }
  .chip:focus-visible {
    box-shadow: var(--focus-ring);
  }
  .chip.active {
    background: var(--accent, #ec4899);
    border-color: var(--accent, #ec4899);
    color: var(--on-accent, #fff);
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
    background: var(--card-hover, rgba(255, 255, 255, 0.08));
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
    background: color-mix(in srgb, var(--accent, #ec4899) 12%, transparent);
    color: var(--accent, #ec4899);
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--accent, #ec4899) 25%, transparent);
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
    background: color-mix(in srgb, var(--error, #ef4444) 10%, transparent);
    color: var(--error, #ef4444);
    outline: none;
  }
  .delete-btn:focus-visible {
    box-shadow: var(--focus-ring);
  }
  .delete-btn[data-confirming='true'] {
    background: var(--error, #ef4444);
    color: var(--on-accent, #fff);
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
    color: var(--swatch, var(--accent));
    font-size: 1.125rem;
  }
  @media (min-width: 640px) {
    .biblioteca-page {
      padding: 2rem 1.5rem 3rem;
    }
  }
  /* Reduced motion: handled by the global kill-switch in app.css. */
</style>