<!--
  /financas/metas — metas de poupança (V8, Dexie v8 `metas` table).

  Funcionalidades:
    * Lista de metas com barra de progresso (poupado / alvo, %).
    * Criar meta (nome, alvo, emoji, prazo YYYY-MM opcional).
    * Editar inline (nome / alvo / emoji / prazo) e eliminar (confirm 2-cliques).
    * "Adicionar dinheiro" rápido por meta — +XP via awardXP dentro de
      addDinheiroMeta ('meta_progress' / 'meta_reached'); ao atingir o alvo
      dispara confetti + toast celebratório.
    * Modo cuidado (mood Sick/Soft): tudo só de leitura com aviso carinhoso.

  Todos os acessos à DB passam por $lib/financas (helpers de domínio);
  o componente nunca toca em db() directamente.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import {
    listMetas,
    addMeta,
    updateMeta,
    deleteMeta,
    addDinheiroMeta,
    formatValor,
    formatMes,
    type Meta
  } from '$lib/financas';
  import { showToast, fireConfettiEvent } from '$lib/components/events';
  import { playSfx, vibrate } from '$lib/gamification/sound';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { useMoodState } from '$lib/mood/useMoodState.svelte';

  // V10 — 25/50/75% milestones on the progress bar, celebrated on crossing.
  const META_MILESTONES = [25, 50, 75] as const;

  let metas = $state<Meta[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // --- criar nova meta -------------------------------------------------------
  let showForm = $state(false);
  let novoNome = $state('');
  let novoAlvoStr = $state('');
  let novoIcone = $state('🎯');
  let novoPrazo = $state('');
  let formError = $state<string | null>(null);
  let submitting = $state(false);

  // --- editar / eliminar / depositar ----------------------------------------
  let editingId = $state<number | null>(null);
  let editNome = $state('');
  let editAlvoStr = $state('');
  let editIcone = $state('');
  let editPrazo = $state('');
  let confirmingDelete = $state<number | null>(null);
  let depositStr = $state<Record<number, string>>({});
  let busyId = $state<number | null>(null);

  const numberLocale = $derived($locale || 'pt-PT');

  // V8 (mood): Sick/Soft ⇒ só leitura.
  const moodState = useMoodState();
  const readOnly = $derived(moodState.isSick || moodState.isSoft);

  const metasAtivas = $derived(metas.filter((m) => !m.doneAt));
  const metasConcluidas = $derived(metas.filter((m) => Boolean(m.doneAt)));
  const totalPoupado = $derived(metas.reduce((s, m) => s + m.poupado, 0));

  onMount(() => {
    void refresh();
  });

  async function refresh(): Promise<void> {
    try {
      metas = await listMetas();
      error = null;
    } catch (e) {
      console.error('[financas/metas] load failed', e);
      error = $t('financas.metas.erro.carregar', { default: 'Erro a carregar as metas.' });
    } finally {
      loading = false;
    }
  }

  function percentOf(m: Meta): number {
    if (!Number.isFinite(m.alvo) || m.alvo <= 0) return 0;
    return Math.min((m.poupado / m.alvo) * 100, 100);
  }

  function parseValor(raw: string): number {
    return Number(raw.trim().replace(',', '.'));
  }

  async function handleCreate(e: Event): Promise<void> {
    e.preventDefault();
    if (readOnly || submitting) return;
    formError = null;
    const alvo = parseValor(novoAlvoStr);
    if (!novoNome.trim()) {
      formError = $t('financas.metas.erro.nome', { default: 'Dá um nome à tua meta — pode ser um sonho pequenino.' });
      return;
    }
    if (!Number.isFinite(alvo) || alvo <= 0) {
      formError = $t('financas.metas.erro.alvo', { default: 'O valor alvo tem de ser maior que zero.' });
      return;
    }
    submitting = true;
    try {
      await addMeta({
        nome: novoNome,
        alvo,
        icone: novoIcone,
        prazo: novoPrazo || undefined
      });
      novoNome = '';
      novoAlvoStr = '';
      novoIcone = '🎯';
      novoPrazo = '';
      showForm = false;
      await refresh();
      showToast($t('financas.metas.toast.criada', { default: 'Meta criada — pequenos passos, grandes sonhos ✨' }));
    } catch (err) {
      console.error('[financas/metas] addMeta failed', err);
      formError = $t('financas.metas.erro.guardar', { default: 'Erro a guardar a meta.' });
    } finally {
      submitting = false;
    }
  }

  function startEdit(m: Meta): void {
    if (readOnly) return;
    editingId = m.id;
    editNome = m.nome;
    editAlvoStr = String(m.alvo).replace('.', ',');
    editIcone = m.icone ?? '🎯';
    editPrazo = m.prazo ?? '';
    formError = null;
  }

  function cancelEdit(): void {
    editingId = null;
  }

  async function handleEditSave(m: Meta): Promise<void> {
    if (readOnly || busyId !== null) return;
    const alvo = parseValor(editAlvoStr);
    if (!editNome.trim()) {
      showToast($t('financas.metas.erro.nome', { default: 'Dá um nome à tua meta — pode ser um sonho pequenino.' }));
      return;
    }
    if (!Number.isFinite(alvo) || alvo <= 0) {
      showToast($t('financas.metas.erro.alvo', { default: 'O valor alvo tem de ser maior que zero.' }));
      return;
    }
    busyId = m.id;
    try {
      await updateMeta(m.id, {
        nome: editNome,
        alvo,
        icone: editIcone,
        prazo: editPrazo || ''
      });
      editingId = null;
      await refresh();
      showToast($t('financas.metas.toast.atualizada', { default: 'Meta atualizada.' }));
    } catch (err) {
      console.error('[financas/metas] updateMeta failed', err);
      showToast($t('financas.metas.erro.guardar', { default: 'Erro a guardar a meta.' }));
    } finally {
      busyId = null;
    }
  }

  async function handleDelete(id: number): Promise<void> {
    if (readOnly) return;
    if (confirmingDelete !== id) {
      confirmingDelete = id;
      setTimeout(() => {
        if (confirmingDelete === id) confirmingDelete = null;
      }, 4000);
      return;
    }
    confirmingDelete = null;
    busyId = id;
    try {
      await deleteMeta(id);
      await refresh();
      showToast($t('financas.metas.toast.removida', { default: 'Meta removida — sem drama, os planos mudam.' }));
    } catch (err) {
      console.error('[financas/metas] deleteMeta failed', err);
      showToast($t('financas.metas.erro.remover', { default: 'Erro a remover a meta.' }));
    } finally {
      busyId = null;
    }
  }

  async function handleDeposit(m: Meta): Promise<void> {
    if (readOnly || busyId !== null) return;
    const valor = parseValor(depositStr[m.id] ?? '');
    if (!Number.isFinite(valor) || valor === 0) {
      showToast($t('financas.metas.erro.deposito', { default: 'Indica um valor para adicionar.' }));
      return;
    }
    busyId = m.id;
    // V10 — remember the % BEFORE the deposit to detect milestone crossings.
    const pctBefore = percentOf(m);
    try {
      const result = await addDinheiroMeta(m.id, valor);
      depositStr = { ...depositStr, [m.id]: '' };
      await refresh();
      if (result?.reached) {
        fireConfettiEvent(120);
        playSfx('fanfare');
        vibrate('success');
        showToast($t('financas.metas.toast.atingida', { default: '🎉 Meta atingida! Estamos tão orgulhosos de ti!' }));
      } else if (valor > 0) {
        const pctAfter = result ? percentOf(result.meta) : pctBefore;
        const crossed = META_MILESTONES.filter((ms) => pctBefore < ms && pctAfter >= ms).pop();
        if (crossed !== undefined) {
          playSfx('ding');
          showToast(
            $t('financas.metas.toast.marco', {
              values: { pct: crossed },
              default: '🚩 {pct}% da meta — está quase!'
            })
          );
        } else {
          showToast($t('financas.metas.toast.deposito', { default: 'Poupança registada — continua assim 💪' }));
        }
      } else {
        showToast($t('financas.metas.toast.ajuste', { default: 'Valor ajustado.' }));
      }
    } catch (err) {
      console.error('[financas/metas] addDinheiroMeta failed', err);
      showToast($t('financas.metas.erro.deposito_guardar', { default: 'Erro a registar a poupança.' }));
    } finally {
      busyId = null;
    }
  }
</script>

<svelte:head>
  <title>{$t('financas.metas.title', { default: 'Metas de poupança' })} · Presuntinho</title>
  <meta name="description" content={$t('financas.metas.sub', { default: 'Sonhos com barra de progresso.' })} />
</svelte:head>

<div class="metas-page">
  <header class="hero">
    <h1>{$t('financas.metas.hero', { default: '🎯 Metas de poupança' })}</h1>
    <p class="sub">{$t('financas.metas.sub', { default: 'Sonhos com barra de progresso.' })}</p>
  </header>

  <nav class="crumbs" aria-label={$t('a11y.aria.caminho_de_navegacao', { default: 'Caminho de navegação' })}>
    <a href="/">{$t('financas.crumbs.hub', { default: '← Hub' })}</a>
    <span aria-hidden="true">/</span>
    <a href="/financas/">{$t('financas.transacoes.breadcrumb.home', { default: '← Finanças' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('financas.metas.crumb', { default: 'Metas' })}</span>
  </nav>

  {#if readOnly}
    <p class="mood-readonly" role="note">
      <span aria-hidden="true">🌿</span>
      {$t('financas.mood.readonly', { default: 'Modo cuidado ativo — hoje é só para ver. As alterações ficam para quando estiveres melhor 🤍' })}
    </p>
  {/if}

  {#if loading}
    <Skeleton variant="card" lines={3} />
  {:else if error}
    <p class="empty error" role="alert">⚠️ {error}</p>
  {:else}
    {#if metas.length > 0}
      <p class="total-line">
        {$t('financas.metas.total', { values: { valor: formatValor(totalPoupado, numberLocale) }, default: 'Já poupaste {valor} entre todas as metas 💖' })}
      </p>
    {/if}

    {#if !readOnly}
      {#if !showForm}
        <button type="button" class="btn-new" onclick={() => (showForm = true)}>
          {$t('financas.metas.cta.nova', { default: '➕ Nova meta' })}
        </button>
      {:else}
        <form class="form" onsubmit={handleCreate} novalidate aria-label={$t('financas.metas.form.aria', { default: 'Nova meta de poupança' })}>
          <div class="form-grid">
            <div class="field grow">
              <label for="meta-nome">{$t('financas.metas.form.nome', { default: 'Nome' })} <span aria-hidden="true">*</span></label>
              <input
                id="meta-nome"
                type="text"
                bind:value={novoNome}
                maxlength="80"
                placeholder={$t('financas.metas.form.nome_placeholder', { default: 'Ex.: Viagem a Lisboa' })}
                autocomplete="off"
              />
            </div>
            <div class="field">
              <label for="meta-alvo">{$t('financas.metas.form.alvo', { default: 'Valor alvo' })} <span aria-hidden="true">*</span></label>
              <div class="valor-row">
                <input
                  id="meta-alvo"
                  type="text"
                  inputmode="decimal"
                  bind:value={novoAlvoStr}
                  placeholder={$t('placeholder.zero_zero', { default: '0,00' })}
                  autocomplete="off"
                />
                <span class="euro" aria-hidden="true">{$t('currency.symbol')}</span>
              </div>
            </div>
            <div class="field small">
              <label for="meta-icone">{$t('financas.metas.form.icone', { default: 'Emoji' })}</label>
              <input id="meta-icone" type="text" bind:value={novoIcone} maxlength="4" autocomplete="off" />
            </div>
            <div class="field">
              <label for="meta-prazo">{$t('financas.metas.form.prazo', { default: 'Prazo (opcional)' })}</label>
              <input id="meta-prazo" type="month" bind:value={novoPrazo} />
            </div>
          </div>
          {#if formError}
            <p class="form-error" role="alert">⚠️ {formError}</p>
          {/if}
          <div class="form-actions">
            <button type="button" class="btn-secondary" onclick={() => { showForm = false; formError = null; }}>
              {$t('financas.metas.form.cancelar', { default: 'Cancelar' })}
            </button>
            <button type="submit" class="btn-primary" disabled={submitting}>
              {submitting ? $t('common.loading', { default: 'A carregar…' }) : $t('financas.metas.form.criar', { default: 'Criar meta' })}
            </button>
          </div>
        </form>
      {/if}
    {/if}

    {#if metas.length === 0}
      <section class="empty-hero">
        <span class="empty-emoji" aria-hidden="true">🌱</span>
        <h2 class="empty-title">{$t('financas.metas.empty.title', { default: 'Ainda não há metas' })}</h2>
        <p class="empty-sub">{$t('financas.metas.empty.sub', { default: 'Uma viagem, um portátil novo, um fundo de emergência… cria a primeira e vê a barrinha crescer.' })}</p>
      </section>
    {:else}
      <section class="lista" aria-label={$t('financas.metas.lista.aria', { default: 'Lista de metas' })}>
        {#each [...metasAtivas, ...metasConcluidas] as m (m.id)}
          <article class="meta-card" class:done={Boolean(m.doneAt)} style="--meta-cor: {m.cor || 'var(--accent)'}">
            {#if editingId === m.id}
              <!-- modo edição -->
              <div class="edit-grid">
                <div class="field small">
                  <label for={`edit-icone-${m.id}`}>{$t('financas.metas.form.icone', { default: 'Emoji' })}</label>
                  <input id={`edit-icone-${m.id}`} type="text" bind:value={editIcone} maxlength="4" />
                </div>
                <div class="field grow">
                  <label for={`edit-nome-${m.id}`}>{$t('financas.metas.form.nome', { default: 'Nome' })}</label>
                  <input id={`edit-nome-${m.id}`} type="text" bind:value={editNome} maxlength="80" />
                </div>
                <div class="field">
                  <label for={`edit-alvo-${m.id}`}>{$t('financas.metas.form.alvo', { default: 'Valor alvo' })}</label>
                  <input id={`edit-alvo-${m.id}`} type="text" inputmode="decimal" bind:value={editAlvoStr} />
                </div>
                <div class="field">
                  <label for={`edit-prazo-${m.id}`}>{$t('financas.metas.form.prazo', { default: 'Prazo (opcional)' })}</label>
                  <input id={`edit-prazo-${m.id}`} type="month" bind:value={editPrazo} />
                </div>
              </div>
              <div class="form-actions">
                <button type="button" class="btn-secondary" onclick={cancelEdit}>
                  {$t('financas.metas.form.cancelar', { default: 'Cancelar' })}
                </button>
                <button type="button" class="btn-primary" onclick={() => handleEditSave(m)} disabled={busyId === m.id}>
                  {$t('financas.metas.form.gravar', { default: 'Gravar' })}
                </button>
              </div>
            {:else}
              <header class="meta-head">
                <span class="meta-icon" aria-hidden="true">{m.icone ?? '🎯'}</span>
                <div class="meta-title">
                  <h3 class="meta-nome">{m.nome}</h3>
                  <span class="meta-meta">
                    {formatValor(m.poupado, numberLocale)}
                    <span class="de">{$t('financas.orcamento.of_limit', { default: 'de' })}</span>
                    {formatValor(m.alvo, numberLocale)}
                    {#if m.prazo}
                      · {$t('financas.metas.ate', { default: 'até' })} {formatMes(m.prazo, numberLocale)}
                    {/if}
                  </span>
                </div>
                <span class="meta-percent" class:done={Boolean(m.doneAt)}>
                  {Math.round(percentOf(m))}%
                </span>
              </header>

              <div
                class="bar-wrap"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={Math.round(percentOf(m))}
                aria-label={m.nome}
              >
                <div class="bar" class:done={Boolean(m.doneAt)} style="width: {percentOf(m)}%"></div>
                {#each META_MILESTONES as ms (ms)}
                  <span
                    class="bar-tick"
                    class:passed={percentOf(m) >= ms}
                    style="inset-inline-start: {ms}%"
                    aria-hidden="true"
                  ></span>
                {/each}
              </div>

              {#if m.doneAt}
                <p class="done-msg" role="status">
                  🎉 {$t('financas.metas.done', { default: 'Conseguiste! Meta atingida — mereces um miminho.' })}
                </p>
              {:else}
                <p class="falta-msg">
                  {$t('financas.metas.falta', { values: { valor: formatValor(Math.max(m.alvo - m.poupado, 0), numberLocale) }, default: 'Faltam {valor} — cada moedinha conta 🪙' })}
                </p>
              {/if}

              {#if !readOnly}
                <div class="meta-actions">
                  {#if !m.doneAt}
                    <div class="deposit">
                      <label class="sr-only" for={`deposit-${m.id}`}>
                        {$t('financas.metas.deposito.aria', { values: { nome: m.nome }, default: 'Valor a adicionar a {nome}' })}
                      </label>
                      <input
                        id={`deposit-${m.id}`}
                        type="text"
                        inputmode="decimal"
                        placeholder={$t('placeholder.zero_zero', { default: '0,00' })}
                        value={depositStr[m.id] ?? ''}
                        oninput={(e) => (depositStr = { ...depositStr, [m.id]: (e.currentTarget as HTMLInputElement).value })}
                        onkeydown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleDeposit(m);
                          }
                        }}
                      />
                      <button type="button" class="btn-deposit" onclick={() => handleDeposit(m)} disabled={busyId === m.id}>
                        {$t('financas.metas.deposito.cta', { default: '+ Adicionar' })}
                      </button>
                    </div>
                  {/if}
                  <div class="row-btns">
                    <button type="button" class="btn-ghost" onclick={() => startEdit(m)} aria-label={`${$t('financas.metas.editar.aria', { default: 'Editar meta' })}: ${m.nome}`}>
                      ✏️ {$t('financas.metas.editar', { default: 'Editar' })}
                    </button>
                    <button
                      type="button"
                      class="btn-ghost danger"
                      onclick={() => handleDelete(m.id)}
                      disabled={busyId === m.id}
                      aria-label={`${$t('financas.metas.eliminar.aria', { default: 'Eliminar meta' })}: ${m.nome}`}
                      data-confirming={confirmingDelete === m.id}
                    >
                      {confirmingDelete === m.id ? $t('financas.transacoes.edit.confirm', { default: 'Confirmar?' }) : `🗑️ ${$t('financas.metas.eliminar', { default: 'Eliminar' })}`}
                    </button>
                  </div>
                </div>
              {/if}
            {/if}
          </article>
        {/each}
      </section>
    {/if}
  {/if}
</div>

<style>
  .metas-page {
    max-width: 680px;
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
  .empty {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 0.75rem);
    padding: 1.5rem;
    text-align: center;
    color: var(--txt2);
  }
  .empty.error {
    border-color: var(--error);
    color: var(--error);
  }
  .total-line {
    margin: 0 0 1rem;
    text-align: center;
    color: var(--txt2);
    font-size: var(--fs-sm, 0.9rem);
  }
  .btn-new {
    display: block;
    width: 100%;
    padding: 0.875rem 1.25rem;
    min-height: 44px;
    margin-bottom: 1.25rem;
    background: var(--success);
    color: var(--on-accent, #fff);
    border: 0;
    border-radius: var(--radius-md, 0.6rem);
    font-family: inherit;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: filter var(--motion-fast, 120ms), transform var(--motion-fast, 120ms);
  }
  .btn-new:hover,
  .btn-new:focus-visible {
    filter: brightness(1.06);
    transform: translateY(-1px);
    outline: none;
  }
  .btn-new:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 40%, transparent);
  }
  .form {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 0.75rem);
    padding: 1.25rem;
    margin-bottom: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .form-grid,
  .edit-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.875rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }
  .field label {
    font-size: var(--fs-sm, 0.875rem);
    font-weight: 600;
    color: var(--txt);
  }
  .field input {
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: var(--bg-elev, rgba(0, 0, 0, 0.25));
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 0.5rem);
    color: var(--txt);
    font-size: 1rem;
    font-family: inherit;
  }
  .field input:focus-visible {
    outline: none;
    border-color: var(--success);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 30%, transparent);
  }
  .valor-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .valor-row input {
    flex: 1;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .euro {
    color: var(--txt3);
    font-weight: 600;
  }
  .form-error {
    margin: 0;
    color: var(--error);
    font-size: var(--fs-sm, 0.875rem);
  }
  .form-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .btn-primary,
  .btn-secondary {
    padding: 0.625rem 1.25rem;
    min-height: 44px;
    border-radius: var(--radius-sm, 0.5rem);
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    border: 0;
    font-family: inherit;
    display: inline-flex;
    align-items: center;
  }
  .btn-primary {
    background: var(--success);
    color: var(--on-accent, #fff);
  }
  .btn-primary:hover:not(:disabled),
  .btn-primary:focus-visible:not(:disabled) {
    filter: brightness(1.06);
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 35%, transparent);
  }
  .btn-primary:disabled {
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
  .empty-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.5rem;
    padding: 2rem 1rem;
    background: var(--card);
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg, 0.75rem);
  }
  .empty-emoji {
    font-size: 2.5rem;
  }
  .empty-title {
    margin: 0;
    color: var(--txt);
    font-size: 1.1rem;
  }
  .empty-sub {
    margin: 0;
    color: var(--txt2);
    font-size: 0.95rem;
    max-width: 40ch;
  }
  .lista {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }
  .meta-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-left: 4px solid var(--meta-cor, var(--accent));
    border-radius: var(--radius-lg, 0.75rem);
    padding: 1rem 1.125rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  .meta-card.done {
    border-left-color: var(--success);
  }
  .meta-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .meta-icon {
    font-size: 1.5rem;
    line-height: 1;
    width: 2.5rem;
    height: 2.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--meta-cor, var(--accent)) 16%, transparent);
    flex-shrink: 0;
  }
  .meta-title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .meta-nome {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--txt);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta-meta {
    font-size: var(--fs-xs, 0.8125rem);
    color: var(--txt3);
    font-variant-numeric: tabular-nums;
  }
  .meta-meta .de {
    color: var(--txt3);
  }
  .meta-percent {
    font-weight: 700;
    font-size: 1rem;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .meta-percent.done {
    color: var(--success);
  }
  .bar-wrap {
    position: relative;
    width: 100%;
    height: 10px;
    background: var(--bg-elev, rgba(0, 0, 0, 0.3));
    border-radius: 999px;
    overflow: hidden;
  }
  /* V10 — 25/50/75% milestone ticks; light up once passed. */
  .bar-tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: color-mix(in srgb, var(--txt, #fff) 25%, transparent);
    transform: translateX(-1px);
  }
  .bar-tick.passed {
    background: color-mix(in srgb, var(--on-accent, #fff) 75%, transparent);
  }
  .bar {
    height: 100%;
    background: var(--meta-cor, var(--accent));
    border-radius: 999px;
    transition: width var(--motion-base, 220ms) ease;
  }
  .bar.done {
    background: var(--success);
  }
  .done-msg {
    margin: 0;
    color: var(--success);
    font-size: var(--fs-sm, 0.875rem);
    font-weight: 600;
  }
  .falta-msg {
    margin: 0;
    color: var(--txt2);
    font-size: var(--fs-sm, 0.875rem);
  }
  .meta-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .deposit {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .deposit input {
    flex: 1;
    min-width: 0;
    padding: 0.5rem 0.625rem;
    background: var(--bg-elev, rgba(0, 0, 0, 0.25));
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 0.5rem);
    color: var(--txt);
    font-size: 0.9375rem;
    font-family: inherit;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .deposit input:focus-visible {
    outline: none;
    border-color: var(--success);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 25%, transparent);
  }
  .btn-deposit {
    padding: 0.5rem 0.875rem;
    min-height: 44px;
    background: color-mix(in srgb, var(--success) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--success) 45%, transparent);
    border-radius: var(--radius-sm, 0.5rem);
    color: var(--success);
    font-family: inherit;
    font-size: var(--fs-sm, 0.875rem);
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
    transition: background var(--motion-fast, 120ms);
  }
  .btn-deposit:hover:not(:disabled),
  .btn-deposit:focus-visible:not(:disabled) {
    background: color-mix(in srgb, var(--success) 26%, transparent);
    outline: none;
  }
  .btn-deposit:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 30%, transparent);
  }
  .btn-deposit:disabled {
    opacity: 0.5;
    cursor: progress;
  }
  .row-btns {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .btn-ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--txt2);
    padding: 0.4rem 0.75rem;
    min-height: 44px;
    border-radius: var(--radius-sm, 0.5rem);
    font-size: var(--fs-sm, 0.8125rem);
    font-family: inherit;
    cursor: pointer;
    transition: background var(--motion-fast, 120ms), color var(--motion-fast, 120ms);
  }
  .btn-ghost:hover:not(:disabled),
  .btn-ghost:focus-visible:not(:disabled) {
    background: var(--card-hover, rgba(255, 255, 255, 0.08));
    color: var(--txt);
    outline: none;
  }
  .btn-ghost.danger:hover:not(:disabled),
  .btn-ghost.danger:focus-visible:not(:disabled) {
    background: color-mix(in srgb, var(--error) 12%, transparent);
    color: var(--error);
    border-color: color-mix(in srgb, var(--error) 40%, transparent);
  }
  .btn-ghost[data-confirming='true'] {
    background: var(--error);
    color: var(--on-accent, #fff);
    border-color: var(--error);
    font-weight: 700;
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
    .metas-page {
      padding: 2rem 1.5rem 3rem;
    }
    .hero h1 {
      font-size: 2.25rem;
    }
    .form-grid,
    .edit-grid {
      grid-template-columns: 2fr 1fr;
    }
    .field.grow {
      grid-column: span 2;
    }
    .field.small {
      max-width: 8rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bar,
    .btn-new {
      transition: none;
      transform: none;
    }
  }
</style>
