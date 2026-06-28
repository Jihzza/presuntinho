<!--
  /habitos/novo — create habit form.

  Fields:
    - name     (required, max 60 chars)
    - icon     (optional emoji, max 4 chars; defaults to ✅)
    - color    (palette picker; defaults to project pink #ec4899)
    - cadence  (MVP: only 'daily' — but the field is exposed so we can
               extend to weekly/monthly without another schema bump)

  Submit → addHabito() → navigate to the new habit's detail page.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { addHabito } from '$lib/habitos';
    import { showToast } from '$lib/components/events';
    import { t } from 'svelte-i18n';

  let name = $state('');
  let icon = $state('✅');
  let color = $state('#ec4899');
  let cadence = $state<'daily' | 'weekly'>('daily');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  // Palette of pink-ish swatches (the Hábitos accent).  Users can
  // change their habit's colour here to make the heatmap visually
  // distinct without repainting the entire page.
  const palette: string[] = [
    '#ec4899', // pink (default)
    '#f472b6', // light pink
    '#a855f7', // violet
    '#8b5cf6', // purple
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444'  // red
  ];

  // Quick icon suggestions — keeping the list short so the form stays
  // scannable.  Tapping a suggestion fills the icon field.
  const iconSuggestions: string[] = [
    '✅', '💧', '📚', '🏃', '🧘', '💪',
    '🥗', '😴', '✍️', '🎯', '☕', '🚶'
  ];

  async function handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    error = null;

    const trimmed = name.trim();
    if (!trimmed) {
      error = 'O nome é obrigatório.';
      return;
    }
    if (trimmed.length > 60) {
      error = 'Nome demasiado longo (máx. 60 caracteres).';
      return;
    }

    submitting = true;
    try {
      const id = await addHabito({
        name: trimmed,
        icon: icon.trim() || '✅',
        color,
        cadence
      });
      showToast('Hábito criado');
      goto(`/habitos/habit/${id}/`);
    } catch (e) {
      console.error('[habitos] addHabito failed', e);
      error = e instanceof Error ? e.message : 'Erro a criar hábito';
      submitting = false;
    }
  }

  onMount(() => {
    // Focus the name input on mount for keyboard-first users.
    const el = document.getElementById('habit-name') as HTMLInputElement | null;
    el?.focus();
  });

  // SEO — used by <svelte:head> below.
  let pageTitle = $derived('Novo Hábito · Hábitos');
  let description = $derived('Criar hábito diário');
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content="https://presuntinho.netlify.app/habitos/novo/" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={description} />
</svelte:head>

