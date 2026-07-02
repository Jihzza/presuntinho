<script lang="ts">
  import { onMount } from 'svelte';
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
  let loading = $state(true);

  const today = new Date();
  const todayKey = localDateKey(today);
  const monthLabel = today.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
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
  }

  function onPointerUp(event: PointerEvent): void {
    if (dragStartY === null) return;
    const delta = event.clientY - dragStartY;
    dragStartY = null;
    if (delta > 28) expanded = true;
    if (delta < -28) expanded = false;
  }

  onMount(() => {
    void loadAgendaItems()
      .then((rows) => (items = rows))
      .finally(() => (loading = false));
  });
</script>

<svelte:head>
  <title>Calendário · Presuntinho</title>
</svelte:head>

<div class="calendar-page">
  <a class="back" href="/">← Home</a>
  <header class="hero">
    <span>🗓️ Vida + Escola</span>
    <h1>Calendário</h1>
    <p>Centro dedicado para organizar a vida: semana por defeito, mês ao arrastar para baixo e tasks logo por baixo.</p>
  </header>

  <nav class="subnav" aria-label="Áreas do calendário">
    <a href="/calendario/">🗓️ Calendário</a>
    <a href="/notificacoes/">🔔 Notificações</a>
    <a href="/escola/trabalhos/">📝 Trabalhos</a>
    <a href="/habitos/">✅ Hábitos</a>
  </nav>

  <section class="calendar-card" aria-label="Calendário">
    <div class="section-head">
      <div>
        <h2>{expanded ? monthLabel : 'Esta semana'}</h2>
        <p>{expanded ? 'Vista mensal' : 'Vista semanal'}</p>
      </div>
      <button type="button" onclick={() => (expanded = !expanded)}>{expanded ? 'Semana' : 'Mês'}</button>
    </div>

    <div
      class="calendar-grid"
      class:month-view={expanded}
      onpointerdown={onPointerDown}
      onpointerup={onPointerUp}
      role="group"
      aria-label={expanded ? 'Vista mensal do calendário' : 'Vista semanal do calendário'}
    >
      {#each visibleDays as day (localDateKey(day))}
        <div class="day-cell" data-tone={dayTone(day)} data-outside={day.getMonth() === today.getMonth() ? 'false' : 'true'}>
          <span>{day.toLocaleDateString('pt-PT', { weekday: 'short' })}</span>
          <strong>{day.getDate()}</strong>
          {#if itemsForDate(day).length > 0}
            <small>{itemsForDate(day).length}</small>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <section class="tasks" aria-label="Tasks próximas">
    <div class="section-head">
      <h2>Tasks por baixo</h2>
      <a href="/notificacoes/">Notificações →</a>
    </div>
    {#if loading}
      <p class="empty">A carregar calendário…</p>
    {:else if upcoming.length === 0}
      <p class="empty">Nada urgente. Planeia uma tarefa nova ou revê os hábitos.</p>
    {:else}
      <div class="task-list">
        {#each upcoming as item (item.id)}
          <a class="task" data-tone={item.tone} href={item.href}>
            <span>{formatDayLabel(item.date)}</span>
            <strong>{item.title}</strong>
            <small>{item.subtitle}</small>
          </a>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .calendar-page { max-width: 880px; margin: 0 auto; padding: 1.25rem 1rem 8rem; color: #fff; }
  .back { color: #bfdbfe; text-decoration: none; font-weight: 800; }
  .hero, .calendar-card, .tasks { margin-top: 1rem; padding: 1rem; border-radius: 1.25rem; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.11); }
  .subnav { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .55rem; margin-top: 1rem; }
  .subnav a { color: #fff; text-decoration: none; padding: .75rem; border-radius: .9rem; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.1); font-weight: 800; text-align: center; }
  .subnav a:hover, .subnav a:focus-visible { background: rgba(255,255,255,.09); outline: none; }
  .hero span { color: #fde68a; text-transform: uppercase; font-size: .72rem; font-weight: 900; letter-spacing: .07em; }
  .hero h1 { margin: .35rem 0; font-size: clamp(2rem, 8vw, 3.2rem); }
  .hero p, .section-head p, .task small, .empty { color: #cbd5e1; }
  .section-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: .8rem; }
  .section-head h2 { margin: 0; font-size: 1rem; }
  .section-head p { margin: .15rem 0 0; font-size: .82rem; }
  .section-head a { color: #f9a8d4; text-decoration: none; font-weight: 800; }
  button { border: 1px solid rgba(255,255,255,.14); border-radius: 999px; min-height: 44px; padding: .65rem .95rem; background: rgba(255,255,255,.1); color: #fff; font: inherit; font-weight: 900; }
  .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: .45rem; touch-action: pan-y; }
  .day-cell { min-height: 76px; border-radius: .95rem; padding: .45rem; background: rgba(0,0,0,.22); border: 1px solid rgba(255,255,255,.08); display: flex; flex-direction: column; gap: .15rem; }
  .day-cell[data-outside='true'] { opacity: .42; }
  .day-cell span { color: #94a3b8; font-size: .65rem; text-transform: uppercase; }
  .day-cell strong { font-size: 1.15rem; }
  .day-cell small { margin-top: auto; width: fit-content; padding: .08rem .35rem; border-radius: 999px; background: rgba(255,255,255,.16); }
  .day-cell[data-tone='today'] { border-color: rgba(236,72,153,.65); background: rgba(236,72,153,.16); }
  .day-cell[data-tone='danger'] { border-color: rgba(239,68,68,.65); }
  .day-cell[data-tone='warning'] { border-color: rgba(245,158,11,.65); }
  .day-cell[data-tone='busy'] { border-color: rgba(59,130,246,.5); }
  .task-list { display: grid; gap: .6rem; }
  .task { display: grid; gap: .15rem; color: #fff; text-decoration: none; padding: .85rem; border-radius: 1rem; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.09); }
  .task span { color: #bfdbfe; font-size: .75rem; font-weight: 900; }
  .task[data-tone='danger'] { border-color: rgba(239,68,68,.5); }
  .task[data-tone='warning'] { border-color: rgba(245,158,11,.5); }
  .empty { margin: 0; }
</style>
