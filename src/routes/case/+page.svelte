<script lang="ts">
  // Case — Equivalenza Deep Dive (V4 port of V3 #pg-case).
  // Pt-PT throughout. V4 design tokens (navy + accent pink).

  import { t } from 'svelte-i18n';

  // Overview table data (V3 lines 95-102). Values resolve via $t() with PT fallback.
    const OVERVIEW: Array<{ labelKey: string; valueKey: string }> = [
      { labelKey: 'case.overview.empresa',   valueKey: 'case.overview.empresa.value' },
      { labelKey: 'case.overview.fundada',   valueKey: 'case.overview.fundada.value' },
      { labelKey: 'case.overview.categoria', valueKey: 'case.overview.categoria.value' },
      { labelKey: 'case.overview.modelo',    valueKey: 'case.overview.modelo.value' },
      { labelKey: 'case.overview.ceo',       valueKey: 'case.overview.ceo.value' },
      { labelKey: 'case.overview.ebitda',    valueKey: 'case.overview.ebitda.value' }
    ];

  // Three Forces (V3 lines 124-130). Each title/text resolves via $t() with PT fallback.
  const FORCES = [
    {
      titleKey: 'case.forces.1.title',
      titleDefault: '1. Colapso do segmento dupe',
      textKey: 'case.forces.1.text',
      textDefault: 'O segmento espanhol de dupes caiu de 37% para 13% dos consumidores entre 2018 e 2023 — uma queda de 65% no mercado core da Equivalenza.'
    },
    {
      titleKey: 'case.forces.2.title',
      titleDefault: '2. Efeito sanduíche',
      textKey: 'case.forces.2.text',
      textDefault: 'Marcas premium a descontarem por cima (mais acessíveis). Zara e Mercadona a melhorar por baixo (mais aspiracionais). Equivalenza espremida no meio.'
    },
    {
      titleKey: 'case.forces.3.title',
      titleDefault: '3. Competidores digitais nativos',
      textKey: 'case.forces.3.text',
      textDefault: 'Divain, Dossier, Adopt — operam sem custos físicos e investem mais em marketing por cada euro de receita.'
    }
  ];

  // Competitor: Divain (V3 lines 134-139)
  const DIVAIN = {
    strengths: [
      'Sem custo de retalho físico → custos mais baixos, mais investimento em marketing por €',
      'Identidade visual contemporânea e limpa que apela aos mais jovens',
      'Marketing forte em Instagram/TikTok com influencers',
      'Lançamentos ágeis sem alinhamento de franchising'
    ],
    weaknesses: [
      'Sem presença física — elimina a experiência sensorial',
      'Sem modelo de refill — falta o mecanismo de receita recorrente',
      'Aquisição de clientes muito dependente de social pago (custos crescentes)'
    ]
  };

  // Persona — The Discerning Explorer (V3 lines 143-148)
  const PERSONA = {
    quote: '"Fragrance is personal self-expression, not luxury or gift."',
    cite: '— Elson (2024)',
    values: [
      'Descoberta e rotação por humor / ocasião / estação',
      'Estética — packaging, design da loja, identidade visual',
      'Estar à frente das tendências',
      '€20-40 por algo especial (não preços de designer)'
    ]
  };
</script>

<svelte:head>
  <title>{$t('routes.case.title', { default: 'Case · Equivalenza Deep Dive' })} · Presuntinho</title>
</svelte:head>

