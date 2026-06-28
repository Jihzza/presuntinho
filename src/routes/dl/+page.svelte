<script lang="ts">
  // DL — Download Center (V4 port of V3 #pg-dl).
  // 4 download cards + a how-to-use card + a warning card.

  import { t } from 'svelte-i18n';
  // The DOWNLOADS data is already fully i18n-keyed (titleKey/descKey/extra[*].labelKey).
  // Hardcoded "Módulo 6" tag and page h1 "📥 Download Center" remain by design —
  // they are page-chrome labels that match every locale identically.

  interface Download {
    icon: string;
    titleKey: string;       // i18n key
    titleDefault: string;
    descKey: string;
    descDefault: string;
    size: string;
    href: string;
    accent: string;
    extra?: Array<{ labelKey: string; labelDefault: string; href: string; size?: string }>;
  }

  // Helper: human-readable size (no live fs access — sizes are stable, sourced
  // from `ls -lh` on the static/legacy tree).
  const SIZES = {
    pdf:       '162 KB',
    docx:      '2.2 MB',
    zip:       '1.7 MB',
    introSwot: '665 KB',
    persona:   '859 KB',
    tows:      '783 KB',
    audioEn:   '1.4 MB',
    audioPt:   '352 KB'
  };

  const DOWNLOADS: Download[] = [
    {
      icon: '📄',
      titleKey: 'dl.card.pdf.title',
      titleDefault: 'Assignment PDF',
      descKey: 'dl.card.pdf.desc',
      descDefault: 'O mid-term completo — 13 páginas, ~2000 palavras, referências Harvard, capa, TOC, matriz TOWS com código de cores, anexo com tabela de dados-chave e visual da buyer persona.',
      size: SIZES.pdf,
      href: '/legacy/docs/Equivalenza_Mid_Term_Fatma.pdf',
      accent: '#f59e0b'
    },
    {
      icon: '📝',
      titleKey: 'dl.card.docx.title',
      titleDefault: 'Versão Word editável',
      descKey: 'dl.card.docx.desc',
      descDefault: 'Mesmo conteúdo do PDF, editável. Usa este para reescreveres na tua voz antes de submeter.',
      size: SIZES.docx,
      href: '/legacy/docs/Equivalenza_Mid_Term_Fatma.docx',
      accent: '#8b5cf6'
    },
    {
      icon: '🎙️',
      titleKey: 'dl.card.audio.title',
      titleDefault: 'Audio walkthroughs (5 MP3)',
      descKey: 'dl.card.audio.desc',
      descDefault: 'Ouve enquanto revês. Voz em inglês (3 faixas) e versões de intro em inglês + PT.',
      size: `${SIZES.introSwot} + ${SIZES.persona} + ${SIZES.tows}`,
      href: '/legacy/assets/intro_swot.mp3',
      accent: '#06b6d4',
      extra: [
        { labelKey: 'dl.extra.swot',    labelDefault: '🎧 Secções 1+2 (SWOT + Persona)',                href: '/legacy/assets/intro_swot.mp3' },
        { labelKey: 'dl.extra.persona', labelDefault: '🎧 Secções 2+3 (Persona + Marketing Problem)',  href: '/legacy/assets/persona_problem.mp3' },
        { labelKey: 'dl.extra.tows',    labelDefault: '🎧 Secções 4+5 (TOWS + Recommendation)',        href: '/legacy/assets/tows_recommendation.mp3' },
        { labelKey: 'dl.extra.audioEn', labelDefault: '🎧 Intro completa (EN)',                         href: '/legacy/assets/audio_intro_en.mp3' },
        { labelKey: 'dl.extra.audioPt', labelDefault: '🎧 Intro completa (PT)',                         href: '/legacy/assets/audio_intro_pt-PT.mp3' }
      ]
    },
    {
      icon: '📦',
      titleKey: 'dl.card.zip.title',
      titleDefault: 'ZIP de deliverables (V3)',
      descKey: 'dl.card.zip.desc',
      descDefault: 'Tudo o que estava no ZIP original do V3 — PDFs, DOCX, MP3s, persona visual.',
      size: SIZES.zip,
      href: '/legacy/equivalenza-midterm-deliverables-V3.zip',
      accent: '#ec4899'
    }
  ];
</script>

<svelte:head>
  <title>{$t('routes.dl.title', { default: 'Downloads · Assignment Center' })} · Presuntinho</title>
</svelte:head>

