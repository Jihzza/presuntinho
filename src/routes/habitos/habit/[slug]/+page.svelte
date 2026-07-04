<!--
  /habitos/habit/[slug] — RETIRED (V8).

  The habit detail experience now lives inline on /habitos (calendar,
  stats, edit form per habit), so this orphan route redirects there.
  The file is kept as a stub so old bookmarks / PWA history entries
  don't 404.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';

  onMount(() => {
    void goto('/habitos/', { replaceState: true });
  });
</script>

<svelte:head>
  <title>{$t('routes.habitos.title', { default: 'Hábitos · Daily Check-in' })} · Presuntinho</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="redirect">
  <p>{$t('habitos.habit.redirect', { default: 'Esta página mudou-se — a levar-te para os Hábitos…' })}</p>
  <a href="/habitos/">{$t('habitos.habit.back.voltar', { default: '← Voltar aos hábitos' })}</a>
</div>

<style>
  .redirect {
    max-width: 560px;
    margin: 3rem auto;
    padding: 1.5rem 1rem;
    text-align: center;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 0.75rem);
    color: var(--txt2);
  }
  .redirect p {
    margin: 0 0 0.75rem 0;
  }
  .redirect a {
    color: var(--accent);
    text-decoration: none;
  }
  .redirect a:hover,
  .redirect a:focus-visible {
    text-decoration: underline;
  }
</style>
