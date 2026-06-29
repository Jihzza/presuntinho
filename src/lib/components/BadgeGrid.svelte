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
  import { t } from 'svelte-i18n';

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
  }

  // Catalog: only icon is hard-coded (it's a unicode glyph and identical
  // across locales). Name + description live in the i18n dictionary under
  // `components.badge.catalog.${id}.{name,description}` — see pt-PT.json
  // and the other 4 locale files. Order = display order; IDs match the
  // Dexie `badges` table PKs.
  const BADGE_CATALOG: BadgeDef[] = [
    { id: 'b7',  icon: '🐷' },
    { id: 'b8',  icon: '❤️' },
    { id: 'b9',  icon: '🎮' },
    { id: 'b10', icon: '⌨️' },
    { id: 'b12', icon: '🦶' },
    { id: 'b13', icon: '🚪' },
    { id: 'b14', icon: '📚' },
    { id: 'b15', icon: '🏆' }
  ];

  // pt-PT fallbacks for the catalog (used by $t()'s `default` option and
  // also rendered directly when the i18n dictionary is missing the key).
  // Keeping the source-of-truth in pt-PT.json is the long-term goal, but
  // these local fallbacks guarantee the page never goes blank if a key is
  // accidentally removed.
  const PT_NAMES: Record<string, string> = {
    b7:  'Porquinha',
    b8:  'Coração',
    b9:  'Konami',
    b10: 'Palavra Mágica',
    b12: 'Pé',
    b13: 'Sala Secreta',
    b14: 'Leitor',
    b15: 'Quizzmaster'
  };
  const PT_DESCRIPTIONS: Record<string, string> = {
    b7:  'Clica no logo 3 vezes',
    b8:  '5 cliques no coração',
    b9:  'Introduz o código Konami',
    b10: 'Escreve uma palavra-chave',
    b12: 'Clica no footer',
    b13: 'Descobre a sala secreta',
    b14: 'Conclui uma lição',
    b15: 'Responde todos os quizzes'
  };

  // Stats — derived from the catalog + badges prop
  let totalCount = $derived(BADGE_CATALOG.length);
  let unlockedCount = $derived(
    BADGE_CATALOG.filter((b) => badges[b.id]?.unlocked).length
  );
</script>

<div class="badge-grid" role="list" aria-label={$t('components.badge.grid.aria', { default: 'Conquistas' })}>
  <header class="grid-head" aria-hidden="true">
    <span class="grid-head-label">{$t('components.badge.grid.heading', { default: 'Conquistas' })}</span>
    <span class="grid-head-count">{unlockedCount}/{totalCount}</span>
  </header>
  <div class="grid">
    {#each BADGE_CATALOG as def (def.id)}
      {@const name = $t(`components.badge.catalog.${def.id}.name`, {
        default: PT_NAMES[def.id]
      }) ?? PT_NAMES[def.id]}
      {@const description = $t(
        `components.badge.catalog.${def.id}.description`,
        { default: PT_DESCRIPTIONS[def.id] }
      ) ?? PT_DESCRIPTIONS[def.id]}
      <div role="listitem">
        <BadgeCard
          id={def.id}
          {name}
          {description}
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