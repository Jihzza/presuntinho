<script lang="ts">
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { localizedBusinessAdministration, localizedBusinessCustomLessons, localizedBusinessSubjects, localizedMainSchoolCourses } from '$lib/escola/catalog';
  import {
    allCourseProgress,
    legacyCourseDirectory,
    resumeTarget,
    schoolSummary,
    upcomingAssignments,
    type NextLessonTarget,
    type SchoolSummary,
    type UnitProgress
  } from '$lib/escola/progress';
  import { ensureAssignmentDefaults, localizedAssignment, type Assignment } from '$lib/trabalhos';
  import Countdown from '$lib/components/Countdown.svelte';

  function lessonCount(unit: { lessons: unknown[] }) { return unit.lessons.length; }
  function quizCount(unit: { lessons: Array<{ quizSlug?: string }> }) { return unit.lessons.filter((lesson) => Boolean(lesson.quizSlug)).length; }

  let mainSchoolCourses = $derived(localizedMainSchoolCourses($t));
  let businessAdministration = $derived(localizedBusinessAdministration($t));
  let businessSubjects = $derived(localizedBusinessSubjects($t));
  let businessCustomLessons = $derived(localizedBusinessCustomLessons($t));

  // ----- Real academic data (V8) — replaces the old fake hero numbers -----
  let summary = $state<SchoolSummary | null>(null);
  let resume = $state<NextLessonTarget | null>(null);
  let unitStats = $state<Map<string, UnitProgress>>(new Map());
  let deadlines = $state<Assignment[]>([]);
  let statsLoaded = $state(false);

  onMount(() => {
    void (async () => {
      try {
        await ensureAssignmentDefaults().catch(() => undefined);
        const [s, r, courses, upcoming] = await Promise.all([
          schoolSummary(),
          resumeTarget(),
          allCourseProgress(),
          upcomingAssignments(3)
        ]);
        summary = s;
        resume = r;
        const map = new Map<string, UnitProgress>();
        for (const course of courses) {
          for (const unit of course.units) map.set(unit.slug, unit);
        }
        unitStats = map;
        deadlines = upcoming;
      } catch (e) {
        console.error('[escola] stats load failed', e);
      } finally {
        statsLoaded = true;
      }
    })();
  });

  const legacyCourses = legacyCourseDirectory();
  let legacySearch = $state('');
  let legacyVisible = $derived.by(() => {
    const term = legacySearch.trim().toLowerCase();
    const localized = legacyCourses.map((entry) => ({
      ...entry,
      title: $t(`school.catalog.legacy.${entry.slug}.title`, { default: entry.title })
    }));
    if (!term) return localized;
    return localized.filter(
      (entry) => entry.title.toLowerCase().includes(term) || entry.slug.includes(term)
    );
  });

  let resumeLessonTitle = $derived(
    resume ? $t(`school.catalog.units.${resume.unitSlug}.lessons.${resume.lessonSlug}.title`, { default: resume.lessonTitle }) : ''
  );
  let resumeUnitTitle = $derived(
    resume ? $t(`school.catalog.units.${resume.unitSlug}.title`, { default: resume.unitTitle }) : ''
  );

  function statValue(value: number | undefined): string {
    return statsLoaded && value !== undefined ? String(value) : '…';
  }
</script>

<svelte:head>
  <title>{$t('routes.escola.title', { default: 'Escola · Cursos' })} · Presuntinho</title>
  <meta name="description" content={$t('school.seo.description', { default: 'Cursos, cadeiras, aulas, trabalhos e materiais da Fatma' })} />
</svelte:head>

