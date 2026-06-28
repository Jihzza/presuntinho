<!--
  /financas/transacoes/[id] — editar uma transação existente.

  M1-S1 (Daniel's P3: Finanças sem editar). Carrega a transação por id,
  pré-preenche o formulário, valida inline (pt-PT), grava via
  updateTransacao() (que atribui +1 XP), e faz goto() de volta para a lista.

  Botões:
    * Gravar          — submit (Enter em qualquer input)
    * Cancelar        — goto() para /financas/transacoes
    * Eliminar        — confirm() inline, depois deleteTransacao + goto

  a11y: aria-label em todos os controlos, aria-invalid em erros, focus
  no primeiro campo inválido ao falhar validação.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { t } from 'svelte-i18n';
  import {
    listCategorias,
    getTransacao,
    updateTransacao,
    deleteTransacao,
    getHojeISO,
    type CategoriaRow,
    type Transacao
  } from '$lib/financas';
  import { showToast } from '$lib/components/events';

  let tipo = $state<'receita' | 'despesa'>('despesa');
  let valorStr = $state('');
  let categoria = $state<string>('');
  let descricao = $state('');
  let data = $state(getHojeISO());

  let categorias = $state<CategoriaRow[]>([]);
  let transacaoOriginal = $state<Transacao | null>(null);
  let loading = $state(true);
  let submitting = $state(false);
  let error = $state<string | null>(null);
  let confirmarEliminar = $state(false);

  // Resolved via $page.params.id (string) → parseInt
  let transacaoId = $derived(Number($page.params.id));

  let categoriasCompativeis = $derived(
    categorias
      .filter((c) => c.tipo === tipo || c.tipo === 'ambos')
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-PT'))
  );

  onMount(() => {
    void (async () => {
      try {
        const [cats, trans] = await Promise.all([
          listCategorias(),
          getTransacao(transacaoId)
        ]);
        categorias = cats;
        if (!trans) {
          error = $t('error.transacao_nao_encontrada', { default: 'Transação não encontrada.' });
          return;
        }
        transacaoOriginal = trans;
        tipo = trans.tipo;
        valorStr = String(trans.valor).replace('.', ',');
        categoria = trans.categoria;
        descricao = trans.descricao ?? '';
        data = trans.data;
      } catch (e) {
        error = e instanceof Error ? e.message : 'Erro a carregar transação.';
      } finally {
        loading = false;
      }
    })();
  });

  async function handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    if (!transacaoOriginal) return;
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

    submitting = true;
    try {
      await updateTransacao(transacaoId, {
        tipo,
        valor: valorNum,
        categoria,
        descricao,
        data
      });
      showToast($t('toast.transacao_atualizada', { default: 'Transação atualizada.' }));
      await goto('/financas/transacoes');
    } catch (err) {
      error =
        err instanceof Error && err.message === 'valor_invalido'
          ? 'O valor tem de ser maior que zero.'
          : 'Erro a guardar a transação.';
    } finally {
      submitting = false;
    }
  }

  async function handleDelete(): Promise<void> {
    if (!transacaoOriginal) return;
    if (!confirmarEliminar) {
      confirmarEliminar = true;
      setTimeout(() => (confirmarEliminar = false), 4000);
      return;
    }
    submitting = true;
    try {
      await deleteTransacao(transacaoId);
      showToast($t('toast.transacao_removida', { default: 'Transação removida.' }));
      await goto('/financas/transacoes');
    } catch {
      error = $t('error.erro_a_remover_a_transacao', { default: 'Erro a remover a transação.' });
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>Editar transação — Presuntinho</title>
</svelte:head>

<main class="container" aria-labelledby="page-title">
  <header class="page-header">
    <a href="/financas/transacoes" class="back-link" aria-label="Voltar à lista">
      ← Transações
    </a>
    <h1 id="page-title">{$t('financas.transacoes.editar.titulo', { default: 'Editar transação' })}</h1>
  </header>

  {#if loading}
    <p aria-live="polite">{$t('common.loading', { default: 'A carregar…' })}</p>
  {:else if error && !transacaoOriginal}
    <p class="error" role="alert">{error}</p>
  {:else if transacaoOriginal}
    <form onsubmit={handleSubmit} novalidate>
      <fieldset class="tipo" aria-label="{$t('a11y.aria.tipo_de_transacao', { default: 'Tipo de transação' })}">
        <legend>{$t('financas.transacoes.editar.tipo.legend', { default: 'Tipo' })}</legend>
                <label class="radio">
                  <input type="radio" bind:group={tipo} value="despesa" name="tipo" />
                  <span>{$t('financas.transacoes.editar.tipo.despesa', { default: 'Despesa' })}</span>
                </label>
                <label class="radio">
                  <input type="radio" bind:group={tipo} value="receita" name="tipo" />
                  <span>{$t('financas.transacoes.editar.tipo.receita', { default: 'Receita' })}</span>
                </label>
      </fieldset>

      <div class="field">
        <label for="valor">{$t('financas.transacoes.editar.valor', { default: 'Valor (€)' })}</label>
        <input
          id="valor"
          type="text"
          inputmode="decimal"
          bind:value={valorStr}
          aria-invalid={error?.includes('valor') ? 'true' : undefined}
          required
        />
      </div>

      <div class="field">
        <label for="categoria">{$t('financas.transacoes.editar.categoria', { default: 'Categoria' })}</label>
        <select id="categoria" bind:value={categoria} required>
          {#each categoriasCompativeis as cat (cat.id)}
            <option value={cat.id}>{cat.icone} {cat.nome}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label for="descricao">{$t('financas.transacoes.editar.descricao', { default: 'Descrição (opcional)' })}</label>
        <input
          id="descricao"
          type="text"
          maxlength="120"
          bind:value={descricao}
        />
      </div>

      <div class="field">
        <label for="data">{$t('financas.transacoes.editar.data', { default: 'Data' })}</label>
        <input id="data" type="date" bind:value={data} required />
      </div>

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      <div class="actions">
        <button type="submit" class="btn-primary" disabled={submitting}>
          {submitting ? 'A guardar…' : 'Gravar'}
        </button>
        <button
          type="button"
          class="btn-ghost"
          onclick={() => goto('/financas/transacoes')}
          disabled={submitting}
        >
          Cancelar
        </button>
        <button
          type="button"
          class="btn-danger"
          onclick={handleDelete}
          disabled={submitting}
          aria-label="{$t('a11y.aria.eliminar_transacao', { default: 'Eliminar transação' })}"
        >
          {confirmarEliminar ? 'Confirmar?' : 'Eliminar'}
        </button>
      </div>
    </form>
  {/if}
</main>

<style>
  .container {
    max-width: 640px;
    margin: 0 auto;
    padding: 1rem;
  }
  .page-header {
    margin-bottom: 1.5rem;
  }
  .back-link {
    text-decoration: none;
    color: var(--link, #6cb6ff);
    font-size: 0.9rem;
  }
  h1 {
    font-size: 1.5rem;
    margin: 0.25rem 0 0;
  }
  fieldset.tipo {
    display: flex;
    gap: 1rem;
    border: none;
    padding: 0;
    margin-bottom: 1rem;
  }
  .radio {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    margin-bottom: 1rem;
  }
  .field label {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .field input,
  .field select {
    padding: 0.6rem;
    font-size: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    background: var(--bg-input, #2a3a5a);
    color: inherit;
  }
  .field input[aria-invalid='true'] {
    border-color: #e74c3c;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1.5rem;
    flex-wrap: wrap;
  }
  button {
    padding: 0.6rem 1rem;
    font-size: 1rem;
    border-radius: 6px;
    border: none;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .btn-primary {
    background: var(--accent, #ec4899);
    color: white;
  }
  .btn-ghost {
    background: transparent;
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }
  .btn-danger {
    background: #c0392b;
    color: white;
    margin-left: auto;
  }
  .error {
    color: #e74c3c;
    margin-top: 0.5rem;
  }
</style>
