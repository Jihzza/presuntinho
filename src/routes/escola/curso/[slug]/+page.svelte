<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { localizedSchoolCourseDetailForSlug, localizedSchoolCourses, type SchoolCourseDetail, type SchoolCourseLessonDetail } from '$lib/escola/catalog';
  import { quizHistoryMap, visitedLessonsForUnit, type QuizHistory } from '$lib/escola/progress';
  import { ensureAssignmentDefaults, getAssignment, localizedAssignment, type Assignment } from '$lib/trabalhos';
  import Countdown from '$lib/components/Countdown.svelte';

  let courseSlug = $derived(page.params.slug ?? '');
  let course = $derived<SchoolCourseDetail | undefined>(localizedSchoolCourseDetailForSlug($t, courseSlug));
  let parentCourse = $derived(
    localizedSchoolCourses($t).find((item) => item.units.some((unit) => unit.slug === courseSlug))
  );
  let loadError = $state<string | null>(null);
  let visitedLessons = $state<Set<string>>(new Set());
  let quizHistories = $state<Map<string, QuizHistory>>(new Map());
  let linkedAssignments = $state<Assignment[]>([]);

  onMount(() => {
    if (!course) loadError = `Curso "${courseSlug}" não encontrado.`;
  });

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

  function activityLabel(lesson: SchoolCourseLessonDetail): string {
    if (lesson.activityType === 'test') return $t('escola.curso.activity.test', { default: 'Teste' });
    if (lesson.activityType === 'quiz') return $t('escola.curso.activity.exercise', { default: 'Exercício' });
    if (lesson.activityType === 'assignment' || lesson.activityType === 'case') return $t('escola.curso.activity.exercise', { default: 'Exercício' });
    return $t('escola.curso.activity.lesson', { default: 'Aula' });
  }

  let doneCount = $derived(course ? course.lessons.filter((lesson) => visitedLessons.has(lesson.slug)).length : 0);
  let courseTitle = $derived(course ? $t(`routes.escola.curso.${course.slug}.title`, { default: course.title }) : '');
  let courseTagline = $derived(course ? $t(`routes.escola.curso.${course.slug}.tagline`, { default: course.tagline }) : '');
  let courseDescription = $derived(course ? $t(`routes.escola.curso.${course.slug}.description`, { default: course.description }) : '');
  const lessonTitle = (lesson: SchoolCourseLessonDetail) =>
    $t(`routes.escola.curso.${courseSlug}.lessons.${lesson.slug}.title`, { default: lesson.title });
  const lessonSummary = (lesson: SchoolCourseLessonDetail) =>
    $t(`routes.escola.curso.${courseSlug}.lessons.${lesson.slug}.summary`, { default: lesson.summary });
  const lessonQuizTitle = (lesson: SchoolCourseLessonDetail) =>
    $t(`routes.escola.curso.${courseSlug}.lessons.${lesson.slug}.quizTitle`, { default: lesson.quizTitle ?? 'Quiz' });
  let pageTitle = $derived(course ? `${courseTitle} · ${$t('escola.curso.slug.tag', { default: 'Cadeira' })} · Escola` : 'Curso · Escola');
  let description = $derived(courseDescription?.slice(0, 160) || 'Curso e lições');
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
        {#if parentCourse}
          <span class="sep">›</span>
          <a href={parentCourse.href}>{parentCourse.title}</a>
        {/if}
        <span class="sep">›</span>
        <span>{courseTitle}</span>
      </p>
      <div class="title-row">
        <span class="icon" aria-hidden="true">{course.icon}</span>
        <div>
          <span class="tag">{$t('escola.curso.slug.tag', { default: 'Cadeira' })}</span>
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

    <section class="lessons" aria-label={$t('a11y.aria.licoes_do_curso', { default: 'Lições do curso' })}>
      <div class="path-head">
        <span>{$t('escola.curso.path.kicker', { default: 'Caminho da cadeira' })}</span>
        <h2>{$t('escola.curso.plan.title', { default: 'Aulas, exercícios e testes' })}</h2>
        <p>{$t('escola.curso.path.body', { default: 'Segue os passos pela ordem: aula, exercício, teste e revisão.' })}</p>
      </div>
      <ol class="lesson-list">
        {#each course.lessons as lesson, i (lesson.slug)}
          {@const visited = visitedLessons.has(lesson.slug)}
          {@const best = bestLabelFor(lesson.quizSlug)}
          <li class="lesson-item" class:visited>
            <a class="lesson-link" href={`/escola/licao/${course.slug}/${lesson.slug}/`}>
              <div class="lesson-num" class:num-done={visited} aria-hidden="true">{visited ? '✓' : i + 1}</div>
              <div class="lesson-meta">
                <span class="activity-chip">{activityLabel(lesson)}</span>
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
              <a class="quiz-link" href={`/escola/quiz/${lesson.quizSlug}/`} title={lessonQuizTitle(lesson)}>
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
  .course { max-width: 820px; margin: 0 auto; padding: 1.5rem 1rem 8rem; }
  .course-head,
  .lesson-item,
  .assignments { background: var(--card, rgba(255,255,255,.055)); border: 1px solid var(--border, rgba(255,255,255,.1)); border-radius: var(--radius-lg, 1rem); }
  .course-head { padding: 1.15rem; background: radial-gradient(circle at top left, color-mix(in srgb, var(--course-color) 28%, transparent), transparent 42%), var(--card); }
  .breadcrumb { color: var(--txt3); font-size: .85rem; margin: 0 0 .65rem; }
  .breadcrumb a { color: var(--accent); text-decoration: none; }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 .4rem; opacity: .6; }
  .tag,
  .activity-chip { display: inline-flex; width: fit-content; padding: .16rem .6rem; border-radius: 999px; font-size: .72rem; font-weight: 850; text-transform: uppercase; letter-spacing: .05em; }
  .tag { color: #bfdbfe; background: rgba(59,130,246,.25); border: 1px solid rgba(59,130,246,.5); }
  .activity-chip { margin-bottom: .3rem; color: color-mix(in srgb, var(--course-color) 80%, #fff); background: color-mix(in srgb, var(--course-color) 18%, transparent); border: 1px solid color-mix(in srgb, var(--course-color) 38%, transparent); }
  .title-row { display: flex; align-items: center; gap: 1rem; margin-bottom: .75rem; }
  .icon { font-size: 3rem; }
  .course-head h1 { color: #fff; margin: .25rem 0; font-size: clamp(1.8rem, 7vw, 2.7rem); line-height: 1; }
  .tagline { color: var(--course-color, var(--accent)); margin: 0; font-weight: 700; }
  .desc { color: var(--txt2); line-height: 1.55; margin: 0 0 .75rem; }
  .meta { display: flex; flex-wrap: wrap; gap: .65rem; color: var(--txt3); font-size: .85rem; margin: 0; }
  .done-count { color: var(--success, #34d399); }
  .path-head { margin: 1.5rem 0 .85rem; }
  .path-head span { color: #bfdbfe; text-transform: uppercase; letter-spacing: .06em; font-size: .72rem; font-weight: 850; }
  .path-head h2 { margin: .2rem 0; color: var(--txt, #fff); font-size: 1.2rem; }
  .path-head p { margin: 0; color: var(--txt2); }
  .lesson-list { list-style: none; padding: 0; margin: 0; display: grid; gap: .85rem; position: relative; }
  .lesson-list::before { content: ''; position: absolute; left: 1.85rem; top: 1.8rem; bottom: 1.8rem; width: 4px; border-radius: 999px; background: linear-gradient(var(--course-color), transparent); opacity: .55; }
  .lesson-item { position: relative; overflow: hidden; box-shadow: var(--shadow-sm, 0 10px 24px rgba(0,0,0,.18)); }
  .lesson-item.visited { border-color: rgba(16,185,129,.32); }
  .lesson-link { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 1rem; padding: 1rem; color: #fff; text-decoration: none; transition: background .15s, transform .15s; }
  .lesson-link:hover,
  .lesson-link:focus-visible { background: rgba(255,255,255,.06); outline: none; }
  .lesson-num { position: relative; z-index: 1; width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; background: var(--course-color, var(--accent)); color: #fff; border-radius: 50%; font-weight: 900; box-shadow: 0 0 0 6px color-mix(in srgb, var(--course-color) 14%, transparent); }
  .lesson-num.num-done { background: var(--success, #10b981); }
  .lesson-meta { min-width: 0; }
  .lesson-meta h3 { margin: 0 0 .22rem; font-size: 1rem; color: #fff; }
  .lesson-meta p { margin: 0 0 .35rem; color: var(--txt2); font-size: .9rem; line-height: 1.4; }
  .lesson-time { color: var(--txt3); font-size: .78rem; }
  .lesson-done-tag { margin-left: .6rem; color: var(--success, #34d399); font-size: .75rem; font-weight: 800; }
  .lesson-cta { color: var(--course-color, var(--accent)); font-size: 1.45rem; font-weight: 850; }
  .quiz-link { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; min-height: 44px; padding: .62rem 1rem .7rem 4.65rem; background: rgba(236,72,153,.08); border-top: 1px solid var(--border, rgba(255,255,255,.06)); color: #fbcfe8; text-decoration: none; font-size: .85rem; transition: background var(--motion-fast,120ms); }
  .quiz-link:hover,
  .quiz-link:focus-visible { background: rgba(236,72,153,.16); outline: none; }
  .quiz-best { margin-left: auto; padding: .12rem .55rem; border-radius: 999px; background: rgba(16,185,129,.16); border: 1px solid rgba(16,185,129,.35); color: var(--success,#34d399); font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .section-title { font-size: .9rem; text-transform: uppercase; letter-spacing: .05em; color: var(--txt3); margin: 1.7rem 0 .75rem .25rem; font-weight: 800; }
  .assignment-list { list-style: none; margin: 0; padding: 0; display: grid; gap: .55rem; }
  .assignment-link { display: flex; align-items: center; justify-content: space-between; gap: .8rem; flex-wrap: wrap; padding: .85rem 1rem; min-height: 44px; color: var(--txt,#fff); text-decoration: none; background: var(--card,rgba(255,255,255,.04)); border: 1px solid var(--border,rgba(255,255,255,.08)); border-left: 4px solid var(--warning,#f59e0b); border-radius: var(--radius-md,.6rem); }
  .assignment-meta h3 { margin: 0 0 .15rem; font-size: .95rem; color: var(--txt,#fff); }
  .assignment-meta p { margin: 0; color: var(--txt3); font-size: .78rem; }
  .loading,
  .error { color: rgba(255,255,255,.7); text-align: center; padding: 2rem 0; }
  .error { color: var(--error, #ff8888); }
</style>
