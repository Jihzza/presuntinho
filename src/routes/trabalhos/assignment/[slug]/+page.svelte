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
  import { goto } from '$app/navigation';
  import { locale, t } from 'svelte-i18n';
  import { liveQuery, type Subscription } from 'dexie';
  import { db } from '$lib/state/db';
  import {
    localizedAssignment,
    setAssignmentStatus,
    updateAssignment,
    deleteAssignment,
    type Assignment,
    type AssignmentStatus
  } from '$lib/trabalhos';
  import Countdown from '$lib/components/Countdown.svelte';
  import { showToast } from '$lib/components/events';
  import { localizedSchoolMetaForSlug } from '$lib/escola/catalog';

  let assignment = $state<Assignment | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let notFound = $state(false);
  let busy = $state(false);
  const dateLocale = $derived($locale || 'pt-PT');

  // Pretty label for the status enum (PT-only for the MVP).
  function statusLabel(s: AssignmentStatus): string {
    switch (s) {
      case 'pending':     return $t('trabalhos.status.pending', { default: 'Por começar' });
      case 'in_progress': return $t('trabalhos.status.in_progress', { default: 'Em curso' });
      case 'submitted':   return $t('trabalhos.status.submitted', { default: 'Entregue' });
      case 'graded':      return $t('trabalhos.status.graded', { default: 'Avaliado' });
    }
  }

  // Pretty label for the curso slug.
  function cursoLabel(slug: string): string {
    const meta = localizedSchoolMetaForSlug($t, slug);
    if (meta) return meta.title;
    return slug
      .split('-')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  }

  // Format a deadline timestamp for the meta block ("27 jun 2026, 14:00").
  function formatDeadline(ts: number): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString(dateLocale, {
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
      error = $t('trabalhos.assignment.not_specified', { default: 'Trabalho não especificado.' });
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
          assignment = localizedAssignment($t, row);
          notFound = false;
        }
        loading = false;
      },
      error: (e: unknown) => {
        console.error('[trabalhos/assignment] liveQuery failed', e);
        error = e instanceof Error ? e.message : $t('trabalhos.assignment.load_error', { default: 'Erro a carregar trabalho' });
        loading = false;
      }
    });

    return () => sub.unsubscribe();
  });

  // ---- Edit / delete UI state ----
  let editing = $state(false);
  let confirmingDelete = $state(false);
  let editDeadlineLocal = $state('');
  let editNotas = $state('');
  let editStatus = $state<AssignmentStatus>('pending');
  const STATUS_OPTIONS: AssignmentStatus[] = ['pending', 'in_progress', 'submitted', 'graded'];

  // Convert a timestamp to a 'YYYY-MM-DDTHH:mm' local string for the
  // datetime-local input (empty string when the timestamp is invalid).
  function toDatetimeLocal(ts: number): string {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Mutation handlers — Dexie liveQuery above reflects the saved row back
  // into local state, but we also assign the returned row so the page feels
  // instant on slow IndexedDB writes.  Every status change is routed through
  // setAssignmentStatus (which delegates to updateAssignment) so the XP
  // milestone guard lives in one place — undoing a submit never re-pays and
  // 'graded' pays nothing.
  async function changeStatus(target: AssignmentStatus, toastMsg: string): Promise<void> {
    if (!assignment || busy) return;
    busy = true;
    try {
      const updated = await setAssignmentStatus(assignment.id, target);
      if (updated) {
        assignment = updated;
        showToast(toastMsg);
      }
    } catch (e) {
      console.error('[trabalhos] changeStatus failed', e);
      showToast($t('trabalhos.toast.update_error', { default: 'Erro a atualizar estado' }));
    } finally {
      busy = false;
    }
  }

  function startEdit(): void {
    if (!assignment) return;
    editDeadlineLocal = toDatetimeLocal(assignment.deadline);
    editNotas = assignment.description ?? '';
    editStatus = assignment.status;
    confirmingDelete = false;
    editing = true;
  }

  function cancelEdit(): void {
    editing = false;
  }

  async function saveEdit(e: Event): Promise<void> {
    e.preventDefault();
    if (!assignment || busy) return;
    const ms = editDeadlineLocal ? new Date(editDeadlineLocal).getTime() : NaN;
    if (!Number.isFinite(ms)) {
      showToast($t('trabalhos.edit.erro.prazo', { default: 'Indica um prazo válido.' }));
      return;
    }
    busy = true;
    try {
      const updated = await updateAssignment(assignment.id, {
        deadline: ms,
        description: editNotas.trim(),
        status: editStatus
      });
      if (updated) {
        assignment = updated;
        editing = false;
        showToast($t('trabalhos.edit.toast.saved', { default: 'Alterações guardadas ✓' }));
      }
    } catch (err) {
      console.error('[trabalhos] updateAssignment failed', err);
      showToast($t('trabalhos.toast.update_error', { default: 'Erro a atualizar estado' }));
    } finally {
      busy = false;
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!assignment || busy) return;
    busy = true;
    try {
      await deleteAssignment(assignment.id);
      showToast($t('trabalhos.delete.toast', { default: 'Trabalho apagado' }));
      await goto('/trabalhos/');
    } catch (e) {
      console.error('[trabalhos] deleteAssignment failed', e);
      showToast($t('trabalhos.toast.update_error', { default: 'Erro a atualizar estado' }));
      busy = false;
    }
  }

  // ---- SEO ----
  let pageTitle = $derived(
    assignment ? `${assignment.title} · ${$t('trabalhos.crumbs.current', { default: 'Trabalhos' })}` : $t('trabalhos.assignment.title_fallback', { default: 'Trabalho · Trabalhos' })
  );
  let metaDescription = $derived(
    assignment?.description?.slice(0, 160) || $t('trabalhos.assignment.meta.description', { default: 'Detalhe do trabalho' })
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
  <nav class="crumbs" aria-label={$t('trabalhos.crumbs.aria', { default: 'Caminho de navegação' })}>
    <a href="/">{$t('trabalhos.crumbs.home', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <a href="/trabalhos/">{$t('trabalhos.assignment.breadcrumb.home', { default: '← Trabalhos' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$page.params.slug ?? '...'}</span>
  </nav>

  {#if loading}
    <p class="state">{$t('trabalhos.assignment.loading', { default: 'A carregar trabalho…' })}</p>
  {:else if notFound}
    <div class="state notfound" role="alert">
      <h1>{$t('trabalhos.assignment.not_found.title', { default: '404 — Trabalho não encontrado' })}</h1>
      <p>
        {$t('trabalhos.assignment.not_found.missing_id', { default: 'Não existe nenhum trabalho com o identificador' })}
        <code>{$page.params.slug}</code>.
      </p>
      <p>{$t('trabalhos.assignment.not_found.reason', { default: 'Pode ter sido removido, ou o link está errado.' })}</p>
      <a class="back-link" href="/trabalhos/">{$t('trabalhos.assignment.back_to_list', { default: '← Voltar à lista de trabalhos' })}</a>
    </div>
  {:else if error || !assignment}
    <div class="state error" role="alert">
      <p>⚠️ {error ?? $t('trabalhos.assignment.unknown', { default: 'Trabalho desconhecido.' })}</p>
      <a class="back-link" href="/trabalhos/">{$t('trabalhos.assignment.back_to_list', { default: '← Voltar à lista de trabalhos' })}</a>
    </div>
  {:else}
    <article class="assignment" data-status={assignment.status}>
      <header class="header">
        <div class="title-row">
          <h1>{assignment.title}</h1>
          <span class="xp-pill" title={$t('trabalhos.assignment.reward', { default: 'Recompensa ao entregar' })}>⚡ {assignment.xpReward} XP</span>
        </div>
        <div class="meta-row">
          <span class="course-pill">{cursoLabel(assignment.curso)}</span>
          {#if assignment.cadeira}
            <span class="cadeira-pill">{assignment.cadeira}</span>
          {/if}
          <span class="status status-{assignment.status}">{statusLabel(assignment.status)}</span>
        </div>
      </header>

      <section class="description-block" aria-label={$t('a11y.aria.descricao_do_trabalho', { default: 'Descrição do trabalho' })}>
        <h2 class="block-title">{$t('trabalhos.assignment.description', { default: 'Descrição' })}</h2>
        <p class="description">{assignment.description}</p>
      </section>

      <section class="meta-block" aria-label={$t('trabalhos.assignment.prazo', { default: 'Prazo' })}>
        <h2 class="block-title">{$t('trabalhos.assignment.prazo', { default: 'Prazo' })}</h2>
        <div class="deadline-row">
          <Countdown deadline={new Date(assignment.deadline).toISOString()} />
          <span class="deadline-abs">{formatDeadline(assignment.deadline)}</span>
        </div>
      </section>

      <section class="actions-block" aria-label={$t('a11y.aria.acoes', { default: 'Ações' })}>
        <h2 class="block-title">{$t('a11y.aria.acoes', { default: 'Ações' })}</h2>

        {#if !editing}
          <!-- Quick status transitions (forward + undo) -->
          <div class="actions">
            {#if assignment.status === 'pending'}
              <button type="button" class="btn btn-primary" onclick={() => changeStatus('in_progress', $t('trabalhos.toast.in_progress', { default: 'Marcado como em curso' }))} disabled={busy}>
                {$t('trabalhos.assignment.mark_in_progress', { default: '▶ Marcar como em curso' })}
              </button>
              <button type="button" class="btn btn-secondary" onclick={() => changeStatus('submitted', $t('trabalhos.toast.submitted', { default: 'Trabalho entregue ✓' }))} disabled={busy}>
                {$t('trabalhos.assignment.submit', { default: '✓ Entregar' })}
              </button>
            {:else if assignment.status === 'in_progress'}
              <button type="button" class="btn btn-primary" onclick={() => changeStatus('submitted', $t('trabalhos.toast.submitted', { default: 'Trabalho entregue ✓' }))} disabled={busy}>
                {$t('trabalhos.assignment.submit', { default: '✓ Entregar' })}
              </button>
              <button type="button" class="btn btn-ghost" onclick={() => changeStatus('pending', $t('trabalhos.toast.reverted', { default: 'Estado revertido' }))} disabled={busy}>
                {$t('trabalhos.assignment.undo_to_pending', { default: '↩ Voltar a por começar' })}
              </button>
            {:else if assignment.status === 'submitted'}
              <span class="hint">{$t('trabalhos.assignment.already_submitted', { default: 'Trabalho entregue.' })}</span>
              <button type="button" class="btn btn-primary" onclick={() => changeStatus('graded', $t('trabalhos.toast.graded', { default: 'Marcado como avaliado' }))} disabled={busy}>
                {$t('trabalhos.assignment.mark_graded', { default: '★ Marcar como avaliado' })}
              </button>
              <button type="button" class="btn btn-ghost" onclick={() => changeStatus('in_progress', $t('trabalhos.toast.unsubmitted', { default: 'Entrega revertida' }))} disabled={busy}>
                {$t('trabalhos.assignment.undo_submit', { default: '↩ Reverter entrega' })}
              </button>
            {:else if assignment.status === 'graded'}
              <span class="hint">{$t('trabalhos.assignment.already_graded', { default: 'Trabalho já avaliado.' })}</span>
              <button type="button" class="btn btn-ghost" onclick={() => changeStatus('submitted', $t('trabalhos.toast.reverted', { default: 'Estado revertido' }))} disabled={busy}>
                {$t('trabalhos.assignment.undo_graded', { default: '↩ Voltar a entregue' })}
              </button>
            {/if}
          </div>

          <!-- Manage: edit / delete -->
          <div class="manage">
            <button type="button" class="btn btn-secondary" onclick={startEdit} disabled={busy}>
              {$t('trabalhos.edit.cta', { default: '✎ Editar' })}
            </button>
            {#if !confirmingDelete}
              <button type="button" class="btn btn-danger" onclick={() => (confirmingDelete = true)} disabled={busy}>
                {$t('trabalhos.delete.cta', { default: '🗑 Apagar' })}
              </button>
            {/if}
          </div>

          {#if confirmingDelete}
            <div class="confirm" role="alertdialog" aria-label={$t('trabalhos.delete.confirm.aria', { default: 'Confirmar remoção' })}>
              <p>{$t('trabalhos.delete.confirm.q', { default: 'Apagar este trabalho? Esta ação não pode ser anulada.' })}</p>
              <div class="confirm-actions">
                <button type="button" class="btn btn-ghost" onclick={() => (confirmingDelete = false)} disabled={busy}>
                  {$t('financas.nova.cancel', { default: 'Cancelar' })}
                </button>
                <button type="button" class="btn btn-danger" onclick={confirmDelete} disabled={busy}>
                  {$t('trabalhos.delete.confirm.yes', { default: 'Sim, apagar' })}
                </button>
              </div>
            </div>
          {/if}
        {:else}
          <!-- Edit form: deadline + notes + status (incl. 'graded') -->
          <form class="edit-form" onsubmit={saveEdit} novalidate>
            <div class="efield">
              <label for="edit-deadline">{$t('trabalhos.assignment.prazo', { default: 'Prazo' })}</label>
              <input id="edit-deadline" type="datetime-local" bind:value={editDeadlineLocal} disabled={busy} required />
            </div>
            <div class="efield">
              <label for="edit-status">{$t('trabalhos.filters.status', { default: 'Estado' })}</label>
              <select id="edit-status" bind:value={editStatus} disabled={busy}>
                {#each STATUS_OPTIONS as s (s)}
                  <option value={s}>{statusLabel(s)}</option>
                {/each}
              </select>
            </div>
            <div class="efield">
              <label for="edit-notas">{$t('trabalhos.novo.notas', { default: 'Notas' })}</label>
              <textarea id="edit-notas" bind:value={editNotas} maxlength="500" rows="4" disabled={busy}></textarea>
            </div>
            <div class="edit-actions">
              <button type="button" class="btn btn-ghost" onclick={cancelEdit} disabled={busy}>
                {$t('financas.nova.cancel', { default: 'Cancelar' })}
              </button>
              <button type="submit" class="btn btn-primary" disabled={busy}>
                {busy ? $t('common.loading', { default: 'A guardar…' }) : $t('trabalhos.edit.save', { default: 'Guardar alterações' })}
              </button>
            </div>
          </form>
        {/if}
      </section>

      <footer class="footer-row">
        <a class="back-link" href="/trabalhos/">{$t('trabalhos.assignment.back_to_list', { default: '← Voltar à lista de trabalhos' })}</a>
      </footer>
    </article>
  {/if}
</div>

<style>
  .detail {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem calc(8rem + env(safe-area-inset-bottom));
  }
  .crumbs {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.875rem;
    color: var(--txt3);
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .crumbs a {
    color: var(--accent);
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
    color: var(--txt2);
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
    border-left-color: var(--accent);
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
    color: var(--accent);
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
    color: var(--txt2);
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
    color: var(--accent);
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
    color: var(--txt3);
    margin: 0 0 0.5rem 0;
    font-weight: 600;
  }
  .description {
    color: var(--txt2);
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
    color: var(--txt3);
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
    background: var(--accent);
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
    color: var(--txt3);
    font-size: 0.875rem;
    margin: 0;
    flex-basis: 100%;
  }
  .manage {
    display: flex;
    gap: 0.625rem;
    flex-wrap: wrap;
    margin-top: 0.875rem;
    padding-top: 0.875rem;
    border-top: 1px solid var(--border, rgba(255, 255, 255, 0.1));
  }
  .btn-ghost {
    background: transparent;
    color: var(--txt2, #cbd5e1);
    border: 1px solid var(--border-strong, rgba(255, 255, 255, 0.2));
  }
  .btn-ghost:hover:not(:disabled),
  .btn-ghost:focus-visible:not(:disabled) {
    background: var(--card-hover, rgba(255, 255, 255, 0.12));
    color: var(--txt, #fff);
    outline: none;
  }
  .btn-danger {
    background: transparent;
    color: var(--error, #ef4444);
    border: 1px solid color-mix(in srgb, var(--error, #ef4444) 55%, transparent);
  }
  .btn-danger:hover:not(:disabled),
  .btn-danger:focus-visible:not(:disabled) {
    background: color-mix(in srgb, var(--error, #ef4444) 15%, transparent);
    outline: none;
  }
  .btn-danger:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--error, #ef4444) 35%, transparent);
  }
  .confirm {
    margin-top: 0.875rem;
    padding: 0.875rem 1rem;
    border: 1px solid color-mix(in srgb, var(--error, #ef4444) 45%, transparent);
    background: color-mix(in srgb, var(--error, #ef4444) 8%, transparent);
    border-radius: var(--radius-md, 0.5rem);
  }
  .confirm p {
    margin: 0 0 0.75rem 0;
    color: var(--txt, #fff);
    font-size: 0.9375rem;
    line-height: 1.5;
  }
  .confirm-actions,
  .edit-actions {
    display: flex;
    gap: 0.625rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }
  .efield {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .efield label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--txt2, #cbd5e1);
  }
  .efield input,
  .efield select,
  .efield textarea {
    width: 100%;
    padding: 0.6rem 0.7rem;
    min-height: var(--touch-target, 44px);
    background: var(--bg-elev, #2d4373);
    border: 1px solid var(--border-strong, rgba(255, 255, 255, 0.2));
    border-radius: var(--radius-md, 0.5rem);
    color: var(--txt, #fff);
    font-family: inherit;
    font-size: 1rem;
    color-scheme: light dark;
  }
  .efield textarea {
    resize: vertical;
    line-height: 1.5;
    min-height: 5rem;
  }
  .efield input:focus-visible,
  .efield select:focus-visible,
  .efield textarea:focus-visible {
    outline: none;
    border-color: var(--accent, #ec4899);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #ec4899) 40%, transparent);
  }
  .footer-row {
    display: flex;
    justify-content: flex-start;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border, rgba(255, 255, 255, 0.1));
  }
  .back-link {
    color: var(--accent);
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
      padding: 2rem 1.5rem calc(8rem + env(safe-area-inset-bottom));
    }
    .title-row h1 {
      font-size: 1.875rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .btn { transition: none; transform: none; }
  }
</style>
