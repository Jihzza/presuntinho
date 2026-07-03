<!--
  /trabalhos — list of school assignments (Escola sub-app, Phase 11).

  MVP (task-004):
    * Reads the `assignments` Dexie table (added in v7) on mount and
      shows a filterable, sortable card grid.
    * Filters: curso (slug from the escola catalogue), status
      (pending / in_progress / submitted / graded), ordem
      (deadline asc / desc).  URL params are the single source of
      truth so filtered views are bookmarkable.
    * Each card links to /trabalhos/assignment/<id>/ for the detail
      view.
    * Each card shows a Countdown pill for the deadline and an XP
      reward badge.
    * Empty-state when zero rows AND when filters return nothing.

  The old (pre-task-004) version of this file rendered a hard-coded
  `Equivalenza — Mid-Term BCOBM311` block from /static + a
  /data/assignments/equivalenza.json pack fetch.  Both paths are
  obsolete now that the seed lives in Dexie (`buildDefaultAssignments`
  in `src/lib/state/assignments-seed.ts`) and the user is expected to
  own their assignments in IndexedDB.

  i18n: copy is inline PT (task-005 will add en/fr/ar/tn keys).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { t } from 'svelte-i18n';
  import { liveQuery, type Subscription } from 'dexie';
  import { db } from '$lib/state/db';
  import {
    ensureAssignmentDefaults,
    type Assignment,
    type AssignmentStatus
  } from '$lib/trabalhos';
  import Countdown from '$lib/components/Countdown.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { subApps } from '$lib/registry';

  // ---------------- State ----------------
  let assignments = $state<Assignment[]>([]);
  let cursos = $state<string[]>(['todos']);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Filter state — mirrored to URL params so filtered views are
  // bookmarkable and the back button does the right thing.
  let cursoFiltro = $state<string>('todos');
  let statusFiltro = $state<AssignmentStatus | 'todos'>('todos');
  // 'asc' = deadline soonest first (default, matches user mental model).
  // 'desc' = deadline latest first.
  let ordem = $state<'asc' | 'desc'>('asc');

  const trabalhosApp = subApps.find((a) => a.id === 'trabalhos');

  // ---------------- Derived: filtered + sorted list ----------------
  let visible = $derived.by<Assignment[]>(() => {
    const filtered = assignments.filter((a) => {
      if (cursoFiltro !== 'todos' && a.curso !== cursoFiltro) return false;
      if (statusFiltro !== 'todos' && a.status !== statusFiltro) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const cmp = a.deadline - b.deadline;
      return ordem === 'asc' ? cmp : -cmp;
    });
  });

  // "All" status options (mirrors AssignmentRow['status']).
  const STATUS_OPTIONS: Array<AssignmentStatus | 'todos'> = [
    'todos',
    'pending',
    'in_progress',
    'submitted',
    'graded'
  ];

  // Pretty label for each status (PT-only for the MVP — i18n lives
  // in task-005).
  function statusLabel(s: AssignmentStatus): string {
    switch (s) {
      case 'pending':     return $t('trabalhos.status.pending', { default: 'Por começar' });
      case 'in_progress': return $t('trabalhos.status.in_progress', { default: 'Em curso' });
      case 'submitted':   return $t('trabalhos.status.submitted', { default: 'Entregue' });
      case 'graded':      return $t('trabalhos.status.graded', { default: 'Avaliado' });
    }
  }

  // Friendly curso name: replace dashes with spaces and title-case
  // the first letter of each word.  We don't ship a curso→title map
  // here because the escola i18n keys live in pt-PT.json and
  // task-005 will wire $t() lookups properly.
  function cursoLabel(slug: string): string {
    if (slug === 'todos') return $t('trabalhos.filters.all', { default: 'Todos' });
    return slug
      .split('-')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  }

  // ---------------- Data loading ----------------
  function buildCursos(rows: Assignment[]): string[] {
    const set = new Set(rows.map((a) => a.curso));
    return ['todos', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-PT'))];
  }

  function applyRows(rows: Assignment[]): void {
    assignments = rows;
    const cs = buildCursos(rows);
    // Preserve the user's current cursoFiltro when possible; if it
    // no longer exists in the data, fall back to 'todos' so the
    // filter chip doesn't silently hide every row.
    if (cursoFiltro !== 'todos' && !cs.includes(cursoFiltro)) {
      cursoFiltro = 'todos';
    }
    cursos = cs;
    loading = false;
  }

  // Hydrate filters from URL params, seed defaults, then subscribe to a
  // Dexie liveQuery over the assignments table.  This means status
  // changes made in the detail view immediately update this list if the
  // route stays mounted in the browser history.
  onMount(() => {
    const sp = $page.url.searchParams;
    const c = sp.get('curso');
    if (c) cursoFiltro = c;
    const s = sp.get('status');
    if (s && STATUS_OPTIONS.includes(s as AssignmentStatus | 'todos')) {
      statusFiltro = s as AssignmentStatus | 'todos';
    }
    const o = sp.get('ordem');
    if (o === 'asc' || o === 'desc') ordem = o;

    let sub: Subscription | null = null;
    void ensureAssignmentDefaults()
      .then(() => {
        sub = liveQuery(() => db().assignments.orderBy('deadline').toArray()).subscribe({
          next: (rows) => {
            error = null;
            applyRows(rows);
          },
          error: (e: unknown) => {
            console.error('[trabalhos] liveQuery failed', e);
            error = e instanceof Error ? e.message : 'Erro a carregar trabalhos';
            loading = false;
          }
        });
      })
      .catch((e: unknown) => {
        console.error('[trabalhos] seed failed', e);
        error = e instanceof Error ? e.message : 'Erro a preparar trabalhos';
        loading = false;
      });

    return () => sub?.unsubscribe();
  });

  // Sync filters → URL params (use replaceState so the back button
  // doesn't accumulate filter churn).
  $effect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams();
    if (cursoFiltro !== 'todos') sp.set('curso', cursoFiltro);
    if (statusFiltro !== 'todos') sp.set('status', statusFiltro);
    if (ordem !== 'asc') sp.set('ordem', ordem);
    const qs = sp.toString();
    const next = qs ? `?${qs}` : window.location.pathname;
    if (window.location.search !== (qs ? `?${qs}` : '')) {
      window.history.replaceState(null, '', next);
    }
  });

  function clearFilters(): void {
    cursoFiltro = 'todos';
    statusFiltro = 'todos';
    ordem = 'asc';
  }

  let temFiltroAtivo = $derived(
    cursoFiltro !== 'todos' || statusFiltro !== 'todos' || ordem !== 'asc'
  );

  // XP totals for the visible rows (small motivational sub-headline).
  let xpTotalVisivel = $derived(visible.reduce((acc, a) => acc + a.xpReward, 0));
