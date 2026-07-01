<script lang="ts">
  // Course Theory — SWOT / TOWS / SCQA / Buyer Persona (V4 port of V3 #pg-course).
  // 4 framework cards, each links to the matching lesson.

  import { t } from 'svelte-i18n';

  interface Framework {
    id: string;
    icon: string;
    title: string;
    tagline: string;
    desc: string;
    accent: string;
    href: string;
  }

  const FRAMEWORKS: Framework[] = [
    {
      id: 'swot',
      icon: '🔍',
      title: 'SWOT',
      tagline: 'Diagnóstico 2×2',
      desc: 'Forças, fraquezas, oportunidades, ameaças. O retrato estratégico da Equivalenza: 528 lojas, 2/3 de margem, NPS 17, segmento dupe em queda.',
      accent: '#10b981',
      href: '/escola/curso/equivalenza/licao/swot/'
    },
    {
      id: 'tows',
      icon: '🎯',
      title: 'TOWS',
      tagline: 'SWOT × estratégia',
      desc: 'SO, WO, ST, WT — quatro tipos de estratégia que cruzam os quadrantes. A escolha que a Marta vai defender no Q5 do trabalho.',
      accent: '#f59e0b',
      href: '/escola/curso/equivalenza/licao/tows/'
    },
    {
      id: 'scqa',
      icon: '❓',
      title: 'SCQA',
      tagline: 'Enquadrar o problema',
      desc: 'Situation → Complication → Question → Answer. Onde a análise vira um problema de marketing formulado em 1-2 frases.',
      accent: '#3b82f6',
      href: '/escola/curso/equivalenza/licao/problem/'
    },
    {
      id: 'persona',
      icon: '👥',
      title: 'Buyer Persona',
      tagline: '3 camadas',
      desc: 'Demografia, psicografia, comportamento. Marta, 27 — The Discerning Explorer. A persona que ancora a recomendação estratégica.',
      accent: '#ec4899',
      href: '/escola/curso/equivalenza/licao/persona/'
    }
  ];
</script>

<svelte:head>
  <title>{$t('routes.course.title', { default: 'Course · Teoria' })} · Presuntinho</title>
</svelte:head>

<div class="course">
  <header class="course-head">
    <p class="breadcrumb">
      <a href="/">{$t('course.breadcrumb.home', { default: '← Hub' })}</a>
      <span class="sep">›</span>
      <span>{$t('course.breadcrumb.current', { default: 'Course' })}</span>
    </p>
    <span class="tag">{$t('routes.course.modulo_tag', { default: 'Módulo 2' })}</span>
    <h1>🎓 Course Theory</h1>
    <p class="sub">{$t('course.hero.subtitle', { default: 'SWOT, TOWS, SCQA, Buyer Persona — os quatro frameworks que precisas dominar.' })}</p>
  </header>

  <section class="grid" aria-label="{$t('a11y.aria.frameworks', { default: 'Frameworks' })}">
    {#each FRAMEWORKS as fw (fw.id)}
      <a
        class="fw-card"
        href={fw.href}
        style="--fw-accent: {fw.accent};"
      >
        <div class="fw-icon" aria-hidden="true">{fw.icon}</div>
        <div class="fw-body">
          <h2>{fw.title}</h2>
          <p class="fw-tagline">{fw.tagline}</p>
          <p class="fw-desc">{fw.desc}</p>
          <span class="fw-cta">{$t('routes.course.abrir_licao', { default: 'Abrir lição →' })}</span>
        </div>
      </a>
    {/each}
  </section>
</div>

<style>
  .course {
    max-width: 960px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .course-head { margin-bottom: 1.5rem; }
  .course-head h1 {
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
    background: rgba(139, 92, 246, 0.2);
    border: 1px solid rgba(139, 92, 246, 0.5);
    color: #ddd6fe;
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

  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  @media (min-width: 720px) {
    .grid { grid-template-columns: repeat(2, 1fr); }
  }

  .fw-card {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.25rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-left: 4px solid var(--fw-accent);
    border-radius: 0.75rem;
    color: #fff;
    text-decoration: none;
    transition: background 0.15s, transform 0.15s;
  }
  .fw-card:hover,
  .fw-card:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
    outline: none;
  }
  .fw-card:focus-visible {
    box-shadow: 0 0 0 2px var(--fw-accent);
  }
  .fw-icon { font-size: 2.25rem; line-height: 1; }
  .fw-body { flex: 1; min-width: 0; }
  .fw-body h2 {
    color: #fff;
    font-size: 1.25rem;
    margin: 0 0 0.2rem;
  }
  .fw-tagline {
    color: var(--fw-accent);
    font-size: 0.85rem;
    font-weight: 600;
    margin: 0 0 0.5rem;
  }
  .fw-desc {
    color: var(--txt2, #cbd5e1);
    font-size: 0.92rem;
    line-height: 1.5;
    margin: 0 0 0.75rem;
  }
  .fw-cta {
    color: var(--fw-accent);
    font-size: 0.85rem;
    font-weight: 600;
  }
</style>
