<script lang="ts">
  import { onMount } from 'svelte';
  import { closeSRoom } from '$lib/easterEggs';

  interface Props {
    open: boolean;
    onClose?: () => void;
  }
  let { open = $bindable(false), onClose }: Props = $props();

  function handleClose() {
    open = false;
    onClose?.();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) handleClose();
  }

  // Close via Secret Room closed event (easterEggs.ts closeSRoom)
  onMount(() => {
    function onCloseEvent() {
      open = false;
      onClose?.();
    }
    window.addEventListener('presuntinho:close-secret-room', onCloseEvent);
    return () => {
      window.removeEventListener('presuntinho:close-secret-room', onCloseEvent);
    };
  });

  // Award badge + secret when modal opens (V3 awardBadge('b10') + discoverSecret('hidden-room'))
  $effect(() => {
    if (open) {
      void closeSRoom().then(() => {
        // closeSRoom closes it, so immediately reopen if we just opened it
        open = true;
      });
    }
  });
</script>

<svelte:window on:keydown={onKey} />

{#if open}
  <div class="overlay" onclick={handleClose} onkeydown={onKey} role="presentation">
    <div
      class="modal"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="secret-title"
    >
      <button class="close" onclick={handleClose} aria-label="Fechar">×</button>
      <h2 id="secret-title">🚪 Secret Room</h2>
      <p>Bem-vinda! Aqui ficarão os segredos desbloqueados. (Em construção — Phase 4+)</p>
      <button class="cta" onclick={handleClose}>Fechar</button>
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
  }
  .modal {
    background: linear-gradient(135deg, #1f2e4a 0%, #2d4373 100%);
    border: 1px solid rgba(236, 72, 153, 0.4);
    border-radius: 1rem;
    padding: 2rem;
    max-width: 480px;
    width: 100%;
    position: relative;
    color: #fff;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
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
    padding: 0.25rem 0.5rem;
  }
  .close:hover { color: #ec4899; }
  h2 { margin: 0 0 1rem 0; }
  .cta {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: #ec4899;
    color: #fff;
    border: 0;
    border-radius: 0.5rem;
    cursor: pointer;
    font-weight: 600;
  }
  .cta:hover { background: #d63780; }
</style>