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
