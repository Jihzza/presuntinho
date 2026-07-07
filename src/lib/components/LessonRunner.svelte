<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { markVisited } from '$lib/state/stores';
  import { t } from 'svelte-i18n';
  import { completeLessonOnce } from '$lib/escola/progress';
  import { XP_TABLE } from '$lib/state/xp-actions';
  import QuizVictory from '$lib/components/QuizVictory.svelte';

  // ----- Types --------------------------------------------------------------

  type Section =
    | { type: 'h2'; text: string }
    | { type: 'h3'; text: string }
    | { type: 'p'; text: string }
    | { type: 'ul'; items: string[] }
    | { type: 'callout'; variant?: 'info' | 'warning' | 'success' | 'highlight'; text: string }
    | { type: 'img'; src: string; alt: string; caption?: string };

  interface Lesson {
    id: string;
    courseSlug: string;
    title: string;
    audio: string;
    audioLabel?: string;
    sections: Section[];
    keyPoints: string[];
    quizSlug: string | null;
    nextLesson: string | null;
    prevLesson: string | null;
  }

  // ----- Props --------------------------------------------------------------

  interface Props {
    courseSlug: string;          // e.g. 'equivalenza'
    lessonSlug: string;           // e.g. 'swot'
    jsonPath?: string;            // override path; defaults to /lessons/<course>/<lesson>.json
  }

  let { courseSlug, lessonSlug, jsonPath }: Props = $props();

  // ----- State --------------------------------------------------------------

  let lesson = $state<Lesson | null>(null);
  let loadError = $state<string | null>(null);
  let audioEl = $state<HTMLAudioElement | null>(null);
  let audioPlaying = $state(false);
  let audioProgress = $state(0); // 0..1

  // ----- Duolingo-style stepped theory -------------------------------------
  // Chunk the flat section list into cards (a new card starts at each h2) and
  // reveal one at a time behind a "Continuar" bar, ending in the quiz.
  let step = $state(0);
  function chunkSections(sections: Section[]): Section[][] {
    if (!sections.length) return [];
    const out: Section[][] = [];
    let cur: Section[] = [];
    for (const s of sections) {
      if (s.type === 'h2' && cur.length) {
        out.push(cur);
        cur = [];
      }
      cur.push(s);
    }
    if (cur.length) out.push(cur);
    return out;
  }
  const steps = $derived(chunkSections(lesson?.sections ?? []));
  const totalSteps = $derived(Math.max(1, steps.length));
  const isLastStep = $derived(step >= totalSteps - 1);

  function nextStep(): void {
    if (step < totalSteps - 1) {
      step += 1;
      if (typeof document !== 'undefined') {
        document.querySelector('.lesson-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else if (lesson?.quizSlug) {
      goQuiz();
    } else if (typeof history !== 'undefined') {
      history.back();
    }
  }
  function prevStep(): void {
    if (step > 0) step -= 1;
  }

  // ----- Data load ----------------------------------------------------------

  onMount(async () => {
    const path = jsonPath ?? `/lessons/${courseSlug}/${lessonSlug}.json`;
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Lesson = await res.json();
      lesson = data;
      // Mark lesson visited (idempotent). Uses V3-compatible pageId key.
      await markVisited(`lesson:${courseSlug}:${lessonSlug}`);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  });

  // ----- Audio --------------------------------------------------------------

  function onAudioPlay() {
    audioPlaying = true;
  }
  function onAudioPause() {
    audioPlaying = false;
  }
  function onAudioTimeUpdate() {
    if (!audioEl) return;
    if (audioEl.duration && isFinite(audioEl.duration)) {
      audioProgress = audioEl.currentTime / audioEl.duration;
    }
  }
  function onAudioEnded() {
    audioPlaying = false;
    audioProgress = 1;
  }

  // ----- Nav ----------------------------------------------------------------

  // V9 — on the FIRST completion of a lesson we hold the navigation and
  // show the QuizVictory 'lesson' celebration; 'Continuar' then executes
  // the pending goto. Repeat completions navigate straight through.
  let pendingHref = $state<string | null>(null);

  async function completeAndGo(href: string) {
    // V8 XP integrity: completeLessonOnce checks the 'lesson-done:' row in
    // Dexie BEFORE awarding, so lesson_complete pays exactly once per lesson.
    let first = false;
    try {
      first = await completeLessonOnce(courseSlug, lessonSlug);
    } catch (e) {
      console.error('[lesson] completion mark failed', e);
    }
    if (first) {
      pendingHref = href;
    } else {
      goto(href);
    }
  }

  function goNext() {
    if (!lesson?.nextLesson) return;
    void completeAndGo(`/escola/licao/${courseSlug}/${lesson.nextLesson}/`);
  }
  function goPrev() {
    if (!lesson?.prevLesson) return;
    goto(`/escola/licao/${courseSlug}/${lesson.prevLesson}/`);
  }
  function goQuiz() {
    if (!lesson?.quizSlug) return;
    // Same idempotent path when finishing via the quiz.
    void completeAndGo(`/escola/quiz/${lesson.quizSlug}/`);
  }
  function continuePending() {
    const href = pendingHref;
    pendingHref = null;
    if (href) goto(href);
  }
</script>

{#if loadError}
  <p class="error">{$t('lesson.error.load', { default: 'Erro a carregar a lição' })}: {loadError}</p>
{:else if !lesson}
  <p class="loading">{$t('lesson.loading', { default: 'A carregar lição…' })}</p>
{:else}
  <article class="lesson">
    <header class="lesson-head">
      <span class="tag">{$t('lesson.tag', { default: 'Lição' })}</span>
      <h1>{lesson.title}</h1>
      <p class="breadcrumb">
        <a href="/escola/">{$t('lesson.breadcrumb.escola', { default: 'Escola' })}</a>
        <span class="sep">›</span>
        <a href="/escola/curso/{courseSlug}/">{courseSlug}</a>
        <span class="sep">›</span>
        <span>{lesson.title}</span>
      </p>
    </header>

    <!-- Audio player ------------------------------------------------------ -->
    {#if lesson.audio}
      <section class="audio-card" aria-label={$t('lesson.audio.aria', { default: 'Audio walkthrough' })}>
        <div class="audio-row">
          <span class="audio-icon" aria-hidden="true">{audioPlaying ? '🔊' : '🎧'}</span>
          <div class="audio-meta">
            <strong>{lesson.audioLabel ?? $t('lesson.audio.label', { default: 'Audio walkthrough' })}</strong>
            <div class="audio-bar" aria-hidden="true">
              <div class="audio-fill" style="width: {Math.round(audioProgress * 100)}%"></div>
            </div>
          </div>
          <audio
            bind:this={audioEl}
            controls
            preload="metadata"
            src={lesson.audio}
            onplay={onAudioPlay}
            onpause={onAudioPause}
            ontimeupdate={onAudioTimeUpdate}
            onended={onAudioEnded}
          ></audio>
        </div>
      </section>
    {/if}

    <!-- IA V7.1: every aula is framed as Teoria → Quiz → Teste/Trabalho. -->
    <section class="activity-map" aria-label={$t('lesson.activity.aria')}>
      <div class="activity-step active">
        <span aria-hidden="true">📖</span>
        <strong>{$t('lesson.activity.theory.title')}</strong>
        <small>{$t('lesson.activity.theory.body')}</small>
      </div>
      <button type="button" class="activity-step" class:disabled={!lesson.quizSlug} onclick={goQuiz} disabled={!lesson.quizSlug}>
        <span aria-hidden="true">📝</span>
        <strong>Quiz</strong>
        <small>{lesson.quizSlug ? $t('lesson.activity.quiz.ready') : $t('lesson.activity.quiz.none')}</small>
      </button>
      <div class="activity-step muted">
        <span aria-hidden="true">🎯</span>
        <strong>{$t('lesson.activity.assignment.title')}</strong>
        <small>{$t('lesson.activity.assignment.body')}</small>
      </div>
    </section>

    <!-- Body + Key points sidebar ---------------------------------------- -->
    <div class="lesson-grid">
      <div class="lesson-body">
        <div class="step-progress" aria-hidden="true">
          <div class="step-fill" style="width: {Math.round(((step + 1) / totalSteps) * 100)}%"></div>
        </div>
        <p class="step-count">{$t('lesson.step.count', { values: { n: step + 1, total: totalSteps }, default: 'Passo {n} de {total}' })}</p>
        {#each steps[step] ?? [] as section, i (i)}
          {#if section.type === 'h2'}
            <h2>{section.text}</h2>
          {:else if section.type === 'h3'}
            <h3>{section.text}</h3>
          {:else if section.type === 'p'}
            <p>{section.text}</p>
          {:else if section.type === 'ul'}
            <ul>
              {#each section.items as item, j (j)}
                <li>{item}</li>
              {/each}
            </ul>
          {:else if section.type === 'callout'}
            <aside class="callout callout-{section.variant ?? 'info'}">{section.text}</aside>
          {:else if section.type === 'img'}
            <figure class="lesson-figure">
              <img src={section.src} alt={section.alt} loading="lazy" />
              {#if section.caption}
                <figcaption>{section.caption}</figcaption>
              {/if}
            </figure>
          {/if}
        {/each}

        <div class="step-bar">
          {#if step > 0}
            <button type="button" class="step-back" onclick={prevStep}>← {$t('lesson.step.back', { default: 'Anterior' })}</button>
          {/if}
          <button type="button" class="step-next" onclick={nextStep}>
            {#if !isLastStep}
              {$t('lesson.step.next', { default: 'Continuar →' })}
            {:else if lesson.quizSlug}
              {$t('lesson.step.quiz', { default: 'Ir para o quiz →' })}
            {:else}
              {$t('lesson.step.finish', { default: 'Concluir ✓' })}
            {/if}
          </button>
        </div>
      </div>

      {#if isLastStep}
        <aside class="keypoints" aria-label={$t('lesson.keypoints.aria', { default: 'Pontos-chave' })}>
          <h2>{$t('lesson.keypoints.title', { default: '🔑 Pontos-chave' })}</h2>
          <ol>
            {#each lesson.keyPoints as kp, i (i)}
              <li>{kp}</li>
            {/each}
          </ol>
          {#if lesson.quizSlug}
            <p class="quiz-context">{$t('lesson.quiz.linked')}</p>
            <button type="button" class="quiz-btn" onclick={goQuiz}>
              {$t('lesson.quiz.cta', { default: 'Ir para o quiz →' })}
            </button>
          {/if}
        </aside>
      {/if}
    </div>

    <!-- Nav footer --------------------------------------------------------- -->
    <nav class="lesson-nav" aria-label={$t('lesson.nav.aria', { default: 'Navegação entre lições' })}>
      <button
        type="button"
        class="nav-btn"
        onclick={goPrev}
        disabled={!lesson.prevLesson}
      >{$t('lesson.nav.prev', { default: '← Anterior' })}</button>

      <span class="progress-dots" aria-hidden="true">
        <span class="dot" class:active={lesson.prevLesson === null}></span>
        <span class="dot" class:active={!!lesson.prevLesson}></span>
        <span class="dot" class:active={!!lesson.nextLesson}></span>
      </span>

      <button
        type="button"
        class="nav-btn primary"
        onclick={goNext}
        disabled={!lesson.nextLesson}
      >{$t('lesson.nav.next', { default: 'Próxima →' })}</button>
    </nav>
  </article>

  {#if pendingHref}
    <QuizVictory
      variant="lesson"
      xp={XP_TABLE.lesson_complete}
      courseSlug={courseSlug}
      oncontinue={continuePending}
      onclose={continuePending}
    />
  {/if}
{/if}

<style>
  .lesson { max-width: 960px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
  .lesson-head { margin-bottom: 1rem; }
  .lesson-head h1 { color: var(--txt); margin: 0.25rem 0 0.5rem; }
  .tag {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    background: color-mix(in srgb, var(--accent) 25%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
    color: var(--accent);
    border-radius: 999px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .breadcrumb {
    color: var(--txt3);
    font-size: 0.85rem;
    margin: 0;
  }
  .breadcrumb a { color: var(--accent); text-decoration: none; }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }

  /* Audio */
  .audio-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    margin-bottom: 1.5rem;
  }
  .audio-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .audio-icon { font-size: 1.4rem; }
  .audio-meta { flex: 1; min-width: 200px; }
  .audio-meta strong { color: var(--txt); font-size: 0.9rem; display: block; margin-bottom: 0.3rem; }
  .audio-bar {
    width: 100%;
    height: 4px;
    background: var(--border-strong);
    border-radius: 2px;
    overflow: hidden;
  }
  .audio-fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.2s linear;
  }
  .audio-card audio { height: 44px; max-width: 260px; }
  /* Touch-target bump: ensure the native <audio> element + any
     custom control wrappers meet the 44×44 px minimum from the
     Presuntinho a11y contract (tappable on mobile, keyboard reachable). */
  .audio-card audio { min-height: 44px; min-width: 44px; }

  .activity-map {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.6rem;
    margin: 0 0 1.2rem;
  }
  .activity-step {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 0.65rem;
    align-items: center;
    min-height: 64px;
    padding: 0.75rem 0.85rem;
    border-radius: 0.85rem;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--txt);
    text-align: left;
    font: inherit;
  }
  button.activity-step { cursor: pointer; }
  .activity-step.active { border-color: color-mix(in srgb, var(--accent) 35%, transparent); background: color-mix(in srgb, var(--accent) 13%, transparent); }
  .activity-step.muted { opacity: 0.82; }
  .activity-step.disabled { opacity: 0.45; cursor: not-allowed; }
  .activity-step span { grid-row: span 2; font-size: 1.35rem; }
  .activity-step strong { line-height: 1; }
  .activity-step small { color: var(--txt3); }
  @media (min-width: 720px) {
    .activity-map { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }

  /* Grid layout: body + sidebar */
  .lesson-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
  }
  @media (min-width: 800px) {
    .lesson-grid { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
  }

  /* Body */
  .lesson-body { color: var(--txt, #fff); line-height: 1.6; }
  /* ── Duolingo-style stepped theory ── */
  .step-progress {
    height: 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent, #3b82f6) 18%, var(--border));
    overflow: hidden;
    margin-bottom: 0.4rem;
  }
  .step-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--accent, #3b82f6), #a78bfa);
    transition: width 260ms cubic-bezier(0.2, 0.9, 0.3, 1);
  }
  .step-count { margin: 0 0 1rem; font-size: 0.78rem; font-weight: 800; color: var(--txt3, #94a3b8); }
  .step-bar {
    display: flex;
    gap: 0.6rem;
    margin-top: 1.4rem;
    padding-top: 1rem;
    border-top: 1px solid color-mix(in srgb, var(--accent, #3b82f6) 20%, transparent);
  }
  .step-next {
    margin-inline-start: auto;
    min-height: 48px;
    padding: 0 1.6rem;
    border: none;
    border-radius: 0.8rem;
    background: var(--accent);
    color: var(--on-accent);
    font: inherit;
    font-weight: 900;
    cursor: pointer;
  }
  .step-next:active { transform: scale(0.97); }
  .step-back {
    min-height: 48px;
    padding: 0 1.1rem;
    border: 1.5px solid color-mix(in srgb, var(--accent, #3b82f6) 35%, transparent);
    border-radius: 0.8rem;
    background: transparent;
    color: var(--txt, #fff);
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  .lane-title {
    margin-top: 0 !important;
    padding-bottom: 0.45rem;
    border-bottom: 1px solid var(--border);
  }
  .lesson-body h2 {
    color: var(--txt);
    font-size: 1.25rem;
    margin: 1.5rem 0 0.5rem;
  }
  .lesson-body h3 {
    color: var(--txt);
    font-size: 1.05rem;
    margin: 1.25rem 0 0.5rem;
  }
  .lesson-body p { color: var(--txt2); margin: 0.5rem 0; }
  .lesson-body ul {
    color: var(--txt2);
    margin: 0.5rem 0 0.5rem 1.25rem;
    padding: 0;
  }
  .lesson-body ul li { margin: 0.3rem 0; }
  .lesson-figure {
    margin: 1rem 0;
    background: var(--card);
    border-radius: 0.5rem;
    padding: 0.5rem;
  }
  .lesson-figure img { width: 100%; height: auto; display: block; border-radius: 0.4rem; }
  .lesson-figure figcaption {
    color: var(--txt3);
    font-size: 0.8rem;
    text-align: center;
    margin-top: 0.4rem;
  }

  /* Callouts */
  .callout {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    margin: 1rem 0;
    border-left: 4px solid;
    font-size: 0.95rem;
  }
  .callout-info { background: rgba(59, 130, 246, 0.12); border-color: #3b82f6; color: var(--txt); }
  .callout-warning { background: rgba(245, 158, 11, 0.12); border-color: var(--warning); color: var(--txt); }
  .callout-success { background: rgba(16, 185, 129, 0.12); border-color: var(--success); color: var(--txt); }
  .callout-highlight {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-color: var(--accent);
    color: var(--txt);
    font-weight: 500;
  }

  /* Sidebar */
  .keypoints {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
    align-self: start;
    position: sticky;
    top: 1rem;
  }
  .keypoints h2 {
    color: var(--txt);
    font-size: 1rem;
    margin: 0 0 0.5rem;
  }
  .keypoints ol {
    color: var(--txt2);
    margin: 0 0 1rem 1.25rem;
    padding: 0;
    font-size: 0.9rem;
  }
  .keypoints ol li { margin: 0.4rem 0; }
  .quiz-btn {
    display: inline-block;
    width: 100%;
    padding: 0.6rem 1rem;
    background: var(--accent);
    color: var(--on-accent);
    border: 0;
    border-radius: 0.5rem;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
  }
  .quiz-btn:hover { background: var(--accent-hover, var(--accent)); }

  /* Nav */
  .lesson-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }
  .nav-btn {
    padding: 0.6rem 1.25rem;
    background: var(--card);
    border: 1px solid var(--border-strong);
    color: var(--txt);
    border-radius: 0.5rem;
    cursor: pointer;
    font: inherit;
    font-weight: 500;
    text-decoration: none;
  }
  .nav-btn:hover:not(:disabled) { background: var(--card-hover); }
  .nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .nav-btn.primary {
    background: var(--accent);
    border-color: transparent;
    color: var(--on-accent);
  }
  .nav-btn.primary:hover:not(:disabled) { background: var(--accent-hover, var(--accent)); }

  .progress-dots { display: flex; gap: 0.4rem; }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border-strong);
  }
  .dot.active { background: var(--accent); }

  .loading, .error { color: var(--txt2); text-align: center; padding: 2rem 0; }
  .error { color: var(--error); }
</style>
