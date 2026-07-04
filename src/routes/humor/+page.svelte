<script lang="ts">
  // /humor — mood history (V8).
  //
  // A soft, private-feeling page: daily check-in on top, a month calendar
  // heatmap of check-ins/episodes (coloured by kind), gentle insight cards
  // and a recent timeline. All copy is descriptive, never prescriptive —
  // this page observes, it does not judge.

  import { onMount } from 'svelte';
  import { t, locale } from 'svelte-i18n';
  import MoodCheckin from '$lib/mood/MoodCheckin.svelte';
  import { MOOD_EVENT } from '$lib/mood';
  import {
    CHECKIN_SAVED_EVENT,
    KIND_COLORS,
    KIND_EMOJI_ALL,
    getLogsForMonth,
    getRecentLogs,
    isCheckinKind,
    localDateKey,
    type CheckinKind,
    type MoodEpisodeRow
  } from '$lib/mood/moodLogs';

  const now = new Date();
  let year = $state(now.getFullYear());
  let month = $state(now.getMonth()); // 0-based
  let monthLogs = $state<MoodEpisodeRow[]>([]);
  let recentLogs = $state<MoodEpisodeRow[]>([]);
  let loading = $state(true);

  const loc = $derived($locale || 'pt-PT');
  const todayKey = localDateKey();

  const FEELING_DEFAULTS: Record<CheckinKind, string> = {
    low: 'Em baixo',
    meh: 'Assim-assim',
    ok: 'Ok',
    happy: 'Feliz',
    loved: 'Cheia de amor'
  };
  const EPISODE_LABEL_DEFAULTS: Record<string, string> = {
    sick: 'Sick Mode',
    sad: 'Soft Mood',
    love: 'Love Vibe'
  };
  const TAG_DEFAULTS: Record<string, string> = {
    tired: 'cansada',
    stressed: 'stress',
    study: 'estudos',
    money: 'dinheiro',
    relationship: 'nós',
    sleep: 'sono',
    sick: 'doente',
    happy: 'feliz'
  };
  const SOURCE_DEFAULTS: Record<string, string> = {
    checkin: 'check-in',
    password: 'no arranque',
    manual: 'nas definições',
    agent: 'automático'
  };

  function kindLabel(kind: string): string {
    if (isCheckinKind(kind)) return $t(`mood.feeling.${kind}`, { default: FEELING_DEFAULTS[kind] });
    if (kind in EPISODE_LABEL_DEFAULTS) return $t(`mood.meta.${kind}.label`, { default: EPISODE_LABEL_DEFAULTS[kind] });
    return kind;
  }

  function tagLabel(tag: string): string {
    return $t(`mood.tag.${tag}`, { default: TAG_DEFAULTS[tag] ?? tag });
  }

  function kindColor(kind: string): string {
    return KIND_COLORS[kind] ?? 'var(--txt3, rgba(255,255,255,0.5))';
  }

  function kindEmoji(kind: string): string {
    return KIND_EMOJI_ALL[kind] ?? '💭';
  }

  function plainTags(row: MoodEpisodeRow): string[] {
    return (row.tags ?? []).filter((tag) => !tag.startsWith('care:'));
  }

  function careCount(row: MoodEpisodeRow): number {
    if (row.careDone) return Object.values(row.careDone).filter(Boolean).length;
    return (row.tags ?? []).filter((tag) => tag.startsWith('care:')).length;
  }

  async function refresh(): Promise<void> {
    const [monthRows, recentRows] = await Promise.all([
      getLogsForMonth(year, month),
      getRecentLogs(20)
    ]);
    monthLogs = monthRows;
    recentLogs = recentRows;
    loading = false;
  }

  onMount(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(CHECKIN_SAVED_EVENT, onChange);
    window.addEventListener(MOOD_EVENT, onChange);
    return () => {
      window.removeEventListener(CHECKIN_SAVED_EVENT, onChange);
      window.removeEventListener(MOOD_EVENT, onChange);
    };
  });

  function prevMonth(): void {
    if (month === 0) { month = 11; year -= 1; } else { month -= 1; }
    void refresh();
  }
  function nextMonth(): void {
    if (month === 11) { month = 0; year += 1; } else { month += 1; }
    void refresh();
  }
  const isCurrentMonth = $derived(year === now.getFullYear() && month === now.getMonth());

  const monthLabel = $derived(
    new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
  );

  // Monday-first weekday initials (2024-01-01 was a Monday).
  const weekdayInitials = $derived(
    Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(loc, { weekday: 'narrow' }).format(new Date(2024, 0, 1 + i))
    )
  );

  type DayCell = { day: number; date: string; kinds: string[]; isToday: boolean } | null;

  const calendarCells = $derived.by<DayCell[]>(() => {
    const byDate = new Map<string, string[]>();
    for (const row of monthLogs) {
      const kinds = byDate.get(row.date) ?? [];
      if (!kinds.includes(row.kind)) kinds.push(row.kind);
      byDate.set(row.date, kinds);
    }
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: DayCell[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const date = localDateKey(new Date(year, month, day));
      cells.push({ day, date, kinds: byDate.get(date) ?? [], isToday: date === todayKey });
    }
    return cells;
  });

  const legendKinds = $derived.by<string[]>(() => {
    const seen: string[] = [];
    for (const row of monthLogs) if (!seen.includes(row.kind)) seen.push(row.kind);
    return seen;
  });

  interface Insight { emoji: string; text: string; }

  const insights = $derived.by<Insight[]>(() => {
    const out: Insight[] = [];
    if (!monthLogs.length) return out;

    // 1) Most common feeling/mood this month.
    const kindCounts = new Map<string, number>();
    for (const row of monthLogs) kindCounts.set(row.kind, (kindCounts.get(row.kind) ?? 0) + 1);
    let topKind: string | null = null;
    let topCount = 0;
    for (const [kind, count] of kindCounts) {
      if (count > topCount) { topKind = kind; topCount = count; }
    }
    if (topKind && topCount >= 2) {
      out.push({
        emoji: kindEmoji(topKind),
        text: $t('humor.insights.common', {
          values: { feeling: kindLabel(topKind), count: topCount },
          default: 'O que mais apareceu este mês: {feeling} ({count}×).'
        })
      });
    }

    // 2) Check-in count.
    const checkins = monthLogs.filter((row) => row.source === 'checkin').length;
    if (checkins > 0) {
      out.push({
        emoji: '📝',
        text: $t('humor.insights.checkins', {
          values: { count: checkins },
          default: 'Fizeste {count} check-in(s) este mês — cada um conta.'
        })
      });
    }

    // 3) Tag × weekday pattern (descriptive only).
    const tagWeekday = new Map<string, number[]>();
    for (const row of monthLogs) {
      const [y, m, d] = row.date.split('-').map(Number);
      const weekday = new Date(y, m - 1, d).getDay();
      for (const tag of plainTags(row)) {
        const counts = tagWeekday.get(tag) ?? [0, 0, 0, 0, 0, 0, 0];
        counts[weekday] += 1;
        tagWeekday.set(tag, counts);
      }
    }
    let bestTag: string | null = null;
    let bestWeekday = 0;
    let bestScore = 0;
    for (const [tag, counts] of tagWeekday) {
      const total = counts.reduce((a, b) => a + b, 0);
      const max = Math.max(...counts);
      if (total >= 3 && max >= 2 && max / total >= 0.5 && max > bestScore) {
        bestTag = tag;
        bestWeekday = counts.indexOf(max);
        bestScore = max;
      }
    }
    if (bestTag) {
      // Any date with the right weekday works for formatting the name.
      const ref = new Date(2024, 0, 7 + bestWeekday); // 2024-01-07 was a Sunday (getDay()=0)
      const weekdayName = new Intl.DateTimeFormat(loc, { weekday: 'long' }).format(ref);
      out.push({
        emoji: '🔎',
        text: $t('humor.insights.tag_pattern', {
          values: { tag: tagLabel(bestTag), weekday: weekdayName },
          default: '«{tag}» tem aparecido mais em dias de {weekday}.'
        })
      });
    }

    // 4) Care actions during Sick Mode.
    const sickRows = monthLogs.filter((row) => row.source !== 'checkin' && row.kind === 'sick');
    if (sickRows.length) {
      const done = sickRows.reduce((sum, row) => sum + careCount(row), 0);
      const total = sickRows.length * 3;
      out.push({
        emoji: '🤍',
        text: $t('humor.insights.care', {
          values: { done, total },
          default: 'Em Sick Mode marcaste {done} de {total} miminhos — cuidar de ti também é progresso.'
        })
      });
    }

    return out;
  });

  function timelineDate(row: MoodEpisodeRow): string {
    const dateLabel = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }).format(new Date(row.startedAt));
    if (row.source === 'checkin') {
      const time = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' }).format(new Date(row.startedAt));
      return `${dateLabel} · ${time}`;
    }
    return dateLabel;
  }
