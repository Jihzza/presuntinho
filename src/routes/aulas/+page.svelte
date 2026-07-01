<script lang="ts">
  // /aulas — standalone aggregator route.
  //
  // Surfaces every lesson shipped under /static/lessons/<course>/*.json
  // in a single timeline grouped by course. Reuses the existing lesson
  // viewer at /escola/licao/[courseSlug]/[lessonSlug] — no content is
  // duplicated. Course meta (icon / colour / title) mirrors the hub
  // page so the visual identity is consistent across Escola / Aulas.

  import { t } from 'svelte-i18n';

  interface LessonMeta {
    id: string;
    courseSlug: string;
    title: string;
    description: string;
    audio: string;
    audioLabel: string;
    order: number;
  }
  interface CourseMeta {
    slug: string;
    title: string;
    icon: string;
    color: string;
  }
  interface CourseBucket {
    meta: CourseMeta;
    lessons: LessonMeta[];
  }

  let { data }: { data: { courses: CourseBucket[] } } = $props();

  // Flat total for the hero subtitle.
  let totalLessons = $derived(
    data.courses.reduce((acc, c) => acc + c.lessons.length, 0)
  );
  let totalCourses = $derived(data.courses.length);

  /** Build the lesson-viewer href for a given course/lesson. */
  function lessonHref(courseSlug: string, lessonId: string): string {
    return `/escola/licao/${courseSlug}/${lessonId}/`;
  }

  /** Pick a description from $t for the audio badge, defaulting inline. */
  function audioBadgeText(lesson: LessonMeta): string {
    if (lesson.audioLabel && lesson.audioLabel.length > 0) return lesson.audioLabel;
    return lesson.audio ? '🎧 ' + lesson.audio : '';
  }
</script>

<svelte:head>
  <title>{$t('aulas.title', { default: 'Aulas · Todas as lições' })} · Presuntinho</title>
  <meta
    name="description"
    content={$t('aulas.subtitle', {
      default: 'Todas as lições dos cursos BA num único sítio.'
    })}
  />
</svelte:head>

