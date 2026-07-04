<!--
  /financas/orcamento — limites de despesa por categoria para o mês corrente.

  Por cada categoria de despesa:
    * Input numérico com o limite (editável inline; grava em blur).
    * Total já gasto no mês (de `totaisPorCategoria`).
    * Barra de progresso colorida:
        < 70%   verde
        70-100% amarelo
        > 100%  vermelho
    * Aviso "X € acima do orçamento" se excedido.

  Seletor de mês (default = corrente).  Categorias de receita e "ambos"
  não aparecem — só despesas têm orçamento.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    listCategorias,
    setOrcamento,
    totaisPorCategoria,
    getOrcamentoStatus,
    copiarOrcamentosMesAnterior,
    mesAnterior,
    getMesAtual,
    formatMes,
    formatValor,
    type CategoriaRow,
    type OrcamentoStatus,
    type TotaisPorCategoria
  } from '$lib/financas';
  import { showToast } from '$lib/components/events';
  import { useMoodState } from '$lib/mood/useMoodState.svelte';
  import { locale, t } from 'svelte-i18n';

  let todasCategorias = $state<CategoriaRow[]>([]);
  let orcamentoStatus = $state<OrcamentoStatus[]>([]);
  let orcamentosMes = $state<Record<string, number>>({});   // categoriaId → limite
  let gastosMes = $state<TotaisPorCategoria>({});
  let loading = $state(true);
  let error = $state<string | null>(null);
  let saving = $state<string | null>(null);   // categoriaId currently saving
  let copying = $state(false);                // V8: "copiar mês anterior" em curso
  let mesFiltro = $state(getMesAtual());
  const sortLocale = $derived($locale || 'pt-PT');

  // V8 (mood): Sick/Soft ⇒ limites só de leitura, com aviso carinhoso.
  const moodState = useMoodState();
  const readOnly = $derived(moodState.isSick || moodState.isSoft);

  // Só despesas + "ambos" recebem orçamento. Receita fica fora.
  let categoriasDespesa = $derived(
    todasCategorias
      .filter((c) => c.tipo === 'despesa' || c.tipo === 'ambos')
      .sort((a, b) => a.nome.localeCompare(b.nome, sortLocale))
  );

  onMount(() => {
    void refresh();
  });

  // Re-fetch quando muda o mês.
  $effect(() => {
    const _ = mesFiltro;
    void refresh();
  });

  async function refresh(): Promise<void> {
    loading = true;
    error = null;
    try {
      const [cats, gastos, statusRows] = await Promise.all([
        listCategorias(),
        totaisPorCategoria(mesFiltro),
        getOrcamentoStatus(mesFiltro)
      ]);
      todasCategorias = cats;
      gastosMes = gastos;
      orcamentoStatus = statusRows;
      orcamentosMes = Object.fromEntries(statusRows.map((row) => [row.categoria.id, row.limite]));
    } catch (e) {
      console.error('[financas/orcamento] refresh failed', e);
      error = e instanceof Error ? e.message : 'Erro a carregar orçamento';
    } finally {
      loading = false;
    }
  }

  /**
   * V8: copia todos os limites do mês anterior para o mês seleccionado.
   * Nunca substitui limites já definidos neste mês.
   */
  async function copiarMesAnterior(): Promise<void> {
    if (copying || readOnly) return;
    copying = true;
    try {
      const n = await copiarOrcamentosMesAnterior(mesFiltro);
      if (n > 0) {
        showToast($t('financas.orcamento.copy.done', { values: { n }, default: '{n} limite(s) copiado(s) do mês anterior 🎉' }));
        await refresh();
      } else {
        showToast($t('financas.orcamento.copy.nothing', { default: 'Nada novo para copiar — está tudo em dia.' }));
      }
    } catch (e) {
      console.error('[financas/orcamento] copiar mes anterior failed', e);
      showToast($t('financas.orcamento.copy.error', { default: 'Erro a copiar o mês anterior.' }));
    } finally {
      copying = false;
    }
  }

  async function saveLimite(categoriaId: string, raw: string): Promise<void> {
    if (readOnly) return;
    const trimmed = raw.trim();
    const num = trimmed === '' ? 0 : Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(num) || num < 0) {
      showToast($t('toast.limite_invalido', { default: 'Limite inválido' }));
      return;
    }

    orcamentosMes = { ...orcamentosMes, [categoriaId]: num };
    try {
      saving = categoriaId;
      await setOrcamento(categoriaId, num, mesFiltro);
      await refresh();
      showToast($t('financas.orcamento.toast.saved', { default: 'Orçamento guardado' }));
    } catch (e) {
      console.error('[financas/orcamento] save failed', e);
      showToast($t('financas.orcamento.erro.gravar', { default: 'Erro a gravar limite' }));
    } finally {
      saving = null;
    }
  }

  function progressWidth(percent: number): number {
    return Math.min(Math.max(percent, 0), 130);
  }

  function statusLabel(status: OrcamentoStatus['status']): string {
    return $t(`financas.orcamento.status.${status}`, { default: status });
  }

  let statusByCategoria = $derived(
    Object.fromEntries(orcamentoStatus.map((row) => [row.categoria.id, row])) as Record<string, OrcamentoStatus>
  );

  // Total agregado de orçamento vs gasto (só categorias com limite > 0).
  let totalLimite = $derived(orcamentoStatus.reduce((s, row) => s + row.limite, 0));
  let totalGasto = $derived(orcamentoStatus.reduce((s, row) => s + row.gasto, 0));
  let totalRestante = $derived(totalLimite - totalGasto);
  let dangerCount = $derived(orcamentoStatus.filter((row) => row.status === 'danger' || row.status === 'over').length);
  let overCount = $derived(orcamentoStatus.filter((row) => row.status === 'over').length);

  // SEO — used by <svelte:head> below.
  let pageTitle = $derived('Orçamento · Finanças');
  let description = $derived('Limites por categoria');
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content="https://presuntinho.netlify.app/financas/orcamento/" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={description} />
</svelte:head>

