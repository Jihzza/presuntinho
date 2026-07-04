<script lang="ts">
  import { onMount } from 'svelte';
  import {
    clearActiveMood,
    ensureMoodEpisodeLogged,
    moodAffirmation,
    moodMicrocopy,
    recordMoodCare,
    MOOD_META,
    type ActiveMood
  } from '$lib/mood';
  import { t } from 'svelte-i18n';

  type Props = { mood: ActiveMood; onCleared: () => void };
  let { mood, onCleared }: Props = $props();
  let seed = $state(Date.now());
  let clearing = $state(false);
  let expanded = $state(false);
  let careDone = $state<Record<string, boolean>>({});
  let sparkle = $state(false);
  let noteSeed = $state(Date.now());

  const meta = $derived(MOOD_META[mood.kind]);
  const line = $derived(moodMicrocopy(mood.kind, seed));
  const note = $derived(moodAffirmation(mood.kind, noteSeed));
  const doneCount = $derived(meta.careActions.filter((action) => careDone[action.id]).length);
  const storageKey = $derived(`presuntinho:mood:${mood.kind}:care:${new Date().toISOString().slice(0, 10)}`);

  function ambientStyle(index: number): string {
    const left = 8 + index * 18;
    const top = 11 + (index % 3) * 18;
    return `--i: ${index}; left: ${left}%; top: ${top}%;`;
  }

  onMount(() => {
    // Legacy fallback read — care ticks recorded before V8 lived only in
    // localStorage. We keep reading (and writing) it so nothing is lost,
    // but the source of truth for insights is now the mood_logs row.
    try {
      careDone = JSON.parse(localStorage.getItem(storageKey) || '{}') as Record<string, boolean>;
    } catch {
      careDone = {};
    }

    // V8 mood history: make sure this episode has an open mood_logs row
    // (covers server-triggered moods hydrated from the love-lock cookie),
    // then migrate any legacy localStorage ticks onto it.
    void ensureMoodEpisodeLogged(mood).then(() => {
      if (Object.values(careDone).some(Boolean)) {
        void recordMoodCare(careDone);
      }
    });

    const id = setInterval(() => (seed = Date.now()), 60_000);
    return () => clearInterval(id);
  });

  function persistCare(next: Record<string, boolean>): void {
    careDone = next;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // localStorage can fail in private browsing — the mood still works.
    }
    // Mirror the ticks onto the episode's mood_logs row (best-effort).
    void recordMoodCare(next);
  }

  function toggleCare(id: string): void {
    persistCare({ ...careDone, [id]: !careDone[id] });
    sparkle = true;
    window.setTimeout(() => (sparkle = false), 520);
  }

  function nextNote(): void {
    noteSeed = Date.now() + Math.floor(Math.random() * 999);
    sparkle = true;
    window.setTimeout(() => (sparkle = false), 520);
  }

  async function clearMood(): Promise<void> {
    clearing = true;
    try {
      await clearActiveMood();
      onCleared();
    } finally {
      clearing = false;
    }
  }
</script>

