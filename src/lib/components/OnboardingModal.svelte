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
  import { t, _ } from 'svelte-i18n';
  import { subApps } from '$lib/registry';
  import type { ProfileId } from '$lib/auth/hash';

  interface Props {
    open: boolean;
    onClose: () => void;
    /** Active profile — selects the personalised greeting. */
    profile?: ProfileId | null;
  }
  let { open = false, onClose, profile = null }: Props = $props();

  // Resolve the greeting key based on the active profile. Only the two legacy
  // profiles get a personalised, named welcome; every account user (and the
  // unknown / not-yet-hydrated case) gets the generic name-free greeting, so
  // a new user is never greeted as "Fatma".
  // One derivation for both the i18n key and its fallback so the two can
  // never drift apart (they previously branched on `profile` in parallel).
  let greeting = $derived.by(() => {
    if (profile === 'daniel')
      return { key: 'onboarding.welcome.daniel', fallback: '🐷 Bem-vindo, Daniel! Encontra os easter eggs 🥚' };
    if (profile === 'fatma')
      return { key: 'onboarding.welcome.fatma', fallback: '🐷 Bem-vinda, Fatma! Encontra os easter eggs 🥚' };
    return { key: 'onboarding.welcome', fallback: '🐷 Bem-vindo ao Presuntinho! Encontra os easter eggs escondidos 🥚' };
  });

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
        aria-label={$t('components.onboarding.close.aria', { default: 'Fechar' })}
      >×</button>

      <h2 id="onboarding-title" class="title">{$t(greeting.key, { default: greeting.fallback })}</h2>
      <p class="lead">{$_('onboarding.firstHint')}</p>

      <h3 class="section-title">{$t('onboarding.highlightsTitle', { default: 'O que há de novo' })}</h3>
      <ul class="highlights" aria-label={$t('onboarding.highlightsTitle', { default: 'O que há de novo' })}>
        <li class="highlight">
          <span class="app-icon" aria-hidden="true">🎯</span>
          <span class="highlight-text">
            <strong>{$t('onboarding.quests.title', { default: 'Missões diárias' })}</strong>
            {$t('onboarding.quests.body', { default: 'Todos os dias há pequenas missões na Home — completa-as e ganha XP extra.' })}
          </span>
        </li>
        <li class="highlight">
          <span class="app-icon" aria-hidden="true">📲</span>
          <span class="highlight-text">
            <strong>{$t('onboarding.install.title', { default: 'Instalar no telemóvel' })}</strong>
            {$t('onboarding.install.body', { default: 'Toca no botão “Instalar app” para ter o Presuntinho sempre à mão, mesmo offline.' })}
          </span>
        </li>
      </ul>

      <h3 class="section-title">{$_('onboarding.subAppsTitle')}</h3>
      <ul class="apps" aria-label={$t('components.onboarding.apps.aria', { default: 'Sub-apps' })}>
        {#each subApps as app (app.id)}
          <li class="app">
            <span class="app-icon" aria-hidden="true">{app.icon}</span>
            <span class="app-name">{$t(`hub.app.${app.id}.name`, { default: app.name })}</span>
            <span class="app-desc">{$t(`hub.app.${app.id}.description`, { default: app.description })}</span>
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
    background: var(--bg-elev, #1f2e4a);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    border-radius: var(--radius-lg, 1rem);
    padding: 2rem 1.75rem 1.5rem;
    max-width: 520px;
    width: 100%;
    position: relative;
    color: var(--txt);
    box-shadow: var(--shadow-lg, 0 20px 60px rgba(0, 0, 0, 0.5));
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
    color: var(--txt);
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
    padding: 0.5rem 0.65rem;
    min-width: 44px;
    min-height: 44px;
    border-radius: var(--radius-sm, 0.375rem);
  }
  .close:hover,
  .close:focus-visible {
    color: var(--accent);
    background: var(--card-hover);
    outline: none;
  }
  .close:focus-visible {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .title {
    margin: 0 0 0.5rem 0;
    font-size: 1.35rem;
    line-height: 1.25;
  }
  .lead {
    color: var(--txt2);
    margin: 0 0 1.25rem 0;
    font-size: 0.95rem;
    line-height: 1.4;
  }
  .section-title {
    margin: 0 0 0.5rem 0;
    font-size: var(--fs-sm, 0.875rem);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3);
    font-weight: 600;
  }
  .apps,
  .highlights {
    list-style: none;
    margin: 0 0 1.25rem 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .app,
  .highlight {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.65rem;
    padding: 0.6rem 0.75rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.625rem;
  }
  .highlight {
    grid-template-columns: auto 1fr;
    align-items: start;
    border-color: color-mix(in srgb, var(--accent) 26%, transparent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .highlight-text {
    display: block;
    font-size: var(--fs-sm, 0.875rem);
    color: var(--txt2);
    line-height: 1.4;
  }
  .highlight-text strong {
    display: block;
    color: var(--txt);
    font-size: 0.95rem;
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
    color: var(--txt3);
    font-size: 0.8rem;
    text-align: right;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
  .cta {
    padding: 0.65rem 1.25rem;
    background: var(--accent);
    color: var(--on-accent, #fff);
    border: 0;
    border-radius: var(--radius-md, 0.5rem);
    cursor: pointer;
    font-weight: 600;
    font-size: 1rem;
    min-height: 44px;
    min-width: 44px;
    transition: background var(--motion-base, 200ms) ease;
  }
  .cta:hover,
  .cta:focus-visible {
    background: var(--accent-hover);
    outline: none;
  }
  .cta:focus-visible {
    box-shadow: 0 0 0 2px var(--txt);
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