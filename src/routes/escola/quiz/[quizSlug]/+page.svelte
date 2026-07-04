<script lang="ts">
  import { page } from '$app/state';
  import { t } from 'svelte-i18n';
  import QuizRunner from '$lib/components/QuizRunner.svelte';
  import { schoolQuizContextForSlug } from '$lib/escola/catalog';

  // Quiz route. Maps slug → JSON file. All 5 quizzes live under /quizzes/
  // (static/quizzes/q1.json, q2.json, q3.json, q4.json, ptq.json).

  let quizSlug = $derived(page.params.quizSlug ?? '');
  let jsonPath = $derived(`/quizzes/${quizSlug}.json`);
  let quizContext = $derived(schoolQuizContextForSlug(quizSlug));
  let courseHref = $derived(quizContext?.courseHref ?? '/escola/');
  let courseTitle = $derived(quizContext?.courseTitle ?? 'Escola');

  // SEO — used by <svelte:head> below.
  let pageTitle = $derived(`${quizSlug.toUpperCase()} · Quiz · Escola`);
  let description = $derived('Quiz interativo');
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content="https://presuntinho.netlify.app/escola/quiz/" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={description} />
</svelte:head>

<div class="quiz-page">
  <header class="quiz-head">
    <p class="breadcrumb">
      <a href="/escola/">{$t('escola.quiz.breadcrumb.home', { default: '← Escola' })}</a>
      <span class="sep">›</span>
      <a href={courseHref}>{$t('escola.quiz.breadcrumb.curso', { default: courseTitle })}</a>
      <span class="sep">›</span>
      <span>{$t('escola.quiz.breadcrumb.current', { default: 'Quiz' })} {quizSlug.toUpperCase()}</span>
    </p>
  </header>

  {#key quizSlug}
    <QuizRunner quizId={quizSlug} {jsonPath} />
  {/key}

  <p class="back-link">
    <a href={courseHref}>{$t('escola.quiz.back_to_course', { default: `← Voltar a ${courseTitle}` })}</a>
  </p>
</div>

<style>
  .quiz-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .quiz-head { margin-bottom: 0.5rem; }
  .breadcrumb {
    color: var(--txt3);
    font-size: 0.85rem;
    margin: 0;
  }
  .breadcrumb a { color: var(--accent); text-decoration: none; }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }
  .back-link {
    text-align: center;
    margin-top: 2rem;
  }
  .back-link a {
    color: var(--accent);
    text-decoration: none;
  }
  .back-link a:hover { text-decoration: underline; }
</style>
