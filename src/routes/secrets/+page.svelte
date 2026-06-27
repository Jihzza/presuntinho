<script lang="ts">
  // Secrets — Easter-egg hub (V6 port of V3 #pg-secrets).
  // Renders 12 secret definitions from /config/easterEggs.json (single source
  // of truth) using the shared <EasterEggsCard /> component.

  import { onMount } from 'svelte';
  import { db } from '$lib/state/db';
  import { getSecrets, type Secret } from '$lib/easterEggsConfig';
  import EasterEggsCard from '$lib/components/EasterEggsCard.svelte';

  // Reactive state
  let secrets = $state<Secret[]>([]);
  let discovered = $state<Record<string, boolean>>({});
  let discoveredAt = $state<Record<string, number>>({});
  let badges = $state<Record<string, boolean>>({});
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

      // 2. Badges table (b7-b15)
      const badgeRows = await d.badges.toArray();
      const bMap: Record<string, boolean> = {};
      for (const r of badgeRows) bMap[r.id] = Boolean(r.unlocked);
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
    if (s.badge && badges[s.badge]) return true;
    if (s.id === 'heart')  return heartClicks >= 1;
    if (s.id === 'logo3')  return logoClicks >= 3;
    if (s.id === 'mascot') return visitedCount >= 4;
    return false;
  }

  let discoveredCount = $derived(
    secrets.reduce((acc, s) => acc + (isUnlocked(s) ? 1 : 0), 0)
  );

  onMount(() => {
    // Load secrets from /config/easterEggs.json (async, doesn't block mount).
    getSecrets()
      .then((s) => {
        secrets = s;
      })
      .catch((e) => {
        console.error('[secrets] getSecrets failed', e);
        loadError = e instanceof Error ? e.message : String(e);
        secrets = [];
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
  <title>🔐 Secrets · Presuntinho</title>
</svelte:head>

<div class="secrets">
  <header class="secrets-head">
    <p class="breadcrumb">
      <a href="/">Hub</a>
      <span class="sep">›</span>
      <span>Secrets</span>
    </p>
    <span class="tag">🔐 Escondido</span>
    <h1>
      🔐 Secrets
      <span class="counter" aria-live="polite">
        {discoveredCount} / {secrets.length} discovered
      </span>
    </h1>
    <p class="sub">As dicas estão sempre visíveis. As recompensas desbloqueiam à medida que descobres cada easter egg.</p>
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

  <section class="grid" aria-label="Segredos">
    {#each secrets as s (s.id)}
      <EasterEggsCard
        secret={s}
        unlocked={isUnlocked(s)}
        discoveredAt={discoveredAt[s.id] || null}
      />
    {/each}
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
</style>
