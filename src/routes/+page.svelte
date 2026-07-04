<script lang="ts">
  /**
   * Home — hub da Fatma (V8 redesign).
   *
   * Estrutura (top → bottom), mobile-first:
   *   1. Hero compacto mood-aware: saudação por hora do dia, streak 🔥,
   *      chip de nível XP e alertas.
   *   2. <DailyQuests /> — missões diárias (card auto-suficiente).
   *   3. "Hoje": agenda do dia com quick actions inline (marcar hábito
   *      feito sem sair do hub, saltar para a próxima lição).
   *   4. Faixa da semana condensada → /calendario/.
   *   5. Mapa rápido de atalhos (inclui os novos /humor/ e /memorias/).
   *   6. Conquistas (BadgeGrid).
   *
   * Live refresh: 'presuntinho:xp-changed' + visibilitychange.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { prefersReducedMotion } from '$lib/components/events';

  import BadgeGrid from '$lib/components/BadgeGrid.svelte';
  import OnboardingModal from '$lib/components/OnboardingModal.svelte';
  import DailyQuests from '$lib/components/quests/DailyQuests.svelte';
  import MoodCheckin from '$lib/mood/MoodCheckin.svelte';
  import AppCard from '$lib/components/AppCard.svelte';
  import PigMascot from '$lib/components/PigMascot.svelte';
  import { profileFor } from '$lib/profile/people';
  import { resumeTarget, type NextLessonTarget } from '$lib/escola/progress';

  import { db } from '$lib/state/db';
  import { xp, initStores } from '$lib/state/stores';
  import { XP_CHANGED_EVENT, awardXP } from '$lib/state/xp-actions';
  import { getSession } from '$lib/auth/session';
  import { getActivityStreak, type ActivityStreak } from '$lib/gamification/streak';
  import { progressToNext } from '$lib/gamification/levels';
  import { hoursUntilMidnight, mascotEmotion, type MascotEmotion } from '$lib/gamification/emotion';
  import { minutesSinceLastAction, ACTION_PULSE_EVENT } from '$lib/gamification/gamification-events';
  import { getActiveMascot, MASCOT_CHANGED_EVENT } from '$lib/gamification/mascots';
  import { setHabitLog } from '$lib/habitos';
  import { showToast } from '$lib/components/events';
  import { isMoodIntroAcknowledged, moodAffirmation, moodMicrocopy, readActiveMood, MOOD_META, type ActiveMood } from '$lib/mood';
  import {
    buildNotifications,
    formatDayLabel,
    loadAgendaItems,
    loadNotificationExtras,
    localDateKey,
    weekDays,
    type AgendaItem,
    type NotificationItem
  } from '$lib/vida/agenda';
  import { NOTIF_CHANGED_EVENT, loadNotifState, unreadCount, type NotifState } from '$lib/vida/notificationState';
  import { locale, t } from 'svelte-i18n';

  interface BadgeStatus {
    unlocked: boolean;
    unlockedAt?: number;
  }

  let currentXp = $state(0);
  let activeProfile = $state<'fatma' | 'daniel' | null>(null);
  let badgesMap = $state<Record<string, BadgeStatus>>({});
  let showOnboarding = $state(false);
  let heroIn = $state(false);
  let agendaItems = $state<AgendaItem[]>([]);
  let notifications = $state<NotificationItem[]>([]);
  let notifState = $state<NotifState>({ snoozed: new Set(), read: new Set() });
  let activeMood = $state<ActiveMood | null>(null);
  let charmSeed = $state(Date.now());
  let streak = $state<ActivityStreak | null>(null);
  let now = $state(new Date());
  let markingHabitId = $state<string | null>(null);
  let mascotEmoji = $state('🐷');
  let emotionTick = $state(0);
  // V10.1 (tarefa A) — a Home é o perfil vivo da Fatma + cockpit.
  let resume = $state<NextLessonTarget | null>(null);
  const person = $derived(profileFor(activeProfile ?? 'fatma'));

  const dateLocale = $derived($locale || 'pt-PT');
  const todayKey = $derived(localDateKey(now));
  const weekPreviewDays = $derived(weekDays(now));

  // V10 — the XP number rolls smoothly instead of jumping (tweened store;
  // duration collapses to 0 under prefers-reduced-motion).
  const xpTween = tweened(0, { duration: 400, easing: cubicOut });
  $effect(() => {
    void xpTween.set(currentXp, { duration: prefersReducedMotion() ? 0 : 400 });
  });
  const xpLabel = $derived(
    new Intl.NumberFormat(dateLocale).format(Math.round($xpTween)) + ' XP'
  );
  const levelInfo = $derived(progressToNext(currentXp));
  const level = $derived(levelInfo.level);
  const emotion = $derived.by<MascotEmotion>(() => {
    void emotionTick; // re-evaluates on action pulses + the minute timer
    if (!streak) return 'neutral';
    return mascotEmotion({
      streakCurrent: streak.current,
      streakBest: streak.best,
      activeToday: streak.activeToday,
      hoursUntilMidnight: hoursUntilMidnight(now),
      minutesSinceLastAction: minutesSinceLastAction()
    });
  });
  const EMOTION_FALLBACKS: Record<MascotEmotion, string> = {
    happy: 'Hoje já contou — orgulho em ti! 🎀',
    neutral: 'Pronta para a primeira vitória do dia?',
    worried: 'A chama apaga-se à meia-noite… uma coisinha rápida chega!',
    sad: 'A streak partiu-se, mas hoje é um ótimo dia para recomeçar.',
    euphoric: 'UAU! Estás imparável!'
  };
  const mascotLine = $derived(
    $t(`mascots.emotion.${emotion}`, { default: EMOTION_FALLBACKS[emotion] })
  );
  const unlockedBadges = $derived(Object.values(badgesMap).filter((b) => b.unlocked).length);
  const todaysItems = $derived(agendaItems.filter((item) => item.date === todayKey));
  const todaysPending = $derived(todaysItems.filter((item) => item.status !== 'done'));
  const alertCount = $derived(unreadCount(notifications, notifState));
  const moodMeta = $derived(activeMood ? MOOD_META[activeMood.kind] : null);
  const moodLine = $derived(activeMood ? moodMicrocopy(activeMood.kind, charmSeed) : $t('hub.default.mood_line'));
  const moodNote = $derived(activeMood ? moodAffirmation(activeMood.kind, charmSeed) : '');

  const daySlot = $derived.by<'morning' | 'afternoon' | 'evening'>(() => {
    const h = now.getHours();
    if (h >= 6 && h < 13) return 'morning';
    if (h >= 13 && h < 20) return 'afternoon';
    return 'evening';
  });

  const greeting = $derived.by(() => {
    const name = $t(`profile.${activeProfile ?? 'fatma'}`, { default: 'Fatma' });
    if (daySlot === 'morning') return $t('hub.hero.greeting.morning', { values: { name }, default: 'Bom dia, {name} 🌤️' });
    if (daySlot === 'afternoon') return $t('hub.hero.greeting.afternoon', { values: { name }, default: 'Boa tarde, {name} ☀️' });
    return $t('hub.hero.greeting.evening', { values: { name }, default: 'Boa noite, {name} 🌙' });
  });

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
      // loadNotificationExtras() shares ONE idempotent getDailyQuests()
      // call per refresh — never fetch quests per-item or on a timer.
      const [items, extras] = await Promise.all([loadAgendaItems(), loadNotificationExtras()]);
      agendaItems = items;
      notifications = buildNotifications(items, extras);
    } catch (e) {
      console.error('[hub] refreshAgenda failed', e);
    }
  }

  async function refreshStreak(): Promise<void> {
    try {
      streak = await getActivityStreak();
    } catch (e) {
      console.error('[hub] getActivityStreak failed', e);
      streak = null;
    }
  }

  async function refreshBadges(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      const rows = await db().badges.toArray();
      const next: Record<string, BadgeStatus> = {};
      for (const row of rows) {
        next[row.id] = { unlocked: Boolean(row.unlocked), unlockedAt: row.unlockedAt };
      }
      badgesMap = next;
    } catch (e) {
      console.error('[hub] refreshBadges failed', e);
    }
  }

  async function refreshHub(): Promise<void> {
    await Promise.all([refreshAgenda(), refreshBadges(), refreshStreak()]);
  }

  /** Inline quick action: mark a habit as done straight from the hub. */
  async function markHabitDone(item: AgendaItem): Promise<void> {
    const habitId = Number(item.id.split(':')[1]);
    if (!Number.isFinite(habitId) || markingHabitId) return;
    markingHabitId = item.id;
    try {
      const { changed } = await setHabitLog(habitId, todayKey, true);
      if (changed) {
        await awardXP('habito_mark_done');
        showToast(get(t)('hub.today.habit_done_toast', { default: 'Hábito marcado — boa! ✨' }), 2400);
      }
      await Promise.all([refreshAgenda(), refreshStreak()]);
    } catch (e) {
      console.error('[hub] markHabitDone failed', e);
    } finally {
      markingHabitId = null;
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
    notifState = loadNotifState();
    const unsubXp = xp.subscribe((v) => (currentXp = v));
    const unsubLocale = locale.subscribe(() => {
      void refreshAgenda();
    });

    void (async () => {
      await initStores();
      await refreshHub();
      const mood = await readActiveMood();
      activeMood = mood && isMoodIntroAcknowledged(mood) ? mood : null;
    })();

    void getActiveMascot()
      .then((m) => (mascotEmoji = m.emoji))
      .catch(() => undefined);
    void resumeTarget()
      .then((r) => (resume = r))
      .catch(() => (resume = null));
    const onMascotChanged = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as { emoji?: string } | null) : null;
      if (detail?.emoji) mascotEmoji = detail.emoji;
    };
    window.addEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);

    // Mascot emotion: re-evaluate on action pulses and once a minute
    // (the "worried evening" window depends on the clock).
    const onActionPulse = () => (emotionTick += 1);
    window.addEventListener(ACTION_PULSE_EVENT, onActionPulse);
    const emotionTimer = setInterval(() => {
      now = new Date();
      emotionTick += 1;
    }, 60_000);

    try {
      showOnboarding = localStorage.getItem('fat-onboarded') === null;
    } catch {
      showOnboarding = false;
    }

    // Live refresh (d): XP changes anywhere in the app + tab visibility.
    const onXpEvent = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as { total?: number } | null) : null;
      if (typeof detail?.total === 'number') currentXp = detail.total;
      void refreshStreak();
      void refreshBadges();
    };
    window.addEventListener(XP_CHANGED_EVENT, onXpEvent);

    // Bell chip live-updates when /notificacoes marks read / snoozes.
    const onNotifChanged = () => (notifState = loadNotifState());
    window.addEventListener(NOTIF_CHANGED_EVENT, onNotifChanged);

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        now = new Date();
        charmSeed = Date.now();
        void refreshHub();
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.removeEventListener(XP_CHANGED_EVENT, onXpEvent);
      window.removeEventListener(NOTIF_CHANGED_EVENT, onNotifChanged);
      window.removeEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);
      window.removeEventListener(ACTION_PULSE_EVENT, onActionPulse);
      clearInterval(emotionTimer);
      document.removeEventListener('visibilitychange', onVis);
      unsubXp();
      unsubLocale();
    };
  });
