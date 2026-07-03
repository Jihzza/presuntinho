<!--
  /habitos/habit/[slug]/+page.svelte — habit detail with heatmap + streak.

  The route param `slug` is the numeric habit id (e.g. /habitos/habit/3/).
  We picked numeric ids over slugs because:
    * Dexie's primary key is numeric (auto-increment).
    * Users don't need pretty URLs for an internal tool.
    * It keeps `addHabito()`'s return value the single source of truth.

  Surface area:
    * Header  — emoji + name + back link
    * Stats   — current streak, days logged (last 90), today's status
    * Action  — "Marcar como feito hoje" / "Desfazer" toggle
    * Heatmap — 90-day grid (see Heatmap.svelte)
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    listHabitos,
    getStreak,
    getHeatmapData,
    logHabit,
    unlogHabit,
    type Habit,
    type HeatmapData
  } from '$lib/habitos';
  import Heatmap from '$lib/components/Heatmap.svelte';
  import { showToast } from '$lib/components/events';

  // Parse `slug` as a number.  Anything else → 404-like redirect back
  // to the list.  This is the single guard against /habitos/habit/abc/
  // trying to query Dexie with a non-numeric id.

  import { t } from "svelte-i18n";
  function parseId(raw: string | undefined): number | null {
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const habitId = $derived(parseId(page.params.slug));
  let habit = $state<Habit | null>(null);
  let streak = $state(0);
  let heatmap = $state<HeatmapData>({});
  let loading = $state(true);
  let error = $state<string | null>(null);
  let ticking = $state(false);

  function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  let todayLogged = $derived(Boolean(heatmap[todayKey()]));

  let recentCount = $derived(
    Object.values(heatmap).filter((v) => v).length
  );

  async function reloadAll(id: number): Promise<void> {
    loading = true;
    error = null;
    try {
      const all = await listHabitos();
      habit = all.find((h) => h.id === id) ?? null;
      if (!habit) {
        error = $t('error.habito_nao_encontrado', { default: 'Hábito não encontrado.' });
        return;
      }
      const [s, h] = await Promise.all([
        getStreak(id),
        getHeatmapData(id, 90)
      ]);
      streak = s;
      heatmap = h;
    } catch (e) {
      console.error('[habitos] reloadAll failed', e);
      error = e instanceof Error ? e.message : $t('habitos.habit.erro_carregar', { default: 'Erro a carregar hábito' }) as string;
    } finally {
      loading = false;
    }
  }

  // Re-run whenever the URL slug changes (e.g. user navigates between
  // two habits without leaving the route).  untrack() prevents the
  // effect from re-running when `habit` / `heatmap` state updates,
  // which would cause an infinite loop.
  $effect(() => {
    const id = habitId;
    if (id === null) {
      // Bad URL → bounce back to the list.
      void goto('/habitos/');
      return;
    }
    untrack(() => {
      void reloadAll(id);
    });
  });

  async function toggleToday(): Promise<void> {
    if (!habit || ticking) return;
    ticking = true;
    const today = todayKey();
    try {
      if (todayLogged) {
        await unlogHabit(habit.id, today);
        showToast($t('toast.marcacao_removida', { default: 'Marcação removida' }));
      } else {
        await logHabit(habit.id, today);
        showToast($t('habitos.habit.toast.marcado', { default: 'Marcado como feito ✅' }));
      }
      // Refresh streak + heatmap from DB.
      const [s, h] = await Promise.all([
        getStreak(habit.id),
        getHeatmapData(habit.id, 90)
      ]);
      streak = s;
      heatmap = h;
    } catch (e) {
      console.error('[habitos] toggle failed', e);
      showToast($t('habitos.habit.toast.erro', { default: 'Erro a atualizar' }));
    } finally {
      ticking = false;
    }
  }

  function streakMessage(s: number): string {
    if (s === 0) return $t('habitos.habit.streak.zero', { default: 'Começa hoje — carrega em "Marcar como feito"' }) as string;
    if (s === 1) return $t('habitos.habit.streak.um_dia', { default: '1 dia seguido. Continua!' }) as string;
    return $t('habitos.habit.streak.n_dias', { values: { n: s }, default: `${s} dias seguidos.` }) as string;
  }

  // SEO — used by <svelte:head> below.  We build the title from the
  // loaded habit name when available, falling back to a literal.
  let pageTitle = $derived(
    habit
      ? ($t('habitos.habit.seo.title_template', { values: { name: habit.name }, default: `${habit.name} · Hábitos` }) as string)
      : ($t('habitos.habit.seo.title_fallback', { default: 'Hábito · Hábitos' }) as string)
  );
  let description = $derived($t('habitos.habit.seo.description', { default: 'Detalhe do hábito' }) as string);
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content="https://presuntinho.netlify.app/habitos/habit/" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={description} />
</svelte:head>

<div class="detail">
  <nav class="crumbs" aria-label="{$t('a11y.aria.caminho_de_navegacao', { default: 'Caminho de navegação' })}">
    <a href="/">{$t('habitos.crumbs.hub', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <a href="/habitos/">{$t('habitos.habit.breadcrumb.home', { default: '← Hábitos' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{habit?.name ?? '...'}</span>
  </nav>

  {#if loading}
    <p class="empty">{$t('habitos.habit.carregando', { default: 'A carregar…' })}</p>
  {:else if error || !habit}
    <p class="empty error" role="alert">
      ⚠️ {error ?? $t('habitos.habit.nao_encontrado', { default: 'Hábito não encontrado.' })}
    </p>
    <p class="back-row"><a href="/habitos/">{$t('habitos.habit.back.voltar', { default: '← Voltar aos hábitos' })}</a></p>
  {:else}
    <header class="hero" style="--accent: {habit.color}">
      <div class="hero-icon" aria-hidden="true">{habit.icon}</div>
      <h1>{habit.name}</h1>
      <p class="sub">
        {habit.cadence === 'daily' ? $t('habitos.habit.cadencia.diaria', { default: 'Hábito diário' }) : habit.cadence}
      </p>
    </header>

    <section class="stats" aria-label="{$t('a11y.aria.estatisticas', { default: 'Estatísticas' })}">
      <div class="stat">
        <span class="stat-value" style="color: {habit.color}">{streak}</span>
        <span class="stat-label">{$t('habitos.streak.atual', { default: 'Streak atual' })}</span>
      </div>
      <div class="stat">
        <span class="stat-value">{recentCount}</span>
        <span class="stat-label">{$t('habitos.streak.nos_ultimos', { default: 'nos últimos 90 dias' })}</span>
      </div>
      <div class="stat">
        <span class="stat-value" class:done={todayLogged} class:todo={!todayLogged}>
          {todayLogged ? '✓' : '○'}
        </span>
        <span class="stat-label">{$t('habitos.habit.hoje', { default: 'Hoje' })}</span>
      </div>
    </section>

    <section class="action" aria-label="{$t('a11y.aria.marcar_hoje', { default: 'Marcar hoje' })}">
      <button
        type="button"
        class="toggle"
        class:toggled={todayLogged}
        disabled={ticking}
        onclick={toggleToday}
        aria-pressed={todayLogged}
        style="--accent: {habit.color}"
      >
        {todayLogged ? $t('habitos.habit.btn.desfazer', { default: '✓ Feito hoje — desfazer' }) : $t('habitos.habit.btn.feito_hoje', { default: 'Marcar como feito hoje' })}
      </button>
      <p class="streak-msg">{streakMessage(streak)}</p>
    </section>

    <section class="heatmap-section" aria-label="{$t('a11y.aria.mapa_de_calor', { default: 'Mapa de calor' })}">
      <h2 class="section-title">{$t('habitos.habit.ultimos_90_dias', { default: 'Últimos 90 dias' })}</h2>
      <Heatmap data={heatmap} color={habit.color} />
    </section>
  {/if}
</div>

<style>
  .detail {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 2rem;
  }
  .crumbs {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.875rem;
    color: var(--txt3, #94a3b8);
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .crumbs a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .crumbs a:hover,
  .crumbs a:focus-visible {
    text-decoration: underline;
  }
  .empty {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1.5rem;
    text-align: center;
    color: var(--txt2, #cbd5e1);
  }
  .empty.error {
    border-color: var(--error, #ef4444);
    color: var(--error, #ef4444);
  }
  .back-row {
    text-align: center;
    margin-top: 1rem;
  }
  .back-row a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .hero {
    text-align: center;
    margin-bottom: 1.5rem;
  }
  .hero-icon {
    font-size: 3rem;
    line-height: 1;
    margin-bottom: 0.5rem;
  }
  .hero h1 {
    font-size: 1.75rem;
    margin: 0 0 0.25rem 0;
    color: var(--txt, #fff);
  }
  .sub {
    color: var(--txt3, #94a3b8);
    margin: 0;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }
  .stat {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    padding: 0.875rem 0.5rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .stat-value {
    font-size: 1.875rem;
    font-weight: 700;
    line-height: 1;
    color: var(--txt, #fff);
  }
  .stat-value.done {
    color: var(--success, #10b981);
  }
  .stat-value.todo {
    color: var(--txt3, #94a3b8);
  }
  .stat-label {
    font-size: 0.75rem;
    color: var(--txt3, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .action {
    text-align: center;
    margin-bottom: 1.5rem;
  }
  .toggle {
    background: rgba(255, 255, 255, 0.08);
    color: var(--txt, #fff);
    border: 2px solid var(--accent, #ec4899);
    padding: 0.75rem 1.5rem;
    border-radius: 999px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s, color 0.15s, transform 0.1s;
  }
  .toggle:hover:not(:disabled),
  .toggle:focus-visible:not(:disabled) {
    background: var(--accent, #ec4899);
    color: #fff;
    outline: none;
  }
  .toggle.toggled {
    background: var(--accent, #ec4899);
    color: #fff;
  }
  .toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .streak-msg {
    margin: 0.625rem 0 0 0;
    color: var(--txt2, #cbd5e1);
    font-size: 0.875rem;
  }
  .heatmap-section {
    margin-top: 0.5rem;
  }
  .section-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3, #94a3b8);
    margin: 0 0 0.5rem 0.25rem;
    font-weight: 600;
  }
  @media (min-width: 640px) {
    .detail {
      padding: 2rem 1.5rem 3rem;
    }
    .hero h1 {
      font-size: 2.25rem;
    }
    .stat-value {
      font-size: 2.25rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .toggle { transition: none; }
  }
</style>