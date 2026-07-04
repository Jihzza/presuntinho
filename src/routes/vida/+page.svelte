<!--
  /vida — Landing tab for the footer "Vida" entry.

  Vida is the umbrella for the personal-life sub-apps: Finanças (/financas),
  Hábitos (/habitos), Humor (/humor), Memórias (/memorias) and Vícios
  (planned under IA-S4 / task-094).
-->
<script lang="ts">
  import { t } from 'svelte-i18n';
</script>

<svelte:head>
  <title>{$t('nav.vida', { default: 'Vida' })} — Presuntinho</title>
</svelte:head>

<section class="vida">
  <header class="vida-hero">
    <span class="vida-icon" aria-hidden="true">🌿</span>
    <h1>{$t('nav.vida', { default: 'Vida' })}</h1>
    <p class="vida-sub">{$t('vida.subtitle_v8', { default: 'O teu cantinho pessoal: finanças, hábitos, humor e memórias.' })}</p>
  </header>

  <a href="/escola/" class="vida-featured" data-sveltekit-preload-data>
    <span class="vida-featured-icon" aria-hidden="true">📚</span>
    <span class="vida-featured-text">
      <span class="vida-featured-title">{$t('nav.escola', { default: 'Escola' })}</span>
      <span class="vida-featured-desc">{$t('vida.escola.desc', { default: 'Cursos, lições, trabalhos e caderno — o teu cantinho de estudo.' })}</span>
    </span>
    <span class="vida-featured-arrow" aria-hidden="true">→</span>
  </a>

  <nav class="vida-chips" aria-label={$t('vida.escola.chips.aria', { default: 'Atalhos da escola' })}>
    <a href="/trabalhos/" class="vida-chip" data-sveltekit-preload-data>
      <span aria-hidden="true">📝</span>
      <span>{$t('nav.trabalhos', { default: 'Trabalhos' })}</span>
    </a>
    <a href="/biblioteca/" class="vida-chip" data-sveltekit-preload-data>
      <span aria-hidden="true">📖</span>
      <span>{$t('nav.biblioteca', { default: 'Biblioteca' })}</span>
    </a>
    <a href="/escola/caderno/" class="vida-chip" data-sveltekit-preload-data>
      <span aria-hidden="true">📓</span>
      <span>{$t('school.notebook.title', { default: 'Caderno' })}</span>
    </a>
  </nav>

  <ul class="vida-grid">
    <li>
      <a href="/financas/" class="vida-card" data-sveltekit-preload-data>
        <span class="vida-card-icon" aria-hidden="true">💰</span>
        <span class="vida-card-title">{$t('nav.financas', { default: 'Finanças' })}</span>
        <span class="vida-card-desc">{$t('vida.financas.desc', { default: 'Despesas, contas e orçamento mensal.' })}</span>
      </a>
    </li>
    <li>
      <a href="/habitos/" class="vida-card" data-sveltekit-preload-data>
        <span class="vida-card-icon" aria-hidden="true">🌱</span>
        <span class="vida-card-title">{$t('nav.habitos', { default: 'Hábitos' })}</span>
        <span class="vida-card-desc">{$t('vida.habitos.desc', { default: 'Tracking diário e streaks.' })}</span>
      </a>
    </li>
    <li>
      <a href="/humor/" class="vida-card" data-sveltekit-preload-data>
        <span class="vida-card-icon" aria-hidden="true">💗</span>
        <span class="vida-card-title">{$t('vida.humor.title', { default: 'Humor' })}</span>
        <span class="vida-card-desc">{$t('vida.humor.desc', { default: 'Como te sentes, dia a dia — sem julgamentos.' })}</span>
      </a>
    </li>
    <li>
      <a href="/memorias/" class="vida-card" data-sveltekit-preload-data>
        <span class="vida-card-icon" aria-hidden="true">📸</span>
        <span class="vida-card-title">{$t('vida.memorias.title', { default: 'Memórias' })}</span>
        <span class="vida-card-desc">{$t('vida.memorias.desc', { default: 'Momentos especiais guardados com carinho.' })}</span>
      </a>
    </li>
    <li>
      <span class="vida-card vida-card-soon" aria-disabled="true">
        <span class="vida-card-icon" aria-hidden="true">🚭</span>
        <span class="vida-card-title">{$t('vida.vicios.title', { default: 'Vícios' })}</span>
        <span class="vida-card-desc">{$t('vida.vicios.desc', { default: 'Registo de ocorrências, metas e pequenos passos para ficares no controlo.' })}</span>
      </span>
    </li>
  </ul>
