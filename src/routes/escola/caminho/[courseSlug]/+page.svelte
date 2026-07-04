<script lang="ts">
  /**
   * /escola/caminho/[courseSlug] — Duolingo-style course path (V9).
   *
   * Loads the localized catalog course + Dexie progress (onMount,
   * browser-only, via the escola progress helpers), the global activity
   * streak and the active mascot, then renders CaminhoPath.
   */
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { t } from 'svelte-i18n';
  import CaminhoPath from '$lib/components/CaminhoPath.svelte';
  import { localizedSchoolCourses } from '$lib/escola/catalog';
  import {
    courseProgress,
    nextLesson,
    loadVisitedLessons,
    loadPathChests,
    getQuizHistory,
    type CourseProgress,
    type NextLessonTarget
  } from '$lib/escola/progress';
  import { getActivityStreak, type ActivityStreak } from '$lib/gamification/streak';
  import { getActiveMascot, DEFAULT_MASCOT_ID, mascotById } from '$lib/gamification/mascots';

  let courseSlug = $derived(page.params.courseSlug ?? '');
  let course = $derived(localizedSchoolCourses($t).find((c) => c.slug === courseSlug) ?? null);

  let progress = $state<CourseProgress | null>(null);
  let next = $state<NextLessonTarget | null>(null);
  let streak = $state<ActivityStreak | null>(null);
  let mascotEmoji = $state(mascotById(DEFAULT_MASCOT_ID)?.emoji ?? '🧴');
  let visitedLessons = $state<Set<string>>(new Set());
  let quizDone = $state<Set<string>>(new Set());
  let claimedChests = $state<Set<string>>(new Set());
  let loaded = $state(false);

  onMount(() => {
    void (async () => {
      try {
        const [p, n, s, m, visited, chests] = await Promise.all([
          courseProgress(courseSlug),
          nextLesson(courseSlug),
          getActivityStreak(),
          getActiveMascot(),
          loadVisitedLessons(),
          loadPathChests()
        ]);
        progress = p;
        next = n;
        streak = s;
        mascotEmoji = m.emoji;
        visitedLessons = new Set(visited.keys());
        claimedChests = chests;

        // Quizzes com pelo menos uma tentativa → nó de teste "feito".
        const quizSlugs = [
          ...new Set(
            [...(course?.units ?? []), ...(course?.extras ?? [])]
              .flatMap((u) => u.lessons.map((l) => l.quizSlug))
              .filter((q): q is string => Boolean(q))
          )
        ];
        const histories = await Promise.all(quizSlugs.map((q) => getQuizHistory(q)));
        const done = new Set<string>();
        quizSlugs.forEach((q, i) => {
          const h = histories[i];
          if (h && h.attempts > 0) done.add(q);
        });
        quizDone = done;
      } catch (e) {
        console.error('[caminho] load failed', e);
      } finally {
        loaded = true;
      }
    })();
  });

  let pageTitle = $derived(
    course
      ? `${course.title} · ${$t('caminho.seo.title', { default: 'Caminho' })}`
      : $t('caminho.seo.title', { default: 'Caminho' })
  );
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta name="description" content={$t('caminho.seo.description', { default: 'O teu caminho de lições, passo a passo' })} />
</svelte:head>

<div class="caminho-page">
  <p class="breadcrumb">
    <a href="/escola/">{$t('caminho.back', { default: '← Escola' })}</a>
    {#if course}
      <span class="sep">›</span>
      <a href={course.href}>{course.title}</a>
      <span class="sep">›</span>
      <span>{$t('caminho.breadcrumb.current', { default: 'Caminho' })}</span>
    {/if}
  </p>

  {#if course}
    <CaminhoPath {course} {progress} {next} {streak} {mascotEmoji} {visitedLessons} {quizDone} {claimedChests} />
    {#if !loaded}
      <p class="loading">{$t('common.loading', { default: 'A carregar…' })}</p>
    {/if}
  {:else}
    <div class="notfound card">
      <p>{$t('caminho.notfound', { default: 'Hmm, não encontrei esse curso. 🐷' })}</p>
      <a class="notfound-cta" href="/escola/">{$t('caminho.back', { default: '← Escola' })}</a>
    </div>
  {/if}
</div>

<style>
  .caminho-page {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.25rem 1rem 8rem;
  }
  .breadcrumb {
    color: var(--txt3);
    font-size: var(--fs-sm, 0.85rem);
    margin: 0 0 1rem;
  }
  .breadcrumb a {
    color: var(--accent);
    text-decoration: none;
    display: inline-block;
    padding: 0.35rem 0;
  }
  .breadcrumb a:hover,
  .breadcrumb a:focus-visible { text-decoration: underline; outline: none; }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }
  .loading {
    text-align: center;
    color: var(--txt2);
    padding: 1rem 0;
  }
  .notfound {
    text-align: center;
    padding: 2rem 1.25rem;
    color: var(--txt2);
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px dashed var(--border, rgba(255, 255, 255, 0.14));
    border-radius: var(--radius-lg, 1rem);
  }
  .notfound-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    margin-top: 0.75rem;
    padding: 0.6rem 1.2rem;
    border-radius: var(--radius-md, 0.6rem);
    background: var(--accent);
    color: var(--on-accent, #fff);
    text-decoration: none;
    font-weight: 700;
  }
  .notfound-cta:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring, 0 0 0 2px var(--accent));
  }
</style>
