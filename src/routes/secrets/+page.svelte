<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import {
    ARCADE_GAMES,
    highScoreKey,
    lastScoreKey,
    readArcadeScore,
    type ArcadeGameDefinition
  } from '$lib/arcade/games';

  let highScores = $state<Record<string, number>>({});
  let lastScores = $state<Record<string, number>>({});
  let loaded = $state(false);
  let featured = $state<ArcadeGameDefinition>(ARCADE_GAMES[0]);

  const totalRecordPoints = $derived(Object.values(highScores).reduce((a, b) => a + b, 0));
  const machinesPlayed = $derived(Object.values(highScores).filter((v) => v > 0).length);
  const anyPlayed = $derived(machinesPlayed > 0);

  function isNew(id: string): boolean {
    return (highScores[id] ?? 0) === 0 && (lastScores[id] ?? 0) === 0;
  }

  onMount(() => {
    const highs: Record<string, number> = {};
    const lasts: Record<string, number> = {};
    for (const game of ARCADE_GAMES) {
      highs[game.id] = readArcadeScore(highScoreKey(game.id));
      lasts[game.id] = readArcadeScore(lastScoreKey(game.id));
    }
    highScores = highs;
    lastScores = lasts;
    // "Máquina da noite" rotates by day (browser-only, SSR-safe).
    const day = new Date().getDate();
    featured = ARCADE_GAMES[day % ARCADE_GAMES.length];
    loaded = true;
  });
</script>

<svelte:head>
  <title>{$t('arcade.meta.title', { default: 'Sala Arcade Secreta' })} · Presuntinho</title>
  <meta name="description" content={$t('arcade.meta.description', { default: 'Jogos arcade secretos do Presuntinho, com pontuações locais e controlos mobile.' })} />
</svelte:head>

