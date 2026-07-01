<!--
  HabitForm.svelte — task-040 reusable CRUD form.

  Used by:
    - /habitos/novo         (create mode, no initial values)
    - /habitos/habit/[slug] (edit mode, opens as a collapsible section)

  The form exposes the four "complete" fields per the task brief:
    1. nome (name)        — required, max 60 chars
    2. icone (icon)       — optional emoji (≤4 code points)
    3. frequencia (cadence) — daily
    4. meta (target)      — free-form text ("2L", "30 min", "8h")
    5. lembrete (reminder) — free-form text ("20:00", "manhã")

  Caller supplies an `onSubmit` that returns a Promise.  We surface
  the result (success → close, error → inline message) so the parent
  route can stay thin.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { Habit, NewHabitInput } from '$lib/habitos';

  interface Props {
    /** When set, the form starts in EDIT mode and pre-fills the fields. */
    habit?: Habit | null;
    /** Async submit.  Receives the form values; throws on error. */
    onSubmit: (values: NewHabitInput) => Promise<void>;
    /** Cancel handler — parent route decides where to go back to. */
    onCancel?: () => void;
  }

  let { habit = null, onSubmit, onCancel }: Props = $props();

  // form fields — initialized from `habit` if present.  The form
  // is a snapshot: the user edits, the parent updates the habit,
  // and the form unmounts.  We use `untrack` so svelte-check
  // doesn't flag the read of `habit` as "state referenced locally"
  // — we deliberately only want the initial value.
  let name = $state(untrack(() => habit?.name ?? ''));
  let icon = $state(untrack(() => habit?.icon ?? '✅'));
  let color = $state(untrack(() => habit?.color ?? '#ec4899'));
  let cadence = $state<'daily'>(untrack(() => 'daily'));
  let meta = $state(untrack(() => habit?.meta ?? ''));
  let reminder = $state(untrack(() => habit?.reminder ?? ''));

  let submitting = $state(false);
  let error = $state<string | null>(null);

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

  const iconSuggestions: string[] = [
    '✅', '💧', '📚', '🏃', '🧘', '💪',
    '🥗', '😴', '✍️', '🎯', '☕', '🚶'
  ];

  async function handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    error = null;

    const trimmedName = name.trim();
    if (!trimmedName) {
      error = $t('error.o_nome_obrigatorio', { default: 'O nome é obrigatório.' });
      return;
    }
    if (trimmedName.length > 60) {
      error = $t('error.nome_demasiado_longo_max_60', { default: 'Nome demasiado longo (máx. 60 caracteres).' });
      return;
    }

    submitting = true;
    try {
      await onSubmit({
        name: trimmedName,
        icon: icon.trim() || '✅',
        color,
        cadence,
        meta: meta.trim() || undefined,
        reminder: reminder.trim() || undefined
      });
    } catch (e) {
      console.error('[habitos] form submit failed', e);
      error = e instanceof Error ? e.message : 'Erro a guardar hábito';
    } finally {
      submitting = false;
    }
  }
</script>

<form class="habit-form" onsubmit={handleSubmit} novalidate>
  <div class="field">
    <label for="habit-form-name">{$t('habitos.form.label.nome', { default: 'Nome' })} <span aria-hidden="true">*</span></label>
    <input
      id="habit-form-name"
      type="text"
      bind:value={name}
      maxlength="60"
      required
      placeholder={$t('habitos.novo.placeholder.name', { default: 'Ex.: Beber 2L de água' })}
      autocomplete="off"
    />
  </div>

  <div class="field">
    <label for="habit-form-icon">{$t('habitos.form.label.icon', { default: 'Ícone' })}</label>
    <div class="icon-row">
      <input
        id="habit-form-icon"
        type="text"
        bind:value={icon}
        maxlength="4"
        placeholder="✅"
      />
      <div class="suggestions" role="group" aria-label={$t('a11y.aria.sugestoes_de_icones', { default: 'Sugestões de ícones' })}>
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
  </div>

  <div class="field">
    <label for="habit-form-color">{$t('habitos.form.label.color', { default: 'Cor' })}</label>
    <div class="palette" role="radiogroup" aria-label={$t('a11y.aria.cor_do_habito', { default: 'Cor do hábito' })}>
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
    <legend>{$t('habitos.form.label.cadence', { default: 'Frequência' })}</legend>
    <div class="cadence-options">
      <label class="radio">
        <input type="radio" name="cadence" value="daily" bind:group={cadence} />
        <span>{$t('habitos.form.cadence.daily', { default: 'Diário' })}</span>
      </label>
    </div>
  </fieldset>

  <div class="field">
    <label for="habit-form-meta">{$t('habitos.form.label.meta', { default: 'Meta (opcional)' })}</label>
    <input
      id="habit-form-meta"
      type="text"
      bind:value={meta}
      maxlength="40"
      placeholder={$t('habitos.form.placeholder.meta', { default: 'Ex.: 2L, 30 min, 8h' })}
      autocomplete="off"
    />
  </div>

  <div class="field">
    <label for="habit-form-reminder">{$t('habitos.form.label.reminder', { default: 'Lembrete (opcional)' })}</label>
    <input
      id="habit-form-reminder"
      type="text"
      bind:value={reminder}
      maxlength="60"
      placeholder={$t('habitos.form.placeholder.reminder', { default: 'Ex.: 20:00, de manhã' })}
      autocomplete="off"
    />
  </div>

  {#if error}
    <p class="error" role="alert">⚠️ {error}</p>
  {/if}

  <div class="actions">
    {#if onCancel}
      <button type="button" class="btn-secondary" onclick={onCancel}>
        {$t('habitos.form.cancel', { default: 'Cancelar' })}
      </button>
    {/if}
    <button type="submit" class="btn-primary" disabled={submitting}>
      {submitting
        ? $t('habitos.form.submitting', { default: 'A guardar…' })
        : habit
          ? $t('habitos.form.submit.save', { default: 'Guardar alterações' })
          : $t('habitos.form.submit.create', { default: 'Criar hábito' })}
    </button>
  </div>
</form>

<style>
  .habit-form {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
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
    padding: 0.5rem 0.625rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    border-radius: 0.5rem;
    color: var(--txt, #fff);
    font-size: 0.9375rem;
    font-family: inherit;
  }
  .field input[type='text']:focus-visible {
    outline: none;
    border-color: var(--accent, #ec4899);
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.3);
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
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--swatch);
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
  }
  .swatch.selected {
    border-color: #fff;
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
  }
  .cadence-options {
    display: flex;
    gap: 1rem;
  }
  .radio {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    color: var(--txt, #fff);
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
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.9375rem;
    cursor: pointer;
    border: 0;
    font-family: inherit;
  }
  .btn-primary {
    background: var(--accent, #ec4899);
    color: #fff;
  }
  .btn-primary:hover:not(:disabled) {
    background: #d63384;
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
  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.12);
  }
</style>
