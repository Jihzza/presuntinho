<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import {
    ARCADE_GAMES,
    highScoreKey,
    lastScoreKey,
    readArcadeScore
  } from '$lib/arcade/games';
  import MascotWalker from '$lib/components/arcade/MascotWalker.svelte';
  import CrtOverlay from '$lib/components/arcade/CrtOverlay.svelte';
  import { arcadeImmersive } from '$lib/arcade/immersive-state';
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
  let hostId = $state<string>(DEFAULT_MASCOT_ID);
  let musicOn = $state(true);
  let selected = $state(0);

  const totalRecordPoints = $derived(Object.values(highScores).reduce((a, b) => a + b, 0));
  const machinesPlayed = $derived(Object.values(highScores).filter((v) => v > 0).length);
  const anyPlayed = $derived(machinesPlayed > 0);
  const allMastered = $derived(machinesPlayed === ARCADE_GAMES.length && ARCADE_GAMES.length > 0);
  const hostSpeechKey = $derived(
    allMastered ? 'arcade.host.mastered' : anyPlayed ? 'arcade.host.greeting' : 'arcade.host.first_time'
  );
  const hiScoreText = $derived(String(totalRecordPoints).padStart(6, '0'));
  const heartsTotal = ARCADE_GAMES.length;

  function isNew(id: string): boolean {
    return (highScores[id] ?? 0) === 0 && (lastScores[id] ?? 0) === 0;
  }

  function onToggleMusic(): void {
    musicOn = toggleArcadeMusic();
    if (musicOn) startArcadeMusic('lobby');
  }

  function move(delta: number): void {
    selected = (selected + delta + ARCADE_GAMES.length) % ARCADE_GAMES.length;
  }
  function launch(): void {
    void goto(ARCADE_GAMES[selected].href);
  }
  function onKey(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (k === 'arrowdown' || k === 's') {
      e.preventDefault();
      move(1);
    } else if (k === 'arrowup' || k === 'w') {
      e.preventDefault();
      move(-1);
    } else if (k === 'enter' || k === ' ') {
      e.preventDefault();
      launch();
    }
  }

  let removeGesture: (() => void) | null = null;
  function loadHost(): void {
    void getActiveMascot()
      .then((m) => (hostId = m.id))
      .catch(() => undefined);
  }

  onMount(() => {
    arcadeImmersive.set(true); // true fullscreen — hide the app chrome
    const highs: Record<string, number> = {};
    const lasts: Record<string, number> = {};
    for (const game of ARCADE_GAMES) {
      highs[game.id] = readArcadeScore(highScoreKey(game.id));
      lasts[game.id] = readArcadeScore(lastScoreKey(game.id));
    }
    highScores = highs;
    lastScores = lasts;
    // pre-select the "machine of the night" (rotates by day, SSR-safe).
    selected = new Date().getDate() % ARCADE_GAMES.length;
    loaded = true;

    loadHost();
    const onMascotChanged = () => loadHost();
    window.addEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);
    window.addEventListener('keydown', onKey);

    void initArcadeMusicPrefs().then(() => (musicOn = isArcadeMusicEnabled()));
    const startOnGesture = () => startArcadeMusic('lobby');
    window.addEventListener('pointerdown', startOnGesture, { once: true });
    removeGesture = () => window.removeEventListener('pointerdown', startOnGesture);

    return () => {
      window.removeEventListener(MASCOT_CHANGED_EVENT, onMascotChanged);
      window.removeEventListener('keydown', onKey);
      removeGesture?.();
    };
  });

  onDestroy(() => {
    arcadeImmersive.set(false);
    stopArcadeMusic();
    removeGesture?.();
  });
</script>

<svelte:head>
  <title>{$t('arcade.meta.title', { default: 'Sala Arcade Secreta' })} · Presuntinho</title>
  <meta name="description" content={$t('arcade.meta.description', { default: 'Jogos arcade secretos do Presuntinho, com pontuações locais e controlos mobile.' })} />
</svelte:head>

