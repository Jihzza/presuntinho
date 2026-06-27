<!--
  /habitos — list of habits + create button.

  Loads `listHabitos()` on mount, shows a friendly empty state when
  the user has no habits yet, and links each row to its detail page.

  Slug strategy:
    The detail route is keyed by the numeric id in the URL (e.g.
    `/habitos/habit/3/`).  We also show the name + emoji as the link
    text.  No slugification is needed because Dexie uses numeric ids
    and we don't need pretty URLs for the MVP.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { get } from 'svelte/store';
  import {
    listHabitos,
    deleteHabito,
    type Habit
  } from '$lib/habitos';
  import { subApps } from '$lib/registry';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { t } from 'svelte-i18n';
  import { showToast } from '$lib/components/events';

  let habits = $state<Habit[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let confirmingDelete = $state<number | null>(null);

  const habitosApp = subApps.find((a) => a.id === 'habitos');

  async function refresh(): Promise<void> {
    loading = true;
    error = null;
    try {
      habits = await listHabitos();
    } catch (e) {
      console.error('[habitos] listHabitos failed', e);
      error = e instanceof Error ? e.message : 'Erro a carregar hábitos';
    } finally {
      loading = false;
    }
  }

  async function confirmDelete(id: number): Promise<void> {
    if (confirmingDelete !== id) {
      confirmingDelete = id;
      // Auto-cancel after 4s so the UI doesn't get stuck in confirm mode.
      setTimeout(() => {
        if (confirmingDelete === id) confirmingDelete = null;
      }, 4000);
      return;
    }
    confirmingDelete = null;
    try {
      await deleteHabito(id);
      await refresh();
      showToast(get(t)('habitos.toast.removed', { default: 'Hábito removido' }));
    } catch (e) {
      console.error('[habitos] delete failed', e);
      showToast(get(t)('habitos.toast.delete_failed', { default: 'Erro a remover hábito' }));
    }
  }

  onMount(() => {
    void refresh();
  });

  function formatCreatedAt(ts: number): string {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }
</script>

<svelte:head>
  <title>Hábitos · Daily Check-in · Presuntinho</title>
  <meta name="description" content="Hábitos diários com streaks" />
  <meta property="og:title" content="Hábitos · Daily Check-in" />
  <meta property="og:description" content="Hábitos diários com streaks" />
  <meta property="og:url" content="https://presuntinho.netlify.app/habitos/" />
  <meta name="twitter:title" content="Hábitos · Daily Check-in" />
  <meta name="twitter:description" content="Hábitos diários com streaks" />
</svelte:head>

<div class="habitos-page">
  <header class="hero">
    <h1>{$t('habitos.hero.title', { default: '✅ Hábitos' })}</h1>
    <p class="sub">{$t('habitos.hero.sub', { default: 'Hábitos diários com streaks e mapa de calor.' })}</p>
  </header>

  <nav class="crumbs" aria-label={$t('habitos.crumbs.aria', { default: 'Caminho de navegação' })}>
    <a href="/">{$t('habitos.crumbs.home', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('habitos.crumbs.current', { default: 'Hábitos' })}</span>
  </nav>

  <section class="actions" aria-label={$t('habitos.actions.aria', { default: 'Ações' })}>
    <a class="btn-primary" href="/habitos/novo/">{$t('habitos.new', { default: '+ Novo hábito' })}</a>
  </section>

  <section class="list" aria-label="Lista de hábitos">
    {#if loading}
      <Skeleton variant="list" lines={4} label={$t('common.loading')} />
    {:else if error}
      <p class="empty error" role="alert">⚠️ {error}</p>
    {:else if habits.length === 0}
        <EmptyState
          emoji="🌱"
          title={$t('empty.habitos.title')}
          description={$t('empty.habitos.desc')}
          ctaLabel={$t('actions.cta.addHabit')}
          ctaHref="/habitos/novo/"
        />
    {:else}
      <ul class="cards">
        {#each habits as h (h.id)}
          <li class="card" style="--accent: {h.color}">
            <a class="card-main" href={`/habitos/habit/${h.id}/`}>
              <span class="icon" aria-hidden="true">{h.icon}</span>
              <span class="content">
                <span class="name">{h.name}</span>
                <span class="meta">
                  {$t('habitos.created', { default: 'Criado a' })} {formatCreatedAt(h.createdAt)} · {h.cadence === 'daily' ? $t('habitos.cadence.daily', { default: 'diário' }) : h.cadence}
                </span>
              </span>
              <span class="arrow" aria-hidden="true">→</span>
            </a>
            <button
              type="button"
              class="delete-btn"
              onclick={() => confirmDelete(h.id)}
              aria-label={confirmingDelete === h.id ? $t('habitos.delete.confirm', { default: 'Confirmar remoção' }) : $t('habitos.delete.aria', { default: 'Remover hábito' })}
              data-confirming={confirmingDelete === h.id}
            >
              {confirmingDelete === h.id ? $t('habitos.delete.confirm_short', { default: 'Confirmar?' }) : '🗑️'}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if habitosApp}
    <footer class="page-footer" aria-hidden="true">
        <span style="--swatch: {habitosApp.color}">{habitosApp.icon}</span>
        <span>{$t('habitos.footer.subapp', { default: 'Sub-app #{n} no hub' }).replace('{n}', String(habitosApp.order))}</span>
      </footer>
  {/if}
</div>

<style>
  .habitos-page {
    max-width: 800px;
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
  }
  .crumbs a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .crumbs a:hover,
  .crumbs a:focus-visible {
    text-decoration: underline;
  }
  .actions {
    margin-bottom: 1rem;
    display: flex;
    justify-content: flex-end;
  }
  .btn-primary {
    display: inline-block;
    background: var(--accent, #ec4899);
    color: #fff;
    text-decoration: none;
    padding: 0.625rem 1.25rem;
    border-radius: 0.5rem;
    font-weight: 600;
    border: 0;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-primary:hover,
  .btn-primary:focus-visible {
    background: #d63384;
    outline: none;
  }
  .btn-primary:focus-visible {
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.4);
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
  .cards {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .card {
    display: flex;
    align-items: stretch;
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-left: 4px solid var(--accent, #ec4899);
    border-radius: 0.75rem;
    overflow: hidden;
    transition: transform 0.15s, background 0.2s;
  }
  .card:hover {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
  }
  .card-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    color: var(--txt, #fff);
    text-decoration: none;
    min-width: 0;
  }
  .icon {
    font-size: 2rem;
    line-height: 1;
    flex-shrink: 0;
    width: 2.5rem;
    text-align: center;
  }
  .content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .name {
    font-size: 1.0625rem;
    font-weight: 600;
    color: var(--txt, #fff);
  }
  .meta {
    font-size: 0.8125rem;
    color: var(--txt3, #94a3b8);
  }
  .arrow {
    color: var(--accent, #ec4899);
    font-size: 1.25rem;
    flex-shrink: 0;
  }
  .delete-btn {
    border: 0;
    background: transparent;
    color: var(--txt3, #94a3b8);
    font-size: 1.125rem;
    padding: 0 1rem;
    cursor: pointer;
    border-left: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    transition: background 0.15s, color 0.15s;
  }
  .delete-btn:hover,
  .delete-btn:focus-visible {
    background: rgba(239, 68, 68, 0.1);
    color: var(--error, #ef4444);
    outline: none;
  }
  .delete-btn[data-confirming='true'] {
    background: var(--error, #ef4444);
    color: #fff;
    font-weight: 600;
    font-size: 0.875rem;
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
    color: var(--swatch, #ec4899);
    font-size: 1.125rem;
  }
  @media (min-width: 640px) {
    .habitos-page {
      padding: 2rem 1.5rem 3rem;
    }
    .hero h1 {
      font-size: 2.5rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .card { transition: none; transform: none; }
    .delete-btn { transition: none; }
  }
</style>