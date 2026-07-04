<script lang="ts">
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import {
    addEvent,
    dayTone,
    deleteEvent,
    formatDayLabel,
    itemsForDate,
    loadAgendaItemsForRange,
    loadMoodsForRange,
    localDateKey,
    monthGridDays,
    moodEmoji,
    weekDays,
    type AgendaItem,
    type EventKind
  } from '$lib/vida/agenda';
  import { listHabitos, localizedHabit, setHabitLog, type Habit } from '$lib/habitos';
  import { awardXP } from '$lib/state/xp-actions';
  import { fireConfettiEvent, showToast } from '$lib/components/events';

  const LAYERS_STORAGE_KEY = 'presuntinho:calendar:layers';
  const EVENT_ICONS = ['🎉', '💗', '🎂', '🌹', '📌', '⏰', '✨', '🎁'];

  type LayerKey = 'habits' | 'school' | 'events' | 'finance' | 'moods';
  interface LayerState {
    habits: boolean;
    school: boolean;
    events: boolean;
    finance: boolean;
    moods: boolean;
  }

  let items = $state<AgendaItem[]>([]);
  let moods = $state<Record<string, string>>({});
  let habits = $state<Habit[]>([]);
  let loading = $state(true);
  let mounted = $state(false);
  let refreshToken = $state(0);
  let anchor = $state(new Date());
  let expanded = $state(false);
  let layers = $state<LayerState>({ habits: true, school: true, events: true, finance: false, moods: true });
  let selectedDate = $state<string | null>(null);

  // Quick-add event form (inside the day sheet)
  let formTitle = $state('');
  let formIcon = $state('🎉');
  let formKind = $state<EventKind>('event');
  let formYearly = $state(false);
  let saving = $state(false);

  // Drag / swipe between week and month view
  let dragStartY = $state<number | null>(null);
  let dragStartX = $state<number | null>(null);
  let dragCurrentY = $state<number | null>(null);
  let activePointerId = $state<number | null>(null);

  const today = new Date();
  const todayKey = localDateKey(today);
  let requestSeq = 0;

  const dateLocale = $derived($locale || 'pt-PT');
  const monthLabel = $derived(anchor.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' }));
  let visibleDays = $derived(expanded ? monthGridDays(anchor) : weekDays(anchor));
  let sinceKey = $derived(localDateKey(visibleDays[0]));
  let untilKey = $derived(localDateKey(visibleDays[visibleDays.length - 1]));
  let dragDelta = $derived(dragStartY === null || dragCurrentY === null ? 0 : dragCurrentY - dragStartY);
  let dragHint = $derived(dragDelta > 18 ? 'expand' : dragDelta < -18 ? 'collapse' : 'idle');

  let visibleItems = $derived(items.filter((item) =>
    item.kind === 'habit' ? layers.habits
    : item.kind === 'assignment' ? layers.school
    : item.kind === 'life' ? layers.events
    : layers.finance
  ));
  let upcoming = $derived(
    visibleItems
      .filter((item) => item.date >= todayKey && item.status !== 'done' && item.kind !== 'finance')
      .slice(0, 12)
  );

  let localizedHabits = $derived(habits.map((h) => localizedHabit($t, h)));
  let selectedItems = $derived(selectedDate ? itemsForDate(visibleItems, selectedDate) : []);
  let selectedDoneHabits = $derived(new Set(
    selectedDate
      ? items
          .filter((i) => i.kind === 'habit' && i.date === selectedDate && i.status === 'done' && typeof i.habitId === 'number')
          .map((i) => i.habitId as number)
      : []
  ));
  let selectedIsFuture = $derived(selectedDate !== null && selectedDate > todayKey);
  let selectedMood = $derived(selectedDate ? (moods[selectedDate] ?? null) : null);
  let selectedHasSpecial = $derived(selectedItems.some((i) => i.eventKind === 'special'));
  let selectedLabel = $derived(selectedDate
    ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })
    : '');

  let layerDefs = $derived([
    { key: 'habits' as LayerKey, emoji: '🌱', label: $t('calendar.layers.habits', { default: 'Hábitos' }) },
    { key: 'school' as LayerKey, emoji: '🎓', label: $t('calendar.layers.school', { default: 'Escola' }) },
    { key: 'events' as LayerKey, emoji: '🎉', label: $t('calendar.layers.events', { default: 'Eventos' }) },
    { key: 'finance' as LayerKey, emoji: '💶', label: $t('calendar.layers.finance', { default: 'Finanças' }) },
    { key: 'moods' as LayerKey, emoji: '💭', label: $t('calendar.layers.moods', { default: 'Humor' }) }
  ]);

  function cellItems(day: Date): AgendaItem[] {
    return itemsForDate(visibleItems, localDateKey(day));
  }

  function cellTone(day: Date): string {
    const key = localDateKey(day);
    return dayTone(itemsForDate(visibleItems, key), key === todayKey);
  }

  function shiftPeriod(dir: 1 | -1): void {
    anchor = expanded
      ? new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1)
      : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + dir * 7);
  }

  function goToday(): void {
    anchor = new Date();
  }

  function toggleLayer(key: LayerKey): void {
    layers = { ...layers, [key]: !layers[key] };
    try {
      localStorage.setItem(LAYERS_STORAGE_KEY, JSON.stringify(layers));
    } catch {
      // Private mode / quota — the chips still work for this session.
    }
  }

  function openDay(dateKey: string): void {
    selectedDate = dateKey;
  }

  function closeDay(): void {
    selectedDate = null;
  }

  async function toggleHabit(habit: Habit): Promise<void> {
    if (!selectedDate || selectedIsFuture) return;
    const wasDone = selectedDoneHabits.has(habit.id);
    try {
      const { changed } = await setHabitLog(habit.id, selectedDate, !wasDone);
      if (!changed) return;
      if (!wasDone) {
        await awardXP('habito_mark_done');
        showToast($t('calendar.habit.marked_toast', { default: 'Hábito marcado ✓' }));
      } else {
        showToast($t('calendar.habit.unmarked_toast', { default: 'Marcação removida.' }));
      }
      refreshToken++;
    } catch (err) {
      console.error('[calendario] toggleHabit failed', err);
    }
  }

  async function submitEvent(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!selectedDate || saving) return;
    const title = formTitle.trim();
    if (!title) return;
    saving = true;
    try {
      await addEvent({ date: selectedDate, title, icon: formIcon, kind: formKind, yearly: formYearly });
      if (formKind === 'special') {
        fireConfettiEvent(45);
        showToast($t('calendar.event.special_saved_toast', { default: 'Data especial guardada 💖 +2 XP' }));
      } else {
        showToast($t('calendar.event.saved_toast', { default: 'Guardado no calendário! +2 XP' }));
      }
      formTitle = '';
      formYearly = false;
      refreshToken++;
    } catch (err) {
      console.error('[calendario] addEvent failed', err);
      showToast($t('calendar.event.error_toast', { default: 'Não foi possível guardar. Tenta outra vez.' }));
    } finally {
      saving = false;
    }
  }

  async function removeEvent(item: AgendaItem): Promise<void> {
    if (typeof item.eventId !== 'number') return;
    try {
      await deleteEvent(item.eventId);
      showToast($t('calendar.event.deleted_toast', { default: 'Evento apagado.' }));
      refreshToken++;
    } catch (err) {
      console.error('[calendario] deleteEvent failed', err);
    }
  }

  // ------------------------------------------------------------------
  // Week ⇄ month drag gesture (unchanged behavior)
  // ------------------------------------------------------------------

  function beginDrag(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) return;
    activePointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragCurrentY = event.clientY;
    try {
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic/test events and older browsers may reject capture.
    }
  }

  function moveDrag(event: PointerEvent): void {
    if (activePointerId !== event.pointerId || dragStartY === null || dragStartX === null) return;
    const dx = Math.abs(event.clientX - dragStartX);
    const dy = Math.abs(event.clientY - dragStartY);
    dragCurrentY = event.clientY;
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

  // ------------------------------------------------------------------
  // Data loading — reloads whenever the visible range changes
  // ------------------------------------------------------------------

  $effect(() => {
    if (!mounted) return;
    const since = sinceKey;
    const until = untilKey;
    void refreshToken;
    const seq = ++requestSeq;
    loading = true;
    void Promise.all([loadAgendaItemsForRange(since, until), loadMoodsForRange(since, until)])
      .then(([rows, moodMap]) => {
        if (seq !== requestSeq) return;
        items = rows;
        moods = moodMap;
      })
      .catch((err) => console.error('[calendario] load failed', err))
      .finally(() => {
        if (seq === requestSeq) loading = false;
      });
  });

  onMount(() => {
    try {
      const raw = localStorage.getItem(LAYERS_STORAGE_KEY);
      if (raw) layers = { ...layers, ...JSON.parse(raw) };
    } catch {
      // Corrupt/blocked storage — defaults are fine.
    }
    mounted = true;
    void listHabitos()
      .then((rows) => (habits = rows))
      .catch((err) => console.error('[calendario] listHabitos failed', err));
    let first = true;
    const unsubLocale = locale.subscribe(() => {
      if (first) {
        first = false;
        return;
      }
      refreshToken++;
    });
    return unsubLocale;
  });
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' && selectedDate) closeDay();
  }}
