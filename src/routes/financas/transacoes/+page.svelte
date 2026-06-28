<!--
  /financas/transacoes — listagem completa de transações.

  Filtros:
    * Seletor de mês (YYYY-MM) — default = mês corrente.
    * Dropdown de categoria — filtra as transações visíveis.
    * Chips para limpar / mostrar tudo.

  Cada transação é renderizada com ícone da categoria + descrição +
  valor (verde para receita, vermelho para despesa) + botão apagar.

  As transações aparecem agrupadas por data (dia).  Quando o filtro
  de categoria está ativo, o cabeçalho do grupo só aparece se houver
  pelo menos uma transação nesse dia.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { t as ti } from 'svelte-i18n';
  import {
    listCategorias,
    listTransacoesMes,
    deleteTransacao,
    getMesAtual,
    formatMes,
    formatData,
    formatValor,
    getHojeISO,
    type Transacao,
    type CategoriaRow
  } from '$lib/financas';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { showToast } from '$lib/components/events';

  // Localised strings used inside the {#each} loop. We can't use $t
  // inside a Svelte @const block (it's a store subscription, not a
  // function call), so we resolve these once via the `ti()` helper at
  // the top level of the component.
  const ARIA_RECEITA = ti('transacoes.tipo.receita', { default: 'Receita' });
  const ARIA_DESPESA = ti('transacoes.tipo.despesa', { default: 'Despesa' });
  const ARIA_DELETE = ti('transacoes.delete.aria', { default: 'Remover transação' });
  const ARIA_CONFIRM = ti('transacoes.delete.confirm', { default: 'Confirmar remoção' });
  const CONFIRM_SHORT = ti('transacoes.delete.confirm_short', { default: 'Confirmar?' });
  const TOAST_REMOVED = ti('transacoes.toast.removed', { default: 'Transação removida' });
  const TOAST_DELETE_FAILED = ti('transacoes.toast.delete_failed', { default: 'Erro a remover transação' });
  const SALDO_LABEL = ti('transacoes.saldo', { default: 'Saldo' });

  let transacoes = $state<Transacao[]>([]);
  let categorias = $state<CategoriaRow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let mesFiltro = $state(getMesAtual());
  let categoriaFiltro = $state<string>('');   // '' = todas
  let confirmingDelete = $state<number | null>(null);

  // Mapa id → CategoriaRow para lookup O(1) por linha.
  let categoriasPorId: Record<string, CategoriaRow> = $derived(
    Object.fromEntries(categorias.map((c) => [c.id, c]))
  );

  // Agrupa transações por data (YYYY-MM-DD) e mantém a ordem
  // newest-first dentro de cada grupo.
  type Grupo = { data: string; items: Transacao[] };
  let grupos = $derived.by<Grupo[]>(() => {
    const map = new Map<string, Transacao[]>();
    for (const t of transacoes) {
      if (categoriaFiltro && t.categoria !== categoriaFiltro) continue;
      const arr = map.get(t.data);
      if (arr) arr.push(t);
      else map.set(t.data, [t]);
    }
    // sortBy(data) já vem desc; as chaves do Map preservam ordem de inserção.
    return Array.from(map.entries()).map(([data, items]) => ({ data, items }));
  });

  onMount(() => {
    void (async () => {
      try {
        categorias = await listCategorias();
      } catch (e) {
        console.error('[financas] listCategorias failed', e);
        error = e instanceof Error ? e.message : 'Erro a carregar categorias';
      }
      await refresh();
    })();
  });

  // Re-fetch sempre que o filtro de mês muda.
  $effect(() => {
    const _ = mesFiltro;
    void refresh();
  });

  async function refresh(): Promise<void> {
    loading = true;
    error = null;
    try {
      transacoes = await listTransacoesMes(mesFiltro);
    } catch (e) {
      console.error('[financas] listTransacoesMes failed', e);
      error = e instanceof Error ? e.message : 'Erro a carregar transações';
    } finally {
      loading = false;
    }
  }

  async function confirmDelete(id: number): Promise<void> {
    if (confirmingDelete !== id) {
      confirmingDelete = id;
      setTimeout(() => {
        if (confirmingDelete === id) confirmingDelete = null;
      }, 4000);
      return;
    }
    confirmingDelete = null;
    try {
      await deleteTransacao(id);
      await refresh();
      showToast(TOAST_REMOVED);
    } catch (e) {
      console.error('[financas] delete failed', e);
      showToast(TOAST_DELETE_FAILED);
    }
  }

  function clearFilters(): void {
    mesFiltro = getMesAtual();
    categoriaFiltro = '';
  }

  function cat(categoriaId: string): CategoriaRow | undefined {
    return categoriasPorId[categoriaId];
  }

  // Total do mês (somando só as visíveis pelo filtro de categoria)
  let totalVisivel = $derived(
    transacoes
      .filter((t) => !categoriaFiltro || t.categoria === categoriaFiltro)
      .reduce(
        (acc, t) => {
          if (t.tipo === 'receita') acc.receitas += t.valor;
          else acc.despesas += t.valor;
          return acc;
        },
        { receitas: 0, despesas: 0 }
      )
  );

  // Helper não-reactivo usado no template (não é estado).
  const _todayHint = getHojeISO;

  // SEO — used by <svelte:head> below.  Static literal because this
  // route has many rows but a single, stable identity for crawlers.
  let pageTitle = $derived('Transações · Finanças');
  let description = $derived('Todas as transações');
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content="https://presuntinho.netlify.app/financas/transacoes/" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={description} />
</svelte:head>

