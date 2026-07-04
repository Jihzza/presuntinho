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
  import { locale, t } from 'svelte-i18n';
  import { page } from '$app/stores';
  import {
    listCategorias,
    listTransacoesMes,
    listTransacoesRange,
    deleteTransacao,
    getMesAtual,
    formatData,
    formatValor,
    getHojeISO,
    type Transacao,
    type CategoriaRow
  } from '$lib/financas';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { showToast } from '$lib/components/events';
  import { useMoodState } from '$lib/mood/useMoodState.svelte';

  // Localised strings used inside loops/actions. Keep them reactive so a
  // language switch while this page is open updates labels/toasts too.
  const STRINGS = $derived({
    ariaReceita: $t('transacoes.tipo.receita', { default: 'Receita' }),
    ariaDespesa: $t('transacoes.tipo.despesa', { default: 'Despesa' }),
    ariaDelete: $t('transacoes.delete.aria', { default: 'Remover transação' }),
    ariaConfirm: $t('transacoes.delete.confirm', { default: 'Confirmar remoção' }),
    confirmShort: $t('transacoes.delete.confirm_short', { default: 'Confirmar?' }),
    toastRemoved: $t('transacoes.toast.removed', { default: 'Transação removida' }),
    toastDeleteFailed: $t('transacoes.toast.delete_failed', { default: 'Erro a remover transação' }),
    saldoLabel: $t('transacoes.saldo', { default: 'Saldo' })
  });

  let transacoes = $state<Transacao[]>([]);
  let categorias = $state<CategoriaRow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  // M1-S2: extended filter set. URL params act as single source of truth
  // so users can bookmark filtered views.
  let mesFiltro = $state(getMesAtual());
  let categoriaFiltro = $state<string>('');   // '' = todas
  let tipoFiltro = $state<'todas' | 'receita' | 'despesa'>('todas'); // M1-S2
  let pesquisa = $state<string>('');                                  // M1-S2: substring em descricao
  let dataDe = $state<string>('');                                    // M1-S2: YYYY-MM-DD
  let dataAte = $state<string>('');                                   // M1-S2: YYYY-MM-DD
  let confirmingDelete = $state<number | null>(null);
  const localeCode = $derived($locale || 'pt-PT');

  // V8 (mood): em modo Sick/Soft a lista fica só de leitura — sem apagar
  // nem criar. A razão é mostrada num aviso carinhoso, nunca um mistério.
  const moodState = useMoodState();
  const readOnly = $derived(moodState.isSick || moodState.isSoft);

  // Mapa id → CategoriaRow para lookup O(1) por linha.
  let categoriasPorId: Record<string, CategoriaRow> = $derived(
    Object.fromEntries(categorias.map((c) => [c.id, c]))
  );

  // Agrupa transações por data (YYYY-MM-DD) e mantém a ordem
  // newest-first dentro de cada grupo. Aplica TODOS os filtros
  // (categoria + tipo + pesquisa + intervalo datas).
  type Grupo = { data: string; items: Transacao[] };
  let grupos = $derived.by<Grupo[]>(() => {
    const map = new Map<string, Transacao[]>();
    const needle = pesquisa.trim().toLowerCase();
    for (const t of transacoes) {
      if (categoriaFiltro && t.categoria !== categoriaFiltro) continue;
      if (tipoFiltro !== 'todas' && t.tipo !== tipoFiltro) continue;
      if (dataDe && t.data < dataDe) continue;
      if (dataAte && t.data > dataAte) continue;
      if (needle && !(t.descricao ?? '').toLowerCase().includes(needle)) continue;
      const arr = map.get(t.data);
      if (arr) arr.push(t);
      else map.set(t.data, [t]);
    }
    // sortBy(data) já vem desc; as chaves do Map preservam ordem de inserção.
    return Array.from(map.entries()).map(([data, items]) => ({ data, items }));
  });

  // M1-S2: hydrate filters from URL params (single source of truth).
  // Updates the URL when filters change so views are bookmarkable.
  onMount(() => {
    const sp = $page.url.searchParams;
    const m = sp.get('mes');
    if (m && /^\d{4}-\d{2}$/.test(m)) mesFiltro = m;
    const cat = sp.get('cat');
    if (cat) categoriaFiltro = cat;
    const tipo = sp.get('tipo');
    if (tipo === 'receita' || tipo === 'despesa') tipoFiltro = tipo;
    const q = sp.get('q');
    if (q) pesquisa = q;
    const de = sp.get('de');
    if (de && /^\d{4}-\d{2}-\d{2}$/.test(de)) dataDe = de;
    const ate = sp.get('ate');
    if (ate && /^\d{4}-\d{2}-\d{2}$/.test(ate)) dataAte = ate;

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

  // Re-fetch sempre que o filtro de mês OU o intervalo de datas muda —
  // com intervalo activo a fonte passa a ser o índice `data` (cross-month),
  // não a lista do mês.
  $effect(() => {
    const _ = mesFiltro;
    const __ = dataDe;
    const ___ = dataAte;
    void refresh();
  });

  // M1-S2: sync filters → URL params (preserva bookmarkable state).
  $effect(() => {
    const sp = new URLSearchParams();
    if (mesFiltro !== getMesAtual()) sp.set('mes', mesFiltro);
    if (categoriaFiltro) sp.set('cat', categoriaFiltro);
    if (tipoFiltro !== 'todas') sp.set('tipo', tipoFiltro);
    if (pesquisa.trim()) sp.set('q', pesquisa.trim());
    if (dataDe) sp.set('de', dataDe);
    if (dataAte) sp.set('ate', dataAte);
    const qs = sp.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    if (typeof window !== 'undefined' && window.location.search !== (qs ? `?${qs}` : '')) {
      // Use replaceState so back-button isn't polluted with filter churn
      window.history.replaceState(null, '', url);
    }
  });

  async function refresh(): Promise<void> {
    loading = true;
    error = null;
    try {
      // V8: intervalo de datas activo → range query no índice `data`
      // (funciona entre meses); sem intervalo → lista do mês como antes.
      transacoes =
        dataDe || dataAte
          ? await listTransacoesRange(dataDe, dataAte)
          : await listTransacoesMes(mesFiltro);
    } catch (e) {
      console.error('[financas] listTransacoesMes failed', e);
      error = e instanceof Error ? e.message : 'Erro a carregar transações';
    } finally {
      loading = false;
    }
  }

  async function confirmDelete(id: number): Promise<void> {
    if (readOnly) return;
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
      showToast(STRINGS.toastRemoved);
    } catch (e) {
      console.error('[financas] delete failed', e);
      showToast(STRINGS.toastDeleteFailed);
    }
  }

  function clearFilters(): void {
    mesFiltro = getMesAtual();
    categoriaFiltro = '';
    tipoFiltro = 'todas';
    pesquisa = '';
    dataDe = '';
    dataAte = '';
  }

  // M1-S2: derived flag for "any filter active" — drives visibility of the
  // "Limpar filtros" button and the EmptyState hint.
  let temFiltroAtivo = $derived(
    categoriaFiltro !== '' ||
    tipoFiltro !== 'todas' ||
    pesquisa.trim() !== '' ||
    dataDe !== '' ||
    dataAte !== '' ||
    mesFiltro !== getMesAtual()
  );

  function cat(categoriaId: string): CategoriaRow | undefined {
    return categoriasPorId[categoriaId];
  }

  // Total do mês (somando só as visíveis pelos filtros activos)
  let totalVisivel = $derived(
    transacoes
      .filter((t) => !categoriaFiltro || t.categoria === categoriaFiltro)
      .filter((t) => tipoFiltro === 'todas' || t.tipo === tipoFiltro)
      .filter((t) => !dataDe || t.data >= dataDe)
      .filter((t) => !dataAte || t.data <= dataAte)
      .filter((t) => {
        const n = pesquisa.trim().toLowerCase();
        return !n || (t.descricao ?? '').toLowerCase().includes(n);
      })
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
    <h1>{$t('financas.transacoes.hero.title', { default: '📋 Transações' })}</h1>
    <p class="sub">{$t('transacoes.sub', { default: 'Histórico de receitas e despesas.' })}</p>
  </header>

  <nav class="crumbs" aria-label="{$t('a11y.aria.caminho_de_navegacao', { default: 'Caminho de navegação' })}">
    <a href="/">{$t('financas.crumbs.hub', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <a href="/financas/">{$t('financas.transacoes.breadcrumb.home', { default: '← Finanças' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('financas.transacoes.breadcrumb.current', { default: 'Transações' })}</span>
  </nav>

  {#if readOnly}
    <p class="mood-readonly" role="note">
      <span aria-hidden="true">🌿</span>
      {$t('financas.mood.readonly', { default: 'Modo cuidado ativo — hoje é só para ver. As alterações ficam para quando estiveres melhor 🤍' })}
    </p>
  {/if}

  <section class="actions" aria-label="{$t('a11y.aria.acoes', { default: 'Ações' })}">
    {#if !readOnly}
      <a class="btn-primary" href="/financas/nova/">{$t('financas.transacoes.cta.new', { default: '+ Nova transação' })}</a>
    {/if}
    <a class="btn-secondary" href="/financas/relatorios/">
      <span aria-hidden="true">⬇</span>
      <span>{$t('financas.relatorios.export.csv', { default: 'Exportar CSV' })}</span>
    </a>
  </section>

  <section class="filters" aria-label="{$t('a11y.aria.filtros', { default: 'Filtros' })}">
    <div class="filters-row">
      <label class="field">
        <span class="field-label">{$t('financas.transacoes.filtros.mes', { default: 'Mês' })}</span>
        <input
          type="month"
          bind:value={mesFiltro}
          aria-label="{$t('a11y.aria.filtrar_por_mes', { default: 'Filtrar por mês' })}"
        />
      </label>
      <label class="field">
        <span class="field-label">{$t('financas.transacoes.filtros.categoria', { default: 'Categoria' })}</span>
        <select bind:value={categoriaFiltro} aria-label="{$t('a11y.aria.filtrar_por_categoria', { default: 'Filtrar por categoria' })}">
          <option value="">{$t('financas.transacoes.filter.all', { default: 'Todas' })}</option>
          {#each categorias as c (c.id)}
            <option value={c.id}>{c.icone} {c.nome}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span class="field-label">{$t('financas.transacoes.filtros.tipo', { default: 'Tipo' })}</span>
        <select bind:value={tipoFiltro} aria-label="{$t('a11y.aria.filtrar_por_tipo', { default: 'Filtrar por tipo' })}">
          <option value="todas">{$t('financas.transacoes.filtros.tipo.todas', { default: 'Todas' })}</option>
          <option value="receita">{$t('financas.transacoes.filtros.tipo.receitas', { default: 'Receitas' })}</option>
          <option value="despesa">{$t('financas.transacoes.filtros.tipo.despesas', { default: 'Despesas' })}</option>
        </select>
      </label>
      <label class="field grow">
        <span class="field-label">{$t('financas.transacoes.filtros.pesquisar', { default: 'Pesquisar' })}</span>
        <input
          type="search"
          bind:value={pesquisa}
          placeholder={$t('financas.transacoes.placeholder.pesquisa', { default: 'ex: almoço' })}
          aria-label="{$t('a11y.aria.pesquisar_na_descricao', { default: 'Pesquisar na descrição' })}"
        />
      </label>
    </div>
    <div class="filters-row">
      <label class="field">
        <span class="field-label">{$t('financas.transacoes.filtros.de', { default: 'De' })}</span>
        <input type="date" bind:value={dataDe} aria-label="{$t('a11y.aria.data_inicial', { default: 'Data inicial' })}" />
      </label>
      <label class="field">
        <span class="field-label">{$t('financas.transacoes.filtros.ate', { default: 'Até' })}</span>
        <input type="date" bind:value={dataAte} aria-label="{$t('a11y.aria.data_final', { default: 'Data final' })}" />
      </label>
      {#if temFiltroAtivo}
        <button
          type="button"
          class="clear-btn"
          onclick={clearFilters}
          aria-label="{$t('a11y.aria.limpar_filtros', { default: 'Limpar filtros' })}"
        >
          {$t('financas.transacoes.clear_filters', { default: 'Limpar filtros' })}
        </button>
      {/if}
    </div>

    <div class="totals">
      <span class="total-pill receitas">
        + {formatValor(totalVisivel.receitas, localeCode)}
      </span>
      <span class="total-pill despesas">
        − {formatValor(totalVisivel.despesas, localeCode)}
      </span>
      <span class="total-pill saldo" class:negativo={totalVisivel.receitas - totalVisivel.despesas < 0}>
        {STRINGS.saldoLabel}: {formatValor(totalVisivel.receitas - totalVisivel.despesas, localeCode)}
      </span>
    </div>
  </section>

  <section class="list" aria-label="{$t('a11y.aria.lista_de_transacoes', { default: 'Lista de transações' })}">
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
          <h3 class="day-header">{formatData(grupo.data, localeCode)}</h3>
          <ul class="rows v10-stagger">
            {#each grupo.items as tx (tx.id)}
              {@const c = cat(tx.categoria)}
              {@const isReceita = tx.tipo === 'receita'}
              <li class="row" class:receita={isReceita} class:despesa={!isReceita}>
                <!-- V8: a linha liga à página de edição (antes era órfã). -->
                <a
                  class="row-link"
                  href={`/financas/transacoes/${tx.id}/`}
                  aria-label={`${$t('financas.transacoes.edit_aria', { default: 'Editar transação' })}: ${tx.descricao || (c?.nome ?? tx.categoria)}`}
                >
                  <span
                    class="cat-icon"
                    style={c ? `--cat-cor: ${c.cor}` : '--cat-cor: var(--txt3)'}
                    aria-hidden="true"
                  >
                    {c?.icone ?? '📦'}
                  </span>
                  <span class="row-main">
                    <span class="row-desc">{tx.descricao || (c?.nome ?? $t('financas.transacoes.sem_descricao', { default: 'Sem descrição' }))}</span>
                    <span class="row-meta">
                      {c?.nome ?? tx.categoria} · {isReceita ? STRINGS.ariaReceita : STRINGS.ariaDespesa}
                    </span>
                  </span>
                  <span class="row-valor" aria-label={isReceita ? STRINGS.ariaReceita : STRINGS.ariaDespesa}>
                    {isReceita ? '+' : '−'}{formatValor(tx.valor, localeCode)}
                  </span>
                </a>
                {#if !readOnly}
                  <button
                    type="button"
                    class="delete-btn"
                    onclick={() => confirmDelete(tx.id)}
                    aria-label={confirmingDelete === tx.id ? STRINGS.ariaConfirm : STRINGS.ariaDelete}
                    data-confirming={confirmingDelete === tx.id}
                  >
                    {confirmingDelete === tx.id ? STRINGS.confirmShort : '🗑️'}
                  </button>
                {/if}
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
    gap: 0.5rem;
    flex-wrap: wrap;
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
    filter: brightness(0.92);
    outline: none;
  }
  .btn-primary:focus-visible {
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.4);
  }
  .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(255, 255, 255, 0.06);
    color: var(--txt, #fff);
    text-decoration: none;
    padding: 0.625rem 1.1rem;
    border-radius: 0.5rem;
    font-weight: 600;
    border: 1px solid var(--border-strong, rgba(255, 255, 255, 0.2));
    cursor: pointer;
    transition: background 0.15s;
    font-family: inherit;
    font-size: 0.95rem;
  }
  .btn-secondary:hover,
  .btn-secondary:focus-visible {
    background: rgba(255, 255, 255, 0.12);
    outline: none;
  }
  .btn-secondary:focus-visible {
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
    gap: 0.25rem;
    padding: 0 0.5rem 0 0;
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-left: 4px solid var(--cat-cor, var(--txt3));
    border-radius: 0.625rem;
    transition: background var(--motion-fast, 120ms);
  }
  .row:hover {
    background: var(--card-hover, rgba(255, 255, 255, 0.07));
  }
  /* V8: área clicável da linha → página de edição */
  .row-link {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.75rem 0.5rem 0.75rem 0.875rem;
    min-height: 44px;
    text-decoration: none;
    color: inherit;
    border-radius: 0.625rem 0 0 0.625rem;
  }
  .row-link:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .mood-readonly {
    margin: 0 0 1rem 0;
    padding: 0.7rem 0.9rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px dashed var(--border, rgba(255, 255, 255, 0.2));
    color: var(--txt2);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--fs-sm, 0.875rem);
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
    min-width: 44px;
    min-height: 44px;
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