</script>

<svelte:head>
  <title>{$t('routes.hub.title', { default: 'Presuntinho — Dashboard' })}</title>
</svelte:head>

<OnboardingModal open={showOnboarding} onClose={handleOnboardingClose} profile={activeProfile} />

<div class="hub">
  <!-- 1 · Hero compacto mood-aware -->
  <header class="card hub-hero" class:hero-in={heroIn} class:mooded={Boolean(activeMood)}>
    <!-- V10.1 (tarefa A): perfil vivo — avatar clicável + nome + handle. -->
    <div class="profile-row">
      <a
        class="profile-avatar"
        href="/perfil/"
        aria-label={$t('hub.profile.open_aria', { default: 'Abrir o teu perfil' })}
        data-sveltekit-preload-data
      >
        <span aria-hidden="true">{person.emoji}</span>
      </a>
      <div class="profile-id">
        <strong>{$t(person.nameKey)}</strong>
        <small>{$t(person.handleKey)}</small>
      </div>
      <a class="profile-link" href="/perfil/" data-sveltekit-preload-data>
        {$t('hub.profile.view', { default: 'Ver perfil →' })}
      </a>
    </div>
    <span class="eyebrow">
      {activeMood ? `${moodMeta?.emoji} ${moodMeta?.label}` : $t('hub.hero.eyebrow')}
    </span>
    <h1>{greeting}</h1>
    <p class="sub">{moodLine}</p>
    {#if moodNote}
      <p class="mood-note">{moodNote}</p>
    {/if}
    <div class="hero-chips" aria-label={$t('hub.hero.metrics.aria')}>
      <a
        href="/streaks/"
        class="chip chip-streak"
        class:chip-streak-active={streak?.activeToday}
        title={streak?.activeToday
          ? $t('hub.hero.streak.active_today', { default: 'Streak protegida hoje — já fizeste qualquer coisa. 🐷' })
          : $t('hub.hero.streak.pending_today', { default: 'Uma pequena ação hoje mantém a chama acesa.' })}
      >
        <span aria-hidden="true">🔥</span>
        {$t('hub.hero.streak.days', { values: { count: streak?.current ?? 0 }, default: '{count} dias' })}
        {#if streak && streak.freezes > 0}
          <small
            class="freeze-mini"
            title={$t('streak.popover.freezes.hint', {
              default: 'Um congelamento protege a streak num dia falhado. Ganhas 1 a cada 7 dias.'
            })}>❄️×{streak.freezes}</small>
        {/if}
        {#if streak && streak.best > streak.current}
          <small>{$t('hub.hero.streak.best', { values: { count: streak.best }, default: 'melhor: {count}' })}</small>
        {/if}
      </a>
      <span class="chip chip-level">
        <span aria-hidden="true">⭐</span>
        {$t('hub.hero.level', { values: { level }, default: 'Nível {level}' })}
        <small>{xpLabel}</small>
      </span>
      <a class="chip chip-alerts" href="/notificacoes/" data-alert={alertCount > 0}>
        <span aria-hidden="true">🔔</span>
        {$t('hub.hero.alerts', { values: { count: alertCount }, default: '{count} alertas' })}
      </a>
    </div>
    <div class="level-progress">
      <div
        class="level-bar-wrap"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={levelInfo.pct}
        aria-label={$t('hub.hero.level.progress.aria', { default: 'Progresso para o próximo nível' })}
      >
        <div class="level-bar" style="width: {levelInfo.pct}%"></div>
      </div>
      <small class="level-progress-label">
        {$t('hub.hero.level.progress', {
          values: { current: levelInfo.current, needed: levelInfo.needed, next: level + 1 },
          default: '{current}/{needed} XP até ao nível {next}'
        })}
      </small>
    </div>
    <p class="mascot-line" aria-live="polite">
      <PigMascot {emotion} size={40} />
      {mascotLine}
    </p>
  </header>

  <!-- 2 · Missões diárias -->
  <section class="quests-section presuntinho-quest" aria-label={$t('hub.quests.aria', { default: 'Missões diárias' })}>
    <DailyQuests />
  </section>

  <!-- 2a · Continua de onde paraste (V10.1, tarefa A) -->
  {#if resume}
    <section class="card resume-section" aria-label={$t('hub.resume.aria', { default: 'Continua de onde paraste' })}>
      <div class="resume-copy">
        <span class="eyebrow">{$t('hub.resume.eyebrow', { default: 'Continua de onde paraste' })}</span>
        <strong class="resume-title">
          <span aria-hidden="true">{resume.unitIcon}</span>
          {resume.lessonTitle}
        </strong>
        <small class="resume-sub">{resume.unitTitle}</small>
      </div>
      <a class="resume-cta" href={resume.href} data-sveltekit-preload-data>
        {$t('hub.resume.cta', { default: 'Continuar →' })}
      </a>
    </section>
  {/if}

  <!-- 2b · Check-in de humor (dispensável; colapsa depois de registado) -->
  <MoodCheckin />

  <!-- 3 · Hoje: agenda + quick actions inline -->
  <section class="card today-card" aria-label={$t('hub.today.aria')}>
    <div class="section-head">
      <div>
        <span class="eyebrow">{$t('hub.today.eyebrow')}</span>
        <h2>{formatDayLabel(todayKey, dateLocale)}</h2>
      </div>
      <a class="head-link" href="/calendario/">{$t('hub.calendar.manage')}</a>
    </div>

    {#if todaysItems.length === 0}
      <p class="empty-line">{$t('hub.today.empty')}</p>
    {:else}
      <ul class="today-list v10-stagger">
        {#each todaysItems.slice(0, 4) as item (item.id)}
          <li class="today-item" data-tone={item.tone}>
            <a class="today-main" href={item.href}>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </a>
            {#if item.kind === 'habit' && item.status !== 'done'}
              <button
                type="button"
                class="quick-done"
                onclick={() => void markHabitDone(item)}
                disabled={markingHabitId !== null}
                aria-label={$t('hub.today.mark_done_aria', { values: { title: item.title }, default: 'Marcar «{title}» como feito' })}
                title={$t('hub.today.mark_done', { default: 'Marcar feito' })}
              >✓</button>
            {:else if item.status === 'done'}
              <span class="done-check" aria-hidden="true">✅</span>
            {/if}
          </li>
        {/each}
      </ul>
      {#if todaysPending.length === 0}
        <p class="all-done-line">{$t('hub.today.all_done', { default: 'Tudo feito por hoje — orgulho total. 💖' })}</p>
      {/if}
    {/if}

    <div class="quick-actions">
      <a class="quick-chip" href="/escola/">
        <span aria-hidden="true">🎓</span>
        {$t('hub.today.next_lesson', { default: 'Próxima lição' })}
      </a>
      <a class="quick-chip" href="/habitos/">
        <span aria-hidden="true">✅</span>
        {$t('hub.today.open_habits', { default: 'Hábitos de hoje' })}
      </a>
      <a class="quick-chip" href="/calendario/">
        <span aria-hidden="true">🗓️</span>
        {$t('hub.today.plan_week', { default: 'Planear a semana' })}
      </a>
    </div>
  </section>

  <!-- 4 · Semana condensada -->
  <section class="card week-card" aria-label={$t('hub.calendar.week_aria')}>
    <div class="section-head">
      <h2>{$t('hub.calendar.title')}</h2>
      <a class="head-link" href="/calendario/">{$t('hub.calendar.open')}</a>
    </div>
    <div class="week-grid" role="group" aria-label={$t('hub.calendar.week_aria')}>
      {#each weekPreviewDays as day (localDateKey(day))}
        <a
          class="day-cell"
          data-tone={dayTone(day)}
          href="/calendario/"
          aria-label={$t('hub.calendar.day_aria', { values: { day: formatDayLabel(localDateKey(day), dateLocale), count: itemsForDate(day).length } })}
        >
          <span>{day.toLocaleDateString(dateLocale, { weekday: 'short' })}</span>
          <strong>{day.getDate()}</strong>
          {#if itemsForDate(day).length > 0}
            <small>{itemsForDate(day).length}</small>
          {/if}
        </a>
      {/each}
    </div>
  </section>

  <!-- 5 · Mapa rápido -->
  <section class="map-section" aria-label={$t('hub.map.aria')}>
    <div class="section-head">
      <h2>{$t('hub.map.title')}</h2>
      <span class="head-note">{$t('hub.map.subtitle')}</span>
    </div>
    <!-- V10.1 (tarefa C): a grelha de apps usa o AppCard unificado — o mesmo
         cartão quadrado da Vida e da Escola. -->
    <div class="map-grid v10-stagger">
      <AppCard href="/escola/" icon="🎓" title={$t('hub.map.school')} desc={$t('hub.map.school.desc')} />
      <AppCard href="/vida/" icon="🌿" title={$t('hub.map.vida', { default: 'Vida' })} desc={$t('hub.map.vida.desc', { default: 'rotinas, energia e equilíbrio' })} />
      <AppCard href="/streaks/" icon="🔥" title={$t('streaks.page.short', { default: 'Streaks' })} desc={$t('vida.streaks.desc', { default: 'A tua chama, XP diário e marcos.' })} />
      <AppCard href="/habitos/" icon="✅" title={$t('hub.map.habits', { default: 'Hábitos' })} desc={$t('hub.map.habits.desc', { default: 'streaks e progresso diário' })} />
      <AppCard href="/financas/" icon="💸" title={$t('hub.map.finances', { default: 'Finanças' })} desc={$t('hub.map.finances.desc', { default: 'transações e metas' })} />
      <AppCard href="/calendario/" icon="🗓️" title={$t('hub.map.calendar')} desc={$t('hub.map.calendar.desc')} />
      <AppCard href="/agente/" icon="🤖" title={$t('hub.map.agent')} desc={$t('hub.map.agent.desc')} />
      <AppCard href="/mensagens/" icon="💬" title={$t('nav.mensagens', { default: 'Mensagens' })} desc={$t('hub.map.messages.desc', { default: 'conversas com o Daniel' })} />
      <AppCard href="/humor/" icon="💗" title={$t('hub.map.mood', { default: 'Humor' })} desc={$t('hub.map.mood.desc', { default: 'como te tens sentido' })} />
      <AppCard href="/memorias/" icon="📸" title={$t('hub.map.memories', { default: 'Memórias' })} desc={$t('hub.map.memories.desc', { default: 'momentos guardados com carinho' })} />
      <AppCard href="/mascotes/" icon="🎭" title={$t('hub.map.mascots', { default: 'Mascotes' })} desc={$t('hub.map.mascots.desc', { default: 'a tua coleção fofa' })} />
      <AppCard href="/definicoes/" icon="⚙️" title={$t('a11y.settings', { default: 'Definições' })} desc={$t('hub.map.settings.desc', { default: 'temas, sons e conta' })} />
    </div>
  </section>

  <!-- 6 · Conquistas -->
  <section class="badges-section" aria-label={$t('hub.section.badges.aria', { default: 'Conquistas' })}>
    <div class="section-head">
      <h2>{$t('hub.section.badges', { default: 'Conquistas' })}</h2>
      <span class="head-note">{$t('hub.badges.unlocked', { values: { count: unlockedBadges } })}</span>
    </div>
    <BadgeGrid badges={badgesMap} />
  </section>
</div>

<style>
  .hub {
    max-width: 980px;
    margin: 0 auto;
    padding: 1.25rem var(--space-4) 8rem;
  }
  .card {
    border-radius: var(--radius-xl);
    color: var(--txt);
    border: 1px solid var(--border);
    background: var(--card);
  }
  section {
    margin-top: var(--space-4);
  }

  /* ---- V10.1 · perfil vivo + resume ---------------------------------- */
  .profile-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: var(--space-3);
  }
  .profile-avatar {
    display: grid;
    place-items: center;
    width: 58px;
    height: 58px;
    border-radius: 1.2rem;
    font-size: 1.9rem;
    background: color-mix(in srgb, var(--accent) 18%, var(--bg-elev));
    border: 2px solid color-mix(in srgb, var(--accent) 45%, var(--border));
    text-decoration: none;
    transition: transform var(--motion-fast, 120ms) ease;
  }
  .profile-avatar:hover,
  .profile-avatar:focus-visible {
    transform: translateY(-1px) scale(1.04);
    outline: none;
    box-shadow: 0 0 0 2px var(--accent);
  }
  .profile-id {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .profile-id strong {
    font-size: var(--fs-lg);
    color: var(--txt);
  }
  .profile-id small {
    color: var(--txt3);
    font-size: var(--fs-xs);
  }
  .profile-link {
    margin-inline-start: auto;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 0.5rem;
    color: var(--accent);
    font-size: var(--fs-sm);
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
  }
  .profile-link:hover,
  .profile-link:focus-visible {
    text-decoration: underline;
    outline: none;
  }
  .resume-section {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: var(--space-4);
    border-inline-start: 4px solid var(--accent);
  }
  .resume-copy {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
    flex: 1;
  }
  .resume-title {
    font-size: var(--fs-md);
    color: var(--txt);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .resume-sub {
    color: var(--txt3);
    font-size: var(--fs-xs);
  }
  .resume-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 1rem;
    border-radius: var(--radius-lg);
    background: var(--accent);
    color: var(--on-accent, #fff);
    font-weight: 700;
    font-size: var(--fs-sm);
    text-decoration: none;
    white-space: nowrap;
    transition: transform var(--motion-fast, 120ms) ease;
  }
  .resume-cta:hover,
  .resume-cta:focus-visible {
    transform: translateY(-1px);
    outline: none;
  }

  /* ---- Hero -------------------------------------------------------- */
  .hub-hero {
    opacity: 0;
    transform: translateY(8px);
    padding: 1.25rem;
    background:
      radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 26%, transparent), transparent 38%),
      var(--card);
  }
  .hub-hero.mooded {
    background:
      radial-gradient(circle at top left, color-mix(in srgb, var(--mood-accent, var(--accent)) 26%, transparent), transparent 38%),
      var(--card);
    border-color: color-mix(in srgb, var(--mood-accent, var(--accent)) 28%, var(--border));
  }
  .hub-hero.hero-in {
    animation: hub-hero-in var(--motion-base, 360ms) ease-out forwards;
  }
  @keyframes hub-hero-in {
    to { opacity: 1; transform: translateY(0); }
  }
  .hub-hero h1 {
    margin: 0.3rem 0 0.25rem;
    font-size: var(--fs-2xl);
    line-height: 1.05;
  }
  .sub {
    margin: 0;
    color: var(--txt2);
    line-height: 1.5;
  }
  .mood-note {
    margin: 0.35rem 0 0;
    color: var(--txt3);
    font-size: var(--fs-sm);
    line-height: 1.45;
  }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-size: var(--fs-xs);
    color: color-mix(in srgb, var(--accent) 72%, var(--txt));
    font-weight: 800;
  }
  .hero-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 44px;
    padding: 0.5rem 0.85rem;
    border-radius: 999px;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    color: var(--txt);
    font-size: var(--fs-sm);
    font-weight: 700;
    text-decoration: none;
    font-variant-numeric: tabular-nums;
  }
  .chip small {
    color: var(--txt3);
    font-weight: 600;
  }
  .chip-streak-active {
    border-color: color-mix(in srgb, var(--warning) 55%, var(--border));
    background: color-mix(in srgb, var(--warning) 12%, var(--bg-elev));
  }
  .freeze-mini {
    color: #93c5fd;
  }
  .level-progress {
    margin-top: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .level-bar-wrap {
    width: 100%;
    height: 8px;
    background: var(--bg-elev);
    border-radius: 999px;
    overflow: hidden;
  }
  .level-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #f9a8d4));
    border-radius: 999px;
    transition: width var(--motion-base, 220ms) ease;
  }
  .level-progress-label {
    color: var(--txt3);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
  }
  .mascot-line {
    margin: var(--space-2) 0 0;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--txt2);
    font-size: var(--fs-sm);
    line-height: 1.45;
  }
  .chip-level {
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  }
  .chip-alerts:hover,
  .chip-alerts:focus-visible {
    background: var(--card-hover);
    outline: none;
  }
  .chip-alerts:focus-visible {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .chip-alerts[data-alert='true'] {
    border-color: color-mix(in srgb, var(--warning) 55%, var(--border));
  }

  /* ---- Hoje --------------------------------------------------------- */
  .today-card,
  .week-card {
    padding: var(--space-4);
  }
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-3);
  }
  .section-head h2 {
    margin: 0.15rem 0 0;
    color: var(--txt);
    font-size: var(--fs-md);
  }
  .head-link {
    color: color-mix(in srgb, var(--accent) 78%, var(--txt));
    font-size: var(--fs-sm);
    font-weight: 700;
    text-decoration: none;
    border-radius: var(--radius-sm);
    padding: 0.2rem 0.3rem;
  }
  .head-link:hover,
  .head-link:focus-visible {
    text-decoration: underline;
    outline: none;
  }
  .head-link:focus-visible {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .head-note {
    color: var(--txt3);
    font-size: var(--fs-xs);
  }
  .today-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
  }
  .today-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 0.4rem 0.5rem 0.4rem 0.75rem;
  }
  .today-item[data-tone='danger'] { border-color: color-mix(in srgb, var(--error) 45%, var(--border)); }
  .today-item[data-tone='warning'] { border-color: color-mix(in srgb, var(--warning) 45%, var(--border)); }
  .today-item[data-tone='done'] { opacity: 0.72; }
  .today-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    color: var(--txt);
    text-decoration: none;
    padding: 0.35rem 0;
    border-radius: var(--radius-sm);
  }
  .today-main:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--accent);
  }
  .today-main strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--fs-base);
  }
  .today-main small {
    color: var(--txt3);
    font-size: var(--fs-xs);
  }
  .quick-done {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--success) 55%, var(--border));
    background: color-mix(in srgb, var(--success) 14%, transparent);
    color: var(--txt);
    font-size: 1.1rem;
    font-weight: 800;
    cursor: pointer;
    transition: background var(--motion-fast, 120ms) ease, transform var(--motion-fast, 120ms) ease;
  }
  .quick-done:hover:not(:disabled),
  .quick-done:focus-visible {
    background: color-mix(in srgb, var(--success) 28%, transparent);
    outline: none;
  }
  .quick-done:focus-visible {
    box-shadow: 0 0 0 2px var(--success);
  }
  .quick-done:active:not(:disabled) {
    transform: scale(0.94);
  }
  .quick-done:disabled {
    opacity: 0.55;
    cursor: wait;
  }
  .done-check {
    width: 44px;
    text-align: center;
  }
  .all-done-line {
    margin: var(--space-2) 0 0;
    color: color-mix(in srgb, var(--success) 70%, var(--txt));
    font-size: var(--fs-sm);
    font-weight: 700;
  }
  .empty-line {
    margin: 0;
    color: var(--txt3);
  }
  .quick-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
  .quick-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 44px;
    padding: 0.5rem 0.85rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
    color: var(--txt);
    font-size: var(--fs-sm);
    font-weight: 700;
    text-decoration: none;
    transition: background var(--motion-fast, 120ms) ease, transform var(--motion-fast, 120ms) ease;
  }
  .quick-chip:hover,
  .quick-chip:focus-visible {
    background: color-mix(in srgb, var(--accent) 24%, transparent);
    transform: translateY(-1px);
    outline: none;
  }
  .quick-chip:focus-visible {
    box-shadow: 0 0 0 2px var(--accent);
  }

  /* ---- Semana ------------------------------------------------------- */
  .week-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 0.45rem;
  }
  .day-cell {
    min-height: 64px;
    border-radius: var(--radius-lg);
    padding: 0.45rem;
    text-decoration: none;
    color: var(--txt);
    background: var(--bg-elev);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    transition: border-color var(--motion-fast, 120ms) ease, background var(--motion-fast, 120ms) ease;
  }
  .day-cell:hover,
  .day-cell:focus-visible {
    background: var(--card-hover);
    outline: none;
  }
  .day-cell:focus-visible {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .day-cell span {
    color: var(--txt3);
    font-size: 0.62rem;
    text-transform: uppercase;
  }
  .day-cell strong {
    font-size: var(--fs-md);
  }
  .day-cell small {
    margin-top: auto;
    width: fit-content;
    min-width: 1.3rem;
    text-align: center;
    border-radius: 999px;
    padding: 0.06rem 0.3rem;
    background: color-mix(in srgb, var(--txt) 14%, transparent);
    color: var(--txt);
    font-size: 0.68rem;
  }
  .day-cell[data-tone='today'] {
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    background: color-mix(in srgb, var(--accent) 14%, var(--bg-elev));
  }
  .day-cell[data-tone='danger'] { border-color: color-mix(in srgb, var(--error) 55%, var(--border)); }
  .day-cell[data-tone='warning'] { border-color: color-mix(in srgb, var(--warning) 55%, var(--border)); }
  .day-cell[data-tone='busy'] { border-color: var(--border-strong, var(--border)); }

  /* ---- Mapa rápido (cartões AppCard partilhados) --------------------- */
  .map-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }

  @media (min-width: 680px) {
    .map-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (min-width: 1040px) {
    .map-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
</style>
