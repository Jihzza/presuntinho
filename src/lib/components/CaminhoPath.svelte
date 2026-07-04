<script lang="ts">
  /**
   * CaminhoPath — mapa de curso estilo Duolingo (V10.2).
   *
   * Cada UNIDADE é um segmento do caminho: banner colorido + sequência de
   * nós — uma lição por nó (📖 teoria) e o teste no fim (🏆 quiz). Um único
   * caminho serpenteante (amplitude 70px, ciclo de 8 passos, direção
   * alternada por unidade — a geometria real do Duolingo), com:
   *   * nó ATUAL: cor da unidade, anel a pulsar, bolha CONTINUAR a saltar
   *   * nós FEITOS: dourados com ✓
   *   * nós FUTUROS: esbatidos (soft-lock — nada na app tranca a sério)
   *   * botões "3D" com border-bottom mais escuro que afunda ao carregar
   *   * o Presuntinho a torcer nas margens
   */
  import { t } from 'svelte-i18n';
  import type { SchoolCourse, SchoolUnit } from '$lib/escola/catalog';
  import type { CourseProgress, NextLessonTarget } from '$lib/escola/progress';
  import type { ActivityStreak } from '$lib/gamification/streak';
  import PigMascot from './PigMascot.svelte';

  interface Props {
    course: SchoolCourse;
    progress: CourseProgress | null;
    next: NextLessonTarget | null;
    streak: ActivityStreak | null;
    mascotEmoji: string;
    /** Ids 'lesson:<unit>:<slug>' já abertos (loadVisitedLessons). */
    visitedLessons?: Set<string>;
    /** quizSlugs com pelo menos uma tentativa. */
    quizDone?: Set<string>;
  }

  let {
    course,
    progress,
    next,
    streak,
    mascotEmoji,
    visitedLessons = new Set(),
    quizDone = new Set()
  }: Props = $props();

  let units = $derived<SchoolUnit[]>([...course.units, ...(course.extras ?? [])]);

  type PathNode = {
    key: string;
    kind: 'lesson' | 'quiz';
    unit: SchoolUnit;
    title: string;
    href: string;
    done: boolean;
  };

  type Segment = { unit: SchoolUnit; unitIndex: number; nodes: PathNode[] };

  // A geometria do Duolingo: amplitude 70px em ciclo de 8 passos.
  const CYCLE = [0, -45, -70, -45, 0, 45, 70, 45];

  const segments = $derived.by<Segment[]>(() => {
    return units.map((unit, unitIndex) => {
      const nodes: PathNode[] = unit.lessons.map((lesson) => ({
        key: `${unit.slug}/${lesson.slug}`,
        kind: 'lesson' as const,
        unit,
        title: lesson.title,
        href: `/escola/licao/${unit.slug}/${lesson.slug}/`,
        done: visitedLessons.has(`lesson:${unit.slug}:${lesson.slug}`)
      }));
      // Teste(s) da unidade: os quizSlugs distintos das lições, no fim da
      // sequência — teoria primeiro, teste no final (pedido do Daniel).
      const unitQuizzes: { slug: string; title: string }[] = [];
      for (const lesson of unit.lessons) {
        if (lesson.quizSlug && !unitQuizzes.some((q) => q.slug === lesson.quizSlug)) {
          unitQuizzes.push({
            slug: lesson.quizSlug,
            title: lesson.quizTitle ?? $t('caminho.node.test', { default: 'Teste da unidade' })
          });
        }
      }
      for (const q of unitQuizzes) {
        nodes.push({
          key: `${unit.slug}/quiz/${q.slug}`,
          kind: 'quiz',
          unit,
          title: q.title,
          href: `/escola/quiz/${q.slug}/`,
          done: quizDone.has(q.slug)
        });
      }
      return { unit, unitIndex, nodes };
    });
  });

  // O nó ATUAL é o primeiro por fazer em todo o caminho.
  const currentKey = $derived.by<string | null>(() => {
    for (const seg of segments) {
      for (const node of seg.nodes) {
        if (!node.done) return node.key;
      }
    }
    return null;
  });

  const passedCurrent = (key: string): boolean => {
    // true quando o nó vem DEPOIS do atual (fica esbatido).
    let seenCurrent = false;
    for (const seg of segments) {
      for (const node of seg.nodes) {
        if (node.key === key) return seenCurrent;
        if (node.key === currentKey) seenCurrent = true;
      }
    }
    return false;
  };

  function offsetFor(unitIndex: number, i: number): number {
    const raw = CYCLE[i % CYCLE.length];
    // Direção alternada por unidade — o zig-zag continua natural.
    return unitIndex % 2 === 1 ? -raw : raw;
  }
</script>

