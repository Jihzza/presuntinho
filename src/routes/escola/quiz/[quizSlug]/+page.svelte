<script lang="ts">
  import { page } from '$app/state';
  import QuizRunner from '$lib/components/QuizRunner.svelte';

  // Quiz route. Maps slug → JSON file. All 5 quizzes live under /quizzes/
  // (static/quizzes/q1.json, q2.json, q3.json, q4.json, ptq.json).

  let quizSlug = $derived(page.params.quizSlug ?? '');
  let jsonPath = $derived(`/quizzes/${quizSlug}.json`);
</script>

<svelte:head>
  <title>Quiz {quizSlug} · Escola</title>
</svelte:head>

<div class="quiz-page">
  <header class="quiz-head">
    <p class="breadcrumb">
      <a href="/escola/">Escola</a>
      <span class="sep">›</span>
      <a href="/escola/curso/equivalenza/">Equivalenza</a>
      <span class="sep">›</span>
      <span>Quiz {quizSlug.toUpperCase()}</span>
    </p>
  </header>

  {#key quizSlug}
    <QuizRunner quizId={quizSlug} {jsonPath} />
  {/key}

  <p class="back-link">
    <a href="/escola/curso/equivalenza/">← Voltar ao curso</a>
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
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    margin: 0;
  }
  .breadcrumb a { color: var(--accent, #ec4899); text-decoration: none; }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }
  .back-link {
    text-align: center;
    margin-top: 2rem;
  }
  .back-link a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .back-link a:hover { text-decoration: underline; }
</style>
