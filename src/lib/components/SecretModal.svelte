<script lang="ts">
  /**
   * SecretModal — appears when the user opens the Secret Room via the
   * easter egg pipeline (logoClick 6–8, perfume keyword, etc.).
   *
   * V3 had a hand-curated list of 5 perfume facts that surfaced inside
   * the modal — preserving that here so the room actually has content.
   * Closing dispatches `presuntinho:close-secret-room` and runs
   * `closeSRoom()` so the persistent `sroomOpened` flag flips back.
   */

  import { onMount } from 'svelte';
  import { closeSRoom } from '$lib/easterEggs';
  import { t } from 'svelte-i18n';

  interface Props {
    open: boolean;
    onClose?: () => void;
  }
  let { open = $bindable(false), onClose }: Props = $props();

  // 5 perfume facts (V3 hand-curated, preserved here). pt-PT.
  const PERFUME_FACT_KEYS = ['secret.fact.1', 'secret.fact.2', 'secret.fact.3', 'secret.fact.4', 'secret.fact.5'];

  function handleClose(): void {
    open = false;
    void closeSRoom();
    onClose?.();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open) handleClose();
  }

  onMount(() => {
    function onCloseEvent(): void {
      open = false;
      onClose?.();
    }
    window.addEventListener('presuntinho:close-secret-room', onCloseEvent);
    return () => {
      window.removeEventListener('presuntinho:close-secret-room', onCloseEvent);
    };
  });
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div
    class="overlay"
    onclick={handleClose}
    onkeydown={onKey}
    role="presentation"
  >
    <div
      class="modal"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="secret-title"
    >
      <button class="close" type="button" onclick={handleClose} aria-label={$t('secret.close')}>×</button>
      <h2 id="secret-title">{$t('secret.title')}</h2>
      <p class="lead">
        {$t('secret.lead')}
      </p>
      <ol class="facts" aria-label={$t('secret.facts_aria')}>
        {#each PERFUME_FACT_KEYS as factKey, i (i)}
          <li>{$t(factKey)}</li>
        {/each}
      </ol>
      <div class="actions">
        <button type="button" class="cta" onclick={handleClose}>{$t('secret.close')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9000;
    padding: 1rem;
    animation: overlay-in 0.18s ease;
  }
  .modal {
    background: linear-gradient(135deg, var(--bg, #1f2e4a) 0%, #2d4373 100%);
    border: 1px solid rgba(236, 72, 153, 0.4);
    border-radius: 1rem;
    padding: 2rem;
    max-width: 480px;
    width: 100%;
    position: relative;
    color: var(--txt, #fff);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    max-height: 90vh;
    overflow-y: auto;
  }
  .close {
    position: absolute;
    top: 0.5rem;
    right: 0.75rem;
    background: transparent;
    border: 0;
    color: #fff;
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
    padding: 0.5rem 0.65rem;
    min-width: 44px;
    min-height: 44px;
    border-radius: 0.375rem;
  }
  .close:hover,
  .close:focus-visible {
    color: var(--accent, #ec4899);
    background: rgba(255, 255, 255, 0.06);
    outline: none;
  }
  .close:focus-visible {
    box-shadow: 0 0 0 2px var(--accent, #ec4899);
  }
  h2 { margin: 0 0 1rem 0; color: var(--txt, #fff); }
  .lead {
    color: var(--txt2, #cbd5e1);
    margin: 0 0 1rem 0;
    font-size: 0.95rem;
  }
  .facts {
    margin: 0 0 1.25rem 0;
    padding-left: 1.25rem;
    color: var(--txt, #fff);
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
  .facts li {
    font-size: 0.95rem;
    line-height: 1.45;
    color: var(--txt, #fff);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
  .cta {
    padding: 0.65rem 1.1rem;
    background: var(--accent, #ec4899);
    color: #fff;
    border: 0;
    border-radius: 0.5rem;
    cursor: pointer;
    font-weight: 600;
    min-height: 44px;
    min-width: 44px;
    transition: background 0.2s ease;
  }
  .cta:hover,
  .cta:focus-visible {
    background: var(--accent-hover, #db2777);
    outline: none;
  }
  .cta:focus-visible {
    box-shadow: 0 0 0 2px #fff;
  }
  @keyframes overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .overlay { animation: none; }
  }
</style>
