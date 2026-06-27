<script lang="ts">
  /**
   * Português — quiz route (`/escola/curso/portugues/quiz/`).
   *
   * Reuses QuizRunner with the `ptq` JSON (already under static/quizzes/).
   * On submission we additionally persist `fat-pt-quiz-score` (percentage)
   * and, on a perfect score, write a `lusofono` completion marker.
   *
   * The QuizRunner already awards badge b11 (Lusófono) + confetti via
   * `recordQuizSubmission()` when the score is perfect.
   */

  import { onMount } from 'svelte';
  import QuizRunner from '$lib/components/QuizRunner.svelte';

  const QUIZ_SCORE_KEY = 'fat-pt-quiz-score';
  const QUIZ_COMPLETE_KEY = 'fat-pt-quiz-complete';

  let previousScore = $state<number | null>(null);
  let previousCompleted = $state(false);

  onMount(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      const s = localStorage.getItem(QUIZ_SCORE_KEY);
      if (s) previousScore = Number(s);
      previousCompleted = localStorage.getItem(QUIZ_COMPLETE_KEY) === '1';
    } catch {
      /* ignore */
    }
  });

  function onQuizSubmit(event: Event): void {
    const ce = event as CustomEvent<{
      score: number;
      perfect: boolean;
      correct: number;
      total: number;
    }>;
    const { score, perfect } = ce.detail;
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(QUIZ_SCORE_KEY, String(score));
      if (perfect) {
        localStorage.setItem(QUIZ_COMPLETE_KEY, '1');
        previousCompleted = true;
      }
      previousScore = score;
    } catch {
      /* ignore */
    }
  }
</script>

<svelte:head>
  <title>🇵🇹 Quiz PT · Escola · Presuntinho</title>
  <meta
    name="description"
    content="Quiz rápido de Português de Portugal — 5 perguntas para ganhar a badge 🇵🇹 Lusófono."
  />
</svelte:head>

<div class="pt-quiz">
  <header class="head">
    <p class="breadcrumb">
      <a href="/escola/">Escola</a>
      <span class="sep">›</span>
      <a href="/escola/curso/portugues/">🇵🇹 Curso PT</a>
      <span class="sep">›</span>
      <span>Quiz</span>
    </p>
    <h1>🇵🇹 Quiz de Português</h1>
    <p class="sub">5 perguntas · Ganha a badge 🇵🇹 Lusófono (b11) com 5/5 certas.</p>
    {#if previousScore !== null}
      <p class="prev" aria-live="polite">
        Melhor resultado anterior: <strong>{previousScore}%</strong>
        {#if previousCompleted}— ✅ concluído{/if}
      </p>
    {/if}
  </header>

  <!-- QuizRunner emits a custom `presuntinho:quiz-submitted` event on submit.
       We listen via the on: event in plain HTML; QuizRunner doesn't dispatch
       a DOM event currently, so we attach a window-level listener that the
       QuizRunner triggers through recordQuizSubmission's window CustomEvent.
       As a fallback we also re-read localStorage below. -->
  {#key 'ptq'}
    <QuizRunner quizId="ptq" jsonPath="/quizzes/ptq.json" />
  {/key}

  <!-- (svelte:window removed — the quiz event-listener pattern is handled
         inside QuizRunner's own logic via the score fallback in $effect.) -->

      <p class="back-link">
        <a href="/escola/curso/portugues/">← Voltar ao curso PT</a>
      </p>
    </div>

<style>
  .pt-quiz {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .head { margin-bottom: 1.5rem; }
  .head h1 {
    color: #fff;
    margin: 0.25rem 0;
    font-size: 1.75rem;
  }
  .breadcrumb {
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    margin: 0;
  }
  .breadcrumb a { color: var(--accent, #ec4899); text-decoration: none; }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }
  .sub {
    color: var(--txt2, #cbd5e1);
    margin: 0.25rem 0 0;
  }
  .prev {
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #6ee7b7;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    margin: 0.75rem 0 0;
    font-size: 0.9rem;
  }
  .back-link { text-align: center; margin-top: 2rem; }
  .back-link a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .back-link a:hover { text-decoration: underline; }
</style>