</script>

<svelte:head>
  <title>{$t('routes.trabalhos.title', { default: 'Trabalhos · Entregas e Prazos' })} · Presuntinho</title>
  <meta name="description" content={$t('routes.trabalhos.meta.description', { default: 'Trabalhos e entregas com prazos' })} />
  <meta property="og:title" content={$t('routes.trabalhos.meta.og_title', { default: 'Trabalhos · Entregas e Prazos' })} />
  <meta property="og:description" content={$t('routes.trabalhos.meta.og_description', { default: 'Trabalhos e entregas com prazos' })} />
  <meta property="og:url" content="https://presuntinho.netlify.app/trabalhos/" />
  <meta name="twitter:title" content={$t('routes.trabalhos.meta.twitter_title', { default: 'Trabalhos · Entregas e Prazos' })} />
  <meta name="twitter:description" content={$t('routes.trabalhos.meta.twitter_description', { default: 'Trabalhos e entregas com prazos' })} />
</svelte:head>

<div class="trabalhos">
  <header class="hero">
    <h1>{$t('trabalhos.hero.title', { default: '📝 Trabalhos' })}</h1>
    <p class="sub">{$t('trabalhos.hero.sub', { default: 'Trabalhos e entregas com prazos — começa pelo que tem deadline mais próximo.' })}</p>
  </header>

  <nav class="crumbs" aria-label={$t('trabalhos.crumbs.aria', { default: 'Caminho de navegação' })}>
    <a href="/">{$t('trabalhos.crumbs.home', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('trabalhos.crumbs.current', { default: 'Trabalhos' })}</span>
  </nav>

  {#if !loading && assignments.length > 0}
    <section class="filters" aria-label={$t('a11y.aria.filtros', { default: 'Filtros' })}>
      <div class="filters-row">
        <label class="field">
          <span class="field-label">{$t('trabalhos.course', { default: 'Curso' })}</span>
          <select bind:value={cursoFiltro} aria-label={$t('trabalhos.filters.course.aria', { default: 'Filtrar por curso' })}>
            {#each cursos as c (c)}
              <option value={c}>{cursoLabel(c)}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span class="field-label">{$t('trabalhos.filters.status', { default: 'Estado' })}</span>
          <select bind:value={statusFiltro} aria-label={$t('trabalhos.filters.status.aria', { default: 'Filtrar por estado' })}>
            {#each STATUS_OPTIONS as s (s)}
              <option value={s}>{s === 'todos' ? $t('trabalhos.filters.all', { default: 'Todos' }) : statusLabel(s as AssignmentStatus)}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span class="field-label">{$t('trabalhos.filters.order', { default: 'Ordem' })}</span>
          <select bind:value={ordem} aria-label={$t('trabalhos.filters.order.aria', { default: 'Ordenar por prazo' })}>
            <option value="asc">{$t('trabalhos.filters.order.asc', { default: 'Prazo ↑ (mais próximo)' })}</option>
            <option value="desc">{$t('trabalhos.filters.order.desc', { default: 'Prazo ↓ (mais longe)' })}</option>
          </select>
        </label>
        {#if temFiltroAtivo}
          <button
            type="button"
            class="clear-btn"
            onclick={clearFilters}
            aria-label={$t('trabalhos.filters.clear.aria', { default: 'Limpar filtros' })}
          >
            {$t('trabalhos.filters.clear.short', { default: 'Limpar' })}
          </button>
        {/if}
      </div>
      <div class="summary">
        <span class="summary-pill">
          <strong>{visible.length}</strong> {$t('trabalhos.summary.of', { default: 'de' })} {assignments.length} {assignments.length === 1 ? $t('trabalhos.summary.singular', { default: 'trabalho' }) : $t('trabalhos.summary.plural', { default: 'trabalhos' })}
        </span>
        <span class="summary-pill xp" title={$t('trabalhos.summary.xp_visible', { default: 'Soma de XP dos trabalhos visíveis' })}>
          ⚡ <strong>{xpTotalVisivel}</strong> XP
        </span>
      </div>
    </section>
  {/if}

  <section class="list" aria-label={$t('trabalhos.list.aria', { default: 'Lista de trabalhos' })}>
    {#if loading}
      <Skeleton variant="card" lines={4} label={$t('common.loading', { default: 'A carregar…' })} />
    {:else if error}
      <p class="empty error" role="alert">⚠️ {error}</p>
    {:else if assignments.length === 0}
      <EmptyState
        emoji="📭"
        title={$t('empty.trabalhos.title')}
        description={$t('empty.trabalhos.desc')}
      />
    {:else if visible.length === 0}
      <EmptyState
        emoji="🔎"
        title={$t('trabalhos.empty.filtered.title', { default: 'Nenhum trabalho corresponde aos filtros' })}
        description={$t('trabalhos.empty.filtered.desc', { default: 'Limpa os filtros para voltares a ver a lista completa.' })}
        ctaLabel={$t('trabalhos.filters.clear', { default: 'Limpar filtros' })}
        onCta={clearFilters}
      />
    {:else}
      <ul class="cards">
        {#each visible as a (a.id)}
          <li class="card" data-status={a.status}>
            <a class="card-link" href={`/trabalhos/assignment/${a.id}/`}>
              <div class="card-header">
                <h2 class="title">{a.title}</h2>
                <span class="course-pill" title={`${$t('trabalhos.course', { default: 'Curso' })}: ${cursoLabel(a.curso)}`}>
                  {cursoLabel(a.curso)}
                </span>
              </div>

              {#if a.cadeira}
                <p class="cadeira">{a.cadeira}</p>
              {/if}

              <p class="description">{a.description}</p>

              <div class="meta">
                <Countdown deadline={new Date(a.deadline).toISOString()} />
                <span class="status status-{a.status}">{statusLabel(a.status)}</span>
                <span class="xp-pill" title={$t('trabalhos.assignment.reward', { default: 'Recompensa ao entregar' })}>
                  ⚡ {a.xpReward} XP
                </span>
              </div>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if trabalhosApp}
    <footer class="page-footer" aria-hidden="true">
      <span style="--swatch: {trabalhosApp.color}">{trabalhosApp.icon}</span>
      <span>{$t('trabalhos.footer.position', { default: 'Hub · Trabalhos' })}</span>
    </footer>
  {/if}
</div>

<style>
  .trabalhos {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem calc(8rem + env(safe-area-inset-bottom));
  }
  .hero {
    text-align: center;
    margin-bottom: 1.5rem;
  }
  .hero h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem 0;
    color: var(--txt, #fff);
  }
  .sub {
    color: var(--txt2, #cbd5e1);
    margin: 0;
    font-size: 1rem;
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
  .filters {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 0.875rem 1rem 0.75rem;
    margin-bottom: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  .filters-row {
    display: flex;
    gap: 0.625rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 9rem;
    flex: 1 1 9rem;
  }
  .field-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3, #94a3b8);
    font-weight: 600;
  }
  .field select {
    background: rgba(0, 0, 0, 0.25);
    color: var(--txt, #fff);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: 0.4rem;
    padding: 0.45rem 0.55rem;
    font-family: inherit;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .field select:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.4);
  }
  .clear-btn {
    align-self: flex-end;
    background: transparent;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    color: var(--txt2, #cbd5e1);
    border-radius: 0.4rem;
    padding: 0.5rem 0.8rem;
    font-family: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .clear-btn:hover,
  .clear-btn:focus-visible {
    background: rgba(236, 72, 153, 0.15);
    color: var(--accent, #ec4899);
    outline: none;
  }
  .summary {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-size: 0.8125rem;
  }
  .summary-pill {
    background: rgba(0, 0, 0, 0.2);
    color: var(--txt2, #cbd5e1);
    padding: 0.3rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  }
  .summary-pill strong {
    color: var(--txt, #fff);
    font-weight: 700;
  }
  .summary-pill.xp strong {
    color: var(--accent, #ec4899);
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
  .cards {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .card {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-left: 4px solid var(--accent, #f59e0b);
    border-radius: 0.75rem;
    overflow: hidden;
    transition: transform 0.15s, background 0.2s;
  }
  .card:hover {
    background: rgba(255, 255, 255, 0.06);
    transform: translateY(-1px);
  }
  .card[data-status='in_progress'] {
    border-left-color: var(--accent, #ec4899);
  }
  .card[data-status='submitted'] {
    border-left-color: var(--success, #10b981);
  }
  .card[data-status='graded'] {
    border-left-color: #6366f1;
  }
  .card-link {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.125rem 1rem;
    color: var(--txt, #fff);
    text-decoration: none;
  }
  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.625rem;
    flex-wrap: wrap;
  }
  .title {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 600;
    color: var(--txt, #fff);
    line-height: 1.3;
    flex: 1 1 auto;
    min-width: 0;
  }
  .course-pill {
    font-size: 0.7rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--txt2, #cbd5e1);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: capitalize;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .cadeira {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--txt3, #94a3b8);
  }
  .description {
    color: var(--txt2, #cbd5e1);
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-clamp: 2;
    overflow: hidden;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex-wrap: wrap;
    background: rgba(0, 0, 0, 0.18);
    padding: 0.5rem 0.7rem;
    border-radius: 0.5rem;
    margin-top: 0.125rem;
  }
  .status {
    font-size: 0.7rem;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .status-pending {
    background: rgba(245, 158, 11, 0.15);
    color: var(--warning, #f59e0b);
  }
  .status-in_progress {
    background: rgba(236, 72, 153, 0.15);
    color: var(--accent, #ec4899);
  }
  .status-submitted {
    background: rgba(16, 185, 129, 0.15);
    color: var(--success, #10b981);
  }
  .status-graded {
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
  }
  .xp-pill {
    margin-left: auto;
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: rgba(236, 72, 153, 0.12);
    color: var(--accent, #ec4899);
    font-weight: 600;
    white-space: nowrap;
  }
  .page-footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
    margin-top: 2rem;
    color: var(--txt3, #94a3b8);
    font-size: 0.8125rem;
  }
  .page-footer span:first-child {
    color: var(--swatch, #f59e0b);
    font-size: 1.125rem;
  }
  @media (min-width: 640px) {
    .trabalhos {
      padding: 2rem 1.5rem calc(8rem + env(safe-area-inset-bottom));
    }
    .hero h1 {
      font-size: 2.5rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .card { transition: none; transform: none; }
    .clear-btn { transition: none; }
  }
</style>
