<script lang="ts">
  /**
   * InstallButton — PWA install prompt.
   *
   * Browser support is intentionally conservative: the button only renders
   * after Chromium-style browsers emit `beforeinstallprompt`. Installed PWAs
   * are detected through display-mode and iOS Safari's `navigator.standalone`.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { t } from 'svelte-i18n';
  import { TOAST_EVENT } from './events';

  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    prompt(): Promise<void>;
  }

  let visible = $state(false);
  let installed = $state(false);
  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  let prompting = $state(false);

  function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const displayModeFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
    const iosStandalone = 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    return displayModeStandalone || displayModeFullscreen || iosStandalone;
  }

  function syncVisibility(): void {
    installed = isStandalone();
    visible = Boolean(deferredPrompt && !installed);
  }

  function toast(msg: string): void {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { msg } }));
  }

  onMount(() => {
    const standaloneMql = window.matchMedia('(display-mode: standalone)');
    const fullscreenMql = window.matchMedia('(display-mode: fullscreen)');

    syncVisibility();

    const onDisplayModeChange = () => syncVisibility();

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      syncVisibility();
    };

    const onAppInstalled = () => {
      installed = true;
      visible = false;
      deferredPrompt = null;
      toast(get(t)('install.toast.installed', { default: 'App instalada — abre-a a partir do ecrã principal.' }));
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    standaloneMql.addEventListener('change', onDisplayModeChange);
    fullscreenMql.addEventListener('change', onDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
      standaloneMql.removeEventListener('change', onDisplayModeChange);
      fullscreenMql.removeEventListener('change', onDisplayModeChange);
    };
  });

  async function install(): Promise<void> {
    if (!deferredPrompt || installed || prompting) return;
    prompting = true;
    try {
      const promptEvent = deferredPrompt;
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        visible = false;
      }
    } catch (e) {
      console.error('[install-button] prompt failed', e);
      toast(get(t)('install.toast.failed', { default: 'Não foi possível abrir o prompt de instalação.' }));
    } finally {
      deferredPrompt = null;
      prompting = false;
      syncVisibility();
    }
  }
</script>

{#if visible && !installed}
  <button
    type="button"
    class="install-btn"
    onclick={install}
    aria-label={$t('install.aria', { default: 'Instalar Presuntinho como aplicação' })}
    title={$t('install.aria', { default: 'Instalar Presuntinho como aplicação' })}
    disabled={prompting}
  >
    <span class="icon" aria-hidden="true">📲</span>
    <span class="label">{prompting ? $t('install.opening', { default: 'A abrir…' }) : $t('install.button', { default: 'Instalar app' })}</span>
  </button>
{/if}

<style>
  .install-btn {
    position: fixed;
    right: max(1rem, env(safe-area-inset-right));
    bottom: calc(5.25rem + env(safe-area-inset-bottom));
    z-index: 90;

    min-height: 44px;
    min-width: 44px;
    padding: 0.65rem 1.05rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;

    background: rgba(236, 72, 153, 0.95);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 999px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32);
    font: inherit;
    font-size: 0.92rem;
    font-weight: 700;
    cursor: pointer;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
  }

  .install-btn:hover:not(:disabled),
  .install-btn:focus-visible {
    background: #db2777;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.38);
    outline: none;
  }

  .install-btn:focus-visible {
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.55), 0 12px 32px rgba(0, 0, 0, 0.38);
  }

  .install-btn:active:not(:disabled) {
    transform: translateY(1px) scale(0.99);
  }

  .install-btn:disabled {
    opacity: 0.72;
    cursor: wait;
  }

  .icon {
    font-size: 1.1rem;
    line-height: 1;
  }

  .label {
    line-height: 1;
    white-space: nowrap;
  }

  @media (min-width: 760px) {
    .install-btn {
      bottom: calc(1.25rem + env(safe-area-inset-bottom));
      right: max(1.25rem, env(safe-area-inset-right));
    }
  }

  @media (max-width: 420px) {
    .install-btn {
      padding: 0.65rem 0.85rem;
      font-size: 0.88rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .install-btn {
      transition: none;
    }

    .install-btn:active:not(:disabled) {
      transform: none;
    }
  }
</style>
