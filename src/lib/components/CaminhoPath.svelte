<script lang="ts">
  /**
   * CaminhoPath — Duolingo-style vertical winding course path (V9).
   *
   * Purely presentational: the /escola/caminho/[courseSlug] route loads
   * the localized course, progress, next-lesson target, streak and
   * active mascot, then hands everything down as props.
   *
   * Node states:
   *   completed — ✓ filled with the unit colour
   *   current   — pulsing ring (zeroed by the global reduced-motion
   *               kill-switch in app.css) + 'Continuar' deep-link CTA
   *   started   — partial progress, accent border
   *   upcoming  — dimmed + 🔒 soft-lock, but still tappable (nothing in
   *               the app hard-locks)
   */
  import { t } from 'svelte-i18n';
  import type { SchoolCourse, SchoolUnit } from '$lib/escola/catalog';
  import type { CourseProgress, NextLessonTarget, UnitProgress } from '$lib/escola/progress';
  import type { ActivityStreak } from '$lib/gamification/streak';

  interface Props {
    /** Localized catalog course (localizeSchoolCourse output). */
    course: SchoolCourse;
    progress: CourseProgress | null;
    next: NextLessonTarget | null;
    streak: ActivityStreak | null;
    mascotEmoji: string;
  }

  let { course, progress, next, streak, mascotEmoji }: Props = $props();

  let units = $derived<SchoolUnit[]>([...course.units, ...(course.extras ?? [])]);
  let statBySlug = $derived.by(() => {
    const map = new Map<string, UnitProgress>();
    for (const u of progress?.units ?? []) map.set(u.slug, u);
    return map;
  });

  type NodeState = 'completed' | 'current' | 'started' | 'upcoming';

  function stateFor(unit: SchoolUnit): NodeState {
    const stat = statBySlug.get(unit.slug);
    if (next && next.unitSlug === unit.slug) return 'current';
    if (stat && stat.total > 0 && stat.done >= stat.total) return 'completed';
    if (stat && stat.done > 0) return 'started';
    return 'upcoming';
  }

  let nextLessonTitle = $derived(
    next
      ? $t(`school.catalog.units.${next.unitSlug}.lessons.${next.lessonSlug}.title`, {
          default: next.lessonTitle
        })
      : ''
  );
</script>