</script>

<svelte:head>
  <title>{$t('humor.title', { default: 'Humor' })} — Presuntinho</title>
</svelte:head>

<section class="humor">
  <header class="humor-hero">
    <span class="hero-icon" aria-hidden="true">💗</span>
    <h1>{$t('humor.title', { default: 'Humor' })}</h1>
    <p>{$t('humor.subtitle', { default: 'O teu diário de sentimentos — pequenino, teu e sem julgamentos.' })}</p>
  </header>

  <MoodCheckin dismissible={false} onSaved={() => void refresh()} />

  <!-- Month calendar heatmap -->
  <div class="card panel" aria-label={$t('humor.calendar.aria', { default: 'Calendário de humor do mês' })}>
    <div class="panel-head">
      <h2>{monthLabel}</h2>
      <div class="month-nav">
        <button type="button" onclick={prevMonth} aria-label={$t('humor.calendar.prev', { default: 'Mês anterior' })}>‹</button>
        <button type="button" onclick={nextMonth} disabled={isCurrentMonth} aria-label={$t('humor.calendar.next', { default: 'Mês seguinte' })}>›</button>
      </div>
    </div>

    <div class="cal-grid" role="grid">
      {#each weekdayInitials as initial, i (i)}
        <span class="cal-head" aria-hidden="true">{initial}</span>
      {/each}
      {#each calendarCells as cell, i (i)}
        {#if cell}
          <div class="cal-day" class:today={cell.isToday} role="gridcell" title={cell.kinds.map((kind) => kindLabel(kind)).join(', ')}>
            <span class="cal-num">{cell.day}</span>
            {#if cell.kinds.length}
              <span class="cal-dots">
                {#each cell.kinds.slice(0, 3) as kind (kind)}
                  <i style={`background:${kindColor(kind)}`} aria-hidden="true"></i>
                {/each}
              </span>
            {/if}
            <span class="visually-hidden">
              {cell.kinds.length
                ? cell.kinds.map((kind) => kindLabel(kind)).join(', ')
                : ''}
            </span>
          </div>
        {:else}
          <span class="cal-empty" aria-hidden="true"></span>
        {/if}
      {/each}
    </div>

    {#if legendKinds.length}
      <div class="legend">
        {#each legendKinds as kind (kind)}
          <span class="legend-item">
            <i style={`background:${kindColor(kind)}`} aria-hidden="true"></i>
            {kindEmoji(kind)} {kindLabel(kind)}
          </span>
        {/each}
      </div>
    {:else if !loading}
      <p class="soft-empty">{$t('humor.calendar.empty', { default: 'Ainda sem registos neste mês — e está tudo bem assim.' })}</p>
    {/if}
  </div>

  <!-- Insights -->
  <div class="card panel">
    <h2>{$t('humor.insights.title', { default: 'O que o Presuntinho reparou' })}</h2>
    {#if insights.length}
      <ul class="insights">
        {#each insights as insight, i (i)}
          <li>
            <span class="insight-emoji" aria-hidden="true">{insight.emoji}</span>
            <span>{insight.text}</span>
          </li>
        {/each}
      </ul>
    {:else if !loading}
      <p class="soft-empty">{$t('humor.insights.empty', { default: 'Ainda não há registos suficientes este mês para ver padrões — sem pressa nenhuma.' })}</p>
    {/if}
  </div>

  <!-- Recent timeline -->
  <div class="card panel">
    <h2>{$t('humor.timeline.title', { default: 'Últimos registos' })}</h2>
    {#if recentLogs.length}
      <ol class="timeline">
        {#each recentLogs as row (row.id)}
          <li class="entry">
            <span class="entry-dot" style={`background:${kindColor(row.kind)}`} aria-hidden="true"></span>
            <div class="entry-body">
              <div class="entry-top">
                <strong>{kindEmoji(row.kind)} {kindLabel(row.kind)}</strong>
                <small>{timelineDate(row)}</small>
              </div>
              <div class="entry-meta">
                <span class="badge">{$t(`humor.source.${row.source}`, { default: SOURCE_DEFAULTS[row.source] ?? row.source })}</span>
                {#if row.source !== 'checkin' && row.clearedAt === undefined}
                  <span class="badge active">{$t('humor.timeline.active', { default: 'ainda ativo' })}</span>
                {/if}
                {#if careCount(row) > 0}
                  <span class="badge">{$t('humor.timeline.care', { values: { count: careCount(row) }, default: '{count} miminho(s)' })}</span>
                {/if}
                {#each plainTags(row) as tag (tag)}
                  <span class="badge tag">{tagLabel(tag)}</span>
                {/each}
              </div>
              {#if row.note}
                <p class="entry-note">“{row.note}”</p>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
    {:else if !loading}
      <p class="soft-empty">{$t('humor.timeline.empty', { default: 'Ainda nada por aqui. O primeiro check-in fica lindíssimo nesta lista 🤍' })}</p>
    {/if}
  </div>

  <p class="private-note">🔒 {$t('humor.private_note', { default: 'Isto é só teu. Fica guardado apenas neste dispositivo.' })}</p>
</section>

<style>
  .humor {
    max-width: 680px;
    margin: 0 auto;
    padding: var(--space-5, 1.5rem) var(--space-4, 1rem) 6rem;
    display: grid;
    gap: var(--space-4, 1rem);
  }
  .humor-hero { text-align: center; }
  .hero-icon { font-size: 2.6rem; display: block; line-height: 1; }
  .humor-hero h1 {
    margin: var(--space-2, 0.5rem) 0 var(--space-1, 0.25rem);
    font-size: var(--fs-2xl, 1.75rem);
    color: var(--txt, #fff);
  }
  .humor-hero p {
    margin: 0;
    color: var(--txt2, rgba(255, 255, 255, 0.7));
    font-size: var(--fs-sm, 0.95rem);
  }
  .card.panel {
    background: var(--card, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 1rem);
    padding: var(--space-4, 1rem);
    display: grid;
    gap: var(--space-3, 0.75rem);
    box-shadow: var(--shadow-sm, 0 2px 10px rgba(0, 0, 0, 0.12));
  }
  .panel h2 {
    margin: 0;
    font-size: var(--fs-md, 1rem);
    color: var(--txt, #fff);
    text-transform: capitalize;
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2, 0.5rem);
  }
  .month-nav { display: flex; gap: var(--space-2, 0.5rem); }
  .month-nav button {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-md, 0.6rem);
    background: var(--bg-elev, rgba(255, 255, 255, 0.04));
    color: var(--txt, #fff);
    font-size: 1.2rem;
    cursor: pointer;
    transition: background var(--motion-fast, 120ms) ease;
  }
  .month-nav button:hover:not(:disabled) { background: var(--card-hover, rgba(255, 255, 255, 0.1)); }
  .month-nav button:disabled { opacity: 0.4; cursor: default; }
  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 0.28rem;
  }
  .cal-head {
    text-align: center;
    font-size: var(--fs-xs, 0.68rem);
    font-weight: 700;
    color: var(--txt3, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    padding-bottom: 0.15rem;
  }
  .cal-day {
    min-height: 44px;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 0.18rem;
    border-radius: var(--radius-sm, 0.45rem);
    background: var(--bg-elev, rgba(255, 255, 255, 0.03));
    border: 1px solid transparent;
  }
  .cal-day.today {
    border-color: var(--accent, #db2777);
    background: color-mix(in srgb, var(--accent, #db2777) 10%, transparent);
  }
  .cal-num { font-size: var(--fs-xs, 0.72rem); color: var(--txt2, rgba(255, 255, 255, 0.72)); }
  .cal-dots { display: flex; gap: 0.16rem; }
  .cal-dots i, .legend-item i {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
  }
  .cal-empty { min-height: 44px; }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: var(--fs-xs, 0.75rem);
    color: var(--txt2, rgba(255, 255, 255, 0.72));
  }
  .insights { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2, 0.5rem); }
  .insights li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--space-2, 0.5rem);
    padding: var(--space-3, 0.75rem);
    border-radius: var(--radius-md, 0.75rem);
    background: var(--bg-elev, rgba(255, 255, 255, 0.04));
    color: var(--txt, #fff);
    font-size: var(--fs-sm, 0.88rem);
    line-height: 1.45;
  }
  .insight-emoji { font-size: 1.15rem; line-height: 1.2; }
  .timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2, 0.5rem); }
  .entry {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-3, 0.75rem);
    padding: var(--space-3, 0.75rem);
    border-radius: var(--radius-md, 0.75rem);
    background: var(--bg-elev, rgba(255, 255, 255, 0.04));
  }
  .entry-dot {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 999px;
    margin-top: 0.35rem;
  }
  .entry-body { display: grid; gap: 0.3rem; min-width: 0; }
  .entry-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2, 0.5rem);
  }
  .entry-top strong { font-size: var(--fs-sm, 0.9rem); color: var(--txt, #fff); }
  .entry-top small { color: var(--txt3, rgba(255, 255, 255, 0.5)); font-size: var(--fs-xs, 0.72rem); white-space: nowrap; }
  .entry-meta { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .badge {
    padding: 0.14rem 0.5rem;
    border-radius: 999px;
    font-size: var(--fs-xs, 0.68rem);
    background: var(--card, rgba(255, 255, 255, 0.07));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    color: var(--txt2, rgba(255, 255, 255, 0.72));
  }
  .badge.active {
    border-color: var(--success, #34d399);
    color: var(--success, #34d399);
  }
  .badge.tag {
    border-color: color-mix(in srgb, var(--accent, #db2777) 45%, transparent);
    color: color-mix(in srgb, var(--accent, #db2777) 70%, var(--txt, #fff));
  }
  .entry-note {
    margin: 0;
    font-size: var(--fs-sm, 0.85rem);
    font-style: italic;
    color: var(--txt2, rgba(255, 255, 255, 0.72));
    line-height: 1.4;
  }
  .soft-empty {
    margin: 0;
    color: var(--txt3, rgba(255, 255, 255, 0.5));
    font-size: var(--fs-sm, 0.85rem);
    line-height: 1.5;
  }
  .private-note {
    margin: 0;
    text-align: center;
    color: var(--txt3, rgba(255, 255, 255, 0.45));
    font-size: var(--fs-xs, 0.75rem);
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
  .month-nav button:focus-visible {
    outline: 2px solid var(--accent, #db2777);
    outline-offset: 2px;
  }
</style>
