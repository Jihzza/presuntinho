<script lang="ts">
  // Secrets — Easter-egg hub (V6 port of V3 #pg-secrets).
  // Renders 12 secret definitions from /config/easterEggs.json (single source
  // of truth) using the shared <EasterEggsCard /> component.
  //
  // Phase 22 — adds two NEW sections after the secrets grid:
  //   1. ❤️ Heart Tiers — vertical timeline of the 11 click milestones
  //      from easterEggs.json#heartTiers, with the user's current
  //      heartClicks highlighted.
  //   2. 🏷️ Badges — full grid of all 15 badges (config-driven); unlocked
  //      badges render in color, locked badges are grayscale with a "???"
  //      label. Reuses the shared <BadgeCard /> component.

  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { db } from '$lib/state/db';
  import {
    getSecrets,
    getBadges,
    getHeartTiers,
    type Secret,
    type Badge,
    type HeartTier
  } from '$lib/easterEggsConfig';
  import EasterEggsCard from '$lib/components/EasterEggsCard.svelte';
  import BadgeCard from '$lib/components/BadgeCard.svelte';

  /** Sparse badge record: id → { unlocked, unlockedAt }. */
  interface BadgeStatus {
    unlocked: boolean;
    unlockedAt: number;
  }

  // Reactive state
  let secrets = $state<Secret[]>([]);
  let discovered = $state<Record<string, boolean>>({});
  let discoveredAt = $state<Record<string, number>>({});
  let badges = $state<Record<string, BadgeStatus>>({});
  let heartTiers = $state<HeartTier[]>([]);
  let badgeCatalog = $state<Badge[]>([]);
  let heartClicks = $state(0);
  let logoClicks = $state(0);
  let visitedCount = $state(0);
  let loadError = $state<string | null>(null);

  async function refresh(): Promise<void> {
    if (typeof indexedDB === 'undefined') return; // SSR guard
    try {
      const d = db();

      // 1. Secrets table (which secrets the user has explicitly discovered)
      const secretRows = await d.secrets.toArray();
      const dMap: Record<string, boolean> = {};
      const daMap: Record<string, number> = {};
      for (const r of secretRows) {
        dMap[r.id] = Boolean(r.discovered);
        daMap[r.id] = r.discoveredAt ?? 0;
      }
      discovered = dMap;
      discoveredAt = daMap;

      // 2. Badges table (b1-b15)
      const badgeRows = await d.badges.toArray();
      const bMap: Record<string, BadgeStatus> = {};
      for (const r of badgeRows) {
        bMap[r.id] = {
          unlocked: Boolean(r.unlocked),
          unlockedAt: Number(r.unlockedAt ?? 0)
        };
      }
      badges = bMap;

      // 3. Non-badge unlock conditions
      const stateRow = await d.state.get('main');
      heartClicks = Number(stateRow?.heartMaxClicks ?? 0);
      logoClicks = Number(stateRow?.logoClicks ?? 0);

      const visitedRows = await d.visited.toArray();
      visitedCount = visitedRows.length;
    } catch (e) {
      console.error('[secrets] refresh failed', e);
      loadError = e instanceof Error ? e.message : String(e);
    }
  }

  /**
   * Determine if a secret is unlocked. Mirrors V3 `isSecretUnlocked()`:
   *   - If it has a badge, the badge being unlocked counts.
   *   - 'heart' unlocks at heartMaxClicks >= 1.
   *   - 'logo3' unlocks at logoClicks >= 3.
   *   - 'mascot' unlocks after 4 visited pages.
   */
  function isUnlocked(s: Secret): boolean {
    if (s.badge && badges[s.badge]?.unlocked) return true;
    if (s.id === 'heart')  return heartClicks >= 1;
    if (s.id === 'logo3')  return logoClicks >= 3;
    if (s.id === 'mascot') return visitedCount >= 4;
    return false;
  }

  let discoveredCount = $derived(
    secrets.reduce((acc, s) => acc + (isUnlocked(s) ? 1 : 0), 0)
  );

  let unlockedBadgesCount = $derived(
    badgeCatalog.reduce((acc, b) => acc + (badges[b.id]?.unlocked ? 1 : 0), 0)
  );

  let unlockedTiersCount = $derived(
    heartTiers.reduce((acc, t) => acc + (heartClicks >= t.at ? 1 : 0), 0)
  );

  onMount(() => {
    // Load all three lists from /config/easterEggs.json in parallel — they
    // share the same underlying cache so this is one network round trip.
    Promise.all([getSecrets(), getBadges(), getHeartTiers()])
      .then(([s, b, ht]) => {
        secrets = s;
        badgeCatalog = b;
        heartTiers = ht;
      })
      .catch((e) => {
        console.error('[secrets] config load failed', e);
        loadError = e instanceof Error ? e.message : String(e);
        secrets = [];
        badgeCatalog = [];
        heartTiers = [];
      });

    void refresh();
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  });
</script>

<svelte:head>
  <title>🔐 {$t('routes.secrets.title', { default: 'Secrets' })} · Presuntinho</title>
</svelte:head>

