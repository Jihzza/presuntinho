<script lang="ts">
  // Secrets — Easter-egg hub (V4 port of V3 #pg-secrets).
  // Renders the 8 secret definitions (b7-b15) read from Dexie:
  //   - `secrets` table → whether each secret id was discovered
  //   - `badges` table  → whether each badge id (b7..b15) was unlocked
  // Hints are always visible; rewards unlock as the user discovers them.

  import { onMount } from 'svelte';
  import { db } from '$lib/state/db';

  interface SecretDef {
    id: string;
    icon: string;
    name: string;
    hint: string;
    reward: string;
    badge: string | null;        // V4 badge id (b7-b15) that proves unlock, or null
    badgeName?: string;          // human label of the badge
    nonBadgeCheck?: 'heart' | 'logo3' | 'mascot'; // ids that don't depend on a badge
  }

  // 8 secrets from V3 (static/legacy/assets/js/easter-eggs.js SECRET_DEFS).
  // Ported inline because easterEggs.ts doesn't export SECRET_DEFS today.
  const SECRET_DEFS: SecretDef[] = [
    {
      id: 'heart',
      icon: '❤️',
      name: 'The Loving Heart',
      hint: 'Clica no botão do coração. Muito.',
      reward: '+20 XP + confetti no clique 1, recompensas até 1000 cliques',
      badge: 'b10',
      badgeName: 'Hidden Room',
      nonBadgeCheck: 'heart'
    },
    {
      id: 'logo3',
      icon: '🐷',
      name: 'Pig Triple-Click',
      hint: 'Clica no 🐷 logo 3 vezes em 3 segundos.',
      reward: '+30 XP + confetti + Pig Hunter mode',
      badge: null,
      nonBadgeCheck: 'logo3'
    },
    {
      id: 'logo7',
      icon: '🧴',
      name: 'The Secret Room',
      hint: 'Clica no 🐷 logo 6-8 vezes em 3 segundos. (Tolerância: 6, 7 ou 8!)',
      reward: '+100 XP + Secret Room abre + 5 factos sobre perfume',
      badge: 'b14',
      badgeName: 'Secret Keeper'
    },
    {
      id: 'konami',
      icon: '🎮',
      name: 'Konami Code',
      hint: 'Carrega ↑ ↑ ↓ ↓ ← → ← → B A em qualquer lado da página.',
      reward: '+100 XP + Konami Master badge + confetti',
      badge: 'b8',
      badgeName: 'Konami Master'
    },
    {
      id: 'perfume',
      icon: '🌸',
      name: 'Scent Discovery',
      hint: 'Escreve a palavra "perfume" em qualquer lado.',
      reward: '+50 XP + Scent Discovery badge + confetti',
      badge: 'b7',
      badgeName: 'Scent Discovery'
    },
    {
      id: 'behi',
      icon: '🇹🇳',
      name: 'Tunisian Greeting',
      hint: 'Escreve a palavra Tunisiana "behi" (significa "lindíssimo/a") em qualquer lado.',
      reward: '+50 XP + Tunisian Secret badge + confetti',
      badge: 'b9',
      badgeName: 'Tunisian Secret'
    },
    {
      id: 'mascot',
      icon: '🧴',
      name: 'Mascot Pro-Tips',
      hint: 'Clica no 🧴 mascot (aparece depois da primeira navegação).',
      reward: 'Pro-tips aleatórios de escrita + +5 XP por clique',
      badge: null,
      nonBadgeCheck: 'mascot'
    },
    {
      id: 'footer',
      icon: '👣',
      name: 'Footer Detective',
      hint: 'Clica no texto do footer 5 vezes.',
      reward: 'Toast com dica sobre perfume/behi + Footer Detective badge',
      badge: 'b15',
      badgeName: 'Footer Detective'
    }
  ];

  // Reactive state
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
  function isUnlocked(s: SecretDef): boolean {
    if (s.badge && badges[s.badge]) return true;
    if (s.nonBadgeCheck === 'heart')  return heartClicks >= 1;
    if (s.nonBadgeCheck === 'logo3')  return logoClicks >= 3;
    if (s.nonBadgeCheck === 'mascot') return visitedCount >= 4;
    return false;
  }

  let discoveredCount = $derived(
    SECRET_DEFS.reduce((acc, s) => acc + (isUnlocked(s) ? 1 : 0), 0)
  );

  onMount(() => {
    void refresh();
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  });

  function fmtDate(ts: number): string {
    if (!ts) return '';
    try {
      return new Intl.DateTimeFormat('pt-PT', {
        dateStyle: 'short',
        timeStyle: 'short'
      }).format(new Date(ts));
    } catch {
      return new Date(ts).toLocaleString();
    }
  }
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
        {discoveredCount} / {SECRET_DEFS.length} discovered
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
    {#each SECRET_DEFS as s (s.id)}
      {@const unlocked = isUnlocked(s)}
      {@const wasDiscovered = Boolean(discovered[s.id])}
      <article class="secret-card" class:locked={!unlocked} class:unlocked>
        <div class="status-row">
          <span class="status-badge" class:on={unlocked}>
            {unlocked ? 'UNLOCKED' : 'LOCKED'}
          </span>
          {#if wasDiscovered && discoveredAt[s.id]}
            <span class="discovered-at">📅 {fmtDate(discoveredAt[s.id])}</span>
          {/if}
        </div>
        <h3>
          <span class="icon">{unlocked ? s.icon : '❓'}</span>
          {unlocked ? s.name : '???'}
        </h3>
        <p class="hint">💡 <strong>Dica:</strong> {s.hint}</p>
        <p class="reward">
          <strong>Recompensa:</strong>
          {#if unlocked}
            {s.reward}
            {#if s.badgeName}
              <span class="badge-tag">🏅 {s.badgeName}</span>
            {/if}
          {:else}
            <span class="redacted">████████ (locked)</span>
          {/if}
        </p>
      </article>
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
  .secret-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    padding: 1rem 1.15rem;
    transition: border-color 0.2s, background 0.2s;
  }
  .secret-card.unlocked {
    border-color: rgba(16, 185, 129, 0.4);
    background: rgba(16, 185, 129, 0.06);
  }
  .secret-card.locked {
    opacity: 0.85;
  }
  .status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  .status-badge {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--txt3, #94a3b8);
    border-radius: 999px;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
  }
  .status-badge.on {
    background: rgba(16, 185, 129, 0.18);
    border-color: rgba(16, 185, 129, 0.5);
    color: #6ee7b7;
  }
  .discovered-at {
    color: var(--txt3, #94a3b8);
    font-size: 0.72rem;
  }
  .secret-card h3 {
    color: #fff;
    font-size: 1.05rem;
    margin: 0 0 0.4rem;
  }
  .icon { margin-right: 0.25rem; }
  .hint, .reward {
    color: var(--txt2, #cbd5e1);
    font-size: 0.88rem;
    line-height: 1.5;
    margin: 0.3rem 0;
  }
  .redacted {
    color: var(--txt3, #94a3b8);
    font-family: ui-monospace, 'SF Mono', Consolas, monospace;
    letter-spacing: 0.04em;
  }
  .badge-tag {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.05rem 0.4rem;
    background: rgba(168, 85, 247, 0.18);
    border: 1px solid rgba(168, 85, 247, 0.4);
    color: #e9d5ff;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
  }
  .error {
    color: #ff8888;
    padding: 0.75rem 1rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 0.5rem;
  }
</style>
