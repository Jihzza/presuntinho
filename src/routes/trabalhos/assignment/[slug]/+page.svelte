<script lang="ts">
  import { page } from '$app/state';
  import Countdown from '$lib/components/Countdown.svelte';
  import type { AssignmentPack } from '$lib/assignments';

  // V6 pack shape — single file holds every assignment for the course.
  // We only need the Assignment fields on the page, so we inline a
  // narrow type rather than importing the full Assignment interface
  // (which would force us to handle every optional field).
  interface AssignmentFromPack {
    id: string;
    slug: string;
    title: string;
    weight: number;
    lessonSlug?: string;
    audioSlug?: string;
    whatToDo: string;
    howToDo: string;
    hint: string;
    estimatedMinutes: number;
  }

  let pack = $state<AssignmentPack | null>(null);
  let assignment = $state<AssignmentFromPack | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    const slug = page.params.slug;
    if (!slug) {
      error = 'Trabalho não especificado.';
      loading = false;
      return;
    }
    loading = true;
    error = null;
    assignment = null;
    pack = null;

    fetch('/data/assignments/equivalenza.json', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as AssignmentPack;
      })
      .then((data) => {
        pack = data;
        const found = data.assignments.find(
          (a) => a.slug === slug || a.id === slug
        );
        if (!found) {
          error = `Trabalho "${slug}" não encontrado no pack.`;
        } else {
          assignment = found;
        }
        loading = false;
      })
      .catch((e: unknown) => {
        error =
          e instanceof Error
            ? `Não foi possível carregar o pack: ${e.message}`
            : 'Não foi possível carregar o pack de trabalhos.';
        loading = false;
      });
  });

  // Combined description: what + how + hint, so the detail page gives
  // the student everything they need in one place.
  let descriptionText = $derived(
    assignment
      ? [assignment.whatToDo, assignment.howToDo, assignment.hint]
          .filter((s) => s && s.trim().length > 0)
          .join(' ')
      : ''
  );

  // SEO — used by <svelte:head> below.
  let pageTitle = $derived(
    assignment ? `${assignment.title} · Trabalhos` : 'Trabalho · Trabalhos'
  );
  let metaDescription = $derived(
    descriptionText.slice(0, 160) || 'Detalhe do trabalho'
  );
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta name="description" content={metaDescription} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={metaDescription} />
  <meta property="og:url" content="https://presuntinho.netlify.app/trabalhos/" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={metaDescription} />
</svelte:head>

<div class="detail">
  <nav class="crumbs" aria-label="Caminho de navegação">
    <a href="/">← Hub</a>
    <span aria-hidden="true">/</span>
    <a href="/trabalhos/">Trabalhos</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{page.params.slug ?? '...'}</span>
  </nav>

  {#if loading}
    <p class="state">A carregar trabalho…</p>
  {:else if error || !assignment}
    <div class="state error" role="alert">
      <p>⚠️ {error ?? 'Trabalho desconhecido.'}</p>
      <p>
        Verifica que o slug <code>{page.params.slug}</code> existe no pack
        <code>static/data/assignments/equivalenza.json</code>.
      </p>
      <a class="back-link" href="/trabalhos/">← Voltar à lista de trabalhos</a>
    </div>
  {:else}
    <article class="assignment">
      <header class="header">
        <div class="title-row">
          <h1>{assignment.title}</h1>
          <span class="weight-pill" aria-label="Peso">Peso {assignment.weight}%</span>
        </div>
        <span class="meta-pill" aria-label="Duração estimada">
          ⏱️ ~{assignment.estimatedMinutes} min
        </span>
      </header>

      <section class="description-block" aria-label="Descrição do trabalho">
        <h2 class="block-title">O que fazer</h2>
        <p class="description">{descriptionText}</p>
      </section>

      <section class="meta-block" aria-label="Prazo">
        <h2 class="block-title">Prazo</h2>
        <div class="deadline-row">
          {#if pack?.deadline}
            <Countdown deadline={pack.deadline} />
          {/if}
        </div>
      </section>

      <section class="recursos-block" aria-label="Recursos">
        <h2 class="block-title">Recursos</h2>
        <ul class="recursos">
          {#if assignment.lessonSlug}
            <li>
              <a class="recurso-link" href={`/escola/curso/${assignment.lessonSlug}/`}>
                📖 Ver aula: {assignment.lessonSlug}
              </a>
            </li>
          {/if}
          {#if assignment.audioSlug}
            <li>
              <a class="recurso-link" href={`/walk/?slug=${assignment.audioSlug}`}>
                🎧 Ouvir walkthrough
              </a>
            </li>
          {/if}
          {#if !assignment.lessonSlug && !assignment.audioSlug}
            <li class="muted">Sem recursos associados.</li>
          {/if}
        </ul>
      </section>

      <footer class="footer-row">
        <a class="back-link" href="/trabalhos/">← Voltar à lista de trabalhos</a>
      </footer>
    </article>
  {/if}
</div>

<style>
  .detail {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 2rem;
  }
  .crumbs {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.875rem;
    color: var(--txt3, #94a3b8);
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .crumbs a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .crumbs a:hover,
  .crumbs a:focus-visible {
    text-decoration: underline;
  }
  .state {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1.25rem;
    color: var(--txt2, #cbd5e1);
    margin: 0;
  }
  .state.error {
    border-left: 4px solid var(--error, #ef4444);
  }
  .state code {
    background: rgba(0, 0, 0, 0.25);
    padding: 0.05rem 0.35rem;
    border-radius: 0.25rem;
    font-size: 0.85em;
  }
  .assignment {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-left: 4px solid var(--accent, #f59e0b);
    border-radius: 0.75rem;
    padding: 1.5rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    min-width: 0;
  }
  .title-row h1 {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.25;
    color: var(--txt, #fff);
  }
  .weight-pill {
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: rgba(236, 72, 153, 0.15);
    color: var(--accent, #ec4899);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    font-weight: 600;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .meta-pill {
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--txt2, #cbd5e1);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    font-weight: 600;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .block-title {
    font-size: 0.8125rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3, #94a3b8);
    margin: 0 0 0.5rem 0;
    font-weight: 600;
  }
  .description {
    color: var(--txt2, #cbd5e1);
    margin: 0;
    font-size: 1rem;
    line-height: 1.55;
  }
  .deadline-row {
    background: rgba(0, 0, 0, 0.15);
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
  }
  .recursos {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .recurso-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.9rem;
    background: rgba(0, 0, 0, 0.15);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    color: var(--txt, #fff);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9375rem;
    transition: background 0.15s;
  }
  .recurso-link:hover,
  .recurso-link:focus-visible {
    background: rgba(255, 255, 255, 0.05);
    color: var(--accent, #ec4899);
    outline: none;
  }
  .recurso-link:focus-visible {
    box-shadow: inset 0 0 0 2px var(--accent, #ec4899);
  }
  .muted {
    color: var(--txt3, #94a3b8);
    font-size: 0.875rem;
    margin: 0;
  }
  .footer-row {
    display: flex;
    justify-content: flex-start;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border, rgba(255, 255, 255, 0.1));
  }
  .back-link {
    color: var(--accent, #ec4899);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9375rem;
  }
  .back-link:hover,
  .back-link:focus-visible {
    text-decoration: underline;
  }
  @media (min-width: 640px) {
    .detail {
      padding: 2rem 1.5rem 3rem;
    }
    .title-row h1 {
      font-size: 1.875rem;
    }
  }
</style>