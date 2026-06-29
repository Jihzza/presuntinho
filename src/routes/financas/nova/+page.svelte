<!--
  /financas/nova — formulário de nova transação.

  Campos:
    * Tipo (toggle Receita / Despesa) — default = despesa.
    * Valor (€) — obrigatório, > 0.
    * Categoria — dropdown filtrado pelo tipo (receita / despesa /
      ambos consoante o tipo escolhido).  Default = 1ª categoria
      compatível com o tipo.
    * Descrição — opcional, max 120 chars.
    * Data — default = hoje.

  Submit → addTransacao() → goto /financas/transacoes/.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import {
    listCategorias,
    addTransacao,
    getHojeISO,
    type CategoriaRow
  } from '$lib/financas';
  import { showToast } from '$lib/components/events';

  let tipo = $state<'receita' | 'despesa'>('despesa');
  let valorStr = $state('');
  let categoria = $state<string>('');
  let descricao = $state('');
  let data = $state(getHojeISO());

  let categorias = $state<CategoriaRow[]>([]);
  let submitting = $state(false);
  let error = $state<string | null>(null);
  let loadingCategorias = $state(true);

  // Categorias filtradas pelo tipo atual:
  //   'receita' → receita + ambos
  //   'despesa' → despesa + ambos
  let categoriasCompativeis = $derived(
    categorias
      .filter((c) => c.tipo === tipo || c.tipo === 'ambos')
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-PT'))
  );

  // Categoria escolhida atualmente (objeto para mostrar ícone/cor no
  // header do formulário).
  let categoriaAtual = $derived(categorias.find((c) => c.id === categoria));

  // Quando o utilizador muda o tipo, se a categoria escolhida já não
  // é compatível, limpamos a seleção para o dropdown não ficar num
  // estado inválido.  E também pré-selecionamos a 1ª compatível.
  $effect(() => {
    const _ = tipo;
    if (categoriasCompativeis.length === 0) {
      categoria = '';
      return;
    }
    if (!categoria || !categoriasCompativeis.find((c) => c.id === categoria)) {
      categoria = categoriasCompativeis[0].id;
    }
  });

  onMount(() => {
    void (async () => {
      try {
        categorias = await listCategorias();
      } catch (e) {
        console.error('[financas/nova] listCategorias failed', e);
        error = e instanceof Error ? e.message : 'Erro a carregar categorias';
      } finally {
        loadingCategorias = false;
      }
    })();

    // Foco no campo de valor (UX mobile-first).
    queueMicrotask(() => {
      const el = document.getElementById('valor') as HTMLInputElement | null;
      el?.focus();
    });
  });

  async function handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    error = null;

    const valorNum = Number(valorStr.trim().replace(',', '.'));
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      error = 'O valor tem de ser maior que zero.';
      return;
    }
    if (!categoria) {
      error = 'Escolhe uma categoria.';
      return;
    }
    if (!data) {
      error = 'Indica uma data.';
      return;
    }
    if (descricao.length > 120) {
      error = $t('error.descricao_demasiado_longa_max', { default: 'Descrição demasiado longa (máx. 120 caracteres).' });
      return;
    }

    submitting = true;
    try {
      await addTransacao({
        tipo,
        valor: valorNum,
        categoria,
        descricao: descricao.trim(),
        data
      });
      showToast(tipo === 'receita' ? 'Receita adicionada' : 'Despesa adicionada');
      await goto('/financas/transacoes/');
    } catch (e) {
      console.error('[financas/nova] addTransacao failed', e);
      error = e instanceof Error ? e.message : 'Erro a guardar transação';
      submitting = false;
    }
  }

  // SEO — used by <svelte:head> below.
  let pageTitle = $derived('Nova Transação · Finanças');
  let description = $derived('Adicionar transação');
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content="https://presuntinho.netlify.app/financas/nova/" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={description} />
</svelte:head>

