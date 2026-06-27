<script lang="ts">
  import { page } from '$app/state';
  import LessonRunner from '$lib/components/LessonRunner.svelte';

  // Lesson detail route. Just wraps LessonRunner with the URL params.
  // The component fetches /lessons/<course>/<lesson>.json.

  let courseSlug = $derived(page.params.courseSlug ?? '');
  let lessonSlug = $derived(page.params.lessonSlug ?? '');

  // SEO — used by <svelte:head> below.  The lesson title resolves
  // inside LessonRunner once the JSON loads, but for crawlers we want
  // a stable slug-based title on first paint.
  let pageTitle = $derived(`${lessonSlug} · Lição · Escola`);
  let description = $derived('Conteúdo da lição');
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content="https://presuntinho.netlify.app/escola/licao/" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={description} />
</svelte:head>

<LessonRunner {courseSlug} {lessonSlug} />
