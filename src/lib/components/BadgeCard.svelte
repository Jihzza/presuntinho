<script lang="ts">
  /**
   * BadgeCard — single badge tile.
   *
   * - icon: emoji or unicode glyph rendered at the top
   * - name: pt-PT short title
   * - description: one-line human description of how to earn it
   * - unlocked: visual + a11y toggle (locked badges get aria-disabled,
   *   reduced opacity, and a "Bloqueado" overlay)
   * - unlockedAt: optional timestamp for tooltip / future stats
   */

  import { locale, t } from 'svelte-i18n';

  interface Props {
    id: string;
    name: string;
    description: string;
    icon: string;
    unlocked: boolean;
    unlockedAt?: number;
  }

  let { id, name, description, icon, unlocked, unlockedAt }: Props = $props();

  let stateLabel = $derived(unlocked
    ? $t('components.badge.unlocked', { default: 'Desbloqueado' })
    : $t('components.badge.locked', { default: 'Bloqueado' }));
  // Bug-fix (task-181): pass `values` (not just `default`) so svelte-i18n
  // interpolates {name}/{description}/{status}/{state} placeholders. The
  // old pattern only used `default` and chained `.replace()`, which left
  // literals visible if any placeholder was missed (e.g. {state}).
  let ariaLabel = $derived(
    $t('components.badge.card.aria', {
      values: { name, description, status: stateLabel, state: stateLabel },
      default: `Conquista ${name}: ${description}. Estado: ${stateLabel}.`
    })
  );

  const dateLocale = $derived($locale || 'pt-PT');

  // Format unlock date in the active UI locale if we have one
  let unlockedDate = $derived<string | null>(
    unlocked && unlockedAt && unlockedAt > 0
      ? new Date(unlockedAt).toLocaleDateString(dateLocale, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })
      : null
  );
</script>

<div
  class="card"
  class:locked={!unlocked}
  role="group"
  aria-label={ariaLabel}
  aria-disabled={!unlocked}
  data-badge-id={id}
  title={unlockedDate ? `${name} — ${stateLabel} em ${unlockedDate}` : `${name} — ${stateLabel}`}
>
  <div class="icon" aria-hidden="true">{icon}</div>
  <div class="body">
    <h3 class="name">{name}</h3>
    <p class="desc">{description}</p>
    <div class="status" aria-hidden="true">
      {#if unlocked}
        <span class="status-dot status-dot--on"></span>
        <span>{$t('components.badge.unlocked', { default: 'Desbloqueado' })}{#if unlockedDate} · {unlockedDate}{/if}</span>
      {:else}
        <span class="status-dot status-dot--off"></span>
        <span>{$t('components.badge.locked', { default: 'Bloqueado' })}</span>
      {/if}
    </div>
  </div>
  {#if !unlocked}
    <div class="lock-overlay" aria-hidden="true">
      <span class="lock-icon">🔒</span>
    </div>
  {/if}
</div>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.5rem;
    padding: 1rem 0.75rem 0.85rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    color: #fff;
    min-height: 140px;
    overflow: hidden;
    transition: transform 0.15s, background 0.2s, border-color 0.2s;
  }
  .card.locked {
    opacity: 0.55;
    background: rgba(255, 255, 255, 0.025);
  }
  .card:not(.locked):hover {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-2px);
  }
  .icon {
    font-size: 2rem;
    line-height: 1;
    flex-shrink: 0;
  }
  .card.locked .icon {
    filter: grayscale(0.8);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
  }
  .name {
    font-size: 0.95rem;
    margin: 0;
    color: #fff;
    font-weight: 600;
    line-height: 1.2;
  }
  .desc {
    font-size: 0.75rem;
    color: #cbd5e1;
    margin: 0;
    line-height: 1.3;
  }
  .status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    font-size: 0.7rem;
    color: #94a3b8;
    margin-top: 0.25rem;
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .status-dot--on {
    background: #10b981;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
  }
  .status-dot--off {
    background: #64748b;
  }
  .lock-overlay {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    font-size: 0.85rem;
    line-height: 1;
    opacity: 0.7;
  }
  .lock-icon {
    display: inline-block;
  }

  @media (prefers-reduced-motion: reduce) {
    .card { transition: none; }
    .card:not(.locked):hover { transform: none; }
  }
</style>