<div class="secrets">
  <header class="secrets-head">
    <p class="breadcrumb">
      <a href="/">{$t('secrets.breadcrumb.home', { default: '← Hub' })}</a>
      <span class="sep">›</span>
      <span>{$t('secrets.breadcrumb.current', { default: 'Secrets' })}</span>
    </p>
    <span class="tag">🔐 Escondido</span>
    <h1>
      🔐 Secrets
      <span class="counter" aria-live="polite">
        {discoveredCount} / {secrets.length} discovered
      </span>
    </h1>
    <p class="sub">{$t('routes.secrets.subtitle', { default: 'As dicas estão sempre visíveis. As recompensas desbloqueiam à medida que descobres cada easter egg.' })}</p>
  </header>

  {#if loadError}
    <p class="error">⚠️ Não foi possível ler o estado: {loadError}</p>
  {/if}

  <article class="card">
    <h2>🗝️ Encontra-os todos</h2>
    <p>
      Clica, escreve e explora. Alguns segredos recompensam-te instantaneamente; outros
      revelam-se quando fores mais fundo. Cada descoberta fica guardada no teu browser —
      fecha a página e o teu progresso persiste.
    </p>
  </article>

  <section class="grid" aria-label="{$t('a11y.aria.segredos', { default: 'Segredos' })}">
    {#each secrets as s (s.id)}
      <EasterEggsCard
        secret={s}
        unlocked={isUnlocked(s)}
        discoveredAt={discoveredAt[s.id] || null}
      />
    {/each}
  </section>

  <!-- Phase 22: ❤️ Heart Tiers — vertical timeline of click milestones -->
  <section class="tiers" aria-label={$t('secrets.heartTiersTitle')}>
    <header class="section-head">
      <h2>{$t('secrets.heartTiersTitle')}</h2>
      <span class="counter" aria-live="polite">
        {unlockedTiersCount} / {heartTiers.length} unlocked
      </span>
    </header>
    <p class="section-sub">
      Clica no <strong>❤️</strong> no Hub para subir os tiers. Cada tier recompensa-te com XP e confetti.
      <span class="heart-progress">
        Tuas cliques: <strong>{heartClicks}</strong>
      </span>
    </p>
    <ol class="tier-list" role="list">
      {#each heartTiers as tier (tier.at)}
        {@const isReached = heartClicks >= tier.at}
        <li
          class="tier"
          class:reached={isReached}
          aria-label={`${tier.at} cliques: ${tier.msg} — ${isReached ? 'Desbloqueado' : 'Bloqueado'}`}
        >
          <div class="tier-marker" aria-hidden="true">
            <span class="tier-emoji">{tier.emoji}</span>
          </div>
          <div class="tier-body">
            <div class="tier-line">
              <span class="tier-at">@{tier.at}</span>
              <span class="tier-xp" aria-label={`${tier.xp} XP`}>+{tier.xp} XP</span>
              {#if tier.conf > 0}
                <span class="tier-conf" aria-label={`${tier.conf} confetti`}>🎉 {tier.conf}</span>
              {/if}
            </div>
            <p class="tier-msg">{tier.msg}</p>
          </div>
          <div class="tier-status" aria-hidden="true">
            {#if isReached}
              <span class="status status--on">❤️</span>
            {:else}
              <span class="status status--off">🔒</span>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  </section>

  <!-- Phase 22: 🏷️ Badges — all 15 config-driven badges, locked ones grayscale -->
  <section class="badges" aria-label={$t('secrets.badgesTitle')}>
    <header class="section-head">
      <h2>{$t('secrets.badgesTitle')}</h2>
      <span class="counter" aria-live="polite">
        {unlockedBadgesCount} / {badgeCatalog.length} unlocked
      </span>
    </header>
    <p class="section-sub">
      15 conquistas para coleccionar. As bloqueadas ficam a cinzento até as desbloqueares.
    </p>
    <div class="badge-grid" role="list">
      {#each badgeCatalog as b (b.id)}
        {@const status = badges[b.id]}
        {@const isUnlockedBadge = Boolean(status?.unlocked)}
        {#if isUnlockedBadge}
          <BadgeCard
            id={b.id}
            name={b.label}
            description={`Distintivo ${b.label}`}
            icon={b.icon}
            unlocked={true}
            unlockedAt={status?.unlockedAt}
          />
        {:else}
          <!-- Locked tile: grayscale card with "???" label and hidden icon. -->
          <div
            class="badge-locked"
            role="group"
            aria-label={`Conquistado ${b.label}: bloqueado.`}
            aria-disabled="true"
            data-badge-id={b.id}
          >
            <div class="icon" aria-hidden="true">???</div>
            <h3 class="name">{b.label}</h3>
            <p class="desc">🔒 {b.id}</p>
            <div class="status" aria-hidden="true">
              <span class="status-dot status-dot--off"></span>
              <span>{$t('secrets.locked', { default: 'Bloqueado' })}</span>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </section>
</div>

<style>
  .secrets {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .secrets-head { margin-bottom: 1.5rem; }
  .secrets-head h1 {
    color: #fff;
    margin: 0.25rem 0 0.5rem;
    font-size: 2rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }
  .counter {
    font-size: 0.95rem;
    color: #fde68a;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.35);
    padding: 0.2rem 0.7rem;
    border-radius: 999px;
    font-weight: 600;
  }
  .breadcrumb {
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    margin: 0 0 0.5rem;
  }
  .breadcrumb a {
    color: var(--accent, #ec4899);
    text-decoration: none;
  }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }

  .tag {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    background: rgba(168, 85, 247, 0.2);
    border: 1px solid rgba(168, 85, 247, 0.5);
    color: #e9d5ff;
    border-radius: 999px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }
  .sub {
    color: var(--txt2, #cbd5e1);
    margin: 0;
  }

  .card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    padding: 1.25rem;
    margin-bottom: 1rem;
  }
  .card h2 {
    color: #fff;
    font-size: 1.15rem;
    margin: 0 0 0.4rem;
  }
  .card p {
    color: var(--txt2, #cbd5e1);
    line-height: 1.55;
    margin: 0.4rem 0;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
  @media (min-width: 720px) {
    .grid { grid-template-columns: repeat(2, 1fr); }
  }

  .error {
    color: #ff8888;
    padding: 0.75rem 1rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 0.5rem;
  }

  /* ---------------------------------------------------------------
   * Phase 22: shared section-head used by .tiers and .badges
   * ------------------------------------------------------------- */
  .section-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin: 1.75rem 0 0.5rem;
  }
  .section-head h2 {
    color: #fff;
    margin: 0;
    font-size: 1.25rem;
  }
  .section-sub {
    color: var(--txt2, #cbd5e1);
    margin: 0 0 0.75rem;
    line-height: 1.5;
    font-size: 0.92rem;
  }

  /* ---------------------------------------------------------------
   * Phase 22: ❤️ Heart Tiers — vertical timeline
   * ------------------------------------------------------------- */
  .tiers {
    margin-top: 2rem;
  }
  .heart-progress strong {
    color: #fde68a;
    font-variant-numeric: tabular-nums;
  }
  .tier-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .tier {
    display: grid;
    grid-template-columns: 56px 1fr auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.65rem 0.85rem;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.6rem;
    transition: background 0.2s, border-color 0.2s, transform 0.15s;
  }
  .tier.reached {
    background: rgba(236, 72, 153, 0.08);
    border-color: rgba(236, 72, 153, 0.35);
  }
  .tier:not(.reached) .tier-emoji {
    filter: grayscale(0.9);
    opacity: 0.55;
  }
  .tier:not(.reached) .tier-msg {
    color: var(--txt3, #94a3b8);
  }
  .tier-marker {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    flex-shrink: 0;
  }
  .tier.reached .tier-marker {
    background: rgba(236, 72, 153, 0.18);
  }
  .tier-body {
    min-width: 0;
  }
  .tier-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    margin-bottom: 0.15rem;
  }
  .tier-at {
    color: #fde68a;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .tier-xp {
    color: #10b981;
    font-weight: 600;
    font-size: 0.78rem;
  }
  .tier-conf {
    color: #c084fc;
    font-size: 0.78rem;
  }
  .tier-msg {
    margin: 0;
    color: var(--txt2, #cbd5e1);
    font-size: 0.92rem;
    line-height: 1.4;
  }
  .tier-status .status {
    font-size: 1.2rem;
    line-height: 1;
  }
  .status--off { opacity: 0.45; }

  @media (max-width: 540px) {
    .tier {
      grid-template-columns: 44px 1fr;
      grid-template-rows: auto auto;
    }
    .tier-status {
      grid-column: 2 / 3;
      grid-row: 2 / 3;
      text-align: right;
    }
  }

  /* ---------------------------------------------------------------
   * Phase 22: 🏷️ Badges — full catalog grid (locked = grayscale ???)
   * ------------------------------------------------------------- */
  .badges {
    margin-top: 2rem;
  }
  .badge-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }
  @media (min-width: 640px) {
    .badge-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (min-width: 1024px) {
    .badge-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }

  /* Locked badge tile — mirrors BadgeCard layout but grayscale + "???". */
  .badge-locked {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.5rem;
    padding: 1rem 0.75rem 0.85rem;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    color: #fff;
    min-height: 140px;
    overflow: hidden;
    opacity: 0.55;
  }
  .badge-locked .icon {
    font-size: 2rem;
    line-height: 1;
    filter: grayscale(0.85);
    color: #94a3b8;
    letter-spacing: 0.15em;
  }
  .badge-locked .name {
    font-size: 0.95rem;
    margin: 0;
    color: #cbd5e1;
    font-weight: 600;
    line-height: 1.2;
  }
  .badge-locked .desc {
    font-size: 0.72rem;
    color: var(--txt3, #94a3b8);
    margin: 0;
    line-height: 1.3;
  }
  .badge-locked .status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    font-size: 0.7rem;
    color: #94a3b8;
    margin-top: 0.25rem;
  }
  .badge-locked .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .badge-locked .status-dot--off {
    background: #64748b;
  }

  @media (prefers-reduced-motion: reduce) {
    .tier { transition: none; }
  }
</style>
