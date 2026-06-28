<script lang="ts">
  // Walk — Assignment Walkthrough (V4 port of V3 #pg-walk).
  // 5 numbered steps (each worth 20%) with linked lessons + 3 audio
  // walkthroughs using the LessonRunner audio pattern.

  import { t } from 'svelte-i18n';

  interface Step {
    num: string;
    titleKey: string;       // i18n key for step name
    titleDefault: string;
    weight: string;
    whatKey: string;
    whatDefault: string;
    howKey: string;
    howDefault: string;
    hintKey?: string;
    hintDefault?: string;
    href: string;
  }

  const STEPS: Step[] = [
    {
      num: '1️⃣',
      titleKey: 'walk.step.swot.title',
      titleDefault: 'Análise SWOT',
      weight: '20%',
      whatKey: 'walk.step.swot.what',
      whatDefault: 'SWOT da Equivalenza + 1 concorrente (Divain).',
      howKey: 'walk.step.swot.how',
      howDefault: '4-5 bullets por quadrante. Cita o case study (Elson, 2024). Sê específica com números.',
      hintKey: 'walk.step.swot.hint',
      hintDefault: 'NPS 17 vs Druni 56 é uma fraqueza que também serve de ponte para o Marketing Problem.',
      href: '/escola/licao/equivalenza/swot/'
    },
    {
      num: '2️⃣',
      titleKey: 'walk.step.persona.title',
      titleDefault: 'Buyer Persona',
      weight: '20%',
      whatKey: 'walk.step.persona.what',
      whatDefault: 'Uma persona primária com demografia, psicografia, comportamento, frustrações.',
      howKey: 'walk.step.persona.how',
      howDefault: 'Ancorada em investigação do case study. Acrescenta um parágrafo de «Importância Estratégica» a explicar porque é que esta persona importa.',
      href: '/escola/licao/equivalenza/persona/'
    },
    {
      num: '3️⃣',
      titleKey: 'walk.step.problem.title',
      titleDefault: 'Problema de Marketing',
      weight: '20%',
      whatKey: 'walk.step.problem.what',
      whatDefault: 'Formula o problema mais urgente em SCQA.',
      howKey: 'walk.step.problem.how',
      howDefault: 'Mostra o teu raciocínio. Termina com um problem statement claro (1-2 frases) que a recomendação vai resolver.',
      href: '/escola/licao/equivalenza/problem/'
    },
    {
      num: '4️⃣',
      titleKey: 'walk.step.tows.title',
      titleDefault: 'Matriz TOWS',
      weight: '20%',
      whatKey: 'walk.step.tows.what',
      whatDefault: 'Matriz 2×2. 4 alternativas estratégicas. Breve avaliação de cada uma.',
      howKey: 'walk.step.tows.how',
      howDefault: 'Cada célula = 1 estratégia em 1 linha. Depois um parágrafo a explicar porque é que SO ganha (ou qualquer outra que escolhas).',
      href: '/escola/licao/equivalenza/tows/'
    },
    {
      num: '5️⃣',
      titleKey: 'walk.step.rec.title',
      titleDefault: 'Recomendação Estratégica',
      weight: '20%',
      whatKey: 'walk.step.rec.what',
      whatDefault: 'Escolhe uma estratégia TOWS e defende-a.',
      howKey: 'walk.step.rec.how',
      howDefault: 'Porque é que esta (e não as outras). Verificação de viabilidade. Plano de implementação com liderança, recursos, timeline.',
      href: '/escola/licao/equivalenza/recommendation/'
    }
  ];

  interface AudioTrack {
    icon: string;
    titleKey: string;
    titleDefault: string;
    labelKey: string;
    labelDefault: string;
    src: string;
  }
  const AUDIOS: AudioTrack[] = [
    {
      icon: '🎙️',
      titleKey: 'walk.audio.swot',
      titleDefault: 'Secções 1 + 2',
      labelKey: 'walk.audio.swot.label',
      labelDefault: 'SWOT + Persona',
      src: '/legacy/assets/intro_swot.mp3'
    },
    {
      icon: '🎙️',
      titleKey: 'walk.audio.swot',
      titleDefault: 'Secções 2 + 3',
      labelKey: 'walk.audio.pers.label',
      labelDefault: 'Persona + Marketing Problem',
      src: '/legacy/assets/persona_problem.mp3'
    },
    {
      icon: '🎙️',
      titleKey: 'walk.audio.swot',
      titleDefault: 'Secções 4 + 5',
      labelKey: 'walk.audio.tows.label',
      labelDefault: 'TOWS + Recommendation',
      src: '/legacy/assets/tows_recommendation.mp3'
    }
  ];

  // Reactive audio state per-track (index 0..2)
  let audioEls = $state<Array<HTMLAudioElement | null>>([null, null, null]);
  let playing = $state<boolean[]>([false, false, false]);
  let progress = $state<number[]>([0, 0, 0]);

  function onPlay(i: number)    { playing[i] = true; }
  function onPause(i: number)   { playing[i] = false; }
  function onEnded(i: number)   { playing[i] = false; progress[i] = 1; }
  function onTimeUpdate(i: number) {
    const el = audioEls[i];
    if (!el || !el.duration || !isFinite(el.duration)) return;
    progress[i] = el.currentTime / el.duration;
  }
