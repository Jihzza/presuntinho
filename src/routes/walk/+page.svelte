<script lang="ts">
  // Walk — Assignment Walkthrough (V4 port of V3 #pg-walk).
  // 5 numbered steps (each worth 20%) with linked lessons + 3 audio
  // walkthroughs using the LessonRunner audio pattern.

  import { t } from 'svelte-i18n';

  interface Step {
    num: string;
    title: string;
    weight: string;
    what: string;
    how: string;
    hint?: string;
    href: string;
  }

  const STEPS: Step[] = [
    {
      num: '1️⃣',
      title: 'Análise SWOT',
      weight: '20%',
      what: 'SWOT da Equivalenza + 1 concorrente (Divain).',
      how: '4-5 bullets por quadrante. Cita o case study (Elson, 2024). Sê específica com números.',
      hint: 'NPS 17 vs Druni 56 é uma fraqueza que também serve de ponte para o Marketing Problem.',
      href: '/escola/licao/equivalenza/swot/'
    },
    {
      num: '2️⃣',
      title: 'Buyer Persona',
      weight: '20%',
      what: 'Uma persona primária com demografia, psicografia, comportamento, frustrações.',
      how: 'Ancorada em investigação do case study. Acrescenta um parágrafo de "Importância Estratégica" a explicar porque é que esta persona importa.',
      href: '/escola/licao/equivalenza/persona/'
    },
    {
      num: '3️⃣',
      title: 'Problema de Marketing',
      weight: '20%',
      what: 'Formula o problema mais urgente em SCQA.',
      how: 'Mostra o teu raciocínio. Termina com um problem statement claro (1-2 frases) que a recomendação vai resolver.',
      href: '/escola/licao/equivalenza/problem/'
    },
    {
      num: '4️⃣',
      title: 'Matriz TOWS',
      weight: '20%',
      what: 'Matriz 2×2. 4 alternativas estratégicas. Breve avaliação de cada uma.',
      how: 'Cada célula = 1 estratégia em 1 linha. Depois um parágrafo a explicar porque é que SO ganha (ou qualquer outra que escolhas).',
      href: '/escola/licao/equivalenza/tows/'
    },
    {
      num: '5️⃣',
      title: 'Recomendação Estratégica',
      weight: '20%',
      what: 'Escolhe uma estratégia TOWS e defende-a.',
      how: 'Porque é que esta (e não as outras). Verificação de viabilidade. Plano de implementação com liderança, recursos, timeline.',
      href: '/escola/licao/equivalenza/recommendation/'
    }
  ];

  interface AudioTrack {
    icon: string;
    title: string;
    label: string;
    src: string;
  }
  const AUDIOS: AudioTrack[] = [
    {
      icon: '🎙️',
      title: 'Secções 1 + 2',
      label: 'SWOT + Persona',
      src: '/legacy/assets/intro_swot.mp3'
    },
    {
      icon: '🎙️',
      title: 'Secções 2 + 3',
      label: 'Persona + Marketing Problem',
      src: '/legacy/assets/persona_problem.mp3'
    },
    {
      icon: '🎙️',
      title: 'Secções 4 + 5',
      label: 'TOWS + Recommendation',
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
    <span class="tag">Módulo 3</span>
    <h1>🎙️ Assignment Walkthrough</h1>
    <p class="sub">O que o professor espera em cada secção — e onde gastar bem o teu tempo.</p>
  </header>

  <!-- Steps ------------------------------------------------------------- -->
  <section class="steps" aria-label="Os 5 passos do trabalho">
    {#each STEPS as step, i (step.num)}
      <article class="step">
        <div class="step-head">
          <span class="step-num" aria-hidden="true">{step.num}</span>
          <div class="step-meta">
            <h2>{step.title} <span class="weight">({step.weight})</span></h2>
            <p><strong>O que fazer:</strong> {step.what}</p>
            <p><strong>Como:</strong> {step.how}</p>
            {#if step.hint}
              <p class="hint">💡 {step.hint}</p>
            {/if}
          </div>
        </div>
        <a class="step-link" href={step.href}>Abrir lição detalhada →</a>
      </article>
    {/each}
  </section>

  <!-- Audio walkthroughs ------------------------------------------------ -->
  <section class="card" aria-labelledby="aud-h">
    <h2 id="aud-h">🎧 Audio walkthroughs</h2>
    <p class="aud-intro">Ouve enquanto revês. Voz em inglês, 3 faixas que cobrem as 5 secções.</p>

    {#each AUDIOS as track, i (track.src)}
      <div class="audio-row">
        <span class="audio-icon" aria-hidden="true">{playing[i] ? '🔊' : track.icon}</span>
        <div class="audio-meta">
          <strong>{track.label}</strong>
          <span class="audio-sub">{track.title}</span>
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