<div class="mood-root mood-{mood.kind}" style={`--mood-accent: ${meta.accent}`} aria-live="polite">
  <div class="mood-ambience" aria-hidden="true">
    {#each meta.ambience as icon, index (`${icon}-${index}`)}
      <span style={ambientStyle(index)}>{icon}</span>
    {/each}
  </div>

  <div class="mood-ribbon" aria-hidden="true">
    <span>{meta.emoji}</span>
    <strong>{meta.label}</strong>
    <small>{$t('mood.layer.adapted')}</small>
  </div>

  <aside class="mood-chip" class:expanded class:compact={!expanded} class:sparkle aria-label={`${meta.label}: ${line}`}>
    <button type="button" class="mood-main" onclick={() => (expanded = !expanded)} aria-expanded={expanded}>
      <span class="mood-emoji" aria-hidden="true">{meta.emoji}</span>
      <span class="mood-copy">
        <strong>{meta.label}</strong>
        <small>{line}</small>
      </span>
      <span class="mood-progress" aria-label={$t('mood.layer.progress_aria', { values: { done: doneCount, total: meta.careActions.length }, default: '{done} de {total} miminhos marcados' })}>
        {doneCount}/{meta.careActions.length}
      </span>
    </button>

    {#if expanded}
      <div class="mood-panel">
        <div class="panel-head">
          <span aria-hidden="true">{meta.emoji}</span>
          <div>
            <h2>{meta.detailTitle}</h2>
            <p>{meta.detailLead}</p>
          </div>
        </div>

        <div class="care-grid" aria-label={$t('mood.layer.care_aria')}>
          {#each meta.careActions as action (action.id)}
            <button
              type="button"
              class="care-action"
              class:done={careDone[action.id]}
              onclick={() => toggleCare(action.id)}
              aria-pressed={Boolean(careDone[action.id])}
            >
              <span aria-hidden="true">{action.emoji}</span>
              <strong>{careDone[action.id] ? action.done : action.label}</strong>
            </button>
          {/each}
        </div>

        <button type="button" class="comfort-note" onclick={nextNote} aria-label={$t('mood.layer.next_aria')}>
          <span>{$t('mood.layer.note_label')}</span>
          <strong>{note}</strong>
          <small>{$t('mood.layer.next_hint')}</small>
        </button>

        <a class="history-link" href="/humor/">
          {$t('mood.layer.history_link', { default: 'Ver o teu histórico de humor →' })}
        </a>

        <div class="recover-zone">
          <p>{meta.body}</p>
          <button type="button" class="recover" onclick={clearMood} disabled={clearing}>
            {clearing ? $t('mood.layer.saving', { default: 'A guardar…' }) : meta.action}
          </button>
        </div>
      </div>
    {/if}
  </aside>
</div>

<style>
  .mood-root {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9600;
  }
  .mood-ambience {
    position: absolute;
    inset: 0;
    overflow: hidden;
    opacity: 0.58;
    mask-image: linear-gradient(to bottom, black 0 58%, transparent 96%);
    pointer-events: none;
  }
  .mood-ambience span {
    position: absolute;
    font-size: clamp(1rem, 2.4vw, 1.8rem);
    filter: drop-shadow(0 8px 20px color-mix(in srgb, var(--mood-accent) 30%, transparent));
    animation: comfortFloat 13s ease-in-out infinite;
    animation-delay: calc(var(--i) * -2.2s);
  }
  .mood-ribbon {
    position: absolute;
    top: calc(.75rem + env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: .42rem;
    max-width: min(92vw, 390px);
    padding: .42rem .68rem;
    border: 1px solid color-mix(in srgb, var(--mood-accent) 34%, rgba(255,255,255,.22));
    border-radius: 999px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--mood-accent) 23%, rgba(15,23,42,.82)), rgba(15,23,42,.58));
    color: white;
    box-shadow: 0 12px 30px rgba(15, 23, 42, .22);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    pointer-events: none;
  }
  .mood-ribbon strong { font-size: .76rem; letter-spacing: .01em; }
  .mood-ribbon small { color: rgba(255,255,255,.72); font-size: .68rem; }

  .mood-chip {
    position: absolute;
    left: max(.75rem, env(safe-area-inset-left));
    right: auto;
    bottom: calc(5.85rem + env(safe-area-inset-bottom) + var(--page-bottom-inset, 0px));
    width: min(440px, calc(100vw - 1.5rem));
    max-width: 440px;
    pointer-events: auto;
    border: 1px solid color-mix(in srgb, var(--mood-accent) 50%, rgba(255,255,255,.25));
    border-radius: 1.35rem;
    background: linear-gradient(145deg, color-mix(in srgb, var(--mood-accent) 18%, rgba(255,255,255,.93)), rgba(255,255,255,.72));
    color: #172033;
    box-shadow: 0 18px 46px rgba(15, 23, 42, 0.23), 0 0 0 1px rgba(255,255,255,.32) inset;
    backdrop-filter: blur(18px) saturate(1.18);
    -webkit-backdrop-filter: blur(18px) saturate(1.18);
    overflow: hidden;
    transition: transform .18s ease, box-shadow .18s ease;
  }
  .mood-chip::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--mood-accent) 26%, transparent), transparent 32%),
      linear-gradient(90deg, transparent, rgba(255,255,255,.34), transparent);
    opacity: .75;
    pointer-events: none;
  }
  .mood-chip.expanded { transform: translateY(-.18rem); box-shadow: 0 22px 56px rgba(15, 23, 42, 0.27); }
  .mood-chip.compact {
    width: min(360px, calc(100vw - 6.8rem));
    min-width: 236px;
  }
  .mood-chip.sparkle::before { animation: shimmer .52s ease; }
  .mood-main {
    position: relative;
    width: 100%;
    min-height: 66px;
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    align-items: center;
    gap: .72rem;
    padding: .78rem .82rem;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .mood-chip.compact .mood-main {
    min-height: 54px;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    gap: .55rem;
    padding: .52rem .62rem;
  }
  .mood-main:focus-visible, .recover:focus-visible, .care-action:focus-visible, .comfort-note:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--mood-accent) 55%, white);
    outline-offset: 2px;
  }
  .mood-emoji {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: color-mix(in srgb, var(--mood-accent) 22%, white);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.82), 0 8px 18px color-mix(in srgb, var(--mood-accent) 24%, transparent);
    flex: 0 0 auto;
  }
  .mood-chip.compact .mood-emoji {
    width: 36px;
    height: 36px;
  }
  strong, small { display: block; }
  .mood-copy { min-width: 0; }
  .mood-copy strong { font-size: .9rem; letter-spacing: .01em; }
  .mood-copy small { margin-top: .14rem; color: rgba(23,32,51,.72); line-height: 1.28; }
  .mood-chip.compact .mood-copy strong { font-size: .82rem; }
  .mood-chip.compact .mood-copy small {
    display: -webkit-box;
    line-clamp: 1;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .mood-progress {
    min-width: 2.4rem;
    padding: .28rem .42rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--mood-accent) 20%, white);
    color: color-mix(in srgb, var(--mood-accent) 70%, #172033);
    font-size: .72rem;
    font-weight: 900;
    text-align: center;
  }
  .mood-panel {
    position: relative;
    max-height: min(54vh, 460px);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 .88rem .9rem;
    display: grid;
    gap: .72rem;
  }
  .panel-head {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr);
    gap: .55rem;
    align-items: start;
    padding: .2rem .1rem 0;
  }
  .panel-head > span { font-size: 1.35rem; }
  .panel-head h2 { margin: 0; font-size: .95rem; color: #111827; }
  .panel-head p, .recover-zone p { margin: .18rem 0 0; color: rgba(23,32,51,.74); font-size: .82rem; line-height: 1.42; }
  .care-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: .46rem;
  }
  .care-action {
    min-height: 66px;
    display: grid;
    place-items: center;
    gap: .18rem;
    padding: .48rem .32rem;
    border: 1px solid color-mix(in srgb, var(--mood-accent) 24%, rgba(15,23,42,.08));
    border-radius: .9rem;
    background: rgba(255,255,255,.52);
    color: #172033;
    cursor: pointer;
    font: inherit;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.36);
  }
  .care-action span { font-size: 1.14rem; }
  .care-action strong { font-size: .68rem; line-height: 1.1; }
  .care-action.done {
    background: color-mix(in srgb, var(--mood-accent) 20%, white);
    border-color: color-mix(in srgb, var(--mood-accent) 48%, white);
    transform: translateY(-1px);
  }
  .comfort-note {
    width: 100%;
    display: grid;
    gap: .16rem;
    padding: .72rem .82rem;
    border: 1px solid color-mix(in srgb, var(--mood-accent) 28%, rgba(15,23,42,.08));
    border-radius: 1rem;
    background: linear-gradient(135deg, rgba(255,255,255,.72), color-mix(in srgb, var(--mood-accent) 12%, rgba(255,255,255,.6)));
    color: #172033;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .comfort-note span { color: color-mix(in srgb, var(--mood-accent) 68%, #172033); font-size: .66rem; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
  .comfort-note strong { font-size: .86rem; line-height: 1.28; }
  .comfort-note small { color: rgba(23,32,51,.62); font-size: .7rem; }
  .history-link {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: .2rem .4rem;
    border-radius: .6rem;
    color: color-mix(in srgb, var(--mood-accent) 72%, #172033);
    font-size: .78rem;
    font-weight: 700;
    text-decoration: none;
    justify-self: start;
  }
  .history-link:hover { text-decoration: underline; }
  .history-link:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--mood-accent) 55%, white);
    outline-offset: 2px;
  }
  .recover-zone {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: .7rem;
    align-items: center;
    padding: .65rem;
    border-radius: 1rem;
    background: rgba(255,255,255,.46);
  }
  .recover-zone p { margin: 0; }
  .recover {
    min-height: 42px;
    padding: .56rem .82rem;
    border: 0;
    border-radius: 999px;
    background: var(--mood-accent);
    color: white;
    font-weight: 900;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 10px 24px color-mix(in srgb, var(--mood-accent) 38%, transparent);
  }
  .recover:disabled { opacity: .65; cursor: wait; }
  .mood-sick .mood-chip { background: linear-gradient(145deg, rgba(239,246,255,.96), rgba(255,247,237,.9)); }
  .mood-sad .mood-chip { background: linear-gradient(145deg, rgba(253,242,248,.96), rgba(255,255,255,.82)); }
  .mood-love .mood-chip { background: linear-gradient(145deg, rgba(255,228,230,.96), rgba(255,255,255,.82)); }

  @keyframes comfortFloat {
    0%, 100% { transform: translate3d(0, 0, 0) scale(.92); opacity: 0; }
    18% { opacity: .82; }
    52% { transform: translate3d(0, -26px, 0) scale(1.08); opacity: .66; }
    82% { opacity: 0; }
  }
  @keyframes shimmer {
    from { transform: translateX(-18%); opacity: .42; }
    to { transform: translateX(18%); opacity: .86; }
  }

  @media (min-width: 768px) {
    .mood-chip { left: max(1.25rem, env(safe-area-inset-left)); right: auto; bottom: calc(1.2rem + env(safe-area-inset-bottom) + var(--page-bottom-inset, 0px)); }
    .mood-chip.compact { width: 360px; }
    .mood-ribbon { top: calc(1rem + env(safe-area-inset-top)); }
  }
  @media (max-width: 380px) {
    .mood-chip.compact { width: min(310px, calc(100vw - 5.6rem)); min-width: 218px; }
    .recover-zone { grid-template-columns: 1fr; }
    .recover { width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mood-ambience span, .mood-chip, .mood-chip.sparkle::before { animation: none; transition: none; }
  }
</style>
