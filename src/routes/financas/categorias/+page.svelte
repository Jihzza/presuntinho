<!--
  /financas/categorias — gestão CRUD de categorias (M1-S3).

  Layout mobile-first 375×667:
    - Header com título + botão "Nova categoria".
    - Lista de cards agrupados por tipo (despesa, receita, ambos).
    - Cada card: emoji + nome + swatch cor + contagem de transações + botões editar/apagar.
    - Formulário inline para criar / editar (overlay acessível, focus trap não necessário — é só um form).
    - i18n completo: pt-PT (default) + en, fr, ar, tn.

  XP:
    - addCategoria: não dá XP (CRUD de taxonomia, não evento).
    - updateCategoria: idem.
    - deleteCategoria: idem.

  Validações:
    - nome obrigatório (≤ 40 chars).
    - icone (emoji livre).
    - cor hex (#rrggbb ou #rgb), default #607d8b.
    - tipo ∈ {despesa, receita, ambos}.
    - delete: bloqueia se houver transações / orçamentos a referenciar.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { t } from 'svelte-i18n';
  import { browser } from '$app/environment';
  import {
    listCategorias,
    addCategoria,
    updateCategoria,
    deleteCategoria,
    ensureCategoriasDefaults,
    countTransacoesCategoria,
    type CategoriaRow
  } from '$lib/financas';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ColorPicker from '$lib/components/ColorPicker.svelte';
  import { showToast } from '$lib/components/events';

  // Strings i18n resolvidas uma vez (não usar $t dentro de @const).
  const STRINGS = {
    title: get(t)('financas.categorias.title', { default: 'Categorias' }),
    subtitle: get(t)('financas.categorias.subtitle', { default: 'Gere as categorias das tuas transações' }),
    newBtn: get(t)('financas.categorias.new', { default: 'Nova categoria' }),
    editAria: get(t)('financas.categorias.edit.aria', { default: 'Editar categoria' }),
    deleteAria: get(t)('financas.categorias.delete.aria', { default: 'Apagar categoria' }),
    deleteConfirm: get(t)('financas.categorias.delete.confirm', { default: 'Confirmar remoção?' }),
    formTitleNew: get(t)('financas.categorias.form.new', { default: 'Nova categoria' }),
    formTitleEdit: get(t)('financas.categorias.form.edit', { default: 'Editar categoria' }),
    labelNome: get(t)('financas.categorias.form.nome', { default: 'Nome' }),
    labelIcone: get(t)('financas.categorias.form.icone', { default: 'Ícone (emoji)' }),
    labelCor: get(t)('financas.categorias.form.cor', { default: 'Cor (hex)' }),
    labelTipo: get(t)('financas.categorias.form.tipo', { default: 'Tipo' }),
    tipoDespesa: get(t)('financas.categorias.tipo.despesa', { default: 'Despesa' }),
    tipoReceita: get(t)('financas.categorias.tipo.receita', { default: 'Receita' }),
    tipoAmbos: get(t)('financas.categorias.tipo.ambos', { default: 'Ambas' }),
    btnSave: get(t)('financas.categorias.form.save', { default: 'Guardar' }),
    btnCancel: get(t)('financas.categorias.form.cancel', { default: 'Cancelar' }),
    errNomeRequired: get(t)('financas.categorias.form.errors.nomeRequired', { default: 'Nome obrigatório' }),
    errNomeTooLong: get(t)('financas.categorias.form.errors.nomeTooLong', { default: 'Nome demasiado longo (max 40)' }),
    errCorInvalida: get(t)('financas.categorias.form.errors.corInvalida', { default: 'Cor inválida (use #rgb ou #rrggbb)' }),
    toastSaved: get(t)('financas.categorias.toast.saved', { default: 'Categoria guardada' }),
    toastDeleted: get(t)('financas.categorias.toast.deleted', { default: 'Categoria apagada' }),
    toastError: get(t)('financas.categorias.toast.error', { default: 'Erro a guardar categoria' }),
    toastRefused: get(t)('financas.categorias.toast.refused', { default: 'Categoria em uso: {refs}' }),
    txCount: get(t)('financas.categorias.tx_count', { default: '{n} transações' }),
    groupDespesa: get(t)('financas.categorias.group.despesa', { default: 'Despesas' }),
    groupReceita: get(t)('financas.categorias.group.receita', { default: 'Receitas' }),
    groupAmbos: get(t)('financas.categorias.group.ambos', { default: 'Ambas' })
  };

  let categorias = $state<CategoriaRow[]>([]);
  let txCounts = $state<Record<string, number>>({});
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Form state — null = form fechado.
  let editingId = $state<string | null>(null);
  let isNew = $state(false);
  let formNome = $state('');
  let formIcone = $state('🏷️');
  let formCor = $state('#607d8b');
  let formTipo = $state<'despesa' | 'receita' | 'ambos'>('despesa');
  let formError = $state<string | null>(null);

  let confirmingDelete = $state<string | null>(null);

  function startNew() {
    isNew = true;
    editingId = null;
    formNome = '';
    formIcone = '🏷️';
    formCor = '#607d8b';
    formTipo = 'despesa';
    formError = null;
  }

  function startEdit(c: CategoriaRow) {
    isNew = false;
    editingId = c.id;
    formNome = c.nome;
    formIcone = c.icone;
    formCor = c.cor;
    formTipo = c.tipo;
    formError = null;
  }

  function cancelForm() {
    editingId = null;
    isNew = false;
    formError = null;
  }

  async function reload() {
    if (!browser) return;
    try {
      await ensureCategoriasDefaults();
      const rows = await listCategorias();
      categorias = rows;
      const counts: Record<string, number> = {};
      for (const c of rows) counts[c.id] = await countTransacoesCategoria(c.id);
      txCounts = counts;
      loading = false;
    } catch (e) {
      error = (e as Error).message ?? String(e);
      loading = false;
    }
  }

  async function handleSubmit(ev: Event) {
    ev.preventDefault();
    formError = null;
    if (!formNome.trim()) { formError = STRINGS.errNomeRequired; return; }
    if (formNome.trim().length > 40) { formError = STRINGS.errNomeTooLong; return; }
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(formCor)) { formError = STRINGS.errCorInvalida; return; }
    try {
      if (isNew) {
        await addCategoria({ nome: formNome.trim(), icone: formIcone.trim() || '🏷️', cor: formCor, tipo: formTipo });
      } else if (editingId) {
        await updateCategoria(editingId, { nome: formNome.trim(), icone: formIcone.trim() || '🏷️', cor: formCor, tipo: formTipo });
      }
      cancelForm();
      await reload();
      showToast(STRINGS.toastSaved);
    } catch (e) {
      formError = (e as Error).message ?? STRINGS.toastError;
    }
  }

  async function handleDelete(id: string) {
    if (confirmingDelete !== id) { confirmingDelete = id; return; }
    confirmingDelete = null;
    try {
      const result = await deleteCategoria(id);
      if (result.ok) {
        showToast(STRINGS.toastDeleted);
      } else {
        const msg = STRINGS.toastRefused.replace('{refs}', result.refs.join(', '));
        showToast(msg);
      }
      await reload();
    } catch (e) {
      showToast((e as Error).message ?? STRINGS.toastError);
    }
  }

  function groups(): Record<'despesa' | 'receita' | 'ambos', CategoriaRow[]> {
    const g: Record<'despesa' | 'receita' | 'ambos', CategoriaRow[]> = { despesa: [], receita: [], ambos: [] };
    for (const c of categorias) g[c.tipo].push(c);
    return g;
  }

  onMount(reload);
