<script lang="ts">
  /**
   * /mascotes — seletor de mascotes tipo jogo (V10.4).
   *
   * Palco grande onde a mascote em pré-visualização GANHA VIDA (as poses
   * da arte real alternam sozinhas, como um ecrã de seleção de personagem),
   * fila de cartões em baixo para trocar de personagem, bloqueadas em
   * silhueta com barra de progresso do desbloqueio. Escolher dispara
   * confetti + fanfarra + toast e persiste via setActiveMascot
   * ('presuntinho:mascot-changed' atualiza o FAB e a Home na hora).
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { fireConfettiEvent, prefersReducedMotion, showToast } from '$lib/components/events';
  import { playSfx, vibrate } from '$lib/gamification/sound';
  import MascotAvatar from '$lib/components/MascotAvatar.svelte';
  import {
    MASCOTS,
    mascotArt,
    mascotStatuses,
    setActiveMascot,
    type MascotPose,
    type MascotStatus,
    type MascotUnlockContext
  } from '$lib/gamification/mascots';

  let statuses = $state<MascotStatus[]>(
    MASCOTS.map((def) => ({ ...def, unlocked: false, active: false }))
  );
  let ctx = $state<MascotUnlockContext>({ xp: 0, badges: 0 });
  let loaded = $state(false);
  let reduced = $state(false);

  /** Mascote no palco (por omissão, a ativa). */
  let previewId = $state<string | null>(null);
  const preview = $derived.by<MascotStatus | null>(() => {
    if (!loaded) return null;
    const id = previewId ?? statuses.find((s) => s.active)?.id ?? statuses[0]?.id;
    return statuses.find((s) => s.id === id) ?? statuses[0] ?? null;
  });

  // Palco vivo: as poses rodam sozinhas (para quando reduced motion).
  const STAGE_POSES: MascotPose[] = ['wave', 'cheer', 'sit', 'love', 'jump', 'point'];
  let poseIdx = $state(0);
  let poseTimer: ReturnType<typeof setInterval> | undefined;
  const stagePose = $derived<MascotPose>(
    preview?.unlocked ? STAGE_POSES[poseIdx % STAGE_POSES.length] : 'sit'
  );

  async function refresh(): Promise<void> {
    try {
      const result = await mascotStatuses();
      statuses = result.statuses;
      ctx = result.ctx;
    } catch (e) {
      console.error('[mascotes] load failed', e);
    } finally {
      loaded = true;
    }
  }

  function restartPoseCycle(): void {
    if (reduced) return;
    clearInterval(poseTimer);
    poseTimer = setInterval(() => (poseIdx += 1), 2400);
  }

  // Pré-carrega as poses do palco da mascote em pré-visualização — o {#key}
  // remonta o <img> a cada troca e sem preload a 1.ª volta piscava.
  $effect(() => {
    const p = preview;
    if (!p?.unlocked || typeof window === 'undefined') return;
    for (const pose of STAGE_POSES) {
      const img = new Image();
      img.src = mascotArt(p.id, pose);
    }
  });

  onMount(() => {
    reduced = prefersReducedMotion();
    void refresh();
    restartPoseCycle();
    return () => clearInterval(poseTimer);
  });

  function nameOf(m: MascotStatus): string {
    return $t(`mascots.${m.id}.name`, { default: m.id });
  }

  function selectForPreview(m: MascotStatus): void {
    previewId = m.id;
    poseIdx = 0;
    if (m.unlocked) playSfx('pop');
  }

  async function pick(m: MascotStatus): Promise<void> {
    if (!m.unlocked || m.active) return;
    try {
      await setActiveMascot(m.id);
      statuses = statuses.map((s) => ({ ...s, active: s.id === m.id }));
      poseIdx = STAGE_POSES.indexOf('cheer'); // festeja no palco…
      restartPoseCycle(); // …durante um ciclo completo
      fireConfettiEvent({ count: 120, origin: 'center' });
      playSfx('fanfare');
      vibrate('success');
      showToast(
        $t('mascots.toast.picked', {
          values: { emoji: m.emoji, name: nameOf(m) },
          default: '{emoji} {name} é agora a tua mascote!'
        })
      );
    } catch (e) {
      console.error('[mascotes] pick failed', e);
    }
  }

  function unlockHint(m: MascotStatus): string {
    if (typeof m.minXp === 'number') {
      return $t('mascots.unlock.xp', { values: { xp: m.minXp }, default: 'Desbloqueia com {xp} XP' });
    }
    if (typeof m.minBadges === 'number') {
      return $t('mascots.unlock.badges', { values: { n: m.minBadges }, default: 'Desbloqueia com {n} medalhas' });
    }
    return '';
  }

  // V10 — visible unlock progress on locked mascots ("120/500 XP" + bar).
  function unlockPct(m: MascotStatus): number {
    if (typeof m.minXp === 'number' && m.minXp > 0) {
      return Math.min(100, Math.round((ctx.xp / m.minXp) * 100));
    }
    if (typeof m.minBadges === 'number' && m.minBadges > 0) {
      return Math.min(100, Math.round((ctx.badges / m.minBadges) * 100));
    }
    return 0;
  }

  function unlockProgressLabel(m: MascotStatus): string {
    if (typeof m.minXp === 'number') {
      return $t('mascots.unlock.progress.xp', {
        values: { have: ctx.xp, need: m.minXp },
        default: '{have}/{need} XP'
      });
    }
    if (typeof m.minBadges === 'number') {
      return $t('mascots.unlock.progress.badges', {
        values: { have: ctx.badges, need: m.minBadges },
        default: '{have}/{need} medalhas'
      });
    }
    return '';
  }