<div class="arcade-room">
  <header class="hero">
    <a class="back" href="/">{$t('arcade.back.home', { default: '← Home' })}</a>
    <span class="tag"><span class="dot" aria-hidden="true"></span>{$t('arcade.hero.tag', { default: 'Sala secreta desbloqueada' })}</span>
    <h1>{$t('arcade.hero.title', { default: 'Sala Arcade Secreta' })}</h1>
    <p>{$t('arcade.hero.body', { default: 'Encontraste a sala escondida do Presuntinho. Seis máquinas, recordes só teus e controlos pensados para o telemóvel e para o teclado.' })}</p>

    <div class="summary" aria-label={$t('arcade.summary.aria', { default: 'Resumo da sala arcade' })}>
      <span><strong>{ARCADE_GAMES.length}</strong><small>{$t('arcade.summary.games', { default: 'Máquinas' })}</small></span>
      <span><strong>{totalRecordPoints}</strong><small>{$t('arcade.summary.points', { default: 'Pontos recorde' })}</small></span>
      <span><strong>{machinesPlayed}/{ARCADE_GAMES.length}</strong><small>{$t('arcade.summary.mastered', { default: 'Com recorde' })}</small></span>
    </div>
  </header>

  {#if loaded}
    <a class="featured" href={featured.href} data-sveltekit-preload-data style="--accent: {featured.accent};">
      <span class="feat-label">{$t('arcade.featured.label', { default: '✨ Máquina da noite' })}</span>
      <div class="feat-body">
        <span class="feat-icon" aria-hidden="true">{featured.icon}</span>
        <div>
          <h2>{$t(featured.titleKey)}</h2>
          <p>{$t(featured.descriptionKey)}</p>
        </div>
      </div>
      <strong class="feat-cta">{$t('arcade.actions.play_now', { default: 'Jogar →' })}</strong>
    </a>
  {/if}

  {#if loaded && !anyPlayed}
    <p class="first-round">{$t('arcade.empty.body', { default: '🕹️ Primeira ronda! Escolhe uma máquina — as tuas pontuações ficam guardadas aqui.' })}</p>
  {/if}

  <section class="games" aria-label={$t('arcade.games.aria', { default: 'Jogos disponíveis' })}>
    <div class="section-head">
      <h2>{$t('arcade.games.title', { default: 'Escolhe uma máquina' })}</h2>
      <p>{$t('arcade.games.body', { default: 'Todos os jogos são jogáveis dentro da app. Sem placeholders.' })}</p>
    </div>

    <div class="grid">
      {#each ARCADE_GAMES as game (game.id)}
        <a class="game-card" href={game.href} data-sveltekit-preload-data style="--accent: {game.accent};">
          <span class="marquee" aria-hidden="true">{game.icon}</span>
          <p class="kicker">
            {$t(game.difficultyKey)}
            {#if loaded && isNew(game.id)}<span class="badge">{$t('arcade.game.new', { default: 'Novo' })}</span>{/if}
          </p>
          <h3>{$t(game.titleKey)}</h3>
          <p class="desc">{$t(game.descriptionKey)}</p>
          <div class="scores">
            <span>{$t('arcade.score.best_with_value', { values: { score: highScores[game.id] ?? 0 }, default: 'Melhor: {score}' })}</span>
            <span>{$t('arcade.score.last_with_value', { values: { score: lastScores[game.id] ?? 0 }, default: 'Última: {score}' })}</span>
          </div>
          <strong class="play">{$t('arcade.actions.play_now', { default: 'Jogar →' })}</strong>
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
  .arcade-room { max-width: 1120px; margin: 0 auto; padding: 1rem 1rem calc(7rem + env(safe-area-inset-bottom)); color: var(--txt, #fff); }
  .hero, .featured, .game-card, .note { border: 1px solid rgba(103, 232, 249, 0.2); border-radius: 1.4rem; background: rgba(255, 255, 255, 0.05); }
  .hero {
    position: relative;
    overflow: hidden;
    padding: 1.35rem 1.25rem;
    box-shadow: 0 22px 60px rgba(0, 0, 0, 0.32);
    background:
      radial-gradient(circle at 8% 0%, rgba(236, 72, 153, 0.34), transparent 38%),
      radial-gradient(circle at 96% 12%, rgba(34, 211, 238, 0.28), transparent 40%),
      repeating-linear-gradient(0deg, transparent 0 22px, rgba(255, 255, 255, 0.02) 22px 23px),
      rgba(12, 16, 30, 0.7);
  }
  .back { display: inline-flex; margin-bottom: 0.75rem; color: #bfdbfe; text-decoration: none; font-weight: 850; }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: #67e8f9;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    font-size: 0.7rem;
    font-weight: 900;
  }
  .tag .dot { width: 8px; height: 8px; border-radius: 999px; background: #34d399; box-shadow: 0 0 10px #34d399; }
  h1 { margin: 0.4rem 0; font-size: clamp(2.1rem, 9vw, 4rem); line-height: 0.98; letter-spacing: -0.01em; }
  .hero p, .section-head p, .game-card .desc, .note p { color: var(--txt2, #cbd5e1); line-height: 1.55; margin: 0; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.55rem; margin-top: 1.1rem; }
  .summary span { padding: 0.7rem; border-radius: 1rem; background: rgba(0, 0, 0, 0.28); border: 1px solid rgba(255, 255, 255, 0.1); text-align: center; }
  .summary strong, .summary small { display: block; }
  .summary strong { font-size: 1.35rem; font-variant-numeric: tabular-nums; }
  .summary small { color: var(--txt3, #94a3b8); font-size: 0.72rem; }

  .featured {
    display: grid;
    gap: 0.6rem;
    margin-top: 1rem;
    padding: 1.1rem 1.15rem;
    text-decoration: none;
    color: #fff;
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
    background:
      radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--accent) 30%, transparent), transparent 44%),
      rgba(255, 255, 255, 0.05);
    transition: transform 140ms ease, box-shadow 140ms ease;
  }
  .featured:hover, .featured:focus-visible { transform: translateY(-2px); box-shadow: 0 20px 50px color-mix(in srgb, var(--accent) 22%, transparent); outline: none; }
  .feat-label { color: var(--accent); font-weight: 900; letter-spacing: 0.04em; font-size: 0.78rem; text-transform: uppercase; }
  .feat-body { display: grid; grid-template-columns: auto 1fr; gap: 0.85rem; align-items: center; }
  .feat-icon { display: grid; place-items: center; width: 62px; height: 62px; border-radius: 1.1rem; font-size: 2rem; background: color-mix(in srgb, var(--accent) 24%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); }
  .featured h2 { margin: 0 0 0.15rem; font-size: 1.3rem; }
  .feat-cta { color: var(--accent); font-weight: 900; }

  .first-round {
    margin: 0.9rem 0 0;
    padding: 0.85rem 1rem;
    border-radius: 1rem;
    border: 1px dashed rgba(103, 232, 249, 0.4);
    background: rgba(34, 211, 238, 0.08);
    color: var(--txt2, #cbd5e1);
    line-height: 1.5;
  }

  .games { margin-top: 1.2rem; }
  .section-head { margin-bottom: 0.85rem; }
  .section-head h2, .note h2 { margin: 0 0 0.25rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 0.85rem; }
  .game-card {
    position: relative;
    display: grid;
    align-content: start;
    gap: 0.3rem;
    padding: 1rem;
    color: #fff;
    text-decoration: none;
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.26);
    transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
  }
  .game-card:hover, .game-card:focus-visible {
    transform: translateY(-3px);
    border-color: color-mix(in srgb, var(--accent) 65%, transparent);
    background: rgba(255, 255, 255, 0.085);
    outline: none;
  }
  .game-card:active { transform: translateY(-1px) scale(0.99); }
  .marquee {
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    margin-bottom: 0.35rem;
    border-radius: 1rem;
    font-size: 1.8rem;
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .kicker { display: flex; align-items: center; gap: 0.4rem; margin: 0; color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.68rem; font-weight: 900; }
  .badge { padding: 0.1rem 0.45rem; border-radius: 999px; background: color-mix(in srgb, var(--accent) 26%, transparent); color: #fff; letter-spacing: 0.04em; }
  .game-card h3 { margin: 0.1rem 0 0.15rem; font-size: 1.12rem; }
  .scores { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.55rem 0 0.3rem; }
  .scores span { padding: 0.22rem 0.5rem; border-radius: 999px; background: rgba(255, 255, 255, 0.08); color: var(--txt2, #cbd5e1); font-size: 0.74rem; font-variant-numeric: tabular-nums; }
  .play { color: var(--accent); font-weight: 900; }
  .note { margin-top: 1rem; padding: 1rem; }

  @media (max-width: 520px) {
    .arcade-room { padding-inline: 0.8rem; }
    .summary { gap: 0.4rem; }
    .summary strong { font-size: 1.15rem; }
    .grid { grid-template-columns: 1fr 1fr; }
    .game-card { padding: 0.8rem; }
    .game-card .desc { display: none; }
  }
</style>
