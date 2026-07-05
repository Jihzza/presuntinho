<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { ARCADE_GAMES, highScoreKey, lastScoreKey, readArcadeScore } from '$lib/arcade/games';

  let highScores = $state<Record<string, number>>({});
  let lastScores = $state<Record<string, number>>({});

  onMount(() => {
    const highs: Record<string, number> = {};
    const lasts: Record<string, number> = {};
    for (const game of ARCADE_GAMES) {
      highs[game.id] = readArcadeScore(highScoreKey(game.id));
      lasts[game.id] = readArcadeScore(lastScoreKey(game.id));
    }
    highScores = highs;
    lastScores = lasts;
  });
</script>

<svelte:head>
  <title>{$t('arcade.meta.title', { default: 'Sala Arcade Secreta' })} · Presuntinho</title>
  <meta name="description" content={$t('arcade.meta.description', { default: 'Jogos arcade secretos do Presuntinho, com pontuações locais e controlos mobile.' })} />
</svelte:head>

<div class="arcade-room">
  <header class="hero">
    <a class="back" href="/">{$t('arcade.back.home', { default: '← Home' })}</a>
    <span class="tag">{$t('arcade.hero.tag', { default: 'Secret Room' })}</span>
    <h1>{$t('arcade.hero.title', { default: 'Sala Arcade Secreta' })}</h1>
    <p>{$t('arcade.hero.body', { default: 'Uma sala escondida com jogos rápidos, pontuação local e controlos pensados para telemóvel e desktop.' })}</p>
    <div class="summary" aria-label={$t('arcade.summary.aria', { default: 'Resumo da sala arcade' })}>
      <span><strong>{ARCADE_GAMES.length}</strong><small>{$t('arcade.summary.games', { default: 'Jogos' })}</small></span>
      <span><strong>{Object.values(highScores).reduce((a, b) => a + b, 0)}</strong><small>{$t('arcade.summary.points', { default: 'Pontos recorde' })}</small></span>
      <span><strong>{$t('arcade.summary.local', { default: 'Local' })}</strong><small>{$t('arcade.summary.storage', { default: 'Pontuações' })}</small></span>
    </div>
  </header>

  <section class="games" aria-label={$t('arcade.games.aria', { default: 'Jogos disponíveis' })}>
    <div class="section-head">
      <div>
        <h2>{$t('arcade.games.title', { default: 'Escolhe uma máquina' })}</h2>
        <p>{$t('arcade.games.body', { default: 'Todos os jogos são jogáveis dentro da app. Não há placeholders.' })}</p>
      </div>
    </div>

    <div class="grid">
      {#each ARCADE_GAMES as game (game.id)}
        <a class="game-card" href={game.href} data-sveltekit-preload-data>
          <span class="machine" aria-hidden="true">{game.icon}</span>
          <div>
            <p class="kicker">{$t(game.difficultyKey)}</p>
            <h3>{$t(game.titleKey)}</h3>
            <p>{$t(game.descriptionKey)}</p>
            <div class="scores">
              <span>{$t('arcade.score.best_with_value', { values: { score: highScores[game.id] ?? 0 }, default: 'Melhor: {score}' })}</span>
              <span>{$t('arcade.score.last_with_value', { values: { score: lastScores[game.id] ?? 0 }, default: 'Última: {score}' })}</span>
            </div>
            <strong>{$t('arcade.actions.play_now', { default: 'Jogar →' })}</strong>
          </div>
        </a>
      {/each}
    </div>
  </section>

  <section class="note" aria-label={$t('arcade.ip.aria', { default: 'Nota sobre jogos originais' })}>
    <h2>{$t('arcade.ip.title', { default: 'Clássicos, mas originais' })}</h2>
    <p>{$t('arcade.ip.body', { default: 'A sala usa mecânicas arcade clássicas com nomes, visuais e personagens próprios do Presuntinho.' })}</p>
  </section>
</div>

<style>
  .arcade-room { max-width: 1120px; margin: 0 auto; padding: 1rem 1rem 8rem; color: var(--txt, #fff); }
  .hero, .game-card, .note { border: 1px solid rgba(103,232,249,.22); border-radius: 1.5rem; background: rgba(255,255,255,.055); box-shadow: 0 18px 52px rgba(0,0,0,.24); }
  .hero { padding: 1.25rem; background: radial-gradient(circle at 10% 10%, rgba(236,72,153,.28), transparent 34%), radial-gradient(circle at 90% 20%, rgba(34,211,238,.22), transparent 34%), rgba(255,255,255,.055); }
  .back { display: inline-flex; margin-bottom: .8rem; color: #bfdbfe; text-decoration: none; font-weight: 850; }
  .tag, .kicker { color: #67e8f9; text-transform: uppercase; letter-spacing: .09em; font-size: .72rem; font-weight: 900; }
  h1 { margin: .35rem 0; font-size: clamp(2.4rem, 10vw, 4.8rem); line-height: .95; }
  .hero p, .section-head p, .game-card p, .note p { color: var(--txt2); line-height: 1.55; margin: 0; }
  .summary { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: .6rem; margin-top: 1rem; }
  .summary span { padding: .75rem; border-radius: 1rem; background: rgba(0,0,0,.22); border: 1px solid rgba(255,255,255,.1); }
  .summary strong, .summary small { display: block; } .summary small { color: var(--txt3); font-size: .75rem; }
  .games { margin-top: 1.2rem; }
  .section-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; margin-bottom: .85rem; }
  .section-head h2, .note h2 { margin: 0 0 .25rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: .85rem; }
  .game-card { display: grid; grid-template-columns: auto 1fr; gap: .85rem; min-height: 170px; padding: 1rem; color: #fff; text-decoration: none; transition: transform 140ms ease, border-color 140ms ease, background 140ms ease; }
  .game-card:hover, .game-card:focus-visible { transform: translateY(-2px); border-color: rgba(103,232,249,.54); background: rgba(255,255,255,.085); outline: none; }
  .machine { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 1rem; background: linear-gradient(135deg, rgba(236,72,153,.28), rgba(34,211,238,.22)); font-size: 1.8rem; }
  .game-card h3 { margin: .15rem 0 .35rem; font-size: 1.15rem; }
  .scores { display: flex; flex-wrap: wrap; gap: .4rem; margin: .75rem 0; }
  .scores span { padding: .25rem .5rem; border-radius: 999px; background: rgba(255,255,255,.09); color: var(--txt2); font-size: .78rem; }
  .game-card strong { color: #bfdbfe; }
  .note { margin-top: 1rem; padding: 1rem; }
  @media (max-width: 520px) { .arcade-room { padding-inline: .75rem; } .summary { grid-template-columns: 1fr; } .game-card { grid-template-columns: 1fr; } }
</style>
