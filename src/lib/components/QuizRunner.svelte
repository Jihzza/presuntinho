<script lang="ts">
  import { onMount } from 'svelte';
  import { awardXP, boostedXp, XP_TABLE } from '$lib/state/xp-actions';
  import { awardBadge } from '$lib/state/stores';
  import { db } from '$lib/state/db';
  import { playSfx, vibrate } from '$lib/gamification/sound';
  import { showToast } from '$lib/components/events';
  import { getQuizHistory, recordQuizResult, type QuizHistory } from '$lib/escola/progress';
  import { schoolQuizContextForSlug } from '$lib/escola/catalog';
  import VictoryFlow from '$lib/components/VictoryFlow.svelte';
  import { t } from 'svelte-i18n';

  // Match the V3 quiz shape (static/legacy/assets/js/quizzes.js)
  interface Question {
    q: string;
    opts: string[];
    a: number;
    /** Alternate schema used by some content JSONs (aiq/goq/gqq/lcq). */
    correct?: number;
    explanation?: string;
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
  // Whether THIS submission actually paid XP (anti-farm: quiz XP pays once).
  let xpAwarded = $state(false);
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
      if (quiz) {
        quiz = normalizeQuiz(quiz); // inline data also gets schema-normalized
        return;
      }
      if (!jsonPath) return;
      try {
        const res = await fetch(jsonPath);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Quiz = await res.json();
        quiz = normalizeQuiz(data);
      } catch (e) {
        loadError = e instanceof Error ? e.message : String(e);
      }
    })();
  });

  /** Alguns JSONs de conteúdo usam `correct` em vez de `a` para o índice da
   *  resposta certa — sem normalizar, `item.a` fica undefined e o quiz é
   *  impossível de ganhar. Também filtra perguntas malformadas para o runner
   *  nunca rebentar com conteúdo inválido (e sinaliza quiz vazio como erro). */
  function normalizeQuiz(data: Quiz): Quiz {
    const questions = (Array.isArray(data?.questions) ? data.questions : [])
      .filter((raw) => raw && typeof raw.q === 'string' && Array.isArray(raw.opts) && raw.opts.length > 0)
      .map((raw) => ({ ...raw, a: typeof raw.a === 'number' ? raw.a : (raw.correct ?? 0) }))
      .filter((q) => q.a >= 0 && q.a < q.opts.length);
    if (questions.length === 0) {
      loadError = 'empty quiz';
      return { ...data, questions: [] };
    }
    return { ...data, questions };
  }

  // ── V10.1 (tarefa H): fluxo Duolingo — UMA pergunta por ecrã ──────────
  // Escolher uma opção é um compromisso: feedback imediato (cor + som +
  // resposta certa quando erras) e só depois "Continuar" avança. A última
  // pergunta encadeia no submit() existente (VictoryFlow + XP + histórico).
  let current = $state(0);
  let feedback = $state<'correct' | 'wrong' | null>(null);

  const progressPct = $derived(
    quiz && quiz.questions.length > 0
      ? Math.round(((current + (feedback ? 1 : 0)) / quiz.questions.length) * 100)
      : 0
  );

  function pick(qIdx: number, optIdx: number) {
    if (submitted || feedback !== null) return;
    answers = { ...answers, [qIdx]: optIdx };
    const item = quiz?.questions[qIdx];
    if (!item) return;
    if (optIdx === item.a) {
      feedback = 'correct';
      playSfx('correct');
      vibrate('tap');
    } else {
      feedback = 'wrong';
      playSfx('wrong');
    }
  }

  function continueQuiz() {
    if (!quiz || feedback === null) return;
    feedback = null;
    if (current < quiz.questions.length - 1) {
      current += 1;
    } else {
      void submit();
    }
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

    // Anti-farm (paridade com hábitos xpPaidDates / trabalhos xpPaidStatuses):
    // o XP de quiz paga UMA vez — quiz_complete na primeira submissão,
    // quiz_perfect_score na primeira vez que chega aos 100%. Repetir continua
    // a atualizar histórico/best, só não volta a pagar.
    let hadPriorAttempt = false;
    let hadPriorPerfect = false;
    try {
      const prevRow = (await db().quizScores.get(quizId)) as
        | { score: number; best?: number; total?: number }
        | undefined;
      if (prevRow) {
        hadPriorAttempt = true;
        const pBest = typeof prevRow.best === 'number' ? prevRow.best : prevRow.score;
        const pTotal = typeof prevRow.total === 'number' ? prevRow.total : total;
        hadPriorPerfect = pTotal > 0 && pBest >= pTotal;
      }
    } catch {
      /* leitura falhou — trata como primeira tentativa (nunca pior que antes) */
    }

    // Single write path: persists score + answered (V3 shape) AND the V8
    // history fields (total, best, attempts) in one Dexie put.
    try {
      history = await recordQuizResult(quizId, correct, total, answeredIndices);
    } catch (e) {
      console.error('[quiz] save failed', e);
    }

    // V10 — b4 "Quizzmaster": 10+ questões respondidas no total, em
    // qualquer combinação de quizzes (contrato V3: quizzes.js linha 137).
    try {
      const rows = await db().quizScores.toArray();
      const answeredTotal = rows.reduce(
        (sum, r) => sum + (Array.isArray(r.answered) ? r.answered.length : 0),
        0
      );
      if (answeredTotal >= 10) void awardBadge('b4');
    } catch (e) {
      console.warn('[quiz] b4 check failed', e);
    }

    // XP integrity (V8): quiz perfeito pays exactly XP_TABLE.quiz_perfect_score
    // from ONE place with ONE toast (the old recordQuizSubmission +50 path
    // plus a second +25 award here has been retired).
    if (perfect) {
      // Só a PRIMEIRA nota perfeita paga XP; badges são idempotentes.
      xpAwarded = !hadPriorPerfect;
      if (xpAwarded) void awardXP('quiz_perfect_score');
      void awardBadge('b3');
      showToast(
        xpAwarded
          ? $t('quiz.toast.perfect', {
              values: { correct, total, xp: boostedXp(XP_TABLE.quiz_perfect_score) },
              default: '🏆 {correct}/{total} — Perfeito! +{xp} XP'
            })
          : $t('quiz.toast.perfect_again', {
              values: { correct, total },
              default: '🏆 {correct}/{total} — Perfeito outra vez!'
            }),
        3500
      );
      if (pt) {
        void awardBadge('b11');
      }
      // NOTE (V9): the perfect-score confetti now fires inside
      // QuizVictory on mount (single fire point, no double burst).
    } else {
      // Reward completion/accuracy too — rewarding only 100% felt punishing and
      // is off-genre (Duolingo pays for finishing + getting some right)…
      // but only on the FIRST submission of this quiz (anti-farm).
      xpAwarded = !hadPriorAttempt;
      if (xpAwarded) void awardXP('quiz_complete');
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

  function resetFlow() {
    current = 0;
    feedback = null;
  }

  function reset() {
    resetFlow();
    answers = {};
    submitted = false;
    scoreInfo = null;
    reviewOpen = false;
    victoryOpen = false;
    xpAwarded = false;
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

    {#if !submitted}
      <!-- V10.1 (tarefa H): fluxo Duolingo — UMA pergunta por ecrã, barra de
           progresso e feedback imediato com som. O review de todas as
           perguntas continua a existir depois do submit. -->
      {@const item = quiz.questions[current]}
      {@const chosen = answers[current]}
      <div class="lesson-progress">
        <span class="lesson-count" aria-live="polite">
          {$t('quiz.progress.count', {
            values: { current: current + 1, total: quiz.questions.length },
            default: 'Pergunta {current} de {total}'
          })}
        </span>
        <div
          class="lesson-bar-wrap"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={progressPct}
          aria-label={$t('quiz.progress.aria', { default: 'Progresso do quiz' })}
        >
          <div class="lesson-bar" style="width: {progressPct}%"></div>
        </div>
      </div>

      {#key current}
        <section class="question question-single">
          <h3>{current + 1}. {item.q}</h3>
          <div class="opts">
            {#each item.opts as opt, oIdx (oIdx)}
              {@const isChosen = chosen === oIdx}
              {@const showCorrect = feedback !== null && oIdx === item.a}
              {@const showWrong = feedback === 'wrong' && isChosen}
              <button
                type="button"
                class="opt"
                class:chosen={isChosen && feedback === null}
                class:correct={showCorrect}
                class:wrong={showWrong}
                disabled={feedback !== null}
                onclick={() => pick(current, oIdx)}
              >{opt}</button>
            {/each}
          </div>
        </section>
      {/key}

      {#if feedback !== null}
        <!-- V10.2 — feedback sheet estilo Duolingo: painel fixo que sobe do
             fundo, verde no acerto / vermelho no erro, com a correção e o
             botão Continuar lá dentro. -->
        <div class="feedback-sheet" class:sheet-correct={feedback === 'correct'} class:sheet-wrong={feedback === 'wrong'} role="status">
          <div class="sheet-inner">
            <span class="sheet-icon" aria-hidden="true">{feedback === 'correct' ? '✓' : '✗'}</span>
            <div class="sheet-copy">
              <strong class="sheet-title">
                {feedback === 'correct'
                  ? $t('quiz.feedback.correct', { default: 'Certo! 🎉' })
                  : $t('quiz.feedback.wrong_title', { default: 'Quase!' })}
              </strong>
              {#if feedback === 'wrong'}
                <span class="sheet-answer">
                  {$t('quiz.feedback.wrong_answer', {
                    values: { answer: item.opts[item.a] },
                    default: 'Resposta certa: {answer}'
                  })}
                </span>
              {/if}
              {#if item.explanation}
                <span class="sheet-why">💡 {item.explanation}</span>
              {/if}
            </div>
          </div>
          <button class="sheet-cta" onclick={continueQuiz}>
            {current < quiz.questions.length - 1
              ? $t('quiz.cta.continue', { default: 'Continuar →' })
              : $t('quiz.cta.finish', { default: 'Ver resultado 🏁' })}
          </button>
        </div>
      {/if}
    {:else}
      <!-- Revisão pós-submissão: todas as perguntas com a correção visível. -->
      {#each quiz.questions as item, qIdx (qIdx)}
        {@const chosen = answers[qIdx]}
        <section class="question">
          <h3>{qIdx + 1}. {item.q}</h3>
          <div class="opts">
            {#each item.opts as opt, oIdx (oIdx)}
              {@const isChosen = chosen === oIdx}
              {@const isCorrect = oIdx === item.a}
              {@const isWrong = isChosen && oIdx !== item.a}
              <button
                type="button"
                class="opt"
                class:correct={isCorrect}
                class:wrong={isWrong}
                disabled
              >{opt}</button>
            {/each}
          </div>
        </section>
      {/each}
    {/if}

    {#if submitted && scoreInfo}
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
                  {#if entry.question.explanation}
                    <p class="review-why">💡 {entry.question.explanation}</p>
                  {/if}
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
    <!-- V10 — the single-card QuizVictory became the VictoryFlow parade
         (splash+ring → recompensas → streak+missões). QuizVictory itself
         still serves the LessonRunner 'lesson' variant. -->
    {@const vTier = scoreInfo.perfect ? 'perfect' : scoreInfo.score >= 70 ? 'good' : 'low'}
    <VictoryFlow
      context="quiz"
      title={vTier === 'perfect'
        ? $t('quizvictory.title.perfect', { default: 'Perfeito! 🏆' })
        : vTier === 'good'
          ? $t('quizvictory.title.good', { default: 'Muito bem! 🌟' })
          : $t('quizvictory.title.low', { default: 'Boa tentativa! 💪' })}
      mascotLine={vTier === 'perfect'
        ? $t('quizvictory.mascot.perfect', { default: 'UAU! Nota máxima — mereces uma festa! 🎊' })
        : vTier === 'good'
          ? $t('quizvictory.mascot.good', { default: 'Estás quase lá — que orgulho ver-te a crescer!' })
          : $t('quizvictory.mascot.low', { default: 'Cada tentativa ensina algo novo. Vamos rever juntas? 💕' })}
      correct={scoreInfo.correct}
      total={scoreInfo.total}
      celebrate={scoreInfo.perfect}
      confettiCount={scoreInfo.pt ? 80 : 60}
      xpEntries={!xpAwarded
        ? []
        : scoreInfo.perfect
          ? [
              {
                label: $t('victoryflow.entry.quiz_perfect', { default: 'Quiz perfeito' }),
                amount: boostedXp(XP_TABLE.quiz_perfect_score)
              }
            ]
          : [
              {
                label: $t('victoryflow.entry.quiz_complete', { default: 'Quiz concluído' }),
                amount: boostedXp(XP_TABLE.quiz_complete)
              }
            ]}
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
  .opt.correct { background: color-mix(in srgb, var(--success) 20%, transparent); border-color: var(--success, #10b981); }
  .opt.wrong { background: color-mix(in srgb, var(--error) 20%, transparent); border-color: var(--error, #ef4444); }
  .opt:disabled { cursor: default; }

  /* V10.1 — fluxo one-question-at-a-time */
  .lesson-progress {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0.75rem 0 0;
  }
  .lesson-count {
    font-size: var(--fs-xs, 0.78rem);
    color: var(--txt3, #94a3b8);
    font-variant-numeric: tabular-nums;
  }
  .lesson-bar-wrap {
    width: 100%;
    height: 10px;
    background: var(--bg-elev, rgba(255, 255, 255, 0.08));
    border-radius: 999px;
    overflow: hidden;
  }
  .lesson-bar {
    height: 100%;
    background: var(--success, #10b981);
    border-radius: 999px;
    transition: width var(--motion-base, 220ms) ease;
  }
  .question-single {
    animation: question-in var(--motion-base, 220ms) ease;
  }
  .question-single .opt {
    min-height: 54px;
    font-size: var(--fs-md, 1rem);
  }
  /* V10.2 — feedback sheet Duolingo (tokens reais: #d7ffb8/#58a700 no acerto,
     #ffdfe0/#ea2b2b no erro; slide-up ~250ms; Continuar full-width com o
     "3D press" de border-bottom mais escuro). */
  .feedback-sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 70;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding: 1.1rem 1.1rem calc(1.2rem + env(safe-area-inset-bottom));
    animation: sheet-up 250ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .sheet-correct {
    background: #d7ffb8;
  }
  .sheet-wrong {
    background: #ffdfe0;
  }
  .sheet-inner {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    max-width: 720px;
    width: 100%;
    margin: 0 auto;
  }
  .sheet-icon {
    display: grid;
    place-items: center;
    width: 58px;
    height: 58px;
    border-radius: 50%;
    background: #fff;
    font-size: 1.9rem;
    font-weight: 900;
    flex: none;
  }
  .sheet-correct .sheet-icon {
    color: #58a700;
  }
  .sheet-wrong .sheet-icon {
    color: #ea2b2b;
  }
  .sheet-copy {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .sheet-title {
    font-size: 1.25rem;
    font-weight: 800;
  }
  .sheet-correct .sheet-title,
  .sheet-correct .sheet-answer {
    color: #58a700;
  }
  .sheet-wrong .sheet-title,
  .sheet-wrong .sheet-answer {
    color: #ea2b2b;
  }
  .sheet-answer {
    font-size: 0.9rem;
  }
  /* Explanation on the feedback sheet — a calm dark tone so it stays readable
     on both the green (correct) and pink (wrong) sheets. */
  .sheet-why {
    color: #33404a;
    font-size: 0.85rem;
    line-height: 1.45;
    margin-top: 0.15rem;
  }
  .sheet-cta {
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
    min-height: 50px;
    border: none;
    border-radius: 16px;
    font-size: 1rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #fff;
    cursor: pointer;
    transition: transform var(--motion-fast, 120ms) ease;
  }
  .sheet-correct .sheet-cta {
    background: #58cc02;
    border-bottom: 4px solid #58a700;
  }
  .sheet-wrong .sheet-cta {
    background: #ff4b4b;
    border-bottom: 4px solid #ea2b2b;
  }
  .sheet-cta:active {
    transform: translateY(3px);
    border-bottom-width: 1px;
  }
  @keyframes sheet-up {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }
  @keyframes question-in {
    from {
      opacity: 0;
      transform: translateX(14px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
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
  .review-why { color: var(--txt2); margin: 0.35rem 0 0; font-size: var(--fs-sm, 0.9rem); line-height: 1.45; }
</style>
