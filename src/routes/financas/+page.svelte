<!--
  /financas — Dashboard do sub-app Finanças (Phase 6).

  Mostra:
    * Hero 💰 Finanças + saudação ao mês corrente.
    * 3 cartões com os totais do mês (receitas / despesas / saldo).
    * Gráfico de barras (chart.js) com despesas dos últimos 6 meses.
    * Atalhos rápidos: Nova transação / Ver todas / Orçamento.

  Carrega os totais via `totalMes()` + `totaisPorMesUltimos6()` no
  `onMount` (não no SSR — IndexedDB não existe em Node).
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import {
    totalMes,
    totaisPorMesUltimos6,
    formatMes,
    formatMesCurto,
    formatValor,
    getMesAtual,
    type TotaisMes,
    type PontoMensal
  } from '$lib/financas';
  import { subApps } from '$lib/registry';

  // chart.js/auto regista todos os controllers + scales + elements
  // automaticamente.  Importado dinamicamente em onMount para evitar
  // SSR (chart.js acede a `document`/`window` na construção).
  let Chart: typeof import('chart.js/auto').Chart | null = $state(null);

  let totais = $state<TotaisMes>({ receitas: 0, despesas: 0, saldo: 0 });
  let pontos = $state<PontoMensal[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let canvas: HTMLCanvasElement | undefined = $state();
  let chartInstance: import('chart.js/auto').Chart | null = null;

  const financasApp = subApps.find((a) => a.id === 'financas');
  const mesAtual = getMesAtual();

  onMount(() => {
    void (async () => {
      try {
        // Carrega chart.js só no browser (módulo pesado, depende de DOM).
        const mod = await import('chart.js/auto');
        Chart = mod.Chart;

        const [t, p] = await Promise.all([totalMes(mesAtual), totaisPorMesUltimos6()]);
        totais = t;
        pontos = p;
        loading = false;

        // Render do gráfico acontece depois do `loading = false` para
        // o canvas já estar no DOM.  Usamos `tick()` (via await) para
        // garantir.
        await Promise.resolve();
        renderChart();
      } catch (e) {
        console.error('[financas] dashboard load failed', e);
        error = e instanceof Error ? e.message : 'Erro a carregar finanças';
        loading = false;
      }
    })();
  });

  onDestroy(() => {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  });

  function renderChart(): void {
    if (!canvas || !Chart) return;
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    chartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: pontos.map((p) => formatMesCurto(p.mes)),
        datasets: [
          {
            label: 'Despesas',
            data: pontos.map((p) => p.despesas),
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderColor: 'rgba(239, 68, 68, 1)',
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 48
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${formatValor(ctx.parsed.y ?? 0)}`
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

  // Reactive: se os pontos chegarem antes do chart.js (raro mas possível
  // num refresh), re-renderiza.  Cobre o caso `loading = true` →
  // `loading = false` em que o chart.js já estava registado.
  $effect(() => {
    // Re-render quando os pontos mudarem (mas só depois de o chart estar
    // pronto e de já termos saído de loading).
    const _ = pontos;
    const __ = Chart;
    const ___ = canvas;
    const ____ = loading;
    if (!____ && __ && ___ && _.length > 0) {
      renderChart();
    }
  });
</script>

<svelte:head>
  <title>{$t('routes.financas.title', { default: 'Finanças · Dashboard' })} · Presuntinho</title>
  <meta name="description" content="Transações, orçamento e categorias" />
  <meta property="og:title" content="Finanças · Dashboard" />
  <meta property="og:description" content="Transações, orçamento e categorias" />
  <meta property="og:url" content="https://presuntinho.netlify.app/financas/" />
  <meta name="twitter:title" content="Finanças · Dashboard" />
  <meta name="twitter:description" content="Transações, orçamento e categorias" />
</svelte:head>

<div class="financas-page">
  <header class="hero">
    <h1>{$t('financas.hero.title', { default: '💰 Finanças' })}</h1>
    <p class="sub">{$t('financas.hero.sub', { default: 'Resumo de' })} <strong>{formatMes(mesAtual)}</strong></p>
  </header>

  <nav class="crumbs" aria-label={$t('financas.crumbs.aria', { default: 'Caminho de navegação' })}>
    <a href="/">{$t('financas.crumbs.home', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('financas.crumbs.current', { default: 'Finanças' })}</span>
  </nav>

  {#if loading}
    <p class="empty">{$t('financas.loading', { default: 'A carregar…' })}</p>
  {:else if error}
    <p class="empty error" role="alert">⚠️ {error}</p>
  {:else}
    <section class="cards" aria-label={$t('financas.cards.aria', { default: 'Totais do mês' })}>
      <article class="card card-receitas">
        <span class="card-label">{$t('financas.card.receitas', { default: 'Receitas' })}</span>
        <span class="card-value">{formatValor(totais.receitas)}</span>
        <span class="card-hint">{$t('financas.card.receitas.hint', { default: 'entradas no mês' })}</span>
      </article>
      <article class="card card-despesas">
        <span class="card-label">{$t('financas.card.despesas', { default: 'Despesas' })}</span>
        <span class="card-value">{formatValor(totais.despesas)}</span>
        <span class="card-hint">{$t('financas.card.despesas.hint', { default: 'saídas no mês' })}</span>
      </article>
      <article class="card card-saldo" class:negativo={totais.saldo < 0}>
        <span class="card-label">{$t('financas.card.saldo', { default: 'Saldo' })}</span>
        <span class="card-value">{formatValor(totais.saldo)}</span>
        <span class="card-hint">
          {totais.saldo >= 0 ? $t('financas.card.saldo.positive', { default: 'a teu favor' }) : $t('financas.card.saldo.negative', { default: 'em défice' })}
        </span>
      </article>
    </section>

    <section class="chart-section" aria-label={$t('financas.chart.aria', { default: 'Despesas dos últimos 6 meses' })}>
      <h2 class="section-title">{$t('financas.chart.title', { default: 'Despesas — últimos 6 meses' })}</h2>
      {#if pontos.length === 0 || pontos.every((p) => p.despesas === 0)}
        <div class="empty-state" role="status">
          <span class="empty-icon" aria-hidden="true">💸</span>
          <p class="empty-title">{$t('financas.empty.title', { default: 'Ainda não há despesas registadas' })}</p>
          <p class="empty-sub">{$t('financas.empty.sub', { default: 'Adiciona a tua primeira transação para começares a ver gráficos e orçamento.' })}</p>
          <a class="empty-cta" href="/financas/nova/">{$t('financas.empty.cta', { default: '➕ Adicionar transação' })}</a>
        </div>
      {:else}
        <div class="chart-wrap">
          <canvas bind:this={canvas} aria-label={$t('financas.chart.canvas_aria', { default: 'Gráfico de despesas mensais' })}></canvas>
        </div>
      {/if}
    </section>

    <section class="quick-links" aria-label={$t('financas.shortcuts.aria', { default: 'Atalhos' })}>
      <a class="quick" href="/financas/nova/">
        <span class="quick-icon" aria-hidden="true">➕</span>
        <span class="quick-text">
          <span class="quick-title">{$t('financas.shortcuts.new.title', { default: 'Nova transação' })}</span>
          <span class="quick-sub">{$t('financas.shortcuts.new.sub', { default: 'Adicionar receita ou despesa' })}</span>
        </span>
      </a>
      <a class="quick" href="/financas/transacoes/">
        <span class="quick-icon" aria-hidden="true">📋</span>
        <span class="quick-text">
          <span class="quick-title">{$t('financas.shortcuts.all.title', { default: 'Ver todas' })}</span>
          <span class="quick-sub">{$t('financas.shortcuts.all.sub', { default: 'Histórico completo' })}</span>
        </span>
      </a>
      <a class="quick" href="/financas/orcamento/">
        <span class="quick-icon" aria-hidden="true">📊</span>
        <span class="quick-text">
          <span class="quick-title">{$t('financas.shortcuts.budget.title', { default: 'Orçamento' })}</span>
          <span class="quick-sub">{$t('financas.shortcuts.budget.sub', { default: 'Limites por categoria' })}</span>
        </span>
      </a>
    </section>
  {/if}

  {#if financasApp}
    <footer class="page-footer" aria-hidden="true">
      <span style="--swatch: {financasApp.color}">{financasApp.icon}</span>
      <span>{$t('financas.footer.subapp', { default: 'Sub-app #{n} no hub' }).replace('{n}', String(financasApp.order))}</span>
    </footer>
  {/if}
</div>

<style>
  .financas-page {
    max-width: 880px;
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
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem 1rem;
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px dashed var(--border, rgba(255, 255, 255, 0.2));
    border-radius: 0.75rem;
    text-align: center;
  }
  .empty-icon { font-size: 2.5rem; }
  .empty-title { margin: 0; color: var(--txt, #fff); font-weight: 600; font-size: 1.1rem; }
  .empty-sub { margin: 0; color: var(--txt2, #cbd5e1); font-size: 0.95rem; max-width: 32ch; }
  .empty-cta {
    margin-top: 0.75rem;
    display: inline-block;
    padding: 0.6rem 1.2rem;
    background: var(--success, #10b981);
    color: #052e1c;
    border-radius: 0.5rem;
    font-weight: 600;
    text-decoration: none;
    transition: transform 0.15s ease, background 0.2s ease;
  }
  .empty-cta:hover, .empty-cta:focus-visible {
    background: #34d399;
    transform: translateY(-1px);
    outline: none;
  }
  .cards {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }
  .card {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-left: 4px solid var(--success, #10b981);
    border-radius: 0.75rem;
    padding: 1.125rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .card-receitas {
    border-left-color: var(--success, #10b981);
  }
  .card-despesas {
    border-left-color: var(--error, #ef4444);
  }
  .card-saldo {
    border-left-color: var(--accent, #ec4899);
  }
  .card-saldo.negativo {
    border-left-color: var(--warning, #f59e0b);
  }
  .card-label {
    font-size: 0.8125rem;
    color: var(--txt3, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }
  .card-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--txt, #fff);
    line-height: 1.1;
  }
  .card-hint {
    font-size: 0.8125rem;
    color: var(--txt3, #94a3b8);
  }
  .section-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3, #94a3b8);
    margin: 0 0 0.75rem 0.25rem;
    font-weight: 600;
  }
  .chart-section {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1rem 1rem 1.25rem;
    margin-bottom: 1.5rem;
  }
  .chart-wrap {
    position: relative;
    width: 100%;
    height: 260px;
  }
  .quick-links {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
  .quick {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.125rem;
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    text-decoration: none;
    color: var(--txt, #fff);
    transition: background 0.15s, transform 0.15s;
  }
  .quick:hover,
  .quick:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
    outline: none;
  }
  .quick-icon {
    font-size: 1.75rem;
    line-height: 1;
    flex-shrink: 0;
    width: 2.5rem;
    text-align: center;
  }
  .quick-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }
  .quick-title {
    font-size: 1.0625rem;
    font-weight: 600;
  }
  .quick-sub {
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
    .financas-page {
      padding: 2rem 1.5rem 3rem;
    }
    .hero h1 {
      font-size: 2.5rem;
    }
    .cards {
      grid-template-columns: repeat(3, 1fr);
    }
    .chart-wrap {
      height: 300px;
    }
    .quick-links {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .quick { transition: none; transform: none; }
  }
</style>
