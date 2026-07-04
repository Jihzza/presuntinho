<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { localizedSchoolCourseDetailForSlug, type SchoolCourseDetail, type SchoolCourseLessonDetail } from '$lib/escola/catalog';
  import { quizHistoryMap, visitedLessonsForUnit, type QuizHistory } from '$lib/escola/progress';
  import { ensureAssignmentDefaults, getAssignment, localizedAssignment, type Assignment } from '$lib/trabalhos';
  import Countdown from '$lib/components/Countdown.svelte';

  // Course detail. Resolves catalog units first, then the legacy course
  // archive (legacy-course-details.ts) via schoolCourseDetailForSlug.

  let courseSlug = $derived(page.params.slug ?? '');
  let course = $derived<SchoolCourseDetail | undefined>(localizedSchoolCourseDetailForSlug($t, courseSlug));
  let loadError = $state<string | null>(null);

  // V8: real progress joined from Dexie (visited lessons + quiz history +
  // linked trabalhos).  Loaded via the escola progress helper module.
  let visitedLessons = $state<Set<string>>(new Set());
  let quizHistories = $state<Map<string, QuizHistory>>(new Map());
  let linkedAssignments = $state<Assignment[]>([]);

  onMount(() => {
    if (!course) loadError = `Curso "${courseSlug}" não encontrado.`;
  });

  // Re-runs on client-side navigation between course slugs (effects only
  // run in the browser, so Dexie access is safe here).
  $effect(() => {
    const slug = courseSlug;
    const ids = course?.assignments ?? [];
    void (async () => {
      try {
        const [visited, histories] = await Promise.all([
          visitedLessonsForUnit(slug),
          quizHistoryMap()
        ]);
        visitedLessons = visited;
        quizHistories = histories;
        if (ids.length > 0) {
          await ensureAssignmentDefaults().catch(() => undefined);
          const rows = await Promise.all(ids.map((id) => getAssignment(id).catch(() => null)));
          linkedAssignments = rows.filter((row): row is Assignment => row !== null);
        } else {
          linkedAssignments = [];
        }
      } catch (e) {
        console.error('[curso] progress load failed', e);
      }
    })();
  });

  function bestLabelFor(quizSlug: string | undefined): string | null {
    if (!quizSlug) return null;
    const history = quizHistories.get(quizSlug);
    if (!history) return null;
    if (history.total) {
      return $t('escola.curso.quiz.best', {
        values: { best: history.best, total: history.total },
        default: 'Melhor: {best}/{total}'
      });
    }
    return $t('escola.curso.quiz.best_simple', {
      values: { best: history.best },
      default: 'Melhor: {best} certas'
    });
  }

  let doneCount = $derived(
    course ? course.lessons.filter((lesson) => visitedLessons.has(lesson.slug)).length : 0
  );

  // SEO — used by <svelte:head> below.  The catalogue is hardcoded so
  // the title is stable per slug; falls back to a generic literal
  // until the catalogue loads.
  // i18n: wrap catalogue literals in $t() with PT fallback so that future
    // locales can override them via routes.escola.curso.<slug>.{title,description,tagline}
    // without touching the CATALOGUE constant.
    let courseTitle = $derived(
      course ? $t(`routes.escola.curso.${course.slug}.title`, { default: course.title }) : ''
    );
    let courseTagline = $derived(
      course ? $t(`routes.escola.curso.${course.slug}.tagline`, { default: course.tagline }) : ''
    );
    let courseDescription = $derived(
      course ? $t(`routes.escola.curso.${course.slug}.description`, { default: course.description }) : ''
    );

    const lessonTitle = (lesson: SchoolCourseLessonDetail) =>
      $t(`routes.escola.curso.${courseSlug}.lessons.${lesson.slug}.title`, { default: lesson.title });

    const lessonSummary = (lesson: SchoolCourseLessonDetail) =>
      $t(`routes.escola.curso.${courseSlug}.lessons.${lesson.slug}.summary`, { default: lesson.summary });

    const lessonQuizTitle = (lesson: SchoolCourseLessonDetail) =>
      $t(`routes.escola.curso.${courseSlug}.lessons.${lesson.slug}.quizTitle`, {
        default: lesson.quizTitle ?? 'Quiz'
      });

    let pageTitle = $derived(
      course ? `${courseTitle} · Curso · Escola` : 'Curso · Escola'
    );
    let description = $derived(
      courseDescription?.slice(0, 160) || 'Curso e lições'
    );
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content="https://presuntinho.netlify.app/escola/curso/" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={description} />
</svelte:head>

