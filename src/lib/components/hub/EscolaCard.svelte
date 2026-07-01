<script lang="ts">
  /**
   * Hub card — Escola (school).
   *
   * Shows the current course and the user's progress through its
   * lessons.  Progress is read directly from Dexie: we count rows in
   * the `visited` table whose id starts with `lesson:<curso>/` and
   * divide by the course's total lesson count (sourced from the same
   * in-component catalogue the escola hub uses — single source of
   * truth).
   *
   * The "current course" is hard-coded to `equivalenza` for the MVP
   * (it carries the "Atual" badge on /escola) — when a second
   * "current" course ships we'll move the choice into a Dexie
   * settings row.  The data layer already keeps the table reads
   * scoped to a single curso slug, so swapping the source is a
   * one-line change.
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { db } from '$lib/state/db';

  interface Props {
    /** Optional href override (defaults to /escola). */
    href?: string;
  }
  let { href = '/escola/curso/equivalenza' }: Props = $props();

  // The "current" course slug — matches the badge 'Atual' on /escola.
  const CURRENT_CURSO = 'equivalenza';

  // Hardcoded mini-catalogue for the equivalenza course so the card can
  // render the total-lesson denominator without re-fetching the full
  // /escola +page.  The count is the only field consumed by this card.
  // Kept in sync with src/routes/escola/curso/[slug]/+page.svelte
  // CATALOGUE['equivalenza'].lessons.length — single source of truth
  // lives there; the card just hard-codes the same number (5) so it
  // can render a non-zero denominator even if Dexie is empty.
  const CURRENT_CURSO_LESSONS = 5;

  let completed = $state(0);
  let loading = $state(true);

  onMount(() => {
    void (async () => {
      if (typeof indexedDB === 'undefined') {
        loading = false;
        return;
      }
      try {
        const prefix = `lesson:${CURRENT_CURSO}/`;
        const rows = await db().visited.toArray();
        completed = rows.filter(
          (r) => typeof r.id === 'string' && r.id.startsWith(prefix)
        ).length;
      } catch (e) {
        console.error('[hub][escola] read failed', e);
      } finally {
        loading = false;
      }
    })();
  });

  // Computed values
  let total = $derived(CURRENT_CURSO_LESSONS);
  let progressLabel = $derived(
    loading
      ? $t('routes.hub.card.escola.loading', { default: 'A carregar…' })
      : $t('routes.hub.card.escola.progress', {
          values: { done: completed, total },
          default: '{done}/{total} lições concluídas'
        })
  );
  let percent = $derived(total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0);
</script>

<a
  class="card"
  {href}
  style="--accent: #ec4899"
  aria-label={$t('routes.hub.card.escola.aria', { default: 'Escola — curso atual e progresso' })}
>
  <div class="icon" aria-hidden="true">🌸</div>
  <div class="content">
    <h2>{$t('routes.hub.card.escola.title', { default: 'Escola' })}</h2>
    <p class="curso">
      {$t('routes.hub.card.escola.current_curso', { default: 'Equivalenza' })}
      <span class="badge">{$t('routes.hub.card.escola.current_badge', { default: 'Atual' })}</span>
    </p>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent} aria-label={progressLabel}>
      <div class="bar" style="width: {percent}%"></div>
    </div>
    <p class="meta">{progressLabel}</p>
  </div>
  <div class="arrow" aria-hidden="true">→</div>
</a>

<style>
  .card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-left: 4px solid var(--accent);
    border-radius: 0.75rem;
    color: #fff;
    text-decoration: none;
    transition: background 0.2s, transform 0.15s;
    min-height: 88px;
  }
  .card:hover,
  .card:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-2px);
  }
  .card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .icon {
    font-size: 2.25rem;
    line-height: 1;
    flex-shrink: 0;
    width: 3rem;
    text-align: center;
  }
  .content {
    flex: 1;
    min-width: 0;
  }
  .content h2 {
    font-size: 1.0625rem;
    margin: 0 0 0.125rem 0;
    color: #fff;
    font-weight: 600;
  }
  .curso {
    font-size: 0.8125rem;
    color: #cbd5e1;
    margin: 0 0 0.5rem 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .badge {
    display: inline-block;
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--accent);
    color: #fff;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    line-height: 1.2;
  }
  .progress {
    height: 6px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    overflow: hidden;
    margin-bottom: 0.375rem;
  }
  .bar {
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
    transition: width 0.3s ease;
  }
  .meta {
    font-size: 0.75rem;
    color: #94a3b8;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .arrow {
    color: var(--accent);
    font-size: 1.25rem;
    flex-shrink: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .card { transition: none; }
    .card:hover { transform: none; }
    .bar { transition: none; }
  }
</style>
