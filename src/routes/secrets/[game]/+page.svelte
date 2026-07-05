<script lang="ts">
  import { page } from '$app/state';
  import { t } from 'svelte-i18n';
  import ArcadeGame from '$lib/components/arcade/ArcadeGame.svelte';
  import { getArcadeGame } from '$lib/arcade/games';

  const game = $derived(getArcadeGame(page.params.game));
</script>

<svelte:head>
  <title>{game ? $t(game.titleKey) : $t('arcade.not_found.title', { default: 'Jogo não encontrado' })} · Presuntinho</title>
</svelte:head>

{#if game}
  <ArcadeGame {game} />
{:else}
  <section class="missing">
    <a href="/secrets/">{$t('arcade.game.back', { default: '← Voltar à sala' })}</a>
    <h1>{$t('arcade.not_found.title', { default: 'Jogo não encontrado' })}</h1>
    <p>{$t('arcade.not_found.body', { default: 'Esta máquina ainda não existe na sala arcade.' })}</p>
  </section>
{/if}

<style>
  .missing { max-width: 760px; margin: 0 auto; padding: 2rem 1rem 8rem; color: var(--txt, #fff); }
  .missing a { color: #bfdbfe; font-weight: 850; text-decoration: none; }
  .missing h1 { font-size: clamp(2rem, 8vw, 3.8rem); }
  .missing p { color: var(--txt2); }
</style>