<div class="escola">
  <header class="hero">
    <span class="hero-tag">{$t('school.hero.tag')}</span>
    <h1>{$t('school.hero.title')}</h1>
    <p class="sub">{$t('school.hero.subtitle')}</p>
    <div class="school-loop" aria-label={$t('school.loop.aria')}>
      <span>
        <strong>📖 {statsLoaded && summary ? `${summary.lessonsDone}/${summary.lessonsTotal}` : '…'}</strong>
        <small>{$t('school.stats.lessons', { default: 'Lições feitas' })}</small>
      </span>
      <span>
        <strong>📝 {statValue(summary?.quizzesTaken)}</strong>
        <small>{$t('school.stats.quizzes', { default: 'Quizzes feitos' })}</small>
      </span>
      <span>
        <strong>🏆 {statValue(summary?.quizzesPerfect)}</strong>
        <small>{$t('school.loop.streak')}</small>
      </span>
    </div>
  </header>

  {#if statsLoaded}
    {#if resume}
      <a class="resume-card" href={resume.href}>
        <span class="resume-icon" aria-hidden="true">{resume.unitIcon}</span>
        <div class="resume-meta">
          <p class="kicker">{$t('school.resume.kicker', { default: 'Continuar onde ficaste' })}</p>
          <h2>{resumeLessonTitle}</h2>
          <p class="resume-unit">{resumeUnitTitle}</p>
        </div>
        <strong class="resume-cta" aria-hidden="true">{$t('school.resume.cta', { default: 'Retomar →' })}</strong>
      </a>
    {:else}
      <p class="resume-done">{$t('school.resume.all_done', { default: 'Já abriste todas as lições do catálogo — orgulho total! 🎉' })}</p>
    {/if}
  {/if}

  <section class="lesson-path" aria-label={$t('school.path.aria')}>
    <div class="path-node active"><span>1</span><strong>{$t('school.path.choose.title')}</strong><small>{$t('school.path.choose.body')}</small></div>
    <div class="path-line" aria-hidden="true"></div>
    <div class="path-node"><span>2</span><strong>{$t('school.path.lesson.title')}</strong><small>{$t('school.path.lesson.body')}</small></div>
    <div class="path-line" aria-hidden="true"></div>
    <div class="path-node reward"><span>🏆</span><strong>{$t('school.path.reward.title')}</strong><small>{$t('school.path.reward.body')}</small></div>
  </section>

  <section class="main-courses" aria-label={$t('escola.section.courses.aria')}>
    <h2 class="section-title">{$t('school.main.title')}</h2>
    <div class="course-grid">
      {#each mainSchoolCourses as course (course.slug)}
      <div class="course-wrap">
        <a class="course-card" class:business={course.slug === 'business-administration'} class:portuguese={course.slug === 'portugues'} href={course.href}>
          <span class="course-icon">{course.icon}</span>
          <div>
            <p class="kicker">{course.tagline}</p>
            <h3>{course.title}</h3>
            <p>{course.summary}</p>
            <strong>{course.units.length} {course.slug === 'business-administration' ? $t('school.course.subjects') : $t('school.course.module')} →</strong>
          </div>
        </a>
        <a class="caminho-link" href={`/escola/caminho/${course.slug}/`}>
          {$t('school.course.caminho', { default: '🗺️ Ver caminho' })}
        </a>
      </div>
      {/each}
    </div>
  </section>

  <section id="business-administration" class="business-section" aria-label={$t('escola.section.business.aria')}>
    <div class="section-head">
      <div>
        <h2>{businessAdministration.title}</h2>
        <p>{$t('school.business.body')}</p>
      </div>
      <span>{$t('school.business.subject_count', { values: { count: businessSubjects.length } })}</span>
    </div>
    <div class="subject-grid">
      {#each businessSubjects as subject (subject.slug)}
        {@const stat = unitStats.get(subject.slug)}
        <a class="subject-card" href={`/escola/curso/${subject.slug}/`}>
          <span class="subject-icon">{subject.icon}</span>
          <div>
            <h3>{subject.title}</h3>
            <p>{subject.summary}</p>
            <small>{$t('school.subject.meta', { values: { lessons: lessonCount(subject), quizzes: quizCount(subject) } })}</small>
            {#if stat}
              <div
                class="subject-progress"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={stat.percent}
                aria-label={$t('school.subject.progress_aria', { values: { done: stat.done, total: stat.total }, default: 'Progresso: {done} de {total} lições' })}
              >
                <div class="subject-progress-bar" style="width: {stat.percent}%"></div>
              </div>
              <small class="subject-progress-label">{stat.done}/{stat.total}</small>
            {/if}
          </div>
        </a>
      {/each}
    </div>
  </section>

  <section class="deadlines-section" aria-label={$t('school.deadlines.aria', { default: 'Próximas entregas' })}>
    <div class="section-head">
      <div>
        <h2>{$t('school.deadlines.title', { default: 'Próximas entregas' })}</h2>
        <p>{$t('school.deadlines.body', { default: 'Trabalhos com prazo mais próximo — um de cada vez, sem stress.' })}</p>
      </div>
      <a class="see-all" href="/trabalhos/">{$t('school.deadlines.all', { default: 'Ver todos →' })}</a>
    </div>
    {#if !statsLoaded}
      <Skeleton variant="list" lines={3} label={$t('common.loading', { default: 'A carregar…' })} />
    {:else if deadlines.length === 0}
      <p class="deadlines-empty">{$t('school.deadlines.empty', { default: 'Sem entregas pendentes. Respira fundo. 🌿' })}</p>
    {:else}
      <ul class="deadline-list">
        {#each deadlines as row (row.id)}
          {@const a = localizedAssignment($t, row)}
          <li>
            <a class="deadline-card" href={`/trabalhos/assignment/${a.id}/`}>
              <div class="deadline-meta">
                <h3>{a.title}</h3>
                {#if a.cadeira}<p>{a.cadeira}</p>{/if}
              </div>
              <Countdown deadline={new Date(a.deadline).toISOString()} />
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="extras-section" aria-label={$t('escola.section.tools.aria')}>
    <div class="section-head">
      <div>
        <h2>{$t('school.extras.title')}</h2>
        <p>{$t('school.extras.body')}</p>
      </div>
    </div>
    <div class="tool-grid">
      {#each businessCustomLessons as extra (extra.slug)}
      <a class="tool-card" href={`/escola/curso/${extra.slug}/`} style="--accent: {extra.color};">
        <span>{extra.icon}</span>
        <div>
          <h3>{extra.title}</h3>
          <p>{extra.summary}</p>
        </div>
      </a>
      {/each}
      <a class="tool-card" href="/escola/trabalhos/" style="--accent: #f59e0b;">
        <span>📝</span>
        <div>
          <h3>{$t('school.assignments.title')}</h3>
          <p>{$t('school.assignments.body')}</p>
        </div>
      </a>
      <a class="tool-card" href="/biblioteca/" style="--accent: #8b5cf6;">
        <span>📚</span>
        <div>
          <h3>{$t('school.library.title')}</h3>
          <p>{$t('school.library.body')}</p>
        </div>
      </a>
      <a class="tool-card" href="/escola/caderno/" style="--accent: #10b981;">
        <span>📓</span>
        <div>
          <h3>{$t('school.notebook.title')}</h3>
          <p>{$t('school.notebook.body')}</p>
        </div>
      </a>
      <a class="tool-card" href="/mascotes/" style="--accent: #ec4899;">
        <span>🎭</span>
        <div>
          <h3>{$t('school.mascots.title', { default: 'Mascotes' })}</h3>
          <p>{$t('school.mascots.body', { default: 'Escolhe a tua companheira de estudos e desbloqueia novas com XP.' })}</p>
        </div>
      </a>
    </div>
  </section>

  <section class="legacy-section" aria-label={$t('school.legacy.aria', { default: 'Arquivo de cursos' })}>
    <div class="section-head">
      <div>
        <h2>{$t('school.legacy.title', { default: '🗂️ Arquivo de cursos' })}</h2>
        <p>{$t('school.legacy.body', { values: { n: legacyCourses.length }, default: 'Mais {n} cursos com centenas de lições prontas a explorar.' })}</p>
      </div>
    </div>
    <input
      type="search"
      class="legacy-search"
      placeholder={$t('school.legacy.search', { default: '🔍 Procurar curso…' })}
      aria-label={$t('school.legacy.search_aria', { default: 'Procurar no arquivo de cursos' })}
      bind:value={legacySearch}
    />
    {#if legacyVisible.length === 0}
      <p class="deadlines-empty">{$t('school.legacy.empty', { default: 'Nenhum curso corresponde à pesquisa.' })}</p>
    {:else}
      <ul class="legacy-grid">
        {#each legacyVisible as entry (entry.slug)}
          <li>
            <a class="legacy-card" href={entry.href} style="--course-color: {entry.color};">
              <span class="legacy-icon" aria-hidden="true">{entry.icon}</span>
              <div>
                <h3>{entry.title}</h3>
                <small>{$t('school.legacy.meta', { values: { lessons: entry.lessonCount, quizzes: entry.quizCount }, default: '{lessons} lições · {quizzes} quizzes' })}</small>
              </div>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .escola {
    max-width: 1040px;
    margin: 0 auto;
    padding: 1.25rem 1rem 8rem;
  }
  .hero {
    text-align: left;
    padding: 1.25rem;
    margin-bottom: 1.25rem;
    border-radius: var(--radius-xl, 1.25rem);
    color: var(--txt, #fff);
    background: radial-gradient(circle at top left, rgba(59, 130, 246, 0.28), transparent 38%), var(--card, rgba(255, 255, 255, 0.055));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.11));
  }
  .hero-tag,
  .kicker {
    display: inline-block;
    color: #bfdbfe;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-size: 0.72rem;
    font-weight: 800;
  }
  .hero h1 { margin: 0.35rem 0; font-size: clamp(2rem, 7vw, 3.2rem); line-height: 1; }
  .sub,
  .section-head p,
  .course-card p,
  .subject-card p,
  .tool-card p { color: var(--txt2); line-height: 1.5; margin: 0; }
  section { margin-top: 1.4rem; }
  .section-title,
  .section-head h2 { color: var(--txt, #fff); margin: 0 0 0.75rem; }
  .section-title { font-size: 1rem; }
  .section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.85rem;
  }
  .section-head h2 { margin-bottom: 0.2rem; }
  .section-head span {
    flex: 0 0 auto;
    padding: 0.35rem 0.65rem;
    color: #bfdbfe;
    background: rgba(59, 130, 246, 0.16);
    border: 1px solid rgba(59, 130, 246, 0.28);
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 800;
  }
  .course-grid,
  .subject-grid,
  .tool-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.9rem;
  }
  .course-card,
  .subject-card,
  .tool-card {
    color: var(--txt, #fff);
    text-decoration: none;
    background: var(--card, rgba(255, 255, 255, 0.055));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 1rem);
    transition: transform var(--motion-fast, 120ms) ease, background var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease;
  }
  .course-card:hover,
  .course-card:focus-visible,
  .subject-card:hover,
  .subject-card:focus-visible,
  .tool-card:hover,
  .tool-card:focus-visible {
    transform: translateY(-1px);
    background: var(--card-hover, rgba(255, 255, 255, 0.085));
    border-color: rgba(255, 255, 255, 0.18);
    outline: none;
  }
  .course-card:focus-visible,
  .subject-card:focus-visible,
  .tool-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .course-wrap {
    display: grid;
    gap: 0.45rem;
    align-content: start;
  }
  .course-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1rem;
    padding: 1.2rem;
    min-height: 172px;
  }
  .caminho-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-height: 44px;
    padding: 0.5rem 0.9rem;
    color: var(--txt2);
    text-decoration: none;
    font-weight: 700;
    font-size: 0.85rem;
    background: var(--bg-elev, rgba(255, 255, 255, 0.04));
    border: 1px dashed var(--border, rgba(255, 255, 255, 0.16));
    border-radius: var(--radius-md, 0.7rem);
    transition: color var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease;
  }
  .caminho-link:hover,
  .caminho-link:focus-visible {
    color: var(--accent);
    border-color: var(--accent);
    outline: none;
  }
  .caminho-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .course-card.business { background: linear-gradient(135deg, rgba(59,130,246,0.18), rgba(236,72,153,0.11)); }
  .course-card.portuguese { background: linear-gradient(135deg, rgba(16,185,129,0.17), rgba(59,130,246,0.09)); }
  .course-icon { font-size: 2.1rem; }
  .course-card h3 { margin: 0.2rem 0 0.35rem; font-size: 1.3rem; }
  .course-card strong { display: inline-block; margin-top: 0.75rem; color: #bfdbfe; }
  .subject-card,
  .tool-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.85rem;
    align-items: start;
    padding: 1rem;
  }
  .subject-icon,
  .tool-card > span { font-size: 1.55rem; }
  .subject-card h3,
  .tool-card h3 { margin: 0 0 0.25rem; font-size: 1rem; }
  .subject-card small { display: inline-block; margin-top: 0.55rem; color: var(--txt3); }
  .subject-progress {
    height: 6px;
    margin-top: 0.5rem;
    background: rgba(0, 0, 0, 0.28);
    border-radius: 999px;
    overflow: hidden;
  }
  .subject-progress-bar {
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
    transition: width var(--motion-base, 220ms) ease;
  }
  .subject-progress-label { margin-top: 0.25rem !important; font-variant-numeric: tabular-nums; }
  .tool-card { border-left: 4px solid var(--accent, #8b5cf6); }
  .school-loop {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: .55rem;
    margin-top: 1rem;
  }
  .school-loop span {
    padding: .65rem;
    border-radius: .9rem;
    background: rgba(0,0,0,.18);
    border: 1px solid var(--border, rgba(255,255,255,.1));
  }
  .school-loop strong,
  .school-loop small { display: block; }
  .school-loop strong { font-variant-numeric: tabular-nums; }
  .school-loop small { color: var(--txt2); font-size: .72rem; }

  /* Resume ("continue where you left off") */
  .resume-card {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.9rem;
    padding: 1rem 1.1rem;
    margin-bottom: 1.1rem;
    min-height: 44px;
    color: var(--txt, #fff);
    text-decoration: none;
    background: linear-gradient(135deg, rgba(59,130,246,0.16), rgba(16,185,129,0.09)), var(--card, rgba(255,255,255,0.055));
    border: 1px solid rgba(59, 130, 246, 0.35);
    border-radius: var(--radius-lg, 1rem);
    box-shadow: var(--shadow-sm, 0 6px 18px rgba(0, 0, 0, 0.18));
    transition: transform var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease;
  }
  .resume-card:hover,
  .resume-card:focus-visible {
    transform: translateY(-1px);
    border-color: rgba(59, 130, 246, 0.6);
    outline: none;
  }
  .resume-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .resume-icon { font-size: 1.9rem; }
  .resume-meta h2 { margin: 0.15rem 0; font-size: 1.05rem; color: var(--txt, #fff); }
  .resume-unit { margin: 0; color: var(--txt3); font-size: 0.82rem; }
  .resume-cta { color: #bfdbfe; white-space: nowrap; }
  .resume-done {
    margin: 0 0 1.1rem;
    padding: 0.85rem 1rem;
    color: var(--txt2);
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px dashed var(--border, rgba(255, 255, 255, 0.14));
    border-radius: var(--radius-lg, 1rem);
  }

  /* Deadlines */
  .see-all {
    flex: 0 0 auto;
    color: var(--accent);
    text-decoration: none;
    font-weight: 700;
    font-size: 0.85rem;
    padding: 0.35rem 0;
  }
  .see-all:hover,
  .see-all:focus-visible { text-decoration: underline; outline: none; }
  .deadline-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }
  .deadline-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.85rem;
    flex-wrap: wrap;
    padding: 0.85rem 1rem;
    min-height: 44px;
    color: var(--txt, #fff);
    text-decoration: none;
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-left: 4px solid var(--warning, #f59e0b);
    border-radius: var(--radius-md, 0.75rem);
    transition: background var(--motion-fast, 120ms) ease;
  }
  .deadline-card:hover,
  .deadline-card:focus-visible { background: var(--card-hover, rgba(255, 255, 255, 0.08)); outline: none; }
  .deadline-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .deadline-meta h3 { margin: 0 0 0.15rem; font-size: 0.95rem; color: var(--txt, #fff); }
  .deadline-meta p { margin: 0; color: var(--txt3); font-size: 0.78rem; }
  .deadlines-empty {
    margin: 0;
    padding: 0.85rem 1rem;
    color: var(--txt2);
    background: var(--card, rgba(255, 255, 255, 0.04));
    border: 1px dashed var(--border, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-md, 0.75rem);
  }

  /* Legacy course directory */
  .legacy-search {
    width: 100%;
    padding: 0.6rem 0.8rem;
    min-height: 44px;
    margin-bottom: 0.8rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-md, 0.6rem);
    color: var(--txt, #fff);
    font: inherit;
  }
  .legacy-search:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .legacy-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.55rem;
  }
  .legacy-card {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.7rem 0.85rem;
    min-height: 44px;
    color: var(--txt, #fff);
    text-decoration: none;
    background: var(--card, rgba(255, 255, 255, 0.045));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.09));
    border-left: 3px solid var(--course-color, var(--accent));
    border-radius: var(--radius-md, 0.7rem);
    transition: background var(--motion-fast, 120ms) ease;
  }
  .legacy-card:hover,
  .legacy-card:focus-visible { background: var(--card-hover, rgba(255, 255, 255, 0.08)); outline: none; }
  .legacy-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .legacy-icon { font-size: 1.25rem; }
  .legacy-card h3 { margin: 0; font-size: 0.92rem; color: var(--txt, #fff); }
  .legacy-card small { color: var(--txt3); font-size: 0.75rem; }

  .lesson-path {
    display: grid;
    grid-template-columns: minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr);
    align-items: stretch;
    gap: .5rem;
    margin: 1.25rem 0;
  }
  .path-node {
    min-height: 112px;
    padding: .85rem;
    border-radius: 1.1rem;
    background: var(--card, rgba(255,255,255,.055));
    border: 1px solid var(--border, rgba(255,255,255,.1));
    display: grid;
    gap: .2rem;
    align-content: center;
  }
  .path-node span {
    width: 2.2rem;
    height: 2.2rem;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: rgba(59,130,246,.18);
    color: #bfdbfe;
    font-weight: 900;
  }
  .path-node.active { border-color: rgba(34,197,94,.5); box-shadow: 0 14px 34px rgba(34,197,94,.12); }
  .path-node.reward { border-color: rgba(245,158,11,.42); }
  .path-node strong { color: var(--txt, #fff); }
  .path-node small { color: var(--txt3); line-height: 1.25; }
  .path-line { width: 1.5rem; align-self: center; height: 3px; border-radius: 999px; background: linear-gradient(90deg, #60a5fa, #22c55e); opacity: .8; }
  @media (max-width: 720px) {
    .school-loop { grid-template-columns: 1fr; }
    .lesson-path { grid-template-columns: 1fr; }
    .path-line { width: 3px; height: 1.1rem; justify-self: center; background: linear-gradient(180deg, #60a5fa, #22c55e); }
    .resume-card { grid-template-columns: auto 1fr; }
    .resume-cta { grid-column: 2; justify-self: end; }
  }
  @media (min-width: 720px) {
    .course-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .subject-grid,
    .tool-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .legacy-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (min-width: 1080px) {
    .subject-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .legacy-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
