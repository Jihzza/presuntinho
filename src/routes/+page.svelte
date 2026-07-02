<script lang="ts">
  /**
   * Home — dashboard de controlo da Fatma.
   *
   * A Home não é uma lista de apps. É a visão executiva: o que está a acontecer
   * na escola, vida, finanças, hábitos e conquistas, com atalhos para agir.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';

  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import BadgeGrid from '$lib/components/BadgeGrid.svelte';
  import OnboardingModal from '$lib/components/OnboardingModal.svelte';

  import { db } from '$lib/state/db';
  import { xp, initStores } from '$lib/state/stores';
  import { getSession } from '$lib/auth/session';
  import { t } from 'svelte-i18n';

  const TOTAL_LESSONS = 5;
  const TOTAL_QUIZZES = 5;
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

  let xpLabel = $derived(new Intl.NumberFormat('pt-PT').format(currentXp) + ' XP');
  let unlockedBadges = $derived(Object.values(badgesMap).filter((b) => b.unlocked).length);
  let schoolProgress = $derived(Math.round(((lessonsVisited + quizzesAnswered + assignmentsDone) / (TOTAL_LESSONS + TOTAL_QUIZZES + TOTAL_ASSIGNMENTS)) * 100));

  async function refreshDashboard(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      const d = db();
      const [badgeRows, quizRows, visitedRows] = await Promise.all([
        d.badges.toArray(),
        d.quizScores.toArray(),
        d.visited.toArray()
      ]);

      const nextBadges: Record<string, BadgeStatus> = {};
      for (const row of badgeRows) {
        nextBadges[row.id] = { unlocked: Boolean(row.unlocked), unlockedAt: row.unlockedAt };
      }
      badgesMap = nextBadges;

      quizzesAnswered = quizRows.filter((r) => Array.isArray(r.answered) && r.answered.length > 0).length;
      lessonsVisited = visitedRows.filter((r) => typeof r.id === 'string' && r.id.startsWith('lesson:')).length;

      try {
        const res = await fetch('/data/assignments/equivalenza.json');
        if (res.ok) {
          const a = (await res.json()) as { status?: string };
          assignmentsDone = a.status && a.status !== 'open' ? 1 : 0;
        }
      } catch {
        // Mantém o valor anterior se o ficheiro não estiver disponível.
      }
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
    })();

    try {
      showOnboarding = localStorage.getItem('fat-onboarded') === null;
    } catch {
      showOnboarding = false;
    }

    void refreshDashboard();
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshDashboard();
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
    <p class="sub">Visão geral da escola, vida, finanças, hábitos e conquistas — tudo num sítio só.</p>
    <div class="hero-metrics" aria-label="Resumo rápido">
      <span><strong>{xpLabel}</strong><small>experiência</small></span>
      <span><strong>{schoolProgress}%</strong><small>escola activa</small></span>
      <span><strong>{unlockedBadges}</strong><small>conquistas</small></span>
    </div>
  </header>

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
          <h3>Business Administration e Português</h3>
          <p>Ver cursos, cadeiras, aulas, quizzes e trabalhos.</p>
        </div>
        <strong>{schoolProgress}%</strong>
      </a>
      <a class="control-card" href="/vida/">
        <span class="icon">🌿</span>
        <div>
          <p class="label">Vida</p>
          <h3>Rotinas, hábitos e vícios</h3>
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
      <a href="/escola/">🎓 Escola <small>cursos, cadeiras, aulas</small></a>
      <a href="/trabalhos/">📝 Trabalhos <small>assignments e entregas</small></a>
      <a href="/biblioteca/">📚 Biblioteca <small>materiais e ficheiros</small></a>
      <a href="/financas/orcamento/">📊 Orçamento <small>estado do mês</small></a>
      <a href="/financas/transacoes/">💳 Transacções <small>entradas e gastos</small></a>
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
  .hub-hero {
    opacity: 0;
    transform: translateY(8px);
    padding: 1.25rem;
    margin-bottom: 1rem;
    border-radius: 1.25rem;
    color: #fff;
    background: radial-gradient(circle at top left, rgba(236, 72, 153, 0.3), transparent 34%), rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.11);
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
  section { margin-top: 1.35rem; }
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  .section-head h2 { margin: 0; color: #fff; font-size: 1rem; }
  .section-head span,
  .section-head a { color: #94a3b8; font-size: 0.82rem; text-decoration: none; }
  .section-head a { color: #f9a8d4; font-weight: 700; }
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
  .map-grid a:focus-visible {
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
