<script lang="ts">
  import { onMount } from 'svelte';
  import { awardXP, XP_TABLE } from '$lib/state/xp-actions';
  import { awardBadge } from '$lib/state/stores';
  import { showToast } from '$lib/components/events';
  import { getQuizHistory, recordQuizResult, type QuizHistory } from '$lib/escola/progress';
  import { schoolQuizContextForSlug } from '$lib/escola/catalog';
  import QuizVictory from '$lib/components/QuizVictory.svelte';
  import { t } from 'svelte-i18n';

  // Match the V3 quiz shape (static/legacy/assets/js/quizzes.js)
  interface Question {
    q: string;
    opts: string[];
    a: number;
  }
  interface Quiz {
    id: string;
    title: string;
    questions: Question[];
  }
  interface Props {
    quizId: string;     // e.g. 'q1', 'ptq'
    jsonPath?: string;  // e.g. '/quizzes/q1.json'
    inline?: Quiz;      // optional fallback inline data
  }
  let { quizId, jsonPath, inline }: Props = $props();

  // Capture initial value of `inline` prop; subsequent prop changes handled
  // by key-based remount in consuming routes.
  // svelte-ignore state_referenced_locally
  let quiz = $state<Quiz | null>(inline ?? null);
  let answers = $state<Record<number, number>>({});
  let submitted = $state(false);
  let scoreInfo = $state<{ score: number; correct: number; total: number; perfect: boolean; pt: boolean } | null>(null);
  let loadError = $state<string | null>(null);
  // Prior attempts (best score, attempt count) — shown before starting
  // and updated after each submit.  Read via the escola progress module.
  let history = $state<QuizHistory | null>(null);
  let reviewOpen = $state(false);
  // V9 — full-screen celebration overlay shown right after submit. The
  // inline results card stays rendered beneath it for review.
  let victoryOpen = $state(false);
  // Course/unit context (if this quiz belongs to a catalog course) —
  // powers the 'Próxima lição' CTA inside QuizVictory.
  let quizContext = $derived(schoolQuizContextForSlug(quizId));

  onMount(() => {
    void (async () => {
      try {
        history = await getQuizHistory(quizId);
      } catch (e) {
        console.error('[quiz] history read failed', e);
      }
      if (quiz) return; // already have inline data
      if (!jsonPath) return;
      try {
        const res = await fetch(jsonPath);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Quiz = await res.json();
        quiz = data;
      } catch (e) {
        loadError = e instanceof Error ? e.message : String(e);
      }
    })();
  });

  function pick(qIdx: number, optIdx: number) {
    if (submitted) return;
    answers = { ...answers, [qIdx]: optIdx };
  }

  async function submit() {
    if (!quiz || submitted) return;
    submitted = true;
    const total = quiz.questions.length;
    const correct = quiz.questions.filter((q, i) => answers[i] === q.a).length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const perfect = total > 0 && correct === total;
    const pt = quizId === 'ptq';
    const answeredIndices = quiz.questions
      .map((_, i) => i)
      .filter((i) => answers[i] !== undefined);

    scoreInfo = { score, correct, total, perfect, pt };

    // Single write path: persists score + answered (V3 shape) AND the V8
    // history fields (total, best, attempts) in one Dexie put.
    try {
      history = await recordQuizResult(quizId, correct, total, answeredIndices);
    } catch (e) {
      console.error('[quiz] save failed', e);
    }

    // XP integrity (V8): quiz perfeito pays exactly XP_TABLE.quiz_perfect_score
    // from ONE place with ONE toast (the old recordQuizSubmission +50 path
    // plus a second +25 award here has been retired).
    if (perfect) {
      void awardXP('quiz_perfect_score');
      void awardBadge('b3');
      showToast(
        $t('quiz.toast.perfect', {
          values: { correct, total, xp: XP_TABLE.quiz_perfect_score },
          default: '🏆 {correct}/{total} — Perfeito! +{xp} XP'
        }),
        3500
      );
      if (pt) {
        void awardBadge('b11');
      }
      // NOTE (V9): the perfect-score confetti now fires inside
      // QuizVictory on mount (single fire point, no double burst).
    } else {
      showToast(
        $t('quiz.toast.score', {
          values: { correct, total, score },
          default: '🎯 {correct}/{total} ({score}%)'
        })
      );
    }

    // V9 — show the celebration overlay instead of scrolling to the
    // inline results (they stay rendered beneath for review).
    victoryOpen = true;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('presuntinho:quiz-submitted', {
          detail: { quizId, correct, total, score, perfect }
        })
      );
    }
  }

  function reset() {
    answers = {};
    submitted = false;
    scoreInfo = null;
    reviewOpen = false;
    victoryOpen = false;
  }

  // Questions the user got wrong on this attempt — powers the review view.
  let wrongAnswers = $derived(
    submitted && quiz
      ? quiz.questions
          .map((question, idx) => ({ question, idx, chosen: answers[idx] }))
          .filter((entry) => entry.chosen !== entry.question.a)
      : []
  );

  let bestLabel = $derived.by(() => {
    if (!history) return '';
    if (history.total) {
      return $t('quiz.best.known_total', {
        values: { best: history.best, total: history.total, attempts: history.attempts },
        default: 'O teu melhor: {best}/{total} · {attempts} tentativas'
      });
    }
    return $t('quiz.best.unknown_total', {
      values: { best: history.best },
      default: 'O teu melhor: {best} certas'
    });
  });
