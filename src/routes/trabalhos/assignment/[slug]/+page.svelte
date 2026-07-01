<!--
  /trabalhos/assignment/[slug] — detail view for a single assignment.

  Loads `db.assignments.get(params.slug)` on mount.  The "slug" URL
  param is actually the stable id of the row (a1, a2, …) — we keep
  the param name as `slug` to mirror the old /data/assignments/*.json
  pack convention so external links don't break.

  Status transitions (Marcar in_progress / Submeter) are applied
  through `setAssignmentStatus()` in `$lib/trabalhos`, which handles
  the Dexie write and the XP rewards.

  If the id doesn't resolve to a row, the page renders a 404 state
  with a link back to /trabalhos/.

  i18n: PT strings inline (task-005 will add en/fr/ar/tn keys).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { liveQuery, type Subscription } from 'dexie';
  import { db } from '$lib/state/db';
  import {
    setAssignmentStatus,
    type Assignment,
    type AssignmentStatus
  } from '$lib/trabalhos';
  import Countdown from '$lib/components/Countdown.svelte';
  import { showToast } from '$lib/components/events';

  let assignment = $state<Assignment | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let notFound = $state(false);
  let busy = $state(false);

  // Pretty label for the status enum (PT-only for the MVP).
  function statusLabel(s: AssignmentStatus): string {
    switch (s) {
      case 'pending':     return 'Por começar';
      case 'in_progress': return 'Em curso';
      case 'submitted':   return 'Entregue';
      case 'graded':      return 'Avaliado';
    }
  }

  // Pretty label for the curso slug.
  function cursoLabel(slug: string): string {
    return slug
      .split('-')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  }

  // Format a deadline timestamp for the meta block ("27 jun 2026, 14:00").
  function formatDeadline(ts: number): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('pt-PT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  onMount(() => {
    const id = $page.params.slug;
    if (!id) {
      error = 'Trabalho não especificado.';
      loading = false;
      return;
    }

    const sub: Subscription = liveQuery(() => db().assignments.get(id)).subscribe({
      next: (row) => {
        error = null;
        if (!row) {
          assignment = null;
          notFound = true;
        } else {
          assignment = row;
          notFound = false;
        }
        loading = false;
      },
      error: (e: unknown) => {
        console.error('[trabalhos/assignment] liveQuery failed', e);
        error = e instanceof Error ? e.message : 'Erro a carregar trabalho';
        loading = false;
      }
    });

    return () => sub.unsubscribe();
  });

  // Mutation handlers — Dexie liveQuery above reflects the saved row
  // back into local state, but we also assign the returned row so the
  // page feels instant on slow IndexedDB writes.
  async function markInProgress(): Promise<void> {
    if (!assignment || busy) return;
    busy = true;
    try {
      const updated = await setAssignmentStatus(assignment.id, 'in_progress');
      if (updated) {
        assignment = updated;
        showToast('Marcado como em curso');
      }
    } catch (e) {
      console.error('[trabalhos] setAssignmentStatus failed', e);
      showToast('Erro a atualizar estado');
    } finally {
      busy = false;
    }
  }

  async function submitAssignment(): Promise<void> {
    if (!assignment || busy) return;
    busy = true;
    try {
      const updated = await setAssignmentStatus(assignment.id, 'submitted');
      if (updated) {
        assignment = updated;
        showToast('Trabalho entregue ✓');
      }
    } catch (e) {
      console.error('[trabalhos] setAssignmentStatus failed', e);
      showToast('Erro a entregar trabalho');
    } finally {
      busy = false;
    }
  }

  // ---- SEO ----
  let pageTitle = $derived(
    assignment ? `${assignment.title} · Trabalhos` : 'Trabalho · Trabalhos'
  );
  let metaDescription = $derived(
    assignment?.description?.slice(0, 160) || 'Detalhe do trabalho'
  );
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta name="description" content={metaDescription} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={metaDescription} />
  <meta property="og:url" content="https://presuntinho.netlify.app/trabalhos/" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={metaDescription} />
</svelte:head>

<div class="detail">
  <nav class="crumbs" aria-label="Caminho de navegação">
    <a href="/">← Hub</a>
    <span aria-hidden="true">/</span>
    <a href="/trabalhos/">← Trabalhos</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$page.params.slug ?? '...'}</span>
  </nav>

  {#if loading}
    <p class="state">A carregar trabalho…</p>
  {:else if notFound}
    <div class="state notfound" role="alert">
      <h1>404 — Trabalho não encontrado</h1>
      <p>
        Não existe nenhum trabalho com o identificador
        <code>{$page.params.slug}</code>.
      </p>
      <p>Pode ter sido removido, ou o link está errado.</p>
      <a class="back-link" href="/trabalhos/">← Voltar à lista de trabalhos</a>
    </div>
  {:else if error || !assignment}
    <div class="state error" role="alert">
      <p>⚠️ {error ?? 'Trabalho desconhecido.'}</p>
      <a class="back-link" href="/trabalhos/">← Voltar à lista de trabalhos</a>
    </div>
  {:else}
    <article class="assignment" data-status={assignment.status}>
      <header class="header">
        <div class="title-row">
          <h1>{assignment.title}</h1>
          <span class="xp-pill" title="Recompensa ao entregar">⚡ {assignment.xpReward} XP</span>
        </div>
        <div class="meta-row">
          <span class="course-pill">{cursoLabel(assignment.curso)}</span>
          {#if assignment.cadeira}
            <span class="cadeira-pill">{assignment.cadeira}</span>
          {/if}
          <span class="status status-{assignment.status}">{statusLabel(assignment.status)}</span>
        </div>
      </header>

      <section class="description-block" aria-label="Descrição do trabalho">
        <h2 class="block-title">Descrição</h2>
        <p class="description">{assignment.description}</p>
      </section>

      <section class="meta-block" aria-label="Prazo">
        <h2 class="block-title">Prazo</h2>
        <div class="deadline-row">
          <Countdown deadline={new Date(assignment.deadline).toISOString()} />
          <span class="deadline-abs">{formatDeadline(assignment.deadline)}</span>
        </div>
      </section>

      <section class="actions-block" aria-label="Ações">
        <h2 class="block-title">Ações</h2>
        <div class="actions">
          {#if assignment.status === 'pending'}
            <button
              type="button"
              class="btn btn-primary"
              onclick={markInProgress}
              disabled={busy}
            >
              ▶ Marcar como em curso
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              onclick={submitAssignment}
              disabled={busy}
            >
              ✓ Entregar
            </button>
          {:else if assignment.status === 'in_progress'}
            <button
              type="button"
              class="btn btn-primary"
              onclick={submitAssignment}
              disabled={busy}
            >
              ✓ Entregar
            </button>
          {:else if assignment.status === 'submitted' || assignment.status === 'graded'}
            <p class="hint">Trabalho {assignment.status === 'graded' ? 'já avaliado' : 'entregue'}.</p>
          {/if}
        </div>
      </section>

      <footer class="footer-row">
        <a class="back-link" href="/trabalhos/">← Voltar à lista de trabalhos</a>
      </footer>
    </article>
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
  .state {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1.5rem;
    color: var(--txt2, #cbd5e1);
  }
  .state.error {
    border-left: 4px solid var(--error, #ef4444);
  }
  .state.notfound {
    text-align: center;
    border-left: 4px solid var(--warning, #f59e0b);
  }
  .state.notfound h1 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    color: var(--txt, #fff);
  }
  .state code {
    background: rgba(0, 0, 0, 0.25);
    padding: 0.05rem 0.35rem;
    border-radius: 0.25rem;
    font-size: 0.85em;
  }
  .assignment {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-left: 4px solid var(--accent, #f59e0b);
    border-radius: 0.75rem;
    padding: 1.5rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .assignment[data-status='in_progress'] {
    border-left-color: var(--accent, #ec4899);
  }
  .assignment[data-status='submitted'] {
    border-left-color: var(--success, #10b981);
  }
  .assignment[data-status='graded'] {
    border-left-color: #6366f1;
  }
  .header {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex-wrap: wrap;
  }
  .title-row h1 {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.25;
    color: var(--txt, #fff);
    flex: 1 1 auto;
    min-width: 0;
  }
  .xp-pill {
    font-size: 0.8125rem;
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    background: rgba(236, 72, 153, 0.15);
    color: var(--accent, #ec4899);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .meta-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .course-pill {
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--txt2, #cbd5e1);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    font-weight: 600;
    text-transform: capitalize;
  }
  .cadeira-pill {
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    font-weight: 600;
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
  .block-title {
    font-size: 0.8125rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3, #94a3b8);
    margin: 0 0 0.5rem 0;
    font-weight: 600;
  }
  .description {
    color: var(--txt2, #cbd5e1);
    margin: 0;
    font-size: 1rem;
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .deadline-row {
    background: rgba(0, 0, 0, 0.15);
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .deadline-abs {
    color: var(--txt3, #94a3b8);
    font-size: 0.875rem;
  }
  .actions {
    display: flex;
    gap: 0.625rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.6rem 1.1rem;
    border-radius: 0.5rem;
    font-family: inherit;
    font-size: 0.95rem;
    font-weight: 600;
    border: 0;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.15s, transform 0.15s;
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .btn-primary {
    background: var(--accent, #ec4899);
    color: #fff;
  }
  .btn-primary:hover:not(:disabled),
  .btn-primary:focus-visible:not(:disabled) {
    background: #d63384;
    outline: none;
  }
  .btn-primary:focus-visible {
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.4);
  }
  .btn-secondary {
    background: rgba(255, 255, 255, 0.06);
    color: var(--txt, #fff);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.2));
  }
  .btn-secondary:hover:not(:disabled),
  .btn-secondary:focus-visible:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    outline: none;
  }
  .btn-secondary:focus-visible {
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.4);
  }
  .hint {
    color: var(--txt3, #94a3b8);
    font-size: 0.875rem;
    margin: 0;
    flex-basis: 100%;
  }
  .footer-row {
    display: flex;
    justify-content: flex-start;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border, rgba(255, 255, 255, 0.1));
  }
  .back-link {
    color: var(--accent, #ec4899);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9375rem;
  }
  .back-link:hover,
  .back-link:focus-visible {
    text-decoration: underline;
  }
  @media (min-width: 640px) {
    .detail {
      padding: 2rem 1.5rem 3rem;
    }
    .title-row h1 {
      font-size: 1.875rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .btn { transition: none; transform: none; }
  }
</style>
