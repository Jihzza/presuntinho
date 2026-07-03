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
  let dragStartX = $state<number | null>(null);
  let dragCurrentY = $state<number | null>(null);
  let activePointerId = $state<number | null>(null);
  let loading = $state(true);

  const today = new Date();
  const todayKey = localDateKey(today);
  const dateLocale = $derived($locale || 'pt-PT');
  const monthLabel = $derived(today.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' }));
  let visibleDays = $derived(expanded ? monthGridDays(today) : weekDays(today));
  let upcoming = $derived(items.filter((item) => item.date >= todayKey && item.status !== 'done').slice(0, 12));
  let dragDelta = $derived(dragStartY === null || dragCurrentY === null ? 0 : dragCurrentY - dragStartY);
  let dragHint = $derived(dragDelta > 18 ? 'expand' : dragDelta < -18 ? 'collapse' : 'idle');

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

  function beginDrag(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) return;
    activePointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragCurrentY = event.clientY;
    try {
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic/test events and older browsers may reject capture. The drag
      // still works because we keep tracking the active pointer id ourselves.
    }
  }

  function moveDrag(event: PointerEvent): void {
    if (activePointerId !== event.pointerId || dragStartY === null || dragStartX === null) return;
    const dx = Math.abs(event.clientX - dragStartX);
    const dy = Math.abs(event.clientY - dragStartY);
    dragCurrentY = event.clientY;
    // Once the user is clearly gesturing the calendar vertically, own that
    // gesture. Tiny movements still behave like normal taps/scroll attempts.
    if (dy > 14 && dy > dx * 1.15) event.preventDefault();
  }

  function endDrag(event: PointerEvent): void {
    if (activePointerId !== event.pointerId || dragStartY === null || dragCurrentY === null) return;
    commitSwipe(dragCurrentY - dragStartY);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    } catch {
      // See setPointerCapture guard above.
    }
  }

  function cancelDrag(): void {
    dragStartY = null;
    dragStartX = null;
    dragCurrentY = null;
    activePointerId = null;
  }

  function commitSwipe(delta: number): void {
    const threshold = expanded ? -42 : 42;
    if (!expanded && delta > threshold) expanded = true;
    if (expanded && delta < threshold) expanded = false;
    cancelDrag();
  }

  function beginTouch(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!touch) return;
    dragStartX = touch.clientX;
    dragStartY = touch.clientY;
    dragCurrentY = touch.clientY;
    activePointerId = -1;
  }

  function moveTouch(event: TouchEvent): void {
    if (activePointerId !== -1 || dragStartY === null || dragStartX === null) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - dragStartX);
    const dy = Math.abs(touch.clientY - dragStartY);
    dragCurrentY = touch.clientY;
    if (dy > 14 && dy > dx * 1.15) event.preventDefault();
  }

  function endTouch(): void {
    if (activePointerId !== -1 || dragStartY === null || dragCurrentY === null) return;
    commitSwipe(dragCurrentY - dragStartY);
  }

  function toggleCalendar(): void {
    expanded = !expanded;
  }

  onMount(() => {
    const refresh = () => {
      loading = true;
      void loadAgendaItems()
        .then((rows) => (items = rows))
        .finally(() => (loading = false));
    };
    const unsubLocale = locale.subscribe(refresh);
    return unsubLocale;
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
      <button type="button" class="view-toggle" onclick={toggleCalendar} aria-pressed={expanded}>
        {expanded ? $t('calendar.view.week', { default: 'Semana' }) : $t('calendar.view.month', { default: 'Mês' })}
      </button>
    </div>

    <div
      class="calendar-shell"
      data-drag={dragHint}
      role="group"
      aria-label={expanded ? $t('calendar.aria.monthGesture', { default: 'Gesto do calendário mensal' }) : $t('calendar.aria.weekGesture', { default: 'Gesto do calendário semanal' })}
      onpointerdown={beginDrag}
      onpointermove={moveDrag}
      onpointerup={endDrag}
      onpointercancel={cancelDrag}
      ontouchstart={beginTouch}
      ontouchmove={moveTouch}
      ontouchend={endTouch}
    >
      <button type="button" class="drag-handle" onclick={toggleCalendar} aria-label={expanded ? $t('calendar.action.collapse', { default: 'Recolher calendário para semana' }) : $t('calendar.action.expand', { default: 'Expandir calendário para mês' })}>
        <span></span>
      </button>

      <div
        class="calendar-grid"
        class:month-view={expanded}
        role="group"
        aria-label={expanded ? $t('calendar.aria.month', { default: 'Vista mensal do calendário' }) : $t('calendar.aria.week', { default: 'Vista semanal do calendário' })}
      >
        {#each visibleDays as day (localDateKey(day))}
          {@const count = itemsForDate(day).length}
          <div class="day-cell" data-tone={dayTone(day)} data-outside={day.getMonth() === today.getMonth() ? 'false' : 'true'}>
            <span>{day.toLocaleDateString(dateLocale, { weekday: 'short' })}</span>
            <strong>{day.getDate()}</strong>
            {#if count > 0}
              <small>{count}</small>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section id="calendar-tasks" class="tasks" aria-label={$t('calendar.tasks.aria', { default: 'Tasks próximas' })}>
    <div class="section-head">
      <h2>{$t('calendar.tasks.title', { default: 'Tasks' })}</h2>
      <a class="tasks-jump" href="#calendar-tasks">{$t('calendar.tasks.jump', { default: 'Ver lista' })}</a>
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
  .calendar-card, .tasks { margin-top: .75rem; padding: 1rem; border-radius: 1.25rem; background: var(--card, rgba(255,255,255,.055)); border: 1px solid var(--border, rgba(255,255,255,.11)); box-shadow: 0 18px 42px rgba(0,0,0,.12); }
  .section-head p, .task small, .empty { color: var(--txt2, #cbd5e1); }
  .section-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: .75rem; }
  .section-head h2 { margin: 0; font-size: 1rem; text-transform: capitalize; }
  .section-head p { margin: .15rem 0 0; font-size: .82rem; }
  .tasks-jump, .view-toggle { color: var(--accent, #ec4899); text-decoration: none; font-weight: 900; font-size: .78rem; white-space: nowrap; padding: .42rem .62rem; border-radius: 999px; background: color-mix(in srgb, var(--accent, #ec4899) 14%, transparent); border: 1px solid color-mix(in srgb, var(--accent, #ec4899) 24%, transparent); }
  .view-toggle { cursor: pointer; font: inherit; }
  .calendar-shell { border-radius: 1rem; padding: .25rem; touch-action: auto; user-select: none; -webkit-user-select: none; transition: background .16s ease, transform .16s ease; }
  .calendar-shell[data-drag='expand'] { background: color-mix(in srgb, var(--accent, #ec4899) 10%, transparent); transform: translateY(1px); }
  .calendar-shell[data-drag='collapse'] { background: color-mix(in srgb, var(--accent, #ec4899) 8%, transparent); transform: translateY(-1px); }
  .drag-handle { display: grid; place-items: center; width: 100%; height: 24px; border: 0; background: transparent; cursor: grab; }
  .drag-handle:active { cursor: grabbing; }
  .drag-handle:focus-visible, .view-toggle:focus-visible, .tasks-jump:focus-visible, .task:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent, #ec4899) 45%, white); outline-offset: 2px; }
  .drag-handle span { width: 44px; height: 5px; border-radius: 999px; background: color-mix(in srgb, var(--txt, #fff) 28%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--txt, #fff) 12%, transparent); }
  .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: .42rem; transition: gap .16s ease; }
  .day-cell { min-height: 76px; border-radius: .95rem; padding: .45rem; background: color-mix(in srgb, var(--txt, #fff) 8%, transparent); border: 1px solid var(--border, rgba(255,255,255,.08)); display: flex; flex-direction: column; gap: .15rem; transition: min-height .18s ease, padding .18s ease, background .16s ease, border-color .16s ease; }
  .month-view { gap: .28rem; }
  .month-view .day-cell { min-height: 48px; border-radius: .72rem; padding: .28rem .32rem; position: relative; }
  .day-cell[data-outside='true'] { opacity: .42; }
  .day-cell span { color: var(--txt3, #94a3b8); font-size: .65rem; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: clip; }
  .month-view .day-cell span { font-size: .54rem; letter-spacing: -.02em; }
  .day-cell strong { font-size: 1.15rem; line-height: 1; }
  .month-view .day-cell strong { font-size: .96rem; }
  .day-cell small { margin-top: auto; width: fit-content; padding: .08rem .35rem; border-radius: 999px; background: color-mix(in srgb, var(--accent, #ec4899) 18%, transparent); font-size: .68rem; }
  .month-view .day-cell small { position: absolute; right: .25rem; bottom: .22rem; font-size: .58rem; padding: .03rem .26rem; }
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
  @media (max-width: 420px) {
    .calendar-page { padding-inline: .7rem; }
    .calendar-card, .tasks { padding: .78rem; }
    .calendar-grid { gap: .24rem; }
    .day-cell { min-height: 68px; padding: .36rem; }
    .month-view .day-cell { min-height: 43px; padding: .23rem; }
    .month-view .day-cell span { font-size: .48rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    .calendar-shell, .calendar-grid, .day-cell { transition: none; }
  }
</style>
