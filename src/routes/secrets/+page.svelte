<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import {
    ARCADE_GAMES,
    highScoreKey,
    lastScoreKey,
    readArcadeScore,
    type ArcadeGameDefinition
  } from '$lib/arcade/games';
  import MascotWalker from '$lib/components/arcade/MascotWalker.svelte';
  import CrtOverlay from '$lib/components/arcade/CrtOverlay.svelte';
  import { getActiveMascot, MASCOT_CHANGED_EVENT, DEFAULT_MASCOT_ID } from '$lib/gamification/mascots';
  import {
    startArcadeMusic,
    stopArcadeMusic,
    toggleArcadeMusic,
    isArcadeMusicEnabled,
    initArcadeMusicPrefs
  } from '$lib/arcade/audio';

  let highScores = $state<Record<string, number>>({});
  let lastScores = $state<Record<string, number>>({});
  let loaded = $state(false);
  let featured = $state<ArcadeGameDefinition>(ARCADE_GAMES[0]);
  let hostId = $state<string>(DEFAULT_MASCOT_ID);
  let musicOn = $state(true);

  const totalRecordPoints = $derived(Object.values(highScores).reduce((a, b) => a + b, 0));
  const machinesPlayed = $derived(Object.values(highScores).filter((v) => v > 0).length);
  const anyPlayed = $derived(machinesPlayed > 0);
  const allMastered = $derived(machinesPlayed === ARCADE_GAMES.length && ARCADE_GAMES.length > 0);
  // The host mascot's speech reacts to progress.
  const hostSpeechKey = $derived(
    allMastered ? 'arcade.host.mastered' : anyPlayed ? 'arcade.host.greeting' : 'arcade.host.first_time'
  );

  function isNew(id: string): boolean {
    return (highScores[id] ?? 0) === 0 && (lastScores[id] ?? 0) === 0;
  }

  function onToggleMusic(): void {
    musicOn = toggleArcadeMusic();
    if (musicOn) startArcadeMusic('lobby');
  }

  let removeGesture: (() => void) | null = null;

  function loadHost(): void {
    void getActiveMascot()
      .then((m) => (hostId = m.id))
      .catch(() => undefined);
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

    loadHost();
    const onMascotChanged = () => loadHost();
    window.addEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);

    // Chiptune lobby theme — starts on the FIRST user gesture (autoplay policy).
    void initArcadeMusicPrefs().then(() => (musicOn = isArcadeMusicEnabled()));
    const startOnGesture = () => startArcadeMusic('lobby');
    window.addEventListener('pointerdown', startOnGesture, { once: true });
    removeGesture = () => window.removeEventListener('pointerdown', startOnGesture);

    return () => {
      window.removeEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);
      removeGesture?.();
    };
  });

  onDestroy(() => {
    // Leaving the room silences the lobby loop; a game will start its own theme.
    stopArcadeMusic();
    removeGesture?.();
  });
</script>

<svelte:head>
  <title>{$t('arcade.meta.title', { default: 'Sala Arcade Secreta' })} · Presuntinho</title>
  <meta name="description" content={$t('arcade.meta.description', { default: 'Jogos arcade secretos do Presuntinho, com pontuações locais e controlos mobile.' })} />
</svelte:head>

