<script lang="ts">
  // src/lib/mood/MoodCheckin.svelte
  //
  // Gentle daily mood check-in (V8). A small, dismissible card: emoji scale
  // (😞😐🙂😄🥰), optional context tags and an optional note. Saves one
  // `mood_logs` row per day (source 'checkin') via $lib/mood/moodLogs and
  // awards XP only on the first check-in of the day. Never nags: once
  // dismissed it stays quiet until tomorrow, and once answered it collapses
  // into a tiny "registado" state that can still be edited.
  //
  // Reusable: embedded on /humor (dismissible={false}) and exportable to the
  // hub or layout later.

  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { fireConfettiEvent, showToast } from '$lib/components/events';
  import { activateMood, readActiveMood, MOOD_EVENT, MOOD_META, type MoodKind } from '$lib/mood';
  import {
    CHECKIN_EMOJI,
    CHECKIN_KINDS,
    CHECKIN_SAVED_EVENT,
    CHECKIN_TAGS,
    getTodayCheckin,
    isCheckinKind,
    localDateKey,
    saveCheckin,
    type CheckinKind,
    type MoodEpisodeRow
  } from '$lib/mood/moodLogs';

  type Props = {
    /** When true (default) the card can be hidden for the rest of the day. */
    dismissible?: boolean;
    onSaved?: (kind: CheckinKind) => void;
  };
  let { dismissible = true, onSaved }: Props = $props();

  const DISMISS_PREFIX = 'presuntinho:mood:checkin-dismissed:';

  let ready = $state(false);
  let hidden = $state(false);
  let existing = $state<MoodEpisodeRow | null>(null);
  let editing = $state(false);
  let selected = $state<CheckinKind | null>(null);
  let tags = $state<string[]>([]);
  let note = $state('');
  let saving = $state(false);

  const FEELING_DEFAULTS: Record<CheckinKind, string> = {
    low: 'Em baixo',
    meh: 'Assim-assim',
    ok: 'Ok',
    happy: 'Feliz',
    loved: 'Cheia de amor'
  };
  const TAG_DEFAULTS: Record<string, string> = {
    tired: 'cansada',
    stressed: 'stress',
    study: 'estudos',
    money: 'dinheiro',
    relationship: 'nós',
    sleep: 'sono',
    sick: 'doente',
    happy: 'feliz'
  };

  const showForm = $derived(ready && !hidden && (!existing || editing));
  const showDone = $derived(ready && !hidden && Boolean(existing) && !editing);

  // Bridge the passive check-in to the live app "vibe": a rough day can offer
  // the calmer Soft Mood, a loved day the warm Love Vibe. Always opt-in — we
  // only surface the suggestion, never flip the whole app on the user's behalf.
  const VIBE_FOR: Partial<Record<CheckinKind, MoodKind>> = { low: 'sad', loved: 'love' };
  let activeVibe = $state<MoodKind | null>(null);
  const suggestedVibe = $derived.by<MoodKind | null>(() => {
    const kind = existing && isCheckinKind(existing.kind) ? existing.kind : null;
    const vibe = kind ? VIBE_FOR[kind] : undefined;
    return vibe && vibe !== activeVibe ? vibe : null;
  });

  async function activateVibe(kind: MoodKind): Promise<void> {
    await activateMood(kind, 'manual');
    activeVibe = kind;
    showToast($t('mood.checkin.vibe_on', { values: { vibe: MOOD_META[kind].label }, default: `${MOOD_META[kind].label} ligada 🤍` }));
  }

  onMount(() => {
    try {
      hidden = dismissible && localStorage.getItem(DISMISS_PREFIX + localDateKey()) === '1';
    } catch {
      hidden = false;
    }
    void getTodayCheckin().then((row) => {
      existing = row;
      if (row) {
        if (isCheckinKind(row.kind)) selected = row.kind;
        tags = (row.tags ?? []).filter((tag) => !tag.startsWith('care:'));
        note = row.note ?? '';
      }
      ready = true;
    });
    // Track the live vibe so we never suggest one that's already on.
    void readActiveMood().then((m) => { activeVibe = m?.kind ?? null; }).catch(() => {});
    const onMoodChange = (e: Event) => {
      const detail = e instanceof CustomEvent ? (e.detail as { kind?: MoodKind } | null) : null;
      activeVibe = detail?.kind ?? null;
    };
    window.addEventListener(MOOD_EVENT, onMoodChange);
    return () => window.removeEventListener(MOOD_EVENT, onMoodChange);
  });

  function toggleTag(tag: string): void {
    tags = tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag];
  }

  function dismiss(): void {
    hidden = true;
    try {
      localStorage.setItem(DISMISS_PREFIX + localDateKey(), '1');
    } catch {
      // localStorage indisponível — esconde só nesta sessão.
    }
  }

  async function save(): Promise<void> {
    const kind = selected;
    if (!kind || saving) return;
    saving = true;
    try {
      const result = await saveCheckin(kind, tags, note);
      if (!result) {
        showToast($t('mood.checkin.error_toast', { default: 'Não consegui guardar agora — tenta outra vez daqui a nada 🤍' }));
        return;
      }
      existing = await getTodayCheckin();
      editing = false;
      showToast(
        result.isNew
          ? $t('mood.checkin.saved_toast', { default: 'Registado 🤍 Obrigada por partilhares.' })
          : $t('mood.checkin.updated_toast', { default: 'Atualizado 🤍' })
      );
      if (result.isNew && (kind === 'happy' || kind === 'loved')) {
        fireConfettiEvent(14);
      }
      onSaved?.(kind);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CHECKIN_SAVED_EVENT, { detail: { kind } }));
      }
    } finally {
      saving = false;
    }
  }
