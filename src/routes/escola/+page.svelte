<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { localizedMainSchoolCourses, type SchoolCourse } from '$lib/escola/catalog';
  import {
    allCourseProgress,
    resumeTarget,
    schoolSummary,
    type CourseProgress,
    type NextLessonTarget,
    type SchoolSummary
  } from '$lib/escola/progress';

  function courseLessonCount(course: SchoolCourse): number {
    return course.units.reduce((total, unit) => total + unit.lessons.length, 0);
  }

  function courseQuizCount(course: SchoolCourse): number {
    return course.units.reduce(
      (total, unit) => total + unit.lessons.filter((lesson) => Boolean(lesson.quizSlug)).length,
      0
    );
  }

  let courses = $derived(localizedMainSchoolCourses($t));
  let summary = $state<SchoolSummary | null>(null);
  let resume = $state<NextLessonTarget | null>(null);
  let progressByCourse = $state<Map<string, CourseProgress>>(new Map());
  let loaded = $state(false);

  onMount(() => {
    void (async () => {
      try {
        const [s, r, progress] = await Promise.all([
          schoolSummary(),
          resumeTarget(),
          allCourseProgress()
        ]);
        summary = s;
        resume = r;
        progressByCourse = new Map(progress.map((course) => [course.slug, course]));
      } catch (e) {
        console.error('[escola] clean course hub load failed', e);
      } finally {
        loaded = true;
      }
    })();
  });

  let resumeLessonTitle = $derived(
    resume ? $t(`school.catalog.units.${resume.unitSlug}.lessons.${resume.lessonSlug}.title`, { default: resume.lessonTitle }) : ''
  );

  let resumeUnitTitle = $derived(
    resume ? $t(`school.catalog.units.${resume.unitSlug}.title`, { default: resume.unitTitle }) : ''
  );
</script>

<svelte:head>
  <title>{$t('routes.escola.title', { default: 'Escola · Cursos' })} · Presuntinho</title>
  <meta name="description" content={$t('school.clean.seo.description', { default: 'Cursos organizados por cadeiras, aulas, exercícios e testes.' })} />
</svelte:head>

