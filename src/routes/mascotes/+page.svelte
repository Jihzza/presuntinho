<script lang="ts">
  /**
   * /mascotes — mascot collection (V9 Duolingo layer).
   *
   * Cute grid of collectible mascots: unlocked ones are pickable (the
   * active one gets a ring), locked ones are greyed out with their
   * unlock hint. Picking dispatches 'presuntinho:mascot-changed' (via
   * setActiveMascot) so the FAB updates instantly, shows a toast, and
   * makes the picked mascot wave.
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { showToast } from '$lib/components/events';
  import {
    MASCOTS,
    mascotStatuses,
    setActiveMascot,
    type MascotStatus,
    type MascotUnlockContext
  } from '$lib/gamification/mascots';

  let statuses = $state<MascotStatus[]>(
    MASCOTS.map((def) => ({ ...def, unlocked: false, active: false }))
  );
  let ctx = $state<MascotUnlockContext>({ xp: 0, badges: 0 });
  let loaded = $state(false);
  /** Id of the mascot currently doing its little wave animation. */
  let wavingId = $state<string | null>(null);
  let waveTimer: ReturnType<typeof setTimeout> | undefined;

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

  onMount(() => {
    void refresh();
    return () => clearTimeout(waveTimer);
  });

  function nameOf(m: MascotStatus): string {
    return $t(`mascots.${m.id}.name`, { default: m.id });
  }

  async function pick(m: MascotStatus): Promise<void> {
    if (!m.unlocked || m.active) return;
    try {
      await setActiveMascot(m.id);
      statuses = statuses.map((s) => ({ ...s, active: s.id === m.id }));
      wavingId = m.id;
      clearTimeout(waveTimer);
      waveTimer = setTimeout(() => (wavingId = null), 1200);
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

  <ul class="grid" aria-label={$t('mascots.page.grid_aria', { default: 'Coleção de mascotes' })}>
    {#each statuses as m (m.id)}
      <li>
        <button
          type="button"
          class="mascot-card card"
          class:active={m.active}
          class:locked={!m.unlocked}
          onclick={() => pick(m)}
          disabled={!m.unlocked}
          aria-pressed={m.active}
          aria-label={m.unlocked
            ? $t('mascots.page.pick_aria', { values: { name: nameOf(m) }, default: 'Escolher {name}' })
            : `${nameOf(m)} — ${unlockHint(m)}`}
        >
          <span class="emoji" class:wave={wavingId === m.id} aria-hidden="true">{m.emoji}</span>
          <strong class="name">{nameOf(m)}</strong>
          <small class="desc">{$t(`mascots.${m.id}.desc`, { default: '' })}</small>
          {#if m.unlocked}
            <em class="line">“{$t(`mascots.${m.id}.line`, { default: '' })}”</em>
          {/if}
          {#if m.active}
            <span class="badge active-badge">{$t('mascots.page.active', { default: '✓ Ativa' })}</span>
          {:else if m.unlocked}
            <span class="badge pick-badge">{$t('mascots.page.pick', { default: 'Escolher' })}</span>
          {:else}
            <span class="badge lock-badge">🔒 {unlockHint(m)}</span>
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
  /* V10 — unlock progress on locked mascots */
  .unlock-progress {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    width: 100%;
    margin-top: 0.35rem;
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
    margin-bottom: 1.25rem;
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

  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.85rem;
  }
  .mascot-card {
    width: 100%;
    display: grid;
    justify-items: center;
    gap: 0.3rem;
    padding: 1.1rem 0.8rem 0.9rem;
    min-height: 44px;
    text-align: center;
    background: var(--card, rgba(255, 255, 255, 0.055));
    border: 2px solid var(--border, rgba(255, 255, 255, 0.11));
    border-radius: var(--radius-lg, 1rem);
    color: var(--txt, #fff);
    font: inherit;
    cursor: pointer;
    transition: transform var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease;
  }
  .mascot-card:hover:not(:disabled) { transform: translateY(-2px); }
  .mascot-card:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring, 0 0 0 2px var(--accent));
  }
  .mascot-card.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .mascot-card.locked {
    cursor: not-allowed;
    opacity: 0.55;
    filter: grayscale(0.7);
  }
  .emoji {
    font-size: 2.6rem;
    line-height: 1;
    transform-origin: 70% 80%;
  }
  .emoji.wave { animation: mascot-wave 1.1s ease; }
  @keyframes mascot-wave {
    0%, 100% { transform: rotate(0deg); }
    20% { transform: rotate(-14deg) scale(1.1); }
    40% { transform: rotate(12deg) scale(1.12); }
    60% { transform: rotate(-8deg) scale(1.08); }
    80% { transform: rotate(6deg) scale(1.04); }
  }
  .name { font-size: var(--fs-sm, 0.92rem); }
  .desc { color: var(--txt3); font-size: var(--fs-xs, 0.74rem); line-height: 1.35; }
  .line {
    color: var(--txt2);
    font-size: var(--fs-xs, 0.74rem);
    font-style: italic;
  }
  .badge {
    margin-top: 0.35rem;
    padding: 0.28rem 0.7rem;
    border-radius: 999px;
    font-size: var(--fs-xs, 0.72rem);
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
  .lock-badge {
    background: var(--bg-elev, rgba(0, 0, 0, 0.2));
    color: var(--txt3);
    filter: none;
  }
</style>
