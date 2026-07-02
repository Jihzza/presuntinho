<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { getSession, clearSession } from '$lib/auth/session';
  import { initStores, markVisited } from '$lib/state/stores';
  import Confetti from '$lib/components/Confetti.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import PageLoader from '$lib/components/PageLoader.svelte';
  import Mascot from '$lib/components/Mascot.svelte';
  import SecretModal from '$lib/components/SecretModal.svelte';
  import OfflineIndicator from '$lib/components/OfflineIndicator.svelte';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
  import { handleKonamiKey, logoClick } from '$lib/easterEggs';
  import HeartButton from '$lib/components/HeartButton.svelte';
  import XpPill from '$lib/components/XpPill.svelte';
  import XpToast from '$lib/components/XpToast.svelte';

  import { showToast } from '$lib/components/events';
  import { t } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { pwaInfo } from 'virtual:pwa-info';

  let { children } = $props();
  let session = $state(getSession());
  let storesReady = $state(false);
  let secretRoomOpen = $state(false);
  let authRedirectTimer: ReturnType<typeof setTimeout> | null = null;

  // Tag <link rel="manifest"> gerada pelo plugin (caso o PWA esteja ativo).
  // O fallback manual já vive em src/app.html, por isso esta tag é só aditiva.
  const webManifestLink = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '');
  const isAgentRoute = $derived(page.url.pathname.startsWith('/agente'));

  onMount(() => {
    let unbindKey: (() => void) | null = null;
    let unbindExtra: (() => void) | null = null;

    // PWA: regista o service worker gerado pelo @vite-pwa/sveltekit.
    // Em dev (devOptions.enabled = false) o módulo virtual:pwa-register não
    // existe, por isso o .catch() mantém a app silenciosamente funcional.
    if ('serviceWorker' in navigator) {
      import('virtual:pwa-register')
        .then(({ registerSW }) => {
          registerSW({
            immediate: true,
            onRegisteredSW(swUrl: string) {
              if (import.meta.env.DEV) console.debug('[presuntinho] SW registado:', swUrl);
            },
            onNeedRefresh() {
              // Dispara evento para o sistema de toasts mostrar
              // "Atualização disponível".
              window.dispatchEvent(
                new CustomEvent('presuntinho:pwa-update', {
                  detail: { type: 'needRefresh' }
                })
              );
            },
            onOfflineReady() {
              window.dispatchEvent(
                new CustomEvent('presuntinho:pwa-update', {
                  detail: { type: 'offlineReady' }
                })
              );
            }
          });
        })
        .catch(() => {
          // Plugin inativo (modo dev ou build sem PWA) — silencioso.
        });
    }

    // Secret Room listeners + Konami key handler must be bound BEFORE any
    // async work. Previously these were registered after `await markVisited`,
    // which swallowed failures silently and left the modal un-wired if the
    // visit-tracking throw — breaking the 7×-logo-click easter egg path
    // (task-073). Bind eagerly; cleanup still runs in the same return().
    function onOpenSRoom() {
      secretRoomOpen = true;
    }
    function onCloseSRoom() {
      secretRoomOpen = false;
    }
    window.addEventListener('presuntinho:open-secret-room', onOpenSRoom);
    window.addEventListener('presuntinho:close-secret-room', onCloseSRoom);
    unbindExtra = () => {
      window.removeEventListener('presuntinho:open-secret-room', onOpenSRoom);
      window.removeEventListener('presuntinho:close-secret-room', onCloseSRoom);
    };

    function onKey(e: KeyboardEvent) {
      void handleKonamiKey(e.key, e.keyCode);
    }
    window.addEventListener('keydown', onKey);
    unbindKey = () => window.removeEventListener('keydown', onKey);

    void (async () => {
      // Initialise Dexie-backed stores + run migration (Phase 3 #17)
      try {
        if (session) await initStores(session.profile);
        storesReady = true;
      } catch (e) {
        console.error('[presuntinho] initStores failed:', e);
        // Continue rendering; stores will fall back to defaults
      }

      // Visit tracking (Phase 13). Normalise the pathname so "/foo/"
      // and "/foo" both map to "foo" — matches V3's visited keys.
      try {
        const path = page.url.pathname.replace(/\/+$/, '') || '/';
        const pageId = path === '/' ? 'home' : path.replace(/^\//, '');
        await markVisited(pageId);
      } catch (e) {
        console.error('[presuntinho] markVisited failed:', e);
      }

      // Auth gate: each route owns its own empty-state ("iniciar sessão").
            // The layout must NOT redirect-away on user clicks — that turned
            // bottom-nav taps into silent no-ops (the redirect fired 550ms after
            // navigation and yanked the user back to /splash/).
            // Only fire the initial guard once per mount, with a longer delay so
            // users actively navigating are not interrupted mid-tap.
            if (!session && page.url.pathname !== '/splash/' && !authRedirectTimer) {
              authRedirectTimer = setTimeout(() => {
                authRedirectTimer = null;
                if (!getSession()) void goto('/splash/');
              }, 2500);
            }
    })();

    return () => {
      if (unbindKey) unbindKey();
      if (unbindExtra) unbindExtra();
      if (authRedirectTimer) clearTimeout(authRedirectTimer);
    };
  });

  function startAuthRedirect(targetLabel: string): void {
      showToast($t('auth.redirect_toast', { values: { target: targetLabel }, default: `Precisas iniciar sessão para abrir ${targetLabel}.` }), 2400);
    if (authRedirectTimer) clearTimeout(authRedirectTimer);
    authRedirectTimer = setTimeout(() => {
      authRedirectTimer = null;
      void goto('/splash/');
    }, 550);
  }

  // Bottom-nav clicks: validate storesReady, session, and authRedirectTimer guard
  // before allowing navigation. (CEO reported: clicking Escola scrolled to top
  // of /escola instead of navigating; Agente hub card didn't open route. Root
  // cause: missing guard checks.)
  function handleNavClick(event?: MouseEvent, targetLabel?: string): void {
    console.log('[nav] handleNavClick called', { targetLabel, storesReady, session: !!session, authRedirectTimer: !!authRedirectTimer });

    // Guard: block navigation if stores aren't ready, no session, or auth redirect timer is active
    if (!storesReady) {
      console.log('[nav] blocked: stores not ready');
      if (event) event.preventDefault();
      return;
    }

    if (!session) {
      console.log('[nav] blocked: no session');
      if (event) event.preventDefault();
      return;
    }

    if (authRedirectTimer) {
      console.log('[nav] blocked: auth redirect timer active');
      if (event) event.preventDefault();
      return;
    }

    console.log('[nav] navigation allowed', { targetLabel });
    // Let the native <a> navigation proceed (no preventDefault)
  }

  function logout() {
    clearSession();
    session = null;
    goto('/splash/');
  }
</script>

<svelte:head>
  {#if webManifestLink}
    {@html webManifestLink}
  {/if}
</svelte:head>

<PageLoader />

{#if page.url.pathname === '/splash/'}
  {@render children?.()}
{:else}
  <Confetti />
  <Toast />
  <XpToast />
  <Mascot />
  <SecretModal bind:open={secretRoomOpen} />
  <!-- Phase 15: offline status banner (listens to online/offline events). -->
  <OfflineIndicator />
  <a class="skip-link" href="#main-content">{$t('a11y.skipToContent')}</a>
  <div class="app">
    <header class="nav">
      <div class="nav-inner">
        <!--
          Logo split into two separate interactives so we don't nest
          <button> inside <a> (invalid HTML / a11y anti-pattern).
          * `.logo-pig` is the easter-egg button.
          * The "Presuntinho" text is a plain <a> to the hub.
          The wrapper keeps them visually grouped via flex.
        -->
        <div class="logo">
                  <button
                    type="button"
                    class="logo-pig"
                    onclick={() => logoClick()}
                    aria-label={$t('a11y.logo.pig', { default: '🐷 easter egg' })}
                    title={$t('a11y.logo.pig', { default: '🐷 easter egg' })}
                  >🐷</button>
                  <a href="/" class="logo-text" aria-label={$t('a11y.logo.brand', { default: 'Presuntinho — voltar ao hub' })}>Presuntinho</a>
                </div>
                <div class="nav-actions">
                  <LanguageSwitcher />
                  <a href="/definicoes" class="icon-btn" aria-label={$t('a11y.settings', { default: 'Definições' })} title={$t('a11y.settings', { default: 'Definições' })}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                  </a>
                  <button type="button" class="icon-btn" onclick={logout} aria-label={$t('a11y.logout', { default: 'Sair' })} title={$t('a11y.logout', { default: 'Sair' })}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                  </button>
                </div>
              </div>
            </header>

            <main id="main-content" class="content" tabindex="-1">
              {@render children?.()}
            </main>

            <!--
              Footer principal: Home / Calendário / Agente / Vida / Escola.
              O antigo botão 🐷 no footer era só um easter egg/copyright, mas
              confundia a navegação e ocupava uma 5.ª tab. O easter egg do porco
              fica no logo do topo; o footer passa a ter apenas tabs reais.
            -->
            <nav class="bottom-nav" aria-label={$t('nav.bottom.aria', { default: 'Navegação principal' })}>
                  <a href="/" class="nav-btn" class:nav-btn-disabled={!storesReady || !session} aria-disabled={!storesReady || !session} onclick={(event) => handleNavClick(event, 'Home')} aria-label={$t('nav.home.aria', { default: 'Home — dashboard principal' })} data-sveltekit-preload-data>
                    <span class="nav-icon" aria-hidden="true">🏠</span>
                    <span class="nav-label">{$t('nav.home', { default: 'Home' })}</span>
                  </a>
                  <a href="/calendario/" class="nav-btn" class:nav-btn-disabled={!storesReady || !session} aria-disabled={!storesReady || !session} onclick={(event) => handleNavClick(event, 'Calendário')} aria-label={$t('nav.calendario.aria', { default: 'Calendário — agenda, mês e tasks' })} data-sveltekit-preload-data>
                    <span class="nav-icon" aria-hidden="true">🗓️</span>
                    <span class="nav-label">{$t('nav.calendario', { default: 'Calendário' })}</span>
                  </a>
                  <a href="/agente/" class="nav-btn" class:nav-btn-disabled={!storesReady || !session} aria-disabled={!storesReady || !session} onclick={(event) => handleNavClick(event, 'Agente')} aria-label={$t('nav.agente.aria', { default: 'Agente — chat com IA' })} data-sveltekit-preload-data>
                    <span class="nav-icon" aria-hidden="true">🤖</span>
                    <span class="nav-label">{$t('nav.agente', { default: 'Agente' })}</span>
                  </a>
                  <a href="/vida/" class="nav-btn" class:nav-btn-disabled={!storesReady || !session} aria-disabled={!storesReady || !session} onclick={(event) => handleNavClick(event, 'Vida')} aria-label={$t('nav.vida.aria', { default: 'Vida — finanças, hábitos e vícios' })} data-sveltekit-preload-data>
                    <span class="nav-icon" aria-hidden="true">🌿</span>
                    <span class="nav-label">{$t('nav.vida', { default: 'Vida' })}</span>
                  </a>
                  <a href="/escola/" class="nav-btn" class:nav-btn-disabled={!storesReady || !session} aria-disabled={!storesReady || !session} onclick={(event) => handleNavClick(event, 'Escola')} aria-label={$t('nav.escola.aria', { default: 'Escola — cursos e lições' })} data-sveltekit-preload-data>
                    <span class="nav-icon" aria-hidden="true">📚</span>
                    <span class="nav-label">{$t('nav.escola', { default: 'Escola' })}</span>
                  </a>
                </nav>

                <!--
                  Floating XP + Heart, fixed to the bottom-right corner.
                  Lives OUTSIDE the header / bottom-nav so it doesn't
                  shift layout. Sits ABOVE the bottom-nav (z-index 50)
                  and BELOW modal overlays (which are typically 100+).
                  Respects iOS safe-area for notched devices.
                -->
                {#if !isAgentRoute}
                  <div class="fab-stack" aria-live="polite">
                    <XpPill />
                    <HeartButton />

                  </div>
                {/if}
  </div>
{/if}

<style>
  .app {
    min-height: 100vh;
    background: var(--bg, #1f2e4a);
    color: var(--txt, #fff);
    display: flex;
    flex-direction: column;
  }
  /* WCAG 2.4.1 — visible only when focused via keyboard. */
  .skip-link {
    position: absolute;
    top: -100px;
    left: 0.5rem;
    background: var(--accent, #ec4899);
    color: #fff;
    padding: 0.5rem 0.875rem;
    border-radius: 0.5rem;
    font-weight: 600;
    text-decoration: none;
    z-index: 1000;
    transition: top 0.15s ease;
  }
  .skip-link:focus,
  .skip-link:focus-visible {
    top: 0.5rem;
    outline: none;
    box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.5);
  }
  .nav {
    background: rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0.75rem 1rem;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .nav-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: 1200px;
    margin: 0 auto;
    gap: 1rem;
  }
  .logo {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #fff;
      font-weight: 600;
      font-size: 1.125rem;
    }
    .logo-text {
      color: #fff;
      text-decoration: none;
      border-radius: 4px;
      padding: 2px 4px;
    }
    .logo-text:hover,
    .logo-text:focus-visible {
      text-decoration: underline;
      outline: none;
    }
    .logo-text:focus-visible {
      box-shadow: 0 0 0 2px var(--accent, #ec4899);
    }
    .logo-pig {
      font-size: 1.5rem;
      /* The pig is a button, not a link — keep its colour in sync with the
         surrounding text so it reads as part of the logo. */
      color: inherit;
      /* Reset native button styling. */
      background: transparent;
      border: 0;
      padding: 0;
      margin: 0;
      cursor: pointer;
      line-height: 1;
      border-radius: 4px;
      transition: transform 0.15s ease;
    }
    .logo-pig:hover,
    .logo-pig:focus-visible {
      transform: scale(1.12);
      outline: none;
    }
    .logo-pig:focus-visible {
      box-shadow: 0 0 0 2px var(--accent, #ec4899);
    }
  .nav-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px; /* WCAG 2.5.5 / Apple HIG touch target */
    height: 44px;
    border-radius: var(--radius-md);
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #fff;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.2s, border-color 0.2s;
  }
  .icon-btn:hover,
  .icon-btn:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.3);
    outline: none;
  }
  .icon-btn:focus-visible {
    box-shadow: 0 0 0 2px var(--accent, #ec4899);
  }
  .content {
    flex: 1;
    width: 100%;
  }
  .bottom-nav {
      position: sticky;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-around;
      align-items: center;
      background: rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding: 0.4rem 0.25rem calc(0.4rem + env(safe-area-inset-bottom));
      z-index: 50;
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.25);
    }
    .nav-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      background: transparent;
      border: 0;
      color: rgba(255, 255, 255, 0.78);
      text-decoration: none;
      font: inherit;
      cursor: pointer;
      padding: 0.42rem 0.12rem;
      min-height: 56px;
      min-width: 44px;
      border-radius: 0.5rem;
      transition: background 120ms ease, color 120ms ease, transform 120ms ease;
      -webkit-tap-highlight-color: transparent;
    }
    .nav-btn:hover,
    .nav-btn:focus-visible {
      color: #fff;
      background: rgba(255, 255, 255, 0.06);
      outline: none;
    }
    .nav-btn:active {
      transform: scale(0.96);
    }
    .nav-btn:focus-visible {
      box-shadow: 0 0 0 2px var(--accent, #ec4899);
    }
    .nav-btn-disabled {
      color: rgba(255, 255, 255, 0.42);
      cursor: not-allowed;
      filter: grayscale(0.35);
    }
    .nav-btn-disabled:hover,
    .nav-btn-disabled:focus-visible {
      color: rgba(255, 255, 255, 0.56);
      background: rgba(255, 255, 255, 0.03);
    }
    .nav-icon {
      font-size: 1.35rem;
      line-height: 1;
    }
    .nav-label {
      font-size: 0.62rem;
      font-weight: 500;
      letter-spacing: 0.01em;
    }
    @media (prefers-reduced-motion: reduce) {
      .nav-btn {
        transition: none;
      }
      .nav-btn:active {
        transform: none;
      }
    }

    /* Floating action button stack (XP pill + heart + install). */
    .fab-stack {
      position: fixed;
      right: max(1rem, env(safe-area-inset-right));
      bottom: calc(env(safe-area-inset-bottom) + 7rem);
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.5rem;
      z-index: 60;
      pointer-events: none; /* container ignores — children re-enable */
      /* Allow the stack (potentially 3 chips tall) to overflow upward
         without being clipped by fixed-positioned ancestors. */
      max-height: calc(100vh - 7.5rem);
      overflow: visible;
    }
    .fab-stack > :global(*) {
      pointer-events: auto;
    }
    /* On wide screens give a little extra breathing room from the edge. */
    @media (min-width: 768px) {
      .fab-stack {
        right: max(1.5rem, env(safe-area-inset-right));
      }
    }
</style>
