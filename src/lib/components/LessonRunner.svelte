<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { markVisited } from '$lib/state/stores';
  import { t } from 'svelte-i18n';

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

  function goNext() {
    if (!lesson?.nextLesson) return;
    goto(`/escola/licao/${courseSlug}/${lesson.nextLesson}/`);
  }
  function goPrev() {
    if (!lesson?.prevLesson) return;
    goto(`/escola/licao/${courseSlug}/${lesson.prevLesson}/`);
  }
  function goQuiz() {
    if (!lesson?.quizSlug) return;
    goto(`/escola/quiz/${lesson.quizSlug}/`);
  }
</script>

{#if loadError}
  <p class="error">{$t('lesson.error', { values: { error: loadError } })}</p>
{:else if !lesson}
  <p class="loading">{$t('lesson.loading')}</p>
{:else}
  <article class="lesson">
    <header class="lesson-head">
      <span class="tag">{$t('lesson.tag')}</span>
      <h1>{lesson.title}</h1>
      <p class="breadcrumb">
        <a href="/escola/">{$t('lesson.school')}</a>
        <span class="sep">›</span>
        <a href="/escola/curso/{courseSlug}/">{courseSlug}</a>
        <span class="sep">›</span>
        <span>{lesson.title}</span>
      </p>
    </header>

    <!-- Audio player ------------------------------------------------------ -->
    <section class="audio-card" aria-label={$t('lesson.audio_aria')}>
      <div class="audio-row">
        <span class="audio-icon" aria-hidden="true">{audioPlaying ? '🔊' : '🎧'}</span>
        <div class="audio-meta">
          <strong>{lesson.audioLabel ?? $t('lesson.audio_default')}</strong>
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

    <!-- Body + Key points sidebar ---------------------------------------- -->
    <div class="lesson-grid">
      <div class="lesson-body">
        {#each lesson.sections as section, i (i)}
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
      </div>

      <aside class="keypoints" aria-label={$t('lesson.keypoints_aria')}>
        <h2>{$t('lesson.keypoints_title')}</h2>
        <ol>
          {#each lesson.keyPoints as kp, i (i)}
            <li>{kp}</li>
          {/each}
        </ol>
        {#if lesson.quizSlug}
          <button type="button" class="quiz-btn" onclick={goQuiz}>
            {$t('lesson.quiz_cta')}
          </button>
        {/if}
      </aside>
    </div>

    <!-- Nav footer --------------------------------------------------------- -->
    <nav class="lesson-nav" aria-label={$t('lesson.nav_aria')}>
      <button
        type="button"
        class="nav-btn"
        onclick={goPrev}
        disabled={!lesson.prevLesson}
      >{$t('lesson.prev')}</button>

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
      >{$t('lesson.next')}</button>
    </nav>
  </article>
{/if}

<style>
  .lesson { max-width: 960px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
  .lesson-head { margin-bottom: 1rem; }
  .lesson-head h1 { color: #fff; margin: 0.25rem 0 0.5rem; }
  .tag {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    background: rgba(59, 130, 246, 0.25);
    border: 1px solid rgba(59, 130, 246, 0.5);
    color: #bfdbfe;
    border-radius: 999px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .breadcrumb {
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    margin: 0;
  }
  .breadcrumb a { color: var(--accent, #ec4899); text-decoration: none; }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }

  /* Audio */
  .audio-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
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
  .audio-meta strong { color: #fff; font-size: 0.9rem; display: block; margin-bottom: 0.3rem; }
  .audio-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
    overflow: hidden;
  }
  .audio-fill {
    height: 100%;
    background: var(--accent, #ec4899);
    transition: width 0.2s linear;
  }
  .audio-card audio { height: 44px; max-width: 260px; }
  /* Touch-target bump: ensure the native <audio> element + any
     custom control wrappers meet the 44×44 px minimum from the
     Presuntinho a11y contract (tappable on mobile, keyboard reachable). */
  .audio-card audio { min-height: 44px; min-width: 44px; }

  /* Grid layout: body + sidebar */
  .lesson-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  @media (min-width: 800px) {
    .lesson-grid { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
  }

  /* Body */
  .lesson-body { color: var(--txt, #fff); line-height: 1.6; }
  .lesson-body h2 {
    color: #fff;
    font-size: 1.25rem;
    margin: 1.5rem 0 0.5rem;
  }
  .lesson-body h3 {
    color: #fff;
    font-size: 1.05rem;
    margin: 1.25rem 0 0.5rem;
  }
  .lesson-body p { color: var(--txt2, #cbd5e1); margin: 0.5rem 0; }
  .lesson-body ul {
    color: var(--txt2, #cbd5e1);
    margin: 0.5rem 0 0.5rem 1.25rem;
    padding: 0;
  }
  .lesson-body ul li { margin: 0.3rem 0; }
  .lesson-figure {
    margin: 1rem 0;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 0.5rem;
    padding: 0.5rem;
  }
  .lesson-figure img { width: 100%; height: auto; display: block; border-radius: 0.4rem; }
  .lesson-figure figcaption {
    color: var(--txt3, #94a3b8);
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
  .callout-info { background: rgba(59, 130, 246, 0.12); border-color: #3b82f6; color: #bfdbfe; }
  .callout-warning { background: rgba(245, 158, 11, 0.12); border-color: #f59e0b; color: #fde68a; }
  .callout-success { background: rgba(16, 185, 129, 0.12); border-color: #10b981; color: #a7f3d0; }
  .callout-highlight {
    background: rgba(236, 72, 153, 0.12);
    border-color: var(--accent, #ec4899);
    color: #fbcfe8;
    font-weight: 500;
  }

  /* Sidebar */
  .keypoints {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
    align-self: start;
    position: sticky;
    top: 1rem;
  }
  .keypoints h2 {
    color: #fff;
    font-size: 1rem;
    margin: 0 0 0.5rem;
  }
  .keypoints ol {
    color: var(--txt2, #cbd5e1);
    margin: 0 0 1rem 1.25rem;
    padding: 0;
    font-size: 0.9rem;
  }
  .keypoints ol li { margin: 0.4rem 0; }
  .quiz-btn {
    display: inline-block;
    width: 100%;
    padding: 0.6rem 1rem;
    background: var(--accent, #ec4899);
    color: #fff;
    border: 0;
    border-radius: 0.5rem;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
  }
  .quiz-btn:hover { background: #d63780; }

  /* Nav */
  .lesson-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }
  .nav-btn {
    padding: 0.6rem 1.25rem;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #fff;
    border-radius: 0.5rem;
    cursor: pointer;
    font: inherit;
    font-weight: 500;
    text-decoration: none;
  }
  .nav-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); }
  .nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .nav-btn.primary {
    background: var(--accent, #ec4899);
    border-color: transparent;
  }
  .nav-btn.primary:hover:not(:disabled) { background: #d63780; }

  .progress-dots { display: flex; gap: 0.4rem; }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
  }
  .dot.active { background: var(--accent, #ec4899); }

  .loading, .error { color: rgba(255, 255, 255, 0.7); text-align: center; padding: 2rem 0; }
  .error { color: #ff8888; }
</style>
