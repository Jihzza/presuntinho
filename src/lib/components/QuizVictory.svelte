<script lang="ts">
  /**
   * QuizVictory — full-screen celebratory overlay (V9 Duolingo layer).
   *
   * Shown by QuizRunner right after a submit (variant 'quiz') and by
   * LessonRunner on the FIRST completion of a lesson (variant 'lesson').
   * Sits at z-index 9000 — below the toast layer (9999) so XP toasts
   * remain visible on top of the celebration.
   *
   * Confetti for PERFECT scores fires here (moved out of
   * QuizRunner.submit() so it never double-fires); the count comes from
   * the caller so the PT-quiz 80-piece burst is preserved.
   *
   * Motion (ring sweep, mascot bounce, pulse) relies on the global
   * prefers-reduced-motion kill-switch in app.css — no per-file blocks.
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { fireConfettiEvent } from '$lib/components/events';
  import { getActivityStreak, getWeekActivity, type WeekDayActivity } from '$lib/gamification/streak';
  import { getActiveMascot, DEFAULT_MASCOT_ID } from '$lib/gamification/mascots';
  import MascotAvatar from './MascotAvatar.svelte';
  import { playSfx, vibrate } from '$lib/gamification/sound';
  import WeekCircles from './WeekCircles.svelte';
  import { nextLesson, type NextLessonTarget } from '$lib/escola/progress';
  import { schoolCourses, courseForUnit } from '$lib/escola/catalog';

  interface Props {
    variant?: 'quiz' | 'lesson';
    correct?: number;
    total?: number;
    /** XP paid for this result (renders the '+N XP' chip when > 0). */
    xp?: number;
    /** Confetti burst size for a perfect score (80 for the PT quiz). */
    confettiCount?: number;
    /** Catalog course OR unit slug — powers the 'Próxima lição' CTA. */
    courseSlug?: string;
    /** How many answers were wrong — enables the 'Rever erros' CTA. */
    wrongCount?: number;
    /** Close the overlay (reveals QuizRunner's inline review below). */
    onclose?: () => void;
    /** 'Tentar novamente' (quiz variant). */
    onretry?: () => void;
    /** 'Continuar' (lesson variant) — runs the pending navigation. */
    oncontinue?: () => void;
  }

  let {
    variant = 'quiz',
    correct = 0,
    total = 0,
    xp = 0,
    confettiCount = 60,
    courseSlug,
    wrongCount = 0,
    onclose,
    onretry,
    oncontinue
  }: Props = $props();

  let percent = $derived(total > 0 ? Math.round((correct / total) * 100) : 0);
  let perfect = $derived(variant === 'quiz' && total > 0 && correct === total);
  let tier = $derived<'perfect' | 'good' | 'low'>(
    perfect ? 'perfect' : percent >= 70 ? 'good' : 'low'
  );

  let streakDays = $state(0);
  let week = $state<WeekDayActivity[]>([]);
  let perfectWeek = $derived(week.length === 7 && week.every((d) => d.active || d.frozen));
  let mascotId = $state(DEFAULT_MASCOT_ID);
  let next = $state<NextLessonTarget | null>(null);
  let mounted = $state(false);
  let primaryEl = $state<HTMLElement | null>(null);

  // SVG accuracy ring geometry.
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  let dash = $derived(mounted ? (percent / 100) * CIRC : 0);

  /** Map a unit slug (e.g. 'marketing-digital') to its catalog course. */
  function resolveCourseSlug(slug: string | undefined): string | null {
    if (!slug) return null;
    if (schoolCourses.some((c) => c.slug === slug)) return slug;
    return courseForUnit(slug)?.slug ?? null;
  }

  onMount(() => {
    // Perfect-only celebration confetti — single fire point (the old
    // QuizRunner.submit() call was removed to avoid double bursts).
    if (perfect) fireConfettiEvent(confettiCount);

    // V10 — tiered sound + haptics: triumphant on perfect/lesson, bright on
    // good, deliberately soft on low (mistakes must never feel punished).
    if (perfect || variant === 'lesson') {
      playSfx('fanfare');
      vibrate('success');
    } else if (tier === 'good') {
      playSfx('correct');
      vibrate('tap');
    } else {
      playSfx('wrong');
    }

    void (async () => {
      try {
        const s = await getActivityStreak();
        streakDays = s.current;
      } catch (e) {
        console.warn('[quizvictory] streak read failed', e);
      }
      try {
        week = await getWeekActivity();
      } catch (e) {
        console.warn('[quizvictory] week read failed', e);
      }
      try {
        mascotId = (await getActiveMascot()).id;
      } catch (e) {
        console.warn('[quizvictory] mascot read failed', e);
      }
      const target = resolveCourseSlug(courseSlug);
      if (target) {
        try {
          next = await nextLesson(target);
        } catch (e) {
          console.warn('[quizvictory] next-lesson read failed', e);
        }
      }
    })();

    // Trigger the ring sweep on the next frame so the transition runs.
    const raf = requestAnimationFrame(() => {
      mounted = true;
      primaryEl?.focus();
    });
    return () => cancelAnimationFrame(raf);
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (variant === 'lesson') oncontinue?.();
      else onclose?.();
    }
  }

  let title = $derived(
    variant === 'lesson'
      ? $t('quizvictory.title.lesson', { default: 'Lição concluída! 🎉' })
      : tier === 'perfect'
        ? $t('quizvictory.title.perfect', { default: 'Perfeito! 🏆' })
        : tier === 'good'
          ? $t('quizvictory.title.good', { default: 'Muito bem! 🌟' })
          : $t('quizvictory.title.low', { default: 'Boa tentativa! 💪' })
  );

  let mascotLine = $derived(
    variant === 'lesson'
      ? $t('quizvictory.mascot.lesson', { default: 'Mais uma lição no bolso — estou tão orgulhoso de ti!' })
      : tier === 'perfect'
        ? $t('quizvictory.mascot.perfect', { default: 'UAU! Nota máxima — mereces uma festa! 🎊' })
        : tier === 'good'
          ? $t('quizvictory.mascot.good', { default: 'Estás quase lá — que orgulho ver-te a crescer!' })
          : $t('quizvictory.mascot.low', { default: 'Cada tentativa ensina algo novo. Vamos rever juntas? 💕' })
  );
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="victory-overlay"
  role="dialog"
  aria-modal="true"
  aria-label={$t('quizvictory.aria', { default: 'Resultado' })}
