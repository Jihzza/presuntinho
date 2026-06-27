<script lang="ts">
  import { page } from '$app/state';
  import LessonRunner from '$lib/components/LessonRunner.svelte';

  // Lesson detail route. Just wraps LessonRunner with the URL params.
  // The component fetches /lessons/<course>/<lesson>.json.

  let courseSlug = $derived(page.params.courseSlug ?? '');
  let lessonSlug = $derived(page.params.lessonSlug ?? '');
</script>

<svelte:head>
  <title>{lessonSlug} · {courseSlug} · Escola</title>
</svelte:head>

<LessonRunner {courseSlug} {lessonSlug} />
