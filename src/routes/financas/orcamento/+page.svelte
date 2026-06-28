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
    listOrcamentos,
    setOrcamento,
    totaisPorCategoria,
    getMesAtual,
    formatMes,
    formatValor,
    type CategoriaRow,
    type OrcamentoRow,
    type TotaisPorCategoria
  } from '$lib/financas';
  import { showToast } from '$lib/components/events';
    import { t } from 'svelte-i18n';

    let todasCategorias = $state<CategoriaRow[]>([]);
  let orcamentosMes = $state<Record<string, number>>({});   // categoriaId → limite
  let gastosMes = $state<TotaisPorCategoria>({});
  let loading = $state(true);
  let error = $state<string | null>(null);
  let saving = $state<string | null>(null);   // categoriaId currently saving
  let mesFiltro = $state(getMesAtual());

  // Só despesas + "ambos" recebem orçamento.  Receita fica fora.
  let categoriasDespesa = $derived(
    todasCategorias
      .filter((c) => c.tipo === 'despesa' || c.tipo === 'ambos')
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-PT'))
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
      const [cats, orcs, gastos] = await Promise.all([
        listCategorias(),
        listOrcamentos(mesFiltro),
        totaisPorCategoria(mesFiltro)
      ]);
      todasCategorias = cats;
      const map: Record<string, number> = {};
      for (const o of orcs) {
        // o.id = `${categoriaId}_${mes}` → extrair categoriaId
        const sep = o.id.lastIndexOf('_');
        const catId = sep >= 0 ? o.id.slice(0, sep) : o.id;
        map[catId] = o.limite;
      }
      orcamentosMes = map;
      gastosMes = gastos;
    } catch (e) {
      console.error('[financas/orcamento] refresh failed', e);
      error = e instanceof Error ? e.message : 'Erro a carregar orçamento';
    } finally {
      loading = false;
    }
  }

  async function saveLimite(categoriaId: string, raw: string): Promise<void> {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === '0') {
      // Apagar limite = não tem orçamento.  Não gravamos porque o
      // schema atual usa `put()` — mas se o utilizador quiser mesmo
      // "remover", pode deixar vazio e gravamos 0.
      // Para já, 0 é tratado como "sem limite definido" no template.
      orcamentosMes = { ...orcamentosMes, [categoriaId]: 0 };
      try {
        saving = categoriaId;
        await setOrcamento(categoriaId, 0, mesFiltro);
      } catch (e) {
        console.error('[financas/orcamento] save failed', e);
        showToast('Erro a gravar limite');
      } finally {
        saving = null;
      }
      return;
    }
    const num = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(num) || num < 0) {
      showToast('Limite inválido');
      return;
    }
    orcamentosMes = { ...orcamentosMes, [categoriaId]: num };
    try {
      saving = categoriaId;
      await setOrcamento(categoriaId, num, mesFiltro);
    } catch (e) {
      console.error('[financas/orcamento] save failed', e);
      showToast('Erro a gravar limite');
    } finally {
      saving = null;
    }
  }

  function progressClass(gasto: number, limite: number): string {
    if (!limite || limite <= 0) return 'none';
    const pct = (gasto / limite) * 100;
    if (pct >= 100) return 'over';
    if (pct >= 70) return 'warn';
    return 'ok';
  }

  function pct(gasto: number, limite: number): number {
    if (!limite || limite <= 0) return 0;
    const p = (gasto / limite) * 100;
    return Math.min(p, 130);  // cap visual para não esticar a barra
  }

  // Total agregado de orçamento vs gasto (só categorias com limite > 0).
  let totalLimite = $derived(
    Object.values(orcamentosMes).reduce((s, v) => s + (v > 0 ? v : 0), 0)
  );
  let totalGasto = $derived(
    categoriasDespesa.reduce((s, c) => s + (gastosMes[c.id] || 0), 0)
  );

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
    <h1>📊 Orçamento</h1>
    <p class="sub">Limites por categoria — <strong>{formatMes(mesFiltro)}</strong></p>
  </header>

  <nav class="crumbs" aria-label="Caminho de navegação">
    <a href="/">← Hub</a>
    <span aria-hidden="true">/</span>
    <a href="/financas/">{$t('financas.orcamento.breadcrumb.home', { default: '← Finanças' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">Orçamento</span>
  </nav>

  <section class="controls" aria-label="Filtros">
    <label class="field">
      <span class="field-label">Mês</span>
      <input type="month" bind:value={mesFiltro} aria-label="Mês do orçamento" />
    </label>
  </section>

  {#if loading}
    <p class="empty">A carregar…</p>
  {:else if error}
    <p class="empty error" role="alert">⚠️ {error}</p>
  {:else if categoriasDespesa.length === 0}
    <p class="empty">Sem categorias de despesa configuradas.</p>
  {:else}
    <section class="summary" aria-label="Resumo do orçamento">
      <div class="summary-row">
        <span class="summary-label">Total limite</span>
        <span class="summary-value">{formatValor(totalLimite)}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Total gasto</span>
        <span class="summary-value" class:over={totalGasto > totalLimite && totalLimite > 0}>
          {formatValor(totalGasto)}
        </span>
      </div>
    </section>

    <section class="categories" aria-label="Limites por categoria">
      {#each categoriasDespesa as c (c.id)}
        {@const gasto = gastosMes[c.id] || 0}
        {@const limite = orcamentosMes[c.id] || 0}
        {@const classe = progressClass(gasto, limite)}
        {@const percent = pct(gasto, limite)}
        <article class="cat-row" data-state={classe}>
          <div class="cat-head">
            <span class="cat-icon" style="--cat-cor: {c.cor}" aria-hidden="true">
              {c.icone}
            </span>
            <span class="cat-name">{c.nome}</span>
            <label class="limite-input">
              <span class="sr-only">Limite para {c.nome}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                value={limite || ''}
                placeholder="—"
                disabled={saving === c.id}
                aria-label={`Limite (€) para ${c.nome}`}
                onblur={(e) => saveLimite(c.id, (e.currentTarget as HTMLInputElement).value)}
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
              />
              <span class="euro" aria-hidden="true">€</span>
            </label>
          </div>

          <div class="bar-wrap" aria-hidden="true">
            <div class="bar" class:over={classe === 'over'} class:warn={classe === 'warn'} style="width: {percent}%"></div>
          </div>

          <div class="cat-foot">
            <span class="gasto">
              <strong>{formatValor(gasto)}</strong>
              {#if limite > 0}
                <span class="limite-info"> de {formatValor(limite)}</span>
              {/if}
            </span>
            {#if limite > 0}
              <span class="percent-label" class:over={classe === 'over'} class:warn={classe === 'warn'}>
                {Math.round((gasto / limite) * 100)}%
              </span>
            {:else if gasto > 0}
              <span class="percent-label muted">sem limite</span>
            {/if}
          </div>

          {#if limite > 0 && gasto > limite}
            <p class="over-msg" role="status">
              ⚠️ {formatValor(gasto - limite)} acima do orçamento
            </p>
          {/if}

          {#if saving === c.id}
            <span class="saving" aria-live="polite">A gravar…</span>
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
  .sub strong {
    color: var(--txt, #fff);
    font-weight: 600;
    text-transform: capitalize;
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
    flex: 1;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--txt, #fff);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .bar.warn {
    background: var(--warning, #f59e0b);
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
  .percent-label.warn {
    color: var(--warning, #f59e0b);
  }
  .percent-label.over {
    color: var(--error, #ef4444);
  }
  .percent-label.muted {
    color: var(--txt3, #94a3b8);
    font-weight: 400;
  }
  .over-msg {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--error, #ef4444);
    font-weight: 600;
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
