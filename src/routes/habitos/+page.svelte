<!--
  /habitos — list of habits + Pro dashboard (task-040, upgraded V8).

  V8 changes:
    * BUG FIX — toggling TODAY in the calendar now calls `logHabit`
      directly (the old code wrote via setHabitLog first, so logHabit
      saw the row and never awarded XP).  Retro-fills also go through
      logHabit so crossed streak milestones award correctly.
    * BUG FIX — date keys via `localDateKey` (LOCAL timezone), not
      `toISOString()` (UTC drift).
    * Quick "done today" toggle on each card with a satisfying pop
      animation + confetti (reduced-motion safe via the global
      kill-switch + fireConfettiEvent's own guard).
    * Cadence-aware labels, calendar and stats (daily / weekly /
      custom weekdays).
    * Weak-day summary card (90-day weekday aggregation) + per-habit
      weekday chart and best-ever streak in the detail view.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import {
    listActiveHabitos,
    listArchivedHabitos,
    archiveHabit,
    unarchiveHabit,
    deleteHabito,
    editHabito,
    getStreak,
    isLoggedToday,
    logHabit,
    unlogHabit,
    localizedHabit,
    localDateKey,
    setHabitLog,
    getMonthLogs,
    getDashboardStats,
    getBestStreak,
    getWeekdayStats,
    getGlobalWeekdayActivity,
    isScheduledOn,
    weekdayShortName,
    type Habit,
    type HabitCadence,
    type HabitDashboardStats,
    type HeatmapData,
    type NewHabitInput,
    type WeekdayStat
  } from '$lib/habitos';
  import { subApps } from '$lib/registry';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import MonthCalendar from '$lib/components/habitos/MonthCalendar.svelte';
  import HabitStats from '$lib/components/habitos/HabitStats.svelte';
  import HabitForm from '$lib/components/habitos/HabitForm.svelte';
  import { showToast, fireConfettiEvent } from '$lib/components/events';

  let habits = $state<Habit[]>([]);
  let archivedHabits = $state<Habit[]>([]);
  let showArchived = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let confirmingDelete = $state<number | null>(null);

  let streaks = $state<Map<number, number>>(new Map());
  let logged = $state<Map<number, boolean>>(new Map());
  let dashboardStats = $state<HabitDashboardStats | null>(null);
  let weakDayGlobal = $state<number | null>(null); // JS getDay index, or null
  let togglingId = $state<number | null>(null);
  let poppingId = $state<number | null>(null);

  // Edit / view state — null = list view only.  When set, the page
  // shows the monthly calendar + stats + edit form for that habit.
  let editingHabit = $state<Habit | null>(null);
  let calendarData = $state<HeatmapData>({});
  let calendarLoading = $state(false);
  let calYear = $state(new Date().getFullYear());
  let calMonth0 = $state(new Date().getMonth());
  let showEditForm = $state(false);
  let detailBestStreak = $state<number | null>(null);
  let detailWeekdays = $state<WeekdayStat[] | null>(null);
  const dateLocale = $derived($locale || 'pt-PT');

  const habitosApp = subApps.find((a) => a.id === 'habitos');

  async function refresh(): Promise<void> {
    loading = true;
    error = null;
    try {
      const [fresh, archived] = await Promise.all([listActiveHabitos(), listArchivedHabitos()]);
      habits = fresh.map((h) => localizedHabit($t, h));
      archivedHabits = archived.map((h) => localizedHabit($t, h));
      // Resolve streak + today status + dashboard stats in parallel.
      const rows = await Promise.all(
        fresh.map((h) => Promise.all([getStreak(h.id, h.cadence), isLoggedToday(h.id)]))
      );
      const nextStreaks = new Map<number, number>();
      const nextLogged = new Map<number, boolean>();
      fresh.forEach((h, i) => {
        nextStreaks.set(h.id, rows[i][0]);
        nextLogged.set(h.id, rows[i][1]);
      });
      streaks = nextStreaks;
      logged = nextLogged;
      // Aggregate stats + global weak day (one table scan each).
      const [stats, weekdayCounts] = await Promise.all([
        getDashboardStats(fresh),
        getGlobalWeekdayActivity(90)
      ]);
      dashboardStats = stats;
      weakDayGlobal = computeWeakDay(weekdayCounts);
      // Keep detail extras in sync when a habit is open.
      if (editingHabit) void loadDetailExtras(editingHabit);
    } catch (e) {
      console.error('[habitos] refresh (listActiveHabitos) failed', e);
      error = e instanceof Error ? e.message : ($t('habitos.error.load', { default: 'Erro a carregar hábitos' }) as string);
    } finally {
      loading = false;
    }
  }

  /** Weakest weekday overall — only meaningful with some history. */
  function computeWeakDay(counts: number[]): number | null {
    const total = counts.reduce((a, b) => a + b, 0);
    if (total < 10) return null; // not enough data to call a pattern
    let min = 0;
    for (let i = 1; i < 7; i++) {
      if (counts[i] < counts[min]) min = i;
    }
    // Only surface it when it's clearly below the average.
    return counts[min] < (total / 7) * 0.7 ? min : null;
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

  /**
   * Archive (pause) a habit — the primary, NON-destructive exit.  Reversible,
   * so no confirm dialog (unlike delete): the habit + its history survive and
   * it reappears under "Arquivados" with a Restore action.
   */
  async function archiveCurrent(id: number): Promise<void> {
    confirmingDelete = null;
    try {
      await archiveHabit(id);
      if (editingHabit?.id === id) {
        editingHabit = null;
        showEditForm = false;
      }
      await refresh();
      showToast($t('habitos.toast.archived', { default: 'Hábito arquivado' }));
    } catch (e) {
      console.error('[habitos] archive failed', e);
      showToast($t('habitos.toast.archive_failed', { default: 'Erro a arquivar hábito' }));
    }
  }

  /** Restore an archived habit back into the active list. */
  async function restoreHabit(id: number): Promise<void> {
    confirmingDelete = null;
    try {
      await unarchiveHabit(id);
      await refresh();
      showToast($t('habitos.toast.restored', { default: 'Hábito restaurado' }));
    } catch (e) {
      console.error('[habitos] restore failed', e);
      showToast($t('habitos.toast.restore_failed', { default: 'Erro a restaurar hábito' }));
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
    detailBestStreak = null;
    detailWeekdays = null;
    await loadCalendar(h.id, calYear, calMonth0);
    void loadDetailExtras(h);
  }

  async function loadDetailExtras(h: Habit): Promise<void> {
    try {
      const [best, weekdays] = await Promise.all([
        getBestStreak(h.id, h.cadence),
        getWeekdayStats(h.id, h.cadence, 90)
      ]);
      if (editingHabit?.id === h.id) {
        detailBestStreak = best;
        detailWeekdays = weekdays;
      }
    } catch (e) {
      console.error('[habitos] loadDetailExtras failed', e);
    }
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

  /** Celebrate a fresh "done" — confetti; bigger burst + toast on milestone. */
  function celebrate(milestones: number[], isToday: boolean): void {
    if (milestones.length > 0) {
      const top = Math.max(...milestones);
      fireConfettiEvent({ count: 140, origin: 'center' });
      showToast(
        $t('habitos.toast.milestone', {
          values: { n: top },
          default: `🔥 ${top} de streak! Estás imparável!`
        })
      );
    } else if (isToday) {
      fireConfettiEvent(45);
    }
  }

  /** V8 quick toggle — mark/unmark TODAY from the card itself. */
  async function quickToggleToday(h: Habit): Promise<void> {
    if (togglingId !== null) return;
    togglingId = h.id;
    const todayKey = localDateKey();
    const wasDone = logged.get(h.id) ?? false;
    try {
      if (wasDone) {
        await unlogHabit(h.id, todayKey);
        showToast($t('toast.marcacao_removida', { default: 'Marcação removida' }));
      } else {
        const result = await logHabit(h.id, todayKey);
        // Pop animation on the button we just pressed.
        poppingId = h.id;
        setTimeout(() => {
          if (poppingId === h.id) poppingId = null;
        }, 450);
        celebrate(result.milestones, true);
      }
      const nextLogged = new Map(logged);
      nextLogged.set(h.id, !wasDone);
      logged = nextLogged;
      // Update the open calendar if it's this habit + current month.
      if (editingHabit?.id === h.id && calendarData) {
        const next = { ...calendarData };
        if (!wasDone) next[todayKey] = true;
        else delete next[todayKey];
        calendarData = next;
      }
      void refreshStatsOnly();
    } catch (e) {
      console.error('[habitos] quickToggleToday failed', e);
      showToast($t('habitos.toast.save_failed', { default: '⚠️ Erro a guardar' }));
    } finally {
      togglingId = null;
    }
  }

  /** Lighter refresh — streaks + stats without the loading skeleton. */
  async function refreshStatsOnly(): Promise<void> {
    try {
      const fresh = await listActiveHabitos();
      const rows = await Promise.all(fresh.map((h) => getStreak(h.id, h.cadence)));
      const nextStreaks = new Map<number, number>();
      fresh.forEach((h, i) => nextStreaks.set(h.id, rows[i]));
      streaks = nextStreaks;
      dashboardStats = await getDashboardStats(fresh);
      if (editingHabit) void loadDetailExtras(editingHabit);
    } catch (e) {
      console.error('[habitos] refreshStatsOnly failed', e);
    }
  }

  async function toggleCalendarDay(date: string): Promise<void> {
    if (!editingHabit) return;
    const habit = editingHabit;
    const isLogged = Boolean(calendarData[date]);
    const todayKey = localDateKey();
    if (date > todayKey) return; // never log the future
    try {
      let changed = false;
      let milestones: number[] = [];
      if (!isLogged) {
        // V8 fix: toggling ON goes through logHabit (any date), which
        // owns the XP + crossed-milestone wiring.  The old flow wrote
        // via setHabitLog first, so logHabit never awarded anything.
        const result = await logHabit(habit.id, date);
        changed = result.logged;
        milestones = result.milestones;
      } else {
        const result = await setHabitLog(habit.id, date, false);
        changed = result.changed;
      }
      if (changed) {
        // Update local cache so the cell re-renders without a refetch.
        const next = { ...calendarData };
        if (!isLogged) next[date] = true;
        else delete next[date];
        calendarData = next;
        // If we just touched today, also refresh the list-level badge.
        if (date === todayKey) {
          const nextLogged = new Map(logged);
          nextLogged.set(habit.id, !isLogged);
          logged = nextLogged;
        }
        if (!isLogged) celebrate(milestones, date === todayKey);
        // Re-derive stats in the background.
        void refreshStatsOnly();
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
    // Refrescar ao voltar à app e à meia-noite — senão o "✓ hoje" e os toggles
    // de ontem persistiam no novo dia (PWA que fica aberta / retoma).
    let dayKey = localDateKey();
    const checkNewDay = () => {
      const now = localDateKey();
      if (now !== dayKey) {
        dayKey = now;
        void refresh();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkNewDay();
    };
    document.addEventListener('visibilitychange', onVisible);
    const midnightPoll = setInterval(checkNewDay, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(midnightPoll);
    };
  });

  function formatCreatedAt(ts: number): string {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString(dateLocale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function cadenceLabel(cadence: HabitCadence): string {
    if (cadence === 'weekly') return $t('habitos.cadence.weekly', { default: 'semanal' }) as string;
    if (typeof cadence === 'object') {
      // Monday-first ordering for the label.
      const order = [1, 2, 3, 4, 5, 6, 0];
      return order
        .filter((d) => cadence.days.includes(d))
        .map((d) => weekdayShortName(dateLocale, d))
        .join(' · ');
    }
    return $t('habitos.cadence.daily', { default: 'diário' }) as string;
  }

  function scheduledToday(h: Habit): boolean {
    return isScheduledOn(h.cadence, new Date());
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
          {dashboardStats.bestStreak && dashboardStats.bestStreak.streak > 0
            ? `${dashboardStats.bestStreak.streak} 🔥`
            : '—'}
        </span>
        {#if dashboardStats.bestStreak && dashboardStats.bestStreak.streak > 0}
          <span class="summary-sub">{dashboardStats.bestStreak.name}</span>
        {:else}
          <span class="summary-sub">{$t('habitos.stats.no_streak_yet', { default: 'Ainda sem sequência — começa hoje 💪' })}</span>
        {/if}
      </div>
      <div class="summary-card">
        <span class="summary-label">{$t('habitos.stats.most_consistent', { default: 'Mais consistente (7d)' })}</span>
        <span class="summary-value">
          {dashboardStats.mostConsistent && dashboardStats.mostConsistent.percent7 > 0
            ? `${dashboardStats.mostConsistent.percent7}%`
            : '—'}
        </span>
        {#if dashboardStats.mostConsistent && dashboardStats.mostConsistent.percent7 > 0}
          <span class="summary-sub">{dashboardStats.mostConsistent.name}</span>
        {/if}
      </div>
      {#if weakDayGlobal !== null}
        <div class="summary-card">
          <span class="summary-label">{$t('habitos.stats.weak_day_label', { default: 'Dia mais difícil (90d)' })}</span>
          <span class="summary-value weak-value">{weekdayShortName(dateLocale, weakDayGlobal)}</span>
          <span class="summary-sub">{$t('habitos.stats.weak_day_sub', { default: 'Sem pressão — só para saberes 💛' })}</span>
        </div>
      {/if}
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
      <ul class="cards v10-stagger">
        {#each habits as h (h.id)}
          <li class="card-wrap">
            <article
              class="card"
              class:is-selected={editingHabit?.id === h.id}
              style="--accent: {h.color}"
            >
              <button
                type="button"
                class="done-toggle"
                class:done={logged.get(h.id)}
                class:pop={poppingId === h.id}
                disabled={togglingId !== null}
                onclick={() => quickToggleToday(h)}
                aria-pressed={logged.get(h.id) ?? false}
                aria-label={logged.get(h.id)
                  ? $t('habitos.quick.undo_aria', { values: { name: h.name }, default: `Desmarcar ${h.name} de hoje` })
                  : $t('habitos.quick.done_aria', { values: { name: h.name }, default: `Marcar ${h.name} como feito hoje` })}
              >
                <span class="done-check" aria-hidden="true">{logged.get(h.id) ? '✓' : ''}</span>
              </button>
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
                    · {cadenceLabel(h.cadence)}
                  </span>
                  <span class="status">
                    <span class="streak">{$t('habitos.list.streak', { default: '🔥 {n} dias', values: { n: streaks.get(h.id) ?? 0 } })}</span>
                    <span class="today" data-done={logged.get(h.id) ? 'true' : 'false'}>
                      {#if logged.get(h.id)}
                        {$t('habitos.list.today_done', { default: '✓ hoje' })}
                      {:else if !scheduledToday(h)}
                        {$t('habitos.list.today_rest', { default: '🌿 descanso' })}
                      {:else}
                        {$t('habitos.list.today_pending', { default: '— pendente' })}
                      {/if}
                    </span>
                  </span>
                </span>
                <span class="arrow" aria-hidden="true">{editingHabit?.id === h.id ? '▾' : '→'}</span>
              </button>
              <button
                type="button"
                class="archive-btn"
                onclick={() => archiveCurrent(h.id)}
                title={$t('habitos.archive.action', { default: 'Arquivar' })}
                aria-label={$t('habitos.archive.aria', { values: { name: h.name }, default: `Arquivar ${h.name}` })}
              >
                📦
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
                    cadence={h.cadence}
                    onToggle={toggleCalendarDay}
                  />
                {/if}

                <div class="detail-stats">
                  <HabitStats
                    habit={h}
                    stats7={dashboardStats?.window7[h.id] ?? null}
                    stats30={dashboardStats?.window30[h.id] ?? null}
                    streak={streaks.get(h.id) ?? 0}
                    bestStreak={detailBestStreak}
                    weekdayStats={detailWeekdays}
                  />
                </div>

                <div class="detail-actions">
                  {#if !showEditForm}
                    <button type="button" class="btn-secondary" onclick={() => (showEditForm = true)}>
                      ✏️ {$t('habitos.detail.edit', { default: 'Editar hábito' })}
                    </button>
                    <button
                      type="button"
                      class="btn-danger"
                      onclick={() => confirmDelete(h.id)}
                      data-confirming={confirmingDelete === h.id}
                      aria-label={confirmingDelete === h.id
                        ? $t('habitos.delete.confirm', { default: 'Confirmar remoção' })
                        : $t('habitos.delete.aria', { default: 'Remover hábito' })}
                    >
                      {confirmingDelete === h.id
                        ? $t('habitos.delete.confirm_long', { default: '🗑️ Confirmar remoção permanente?' })
                        : $t('habitos.detail.delete', { default: '🗑️ Eliminar (apaga o histórico)' })}
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

  {#if !loading && archivedHabits.length > 0}
    <section class="archived" aria-label={$t('habitos.archived.aria', { default: 'Hábitos arquivados' })}>
      <button
        type="button"
        class="archived-toggle"
        onclick={() => (showArchived = !showArchived)}
        aria-expanded={showArchived}
      >
        <span class="archived-title">
          📦 {$t('habitos.archived.heading', { values: { n: archivedHabits.length }, default: 'Arquivados ({n})' })}
        </span>
        <span class="archived-caret" aria-hidden="true">{showArchived ? '▾' : '▸'}</span>
      </button>

      {#if showArchived}
        <p class="archived-hint">{$t('habitos.archived.hint', { default: 'Pausados — sem streaks nem estatísticas. Restaura quando quiseres.' })}</p>
        <ul class="cards archived-list">
          {#each archivedHabits as h (h.id)}
            <li>
              <article class="card archived-card" style="--accent: {h.color}">
                <span class="icon" aria-hidden="true">{h.icon}</span>
                <span class="content">
                  <span class="name">{h.name}</span>
                  <span class="meta">
                    {#if h.archivedAt}{$t('habitos.archived.at', { default: 'Arquivado a' })} {formatCreatedAt(h.archivedAt)} · {/if}{cadenceLabel(h.cadence)}
                  </span>
                </span>
                <button
                  type="button"
                  class="restore-btn"
                  onclick={() => restoreHabit(h.id)}
                >
                  ↩️ {$t('habitos.archived.restore', { default: 'Restaurar' })}
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
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

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
  }
  .crumbs a {
    color: var(--accent);
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
    background: var(--accent);
    color: var(--on-accent, #fff);
    text-decoration: none;
    padding: 0.625rem 1.25rem;
    border-radius: var(--radius-sm, 0.5rem);
    font-weight: 600;
    border: 0;
    cursor: pointer;
    transition: background var(--motion-fast, 120ms);
    font-family: inherit;
    font-size: 0.9375rem;
    min-height: 44px;
    line-height: 1.5rem;
  }
  .btn-primary:hover {
    background: var(--accent-hover, var(--accent));
  }
  .btn-primary:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .btn-secondary {
    background: var(--card);
    color: var(--txt);
    border: 1px solid var(--border);
    padding: 0.625rem 1rem;
    border-radius: var(--radius-sm, 0.5rem);
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.9375rem;
    min-height: 44px;
  }
  .btn-secondary:hover {
    background: var(--card-hover, var(--card));
  }
  .btn-secondary:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .empty {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 0.75rem);
    padding: 1.5rem;
    text-align: center;
    color: var(--txt2);
  }
  .empty.error {
    border-color: var(--error);
    color: var(--error);
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .summary-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 0.75rem);
    padding: 0.875rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .summary-label {
    font-size: var(--fs-xs, 0.75rem);
    color: var(--txt3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .summary-value {
    font-size: var(--fs-xl, 1.5rem);
    font-weight: 700;
    color: var(--txt);
  }
  .summary-value.weak-value {
    text-transform: capitalize;
  }
  .summary-sub {
    font-size: var(--fs-sm, 0.8125rem);
    color: var(--txt2);
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
    background: var(--card);
    border: 1px solid var(--border);
    /* Propriedade lógica → a faixa de acento fica no lado inicial também em RTL (ar). */
    border-inline-start: 4px solid var(--accent);
    border-radius: var(--radius-lg, 0.75rem);
    overflow: hidden;
    transition: background var(--motion-base, 220ms);
  }
  .card.is-selected,
  .card:hover {
    background: var(--card-hover, var(--card));
  }
  .done-toggle {
    flex-shrink: 0;
    align-self: center;
    width: 44px;
    height: 44px;
    margin-inline-start: 0.75rem;
    border-radius: 50%;
    border: 2px solid var(--accent);
    background: transparent;
    color: var(--on-accent, #fff);
    font-size: 1.25rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background var(--motion-fast, 120ms), transform var(--motion-fast, 120ms);
  }
  .done-toggle.done {
    background: var(--accent);
  }
  .done-toggle:hover:not(:disabled) {
    transform: scale(1.06);
  }
  .done-toggle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .done-toggle:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .done-toggle.pop {
    animation: done-pop var(--motion-base, 220ms) ease-out;
  }
  .done-check {
    font-weight: 700;
    line-height: 1;
  }
  @keyframes done-pop {
    0% { transform: scale(0.8); }
    55% { transform: scale(1.28); }
    100% { transform: scale(1); }
  }
  .card-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    color: var(--txt);
    text-decoration: none;
    min-width: 0;
    background: transparent;
    border: 0;
    cursor: pointer;
    text-align: start;
    font-family: inherit;
  }
  .card-main:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    border-radius: var(--radius-sm, 0.5rem);
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
    color: var(--txt);
  }
  .meta {
    font-size: var(--fs-sm, 0.8125rem);
    color: var(--txt3);
    text-transform: none;
  }
  .meta-pill {
    background: var(--bg-elev, var(--card));
    padding: 0.0625rem 0.375rem;
    border-radius: 999px;
    font-size: var(--fs-xs, 0.75rem);
  }
  .status {
    display: flex;
    gap: 0.625rem;
    align-items: center;
    font-size: var(--fs-sm, 0.8125rem);
  }
  .today[data-done='true'] {
    color: var(--success, var(--txt2));
  }
  .today[data-done='false'] {
    color: var(--txt3);
  }
  .arrow {
    color: var(--accent);
    font-size: 1.25rem;
    flex-shrink: 0;
  }
  .delete-btn {
    border: 0;
    background: transparent;
    color: var(--txt3);
    font-size: 1.125rem;
    padding: 0 1rem;
    min-width: 44px;
    cursor: pointer;
    border-inline-start: 1px solid var(--border);
    transition: background var(--motion-fast, 120ms), color var(--motion-fast, 120ms);
  }
  .delete-btn:hover,
  .delete-btn:focus-visible {
    color: var(--error);
    outline: none;
  }
  .delete-btn:focus-visible {
    outline: 2px solid var(--error);
    outline-offset: -2px;
  }
  .delete-btn[data-confirming='true'] {
    background: var(--error);
    color: var(--on-accent, #fff);
    font-weight: 600;
    font-size: var(--fs-sm, 0.875rem);
  }
  /* Arquivar — trailing quick action on each active card. The PRIMARY,
     non-destructive exit (reversible, so no confirm). Mirrors the old
     delete-btn geometry (44px target, logical inline-start divider). */
  .archive-btn {
    border: 0;
    background: transparent;
    color: var(--txt3);
    font-size: 1.125rem;
    padding: 0 1rem;
    min-width: 44px;
    cursor: pointer;
    border-inline-start: 1px solid var(--border);
    transition: background var(--motion-fast, 120ms), color var(--motion-fast, 120ms);
  }
  .archive-btn:hover,
  .archive-btn:focus-visible {
    color: var(--accent);
    background: var(--card-hover, var(--card));
    outline: none;
  }
  .archive-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  /* Secondary destructive action, inside the expanded detail only. Escalates
     to a solid error fill on the confirm step (existing 2-step confirm). */
  .btn-danger {
    background: var(--card);
    color: var(--error);
    border: 1px solid var(--error);
    padding: 0.625rem 1rem;
    border-radius: var(--radius-sm, 0.5rem);
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.9375rem;
    min-height: 44px;
    transition: background var(--motion-fast, 120ms), color var(--motion-fast, 120ms);
  }
  .btn-danger:hover {
    background: color-mix(in srgb, var(--error) 12%, transparent);
  }
  .btn-danger:focus-visible {
    outline: 2px solid var(--error);
    outline-offset: 2px;
  }
  .btn-danger[data-confirming='true'] {
    background: var(--error);
    color: var(--on-accent, #fff);
    border-color: var(--error);
  }
  /* Arquivados section — collapsible list of paused habits. */
  .archived {
    margin-top: 1.5rem;
  }
  .archived-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 0.5rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 0.75rem);
    padding: 0.75rem 1rem;
    min-height: 44px;
    color: var(--txt);
    font-family: inherit;
    font-size: var(--fs-md, 1rem);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--motion-fast, 120ms);
  }
  .archived-toggle:hover {
    background: var(--card-hover, var(--card));
  }
  .archived-toggle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .archived-caret {
    color: var(--txt3);
    font-size: 0.875rem;
  }
  .archived-hint {
    color: var(--txt3);
    font-size: var(--fs-sm, 0.8125rem);
    margin: 0.625rem 0.25rem 0.25rem;
  }
  .archived-list {
    margin-top: 0.5rem;
  }
  .archived-card {
    align-items: center;
    opacity: 0.85;
  }
  .archived-card .icon {
    margin-inline-start: 1rem;
  }
  .archived-card .content {
    padding: 0.75rem 0.5rem;
  }
  .restore-btn {
    flex-shrink: 0;
    align-self: center;
    margin-inline-end: 0.5rem;
    background: var(--card);
    color: var(--txt);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 0.5rem);
    padding: 0.5rem 0.75rem;
    min-height: 44px;
    font-family: inherit;
    font-size: var(--fs-sm, 0.875rem);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--motion-fast, 120ms), color var(--motion-fast, 120ms);
  }
  .restore-btn:hover {
    background: var(--card-hover, var(--card));
    color: var(--accent);
  }
  .restore-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .detail {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 0.75rem);
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
    font-size: var(--fs-sm, 0.875rem);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3);
  }
  .month-controls {
    display: flex;
    gap: 0.25rem;
  }
  .month-btn {
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--txt);
    border-radius: var(--radius-sm, 0.375rem);
    padding: 0.25rem 0.625rem;
    min-width: 44px;
    min-height: 44px;
    cursor: pointer;
    font-size: 1rem;
    font-family: inherit;
  }
  .month-btn:hover {
    background: var(--card-hover, var(--card));
  }
  .month-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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
    color: var(--txt3);
    font-size: var(--fs-sm, 0.8125rem);
  }
  .page-footer span:first-child {
    color: var(--swatch, var(--accent));
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
</style>
