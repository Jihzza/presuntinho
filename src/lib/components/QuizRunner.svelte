<script lang="ts">
  import { onMount } from 'svelte';
  import { recordQuizSubmission } from '$lib/easterEggs';

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

  onMount(async () => {
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
  });

  function pick(qIdx: number, optIdx: number) {
    if (submitted) return;
    answers = { ...answers, [qIdx]: optIdx };
  }

  async function submit() {
    if (!quiz) return;
    submitted = true;
    const total = quiz.questions.length;
    const correct = quiz.questions.filter((q, i) => answers[i] === q.a).length;
    const answeredIndices = quiz.questions
      .map((_, i) => i)
      .filter((i) => answers[i] !== undefined);

    const result = await recordQuizSubmission(quizId, correct, total, answeredIndices);
    scoreInfo = { score: result.score, correct, total, perfect: result.perfect, pt: result.pt };
  }

  function reset() {
    answers = {};
    submitted = false;
    scoreInfo = null;
  }
</script>

{#if loadError}
  <p class="error">Erro a carregar quiz: {loadError}</p>
{:else if !quiz}
  <p class="loading">A carregar quiz…</p>
{:else}
  <article class="quiz">
    <h2>{quiz.title}</h2>
    {#if scoreInfo && !scoreInfo.perfect && scoreInfo.pt}
      <p class="note">🇵🇹 Progresso PT: {Math.round((scoreInfo.correct / scoreInfo.total) * 100)}%</p>
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
        Submeter
      </button>
    {:else}
      <button class="submit" onclick={reset}>Tentar novamente</button>
    {/if}
  </article>
{/if}

<style>
  .quiz { max-width: 720px; margin: 0 auto; }
  h2 { color: #fff; }
  .loading, .error { color: rgba(255, 255, 255, 0.7); text-align: center; padding: 2rem 0; }
  .error { color: #ff8888; }
  .note { color: #ec4899; font-size: 0.9rem; }
  .question {
    background: rgba(255, 255, 255, 0.05);
    padding: 1rem;
    border-radius: 0.5rem;
    margin: 1rem 0;
  }
  .question h3 { color: #fff; font-size: 1rem; margin: 0 0 0.75rem 0; }
  .opts { display: grid; gap: 0.5rem; }
  .opt {
    text-align: left;
    padding: 0.6rem 0.9rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 0.4rem;
    color: #fff;
    cursor: pointer;
    transition: background 0.15s;
    font: inherit;
  }
  .opt:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08); }
  .opt.chosen { border-color: #ec4899; }
  .opt.correct { background: rgba(16, 185, 129, 0.2); border-color: #10b981; }
  .opt.wrong { background: rgba(239, 68, 68, 0.2); border-color: #ef4444; }
  .opt:disabled { cursor: default; }
  .submit {
    margin-top: 1.5rem;
    padding: 0.75rem 1.5rem;
    background: #ec4899;
    color: #fff;
    border: 0;
    border-radius: 0.5rem;
    font-weight: 600;
    cursor: pointer;
    font: inherit;
  }
  .submit:hover:not(:disabled) { background: #d63780; }
  .submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>