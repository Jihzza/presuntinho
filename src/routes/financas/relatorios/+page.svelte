<!--
  /financas/relatorios — relatórios mensais (gap-120).

  Mostra:
    * Hero 💰 Relatórios + saudação ao mês seleccionado.
    * Seletor de mês (YYYY-MM, últimos 12 meses).  Default = mês corrente.
    * Pie chart (chart.js doughnut) de despesas por categoria
      — usa `categoria.cor` como backgroundColor e `categoria.icone`
      num tooltip callback.
    * Top 5 despesas (lista das 5 maiores despesas do mês).
    * Comparativo mês-a-mês: chart de barras agrupadas (receitas,
      despesas, saldo) — mês seleccionado vs mês anterior.
    * Botão export CSV de TODAS as transações do mês seleccionado.
    * EmptyState quando não há dados.

  Carrega via Dexie em `onMount` (sem SSR).  Reage a mudanças do
  seletor de mês re-fetcheando tudo (pie + top 5 + comparativo).
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import {
    listCategorias,
    listTransacoesMes,
    totaisPorCategoria,
    totalMes,
    getMesAtual,
    formatMes,
    formatValor,
    formatData,
    type CategoriaRow,
    type Transacao,
    type TotaisMes
  } from '$lib/financas';
  import { subApps } from '$lib/registry';
  import EmptyState from '$lib/components/EmptyState.svelte';

  // ---------------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------------

  let Chart: typeof import('chart.js/auto').Chart | null = $state(null);

  let mes = $state(getMesAtual());                                    // 'YYYY-MM'
  let categorias = $state<CategoriaRow[]>([]);
  let transacoesMes = $state<Transacao[]>([]);
  let totaisCategoria = $state<Record<string, number>>({});          // catSlug → despesa total
  let totaisMesAtual = $state<TotaisMes>({ receitas: 0, despesas: 0, saldo: 0 });
  let totaisMesAnterior = $state<TotaisMes>({ receitas: 0, despesas: 0, saldo: 0 });

  let loading = $state(true);
  let error = $state<string | null>(null);

  let pieCanvas: HTMLCanvasElement | undefined = $state();
  let compareCanvas: HTMLCanvasElement | undefined = $state();
  let pieChart: import('chart.js/auto').Chart | null = null;
  let compareChart: import('chart.js/auto').Chart | null = null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const financasApp = subApps.find((a) => a.id === 'financas');

  // ---------------------------------------------------------------------------
  // Helpers de data
  // ---------------------------------------------------------------------------

  /** Devolve os últimos 12 meses (incluindo o corrente) como 'YYYY-MM',
   *  ordenados do mais recente para o mais antigo.  O primeiro item é
   *  sempre `getMesAtual()`. */
  function ultimos12Meses(): { value: string; label: string }[] {
    const out: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ value, label: formatMes(value) });
    }
    return out;
  }

  /** Mês anterior ao fornecido, em 'YYYY-MM'. */
  function mesAnterior(mesStr: string): string {
    const [y, m] = mesStr.split('-').map((n) => parseInt(n, 10));
    const d = new Date(y, m - 2, 1); // m-2 porque Date(2026,0,1) = Jan, e queremos mês antes do actual
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  let categoriasPorId: Record<string, CategoriaRow> = $derived(
    Object.fromEntries(categorias.map((c) => [c.id, c]))
  );

  /** Lista de despesas do mês ordenadas por valor absoluto desc, top 5. */
  let top5Despesas = $derived(
    transacoesMes
      .filter((t) => t.tipo === 'despesa')
      .slice()
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5)
  );

  /** Há alguma transação (qualquer tipo) no mês? */
  let temDadosMes = $derived(transacoesMes.length > 0);

  /** Há despesas no mês? (controla o "pie.empty" e o cabeçalho do gráfico) */
  let temDespesasMes = $derived(totaisMesAtual.despesas > 0);

  let opcoesMeses = $derived(ultimos12Meses());

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  onMount(() => {
    void (async () => {
      try {
        const mod = await import('chart.js/auto');
        Chart = mod.Chart;
        await refresh();
        loading = false;
        await Promise.resolve();
        renderPie();
        renderCompare();
      } catch (e) {
        console.error('[financas/relatorios] load failed', e);
        error = e instanceof Error ? e.message : 'Erro a carregar relatórios';
        loading = false;
      }
    })();
  });

  onDestroy(() => {
    pieChart?.destroy();
    compareChart?.destroy();
    pieChart = null;
    compareChart = null;
  });

  // Re-fetch + re-render quando o mês muda.
  $effect(() => {
    const _ = mes;
    const __ = Chart;
    if (!__) return;
    void (async () => {
      await refresh();
      renderPie();
      renderCompare();
    })();
  });

  async function refresh(): Promise<void> {
    error = null;
    try {
      const prevMes = mesAnterior(mes);
      const [cats, tx, totCat, tot, totPrev] = await Promise.all([
        listCategorias(),
        listTransacoesMes(mes),
        totaisPorCategoria(mes),
        totalMes(mes),
        totalMes(prevMes)
      ]);
      categorias = cats;
      transacoesMes = tx;
      totaisCategoria = totCat;
      totaisMesAtual = tot;
      totaisMesAnterior = totPrev;
    } catch (e) {
      console.error('[financas/relatorios] refresh failed', e);
      error = e instanceof Error ? e.message : 'Erro a carregar relatórios';
    }
  }

  // ---------------------------------------------------------------------------
  // Charts
  // ---------------------------------------------------------------------------

  function renderPie(): void {
    if (!pieCanvas || !Chart) return;
    pieChart?.destroy();
    pieChart = null;

    // Pie = despesas por categoria, só despesas (>0, filtradas de totaisCategoria
    // que já contém apenas 'despesa' rows).
    const slugs = Object.keys(totaisCategoria);
    const labels: string[] = [];
    const data: number[] = [];
    const cores: string[] = [];
    const icones: string[] = [];
    for (const slug of slugs) {
      const v = totaisCategoria[slug];
      if (!v || v <= 0) continue;
      const cat = categoriasPorId[slug];
      labels.push(cat?.nome ?? slug);
      data.push(v);
      cores.push(cat?.cor ?? '#94a3b8');
      icones.push(cat?.icone ?? '📦');
    }

    if (data.length === 0) return; // EmptyState tratado fora do gráfico.

    pieChart = new Chart(pieCanvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            label: $t('financas.relatorios.pie.title', { default: 'Despesas por categoria' }),
            data,
            backgroundColor: cores,
            borderColor: 'rgba(15, 23, 42, 0.9)',
            borderWidth: 2,
            hoverOffset: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { color: '#cbd5e1', boxWidth: 12, font: { size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const i = ctx.dataIndex;
                const icone = icones[i] ?? '';
                return ` ${icone} ${ctx.label}: ${formatValor(ctx.parsed ?? 0)}`;
              }
            }
          }
        },
        // Animations disabled for screens with reduced-motion preference.
        animation: { duration: 350 }
      }
    });
  }

  function renderCompare(): void {
    if (!compareCanvas || !Chart) return;
    compareChart?.destroy();
    compareChart = null;

    const labelCurto = $t('financas.relatorios.month.label', { default: 'Mês' });
    const lblReceitas = $t('financas.relatorios.compare.receitas', { default: 'Receitas' });
    const lblDespesas = $t('financas.relatorios.compare.despesas', { default: 'Despesas' });
    const lblSaldo = $t('financas.relatorios.compare.saldo', { default: 'Saldo' });

    compareChart = new Chart(compareCanvas, {
      type: 'bar',
      data: {
        labels: [formatMes(mesAnterior(mes)), formatMes(mes)],
        datasets: [
          {
            label: lblReceitas,
            data: [totaisMesAnterior.receitas, totaisMesAtual.receitas],
            backgroundColor: 'rgba(16, 185, 129, 0.7)',
            borderColor: 'rgba(16, 185, 129, 1)',
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 36
          },
          {
            label: lblDespesas,
            data: [totaisMesAnterior.despesas, totaisMesAtual.despesas],
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderColor: 'rgba(239, 68, 68, 1)',
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 36
          },
          {
            label: lblSaldo,
            data: [totaisMesAnterior.saldo, totaisMesAtual.saldo],
            backgroundColor: 'rgba(236, 72, 153, 0.7)',
            borderColor: 'rgba(236, 72, 153, 1)',
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 36
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top', labels: { color: '#cbd5e1' } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatValor(ctx.parsed.y ?? 0)}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#cbd5e1' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: '#cbd5e1',
              callback: (val) => formatValor(Number(val))
            },
            grid: { color: 'rgba(255, 255, 255, 0.08)' }
          }
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // CSV export
  // ---------------------------------------------------------------------------

  /** Escape uma string para ser segura dentro de uma célula CSV (RFC 4180-ish). */
  function csvEscape(s: string): string {
    if (s == null) return '';
    const needsQuote = /[",\n;]/.test(s);
    let out = s.replace(/"/g, '""');
    if (needsQuote) out = `"${out}"`;
    // pt-PT Excel/CSV-friendly: vírgula como separador → ponto-e-vírgula
    // para evitar clash com o separador decimal pt-PT.
    return out;
  }

  function handleExportCSV(): void {
    if (!temDadosMes) return;
    const header = ['data', 'descricao', 'categoria', 'valor', 'tipo'];
    const rows: string[][] = [header];

    // Ordem: igual ao que vem de listTransacoesMes (newest-first), já
    // são as linhas que o utilizador está a ver no ecrã de transacões.
    for (const t of transacoesMes) {
      const cat = categoriasPorId[t.categoria];
      rows.push([
        t.data,
        t.descricao ?? '',
        cat?.nome ?? t.categoria,
        // CSV usa ponto como separador decimal — independente da locale.
        t.valor.toFixed(2).replace('.', ','),
        t.tipo
      ]);
    }

    const csv = rows.map((r) => r.map(csvEscape).join(';')).join('\n');
    // BOM para Excel pt-PT detectar UTF-8.
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financas-${mes}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function catOf(transacao: Transacao): CategoriaRow | undefined {
    return categoriasPorId[transacao.categoria];
  }
</script>

<svelte:head>
  <title>{$t('financas.relatorios.title', { default: 'Relatórios' })} · Presuntinho</title>
  <meta name="description" content={$t('financas.relatorios.subtitle', { default: 'Visão geral do mês' })} />
  <meta property="og:title" content={$t('routes.financas.relatorios.meta.og_title', { default: 'Relatórios · Finanças' })} />
  <meta property="og:description" content={$t('financas.relatorios.subtitle', { default: 'Visão geral do mês' })} />
  <meta property="og:url" content="https://presuntinho.netlify.app/financas/relatorios/" />
  <meta name="twitter:title" content={$t('routes.financas.relatorios.meta.twitter_title', { default: 'Relatórios · Finanças' })} />
  <meta name="twitter:description" content={$t('financas.relatorios.subtitle', { default: 'Visão geral do mês' })} />
</svelte:head>

<div class="relatorios-page">
  <header class="hero">
    <h1>💰 {$t('financas.relatorios.title', { default: 'Relatórios' })}</h1>
    <p class="sub">
      {$t('financas.relatorios.subtitle', { default: 'Visão geral do mês' })} — <strong>{formatMes(mes)}</strong>
    </p>
  </header>

  <nav class="crumbs" aria-label={$t('a11y.aria.caminho_de_navegacao', { default: 'Caminho de navegação' })}>
    <a href="/">{$t('financas.crumbs.home', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <a href="/financas/">{$t('financas.transacoes.breadcrumb.home', { default: '← Finanças' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('financas.relatorios.title', { default: 'Relatórios' })}</span>
  </nav>

  <section class="picker" aria-label={$t('financas.relatorios.pie.aria', { default: 'Selecionar mês' })}>
    <label class="field">
      <span class="field-label">{$t('financas.relatorios.month.label', { default: 'Mês' })}</span>
      <select bind:value={mes}>
        {#each opcoesMeses as opt (opt.value)}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </label>
  </section>

  {#if loading}
    <p class="empty">{$t('financas.chart.title', { default: 'A carregar…' })}</p>
  {:else if error}
    <p class="empty error" role="alert">⚠️ {error}</p>
  {:else if !temDadosMes}
    <EmptyState
      emoji="📊"
      title={$t('financas.relatorios.empty.title', { default: 'Ainda não há dados.' })}
      description={$t('financas.relatorios.empty.desc', { default: 'Adiciona transações para veres relatórios.' })}
      ctaLabel={$t('financas.relatorios.empty.cta', { default: 'Ir para Nova transação' })}
      ctaHref="/financas/nova/"
    />
  {:else}
    <!-- ============================================================== -->
    <!-- 1. Comparativo mês-a-mês (bar chart receitas / despesas / saldo) -->
    <!-- ============================================================== -->
    <section class="card-section" aria-label={$t('financas.relatorios.compare.title', { default: 'Comparativo com mês anterior' })}>
      <h2 class="section-title">{$t('financas.relatorios.compare.title', { default: 'Comparativo com mês anterior' })}</h2>
      <div class="chart-wrap compare">
        <canvas
          bind:this={compareCanvas}
          aria-label={$t('financas.relatorios.compare.title', { default: 'Comparativo com mês anterior' })}
        ></canvas>
      </div>
    </section>

    <!-- ============================================================== -->
    <!-- 2. Pie chart despesas por categoria                              -->
    <!-- ============================================================== -->
    <section class="card-section" aria-label={$t('financas.relatorios.pie.aria', { default: 'Gráfico circular de despesas por categoria' })}>
      <h2 class="section-title">{$t('financas.relatorios.pie.title', { default: 'Despesas por categoria' })}</h2>
      {#if !temDespesasMes}
        <p class="empty muted">{$t('financas.relatorios.pie.empty', { default: 'Sem despesas neste mês.' })}</p>
      {:else}
        <div class="chart-wrap pie">
          <canvas
            bind:this={pieCanvas}
            aria-label={$t('financas.relatorios.pie.aria', { default: 'Gráfico circular de despesas por categoria' })}
          ></canvas>
        </div>
      {/if}
    </section>

    <!-- ============================================================== -->
    <!-- 3. Top 5 despesas                                                -->
    <!-- ============================================================== -->
    <section class="card-section" aria-label={$t('financas.relatorios.top.title', { default: 'Top 5 despesas' })}>
      <h2 class="section-title">{$t('financas.relatorios.top.title', { default: 'Top 5 despesas' })}</h2>
      {#if top5Despesas.length === 0}
        <p class="empty muted">{$t('financas.relatorios.top.empty', { default: 'Sem despesas neste mês.' })}</p>
      {:else}
        <ul class="top-list">
          {#each top5Despesas as tx (tx.id)}
            {@const c = catOf(tx)}
            <li class="top-row">
              <span
                class="cat-icon"
                style={c ? `--cat-cor: ${c.cor}` : '--cat-cor: #94a3b8'}
                aria-hidden="true"
              >
                {c?.icone ?? '📦'}
              </span>
              <span class="top-main">
                <span class="top-desc">{tx.descricao || (c?.nome ?? '—')}</span>
                <span class="top-meta">
                  {c?.nome ?? tx.categoria} · <time datetime={tx.data}>{formatData(tx.data)}</time>
                </span>
              </span>
              <span class="top-valor" aria-label={$t('financas.relatorios.compare.despesas', { default: 'Despesas' })}>
                − {formatValor(tx.valor)}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- ============================================================== -->
    <!-- 4. Export CSV — botão principal                                  -->
    <!-- ============================================================== -->
    <section class="export" aria-label={$t('financas.relatorios.export.csv.aria', { default: 'Descarregar todas as transações como CSV' })}>
      <button
        type="button"
        class="btn-export"
        onclick={handleExportCSV}
        aria-label={$t('financas.relatorios.export.csv.aria', { default: 'Descarregar todas as transações como CSV' })}
      >
        <span class="btn-ico" aria-hidden="true">⬇</span>
        <span>{$t('financas.relatorios.export.csv', { default: 'Exportar CSV' })}</span>
      </button>
      <p class="export-hint">
        {transacoesMes.length}
        {#if transacoesMes.length === 1}
          {$t('financas.transacoes.label', { default: 'transação' })}
        {:else}
          {$t('financas.transacoes.label_plural', { default: 'transações' })}
        {/if}
      </p>
    </section>
  {/if}

  {#if financasApp}
    <footer class="page-footer" aria-hidden="true">
      <span style="--swatch: {financasApp.color}">{financasApp.icon}</span>
      <span>{$t('financas.footer.position', { default: 'Hub · Finanças' })}</span>
    </footer>
  {/if}
</div>

<style>
  .relatorios-page {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem 2rem;
  }
  .hero {
    text-align: center;
    margin-bottom: 1.25rem;
  }
  .hero h1 {
    font-size: clamp(1.75rem, 1.4rem + 1.5vw, 2.5rem);
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
  .empty.muted {
    padding: 1.25rem;
    color: var(--txt3, #94a3b8);
    font-style: italic;
  }
  .picker {
    margin-bottom: 1rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .field-label {
    font-size: 0.8125rem;
    color: var(--txt3, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }
  .field select {
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: 0.5rem;
    color: var(--txt, #fff);
    font-size: 1rem;
    font-family: inherit;
    color-scheme: dark;
  }
  .field select:focus-visible {
    outline: none;
    border-color: var(--success, #10b981);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.35);
  }
  .card-section {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1rem 1rem 1.25rem;
    margin-bottom: 1.25rem;
  }
  .section-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3, #94a3b8);
    margin: 0 0 0.75rem 0.25rem;
    font-weight: 600;
  }
  .chart-wrap {
    position: relative;
    width: 100%;
  }
  .chart-wrap.compare {
    height: 240px;
  }
  .chart-wrap.pie {
    height: 320px;
  }
  .top-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .top-row {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.625rem 0.75rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 0.5rem;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.05));
  }
  .cat-icon {
    width: 2.25rem;
    height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--cat-cor, #94a3b8) 22%, transparent);
    font-size: 1.25rem;
    flex-shrink: 0;
  }
  .top-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .top-desc {
    font-size: 0.95rem;
    color: var(--txt, #fff);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .top-meta {
    font-size: 0.75rem;
    color: var(--txt3, #94a3b8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .top-valor {
    color: var(--error, #ef4444);
    font-weight: 600;
    font-size: 0.95rem;
    white-space: nowrap;
  }
  .export {
    margin-bottom: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }
  .btn-export {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem 1.25rem;
    background: var(--success, #10b981);
    color: #052e1c;
    border: 0;
    border-radius: 0.6rem;
    font-weight: 700;
    font-size: 1rem;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
  }
  .btn-export:hover,
  .btn-export:focus-visible {
    background: #34d399;
    transform: translateY(-1px);
    outline: none;
  }
  .btn-export:focus-visible {
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.45);
  }
  .btn-export:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
  .btn-ico {
    font-size: 1.125rem;
    line-height: 1;
  }
  .export-hint {
    margin: 0;
    text-align: center;
    font-size: 0.8125rem;
    color: var(--txt3, #94a3b8);
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
    color: var(--swatch, #10b981);
    font-size: 1.125rem;
  }
  @media (min-width: 640px) {
    .relatorios-page {
      padding: 2rem 1.5rem 3rem;
    }
    .chart-wrap.compare {
      height: 280px;
    }
    .chart-wrap.pie {
      height: 360px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .btn-export { transition: none; transform: none; }
  }
</style>
