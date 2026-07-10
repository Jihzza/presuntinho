<script lang="ts">
  /**
   * /streaks/ — página real de streaks e progresso (V10.1, tarefa E).
   *
   * O que o Duolingo faz numa página dedicada, o Presuntinho faz aqui:
   *   1. Hero: chama grande + dias seguidos + estado de hoje + mascote.
   *   2. Semana atual (círculos) + XP dos últimos 7 dias (barras).
   *   3. Calendário mensal de atividade (ativo / congelado / hoje).
   *   4. Congelamentos: quantos tens, como se ganham.
   *   5. Marcos 7→365 com estado alcançado/por alcançar.
   * Tudo lê as APIs V10 (streak.ts / levels.ts) — zero esquema novo.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { locale, t } from 'svelte-i18n';
  import { xp, initStores } from '$lib/state/stores';
  import { XP_CHANGED_EVENT } from '$lib/state/xp-actions';
  import {
    getActiveDaySet,
    getActivityStreak,
    getWeekActivity,
    readStateV8,
    localDateKey,
    MAX_FREEZES,
    STREAK_MILESTONES,
    type ActivityStreak,
    type WeekDayActivity
  } from '$lib/gamification/streak';
  import { progressToNext } from '$lib/gamification/levels';
  import { getActiveMascot, DEFAULT_MASCOT_ID } from '$lib/gamification/mascots';
  import WeekCircles from '$lib/components/WeekCircles.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import MascotAvatar from '$lib/components/MascotAvatar.svelte';

  let loading = $state(true);
  let streak = $state<ActivityStreak | null>(null);
  let week = $state<WeekDayActivity[]>([]);
  let activeDays = $state<Set<string>>(new Set());
  let frozenDays = $state<Set<string>>(new Set());
  let xpDaily = $state<Record<string, number>>({});
  let mascotId = $state(DEFAULT_MASCOT_ID);
  let currentXp = $state(0);
  let monthOffset = $state(0);

  const dateLocale = $derived($locale || 'pt-PT');
  const levelInfo = $derived(progressToNext(currentXp));
  const todayKey = $derived(localDateKey(new Date()));

  // ── calendário mensal ──────────────────────────────────────────────────
  const monthAnchor = $derived.by(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  });
  const monthLabel = $derived(
    new Intl.DateTimeFormat(dateLocale, { month: 'long', year: 'numeric' }).format(monthAnchor)
  );
  const monthCells = $derived.by(() => {
    const y = monthAnchor.getFullYear();
    const m = monthAnchor.getMonth();
    const firstWeekday = (new Date(y, m, 1).getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: Array<{ key: string; day: number } | null> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ key: localDateKey(new Date(y, m, d)), day: d });
    }
    return cells;
  });
  const weekdayInitials = $derived.by(() => {
    const fmt = new Intl.DateTimeFormat(dateLocale, { weekday: 'narrow' });
    // 2024-01-01 was a Monday.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  });

  // ── XP dos últimos 7 dias ──────────────────────────────────────────────
  const xpWeek = $derived.by(() => {
    const out: Array<{ key: string; label: string; xp: number }> = [];
    const fmt = new Intl.DateTimeFormat(dateLocale, { weekday: 'narrow' });
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = localDateKey(d);
      out.push({ key, label: fmt.format(d), xp: xpDaily[key] ?? 0 });
    }
    return out;
  });
  const xpWeekMax = $derived(Math.max(1, ...xpWeek.map((d) => d.xp)));
  const xpWeekTotal = $derived(xpWeek.reduce((s, d) => s + d.xp, 0));
  const xpToday = $derived(xpDaily[todayKey] ?? 0);

  const nextMilestone = $derived(
    STREAK_MILESTONES.find((m) => (streak?.current ?? 0) < m) ?? null
  );

  async function refresh(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      await initStores();
      const [s, w, days, row, mascot] = await Promise.all([
        getActivityStreak(),
        getWeekActivity(),
        getActiveDaySet(),
        readStateV8().catch(() => undefined),
        getActiveMascot().catch(() => undefined)
      ]);
      streak = s;
      week = w;
      activeDays = days;
      frozenDays = new Set(Array.isArray(row?.streakFrozenDays) ? row.streakFrozenDays : []);
      xpDaily = row?.xpDailyLog ?? {};
      if (mascot) mascotId = mascot.id;
      currentXp = get(xp);
    } catch (e) {
      console.warn('[streaks] refresh failed', e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void refresh();
    const unsubXp = xp.subscribe((v) => (currentXp = v));
    const onXp = () => void refresh();
    window.addEventListener(XP_CHANGED_EVENT, onXp);
    return () => {
      window.removeEventListener(XP_CHANGED_EVENT, onXp);
      unsubXp();
    };
  });
</script>

<svelte:head>
  <title>{$t('streaks.page.title', { default: '🔥 Streaks e Progresso' })} · Presuntinho</title>
  <meta
    name="description"
    content={$t('streaks.seo.description', { default: 'A tua chama, XP e progresso diário' })}
  />
</svelte:head>

<div class="streaks-page">
  <nav class="breadcrumb">
    <a href="/">← {$t('streaks.back_home', { default: 'Início' })}</a>
  </nav>

  {#if loading}
    <Skeleton variant="card" lines={3} />
  {:else}
    <!-- 1 · Hero -->
    <header class="card hero" class:lit={streak?.activeToday}>
      <span class="hero-flame" class:unlit={!streak?.activeToday} aria-hidden="true">🔥</span>
      <h1>
        {$t('streaks.hero.days', {
          values: { count: streak?.current ?? 0 },
          default: '{count, plural, one {# dia seguido} other {# dias seguidos}}'
        })}
      </h1>
      <p class="hero-status" class:ok={streak?.activeToday}>
        {streak?.activeToday
          ? $t('streak.popover.active_today', { default: 'Hoje já contou — a chama está acesa!' })
          : $t('streak.popover.idle_today', {
              default: 'Faz uma atividade hoje para acender a chama.'
            })}
      </p>
      <p class="hero-mascot">
        <MascotAvatar mascot={mascotId} emotion={streak?.activeToday ? 'happy' : 'neutral'} size={44} eager />
        {#if nextMilestone}
          {$t('streaks.hero.next_milestone', {
            values: { days: nextMilestone - (streak?.current ?? 0), milestone: nextMilestone },
            default: 'Faltam {days} dias para o marco dos {milestone}!'
          })}
        {:else}
          {$t('streaks.hero.legend', { default: 'Já passaste todos os marcos — és uma lenda. 👑' })}
        {/if}
      </p>
      <div class="hero-chips">
        <span class="chip">
          <span aria-hidden="true">🏆</span>
          {$t('streak.popover.best', { values: { count: streak?.best ?? 0 }, default: 'melhor: {count}' })}
        </span>
        <span class="chip">
          <span aria-hidden="true">❄️</span>
          {$t('streaks.freezes.count', {
            values: { count: streak?.freezes ?? 0, max: MAX_FREEZES },
            default: '{count}/{max} congelamentos'
          })}
        </span>
        <span class="chip">
          <span aria-hidden="true">⭐</span>
          {$t('hub.hero.level', { values: { level: levelInfo.level }, default: 'Nível {level}' })}
        </span>
      </div>
    </header>

    <!-- 2 · Semana + XP -->
    <section class="card" aria-label={$t('streaks.week.title', { default: 'Esta semana' })}>
      <h2>{$t('streaks.week.title', { default: 'Esta semana' })}</h2>
      <WeekCircles {week} />
      <div class="xp-week" role="img" aria-label={$t('streaks.xp.aria', {
          values: { total: xpWeekTotal },
          default: 'XP dos últimos 7 dias: {total}'
        })}>
        {#each xpWeek as day (day.key)}
          <div class="xp-col">
            <span class="xp-value">{day.xp > 0 ? day.xp : ''}</span>
            <div class="xp-bar-track">
              <div
                class="xp-bar"
                class:today={day.key === todayKey}
                style="height: {Math.max(4, (day.xp / xpWeekMax) * 100)}%"
              ></div>
            </div>
            <span class="xp-label">{day.label}</span>
          </div>
        {/each}
      </div>
      <p class="xp-summary">
        {$t('streaks.xp.summary', {
          values: { today: xpToday, week: xpWeekTotal },
          default: 'Hoje: {today} XP · Últimos 7 dias: {week} XP'
        })}
      </p>
    </section>

    <!-- 3 · Calendário mensal -->
    <section class="card" aria-label={$t('streaks.month.title', { default: 'Calendário de atividade' })}>
      <div class="month-head">
        <button
          type="button"
          class="month-nav"
          onclick={() => (monthOffset -= 1)}
          aria-label={$t('calendar.nav.prev_month', { default: 'Mês anterior' })}
        >‹</button>
        <h2>{monthLabel}</h2>
        <button
          type="button"
          class="month-nav"
          onclick={() => (monthOffset = Math.min(0, monthOffset + 1))}
          disabled={monthOffset >= 0}
          aria-label={$t('calendar.nav.next_month', { default: 'Mês seguinte' })}
        >›</button>
      </div>
      <div class="month-grid">
        {#each weekdayInitials as initial, i (i)}
          <span class="month-weekday" aria-hidden="true">{initial}</span>
        {/each}
        {#each monthCells as cell, i (i)}
          {#if cell}
            <span
              class="month-day"
              class:active={activeDays.has(cell.key)}
              class:frozen={frozenDays.has(cell.key) && !activeDays.has(cell.key)}
              class:today={cell.key === todayKey}
              title={cell.key}
            >{cell.day}</span>
          {:else}
            <span class="month-day empty" aria-hidden="true"></span>
          {/if}
        {/each}
      </div>
      <div class="month-legend">
        <span><i class="dot dot-active"></i>{$t('streaks.legend.active', { default: 'Dia ativo' })}</span>
        <span><i class="dot dot-frozen"></i>{$t('streaks.legend.frozen', { default: 'Congelado' })}</span>
      </div>
    </section>

    <!-- 4 · Congelamentos -->
    <section class="card" aria-label={$t('streaks.freezes.title', { default: 'Congelamentos' })}>
      <h2>❄️ {$t('streaks.freezes.title', { default: 'Congelamentos' })}</h2>
      <div class="freeze-slots" aria-hidden="true">
        {#each Array.from({ length: MAX_FREEZES }) as _, i (i)}
          <span class="freeze-slot" class:filled={i < (streak?.freezes ?? 0)}>❄️</span>
        {/each}
      </div>
      <p class="section-note">
        {$t('streak.popover.freezes.hint', {
          default: 'Um congelamento protege a streak num dia falhado. Ganhas 1 a cada 7 dias.'
        })}
      </p>
    </section>

    <!-- 5 · Marcos -->
    <section class="card" aria-label={$t('streaks.milestones.title', { default: 'Marcos' })}>
      <h2>🎯 {$t('streaks.milestones.title', { default: 'Marcos' })}</h2>
      <ol class="milestones">
        {#each STREAK_MILESTONES as m (m)}
          {@const reached = (streak?.best ?? 0) >= m}
          <li class="milestone" class:reached>
            <span class="milestone-icon" aria-hidden="true">{reached ? '✅' : '🔒'}</span>
            <span class="milestone-copy">
              {$t('streaks.milestone.days', { values: { days: m }, default: '{days} dias' })}
            </span>
            {#if !reached && nextMilestone === m}
              <span class="milestone-next">
                {$t('streaks.milestone.next', { default: 'próximo!' })}
              </span>
            {/if}
          </li>
        {/each}
      </ol>
    </section>
  {/if}
</div>

<style>
  .streaks-page {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.25rem 1rem 8rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 0.75rem);
  }
  .breadcrumb {
    font-size: var(--fs-sm, 0.85rem);
  }
  .breadcrumb a {
    color: var(--accent);
    text-decoration: none;
    display: inline-block;
    padding: 0.35rem 0;
  }
  .breadcrumb a:hover,
  .breadcrumb a:focus-visible {
    text-decoration: underline;
    outline: none;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 1rem);
    padding: var(--space-4, 1rem);
  }
  .card h2 {
    margin: 0 0 0.75rem;
    font-size: var(--fs-lg, 1.15rem);
    color: var(--txt);
  }

  .hero {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;
  }
  .hero.lit {
    border-color: color-mix(in srgb, #f97316 45%, var(--border));
  }
  .hero-flame {
    font-size: 3.6rem;
    line-height: 1;
  }
  .hero-flame.unlit {
    filter: grayscale(1) opacity(0.55);
  }
  .hero h1 {
    margin: 0;
    font-size: var(--fs-2xl, 1.8rem);
    color: var(--txt);
  }
  .hero-status {
    margin: 0;
    font-size: var(--fs-sm, 0.9rem);
    color: var(--txt2);
  }
  .hero-status.ok {
    color: var(--success, #10b981);
  }
  .hero-mascot {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: var(--fs-sm, 0.9rem);
    color: var(--txt2);
  }
  .hero-chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 0.3rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    font-size: var(--fs-xs, 0.78rem);
    font-weight: 700;
    color: var(--txt2);
  }

  .xp-week {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.4rem;
    margin-top: 1rem;
    height: 120px;
  }
  .xp-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }
  .xp-value {
    font-size: 0.65rem;
    color: var(--txt3);
    font-variant-numeric: tabular-nums;
    min-height: 0.9rem;
  }
  .xp-bar-track {
    flex: 1;
    width: 100%;
    max-width: 26px;
    display: flex;
    align-items: flex-end;
    background: var(--bg-elev);
    border-radius: 6px;
    overflow: hidden;
  }
  .xp-bar {
    width: 100%;
    background: color-mix(in srgb, var(--accent) 65%, transparent);
    border-radius: 6px 6px 0 0;
    transition: height var(--motion-base, 220ms) ease;
  }
  .xp-bar.today {
    background: var(--accent);
  }
  .xp-label {
    font-size: 0.68rem;
    color: var(--txt3);
    text-transform: uppercase;
  }
  .xp-summary {
    margin: 0.75rem 0 0;
    font-size: var(--fs-sm, 0.85rem);
    color: var(--txt2);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .month-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .month-head h2 {
    margin: 0;
    text-transform: capitalize;
  }
  .month-nav {
    min-width: 44px;
    min-height: 44px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 0.5rem);
    background: var(--bg-elev);
    color: var(--txt);
    font-size: 1.1rem;
    cursor: pointer;
  }
  .month-nav:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .month-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.3rem;
  }
  .month-weekday {
    text-align: center;
    font-size: 0.68rem;
    color: var(--txt3);
    text-transform: uppercase;
    padding-bottom: 0.2rem;
  }
  .month-day {
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: var(--fs-xs, 0.78rem);
    color: var(--txt3);
    font-variant-numeric: tabular-nums;
  }
  .month-day.active {
    background: color-mix(in srgb, var(--accent) 80%, transparent);
    color: var(--on-accent, #fff);
    font-weight: 700;
  }
  .month-day.frozen {
    background: color-mix(in srgb, #60a5fa 30%, transparent);
    color: #dbeafe;
  }
  .month-day.today {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .month-day.empty {
    visibility: hidden;
  }
  .month-legend {
    display: flex;
    gap: 1rem;
    margin-top: 0.75rem;
    font-size: var(--fs-xs, 0.75rem);
    color: var(--txt3);
  }
  .month-legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
  }
  .dot-active {
    background: color-mix(in srgb, var(--accent) 80%, transparent);
  }
  .dot-frozen {
    background: color-mix(in srgb, #60a5fa 45%, transparent);
  }

  .freeze-slots {
    display: flex;
    gap: 0.6rem;
    margin-bottom: 0.6rem;
  }
  .freeze-slot {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    font-size: 1.5rem;
    border-radius: var(--radius-md, 0.6rem);
    border: 1.5px dashed var(--border);
    filter: grayscale(1) opacity(0.35);
  }
  .freeze-slot.filled {
    border-style: solid;
    border-color: #60a5fa;
    background: color-mix(in srgb, #60a5fa 18%, transparent);
    filter: none;
  }
  .section-note {
    margin: 0;
    font-size: var(--fs-xs, 0.78rem);
    color: var(--txt3);
    line-height: 1.45;
  }

  .milestones {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .milestone {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.7rem;
    border-radius: var(--radius-md, 0.6rem);
    background: var(--bg-elev);
    border: 1px solid var(--border);
    color: var(--txt3);
    font-size: var(--fs-sm, 0.9rem);
  }
  .milestone.reached {
    color: var(--txt);
    border-color: color-mix(in srgb, var(--success, #10b981) 40%, var(--border));
  }
  .milestone-copy {
    font-weight: 700;
  }
  .milestone-next {
    margin-inline-start: auto;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 25%, transparent);
    color: var(--accent);
    font-size: 0.68rem;
    font-weight: 800;
    text-transform: uppercase;
  }
</style>