<div class="orcamento-page">
  <header class="hero">
    <h1>{$t('financas.orcamento.hero.title', { default: '📊 Orçamento' })}</h1>
    <p class="sub">{$t('financas.orcamento.sub', { default: 'Limites por categoria — {mes}' }).replace('{mes}', formatMes(mesFiltro, sortLocale))}</p>
  </header>

  <nav class="crumbs" aria-label="{$t('a11y.aria.caminho_de_navegacao', { default: 'Caminho de navegação' })}">
    <a href="/">{$t('financas.crumbs.hub', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <a href="/financas/">{$t('financas.orcamento.breadcrumb.home', { default: '← Finanças' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('financas.orcamento.breadcrumb.current', { default: 'Orçamento' })}</span>
  </nav>

  <section class="controls" aria-label="{$t('a11y.aria.filtros', { default: 'Filtros' })}">
    <label class="field">
      <span class="field-label">{$t('financas.orcamento.mes_label', { default: 'Mês' })}</span>
      <input type="month" bind:value={mesFiltro} aria-label="{$t('a11y.aria.mes_do_orcamento', { default: 'Mês do orçamento' })}" />
    </label>
    {#if !readOnly}
      <button
        type="button"
        class="copy-btn"
        onclick={copiarMesAnterior}
        disabled={copying}
        aria-label={$t('financas.orcamento.copy.aria', { values: { mes: formatMes(mesAnterior(mesFiltro), sortLocale) }, default: 'Copiar limites de {mes}' })}
      >
        <span aria-hidden="true">📋</span>
        {copying
          ? $t('financas.orcamento.gravando', { default: 'A gravar…' })
          : $t('financas.orcamento.copy.button', { default: 'Copiar mês anterior' })}
      </button>
    {/if}
  </section>

  {#if readOnly}
    <p class="mood-readonly" role="note">
      <span aria-hidden="true">🌿</span>
      {$t('financas.mood.readonly', { default: 'Modo cuidado ativo — hoje é só para ver. As alterações ficam para quando estiveres melhor 🤍' })}
    </p>
  {/if}

  {#if loading}
    <p class="empty">{$t('financas.orcamento.carregando', { default: 'A carregar…' })}</p>
  {:else if error}
    <p class="empty error" role="alert">⚠️ {error}</p>
  {:else if categoriasDespesa.length === 0}
    <p class="empty">{$t('financas.orcamento.empty.categorias', { default: 'Sem categorias de despesa configuradas.' })}</p>
  {:else}
    <section class="summary" aria-label="{$t('a11y.aria.resumo_do_orcamento', { default: 'Resumo do orçamento' })}">
      <div class="summary-row">
        <span class="summary-label">{$t('financas.orcamento.summary.total_limit', { default: 'Total limite' })}</span>
        <span class="summary-value">{formatValor(totalLimite, sortLocale)}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">{$t('financas.orcamento.summary.total_spent', { default: 'Total gasto' })}</span>
        <span class="summary-value" class:over={totalGasto > totalLimite && totalLimite > 0}>
          {formatValor(totalGasto, sortLocale)}
        </span>
      </div>
      <div class="summary-row">
        <span class="summary-label">{$t('financas.orcamento.summary.remaining', { default: 'Saldo restante' })}</span>
        <span class="summary-value" class:over={totalRestante < 0}>
          {formatValor(totalRestante, sortLocale)}
        </span>
      </div>
    </section>

    {#if orcamentoStatus.length === 0}
      <p class="empty empty-budget">
        {$t('financas.orcamento.empty.budgets', { default: 'Nenhum orçamento definido. Define um limite numa categoria para começar.' })}
      </p>
    {:else if dangerCount > 0}
      <p class="budget-alert" class:over={overCount > 0} role="status">
        {overCount > 0
          ? $t('financas.orcamento.alert.over', { values: { n: overCount }, default: '{n} orçamento(s) ultrapassado(s).' })
          : $t('financas.orcamento.alert.danger', { values: { n: dangerCount }, default: '{n} orçamento(s) acima de 90%.' })}
      </p>
    {/if}

    <section class="categories" aria-label="{$t('a11y.aria.limites_por_categoria', { default: 'Limites por categoria' })}">
      {#each categoriasDespesa as c (c.id)}
        {@const row = statusByCategoria[c.id]}
        {@const gasto = gastosMes[c.id] || 0}
        {@const limite = orcamentosMes[c.id] || 0}
        {@const percent = row?.percent ?? 0}
        {@const classe = row?.status ?? 'none'}
        <article class="cat-row" data-state={classe} style="--cat-cor: {c.cor}">
          <div class="cat-head">
            <span class="cat-icon" style="--cat-cor: {c.cor}" aria-hidden="true">
              {c.icone}
            </span>
            <div class="cat-title">
              <span class="cat-name">{c.nome}</span>
              {#if row}
                <span class="status-badge" class:warning={classe === 'warning'} class:danger={classe === 'danger'} class:over={classe === 'over'}>
                  {statusLabel(row.status)}
                </span>
              {/if}
            </div>
            <label class="limite-input">
              <span class="sr-only">{$t('placeholder.limite_para', { values: { nome: c.nome }, default: 'Limite para {nome}' })}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                value={limite || ''}
                placeholder={$t('placeholder.em_dash', { default: '—' })}
                disabled={saving === c.id || readOnly}
                aria-label={`Limite (${$t('currency.symbol')}) para ${c.nome}`}
                onblur={(e) => saveLimite(c.id, (e.currentTarget as HTMLInputElement).value)}
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
              />
              <span class="euro" aria-hidden="true">{$t('currency.symbol')}</span>
            </label>
          </div>

          <div class="bar-wrap" aria-hidden="true">
            <div
              class="bar"
              class:warning={classe === 'warning'}
              class:danger={classe === 'danger'}
              class:over={classe === 'over'}
              style="width: {progressWidth(percent)}%"
            ></div>
          </div>

          <div class="cat-foot">
            <span class="gasto">
              <strong>{formatValor(gasto, sortLocale)}</strong>
              {#if limite > 0}
                <span class="limite-info"> {$t('financas.orcamento.of_limit', { default: 'de' })} {formatValor(limite, sortLocale)}</span>
              {/if}
            </span>
            {#if limite > 0}
              <span class="percent-label" class:warning={classe === 'warning'} class:danger={classe === 'danger'} class:over={classe === 'over'}>
                {Math.round(percent)}%
              </span>
            {:else if gasto > 0}
              <span class="percent-label muted">{$t('financas.orcamento.sem_limite', { default: 'sem limite' })}</span>
            {/if}
          </div>

          {#if row && row.status === 'over'}
            <p class="over-msg" role="status">
              ⚠️ {$t('financas.orcamento.over_by', { values: { valor: formatValor(Math.abs(row.restante), sortLocale) }, default: '{valor} acima do orçamento' })}
            </p>
          {:else if row && row.status === 'danger'}
            <p class="danger-msg" role="status">
              {$t('financas.orcamento.near_limit', { default: 'Quase no limite — abranda aqui.' })}
            </p>
          {/if}

          {#if saving === c.id}
            <span class="saving" aria-live="polite">{$t('financas.orcamento.gravando', { default: 'A gravar…' })}</span>
          {/if}
        </article>
      {/each}
    </section>
  {/if}
</div>

<style>
  .orcamento-page {
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
  .controls {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 0.875rem 1rem;
    margin-bottom: 1rem;
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 160px;
  }
  .field-label {
    font-size: 0.8125rem;
    color: var(--txt3, #94a3b8);
  }
  .field input {
    width: 100%;
    padding: 0.5rem 0.625rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: 0.5rem;
    color: var(--txt, #fff);
    font-size: 0.9375rem;
    font-family: inherit;
    color-scheme: dark;
  }
  .field input:focus-visible {
    outline: none;
    border-color: var(--success, #10b981);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.25);
  }
  /* V8: copiar limites do mês anterior */
  .copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 44px;
    padding: 0.5rem 1rem;
    background: var(--card-hover, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: var(--radius-sm, 0.5rem);
    color: var(--txt, #fff);
    font-family: inherit;
    font-size: var(--fs-sm, 0.875rem);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--motion-fast, 120ms);
  }
  .copy-btn:hover:not(:disabled),
  .copy-btn:focus-visible:not(:disabled) {
    background: var(--bg-elev, rgba(255, 255, 255, 0.12));
    outline: none;
  }
  .copy-btn:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 30%, transparent);
  }
  .copy-btn:disabled {
    opacity: 0.6;
    cursor: progress;
  }
  .mood-readonly {
    margin: 0 0 1rem 0;
    padding: 0.7rem 0.9rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px dashed var(--border, rgba(255, 255, 255, 0.2));
    color: var(--txt2, #cbd5e1);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--fs-sm, 0.875rem);
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
  .empty-budget {
    margin-bottom: 1rem;
  }
  .budget-alert {
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--warning, #f59e0b) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--warning, #f59e0b) 35%, transparent);
    color: var(--warning, #f59e0b);
    font-weight: 700;
  }
  .budget-alert.over {
    background: color-mix(in srgb, var(--error, #ef4444) 12%, transparent);
    border-color: color-mix(in srgb, var(--error, #ef4444) 35%, transparent);
    color: var(--error, #ef4444);
  }
  .summary {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1rem 1.125rem;
    margin-bottom: 1rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem 1rem;
  }
  .summary-row {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .summary-label {
    font-size: 0.75rem;
    color: var(--txt3, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }
  .summary-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--txt, #fff);
    font-variant-numeric: tabular-nums;
  }
  .summary-value.over {
    color: var(--error, #ef4444);
  }
  .categories {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .cat-row {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-left: 4px solid var(--cat-cor, #94a3b8);
    border-radius: 0.625rem;
    padding: 0.875rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .cat-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .cat-icon {
    font-size: 1.5rem;
    line-height: 1;
    width: 2.25rem;
    height: 2.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--cat-cor, #94a3b8) 18%, transparent);
    flex-shrink: 0;
  }
  .cat-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--txt, #fff);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cat-title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .status-badge {
    width: fit-content;
    padding: 0.125rem 0.45rem;
    border-radius: 999px;
    background: rgba(16, 185, 129, 0.14);
    color: var(--success, #10b981);
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .status-badge.warning {
    background: rgba(245, 158, 11, 0.14);
    color: var(--warning, #f59e0b);
  }
  .status-badge.danger {
    background: color-mix(in srgb, var(--warning, #f59e0b) 20%, transparent);
    color: color-mix(in srgb, var(--warning, #f59e0b) 60%, var(--error, #ef4444));
  }
  .status-badge.over {
    background: rgba(239, 68, 68, 0.16);
    color: var(--error, #ef4444);
  }
  .limite-input {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }
  .limite-input input {
    width: 6.5rem;
    padding: 0.375rem 0.5rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: 0.375rem;
    color: var(--txt, #fff);
    font-size: 0.875rem;
    font-family: inherit;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color-scheme: dark;
  }
  .limite-input input:focus-visible {
    outline: none;
    border-color: var(--success, #10b981);
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.25);
  }
  .limite-input input:disabled {
    opacity: 0.5;
  }
  .limite-input .euro {
    color: var(--txt3, #94a3b8);
    font-size: 0.875rem;
    font-weight: 600;
  }
  .bar-wrap {
    width: 100%;
    height: 8px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 999px;
    overflow: hidden;
  }
  .bar {
    height: 100%;
    background: var(--success, #10b981);
    border-radius: 999px;
    transition: width 0.3s ease, background 0.2s;
  }
  .bar.warning {
    background: var(--warning, #f59e0b);
  }
  .bar.danger {
    background: color-mix(in srgb, var(--warning, #f59e0b) 60%, var(--error, #ef4444));
  }
  .bar.over {
    background: var(--error, #ef4444);
  }
  .cat-foot {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 0.8125rem;
    color: var(--txt2, #cbd5e1);
    font-variant-numeric: tabular-nums;
  }
  .gasto strong {
    color: var(--txt, #fff);
    font-weight: 700;
  }
  .limite-info {
    color: var(--txt3, #94a3b8);
  }
  .percent-label {
    font-weight: 600;
    color: var(--success, #10b981);
  }
  .percent-label.warning {
    color: var(--warning, #f59e0b);
  }
  .percent-label.danger {
    color: color-mix(in srgb, var(--warning, #f59e0b) 60%, var(--error, #ef4444));
  }
  .percent-label.over {
    color: var(--error, #ef4444);
  }
  .percent-label.muted {
    color: var(--txt3, #94a3b8);
    font-weight: 400;
  }
  .over-msg,
  .danger-msg {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 600;
  }
  .over-msg {
    color: var(--error, #ef4444);
  }
  .danger-msg {
    color: color-mix(in srgb, var(--warning, #f59e0b) 60%, var(--error, #ef4444));
  }
  .saving {
    font-size: 0.75rem;
    color: var(--txt3, #94a3b8);
    font-style: italic;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @media (min-width: 640px) {
    .orcamento-page {
      padding: 2rem 1.5rem 3rem;
    }
    .hero h1 {
      font-size: 2.25rem;
    }
    .summary {
      grid-template-columns: 1fr 1fr 1fr;
    }
    .summary-row:last-child {
      grid-column: 1 / -1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bar { transition: none; }
  }
</style>
