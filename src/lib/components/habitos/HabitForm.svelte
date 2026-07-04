<!--
  HabitForm.svelte — reusable CRUD form (task-040, upgraded for V8).

  Used by:
    - /habitos/novo  (create mode; optionally pre-filled from a template)
    - /habitos       (inline edit mode per habit)

  V8 additions:
    * Cadence picker — daily / weekly / custom weekdays.  Honors the
      existing habit cadence on edit ('weekly' and { days } round-trip).
    * Structured reminder — { time: 'HH:MM', days?: number[] } replaces
      the old free-text field.  A legacy free-text reminder is shown as
      a hint so the user knows what it said before re-saving.
    * `initial` prop — partial pre-fill from the template picker.  The
      parent remounts the form ({#key}) when the template changes.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import {
    normalizeCadence,
    parseReminder,
    weekdayShortName,
    type Habit,
    type HabitCadence,
    type NewHabitInput
  } from '$lib/habitos';

  interface Props {
    /** When set, the form starts in EDIT mode and pre-fills the fields. */
    habit?: Habit | null;
    /** Create-mode pre-fill (template picker).  Ignored when `habit` is set. */
    initial?: Partial<NewHabitInput> | null;
    /** Async submit.  Receives the form values; throws on error. */
    onSubmit: (values: NewHabitInput) => Promise<void>;
    /** Cancel handler — parent route decides where to go back to. */
    onCancel?: () => void;
  }

  let { habit = null, initial = null, onSubmit, onCancel }: Props = $props();

  // Snapshot initialization: the user edits, the parent updates the
  // habit, and the form unmounts.  `untrack` so svelte-check doesn't
  // flag the read — we deliberately only want the initial value.
  const source = untrack(() => habit ?? initial ?? null);
  const sourceCadence = untrack(() => normalizeCadence(source?.cadence));
  const sourceReminder = untrack(() => parseReminder(source?.reminder));

  let name = $state(untrack(() => source?.name ?? ''));
  let icon = $state(untrack(() => source?.icon ?? '✅'));
  let color = $state(untrack(() => source?.color ?? '#f472b6'));
  let meta = $state(untrack(() => source?.meta ?? ''));

  // --- cadence ---
  type CadenceMode = 'daily' | 'weekly' | 'custom';
  let cadenceMode = $state<CadenceMode>(
    sourceCadence === 'daily' ? 'daily' : sourceCadence === 'weekly' ? 'weekly' : 'custom'
  );
  let customDays = $state<number[]>(
    typeof sourceCadence === 'object' ? [...sourceCadence.days] : [1, 3, 5]
  );

  // --- reminder ---
  let reminderTime = $state(sourceReminder?.time ?? '');
  let reminderDays = $state<number[]>(sourceReminder?.days ? [...sourceReminder.days] : []);
  const legacyReminderText = untrack(() =>
    typeof source?.reminder === 'string' && !parseReminder(source.reminder)
      ? source.reminder
      : null
  );

  let submitting = $state(false);
  let error = $state<string | null>(null);

  const dateLocale = $derived($locale || 'pt-PT');
  // Monday-first display order, values in JS getDay() numbering.
  const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

  const palette: string[] = [
    '#f472b6', // pink (default)
    '#fb7185', // rose
    '#a855f7', // violet
    '#8b5cf6', // purple
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#14b8a6'  // teal
  ];

  const iconSuggestions: string[] = [
    '✅', '💧', '📚', '🏃', '🧘', '💪',
    '🥗', '😴', '✍️', '🎯', '☕', '🚶'
  ];

  function toggleDay(list: number[], d: number): number[] {
    return list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort((a, b) => a - b);
  }

  function buildCadence(): HabitCadence {
    if (cadenceMode === 'daily') return 'daily';
    if (cadenceMode === 'weekly') return 'weekly';
    return { days: [...customDays] };
  }

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
    if (cadenceMode === 'custom' && customDays.length === 0) {
      error = $t('habitos.form.error.no_days', { default: 'Escolhe pelo menos um dia da semana.' });
      return;
    }

    submitting = true;
    try {
      await onSubmit({
        name: trimmedName,
        icon: icon.trim() || '✅',
        color,
        cadence: buildCadence(),
        meta: meta.trim() || undefined,
        reminder: reminderTime
          ? { time: reminderTime, days: reminderDays.length > 0 && reminderDays.length < 7 ? [...reminderDays] : undefined }
          : undefined
      });
    } catch (e) {
      console.error('[habitos] form submit failed', e);
      error = e instanceof Error ? e.message : ($t('habitos.form.error.save', { default: 'Erro a guardar hábito' }) as string);
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
            aria-label={$t('habitos.form.icon.use', { values: { icon: s }, default: `Usar ícone ${s}` })}
          >{s}</button>
        {/each}
      </div>
    </div>
  </div>

  <div class="field">
    <span class="field-label" id="habit-form-color-label">{$t('habitos.form.label.color', { default: 'Cor' })}</span>
    <div class="palette" role="radiogroup" aria-labelledby="habit-form-color-label">
      {#each palette as c (c)}
        <button
          type="button"
          class="swatch"
          class:selected={color === c}
          style="--swatch: {c}"
          aria-label={$t('habitos.form.color.use', { values: { color: c }, default: `Cor ${c}` })}
          aria-checked={color === c}
          role="radio"
          onclick={() => (color = c)}
        ></button>
      {/each}
    </div>
  </div>

  <fieldset class="field cadence-field">
    <legend>{$t('habitos.form.label.cadence', { default: 'Frequência' })}</legend>
    <div class="cadence-options" role="radiogroup" aria-label={$t('habitos.form.label.cadence', { default: 'Frequência' })}>
      <label class="radio" class:active={cadenceMode === 'daily'}>
        <input type="radio" name="cadence" value="daily" bind:group={cadenceMode} />
        <span>{$t('habitos.form.cadence.daily', { default: 'Diário' })}</span>
      </label>
      <label class="radio" class:active={cadenceMode === 'weekly'}>
        <input type="radio" name="cadence" value="weekly" bind:group={cadenceMode} />
        <span>{$t('habitos.form.cadence.weekly', { default: 'Semanal' })}</span>
      </label>
      <label class="radio" class:active={cadenceMode === 'custom'}>
        <input type="radio" name="cadence" value="custom" bind:group={cadenceMode} />
        <span>{$t('habitos.form.cadence.custom', { default: 'Dias específicos' })}</span>
      </label>
    </div>
    {#if cadenceMode === 'weekly'}
      <p class="hint">{$t('habitos.form.cadence.weekly_hint', { default: 'Uma vez por semana, no dia que quiseres.' })}</p>
    {/if}
    {#if cadenceMode === 'custom'}
      <div class="day-chips" role="group" aria-label={$t('habitos.form.cadence.days_aria', { default: 'Dias da semana do hábito' })}>
        {#each WEEKDAY_ORDER as d (d)}
          <button
            type="button"
            class="day-chip"
            class:on={customDays.includes(d)}
            aria-pressed={customDays.includes(d)}
            onclick={() => (customDays = toggleDay(customDays, d))}
          >{weekdayShortName(dateLocale, d)}</button>
        {/each}
      </div>
    {/if}
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

  <fieldset class="field reminder-field">
    <legend>{$t('habitos.form.label.reminder', { default: 'Lembrete (opcional)' })}</legend>
    <div class="reminder-row">
      <input
        id="habit-form-reminder-time"
        class="time-input"
        type="time"
        bind:value={reminderTime}
        aria-label={$t('habitos.form.reminder.time_aria', { default: 'Hora do lembrete' })}
      />
      {#if reminderTime}
        <button
          type="button"
          class="clear-reminder"
          onclick={() => { reminderTime = ''; reminderDays = []; }}
        >{$t('habitos.form.reminder.clear', { default: 'Limpar' })}</button>
      {/if}
    </div>
    {#if reminderTime}
      <p class="hint">{$t('habitos.form.reminder.days_hint', { default: 'Só nestes dias (vazio = todos):' })}</p>
      <div class="day-chips" role="group" aria-label={$t('habitos.form.reminder.days_aria', { default: 'Dias do lembrete' })}>
        {#each WEEKDAY_ORDER as d (d)}
          <button
            type="button"
            class="day-chip"
            class:on={reminderDays.includes(d)}
            aria-pressed={reminderDays.includes(d)}
            onclick={() => (reminderDays = toggleDay(reminderDays, d))}
          >{weekdayShortName(dateLocale, d)}</button>
        {/each}
      </div>
    {/if}
    {#if legacyReminderText}
      <p class="hint legacy">{$t('habitos.form.reminder.legacy', { values: { text: legacyReminderText }, default: `Lembrete antigo: "${legacyReminderText}" — escolhe uma hora para o substituir.` })}</p>
    {/if}
  </fieldset>

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
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 0.75rem);
    padding: var(--space-4, 1.25rem);
    display: flex;
    flex-direction: column;
    gap: var(--space-4, 1rem);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  .field label,
  .field legend,
  .field-label {
    font-size: var(--fs-sm, 0.875rem);
    font-weight: 600;
    color: var(--txt);
  }
  .field input[type='text'],
  .field input[type='time'] {
    width: 100%;
    padding: 0.625rem;
    background: var(--bg-elev, rgba(0, 0, 0, 0.25));
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 0.5rem);
    color: var(--txt);
    font-size: 0.9375rem;
    font-family: inherit;
    min-height: 44px;
  }
  .field input[type='text']:focus-visible,
  .field input[type='time']:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-color: var(--accent);
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
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--txt);
    border-radius: var(--radius-sm, 0.5rem);
    padding: 0.5rem 0.75rem;
    font-size: 1.125rem;
    cursor: pointer;
    line-height: 1;
    min-width: 44px;
    min-height: 44px;
  }
  .suggestion:hover {
    background: var(--card-hover, var(--card));
  }
  .suggestion:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .palette {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .swatch {
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: var(--swatch);
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
  }
  .swatch.selected {
    border-color: var(--txt);
    box-shadow: 0 0 0 2px var(--bg-elev, rgba(0, 0, 0, 0.4));
  }
  .swatch:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .cadence-options {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .radio {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    color: var(--txt);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.5rem 0.875rem;
    min-height: 44px;
    transition: border-color var(--motion-fast, 120ms), background var(--motion-fast, 120ms);
  }
  .radio.active {
    border-color: var(--accent);
    background: var(--card-hover, var(--card));
  }
  .radio:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .radio input {
    accent-color: var(--accent);
  }
  .day-chips {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }
  .day-chip {
    min-width: 44px;
    min-height: 44px;
    padding: 0.375rem 0.5rem;
    border-radius: var(--radius-sm, 0.5rem);
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--txt2);
    font-family: inherit;
    font-size: var(--fs-sm, 0.8125rem);
    font-weight: 600;
    cursor: pointer;
    text-transform: capitalize;
    transition: background var(--motion-fast, 120ms), color var(--motion-fast, 120ms), border-color var(--motion-fast, 120ms);
  }
  .day-chip.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent, #fff);
  }
  .day-chip:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .reminder-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .time-input {
    max-width: 10rem;
  }
  .clear-reminder {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--txt2);
    border-radius: var(--radius-sm, 0.5rem);
    padding: 0.5rem 0.75rem;
    min-height: 44px;
    cursor: pointer;
    font-family: inherit;
    font-size: var(--fs-sm, 0.8125rem);
  }
  .clear-reminder:hover {
    color: var(--txt);
  }
  .clear-reminder:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .hint {
    margin: 0.375rem 0 0 0;
    font-size: var(--fs-xs, 0.75rem);
    color: var(--txt3);
  }
  .hint.legacy {
    color: var(--warning, var(--txt3));
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
  .btn-secondary {
    padding: 0.625rem 1.125rem;
    border-radius: var(--radius-sm, 0.5rem);
    font-weight: 600;
    font-size: 0.9375rem;
    cursor: pointer;
    border: 0;
    font-family: inherit;
    min-height: 44px;
  }
  .btn-primary {
    background: var(--accent);
    color: var(--on-accent, #fff);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover, var(--accent));
  }
  .btn-primary:focus-visible,
  .btn-secondary:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-secondary {
    background: var(--card);
    color: var(--txt);
    border: 1px solid var(--border);
  }
  .btn-secondary:hover {
    background: var(--card-hover, var(--card));
  }
</style>
