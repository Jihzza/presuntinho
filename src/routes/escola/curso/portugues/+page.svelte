<script lang="ts">
  /**
   * Português de Portugal — course hub (`/escola/curso/portugues/`).
   *
   * Data-driven: loads `static/lessons/portugues/curso.json` at mount
   * and renders each section inline (vowels table, vocab categories,
   * dialogues, verbs, prose, callouts, quiz_intro).
   *
   * Section-by-section progress + per-section "Marcar como estudado"
   * is stored in `localStorage` under `fat-pt-progress`:
   *
   *     { sections: { intro: { ts }, vowels: { ts }, ... },
   *       completedAt: 1234 }
   *
   * Behaviour mirrors V3 PWA precedents: graceful empty state when the
   * JSON is missing, prefers-reduced-motion respected, 44×44 touch
   * targets, ARIA labels everywhere.
   */

  import { onMount } from 'svelte';
    import { t } from 'svelte-i18n';

    // ---------------------------------------------------------------------
    // Types — minimal mirror of curso.json
    // ---------------------------------------------------------------------

  interface VowelRow {
    vogal: string;
    ipa: string;
    truque: string;
    ar: string;
    fr: string;
  }
  interface VocabWord {
    pt: string;
    en: string;
    ar: string;
    fr: string;
  }
  interface VocabCategory {
    name: string;
    words?: VocabWord[];
    phrases?: VocabWord[];
  }
  interface DialogueLine {
    speaker: 'A' | 'B';
    pt: string;
    en: string;
  }
  interface DialogueItem {
    title: string;
    lines: DialogueLine[];
  }
  interface Conjugations {
    eu: string;
    tu: string;
    ele: string;
    nos: string;
    eles: string;
  }
  interface VerbItem {
    infinitive: string;
    translation: string;
    ar: string;
    conjugations: Conjugations;
  }
  interface ExamplePair {
    pt: string;
    en: string;
  }
  interface CourseSection {
    type:
      | 'intro'
      | 'vowels'
      | 'vocab'
      | 'dialogues'
      | 'verbs'
      | 'final_tips'
      | 'quiz_intro';
    title: string;
    body?: string;
    data?: {
      rows?: VowelRow[];
      tunisianNotes?: string;
      categories?: VocabCategory[];
      items?: DialogueItem[] | VerbItem[];
      conjugations?: never;
      examples?: ExamplePair[];
    };
    quizSlug?: string;
  }
  interface CourseData {
    id: string;
    title: string;
    subtitle: string;
    icon: string;
    color: string;
    estimatedMinutes: number;
    sections: CourseSection[];
  }

  // ---------------------------------------------------------------------
  // Progress (localStorage)
  // ---------------------------------------------------------------------

  const PROGRESS_KEY = 'fat-pt-progress';
  interface ProgressState {
    sections: Record<string, { ts: number }>;
    completedAt: number | null;
  }
  let progress = $state<ProgressState>({ sections: {}, completedAt: null });

  function readProgress(): ProgressState {
    if (typeof localStorage === 'undefined') {
      return { sections: {}, completedAt: null };
    }
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw) return { sections: {}, completedAt: null };
      const parsed = JSON.parse(raw) as Partial<ProgressState>;
      return {
        sections: parsed.sections ?? {},
        completedAt: parsed.completedAt ?? null
      };
    } catch {
      return { sections: {}, completedAt: null };
    }
  }

  function writeProgress(next: ProgressState): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
    } catch {
      /* quota or disabled — ignore */
    }
  }

  function markSectionStudied(sectionKey: string): void {
    if (progress.sections[sectionKey]) return;
    const next: ProgressState = {
      ...progress,
      sections: { ...progress.sections, [sectionKey]: { ts: Date.now() } }
    };
    progress = next;
    writeProgress(next);
  }

  function markCourseComplete(): void {
    const next: ProgressState = { ...progress, completedAt: Date.now() };
    progress = next;
    writeProgress(next);
  }

  function unmarkCourseComplete(): void {
    const next: ProgressState = { ...progress, completedAt: null };
    progress = next;
    writeProgress(next);
  }

  // ---------------------------------------------------------------------
  // Course load
  // ---------------------------------------------------------------------

  let course = $state<CourseData | null>(null);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  onMount(async () => {
    progress = readProgress();
    try {
      const res = await fetch('/lessons/portugues/curso.json', {
        cache: 'no-store'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CourseData;
      course = data;
    } catch (e) {
      loadError =
        e instanceof Error ? e.message : 'Não foi possível carregar o curso.';
    } finally {
      loading = false;
    }
  });

  // ---------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------

  let totalSections = $derived(course?.sections.length ?? 0);
  let studiedCount = $derived(Object.keys(progress.sections).length);
  let progressPct = $derived(
    totalSections === 0 ? 0 : Math.round((studiedCount / totalSections) * 100)
  );
  let allStudied = $derived(
    totalSections > 0 && studiedCount >= totalSections
  );
  let isComplete = $derived(progress.completedAt !== null);

  let pageTitle = $derived(
    course ? `${course.title} · Curso PT · Escola` : 'Curso PT · Escola'
  );

  // Anchor scroll helper
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

  // Section key derivation (stable, slugified)
  function sectionKey(idx: number, s: CourseSection): string {
    return `${idx}-${s.type}`;
  }

  function sectionId(idx: number, s: CourseSection): string {
    return `pt-section-${idx}-${s.type}`;
  }

  function navId(idx: number, s: CourseSection): string {
    return sectionId(idx, s);
  }

  function isStudied(idx: number, s: CourseSection): boolean {
    return Boolean(progress.sections[sectionKey(idx, s)]);
  }
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta
    name="description"
    content="Mini-curso de Português de Portugal para a Fatma — vogais, vocabulário, diálogos e verbos com comparações Árabe + Francês + Inglês."
  />
</svelte:head>

<div class="pt-course">
  <header class="hero" style="--course-color: {course?.color ?? '#10b981'};">
    <p class="breadcrumb">
      <a href="/escola/">{$t('escola.curso.pt.breadcrumb.home', { default: '← Escola' })}</a>
      <span class="sep">›</span>
      <span>{$t('escola.curso.pt.breadcrumb.current', { default: 'Curso PT' })}</span>
    </p>
    {#if loading}
      <h1>🇵🇹 A carregar curso…</h1>
    {:else if loadError}
      <h1>🇵🇹 Curso de Português</h1>
      <p class="sub">Conteúdo temporariamente indisponível.</p>
    {:else if course}
      <span class="tag">🇵🇹 Curso</span>
      <h1>
        <span class="icon" aria-hidden="true">{course.icon}</span>
        {course.title}
      </h1>
      <p class="subtitle">{course.subtitle}</p>
      <p class="meta">
        <span>⏱ ~{course.estimatedMinutes} min</span>
        <span>📚 {course.sections.length} secções</span>
        <span>🎯 Badge: 🇵🇹 Lusófono (b11)</span>
      </p>
    {/if}
  </header>

  {#if loading}
    <p class="state">A carregar…</p>
  {:else if loadError}
    <div class="state error" role="alert">
      <p>⚠️ {loadError}</p>
      <p>{$t('escola.curso.pt.verify.text', { default: 'Verifica que o ficheiro' })} <code>static/lessons/portugues/curso.json</code> {$t('escola.curso.pt.verify.exists', { default: 'existe.' })}</p>
      <p><a href="/escola/">← Voltar à Escola</a></p>
    </div>
  {:else if course}
    <!-- Progress bar -->
    <section class="progress" aria-label="Progresso do curso">
      <div class="progress-meta">
        <span><strong>{studiedCount}</strong> / {totalSections} secções estudadas</span>
        <span aria-label="Percentagem">{progressPct}%</span>
      </div>
      <div class="progress-track" role="progressbar"
           aria-valuemin="0"
           aria-valuemax="100"
           aria-valuenow={progressPct}>
        <div class="progress-fill" style="width: {progressPct}%;"></div>
      </div>
    </section>

    <!-- Section navigator -->
    <nav class="section-nav" aria-label="Navegação por secção">
      <h2 class="section-title">🗂 Secções</h2>
      <ul>
        {#each course.sections as section, idx (sectionId(idx, section))}
          {@const studied = isStudied(idx, section)}
          <li>
            <a
              class="nav-link"
              class:studied
              href={`#${navId(idx, section)}`}
              onclick={(e) => {
                e.preventDefault();
                jumpTo(navId(idx, section));
              }}
            >
              <span class="nav-num">{idx + 1}</span>
              <span class="nav-title">{section.title}</span>
              <span class="nav-check" aria-hidden="true">{studied ? '✓' : '○'}</span>
            </a>
          </li>
        {/each}
      </ul>
    </nav>

    <!-- Sections inline -->
    <article class="sections">
      {#each course.sections as section, idx (sectionId(idx, section))}
        {@const studied = isStudied(idx, section)}
        <section
          id={sectionId(idx, section)}
          class="course-section"
          aria-labelledby={`${sectionId(idx, section)}-h`}
        >
          <header class="section-head">
            <h2 id={`${sectionId(idx, section)}-h`}>
              <span class="section-num">{idx + 1}</span>
              {section.title}
            </h2>
            {#if studied}
              <span class="studied-badge" aria-label="Estudado">✓ Estudado</span>
            {/if}
          </header>

          {#if section.type === 'intro'}
            <p class="prose">{section.body}</p>
          {:else if section.type === 'vowels'}
            {#if section.data?.tunisianNotes}
              <div class="callout info">
                <strong>🇹🇳 Notas tunisianas:</strong>
                {section.data.tunisianNotes}
              </div>
            {/if}
            {#if section.data?.rows}
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Vogal</th>
                      <th scope="col">IPA</th>
                      <th scope="col">Truque</th>
                      <th scope="col">AR</th>
                      <th scope="col">FR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each section.data.rows as r (r.vogal)}
                      <tr>
                        <td><strong>{r.vogal}</strong></td>
                        <td><code>{r.ipa}</code></td>
                        <td>{r.truque}</td>
                        <td lang="ar" dir="rtl">{r.ar}</td>
                        <td>{r.fr}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          {:else if section.type === 'vocab'}
            {#if section.data?.categories}
              <div class="vocab">
                {#each section.data.categories as cat (cat.name)}
                  <details class="vocab-cat" open>
                    <summary>{cat.name}</summary>
                    {#if cat.words}
                      <div class="table-wrap">
                        <table class="data-table">
                          <thead>
                            <tr>
                              <th scope="col">PT</th>
                              <th scope="col">EN</th>
                              <th scope="col">AR</th>
                              <th scope="col">FR</th>
                            </tr>
                          </thead>
                          <tbody>
                            {#each cat.words as w (w.pt)}
                              <tr>
                                <td><strong>{w.pt}</strong></td>
                                <td>{w.en}</td>
                                <td lang="ar" dir="rtl">{w.ar}</td>
                                <td>{w.fr}</td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      </div>
                    {/if}
                    {#if cat.phrases}
                      <div class="table-wrap">
                        <table class="data-table">
                          <thead>
                            <tr>
                              <th scope="col">PT</th>
                              <th scope="col">EN</th>
                              <th scope="col">AR</th>
                              <th scope="col">FR</th>
                            </tr>
                          </thead>
                          <tbody>
                            {#each cat.phrases as w (w.pt)}
                              <tr>
                                <td><strong>{w.pt}</strong></td>
                                <td>{w.en}</td>
                                <td lang="ar" dir="rtl">{w.ar}</td>
                                <td>{w.fr}</td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      </div>
                    {/if}
                  </details>
                {/each}
              </div>
            {/if}
          {:else if section.type === 'dialogues'}
                      {#if section.data?.items}
                        {#each section.data.items as rawItem, di (di)}
                          {@const item = rawItem as any}
                          <div class="dialogue">
                            <h3>{item.title}</h3>
                            <ul class="bubbles" aria-label="Diálogo">
                              {#each (item.lines ?? []) as line, li (li)}
                                <li class="bubble bubble-{line.speaker.toLowerCase()}">
                                  <span class="speaker" aria-hidden="true">{line.speaker}</span>
                                  <div class="bubble-content">
                                    <p class="pt">{line.pt}</p>
                                    <p class="en">{line.en}</p>
                                  </div>
                                </li>
                    {/each}
                  </ul>
                </div>
              {/each}
            {/if}
          {:else if section.type === 'verbs'}
                      {#if section.data?.items}
                        <div class="verbs">
                          {#each (section.data.items ?? []) as rawV, idx (idx)}
                                                      {@const v = rawV as any}
                                                      {#if v.conjugations}
                                                        <div class="verb-card">
                                                          <header>
                                                            <h3>{v.infinitive}</h3>
                                                            <span class="verb-meta">
                                                              <span>{v.translation ?? ''}</span>
                                                              {#if v.ar}<span lang="ar" dir="rtl">{v.ar}</span>{/if}
                                                            </span>
                                                          </header>
                                                          <div class="table-wrap">
                                                            <table class="data-table conj-table">
                                                              <thead>
                                                                <tr>
                                                                  <th scope="col">eu</th>
                                                                  <th scope="col">tu</th>
                                                                  <th scope="col">ele/ela</th>
                                                                  <th scope="col">nós</th>
                                                                  <th scope="col">eles/elas</th>
                                                                </tr>
                                                              </thead>
                                                              <tbody>
                                                                <tr>
                                                                  <td>{v.conjugations.eu ?? ''}</td>
                                                                  <td>{v.conjugations.tu ?? ''}</td>
                                                                  <td>{v.conjugations.ele ?? ''}</td>
                                                                  <td>{v.conjugations.nos ?? ''}</td>
                                                                  <td>{v.conjugations.eles ?? ''}</td>
                                                                </tr>
                                                              </tbody>
                                                            </table>
                                                          </div>
                                                        </div>
                                                      {/if}
                                                    {/each}
                        </div>
              {#if section.data.examples}
                <h3 class="examples-h">Exemplos</h3>
                <ul class="examples">
                  {#each section.data.examples as ex (ex.pt)}
                    <li>
                      <span class="pt">{ex.pt}</span>
                      <span class="en">— {ex.en}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            {/if}
          {:else if section.type === 'final_tips'}
            <div class="callout highlight">
              <p>{section.body}</p>
            </div>
          {:else if section.type === 'quiz_intro'}
            <div class="quiz-intro">
              <p>{section.body}</p>
              <a
                class="cta-btn quiz-cta"
                href={`/escola/curso/portugues/quiz/`}
                aria-label="Ir para o quiz de Português"
              >
                🎯 Começar quiz · Ganhar badge Lusófono (b11)
              </a>
            </div>
          {/if}

          <footer class="section-foot">
            {#if !studied}
              <button
                type="button"
                class="mark-btn"
                onclick={() => markSectionStudied(sectionKey(idx, section))}
                aria-label={`Marcar "${section.title}" como estudado`}
              >
                ✓ Marcar como estudado
              </button>
            {:else}
              <span class="studied-text">✓ Marcado como estudado.</span>
            {/if}
          </footer>
        </section>
      {/each}
    </article>

    <!-- Course completion -->
    <section class="completion" aria-label="Conclusão do curso">
      <h2>🏁 Conclusão</h2>
      {#if isComplete}
        <p class="completion-msg">✅ Curso concluído a {new Date(progress.completedAt ?? 0).toLocaleString('pt-PT')}.</p>
        <button
          type="button"
          class="mark-btn"
          onclick={unmarkCourseComplete}
          aria-label="Reabrir curso (desmarcar como concluído)"
        >
          ↩ Reabrir curso
        </button>
      {:else}
        <p>
          {#if allStudied}
            Todas as secções estudadas — bom trabalho! Marca como concluído quando estiveres pronta.
          {:else}
            Faltam {totalSections - studiedCount} secção(ões) por estudar.
          {/if}
        </p>
        <button
          type="button"
          class="mark-btn primary"
          onclick={markCourseComplete}
          aria-label="Marcar curso como concluído"
        >
          🏆 Marcar curso como concluído
        </button>
      {/if}
    </section>
  {/if}
</div>

<style>
  .pt-course {
    max-width: 880px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }

  /* Hero */
  .hero {
    text-align: center;
    margin-bottom: 1.5rem;
  }
  .breadcrumb {
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    margin: 0 0 0.5rem;
  }
  .breadcrumb a { color: var(--accent, #ec4899); text-decoration: none; }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }

  .tag {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    background: rgba(16, 185, 129, 0.18);
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #6ee7b7;
    border-radius: 999px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }
  .hero h1 {
    color: #fff;
    font-size: 1.75rem;
    margin: 0.25rem 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    line-height: 1.2;
  }
  .icon { font-size: 2rem; }
  .subtitle {
    color: var(--course-color, #10b981);
    margin: 0 0 0.5rem;
    font-weight: 500;
  }
  .meta {
    color: var(--txt3, #94a3b8);
    margin: 0;
    font-size: 0.85rem;
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: center;
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

  /* Progress */
  .progress {
    margin: 1.5rem 0;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    padding: 1rem;
  }
  .progress-meta {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    color: var(--txt2, #cbd5e1);
    font-size: 0.9rem;
  }
  .progress-track {
    height: 0.5rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--course-color, #10b981);
    transition: width 0.4s ease;
  }

  /* Section nav */
  .section-nav {
    margin-bottom: 1.5rem;
  }
  .section-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3, #94a3b8);
    margin: 0 0 0.5rem 0.25rem;
    font-weight: 600;
  }
  .section-nav ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.4rem;
  }
  .nav-link {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.85rem;
    min-height: 44px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
    color: var(--txt, #fff);
    text-decoration: none;
    transition: background 0.15s;
  }
  .nav-link:hover, .nav-link:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    outline: none;
  }
  .nav-num {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    font-weight: 700;
    font-size: 0.85rem;
  }
  .nav-title { flex: 1; min-width: 0; }
  .nav-check {
    color: var(--course-color, #10b981);
    font-weight: 700;
  }
  .nav-link.studied {
    border-color: rgba(16, 185, 129, 0.35);
  }

  @media (min-width: 720px) {
    .section-nav ul {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* Sections */
  .sections {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .course-section {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    padding: 1.25rem;
    scroll-margin-top: 1rem;
  }
  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .section-head h2 {
    color: #fff;
    margin: 0;
    font-size: 1.15rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .section-num {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--course-color, #10b981);
    color: #fff;
    border-radius: 50%;
    font-weight: 700;
    font-size: 0.85rem;
  }
  .studied-badge {
    background: rgba(16, 185, 129, 0.18);
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #6ee7b7;
    font-size: 0.75rem;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
  }

  .prose {
    color: var(--txt2, #cbd5e1);
    line-height: 1.6;
    margin: 0;
  }

  /* Callouts */
  .callout {
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-left: 4px solid #3b82f6;
    border-radius: 0.5rem;
    padding: 0.85rem 1rem;
    color: var(--txt2, #cbd5e1);
    margin-bottom: 1rem;
    line-height: 1.5;
  }
  .callout.info { border-left-color: #3b82f6; }
  .callout.highlight {
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-left: 4px solid #10b981;
  }
  .callout p { margin: 0; }

  /* Tables */
  .table-wrap { overflow-x: auto; margin-bottom: 0.5rem; }
  .data-table {
    width: 100%;
    border-collapse: collapse;
    color: var(--txt2, #cbd5e1);
    font-size: 0.9rem;
  }
  .data-table th,
  .data-table td {
    padding: 0.5rem 0.65rem;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .data-table th {
    color: var(--txt3, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.7rem;
    font-weight: 600;
  }
  .data-table tbody tr:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  .data-table code {
    background: rgba(0, 0, 0, 0.25);
    padding: 0.05rem 0.3rem;
    border-radius: 0.25rem;
    font-size: 0.85em;
  }

  /* Vocab */
  .vocab {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .vocab-cat {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
    padding: 0.5rem 0.85rem;
  }
  .vocab-cat summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--txt, #fff);
    padding: 0.4rem 0;
    min-height: 44px;
    display: flex;
    align-items: center;
    list-style: none;
  }
  .vocab-cat summary::-webkit-details-marker { display: none; }
  .vocab-cat summary::before {
    content: '▸';
    margin-right: 0.5rem;
    color: var(--course-color, #10b981);
    transition: transform 0.15s;
  }
  .vocab-cat[open] summary::before {
    transform: rotate(90deg);
  }

  /* Dialogue */
  .dialogue {
    margin-bottom: 1rem;
  }
  .dialogue h3 {
    margin: 0 0 0.5rem;
    color: #fff;
    font-size: 1rem;
  }
  .bubbles {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .bubble {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
  }
  .bubble .speaker {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-weight: 700;
    font-size: 0.85rem;
    color: #fff;
  }
  .bubble-a .speaker { background: #ec4899; }
  .bubble-b .speaker { background: #3b82f6; }
  .bubble-content {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.6rem;
    padding: 0.55rem 0.8rem;
    flex: 1;
    min-width: 0;
  }
  .bubble-content .pt {
    margin: 0;
    color: #fff;
    font-weight: 500;
  }
  .bubble-content .en {
    margin: 0.2rem 0 0;
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    font-style: italic;
  }
  .bubble-b {
    flex-direction: row-reverse;
  }
  .bubble-b .bubble-content { text-align: right; }

  /* Verbs */
  .verbs {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .verb-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.6rem;
    padding: 0.85rem;
  }
  .verb-card header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }
  .verb-card h3 {
    margin: 0;
    color: #fff;
    font-size: 1.1rem;
  }
  .verb-meta {
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .conj-table td { text-align: center; font-weight: 500; }

  .examples-h {
    color: #fff;
    font-size: 1rem;
    margin: 1rem 0 0.4rem;
  }
  .examples {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .examples li {
    background: rgba(255, 255, 255, 0.03);
    padding: 0.5rem 0.75rem;
    border-radius: 0.4rem;
    color: var(--txt2, #cbd5e1);
  }
  .examples .pt { color: #fff; font-weight: 500; }
  .examples .en { color: var(--txt3, #94a3b8); font-style: italic; }

  /* Quiz intro */
  .quiz-intro {
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.35);
    border-radius: 0.6rem;
    padding: 1.25rem;
    text-align: center;
  }
  .quiz-intro p {
    color: var(--txt2, #cbd5e1);
    margin: 0 0 1rem;
  }
  .cta-btn {
    display: inline-block;
    min-height: 44px;
    padding: 0.7rem 1.4rem;
    background: var(--course-color, #10b981);
    color: #fff;
    text-decoration: none;
    font-weight: 600;
    border-radius: 0.5rem;
    border: 0;
    cursor: pointer;
    font: inherit;
    transition: filter 0.15s;
  }
  .cta-btn:hover, .cta-btn:focus-visible {
    filter: brightness(1.1);
    outline: none;
  }
  .quiz-cta { background: #10b981; }

  /* Section foot */
  .section-foot {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    justify-content: flex-end;
  }
  .mark-btn {
    min-height: 44px;
    min-width: 44px;
    padding: 0.55rem 1rem;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--txt, #fff);
    border-radius: 0.5rem;
    cursor: pointer;
    font: inherit;
    transition: background 0.15s;
  }
  .mark-btn:hover, .mark-btn:focus-visible {
    background: rgba(255, 255, 255, 0.14);
    outline: none;
  }
  .mark-btn.primary {
    background: var(--course-color, #10b981);
    border-color: var(--course-color, #10b981);
    color: #fff;
  }
  .mark-btn.primary:hover { filter: brightness(1.1); }
  .studied-text {
    color: #6ee7b7;
    font-size: 0.9rem;
  }

  /* Completion */
  .completion {
    margin-top: 2rem;
    padding: 1.5rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    text-align: center;
  }
  .completion h2 {
    color: #fff;
    margin: 0 0 0.5rem;
    font-size: 1.15rem;
  }
  .completion p {
    color: var(--txt2, #cbd5e1);
    margin: 0 0 1rem;
  }
  .completion-msg { color: #6ee7b7 !important; }

  @media (prefers-reduced-motion: reduce) {
    .progress-fill, .vocab-cat summary::before {
      transition: none;
    }
  }
  @media (min-width: 720px) {
    .hero h1 { font-size: 2.25rem; }
  }
</style>
