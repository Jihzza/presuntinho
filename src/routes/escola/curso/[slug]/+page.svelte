<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { schoolCourseDetailForSlug, type SchoolCourseDetail, type SchoolCourseLessonDetail } from '$lib/escola/catalog';

  // Course detail. Phase 4 ships with one course (Equivalenza) hardcoded
  // here. When a 2nd course ships, move this into static/courses.json
  // and fetch it; until then the inline catalogue keeps the route simple.

  let courseSlug = $derived(page.params.slug ?? '');
  let course = $derived<SchoolCourseDetail | undefined>(schoolCourseDetailForSlug(courseSlug));
  let loadError = $state<string | null>(null);

  onMount(() => {
    if (!course) loadError = `Curso "${courseSlug}" não encontrado.`;
  });

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
      </p>
    </header>

    <section class="lessons" aria-label="{$t('a11y.aria.licoes_do_curso', { default: 'Lições do curso' })}">
      <h2 class="section-title">{$t('escola.curso.plan.title', { default: 'Plano de aulas' })}</h2>
      <ol class="lesson-list">
        {#each course.lessons as lesson, i (lesson.slug)}
          <li class="lesson-item">
            <a class="lesson-link" href={`/escola/licao/${course.slug}/${lesson.slug}/`}>
              <div class="lesson-num" aria-hidden="true">{i + 1}</div>
              <div class="lesson-meta">
                <h3>{lessonTitle(lesson)}</h3>
                <p>{lessonSummary(lesson)}</p>
                <span class="lesson-time">⏱ ~{lesson.estMinutes} min</span>
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
              </a>
    {/if}
          </li>
        {/each}
      </ol>
    </section>
  </div>
{/if}

<style>
  .course {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .breadcrumb {
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    margin: 0 0 0.5rem;
  }
  .breadcrumb a { color: var(--accent, #ec4899); text-decoration: none; }
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
  .tagline { color: var(--course-color, #ec4899); margin: 0; font-weight: 500; }
  .desc {
    color: var(--txt2, #cbd5e1);
    line-height: 1.5;
    margin: 0 0 0.75rem;
  }
  .meta {
    display: flex;
    gap: 1rem;
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    margin: 0;
  }

  .section-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3, #94a3b8);
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
    background: var(--course-color, #ec4899);
    color: #fff;
    border-radius: 50%;
    font-weight: 700;
    font-size: 0.95rem;
  }
  .lesson-meta { flex: 1; min-width: 0; }
  .lesson-meta h3 { margin: 0 0 0.2rem; font-size: 1rem; color: #fff; }
  .lesson-meta p { margin: 0 0 0.3rem; color: var(--txt2, #cbd5e1); font-size: 0.88rem; }
  .lesson-time { color: var(--txt3, #94a3b8); font-size: 0.78rem; }
  .lesson-cta {
    color: var(--course-color, #ec4899);
    font-size: 1.4rem;
    font-weight: 600;
  }

  .quiz-link {
    display: block;
    padding: 0.55rem 1rem;
    background: rgba(236, 72, 153, 0.08);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    color: #fbcfe8;
    text-decoration: none;
    font-size: 0.85rem;
    transition: background 0.15s;
  }
  .quiz-link:hover { background: rgba(236, 72, 153, 0.16); }

  .loading, .error {
    color: rgba(255, 255, 255, 0.7);
    text-align: center;
    padding: 2rem 0;
  }
  .error { color: #ff8888; }
</style>
