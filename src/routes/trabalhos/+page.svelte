<script lang="ts">
  import Countdown from '$lib/components/Countdown.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { t } from 'svelte-i18n';
  import type { SubApp } from '$lib/registry';
  import { subApps } from '$lib/registry';
  import { onMount } from 'svelte';
  import {
    loadAssignments,
    setAssignmentStatus,
    getAllAssignmentStatuses,
    type Assignment as NewAssignment,
  } from '$lib/assignments';

  // New: dynamically-loaded assignments (V6 / Phase A)
  let newAssignments = $state<NewAssignment[]>([]);
  let newLoading = $state(true);
  let statuses = $state<Record<string, 'open' | 'in_progress' | 'done'>>({});

  onMount(() => {
    let mounted = true;
    const onAssignmentStatus = (e: Event) => {
      const detail = (e as CustomEvent).detail as { assignmentId: string; status: 'open' | 'in_progress' | 'done' };
      statuses = { ...statuses, [detail.assignmentId]: detail.status };
    };

    statuses = getAllAssignmentStatuses();
    window.addEventListener('presuntinho:assignment-status', onAssignmentStatus);

    void loadAssignments('equivalenza').then((pack) => {
      if (!mounted) return;
      if (pack) newAssignments = pack.assignments;
      newLoading = false;
    });

    return () => {
      mounted = false;
      window.removeEventListener('presuntinho:assignment-status', onAssignmentStatus);
    };
  });

  function cycleStatus(id: string) {
    const cur = statuses[id] || 'open';
    const next = cur === 'open' ? 'in_progress' : cur === 'in_progress' ? 'done' : 'open';
    setAssignmentStatus(id, next);
    statuses = { ...statuses, [id]: next };
  }

  function newStatusLabel(s: 'open' | 'in_progress' | 'done'): string {
    return s === 'done' ? $t('trabalhos.status.done', { default: 'Concluído' }) : s === 'in_progress' ? $t('trabalhos.status.in_progress', { default: 'Em curso' }) : $t('trabalhos.status.open', { default: 'Por começar' });
  }

  interface AssignmentDoc {
    name: string;
    description: string;
    path: string;
    size: number;
    type: 'pdf' | 'docx' | 'zip' | string;
  }

  interface Assignment {
    id: string;
    title: string;
    course: string;
    description: string;
    deadline: string; // ISO 8601
    status: 'open' | 'submitted' | 'late' | string;
    documents: AssignmentDoc[];
  }

  // Hard-coded list of assignments.  Phase 5 keeps it tiny — the canonical
  // metadata is duplicated in static/data/assignments/<id>.json so the
  // detail route can fetch it at runtime without a build-time registry.
  const assignments: Assignment[] = [
    {
      id: 'equivalenza-midterm',
      title: 'Equivalenza — Mid-Term BCOBM311',
      course: 'BCOBM311',
      description:
        'Trabalho de meio-período sobre a Equivalenza — análise estratégica, persona, e TOWS. Inclui análise SWOT, buyer persona, problema de marketing, TOWS, e recomendação final.',
      deadline: '2026-06-29T14:00:00+01:00',
      status: 'open',
      documents: [
        {
          name: 'Equivalenza_Mid_Term_Fatma.pdf',
          description: 'Versão final em PDF',
          path: '/legacy/docs/Equivalenza_Mid_Term_Fatma.pdf',
          size: 161,
          type: 'pdf'
        },
        {
          name: 'Equivalenza_Mid_Term_Fatma.docx',
          description: 'Versão editável em Word',
          path: '/legacy/docs/Equivalenza_Mid_Term_Fatma.docx',
          size: 2248,
          type: 'docx'
        },
        {
          name: 'equivalenza-midterm-deliverables-V3.zip',
          description: 'Pacote completo (PDF + DOCX + anexos)',
          path: '/legacy/equivalenza-midterm-deliverables-V3.zip',
          size: 1709,
          type: 'zip'
        }
      ]
    }
  ];

  // Resolve app metadata from the registry so the back link + colours match
  // the hub's card.  If the Trabalhos entry is missing we fall back to a
  // generic "apps" label so the page never crashes.
  const trabalhosApp: SubApp | undefined = subApps.find((a) => a.id === 'trabalhos');

  function statusLabel(status: Assignment['status']): string {
    switch (status) {
      case 'open':
        return $t('trabalhos.status_legacy.open', { default: 'Em curso' });
      case 'submitted':
        return $t('trabalhos.status_legacy.submitted', { default: 'Entregue' });
      case 'late':
        return $t('trabalhos.status_legacy.late', { default: 'Atrasado' });
      default:
        return status;
    }
  }