</script>

{#if showDone && existing}
  <div class="checkin-card done-card">
    <div class="done-row">
      <span class="done-emoji" aria-hidden="true">{isCheckinKind(existing.kind) ? CHECKIN_EMOJI[existing.kind] : '🤍'}</span>
      <div class="done-copy">
        <strong>{$t('mood.checkin.done_title', { default: 'Check-in de hoje feito' })}</strong>
        <small>
          {isCheckinKind(existing.kind)
            ? $t(`mood.feeling.${existing.kind}`, { default: FEELING_DEFAULTS[existing.kind] })
            : existing.kind}
          {#if (existing.tags ?? []).filter((tag) => !tag.startsWith('care:')).length}
            · {(existing.tags ?? []).filter((tag) => !tag.startsWith('care:')).map((tag) => $t(`mood.tag.${tag}`, { default: TAG_DEFAULTS[tag] ?? tag })).join(', ')}
          {/if}
        </small>
      </div>
      <button type="button" class="ghost-btn" onclick={() => (editing = true)}>
        {$t('mood.checkin.edit', { default: 'Ajustar' })}
      </button>
    </div>
    {#if suggestedVibe}
      {@const v = suggestedVibe}
      <div class="vibe-suggest">
        <span>
          {v === 'love'
            ? $t('mood.checkin.vibe_suggest_loved', { default: 'Que bom sentires-te assim 🥰 Queres a app mais quentinha?' })
            : $t('mood.checkin.vibe_suggest_low', { default: 'Dia difícil? Posso deixar a app mais suave contigo.' })}
        </span>
        <button type="button" class="ghost-btn vibe-btn" onclick={() => void activateVibe(v)}>
          {$t('mood.checkin.vibe_activate', { values: { vibe: MOOD_META[v].label }, default: `Ligar ${MOOD_META[v].label}` })}
        </button>
      </div>
    {/if}
  </div>
{:else if showForm}
  <div class="checkin-card" role="group" aria-label={$t('mood.checkin.title', { default: 'Como te sentes hoje?' })}>
    <div class="checkin-head">
      <div>
        <h3>{$t('mood.checkin.title', { default: 'Como te sentes hoje?' })}</h3>
        <p>{$t('mood.checkin.subtitle', { default: 'Só se quiseres — um toque chega, sem perguntas a mais.' })}</p>
      </div>
      {#if dismissible && !existing}
        <button
          type="button"
          class="dismiss"
          onclick={dismiss}
          aria-label={$t('mood.checkin.dismiss_aria', { default: 'Esconder o check-in por hoje' })}
          title={$t('mood.checkin.later', { default: 'Agora não' })}
        >✕</button>
      {/if}
    </div>

    <div class="feelings" role="radiogroup" aria-label={$t('mood.checkin.feelings_aria', { default: 'Escolhe como te sentes' })}>
      {#each CHECKIN_KINDS as kind (kind)}
        <button
          type="button"
          class="feeling"
          class:selected={selected === kind}
          role="radio"
          aria-checked={selected === kind}
          onclick={() => (selected = kind)}
        >
          <span class="feeling-emoji" aria-hidden="true">{CHECKIN_EMOJI[kind]}</span>
          <span class="feeling-label">{$t(`mood.feeling.${kind}`, { default: FEELING_DEFAULTS[kind] })}</span>
        </button>
      {/each}
    </div>

    {#if selected}
      <div class="extras">
        <span class="extras-label">{$t('mood.checkin.tags_label', { default: 'Tem a ver com… (opcional)' })}</span>
        <div class="tag-row">
          {#each CHECKIN_TAGS as tag (tag)}
            <button
              type="button"
              class="tag-chip"
              class:on={tags.includes(tag)}
              aria-pressed={tags.includes(tag)}
              onclick={() => toggleTag(tag)}
            >
              {$t(`mood.tag.${tag}`, { default: TAG_DEFAULTS[tag] })}
            </button>
          {/each}
        </div>

        <label class="note-field">
          <span>{$t('mood.checkin.note_label', { default: 'Queres deixar uma notinha?' })}</span>
          <input
            type="text"
            bind:value={note}
            maxlength="240"
            placeholder={$t('mood.checkin.note_placeholder', { default: 'Só para ti — ninguém julga 🤍' })}
          />
        </label>

        <button type="button" class="save-btn" onclick={save} disabled={saving}>
          {#if saving}
            {$t('mood.checkin.saving', { default: 'A guardar…' })}
          {:else if existing}
            {$t('mood.checkin.update', { default: 'Atualizar' })}
          {:else}
            {$t('mood.checkin.save', { default: 'Guardar check-in' })}
          {/if}
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .checkin-card {
    background: var(--card, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 1rem);
    padding: var(--space-4, 1rem);
    display: grid;
    gap: var(--space-3, 0.75rem);
    box-shadow: var(--shadow-sm, 0 2px 10px rgba(0, 0, 0, 0.12));
  }
  .checkin-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2, 0.5rem);
  }
  .checkin-head h3 {
    margin: 0;
    font-size: var(--fs-md, 1rem);
    color: var(--txt, #fff);
  }
  .checkin-head p {
    margin: 0.2rem 0 0;
    font-size: var(--fs-sm, 0.85rem);
    color: var(--txt2, rgba(255, 255, 255, 0.7));
    line-height: 1.4;
  }
  .dismiss {
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--radius-md, 0.6rem);
    background: transparent;
    color: var(--txt3, rgba(255, 255, 255, 0.5));
    font-size: var(--fs-md, 1rem);
    cursor: pointer;
    transition: background var(--motion-fast, 120ms) ease, color var(--motion-fast, 120ms) ease;
  }
  .dismiss:hover { background: var(--card-hover, rgba(255, 255, 255, 0.1)); color: var(--txt, #fff); }
  .feelings {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: var(--space-2, 0.5rem);
  }
  .feeling {
    min-height: 64px;
    display: grid;
    place-items: center;
    gap: 0.15rem;
    padding: 0.45rem 0.2rem;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-md, 0.75rem);
    background: var(--bg-elev, rgba(255, 255, 255, 0.04));
    color: var(--txt2, rgba(255, 255, 255, 0.7));
    font: inherit;
    cursor: pointer;
    transition: transform var(--motion-fast, 120ms) ease, background var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease;
  }
  .feeling:hover { background: var(--card-hover, rgba(255, 255, 255, 0.1)); }
  .feeling.selected {
    border-color: var(--accent, #db2777);
    background: color-mix(in srgb, var(--accent, #db2777) 16%, transparent);
    color: var(--txt, #fff);
    transform: translateY(-2px);
  }
  .feeling-emoji { font-size: 1.45rem; line-height: 1; }
  .feeling-label { font-size: var(--fs-xs, 0.68rem); text-align: center; line-height: 1.1; }
  .extras { display: grid; gap: var(--space-2, 0.5rem); }
  .extras-label {
    font-size: var(--fs-xs, 0.72rem);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--txt3, rgba(255, 255, 255, 0.5));
  }
  .tag-row { display: flex; flex-wrap: wrap; gap: var(--space-2, 0.5rem); }
  .tag-chip {
    min-height: 44px;
    padding: 0.4rem 0.8rem;
    border-radius: 999px;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    background: var(--bg-elev, rgba(255, 255, 255, 0.04));
    color: var(--txt2, rgba(255, 255, 255, 0.7));
    font: inherit;
    font-size: var(--fs-sm, 0.82rem);
    cursor: pointer;
    transition: background var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease;
  }
  .tag-chip:hover { background: var(--card-hover, rgba(255, 255, 255, 0.1)); }
  .tag-chip.on {
    border-color: var(--accent, #db2777);
    background: color-mix(in srgb, var(--accent, #db2777) 18%, transparent);
    color: var(--txt, #fff);
  }
  .note-field { display: grid; gap: 0.3rem; }
  .note-field span { font-size: var(--fs-sm, 0.82rem); color: var(--txt2, rgba(255, 255, 255, 0.7)); }
  .note-field input {
    min-height: 44px;
    padding: 0.55rem 0.75rem;
    border-radius: var(--radius-md, 0.6rem);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    background: var(--bg-elev, rgba(255, 255, 255, 0.04));
    color: var(--txt, #fff);
    font: inherit;
    font-size: var(--fs-sm, 0.9rem);
  }
  .note-field input::placeholder { color: var(--txt3, rgba(255, 255, 255, 0.4)); }
  .save-btn {
    min-height: 44px;
    padding: 0.6rem 1rem;
    border: 0;
    border-radius: 999px;
    background: var(--accent, #db2777);
    color: var(--on-accent, #fff);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    justify-self: start;
    transition: background var(--motion-fast, 120ms) ease, transform var(--motion-fast, 120ms) ease;
  }
  .save-btn:hover { background: var(--accent-hover, color-mix(in srgb, var(--accent, #db2777) 85%, #000)); }
  .save-btn:active { transform: scale(0.98); }
  .save-btn:disabled { opacity: 0.65; cursor: wait; }
  .done-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3, 0.75rem);
  }
  .vibe-suggest {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2, 0.5rem);
    padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
    border-radius: var(--radius-md, 0.6rem);
    background: color-mix(in srgb, var(--accent, #db2777) 10%, var(--bg-elev, rgba(255, 255, 255, 0.04)));
    border: 1px solid color-mix(in srgb, var(--accent, #db2777) 30%, var(--border, rgba(255, 255, 255, 0.12)));
  }
  .vibe-suggest span {
    flex: 1 1 12rem;
    font-size: var(--fs-sm, 0.85rem);
    color: var(--txt2, rgba(255, 255, 255, 0.72));
    line-height: 1.4;
  }
  .vibe-btn {
    flex: 0 0 auto;
    border-color: color-mix(in srgb, var(--accent, #db2777) 45%, var(--border, rgba(255, 255, 255, 0.12)));
    color: color-mix(in srgb, var(--accent, #db2777) 85%, var(--txt, #fff));
    font-weight: 700;
  }
  .done-emoji { font-size: 1.6rem; line-height: 1; }
  .done-copy { display: grid; gap: 0.1rem; min-width: 0; }
  .done-copy strong { font-size: var(--fs-sm, 0.88rem); color: var(--txt, #fff); }
  .done-copy small { font-size: var(--fs-xs, 0.75rem); color: var(--txt2, rgba(255, 255, 255, 0.7)); }
  .ghost-btn {
    min-height: 44px;
    padding: 0.45rem 0.9rem;
    border-radius: 999px;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    background: transparent;
    color: var(--txt2, rgba(255, 255, 255, 0.7));
    font: inherit;
    font-size: var(--fs-sm, 0.82rem);
    cursor: pointer;
    transition: background var(--motion-fast, 120ms) ease, color var(--motion-fast, 120ms) ease;
  }
  .ghost-btn:hover { background: var(--card-hover, rgba(255, 255, 255, 0.1)); color: var(--txt, #fff); }
  .feeling:focus-visible,
  .tag-chip:focus-visible,
  .save-btn:focus-visible,
  .ghost-btn:focus-visible,
  .dismiss:focus-visible,
  .note-field input:focus-visible {
    outline: 2px solid var(--accent, #db2777);
    outline-offset: 2px;
  }
  @media (max-width: 420px) {
    .feelings { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0.3rem; }
    .feeling-label { display: none; }
    .feeling { min-height: 52px; }
  }
</style>