<div class="transacoes-page">
  <header class="hero">
    <h1>📋 Transações</h1>
    <p class="sub">Histórico de receitas e despesas.</p>
  </header>

  <nav class="crumbs" aria-label="Caminho de navegação">
    <a href="/">← Hub</a>
    <span aria-hidden="true">/</span>
    <a href="/financas/">Finanças</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">Transações</span>
  </nav>

  <section class="actions" aria-label="Ações">
    <a class="btn-primary" href="/financas/nova/">+ Nova transação</a>
  </section>

  <section class="filters" aria-label="Filtros">
    <div class="filters-row">
      <label class="field">
        <span class="field-label">Mês</span>
        <input
          type="month"
          bind:value={mesFiltro}
          aria-label="Filtrar por mês"
        />
      </label>
      <label class="field">
        <span class="field-label">Categoria</span>
        <select bind:value={categoriaFiltro} aria-label="Filtrar por categoria">
          <option value="">Todas</option>
          {#each categorias as c (c.id)}
            <option value={c.id}>{c.icone} {c.nome}</option>
          {/each}
        </select>
      </label>
      {#if categoriaFiltro || mesFiltro !== getMesAtual()}
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

    <div class="totals">
      <span class="total-pill receitas">
        + {formatValor(totalVisivel.receitas)}
      </span>
      <span class="total-pill despesas">
        − {formatValor(totalVisivel.despesas)}
      </span>
      <span class="total-pill saldo" class:negativo={totalVisivel.receitas - totalVisivel.despesas < 0}>
        {SALDO_LABEL}: {formatValor(totalVisivel.receitas - totalVisivel.despesas)}
      </span>
    </div>
  </section>

  <section class="list" aria-label="Lista de transações">
    {#if loading}
      <Skeleton variant="list" lines={5} label={$t('common.loading')} />
    {:else if error}
      <p class="empty error" role="alert">⚠️ {error}</p>
    {:else if grupos.length === 0}
        {#if categoriaFiltro}
          <EmptyState
            emoji="🔎"
            title={$t('empty.financas.filter.title')}
            description={$t('empty.financas.filter.desc')}
            ctaLabel={$t('actions.cta.showAll')}
            onCta={clearFilters}
          />
        {:else}
          <EmptyState
            emoji="💸"
            title={$t('empty.financas.empty.title')}
            description={$t('empty.financas.empty.desc')}
            ctaLabel={$t('actions.cta.addTransaction')}
            ctaHref="/financas/nova/"
          />
        {/if}
    {:else}
      {#each grupos as grupo (grupo.data)}
        <div class="day-group">
          <h3 class="day-header">{formatData(grupo.data)}</h3>
          <ul class="rows">
            {#each grupo.items as tx (tx.id)}
              {@const c = cat(tx.categoria)}
              {@const isReceita = tx.tipo === 'receita'}
              <li class="row" class:receita={isReceita} class:despesa={!isReceita}>
                <span
                  class="cat-icon"
                  style={c ? `--cat-cor: ${c.cor}` : '--cat-cor: #94a3b8'}
                  aria-hidden="true"
                >
                  {c?.icone ?? '📦'}
                </span>
                <span class="row-main">
                  <span class="row-desc">{tx.descricao || (c?.nome ?? 'Sem descrição')}</span>
                  <span class="row-meta">
                    {c?.nome ?? tx.categoria} · {isReceita ? ARIA_RECEITA : ARIA_DESPESA}
                  </span>
                </span>
                <span class="row-valor" aria-label={isReceita ? ARIA_RECEITA : ARIA_DESPESA}>
                  {isReceita ? '+' : '−'}{formatValor(tx.valor)}
                </span>
                <button
                  type="button"
                  class="delete-btn"
                  onclick={() => confirmDelete(tx.id)}
                  aria-label={confirmingDelete === tx.id ? ARIA_CONFIRM : ARIA_DELETE}
                  data-confirming={confirmingDelete === tx.id}
                >
                  {confirmingDelete === tx.id ? CONFIRM_SHORT : '🗑️'}
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    {/if}
  </section>
</div>

<style>
  .transacoes-page {
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
    color: var(--success, #10b981);
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
    background: var(--success, #10b981);
    color: #fff;
    text-decoration: none;
    padding: 0.625rem 1.25rem;
    border-radius: 0.5rem;
    font-weight: 600;
    border: 0;
    cursor: pointer;
    transition: background 0.15s;
    font-family: inherit;
    font-size: 1rem;
  }
  .btn-primary:hover,
  .btn-primary:focus-visible {
    background: #0e9b6e;
    outline: none;
  }
  .btn-primary:focus-visible {
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.4);
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
  .filters-row {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 140px;
  }
  .field-label {
    font-size: 0.8125rem;
    color: var(--txt3, #94a3b8);
  }
  .field input,
  .field select {
    width: 100%;
    padding: 0.5rem 0.625rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: 0.5rem;
    color: var(--txt, #fff);
    font-size: 0.9375rem;
    font-family: inherit;
  }
  .field input[type='month'] {
    color-scheme: dark;
  }
  .field input:focus-visible,
  .field select:focus-visible {
    outline: none;
    border-color: var(--success, #10b981);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.25);
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
    font-family: inherit;
  }
  .clear-btn:hover,
  .clear-btn:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    color: var(--txt, #fff);
    outline: none;
  }
  .totals {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .total-pill {
    font-size: 0.8125rem;
    padding: 0.25rem 0.625rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    font-variant-numeric: tabular-nums;
  }
  .total-pill.receitas {
    color: var(--success, #10b981);
    border-color: rgba(16, 185, 129, 0.4);
  }
  .total-pill.despesas {
    color: var(--error, #ef4444);
    border-color: rgba(239, 68, 68, 0.4);
  }
  .total-pill.saldo {
    color: var(--txt, #fff);
    font-weight: 600;
  }
  .total-pill.saldo.negativo {
    color: var(--warning, #f59e0b);
    border-color: rgba(245, 158, 11, 0.4);
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
  .day-group {
    margin-bottom: 1.25rem;
  }
  .day-header {
    font-size: 0.8125rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3, #94a3b8);
    font-weight: 600;
    margin: 0 0 0.5rem 0.25rem;
  }
  .rows {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.75rem 0.875rem;
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-left: 4px solid var(--cat-cor, #94a3b8);
    border-radius: 0.625rem;
    transition: background 0.15s;
  }
  .row:hover {
    background: rgba(255, 255, 255, 0.07);
  }
  .row.receita {
    border-left-color: var(--success, #10b981);
  }
  .cat-icon {
    font-size: 1.5rem;
    line-height: 1;
    flex-shrink: 0;
    width: 2.25rem;
    height: 2.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--cat-cor, #94a3b8) 18%, transparent);
  }
  .row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .row-desc {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--txt, #fff);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-meta {
    font-size: 0.75rem;
    color: var(--txt3, #94a3b8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-valor {
    flex-shrink: 0;
    font-size: 0.9375rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .row.receita .row-valor {
    color: var(--success, #10b981);
  }
  .row.despesa .row-valor {
    color: var(--error, #ef4444);
  }
  .delete-btn {
    border: 0;
    background: transparent;
    color: var(--txt3, #94a3b8);
    font-size: 1rem;
    padding: 0.375rem 0.625rem;
    cursor: pointer;
    border-radius: 0.375rem;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
    font-family: inherit;
  }
  .delete-btn:hover,
  .delete-btn:focus-visible {
    background: rgba(239, 68, 68, 0.12);
    color: var(--error, #ef4444);
    outline: none;
  }
  .delete-btn[data-confirming='true'] {
    background: var(--error, #ef4444);
    color: #fff;
    font-weight: 600;
    font-size: 0.8125rem;
  }
  @media (min-width: 640px) {
    .transacoes-page {
      padding: 2rem 1.5rem 3rem;
    }
    .hero h1 {
      font-size: 2.25rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .row { transition: none; }
    .delete-btn { transition: none; }
  }
</style>