{#if loadError}
  <div class="course">
    <p class="error">{loadError}</p>
    <p><a href="/escola/">{$t('escola.curso.back_to_school', { default: '← Voltar à Escola' })}</a></p>
  </div>
{:else if !course}
  <p class="loading">{$t('escola.curso.loading', { default: 'A carregar curso…' })}</p>
{:else}
  <div class="course" style="--course-color: {course.color};">
    <header class="course-head">
      <p class="breadcrumb">
        <a href="/escola/">{$t('lesson.breadcrumb.escola', { default: 'Escola' })}</a>
        <span class="sep">›</span>
        <span>{courseTitle}</span>
      </p>
      <div class="title-row">
        <span class="icon" aria-hidden="true">{course.icon}</span>
        <div>
          <span class="tag">{$t('escola.curso.slug.tag', { default: 'Curso' })}</span>
          <h1>{courseTitle}</h1>
                    <p class="tagline">{courseTagline}</p>
                  </div>
                </div>
                <p class="desc">{courseDescription}</p>
      <p class="meta">
        <span>📚 {course.lessons.length} {$t('escola.curso.lessonsCount', { default: 'lições' })}</span>
                <span>⏱ ~{course.lessons.reduce((a, l) => a + l.estMinutes, 0)} {$t('escola.curso.minutesTotal', { default: 'min no total' })}</span>
        {#if doneCount > 0}
          <span class="done-count">✅ {$t('escola.curso.done_count', { values: { done: doneCount, total: course.lessons.length }, default: '{done}/{total} abertas' })}</span>
        {/if}
      </p>
    </header>

    <section class="lessons" aria-label="{$t('a11y.aria.licoes_do_curso', { default: 'Lições do curso' })}">
      <h2 class="section-title">{$t('escola.curso.plan.title', { default: 'Plano de aulas' })}</h2>
      <ol class="lesson-list">
        {#each course.lessons as lesson, i (lesson.slug)}
          {@const visited = visitedLessons.has(lesson.slug)}
          {@const best = bestLabelFor(lesson.quizSlug)}
          <li class="lesson-item" class:visited>
            <a class="lesson-link" href={`/escola/licao/${course.slug}/${lesson.slug}/`}>
              <div class="lesson-num" class:num-done={visited} aria-hidden="true">{visited ? '✓' : i + 1}</div>
              <div class="lesson-meta">
                <h3>{lessonTitle(lesson)}</h3>
                <p>{lessonSummary(lesson)}</p>
                <span class="lesson-time">⏱ ~{lesson.estMinutes} min</span>
                {#if visited}
                  <span class="lesson-done-tag">{$t('escola.curso.lesson_done', { default: 'aberta ✓' })}</span>
                {/if}
              </div>
              <span class="lesson-cta" aria-hidden="true">→</span>
            </a>
    {#if lesson.quizSlug}
              <a
                class="quiz-link"
                href={`/escola/quiz/${lesson.quizSlug}/`}
                title={lessonQuizTitle(lesson)}
              >
                📝 {lessonQuizTitle(lesson)}
                {#if best}
                  <span class="quiz-best">{best}</span>
                {/if}
              </a>
    {/if}
          </li>
        {/each}
      </ol>
    </section>

    {#if linkedAssignments.length > 0}
      <section class="assignments" aria-label={$t('escola.curso.assignments.aria', { default: 'Trabalhos desta cadeira' })}>
        <h2 class="section-title">{$t('escola.curso.assignments.title', { default: 'Trabalhos ligados' })}</h2>
        <ul class="assignment-list">
          {#each linkedAssignments as row (row.id)}
            {@const a = localizedAssignment($t, row)}
            <li>
              <a class="assignment-link" href={`/trabalhos/assignment/${a.id}/`}>
                <div class="assignment-meta">
                  <h3>📝 {a.title}</h3>
                  {#if a.cadeira}<p>{a.cadeira}</p>{/if}
                </div>
                <Countdown deadline={new Date(a.deadline).toISOString()} />
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
{/if}

<style>
  .course {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .breadcrumb {
    color: var(--txt3);
    font-size: 0.85rem;
    margin: 0 0 0.5rem;
  }
  .breadcrumb a { color: var(--accent); text-decoration: none; }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }

  .tag {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    background: rgba(59, 130, 246, 0.25);
    border: 1px solid rgba(59, 130, 246, 0.5);
    color: #bfdbfe;
    border-radius: 999px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  .icon { font-size: 3rem; }
  .course-head h1 { color: #fff; margin: 0.25rem 0; font-size: 1.75rem; }
  .tagline { color: var(--course-color, var(--accent)); margin: 0; font-weight: 500; }
  .desc {
    color: var(--txt2);
    line-height: 1.5;
    margin: 0 0 0.75rem;
  }
  .meta {
    display: flex;
    gap: 1rem;
    color: var(--txt3);
    font-size: 0.85rem;
    margin: 0;
  }

  .section-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3);
    margin: 2rem 0 0.75rem 0.25rem;
    font-weight: 600;
  }

  .lesson-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }
  .lesson-item {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.6rem;
    overflow: hidden;
  }
  .lesson-link {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.9rem 1rem;
    color: #fff;
    text-decoration: none;
    transition: background 0.15s;
  }
  .lesson-link:hover, .lesson-link:focus-visible {
    background: rgba(255, 255, 255, 0.06);
    outline: none;
  }
  .lesson-num {
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--course-color, var(--accent));
    color: #fff;
    border-radius: 50%;
    font-weight: 700;
    font-size: 0.95rem;
  }
  .lesson-meta { flex: 1; min-width: 0; }
  .lesson-meta h3 { margin: 0 0 0.2rem; font-size: 1rem; color: #fff; }
  .lesson-meta p { margin: 0 0 0.3rem; color: var(--txt2); font-size: 0.88rem; }
  .lesson-time { color: var(--txt3); font-size: 0.78rem; }
  .lesson-cta {
    color: var(--course-color, var(--accent));
    font-size: 1.4rem;
    font-weight: 600;
  }

  .quiz-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    min-height: 44px;
    padding: 0.55rem 1rem;
    background: rgba(236, 72, 153, 0.08);
    border-top: 1px solid var(--border, rgba(255, 255, 255, 0.06));
    color: #fbcfe8;
    text-decoration: none;
    font-size: 0.85rem;
    transition: background var(--motion-fast, 120ms);
  }
  .quiz-link:hover,
  .quiz-link:focus-visible { background: rgba(236, 72, 153, 0.16); outline: none; }
  .quiz-link:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .quiz-best {
    margin-left: auto;
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    background: rgba(16, 185, 129, 0.16);
    border: 1px solid rgba(16, 185, 129, 0.35);
    color: var(--success, #34d399);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .lesson-item.visited { border-color: rgba(16, 185, 129, 0.28); }
  .lesson-num.num-done { background: var(--success, #10b981); }
  .lesson-done-tag {
    margin-left: 0.6rem;
    color: var(--success, #34d399);
    font-size: 0.75rem;
    font-weight: 700;
  }
  .done-count { color: var(--success, #34d399); }

  .assignment-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.55rem;
  }
  .assignment-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    flex-wrap: wrap;
    padding: 0.85rem 1rem;
    min-height: 44px;
    color: var(--txt, #fff);
    text-decoration: none;
    background: var(--card, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-left: 4px solid var(--warning, #f59e0b);
    border-radius: var(--radius-md, 0.6rem);
    transition: background var(--motion-fast, 120ms);
  }
  .assignment-link:hover,
  .assignment-link:focus-visible { background: var(--card-hover, rgba(255, 255, 255, 0.07)); outline: none; }
  .assignment-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .assignment-meta h3 { margin: 0 0 0.15rem; font-size: 0.95rem; color: var(--txt, #fff); }
  .assignment-meta p { margin: 0; color: var(--txt3); font-size: 0.78rem; }

  .loading, .error {
    color: rgba(255, 255, 255, 0.7);
    text-align: center;
    padding: 2rem 0;
  }
  .error { color: var(--error, #ff8888); }
</style>