<div class="aulas">
  <header class="hero">
    <span class="hero-tag">{$t('aulas.title', { default: '🎓 Aulas' })}</span>
    <h1>{$t('aulas.title', { default: 'Todas as aulas' })}</h1>
    <p class="sub">
      {$t('aulas.subtitle')
              .replace('{lessons}', String(totalLessons))
              .replace('{courses}', String(totalCourses))}
    </p>
  </header>

  {#if data.courses.length === 0 || totalLessons === 0}
    <div class="empty" role="status">
      <span class="empty-icon" aria-hidden="true">📭</span>
      <p>{$t('aulas.empty', { default: 'Ainda não há aulas disponíveis. Volta mais tarde.' })}</p>
    </div>
  {:else}
    {#each data.courses as course (course.meta.slug)}
      <section
        class="course"
        aria-label={course.meta.title}
        style="--course-color: {course.meta.color};"
      >
        <header class="course-head">
          <span class="course-icon" aria-hidden="true">{course.meta.icon}</span>
          <div class="course-meta">
            <h2>{course.meta.title}</h2>
            <span class="course-count">
              {$t('escola.card.lessons', { default: '📚 {n} lições' }).replace('{n}', String(course.lessons.length))}
            </span>
          </div>
          <a class="course-link" href={`/escola/curso/${course.meta.slug}/`}>
            {$t('escola.card.open', { default: 'Abrir curso →' })}
          </a>
        </header>

        <div class="grid">
          {#each course.lessons as lesson (lesson.id)}
            <a
              class="card"
              href={lessonHref(course.meta.slug, lesson.id.split('/').pop() ?? '')}
            >
              <div class="card-head">
                <span class="card-num" aria-hidden="true">#{lesson.order + 1}</span>
                {#if lesson.audio}
                  <span class="audio-pill" title={lesson.audioLabel || lesson.audio}>
                    🎧
                  </span>
                {/if}
              </div>
              <h3>{lesson.title}</h3>
              {#if lesson.description}
                <p class="desc">{lesson.description}</p>
              {:else}
                <p class="desc muted">—</p>
              {/if}
              <div class="card-foot">
                <span class="course-tag">
                  {course.meta.icon} {course.meta.title}
                </span>
                <span class="open">{$t('aulas.open', { default: 'Ir para lição →' })}</span>
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/each}
  {/if}
</div>

<style>
  .aulas {
    max-width: 960px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .hero {
    text-align: center;
    margin-bottom: 1.75rem;
  }
  .hero-tag {
    display: inline-block;
    padding: 0.2rem 0.7rem;
    background: rgba(59, 130, 246, 0.2);
    border: 1px solid rgba(59, 130, 246, 0.4);
    color: #bfdbfe;
    border-radius: 999px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.75rem;
  }
  .hero h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem;
    color: #fff;
  }
  .sub {
    color: var(--txt2, #cbd5e1);
    margin: 0;
    font-size: 1rem;
  }

  .empty {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--txt2, #cbd5e1);
    background: rgba(255, 255, 255, 0.04);
    border: 1px dashed rgba(255, 255, 255, 0.15);
    border-radius: 0.75rem;
  }
  .empty-icon {
    display: block;
    font-size: 2.5rem;
    margin-bottom: 0.75rem;
  }

  .course {
    margin-bottom: 2rem;
    padding: 1rem 0 0.25rem;
  }
  .course-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    padding: 0 0.25rem;
  }
  .course-icon {
    font-size: 1.75rem;
    line-height: 1;
  }
  .course-meta {
    flex: 1;
    min-width: 0;
  }
  .course-meta h2 {
    margin: 0;
    color: #fff;
    font-size: 1.1rem;
    line-height: 1.2;
  }
  .course-count {
    color: var(--course-color, #ec4899);
    font-size: 0.85rem;
    font-weight: 500;
  }
  .course-link {
    color: var(--course-color, #ec4899);
    text-decoration: none;
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    border-radius: 4px;
    padding: 2px 4px;
  }
  .course-link:hover,
  .course-link:focus-visible {
    text-decoration: underline;
    outline: none;
  }
  .course-link:focus-visible {
    box-shadow: 0 0 0 2px var(--course-color, #ec4899);
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem;
  }

  .card {
    display: block;
    padding: 1rem 1.1rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-left: 3px solid var(--course-color, #ec4899);
    border-radius: 0.625rem;
    color: #fff;
    text-decoration: none;
    transition: background 0.15s, transform 0.15s;
  }
  .card:hover,
  .card:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
    outline: none;
  }
  .card:focus-visible {
    box-shadow: 0 0 0 2px var(--course-color, #ec4899);
  }

  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }
  .card-num {
    color: var(--txt3, #94a3b8);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.05em;
  }
  .audio-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    font-size: 0.85rem;
    line-height: 1;
  }
  .card h3 {
    margin: 0 0 0.35rem;
    color: #fff;
    font-size: 1rem;
    line-height: 1.3;
  }
  .desc {
    color: var(--txt2, #cbd5e1);
    margin: 0 0 0.75rem;
    font-size: 0.85rem;
    line-height: 1.45;
  }
  .desc.muted {
    color: var(--txt3, #94a3b8);
  }
  .card-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    color: var(--txt3, #94a3b8);
    font-size: 0.78rem;
  }
  .course-tag {
    color: var(--course-color, #ec4899);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 60%;
  }
  .open {
    color: var(--course-color, #ec4899);
    font-weight: 600;
    white-space: nowrap;
  }

  @media (min-width: 600px) {
    .grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  }
  @media (min-width: 900px) {
    .grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr); }
  }
  @media (prefers-reduced-motion: reduce) {
    .card,
    .card:hover,
    .card:focus-visible {
      transition: none;
      transform: none;
    }
  }
</style>
