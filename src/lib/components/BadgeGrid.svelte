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
  // V10 — the catalog moved to a shared module so BadgeUnlockModal and this
  // grid can never drift apart again (the V4–V9 copy had labels that no
  // longer matched the actual award triggers).
  import {
    BADGE_CATALOG,
    BADGE_PT_DESCRIPTIONS,
    BADGE_PT_NAMES
  } from '$lib/gamification/badge-catalog';

  interface BadgeStatus {
    unlocked: boolean;
    unlockedAt?: number;
  }

  interface Props {
    badges: Record<string, BadgeStatus>;
  }

  let { badges }: Props = $props();

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
        default: BADGE_PT_NAMES[def.id]
      }) ?? BADGE_PT_NAMES[def.id]}
      {@const description = $t(
        `components.badge.catalog.${def.id}.description`,
        { default: BADGE_PT_DESCRIPTIONS[def.id] }
      ) ?? BADGE_PT_DESCRIPTIONS[def.id]}
      <div role="listitem">
        <BadgeCard
          id={def.id}
          {name}
          {description}
          icon={def.icon}
          tier={def.tier}
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
    color: var(--txt3);
    font-size: 0.8125rem;
  }
  .grid-head-count {
    font-variant-numeric: tabular-nums;
    color: var(--txt2);
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