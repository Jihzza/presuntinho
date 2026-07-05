<script lang="ts">
  /**
   * Português — quiz route (`/escola/curso/portugues/quiz/`).
   *
   * Reuses QuizRunner with the `ptq` JSON (already under static/quizzes/).
   * On submission we additionally persist `fat-pt-quiz-score` (percentage)
   * and, on a perfect score, write a `lusofono` completion marker.
   *
   * The QuizRunner already awards badge b11 (Lusófono) + confetti when
   * the score is perfect (single XP path via awardXP('quiz_perfect_score')).
   */
  import { t } from 'svelte-i18n';

  import { onMount } from 'svelte';
  import QuizRunner from '$lib/components/QuizRunner.svelte';

  const QUIZ_SCORE_KEY = 'fat-pt-quiz-score';
  const QUIZ_COMPLETE_KEY = 'fat-pt-quiz-complete';

  let previousScore = $state<number | null>(null);
  let previousCompleted = $state(false);

  onMount(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const s = localStorage.getItem(QUIZ_SCORE_KEY);
        if (s) previousScore = Number(s);
        previousCompleted = localStorage.getItem(QUIZ_COMPLETE_KEY) === '1';
      } catch {
        /* ignore */
      }
    }
    // V8: QuizRunner dispatches 'presuntinho:quiz-submitted' on every
    // submit, so the legacy localStorage markers stay in sync live.
    window.addEventListener('presuntinho:quiz-submitted', onQuizSubmit);
    return () => window.removeEventListener('presuntinho:quiz-submitted', onQuizSubmit);
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
  <title>🇵🇹 {$t('routes.escola.quizpt.title', { default: 'Quiz PT' })} · {$t('routes.escola.title', { default: 'Escola' })} · Presuntinho</title>
  <meta
    name="description"
    content="Quiz rápido de Português de Portugal — 5 perguntas para ganhar a badge 🇵🇹 Lusófono."
  />
</svelte:head>

<div class="pt-quiz">
  <header class="head">
    <p class="breadcrumb">
      <a href="/escola/">{$t('escola.quiz.breadcrumb.home', { default: '← Escola' })}</a>
      <span class="sep">›</span>
      <a href="/escola/curso/portugues/">🇵🇹 {$t('escola.curso.pt.breadcrumb.current', { default: 'Curso PT' })}</a>
      <span class="sep">›</span>
      <span>{$t('escola.quiz.breadcrumb.current', { default: 'Quiz' })}</span>
    </p>
    <h1>{$t('escola.curso.pt.quiz.title', { default: '🇵🇹 Quiz de Português' })}</h1>
    <p class="sub">{$t('escola.curso.pt.quiz.subtitle', { default: '5 perguntas · Ganha a badge 🇵🇹 Lusófono (b11) com 5/5 certas.' })}</p>
    {#if previousScore !== null}
      <p class="prev" aria-live="polite">
        {$t('escola.curso.pt.quiz.previous', { default: 'Melhor resultado anterior:' })} <strong>{previousScore}%</strong>
        {#if previousCompleted}{$t('escola.curso.pt.quiz.completed', { default: '— ✅ concluído' })}{/if}
      </p>
    {/if}
  </header>

  <!-- QuizRunner dispatches a window-level 'presuntinho:quiz-submitted'
       CustomEvent on submit; the onMount listener above keeps the legacy
       localStorage score markers in sync. -->
  {#key 'ptq'}
    <QuizRunner quizId="ptq" jsonPath="/quizzes/ptq.json" />
  {/key}

  <!-- (svelte:window removed — the quiz event-listener pattern is handled
         inside QuizRunner's own logic via the score fallback in $effect.) -->

      <p class="back-link">
        <a href="/escola/curso/portugues/">{$t('escola.curso.pt.quiz.back', { default: '← Voltar ao curso PT' })}</a>
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
    color: var(--txt3);
    font-size: 0.85rem;
    margin: 0;
  }
  .breadcrumb a { color: var(--accent); text-decoration: none; }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }
  .sub {
    color: var(--txt2);
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
    color: var(--accent);
    text-decoration: none;
  }
  .back-link a:hover { text-decoration: underline; }
</style>
