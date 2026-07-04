<!--
  /financas — Dashboard do sub-app Finanças (Phase 6 + task-038).

  Mostra:
    * Hero 💰 Finanças + saudação ao mês corrente.
    * 3 cartões com os totais do mês (receitas / despesas / saldo).
    * Gráfico de barras (chart.js) com despesas dos últimos 6 meses.
    * Atalhos rápidos: Nova transação / Ver todas / Orçamento / Categorias
      / Relatórios / **Exportar JSON** (task-038).

  Task-038 additions (Finanças Pro):
    * 20-row seed in `src/lib/state/financas-seed.ts` wired through
      `ensureDefaults()` so the dashboard is populated for Fátma on
      first open (was 6 rows).
    * Empty state: SVG illustration + 3-step tutorial + first CTA when
      the user has zero transactions.
    * XP wire (idempotent per-day):
        - `financas_dashboard_first_view` (+2) on first open of the day
        - `transacao_add_*` already wired via /financas/nova
        - `financas_orcamento_meta_batida` (+50) handled by the
          orçamento evaluation flow.
    * Export JSON button → Blob + URL.createObjectURL + anchor click.
      Filename: `presuntinho-financas-YYYY-MM-DD.json`.
    * i18n keys added to pt-PT, en, tn, fr, ar.

  Carrega os totais via `totalMes()` + `totaisPorMesUltimos6()` no
  `onMount` (não no SSR — IndexedDB não existe em Node).
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { t, locale } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import {
    totalMes,
    totaisPorMesUltimos6,
    listTransacoesMes,
    getOrcamentoStatus,
    ensureCategoriasDefaults,
    ensureRecorrentes,
    getChartTheme,
    onThemeChange,
    formatMes,
    formatMesCurto,
    formatValor,
    formatValorCompacto,
    getMesAtual,
    type TotaisMes,
    type PontoMensal,
    type OrcamentoStatus
  } from '$lib/financas';
  import { subApps } from '$lib/registry';
  import { awardXP } from '$lib/state/xp-actions';
    import { showToast } from '$lib/components/events';
    import { db } from '$lib/state/db';
  import { useMoodState, moodMicrocopyHint } from '$lib/mood/useMoodState.svelte';

  // chart.js/auto regista todos os controllers + scales + elements
  // automaticamente.  Importado dinamicamente em onMount para evitar
  // SSR (chart.js acede a `document`/`window` na construção).
  let Chart: typeof import('chart.js/auto').Chart | null = $state(null);

  let totais = $state<TotaisMes>({ receitas: 0, despesas: 0, saldo: 0 });
  let pontos = $state<PontoMensal[]>([]);
  let orcamentoStatus = $state<OrcamentoStatus[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let canvas: HTMLCanvasElement | undefined = $state();
  let chartInstance: import('chart.js/auto').Chart | null = null;
  // True if the user has zero transactions this month.  Drives the
  // bigger "first-time" empty state vs the lighter "no expenses yet"
  // hint inside the chart card.
  let totalTransacoesMes = $state(0);
  let exporting = $state(false);
  const numberLocale = $derived($locale || 'pt-PT');

  let financasApp = subApps.find((a) => a.id === 'financas');
  const mesAtual = getMesAtual();
  const moodState = useMoodState();
  const sickHint = $derived(moodMicrocopyHint(moodState.mood?.kind ?? null));

  // V8: houve movimentos nos últimos 6 meses?  Se sim, o dashboard mostra
  // gráfico + totais mesmo com o mês corrente vazio (histórico continua útil).
  const temHistorico = $derived(pontos.some((p) => p.receitas > 0 || p.despesas > 0));

  // V8: chips de orçamento — só estados que merecem atenção.
  const budgetAlerts = $derived(
    orcamentoStatus.filter((row) => row.status !== 'ok').slice(0, 6)
  );

  // V8: "seguro gastar" = receitas do mês − despesas já feitas − o que
  // ainda está reservado nos orçamentos (restante > 0). Nunca alarmista:
  // é uma estimativa, e mostramos isso no copy.
  const reservadoOrcamento = $derived(
    orcamentoStatus.reduce((s, row) => s + Math.max(row.restante, 0), 0)
  );
  const safeToSpend = $derived(totais.receitas - totais.despesas - reservadoOrcamento);
  const temOrcamentos = $derived(orcamentoStatus.length > 0);

  onMount(() => {
    let unsubTheme: (() => void) | null = null;
    void (async () => {
      try {
        // Carrega chart.js só no browser (módulo pesado, depende de DOM).
        const mod = await import('chart.js/auto');
        Chart = mod.Chart;

        // V8: garantir categorias extra + materializar recorrentes deste
        // mês ANTES de calcular totais, para os números já as incluírem.
        try {
          await ensureCategoriasDefaults();
          await ensureRecorrentes(mesAtual);
        } catch (e) {
          console.warn('[financas] ensure defaults/recorrentes failed', e);
        }

        const [t, p, txMes, status] = await Promise.all([
          totalMes(mesAtual),
          totaisPorMesUltimos6(),
          listTransacoesMes(mesAtual),
          getOrcamentoStatus(mesAtual)
        ]);
        totais = t;
        pontos = p;
        totalTransacoesMes = txMes.length;
        orcamentoStatus = status;
        loading = false;

        // Render do gráfico acontece depois do `loading = false` para
        // o canvas já estar no DOM.  Usamos `tick()` (via await) para
        // garantir.
        await Promise.resolve();
        renderChart();

        // V8: re-render com a nova paleta quando o tema muda (data-theme
        // no <html> ou prefers-color-scheme no modo auto).
        unsubTheme = onThemeChange(() => renderChart());

        // XP wire — task-038.  Awarded once per calendar day per profile.
        // localStorage key is namespaced per profile so multiple dev
        // profiles don't double-fire on the same day.
        await maybeAwardFirstViewToday();
      } catch (e) {
        console.error('[financas] dashboard load failed', e);
        error = e instanceof Error ? e.message : 'Erro a carregar finanças';
        loading = false;
      }
    })();
    return () => {
      unsubTheme?.();
    };
  });

  onDestroy(() => {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  });

  /**
   * Award +2 XP for the first dashboard view of the day.
   *
   * Idempotency model:
   *   - We use localStorage key `financas-last-view:<profile>` carrying
   *     the YYYY-MM-DD string of the last award.
   *   - The same calendar day ⇒ no-op.
   *   - Different day ⇒ award +2 XP and update the stamp.
   *   - We don't share this with `transacao_*` XP (which is per-action),
   *     this is a separate "you opened the app and engaged with the
   *     dashboard" engagement reward.
   */
  async function maybeAwardFirstViewToday(): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    const today = new Date().toISOString().slice(0, 10);
    const stampKey = `financas-last-view:fatma`;
    const last = localStorage.getItem(stampKey);
    if (last === today) return;
    localStorage.setItem(stampKey, today);
    await awardXP('financas_dashboard_first_view');
  }

  /**
   * Export the entire `transacoes` table as a JSON file (task-038).
   *
   * Format:
   *   {
   *     "schema": "presuntinho-financas-v1",
   *     "exportedAt": "<ISO timestamp>",
   *     "locale": "<current locale>",
   *     "transacoes": [ { tipo, valor, categoria, descricao, data, createdAt }, ... ]
   *   }
   *
   * Filename: presuntinho-financas-YYYY-MM-DD.json (matches the export
   * convention used in /definicoes so users get a consistent naming).
   */
  async function exportFinancasJSON(): Promise<void> {
    if (exporting) return;
    exporting = true;
    try {
      const d = db();
      const transacoes = await d.transacoes.orderBy('data').reverse().toArray();
      const payload = {
        schema: 'presuntinho-financas-v1',
        exportedAt: new Date().toISOString(),
        locale: get(locale) ?? 'pt-PT',
        transacoes: transacoes.map((r) => ({
          id: r.id,
          tipo: r.tipo,
          valor: r.valor,
          categoria: r.categoria,
          descricao: r.descricao,
          data: r.data,
          createdAt: r.createdAt
        }))
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `presuntinho-financas-${today}.json`;
      a.setAttribute('aria-label', $t('financas.export.label'));
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Give the browser a beat to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast($t('financas.export.success'));
    } catch (e) {
      console.error('[financas] export failed', e);
      showToast('⚠️ ' + ($t('financas.error.load', { default: 'Erro a exportar' })));
    } finally {
      exporting = false;
    }
  }

  function renderChart(): void {
    if (!canvas || !Chart) return;
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    // V8: cores lidas das CSS custom properties do tema activo (nunca hex
    // fixo) + ticks compactos em ecrãs estreitos.
    const theme = getChartTheme();
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    chartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: pontos.map((p) => formatMesCurto(p.mes, numberLocale)),
        datasets: [
          {
            label: $t('financas.chart.datasetLabel.receitas', { default: 'Receitas' }),
            data: pontos.map((p) => p.receitas),
            backgroundColor: theme.successBg,
            borderColor: theme.success,
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 48
          },
          {
            label: $t('financas.chart.datasetLabel', { default: 'Despesas' }),
            data: pontos.map((p) => p.despesas),
            backgroundColor: theme.errorBg,
            borderColor: theme.error,
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
          legend: { display: true, position: 'top', labels: { color: theme.txt2 } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${formatValor(ctx.parsed.y ?? 0, numberLocale)}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: theme.txt2 },
            grid: { color: theme.grid }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: theme.txt2,
              maxTicksLimit: isMobile ? 5 : 7,
              callback: (val) =>
                isMobile
                  ? formatValorCompacto(Number(val), numberLocale)
                  : formatValor(Number(val), numberLocale)
            },
            grid: { color: theme.grid }
          }
        }
      }
    });
  }

  // Reactive: se os pontos chegarem antes do chart.js (raro mas possível
    // num refresh), re-renderiza.  Cobre o caso `loading = true` →
    // `loading = false` em que o chart.js já estava registado, e re-renderiza
    // também quando a língua muda (labels/formatters de eixo).
    $effect(() => {
      // Re-render quando os pontos OU a locale mudarem (mas só depois de o
      // chart estar pronto e de já termos saído de loading).
      const _ = pontos;
      const __ = Chart;
      const ___ = canvas;
      const ____ = loading;
      const _____ = numberLocale;
      if (!____ && __ && ___ && _.length > 0) {
        renderChart();
      }
    });
  </script>