<section class="caminho" aria-label={$t('caminho.aria', { default: 'Caminho do curso' })}>
  <!-- Cabeçalho de progresso -->
  <header class="summary card">
    <span class="mascot"><PigMascot emotion="happy" size={64} /></span>
    <div class="summary-meta">
      <p class="kicker">{$t('caminho.tag', { default: '🗺️ O teu caminho' })}</p>
      <h1>{course.icon} {course.title}</h1>
      <p class="cheer">{$t('caminho.mascot.cheer', { default: 'Estou contigo em cada passo — vamos lá! 💕' })}</p>
      <div class="summary-stats">
        <span class="stat">
          <strong>{progress ? `${progress.percent}%` : '…'}</strong>
          <small>{$t('caminho.progress_label', { default: 'do curso' })}</small>
        </span>
        <span class="stat">
          <strong>🔥 {streak ? streak.current : '…'}</strong>
          <small>{$t('caminho.streak_label', { default: 'dias seguidos' })}</small>
        </span>
        <span class="stat">
          <strong>{progress ? `${progress.done}/${progress.total}` : '…'}</strong>
          <small>{$t('caminho.lessons_label', { default: 'lições' })}</small>
        </span>
      </div>
      {#if progress}
        <div
          class="bar"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={progress.percent}
          aria-label={$t('caminho.progress_aria', { values: { percent: progress.percent }, default: 'Progresso do curso: {percent}%' })}
        >
          <div class="bar-fill" style="width: {progress.percent}%"></div>
        </div>
      {/if}
    </div>
  </header>

  {#if progress && !next && currentKey === null}
    <p class="all-done">{$t('caminho.done', { default: 'Curso completo — és absolutamente incrível! 🎉' })}</p>
  {/if}

  <!-- O caminho -->
  {#each segments as seg (seg.unit.slug)}
    <!-- Banner da unidade -->
    <div class="unit-banner" style="--unit-color: {seg.unit.color};">
      <div class="banner-copy">
        <strong>{seg.unit.icon} {seg.unit.title}</strong>
        <small>
          {$t('caminho.unit_count', {
            values: { done: seg.nodes.filter((n) => n.done).length, total: seg.nodes.length },
            default: '{done}/{total} lições'
          })}
        </small>
      </div>
      <a class="banner-open" href={`/escola/curso/${seg.unit.slug}/`}>
        {$t('caminho.unit.open', { default: 'Ver unidade' })}
      </a>
    </div>

    <ol class="path">
      {#each seg.nodes as node, i (node.key)}
        {@const isCurrent = node.key === currentKey}
        {@const isLocked = !node.done && !isCurrent && passedCurrent(node.key)}
        {@const offset = offsetFor(seg.unitIndex, i)}
        <li class="step" style="--offset: {offset}px;">
          {#if isCurrent}
            <span class="start-bubble" style="--unit-color: {seg.unit.color};" aria-hidden="true">
              {$t('caminho.node.start', { default: 'CONTINUAR' })}
            </span>
          {/if}
          <a
            class="node"
            class:done={node.done}
            class:current={isCurrent}
            class:locked={isLocked}
            class:quiz={node.kind === 'quiz'}
            href={node.href}
            style="--unit-color: {seg.unit.color};"
            data-sveltekit-preload-data
            aria-label={node.done
              ? $t('caminho.node.completed_aria', { values: { title: node.title }, default: '{title} — concluída' })
              : isLocked
                ? $t('caminho.node.upcoming_aria', { values: { title: node.title }, default: '{title} — ainda por começar' })
                : node.title}
          >
            <span class="node-face" aria-hidden="true">
              {#if node.done}✓{:else if node.kind === 'quiz'}🏆{:else}📖{/if}
            </span>
          </a>
          <span class="node-label" class:muted={isLocked}>{node.title}</span>
          <!-- O Presuntinho torce nas margens, do lado oposto à curva -->
          {#if i % 6 === 3}
            <span class="cheer-pig" class:flip={offset > 0} aria-hidden="true">
              <PigMascot emotion="happy" size={46} still />
            </span>
          {/if}
        </li>
      {/each}
    </ol>
  {/each}
</section>

<style>
  .caminho {
    max-width: 620px;
    margin: 0 auto;
  }

  /* ---- Cabeçalho ---- */
  .summary {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.9rem;
    align-items: start;
    padding: 1.1rem 1.2rem;
    background: var(--card, rgba(255, 255, 255, 0.055));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.11));
    border-radius: var(--radius-xl, 1.25rem);
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(2, 6, 23, 0.18));
  }
  .mascot { line-height: 1; }
  .kicker {
    margin: 0;
    color: var(--txt3);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-size: var(--fs-xs, 0.72rem);
    font-weight: 800;
  }
  .summary-meta h1 {
    margin: 0.15rem 0 0.2rem;
    color: var(--txt, #fff);
    font-size: var(--fs-lg, 1.3rem);
  }
  .cheer {
    margin: 0 0 0.6rem;
    color: var(--txt2);
    font-size: var(--fs-sm, 0.88rem);
  }
  .summary-stats { display: flex; gap: 0.9rem; flex-wrap: wrap; }
  .stat strong { display: block; color: var(--txt, #fff); font-variant-numeric: tabular-nums; }
  .stat small { color: var(--txt3); font-size: var(--fs-xs, 0.72rem); }
  .bar {
    height: 8px;
    margin-top: 0.65rem;
    background: var(--bg-elev, rgba(0, 0, 0, 0.28));
    border-radius: 999px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
    transition: width var(--motion-base, 220ms) ease;
  }
  .all-done {
    margin: 1rem 0 0;
    padding: 0.85rem 1rem;
    text-align: center;
    color: var(--txt, #fff);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    border-radius: var(--radius-lg, 1rem);
  }

  /* ---- Banner da unidade ---- */
  .unit-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    margin-top: 1.4rem;
    padding: 0.85rem 1rem;
    border-radius: var(--radius-lg, 1rem);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--unit-color, var(--accent)) 75%, #000 6%),
      color-mix(in srgb, var(--unit-color, var(--accent)) 55%, #000 14%)
    );
    color: #fff;
  }
  .banner-copy { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .banner-copy strong { font-size: var(--fs-md, 1rem); }
  .banner-copy small { opacity: 0.85; font-size: var(--fs-xs, 0.74rem); }
  .banner-open {
    flex: none;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 0.85rem;
    border: 2px solid rgba(255, 255, 255, 0.45);
    border-bottom-width: 4px;
    border-radius: 0.8rem;
    color: #fff;
    font-size: var(--fs-xs, 0.76rem);
    font-weight: 800;
    text-transform: uppercase;
    text-decoration: none;
  }
  .banner-open:active { transform: translateY(2px); border-bottom-width: 2px; }
  .banner-open:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

  /* ---- Caminho serpenteante ---- */
  .path {
    list-style: none;
    margin: 0.9rem 0 0;
    padding: 0.4rem 0 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.35rem;
    align-items: center;
  }
  .step {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    transform: translateX(var(--offset, 0px));
  }

  .start-bubble {
    position: absolute;
    top: -2.15rem;
    padding: 0.35rem 0.8rem;
    border: 2px solid var(--border, rgba(255, 255, 255, 0.2));
    border-radius: 0.7rem;
    background: var(--card, #22314f);
    color: var(--unit-color, var(--accent));
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.06em;
    white-space: nowrap;
    animation: bubble-bounce 1s ease-in-out infinite;
    z-index: 2;
  }
  .start-bubble::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -6px;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--card, #22314f);
    border-bottom: 0;
  }
  @keyframes bubble-bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-24%); }
  }

  /* Botão "3D" à Duolingo: border-bottom escura que afunda ao carregar. */
  .node {
    position: relative;
    display: grid;
    place-items: center;
    width: 68px;
    height: 68px;
    border-radius: 50%;
    text-decoration: none;
    background: var(--bg-elev, rgba(255, 255, 255, 0.08));
    border-bottom: 7px solid color-mix(in srgb, var(--bg-elev, #1a2540) 60%, #000 25%);
    box-shadow: var(--shadow-sm, 0 2px 8px rgba(2, 6, 23, 0.2));
    transition: transform var(--motion-fast, 120ms) ease, border-bottom-width var(--motion-fast, 120ms) ease;
  }
  .node:active {
    transform: translateY(5px);
    border-bottom-width: 2px;
  }
  .node:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--unit-color, var(--accent)) 60%, transparent);
  }
  .node-face {
    font-size: 1.7rem;
    line-height: 1;
    color: var(--txt, #fff);
  }
  .node.done {
    background: #ffc800;
    border-bottom-color: #d4a500;
  }
  .node.done .node-face {
    color: #7a5c00;
    font-weight: 900;
    font-size: 1.9rem;
  }
  .node.current {
    background: var(--unit-color, var(--accent));
    border-bottom-color: color-mix(in srgb, var(--unit-color, var(--accent)) 70%, #000 25%);
    animation: node-pulse 1.8s ease-in-out infinite;
  }
  @keyframes node-pulse {
    0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--unit-color, var(--accent)) 50%, transparent); }
    50% { box-shadow: 0 0 0 13px color-mix(in srgb, var(--unit-color, var(--accent)) 0%, transparent); }
  }
  .node.locked {
    opacity: 0.45;
    filter: grayscale(0.6);
  }
  .node.quiz {
    width: 76px;
    height: 76px;
  }

  .node-label {
    max-width: 170px;
    text-align: center;
    color: var(--txt2);
    font-size: var(--fs-xs, 0.74rem);
    font-weight: 600;
    line-height: 1.25;
  }
  .node-label.muted { color: var(--txt3); opacity: 0.8; }

  .cheer-pig {
    position: absolute;
    top: 4px;
    inset-inline-start: calc(50% + 74px);
    opacity: 0.9;
  }
  .cheer-pig.flip {
    inset-inline-start: auto;
    inset-inline-end: calc(50% + 74px);
  }

  @media (max-width: 420px) {
    .step { transform: translateX(calc(var(--offset, 0px) * 0.6)); }
    .cheer-pig { inset-inline-start: calc(50% + 62px); }
    .cheer-pig.flip { inset-inline-start: auto; inset-inline-end: calc(50% + 62px); }
  }
</style>
