<!--
  /financas/transacoes/[id] — editar uma transação existente.

  V8: restyled para espelhar /financas/nova (mesmo layout de formulário,
  tokens do tema, toggle receita/despesa, preview da categoria) e com
  erros i18n reais em vez de mensagens adivinhadas no catch.

  Extras V8:
    * Toggle "repetir todos os meses" (recorrente: 'mensal') — a mesma
      flag usada em /financas/nova; desligar limpa a flag na linha.
    * Modo cuidado (mood Sick/Soft): formulário só de leitura com aviso
      carinhoso — gravar/eliminar ficam para um dia melhor.

  Botões:
    * Gravar    — submit (Enter em qualquer input)
    * Cancelar  — link para /financas/transacoes/
    * Eliminar  — confirmação inline (2 cliques), depois deleteTransacao
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { locale, t } from 'svelte-i18n';
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
  import { useMoodState } from '$lib/mood/useMoodState.svelte';

  let tipo = $state<'receita' | 'despesa'>('despesa');
  let valorStr = $state('');
  let categoria = $state<string>('');
  let descricao = $state('');
  let data = $state(getHojeISO());
  let recorrente = $state(false);

  let categorias = $state<CategoriaRow[]>([]);
  let transacaoOriginal = $state<Transacao | null>(null);
  let loading = $state(true);
  let submitting = $state(false);
  let error = $state<string | null>(null);
  let confirmarEliminar = $state(false);
  const sortLocale = $derived($locale || 'pt-PT');

  // V8 (mood): Sick/Soft ⇒ só leitura, com aviso explícito.
  const moodState = useMoodState();
  const readOnly = $derived(moodState.isSick || moodState.isSoft);

  // Resolved via $page.params.id (string) → Number
  let transacaoId = $derived(Number($page.params.id));

  let categoriasCompativeis = $derived(
    categorias
      .filter((c) => c.tipo === tipo || c.tipo === 'ambos')
      .sort((a, b) => a.nome.localeCompare(b.nome, sortLocale))
  );

  // Categoria escolhida (objeto) para o preview de ícone/cor — igual a /nova.
  let categoriaAtual = $derived(categorias.find((c) => c.id === categoria));

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
        recorrente = trans.recorrente === 'mensal';
      } catch (e) {
        console.error('[financas/editar] load failed', e);
        error = $t('financas.transacoes.editar.erro.carregar', { default: 'Erro a carregar transação.' });
      } finally {
        loading = false;
      }
    })();
  });

  /** Traduz os códigos de erro do domínio (updateTransacao) para copy i18n. */
  function mapDomainError(e: unknown): string {
    const code = e instanceof Error ? e.message : '';
    switch (code) {
      case 'valor_invalido':
        return $t('financas.transacoes.editar.erro.valor_zero', { default: 'O valor tem de ser maior que zero.' });
      case 'categoria_obrigatoria':
        return $t('financas.transacoes.editar.erro.sem_categoria', { default: 'Escolhe uma categoria.' });
      case 'data_invalida':
        return $t('financas.transacoes.editar.erro.sem_data', { default: 'Indica uma data.' });
      default:
        return $t('financas.transacoes.editar.erro.guardar', { default: 'Erro a guardar a transação.' });
    }
  }

  async function handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    if (!transacaoOriginal || readOnly) return;
    error = null;

    const valorNum = Number(valorStr.trim().replace(',', '.'));
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      error = $t('financas.transacoes.editar.erro.valor_zero', { default: 'O valor tem de ser maior que zero.' });
      return;
    }
    if (!categoria) {
      error = $t('financas.transacoes.editar.erro.sem_categoria', { default: 'Escolhe uma categoria.' });
      return;
    }
    if (!data) {
      error = $t('financas.transacoes.editar.erro.sem_data', { default: 'Indica uma data.' });
      return;
    }

    submitting = true;
    try {
      await updateTransacao(transacaoId, {
        tipo,
        valor: valorNum,
        categoria,
        descricao,
        data,
        recorrente: recorrente ? 'mensal' : null
      });
      showToast($t('toast.transacao_atualizada', { default: 'Transação atualizada.' }));
      await goto('/financas/transacoes/');
    } catch (err) {
      // V8: nunca engolir — logamos a causa real e mostramos a mensagem
      // mapeada do código de domínio.
      console.error('[financas/editar] updateTransacao failed', err);
      error = mapDomainError(err);
    } finally {
      submitting = false;
    }
  }

  async function handleDelete(): Promise<void> {
    if (!transacaoOriginal || readOnly) return;
    if (!confirmarEliminar) {
      confirmarEliminar = true;
      setTimeout(() => (confirmarEliminar = false), 4000);
      return;
    }
    submitting = true;
    try {
      await deleteTransacao(transacaoId);
      showToast($t('toast.transacao_removida', { default: 'Transação removida.' }));
      await goto('/financas/transacoes/');
    } catch (err) {
      console.error('[financas/editar] deleteTransacao failed', err);
      error = $t('error.erro_a_remover_a_transacao', { default: 'Erro a remover a transação.' });
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>{$t('financas.transacoes.editar.titulo', { default: 'Editar transação' })} · Presuntinho</title>
</svelte:head>

<div class="editar-page">
  <header class="hero">
    <h1>{$t('financas.transacoes.editar.hero', { default: '✏️ Editar transação' })}</h1>
    <p class="sub">{$t('financas.transacoes.editar.sub', { default: 'Ajusta os detalhes e grava — sem stress.' })}</p>
  </header>

  <nav class="crumbs" aria-label={$t('a11y.aria.caminho_de_navegacao', { default: 'Caminho de navegação' })}>
    <a href="/">{$t('financas.crumbs.hub', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <a href="/financas/">{$t('financas.transacoes.breadcrumb.home', { default: '← Finanças' })}</a>
    <span aria-hidden="true">/</span>
    <a href="/financas/transacoes/">{$t('financas.transacoes.breadcrumb.current', { default: 'Transações' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('financas.transacoes.editar.crumb', { default: 'Editar' })}</span>
  </nav>

  {#if loading}
    <p class="empty" aria-live="polite">{$t('common.loading', { default: 'A carregar…' })}</p>
  {:else if error && !transacaoOriginal}
    <div class="empty error-box" role="alert">
      <p class="error">⚠️ {error}</p>
      <a class="btn-secondary" href="/financas/transacoes/">{$t('financas.transacoes.edit.back', { default: '← Transações' })}</a>
    </div>
  {:else if transacaoOriginal}
    {#if readOnly}
      <p class="mood-readonly" role="note">
        <span aria-hidden="true">🌿</span>
        {$t('financas.mood.readonly', { default: 'Modo cuidado ativo — hoje é só para ver. As alterações ficam para quando estiveres melhor 🤍' })}
      </p>
    {/if}

    <form class="form" onsubmit={handleSubmit} novalidate>
      <!-- Toggle tipo (receita / despesa) — igual a /nova -->
      <fieldset class="tipo-field" aria-label={$t('a11y.aria.tipo_de_transacao', { default: 'Tipo de transação' })}>
        <legend class="sr-only">{$t('a11y.aria.tipo_de_transacao', { default: 'Tipo de transação' })}</legend>
        <div class="tipo-toggle" role="radiogroup" aria-label={$t('a11y.aria.tipo_de_transacao', { default: 'Tipo de transação' })}>
          <button
            type="button"
            class="tipo-btn"
            class:active={tipo === 'despesa'}
            role="radio"
            aria-checked={tipo === 'despesa'}
            aria-label={$t('financas.transacoes.editar.tipo.despesa', { default: 'Despesa' })}
            onclick={() => (tipo = 'despesa')}
            disabled={readOnly}
          >
            <span class="tipo-icon" aria-hidden="true">💸</span>
            <span>{$t('financas.transacoes.editar.tipo.despesa', { default: 'Despesa' })}</span>
          </button>
          <button
            type="button"
            class="tipo-btn"
            class:active={tipo === 'receita'}
            role="radio"
            aria-checked={tipo === 'receita'}
            aria-label={$t('financas.transacoes.editar.tipo.receita', { default: 'Receita' })}
            onclick={() => (tipo = 'receita')}
            disabled={readOnly}
          >
            <span class="tipo-icon" aria-hidden="true">💰</span>
            <span>{$t('financas.transacoes.editar.tipo.receita', { default: 'Receita' })}</span>
          </button>
        </div>
      </fieldset>

      <!-- Valor -->
      <div class="field">
        <label for="valor">{$t('financas.nova.valor', { default: 'Valor' })} <span aria-hidden="true">*</span></label>
        <div class="valor-row">
          <input
            id="valor"
            type="text"
            inputmode="decimal"
            bind:value={valorStr}
            required
            autocomplete="off"
            aria-invalid={error ? 'true' : undefined}
            disabled={readOnly}
          />
          <span class="euro" aria-hidden="true">{$t('currency.symbol')}</span>
        </div>
      </div>

      <!-- Categoria -->
      <div class="field">
        <label for="categoria">{$t('financas.transacoes.editar.categoria', { default: 'Categoria' })} <span aria-hidden="true">*</span></label>
        <div class="cat-select">
          <select id="categoria" bind:value={categoria} required disabled={readOnly}>
            {#each categoriasCompativeis as c (c.id)}
              <option value={c.id}>{c.icone} {c.nome}</option>
            {/each}
          </select>
          {#if categoriaAtual}
            <span class="cat-preview" style="--cat-cor: {categoriaAtual.cor}" aria-hidden="true">
              {categoriaAtual.icone}
            </span>
          {/if}
        </div>
      </div>

      <!-- Descrição -->
      <div class="field">
        <label for="descricao">{$t('financas.transacoes.editar.descricao', { default: 'Descrição (opcional)' })}</label>
        <input
          id="descricao"
          type="text"
          maxlength="120"
          bind:value={descricao}
          autocomplete="off"
          disabled={readOnly}
        />
        <span class="hint">{$t('financas.nova.opcional', { default: 'Opcional' })}. {$t('financas.nova.maxCaracteres', { default: 'Máx. 120 caracteres.' })}</span>
      </div>

      <!-- Data -->
      <div class="field">
        <label for="data">{$t('financas.transacoes.editar.data', { default: 'Data' })} <span aria-hidden="true">*</span></label>
        <input id="data" type="date" bind:value={data} required disabled={readOnly} />
      </div>

      <!-- V8: recorrência mensal -->
      <div class="field">
        <label class="toggle-row" for="recorrente">
          <input id="recorrente" type="checkbox" bind:checked={recorrente} disabled={readOnly} />
          <span class="toggle-text">
            <span class="toggle-title">{$t('financas.nova.recorrente.label', { default: '🔁 Repetir todos os meses' })}</span>
            <span class="hint">{$t('financas.nova.recorrente.hint', { default: 'Ideal para renda, salário ou subscrições — criamos a cópia de cada mês por ti.' })}</span>
          </span>
        </label>
      </div>

      {#if error}
        <p class="error" role="alert">⚠️ {error}</p>
      {/if}

      <div class="actions">
        <button
          type="button"
          class="btn-danger"
          onclick={handleDelete}
          disabled={submitting || readOnly}
          aria-label={$t('a11y.aria.eliminar_transacao', { default: 'Eliminar transação' })}
        >
          {confirmarEliminar ? $t('financas.transacoes.edit.confirm', { default: 'Confirmar?' }) : $t('financas.transacoes.edit.delete', { default: 'Eliminar' })}
        </button>
        <a class="btn-secondary" href="/financas/transacoes/">{$t('financas.transacoes.edit.cancel', { default: 'Cancelar' })}</a>
        <button type="submit" class="btn-primary" class:receita={tipo === 'receita'} disabled={submitting || readOnly}>
          {submitting ? $t('financas.transacoes.editar.guardando', { default: 'A guardar…' }) : $t('financas.transacoes.edit.save', { default: 'Gravar' })}
        </button>
      </div>
    </form>
  {/if}
</div>

<style>
  .editar-page {
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
    color: var(--txt);
  }
  .sub {
    color: var(--txt2);
    margin: 0;
    font-size: 1rem;
  }
  .crumbs {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: var(--fs-sm, 0.875rem);
    color: var(--txt3);
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .crumbs a {
    color: var(--success);
    text-decoration: none;
  }
  .crumbs a:hover,
  .crumbs a:focus-visible {
    text-decoration: underline;
  }
  .empty {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 0.75rem);
    padding: 1.5rem;
    text-align: center;
    color: var(--txt2);
  }
  .error-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    border-color: var(--error);
  }
  .mood-readonly {
    margin: 0 0 1rem 0;
    padding: 0.7rem 0.9rem;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--card);
    border: 1px dashed var(--border);
    color: var(--txt2);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--fs-sm, 0.875rem);
  }
  .form {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 0.75rem);
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
    font-size: var(--fs-sm, 0.875rem);
    font-weight: 600;
    color: var(--txt);
  }
  .field input[type='text'],
  .field input[type='date'],
  .field select {
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: var(--bg-elev, rgba(0, 0, 0, 0.25));
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 0.5rem);
    color: var(--txt);
    font-size: 1rem;
    font-family: inherit;
  }
  .field input:focus-visible,
  .field select:focus-visible {
    outline: none;
    border-color: var(--success);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 30%, transparent);
  }
  .field input:disabled,
  .field select:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .field #valor {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    font-size: var(--fs-xs, 0.8125rem);
    color: var(--txt3);
    font-weight: 400;
  }
  .valor-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .valor-row input {
    flex: 1;
  }
  .euro {
    color: var(--txt3);
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
    background: color-mix(in srgb, var(--cat-cor, var(--txt3)) 18%, transparent);
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
    min-height: 44px;
    background: var(--bg-elev, rgba(0, 0, 0, 0.25));
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 0.625rem);
    color: var(--txt2);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.9375rem;
    font-weight: 600;
    transition: background var(--motion-fast, 120ms), border-color var(--motion-fast, 120ms), color var(--motion-fast, 120ms);
  }
  .tipo-btn:hover:not(:disabled),
  .tipo-btn:focus-visible:not(:disabled) {
    background: var(--card-hover, rgba(255, 255, 255, 0.06));
    color: var(--txt);
    outline: none;
  }
  .tipo-btn.active {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    border-color: var(--success);
    color: var(--success);
    box-shadow: 0 0 0 1px var(--success);
  }
  .tipo-btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .tipo-icon {
    font-size: 1.5rem;
    line-height: 1;
  }
  .toggle-row {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    cursor: pointer;
    padding: 0.25rem 0;
    min-height: 44px;
  }
  .toggle-row input[type='checkbox'] {
    width: 1.25rem;
    height: 1.25rem;
    margin-top: 0.125rem;
    accent-color: var(--success);
    flex-shrink: 0;
    cursor: pointer;
  }
  .toggle-row input[type='checkbox']:focus-visible {
    outline: 2px solid var(--success);
    outline-offset: 2px;
  }
  .toggle-row input[type='checkbox']:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  .toggle-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .toggle-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--txt);
  }
  .error {
    color: var(--error);
    margin: 0;
    font-size: var(--fs-sm, 0.875rem);
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .btn-primary,
  .btn-secondary,
  .btn-danger {
    padding: 0.625rem 1.25rem;
    min-height: 44px;
    border-radius: var(--radius-sm, 0.5rem);
    font-weight: 600;
    font-size: 1rem;
    text-decoration: none;
    cursor: pointer;
    border: 0;
    font-family: inherit;
    display: inline-flex;
    align-items: center;
  }
  .btn-primary {
    background: var(--error);   /* despesa = vermelho (default) */
    color: var(--on-accent, #fff);
  }
  .btn-primary.receita {
    background: var(--success);
  }
  .btn-primary:hover:not(:disabled),
  .btn-primary:focus-visible:not(:disabled) {
    filter: brightness(0.92);
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--error) 35%, transparent);
  }
  .btn-primary.receita:hover:not(:disabled),
  .btn-primary.receita:focus-visible:not(:disabled) {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 35%, transparent);
  }
  .btn-primary:disabled,
  .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-secondary {
    background: var(--card-hover, rgba(255, 255, 255, 0.05));
    color: var(--txt);
    border: 1px solid var(--border);
  }
  .btn-secondary:hover,
  .btn-secondary:focus-visible {
    background: var(--bg-elev, rgba(255, 255, 255, 0.12));
    outline: none;
  }
  .btn-danger {
    background: transparent;
    color: var(--error);
    border: 1px solid color-mix(in srgb, var(--error) 45%, transparent);
    margin-right: auto;
  }
  .btn-danger:hover:not(:disabled),
  .btn-danger:focus-visible:not(:disabled) {
    background: color-mix(in srgb, var(--error) 12%, transparent);
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--error) 25%, transparent);
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
    .editar-page {
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