</script>

<svelte:head>
  <title>{$t('routes.walk.title', { default: 'Walkthrough · Assignment' })} · Presuntinho</title>
</svelte:head>

<div class="walk">
  <header class="walk-head">
    <p class="breadcrumb">
      <a href="/">{$t('walk.breadcrumb.home', { default: '← Hub' })}</a>
      <span class="sep">›</span>
      <span>{$t('walk.breadcrumb.current', { default: 'Walkthrough' })}</span>
    </p>
    <span class="tag">{$t('walk.tag.modulo', { default: 'Módulo 3' })}</span>
    <h1>{$t('walk.h1', { default: '🎙️ Assignment Walkthrough' })}</h1>
    <p class="sub">{$t('walk.sub', { default: 'O que o professor espera em cada secção — e onde gastar bem o teu tempo.' })}</p>
  </header>

  <!-- Steps ------------------------------------------------------------- -->
  <section class="steps" aria-label="{$t('walk.steps.aria', { default: 'Os 5 passos do trabalho' })}">
    {#each STEPS as step, i (step.href)}
      <article class="step">
        <div class="step-head">
          <span class="step-num" aria-hidden="true">{step.num}</span>
          <div class="step-meta">
            <h2>{$t(step.titleKey, { default: step.titleDefault })} <span class="weight">({step.weight})</span></h2>
            <p><strong>{$t('walk.step.what', { default: 'O que fazer' })}:</strong> {$t(step.whatKey, { default: step.whatDefault })}</p>
            <p><strong>{$t('walk.step.how', { default: 'Como' })}:</strong> {$t(step.howKey, { default: step.howDefault })}</p>
            {#if step.hintKey && step.hintDefault}
              <p class="hint">💡 {$t(step.hintKey, { default: step.hintDefault })}</p>
            {/if}
          </div>
        </div>
        <a class="step-link" href={step.href}>{$t('walk.openLesson', { default: 'Abrir lição detalhada →' })}</a>
      </article>
    {/each}
  </section>

  <!-- Audio walkthroughs ------------------------------------------------ -->
  <section class="card" aria-labelledby="aud-h">
    <h2 id="aud-h">{$t('walk.audio.section.h2', { default: '🎧 Audio walkthroughs' })}</h2>
    <p class="aud-intro">{$t('walk.audio.intro', { default: 'Ouve enquanto revês. Voz em inglês, 3 faixas que cobrem as 5 secções.' })}</p>

    {#each AUDIOS as track, i (track.src)}
      <div class="audio-row">
        <span class="audio-icon" aria-hidden="true">{playing[i] ? '🔊' : track.icon}</span>
        <div class="audio-meta">
          <strong>{$t(track.labelKey, { default: track.labelDefault })}</strong>
          <span class="audio-sub">{$t(track.titleKey, { default: track.titleDefault })}</span>
          <div class="audio-bar" aria-hidden="true">
            <div class="audio-fill" style="width: {Math.round(progress[i] * 100)}%"></div>
          </div>
        </div>
        <audio
          bind:this={audioEls[i]}
          controls
          preload="metadata"
          src={track.src}
          onplay={() => onPlay(i)}
          onpause={() => onPause(i)}
          ontimeupdate={() => onTimeUpdate(i)}
          onended={() => onEnded(i)}
        ></audio>
      </div>
    {/each}
  </section>
</div>

<style>
  .walk {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .walk-head { margin-bottom: 1.5rem; }
  .walk-head h1 {
    color: #fff;
    margin: 0.25rem 0 0.5rem;
    font-size: 2rem;
  }
  .breadcrumb {
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    margin: 0 0 0.5rem;
  }
  .breadcrumb a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }

  .tag {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    background: rgba(236, 72, 153, 0.2);
    border: 1px solid rgba(236, 72, 153, 0.5);
    color: #fbcfe8;
    border-radius: 999px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }
  .sub {
    color: var(--txt2, #cbd5e1);
    margin: 0;
  }

  /* Steps */
  .steps {
    display: grid;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }
  .step {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
  }
  .step-head {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }
  .step-num {
    flex: 0 0 auto;
    font-size: 2rem;
    line-height: 1;
  }
  .step-meta { flex: 1; min-width: 0; }
  .step-meta h2 {
    color: #fff;
    font-size: 1.05rem;
    margin: 0 0 0.4rem;
  }
  .weight {
    font-size: 0.8rem;
    color: var(--accent, #ec4899);
    font-weight: 500;
  }
  .step-meta p {
    color: var(--txt2, #cbd5e1);
    margin: 0.25rem 0;
    line-height: 1.5;
    font-size: 0.92rem;
  }
  .hint {
    color: #fde68a !important;
    background: rgba(245, 158, 11, 0.1);
    padding: 0.5rem 0.75rem;
    border-left: 3px solid #f59e0b;
    border-radius: 0.3rem;
    margin-top: 0.5rem !important;
    font-size: 0.88rem !important;
  }
  .step-link {
    display: inline-block;
    margin-top: 0.75rem;
    padding: 0.4rem 0.85rem;
    background: rgba(236, 72, 153, 0.15);
    border: 1px solid rgba(236, 72, 153, 0.4);
    color: #fbcfe8;
    border-radius: 0.4rem;
    font-size: 0.85rem;
    font-weight: 600;
    text-decoration: none;
  }
  .step-link:hover { background: rgba(236, 72, 153, 0.25); }

  /* Audio card */
  .card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }
  .card h2 {
    color: #fff;
    font-size: 1.25rem;
    margin: 0 0 0.4rem;
  }
  .aud-intro {
    color: var(--txt2, #cbd5e1);
    margin: 0 0 1rem;
    font-size: 0.92rem;
  }
  .audio-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.75rem 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .audio-row:first-of-type { border-top: 0; }
  .audio-icon { font-size: 1.4rem; }
  .audio-meta {
    flex: 1;
    min-width: 200px;
  }
  .audio-meta strong {
    color: #fff;
    font-size: 0.95rem;
    display: block;
  }
  .audio-sub {
    color: var(--txt3, #94a3b8);
    font-size: 0.8rem;
  }
  .audio-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 0.3rem;
  }
  .audio-fill {
    height: 100%;
    background: var(--accent, #ec4899);
    transition: width 0.2s linear;
  }
  .card audio { height: 32px; max-width: 260px; }
</style>
