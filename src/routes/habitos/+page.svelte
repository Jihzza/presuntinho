<!--
  /habitos — list of habits + Pro dashboard (task-040).

  Adds on top of the legacy list:
    * Stats panel: % 7d / 30d, best streak, most consistent habit.
    * Monthly calendar for the selected habit (tap to toggle day).
    * Inline edit form per habit (reuses the same CRUD form as /novo).

  Behavior preserved from the previous version:
    * listHabitos() on mount, friendly empty state, delete with
      two-tap confirmation, "✓ hoje / — pendente" badge per row.
    * Card list of habits with streak + today status.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { locale, t } from 'svelte-i18n';
  import {
    listHabitos,
    deleteHabito,
    editHabito,
    getStreak,
    isLoggedToday,
    logHabit,
    setHabitLog,
    getMonthLogs,
    getDashboardStats,
    type Habit,
    type HabitDashboardStats,
    type HeatmapData,
    type NewHabitInput
  } from '$lib/habitos';
  import { subApps } from '$lib/registry';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import MonthCalendar from '$lib/components/habitos/MonthCalendar.svelte';
  import HabitStats from '$lib/components/habitos/HabitStats.svelte';
  import HabitForm from '$lib/components/habitos/HabitForm.svelte';
  import { showToast } from '$lib/components/events';

  let habits = $state<Habit[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let confirmingDelete = $state<number | null>(null);

  let streaks = $state<Map<number, number>>(new Map());
  let logged = $state<Map<number, boolean>>(new Map());
  let dashboardStats = $state<HabitDashboardStats | null>(null);

  // Edit / view state — null = list view only.  When set, the page
  // shows the monthly calendar + edit form for that habit.
  let editingHabit = $state<Habit | null>(null);
  let calendarData = $state<HeatmapData>({});
  let calendarLoading = $state(false);
  let calYear = $state(new Date().getFullYear());
  let calMonth0 = $state(new Date().getMonth());
  let showEditForm = $state(false);
  const dateLocale = $derived($locale || 'pt-PT');

  const habitosApp = subApps.find((a) => a.id === 'habitos');

  async function refresh(): Promise<void> {
    loading = true;
    error = null;
    try {
      const fresh = await listHabitos();
      habits = fresh;
      // Resolve streak + today status + dashboard stats in parallel.
      const rows = await Promise.all(
        fresh.map((h) => Promise.all([getStreak(h.id), isLoggedToday(h.id)]))
      );
      const nextStreaks = new Map<number, number>();
      const nextLogged = new Map<number, boolean>();
      fresh.forEach((h, i) => {
        nextStreaks.set(h.id, rows[i][0]);
        nextLogged.set(h.id, rows[i][1]);
      });
      streaks = nextStreaks;
      logged = nextLogged;
      // Compute aggregate stats once per refresh.
      dashboardStats = await getDashboardStats(fresh);
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
      setTimeout(() => {
        if (confirmingDelete === id) confirmingDelete = null;
      }, 4000);
      return;
    }
    confirmingDelete = null;
    try {
      await deleteHabito(id);
      if (editingHabit?.id === id) {
        editingHabit = null;
        showEditForm = false;
      }
      await refresh();
      showToast($t('habitos.toast.removed', { default: 'Hábito removido' }));
    } catch (e) {
      console.error('[habitos] delete failed', e);
      showToast($t('habitos.toast.delete_failed', { default: 'Erro a remover hábito' }));
    }
  }

  async function selectHabit(h: Habit): Promise<void> {
    if (editingHabit?.id === h.id) {
      // Toggle off — go back to the list view.
      editingHabit = null;
      showEditForm = false;
      return;
    }
    editingHabit = h;
    showEditForm = false;
    await loadCalendar(h.id, calYear, calMonth0);
  }

  async function loadCalendar(habitId: number, year: number, month0: number): Promise<void> {
    calendarLoading = true;
    try {
      calendarData = await getMonthLogs(habitId, year, month0);
    } catch (e) {
      console.error('[habitos] getMonthLogs failed', e);
    } finally {
      calendarLoading = false;
    }
  }

  function shiftMonth(delta: number): void {
    const next = new Date(calYear, calMonth0 + delta, 1);
    calYear = next.getFullYear();
    calMonth0 = next.getMonth();
    if (editingHabit) {
      void loadCalendar(editingHabit.id, calYear, calMonth0);
    }
  }

  async function toggleCalendarDay(date: string): Promise<void> {
    if (!editingHabit) return;
    const isLogged = Boolean(calendarData[date]);
    try {
      const result = await setHabitLog(editingHabit.id, date, !isLogged);
      if (result.changed) {
        // Update local cache so the cell re-renders without a refetch.
        const next = { ...calendarData };
        if (!isLogged) next[date] = true;
        else delete next[date];
        calendarData = next;
        // If we just marked today, also refresh list-level badge.
        const todayKey = new Date().toISOString().slice(0, 10);
        if (date === todayKey) {
          const nextLogged = new Map(logged);
          nextLogged.set(editingHabit.id, !isLogged);
          logged = nextLogged;
        }
        // For "today" specifically, fire the XP/streak wires.
        if (!isLogged && date === todayKey) {
          await logHabit(editingHabit.id, date);
        }
        // Re-derive stats in the background.
        void refresh();
      }
    } catch (e) {
      console.error('[habitos] toggleCalendarDay failed', e);
      showToast($t('habitos.toast.save_failed', { default: '⚠️ Erro a guardar' }));
    }
  }

  async function onEditSubmit(values: NewHabitInput): Promise<void> {
    if (!editingHabit || typeof editingHabit.id !== 'number') return;
    await editHabito(editingHabit.id, values);
    showToast($t('habitos.toast.updated', { default: 'Hábito atualizado' }));
    showEditForm = false;
    // Update local cache for the editing habit so the title bar
    // reflects the new name/color without a full refetch.
    editingHabit = {
      ...editingHabit,
      name: values.name,
      icon: values.icon,
      color: values.color,
      cadence: values.cadence,
      meta: values.meta,
      reminder: values.reminder
    };
    await refresh();
  }

  onMount(() => {
    void refresh();
  });

  function formatCreatedAt(ts: number): string {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString(dateLocale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }
</script>

<svelte:head>
  <title>{$t('routes.habitos.title', { default: 'Hábitos · Daily Check-in' })} · Presuntinho</title>
  <meta name="description" content={$t('routes.habitos.meta.description', { default: 'Hábitos diários com streaks e mapa de calor.' })} />
  <meta property="og:title" content={$t('routes.habitos.meta.og_title', { default: 'Hábitos · Daily Check-in' })} />
  <meta property="og:description" content={$t('routes.habitos.meta.og_description', { default: 'Hábitos diários com streaks e mapa de calor.' })} />
  <meta property="og:url" content="https://presuntinho.netlify.app/habitos/" />
  <meta name="twitter:title" content={$t('routes.habitos.meta.twitter_title', { default: 'Hábitos · Daily Check-in' })} />
  <meta name="twitter:description" content={$t('routes.habitos.meta.twitter_description', { default: 'Hábitos diários com streaks e mapa de calor.' })} />
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

  {#if dashboardStats && habits.length > 0}
    <section class="summary" aria-label={$t('habitos.stats.summary.aria', { default: 'Resumo dos hábitos' })}>
      <div class="summary-card">
        <span class="summary-label">{$t('habitos.stats.best_streak', { default: 'Melhor streak' })}</span>
        <span class="summary-value">
          {dashboardStats.bestStreak
            ? `${dashboardStats.bestStreak.streak} 🔥`
            : '—'}
        </span>
        {#if dashboardStats.bestStreak}
          <span class="summary-sub">{dashboardStats.bestStreak.name}</span>
        {/if}
      </div>
      <div class="summary-card">
        <span class="summary-label">{$t('habitos.stats.most_consistent', { default: 'Mais consistente (7d)' })}</span>
        <span class="summary-value">
          {dashboardStats.mostConsistent
            ? `${dashboardStats.mostConsistent.percent7}%`
            : '—'}
        </span>
        {#if dashboardStats.mostConsistent}
          <span class="summary-sub">{dashboardStats.mostConsistent.name}</span>
        {/if}
      </div>
    </section>
  {/if}

  <section class="list" aria-label="{$t('a11y.aria.lista_de_habitos', { default: 'Lista de hábitos' })}">
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
          <li class="card-wrap">
            <article
              class="card"
              class:is-selected={editingHabit?.id === h.id}
              style="--accent: {h.color}"
            >
              <button
                type="button"
                class="card-main"
                onclick={() => selectHabit(h)}
                aria-expanded={editingHabit?.id === h.id}
              >
                <span class="icon" aria-hidden="true">{h.icon}</span>
                <span class="content">
                  <span class="name">{h.name}</span>
                  <span class="meta">
                    {$t('habitos.created', { default: 'Criado a' })} {formatCreatedAt(h.createdAt)}
                    {#if h.meta} · <span class="meta-pill">{h.meta}</span>{/if}
                    · {$t('habitos.cadence.daily', { default: 'diário' })}
                  </span>
                  <span class="status" aria-label={logged.get(h.id) ? $t('habitos.list.today_done', { default: '✓ hoje' }) : $t('habitos.list.today_pending', { default: '— pendente' })}>
                    <span class="streak">{$t('habitos.list.streak', { default: '🔥 {n} dias', values: { n: streaks.get(h.id) ?? 0 } })}</span>
                    <span class="today" data-done={logged.get(h.id) ? 'true' : 'false'}>
                      {logged.get(h.id)
                        ? $t('habitos.list.today_done', { default: '✓ hoje' })
                        : $t('habitos.list.today_pending', { default: '— pendente' })}
                    </span>
                  </span>
                </span>
                <span class="arrow" aria-hidden="true">{editingHabit?.id === h.id ? '▾' : '→'}</span>
              </button>
              <button
                type="button"
                class="delete-btn"
                onclick={() => confirmDelete(h.id)}
                aria-label={confirmingDelete === h.id ? $t('habitos.delete.confirm', { default: 'Confirmar remoção' }) : $t('habitos.delete.aria', { default: 'Remover hábito' })}
                data-confirming={confirmingDelete === h.id}
              >
                {confirmingDelete === h.id ? $t('habitos.delete.confirm_short', { default: 'Confirmar?' }) : '🗑️'}
              </button>
            </article>
            {#if editingHabit?.id === h.id}
              <div class="detail">
                <div class="detail-header">
                  <h2 class="detail-title">{$t('habitos.detail.heading', { default: 'Calendário' })}</h2>
                  <div class="month-controls" role="group" aria-label={$t('habitos.calendar.nav.aria', { default: 'Navegação do calendário' })}>
                    <button type="button" class="month-btn" onclick={() => shiftMonth(-1)} aria-label={$t('habitos.calendar.prev', { default: 'Mês anterior' })}>‹</button>
                    <button type="button" class="month-btn" onclick={() => shiftMonth(1)} aria-label={$t('habitos.calendar.next', { default: 'Mês seguinte' })}>›</button>
                  </div>
                </div>
                {#if calendarLoading}
                  <p class="empty">{$t('common.loading')}</p>
                {:else}
                  <MonthCalendar
                    year={calYear}
                    month0={calMonth0}
                    data={calendarData}
                    color={h.color}
                    onToggle={toggleCalendarDay}
                  />
                {/if}

                <div class="detail-stats">
                  <HabitStats
                    habit={h}
                    stats7={dashboardStats?.window7[h.id] ?? null}
                    stats30={dashboardStats?.window30[h.id] ?? null}
                    streak={streaks.get(h.id) ?? 0}
                  />
                </div>

                <div class="detail-actions">
                  {#if !showEditForm}
                    <button type="button" class="btn-secondary" onclick={() => (showEditForm = true)}>
                      ✏️ {$t('habitos.detail.edit', { default: 'Editar hábito' })}
                    </button>
                  {:else}
                    <HabitForm
                      habit={h}
                      onSubmit={onEditSubmit}
                      onCancel={() => (showEditForm = false)}
                    />
                  {/if}
                </div>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if habitosApp}
    <footer class="page-footer" aria-hidden="true">
      <span style="--swatch: {habitosApp.color}">{habitosApp.icon}</span>
      <span>{$t('habitos.footer.position', { default: 'Hub · Hábitos' })}</span>
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
    font-family: inherit;
    font-size: 0.9375rem;
  }
  .btn-primary:hover,
  .btn-primary:focus-visible {
    background: #d63384;
    outline: none;
  }
  .btn-secondary {
    background: rgba(255, 255, 255, 0.05);
    color: var(--txt, #fff);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.9375rem;
  }
  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.12);
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
  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .summary-card {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 0.875rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .summary-label {
    font-size: 0.75rem;
    color: var(--txt3, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .summary-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--txt, #fff);
  }
  .summary-sub {
    font-size: 0.8125rem;
    color: var(--txt2, #cbd5e1);
  }
  .cards {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .card-wrap {
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
    transition: background 0.2s;
  }
  .card.is-selected {
    background: rgba(255, 255, 255, 0.08);
  }
  .card:hover {
    background: rgba(255, 255, 255, 0.08);
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
    background: transparent;
    border: 0;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
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
  .meta-pill {
    background: rgba(255, 255, 255, 0.08);
    padding: 0.0625rem 0.375rem;
    border-radius: 999px;
    font-size: 0.75rem;
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
  .detail {
    background: var(--card, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: 0.75rem;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .detail-title {
    margin: 0;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3, #94a3b8);
  }
  .month-controls {
    display: flex;
    gap: 0.25rem;
  }
  .month-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    color: var(--txt, #fff);
    border-radius: 0.375rem;
    padding: 0.25rem 0.625rem;
    cursor: pointer;
    font-size: 1rem;
    font-family: inherit;
  }
  .month-btn:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .detail-stats {
    margin-top: 0.5rem;
  }
  .detail-actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
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
    .card { transition: none; }
    .delete-btn { transition: none; }
    .btn-primary { transition: none; }
  }
</style>