<div class="case">
  <header class="case-head">
    <p class="breadcrumb">
      <a href="/">{$t('case.breadcrumb.home', { default: '← Hub' })}</a>
      <span class="sep">›</span>
      <span>{$t('case.breadcrumb.current', { default: 'Case' })}</span>
    </p>
    <span class="tag">{$t('case.tag.modulo', { default: 'Módulo 1' })}</span>
    <h1>{$t('case.h1', { default: '📊 Equivalenza: Deep Dive' })}</h1>
    <p class="sub">{$t('case.subtitle', { default: 'Tudo o que precisas saber sobre a empresa, o mercado e a concorrência.' })}</p>
  </header>

  <!-- Company Overview ------------------------------------------------- -->
  <section class="card" aria-labelledby="ov-h">
    <h2 id="ov-h">{$t('case.h2.overview', { default: '📋 Visão geral da empresa' })}</h2>
    <div class="table-wrap">
      <table class="overview">
        <tbody>
          {#each OVERVIEW as row (row.labelKey)}
            <tr>
              <th scope="row">{$t(row.labelKey, { default: row.labelKey })}</th>
              <td>{$t(row.valueKey, { default: row.valueKey })}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <!-- The Decline ------------------------------------------------------ -->
  <section class="card" aria-labelledby="dec-h">
    <h2 id="dec-h">{$t('case.h2.decline', { default: '📉 O declínio' })}</h2>
    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-value">€60M</div>
        <div class="kpi-label">{$t('case.kpi.sales2015', { default: 'Pico de vendas em 2015' })}</div>
      </div>
      <div class="kpi">
        <div class="kpi-value">810</div>
        <div class="kpi-label">{$t('case.kpi.storesPeak', { default: 'Lojas no pico' })}</div>
      </div>
      <div class="kpi danger">
        <div class="kpi-value">−35%</div>
        <div class="kpi-label">{$t('case.kpi.lost', { default: 'Lojas perdidas até 2023' })}</div>
      </div>
    </div>
  </section>

  <!-- Three Forces ----------------------------------------------------- -->
  <section class="card" aria-labelledby="forces-h">
    <h2 id="forces-h">{$t('case.h2.forces', { default: '🎯 As três forças' })}</h2>
    {#each FORCES as f (f.titleKey)}
      <h3>{$t(f.titleKey, { default: f.titleDefault })}</h3>
      <p>{$t(f.textKey, { default: f.textDefault })}</p>
    {/each}
  </section>

  <!-- Competitor: Divain ---------------------------------------------- -->
  <section class="card" aria-labelledby="div-h">
    <h2 id="div-h">{$t('case.h2.divain', { default: '🏢 Concorrente: Divain' })}</h2>
    <p><strong>{$t('case.divain.why', { default: 'Porquê esta escolha:' })}</strong> {$t('case.divain.why.text', { default: 'a ameaça estrutural mais directa. Mesmo price point (€15-30). Modelo digital-first.' })}</p>
    <h3>{$t('case.h3.strengths', { default: 'Forças' })}</h3>
    <ul>
      {#each DIVAIN.strengths as s (s)}
        <li>{s}</li>
      {/each}
    </ul>
    <h3>{$t('case.h3.weaknesses', { default: 'Fraquezas' })}</h3>
    <ul>
      {#each DIVAIN.weaknesses as w (w)}
        <li>{w}</li>
      {/each}
    </ul>
  </section>

  <!-- The Discerning Explorer ----------------------------------------- -->
  <section class="card" aria-labelledby="pers-h">
    <h2 id="pers-h">{$t('case.h2.persona', { default: '👤 The Discerning Explorer' })}</h2>
    <p><strong>Marta, 27.</strong> {$t('case.persona.intro', { default: 'Profissional criativa em Madrid. Rendimento moderado-a-bom. Universitária, urbana, socialmente ativa.' })}</p>
    <blockquote class="quote">{PERSONA.quote}</blockquote>
    <p class="cite">{PERSONA.cite}</p>
    <h3>{$t('case.tagline', { default: 'O que ela valoriza' })}</h3>
    <ul>
      {#each PERSONA.values as v (v)}
        <li>{v}</li>
      {/each}
    </ul>
  </section>

  <div class="cta">
    <a href="/course/" class="btn primary">{$t('case.cta.next', { default: 'Seguinte: Course Theory →' })}</a>
  </div>
</div>

<style>
  .case {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .case-head { margin-bottom: 1.5rem; }
  .case-head h1 {
    color: #fff;
    margin: 0.25rem 0 0.5rem;
    font-size: 2rem;
  }
  .breadcrumb {
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    margin: 0 0 0.5rem;
  }
  .breadcrumb a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }

  .tag {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    background: rgba(59, 130, 246, 0.25);
    border: 1px solid rgba(59, 130, 246, 0.5);
    color: #bfdbfe;
    border-radius: 999px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }
  .sub {
    color: var(--txt2, #cbd5e1);
    margin: 0;
  }

  .card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    padding: 1.25rem 1.25rem;
    margin-bottom: 1rem;
  }
  .card h2 {
    color: #fff;
    font-size: 1.25rem;
    margin: 0 0 0.75rem;
  }
  .card h3 {
    color: #fff;
    font-size: 1rem;
    margin: 1rem 0 0.4rem;
  }
  .card p {
    color: var(--txt2, #cbd5e1);
    line-height: 1.55;
    margin: 0.5rem 0;
  }
  .card ul {
    color: var(--txt2, #cbd5e1);
    margin: 0.5rem 0 0.5rem 1.25rem;
    padding: 0;
  }
  .card ul li { margin: 0.3rem 0; }

  /* Overview table (task-034: wrap in .table-wrap on the markup side,
     add overflow-wrap defensive rule here so long pt-PT labels break
     gracefully instead of pushing the table wider than the .card). */
  .overview {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
    table-layout: fixed; /* predictable column widths on narrow phones */
  }
  .overview th,
  .overview td {
    padding: 0.4rem 0.5rem;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .overview th {
    color: var(--accent, #ec4899);
    font-weight: 600;
    width: 40%;
  }
  .overview td { color: var(--txt2, #cbd5e1); }

  /* KPIs */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
    margin-top: 0.5rem;
  }
  .kpi {
    text-align: center;
    padding: 1rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
  }
  .kpi.danger {
    background: rgba(239, 68, 68, 0.18);
  }
  .kpi-value {
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--accent, #ec4899);
    line-height: 1.1;
  }
  .kpi.danger .kpi-value { color: #fca5a5; }
  .kpi-label {
    font-size: 0.75rem;
    color: var(--txt3, #94a3b8);
    margin-top: 0.25rem;
  }

  /* Quote */
  .quote {
    margin: 0.75rem 0 0.25rem;
    padding: 0.5rem 0.75rem;
    border-left: 3px solid var(--accent, #ec4899);
    color: var(--txt2, #cbd5e1);
    font-style: italic;
  }
  .cite {
    font-size: 0.82rem;
    color: var(--txt3, #94a3b8);
    margin: 0 0 0.75rem;
  }

  /* CTA */
  .cta {
    text-align: center;
    margin-top: 1.5rem;
  }
  .btn {
    display: inline-block;
    padding: 0.65rem 1.4rem;
    border-radius: 0.5rem;
    font: inherit;
    font-weight: 600;
    text-decoration: none;
    border: 1px solid transparent;
    transition: background 0.15s;
  }
  .btn.primary {
    background: var(--accent, #ec4899);
    color: #fff;
  }
  .btn.primary:hover { background: #d63780; }

  @media (max-width: 480px) {
    .kpi-grid { grid-template-columns: minmax(0, 1fr); }
  }
</style>
