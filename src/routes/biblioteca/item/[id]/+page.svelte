<!--
  /biblioteca/item/[id]/+page.svelte — bookmark detail view.

  The route param `id` is the numeric Dexie PK.  Same rationale as
  the hábitos detail page:
    * Dexie's primary key is numeric (auto-increment).
    * Users don't need pretty URLs for an internal tool.
    * Keeps `addItem()`'s return value the single source of truth.

  Surface area:
    * Header  — title + back link
    * URL     — full URL with an "Abrir" button (target=_blank) so
                the user can jump straight to the source.
    * Tags    — clickable chips that navigate to the list filtered
                by that tag.
    * Notes   — full description (no length cap here — preview is
                only on the list page).
    * Actions — "Editar" (placeholder href to Phase 9) + "Apagar".

  Note: per the Phase 8 brief the detail page only needs Open/Edit/
  Delete buttons.  Real Edit is out-of-scope for this phase, so we
  expose it as a button that goes to /biblioteca/editar/<id>/ which
  will 404 until Phase 9 ships — but the link keeps the contract
  ready and the button visible to users who ask for it.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { getItem, deleteItem, type Item } from '$lib/biblioteca';
  import { showToast } from '$lib/components/events';

  // Parse `id` as a positive integer.  Anything else (missing,
  // non-numeric, ≤0) → redirect to the list.  Single guard against
  // /biblioteca/item/abc/ trying to query Dexie with a junk id.
  function parseId(raw: string | undefined): number | null {
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const itemId = $derived(parseId(page.params.id));
  let item = $state<Item | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let confirmingDelete = $state(false);
  let deleting = $state(false);

  async function reload(id: number): Promise<void> {
    loading = true;
    error = null;
    try {
      const row = await getItem(id);
      if (!row) {
        error = 'Marcador não encontrado.';
        return;
      }
      item = row;
    } catch (e) {
      console.error('[biblioteca] reload failed', e);
      error = e instanceof Error ? e.message : 'Erro a carregar marcador';
    } finally {
      loading = false;
    }
  }

  // Re-run whenever the URL id changes (e.g. user navigates between
  // two bookmarks without leaving the route).  untrack() prevents
  // the effect from re-running when `item` / `error` state updates,
  // which would cause an infinite loop.
  $effect(() => {
    const id = itemId;
    if (id === null) {
      // Bad URL → bounce back to the list.
      void goto('/biblioteca/');
      return;
    }
    untrack(() => {
      void reload(id);
    });
  });

  async function confirmDelete(): Promise<void> {
    if (!item) return;
    if (!confirmingDelete) {
      confirmingDelete = true;
      // Auto-cancel after 4s so the UI doesn't get stuck in confirm mode.
      setTimeout(() => {
        if (confirmingDelete) confirmingDelete = false;
      }, 4000);
      return;
    }
    deleting = true;
    try {
      await deleteItem(item.id);
      showToast('Marcador removido');
      await goto('/biblioteca/');
    } catch (e) {
      console.error('[biblioteca] delete failed', e);
      showToast('Erro a remover marcador');
      deleting = false;
      confirmingDelete = false;
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

  function goToTag(tag: string): void {
    // Pass the tag as a query string so the list page can hydrate
    // its filter from the URL on first render.
    void goto(`/biblioteca/?tag=${encodeURIComponent(tag)}`);
  }

  // SEO — used by <svelte:head> below.
  // The title grows with the actual bookmark title once it loads, so
  // we use a $derived so that the meta tags update reactively after
  // `item` resolves.  Falling back to a static literal keeps the
  // initial render SEO-safe.
  let pageTitle = $derived(
    item?.title ? `${item.title} · Marcador · Biblioteca` : 'Marcador · Biblioteca'
  );
  let description = $derived(
    item?.description?.slice(0, 160) || 'Detalhe do marcador'
  );
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={`https://presuntinho.netlify.app/biblioteca/item/${page.params.id ?? ''}/`} />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={description} />
</svelte:head>

<div class="detail">
  <nav class="crumbs" aria-label={$t('biblioteca.crumbs.aria', { default: 'Caminho de navegação' })}>
    <a href="/">{$t('biblioteca.item.breadcrumb.home', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <a href="/biblioteca/">{$t('biblioteca.item.breadcrumb.current', { default: 'Biblioteca' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{item?.title ?? '…'}</span>
  </nav>

  {#if loading}
    <p class="empty">A carregar…</p>
  {:else if error || !item}
    <p class="empty error" role="alert">
      ⚠️ {error ?? 'Marcador não encontrado.'}
    </p>
    <p class="back-row"><a href="/biblioteca/">← {$t('common.back')}</a></p>
  {:else}
    <header class="hero">
      <h1>{item.title}</h1>
      <p class="sub">Adicionado a {formatCreatedAt(item.createdAt)}</p>
    </header>

    <section class="url-block" aria-label="URL">
      <span class="label">URL</span>
      <div class="url-row">
        <a
          class="url-link"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {item.url}
        </a>
        <a
          class="open-btn"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {$t('biblioteca.item.action.open', { default: 'Abrir' })} ↗
        </a>
      </div>
    </section>

    {#if item.tags.length > 0}
      <section class="tags-block" aria-label="Tags">
        <span class="label">{$t('biblioteca.item.label.tags', { default: 'Tags' })}</span>
        <div class="tag-list">
          {#each item.tags as tag (tag)}
            <button
              type="button"
              class="tag-chip"
              onclick={() => goToTag(tag)}
              aria-label={`Filtrar por ${tag}`}
            >
              #{tag}
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if item.description}
      <section class="notes-block" aria-label="Notas">
        <span class="label">{$t('biblioteca.item.label.notes', { default: 'Notas' })}</span>
        <p class="notes">{item.description}</p>
      </section>
    {/if}

    <section class="actions" aria-label="Ações">
      <a
        class="btn-secondary"
        href={`/biblioteca/editar/${item.id}/`}
        aria-label="Editar marcador"
      >
        ✏️ Editar
      </a>
      <button
        type="button"
        class="delete-btn"
        onclick={confirmDelete}
        disabled={deleting}
        aria-label={confirmingDelete ? 'Confirmar remoção' : 'Apagar marcador'}
        data-confirming={confirmingDelete}
      >
        {confirmingDelete ? 'Confirmar apagar?' : deleting ? 'A apagar…' : '🗑️ ' + $t('common.delete')}
      </button>
    </section>
  {/if}
</div>

<style>
  .detail {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem 2rem;
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
  .back-row {
    text-align: center;
    margin-top: 1rem;
  }
  .back-row a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .hero {
    margin-bottom: 1.25rem;
    border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    padding-bottom: 1rem;
  }
  .hero h1 {
    font-size: 1.75rem;
    margin: 0 0 0.25rem 0;
    color: var(--txt, #fff);
    word-break: break-word;
  }
  .sub {
    color: var(--txt3, #94a3b8);
    margin: 0;
    font-size: 0.8125rem;
  }
  .label {
    display: block;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--txt3, #94a3b8);
    margin-bottom: 0.375rem;
    font-weight: 600;
  }
  .url-block,
  .tags-block,
  .notes-block {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .url-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .url-link {
    flex: 1;
    min-width: 0;
    color: var(--accent, #ec4899);
    text-decoration: none;
    word-break: break-all;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.875rem;
  }
  .url-link:hover,
  .url-link:focus-visible {
    text-decoration: underline;
    outline: none;
  }
  .open-btn {
    display: inline-block;
    background: var(--accent, #ec4899);
    color: #fff;
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
    transition: background 0.15s;
    white-space: nowrap;
  }
  .open-btn:hover,
  .open-btn:focus-visible {
    background: #d63384;
    outline: none;
  }
  .open-btn:focus-visible {
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.4);
  }
  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .tag-chip {
    background: rgba(236, 72, 153, 0.12);
    color: var(--accent, #ec4899);
    border: 1px solid rgba(236, 72, 153, 0.25);
    font-size: 0.8125rem;
    padding: 0.25rem 0.625rem;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    font-family: inherit;
  }
  .tag-chip:hover,
  .tag-chip:focus-visible {
    background: var(--accent, #ec4899);
    color: #fff;
    border-color: var(--accent, #ec4899);
    outline: none;
  }
  .notes {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.6;
    color: var(--txt2, #cbd5e1);
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: flex-end;
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border, rgba(255, 255, 255, 0.1));
  }
  .btn-secondary {
    display: inline-block;
    background: transparent;
    color: var(--txt2, #cbd5e1);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-weight: 600;
    text-decoration: none;
    font-size: 0.875rem;
    transition: background 0.15s, color 0.15s;
  }
  .btn-secondary:hover,
  .btn-secondary:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    color: var(--txt, #fff);
    outline: none;
  }
  .delete-btn {
    background: transparent;
    color: var(--txt3, #94a3b8);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    font-family: inherit;
  }
  .delete-btn:hover:not(:disabled),
  .delete-btn:focus-visible:not(:disabled) {
    background: rgba(239, 68, 68, 0.1);
    color: var(--error, #ef4444);
    border-color: var(--error, #ef4444);
    outline: none;
  }
  .delete-btn[data-confirming='true'] {
    background: var(--error, #ef4444);
    color: #fff;
    border-color: var(--error, #ef4444);
  }
  .delete-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  @media (min-width: 640px) {
    .detail {
      padding: 2rem 1.5rem 3rem;
    }
    .hero h1 {
      font-size: 2rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .open-btn,
    .btn-secondary,
    .delete-btn,
    .tag-chip { transition: none; }
  }
</style>