<div class="crt-screen">
  <CrtOverlay radius="0" intensity={0.55} />

  <!-- ── top HUD row: back · HI-SCORE · hearts · music ── -->
  <div class="topbar">
    <a class="px-btn" href="/" aria-label={$t('arcade.back.home', { default: '← Home' })}>◄</a>
    <span class="hi">{$t('arcade.hud.hi_score', { default: 'HI-SCORE' })} {hiScoreText}</span>
    <div class="hearts" aria-label={$t('arcade.hud.lives_aria', { default: 'Máquinas com recorde' })}>
      {#each Array(heartsTotal) as _, i (i)}
        <span class="px-heart" class:full={i < machinesPlayed} aria-hidden="true"></span>
      {/each}
    </div>
    <button
      type="button"
      class="px-btn"
      class:muted={!musicOn}
      onclick={onToggleMusic}
      aria-pressed={musicOn}
      aria-label={musicOn ? $t('arcade.music.off', { default: 'Desligar música' }) : $t('arcade.music.on', { default: 'Ligar música' })}
    >♪</button>
  </div>

  <!-- ── attract title ── -->
  <div class="attract">
    <h1 class="px-start" data-text="START">{$t('arcade.lobby.start', { default: 'START' })}</h1>
    <p class="ready">{$t('arcade.lobby.ready', { default: 'ESTÁS PRONTA?' })}</p>
    <p class="yesno"><span class="sel">► {$t('arcade.lobby.yes', { default: 'SIM' })}</span>&nbsp;&nbsp;&nbsp;{$t('arcade.lobby.no', { default: 'NÃO' })}</p>
  </div>

  <!-- ── vertical pixel MENU (the cabinet select) ── -->
  <nav class="menu" aria-label={$t('arcade.games.aria', { default: 'Jogos disponíveis' })}>
    {#each ARCADE_GAMES as game, i (game.id)}
      <a
        class="row"
        class:on={i === selected}
        style={`--accent: ${game.accent}`}
        href={game.href}
        data-sveltekit-preload-data
        onmouseenter={() => (selected = i)}
        onfocus={() => (selected = i)}
      >
        <span class="arrow" aria-hidden="true">{i === selected ? '►' : ''}</span>
        <span class="ic" aria-hidden="true">{game.icon}</span>
        <span class="name">{$t(game.titleKey)}</span>
        <span class="best">{highScores[game.id] ?? 0}</span>
        {#if loaded && isNew(game.id)}<span class="tag-new">{$t('arcade.game.new', { default: 'NEW' })}</span>{/if}
      </a>
    {/each}
  </nav>

  <!-- ── attract-mode: the mascot patrols a pixel floor ── -->
  <div class="floor">
    <p class="bubble">{$t(hostSpeechKey, { default: 'Insere uma moeda e escolhe uma máquina! 🕹️' })}</p>
    <div class="floor-strip">
      <MascotWalker mascot={hostId} size={64} pixelated />
    </div>
    <p class="press">{$t('arcade.lobby.press_start', { default: 'PRESS START' })}</p>
  </div>
</div>

<style>
  .crt-screen {
    position: fixed;
    inset: 0;
    z-index: 40;
    overflow: auto;
    color: #e8fff4;
    background: radial-gradient(circle at 50% -10%, #171033, #070510 60%);
    font-family: 'Courier New', ui-monospace, 'SFMono-Regular', monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: calc(env(safe-area-inset-top) + 0.7rem) 1rem calc(env(safe-area-inset-bottom) + 1rem);
  }
  @media (prefers-reduced-motion: no-preference) {
    .crt-screen {
      animation: power-on 440ms ease-out;
    }
    @keyframes power-on {
      0% { opacity: 0; transform: scaleY(0.7); filter: brightness(3) contrast(1.4); }
      55% { opacity: 1; }
      100% { transform: scaleY(1); filter: brightness(1); }
    }
  }

  /* ── top HUD ── */
  .topbar {
    width: min(46rem, 100%);
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-weight: 900;
    z-index: 6;
  }
  .hi {
    color: #67e8f9;
    font-size: clamp(0.72rem, 3.4vw, 1rem);
    text-shadow: 2px 2px 0 #075985;
    white-space: nowrap;
  }
  .hearts {
    margin-left: auto;
    display: flex;
    gap: 5px;
  }
  .px-heart {
    position: relative;
    width: 16px;
    height: 14px;
    --c: #334155;
  }
  .px-heart::before,
  .px-heart::after {
    content: '';
    position: absolute;
    top: 0;
    width: 8px;
    height: 12px;
    border-radius: 8px 8px 0 0;
    background: var(--c);
  }
  .px-heart::before {
    left: 8px;
    transform: rotate(45deg);
    transform-origin: 0 100%;
  }
  .px-heart::after {
    left: 0;
    transform: rotate(-45deg);
    transform-origin: 100% 100%;
  }
  .px-heart.full {
    --c: #f472b6;
    filter: drop-shadow(0 0 4px #f472b6);
  }
  .px-btn {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    border-radius: 0.4rem;
    border: 2px solid rgba(103, 232, 249, 0.4);
    background: rgba(10, 16, 30, 0.55);
    color: #e8fff4;
    text-decoration: none;
    font-size: 1.1rem;
    cursor: pointer;
    position: relative;
  }
  .px-btn:hover,
  .px-btn:focus-visible {
    border-color: #67e8f9;
    outline: none;
  }
  .px-btn.muted {
    color: #64748b;
  }
  .px-btn.muted::after {
    content: '';
    position: absolute;
    left: 20%;
    right: 20%;
    top: 50%;
    height: 2px;
    background: currentColor;
    transform: rotate(-20deg);
  }

  /* ── attract title ── */
  .attract {
    text-align: center;
    margin-top: 0.6rem;
    z-index: 6;
  }
  .px-start {
    margin: 0;
    font-size: clamp(3rem, 17vw, 6.5rem);
    font-weight: 900;
    letter-spacing: 0.12em;
    line-height: 1;
    color: #fde047;
    text-shadow: 3px 3px 0 #b45309, 6px 6px 0 #7c2d12, 0 0 24px rgba(253, 224, 71, 0.55);
  }
  @media (prefers-reduced-motion: no-preference) {
    .px-start {
      animation: px-blink 1.15s steps(1, end) infinite;
    }
    @keyframes px-blink {
      0%, 60% { opacity: 1; }
      61%, 100% { opacity: 0.5; }
    }
  }
  .ready {
    margin: 0.5rem 0 0.2rem;
    color: #e2e8f0;
    font-weight: 900;
    font-size: clamp(0.8rem, 4vw, 1.2rem);
  }
  .yesno {
    margin: 0;
    color: #94a3b8;
    font-weight: 900;
    font-size: clamp(0.8rem, 4vw, 1.1rem);
  }
  .yesno .sel {
    color: #4ade80;
  }

  /* ── vertical pixel MENU ── */
  .menu {
    width: min(30rem, 92vw);
    display: grid;
    gap: 0.18rem;
    margin: 0.9rem 0;
    z-index: 6;
  }
  .row {
    display: grid;
    grid-template-columns: 1.4rem 1.6rem 1fr auto auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.6rem;
    color: #cbd5e1;
    text-decoration: none;
    font-weight: 900;
    font-size: clamp(0.78rem, 3.6vw, 1rem);
    border: 2px solid transparent;
    border-radius: 0.3rem;
  }
  .row.on {
    color: #fff;
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    border-color: color-mix(in srgb, var(--accent) 70%, transparent);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.5);
  }
  .row .arrow {
    color: var(--accent);
  }
  .row .ic {
    font-size: 1.15rem;
  }
  .row .best {
    color: #67e8f9;
    font-variant-numeric: tabular-nums;
  }
  .row .tag-new {
    color: #0b0f19;
    background: #4ade80;
    padding: 0 0.3rem;
    border-radius: 0.2rem;
    font-size: 0.6rem;
  }
  @media (prefers-reduced-motion: no-preference) {
    .row.on .arrow {
      animation: px-blink 1s steps(1, end) infinite;
    }
  }

  /* ── floor + mascot + press start ── */
  .floor {
    width: min(46rem, 100%);
    margin-top: auto;
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    z-index: 6;
  }
  .bubble {
    margin: 0;
    max-width: 24ch;
    text-align: center;
    padding: 0.5rem 0.8rem;
    border-radius: 0.4rem;
    border: 2px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    font-size: 0.78rem;
    text-transform: none;
    letter-spacing: normal;
    line-height: 1.4;
  }
  .floor-strip {
    position: relative;
    width: 100%;
    max-width: 30rem;
    height: 88px;
    border-radius: 0.4rem;
    background:
      linear-gradient(180deg, transparent, rgba(103, 232, 249, 0.06)),
      repeating-linear-gradient(90deg, transparent 0 24px, rgba(103, 232, 249, 0.12) 24px 25px);
    border-bottom: 3px solid rgba(103, 232, 249, 0.35);
  }
  .press {
    margin: 0;
    color: #fde68a;
    font-weight: 900;
    letter-spacing: 0.22em;
    font-size: 0.8rem;
    text-shadow: 0 0 10px rgba(253, 230, 138, 0.7);
  }
  @media (prefers-reduced-motion: no-preference) {
    .press {
      animation: px-blink 1.05s steps(1, end) infinite;
    }
  }
</style>
