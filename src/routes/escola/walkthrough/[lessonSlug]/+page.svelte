<script lang="ts">
  /**
   * Walkthrough (`/escola/walkthrough/[lessonSlug]/`).
   *
   * A focused, audio-first view of a single equivalenza lesson:
   *   - Big audio player at the top
   *   - Sticky mini-nav (desktop) / top mini-nav (mobile) for sections
   *   - Transcript + section content rendered below
   *   - "Começar trabalho" CTA at the bottom
   *
   * Audio slug → mp3 mapping mirrors the assignment `audioSlug` field.
   */

  import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { t } from 'svelte-i18n';

  // ---------------------------------------------------------------------
  // Lesson type (loose — covers text/list/callout/table/h2_intro)
  // ---------------------------------------------------------------------

  type Section =
    | { type: 'text' | 'h2_intro'; title?: string; content: string }
    | { type: 'callout'; title?: string; content: string; variant?: string }
    | { type: 'list'; title?: string; items: string[] }
    | { type: 'table'; title?: string; columns: string[]; rows: string[][] };

  interface LessonData {
    id: string;
    courseSlug: string;
    title: string;
    audio: string;
    audioLabel?: string;
    transcript?: string;
    sections: Section[];
    keyPoints?: string[];
    quizSlug?: string | null;
  }

  // ---------------------------------------------------------------------
  // Audio slug → file mapping
  // ---------------------------------------------------------------------

  const AUDIO_MAP: Record<string, string> = {
    swot: '/legacy/assets/intro_swot.mp3',
    persona: '/legacy/assets/persona_problem.mp3',
    problem: '/legacy/assets/persona_problem.mp3',
    tows: '/legacy/assets/tows_recommendation.mp3',
    recommendation: '/legacy/assets/tows_recommendation.mp3'
  };

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------

  let lesson = $state<LessonData | null>(null);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  let lessonSlug = $derived(page.params.lessonSlug ?? '');
  let audioSrc = $derived(AUDIO_MAP[lessonSlug] ?? '');
  let transcript = $derived(
    lesson?.transcript ?? synthesizeTranscript(lesson)
  );

  onMount(async () => {
    try {
      const res = await fetch(`/lessons/equivalenza/${lessonSlug}.json`, {
        cache: 'no-store'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as LessonData;
      lesson = data;
    } catch (e) {
      loadError =
        e instanceof Error ? e.message : 'Não foi possível carregar o walkthrough.';
    } finally {
      loading = false;
    }
  });

  /** Build a transcript by concatenating text/list section content. */
  function synthesizeTranscript(l: LessonData | null): string {
    if (!l) return '';
    const parts: string[] = [];
    for (const s of l.sections) {
      if (s.type === 'text' || s.type === 'h2_intro') {
        if ('title' in s && s.title) parts.push(`${s.title}.`);
        if ('content' in s) parts.push(s.content);
      } else if (s.type === 'list' && 'items' in s) {
        if ('title' in s && s.title) parts.push(`${s.title}.`);
        parts.push(s.items.join('. '));
      } else if (s.type === 'callout') {
        if ('title' in s && s.title) parts.push(`${s.title}.`);
        if ('content' in s) parts.push(s.content);
      } else if (s.type === 'table') {
        if ('title' in s && s.title) parts.push(`${s.title}.`);
      }
    }
    return parts.join(' ');
  }

  function jumpTo(id: string): void {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(id);
    if (!el) return;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({
      behavior: prefersReduced ? 'auto' : 'smooth',
      block: 'start'
    });
  }

  function sectionId(idx: number, s: Section): string {
    return `wt-${idx}-${s.type}`;
  }

  function sectionTitle(s: Section, idx: number): string {
    if ('title' in s && s.title) return s.title;
    return `Secção ${idx + 1}`;
  }

  let pageTitle = $derived(
    lesson ? `${lesson.title} · Walkthrough · Escola` : 'Walkthrough · Escola'
  );
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta
    name="description"
    content="Audio walkthrough + transcrição + pontos-chave da lição {lessonSlug}."
  />
</svelte:head>

<div class="walkthrough">
  {#if loading}
    <p class="state">A carregar walkthrough…</p>
  {:else if loadError || !lesson}
    <div class="state error" role="alert">
      <p>⚠️ {loadError ?? 'Lição não encontrada.'}</p>
      <p>{$t('walkthrough.verify.text', { default: 'Verifica que' })} <code>/lessons/equivalenza/{lessonSlug}.json</code> {$t('walkthrough.verify.exists', { default: 'existe.' })}</p>
      <p><a href="/escola/">← Voltar à Escola</a></p>
    </div>
  {:else}
    <!-- Breadcrumb -->
    <nav class="crumbs" aria-label="Caminho de navegação">
      <a href="/">{$t('walkthrough.breadcrumb.home', { default: '← Hub' })}</a>
      <span aria-hidden="true">/</span>
      <a href="/escola/">{$t('walkthrough.breadcrumb.escola', { default: 'Escola' })}</a>
      <span aria-hidden="true">/</span>
      <a href="/escola/curso/equivalenza/">{$t('walkthrough.breadcrumb.curso', { default: 'Equivalenza' })}</a>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{$t('walkthrough.breadcrumb.current', { default: 'Walkthrough' })}</span>
    </nav>
    <!-- Hero -->
    <header class="head">
      <span class="tag">🎧 Walkthrough</span>
      <h1>{lesson.title}</h1>
      {#if lesson.audioLabel}
        <p class="sub">{lesson.audioLabel}</p>
      {/if}
    </header>

    <!-- Audio player (big) -->
    <section class="audio-card" aria-label="Audio walkthrough">
      {#if audioSrc}
        <div class="audio-icon" aria-hidden="true">🎧</div>
        <div class="audio-meta">
          <p class="audio-title">Audio walkthrough</p>
          <audio
            controls
            preload="metadata"
            src={audioSrc}
            aria-label={`Audio walkthrough da lição ${lesson.title}`}
          >
            <track kind="captions" />
            <a href={audioSrc}>{$t('walkthrough.audio.download', { default: 'Descarregar áudio' })}</a>
          </audio>
          <p class="audio-fallback">
            Não consegues ouvir? <a href={audioSrc} download>{$t('walkthrough.audio.download', { default: 'Descarregar áudio' })}</a>.
          </p>
        </div>
      {:else}
        <p class="audio-missing">Sem ficheiro de áudio para esta lição.</p>
      {/if}
    </section>

    <!-- Sticky mini-nav (desktop) -->
    <aside class="mini-nav" aria-label="Saltar para secção">
      <h2>🗂 Saltar</h2>
      <ol>
        {#each lesson.sections as section, idx (idx)}
          <li>
            <a
              class="mini-link"
              href={`#${sectionId(idx, section)}`}
              onclick={(e) => {
                e.preventDefault();
                jumpTo(sectionId(idx, section));
              }}
            >
              {idx + 1}. {sectionTitle(section, idx)}
            </a>
          </li>
        {/each}
        {#if lesson.keyPoints && lesson.keyPoints.length > 0}
          <li>
            <a
              class="mini-link"
              href="#key-points"
              onclick={(e) => {
                e.preventDefault();
                jumpTo('key-points');
              }}
            >
              ⭐ Pontos-chave
            </a>
          </li>
        {/if}
        <li>
          <a
            class="mini-link"
            href="#transcript"
            onclick={(e) => {
              e.preventDefault();
              jumpTo('transcript');
            }}
          >
            📝 Transcrição
          </a>
        </li>
      </ol>
    </aside>

    <!-- Sections -->
    <article class="content">
      {#each lesson.sections as section, idx (idx)}
        <section
          id={sectionId(idx, section)}
          class="section section-{section.type}"
          aria-labelledby={`${sectionId(idx, section)}-h`}
        >
          <h2 id={`${sectionId(idx, section)}-h`}>
            <span class="section-num">{idx + 1}</span>
            {sectionTitle(section, idx)}
          </h2>
          {#if section.type === 'text' || section.type === 'h2_intro'}
            <p class="prose">{section.content}</p>
          {:else if section.type === 'callout'}
            <div class={`callout ${section.variant ?? 'info'}`}>
              <p>{section.content}</p>
            </div>
          {:else if section.type === 'list'}
            <ul class="list">
              {#each section.items as item, ii (ii)}
                <li>{item}</li>
              {/each}
            </ul>
          {:else if section.type === 'table'}
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    {#each section.columns as col, ci (ci)}
                      <th scope="col">{col}</th>
                    {/each}
                  </tr>
                </thead>
                <tbody>
                  {#each section.rows as row, ri (ri)}
                    <tr>
                      {#each row as cell, ci (ci)}
                        <td>{cell}</td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </section>
      {/each}

      <!-- Key points -->
      {#if lesson.keyPoints && lesson.keyPoints.length > 0}
        <section
          id="key-points"
          class="section key-points"
          aria-labelledby="key-points-h"
        >
          <h2 id="key-points-h">
            <span class="section-num">⭐</span>
            Pontos-chave
          </h2>
          <ul class="key-list">
            {#each lesson.keyPoints as kp, i (i)}
              <li>{kp}</li>
            {/each}
          </ul>
        </section>
      {/if}

      <!-- Transcript -->
      {#if transcript}
        <section
          id="transcript"
          class="section transcript"
          aria-labelledby="transcript-h"
        >
          <h2 id="transcript-h">
            <span class="section-num">📝</span>
            Transcrição
          </h2>
          <details>
            <summary>Mostrar transcrição completa</summary>
            <p class="prose">{transcript}</p>
          </details>
        </section>
      {/if}
    </article>

    <!-- CTA -->
    <div class="cta-row">
      <a class="cta" href={`/trabalhos/assignment/${lessonSlug}/`}>
        📝 Começar trabalho →
      </a>
      <a class="secondary" href="/escola/curso/equivalenza/">
        ← Voltar ao curso
      </a>
    </div>
  {/if}
</div>

<style>
  .walkthrough {
    max-width: 880px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }

  .crumbs {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    font-size: 0.85rem;
    color: var(--txt3, #94a3b8);
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .crumbs a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .crumbs a:hover, .crumbs a:focus-visible { text-decoration: underline; }

  .head { text-align: left; margin-bottom: 1rem; }
  .tag {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    background: rgba(168, 85, 247, 0.18);
    border: 1px solid rgba(168, 85, 247, 0.4);
    color: #e9d5ff;
    border-radius: 999px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }
  .head h1 {
    color: #fff;
    margin: 0.25rem 0 0;
    font-size: 1.75rem;
  }
  .sub {
    color: var(--txt2, #cbd5e1);
    margin: 0.25rem 0 0;
  }

  .state {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1.25rem;
    color: var(--txt2, #cbd5e1);
  }
  .state.error { border-left: 4px solid var(--error, #ef4444); }
  .state code {
    background: rgba(0, 0, 0, 0.25);
    padding: 0.05rem 0.35rem;
    border-radius: 0.25rem;
    font-size: 0.85em;
  }

  /* Audio */
  .audio-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem;
    background: rgba(168, 85, 247, 0.08);
    border: 1px solid rgba(168, 85, 247, 0.3);
    border-radius: 0.75rem;
    margin-bottom: 1.5rem;
  }
  .audio-icon {
    font-size: 2.5rem;
    flex-shrink: 0;
  }
  .audio-meta { flex: 1; min-width: 0; }
  .audio-title {
    color: #fff;
    margin: 0 0 0.5rem;
    font-weight: 600;
  }
  audio {
    width: 100%;
    min-height: 44px;
  }
  .audio-fallback {
    color: var(--txt3, #94a3b8);
    font-size: 0.8rem;
    margin: 0.4rem 0 0;
  }
  .audio-fallback a { color: var(--accent, #ec4899); }
  .audio-missing {
    color: var(--txt3, #94a3b8);
    margin: 0;
    font-style: italic;
  }

  /* Mini-nav */
  .mini-nav {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.6rem;
    padding: 0.85rem 1rem;
    margin-bottom: 1.25rem;
  }
  .mini-nav h2 {
    color: var(--txt3, #94a3b8);
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .mini-nav ol {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .mini-link {
    display: block;
    min-height: 44px;
    padding: 0.5rem 0.6rem;
    color: var(--txt2, #cbd5e1);
    text-decoration: none;
    border-radius: 0.4rem;
    font-size: 0.9rem;
    transition: background 0.15s;
  }
  .mini-link:hover, .mini-link:focus-visible {
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    outline: none;
  }

  @media (min-width: 1024px) {
    .mini-nav {
      position: sticky;
      top: 0.75rem;
      z-index: 5;
    }
  }

  /* Sections */
  .content {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .section {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.6rem;
    padding: 1rem 1.15rem;
    scroll-margin-top: 0.75rem;
  }
  .section h2 {
    color: #fff;
    margin: 0 0 0.6rem;
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .section-num {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(168, 85, 247, 0.25);
    color: #e9d5ff;
    border-radius: 50%;
    font-weight: 700;
    font-size: 0.85rem;
  }

  .prose {
    color: var(--txt2, #cbd5e1);
    line-height: 1.65;
    margin: 0;
  }

  .callout {
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-left: 4px solid #3b82f6;
    border-radius: 0.5rem;
    padding: 0.85rem 1rem;
    color: var(--txt2, #cbd5e1);
    line-height: 1.55;
  }
  .callout p { margin: 0; }
  .callout.warning { border-left-color: #f59e0b; background: rgba(245, 158, 11, 0.08); }
  .callout.success { border-left-color: #10b981; background: rgba(16, 185, 129, 0.08); }
  .callout.highlight { border-left-color: #ec4899; background: rgba(236, 72, 153, 0.08); }
  .callout.info { border-left-color: #3b82f6; }

  .list {
    margin: 0;
    padding-left: 1.4rem;
    color: var(--txt2, #cbd5e1);
    line-height: 1.6;
  }
  .list li { margin-bottom: 0.4rem; }

  .table-wrap { overflow-x: auto; }
  table {
    width: 100%;
    border-collapse: collapse;
    color: var(--txt2, #cbd5e1);
    font-size: 0.9rem;
  }
  th, td {
    padding: 0.5rem 0.65rem;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  th {
    color: var(--txt3, #94a3b8);
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.04em;
  }

  .key-points { background: rgba(245, 158, 11, 0.05); border-color: rgba(245, 158, 11, 0.3); }
  .key-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .key-list li {
    background: rgba(0, 0, 0, 0.18);
    padding: 0.6rem 0.85rem;
    border-radius: 0.4rem;
    color: #fde68a;
    border-left: 3px solid #f59e0b;
  }

  .transcript details {
    background: rgba(0, 0, 0, 0.18);
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
  }
  .transcript summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--txt, #fff);
    min-height: 44px;
    display: flex;
    align-items: center;
    list-style: none;
  }
  .transcript summary::-webkit-details-marker { display: none; }
  .transcript summary::before {
    content: '▸';
    margin-right: 0.5rem;
    color: var(--accent, #ec4899);
  }
  .transcript details[open] summary::before { content: '▾'; }
  .transcript .prose {
    margin-top: 0.75rem;
    color: var(--txt2, #cbd5e1);
  }

  /* CTA */
  .cta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
    align-items: center;
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .cta {
    display: inline-block;
    min-height: 44px;
    padding: 0.75rem 1.4rem;
    background: var(--accent, #ec4899);
    color: #fff;
    text-decoration: none;
    font-weight: 600;
    border-radius: 0.5rem;
    transition: filter 0.15s;
  }
  .cta:hover, .cta:focus-visible {
    filter: brightness(1.1);
    outline: none;
  }
  .secondary {
    display: inline-block;
    min-height: 44px;
    padding: 0.75rem 1.2rem;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--txt, #fff);
    text-decoration: none;
    border-radius: 0.5rem;
    transition: background 0.15s;
  }
  .secondary:hover, .secondary:focus-visible {
    background: rgba(255, 255, 255, 0.12);
    outline: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .mini-link, .cta, .secondary {
      transition: none;
    }
  }
  @media (min-width: 720px) {
    .head h1 { font-size: 2.25rem; }
    .cta-row { justify-content: flex-start; }
  }
</style>
