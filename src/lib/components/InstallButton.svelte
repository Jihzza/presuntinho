<script lang="ts">
  /**
   * InstallButton — PWA install prompt.
   *
   * Two paths:
   * - Chromium: waits for `beforeinstallprompt` and calls prompt() on click.
   * - iOS/iPadOS Safari: no `beforeinstallprompt` exists, so when the device
   *   is iOS and the app is not standalone we show the button anyway and open
   *   a small instruction sheet (Share → Add to Home Screen) on click.
   *
   * Hidden entirely once installed (display-mode standalone/fullscreen or
   * iOS `navigator.standalone`).
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { t } from 'svelte-i18n';
  import { showToast } from './events';

  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    prompt(): Promise<void>;
  }

  let installed = $state(false);
  let hasPrompt = $state(false);
  let isIos = $state(false);
  let prompting = $state(false);
  let sheetOpen = $state(false);
  let closeBtn = $state<HTMLButtonElement | null>(null);
  let deferredPrompt: BeforeInstallPromptEvent | null = null;

  const visible = $derived(!installed && (hasPrompt || isIos));

  function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const displayModeFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
    const iosStandalone = 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    return displayModeStandalone || displayModeFullscreen || iosStandalone;
  }

  function isIosDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    const classicIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    // iPadOS 13+ reports as "Macintosh" but has a touch screen.
    const ipadOs = /macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
    return classicIos || ipadOs;
  }

  onMount(() => {
    const standaloneMql = window.matchMedia('(display-mode: standalone)');
    const fullscreenMql = window.matchMedia('(display-mode: fullscreen)');

    installed = isStandalone();
    isIos = isIosDevice();

    const onDisplayModeChange = () => {
      installed = isStandalone();
      if (installed) sheetOpen = false;
    };

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      hasPrompt = true;
      installed = isStandalone();
    };

    const onAppInstalled = () => {
      installed = true;
      sheetOpen = false;
      deferredPrompt = null;
      hasPrompt = false;
      showToast(get(t)('install.toast.installed', { default: 'App instalada — abre-a a partir do ecrã principal.' }));
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

  // Focus the close button when the iOS instruction sheet opens.
  $effect(() => {
    if (sheetOpen && closeBtn) closeBtn.focus();
  });

  async function onClick(): Promise<void> {
    if (installed || prompting) return;

    if (deferredPrompt) {
      prompting = true;
      try {
        const promptEvent = deferredPrompt;
        await promptEvent.prompt();
        await promptEvent.userChoice;
      } catch (e) {
        console.error('[install-button] prompt failed', e);
        showToast(get(t)('install.toast.failed', { default: 'Não foi possível abrir o prompt de instalação.' }));
      } finally {
        deferredPrompt = null;
        hasPrompt = false;
        prompting = false;
        installed = isStandalone();
      }
      return;
    }

    if (isIos) {
      sheetOpen = true;
    }
  }

  function closeSheet(): void {
    sheetOpen = false;
  }

  function onWindowKeydown(e: KeyboardEvent): void {
    if (sheetOpen && e.key === 'Escape') {
      e.stopPropagation();
      closeSheet();
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if visible}
  <button
    type="button"
    class="install-btn"
    onclick={onClick}
    aria-label={$t('install.aria', { default: 'Instalar Presuntinho como aplicação' })}
    title={$t('install.aria', { default: 'Instalar Presuntinho como aplicação' })}
    disabled={prompting}
  >
    <span class="icon" aria-hidden="true">📲</span>
    <span class="label">{prompting ? $t('install.opening', { default: 'A abrir…' }) : $t('install.button', { default: 'Instalar app' })}</span>
  </button>
{/if}

{#if sheetOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="sheet-backdrop"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeSheet();
    }}
  >
    <div
      class="sheet card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-ios-title"
    >
      <h2 id="install-ios-title" class="sheet-title">
        <span aria-hidden="true">🐷</span>
        {$t('install.ios.title', { default: 'Instalar no iPhone/iPad' })}
      </h2>
      <p class="sheet-intro">
        {$t('install.ios.intro', { default: 'No iOS a instalação é feita pelo Safari, em três passos:' })}
      </p>
      <ol class="sheet-steps">
        <li>{$t('install.ios.step1', { default: 'Toca no botão Partilhar (o quadrado com a seta para cima) na barra do Safari.' })}</li>
        <li>{$t('install.ios.step2', { default: 'Desliza e escolhe «Adicionar ao ecrã principal».' })}</li>
        <li>{$t('install.ios.step3', { default: 'Confirma em «Adicionar» — e já está, o Presuntinho fica no teu ecrã!' })}</li>
      </ol>
      <p class="sheet-note">
        {$t('install.ios.note', { default: 'Dica: se estiveres noutro navegador, abre esta página no Safari primeiro.' })}
      </p>
      <button
        type="button"
        class="sheet-close"
        onclick={closeSheet}
        bind:this={closeBtn}
      >
        {$t('common.close', { default: 'Fechar' })}
      </button>
    </div>
  </div>
{/if}

<style>
  /*
   * InstallButton is stackable: it ships with NO own position fixed/absolute.
   * The parent layout places it inside the .fab-stack (alongside XpPill and
   * HeartButton) so it cannot overlap content on small screens and so it
   * shows on every authenticated page. See src/routes/+layout.svelte.
   */
  .install-btn {
    min-height: 44px;
    min-width: 44px;
    padding: 0.65rem 1.05rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;

    background: var(--accent);
    color: var(--on-accent, #fff);
    border: 1px solid var(--border);
    border-radius: 999px;
    box-shadow: var(--shadow-md, 0 10px 28px rgba(0, 0, 0, 0.32));
    font: inherit;
    font-size: var(--fs-sm, 0.92rem);
    font-weight: 700;
    cursor: pointer;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    transition:
      background var(--motion-fast, 120ms) ease,
      transform var(--motion-fast, 120ms) ease,
      box-shadow var(--motion-fast, 120ms) ease;
  }

  .install-btn:hover:not(:disabled) {
    background: var(--accent-hover);
    box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.38));
  }

  .install-btn:focus-visible {
    background: var(--accent-hover);
    outline: 2px solid var(--txt);
    outline-offset: 2px;
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

  /* iOS "Add to Home Screen" instruction sheet */
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: var(--space-4, 1rem);
    padding-bottom: max(var(--space-4, 1rem), env(safe-area-inset-bottom));
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    animation: sheet-fade var(--motion-fast, 120ms) ease-out;
  }

  .sheet {
    width: 100%;
    max-width: 26rem;
    padding: var(--space-5, 1.25rem);
    background: var(--card);
    color: var(--txt);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 1rem);
    box-shadow: var(--shadow-lg, 0 18px 48px rgba(0, 0, 0, 0.42));
    animation: sheet-up var(--motion-base, 220ms) ease-out;
  }

  .sheet-title {
    margin: 0 0 var(--space-2, 0.5rem);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--fs-lg, 1.1rem);
    font-weight: 800;
    color: var(--txt);
  }

  .sheet-intro {
    margin: 0 0 var(--space-3, 0.75rem);
    font-size: var(--fs-sm, 0.92rem);
    color: var(--txt2);
  }

  .sheet-steps {
    margin: 0 0 var(--space-3, 0.75rem);
    padding-inline-start: 1.35rem;
    display: grid;
    gap: var(--space-2, 0.5rem);
    font-size: var(--fs-sm, 0.92rem);
    color: var(--txt);
    line-height: 1.45;
  }

  .sheet-note {
    margin: 0 0 var(--space-4, 1rem);
    font-size: var(--fs-xs, 0.8rem);
    color: var(--txt3);
  }

  .sheet-close {
    width: 100%;
    min-height: 44px;
    padding: 0.6rem 1rem;
    background: var(--accent);
    color: var(--on-accent, #fff);
    border: none;
    border-radius: var(--radius-md, 0.75rem);
    font: inherit;
    font-size: var(--fs-sm, 0.92rem);
    font-weight: 700;
    cursor: pointer;
    transition: background var(--motion-fast, 120ms) ease;
  }

  .sheet-close:hover {
    background: var(--accent-hover);
  }

  .sheet-close:focus-visible {
    outline: 2px solid var(--txt);
    outline-offset: 2px;
  }

  @keyframes sheet-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes sheet-up {
    from {
      opacity: 0;
      transform: translateY(0.75rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (min-width: 640px) {
    .sheet-backdrop {
      align-items: center;
    }
  }

  /* On very narrow viewports, drop the text label and keep only the icon. */
  @media (max-width: 420px) {
    .install-btn {
      padding: 0.65rem 0.85rem;
      font-size: var(--fs-xs, 0.88rem);
    }
    .install-btn .label {
      display: none;
    }
  }
</style>