</script>

<svelte:head>
  <title>{STRINGS.title} · Presuntinho</title>
</svelte:head>

<section class="categorias-page">
  <header>
    <h1>{STRINGS.title}</h1>
    <p class="subtitle">{STRINGS.subtitle}</p>
    {#if editingId === null}
      <button type="button" class="btn-primary" onclick={startNew} aria-label={STRINGS.newBtn}>
        + {STRINGS.newBtn}
      </button>
    {/if}
  </header>

  {#if loading}
    <Skeleton lines={4} />
  {:else if error}
    <EmptyState emoji="⚠️" title={$t('routes.financas.categorias.erro_titulo', { default: 'Erro' })} description={error} />
  {:else}
    {#if editingId !== null || isNew}
      <form class="cat-form" onsubmit={handleSubmit}>
        <h2>{isNew ? STRINGS.formTitleNew : STRINGS.formTitleEdit}</h2>

        <label>
          <span>{STRINGS.labelNome}</span>
          <input type="text" bind:value={formNome} maxlength="40" required autocomplete="off" />
        </label>

        <label>
          <span>{STRINGS.labelIcone}</span>
          <input type="text" bind:value={formIcone} maxlength="4" autocomplete="off" />
        </label>

        <label>
          <span>{STRINGS.labelCor}</span>
          <ColorPicker bind:value={formCor} ariaLabel={STRINGS.labelCor} onChange={(v) => (formCor = v)} />
        </label>

        <fieldset>
          <legend>{STRINGS.labelTipo}</legend>
          <label class="radio"><input type="radio" bind:group={formTipo} value="despesa" />{STRINGS.tipoDespesa}</label>
          <label class="radio"><input type="radio" bind:group={formTipo} value="receita" />{STRINGS.tipoReceita}</label>
          <label class="radio"><input type="radio" bind:group={formTipo} value="ambos" />{STRINGS.tipoAmbos}</label>
        </fieldset>

        {#if formError}<p class="form-error" role="alert">{formError}</p>{/if}

        <div class="form-actions">
          <button type="submit" class="btn-primary">{STRINGS.btnSave}</button>
          <button type="button" class="btn-secondary" onclick={cancelForm}>{STRINGS.btnCancel}</button>
        </div>
      </form>
    {/if}

    {#each Object.entries(groups()) as [tipoKey, items] (tipoKey)}
      {#if items.length > 0}
        <section class="group">
          <h2>{tipoKey === 'despesa' ? STRINGS.groupDespesa : tipoKey === 'receita' ? STRINGS.groupReceita : STRINGS.groupAmbos}</h2>
          <ul class="cat-list">
            {#each items as cat (cat.id)}
              <li class="cat-card" style:--swatch={cat.cor}>
                <span class="cat-icon" aria-hidden="true">{cat.icone}</span>
                <div class="cat-body">
                  <strong>{cat.nome}</strong>
                  <span class="cat-meta">{STRINGS.txCount.replace('{n}', String(txCounts[cat.id] ?? 0))}</span>
                </div>
                <div class="cat-actions">
                  <button type="button" class="btn-icon" aria-label={STRINGS.editAria} onclick={() => startEdit(cat)}>✏️</button>
                  <button type="button" class="btn-icon" aria-label={STRINGS.deleteAria} onclick={() => handleDelete(cat.id)}>
                    {confirmingDelete === cat.id ? '✓' : '🗑️'}
                  </button>
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {/each}
  {/if}
</section>

<style>
  .categorias-page { padding: 1rem; max-width: 720px; margin: 0 auto; }
  header h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }
  .subtitle { color: var(--text-dim, #666); margin: 0 0 0.75rem; }
  .btn-primary { background: var(--accent, #d4574a); color: #fff; border: 0; padding: 0.6rem 1rem; border-radius: 6px; font-weight: 600; }
  .btn-secondary { background: transparent; color: var(--text, #222); border: 1px solid var(--border, #ccc); padding: 0.6rem 1rem; border-radius: 6px; }
  .cat-form { background: var(--surface, #fafafa); border: 1px solid var(--border, #e5e5e5); padding: 1rem; border-radius: 8px; margin: 1rem 0; }
  .cat-form label { display: block; margin: 0.5rem 0; }
  .cat-form label > span { display: block; font-size: 0.875rem; color: var(--text-dim, #666); margin-bottom: 0.25rem; }
  .cat-form input[type="text"] { width: 100%; padding: 0.5rem; border: 1px solid var(--border, #ccc); border-radius: 4px; box-sizing: border-box; font-family: 'JetBrains Mono', 'Consolas', monospace; }
  .cat-form fieldset { border: 1px solid var(--border, #e5e5e5); padding: 0.5rem 0.75rem; border-radius: 4px; margin: 0.5rem 0; }
  .cat-form .radio { display: inline-flex; align-items: center; gap: 0.25rem; margin-right: 1rem; }
  .form-error { color: #c0392b; font-size: 0.875rem; margin: 0.5rem 0; }
  .form-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
  .group { margin: 1.5rem 0; }
  .group h2 { font-size: 1.125rem; margin: 0 0 0.5rem; color: var(--text-dim, #555); text-transform: uppercase; letter-spacing: 0.05em; }
  .cat-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
  .cat-card { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: var(--surface, #fff); border: 1px solid var(--border, #e5e5e5); border-left: 4px solid var(--swatch, #ccc); border-radius: 6px; }
  .cat-icon { font-size: 1.5rem; }
  .cat-body { flex: 1; min-width: 0; }
  .cat-body strong { display: block; }
  .cat-meta { font-size: 0.75rem; color: var(--text-dim, #666); }
  .cat-actions { display: flex; gap: 0.25rem; }
  .btn-icon { background: transparent; border: 0; font-size: 1.25rem; cursor: pointer; padding: 0.25rem 0.5rem; border-radius: 4px; }
  .btn-icon:hover { background: var(--surface-hover, #f0f0f0); }
</style>
