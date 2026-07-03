<!--
  /biblioteca/editar/[id] — bookmark edit form.

  Same shape as /biblioteca/novo/ but hydrated from the existing row
  and writing through `updateItem()` instead of `addItem()`.  Owns no
  XP reward — editing is a free-form housekeeping action.

  The page is reachable from the bookmark detail page
  (/biblioteca/item/[id]/ → "Editar") and from any list row hover
  state in future revisions.

  Fields:
    - title (required, max 120 chars)
    - url   (required, http/https only)
    - description (optional, max 500 chars)
    - tags  (comma-separated)
    - curso_id (optional, dropdown of known escola slugs)
    - assignment_id (optional, dropdown of Trabalho ids loaded from
      Dexie's `assignments` table on mount)

  We don't ship an "Anexar a Trabalho" picker here — that's a
  separate button on the detail page (`/biblioteca/item/[id]/`),
  which awards its own XP via `attachBookmarkToAssignment()`.

  i18n keys are intentionally under the existing `biblioteca.novo.*`
  namespace (this page is structurally identical to /novo/) so we
  don't double the i18n footprint for two near-identical forms.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { t } from 'svelte-i18n';
  import { getItem, updateItem, parseTagsInput } from '$lib/biblioteca';
  import { listAssignments, type Assignment } from '$lib/trabalhos';
  import { showToast } from '$lib/components/events';

  /**
   * Hard-coded list of known escola curso slugs.  Mirrors the slugs
   * declared in `src/routes/escola/+page.svelte` (which owns the
   * canonical list — we don't re-export COURSES from there because
   * doing so would create a cyclic import surface).  Empty labels
   * are written in pt-PT in `routes.escola.curso.*.title` (already
   * i18n-ised across the 5 locales).
   */
  const CURSOS: { slug: string; title: string }[] = [
    { slug: 'equivalenza',           title: 'Equivalenza' },
    { slug: 'portugues',             title: 'Português' },
    { slug: 'marketing-digital',     title: 'Marketing Digital' },
    { slug: 'branding',              title: 'Branding' },
    { slug: 'estrategia',            title: 'Estratégia' },
    { slug: 'estrategia-corporativa',title: 'Estratégia Corporativa' },
    { slug: 'marketing-internacional', title: 'Marketing Internacional' },
    { slug: 'gestao-financeira',     title: 'Gestão Financeira' },
    { slug: 'contabilidade',         title: 'Contabilidade' },
    { slug: 'microeconomia',         title: 'Microeconomia' },
    { slug: 'recursos-humanos',      title: 'Recursos Humanos' },
    { slug: 'comportamento-organizacional', title: 'Comportamento Organizacional' },
    { slug: 'gestao-inovacao',       title: 'Gestão da Inovação' },
    { slug: 'comercio-internacional',title: 'Comércio Internacional' },
    { slug: 'macroeconomia',         title: 'Macroeconomia' },
    { slug: 'marketing-estrategico', title: 'Marketing Estratégico' },
    { slug: 'etica-negocios',        title: 'Ética nos Negócios' },
    { slug: 'direito-empresarial',   title: 'Direito Empresarial' },
    { slug: 'analise-financeira',    title: 'Análise Financeira' },
    { slug: 'comportamento-do-consumidor', title: 'Comportamento do Consumidor' },
    { slug: 'pesquisa-de-marketing', title: 'Pesquisa de Marketing' },
    { slug: 'gestao-risco',          title: 'Gestão de Risco' },
    { slug: 'analise-investimentos', title: 'Análise de Investimentos' }
  ];

  // Parse route id → positive integer.
  function parseId(raw: string | undefined): number | null {
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const itemId = $derived(parseId(page.params.id));

  // Form state — initialised from the loaded row.
  let title = $state('');
  let url = $state('');
  let description = $state('');
  let tagsInput = $state('');
  let cursoId = $state<string>('');
  let assignmentId = $state<string>('');

  let loading = $state(true);
  let saving = $state(false);
  let removing = $state(false);
  let error = $state<string | null>(null);
  let notFound = $state(false);

  let assignments = $state<Assignment[]>([]);
  let assignmentsLoaded = $state(false);

  function isValidUrl(value: string): boolean {
    if (!value) return false;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  async function loadRow(id: number): Promise<void> {
    loading = true;
    error = null;
    notFound = false;
    try {
      const row = await getItem(id);
      if (!row) {
        notFound = true;
        return;
      }
      title = row.title;
      url = row.url;
      description = row.description ?? '';
      tagsInput = Array.isArray(row.tags) ? row.tags.join(', ') : '';
      cursoId = row.curso_id ?? '';
      assignmentId = row.assignment_id ?? '';
    } catch (e) {
      console.error('[biblioteca/editar] loadRow failed', e);
      error = e instanceof Error ? e.message : $t('biblioteca.item.loadFailed', { default: 'Erro a carregar marcador' }) as string;
    } finally {
      loading = false;
    }
  }

  async function loadAssignments(): Promise<void> {
    try {
      assignments = await listAssignments();
    } catch (e) {
      console.warn('[biblioteca/editar] listAssignments failed (non-fatal):', e);
      assignments = [];
    } finally {
      assignmentsLoaded = true;
    }
  }

  // Re-load when the URL id changes (user navigated to a different bookmark).
  $effect(() => {
    const id = itemId;
    if (id === null) {
      void goto('/biblioteca/');
      return;
    }
    // Avoid double-trigger when the form re-emits state changes inside this same effect.
    untrack(() => {
      void loadRow(id);
    });
  });

  // Load assignments once on mount.
  $effect(() => {
    if (!assignmentsLoaded) {
      void loadAssignments();
    }
  });

  // Also auto-fill the curso when the assignment is set, IF the bookmark
  // didn't already have a curso.  This is a UX nudge, not a rule.
  let lastAutoFill = $state<string>('');
  $effect(() => {
    if (!assignmentId || assignmentsLoaded === false) return;
    const aid = assignmentId;
    if (aid === lastAutoFill) return;
    const found = assignments.find((a) => a.id === aid);
    if (found && !cursoId) {
      cursoId = found.curso;
      lastAutoFill = aid;
    }
  });

  import { untrack } from 'svelte';

  async function handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    error = null;
    if (itemId === null) return;

    const t1 = title.trim();
    const u = url.trim();
    const d = description.trim();

    if (!t1) {
      error = $t('error.o_titulo_obrigatorio', { default: 'O título é obrigatório.' }) as string;
      return;
    }
    if (t1.length > 120) {
      error = $t('error.titulo_demasiado_longo_max_120', { default: 'Título demasiado longo (máx. 120 caracteres).' }) as string;
      return;
    }
    if (!isValidUrl(u)) {
      error = $t('error.o_url_tem_de_comecar_por_http', { default: 'O URL tem de começar por http:// ou https://.' }) as string;
      return;
    }
    if (d.length > 500) {
      error = $t('error.descricao_demasiado_longa_max_500', { default: 'Descrição demasiado longa (máx. 500 caracteres).' }) as string;
      return;
    }
    const parsedTags = parseTagsInput(tagsInput);
    if (parsedTags.length > 10) {
      error = $t('error.maximo_de_10_tags_por_marcador', { default: 'Máximo de 10 tags por marcador.' }) as string;
      return;
    }

    saving = true;
    try {
      await updateItem(itemId, {
        title: t1,
        url: u,
        description: d,
        tags: parsedTags,
        curso_id: cursoId || undefined,
        assignment_id: assignmentId || undefined
      });
      showToast($t('biblioteca.novo.toast.atualizado', { default: 'Marcador atualizado' }));
      void goto(`/biblioteca/item/${itemId}/`);
    } catch (e) {
      console.error('[biblioteca/editar] updateItem failed', e);
      error = e instanceof Error ? e.message : $t('biblioteca.novo.erro.guardar', { default: 'Erro a guardar marcador' }) as string;
      saving = false;
    }
  }

  async function handleDelete(): Promise<void> {
    if (itemId === null) return;
    if (!confirm($t('biblioteca.delete.confirm', { default: 'Confirmar remoção?' }))) return;
    removing = true;
    try {
      const { deleteItem } = await import('$lib/biblioteca');
      await deleteItem(itemId);
      showToast($t('biblioteca.item.toast.removido', { default: 'Marcador removido' }));
      void goto('/biblioteca/');
    } catch (e) {
      console.error('[biblioteca/editar] delete failed', e);
      error = e instanceof Error ? e.message : $t('biblioteca.item.toast.erro_remover', { default: 'Erro a remover marcador' }) as string;
      removing = false;
    }
  }
</script>

<svelte:head>
  <title>{$t('biblioteca.edit.seo.title', { default: 'Editar marcador · Biblioteca' })} · Presuntinho</title>
</svelte:head>

<div class="editar">
  <header class="hero">
    <h1>{$t('biblioteca.edit.hero.title', { default: '✏️ Editar marcador' })}</h1>
    <p class="sub">{$t('biblioteca.edit.hero.sub', { default: 'Atualiza título, URL, descrição, tags ou o curso / trabalho a que está anexado.' })}</p>
  </header>

  <nav class="crumbs">
    <a href="/">{$t('biblioteca.crumbs.home', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <a href="/biblioteca/">{$t('biblioteca.novo.breadcrumb.home', { default: '← Biblioteca' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('biblioteca.edit.breadcrumb.current', { default: 'Editar' })}</span>
  </nav>

  {#if loading}
    <p class="empty">{$t('biblioteca.edit.loading', { default: 'A carregar…' })}</p>
  {:else if notFound}
    <p class="empty error" role="alert">⚠️ {$t('biblioteca.edit.not_found', { default: 'Marcador não encontrado.' })}</p>
    <p class="back-row"><a href="/biblioteca/">{$t('biblioteca.edit.back', { default: '← Voltar à Biblioteca' })}</a></p>
  {:else}
    <form class="form" onsubmit={handleSubmit} novalidate>
      <div class="field">
        <label for="bm-title">{$t('biblioteca.edit.title_label', { default: 'Título' })} <span aria-hidden="true">*</span></label>
        <input
          id="bm-title"
          type="text"
          bind:value={title}
          maxlength="120"
          required
          autocomplete="off"
        />
      </div>

      <div class="field">
        <label for="bm-url">URL <span aria-hidden="true">*</span></label>
        <input
          id="bm-url"
          type="url"
          bind:value={url}
          required
          autocomplete="off"
          inputmode="url"
        />
      </div>

      <div class="field">
        <label for="bm-desc">{$t('biblioteca.edit.description_label', { default: 'Descrição' })}</label>
        <textarea
          id="bm-desc"
          bind:value={description}
          maxlength="500"
          rows="4"
        ></textarea>
        <span class="hint">{description.length}/500</span>
      </div>

      <div class="field">
        <label for="bm-tags">Tags</label>
        <input
          id="bm-tags"
          type="text"
          bind:value={tagsInput}
          placeholder={$t('biblioteca.novo.placeholder.tags', { default: 'python, docs, performance' })}
          autocomplete="off"
        />
        <span class="hint">{$t('biblioteca.edit.tags_hint', { default: 'Separa com vírgulas. Até 10 tags por marcador.' })}</span>
      </div>

      <div class="field">
        <label for="bm-curso">{$t('biblioteca.edit.course_label', { default: 'Curso (escola)' })}</label>
        <select id="bm-curso" bind:value={cursoId}>
          <option value="">{$t('biblioteca.edit.none', { default: '— Nenhum —' })}</option>
          {#each CURSOS as c (c.slug)}
            <option value={c.slug}>{c.title}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label for="bm-assignment">{$t('biblioteca.edit.assignment_label', { default: 'Trabalho (anexar como recurso)' })}</label>
        <select id="bm-assignment" bind:value={assignmentId}>
          <option value="">{$t('biblioteca.edit.none', { default: '— Nenhum —' })}</option>
          {#each assignments as a (a.id)}
            <option value={a.id}>{a.id} · {a.title}</option>
          {/each}
        </select>
        <span class="hint">{$t('biblioteca.edit.assignment_hint', { default: 'Atrelar este marcador a um trabalho permite usá-lo como referência ao escrever a entrega.' })}</span>
      </div>

      {#if error}
        <p class="error" role="alert">⚠️ {error}</p>
      {/if}

      <div class="actions">
        <button type="button" class="btn-danger" onclick={handleDelete} disabled={removing || saving}>
          {removing ? $t('biblioteca.edit.deleting', { default: 'A apagar…' }) : $t('biblioteca.edit.delete', { default: '🗑️ Apagar' })}
        </button>
        <a class="btn-secondary" href={itemId !== null ? `/biblioteca/item/${itemId}/` : '/biblioteca/'}>{$t('biblioteca.edit.cancel', { default: 'Cancelar' })}</a>
        <button type="submit" class="btn-primary" disabled={saving}>
          {saving ? $t('biblioteca.edit.saving', { default: 'A guardar…' }) : $t('biblioteca.edit.save', { default: 'Guardar alterações' })}
        </button>
      </div>
    </form>
  {/if}
</div>

<style>
  .editar {
    max-width: 560px;
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
  .empty {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1.5rem;
    text-align: center;
    color: var(--txt2, #cbd5e1);
  }
  .empty.error {
    border-color: var(--error, #ef4444);
    color: var(--error, #ef4444);
  }
  .back-row {
    text-align: center;
    margin-top: 1rem;
  }
  .back-row a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .form {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
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
  .field input[type='url'],
  .field textarea,
  .field select {
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: 0.5rem;
    color: var(--txt, #fff);
    font-size: 1rem;
    font-family: inherit;
    box-sizing: border-box;
  }
  .field textarea {
    resize: vertical;
    min-height: 5rem;
    line-height: 1.5;
  }
  .field select {
    appearance: auto;
  }
  .field input:focus-visible,
  .field textarea:focus-visible,
  .field select:focus-visible {
    outline: none;
    border-color: var(--accent, #ec4899);
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.25);
  }
  .hint {
    font-size: 0.75rem;
    color: var(--txt3, #94a3b8);
  }
  .error {
    margin: 0;
    padding: 0.625rem 0.75rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid var(--error, #ef4444);
    border-radius: 0.5rem;
    color: var(--error, #ef4444);
    font-size: 0.875rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .btn-primary,
  .btn-secondary,
  .btn-danger {
    display: inline-block;
    padding: 0.625rem 1.25rem;
    border-radius: 0.5rem;
    font-weight: 600;
    text-decoration: none;
    border: 0;
    cursor: pointer;
    font-size: 1rem;
    transition: background 0.15s, color 0.15s;
    font-family: inherit;
    min-height: 44px;
  }
  .btn-primary {
    background: var(--accent, #ec4899);
    color: #fff;
  }
  .btn-primary:hover:not(:disabled),
  .btn-primary:focus-visible:not(:disabled) {
    background: #d63384;
    outline: none;
  }
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .btn-primary:focus-visible {
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.4);
  }
  .btn-secondary {
    background: transparent;
    color: var(--txt2, #cbd5e1);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
  }
  .btn-secondary:hover,
  .btn-secondary:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    color: var(--txt, #fff);
    outline: none;
  }
  .btn-danger {
    background: transparent;
    color: var(--txt3, #94a3b8);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    margin-right: auto;
  }
  .btn-danger:hover:not(:disabled),
  .btn-danger:focus-visible:not(:disabled) {
    background: rgba(239, 68, 68, 0.1);
    color: var(--error, #ef4444);
    border-color: var(--error, #ef4444);
    outline: none;
  }
  .btn-danger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  @media (min-width: 640px) {
    .editar {
      padding: 2rem 1.5rem 3rem;
    }
    .hero h1 {
      font-size: 2.25rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .btn-primary,
    .btn-secondary,
    .btn-danger { transition: none; }
  }
</style>