<svelte:head>
  <title>{$t('routes.financas.title', { default: 'Finanças · Dashboard' })} · Presuntinho</title>
  <meta name="description" content={$t('routes.financas.meta.description', { default: 'Transações, orçamento e categorias' })} />
  <meta property="og:title" content={$t('routes.financas.meta.og_title', { default: 'Finanças · Dashboard' })} />
  <meta property="og:description" content={$t('routes.financas.meta.og_description', { default: 'Transações, orçamento e categorias' })} />
  <meta property="og:url" content="https://presuntinho.netlify.app/financas/" />
  <meta name="twitter:title" content={$t('routes.financas.meta.twitter_title', { default: 'Finanças · Dashboard' })} />
  <meta name="twitter:description" content={$t('routes.financas.meta.twitter_description', { default: 'Transações, orçamento e categorias' })} />
</svelte:head>

<div class="financas-page">
  <header class="hero">
    <h1>{$t('financas.hero.title', { default: '💰 Finanças' })}</h1>
    <p class="sub"><strong>{$t('financas.hero.sub', { values: { month: formatMes(mesAtual, numberLocale) }, default: 'Resumo de {month}' })}</strong></p>
    {#if sickHint}
      <p class="mood-hint" role="note" aria-live="polite">
        <span aria-hidden="true">🤍</span>
        {sickHint}
      </p>
    {/if}
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
  {:else if totalTransacoesMes === 0 && !temHistorico}
    <!-- Task-038 + V8: first-time empty state.  Shown only when the user
         has zero transactions in the current month AND no history in the
         last 6 months — with prior-month history we keep showing the
         chart/totals below instead of hiding everything. -->
    <section class="empty-hero" aria-label={$t('financas.empty.illustration_alt', { default: 'Ilustração' })}>
      <svg class="empty-illustration" viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={$t('financas.empty.illustration_alt', { default: 'Ilustração de um cofre de moedas' })}>
        <defs>
          <linearGradient id="bg-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#10b981" stop-opacity="0.18" />
            <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="240" height="160" fill="url(#bg-grad)" rx="12" />
        <!-- Coin jar -->
        <ellipse cx="120" cy="120" rx="60" ry="10" fill="rgba(255,255,255,0.05)" />
        <rect x="70" y="60" width="100" height="60" rx="10" fill="#0f766e" stroke="#34d399" stroke-width="2" />
        <rect x="78" y="48" width="84" height="16" rx="6" fill="#14b8a6" stroke="#34d399" stroke-width="2" />
        <!-- Coins inside -->
        <circle cx="95" cy="100" r="9" fill="#fbbf24" stroke="#f59e0b" stroke-width="1.5" />
        <circle cx="120" cy="105" r="11" fill="#fbbf24" stroke="#f59e0b" stroke-width="1.5" />
        <circle cx="145" cy="100" r="9" fill="#fbbf24" stroke="#f59e0b" stroke-width="1.5" />
        <text x="120" y="109" text-anchor="middle" font-size="12" font-weight="700" fill="#92400e">$</text>
        <!-- Arrows up -->
        <path d="M40 110 L40 70 L34 76 M40 70 L46 76" stroke="#34d399" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M200 120 L200 80 L194 86 M200 80 L206 86" stroke="#34d399" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <h2 class="empty-title">{$t('financas.empty.title', { default: 'Ainda não há despesas registadas' })}</h2>
      <p class="empty-sub">{$t('financas.empty.sub', { default: 'Adiciona a tua primeira transação para começares a ver gráficos e orçamento.' })}</p>
      <a class="empty-cta" href="/financas/nova/">{$t('financas.empty.cta', { default: '➕ Adicionar transação' })}</a>
      <ol class="empty-tutorial" aria-label={$t('financas.empty.tutorial.title', { default: 'Como começar' })}>
        <li class="empty-tutorial-title">{$t('financas.empty.tutorial.title', { default: 'Como começar em 30 segundos' })}</li>
        <li>{$t('financas.empty.tutorial.step1', { default: '1. Adiciona uma receita ou despesa' })}</li>
        <li>{$t('financas.empty.tutorial.step2', { default: '2. Define limites por categoria' })}</li>
        <li>{$t('financas.empty.tutorial.step3', { default: '3. Volta aqui todos os dias' })}</li>
      </ol>
    </section>
  {:else}
    <section class="cards" aria-label={$t('financas.cards.aria', { default: 'Totais do mês' })}>
      <article class="card card-receitas">
        <span class="card-label">{$t('financas.card.receitas', { default: 'Receitas' })}</span>
        <span class="card-value">{formatValor(totais.receitas, numberLocale)}</span>
        <span class="card-hint">
          {#if totais.receitas === 0}
            {$t('financas.card.receitas.empty', { default: 'ainda sem entradas — adiciona uma transação' })}
          {:else}
            {$t('financas.card.receitas.hint', { default: 'entradas no mês' })}
          {/if}
        </span>
      </article>
      <article class="card card-despesas">
        <span class="card-label">{$t('financas.card.despesas', { default: 'Despesas' })}</span>
        <span class="card-value">{formatValor(totais.despesas, numberLocale)}</span>
        <span class="card-hint">
          {#if totais.despesas === 0}
            {$t('financas.card.despesas.empty', { default: 'ainda sem saídas — bom sinal 👀' })}
          {:else}
            {$t('financas.card.despesas.hint', { default: 'saídas no mês' })}
          {/if}
        </span>
      </article>
      <article class="card card-saldo" class:negativo={totais.saldo < 0}>
        <span class="card-label">{$t('financas.card.saldo', { default: 'Saldo' })}</span>
        <span class="card-value">{formatValor(totais.saldo, numberLocale)}</span>
        <span class="card-hint">
          {#if totais.receitas === 0 && totais.despesas === 0}
            {$t('financas.card.saldo.neutral', { default: 'à espera de movimentos' })}
          {:else}
            {totais.saldo >= 0 ? $t('financas.card.saldo.positive', { default: 'a teu favor' }) : $t('financas.card.saldo.negative', { default: 'em défice' })}
          {/if}
        </span>
      </article>
    </section>

    <!-- V8: estado do orçamento + estimativa "seguro gastar" -->
    <section class="budget-status" aria-label={$t('financas.dashboard.budget.aria', { default: 'Estado do orçamento' })}>
      <div class="safe-card" class:negativo={temOrcamentos && safeToSpend < 0}>
        <span class="safe-label">{$t('financas.dashboard.safe.label', { default: 'Seguro gastar (estimativa)' })}</span>
        <span class="safe-value">{formatValor(Math.max(safeToSpend, 0), numberLocale)}</span>
        <span class="safe-hint">
          {#if !temOrcamentos}
            {$t('financas.dashboard.safe.no_budget', { default: 'Define limites no orçamento para uma estimativa mais fininha.' })}
          {:else if safeToSpend < 0}
            {$t('financas.dashboard.safe.tight', { default: 'Este mês está justinho — o orçamento já reservou o resto. Sem stress, é só para saberes.' })}
          {:else}
            {$t('financas.dashboard.safe.hint', { default: 'depois de despesas e do que o orçamento reservou' })}
          {/if}
        </span>
        {#if temOrcamentos}
          <a class="safe-link" href="/financas/orcamento/">{$t('financas.dashboard.safe.link', { default: 'Ver orçamento →' })}</a>
        {/if}
      </div>
      {#if budgetAlerts.length > 0}
        <ul class="budget-chips" aria-label={$t('financas.dashboard.budget.chips_aria', { default: 'Categorias perto do limite' })}>
          {#each budgetAlerts as row (row.categoria.id)}
            <li>
              <a class="budget-chip" data-status={row.status} href="/financas/orcamento/">
                <span aria-hidden="true">{row.categoria.icone}</span>
                <span class="chip-name">{row.categoria.nome}</span>
                <span class="chip-percent">{Math.round(row.percent)}%</span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="chart-section" aria-label={$t('financas.chart.fluxo.aria', { default: 'Receitas e despesas dos últimos 6 meses' })}>
      <h2 class="section-title">{$t('financas.chart.fluxo.title', { default: 'Receitas e despesas — últimos 6 meses' })}</h2>
      {#if pontos.length === 0 || pontos.every((p) => p.despesas === 0 && p.receitas === 0)}
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
      {#if !moodState.isSick && !moodState.isSoft}
        <a class="quick" href="/financas/nova/">
          <span class="quick-icon" aria-hidden="true">➕</span>
          <span class="quick-text">
            <span class="quick-title">{$t('financas.shortcuts.new.title', { default: 'Nova transação' })}</span>
            <span class="quick-sub">{$t('financas.shortcuts.new.sub', { default: 'Adicionar receita ou despesa' })}</span>
          </span>
        </a>
      {:else}
        <p class="mood-readonly" role="note">
          <span aria-hidden="true">🌿</span>
          {$t('financas.shortcuts.readonly_hint', { default: 'Modo cuidado: criação pausada — só leitura hoje.' })}
        </p>
      {/if}
      <a class="quick" href="/financas/transacoes/">
        <span class="quick-icon" aria-hidden="true">📋</span>
        <span class="quick-text">
          <span class="quick-title">{$t('financas.shortcuts.all.title', { default: 'Ver todas' })}</span>
          <span class="quick-sub">{$t('financas.shortcuts.all.sub', { default: 'Histórico completo' })}</span>
        </span>
      </a>
      <a class="quick" href="/financas/metas/">
        <span class="quick-icon" aria-hidden="true">🎯</span>
        <span class="quick-text">
          <span class="quick-title">{$t('financas.metas.title', { default: 'Metas de poupança' })}</span>
          <span class="quick-sub">{$t('financas.metas.shortcut.sub', { default: 'Sonhos com barra de progresso' })}</span>
        </span>
      </a>
      <a class="quick" href="/financas/orcamento/">
        <span class="quick-icon" aria-hidden="true">📊</span>
        <span class="quick-text">
          <span class="quick-title">{$t('financas.shortcuts.budget.title', { default: 'Orçamento' })}</span>
          <span class="quick-sub">{$t('financas.shortcuts.budget.sub', { default: 'Limites por categoria' })}</span>
        </span>
      </a>
      <a class="quick" href="/financas/categorias/">
        <span class="quick-icon" aria-hidden="true">🏷️</span>
        <span class="quick-text">
          <span class="quick-title">{$t('financas.shortcuts.categorias.title', { default: 'Categorias' })}</span>
          <span class="quick-sub">{$t('financas.shortcuts.categorias.sub', { default: 'Gerir taxonomia' })}</span>
        </span>
      </a>
      <a class="quick" href="/financas/relatorios/">
        <span class="quick-icon" aria-hidden="true">📊</span>
        <span class="quick-text">
          <span class="quick-title">{$t('financas.relatorios.title', { default: 'Relatórios' })}</span>
          <span class="quick-sub">{$t('financas.relatorios.sub', { default: 'Pie · top 5 · comparativo · CSV' })}</span>
        </span>
      </a>
      <!-- Task-038: Export JSON button — same Blob+URL.createObjectURL
           pattern used in /definicoes for full-backup export. -->
      <button
        type="button"
        class="quick export-btn"
        onclick={exportFinancasJSON}
        disabled={exporting}
        aria-label={$t('financas.export.label', { default: 'Descarregar todas as transações como ficheiro JSON' })}
      >
        <span class="quick-icon" aria-hidden="true">⬇️</span>
        <span class="quick-text">
          <span class="quick-title">{$t('financas.export.button', { default: '⬇️ Exportar JSON' })}</span>
          <span class="quick-sub">{$t('financas.export.label', { default: 'Descarregar todas as transações como ficheiro JSON' })}</span>
        </span>
      </button>
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
  .mood-hint {
    margin: 0.8rem auto 0;
    padding: 0.55rem 0.85rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--mood-accent, #60a5fa) 18%, rgba(255,255,255,.85));
    color: var(--txt, #1f2e4a);
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.86rem;
    border: 1px solid color-mix(in srgb, var(--mood-accent, #60a5fa) 35%, rgba(255,255,255,.4));
  }
  .mood-readonly {
    margin: 0 0 0.85rem 0;
    padding: 0.7rem 0.9rem;
    border-radius: 0.9rem;
    background: color-mix(in srgb, var(--mood-accent, #60a5fa) 14%, rgba(255,255,255,.6));
    color: var(--txt, #1f2e4a);
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    grid-column: 1 / -1;
    border: 1px dashed color-mix(in srgb, var(--mood-accent, #60a5fa) 40%, rgba(255,255,255,.5));
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
    color: var(--on-accent, #fff);
    border-radius: 0.5rem;
    font-weight: 600;
    text-decoration: none;
    transition: transform var(--motion-fast, 120ms) ease, filter var(--motion-base, 220ms) ease;
  }
  .empty-cta:hover, .empty-cta:focus-visible {
    filter: brightness(1.08);
    transform: translateY(-1px);
    outline: none;
  }

  /* ---- Task-038: first-time empty hero ---- */
  .empty-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.5rem;
    padding: 1.25rem 1rem 1.75rem;
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    margin-bottom: 1.5rem;
  }
  .empty-illustration {
    width: 240px;
    height: 160px;
    max-width: 100%;
    height: auto;
  }
  .empty-tutorial {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    text-align: left;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    color: var(--txt2, #cbd5e1);
    font-size: 0.9rem;
    max-width: 28rem;
  }
  .empty-tutorial-title {
    font-weight: 700;
    color: var(--txt, #fff);
    margin-bottom: 0.25rem;
    font-size: 0.95rem;
    list-style: none;
  }

  .cards {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
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
  /* ---- V8: estado do orçamento + seguro gastar ---- */
  .budget-status {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 0.75rem);
    margin-bottom: 1.5rem;
  }
  .safe-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-left: 4px solid var(--success);
    border-radius: var(--radius-lg, 0.75rem);
    padding: 1.125rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .safe-card.negativo {
    border-left-color: var(--warning);
  }
  .safe-label {
    font-size: var(--fs-xs, 0.8125rem);
    color: var(--txt3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }
  .safe-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--txt);
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .safe-hint {
    font-size: var(--fs-xs, 0.8125rem);
    color: var(--txt3);
  }
  .safe-link {
    margin-top: 0.25rem;
    font-size: var(--fs-sm, 0.875rem);
    color: var(--success);
    text-decoration: none;
    font-weight: 600;
    width: fit-content;
  }
  .safe-link:hover,
  .safe-link:focus-visible {
    text-decoration: underline;
    outline: none;
  }
  .budget-chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .budget-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.25rem;
    padding: 0.375rem 0.75rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--warning) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--warning) 40%, transparent);
    color: var(--txt);
    font-size: var(--fs-sm, 0.875rem);
    font-weight: 600;
    text-decoration: none;
    transition: transform var(--motion-fast, 120ms) ease;
  }
  .budget-chip:hover,
  .budget-chip:focus-visible {
    transform: translateY(-1px);
    outline: none;
  }
  .budget-chip:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--warning) 35%, transparent);
  }
  .budget-chip[data-status='danger'],
  .budget-chip[data-status='over'] {
    background: color-mix(in srgb, var(--error) 14%, transparent);
    border-color: color-mix(in srgb, var(--error) 40%, transparent);
  }
  .budget-chip[data-status='danger']:focus-visible,
  .budget-chip[data-status='over']:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--error) 35%, transparent);
  }
  .chip-name {
    max-width: 12ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip-percent {
    color: var(--warning);
    font-variant-numeric: tabular-nums;
  }
  .budget-chip[data-status='danger'] .chip-percent,
  .budget-chip[data-status='over'] .chip-percent {
    color: var(--error);
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
    max-width: 100%; /* task-034: defensive against Chart.js overshoot */
    height: 260px;
  }
  .quick-links {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
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
    font-family: inherit;
    font-size: inherit;
    text-align: left;
    cursor: pointer;
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
  .export-btn {
    border-left: 4px solid var(--accent, #ec4899);
  }
  .export-btn[disabled] {
    opacity: 0.6;
    cursor: progress;
    transform: none;
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