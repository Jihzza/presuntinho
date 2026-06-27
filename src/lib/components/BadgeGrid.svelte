<script lang="ts">
  /**
   * BadgeGrid — responsive grid of BadgeCard tiles.
   *
   * - 2 columns on mobile (< 640px)
   * - 3 columns on tablet (>= 640px)
   * - 4 columns on desktop (>= 1024px)
   *
   * The badge catalog (id → icon/name/description) is hard-coded at the
   * top of the file. The runtime `badges` prop is a sparse record:
   *   { [id]: { unlocked: boolean, unlockedAt?: number } }
   * Missing entries default to "locked".
   */

  import BadgeCard from './BadgeCard.svelte';

  interface BadgeStatus {
    unlocked: boolean;
    unlockedAt?: number;
  }

  interface Props {
    badges: Record<string, BadgeStatus>;
  }

  let { badges }: Props = $props();

  interface BadgeDef {
    id: string;
    icon: string;
    name: string;
    description: string;
  }

  // Hard-coded catalog (pt-PT). Order = display order.
  // IDs match the Dexie `badges` table PKs.
  const BADGE_CATALOG: BadgeDef[] = [
    { id: 'b7',  icon: '🐷', name: 'Porquinha',     description: 'Clica no logo 3 vezes' },
    { id: 'b8',  icon: '❤️', name: 'Coração',       description: '5 cliques no coração' },
    { id: 'b9',  icon: '🎮', name: 'Konami',         description: 'Introduz o código Konami' },
    { id: 'b10', icon: '⌨️', name: 'Palavra Mágica', description: 'Escreve uma palavra-chave' },
    { id: 'b12', icon: '🦶', name: 'Pé',            description: 'Clica no footer' },
    { id: 'b13', icon: '🚪', name: 'Sala Secreta',   description: 'Descobre a sala secreta' },
    { id: 'b14', icon: '📚', name: 'Leitor',         description: 'Conclui uma lição' },
    { id: 'b15', icon: '🏆', name: 'Quizzmaster',    description: 'Responde todos os quizzes' }
  ];

  // Stats — derived from the catalog + badges prop
  let totalCount = $derived(BADGE_CATALOG.length);
  let unlockedCount = $derived(
    BADGE_CATALOG.filter((b) => badges[b.id]?.unlocked).length
  );
</script>

<div class="badge-grid" role="list" aria-label="Conquistas">
  <header class="grid-head" aria-hidden="true">
    <span class="grid-head-label">Conquistas</span>
    <span class="grid-head-count">{unlockedCount}/{totalCount}</span>
  </header>
  <div class="grid">
    {#each BADGE_CATALOG as def (def.id)}
      <div role="listitem">
        <BadgeCard
          id={def.id}
          name={def.name}
          description={def.description}
          icon={def.icon}
          unlocked={Boolean(badges[def.id]?.unlocked)}
          unlockedAt={badges[def.id]?.unlockedAt}
        />
      </div>
    {/each}
  </div>
</div>

<style>
  .badge-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .grid-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 0 0.25rem;
    color: #94a3b8;
    font-size: 0.8125rem;
  }
  .grid-head-count {
    font-variant-numeric: tabular-nums;
    color: #cbd5e1;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }
  @media (min-width: 640px) {
    .grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (min-width: 1024px) {
    .grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>