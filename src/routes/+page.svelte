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
  import {
    buildNotifications,
    formatDayLabel,
    loadAgendaItems,
    localDateKey,
    monthGridDays,
    weekDays,
    type AgendaItem,
    type NotificationItem
  } from '$lib/vida/agenda';
  import { t } from 'svelte-i18n';

  const TOTALS = schoolTotals();
  const TOTAL_LESSONS = TOTALS.lessons;
  const TOTAL_QUIZZES = TOTALS.quizzes;
  const TOTAL_ASSIGNMENTS = 1;

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
  let showOnboarding = $state(false);
  let heroIn = $state(false);
  let agendaItems = $state<AgendaItem[]>([]);
  let notifications = $state<NotificationItem[]>([]);
  let calendarExpanded = $state(false);
  let dragStartY = $state<number | null>(null);

  const today = new Date();
  const todayKey = localDateKey(today);
  const currentMonthLabel = today.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

  let xpLabel = $derived(new Intl.NumberFormat('pt-PT').format(currentXp) + ' XP');
  let unlockedBadges = $derived(Object.values(badgesMap).filter((b) => b.unlocked).length);
  let schoolProgress = $derived(Math.round(((lessonsVisited + quizzesAnswered + assignmentsDone) / (TOTAL_LESSONS + TOTAL_QUIZZES + TOTAL_ASSIGNMENTS)) * 100));
  let visibleDays = $derived(calendarExpanded ? monthGridDays(today) : weekDays(today));
  let todaysItems = $derived(agendaItems.filter((item) => item.date === todayKey));
  let nextItems = $derived(agendaItems.filter((item) => item.date >= todayKey && item.status !== 'done').slice(0, 5));
  let urgentCount = $derived(notifications.filter((item) => item.tone === 'danger' || item.tone === 'warning').length);

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

  function onCalendarPointerDown(event: PointerEvent): void {
    dragStartY = event.clientY;
  }

  function onCalendarPointerUp(event: PointerEvent): void {
    if (dragStartY === null) return;
    const delta = event.clientY - dragStartY;
    dragStartY = null;
    if (delta > 28) calendarExpanded = true;
    if (delta < -28) calendarExpanded = false;
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
      assignmentsDone = assignmentRows.filter((a) => a.status === 'submitted' || a.status === 'graded').length;
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

    void (async () => {
      await initStores();
      currentXp = get(xp);
      xp.subscribe((v) => (currentXp = v));
      await Promise.all([refreshDashboard(), refreshAgenda()]);
    })();

    try {
      showOnboarding = localStorage.getItem('fat-onboarded') === null;
    } catch {
      showOnboarding = false;
    }

    const onVis = () => {
      if (document.visibilityState === 'visible') void Promise.all([refreshDashboard(), refreshAgenda()]);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  });
</script>

<svelte:head>
  <title>{$t('routes.hub.title', { default: 'Presuntinho — Dashboard' })}</title>
</svelte:head>

<OnboardingModal open={showOnboarding} onClose={handleOnboardingClose} profile={activeProfile} />

