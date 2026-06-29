<script lang="ts">
  import { t } from 'svelte-i18n';
  import type { Secret } from '$lib/easterEggsConfig';

  export let secret: Secret;
  export let unlocked: boolean = false;
  export let discoveredAt: number | null = null;

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleString('pt-PT', { dateStyle: 'medium', timeStyle: 'short' });
  }
</script>

<article
  class="secret-card"
  class:unlocked
  class:locked={!unlocked}
  aria-label={unlocked
    ? $t('easterEggs.aria.unlocked', { default: 'Segredo descoberto' })
    : $t('easterEggs.aria.locked', { default: 'Segredo por descobrir' })}
>
  <header>
    <span class="icon" aria-hidden="true">{secret.icon}</span>
    <span class="status">{unlocked
      ? $t('easterEggs.status.unlocked', { default: '🔓 UNLOCKED' })
      : $t('easterEggs.status.locked', { default: '🔒 LOCKED' })}</span>
  </header>
  <h3>{secret.name}</h3>
  <p class="hint">💡 {secret.hint}</p>
  <p class="reward">{unlocked ? secret.reward : 'Reward: ████████ (locked)'}</p>
  {#if discoveredAt}
    <p class="discovered">📅 Descoberto: {formatDate(discoveredAt)}</p>
  {/if}
  {#if secret.badge}
    <p class="badge-line">🏷️ Badge: <code>{secret.badge}</code></p>
  {/if}
</article>

<style>
  .secret-card {
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
    background: var(--card, rgba(255, 255, 255, 0.05));
    transition: transform 0.2s ease;
  }
  .secret-card:hover {
    transform: translateY(-2px);
  }
  @media (prefers-reduced-motion: reduce) {
    .secret-card:hover {
      transform: none;
    }
  }
  .secret-card.unlocked {
    border-color: var(--success, #10b981);
    background: rgba(16, 185, 129, 0.05);
  }
  .secret-card header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  .icon {
    font-size: 2rem;
  }
  .status {
    font-size: 0.75rem;
    font-weight: 600;
  }
  .hint {
    color: var(--txt2, #cbd5e1);
    margin: 0.5rem 0;
  }
  .reward {
    font-size: 0.875rem;
    color: var(--txt3, #94a3b8);
    margin: 0.5rem 0;
  }
  .discovered {
    font-size: 0.75rem;
    color: var(--txt3, #94a3b8);
    margin-top: 0.5rem;
  }
  .badge-line {
    font-size: 0.75rem;
    margin-top: 0.5rem;
  }
</style>