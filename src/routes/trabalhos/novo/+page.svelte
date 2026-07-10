<!--
  /trabalhos/novo — formulário de novo trabalho (Escola sub-app).

  Campos:
    * Título — obrigatório.
    * Curso — dropdown do catálogo escolar (cursos + cadeiras), com a
      opção "Outro" que revela um campo de texto livre.  O valor guardado
      é o slug do curso (`AssignmentRow.curso`), tal como as linhas seed.
    * Cadeira / módulo — opcional.
    * Prazo — datetime-local, obrigatório (guardado como timestamp ms).
    * Notas — opcional (guardado em `AssignmentRow.description`).
    * Estado inicial — pending / in_progress / submitted / graded.

  Submit → createAssignment() → goto /trabalhos/.

  Segue os padrões de /financas/nova: tokens de design, $t com defaults
  PT inline, validação + erro inline, botão desativado enquanto guarda.
  i18n: copy PT inline (sem editar os JSON de i18n).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import {
    createAssignment,
    ensureAssignmentDefaults,
    listAssignmentCursos,
    type AssignmentStatus, STATUS_LABELS, STATUS_OPTIONS, defaultDeadlineLocal } from '$lib/trabalhos';
  import { localizedSchoolCourses } from '$lib/escola/catalog';
  import { showToast } from '$lib/components/events';

  const CUSTOM = '__outro__';

  // ---------------- Form state ----------------
  let title = $state('');
  // Default to the primary course (matches the seeded rows' `curso`).
  let cursoSelect = $state<string>('business-administration');
  let cursoCustom = $state('');
  let cadeira = $state('');
  let deadlineLocal = $state(defaultDeadlineLocal());
  let notas = $state('');
  let status = $state<AssignmentStatus>('pending');

  let submitting = $state(false);
  let error = $state<string | null>(null);
  // Extra course slugs the user already used that aren't in the catalog.
  let extraCursos = $state<string[]>([]);


  // ---------------- Derived ----------------
  // Course option groups, localized and reactive to the language.
  let courseGroups = $derived(
    localizedSchoolCourses($t).map((course) => ({
      label: `${course.icon} ${course.title}`,
      options: [
        { value: course.slug, label: course.title },
        ...course.units.map((u) => ({ value: u.slug, label: `${u.icon} ${u.title}` }))
      ]
    }))
  );

  let cursoEfetivo = $derived(cursoSelect === CUSTOM ? cursoCustom.trim() : cursoSelect);
  let deadlineMs = $derived(deadlineLocal ? new Date(deadlineLocal).getTime() : NaN);
  let formValido = $derived(
    Boolean(title.trim()) && Boolean(cursoEfetivo) && Number.isFinite(deadlineMs)
  );

  // ---------------- Helpers ----------------
  function statusLabel(s: AssignmentStatus): string {
    const { key, fallback } = STATUS_LABELS[s];
    return $t(key, { default: fallback });
  }

  function prettySlug(slug: string): string {
    return slug
      .split('-')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  }

  onMount(() => {
    void (async () => {
      try {
        await ensureAssignmentDefaults();
        // Offer any curso slugs the user already has that the catalog
        // doesn't know about, so they can reuse them.
        const catalogSlugs = new Set(
          localizedSchoolCourses($t).flatMap((c) => [c.slug, ...c.units.map((u) => u.slug)])
        );
        const cursos = await listAssignmentCursos();
        extraCursos = cursos.filter((c) => c !== 'todos' && !catalogSlugs.has(c));
      } catch (e) {
        console.error('[trabalhos/novo] load failed', e);
      }
    })();

    // Focus the title first (mobile-first UX, mirrors /financas/nova).
    queueMicrotask(() => {
      const el = document.getElementById('title') as HTMLInputElement | null;
      el?.focus();
    });
  });

  async function handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    error = null;

    const tituloTrim = title.trim();
    if (!tituloTrim) {
      error = $t('trabalhos.novo.erro.sem_titulo', { default: 'Dá um título ao trabalho.' });
      return;
    }
    if (!cursoEfetivo) {
      error = $t('trabalhos.novo.erro.sem_curso', { default: 'Escolhe (ou escreve) um curso.' });
      return;
    }
    if (!Number.isFinite(deadlineMs)) {
      error = $t('trabalhos.novo.erro.sem_prazo', { default: 'Indica um prazo válido.' });
      return;
    }

    submitting = true;
    try {
      await createAssignment({
        title: tituloTrim,
        curso: cursoEfetivo,
        cadeira: cadeira.trim() || undefined,
        deadline: deadlineMs,
        description: notas.trim(),
        status
      });
      showToast($t('trabalhos.novo.toast.criado', { default: 'Trabalho criado ✓' }));
      await goto('/trabalhos/');
    } catch (err) {
      console.error('[trabalhos/novo] createAssignment failed', err);
      error = $t('trabalhos.novo.erro.guardar', { default: 'Erro a guardar o trabalho. Tenta outra vez.' });
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>{$t('trabalhos.novo.seo.title', { default: 'Novo trabalho · Trabalhos' })} · Presuntinho</title>
  <meta name="description" content={$t('trabalhos.novo.seo.desc', { default: 'Adicionar um novo trabalho com prazo' })} />
</svelte:head>

<div class="novo-page">
  <header class="hero">
    <h1>{$t('trabalhos.novo.hero.title', { default: '➕ Novo trabalho' })}</h1>
    <p class="sub">{$t('trabalhos.novo.hero.sub', { default: 'Regista uma entrega com prazo e acompanha o progresso.' })}</p>
  </header>

  <nav class="crumbs" aria-label={$t('trabalhos.crumbs.aria', { default: 'Caminho de navegação' })}>
    <a href="/">{$t('trabalhos.crumbs.home', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <a href="/trabalhos/">{$t('trabalhos.assignment.breadcrumb.home', { default: '← Trabalhos' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('trabalhos.novo.nova', { default: 'Novo' })}</span>
  </nav>

  <form class="form" onsubmit={handleSubmit} novalidate>
    <!-- Título -->
    <div class="field">
      <label for="title">{$t('trabalhos.novo.titulo', { default: 'Título' })} <span aria-hidden="true">*</span></label>
      <input
        id="title"
        type="text"
        bind:value={title}
        maxlength="160"
        required
        placeholder={$t('trabalhos.novo.titulo.placeholder', { default: 'Ex.: Plano de marketing para PME' })}
        autocomplete="off"
        disabled={submitting}
      />
    </div>

    <!-- Curso -->
    <div class="field">
      <label for="curso">{$t('trabalhos.course', { default: 'Curso' })} <span aria-hidden="true">*</span></label>
      <select id="curso" bind:value={cursoSelect} disabled={submitting}>
        {#each courseGroups as g (g.label)}
          <optgroup label={g.label}>
            {#each g.options as opt (opt.value)}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </optgroup>
        {/each}
        {#if extraCursos.length > 0}
          <optgroup label={$t('trabalhos.novo.curso.teus', { default: 'Os teus cursos' })}>
            {#each extraCursos as c (c)}
              <option value={c}>{prettySlug(c)}</option>
            {/each}
          </optgroup>
        {/if}
        <option value={CUSTOM}>{$t('trabalhos.novo.curso.outro', { default: '➕ Outro (escrever)…' })}</option>
      </select>
      {#if cursoSelect === CUSTOM}
        <input
          class="mt"
          type="text"
          bind:value={cursoCustom}
          maxlength="60"
          placeholder={$t('trabalhos.novo.curso.outro.placeholder', { default: 'Nome do curso' })}
          autocomplete="off"
          aria-label={$t('trabalhos.novo.curso.outro', { default: '➕ Outro (escrever)…' })}
          disabled={submitting}
        />
      {/if}
    </div>

    <!-- Cadeira (opcional) -->
    <div class="field">
      <label for="cadeira">{$t('trabalhos.novo.cadeira', { default: 'Cadeira / módulo' })}</label>
      <input
        id="cadeira"
        type="text"
        bind:value={cadeira}
        maxlength="60"
        placeholder={$t('trabalhos.novo.cadeira.placeholder', { default: 'Ex.: Branding' })}
        autocomplete="off"
        disabled={submitting}
      />
      <span class="hint">{$t('financas.nova.opcional', { default: 'Opcional' })}.</span>
    </div>

    <!-- Prazo -->
    <div class="field">
      <label for="deadline">{$t('trabalhos.assignment.prazo', { default: 'Prazo' })} <span aria-hidden="true">*</span></label>
      <input
        id="deadline"
        type="datetime-local"
        bind:value={deadlineLocal}
        required
        disabled={submitting}
      />
    </div>

    <!-- Notas -->
    <div class="field">
      <label for="notas">{$t('trabalhos.novo.notas', { default: 'Notas' })}</label>
      <textarea
        id="notas"
        bind:value={notas}
        maxlength="500"
        rows="3"
        placeholder={$t('trabalhos.novo.notas.placeholder', { default: 'O que é preciso fazer, requisitos, links…' })}
        disabled={submitting}
      ></textarea>
      <span class="hint">{$t('financas.nova.opcional', { default: 'Opcional' })}. {$t('trabalhos.novo.notas.max', { default: 'Máx. 500 caracteres.' })}</span>
    </div>

    <!-- Estado inicial -->
    <div class="field">
      <label for="status">{$t('trabalhos.filters.status', { default: 'Estado' })}</label>
      <select id="status" bind:value={status} disabled={submitting}>
        {#each STATUS_OPTIONS as s (s)}
          <option value={s}>{statusLabel(s)}</option>
        {/each}
      </select>
    </div>

    {#if error}
      <p class="error" role="alert">⚠️ {error}</p>
    {/if}

    <div class="actions">
      <a class="btn-secondary" href="/trabalhos/">{$t('financas.nova.cancel', { default: 'Cancelar' })}</a>
      <button type="submit" class="btn-primary" disabled={submitting || !formValido}>
        {submitting ? $t('common.loading', { default: 'A guardar…' }) : $t('trabalhos.novo.submit', { default: 'Criar trabalho' })}
      </button>
    </div>
  </form>
</div>

<style>
  .novo-page {
    max-width: 560px;
    margin: 0 auto;
    padding: 1.5rem 1rem calc(6rem + env(safe-area-inset-bottom));
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
  .form {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 1rem);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.125rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .field label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--txt, #fff);
  }
  .field input[type='text'],
  .field input[type='datetime-local'],
  .field select,
  .field textarea {
    width: 100%;
    padding: 0.7rem 0.75rem;
    min-height: var(--touch-target, 44px);
    background: var(--bg-elev, #2d4373);
    border: 1px solid var(--border-strong, rgba(255, 255, 255, 0.2));
    border-radius: var(--radius-md, 0.5rem);
    color: var(--txt, #fff);
    font-size: 1rem;
    font-family: inherit;
    /* Let native date/select popups follow the page theme (not forced dark). */
    color-scheme: light dark;
  }
  .field textarea {
    resize: vertical;
    line-height: 1.5;
    min-height: 5rem;
  }
  .field input:focus-visible,
  .field select:focus-visible,
  .field textarea:focus-visible {
    outline: none;
    border-color: var(--accent, #ec4899);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #ec4899) 40%, transparent);
  }
  .field input::placeholder,
  .field textarea::placeholder {
    color: var(--txt3, #94a3b8);
  }
  .mt {
    margin-top: 0.5rem;
  }
  .hint {
    font-size: 0.8125rem;
    color: var(--txt3, #94a3b8);
  }
  .error {
    color: var(--error, #ef4444);
    margin: 0;
    font-size: 0.875rem;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .btn-primary,
  .btn-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--touch-target, 44px);
    padding: 0.625rem 1.25rem;
    border-radius: var(--radius-md, 0.5rem);
    font-weight: 600;
    font-size: 1rem;
    text-decoration: none;
    cursor: pointer;
    border: 0;
    font-family: inherit;
  }
  .btn-primary {
    background: var(--accent, #ec4899);
    color: var(--on-accent, #fff);
  }
  .btn-primary:hover:not(:disabled),
  .btn-primary:focus-visible:not(:disabled) {
    background: var(--accent-hover, #db2777);
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #ec4899) 35%, transparent);
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-secondary {
    background: transparent;
    color: var(--txt, #fff);
    border: 1px solid var(--border-strong, rgba(255, 255, 255, 0.2));
  }
  .btn-secondary:hover,
  .btn-secondary:focus-visible {
    background: var(--card-hover, rgba(255, 255, 255, 0.12));
    outline: none;
  }
  @media (min-width: 640px) {
    .novo-page {
      padding: 2rem 1.5rem 3rem;
    }
    .hero h1 {
      font-size: 2.25rem;
    }
  }
</style>