/>

<svelte:head>
  <title>{$t('calendar.meta.title', { default: 'Calendário · Presuntinho' })}</title>
</svelte:head>

<div class="calendar-page">
  <section class="calendar-card" aria-label={$t('calendar.aria.calendar', { default: 'Calendário' })}>
    <div class="section-head">
      <div class="month-nav">
        <button
          type="button"
          class="nav-btn"
          onclick={() => shiftPeriod(-1)}
          aria-label={expanded ? $t('calendar.nav.prev_month', { default: 'Mês anterior' }) : $t('calendar.nav.prev_week', { default: 'Semana anterior' })}
        >‹</button>
        <div class="month-copy">
          <h2>{monthLabel}</h2>
          <p>{expanded ? $t('calendar.hint.collapse', { default: 'Arrasta para cima para voltar à semana' }) : $t('calendar.hint.expand', { default: 'Arrasta para baixo para abrir o mês' })}</p>
        </div>
        <button
          type="button"
          class="nav-btn"
          onclick={() => shiftPeriod(1)}
          aria-label={expanded ? $t('calendar.nav.next_month', { default: 'Mês seguinte' }) : $t('calendar.nav.next_week', { default: 'Semana seguinte' })}
        >›</button>
      </div>
      <div class="head-actions">
        <button type="button" class="view-toggle" onclick={goToday}>
          {$t('calendar.nav.today', { default: 'Hoje' })}
        </button>
        <button type="button" class="view-toggle" onclick={toggleCalendar} aria-pressed={expanded}>
          {expanded ? $t('calendar.view.week', { default: 'Semana' }) : $t('calendar.view.month', { default: 'Mês' })}
        </button>
      </div>
    </div>

    <div class="layer-chips" role="group" aria-label={$t('calendar.layers.aria', { default: 'Camadas do calendário' })}>
      {#each layerDefs as def (def.key)}
        <button type="button" class="chip" aria-pressed={layers[def.key]} onclick={() => toggleLayer(def.key)}>
          <span aria-hidden="true">{def.emoji}</span> {def.label}
        </button>
      {/each}
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
          {@const key = localDateKey(day)}
          {@const count = cellItems(day).length}
          <button
            type="button"
            class="day-cell"
            data-tone={cellTone(day)}
            data-outside={day.getMonth() === anchor.getMonth() ? 'false' : 'true'}
            onclick={() => openDay(key)}
            aria-label={$t('calendar.day.open_aria', {
              values: { day: formatDayLabel(key, dateLocale), count },
              default: 'Abrir {day} — {count} itens'
            })}
          >
            <span>{day.toLocaleDateString(dateLocale, { weekday: 'short' })}</span>
            <strong>{day.getDate()}</strong>
            <span class="cell-meta">
              {#if layers.moods && moods[key]}
                <span class="mood-dot" aria-hidden="true">{moodEmoji(moods[key])}</span>
              {/if}
              {#if count > 0}
                <small>{count}</small>
              {/if}
            </span>
          </button>
        {/each}
      </div>
    </div>
  </section>

  <section id="calendar-tasks" class="tasks" aria-label={$t('calendar.tasks.aria', { default: 'Tasks próximas' })}>
    <div class="section-head">
      <h2>{$t('calendar.tasks.title', { default: 'Tasks' })}</h2>
      <button type="button" class="tasks-jump" onclick={() => openDay(todayKey)}>
        {$t('calendar.tasks.open_today', { default: 'Ver hoje' })}
      </button>
    </div>
    {#if loading}
      <Skeleton variant="card" lines={3} label={$t('calendar.loading', { default: 'A carregar calendário…' })} />
    {:else if upcoming.length === 0}
      <p class="empty">{$t('calendar.empty', { default: 'Nada urgente. Planeia uma tarefa nova ou revê os hábitos.' })}</p>
    {:else}
      <div class="task-list">
        {#each upcoming as item (item.id)}
          {#if item.kind === 'assignment'}
            <a class="task" data-tone={item.tone} href={item.href}>
              <span>{formatDayLabel(item.date, dateLocale)}</span>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </a>
          {:else}
            <button
              type="button"
              class="task"
              data-tone={item.tone}
              data-special={item.eventKind === 'special' ? 'true' : 'false'}
              onclick={() => openDay(item.date)}
            >
              <span>{formatDayLabel(item.date, dateLocale)}</span>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </button>
          {/if}
        {/each}
      </div>
    {/if}
  </section>
</div>

{#if selectedDate}
  <button type="button" class="sheet-backdrop" onclick={closeDay} aria-label={$t('calendar.day.close', { default: 'Fechar' })}></button>
  <div class="day-sheet" role="dialog" aria-modal="true" aria-label={selectedLabel}>
    <header class="sheet-head" data-special={selectedHasSpecial ? 'true' : 'false'}>
      <div>
        <h3>{selectedLabel}</h3>
        {#if selectedHasSpecial}
          <p class="special-line">💞 {$t('calendar.day.special', { default: 'Dia especial' })}</p>
        {/if}
        {#if layers.moods && selectedMood}
          <p class="mood-line"><span aria-hidden="true">{moodEmoji(selectedMood)}</span> {$t('calendar.day.mood', { default: 'Humor registado neste dia' })}</p>
        {/if}
      </div>
      <button type="button" class="sheet-close" onclick={closeDay} aria-label={$t('calendar.day.close', { default: 'Fechar' })}>✕</button>
    </header>

    <div class="sheet-body">
      <h4>{$t('calendar.day.items_title', { default: 'Neste dia' })}</h4>
      {#if selectedItems.length === 0}
        <p class="empty">{$t('calendar.day.empty', { default: 'Dia livre. Podes juntar um evento aqui em baixo. 💛' })}</p>
      {:else}
        <ul class="day-items">
          {#each selectedItems as item (item.id)}
            <li class="day-item" data-tone={item.tone} data-special={item.eventKind === 'special' ? 'true' : 'false'}>
              {#if item.kind === 'assignment'}
                <a class="day-item-copy" href={item.href}>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </a>
              {:else}
                <div class="day-item-copy">
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </div>
              {/if}
              {#if typeof item.eventId === 'number'}
                <button
                  type="button"
                  class="item-delete"
                  onclick={() => removeEvent(item)}
                  aria-label={$t('calendar.event.delete_aria', { values: { title: item.title }, default: 'Apagar {title}' })}
                >✕</button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      {#if layers.habits && localizedHabits.length > 0}
        <h4>{$t('calendar.day.habits_title', { default: 'Hábitos deste dia' })}</h4>
        {#if selectedIsFuture}
          <p class="hint">{$t('calendar.day.habit_future', { default: 'Este dia ainda não chegou — os hábitos marcam-se no próprio dia. 😉' })}</p>
        {:else}
          <div class="habit-toggles">
            {#each localizedHabits as habit (habit.id)}
              {@const done = selectedDoneHabits.has(habit.id)}
              <button type="button" class="habit-toggle" aria-pressed={done} onclick={() => toggleHabit(habit)}>
                <span class="habit-check" data-done={done ? 'true' : 'false'} aria-hidden="true">{done ? '✓' : ''}</span>
                <span class="habit-name">{habit.icon} {habit.name}</span>
                <small>{done ? $t('calendar.day.habit_done', { default: 'feito' }) : $t('calendar.day.habit_pending', { default: 'por fazer' })}</small>
              </button>
            {/each}
          </div>
        {/if}
      {/if}

      <form class="event-form" onsubmit={submitEvent}>
        <h4>{$t('calendar.event.form_title', { default: 'Adicionar ao calendário' })}</h4>
        <label class="field">
          <span>{$t('calendar.event.title_label', { default: 'Título' })}</span>
          <input
            type="text"
            bind:value={formTitle}
            maxlength="80"
            placeholder={$t('calendar.event.title_placeholder', { default: 'Ex.: jantar com a família' })}
          />
        </label>

        <div class="field">
          <span id="cal-icon-label">{$t('calendar.event.icon_label', { default: 'Ícone' })}</span>
          <div class="icon-row" role="group" aria-labelledby="cal-icon-label">
            {#each EVENT_ICONS as icon (icon)}
              <button type="button" class="icon-pick" aria-pressed={formIcon === icon} onclick={() => (formIcon = icon)}>{icon}</button>
            {/each}
          </div>
        </div>

        <div class="field">
          <span id="cal-kind-label">{$t('calendar.event.kind_label', { default: 'Tipo' })}</span>
          <div class="kind-row" role="group" aria-labelledby="cal-kind-label">
            <button type="button" class="kind-pick" aria-pressed={formKind === 'event'} onclick={() => (formKind = 'event')}>
              📌 {$t('calendar.event.kind.event', { default: 'Evento' })}
            </button>
            <button type="button" class="kind-pick" aria-pressed={formKind === 'special'} onclick={() => (formKind = 'special')}>
              💗 {$t('calendar.event.kind.special', { default: 'Especial' })}
            </button>
            <button type="button" class="kind-pick" aria-pressed={formKind === 'reminder'} onclick={() => (formKind = 'reminder')}>
              ⏰ {$t('calendar.event.kind.reminder', { default: 'Lembrete' })}
            </button>
          </div>
        </div>

        <label class="yearly">
          <input type="checkbox" bind:checked={formYearly} />
          <span>{$t('calendar.event.yearly_label', { default: 'Repetir todos os anos' })}</span>
        </label>

        <button type="submit" class="save-btn" disabled={saving || formTitle.trim().length === 0}>
          {saving ? $t('calendar.event.saving', { default: 'A guardar…' }) : $t('calendar.event.save', { default: 'Guardar' })}
        </button>
      </form>
    </div>
  </div>
{/if}

<style>
  .calendar-page { max-width: 880px; margin: 0 auto; padding: .85rem 1rem 8rem; color: var(--txt); }
  .calendar-card, .tasks { margin-top: var(--space-3, .75rem); padding: var(--space-4, 1rem); border-radius: var(--radius-xl, 1.25rem); background: var(--card); border: 1px solid var(--border); box-shadow: var(--shadow-md, 0 18px 42px rgba(0,0,0,.12)); }
  .section-head p, .task small, .empty, .hint { color: var(--txt2); }
  .section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3, .75rem); margin-bottom: var(--space-3, .75rem); flex-wrap: wrap; }
  .section-head h2 { margin: 0; font-size: var(--fs-md, 1rem); text-transform: capitalize; }
  .month-nav { display: flex; align-items: center; gap: var(--space-2, .5rem); min-width: 0; }
  .month-copy { min-width: 0; }
  .month-copy p { margin: .15rem 0 0; font-size: .82rem; }
  .nav-btn { min-width: 44px; min-height: 44px; border-radius: var(--radius-md, .75rem); border: 1px solid var(--border); background: var(--bg-elev, transparent); color: var(--txt); font-size: 1.3rem; font-weight: 900; cursor: pointer; }
  .nav-btn:hover { background: var(--card-hover, var(--card)); }
  .head-actions { display: flex; gap: var(--space-2, .5rem); }
  .tasks-jump, .view-toggle { color: var(--accent); font: inherit; text-decoration: none; font-weight: 900; font-size: .78rem; white-space: nowrap; padding: .55rem .72rem; min-height: 44px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 14%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent); cursor: pointer; }
  .layer-chips { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: var(--space-2, .5rem); }
  .chip { font: inherit; font-size: .74rem; font-weight: 800; color: var(--txt2); padding: .5rem .68rem; min-height: 40px; border-radius: 999px; background: color-mix(in srgb, var(--txt) 6%, transparent); border: 1px solid var(--border); cursor: pointer; transition: background var(--motion-fast, 120ms) ease, color var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease; }
  .chip[aria-pressed='true'] { color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
  .calendar-shell { border-radius: var(--radius-lg, 1rem); padding: .25rem; touch-action: auto; user-select: none; -webkit-user-select: none; transition: background var(--motion-fast, 120ms) ease, transform var(--motion-fast, 120ms) ease; }
  .calendar-shell[data-drag='expand'] { background: color-mix(in srgb, var(--accent) 10%, transparent); transform: translateY(1px); }
  .calendar-shell[data-drag='collapse'] { background: color-mix(in srgb, var(--accent) 8%, transparent); transform: translateY(-1px); }
  .drag-handle { display: grid; place-items: center; width: 100%; height: 24px; border: 0; background: transparent; cursor: grab; }
  .drag-handle:active { cursor: grabbing; }
  .drag-handle span { width: 44px; height: 5px; border-radius: 999px; background: color-mix(in srgb, var(--txt) 28%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--txt) 12%, transparent); }
  .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: .42rem; transition: gap var(--motion-fast, 120ms) ease; }
  .day-cell { font: inherit; color: var(--txt); text-align: start; cursor: pointer; min-height: 76px; border-radius: .95rem; padding: .45rem; background: color-mix(in srgb, var(--txt) 8%, transparent); border: 1px solid var(--border); display: flex; flex-direction: column; gap: .15rem; transition: min-height var(--motion-base, 220ms) ease, padding var(--motion-base, 220ms) ease, background var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease; }
  .day-cell:hover { background: color-mix(in srgb, var(--txt) 12%, transparent); }
  .month-view { gap: .28rem; }
  .month-view .day-cell { min-height: 48px; border-radius: .72rem; padding: .28rem .32rem; position: relative; }
  .day-cell[data-outside='true'] { opacity: .42; }
  .day-cell > span:first-child { color: var(--txt3); font-size: .65rem; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: clip; }
  .month-view .day-cell > span:first-child { font-size: .54rem; letter-spacing: -.02em; }
  .day-cell strong { font-size: 1.15rem; line-height: 1; }
  .month-view .day-cell strong { font-size: .96rem; }
  .cell-meta { margin-top: auto; display: flex; align-items: center; gap: .2rem; }
  .day-cell small { width: fit-content; padding: .08rem .35rem; border-radius: 999px; background: color-mix(in srgb, var(--accent) 18%, transparent); font-size: .68rem; }
  .mood-dot { font-size: .72rem; line-height: 1; }
  .month-view .day-cell .cell-meta { position: absolute; right: .22rem; bottom: .2rem; }
  .month-view .day-cell small { font-size: .58rem; padding: .03rem .26rem; }
  .month-view .mood-dot { font-size: .6rem; }
  .day-cell[data-tone='today'] { border-color: color-mix(in srgb, var(--accent) 65%, transparent); background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .day-cell[data-tone='danger'] { border-color: color-mix(in srgb, var(--error, #ef4444) 65%, transparent); }
  .day-cell[data-tone='warning'] { border-color: color-mix(in srgb, var(--warning, #f59e0b) 65%, transparent); }
  .day-cell[data-tone='busy'] { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
  .day-cell[data-tone='special'] { border-color: color-mix(in srgb, var(--accent) 55%, transparent); background: color-mix(in srgb, var(--accent) 9%, transparent); }
  .task-list { display: grid; gap: .6rem; }
  .task { font: inherit; text-align: start; cursor: pointer; display: grid; gap: .15rem; color: var(--txt); text-decoration: none; padding: .85rem; border-radius: var(--radius-lg, 1rem); background: color-mix(in srgb, var(--txt) 7%, transparent); border: 1px solid var(--border); }
  .task > span { color: var(--accent); font-size: .75rem; font-weight: 900; }
  .task[data-tone='danger'] { border-color: color-mix(in srgb, var(--error, #ef4444) 50%, transparent); }
  .task[data-tone='warning'] { border-color: color-mix(in srgb, var(--warning, #f59e0b) 50%, transparent); }
  .task[data-special='true'] { border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, transparent), color-mix(in srgb, var(--txt) 6%, transparent)); }
  .empty, .hint { margin: 0; }

  /* --- day sheet (bottom sheet) --- */
  .sheet-backdrop { position: fixed; inset: 0; z-index: 60; border: 0; cursor: pointer; background: color-mix(in srgb, black 55%, transparent); backdrop-filter: blur(2px); }
  .day-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 61; max-width: 680px; margin: 0 auto; max-height: 82vh; display: flex; flex-direction: column; background: var(--bg-elev, var(--card)); border: 1px solid var(--border); border-bottom: 0; border-radius: var(--radius-xl, 1.25rem) var(--radius-xl, 1.25rem) 0 0; box-shadow: var(--shadow-lg, 0 -18px 48px rgba(0,0,0,.35)); animation: sheet-up var(--motion-base, 220ms) ease; }
  @keyframes sheet-up { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3, .75rem); padding: var(--space-4, 1rem) var(--space-4, 1rem) var(--space-2, .5rem); }
  .sheet-head[data-special='true'] { background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 14%, transparent), transparent); border-radius: var(--radius-xl, 1.25rem) var(--radius-xl, 1.25rem) 0 0; }
  .sheet-head h3 { margin: 0; font-size: var(--fs-lg, 1.1rem); text-transform: capitalize; }
  .special-line { margin: .25rem 0 0; color: var(--accent); font-weight: 800; font-size: .82rem; }
  .mood-line { margin: .25rem 0 0; color: var(--txt2); font-size: .82rem; }
  .sheet-close { min-width: 44px; min-height: 44px; border-radius: 999px; border: 1px solid var(--border); background: color-mix(in srgb, var(--txt) 7%, transparent); color: var(--txt); font-size: 1rem; cursor: pointer; }
  .sheet-body { overflow-y: auto; padding: 0 var(--space-4, 1rem) calc(var(--space-6, 1.5rem) + env(safe-area-inset-bottom, 0px)); }
  .sheet-body h4 { margin: var(--space-4, 1rem) 0 var(--space-2, .5rem); font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: var(--txt3); }
  .day-items { list-style: none; margin: 0; padding: 0; display: grid; gap: .45rem; }
  .day-item { display: flex; align-items: center; gap: .6rem; padding: .65rem .75rem; border-radius: var(--radius-md, .8rem); background: color-mix(in srgb, var(--txt) 6%, transparent); border: 1px solid var(--border); }
  .day-item[data-tone='danger'] { border-color: color-mix(in srgb, var(--error, #ef4444) 50%, transparent); }
  .day-item[data-tone='warning'] { border-color: color-mix(in srgb, var(--warning, #f59e0b) 50%, transparent); }
  .day-item[data-tone='done'] { opacity: .75; }
  .day-item[data-special='true'] { border-color: color-mix(in srgb, var(--accent) 50%, transparent); background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, transparent), color-mix(in srgb, var(--accent) 4%, transparent)); }
  .day-item-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .1rem; color: var(--txt); text-decoration: none; }
  .day-item-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .day-item-copy small { color: var(--txt2); }
  .item-delete { min-width: 40px; min-height: 40px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--txt3); cursor: pointer; }
  .item-delete:hover { color: var(--error, #ef4444); border-color: color-mix(in srgb, var(--error, #ef4444) 45%, transparent); }
  .habit-toggles { display: grid; gap: .4rem; }
  .habit-toggle { font: inherit; display: flex; align-items: center; gap: .6rem; min-height: 48px; padding: .5rem .7rem; border-radius: var(--radius-md, .8rem); background: color-mix(in srgb, var(--txt) 6%, transparent); border: 1px solid var(--border); color: var(--txt); cursor: pointer; text-align: start; }
  .habit-toggle[aria-pressed='true'] { border-color: color-mix(in srgb, var(--success, #22c55e) 55%, transparent); background: color-mix(in srgb, var(--success, #22c55e) 8%, transparent); }
  .habit-check { display: grid; place-items: center; width: 26px; height: 26px; flex-shrink: 0; border-radius: 999px; border: 2px solid color-mix(in srgb, var(--txt) 30%, transparent); font-size: .8rem; font-weight: 900; color: var(--on-accent, #fff); }
  .habit-check[data-done='true'] { border-color: var(--success, #22c55e); background: var(--success, #22c55e); }
  .habit-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .habit-toggle small { color: var(--txt3); }
  .event-form { display: grid; gap: var(--space-3, .75rem); margin-top: var(--space-2, .5rem); padding: var(--space-3, .75rem); border-radius: var(--radius-lg, 1rem); background: color-mix(in srgb, var(--txt) 4%, transparent); border: 1px dashed var(--border); }
  .event-form h4 { margin: 0; }
  .field { display: grid; gap: .35rem; }
  .field > span { font-size: .78rem; font-weight: 800; color: var(--txt2); }
  .field input[type='text'] { font: inherit; min-height: 44px; padding: .55rem .7rem; border-radius: var(--radius-md, .8rem); border: 1px solid var(--border); background: color-mix(in srgb, var(--txt) 6%, transparent); color: var(--txt); }
  .field input[type='text']::placeholder { color: var(--txt3); }
  .icon-row, .kind-row { display: flex; flex-wrap: wrap; gap: .35rem; }
  .icon-pick { font-size: 1.1rem; min-width: 44px; min-height: 44px; border-radius: var(--radius-md, .8rem); border: 1px solid var(--border); background: color-mix(in srgb, var(--txt) 6%, transparent); cursor: pointer; }
  .icon-pick[aria-pressed='true'] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .kind-pick { font: inherit; font-size: .8rem; font-weight: 800; color: var(--txt2); min-height: 44px; padding: .5rem .7rem; border-radius: 999px; border: 1px solid var(--border); background: color-mix(in srgb, var(--txt) 6%, transparent); cursor: pointer; }
  .kind-pick[aria-pressed='true'] { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .yearly { display: flex; align-items: center; gap: .55rem; min-height: 44px; color: var(--txt2); font-size: .88rem; cursor: pointer; }
  .yearly input { width: 1.15rem; height: 1.15rem; accent-color: var(--accent); }
  .save-btn { font: inherit; font-weight: 900; min-height: 48px; border-radius: 999px; border: 0; background: var(--accent); color: var(--on-accent, #fff); cursor: pointer; transition: background var(--motion-fast, 120ms) ease, transform var(--motion-fast, 120ms) ease; }
  .save-btn:hover:not(:disabled) { background: var(--accent-hover, var(--accent)); }
  .save-btn:active:not(:disabled) { transform: scale(.98); }
  .save-btn:disabled { opacity: .55; cursor: not-allowed; }

  .drag-handle:focus-visible, .view-toggle:focus-visible, .tasks-jump:focus-visible, .task:focus-visible,
  .nav-btn:focus-visible, .chip:focus-visible, .day-cell:focus-visible, .sheet-close:focus-visible,
  .sheet-backdrop:focus-visible, .item-delete:focus-visible, .habit-toggle:focus-visible,
  .icon-pick:focus-visible, .kind-pick:focus-visible, .save-btn:focus-visible, .field input:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--accent) 55%, var(--txt));
    outline-offset: 2px;
  }

  @media (max-width: 420px) {
    .calendar-page { padding-inline: .7rem; }
    .calendar-card, .tasks { padding: .78rem; }
    .calendar-grid { gap: .24rem; }
    .day-cell { min-height: 68px; padding: .36rem; }
    .month-view .day-cell { min-height: 46px; padding: .23rem; }
    .month-view .day-cell > span:first-child { font-size: .48rem; }
  }
</style>