<div class="novo">
  <header class="hero">
    <h1>➕ Novo hábito</h1>
    <p class="sub">Define um hábito diário para acompanhares com streaks.</p>
  </header>

  <nav class="crumbs" aria-label="Caminho de navegação">
    <a href="/">← Hub</a>
    <span aria-hidden="true">/</span>
    <a href="/habitos/">{$t('habitos.novo.breadcrumb.home', { default: '← Hábitos' })}</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">{$t('habitos.novo.novo', { default: 'Novo' })}</span>
  </nav>

  <form class="form" onsubmit={handleSubmit} novalidate>
    <div class="field">
      <label for="habit-name">Nome <span aria-hidden="true">*</span></label>
      <input
        id="habit-name"
        type="text"
        bind:value={name}
        maxlength="60"
        required
        placeholder={$t('habitos.novo.placeholder.name', { default: 'Ex.: Beber 2L de água' })}
        autocomplete="off"
      />
      <span class="hint">{$t('habitos.new.name.hint', { default: 'Como queres chamar este hábito?' })}</span>
    </div>

    <div class="field">
      <label for="habit-icon">{$t('habitos.novo.label.icon', { default: 'Ícone' })}</label>
      <div class="icon-row">
        <input
          id="habit-icon"
          type="text"
          bind:value={icon}
          maxlength="4"
          placeholder="✅"
          aria-describedby="icon-hint"
        />
        <div class="suggestions" role="group" aria-label="Sugestões de ícones">
          {#each iconSuggestions as s (s)}
            <button
              type="button"
              class="suggestion"
              onclick={() => (icon = s)}
              aria-label={`Usar ícone ${s}`}
            >{s}</button>
          {/each}
        </div>
      </div>
      <span class="hint" id="icon-hint">Emoji curto (até 4 caracteres).</span>
    </div>

    <div class="field">
      <label for="habit-color">{$t('habitos.novo.label.color', { default: 'Cor' })}</label>
      <div class="palette" role="radiogroup" aria-label="Cor do hábito">
        {#each palette as c (c)}
          <button
            type="button"
            class="swatch"
            class:selected={color === c}
            style="--swatch: {c}"
            aria-label={`Cor ${c}`}
            aria-checked={color === c}
            role="radio"
            onclick={() => (color = c)}
          ></button>
        {/each}
      </div>
    </div>

    <fieldset class="field cadence-field">
      <legend>{$t('habitos.novo.legend.cadence', { default: 'Cadência' })}</legend>
      <div class="cadence-options">
        <label class="radio">
          <input type="radio" name="cadence" value="daily" bind:group={cadence} />
          <span>{$t('habitos.novo.cadence.daily', { default: 'Diário' })}</span>
        </label>
        <label class="radio disabled" title="Disponível em breve">
          <input type="radio" name="cadence" value="weekly" bind:group={cadence} disabled />
          <span>{$t('habitos.novo.cadence.weekly', { default: 'Semanal (brevemente)' })}</span>
        </label>
      </div>
    </fieldset>

    {#if error}
      <p class="error" role="alert">⚠️ {error}</p>
    {/if}

    <div class="actions">
      <a class="btn-secondary" href="/habitos/">{$t('habitos.novo.cancelar', { default: 'Cancelar' })}</a>
      <button type="submit" class="btn-primary" disabled={submitting}>
        {submitting ? 'A criar…' : 'Criar hábito'}
      </button>
    </div>
  </form>
</div>

<style>
  .novo {
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
    border: 0;
    padding: 0;
    margin: 0;
  }
  .field label,
  .field legend {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--txt, #fff);
  }
  .field input[type='text'] {
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: 0.5rem;
    color: var(--txt, #fff);
    font-size: 1rem;
    font-family: inherit;
  }
  .field input[type='text']:focus-visible {
    outline: none;
    border-color: var(--accent, #ec4899);
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.3);
  }
  .hint {
    font-size: 0.8125rem;
    color: var(--txt3, #94a3b8);
  }
  .icon-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .suggestion {
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    background: rgba(255, 255, 255, 0.05);
    color: var(--txt, #fff);
    border-radius: 0.5rem;
    padding: 0.375rem 0.625rem;
    font-size: 1.125rem;
    cursor: pointer;
    line-height: 1;
    transition: background 0.15s;
  }
  .suggestion:hover,
  .suggestion:focus-visible {
    background: rgba(255, 255, 255, 0.12);
    outline: none;
  }
  .palette {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .swatch {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: var(--swatch);
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s, border-color 0.15s;
  }
  .swatch:hover,
  .swatch:focus-visible {
    transform: scale(1.1);
    outline: none;
  }
  .swatch.selected {
    border-color: #fff;
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
  }
  .cadence-field {
    gap: 0.5rem;
  }
  .cadence-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .radio {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    color: var(--txt, #fff);
  }
  .radio.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .radio input[type='radio'] {
    accent-color: var(--accent, #ec4899);
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
    background: var(--accent, #ec4899);
    color: #fff;
  }
  .btn-primary:hover:not(:disabled),
  .btn-primary:focus-visible:not(:disabled) {
    background: #d63384;
    outline: none;
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.4);
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
  @media (min-width: 640px) {
    .novo {
      padding: 2rem 1.5rem 3rem;
    }
    .hero h1 {
      font-size: 2.25rem;
    }
    .icon-row {
      flex-direction: row;
      align-items: center;
    }
    .icon-row input[type='text'] {
      width: 6rem;
      flex-shrink: 0;
    }
    .cadence-options {
      flex-direction: row;
      gap: 1.5rem;
    }
  }
</style>