</script>

<svelte:head>
  <title>{$t('mascots.page.title', { default: '🎭 Mascotes' })} · Presuntinho</title>
  <meta name="description" content={$t('mascots.seo.description', { default: 'A tua coleção de mascotes fofas' })} />
</svelte:head>

<div class="mascotes">
  <p class="breadcrumb">
    <a href="/escola/">{$t('mascots.page.back', { default: '← Escola' })}</a>
  </p>

  <header class="hero">
    <span class="hero-tag">{$t('mascots.page.tag', { default: 'Coleção' })}</span>
    <h1>{$t('mascots.page.title', { default: '🎭 Mascotes' })}</h1>
    <p class="sub">{$t('mascots.page.subtitle', { default: 'Escolhe quem te acompanha nos estudos — ganha XP e medalhas para desbloquear todas!' })}</p>
    {#if loaded}
      <p class="progress-pill">
        ⚡ {$t('mascots.page.progress', { values: { xp: ctx.xp, badges: ctx.badges }, default: 'Tens {xp} XP · {badges} medalhas' })}
      </p>
    {/if}
  </header>

  <!-- Palco de seleção de personagem -->
  <section class="stage card" aria-live="polite">
    {#if preview}
      <div class="stage-floor" aria-hidden="true"></div>
      {#key `${preview.id}:${stagePose}`}
        <div class="stage-actor" class:silhouette={!preview.unlocked}>
          <MascotAvatar
            mascot={preview.id}
            pose={stagePose}
            size={190}
            animate={!reduced}
            eager
          />
          {#if !preview.unlocked}
            <span class="stage-lock" aria-hidden="true">🔒</span>
          {/if}
        </div>
      {/key}

      <h2 class="stage-name">{nameOf(preview)}</h2>
      <p class="stage-desc">{$t(`mascots.${preview.id}.desc`, { default: '' })}</p>

      {#if preview.unlocked}
        <p class="stage-line">“{$t(`mascots.${preview.id}.line`, { default: '' })}”</p>
        {#if preview.active}
          <span class="stage-cta is-active">{$t('mascots.page.active', { default: '✓ Ativa' })}</span>
        {:else}
          <button
            type="button"
            class="stage-cta"
            onclick={() => void pick(preview)}
            aria-label={$t('mascots.page.pick_aria', { values: { name: nameOf(preview) }, default: 'Escolher {name}' })}
          >
            {$t('mascots.page.pick', { default: 'Escolher' })}
          </button>
        {/if}
      {:else}
        <p class="stage-hint">🔒 {unlockHint(preview)}</p>
        <span class="unlock-progress stage-unlock">
          <span class="unlock-bar-wrap" aria-hidden="true">
            <span class="unlock-bar" style="width: {unlockPct(preview)}%"></span>
          </span>
          <small class="unlock-label">{unlockProgressLabel(preview)}</small>
        </span>
      {/if}
    {:else}
      <div class="stage-loading" aria-hidden="true"></div>
    {/if}
  </section>

  <!-- Fila de personagens -->
  <ul class="rail" aria-label={$t('mascots.page.grid_aria', { default: 'Coleção de mascotes' })}>
    {#each statuses as m, i (m.id)}
      <li>
        <button
          type="button"
          class="rail-card"
          class:active={m.active}
          class:previewing={preview?.id === m.id}
          class:locked={!m.unlocked}
          style="--stagger: {(i * 0.35).toFixed(2)}s;"
          onclick={() => selectForPreview(m)}
          aria-pressed={preview?.id === m.id}
          aria-label={m.unlocked
            ? $t('mascots.page.pick_aria', { values: { name: nameOf(m) }, default: 'Escolher {name}' })
            : `${nameOf(m)} — ${unlockHint(m)}`}
        >
          <span class="rail-art" class:bob={!reduced} aria-hidden="true">
            <MascotAvatar mascot={m.id} pose="wave" size={64} animate={false} />
            {#if !m.unlocked}<span class="rail-lock">🔒</span>{/if}
          </span>
          <strong class="rail-name">{nameOf(m)}</strong>
          {#if m.active}
            <span class="badge active-badge">{$t('mascots.page.active', { default: '✓ Ativa' })}</span>
          {:else if m.unlocked}
            <span class="badge pick-badge">{$t('mascots.page.pick', { default: 'Escolher' })}</span>
          {:else}
            <span class="unlock-progress">
              <span class="unlock-bar-wrap" aria-hidden="true">
                <span class="unlock-bar" style="width: {unlockPct(m)}%"></span>
              </span>
              <small class="unlock-label">{unlockProgressLabel(m)}</small>
            </span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .mascotes {
    max-width: 860px;
    margin: 0 auto;
    padding: 1.25rem 1rem 8rem;
  }
  .breadcrumb { margin: 0 0 0.75rem; font-size: var(--fs-sm, 0.85rem); }
  .breadcrumb a {
    color: var(--accent);
    text-decoration: none;
    display: inline-block;
    padding: 0.35rem 0;
  }
  .breadcrumb a:hover,
  .breadcrumb a:focus-visible { text-decoration: underline; outline: none; }

  .hero {
    padding: 1.25rem;
    margin-bottom: 1rem;
    border-radius: var(--radius-xl, 1.25rem);
    color: var(--txt, #fff);
    background: radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 22%, transparent), transparent 42%),
      var(--card, rgba(255, 255, 255, 0.055));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.11));
  }
  .hero-tag {
    display: inline-block;
    color: var(--txt3);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-size: var(--fs-xs, 0.72rem);
    font-weight: 800;
  }
  .hero h1 { margin: 0.3rem 0; font-size: clamp(1.7rem, 6vw, 2.5rem); }
  .sub { color: var(--txt2); margin: 0; line-height: 1.5; }
  .progress-pill {
    display: inline-block;
    margin: 0.8rem 0 0;
    padding: 0.4rem 0.85rem;
    border-radius: 999px;
    background: var(--bg-elev, rgba(0, 0, 0, 0.2));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    color: var(--txt2);
    font-size: var(--fs-sm, 0.85rem);
    font-weight: 700;
  }

  /* ---- Palco ---- */
  .stage {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 0.35rem;
    padding: 1.6rem 1.25rem 1.4rem;
    margin-bottom: 1rem;
    text-align: center;
    border-radius: var(--radius-xl, 1.25rem);
    background:
      radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 55%),
      var(--card, rgba(255, 255, 255, 0.055));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.11));
    overflow: hidden;
    min-height: 340px;
  }
  .stage-floor {
    position: absolute;
    left: 50%;
    top: 232px;
    width: 190px;
    height: 26px;
    transform: translateX(-50%);
    border-radius: 50%;
    background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.28), transparent 68%);
  }
  .stage-actor {
    position: relative;
    height: 200px;
    display: flex;
    align-items: flex-end;
    animation: stage-swap 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  /* Silhueta legível em QUALQUER tema: versão dessaturada e escurecida em
     vez de recorte 100% preto (invisível nos temas escuros). */
  .stage-actor.silhouette :global(img) {
    filter: grayscale(1) brightness(0.55) opacity(0.6) drop-shadow(0 0 10px rgba(255, 255, 255, 0.22));
  }
  .stage-lock {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 2.6rem;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
  }
  @keyframes stage-swap {
    0% { transform: scale(0.82); opacity: 0.2; }
    100% { transform: scale(1); opacity: 1; }
  }
  .stage-name {
    margin: 0.4rem 0 0;
    font-size: var(--fs-xl, 1.4rem);
    color: var(--txt, #fff);
  }
  .stage-desc {
    margin: 0;
    max-width: 42ch;
    color: var(--txt3);
    font-size: var(--fs-sm, 0.85rem);
    line-height: 1.45;
  }
  .stage-line {
    margin: 0.15rem 0 0;
    color: var(--txt2);
    font-size: var(--fs-sm, 0.88rem);
    font-style: italic;
  }
  .stage-hint {
    margin: 0.15rem 0 0;
    color: var(--txt2);
    font-size: var(--fs-sm, 0.88rem);
    font-weight: 700;
  }
  .stage-cta {
    margin-top: 0.65rem;
    min-width: 200px;
    min-height: 48px;
    padding: 0.7rem 1.6rem;
    border-radius: 14px;
    border: none;
    border-bottom: 4px solid color-mix(in srgb, var(--accent) 60%, #000);
    background: var(--accent, #ec4899);
    color: var(--on-accent, #fff);
    font: inherit;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    transition: transform var(--motion-fast, 120ms) ease, filter var(--motion-fast, 120ms) ease;
  }
  .stage-cta:hover { filter: brightness(1.06); }
  .stage-cta:active { transform: translateY(3px); border-bottom-width: 1px; }
  .stage-cta:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring, 0 0 0 3px color-mix(in srgb, var(--accent) 40%, transparent));
  }
  .stage-cta.is-active {
    display: inline-grid;
    place-items: center;
    background: var(--bg-elev, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.14));
    border-bottom-width: 1px;
    color: var(--txt2);
    cursor: default;
  }
  .stage-unlock { max-width: 240px; }
  .stage-loading {
    height: 300px;
    width: 100%;
    border-radius: var(--radius-lg, 1rem);
    background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.06) 50%, transparent 70%);
    background-size: 220% 100%;
    animation: stage-shimmer 1.4s linear infinite;
  }
  @keyframes stage-shimmer {
    0% { background-position: 130% 0; }
    100% { background-position: -90% 0; }
  }

  /* ---- Fila de personagens ---- */
  .rail {
    list-style: none;
    margin: 0;
    padding: 0.25rem 0.15rem 0.6rem;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(128px, 1fr);
    gap: 0.7rem;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;
  }
  .rail li { scroll-snap-align: center; }
  .rail-card {
    width: 100%;
    display: grid;
    justify-items: center;
    gap: 0.35rem;
    padding: 0.9rem 0.6rem 0.75rem;
    min-height: 44px;
    text-align: center;
    background: var(--card, rgba(255, 255, 255, 0.055));
    border: 2px solid var(--border, rgba(255, 255, 255, 0.11));
    border-radius: var(--radius-lg, 1rem);
    color: var(--txt, #fff);
    font: inherit;
    cursor: pointer;
    transition: transform var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease, box-shadow var(--motion-fast, 120ms) ease;
  }
  .rail-card:hover { transform: translateY(-3px); }
  .rail-card:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring, 0 0 0 2px var(--accent));
  }
  .rail-card.previewing {
    transform: translateY(-3px);
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .rail-card.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent);
  }
  .rail-card.locked :global(.mavatar img) {
    filter: grayscale(1) brightness(0.55) opacity(0.55);
  }
  .rail-art {
    position: relative;
    height: 68px;
    display: flex;
    align-items: flex-end;
  }
  /* Bob suave desfasado por cartão — a fila parece um banco de jogo. */
  .rail-art.bob {
    animation: rail-bob 2.8s ease-in-out infinite;
    animation-delay: var(--stagger, 0s);
  }
  @keyframes rail-bob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  .rail-lock {
    position: absolute;
    right: -8px;
    bottom: -2px;
    font-size: 1.05rem;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.55));
  }
  .rail-name { font-size: var(--fs-sm, 0.85rem); }
  .badge {
    padding: 0.24rem 0.6rem;
    border-radius: 999px;
    font-size: var(--fs-xs, 0.7rem);
    font-weight: 800;
  }
  .active-badge {
    background: var(--accent);
    color: var(--on-accent, #fff);
  }
  .pick-badge {
    background: var(--bg-elev, rgba(255, 255, 255, 0.07));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.14));
    color: var(--txt2);
  }

  /* ---- Progresso de desbloqueio (partilhado palco/fila) ---- */
  .unlock-progress {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    width: 100%;
    margin-top: 0.2rem;
  }
  .unlock-bar-wrap {
    display: block;
    width: 100%;
    height: 6px;
    background: var(--bg-elev, rgba(255, 255, 255, 0.08));
    border-radius: 999px;
    overflow: hidden;
  }
  .unlock-bar {
    display: block;
    height: 100%;
    background: var(--accent, #ec4899);
    border-radius: 999px;
    transition: width var(--motion-base, 220ms) ease;
  }
  .unlock-label {
    font-size: 0.68rem;
    color: var(--txt3, #94a3b8);
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    .stage-actor,
    .rail-art.bob,
    .stage-loading {
      animation: none;
    }
  }
</style>
