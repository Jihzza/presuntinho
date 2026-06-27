<script lang="ts">
  /**
   * InstallButton — PWA "Add to Home Screen" prompt (Phase 15 #5).
   *
   * Lifecycle:
   *   1. Browser fires `beforeinstallprompt` (only on installable PWAs).
   *      We capture it instead of letting the browser show its mini-bar.
   *   2. On click, we call `prompt()` which shows the OS install dialog.
   *      We track `outcome` (accepted/dismissed) so we can show a toast.
   *   3. When the app is already installed (display-mode === 'standalone')
   *      or running on iOS Safari (no support) we stay hidden.
   *
   * Touch target: 44×44 (WCAG 2.5.5 / Apple HIG).
   * ARIA: role=button is on the <button>; the label is exposed as the
   * visible text. We listen for `appinstalled` to dismiss ourselves once
   * the install completes.
   */
  import { onMount } from 'svelte';
  import { TOAST_EVENT } from './events';

  // Minimal typings — `BeforeInstallPromptEvent` isn't in the lib yet.
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    prompt(): Promise<void>;
  }

  let visible = $state(false);
  let installed = $state(false);
  let deferredPrompt: BeforeInstallPromptEvent | null = null;

  onMount(() => {
    // iOS Safari fires no `beforeinstallprompt` — show nothing there.
    // Already-installed PWAs expose display-mode === 'standalone'.
    const standalone =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        // iOS uses navigator.standalone as its own flag.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).standalone === true);
    installed = standalone;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // suppress the browser mini-bar
      deferredPrompt = e as BeforeInstallPromptEvent;
      if (!installed) visible = true;
    };

    const onAppInstalled = () => {
      installed = true;
      visible = false;
      deferredPrompt = null;
      window.dispatchEvent(
        new CustomEvent(TOAST_EVENT, {
          detail: { msg: 'App instalado — abre-o a partir do ecrã principal.' }
        })
      );
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  });

  async function install(): Promise<void> {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        visible = false;
      }
    } catch (e) {
      console.error('[install-button] prompt failed', e);
    } finally {
      deferredPrompt = null;
    }
  }
</script>

{#if visible}
  <button
    type="button"
    class="install-btn"
    onclick={install}
    aria-label="Instalar Presuntinho como aplicação no dispositivo"
  >
    <span class="icon" aria-hidden="true">📲</span>
    <span class="label">Instalar app</span>
  </button>
{/if}

<style>
  .install-btn {
    /* Touch target ≥ 44×44 (WCAG 2.5.5). */
    min-height: 44px;
    min-width: 44px;
    padding: 0.65rem 1.1rem;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;

    /* Secondary btn: surface-tinted, accent border on hover. */
    background: rgba(255, 255, 255, 0.06);
    color: var(--txt, #fff);
    border: 1px solid rgba(236, 72, 153, 0.35);
    border-radius: var(--radius-md, 0.5rem);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease,
      transform 0.15s ease;
  }
  .install-btn:hover,
  .install-btn:focus-visible {
    background: rgba(236, 72, 153, 0.12);
    border-color: var(--accent, #ec4899);
    outline: none;
  }
  .install-btn:focus-visible {
    box-shadow: 0 0 0 2px var(--accent, #ec4899);
  }
  .install-btn:active {
    transform: translateY(1px);
  }
  .icon {
    font-size: 1.1rem;
    line-height: 1;
  }
  .label {
    line-height: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .install-btn {
      transition: none;
    }
    .install-btn:active {
      transform: none;
    }
  }
</style>