<div class="hub">
  <header class="hub-hero" class:hero-in={heroIn}>
    <span class="eyebrow">Painel de controlo</span>
    <h1>
      {activeProfile
        ? $t('hub.greeting', { values: { name: $t(`profile.${activeProfile}`) }, default: 'Olá Fatma' })
        : 'Olá'}
    </h1>
    <p class="sub">Hoje, semana, escola e vida — tudo pronto para decidir o próximo passo.</p>
    <div class="hero-metrics" aria-label="Resumo rápido">
      <span><strong>{xpLabel}</strong><small>experiência</small></span>
      <span><strong>{schoolProgress}%</strong><small>escola activa</small></span>
      <span><strong>{urgentCount}</strong><small>alertas</small></span>
    </div>
  </header>

  <section class="today-strip" aria-label="Hoje">
    <div>
      <span class="eyebrow">Hoje</span>
      <h2>{formatDayLabel(todayKey)}</h2>
      <p>{todaysItems.length ? `${todaysItems.length} item${todaysItems.length === 1 ? '' : 's'} no dia` : 'Dia livre — bom para planear.'}</p>
    </div>
    <a href="/notificacoes/" class="notify-link">🔔 {notifications.length}</a>
  </section>

  <section class="calendar-card" aria-label="Calendário e tarefas">
    <div class="section-head">
      <div>
        <h2>Calendário</h2>
        <span>{calendarExpanded ? currentMonthLabel : 'Vista semanal · arrasta para baixo para ver o mês'}</span>
      </div>
      <button type="button" class="toggle-view" onclick={() => (calendarExpanded = !calendarExpanded)}>
        {calendarExpanded ? 'Semana' : 'Mês'}
      </button>
    </div>

    <div
      class="calendar-grid"
      class:month-view={calendarExpanded}
      onpointerdown={onCalendarPointerDown}
      onpointerup={onCalendarPointerUp}
      role="group"
      aria-label={calendarExpanded ? 'Vista mensal do calendário' : 'Vista semanal do calendário'}
    >
      {#each visibleDays as day (localDateKey(day))}
        <a
          class="day-cell"
          data-tone={dayTone(day)}
          data-outside={day.getMonth() === today.getMonth() ? 'false' : 'true'}
          href="/calendario/"
          aria-label={`${formatDayLabel(localDateKey(day))}: ${itemsForDate(day).length} itens`}
        >
          <span>{day.toLocaleDateString('pt-PT', { weekday: 'short' })}</span>
          <strong>{day.getDate()}</strong>
          {#if itemsForDate(day).length > 0}
            <small>{itemsForDate(day).length}</small>
          {/if}
        </a>
      {/each}
    </div>

    <div class="agenda-list" aria-label="Tarefas próximas">
      <div class="section-head compact">
        <h3>Tasks e próximos passos</h3>
        <a href="/calendario/">Abrir calendário →</a>
      </div>
      {#if nextItems.length === 0}
        <p class="empty-line">Nada urgente. Planeia a próxima semana.</p>
      {:else}
        {#each nextItems as item (item.id)}
          <a class="agenda-item" data-tone={item.tone} href={item.href}>
            <span class="agenda-date">{formatDayLabel(item.date)}</span>
            <span class="agenda-main"><strong>{item.title}</strong><small>{item.subtitle}</small></span>
            <span aria-hidden="true">→</span>
          </a>
        {/each}
      {/if}
    </div>
  </section>

  <section class="notifications-card" aria-label="Notificações">
    <div class="section-head">
      <h2>Notificações</h2>
      <a href="/notificacoes/">Ver todas →</a>
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

  <section class="control-section" aria-label="Controlo geral">
    <div class="section-head">
      <h2>Agora importa</h2>
      <a href="/agente/">Perguntar ao agente →</a>
    </div>
    <div class="control-grid">
      <a class="control-card primary" href="/escola/">
        <span class="icon">🎓</span>
        <div>
          <p class="label">Escola</p>
          <h3>{businessAdministration.title} e {portugueseCourse.title}</h3>
          <p>{mainSchoolCourses.length} cursos principais · {businessAdministration.units.length} cadeiras · extras e trabalhos.</p>
        </div>
        <strong>{schoolProgress}%</strong>
      </a>
      <a class="control-card" href="/vida/">
        <span class="icon">🌿</span>
        <div>
          <p class="label">Vida</p>
          <h3>Rotinas, hábitos e energia</h3>
          <p>Controlar o dia e manter consistência.</p>
        </div>
      </a>
      <a class="control-card" href="/financas/">
        <span class="icon">💸</span>
        <div>
          <p class="label">Finanças</p>
          <h3>Dinheiro e orçamento</h3>
          <p>Transacções, orçamento e relatórios.</p>
        </div>
      </a>
      <a class="control-card" href="/habitos/">
        <span class="icon">✅</span>
        <div>
          <p class="label">Hábitos</p>
          <h3>Progresso diário</h3>
          <p>Ver o que está feito e o que falta hoje.</p>
        </div>
      </a>
    </div>
  </section>

  <section class="status-section" aria-label="Estado e progresso">
    <div class="section-head">
      <h2>Progresso</h2>
      <span>Actualizado quando voltas à Home</span>
    </div>
    <div class="progress-grid">
      <ProgressBar label="Lições vistas" icon="📖" accent="#3b82f6" current={lessonsVisited} total={TOTAL_LESSONS} />
      <ProgressBar label="Quizzes iniciados" icon="❓" accent="#f59e0b" current={quizzesAnswered} total={TOTAL_QUIZZES} />
      <ProgressBar label="Trabalhos tratados" icon="✍️" accent="#10b981" current={assignmentsDone} total={TOTAL_ASSIGNMENTS} />
    </div>
  </section>

  <section class="map-section" aria-label="Mapa da app">
    <div class="section-head">
      <h2>Mapa rápido</h2>
      <span>Entrar directamente onde é preciso agir</span>
    </div>
    <div class="map-grid">
      <a href="/calendario/">🗓️ Calendário <small>semana, mês e tasks</small></a>
      <a href="/notificacoes/">🔔 Notificações <small>alertas e prioridades</small></a>
      <a href="/escola/">🎓 Escola <small>cursos, cadeiras, aulas</small></a>
      <a href="/escola/trabalhos/">📝 Trabalhos <small>assignments e entregas</small></a>
      <a href="/financas/orcamento/">📊 Orçamento <small>estado do mês</small></a>
      <a href="/agente/">🤖 Agente <small>perguntar e decidir</small></a>
    </div>
  </section>

  <section class="badges-section" aria-label={$t('hub.section.badges.aria', { default: 'Conquistas' })}>
    <div class="section-head">
      <h2>{$t('hub.section.badges', { default: 'Conquistas' })}</h2>
      <span>{unlockedBadges} desbloqueadas</span>
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
  .notifications-card {
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
  .toggle-view {
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
    font: inherit;
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
    touch-action: pan-y;
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
  .day-cell[data-outside='true'] { opacity: 0.42; }
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
