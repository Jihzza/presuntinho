<script lang="ts">
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import {
    formatDayLabel,
    loadAgendaItems,
    localDateKey,
    monthGridDays,
    weekDays,
    type AgendaItem
  } from '$lib/vida/agenda';

  let items = $state<AgendaItem[]>([]);
  let expanded = $state(false);
  let dragStartY = $state<number | null>(null);
  let dragCurrentY = $state<number | null>(null);
  let loading = $state(true);

  const today = new Date();
  const todayKey = localDateKey(today);
  const dateLocale = $derived($locale || 'pt-PT');
  const monthLabel = $derived(today.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' }));
  let visibleDays = $derived(expanded ? monthGridDays(today) : weekDays(today));
  let upcoming = $derived(items.filter((item) => item.date >= todayKey && item.status !== 'done').slice(0, 12));

  function itemsForDate(day: Date): AgendaItem[] {
    const key = localDateKey(day);
    return items.filter((item) => item.date === key);
  }

  function dayTone(day: Date): string {
    const dayItems = itemsForDate(day);
    if (localDateKey(day) === todayKey) return 'today';
    if (dayItems.some((item) => item.tone === 'danger')) return 'danger';
    if (dayItems.some((item) => item.tone === 'warning')) return 'warning';
    if (dayItems.length > 0) return 'busy';
    return 'quiet';
  }

  function onPointerDown(event: PointerEvent): void {
    dragStartY = event.clientY;
    dragCurrentY = event.clientY;
  }

  function onPointerMove(event: PointerEvent): void {
    if (dragStartY === null) return;
    dragCurrentY = event.clientY;
  }

  function onPointerUp(event: PointerEvent): void {
    if (dragStartY === null) return;
    commitSwipe(event.clientY - dragStartY);
  }

  function onTouchStart(event: TouchEvent): void {
    const y = event.touches[0]?.clientY;
    if (typeof y !== 'number') return;
    dragStartY = y;
    dragCurrentY = y;
  }

  function onTouchMove(event: TouchEvent): void {
    if (dragStartY === null) return;
    const y = event.touches[0]?.clientY;
    if (typeof y !== 'number') return;
    dragCurrentY = y;
  }

  function onTouchEnd(): void {
    if (dragStartY === null || dragCurrentY === null) return;
    commitSwipe(dragCurrentY - dragStartY);
  }

  function commitSwipe(delta: number): void {
    dragStartY = null;
    dragCurrentY = null;
    if (delta > 56) expanded = true;
    if (delta < -56) expanded = false;
  }

  function onPointerCancel(): void {
    dragStartY = null;
    dragCurrentY = null;
  }

  onMount(() => {
    void loadAgendaItems()
      .then((rows) => (items = rows))
      .finally(() => (loading = false));
  });
</script>

<svelte:head>
  <title>{$t('calendar.meta.title', { default: 'Calendário · Presuntinho' })}</title>
</svelte:head>

<div class="calendar-page">
  <section class="calendar-card" aria-label={$t('calendar.aria.calendar', { default: 'Calendário' })}>
    <div class="section-head">
      <div>
        <h2>{expanded ? monthLabel : $t('calendar.week.title', { default: 'Esta semana' })}</h2>
        <p>{expanded ? $t('calendar.hint.collapse', { default: 'Arrasta para cima para voltar à semana' }) : $t('calendar.hint.expand', { default: 'Arrasta para baixo para abrir o mês' })}</p>
      </div>
      <a class="tasks-jump" href="#calendar-tasks">{$t('calendar.tasks.jump', { default: 'Ver tasks ↓' })}</a>
    </div>

    <div
      class="calendar-grid"
      class:month-view={expanded}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerCancel}
      ontouchstart={onTouchStart}
      ontouchmove={onTouchMove}
      ontouchend={onTouchEnd}
      role="group"
      aria-label={expanded ? $t('calendar.aria.month', { default: 'Vista mensal do calendário' }) : $t('calendar.aria.week', { default: 'Vista semanal do calendário' })}
    >
      {#each visibleDays as day (localDateKey(day))}
        <div class="day-cell" data-tone={dayTone(day)} data-outside={day.getMonth() === today.getMonth() ? 'false' : 'true'}>
          <span>{day.toLocaleDateString(dateLocale, { weekday: 'short' })}</span>
          <strong>{day.getDate()}</strong>
          {#if itemsForDate(day).length > 0}
            <small>{itemsForDate(day).length}</small>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <section id="calendar-tasks" class="tasks" aria-label={$t('calendar.tasks.aria', { default: 'Tasks próximas' })}>
    <div class="section-head">
      <h2>{$t('calendar.tasks.title', { default: 'Tasks' })}</h2>
    </div>
    {#if loading}
      <p class="empty">{$t('calendar.loading', { default: 'A carregar calendário…' })}</p>
    {:else if upcoming.length === 0}
      <p class="empty">{$t('calendar.empty', { default: 'Nada urgente. Planeia uma tarefa nova ou revê os hábitos.' })}</p>
    {:else}
      <div class="task-list">
        {#each upcoming as item (item.id)}
          <a class="task" data-tone={item.tone} href={item.href}>
            <span>{formatDayLabel(item.date, dateLocale)}</span>
            <strong>{item.title}</strong>
            <small>{item.subtitle}</small>
          </a>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .calendar-page { max-width: 880px; margin: 0 auto; padding: .85rem 1rem 8rem; color: var(--txt, #fff); }
  .calendar-card, .tasks { margin-top: .75rem; padding: 1rem; border-radius: 1.25rem; background: var(--card, rgba(255,255,255,.055)); border: 1px solid var(--border, rgba(255,255,255,.11)); }
  .section-head p, .task small, .empty { color: var(--txt2, #cbd5e1); }
  .section-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: .8rem; }
  .section-head h2 { margin: 0; font-size: 1rem; }
  .section-head p { margin: .15rem 0 0; font-size: .82rem; }
  .tasks-jump { color: var(--accent, #ec4899); text-decoration: none; font-weight: 900; font-size: .78rem; white-space: nowrap; padding: .42rem .55rem; border-radius: 999px; background: color-mix(in srgb, var(--accent, #ec4899) 14%, transparent); }
  .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: .45rem; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
  .day-cell { min-height: 76px; border-radius: .95rem; padding: .45rem; background: color-mix(in srgb, var(--txt, #fff) 8%, transparent); border: 1px solid var(--border, rgba(255,255,255,.08)); display: flex; flex-direction: column; gap: .15rem; }
  .day-cell[data-outside='true'] { opacity: .42; }
  .day-cell span { color: var(--txt3, #94a3b8); font-size: .65rem; text-transform: uppercase; }
  .day-cell strong { font-size: 1.15rem; }
  .day-cell small { margin-top: auto; width: fit-content; padding: .08rem .35rem; border-radius: 999px; background: color-mix(in srgb, var(--accent, #ec4899) 18%, transparent); }
  .day-cell[data-tone='today'] { border-color: rgba(236,72,153,.65); background: rgba(236,72,153,.16); }
  .day-cell[data-tone='danger'] { border-color: rgba(239,68,68,.65); }
  .day-cell[data-tone='warning'] { border-color: rgba(245,158,11,.65); }
  .day-cell[data-tone='busy'] { border-color: rgba(59,130,246,.5); }
  .task-list { display: grid; gap: .6rem; }
  .task { display: grid; gap: .15rem; color: var(--txt, #fff); text-decoration: none; padding: .85rem; border-radius: 1rem; background: color-mix(in srgb, var(--txt, #fff) 7%, transparent); border: 1px solid var(--border, rgba(255,255,255,.09)); }
  .task span { color: var(--accent, #bfdbfe); font-size: .75rem; font-weight: 900; }
  .task[data-tone='danger'] { border-color: rgba(239,68,68,.5); }
  .task[data-tone='warning'] { border-color: rgba(245,158,11,.5); }
  .empty { margin: 0; }
</style>
