<script lang="ts">
  /**
   * CaminhoPath — mapa de curso estilo Duolingo (V10.3, fiel ao screenshot).
   *
   * Mecânica dos cursos:
   *   * Sequência por unidade: lições (⭐) por ordem → baú a meio (🎁,
   *     recompensa única de XP) → teste no fim (🏆 = quiz da unidade).
   *   * Nós SEM texto por baixo — tocar num nó abre um popup com o título
   *     e o CTA (Começar / Rever / Abrir baú), como no Duolingo.
   *   * Nó ATUAL: cor da unidade + anel de progresso da unidade + bolha
   *     CONTINUAR a saltar. FEITOS: moedas douradas com ✓. FUTUROS:
   *     círculos esbatidos com 🔒 (soft-lock — tudo continua acessível).
   *   * Primeiro nó da unidade a seguir à atual: bolha "SALTAR PARA AQUI?".
   *   * Banner colorido de cada unidade fica STICKY enquanto percorres o
   *     segmento dela; o Presuntinho aparece em grande nas margens.
   */
  import { t } from 'svelte-i18n';
  import type { SchoolCourse, SchoolUnit } from '$lib/escola/catalog';
  import type { CourseProgress, NextLessonTarget } from '$lib/escola/progress';
  import type { ActivityStreak } from '$lib/gamification/streak';
  import { awardXP } from '$lib/state/xp-actions';
  import { markVisited } from '$lib/state/stores';
  import { fireConfettiEvent, showToast } from '$lib/components/events';
  import { playSfx, vibrate } from '$lib/gamification/sound';
  import MascotAvatar from './MascotAvatar.svelte';
  import type { MascotPose } from '$lib/gamification/mascots';

  interface Props {
    course: SchoolCourse;
    progress: CourseProgress | null;
    next: NextLessonTarget | null;
    streak: ActivityStreak | null;
    /** Id da mascote ativa (mascots.ts) — anima o mapa inteiro. */
    mascotId: string;
    /** Ids 'lesson:<unit>:<slug>' já abertos (loadVisitedLessons). */
    visitedLessons?: Set<string>;
    /** quizSlugs com pelo menos uma tentativa. */
    quizDone?: Set<string>;
    /** Ids 'path-chest:<unit>' já recolhidos. */
    claimedChests?: Set<string>;
  }

  let {
    course,
    progress,
    next,
    streak,
    mascotId,
    visitedLessons = new Set(),
    quizDone = new Set(),
    claimedChests = new Set()
  }: Props = $props();

  // Poses das personagens nas margens — variam ao longo do caminho para o
  // mapa parecer vivo (festeja, aponta o rumo, manda amor).
  const CHEER_POSES: MascotPose[] = ['cheer', 'point', 'love'];
  function cheerPose(unitIndex: number, i: number): MascotPose {
    return CHEER_POSES[(unitIndex + ((i / 7) | 0)) % CHEER_POSES.length];
  }

  let units = $derived<SchoolUnit[]>([...course.units, ...(course.extras ?? [])]);
  let openKey = $state<string | null>(null);
  let localChests = $state<Set<string>>(new Set());

  type PathNode = {
    key: string;
    kind: 'lesson' | 'quiz' | 'chest';
    unit: SchoolUnit;
    title: string;
    href: string | null;
    done: boolean;
  };

  type Segment = { unit: SchoolUnit; unitIndex: number; nodes: PathNode[]; done: number };

  // Geometria do Duolingo: amplitude 70px em ciclo de 8 passos.
  const CYCLE = [0, -45, -70, -45, 0, 45, 70, 45];
  const CHEST_XP = 20;

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

      // Baú a meio da unidade (recompensa única) quando há espaço para ele.
      if (nodes.length >= 3) {
        const chestKey = `path-chest:${unit.slug}`;
        nodes.splice(Math.ceil(nodes.length / 2), 0, {
          key: chestKey,
          kind: 'chest',
          unit,
          title: $t('caminho.chest.title', { default: 'Baú do caminho' }),
          href: null,
          done: claimedChests.has(chestKey) || localChests.has(chestKey)
        });
      }

      // Teste(s) da unidade no fim: quizSlugs distintos das lições.
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
      return { unit, unitIndex, nodes, done: nodes.filter((n) => n.done).length };
    });
  });

  // O nó ATUAL é o primeiro por fazer em todo o caminho (baús não contam
  // como bloqueio — são recompensa, não obrigação).
  const currentKey = $derived.by<string | null>(() => {
    for (const seg of segments) {
      for (const node of seg.nodes) {
        if (!node.done && node.kind !== 'chest') return node.key;
      }
    }
    return null;
  });

  const currentUnitIndex = $derived.by<number>(() => {
    for (const seg of segments) {
      if (seg.nodes.some((n) => n.key === currentKey)) return seg.unitIndex;
    }
    return segments.length - 1;
  });

  /** true quando o nó vem DEPOIS do atual (esbatido + cadeado). */
  const lockedKeys = $derived.by<Set<string>>(() => {
    const out = new Set<string>();
    let seenCurrent = currentKey === null;
    for (const seg of segments) {
      for (const node of seg.nodes) {
        if (node.key === currentKey) {
          seenCurrent = true;
          continue;
        }
        if (seenCurrent && !node.done) out.add(node.key);
      }
    }
    return out;
  });

  function offsetFor(unitIndex: number, i: number): number {
    const raw = CYCLE[i % CYCLE.length];
    return unitIndex % 2 === 1 ? -raw : raw;
  }

  function toggle(key: string): void {
    openKey = openKey === key ? null : key;
  }

  async function claimChest(node: PathNode): Promise<void> {
    if (node.done) return;
    openKey = null;
    localChests = new Set([...localChests, node.key]);
    playSfx('chest');
    vibrate('success');
    fireConfettiEvent({ count: 90, origin: 'center' });
    try {
      await markVisited(node.key);
      await awardXP('path_chest', CHEST_XP);
      showToast(
        $t('caminho.chest.claimed', { values: { xp: CHEST_XP }, default: '🎁 Baú aberto! +{xp} XP' }),
        3000
      );
    } catch (e) {
      console.warn('[caminho] chest claim failed', e);
    }
  }

  // V10.4 — salta direto para o nó ATUAL (caminhos longos obrigavam a
  // scrollar unidades inteiras já feitas). Reage à mudança de currentKey
  // porque no mount os Sets do Dexie ainda vêm vazios — o nó "de hoje"
  // só se conhece quando o progresso chega.
  let lastScrollKey: string | null = null;
  $effect(() => {
    const key = currentKey;
    if (!key || key === lastScrollKey) return;
    lastScrollKey = key;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector('.caminho .node.current');
      if (!(el instanceof HTMLElement)) return;
      const r = el.getBoundingClientRect();
      if (r.top > window.innerHeight * 0.72 || r.top < 130) {
        el.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
    });
    return () => cancelAnimationFrame(raf);
  });

  // Anel de progresso do nó atual (progresso da unidade em curso).
  const RING_R = 44;
  const RING_C = 2 * Math.PI * RING_R;
  const ringPct = $derived.by<number>(() => {
    const seg = segments[currentUnitIndex];
    if (!seg || seg.nodes.length === 0) return 0;
    return seg.done / seg.nodes.length;
  });