<section class="caminho" aria-label={$t('caminho.aria', { default: 'Caminho do curso' })}>
  <!-- Progress summary header -->
  <header class="summary card">
    <span class="mascot" aria-hidden="true">{mascotEmoji}</span>
    <div class="summary-meta">
      <p class="kicker">{$t('caminho.tag', { default: '🗺️ O teu caminho' })}</p>
      <h1>{course.icon} {course.title}</h1>
      <p class="cheer">{$t('caminho.mascot.cheer', { default: 'Estou contigo em cada passo — vamos lá! 💕' })}</p>
      <div class="summary-stats">
        <span class="stat">
          <strong>{progress ? `${progress.percent}%` : '…'}</strong>
          <small>{$t('caminho.progress_label', { default: 'do curso' })}</small>
        </span>
        <span class="stat">
          <strong>🔥 {streak ? streak.current : '…'}</strong>
          <small>{$t('caminho.streak_label', { default: 'dias seguidos' })}</small>
        </span>
        <span class="stat">
          <strong>{progress ? `${progress.done}/${progress.total}` : '…'}</strong>
          <small>{$t('caminho.lessons_label', { default: 'lições' })}</small>
        </span>
      </div>
      {#if progress}
        <div
          class="bar"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={progress.percent}
          aria-label={$t('caminho.progress_aria', { values: { percent: progress.percent }, default: 'Progresso do curso: {percent}%' })}
        >
          <div class="bar-fill" style="width: {progress.percent}%"></div>
        </div>
      {/if}
    </div>
  </header>

  {#if progress && !next}
    <p class="all-done">{$t('caminho.done', { default: 'Curso completo — és absolutamente incrível! 🎉' })}</p>
  {/if}

  <!-- Winding path -->
  <ol class="path">
    {#each units as unit, i (unit.slug)}
      {@const state = stateFor(unit)}
      {@const stat = statBySlug.get(unit.slug)}
      <li class="step" class:right={i % 2 === 1}>
        <a
          class="node {state}"
          href={`/escola/curso/${unit.slug}/`}
          style="--unit-color: {unit.color};"
          aria-label={state === 'completed'
            ? $t('caminho.node.completed_aria', { values: { title: unit.title }, default: '{title} — concluída' })
            : state === 'upcoming'
              ? $t('caminho.node.upcoming_aria', { values: { title: unit.title }, default: '{title} — ainda por começar' })
              : unit.title}
        >
          <span class="node-face" aria-hidden="true">
            {#if state === 'completed'}✓{:else}{unit.icon}{/if}
          </span>
          {#if state === 'upcoming'}
            <span class="lock" aria-hidden="true">🔒</span>
          {/if}
        </a>
        <div class="node-meta">
          <strong class="node-title">{unit.title}</strong>
          {#if stat}
            <small class="node-count">{$t('caminho.unit_count', { values: { done: stat.done, total: stat.total }, default: '{done}/{total} lições' })}</small>
          {/if}
          {#if state === 'upcoming'}
            <small class="node-hint">{$t('caminho.node.locked_hint', { default: 'Ainda a caminho — mas podes espreitar 👀' })}</small>
          {/if}
          {#if state === 'current' && next}
            <a class="continue-cta" href={next.href}>
              {$t('caminho.continue', { values: { lesson: nextLessonTitle }, default: 'Continuar → {lesson}' })}
            </a>
          {/if}
        </div>
      </li>
    {/each}
  </ol>
</section>

<style>
  .caminho {
    max-width: 620px;
    margin: 0 auto;
  }

  /* ---- Summary header ---- */
  .summary {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.9rem;
    align-items: start;
    padding: 1.1rem 1.2rem;
    background: var(--card, rgba(255, 255, 255, 0.055));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.11));
    border-radius: var(--radius-xl, 1.25rem);
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(2, 6, 23, 0.18));
  }
  .mascot {
    font-size: 2.6rem;
    line-height: 1;
    animation: mascot-bounce 1.6s ease-in-out infinite alternate;
  }
  @keyframes mascot-bounce {
    from { transform: translateY(0); }
    to { transform: translateY(-6px); }
  }
  .kicker {
    margin: 0;
    color: var(--txt3);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-size: var(--fs-xs, 0.72rem);
    font-weight: 800;
  }
  .summary-meta h1 {
    margin: 0.15rem 0 0.2rem;
    color: var(--txt, #fff);
    font-size: var(--fs-lg, 1.3rem);
  }
  .cheer {
    margin: 0 0 0.6rem;
    color: var(--txt2);
    font-size: var(--fs-sm, 0.88rem);
  }
  .summary-stats {
    display: flex;
    gap: 0.9rem;
    flex-wrap: wrap;
  }
  .stat strong {
    display: block;
    color: var(--txt, #fff);
    font-variant-numeric: tabular-nums;
  }
  .stat small { color: var(--txt3); font-size: var(--fs-xs, 0.72rem); }
  .bar {
    height: 8px;
    margin-top: 0.65rem;
    background: var(--bg-elev, rgba(0, 0, 0, 0.28));
    border-radius: 999px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
    transition: width var(--motion-base, 220ms) ease;
  }

  .all-done {
    margin: 1rem 0 0;
    padding: 0.85rem 1rem;
    text-align: center;
    color: var(--txt, #fff);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    border-radius: var(--radius-lg, 1rem);
  }

  /* ---- Winding path ---- */
  .path {
    list-style: none;
    position: relative;
    margin: 1.6rem 0 0;
    padding: 0.5rem 0 2rem;
    display: grid;
    gap: 1.7rem;
    justify-items: center;
  }
  /* The rope — a soft vertical line behind the nodes. inset-inline so it
     stays centred correctly in RTL. */
  .path::before {
    content: '';
    position: absolute;
    inset-block: 0;
    inset-inline-start: 50%;
    width: 4px;
    margin-inline-start: -2px;
    border-radius: 999px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--accent) 45%, transparent),
      var(--border, rgba(255, 255, 255, 0.14))
    );
    opacity: 0.7;
  }
  .step {
    position: relative;
    z-index: 1;
    display: grid;
    justify-items: center;
    gap: 0.45rem;
    text-align: center;
    /* Alternating winding offset (symmetric, so fine in RTL too). */
    transform: translateX(-40px);
  }
  .step.right { transform: translateX(40px); }

  .node {
    position: relative;
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    min-width: 44px;
    min-height: 44px;
    border-radius: 999px;
    text-decoration: none;
    background: var(--bg-elev, rgba(255, 255, 255, 0.06));
    border: 3px solid var(--border, rgba(255, 255, 255, 0.16));
    box-shadow: var(--shadow-md, 0 10px 30px rgba(2, 6, 23, 0.18));
    transition: transform var(--motion-fast, 120ms) ease;
  }
  .node:hover { transform: translateY(-2px) scale(1.04); }
  .node:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring, 0 0 0 2px var(--accent)), var(--shadow-md, 0 10px 30px rgba(2, 6, 23, 0.18));
  }
  .node-face {
    font-size: 1.8rem;
    line-height: 1;
    color: var(--txt, #fff);
  }
  .node.completed {
    background: var(--unit-color, var(--accent));
    border-color: color-mix(in srgb, var(--unit-color, var(--accent)) 65%, #fff 10%);
  }
  .node.completed .node-face {
    color: var(--on-accent, #fff);
    font-weight: 900;
    font-size: 2rem;
  }
  .node.started {
    border-color: color-mix(in srgb, var(--unit-color, var(--accent)) 70%, transparent);
  }
  .node.current {
    border-color: var(--accent);
    animation: node-pulse 1.8s ease-in-out infinite;
  }
  @keyframes node-pulse {
    0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent); }
    50% { box-shadow: 0 0 0 12px color-mix(in srgb, var(--accent) 0%, transparent); }
  }
  .node.upcoming {
    opacity: 0.55;
    filter: grayscale(0.5);
  }
  .lock {
    position: absolute;
    inset-block-end: -4px;
    inset-inline-end: -4px;
    font-size: 1rem;
    filter: none;
  }

  .node-meta {
    display: grid;
    gap: 0.15rem;
    max-width: 240px;
  }
  .node-title { color: var(--txt, #fff); font-size: var(--fs-sm, 0.9rem); }
  .node-count,
  .node-hint { color: var(--txt3); font-size: var(--fs-xs, 0.74rem); }
  .continue-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 0.35rem;
    min-height: 44px;
    padding: 0.55rem 1rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--on-accent, #fff);
    text-decoration: none;
    font-weight: 800;
    font-size: var(--fs-sm, 0.88rem);
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(2, 6, 23, 0.18));
    transition: transform var(--motion-fast, 120ms) ease;
  }
  .continue-cta:hover { transform: translateY(-1px); }
  .continue-cta:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring, 0 0 0 2px var(--accent)), 0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent);
  }

  @media (max-width: 420px) {
    .step { transform: translateX(-26px); }
    .step.right { transform: translateX(26px); }
    .summary { grid-template-columns: 1fr; }
  }
</style>
