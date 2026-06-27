<script lang="ts">
  /**
   * OnboardingModal — first-visit welcome dialog for the Hub.
   *
   * Shown once when the user lands on `/` for the first time (no
   * `fat-onboarded` flag in localStorage). The parent owns the
   * `open` state and the persistence — when the user dismisses via
   * the CTA / backdrop / Escape, the parent sets the flag and
   * flips `open` back to `false`. We never show this modal again.
   *
   * Accessibility:
   *   - role="dialog" + aria-modal="true" + aria-labelledby
   *   - Escape closes
   *   - Tab / Shift+Tab cycle within the modal (focus trap)
   *   - Focus is moved to the dialog on open
   *   - @media (prefers-reduced-motion: reduce) disables the slide-up
   */

  import { onMount, tick } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { subApps } from '$lib/registry';

  interface Props {
    open: boolean;
    onClose: () => void;
  }
  let { open = false, onClose }: Props = $props();

  // Refs for focus trap
  let dialogEl = $state<HTMLDivElement | null>(null);
  let ctaBtn = $state<HTMLButtonElement | null>(null);
  let closeBtn = $state<HTMLButtonElement | null>(null);

  // Remember the element that had focus before the modal opened so we
  // can restore it on close (a11y best practice).
  let lastFocused: HTMLElement | null = null;

  async function moveFocusIntoDialog(): Promise<void> {
    await tick();
    if (!dialogEl) return;
    // Prefer the CTA so keyboard users land on the primary action,
    // fall back to the dialog itself.
    const target = ctaBtn ?? closeBtn ?? dialogEl;
    target.focus();
  }

  function focusableElements(): HTMLElement[] {
    if (!dialogEl) return [];
    const selector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(dialogEl.querySelectorAll<HTMLElement>(selector));
  }

  function handleKey(e: KeyboardEvent): void {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Tab') {
      const items = focusableElements();
      if (items.length === 0) {
        // Nothing focusable inside — keep focus on the dialog itself.
        e.preventDefault();
        dialogEl?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !dialogEl?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !dialogEl?.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  function handleOverlayClick(e: MouseEvent): void {
    // Only fire when the click lands on the overlay itself, not bubbled
    // from inside the dialog.
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  $effect(() => {
    if (open) {
      lastFocused = (document.activeElement as HTMLElement | null) ?? null;
      void moveFocusIntoDialog();
    } else if (lastFocused && typeof lastFocused.focus === 'function') {
      // Restore focus when the modal closes.
      try {
        lastFocused.focus();
      } catch {
        // ignore — element may have been removed
      }
    }
  });

  onMount(() => {
    return () => {
      // No global listener to remove — we use svelte:window below.
    };
  });
</script>

<svelte:window onkeydown={handleKey} />

{#if open}
  <div
    class="overlay"
    onclick={handleOverlayClick}
    onkeydown={(e) => e.stopPropagation()}
    role="presentation"
  >
    <div
      class="modal"
      bind:this={dialogEl}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <button
        bind:this={closeBtn}
        class="close"
        type="button"
        onclick={onClose}
        aria-label="Fechar"
      >×</button>

      <h2 id="onboarding-title" class="title">{$_('onboarding.welcome')}</h2>
      <p class="lead">{$_('onboarding.firstHint')}</p>

      <h3 class="section-title">{$_('onboarding.subAppsTitle')}</h3>
      <ul class="apps" aria-label="Sub-apps">
        {#each subApps as app (app.id)}
          <li class="app">
            <span class="app-icon" aria-hidden="true">{app.icon}</span>
            <span class="app-name">{app.name}</span>
            <span class="app-desc">{app.description}</span>
          </li>
        {/each}
      </ul>

      <div class="actions">
        <button
          bind:this={ctaBtn}
          type="button"
          class="cta"
          onclick={onClose}
        >{$_('onboarding.startCta')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9500;
    padding: 1rem;
    animation: overlay-in 0.2s ease;
  }
  .modal {
    background: linear-gradient(135deg, #1f2e4a 0%, #2d4373 100%);
    border: 1px solid rgba(236, 72, 153, 0.4);
    border-radius: 1rem;
    padding: 2rem 1.75rem 1.5rem;
    max-width: 520px;
    width: 100%;
    position: relative;
    color: #fff;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    max-height: 90vh;
    overflow-y: auto;
    animation: slide-up 0.28s ease;
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
    color: #ec4899;
    background: rgba(255, 255, 255, 0.06);
    outline: none;
  }
  .close:focus-visible {
    box-shadow: 0 0 0 2px #ec4899;
  }
  .title {
    margin: 0 0 0.5rem 0;
    font-size: 1.35rem;
    line-height: 1.25;
  }
  .lead {
    color: #cbd5e1;
    margin: 0 0 1.25rem 0;
    font-size: 0.95rem;
    line-height: 1.4;
  }
  .section-title {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
    font-weight: 600;
  }
  .apps {
    list-style: none;
    margin: 0 0 1.25rem 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .app {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.65rem;
    padding: 0.6rem 0.75rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.625rem;
  }
  .app-icon {
    font-size: 1.5rem;
    line-height: 1;
  }
  .app-name {
    font-weight: 600;
    font-size: 0.95rem;
  }
  .app-desc {
    color: #94a3b8;
    font-size: 0.8rem;
    text-align: right;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
  .cta {
    padding: 0.65rem 1.25rem;
    background: #ec4899;
    color: #fff;
    border: 0;
    border-radius: 0.5rem;
    cursor: pointer;
    font-weight: 600;
    font-size: 1rem;
    min-height: 44px;
    min-width: 44px;
    transition: background 0.2s ease;
  }
  .cta:hover,
  .cta:focus-visible {
    background: #db2777;
    outline: none;
  }
  .cta:focus-visible {
    box-shadow: 0 0 0 2px #fff;
  }

  @keyframes overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes slide-up {
    from { transform: translateY(1rem); opacity: 0; }
    to   { transform: translateY(0);     opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .overlay,
    .modal {
      animation: none;
    }
  }
</style>