<div class="nova-page">
  <header class="hero">
    <h1>➕ Nova transação</h1>
    <p class="sub">{$t('routes.financas.nova.subtitle', { default: 'Adiciona uma receita ou despesa.' })}</p>
  </header>

  <nav class="crumbs" aria-label="{$t('a11y.aria.caminho_de_navegacao', { default: 'Caminho de navegação' })}">
    <a href="/">← Hub</a>
    <span aria-hidden="true">/</span>
    <a href="/financas/">{$t('financas.nova.breadcrumb.home', { default: '← Finanças' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('financas.nova.nova', { default: 'Nova' })}</span>
  </nav>

  <form class="form" onsubmit={handleSubmit} novalidate>
    <!-- Toggle tipo (receita / despesa) -->
    <fieldset class="tipo-field" aria-label={$t('financas.nova.tipo.aria', { default: 'Tipo de transação' })}>
      <legend class="sr-only">{$t('financas.nova.tipo.aria', { default: 'Tipo de transação' })}</legend>
      <div class="tipo-toggle" role="radiogroup" aria-label={$t('financas.nova.tipo.aria', { default: 'Tipo de transação' })}>
        <button
          type="button"
          class="tipo-btn"
          class:active={tipo === 'despesa'}
          role="radio"
          aria-checked={tipo === 'despesa'}
          aria-label={$t('financas.nova.tipo.despesa', { default: 'Despesa' })}
          onclick={() => (tipo = 'despesa')}
        >
          <span class="tipo-icon" aria-hidden="true">💸</span>
          <span>{$t('financas.nova.tipo.despesa', { default: 'Despesa' })}</span>
        </button>
        <button
          type="button"
          class="tipo-btn"
          class:active={tipo === 'receita'}
          role="radio"
          aria-checked={tipo === 'receita'}
          aria-label={$t('financas.nova.tipo.receita', { default: 'Receita' })}
          onclick={() => (tipo = 'receita')}
        >
          <span class="tipo-icon" aria-hidden="true">💰</span>
          <span>{$t('financas.nova.tipo.receita', { default: 'Receita' })}</span>
        </button>
      </div>
    </fieldset>

    <!-- Valor -->
    <div class="field">
      <label for="valor">{$t('financas.nova.valor', { default: 'Valor' })} <span aria-hidden="true">*</span></label>
      <div class="valor-row">
        <input
          id="valor"
          type="number"
          min="0.01"
          step="0.01"
          inputmode="decimal"
          bind:value={valorStr}
          required
          placeholder={$t('placeholder.zero_zero', { default: '0,00' })}
          autocomplete="off"
        />
        <span class="euro" aria-hidden="true">€</span>
      </div>
    </div>

    <!-- Categoria -->
    <div class="field">
      <label for="categoria">{$t('financas.nova.categoria', { default: 'Categoria' })} <span aria-hidden="true">*</span></label>
      {#if loadingCategorias}
        <p class="hint">{$t('financas.nova.aCarregar', { default: 'A carregar categorias…' })}</p>
      {:else if categoriasCompativeis.length === 0}
        <p class="hint">{$t('financas.nova.semCategorias', { default: 'Sem categorias compatíveis com este tipo.' })}</p>
      {:else}
        <div class="cat-select">
          <select id="categoria" bind:value={categoria} required>
            {#each categoriasCompativeis as c (c.id)}
              <option value={c.id}>{c.icone} {c.nome}</option>
            {/each}
          </select>
          {#if categoriaAtual}
            <span
              class="cat-preview"
              style="--cat-cor: {categoriaAtual.cor}"
              aria-hidden="true"
            >
              {categoriaAtual.icone}
            </span>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Descrição -->
    <div class="field">
      <label for="descricao">{$t('financas.nova.descricao', { default: 'Descrição' })}</label>
      <input
        id="descricao"
        type="text"
        bind:value={descricao}
        maxlength="120"
        placeholder="{$t('placeholder.ex_almoco_com_a_equipa', { default: 'Ex.: Almoço com a equipa' })}"
        autocomplete="off"
      />
      <span class="hint">{$t('financas.nova.opcional', { default: 'Opcional' })}. {$t('financas.nova.maxCaracteres', { default: 'Máx. 120 caracteres.' })}</span>
    </div>

    <!-- Data -->
    <div class="field">
      <label for="data">{$t('financas.nova.data', { default: 'Data' })} <span aria-hidden="true">*</span></label>
      <input id="data" type="date" bind:value={data} required />
    </div>

    {#if error}
      <p class="error" role="alert">⚠️ {error}</p>
    {/if}

    <div class="actions">
      <a class="btn-secondary" href="/financas/transacoes/">{$t('financas.nova.cancel', { default: 'Cancelar' })}</a>
      <button
        type="submit"
        class="btn-primary"
        class:receita={tipo === 'receita'}
        disabled={submitting || loadingCategorias || categoriasCompativeis.length === 0}
      >
        {submitting ? $t('common.loading') : (tipo === 'receita' ? $t('financas.nova.submit.add_receita', { default: 'Adicionar receita' }) : $t('financas.nova.submit.add_despesa', { default: 'Adicionar despesa' }))}
      </button>
    </div>
  </form>
</div>

<style>
  .nova-page {
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
    color: var(--success, #10b981);
    text-decoration: none;
  }
  .crumbs a:hover,
  .crumbs a:focus-visible {
    text-decoration: underline;
  }
  .form {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
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
  .field input[type='number'],
  .field input[type='date'],
  .field select {
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: 0.5rem;
    color: var(--txt, #fff);
    font-size: 1rem;
    font-family: inherit;
    color-scheme: dark;
  }
  .field input:focus-visible,
  .field select:focus-visible {
    outline: none;
    border-color: var(--success, #10b981);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.3);
  }
  .field input[type='number'] {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    font-size: 0.8125rem;
    color: var(--txt3, #94a3b8);
  }
  .valor-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .valor-row input {
    flex: 1;
  }
  .valor-row .euro,
  .euro {
    color: var(--txt3, #94a3b8);
    font-weight: 600;
  }
  .cat-select {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .cat-select select {
    flex: 1;
  }
  .cat-preview {
    width: 2.5rem;
    height: 2.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 1.375rem;
    background: color-mix(in srgb, var(--cat-cor, #94a3b8) 18%, transparent);
    flex-shrink: 0;
  }
  .tipo-field {
    border: 0;
    padding: 0;
    margin: 0;
  }
  .tipo-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .tipo-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    padding: 0.875rem 0.5rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: 0.625rem;
    color: var(--txt2, #cbd5e1);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.9375rem;
    font-weight: 600;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .tipo-btn:hover,
  .tipo-btn:focus-visible {
    background: rgba(255, 255, 255, 0.06);
    color: var(--txt, #fff);
    outline: none;
  }
  .tipo-btn.active {
    background: rgba(16, 185, 129, 0.15);
    border-color: var(--success, #10b981);
    color: var(--success, #10b981);
    box-shadow: 0 0 0 1px var(--success, #10b981);
  }
  .tipo-icon {
    font-size: 1.5rem;
    line-height: 1;
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
    padding: 0.625rem 1.25rem;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 1rem;
    text-decoration: none;
    cursor: pointer;
    border: 0;
    font-family: inherit;
  }
  .btn-primary {
    background: var(--error, #ef4444);   /* despesa = vermelho (default) */
    color: #fff;
  }
  .btn-primary.receita {
    background: var(--success, #10b981);
  }
  .btn-primary:hover:not(:disabled),
  .btn-primary:focus-visible:not(:disabled) {
    filter: brightness(0.92);
    outline: none;
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.35);
  }
  .btn-primary.receita:hover:not(:disabled),
  .btn-primary.receita:focus-visible:not(:disabled) {
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.35);
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-secondary {
    background: rgba(255, 255, 255, 0.05);
    color: var(--txt, #fff);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
  }
  .btn-secondary:hover,
  .btn-secondary:focus-visible {
    background: rgba(255, 255, 255, 0.12);
    outline: none;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @media (min-width: 640px) {
    .nova-page {
      padding: 2rem 1.5rem 3rem;
    }
    .hero h1 {
      font-size: 2.25rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tipo-btn { transition: none; }
  }
</style>