</script>

<svelte:head>
  <title>{$t('routes.trabalhos.title', { default: 'Trabalhos · Entregas e Prazos' })} · Presuntinho</title>
  <meta name="description" content={$t('routes.trabalhos.meta.description', { default: 'Trabalhos e entregas com prazos' })} />
  <meta property="og:title" content={$t('routes.trabalhos.meta.og_title', { default: 'Trabalhos · Entregas e Prazos' })} />
  <meta property="og:description" content={$t('routes.trabalhos.meta.og_description', { default: 'Trabalhos e entregas com prazos' })} />
  <meta property="og:url" content="https://presuntinho.netlify.app/trabalhos/" />
  <meta name="twitter:title" content={$t('routes.trabalhos.meta.twitter_title', { default: 'Trabalhos · Entregas e Prazos' })} />
  <meta name="twitter:description" content={$t('routes.trabalhos.meta.twitter_description', { default: 'Trabalhos e entregas com prazos' })} />
</svelte:head>

<div class="trabalhos">
  <header class="hero">
    <h1>{$t('trabalhos.hero.title', { default: '📝 Trabalhos' })}</h1>
    <p class="sub">{$t('trabalhos.hero.sub', { default: 'Trabalhos e entregas com prazos — começa pelo que tem deadline mais próximo.' })}</p>
  </header>

  <nav class="crumbs" aria-label={$t('trabalhos.crumbs.aria', { default: 'Caminho de navegação' })}>
    <a href="/">{$t('trabalhos.crumbs.home', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('trabalhos.crumbs.current', { default: 'Trabalhos' })}</span>
  </nav>

  <section class="list" aria-label={$t('trabalhos.list.aria', { default: 'Lista de trabalhos' })}>
    {#if newLoading}
      <Skeleton variant="list" lines={4} label={$t('common.loading')} />
    {:else if newAssignments.length > 0}
        <header class="progress-bar" aria-live="polite">
          <p>
            {$t('trabalhos.progress', { default: 'Progresso geral' })}:
            <strong>
              {newAssignments.filter((a) => statuses[a.id] === 'done').length} / {newAssignments.length}
            </strong>
            {$t('trabalhos.progress.done', { default: 'concluídos' })}
          </p>
        </header>
        <h2 class="section-title">{$t('trabalhos.section.course', { default: '📚 Trabalhos do curso (BCOBM311)' })}</h2>
        <ul class="cards">
          {#each newAssignments as a (a.id)}
            <li class="card" data-status={statuses[a.id] || 'open'}>
              <div class="card-header">
                <div class="title-row">
                  <h2>
                    <a href="/trabalhos/assignment/{a.slug}/">{a.title}</a>
                  </h2>
                  <span class="course-pill" aria-label={$t('trabalhos.weight', { default: 'Peso' })}>{$t('trabalhos.weight.short', { default: 'Peso' })} {a.weight}%</span>
                </div>
                <span class="status status-{statuses[a.id] || 'open'}">{newStatusLabel(statuses[a.id] || 'open')}</span>
              </div>
              <p class="description"><strong>{$t('trabalhos.what', { default: 'O quê' })}:</strong> {a.whatToDo}</p>
              <p class="description"><strong>{$t('trabalhos.how', { default: 'Como' })}:</strong> {a.howToDo}</p>
              {#if a.hint}
                <p class="hint"><span aria-hidden="true">💡</span> {a.hint}</p>
              {/if}
              <div class="meta">
                <span class="meta-label">{$t('trabalhos.deadline', { default: 'Prazo' })}:</span>
                <Countdown deadline={new Date('2026-06-29T14:00:00').toISOString()} />
              </div>
              <div class="footer-row">
                <button
                  type="button"
                  class="status-btn"
                  onclick={() => cycleStatus(a.id)}
                  aria-label={$t('trabalhos.change_status.aria', { default: 'Mudar estado' }).replace('{title}', a.title)}
                >
                  🔄 {$t('trabalhos.change_status', { default: 'Mudar estado' })}
                </button>
                <a class="open-link" href="/trabalhos/assignment/{a.slug}/">
                  {$t('trabalhos.open', { default: 'Abrir trabalho' })} →
                </a>
              </div>
            </li>
          {/each}
        </ul>
      {/if}

      <h2 class="section-title">{$t('trabalhos.section.package', { default: '📦 Pacote completo (V3 mid-term)' })}</h2>
      {#if assignments.length === 0}
        <EmptyState
          emoji="📭"
          title={$t('empty.trabalhos.title')}
          description={$t('empty.trabalhos.desc')}
        />
      {:else}
        <ul class="cards">
        {#each assignments as a (a.id)}
          <li class="card" data-status={a.status}>
            <div class="card-header">
              <div class="title-row">
                <h2>
                  <a href="/trabalhos/assignment/{a.id}/">{a.title}</a>
                </h2>
                <span class="course-pill" aria-label={$t('trabalhos.course', { default: 'Curso' })}>{a.course}</span>
              </div>
              <span class="status status-{a.status}">{statusLabel(a.status)}</span>
            </div>

            <p class="description">{a.description}</p>

            <div class="meta">
              <span class="meta-label">{$t('trabalhos.deadline', { default: 'Prazo' })}:</span>
              <Countdown deadline={a.deadline} />
            </div>

            <div class="footer-row">
              <span class="doc-count">
                {a.documents.length} {a.documents.length === 1 ? $t('trabalhos.doc.singular', { default: 'documento' }) : $t('trabalhos.doc.plural', { default: 'documentos' })}
              </span>
              <a class="open-link" href="/trabalhos/assignment/{a.id}/">
                {$t('trabalhos.open', { default: 'Abrir trabalho' })} →
              </a>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if trabalhosApp}
    <footer class="page-footer" aria-hidden="true">
      <span style="--swatch: {trabalhosApp.color}">{trabalhosApp.icon}</span>
      <span>{$t('trabalhos.footer.position', { default: 'Hub · Trabalhos' })}</span>
    </footer>
  {/if}
</div>

<style>
  .trabalhos {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 2rem;
  }
  .hero {
    text-align: center;
    margin-bottom: 1.5rem;
  }
  .hero h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem 0;
    color: var(--txt, #fff);
  }
  .sub {
    color: var(--txt2, #cbd5e1);
    margin: 0;
    font-size: 1rem;
  }
  .crumbs {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.875rem;
    color: var(--txt3, #94a3b8);
    margin-bottom: 1rem;
  }
  .crumbs a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .crumbs a:hover,
  .crumbs a:focus-visible {
    text-decoration: underline;
  }
  .empty {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1.5rem;
    text-align: center;
    color: var(--txt2, #cbd5e1);
  }
  .cards {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .card {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-left: 4px solid var(--accent, #f59e0b);
    border-radius: 0.75rem;
    padding: 1.25rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .card[data-status='submitted'] {
    border-left-color: var(--success, #10b981);
  }
  .card[data-status='late'] {
    border-left-color: var(--warning, #f59e0b);
  }
  .card-header {
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
  .title-row h2 {
    margin: 0;
    font-size: 1.125rem;
    line-height: 1.3;
  }
  .title-row h2 a {
    color: var(--txt, #fff);
    text-decoration: none;
  }
  .title-row h2 a:hover,
  .title-row h2 a:focus-visible {
    color: var(--accent, #ec4899);
    text-decoration: underline;
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
    font-size: 0.9375rem;
    line-height: 1.5;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    background: rgba(0, 0, 0, 0.15);
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
  }
  .meta-label {
    font-size: 0.8125rem;
    color: var(--txt3, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .footer-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    font-size: 0.875rem;
  }
  .doc-count {
    color: var(--txt3, #94a3b8);
  }
  .open-link {
    color: var(--accent, #ec4899);
    text-decoration: none;
    font-weight: 600;
  }
  .open-link:hover,
  .open-link:focus-visible {
    text-decoration: underline;
  }
  .page-footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
    margin-top: 2rem;
    color: var(--txt3, #94a3b8);
    font-size: 0.8125rem;
  }
  .page-footer span:first-child {
    color: var(--swatch, #f59e0b);
    font-size: 1.125rem;
  }
  @media (min-width: 640px) {
    .trabalhos {
      padding: 2rem 1.5rem 3rem;
    }
    .hero h1 {
      font-size: 2.5rem;
    }
  }
</style>