<div class="dl">
  <header class="dl-head">
    <p class="breadcrumb">
      <a href="/">{$t('dl.breadcrumb.home', { default: '← Hub' })}</a>
      <span class="sep">›</span>
      <span>{$t('dl.breadcrumb.current', { default: 'Downloads' })}</span>
    </p>
    <span class="tag">Módulo 6</span>
    <h1>📥 Download Center</h1>
    <p class="sub">{$t('dl.sub', { default: 'Ficheiros do assignment e materiais de estudo.' })}</p>
  </header>

  <section class="grid" aria-label="{$t('a11y.aria.downloads', { default: 'Downloads' })}">
    {#each DOWNLOADS as d (d.titleKey)}
      <article class="dl-card" style="--dl-accent: {d.accent};">
        <div class="dl-head-row">
          <span class="dl-icon" aria-hidden="true">{d.icon}</span>
          <span class="dl-size">{d.size}</span>
        </div>
        <h2>{$t(d.titleKey, { default: d.titleDefault })}</h2>
        <p>{$t(d.descKey, { default: d.descDefault })}</p>
        <div class="dl-actions">
          <a class="btn primary" href={d.href} download>⬇ Descarregar</a>
          {#if d.extra}
            <details class="extras">
              <summary>+ outras faixas ({d.extra.length})</summary>
              <ul>
                {#each d.extra as e (e.href)}
                  <li>
                    <a href={e.href} download>{$t(e.labelKey, { default: e.labelDefault })}</a>
                  </li>
                {/each}
              </ul>
            </details>
          {/if}
        </div>
      </article>
    {/each}
  </section>

  <!-- How to use -->
  <article class="card info">
    <h2>{$t('dl.howto.h2', { default: '💡 Como usar o assignment' })}</h2>
    <p>{$t('dl.howto.p1', { default: '<strong>NÃO submetas exatamente como está.</strong> O objetivo é leres, perceberes a análise, e reescreveres na tua voz. Muda os exemplos, reordena parágrafos, acrescenta a tua perspetiva.' })}</p>
    <p>{$t('dl.howto.p2', { default: 'Isto garante: (1) o texto soa a ti, (2) passa o Turnitin, (3) consegues defender cada ponto oralmente.' })}</p>
  </article>

  <!-- Warning -->
  <article class="card warning">
    <h2>{$t('dl.warning.h2', { default: '⚠️ Lembrete importante' })}</h2>
    <p>{$t('dl.warning.p', { default: 'Q3 (Marketing Problem), Q4 (TOWS) e Q5 (Recommendation) <strong>não podem usar IA diretamente</strong>. Estas secções têm de ser inteiramente tuas. Usa este material para perceberes a metodologia e depois escreve sozinho/a.' })}</p>
  </article>

  <p class="footer-note" aria-hidden="true">🐷 Presuntinho — Built with ❤️ for Fatma</p>
</div>

<style>
  .dl {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .dl-head { margin-bottom: 1.5rem; }
  .dl-head h1 {
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
    background: rgba(245, 158, 11, 0.2);
    border: 1px solid rgba(245, 158, 11, 0.5);
    color: #fde68a;
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
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .dl-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-left: 4px solid var(--dl-accent);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }
  .dl-head-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  .dl-icon { font-size: 2rem; line-height: 1; }
  .dl-size {
    color: var(--txt3, #94a3b8);
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
  }
  .dl-card h2 {
    color: #fff;
    font-size: 1.15rem;
    margin: 0 0 0.4rem;
  }
  .dl-card p {
    color: var(--txt2, #cbd5e1);
    font-size: 0.92rem;
    line-height: 1.55;
    margin: 0 0 0.75rem;
  }
  .dl-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }
  .btn {
    display: inline-block;
    padding: 0.55rem 1.2rem;
    border-radius: 0.5rem;
    font: inherit;
    font-weight: 600;
    text-decoration: none;
    border: 1px solid transparent;
    transition: background 0.15s;
  }
  .btn.primary {
    background: var(--dl-accent);
    color: #fff;
  }
  .btn.primary:hover { filter: brightness(1.15); }

  .extras summary {
    cursor: pointer;
    color: var(--dl-accent);
    font-size: 0.88rem;
    font-weight: 600;
  }
  .extras ul {
    margin: 0.5rem 0 0;
    padding: 0 0 0 1rem;
    list-style: none;
  }
  .extras ul li { margin: 0.3rem 0; }
  .extras ul li a {
    color: var(--txt2, #cbd5e1);
    font-size: 0.88rem;
    text-decoration: none;
  }
  .extras ul li a:hover { color: var(--dl-accent); text-decoration: underline; }

  .card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    padding: 1.25rem;
    margin-bottom: 1rem;
  }
  .card.info    { border-left: 4px solid #3b82f6; }
  .card.warning { border-left: 4px solid var(--error, #ef4444); }
  .card h2 {
    color: #fff;
    font-size: 1.1rem;
    margin: 0 0 0.5rem;
  }
  .card p {
    color: var(--txt2, #cbd5e1);
    font-size: 0.92rem;
    line-height: 1.55;
    margin: 0.4rem 0;
  }

  .footer-note {
    text-align: center;
    color: var(--txt3, #94a3b8);
    font-size: 0.82rem;
    margin-top: 2rem;
  }
</style>
