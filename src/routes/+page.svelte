<script lang="ts">
  /**
   * Home — dashboard de controlo da Fatma.
   *
   * A Home combina visão executiva + agenda semanal: escola, vida,
   * notificações e próximos passos no mesmo ecrã.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';

  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import BadgeGrid from '$lib/components/BadgeGrid.svelte';
  import OnboardingModal from '$lib/components/OnboardingModal.svelte';

  import { db } from '$lib/state/db';
  import { xp, initStores } from '$lib/state/stores';
  import { getSession } from '$lib/auth/session';
  import { mainSchoolCourses, schoolTotals, businessAdministration, portugueseCourse } from '$lib/escola/catalog';
  import { isMoodIntroAcknowledged, moodAffirmation, moodMicrocopy, readActiveMood, MOOD_META, type ActiveMood } from '$lib/mood';
  import {
    buildNotifications,
    formatDayLabel,
    loadAgendaItems,
    localDateKey,
    weekDays,
    type AgendaItem,
    type NotificationItem
  } from '$lib/vida/agenda';
  import { t } from 'svelte-i18n';

  const TOTALS = schoolTotals();
  const TOTAL_LESSONS = TOTALS.lessons;
  const TOTAL_QUIZZES = TOTALS.quizzes;

  interface BadgeStatus {
    unlocked: boolean;
    unlockedAt?: number;
  }

  let currentXp = $state(0);
  let activeProfile = $state<'fatma' | 'daniel' | null>(null);
  let badgesMap = $state<Record<string, BadgeStatus>>({});
  let quizzesAnswered = $state(0);
  let lessonsVisited = $state(0);
  let assignmentsDone = $state(0);
  let totalAssignments = $state(1);
  let showOnboarding = $state(false);
  let heroIn = $state(false);
  let agendaItems = $state<AgendaItem[]>([]);
  let notifications = $state<NotificationItem[]>([]);
  let activeMood = $state<ActiveMood | null>(null);
  let charmSeed = $state(Date.now());

  const today = new Date();
  const todayKey = localDateKey(today);

  let xpLabel = $derived(new Intl.NumberFormat('pt-PT').format(currentXp) + ' XP');
  let unlockedBadges = $derived(Object.values(badgesMap).filter((b) => b.unlocked).length);
  let schoolProgress = $derived(Math.round(((lessonsVisited + quizzesAnswered + assignmentsDone) / (TOTAL_LESSONS + TOTAL_QUIZZES + totalAssignments)) * 100));
  let weekPreviewDays = $derived(weekDays(today));
  let todaysItems = $derived(agendaItems.filter((item) => item.date === todayKey));
  let nextItems = $derived(agendaItems.filter((item) => item.date >= todayKey && item.status !== 'done').slice(0, 5));
  let urgentCount = $derived(notifications.filter((item) => item.tone === 'danger' || item.tone === 'warning').length);
  let moodMeta = $derived(activeMood ? MOOD_META[activeMood.kind] : null);
  let moodLine = $derived(activeMood ? moodMicrocopy(activeMood.kind, charmSeed) : $t('hub.default.mood_line'));
  let moodNote = $derived(activeMood ? moodAffirmation(activeMood.kind, charmSeed) : $t('hub.default.mood_note'));

  function itemsForDate(date: Date): AgendaItem[] {
    const key = localDateKey(date);
    return agendaItems.filter((item) => item.date === key);
  }

  function dayTone(date: Date): string {
    const items = itemsForDate(date);
    if (localDateKey(date) === todayKey) return 'today';
    if (items.some((item) => item.tone === 'danger')) return 'danger';
    if (items.some((item) => item.tone === 'warning')) return 'warning';
    if (items.length > 0) return 'busy';
    return 'quiet';
  }

  async function refreshAgenda(): Promise<void> {
    try {
      const items = await loadAgendaItems();
      agendaItems = items;
      notifications = buildNotifications(items);
    } catch (e) {
      console.error('[hub] refreshAgenda failed', e);
    }
  }

  async function refreshDashboard(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      const d = db();
      const [badgeRows, quizRows, visitedRows, assignmentRows] = await Promise.all([
        d.badges.toArray(),
        d.quizScores.toArray(),
        d.visited.toArray(),
        d.assignments.toArray().catch(() => [])
      ]);

      const nextBadges: Record<string, BadgeStatus> = {};
      for (const row of badgeRows) {
        nextBadges[row.id] = { unlocked: Boolean(row.unlocked), unlockedAt: row.unlockedAt };
      }
      badgesMap = nextBadges;

      quizzesAnswered = quizRows.filter((r) => Array.isArray(r.answered) && r.answered.length > 0).length;
      lessonsVisited = visitedRows.filter((r) => typeof r.id === 'string' && r.id.startsWith('lesson:')).length;
      const completedAssignments = assignmentRows.filter((a) => a.status === 'submitted' || a.status === 'graded').length;
      assignmentsDone = completedAssignments;
      totalAssignments = Math.max(assignmentRows.length, completedAssignments, 1);
    } catch (e) {
      console.error('[hub] refreshDashboard failed', e);
    }
  }

  function handleOnboardingClose(): void {
    try {
      localStorage.setItem('fat-onboarded', '1');
    } catch {
      // localStorage pode falhar em private mode.
    }
    showOnboarding = false;
  }

  onMount(() => {
    activeProfile = getSession()?.profile ?? null;
    heroIn = true;
    const unsubXp = xp.subscribe((v) => (currentXp = v));

    void (async () => {
      await initStores();
      await Promise.all([refreshDashboard(), refreshAgenda()]);
      const mood = await readActiveMood();
      activeMood = mood && isMoodIntroAcknowledged(mood) ? mood : null;
    })();

    try {
      showOnboarding = localStorage.getItem('fat-onboarded') === null;
    } catch {
      showOnboarding = false;
    }

    const onVis = () => {
      if (document.visibilityState === 'visible') void Promise.all([refreshDashboard(), refreshAgenda()]);
      charmSeed = Date.now();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      unsubXp();
    };
  });
</script>

<svelte:head>
  <title>{$t('routes.hub.title', { default: 'Presuntinho — Dashboard' })}</title>
</svelte:head>

<OnboardingModal open={showOnboarding} onClose={handleOnboardingClose} profile={activeProfile} />

<div class="hub">
  <header class="hub-hero" class:hero-in={heroIn}>
    <span class="eyebrow">{activeMood ? `${moodMeta?.emoji} ${moodMeta?.label}` : $t('hub.hero.eyebrow')}</span>
    <h1>
      {activeProfile
        ? $t('hub.greeting', { values: { name: $t(`profile.${activeProfile}`) }, default: 'Olá Fatma' })
        : $t('hub.hero.greeting_fallback')}
    </h1>
    <p class="sub">{moodLine}</p>
    <div class="hero-metrics" aria-label={$t('hub.hero.metrics.aria')}>
      <span><strong>{xpLabel}</strong><small>{$t('hub.hero.metric.xp')}</small></span>
      <span><strong>{schoolProgress}%</strong><small>{$t('hub.hero.metric.school')}</small></span>
      <span><strong>{urgentCount}</strong><small>{$t('hub.hero.metric.alerts')}</small></span>
    </div>
  </header>

  <section class="presuntinho-quest" class:mooded={Boolean(activeMood)} aria-label={$t('hub.quest.aria')}>
    <div class="quest-orb" aria-hidden="true">{moodMeta?.emoji ?? '🐷'}</div>
    <div>
      <span class="eyebrow">{$t('hub.quest.eyebrow')}</span>
      <h2>{activeMood?.kind === 'sick' ? $t('hub.quest.title.sick') : activeMood?.kind === 'sad' ? $t('hub.quest.title.sad') : activeMood?.kind === 'love' ? $t('hub.quest.title.love') : $t('hub.quest.title.default')}</h2>
      <p>{moodNote}</p>
    </div>
    <a href={activeMood?.kind === 'sick' ? '/vida/' : '/escola/'}>{activeMood?.kind === 'sick' ? $t('hub.quest.cta.sick') : $t('hub.quest.cta.default')}</a>
  </section>

  <section class="today-strip" aria-label={$t('hub.today.aria')}>
    <div>
      <span class="eyebrow">{$t('hub.today.eyebrow')}</span>
      <h2>{formatDayLabel(todayKey)}</h2>
      <p>{todaysItems.length ? $t('hub.today.items', { values: { count: todaysItems.length, suffix: todaysItems.length === 1 ? '' : 's' } }) : $t('hub.today.empty')}</p>
    </div>
    <a href="/notificacoes/" class="notify-link">🔔 {notifications.length}</a>
  </section>

  <section class="calendar-card" aria-label={$t('hub.calendar.aria')}>
    <div class="section-head">
      <div>
        <h2>{$t('hub.calendar.title')}</h2>
        <span>{$t('hub.calendar.subtitle')}</span>
      </div>
      <a class="open-calendar" href="/calendario/">{$t('hub.calendar.open')}</a>
    </div>

    <div
      class="calendar-grid compact"
      role="group"
      aria-label={$t('hub.calendar.week_aria')}
    >
      {#each weekPreviewDays as day (localDateKey(day))}
        <a
          class="day-cell"
          data-tone={dayTone(day)}
          data-outside="false"
          href="/calendario/"
          aria-label={$t('hub.calendar.day_aria', { values: { day: formatDayLabel(localDateKey(day)), count: itemsForDate(day).length } })}
        >
          <span>{day.toLocaleDateString('pt-PT', { weekday: 'short' })}</span>
          <strong>{day.getDate()}</strong>
          {#if itemsForDate(day).length > 0}
            <small>{itemsForDate(day).length}</small>
          {/if}
        </a>
      {/each}
    </div>

    <div class="agenda-list" aria-label={$t('hub.calendar.tasks_aria')}>
      <div class="section-head compact">
        <h3>{$t('hub.calendar.next_tasks')}</h3>
        <a href="/calendario/">{$t('hub.calendar.manage')}</a>
      </div>
      {#if nextItems.length === 0}
        <p class="empty-line">{$t('hub.calendar.empty')}</p>
      {:else}
        {#each nextItems.slice(0, 3) as item (item.id)}
          <a class="agenda-item" data-tone={item.tone} href={item.href}>
            <span class="agenda-date">{formatDayLabel(item.date)}</span>
            <span class="agenda-main"><strong>{item.title}</strong><small>{item.subtitle}</small></span>
            <span aria-hidden="true">→</span>
          </a>
        {/each}
      {/if}
    </div>
  </section>

  <section class="notifications-card" aria-label={$t('hub.notifications.title')}>
    <div class="section-head">
      <h2>{$t('hub.notifications.title')}</h2>
      <a href="/notificacoes/">{$t('hub.notifications.all')}</a>
    </div>
    <div class="notification-list">
      {#each notifications.slice(0, 3) as n (n.id)}
        <a class="notification" data-tone={n.tone} href={n.href}>
          <strong>{n.title}</strong>
          <span>{n.body}</span>
        </a>
      {/each}
    </div>
  </section>

  <section class="control-section" aria-label={$t('hub.control.aria')}>
    <div class="section-head">
      <h2>{$t('hub.control.title')}</h2>
      <a href="/agente/">{$t('hub.control.agent')}</a>
    </div>
    <div class="control-grid">
      <a class="control-card primary" href="/escola/">
        <span class="icon">🎓</span>
        <div>
          <p class="label">{$t('hub.control.school.label')}</p>
          <h3>{businessAdministration.title} e {portugueseCourse.title}</h3>
          <p>{$t('hub.control.school.summary', { values: { courses: mainSchoolCourses.length, subjects: businessAdministration.units.length } })}</p>
        </div>
        <strong>{schoolProgress}%</strong>
      </a>
      <a class="control-card" href="/vida/">
        <span class="icon">🌿</span>
        <div>
          <p class="label">{$t('hub.control.life.label')}</p>
          <h3>{$t('hub.control.life.title')}</h3>
          <p>{$t('hub.control.life.summary')}</p>
        </div>
      </a>
      <a class="control-card" href="/financas/">
        <span class="icon">💸</span>
        <div>
          <p class="label">{$t('hub.control.finances.label')}</p>
          <h3>{$t('hub.control.finances.title')}</h3>
          <p>{$t('hub.control.finances.summary')}</p>
        </div>
      </a>
      <a class="control-card" href="/habitos/">
        <span class="icon">✅</span>
        <div>
          <p class="label">{$t('hub.control.habits.label')}</p>
          <h3>{$t('hub.control.habits.title')}</h3>
          <p>{$t('hub.control.habits.summary')}</p>
        </div>
      </a>
    </div>
  </section>

  <section class="status-section" aria-label={$t('hub.status.aria')}>
    <div class="section-head">
      <h2>{$t('hub.status.title')}</h2>
      <span>{$t('hub.status.updated')}</span>
    </div>
    <div class="progress-grid">
      <ProgressBar label={$t('hub.progress.lessons')} icon="📖" accent="#3b82f6" current={lessonsVisited} total={TOTAL_LESSONS} />
      <ProgressBar label={$t('hub.progress.quizzes')} icon="❓" accent="#f59e0b" current={quizzesAnswered} total={TOTAL_QUIZZES} />
      <ProgressBar label={$t('hub.progress.assignments')} icon="✍️" accent="#10b981" current={assignmentsDone} total={totalAssignments} />
    </div>
  </section>

  <section class="map-section" aria-label={$t('hub.map.aria')}>
    <div class="section-head">
      <h2>{$t('hub.map.title')}</h2>
      <span>{$t('hub.map.subtitle')}</span>
    </div>
    <div class="map-grid">
      <a href="/calendario/">🗓️ {$t('hub.map.calendar')} <small>{$t('hub.map.calendar.desc')}</small></a>
      <a href="/notificacoes/">🔔 {$t('hub.map.notifications')} <small>{$t('hub.map.notifications.desc')}</small></a>
      <a href="/escola/">🎓 {$t('hub.map.school')} <small>{$t('hub.map.school.desc')}</small></a>
      <a href="/escola/trabalhos/">📝 {$t('hub.map.assignments')} <small>{$t('hub.map.assignments.desc')}</small></a>
      <a href="/financas/orcamento/">📊 {$t('hub.map.budget')} <small>{$t('hub.map.budget.desc')}</small></a>
      <a href="/agente/">🤖 {$t('hub.map.agent')} <small>{$t('hub.map.agent.desc')}</small></a>
    </div>
  </section>

  <section class="badges-section" aria-label={$t('hub.section.badges.aria', { default: 'Conquistas' })}>
    <div class="section-head">
      <h2>{$t('hub.section.badges', { default: 'Conquistas' })}</h2>
      <span>{$t('hub.badges.unlocked', { values: { count: unlockedBadges } })}</span>
    </div>
    <BadgeGrid badges={badgesMap} />
  </section>
</div>

<style>
  .hub {
    max-width: 980px;
    margin: 0 auto;
    padding: 1.25rem 1rem 8rem;
  }
  .hub-hero,
  .today-strip,
  .calendar-card,
  .notifications-card,
  .presuntinho-quest {
    border-radius: 1.25rem;
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.11);
    background: rgba(255, 255, 255, 0.055);
  }
  .hub-hero {
    opacity: 0;
    transform: translateY(8px);
    padding: 1.25rem;
    margin-bottom: 1rem;
    background: radial-gradient(circle at top left, rgba(236, 72, 153, 0.3), transparent 34%), rgba(255, 255, 255, 0.055);
  }
  .hub-hero.hero-in { animation: hub-hero-in 360ms ease-out forwards; }
  .presuntinho-quest {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: .85rem;
    align-items: center;
    padding: 1rem;
    margin-top: 1rem;
    background: linear-gradient(135deg, color-mix(in srgb, var(--mood-accent, var(--accent, #ec4899)) 18%, rgba(255,255,255,.06)), rgba(255,255,255,.045));
    box-shadow: 0 18px 46px color-mix(in srgb, var(--mood-accent, #ec4899) 12%, transparent);
  }
  .presuntinho-quest.mooded { border-color: color-mix(in srgb, var(--mood-accent, #ec4899) 28%, rgba(255,255,255,.12)); }
  .quest-orb {
    width: 3rem;
    height: 3rem;
    display: grid;
    place-items: center;
    border-radius: 1rem;
    background: color-mix(in srgb, var(--mood-accent, #ec4899) 18%, rgba(255,255,255,.16));
    font-size: 1.35rem;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.12);
  }
  .presuntinho-quest h2 { margin: .15rem 0 .2rem; font-size: 1rem; color: #fff; }
  .presuntinho-quest p { margin: 0; color: #cbd5e1; }
  .presuntinho-quest a {
    grid-column: 1 / -1;
    width: fit-content;
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    padding: .55rem .8rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--mood-accent, var(--accent, #ec4899)) 28%, rgba(255,255,255,.08));
    color: #fff;
    text-decoration: none;
    font-weight: 900;
  }
  @keyframes hub-hero-in { to { opacity: 1; transform: translateY(0); } }
  .eyebrow,
  .label {
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-size: 0.72rem;
    color: #f9a8d4;
    font-weight: 800;
  }
  .hub-hero h1 { margin: 0.35rem 0; font-size: clamp(2rem, 7vw, 3.2rem); line-height: 1; }
  .sub { margin: 0; color: #cbd5e1; line-height: 1.5; }
  .hero-metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
    margin-top: 1rem;
  }
  .hero-metrics span {
    padding: 0.75rem;
    border-radius: 1rem;
    background: rgba(0, 0, 0, 0.22);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .hero-metrics strong { display: block; color: #fff; font-size: 1.05rem; }
  .hero-metrics small { color: #94a3b8; font-size: 0.72rem; }
  section { margin-top: 1.1rem; }
  .today-strip {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(16, 185, 129, 0.08));
  }
  .today-strip h2 { margin: 0.2rem 0; font-size: 1.15rem; }
  .today-strip p { margin: 0; color: #cbd5e1; }
  .notify-link,
  .open-calendar {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 0.65rem 0.9rem;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    text-decoration: none;
    border: 1px solid rgba(255, 255, 255, 0.14);
    font-weight: 800;
  }
  .calendar-card,
  .notifications-card { padding: 1rem; }
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  .section-head.compact { margin: 0.95rem 0 0.55rem; }
  .section-head h2,
  .section-head h3 { margin: 0; color: #fff; font-size: 1rem; }
  .section-head span,
  .section-head a { color: #94a3b8; font-size: 0.82rem; text-decoration: none; }
  .section-head a { color: #f9a8d4; font-weight: 700; }
  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 0.45rem;
  }
  .day-cell {
    min-height: 72px;
    border-radius: 0.9rem;
    padding: 0.45rem;
    text-decoration: none;
    color: #fff;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .day-cell span { color: #94a3b8; font-size: 0.65rem; text-transform: uppercase; }
  .day-cell strong { font-size: 1.1rem; }
  .day-cell small {
    margin-top: auto;
    width: fit-content;
    min-width: 1.35rem;
    text-align: center;
    border-radius: 999px;
    padding: 0.08rem 0.35rem;
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
    font-size: 0.7rem;
  }
  .day-cell[data-tone='today'] { border-color: rgba(236, 72, 153, 0.6); background: rgba(236, 72, 153, 0.16); }
  .day-cell[data-tone='danger'] { border-color: rgba(239, 68, 68, 0.6); }
  .day-cell[data-tone='warning'] { border-color: rgba(245, 158, 11, 0.62); }
  .day-cell[data-tone='busy'] { border-color: rgba(59, 130, 246, 0.45); }
  .agenda-list { margin-top: 0.25rem; }
  .agenda-item,
  .notification {
    display: grid;
    gap: 0.55rem;
    align-items: center;
    color: #fff;
    text-decoration: none;
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 0.95rem;
  }
  .agenda-item {
    grid-template-columns: 4.7rem 1fr auto;
    padding: 0.75rem;
    margin-top: 0.45rem;
  }
  .agenda-date { color: #bfdbfe; font-size: 0.74rem; font-weight: 800; }
  .agenda-main { min-width: 0; display: flex; flex-direction: column; gap: 0.12rem; }
  .agenda-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .agenda-main small { color: #94a3b8; }
  .agenda-item[data-tone='danger'],
  .notification[data-tone='danger'] { border-color: rgba(239, 68, 68, 0.45); }
  .agenda-item[data-tone='warning'],
  .notification[data-tone='warning'] { border-color: rgba(245, 158, 11, 0.45); }
  .empty-line { margin: 0.5rem 0 0; color: #94a3b8; }
  .notification-list { display: grid; gap: 0.55rem; }
  .notification { padding: 0.85rem; }
  .notification strong { display: block; }
  .notification span { color: #cbd5e1; font-size: 0.86rem; }
  .control-grid,
  .progress-grid,
  .map-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.8rem;
  }
  .control-card,
  .map-grid a {
    color: #fff;
    text-decoration: none;
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 1rem;
    transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
  }
  .control-card {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.8rem;
    align-items: center;
    padding: 1rem;
  }
  .control-card.primary {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(236, 72, 153, 0.12));
    border-color: rgba(147, 197, 253, 0.2);
  }
  .control-card:hover,
  .control-card:focus-visible,
  .map-grid a:hover,
  .map-grid a:focus-visible,
  .agenda-item:hover,
  .agenda-item:focus-visible,
  .notification:hover,
  .notification:focus-visible {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.085);
    border-color: rgba(255, 255, 255, 0.18);
    outline: none;
  }
  .icon { font-size: 1.7rem; }
  .control-card h3 { margin: 0.1rem 0 0.2rem; color: #fff; font-size: 1rem; }
  .control-card p { margin: 0; color: #cbd5e1; line-height: 1.35; font-size: 0.88rem; }
  .control-card strong { color: #bfdbfe; font-size: 1.1rem; }
  .map-grid a {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.9rem;
    font-weight: 800;
  }
  .map-grid small { color: #94a3b8; font-weight: 500; }
  @media (min-width: 680px) {
    .control-grid,
    .map-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .progress-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (min-width: 1040px) {
    .map-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
