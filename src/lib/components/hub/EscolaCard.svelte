<script lang="ts">
  /**
   * Hub card — Escola (school).
   *
   * V8: progress is computed by the escola progress module
   * ($lib/escola/progress), which joins the course catalog with the
   * Dexie `visited` rows ('lesson:<unit>:<lesson>').  This fixes the
   * old bugs where the card counted a 'lesson:equivalenza/' prefix
   * (wrong separator — always 0) against a hardcoded denominator of 5.
   *
   * The "current course" line now shows where Fatma left off (resume
   * target unit), derived from the catalog instead of a hardcoded
   * 'Equivalenza'.
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { resumeTarget, schoolSummary } from '$lib/escola/progress';

  interface Props {
    /** Optional href override (defaults to /escola). */
    href?: string;
  }
  let { href = '/escola/' }: Props = $props();

  let completed = $state(0);
  let total = $state(0);
  let currentTitle = $state<string | null>(null);
  let currentUnitSlug = $state<string | null>(null);
  let loading = $state(true);

  onMount(() => {
    void (async () => {
      if (typeof indexedDB === 'undefined') {
        loading = false;
        return;
      }
      try {
        const [summary, resume] = await Promise.all([schoolSummary(), resumeTarget()]);
        completed = summary.lessonsDone;
        total = summary.lessonsTotal;
        currentTitle = resume?.unitTitle ?? null;
        currentUnitSlug = resume?.unitSlug ?? null;
      } catch (e) {
        console.error('[hub][escola] read failed', e);
      } finally {
        loading = false;
      }
    })();
  });

  let progressLabel = $derived(
    loading
      ? $t('routes.hub.card.escola.loading', { default: 'A carregar…' })
      : $t('routes.hub.card.escola.progress', {
          values: { done: completed, total },
          default: '{done}/{total} lições concluídas'
        })
  );
  let percent = $derived(total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0);
  let cursoLine = $derived(
    currentTitle && currentUnitSlug
      ? $t(`school.catalog.units.${currentUnitSlug}.title`, { default: currentTitle })
      : $t('routes.hub.card.escola.all_done', { default: 'Catálogo completo 🎉' })
  );
</script>

<a
  class="card"
  {href}
  aria-label={$t('routes.hub.card.escola.aria', { default: 'Escola — curso atual e progresso' })}
>
  <div class="icon" aria-hidden="true">🌸</div>
  <div class="content">
    <h2>{$t('routes.hub.card.escola.title', { default: 'Escola' })}</h2>
    <p class="curso">
      {cursoLine}
      {#if currentTitle}
        <span class="badge">{$t('routes.hub.card.escola.current_badge', { default: 'Atual' })}</span>
      {/if}
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
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-left: 4px solid var(--accent);
    border-radius: var(--radius-md, 0.75rem);
    color: var(--txt, #fff);
    text-decoration: none;
    transition: background var(--motion-base, 220ms), transform var(--motion-fast, 120ms);
    min-height: 88px;
  }
  .card:hover,
  .card:focus-visible {
    background: var(--card-hover, rgba(255, 255, 255, 0.08));
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
    color: var(--txt, #fff);
    font-weight: 600;
  }
  .curso {
    font-size: 0.8125rem;
    color: var(--txt2);
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
    color: var(--on-accent, #fff);
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
    transition: width var(--motion-base, 300ms) ease;
  }
  .meta {
    font-size: 0.75rem;
    color: var(--txt3);
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
