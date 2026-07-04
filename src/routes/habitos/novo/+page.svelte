<!--
  /habitos/novo — create habit form (V8).

  The route delegates the form to `HabitForm.svelte` and adds the V8
  template picker: a grid of curated habit templates (hydration, sleep,
  study, exercise, skincare, reading, finance check, rest).  Picking a
  template pre-fills the form (the user can still tweak everything);
  "Começar do zero" resets it.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { get } from 'svelte/store';
  import { addHabito, type NewHabitInput } from '$lib/habitos';
  import { HABIT_TEMPLATES, type HabitTemplate } from '$lib/state/habitos-seed';
  import { showToast } from '$lib/components/events';
  import { t } from 'svelte-i18n';
  import HabitForm from '$lib/components/habitos/HabitForm.svelte';

  let selectedTemplateId = $state<string | null>(null);
  // Bump to force a form remount when a template is (re)picked, so the
  // snapshot-initialised fields re-read `initial`.
  let formKey = $state(0);

  let initial = $derived.by<Partial<NewHabitInput> | null>(() => {
    if (!selectedTemplateId) return null;
    const tpl = HABIT_TEMPLATES.find((x) => x.id === selectedTemplateId);
    if (!tpl) return null;
    return {
      name: $t(tpl.nameKey, { default: tpl.defaultName }) as string,
      icon: tpl.icon,
      color: tpl.color,
      cadence: tpl.cadence,
      meta: tpl.meta,
      reminder: tpl.reminder
    };
  });

  function pickTemplate(tpl: HabitTemplate): void {
    selectedTemplateId = tpl.id;
    formKey += 1;
  }

  function startBlank(): void {
    selectedTemplateId = null;
    formKey += 1;
  }

  async function handleSubmit(values: NewHabitInput): Promise<void> {
    await addHabito(values);
    showToast(get(t)('toast.habito_criado', { default: 'Hábito criado' }));
    await goto(`/habitos/`);
  }

  let pageTitle = $derived($t('habitos.novo.seo.title', { default: 'Novo Hábito · Hábitos' }) as string);
  let description = $derived($t('habitos.novo.seo.description', { default: 'Criar hábito diário' }) as string);
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
    <a href="/">{$t('habitos.crumbs.hub', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <a href="/habitos/">{$t('habitos.novo.breadcrumb.home', { default: '← Hábitos' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('habitos.novo.novo', { default: 'Novo' })}</span>
  </nav>

  <section class="templates" aria-label={$t('habitos.templates.aria', { default: 'Modelos de hábitos' })}>
    <h2 class="templates-title">{$t('habitos.templates.title', { default: 'Começa com um modelo' })}</h2>
    <p class="templates-sub">{$t('habitos.templates.sub', { default: 'Toca num modelo para preencher o formulário — podes ajustar tudo depois.' })}</p>
    <div class="template-grid">
      {#each HABIT_TEMPLATES as tpl (tpl.id)}
        <button
          type="button"
          class="template"
          class:selected={selectedTemplateId === tpl.id}
          style="--tpl-color: {tpl.color}"
          aria-pressed={selectedTemplateId === tpl.id}
          onclick={() => pickTemplate(tpl)}
        >
          <span class="tpl-icon" aria-hidden="true">{tpl.icon}</span>
          <span class="tpl-name">{$t(tpl.nameKey, { default: tpl.defaultName })}</span>
          {#if tpl.meta}
            <span class="tpl-meta">{tpl.meta}</span>
          {/if}
        </button>
      {/each}
      <button
        type="button"
        class="template blank"
        class:selected={selectedTemplateId === null}
        aria-pressed={selectedTemplateId === null}
        onclick={startBlank}
      >
        <span class="tpl-icon" aria-hidden="true">✨</span>
        <span class="tpl-name">{$t('habitos.templates.blank', { default: 'Do zero' })}</span>
      </button>
    </div>
  </section>

  {#key formKey}
    <HabitForm {initial} onSubmit={handleSubmit} onCancel={() => goto('/habitos/')} />
  {/key}
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
    font-size: var(--fs-2xl, 2rem);
    margin: 0 0 0.5rem 0;
    color: var(--txt);
  }
  .sub {
    color: var(--txt2);
    margin: 0;
    font-size: var(--fs-md, 1rem);
  }
  .crumbs {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: var(--fs-sm, 0.875rem);
    color: var(--txt3);
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .crumbs a {
    color: var(--accent);
    text-decoration: none;
  }
  .crumbs a:hover,
  .crumbs a:focus-visible {
    text-decoration: underline;
  }
  .templates {
    margin-bottom: 1.25rem;
  }
  .templates-title {
    font-size: var(--fs-md, 1rem);
    color: var(--txt);
    margin: 0 0 0.25rem 0;
  }
  .templates-sub {
    font-size: var(--fs-sm, 0.8125rem);
    color: var(--txt3);
    margin: 0 0 0.75rem 0;
  }
  .template-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 0.5rem;
  }
  .template {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-top: 3px solid var(--tpl-color, var(--accent));
    border-radius: var(--radius-md, 0.625rem);
    padding: 0.75rem 0.5rem;
    min-height: 44px;
    cursor: pointer;
    color: var(--txt);
    font-family: inherit;
    transition: background var(--motion-fast, 120ms), transform var(--motion-fast, 120ms);
  }
  .template:hover {
    background: var(--card-hover, var(--card));
    transform: translateY(-1px);
  }
  .template:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .template.selected {
    background: var(--card-hover, var(--card));
    box-shadow: 0 0 0 2px var(--tpl-color, var(--accent));
  }
  .template.blank {
    border-top-color: var(--border);
  }
  .tpl-icon {
    font-size: 1.5rem;
    line-height: 1;
  }
  .tpl-name {
    font-size: var(--fs-xs, 0.75rem);
    font-weight: 600;
    text-align: center;
    line-height: 1.25;
  }
  .tpl-meta {
    font-size: 0.6875rem;
    color: var(--txt3);
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
