<script lang="ts">
  import { page } from '$app/state';
  import Countdown from '$lib/components/Countdown.svelte';

  interface AssignmentDoc {
    name: string;
    description: string;
    path: string;
    size: number;
    type: string;
  }

  interface Assignment {
    id: string;
    title: string;
    course: string;
    description: string;
    deadline: string; // ISO 8601
    status: string;
    documents: AssignmentDoc[];
  }

  // Svelte 5 runes for reactive fetch state.  We don't use onMount because
  // the +page.svelte is rendered with ssr=false (see +layout.ts) and we
  // want the fetch to fire on the client only.
  let assignment = $state<Assignment | null>(null);
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

    fetch(`/data/assignments/${slug}.json`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as Assignment;
      })
      .then((data) => {
        assignment = data;
        loading = false;
      })
      .catch((e: unknown) => {
        error =
          e instanceof Error
            ? `Não foi possível carregar o trabalho: ${e.message}`
            : 'Não foi possível carregar o trabalho.';
        loading = false;
      });
  });

  function statusLabel(status: string): string {
    switch (status) {
      case 'open':
        return 'Em curso';
      case 'submitted':
        return 'Entregue';
      case 'late':
        return 'Atrasado';
      default:
        return status;
    }
  }

  function formatSize(kb: number): string {
    if (kb >= 1024) {
      const mb = kb / 1024;
      return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
    }
    return `${kb} KB`;
  }

  function docIcon(type: string): string {
    switch (type) {
      case 'pdf':
        return '📄';
      case 'docx':
        return '📝';
      case 'zip':
        return '🗂️';
      default:
        return '📎';
    }
  }
</script>

<svelte:head>
  <title>{assignment ? assignment.title : 'Trabalho'} — Presuntinho</title>
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
  {:else if error}
    <div class="state error" role="alert">
      <p>⚠️ {error}</p>
      <p>
        Verifica que o slug <code>{page.params.slug}</code> existe em
        <code>static/data/assignments/</code>.
      </p>
      <a class="back-link" href="/trabalhos/">← Voltar à lista de trabalhos</a>
    </div>
  {:else if assignment}
    <article class="assignment">
      <header class="header">
        <div class="title-row">
          <h1>{assignment.title}</h1>
          <span class="course-pill" aria-label="Curso">{assignment.course}</span>
        </div>
        <span class="status status-{assignment.status}">
          {statusLabel(assignment.status)}
        </span>
      </header>

      <p class="description">{assignment.description}</p>

      <section class="meta-block" aria-label="Prazo">
        <h2 class="block-title">Prazo</h2>
        <div class="deadline-row">
          <Countdown deadline={assignment.deadline} />
        </div>
      </section>

      <section class="docs-block" aria-label="Documentos para descarregar">
        <h2 class="block-title">Documentos ({assignment.documents.length})</h2>
        {#if assignment.documents.length === 0}
          <p class="muted">Sem documentos anexados.</p>
        {:else}
          <ul class="docs">
            {#each assignment.documents as doc (doc.path)}
              <li class="doc">
                <a class="doc-link" href={doc.path} download>
                  <span class="doc-icon" aria-hidden="true">{docIcon(doc.type)}</span>
                  <span class="doc-content">
                    <span class="doc-name">{doc.name}</span>
                    <span class="doc-desc">{doc.description}</span>
                    <span class="doc-meta">
                      <span class="doc-type">{doc.type.toUpperCase()}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatSize(doc.size)}</span>
                    </span>
                  </span>
                  <span class="doc-cta" aria-hidden="true">↓</span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
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
  .course-pill {
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--txt2, #cbd5e1);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .status {
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .status-open {
    background: rgba(236, 72, 153, 0.15);
    color: var(--accent, #ec4899);
  }
  .status-submitted {
    background: rgba(16, 185, 129, 0.15);
    color: var(--success, #10b981);
  }
  .status-late {
    background: rgba(245, 158, 11, 0.15);
    color: var(--warning, #f59e0b);
  }
  .description {
    color: var(--txt2, #cbd5e1);
    margin: 0;
    font-size: 1rem;
    line-height: 1.55;
  }
  .block-title {
    font-size: 0.8125rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3, #94a3b8);
    margin: 0 0 0.5rem 0;
    font-weight: 600;
  }
  .deadline-row {
    background: rgba(0, 0, 0, 0.15);
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
  }
  .docs {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .doc {
    background: rgba(0, 0, 0, 0.15);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    overflow: hidden;
  }
  .doc-link {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    color: var(--txt, #fff);
    text-decoration: none;
    transition: background 0.15s;
  }
  .doc-link:hover,
  .doc-link:focus-visible {
    background: rgba(255, 255, 255, 0.05);
    outline: none;
  }
  .doc-link:focus-visible {
    box-shadow: inset 0 0 0 2px var(--accent, #ec4899);
  }
  .doc-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
    width: 2rem;
    text-align: center;
  }
  .doc-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .doc-name {
    font-weight: 600;
    font-size: 0.9375rem;
    overflow-wrap: anywhere;
  }
  .doc-desc {
    font-size: 0.8125rem;
    color: var(--txt2, #cbd5e1);
  }
  .doc-meta {
    font-size: 0.75rem;
    color: var(--txt3, #94a3b8);
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .doc-type {
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  .doc-cta {
    color: var(--accent, #ec4899);
    font-size: 1.25rem;
    flex-shrink: 0;
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