</section>

<style>
  .vida {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem 6rem;
  }
  .vida-hero {
    text-align: center;
    margin-bottom: var(--space-5, 1.5rem);
  }
  .vida-icon {
    font-size: 3rem;
    display: block;
    line-height: 1;
  }
  .vida-hero h1 {
    margin: 0.5rem 0 0.25rem;
    font-size: var(--fs-2xl, 1.75rem);
  }
  .vida-sub {
    margin: 0;
    color: var(--txt2);
    font-size: 0.95rem;
  }
  .vida-featured {
    display: flex;
    align-items: center;
    gap: var(--space-4, 1rem);
    width: 100%;
    min-height: 44px;
    padding: var(--space-4, 1rem) var(--space-4, 1rem);
    margin-bottom: var(--space-3, 0.75rem);
    border-radius: var(--radius-lg, 1rem);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--accent) 22%, var(--card)),
      color-mix(in srgb, var(--accent) 6%, var(--card)) 60%,
      var(--card)
    );
    color: inherit;
    text-decoration: none;
    box-shadow: var(--shadow-sm, none);
    transition: box-shadow var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease, transform var(--motion-fast, 120ms) ease;
  }
  .vida-featured:hover {
    box-shadow: var(--shadow-md, none);
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  .vida-featured:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring, 0 0 0 2px var(--accent));
  }
  .vida-featured:active {
    transform: scale(0.99);
  }
  .vida-featured-icon {
    font-size: 2.25rem;
    line-height: 1;
    flex-shrink: 0;
  }
  .vida-featured-text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
    flex: 1;
  }
  .vida-featured-title {
    font-weight: 700;
    font-size: var(--fs-lg, 1.15rem);
  }
  .vida-featured-desc {
    font-size: 0.85rem;
    color: var(--txt2);
  }
  .vida-featured-arrow {
    flex-shrink: 0;
    font-size: 1.35rem;
    color: var(--accent);
    transition: transform var(--motion-fast, 120ms) ease;
  }
  .vida-featured:hover .vida-featured-arrow,
  .vida-featured:focus-visible .vida-featured-arrow {
    transform: translateX(3px);
  }
  :global([dir='rtl']) .vida-featured-arrow {
    transform: scaleX(-1);
  }
  :global([dir='rtl']) .vida-featured:hover .vida-featured-arrow,
  :global([dir='rtl']) .vida-featured:focus-visible .vida-featured-arrow {
    transform: scaleX(-1) translateX(3px);
  }
  .vida-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2, 0.5rem);
    margin-bottom: var(--space-5, 1.5rem);
  }
  .vida-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 44px;
    padding: 0.5rem var(--space-4, 1rem);
    border-radius: var(--radius-full, 999px);
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--txt);
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 600;
    transition: background var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease, transform var(--motion-fast, 120ms) ease;
  }
  .vida-chip:hover {
    background: var(--bg-elev, var(--card));
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }
  .vida-chip:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring, 0 0 0 2px var(--accent));
  }
  .vida-chip:active {
    transform: scale(0.97);
  }
  .vida-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-3, 0.75rem);
  }
  @media (min-width: 480px) {
    .vida-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (min-width: 640px) {
    .vida-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .vida-card {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    height: 100%;
    padding: var(--space-4, 1rem);
    border-radius: var(--radius-md, 0.75rem);
    background: var(--card);
    border: 1px solid var(--border);
    color: inherit;
    text-decoration: none;
    min-height: 44px;
    transition: background var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease, transform var(--motion-fast, 120ms) ease;
  }
  .vida-card:hover,
  .vida-card:focus-visible {
    background: var(--card-hover, var(--card));
    border-color: color-mix(in srgb, var(--txt) 24%, transparent);
    outline: none;
  }
  .vida-card:focus-visible {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .vida-card:active {
    transform: scale(0.98);
  }
  .vida-card-icon {
    font-size: 1.75rem;
  }
  .vida-card-title {
    font-weight: 600;
    font-size: var(--fs-md, 1rem);
  }
  .vida-card-desc {
    font-size: 0.85rem;
    color: var(--txt2);
  }
  .vida-card-soon {
    opacity: 0.55;
    cursor: not-allowed;
  }
</style>