</script>

{#if loadError}
  <p class="error">{$t('quiz.error.load', { default: 'Erro a carregar quiz' })}: {loadError}</p>
{:else if !quiz}
  <p class="loading">{$t('quiz.loading', { default: 'A carregar quiz…' })}</p>
{:else}
  <article class="quiz">
    <h2>{quiz.title}</h2>

    {#if history && !submitted}
      <p class="best-pill">
        📈 {bestLabel}
        {#if history.perfect}<span class="best-perfect">{$t('quiz.best.perfect', { default: '· 🏆 já perfeito!' })}</span>{/if}
      </p>
    {/if}

    {#if scoreInfo && !scoreInfo.perfect && scoreInfo.pt}
      <p class="note">{$t('quiz.pt.progress', { default: '🇵🇹 Progresso PT' })}: {Math.round((scoreInfo.correct / scoreInfo.total) * 100)}%</p>
    {/if}

    {#each quiz.questions as item, qIdx (qIdx)}
      {@const chosen = answers[qIdx]}
      <section class="question">
        <h3>{qIdx + 1}. {item.q}</h3>
        <div class="opts">
          {#each item.opts as opt, oIdx (oIdx)}
            {@const isChosen = chosen === oIdx}
            {@const isCorrect = submitted && oIdx === item.a}
            {@const isWrong = submitted && isChosen && oIdx !== item.a}
            <button
              type="button"
              class="opt"
              class:chosen={isChosen}
              class:correct={isCorrect}
              class:wrong={isWrong}
              disabled={submitted}
              onclick={() => pick(qIdx, oIdx)}
            >{opt}</button>
          {/each}
        </div>
      </section>
    {/each}

    {#if !submitted}
      <button
        class="submit"
        disabled={Object.keys(answers).length !== quiz.questions.length}
        onclick={submit}
      >
        {$t('quiz.submit', { default: 'Submeter' })}
      </button>
    {:else if scoreInfo}
      <section class="results card" aria-live="polite">
        <p class="result-line">
          <strong class="result-score">{scoreInfo.perfect ? '🏆' : '🎯'} {scoreInfo.correct}/{scoreInfo.total} ({scoreInfo.score}%)</strong>
          {#if history}
            <span class="result-best">{bestLabel}</span>
          {/if}
        </p>

        {#if scoreInfo.perfect}
          <p class="result-msg">{$t('quiz.results.perfect_msg', { default: 'Perfeito! Dominaste este quiz. 💖' })}</p>
        {:else if wrongAnswers.length > 0}
          <button
            type="button"
            class="review-toggle"
            aria-expanded={reviewOpen}
            onclick={() => (reviewOpen = !reviewOpen)}
          >
            {reviewOpen
              ? $t('quiz.review.hide', { default: 'Esconder correções' })
              : $t('quiz.review.show', { values: { n: wrongAnswers.length }, default: 'Rever {n} respostas erradas' })}
          </button>

          {#if reviewOpen}
            <ol class="review-list">
              {#each wrongAnswers as entry (entry.idx)}
                <li class="review-item">
                  <p class="review-q">{entry.idx + 1}. {entry.question.q}</p>
                  {#if entry.chosen !== undefined}
                    <p class="review-yours">✗ {$t('quiz.review.yours', { default: 'A tua resposta:' })} {entry.question.opts[entry.chosen]}</p>
                  {/if}
                  <p class="review-correct">✓ {$t('quiz.review.correct', { default: 'Resposta certa:' })} {entry.question.opts[entry.question.a]}</p>
                </li>
              {/each}
            </ol>
          {/if}
        {/if}

        <button class="submit" onclick={reset}>{$t('quiz.try_again', { default: 'Tentar novamente' })}</button>
      </section>
    {/if}
  </article>

  {#if victoryOpen && scoreInfo}
    <QuizVictory
      variant="quiz"
      correct={scoreInfo.correct}
      total={scoreInfo.total}
      xp={scoreInfo.perfect ? XP_TABLE.quiz_perfect_score : 0}
      confettiCount={scoreInfo.pt ? 80 : 60}
      courseSlug={quizContext?.courseSlug}
      wrongCount={wrongAnswers.length}
      onclose={() => {
        victoryOpen = false;
        // 'Rever erros' — reveal the existing inline review beneath.
        if (wrongAnswers.length > 0) reviewOpen = true;
      }}
      onretry={() => reset()}
    />
  {/if}
{/if}

<style>
  .quiz { max-width: 720px; margin: 0 auto; }
  h2 { color: var(--txt, #fff); }
  .loading, .error { color: var(--txt2, rgba(255, 255, 255, 0.7)); text-align: center; padding: 2rem 0; }
  .error { color: var(--error, #ef4444); }
  .note { color: var(--accent); font-size: var(--fs-sm, 0.9rem); }
  .best-pill {
    display: inline-block;
    padding: var(--space-1, 0.3rem) var(--space-3, 0.75rem);
    background: var(--bg-elev, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: 999px;
    color: var(--txt2);
    font-size: var(--fs-sm, 0.85rem);
    margin: 0 0 0.5rem;
  }
  .best-perfect { color: var(--success, #10b981); font-weight: 600; }
  .question {
    background: var(--card, rgba(255, 255, 255, 0.05));
    padding: 1rem;
    border-radius: var(--radius-md, 0.5rem);
    margin: 1rem 0;
  }
  .question h3 { color: var(--txt, #fff); font-size: 1rem; margin: 0 0 0.75rem 0; }
  .opts { display: grid; gap: 0.5rem; }
  .opt {
    text-align: left;
    padding: 0.6rem 0.9rem;
    min-height: 44px;
    background: var(--bg-elev, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: var(--radius-sm, 0.4rem);
    color: var(--txt, #fff);
    cursor: pointer;
    transition: background var(--motion-fast, 120ms);
    font: inherit;
  }
  .opt:hover:not(:disabled) { background: var(--card-hover, rgba(255, 255, 255, 0.08)); }
  .opt:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .opt.chosen { border-color: var(--accent); }
  .opt.correct { background: rgba(16, 185, 129, 0.2); border-color: var(--success, #10b981); }
  .opt.wrong { background: rgba(239, 68, 68, 0.2); border-color: var(--error, #ef4444); }
  .opt:disabled { cursor: default; }
  .submit {
    margin-top: 1rem;
    padding: 0.75rem 1.5rem;
    min-height: 44px;
    background: var(--accent);
    color: var(--on-accent, #fff);
    border: 0;
    border-radius: var(--radius-md, 0.5rem);
    font-weight: 600;
    cursor: pointer;
    font: inherit;
  }
  .submit:hover:not(:disabled) { background: var(--accent-hover, var(--accent)); }
  .submit:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .submit:disabled { opacity: 0.5; cursor: not-allowed; }
  .results {
    margin-top: 1.25rem;
    padding: 1rem 1.1rem;
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 0.75rem);
  }
  .result-line {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin: 0 0 0.5rem;
  }
  .result-score { color: var(--txt, #fff); font-size: var(--fs-lg, 1.15rem); }
  .result-best { color: var(--txt3); font-size: var(--fs-sm, 0.85rem); }
  .result-msg { color: var(--txt2); margin: 0 0 0.5rem; }
  .review-toggle {
    display: inline-block;
    padding: 0.55rem 0.9rem;
    min-height: 44px;
    background: transparent;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.2));
    border-radius: var(--radius-md, 0.5rem);
    color: var(--txt2);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .review-toggle:hover,
  .review-toggle:focus-visible {
    color: var(--accent);
    border-color: var(--accent);
    outline: none;
  }
  .review-list {
    list-style: none;
    margin: 0.75rem 0 0.25rem;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }
  .review-item {
    padding: 0.7rem 0.85rem;
    background: var(--bg-elev, rgba(0, 0, 0, 0.18));
    border-left: 3px solid var(--error, #ef4444);
    border-radius: var(--radius-sm, 0.4rem);
  }
  .review-q { color: var(--txt, #fff); font-weight: 600; margin: 0 0 0.3rem; }
  .review-yours { color: var(--error, #f87171); margin: 0 0 0.15rem; font-size: var(--fs-sm, 0.9rem); }
  .review-correct { color: var(--success, #34d399); margin: 0; font-size: var(--fs-sm, 0.9rem); }
</style>