</script>

<section class="caminho" aria-label={$t('caminho.aria', { default: 'Caminho do curso' })}>
  <!-- Cabeçalho de progresso -->
  <header class="summary card">
    <span class="mascot"><MascotAvatar mascot={mascotId} pose="point" size={76} eager /></span>
    <div class="summary-meta">
      <p class="kicker">{$t('caminho.tag', { default: '🗺️ O teu caminho' })}</p>
      <h1>{course.icon} {course.title}</h1>
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
    </div>
  </header>

  {#if progress && currentKey === null}
    <p class="all-done">{$t('caminho.done', { default: 'Curso completo — és absolutamente incrível! 🎉' })}</p>
  {/if}

  {#each segments as seg (seg.unit.slug)}
    <section class="unit-seg">
      <!-- Banner sticky da unidade (como o "Unit 3" do Duolingo) -->
      <div class="unit-banner" style="--unit-color: {seg.unit.color};">
        <div class="banner-copy">
          <strong>{seg.unit.icon} {seg.unit.title}</strong>
          <small>{seg.unit.summary}</small>
        </div>
        <a
          class="banner-open"
          href={`/escola/curso/${seg.unit.slug}/`}
          aria-label={$t('caminho.unit.open_aria', { values: { title: seg.unit.title }, default: 'Abrir a unidade {title}' })}
        >
          <span aria-hidden="true">📘</span>
        </a>
      </div>

      <ol class="path">
        {#each seg.nodes as node, i (node.key)}
          {@const isCurrent = node.key === currentKey}
          {@const isLocked = lockedKeys.has(node.key)}
          {@const isJumpHere = !isCurrent && seg.unitIndex === currentUnitIndex + 1 && i === 0}
          {@const offset = offsetFor(seg.unitIndex, i)}
          <li class="step" style="--offset: {offset}px;">
            {#if isCurrent}
              <span class="start-bubble" style="--unit-color: {seg.unit.color};" aria-hidden="true">
                {$t('caminho.node.start', { default: 'CONTINUAR' })}
              </span>
            {:else if isJumpHere}
              <span class="start-bubble jump" style="--unit-color: {seg.unit.color};" aria-hidden="true">
                {$t('caminho.jump', { default: 'SALTAR PARA AQUI?' })}
              </span>
            {/if}

            <button
              type="button"
              class="node"
              class:done={node.done}
              class:current={isCurrent}
              class:locked={isLocked}
              class:quiz={node.kind === 'quiz'}
              class:chest={node.kind === 'chest'}
              style="--unit-color: {seg.unit.color};"
              aria-expanded={openKey === node.key}
              aria-label={node.title}
              onclick={() => toggle(node.key)}
            >
              {#if isCurrent}
                <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
                  <circle class="ring-track" cx="50" cy="50" r={RING_R} />
                  <circle
                    class="ring-arc"
                    cx="50"
                    cy="50"
                    r={RING_R}
                    style="stroke-dasharray: {ringPct * RING_C} {RING_C};"
                  />
                </svg>
              {/if}
              <span class="node-face" aria-hidden="true">
                {#if node.done && node.kind === 'chest'}🎁
                {:else if node.done}✓
                {:else if isLocked && node.kind === 'lesson'}🔒
                {:else if node.kind === 'chest'}🎁
                {:else if node.kind === 'quiz'}🏆
                {:else}⭐{/if}
              </span>
            </button>

            {#if openKey === node.key}
              <!-- Popup do nó (Duolingo abre um cartão ao tocar) -->
              <div class="node-popup" style="--unit-color: {seg.unit.color};" role="dialog" aria-label={node.title}>
                <strong class="popup-title">{node.title}</strong>
                <small class="popup-sub">{seg.unit.title}</small>
                {#if node.kind === 'chest'}
                  {#if node.done}
                    <span class="popup-done-note">{$t('caminho.chest.done', { default: 'Já recolheste este baú. ✨' })}</span>
                  {:else}
                    <button type="button" class="popup-cta" onclick={() => void claimChest(node)}>
                      {$t('caminho.chest.open', { values: { xp: CHEST_XP }, default: 'Abrir baú +{xp} XP' })}
                    </button>
                  {/if}
                {:else}
                  <a class="popup-cta" href={node.href} data-sveltekit-preload-data>
                    {node.done
                      ? $t('caminho.popup.review', { default: 'Rever' })
                      : $t('caminho.popup.start', { default: 'Começar' })}
                  </a>
                {/if}
              </div>
            {/if}

            <!-- Mascote em grande nas margens (decorativo, como o Duo) -->
            {#if i % 7 === 3}
              <span class="cheer-pig" class:flip={offset > 0} aria-hidden="true">
                <MascotAvatar
                  mascot={mascotId}
                  pose={isLocked ? 'sleep' : cheerPose(seg.unitIndex, i)}
                  size={92}
                  animate={!isLocked}
                  flip={offset > 0}
                />
              </span>
            {/if}
          </li>
        {/each}
      </ol>
    </section>
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
    align-items: center;
    padding: 1rem 1.2rem;
    background: var(--card, rgba(255, 255, 255, 0.055));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.11));
    border-radius: var(--radius-xl, 1.25rem);
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
    margin: 0.15rem 0 0.35rem;
    color: var(--txt, #fff);
    font-size: var(--fs-lg, 1.3rem);
  }
  .summary-stats { display: flex; gap: 0.9rem; flex-wrap: wrap; }
  .stat strong { display: block; color: var(--txt, #fff); font-variant-numeric: tabular-nums; }
  .stat small { color: var(--txt3); font-size: var(--fs-xs, 0.72rem); }
  .all-done {
    margin: 1rem 0 0;
    padding: 0.85rem 1rem;
    text-align: center;
    color: var(--txt, #fff);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    border-radius: var(--radius-lg, 1rem);
  }

  /* ---- Segmento + banner sticky ---- */
  .unit-seg {
    position: relative;
  }
  .unit-banner {
    position: sticky;
    top: calc(64px + 0.4rem);
    z-index: 6;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    margin-top: 1.3rem;
    padding: 0.85rem 1rem;
    border-radius: var(--radius-lg, 1rem);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--unit-color, var(--accent)) 80%, #000 4%),
      color-mix(in srgb, var(--unit-color, var(--accent)) 58%, #000 14%)
    );
    color: #fff;
    box-shadow: 0 8px 22px rgba(2, 6, 23, 0.35);
  }
  .banner-copy { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .banner-copy strong { font-size: var(--fs-md, 1rem); }
  .banner-copy small {
    opacity: 0.9;
    font-size: var(--fs-xs, 0.74rem);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .banner-open {
    flex: none;
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border: 2px solid rgba(255, 255, 255, 0.5);
    border-bottom-width: 4px;
    border-radius: 0.85rem;
    color: #fff;
    font-size: 1.25rem;
    text-decoration: none;
  }
  .banner-open:active { transform: translateY(2px); border-bottom-width: 2px; }
  .banner-open:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

  /* ---- Caminho ---- */
  .path {
    list-style: none;
    margin: 1rem 0 0;
    padding: 0.4rem 0 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    align-items: center;
  }
  .step {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    transform: translateX(var(--offset, 0px));
  }

  .start-bubble {
    position: absolute;
    top: -2.3rem;
    padding: 0.38rem 0.85rem;
    border: 2px solid var(--border, rgba(255, 255, 255, 0.2));
    border-radius: 0.7rem;
    background: var(--card, #22314f);
    color: var(--unit-color, var(--accent));
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.06em;
    white-space: nowrap;
    animation: bubble-bounce 1s ease-in-out infinite;
    z-index: 3;
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

  /* Nó: botão redondo "3D" (border-bottom mais escura que afunda). */
  .node {
    position: relative;
    display: grid;
    place-items: center;
    width: 66px;
    height: 66px;
    padding: 0;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    background: var(--bg-elev, rgba(255, 255, 255, 0.09));
    border-bottom: 7px solid color-mix(in srgb, var(--bg-elev, #1a2540) 55%, #000 30%);
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
    font-size: 1.6rem;
    line-height: 1;
    color: rgba(255, 255, 255, 0.85);
  }
  .node.done {
    background: #ffc800;
    border-bottom-color: #cf9e00;
  }
  .node.done .node-face {
    color: #7a5c00;
    font-weight: 900;
    font-size: 1.9rem;
  }
  .node.current {
    background: var(--unit-color, var(--accent));
    border-bottom-color: color-mix(in srgb, var(--unit-color, var(--accent)) 68%, #000 26%);
  }
  .node.current .node-face { color: #fff; }
  .node.locked {
    opacity: 0.42;
    filter: grayscale(0.75);
  }
  .node.locked .node-face { font-size: 1.25rem; }
  .node.quiz { width: 76px; height: 76px; }
  .node.chest {
    background: transparent;
    border-bottom-color: transparent;
  }
  .node.chest .node-face { font-size: 2.4rem; }
  .node.chest.locked { opacity: 0.42; }

  /* Anel de progresso da unidade à volta do nó atual. */
  .ring {
    position: absolute;
    inset: -9px;
    width: calc(100% + 18px);
    height: calc(100% + 18px);
    transform: rotate(-90deg);
    pointer-events: none;
  }
  .ring-track {
    fill: none;
    stroke: color-mix(in srgb, var(--txt, #fff) 14%, transparent);
    stroke-width: 7;
  }
  .ring-arc {
    fill: none;
    stroke: var(--unit-color, var(--accent));
    stroke-width: 7;
    stroke-linecap: round;
    transition: stroke-dasharray 400ms ease;
  }

  /* Popup do nó */
  .node-popup {
    position: absolute;
    top: calc(100% + 10px);
    z-index: 7;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: min(250px, 74vw);
    padding: 0.85rem 0.95rem;
    border-radius: 0.9rem;
    background: color-mix(in srgb, var(--unit-color, var(--accent)) 82%, #000 8%);
    color: #fff;
    box-shadow: 0 14px 34px rgba(2, 6, 23, 0.45);
    animation: popup-in var(--motion-fast, 140ms) ease;
    text-align: center;
  }
  .node-popup::before {
    content: '';
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-bottom-color: color-mix(in srgb, var(--unit-color, var(--accent)) 82%, #000 8%);
    border-top: 0;
  }
  @keyframes popup-in {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .popup-title { font-size: var(--fs-sm, 0.92rem); line-height: 1.25; }
  .popup-sub { opacity: 0.85; font-size: var(--fs-xs, 0.72rem); }
  .popup-done-note { font-size: var(--fs-xs, 0.76rem); opacity: 0.9; padding: 0.3rem 0; }
  .popup-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    margin-top: 0.35rem;
    padding: 0 1rem;
    border: none;
    border-radius: 0.7rem;
    background: #fff;
    color: color-mix(in srgb, var(--unit-color, var(--accent)) 80%, #000 12%);
    font-weight: 900;
    font-size: var(--fs-sm, 0.85rem);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    text-decoration: none;
    cursor: pointer;
    border-bottom: 4px solid rgba(0, 0, 0, 0.18);
  }
  .popup-cta:active { transform: translateY(2px); border-bottom-width: 2px; }
  .popup-cta:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

  /* Posicionamento FÍSICO (left/right) de propósito: o offset serpentina é
     um translateX físico e o flip também — com inset-inline, em RTL (ar) a
     personagem mudava de lado, ficava de costas para o nó e podia sair do
     ecrã. Físico alinha com o offset em ambas as direções. */
  .cheer-pig {
    position: absolute;
    top: -6px;
    left: calc(50% + 78px);
    opacity: 0.95;
    pointer-events: none;
  }
  .cheer-pig.flip {
    left: auto;
    right: calc(50% + 78px);
  }

  @media (max-width: 420px) {
    .step { transform: translateX(calc(var(--offset, 0px) * 0.6)); }
    .cheer-pig { left: calc(50% + 58px); }
    .cheer-pig.flip { left: auto; right: calc(50% + 58px); }
  }
</style>
