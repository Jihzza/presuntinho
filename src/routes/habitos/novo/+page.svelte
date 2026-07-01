<!--
  /habitos/novo — create habit form.

  As of task-040 (Hábitos Pro) this route delegates the entire form to
  `HabitForm.svelte` so the create + edit experiences share a single
  source of truth for the five fields (nome, ícone, frequência,
  meta, lembrete).  Validation lives in the form component.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { get } from 'svelte/store';
  import { addHabito, type NewHabitInput } from '$lib/habitos';
  import { showToast } from '$lib/components/events';
  import { t } from 'svelte-i18n';
  import HabitForm from '$lib/components/habitos/HabitForm.svelte';

  async function handleSubmit(values: NewHabitInput): Promise<void> {
    const id = await addHabito(values);
    showToast(get(t)('toast.habito_criado', { default: 'Hábito criado' }));
    await goto(`/habitos/`);
    // Briefly highlight the new habit — but since we're on the list
    // page now, just rely on the page refresh to pick it up.
    void id;
  }

  let pageTitle = $derived('Novo Hábito · Hábitos');
  let description = $derived('Criar hábito diário');
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content="https://presuntinho.netlify.app/habitos/novo/" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={description} />
</svelte:head>

<div class="novo">
  <header class="hero">
    <h1>{$t('habitos.novo.hero.title', { default: '➕ Novo hábito' })}</h1>
    <p class="sub">{$t('habitos.novo.sub', { default: 'Define um hábito diário para acompanhares com streaks.' })}</p>
  </header>

  <nav class="crumbs" aria-label="{$t('a11y.aria.caminho_de_navegacao', { default: 'Caminho de navegação' })}">
    <a href="/">← Hub</a>
    <span aria-hidden="true">/</span>
    <a href="/habitos/">{$t('habitos.novo.breadcrumb.home', { default: '← Hábitos' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('habitos.novo.novo', { default: 'Novo' })}</span>
  </nav>

  <HabitForm onSubmit={handleSubmit} onCancel={() => goto('/habitos/')} />
</div>

<style>
  .novo {
    max-width: 560px;
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
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .crumbs a:hover,
  .crumbs a:focus-visible {
    text-decoration: underline;
  }
  @media (min-width: 640px) {
    .novo {
      padding: 2rem 1.5rem 3rem;
    }
    .hero h1 {
      font-size: 2.25rem;
    }
  }
</style>