<div class="school-hub">
  <header class="hero">
    <span class="hero-tag">{$t('school.clean.hero.tag', { default: 'Escola' })}</span>
    <h1>{$t('school.clean.hero.title', { default: 'Escolhe um curso' })}</h1>
    <p class="hero-copy">
      {$t('school.clean.hero.body', { default: 'Primeiro escolhes o curso. Dentro dele encontras as cadeiras; dentro de cada cadeira ficam as aulas, exercícios e testes.' })}
    </p>

    <div class="hero-stats" aria-label={$t('school.clean.stats.aria', { default: 'Resumo da escola' })}>
      <span>
        <strong>{loaded && summary ? `${summary.lessonsDone}/${summary.lessonsTotal}` : '…'}</strong>
        <small>{$t('school.stats.lessons', { default: 'Lições feitas' })}</small>
      </span>
      <span>
        <strong>{loaded && summary ? summary.quizzesTaken : '…'}</strong>
        <small>{$t('school.stats.quizzes', { default: 'Quizzes feitos' })}</small>
      </span>
      <span>
        <strong>{courses.length}</strong>
        <small>{$t('school.clean.stats.courses', { default: 'Cursos' })}</small>
      </span>
    </div>
  </header>

  {#if loaded && resume}
    <a class="resume-card" href={resume.href} data-sveltekit-preload-data>
      <span class="resume-icon" aria-hidden="true">{resume.unitIcon}</span>
      <div>
        <p>{$t('school.resume.kicker', { default: 'Continuar onde ficaste' })}</p>
        <h2>{resumeLessonTitle}</h2>
        <small>{resumeUnitTitle}</small>
      </div>
      <strong aria-hidden="true">{$t('school.resume.cta', { default: 'Retomar →' })}</strong>
    </a>
  {/if}

  <section class="courses" aria-label={$t('escola.section.courses.aria', { default: 'Cursos disponíveis' })}>
    <div class="section-head">
      <div>
        <h2>{$t('school.clean.courses.title', { default: 'Cursos disponíveis' })}</h2>
        <p>{$t('school.clean.courses.body', { default: 'A Escola fica simples: curso → cadeiras → aulas, exercícios e testes.' })}</p>
      </div>
    </div>

    <div class="course-grid">
      {#each courses as course (course.slug)}
        {@const progress = progressByCourse.get(course.slug)}
        {@const lessons = courseLessonCount(course)}
        {@const quizzes = courseQuizCount(course)}
        <a class="course-card" href={course.href} style="--course-color: {course.color};" data-sveltekit-preload-data>
          <span class="course-icon" aria-hidden="true">{course.icon}</span>
          <div class="course-body">
            <p class="kicker">{course.tagline}</p>
            <h3>{course.title}</h3>
            <p>{course.summary}</p>
            <div class="course-meta">
              <span>{$t('school.clean.course.subjects', { values: { n: course.units.length }, default: '{n} cadeiras' })}</span>
              <span>{$t('school.clean.course.lessons', { values: { n: lessons }, default: '{n} aulas' })}</span>
              <span>{$t('school.clean.course.quizzes', { values: { n: quizzes }, default: '{n} testes' })}</span>
            </div>
            {#if progress}
              <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress.percent} aria-label={$t('a11y.aria.progresso_do_curso', { default: 'Progresso do curso' })}>
                <span style="width: {progress.percent}%"></span>
              </div>
              <small class="progress-label">{$t('school.clean.course.progress', { values: { done: progress.done, total: progress.total }, default: '{done}/{total} passos concluídos' })}</small>
            {/if}
            <strong>{$t('school.clean.course.open', { default: 'Abrir curso →' })}</strong>
          </div>
        </a>
      {/each}
    </div>
  </section>

</div>

<style>
  .school-hub {
    max-width: 1040px;
    margin: 0 auto;
    padding: 1.25rem 1rem 8rem;
  }

  .hero,
  .resume-card,
  .course-card {
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-xl, 1.25rem);
    background: var(--card, rgba(255, 255, 255, 0.055));
    box-shadow: var(--shadow-sm, 0 10px 28px rgba(0, 0, 0, 0.2));
  }

  .hero {
    padding: 1.25rem;
    background:
      radial-gradient(circle at top left, rgba(59, 130, 246, 0.28), transparent 42%),
      radial-gradient(circle at bottom right, rgba(16, 185, 129, 0.16), transparent 38%),
      var(--card, rgba(255, 255, 255, 0.055));
  }

  .hero-tag,
  .kicker {
    display: inline-block;
    color: #bfdbfe;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-size: 0.72rem;
    font-weight: 850;
  }

  .hero h1 {
    margin: 0.35rem 0;
    color: var(--txt, #fff);
    font-size: clamp(2.15rem, 8vw, 3.8rem);
    line-height: 0.98;
  }

  .hero-copy,
  .section-head p,
  .course-card p {
    color: var(--txt2);
    line-height: 1.55;
    margin: 0;
  }

  .hero-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.55rem;
    margin-top: 1rem;
  }

  .hero-stats span {
    min-width: 0;
    padding: 0.7rem;
    border-radius: 0.95rem;
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .hero-stats strong,
  .hero-stats small { display: block; }
  .hero-stats strong { color: var(--txt, #fff); font-variant-numeric: tabular-nums; }
  .hero-stats small { color: var(--txt3); font-size: 0.72rem; }

  .resume-card {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.9rem;
    margin-top: 1rem;
    padding: 1rem;
    color: var(--txt, #fff);
    text-decoration: none;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.17), rgba(16, 185, 129, 0.09)), var(--card);
  }

  .resume-icon { font-size: 1.9rem; }
  .resume-card p { margin: 0; color: #bfdbfe; font-size: 0.75rem; font-weight: 850; text-transform: uppercase; letter-spacing: 0.06em; }
  .resume-card h2 { margin: 0.15rem 0; font-size: 1rem; color: var(--txt, #fff); }
  .resume-card small { color: var(--txt3); }
  .resume-card strong { color: #bfdbfe; white-space: nowrap; }

  .section-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    margin: 1.45rem 0 0.85rem;
  }

  .section-head h2 {
    margin: 0 0 0.25rem;
    color: var(--txt, #fff);
    font-size: 1.25rem;
  }

  .course-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.95rem;
  }

  .course-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1rem;
    min-height: 174px;
    padding: 1.1rem;
    color: var(--txt, #fff);
    text-decoration: none;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--course-color) 24%, transparent), transparent 52%),
      var(--card, rgba(255, 255, 255, 0.055));
    transition: transform var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease, background var(--motion-fast, 120ms) ease;
  }

  .course-card:hover,
  .course-card:focus-visible {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--course-color) 55%, var(--border));
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--course-color) 30%, transparent), transparent 55%),
      var(--card-hover, rgba(255, 255, 255, 0.085));
    outline: none;
  }

  .course-card:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, var(--course-color) 55%, transparent); }
  .course-icon { font-size: 2.3rem; line-height: 1; }
  .course-body { min-width: 0; }
  .course-card h3 { margin: 0.2rem 0 0.35rem; font-size: 1.35rem; color: var(--txt, #fff); }
  .course-card strong { display: inline-block; margin-top: 0.8rem; color: #bfdbfe; }

  .course-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.8rem;
  }

  .course-meta span,
  .progress-label {
    color: var(--txt3);
    font-size: 0.78rem;
  }

  .course-meta span {
    padding: 0.28rem 0.5rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .progress {
    height: 7px;
    margin-top: 0.75rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.25);
  }

  .progress span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--course-color);
  }

  @media (min-width: 760px) {
    .school-hub { padding-inline: 1.25rem; }
    .course-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .hero { padding: 1.6rem; }
  }
</style>
