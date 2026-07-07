<script lang="ts">
  /**
   * Português — mini-curso rich renderer (`/escola/curso/portugues/curso/`).
   *
   * The Português lesson content (static/lessons/portugues/curso.json) uses a
   * bespoke schema (vowels / vocab / dialogues / verbs) that the generic
   * LessonRunner can't render — so the catalog lesson `href`s here instead of
   * the broken `/escola/licao/portugues-base/curso/` path. Marks the lesson
   * visited on open and completed (XP + badge, once) when the user finishes,
   * then hands off to the ptq quiz — same progress contract as LessonRunner.
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { markVisited } from '$lib/state/stores';
  import { completeLessonOnce } from '$lib/escola/progress';

  interface VowelRow { vogal: string; ipa: string; truque: string; ar?: string; fr?: string }
  interface VocabWord { pt: string; en?: string; ar?: string; fr?: string }
  interface VocabCat { name: string; words: VocabWord[] }
  interface DialogueLine { speaker: string; pt: string; en?: string }
  interface DialogueItem { title: string; lines: DialogueLine[] }
  interface VerbItem { infinitive: string; translation?: string; ar?: string; conjugations: Record<string, string> }
  type Section =
    | { type: 'intro' | 'final_tips'; title: string; body: string }
    | { type: 'vowels'; title: string; data: { rows: VowelRow[] } }
    | { type: 'vocab'; title: string; data: { categories: VocabCat[] } }
    | { type: 'dialogues'; title: string; data: { items: DialogueItem[] } }
    | { type: 'verbs'; title: string; data: { items: VerbItem[] } }
    | { type: 'quiz_intro'; title: string; body: string; quizSlug: string };
  interface Curso {
    title: string;
    subtitle?: string;
    icon?: string;
    estimatedMinutes?: number;
    sections: Section[];
  }

  const UNIT = 'portugues-base';
  const LESSON = 'curso';
  const QUIZ = 'ptq';

  let curso = $state<Curso | null>(null);
  let loadError = $state<string | null>(null);

  const CONJ_ORDER = ['eu', 'tu', 'ele', 'nos', 'eles'];
  const CONJ_LABELS: Record<string, string> = { eu: 'eu', tu: 'tu', ele: 'ele/ela', nos: 'nós', eles: 'eles/elas' };

  onMount(() => {
    void (async () => {
      try {
        const res = await fetch('/lessons/portugues/curso.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        curso = (await res.json()) as Curso;
        await markVisited(`lesson:${UNIT}:${LESSON}`);
      } catch (e) {
        loadError = e instanceof Error ? e.message : String(e);
      }
    })();
  });

  async function finish(): Promise<void> {
    try {
      await completeLessonOnce(UNIT, LESSON);
    } catch (e) {
      console.error('[portugues] completion mark failed', e);
    }
    void goto(`/escola/quiz/${QUIZ}/`);
  }
</script>

<svelte:head>
  <title>{$t('portugues.curso.title', { default: 'Mini-curso de Português' })} · Presuntinho</title>
  <meta name="description" content={$t('portugues.curso.desc', { default: 'Vogais, vocabulário, diálogos e verbos de Português de Portugal.' })} />
</svelte:head>

<div class="pt-curso">
  <a class="back" href="/escola/curso/portugues/">← {$t('portugues.curso.back', { default: 'Curso de Português' })}</a>

  {#if loadError}
    <div class="state error" role="alert">
      <p>{$t('portugues.curso.error', { default: 'Não consegui carregar o mini-curso. Verifica a ligação e tenta de novo.' })}</p>
      <a class="cta" href="/escola/curso/portugues/">{$t('portugues.curso.error_back', { default: '← Voltar' })}</a>
    </div>
  {:else if !curso}
    <div class="state">{$t('common.loading', { default: 'A carregar…' })}</div>
  {:else}
    <header class="hero">
      <span class="badge">{curso.icon ?? '🇵🇹'} {$t('portugues.curso.kicker', { default: 'Mini-curso' })}</span>
      <h1>{curso.title}</h1>
      {#if curso.subtitle}<p class="sub">{curso.subtitle}</p>{/if}
    </header>

    {#each curso.sections as section, i (i)}
      <section class="block">
        <h2>{section.title}</h2>

        {#if section.type === 'intro' || section.type === 'final_tips'}
          <p class="body">{section.body}</p>

        {:else if section.type === 'vowels'}
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{$t('portugues.curso.col.vowel', { default: 'Vogal' })}</th>
                  <th>IPA</th>
                  <th>{$t('portugues.curso.col.trick', { default: 'Truque' })}</th>
                  <th>🇹🇳</th>
                  <th>🇫🇷</th>
                </tr>
              </thead>
              <tbody>
                {#each section.data.rows as r (r.vogal)}
                  <tr>
                    <td class="strong">{r.vogal}</td>
                    <td class="mono">{r.ipa}</td>
                    <td>{r.truque}</td>
                    <td dir="rtl">{r.ar ?? ''}</td>
                    <td>{r.fr ?? ''}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

        {:else if section.type === 'vocab'}
          <div class="vocab-grid">
            {#each section.data.categories as cat (cat.name)}
              <div class="vocab-cat">
                <h3>{cat.name}</h3>
                <ul>
                  {#each cat.words as w (w.pt)}
                    <li>
                      <span class="pt">{w.pt}</span>
                      <span class="tr">{[w.en, w.fr, w.ar].filter(Boolean).join(' · ')}</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/each}
          </div>

        {:else if section.type === 'dialogues'}
          <div class="dialogues">
            {#each section.data.items as dlg (dlg.title)}
              <div class="dialogue">
                <h3>{dlg.title}</h3>
                {#each dlg.lines as line, li (li)}
                  <div class="line" data-speaker={line.speaker}>
                    <span class="who">{line.speaker}</span>
                    <span class="say">
                      <span class="pt">{line.pt}</span>
                      {#if line.en}<span class="tr">{line.en}</span>{/if}
                    </span>
                  </div>
                {/each}
              </div>
            {/each}
          </div>

        {:else if section.type === 'verbs'}
          <div class="verbs">
            {#each section.data.items as v (v.infinitive)}
              <div class="verb">
                <div class="verb-head">
                  <strong>{v.infinitive}</strong>
                  {#if v.translation}<span class="tr">{v.translation}</span>{/if}
                </div>
                <div class="conj">
                  {#each CONJ_ORDER.filter((k) => v.conjugations[k]) as k (k)}
                    <div class="cell"><span class="pron">{CONJ_LABELS[k]}</span><span class="form">{v.conjugations[k]}</span></div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>

        {:else if section.type === 'quiz_intro'}
          <p class="body">{section.body}</p>
        {/if}
      </section>
    {/each}

    <div class="finish-row">
      <button type="button" class="finish" onclick={finish}>
        {$t('portugues.curso.finish', { default: 'Fazer o quiz 🇵🇹 →' })}
      </button>
    </div>
  {/if}
</div>

<style>
  .pt-curso { max-width: min(760px, 100%); width: 100%; margin: 0 auto; padding: 1.25rem 1rem 6rem; color: var(--txt); }
  .back { display: inline-block; color: var(--accent); text-decoration: none; font-size: var(--fs-sm, 0.85rem); padding: 0.35rem 0; }
  .state { padding: 2rem 0; text-align: center; color: var(--txt2); }
  .state.error { color: var(--txt); }
  .state .cta { display: inline-block; margin-top: 0.75rem; color: var(--accent); }
  .hero { margin: 0.5rem 0 1.5rem; }
  .badge { display: inline-block; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.03em; color: var(--accent); text-transform: uppercase; }
  .hero h1 { margin: 0.35rem 0 0.25rem; font-size: clamp(1.5rem, 6vw, 2rem); color: var(--txt); }
  .hero .sub { margin: 0; color: var(--txt2); }
  .block { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg, 1rem); padding: 1rem 1rem 1.1rem; margin: 0 0 1rem; }
  .block h2 { margin: 0 0 0.6rem; font-size: 1.15rem; color: var(--txt); }
  .body { margin: 0; color: var(--txt2); line-height: 1.55; }

  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: start; padding: 0.5rem 0.55rem; border-bottom: 1px solid var(--border); }
  th { color: var(--txt3); font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.02em; }
  td { color: var(--txt); }
  td.strong { font-weight: 700; }
  td.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; color: var(--txt2); white-space: nowrap; }

  .vocab-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; }
  .vocab-cat h3 { margin: 0 0 0.35rem; font-size: 0.95rem; color: var(--accent); }
  .vocab-cat ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.3rem; }
  .vocab-cat li { display: flex; justify-content: space-between; gap: 0.5rem; align-items: baseline; }
  .pt { font-weight: 600; color: var(--txt); }
  .tr { color: var(--txt3); font-size: 0.82rem; text-align: end; }

  .dialogues { display: grid; gap: 1rem; }
  .dialogue h3 { margin: 0 0 0.5rem; font-size: 0.95rem; color: var(--txt); }
  .line { display: flex; gap: 0.5rem; margin: 0 0 0.4rem; }
  .line .who { flex-shrink: 0; width: 1.6rem; height: 1.6rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
  .line[data-speaker='B'] .who { background: color-mix(in srgb, var(--txt) 12%, transparent); color: var(--txt2); }
  .say { display: grid; gap: 0.1rem; }
  .say .pt { color: var(--txt); }
  .say .tr { color: var(--txt3); font-size: 0.82rem; text-align: start; }

  .verbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.75rem; }
  .verb { border: 1px solid var(--border); border-radius: 0.7rem; padding: 0.6rem 0.7rem; }
  .verb-head { display: flex; gap: 0.5rem; align-items: baseline; margin-bottom: 0.4rem; }
  .verb-head strong { color: var(--accent); }
  .conj { display: grid; grid-template-columns: 1fr 1fr; gap: 0.2rem 0.6rem; }
  .conj .cell { display: flex; justify-content: space-between; gap: 0.4rem; font-size: 0.86rem; }
  .conj .pron { color: var(--txt3); }
  .conj .form { color: var(--txt); font-weight: 600; }

  .finish-row { margin-top: 1.25rem; }
  .finish {
    width: 100%;
    min-height: var(--touch-target, 44px);
    padding: 0.85rem 1rem;
    background: var(--accent);
    color: var(--on-accent, #fff);
    border: 0;
    border-radius: var(--radius-lg, 1rem);
    font: inherit;
    font-weight: 700;
    font-size: 1.05rem;
    cursor: pointer;
    transition: transform var(--motion-fast, 120ms) ease, background var(--motion-fast, 120ms) ease;
  }
  .finish:hover { background: var(--accent-hover, var(--accent)); }
  .finish:active { transform: scale(0.98); }
  .finish:focus-visible { outline: none; box-shadow: var(--focus-ring, 0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent)); }
</style>
