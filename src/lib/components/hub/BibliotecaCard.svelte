<script lang="ts">
  /**
   * Hub card — Biblioteca (bookmarks).
   *
   * Surfaces the 3 most-recent bookmarks from the Dexie `biblioteca`
   * table. Empty-state when there are no bookmarks at all (do not
   * fake data — task spec calls for honest empty UX).
   *
   * Reads via `listItems()` from `$lib/biblioteca` which already
   * returns rows newest-first by `createdAt`.
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { listItems, type Item } from '$lib/biblioteca';

  interface Props {
    href?: string;
  }
  let { href = '/biblioteca' }: Props = $props();

  let items = $state<Item[]>([]);
  let loaded = $state(false);

  async function refresh(): Promise<void> {
    try {
      const rows = await listItems();
      items = rows.slice(0, 3);
    } catch (e) {
      console.error('[BibliotecaCard] listItems failed', e);
      items = [];
    } finally {
      loaded = true;
    }
  }

  onMount(() => {
    void refresh();
  });
</script>

<a
  class="card"
  {href}
  aria-label={$t('routes.hub.card.biblioteca.aria', { default: 'Biblioteca — bookmarks recentes' })}
>
  <header class="head">
    <span class="icon" aria-hidden="true">📚</span>
    <span class="title">{$t('routes.hub.card.biblioteca.title', { default: 'Biblioteca' })}</span>
  </header>

  {#if !loaded}
    <p class="loading">{$t('common.loading', { default: 'A carregar…' })}</p>
  {:else if items.length === 0}
    <p class="empty">
      {$t('routes.hub.card.biblioteca.empty', { default: 'Ainda não tens bookmarks — começa a guardar leituras.' })}
    </p>
  {:else}
    <ul class="list">
      {#each items as it (it.id)}
        <li class="row">
          <span class="row-title">{it.title}</span>
          {#if it.tags && it.tags.length > 0}
            <span class="row-tag">{it.tags[0]}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <span class="cta">{$t('routes.hub.card.biblioteca.cta', { default: 'Abrir biblioteca' })} →</span>
</a>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 88px;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    color: #fff;
    text-decoration: none;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .card:hover,
  .card:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.18);
    outline: none;
  }
  .card:focus-visible {
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.45);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .icon {
    font-size: 1.25rem;
  }
  .title {
    font-weight: 600;
    font-size: 1rem;
  }
  .loading,
  .empty {
    color: #94a3b8;
    font-size: 0.875rem;
    margin: 0;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-height: 44px;
    padding: 0.25rem 0;
  }
  .row-title {
    font-size: 0.875rem;
    color: #e2e8f0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 70%;
  }
  .row-tag {
    font-size: 0.7rem;
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 999px;
    padding: 0.15rem 0.55rem;
  }
  .cta {
    font-size: 0.8rem;
    color: #93c5fd;
    margin-top: auto;
  }
</style>