>
  <div class="victory-card" class:perfect>
    <div class="mascot" aria-hidden="true">
      <!-- Lição concluída celebra SEMPRE (o tier 'low' vem do total=0);
           só um quiz fraco merece a pose pensativa. -->
      <MascotAvatar mascot={mascotId} pose={variant === 'quiz' && tier === 'low' ? 'think' : 'cheer'} size={96} eager />
    </div>
    <h2 class="v-title">{title}</h2>
    <p class="mascot-line">{mascotLine}</p>

    {#if variant === 'quiz' && total > 0}
      <div class="ring-wrap" role="img" aria-label={$t('quizvictory.accuracy_aria', { values: { percent }, default: 'Precisão: {percent}%' })}>
        <svg viewBox="0 0 128 128" class="ring" aria-hidden="true">
          <circle class="ring-track" cx="64" cy="64" r={R} />
          <circle
            class="ring-fill"
            cx="64"
            cy="64"
            r={R}
            style="stroke-dasharray: {dash} {CIRC};"
          />
        </svg>
        <div class="ring-center">
          <strong class="ring-percent">{percent}%</strong>
          <small class="ring-score">{$t('quizvictory.score', { values: { correct, total }, default: '{correct} de {total}' })}</small>
        </div>
      </div>
    {/if}

    <div class="chips">
      {#if xp > 0}
        <span class="chip chip-xp">⚡ {$t('quizvictory.xp_chip', { values: { xp }, default: '+{xp} XP' })}</span>
      {/if}
      {#if streakDays > 0}
        <span class="chip chip-streak">🔥 {$t('quizvictory.streak', { values: { n: streakDays }, default: '{n} dias seguidos' })}</span>
      {/if}
    </div>

    {#if week.length > 0}
      <div class="week-row">
        <WeekCircles {week} compact />
        {#if perfectWeek}
          <small class="perfect-week">
            ✨ {$t('quizvictory.perfect_week', { default: 'Semana perfeita!' })}
          </small>
        {/if}
      </div>
    {/if}

    <div class="ctas">
      {#if variant === 'lesson'}
        <button
          type="button"
          class="cta primary"
          bind:this={primaryEl}
          onclick={() => oncontinue?.()}
        >{$t('quizvictory.cta.continue', { default: 'Continuar →' })}</button>
      {:else}
        {#if next}
          <a class="cta primary" href={next.href} bind:this={primaryEl}>
            {$t('quizvictory.cta.next', { default: 'Próxima lição →' })}
          </a>
        {:else}
          <a class="cta primary" href="/escola/" bind:this={primaryEl}>
            {$t('quizvictory.cta.escola', { default: '← Escola' })}
          </a>
        {/if}
        {#if wrongCount > 0}
          <button type="button" class="cta" onclick={() => onclose?.()}>
            {$t('quizvictory.cta.review', { values: { n: wrongCount }, default: 'Rever erros ({n})' })}
          </button>
        {:else}
          <button type="button" class="cta" onclick={() => onclose?.()}>
            {$t('quizvictory.cta.close', { default: 'Fechar' })}
          </button>
        {/if}
        <button type="button" class="cta ghost" onclick={() => onretry?.()}>
          {$t('quizvictory.cta.retry', { default: 'Tentar novamente' })}
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .victory-overlay {
    position: fixed;
    inset: 0;
    /* Below the toast layer (9999) so XP toasts stay visible. */
    z-index: 9000;
    display: grid;
    place-items: center;
    padding: var(--space-4, 1rem);
    background: color-mix(in srgb, var(--bg, #0b1020) 78%, transparent);
    backdrop-filter: blur(6px);
    animation: victory-fade var(--motion-base, 220ms) ease both;
  }
  @keyframes victory-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .week-row {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.7rem;
  }
  .perfect-week {
    color: var(--accent, #ec4899);
    font-weight: 700;
    font-size: var(--fs-xs, 0.78rem);
  }
  .victory-card {
    width: min(430px, 100%);
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    text-align: center;
    padding: 1.6rem 1.4rem 1.4rem;
    background: var(--card, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-xl, 1.25rem);
    box-shadow: var(--shadow-lg, 0 18px 48px rgba(2, 6, 23, 0.28));
    animation: victory-pop var(--motion-base, 220ms) ease both;
  }
  .victory-card.perfect {
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
    box-shadow: var(--shadow-lg, 0 18px 48px rgba(2, 6, 23, 0.28)),
      0 0 44px color-mix(in srgb, var(--accent) 22%, transparent);
  }
  @keyframes victory-pop {
    from { opacity: 0; transform: translateY(14px) scale(0.96); }
    to { opacity: 1; transform: none; }
  }
  .mascot {
    font-size: 3.2rem;
    line-height: 1;
    animation: mascot-cheer 900ms ease both;
  }
  @keyframes mascot-cheer {
    0% { transform: scale(0.4) rotate(-12deg); opacity: 0; }
    55% { transform: scale(1.18) rotate(6deg); opacity: 1; }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  .v-title {
    margin: 0.5rem 0 0.2rem;
    color: var(--txt, #fff);
    font-size: var(--fs-xl, 1.5rem);
  }
  .mascot-line {
    margin: 0 auto 0.75rem;
    max-width: 32ch;
    color: var(--txt2);
    font-size: var(--fs-sm, 0.9rem);
    line-height: 1.45;
  }
  .ring-wrap {
    position: relative;
    width: 128px;
    height: 128px;
    margin: 0.25rem auto 0.5rem;
  }
  .ring { width: 100%; height: 100%; transform: rotate(-90deg); }
  .ring-track,
  .ring-fill {
    fill: none;
    stroke-width: 10;
    stroke-linecap: round;
  }
  .ring-track { stroke: var(--bg-elev, rgba(255, 255, 255, 0.1)); }
  .ring-fill {
    stroke: var(--accent);
    transition: stroke-dasharray 900ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ring-center {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    gap: 0.1rem;
  }
  .ring-percent {
    color: var(--txt, #fff);
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
  }
  .ring-score { color: var(--txt3); font-size: var(--fs-xs, 0.75rem); }
  .chips {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin: 0.35rem 0 1rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: var(--bg-elev, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    color: var(--txt2);
    font-size: var(--fs-sm, 0.85rem);
    font-weight: 700;
  }
  .chip-xp {
    color: var(--on-accent, #fff);
    background: var(--accent);
    border-color: transparent;
  }
  .ctas {
    display: grid;
    gap: 0.55rem;
  }
  .cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0.65rem 1.1rem;
    border-radius: var(--radius-md, 0.6rem);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.16));
    background: var(--bg-elev, rgba(255, 255, 255, 0.05));
    color: var(--txt, #fff);
    font: inherit;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
    transition: transform var(--motion-fast, 120ms) ease, background var(--motion-fast, 120ms) ease;
  }
  .cta:hover { transform: translateY(-1px); }
  .cta:focus-visible { outline: none; box-shadow: var(--focus-ring, 0 0 0 2px var(--accent)); }
  .cta.primary {
    background: var(--accent);
    border-color: transparent;
    color: var(--on-accent, #fff);
  }
  .cta.ghost {
    background: transparent;
    color: var(--txt2);
  }
</style>
