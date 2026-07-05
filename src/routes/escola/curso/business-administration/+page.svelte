<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { localizedBusinessAdministration, localizedBusinessSubjects } from '$lib/escola/catalog';
  import { courseProgress, type CourseProgress } from '$lib/escola/progress';

  function quizCount(unit: { lessons: Array<{ quizSlug?: string }> }) {
    return unit.lessons.filter((lesson) => Boolean(lesson.quizSlug)).length;
  }

  let businessAdministration = $derived(localizedBusinessAdministration($t));
  let businessSubjects = $derived(localizedBusinessSubjects($t));
  let progress = $state<CourseProgress | null>(null);

  onMount(() => {
    void (async () => {
      try {
        progress = await courseProgress('business-administration');
      } catch (e) {
        console.error('[business] progress load failed', e);
      }
    })();
  });
</script>

<svelte:head>
  <title>{$t('business.page.title', { default: 'Business Administration' })} · Presuntinho</title>
  <meta name="description" content={$t('business.page.description', { default: 'Cadeiras de Business Administration organizadas por aulas, exercícios e testes.' })} />
</svelte:head>

<div class="course-page">
  <a class="back" href="/escola/">{$t('business.back', { default: '← Escola' })}</a>
  <header class="hero">
    <span>{$t('business.hero.badge', { default: '🎓 Curso universitário' })}</span>
    <h1>{businessAdministration.title}</h1>
    <p>{businessAdministration.summary} {$t('business.hero.suffix', { default: 'Primeiro escolhes a cadeira. Dentro de cada cadeira abres aulas, exercícios e testes.' })}</p>
    {#if progress}
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress.percent} aria-label={$t('a11y.aria.progresso_do_curso', { default: 'Progresso do curso' })}>
        <span style="width: {progress.percent}%"></span>
      </div>
      <small>{$t('business.progress', { values: { done: progress.done, total: progress.total }, default: '{done}/{total} passos concluídos' })}</small>
    {/if}
  </header>

  <section aria-label={$t('business.subjects.aria', { default: 'Cadeiras de Business Administration' })}>
    <div class="section-head">
      <div>
        <h2>{$t('business.subjects.title', { default: 'Cadeiras' })}</h2>
        <p>{$t('business.subjects.clean_body', { default: 'Cada cadeira tem o seu caminho de aulas, exercícios e testes.' })}</p>
      </div>
      <strong>{$t('business.subjects.count', { values: { n: businessSubjects.length }, default: '{n} áreas organizadas' })}</strong>
    </div>
    <div class="grid">
      {#each businessSubjects as subject (subject.slug)}
        <a class="card" href={`/escola/curso/${subject.slug}/`} style="--subject-color: {subject.color};" data-sveltekit-preload-data>
          <span class="icon" aria-hidden="true">{subject.icon}</span>
          <div>
            <p class="kicker">{$t('business.subjects.kicker', { default: 'Cadeira' })}</p>
            <h3>{subject.title}</h3>
            <p>{subject.summary}</p>
            <small>{$t('business.subjects.card_meta', { values: { lessons: subject.lessons.length, quizzes: quizCount(subject) }, default: '{lessons} aulas · {quizzes} testes · abrir cadeira →' })}</small>
          </div>
        </a>
      {/each}
    </div>
  </section>
</div>

<style>
  .course-page { max-width: 980px; margin: 0 auto; padding: 1.25rem 1rem 8rem; }
  .back { display: inline-flex; margin-bottom: .85rem; color: #bfdbfe; text-decoration: none; font-weight: 850; }
  .hero { padding: 1.25rem; margin-bottom: 1.3rem; border-radius: 1.25rem; color: #fff; background: radial-gradient(circle at top left, rgba(59,130,246,.3), transparent 38%), rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.11); }
  .hero span,
  .kicker { color: #bfdbfe; text-transform: uppercase; letter-spacing: .07em; font-size: .72rem; font-weight: 850; }
  .hero h1 { margin: .35rem 0; color: #fff; font-size: clamp(2rem, 7vw, 3.2rem); line-height: 1; }
  .hero p,
  .section-head p,
  .card p { color: var(--txt2); margin: 0; line-height: 1.5; }
  .progress { height: 8px; margin: 1rem 0 .35rem; overflow: hidden; border-radius: 999px; background: rgba(0,0,0,.25); }
  .progress span { display: block; height: 100%; border-radius: inherit; background: #3b82f6; }
  .hero small { color: var(--txt3); }
  .section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; margin: 1.25rem 0 .85rem; }
  .section-head h2 { margin: 0 0 .2rem; color: #fff; font-size: 1.25rem; }
  .section-head strong { color: #bfdbfe; white-space: nowrap; }
  .grid { display: grid; grid-template-columns: minmax(0,1fr); gap: .85rem; }
  .card { display: grid; grid-template-columns: auto 1fr; gap: .85rem; min-height: 132px; padding: 1rem; color: #fff; text-decoration: none; background: linear-gradient(135deg, color-mix(in srgb, var(--subject-color) 20%, transparent), transparent 52%), rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.1); border-radius: 1rem; transition: transform 120ms ease, background 120ms ease, border-color 120ms ease; }
  .card:hover,
  .card:focus-visible { transform: translateY(-1px); background: linear-gradient(135deg, color-mix(in srgb, var(--subject-color) 26%, transparent), transparent 55%), rgba(255,255,255,.085); border-color: color-mix(in srgb, var(--subject-color) 45%, rgba(255,255,255,.18)); outline: none; }
  .icon { font-size: 1.7rem; }
  .card h3 { margin: .12rem 0 .25rem; color: #fff; font-size: 1.05rem; }
  .card small { display: inline-block; margin-top: .55rem; color: var(--txt3); }
  @media (min-width: 760px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .hero { padding: 1.5rem; } }
</style>
