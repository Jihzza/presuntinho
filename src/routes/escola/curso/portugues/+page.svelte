<script lang="ts">
  import { t } from 'svelte-i18n';
  import { localizedPortugueseCourse } from '$lib/escola/catalog';

  function quizCount(unit: { lessons: Array<{ quizSlug?: string }> }) {
    return unit.lessons.filter((lesson) => Boolean(lesson.quizSlug)).length;
  }

  let portuguese = $derived(localizedPortugueseCourse($t));
</script>

<svelte:head>
  <title>{$t('portugues.page.title', { default: 'Português de Portugal' })} · Presuntinho</title>
  <meta name="description" content={$t('portugues.page.description', { default: 'Português organizado por cadeiras, aulas e quizzes.' })} />
</svelte:head>

<div class="course-page">
  <a class="back" href="/escola/">{$t('business.back', { default: '← Escola' })}</a>
  <header class="hero">
    <span>{$t('portugues.hero.badge', { default: '🇵🇹 Curso independente' })}</span>
    <h1>{portuguese.title}</h1>
    <p>{portuguese.summary} {$t('portugues.hero.suffix', { default: 'Abre a cadeira para veres as aulas, exercícios e quiz.' })}</p>
  </header>

  <section aria-label={$t('portugues.subjects.aria', { default: 'Cadeiras de Português' })}>
    <div class="section-head">
      <div>
        <h2>{$t('business.subjects.title', { default: 'Cadeiras' })}</h2>
        <p>{$t('portugues.subjects.body', { default: 'Português fica organizado como os outros cursos: cadeira primeiro, aulas depois.' })}</p>
      </div>
    </div>
    <div class="grid">
      {#each portuguese.units as subject (subject.slug)}
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
  .back { display: inline-flex; margin-bottom: .85rem; color: #bbf7d0; text-decoration: none; font-weight: 850; }
  .hero { padding: 1.25rem; margin-bottom: 1.3rem; border-radius: 1.25rem; color: #fff; background: radial-gradient(circle at top left, rgba(16,185,129,.3), transparent 38%), rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.11); }
  .hero span,
  .kicker { color: #bbf7d0; text-transform: uppercase; letter-spacing: .07em; font-size: .72rem; font-weight: 850; }
  .hero h1 { margin: .35rem 0; color: #fff; font-size: clamp(2rem, 7vw, 3.2rem); line-height: 1; }
  .hero p,
  .section-head p,
  .card p { color: var(--txt2); margin: 0; line-height: 1.5; }
  .section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; margin: 1.25rem 0 .85rem; }
  .section-head h2 { margin: 0 0 .2rem; color: #fff; font-size: 1.25rem; }
  .grid { display: grid; grid-template-columns: minmax(0,1fr); gap: .85rem; }
  .card { display: grid; grid-template-columns: auto 1fr; gap: .85rem; min-height: 132px; padding: 1rem; color: #fff; text-decoration: none; background: linear-gradient(135deg, color-mix(in srgb, var(--subject-color) 20%, transparent), transparent 52%), rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.1); border-radius: 1rem; transition: transform 120ms ease, background 120ms ease, border-color 120ms ease; }
  .card:hover,
  .card:focus-visible { transform: translateY(-1px); background: linear-gradient(135deg, color-mix(in srgb, var(--subject-color) 26%, transparent), transparent 55%), rgba(255,255,255,.085); border-color: color-mix(in srgb, var(--subject-color) 45%, rgba(255,255,255,.18)); outline: none; }
  .icon { font-size: 1.7rem; }
  .card h3 { margin: .12rem 0 .25rem; color: #fff; font-size: 1.05rem; }
  .card small { display: inline-block; margin-top: .55rem; color: var(--txt3); }
  @media (min-width: 760px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .hero { padding: 1.5rem; } }
</style>
