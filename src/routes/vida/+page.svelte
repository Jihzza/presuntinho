<!--
  /vida — Landing tab for the IA-S1 footer "Vida" entry (task-086).

  Vida is the umbrella for the personal-life sub-apps that previously lived as
  top-level routes: Finanças (/financas), Hábitos (/habitos) and Vícios
  (planned under IA-S4 / task-094).

  This page is intentionally a thin hub for now — task-088 (Escola reorg) and
  IA-S4 (Vida real dashboard) will fill it in. For tick 32 the priority is
  shipping the footer rewrite with a working landing page; deep Vida UX is
  the next sprint.
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
    <p class="vida-sub">Finanças, hábitos e vícios num só lugar.</p>
  </header>

  <ul class="vida-grid">
    <li>
      <a href="/financas/" class="vida-card" data-sveltekit-preload-data>
        <span class="vida-card-icon" aria-hidden="true">💰</span>
        <span class="vida-card-title">{$t('nav.financas', { default: 'Finanças' })}</span>
        <span class="vida-card-desc">Despesas, contas e orçamento mensal.</span>
      </a>
    </li>
    <li>
      <a href="/habitos/" class="vida-card" data-sveltekit-preload-data>
        <span class="vida-card-icon" aria-hidden="true">🌱</span>
        <span class="vida-card-title">{$t('nav.habitos', { default: 'Hábitos' })}</span>
        <span class="vida-card-desc">Tracking diário e streaks.</span>
      </a>
    </li>
    <li>
      <span class="vida-card vida-card-soon" aria-disabled="true">
        <span class="vida-card-icon" aria-hidden="true">🚭</span>
        <span class="vida-card-title">Vícios</span>
        <span class="vida-card-desc">Registo de ocorrências e metas — planeado na task-094 (roadmap Vida 2).</span>
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
    margin-bottom: 1.5rem;
  }
  .vida-icon {
    font-size: 3rem;
    display: block;
    line-height: 1;
  }
  .vida-hero h1 {
    margin: 0.5rem 0 0.25rem;
    font-size: 1.75rem;
  }
  .vida-sub {
    margin: 0;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.95rem;
  }
  .vida-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
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
    padding: 1rem;
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: inherit;
    text-decoration: none;
    min-height: 44px;
    transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
  }
  .vida-card:hover,
  .vida-card:focus-visible {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.24);
    outline: none;
  }
  .vida-card:focus-visible {
    box-shadow: 0 0 0 2px var(--accent, #ec4899);
  }
  .vida-card:active {
    transform: scale(0.98);
  }
  .vida-card-icon {
    font-size: 1.75rem;
  }
  .vida-card-title {
    font-weight: 600;
    font-size: 1rem;
  }
  .vida-card-desc {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.65);
  }
  .vida-card-soon {
    opacity: 0.55;
    cursor: not-allowed;
  }
  @media (prefers-reduced-motion: reduce) {
    .vida-card {
      transition: none;
    }
    .vida-card:active {
      transform: none;
    }
  }
</style>