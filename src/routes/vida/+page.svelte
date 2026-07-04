<!--
  /vida — Landing tab for the footer "Vida" entry.

  Vida is the umbrella for the personal-life sub-apps: Finanças (/financas),
  Hábitos (/habitos), Humor (/humor), Memórias (/memorias) and Vícios
  (planned under IA-S4 / task-094).
-->
<script lang="ts">
  import { t } from 'svelte-i18n';
  import AppCard from '$lib/components/AppCard.svelte';
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

  <!-- V10.2: TODAS as apps da Vida no mesmo formato — quadrados AppCard
       iguais, sem destaque à parte (pedido do Daniel). -->
  <ul class="vida-grid">
    <li>
      <AppCard
        href="/escola/"
        icon="📚"
        title={$t('nav.escola', { default: 'Escola' })}
        desc={$t('vida.escola.desc', { default: 'Cursos, lições, trabalhos e caderno — o teu cantinho de estudo.' })}
      />
    </li>
    <li>
      <AppCard
        href="/trabalhos/"
        icon="📝"
        title={$t('nav.trabalhos', { default: 'Trabalhos' })}
        desc={$t('vida.trabalhos.desc', { default: 'Entregas, prazos e progresso.' })}
      />
    </li>
    <li>
      <AppCard
        href="/biblioteca/"
        icon="📖"
        title={$t('nav.biblioteca', { default: 'Biblioteca' })}
        desc={$t('vida.biblioteca.desc', { default: 'Links e materiais guardados.' })}
      />
    </li>
    <li>
      <AppCard
        href="/escola/caderno/"
        icon="📓"
        title={$t('school.notebook.title', { default: 'Caderno' })}
        desc={$t('vida.caderno.desc', { default: 'Notas, áudios e ficheiros de estudo.' })}
      />
    </li>
    <li>
      <AppCard
        href="/financas/"
        icon="💰"
        title={$t('nav.financas', { default: 'Finanças' })}
        desc={$t('vida.financas.desc', { default: 'Despesas, contas e orçamento mensal.' })}
      />
    </li>
    <li>
      <AppCard
        href="/habitos/"
        icon="🌱"
        title={$t('nav.habitos', { default: 'Hábitos' })}
        desc={$t('vida.habitos.desc', { default: 'Tracking diário e streaks.' })}
      />
    </li>
    <li>
      <AppCard
        href="/humor/"
        icon="💗"
        title={$t('vida.humor.title', { default: 'Humor' })}
        desc={$t('vida.humor.desc', { default: 'Como te sentes, dia a dia — sem julgamentos.' })}
      />
    </li>
    <li>
      <AppCard
        href="/memorias/"
        icon="📸"
        title={$t('vida.memorias.title', { default: 'Memórias' })}
        desc={$t('vida.memorias.desc', { default: 'Momentos especiais guardados com carinho.' })}
      />
    </li>
    <li>
      <AppCard
        href="/streaks/"
        icon="🔥"
        title={$t('streaks.page.short', { default: 'Streaks' })}
        desc={$t('vida.streaks.desc', { default: 'A tua chama, XP diário e marcos.' })}
      />
    </li>
    <li>
      <AppCard
        icon="🚭"
        locked
        title={$t('vida.vicios.title', { default: 'Vícios' })}
        desc={$t('vida.vicios.desc', { default: 'Registo de ocorrências, metas e pequenos passos para ficares no controlo.' })}
      />
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
  /* V10.1 — os cartões da grelha vivem agora no AppCard partilhado. */
</style>