<div class="arcade-room">
  <!-- ── backlit marquee (the arcade hall sign) ── -->
  <header class="marquee">
    <CrtOverlay radius="1.4rem" intensity={0.42} />
    <div class="marquee-top">
      <a class="back" href="/">{$t('arcade.back.home', { default: '← Home' })}</a>
      <span class="tag"><span class="dot" aria-hidden="true"></span>{$t('arcade.hero.tag', { default: 'Sala secreta desbloqueada' })}</span>
      <button
        type="button"
        class="music-btn"
        class:muted={!musicOn}
        onclick={onToggleMusic}
        aria-pressed={musicOn}
        aria-label={musicOn ? $t('arcade.music.off', { default: 'Desligar música' }) : $t('arcade.music.on', { default: 'Ligar música' })}
        title={musicOn ? $t('arcade.music.off', { default: 'Desligar música' }) : $t('arcade.music.on', { default: 'Ligar música' })}
      ><span aria-hidden="true">♪</span></button>
    </div>

    <h1 class="neon" data-text={$t('arcade.lobby.marquee', { default: 'ARCADE' })}>{$t('arcade.lobby.marquee', { default: 'ARCADE' })}</h1>
    <p class="sub">{$t('arcade.hero.body', { default: 'Encontraste a sala escondida do Presuntinho. Seis máquinas, recordes só teus e controlos pensados para o telemóvel e para o teclado.' })}</p>

    <!-- ── attract mode: the active mascot walks the arcade floor forever ── -->
    <div class="attract">
      <p class="bubble">{$t(hostSpeechKey, { default: 'Insere uma moeda e escolhe uma máquina! 🕹️' })}</p>
      <div class="floor" aria-label={$t('arcade.host.aria', { default: 'Mascote anfitriã da sala arcade' })}>
        <MascotWalker mascot={hostId} size={72} />
      </div>
      <p class="press-start">{$t('arcade.lobby.press_start', { default: 'PRESS START' })}</p>
    </div>

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
      <strong class="feat-cta">{$t('arcade.actions.insert_coin', { default: '🪙 Inserir moeda →' })}</strong>
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

    <div class="rail">
      {#each ARCADE_GAMES as game (game.id)}
        <a class="cabinet" href={game.href} data-sveltekit-preload-data style="--accent: {game.accent};">
          <!-- machine marquee -->
          <span class="cab-marquee" aria-hidden="true">{game.icon}</span>
          <!-- machine screen -->
          <span class="cab-screen">
            <span class="cab-scan" aria-hidden="true"></span>
            <span class="kicker">
              {$t(game.difficultyKey)}
              {#if loaded && isNew(game.id)}<span class="badge">{$t('arcade.game.new', { default: 'Novo' })}</span>{/if}
            </span>
            <span class="cab-title">{$t(game.titleKey)}</span>
            <span class="desc">{$t(game.descriptionKey)}</span>
          </span>
          <!-- control panel -->
          <span class="cab-panel">
            <span class="scores">
              <span>{$t('arcade.score.best_with_value', { values: { score: highScores[game.id] ?? 0 }, default: 'Melhor: {score}' })}</span>
              <span>{$t('arcade.score.last_with_value', { values: { score: lastScores[game.id] ?? 0 }, default: 'Última: {score}' })}</span>
            </span>
            <strong class="play">{$t('arcade.actions.insert_coin', { default: '🪙 Inserir moeda →' })}</strong>
          </span>
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
  /* Full-page "arcade mode": the room fills the height between the app's header
     and footer with an immersive neon backdrop, so it reads as a dedicated
     arcade hall rather than a card page floating on the app background. */
  .arcade-room {
    max-width: 1120px;
    margin: 0 auto;
    min-height: calc(100dvh - 3.25rem);
    padding: 1rem 1rem calc(7rem + env(safe-area-inset-bottom));
    color: var(--txt, #fff);
    background:
      radial-gradient(circle at 10% -2%, rgba(236, 72, 153, 0.16), transparent 42%),
      radial-gradient(circle at 92% 4%, rgba(34, 211, 238, 0.14), transparent 44%),
      repeating-linear-gradient(0deg, transparent 0 2px, rgba(255, 255, 255, 0.012) 2px 3px),
      linear-gradient(180deg, rgba(9, 8, 22, 0.7), rgba(6, 8, 18, 0.86));
  }
  /* the hall "switches on" like a CRT tube when you enter */
  @media (prefers-reduced-motion: no-preference) {
    .arcade-room { animation: power-on 440ms ease-out; }
    @keyframes power-on {
      0% { opacity: 0; filter: brightness(3.2) contrast(1.4); }
      55% { opacity: 1; }
      100% { filter: brightness(1) contrast(1); }
    }
  }
  .marquee, .featured, .cabinet, .note { border: 1px solid rgba(103, 232, 249, 0.2); border-radius: 1.4rem; background: rgba(255, 255, 255, 0.05); }

  /* ── marquee (arcade-hall sign) ── */
  .marquee {
    position: relative;
    overflow: hidden;
    padding: 1.35rem 1.25rem;
    box-shadow: 0 22px 60px rgba(0, 0, 0, 0.42), inset 0 0 60px rgba(103, 232, 249, 0.05);
    background:
      radial-gradient(circle at 8% 0%, rgba(236, 72, 153, 0.34), transparent 40%),
      radial-gradient(circle at 96% 8%, rgba(34, 211, 238, 0.3), transparent 42%),
      linear-gradient(180deg, rgba(14, 10, 32, 0.86), rgba(8, 10, 24, 0.9));
  }
  .marquee-top { display: flex; align-items: center; gap: 0.6rem; position: relative; z-index: 6; }
  .back { display: inline-flex; color: #bfdbfe; text-decoration: none; font-weight: 850; }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-left: auto;
    color: #67e8f9;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    font-size: 0.68rem;
    font-weight: 900;
  }
  .tag .dot { width: 8px; height: 8px; border-radius: 999px; background: #34d399; box-shadow: 0 0 10px #34d399; }
  .music-btn {
    display: grid;
    place-items: center;
    position: relative;
    width: 38px;
    height: 38px;
    border-radius: 999px;
    color: #fff;
    font-size: 1.05rem;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.14);
    cursor: pointer;
  }
  .music-btn:hover, .music-btn:focus-visible { background: rgba(103, 232, 249, 0.18); outline: none; }
  .music-btn:active { transform: scale(0.92); }
  .music-btn.muted { color: #94a3b8; }
  .music-btn.muted::after {
    content: '';
    position: absolute;
    left: 22%;
    right: 22%;
    top: 50%;
    height: 2px;
    background: currentColor;
    transform: rotate(-20deg);
    border-radius: 2px;
  }

  /* neon marquee title with a doubled glow layer */
  .neon {
    position: relative;
    z-index: 6;
    margin: 0.6rem 0 0.4rem;
    font-size: clamp(2.4rem, 12vw, 4.6rem);
    line-height: 0.92;
    letter-spacing: 0.14em;
    text-align: center;
    font-weight: 900;
    color: #fff;
    text-shadow:
      0 0 6px rgba(255, 255, 255, 0.9),
      0 0 16px rgba(236, 72, 153, 0.8),
      0 0 34px rgba(34, 211, 238, 0.7),
      0 0 60px rgba(34, 211, 238, 0.5);
  }
  @media (prefers-reduced-motion: no-preference) {
    .neon { animation: neon-flicker 5.5s infinite; }
    @keyframes neon-flicker {
      0%, 92%, 100% { opacity: 1; }
      93% { opacity: 0.72; }
      94% { opacity: 1; }
      96% { opacity: 0.85; }
      97% { opacity: 1; }
    }
  }
  .sub { position: relative; z-index: 6; margin: 0 auto; max-width: 46ch; text-align: center; color: var(--txt2, #cbd5e1); line-height: 1.55; }

  /* ── mascot host + speech bubble ── */
  /* attract mode: speech bubble, a neon FLOOR the mascot patrols, PRESS START */
  .attract { position: relative; z-index: 6; margin: 1rem 0 0.2rem; display: grid; justify-items: center; gap: 0.55rem; }
  .floor {
    position: relative;
    width: 100%;
    max-width: 30rem;
    height: 94px;
    border-radius: 0.8rem;
    background:
      linear-gradient(180deg, transparent, rgba(103, 232, 249, 0.05)),
      repeating-linear-gradient(90deg, transparent 0 26px, rgba(103, 232, 249, 0.1) 26px 27px);
    border-bottom: 2px solid rgba(103, 232, 249, 0.32);
    box-shadow: 0 12px 30px -14px rgba(103, 232, 249, 0.5);
  }
  .press-start {
    margin: 0;
    color: #fde68a;
    font-weight: 900;
    letter-spacing: 0.22em;
    font-size: 0.82rem;
    text-shadow: 0 0 10px rgba(253, 230, 138, 0.7);
  }
  @media (prefers-reduced-motion: no-preference) {
    .press-start { animation: blink 1.05s steps(1, end) infinite; }
    @keyframes blink {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0.14; }
    }
  }
  .bubble {
    position: relative;
    margin: 0;
    max-width: 15rem;
    padding: 0.6rem 0.85rem;
    border-radius: 1rem 1rem 1rem 0.2rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #fff;
    font-size: 0.9rem;
    line-height: 1.4;
    backdrop-filter: blur(6px);
  }
  .bubble::before {
    content: '';
    position: absolute;
    left: -7px;
    bottom: 8px;
    border: 7px solid transparent;
    border-right-color: rgba(255, 255, 255, 0.1);
    border-left: 0;
  }

  .summary { position: relative; z-index: 6; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.55rem; margin-top: 1.1rem; }
  .summary span { padding: 0.7rem; border-radius: 1rem; background: rgba(0, 0, 0, 0.34); border: 1px solid rgba(255, 255, 255, 0.1); text-align: center; }
  .summary strong, .summary small { display: block; }
  .summary strong { font-size: 1.35rem; font-variant-numeric: tabular-nums; }
  .summary small { color: var(--txt3, #94a3b8); font-size: 0.72rem; }

  /* ── featured cabinet (attract mode) ── */
  .featured {
    display: grid;
    gap: 0.6rem;
    margin-top: 1rem;
    padding: 1.1rem 1.15rem;
    text-decoration: none;
    color: #fff;
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
    background:
      radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--accent) 30%, transparent), transparent 46%),
      rgba(255, 255, 255, 0.05);
    transition: transform 140ms ease, box-shadow 140ms ease;
  }
  @media (prefers-reduced-motion: no-preference) {
    .featured { animation: attract 3.6s ease-in-out infinite; }
    @keyframes attract {
      0%, 100% { box-shadow: 0 16px 40px color-mix(in srgb, var(--accent) 12%, transparent); }
      50% { box-shadow: 0 20px 54px color-mix(in srgb, var(--accent) 34%, transparent); }
    }
  }
  .featured:hover, .featured:focus-visible { transform: translateY(-2px); box-shadow: 0 20px 50px color-mix(in srgb, var(--accent) 30%, transparent); outline: none; }
  .feat-label { color: var(--accent); font-weight: 900; letter-spacing: 0.04em; font-size: 0.78rem; text-transform: uppercase; }
  .feat-body { display: grid; grid-template-columns: auto 1fr; gap: 0.85rem; align-items: center; }
  .feat-icon { display: grid; place-items: center; width: 62px; height: 62px; border-radius: 1.1rem; font-size: 2rem; background: color-mix(in srgb, var(--accent) 24%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); }
  .featured h2 { margin: 0 0 0.15rem; font-size: 1.3rem; }
  .featured p { margin: 0; color: var(--txt2, #cbd5e1); line-height: 1.5; }
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
  .section-head p, .note p { color: var(--txt2, #cbd5e1); line-height: 1.55; margin: 0; }
  /* an arcade LINEUP you swipe through, not a grid of cards */
  .rail {
    display: flex;
    gap: 0.9rem;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    padding: 0.2rem 0.2rem 0.5rem;
    scroll-padding: 0 0.2rem;
  }
  .rail::-webkit-scrollbar { display: none; }
  .rail .cabinet { flex: 0 0 82%; scroll-snap-align: center; }
  @media (min-width: 720px) {
    .rail .cabinet { flex-basis: 300px; }
  }

  /* ── cabinet = a little arcade machine ── */
  .cabinet {
    position: relative;
    display: grid;
    grid-template-rows: auto 1fr auto;
    color: #fff;
    text-decoration: none;
    overflow: hidden;
    border-color: color-mix(in srgb, var(--accent) 34%, transparent);
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.3);
    transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
  }
  .cabinet:hover, .cabinet:focus-visible {
    transform: translateY(-3px);
    border-color: color-mix(in srgb, var(--accent) 70%, transparent);
    box-shadow: 0 20px 46px color-mix(in srgb, var(--accent) 24%, transparent);
    outline: none;
  }
  .cabinet:active { transform: translateY(-1px) scale(0.99); }
  .cab-marquee {
    display: grid;
    place-items: center;
    padding: 0.5rem;
    font-size: 1.7rem;
    background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 40%, transparent), color-mix(in srgb, var(--accent) 14%, transparent));
    border-bottom: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    text-shadow: 0 0 12px color-mix(in srgb, var(--accent) 80%, transparent);
  }
  .cab-screen {
    position: relative;
    display: grid;
    align-content: start;
    gap: 0.28rem;
    padding: 0.8rem 0.85rem;
    background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 55%), #0a1020;
    overflow: hidden;
  }
  .cab-scan {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: repeating-linear-gradient(0deg, transparent 0 2px, rgba(0, 0, 0, 0.16) 2px 3px);
  }
  .kicker { display: flex; align-items: center; gap: 0.4rem; color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.66rem; font-weight: 900; }
  .badge { padding: 0.1rem 0.45rem; border-radius: 999px; background: color-mix(in srgb, var(--accent) 30%, transparent); color: #fff; letter-spacing: 0.04em; }
  .cab-title { font-size: 1.12rem; font-weight: 800; }
  .desc { color: var(--txt2, #cbd5e1); line-height: 1.5; font-size: 0.86rem; }
  .cab-panel {
    display: grid;
    gap: 0.4rem;
    padding: 0.7rem 0.85rem;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.25));
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .scores { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .scores span { padding: 0.22rem 0.5rem; border-radius: 999px; background: rgba(255, 255, 255, 0.08); color: var(--txt2, #cbd5e1); font-size: 0.72rem; font-variant-numeric: tabular-nums; }
  .play { color: var(--accent); font-weight: 900; font-size: 0.9rem; }
  .note { margin-top: 1rem; padding: 1rem; }

  @media (max-width: 520px) {
    .arcade-room { padding-inline: 0.8rem; }
    .summary { gap: 0.4rem; }
    .summary strong { font-size: 1.15rem; }
    .bubble { max-width: 13rem; font-size: 0.82rem; }
  }
</style>
