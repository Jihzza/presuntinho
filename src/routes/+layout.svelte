<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { goto, afterNavigate } from '$app/navigation';
  import { getSession, setSession, clearSession } from '$lib/auth/session';
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
  import InstallButton from '$lib/components/InstallButton.svelte';
  import MoodLayer from '$lib/components/MoodLayer.svelte';
  import { readActiveMood, isMoodIntroAcknowledged, MOOD_EVENT, MOOD_META, type ActiveMood } from '$lib/mood';

  import { showToast } from '$lib/components/events';
  import { t } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import { applyInitialDocumentLocale } from '$lib/i18n';
  import { onMount } from 'svelte';

  let { children } = $props();
  let session = $state(getSession());
  let storesReady = $state(false);
  let secretRoomOpen = $state(false);
  let activeMood = $state<ActiveMood | null>(null);
  let authRedirectTimer: ReturnType<typeof setTimeout> | null = null;

  // PWA prompt-mode update flow: the SW registration below hands us an
  // `updateSW` callback; when 'presuntinho:pwa-update' fires with
  // type 'needRefresh' we surface a small banner with a reload action.
  let pwaUpdateReady = $state(false);
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

  const moodAccent = $derived(activeMood ? MOOD_META[activeMood.kind].accent : null);

  // Pages with a fixed bottom composer (chat input) need the floating
  // elements (fab-stack, mascot, mood chip, PWA banner) lifted above it.
  // Consumed via var(--page-bottom-inset) — see app.css for the token.
  const pageBottomInset = $derived(isActive('/agente/') || isActive('/mensagens/') ? '5.5rem' : '0px');

  /** Normalised active-tab check for the bottom nav. */
  function isActive(href: string): boolean {
    const path = page.url.pathname.replace(/\/+$/, '') || '/';
    const target = href.replace(/\/+$/, '') || '/';
    if (target === '/') return path === '/';
    return path === target || path.startsWith(`${target}/`);
  }

  /** Visit tracking (Phase 13) — normalise "/foo/" and "/foo" to "foo". */
  async function trackVisit(pathname: string): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      const path = pathname.replace(/\/+$/, '') || '/';
      const pageId = path === '/' ? 'home' : path.replace(/^\//, '');
      await markVisited(pageId);
    } catch (e) {
      console.error('[presuntinho] markVisited failed:', e);
    }
  }

  // Runs after EVERY client-side navigation (including the initial one),
  // so deep navigation is tracked — not only the first mounted page.
  afterNavigate((nav) => {
    const pathname = nav.to?.url.pathname ?? page.url.pathname;
    void trackVisit(pathname);
  });

  function applyPwaUpdate(): void {
    pwaUpdateReady = false;
    if (updateSW) {
      void updateSW(true);
    } else if (typeof location !== 'undefined') {
      location.reload();
    }
  }

  onMount(() => {
    applyInitialDocumentLocale();

    let unbindKey: (() => void) | null = null;
    let unbindExtra: (() => void) | null = null;
    let moodPoll: ReturnType<typeof setInterval> | null = null;
    let swPoll: ReturnType<typeof setInterval> | null = null;

    async function refreshMood(): Promise<void> {
      const mood = await readActiveMood();
      const acknowledgedMood = mood && isMoodIntroAcknowledged(mood) ? mood : null;
      activeMood = acknowledgedMood;
      if (acknowledgedMood && !getSession()) {
        setSession('fatma', 'secret');
        session = getSession();
        if (session && !storesReady) {
          await initStores(session.profile);
          storesReady = true;
        }
      }
    }
    const onMoodChanged = (event: Event) => {
      const mood = event instanceof CustomEvent ? (event.detail as ActiveMood | null) : null;
      activeMood = mood && isMoodIntroAcknowledged(mood) ? mood : null;
      if (activeMood && !getSession()) {
        setSession('fatma', 'secret');
        session = getSession();
      }
      void refreshMood();
    };
    void refreshMood();
    window.addEventListener(MOOD_EVENT, onMoodChanged);
    moodPoll = setInterval(refreshMood, 30_000);

    // PWA: regista o service worker gerado pelo @vite-pwa/sveltekit.
    // Em dev (devOptions.enabled = false) o módulo virtual:pwa-register não
    // existe, por isso o .catch() mantém a app silenciosamente funcional.
    // Prompt-mode: guardamos o callback devolvido por registerSW para que
    // o banner "nova versão" possa aplicar o update + reload num toque.
    if ('serviceWorker' in navigator) {
      import('virtual:pwa-register')
        .then(({ registerSW }) => {
          updateSW = registerSW({
            immediate: true,
            onRegisteredSW(swUrl: string, r?: ServiceWorkerRegistration) {
              if (import.meta.env.DEV) console.debug('[presuntinho] SW registado:', swUrl);
              // Prompt-mode only detects updates on navigation; poll hourly
              // so long-lived tabs still learn about new deploys.
              if (r && !swPoll) {
                swPoll = setInterval(() => {
                  if (navigator.onLine) r.update().catch(() => {});
                }, 60 * 60 * 1000);
              }
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

    // PWA update notifications (fired by the SW registration above OR by the
    // PWA module directly once registration moves fully to prompt-mode).
    const onPwaUpdate = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as { type?: string } | null) : null;
      if (detail?.type === 'needRefresh') {
        pwaUpdateReady = true;
      } else if (detail?.type === 'offlineReady') {
        showToast(get(t)('pwa.offline_ready', { default: 'Presuntinho pronto para funcionar offline. 🐷' }), 3200);
      }
    };
    window.addEventListener('presuntinho:pwa-update', onPwaUpdate);

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

      // Visit tracking now runs in afterNavigate (covers EVERY navigation,
      // including the initial one) — see trackVisit() above.

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
      window.removeEventListener(MOOD_EVENT, onMoodChanged);
      window.removeEventListener('presuntinho:pwa-update', onPwaUpdate);
      if (moodPoll) clearInterval(moodPoll);
      if (swPoll) clearInterval(swPoll);
    };
  });

  // Bottom-nav clicks: validate storesReady, session, and authRedirectTimer
  // guard before allowing navigation. Blocked taps get toast feedback so a
  // tap is never a silent no-op.
  function handleNavClick(event?: MouseEvent, targetLabel?: string): void {
    const translate = get(t);
    if (!storesReady) {
      if (event) event.preventDefault();
      showToast(translate('nav.blocked.loading', { default: 'Um segundinho — ainda estou a preparar tudo… 🐷' }), 2200);
      return;
    }
    if (!session || authRedirectTimer) {
      if (event) event.preventDefault();
      showToast(
        translate('nav.blocked.session', {
          values: { target: targetLabel ?? '' },
          default: 'Inicia sessão primeiro para abrir esta área.'
        }),
        2400
      );
      return;
    }
    // Let the native <a> navigation proceed (no preventDefault).
  }

  function logout() {
    clearSession();
    session = null;
    goto('/splash/');
  }
</script>

<PageLoader />

{#if page.url.pathname === '/splash/'}
  {@render children?.()}
{:else}
  <Confetti />
  <Toast />
  <XpToast />
  <SecretModal bind:open={secretRoomOpen} />
  <!-- Phase 15: offline status banner (listens to online/offline events). -->
  <OfflineIndicator />
  <a class="skip-link" href="#main-content">{$t('a11y.skipToContent')}</a>
  <div
    class={`app ${activeMood ? `app-mood app-mood-${activeMood.kind}` : ''}`}
    style={`--page-bottom-inset: ${pageBottomInset};${moodAccent ? ` --mood-accent: ${moodAccent};` : ''}`}
  >
    {#if activeMood}
      <MoodLayer mood={activeMood} onCleared={() => (activeMood = null)} />
    {/if}
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
                  <a href="/perfil/" class="icon-btn" aria-label={$t('profile.page.title', { default: 'Perfil' })} title={$t('profile.page.title', { default: 'Perfil' })}>👤</a>
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

            {#if pwaUpdateReady}
              <!-- Prompt-mode PWA update: actionable toast-style banner. -->
              <div class="pwa-update" role="status" aria-live="polite">
                <span class="pwa-update-msg">{$t('pwa.update_available', { default: 'Nova versão do Presuntinho disponível! ✨' })}</span>
                <button type="button" class="pwa-update-reload" onclick={applyPwaUpdate}>
                  {$t('pwa.update_reload', { default: 'Atualizar' })}
                </button>
                <button
                  type="button"
                  class="pwa-update-dismiss"
                  onclick={() => (pwaUpdateReady = false)}
                  aria-label={$t('pwa.update_later', { default: 'Mais tarde' })}
                  title={$t('pwa.update_later', { default: 'Mais tarde' })}
                >×</button>
              </div>
            {/if}

            <!-- Footer principal: Home / Calendário / Agente / Vida / Escola. -->
            <nav class="bottom-nav" aria-label={$t('nav.bottom.aria', { default: 'Navegação principal' })}>
                  <a href="/" class="nav-btn" class:nav-btn-active={isActive('/')} aria-current={isActive('/') ? 'page' : undefined} class:nav-btn-disabled={!storesReady || !session} aria-disabled={!storesReady || !session} onclick={(event) => handleNavClick(event, 'Home')} aria-label={$t('nav.home.aria', { default: 'Home — dashboard principal' })} data-sveltekit-preload-data>
                    <span class="nav-icon" aria-hidden="true">🏠</span>
                    <span class="nav-label">{$t('nav.home', { default: 'Home' })}</span>
                  </a>
                  <a href="/calendario/" class="nav-btn" class:nav-btn-active={isActive('/calendario/')} aria-current={isActive('/calendario/') ? 'page' : undefined} class:nav-btn-disabled={!storesReady || !session} aria-disabled={!storesReady || !session} onclick={(event) => handleNavClick(event, 'Calendário')} aria-label={$t('nav.calendario.aria', { default: 'Calendário — agenda, mês e tasks' })} data-sveltekit-preload-data>
                    <span class="nav-icon" aria-hidden="true">🗓️</span>
                    <span class="nav-label">{$t('nav.calendario', { default: 'Calendário' })}</span>
                  </a>
                  <a href="/agente/" class="nav-btn" class:nav-btn-active={isActive('/agente/')} aria-current={isActive('/agente/') ? 'page' : undefined} class:nav-btn-disabled={!storesReady || !session} aria-disabled={!storesReady || !session} onclick={(event) => handleNavClick(event, 'Agente')} aria-label={$t('nav.agente.aria', { default: 'Agente — chat com IA' })} data-sveltekit-preload-data>
                    <span class="nav-icon" aria-hidden="true">🤖</span>
                    <span class="nav-label">{$t('nav.agente', { default: 'Agente' })}</span>
                  </a>
                  <a href="/vida/" class="nav-btn" class:nav-btn-active={isActive('/vida/')} aria-current={isActive('/vida/') ? 'page' : undefined} class:nav-btn-disabled={!storesReady || !session} aria-disabled={!storesReady || !session} onclick={(event) => handleNavClick(event, 'Vida')} aria-label={$t('nav.vida.aria', { default: 'Vida — finanças, hábitos e vícios' })} data-sveltekit-preload-data>
                    <span class="nav-icon" aria-hidden="true">🌿</span>
                    <span class="nav-label">{$t('nav.vida', { default: 'Vida' })}</span>
                  </a>
                  <a href="/mensagens/" class="nav-btn" class:nav-btn-active={isActive('/mensagens/')} aria-current={isActive('/mensagens/') ? 'page' : undefined} class:nav-btn-disabled={!storesReady || !session} aria-disabled={!storesReady || !session} onclick={(event) => handleNavClick(event, 'Mensagens')} aria-label={$t('nav.mensagens.aria', { default: 'Mensagens — conversas com o Daniel' })} data-sveltekit-preload-data>
                    <span class="nav-icon" aria-hidden="true">💬</span>
                    <span class="nav-label">{$t('nav.mensagens', { default: 'Mensagens' })}</span>
                  </a>
                </nav>

                <!--
                  Floating XP + install + easter eggs.
                  One stack above the bottom nav, anchored at the bottom so the
                  heart never moves when the pill/install button toggle.
                -->
                <div class="fab-stack" aria-live="polite">
                  <XpPill />
                  <InstallButton />
                  <HeartButton />
                </div>
                <div class="mascot-corner" aria-live="polite">
                  <Mascot />
                </div>
  </div>
{/if}

<style>
  .app {
    min-height: 100vh;
    background: var(--bg, #1f2e4a);
    color: var(--txt, #fff);
    display: flex;
    flex-direction: column;
    transition: background 220ms ease;
  }
  .app-mood {
    background:
      radial-gradient(circle at 12% 4%, color-mix(in srgb, var(--mood-accent) 22%, transparent) 0, transparent 34rem),
      radial-gradient(circle at 92% 18%, color-mix(in srgb, var(--mood-accent) 14%, transparent) 0, transparent 26rem),
      linear-gradient(180deg, color-mix(in srgb, var(--bg, #1f2e4a) 88%, var(--mood-accent)), var(--bg, #1f2e4a));
  }
  .app-mood .nav {
    border-bottom-color: color-mix(in srgb, var(--mood-accent) 26%, rgba(255,255,255,.12));
    box-shadow: 0 10px 34px color-mix(in srgb, var(--mood-accent) 12%, transparent);
  }
  .app-mood .logo-pig {
    text-shadow: 0 0 18px color-mix(in srgb, var(--mood-accent) 72%, transparent);
  }
  .app-mood .bottom-nav {
    background: linear-gradient(180deg, rgba(0,0,0,.22), color-mix(in srgb, rgba(0,0,0,.42) 82%, var(--mood-accent)));
    border-top-color: color-mix(in srgb, var(--mood-accent) 28%, rgba(255,255,255,.12));
    z-index: 9701;
  }
  .app-mood .nav-btn:hover,
  .app-mood .nav-btn:focus-visible {
    background: color-mix(in srgb, var(--mood-accent) 14%, rgba(255,255,255,.06));
  }
  /* WCAG 2.4.1 — visible only when focused via keyboard. */
  .skip-link {
    position: absolute;
    top: -100px;
    left: 0.5rem;
    background: var(--accent);
    color: var(--on-accent, #fff);
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
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 50%, transparent);
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
      box-shadow: 0 0 0 2px var(--accent);
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
      box-shadow: 0 0 0 2px var(--accent);
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
    box-shadow: 0 0 0 2px var(--accent);
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
      box-shadow: 0 0 0 2px var(--accent);
    }
    /* Active tab: accent tint + a small indicator bar so the current
       section is obvious at a glance (paired with aria-current="page"). */
    .nav-btn-active {
      position: relative;
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 12%, transparent);
    }
    .nav-btn-active::before {
      content: '';
      position: absolute;
      top: 2px;
      left: 50%;
      transform: translateX(-50%);
      width: 1.6rem;
      height: 3px;
      border-radius: 999px;
      background: var(--accent);
    }
    .nav-btn-active .nav-label {
      font-weight: 700;
    }
    .nav-btn-active:hover,
    .nav-btn-active:focus-visible {
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 16%, transparent);
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

    /* Floating action button stack (XP pill + install + easter eggs).
       Generalised for N children: a bottom-anchored column packed towards
       the end, so the bottom-most target (heart) never moves when the
       XP pill or install button appear/disappear above it. */
    .fab-stack {
      position: fixed;
      right: max(1rem, env(safe-area-inset-right));
      bottom: calc(env(safe-area-inset-bottom) + 5.75rem + var(--page-bottom-inset, 0px));
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: flex-end;
      gap: 0.65rem;
      width: 9.25rem;
      height: 6.9rem;
      z-index: 60;
      pointer-events: none; /* container ignores — children re-enable */
    }
    .fab-stack > :global(*) {
      pointer-events: auto;
    }
    .fab-stack > :global(:last-child) {
      position: absolute;
      right: 0;
      bottom: 0;
    }
    .fab-stack > :global(:first-child) {
      position: absolute;
      right: 0;
      bottom: 4.05rem;
    }
    /* PWA update banner — actionable "toast" pinned above the bottom nav. */
    .pwa-update {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      bottom: calc(env(safe-area-inset-bottom) + 5.25rem + var(--page-bottom-inset, 0px));
      display: flex;
      align-items: center;
      gap: var(--space-2);
      max-width: min(92vw, 30rem);
      padding: var(--space-2) var(--space-3);
      background: var(--bg-elev);
      color: var(--txt);
      border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg, 0 12px 36px rgba(0, 0, 0, 0.42));
      z-index: 9800;
    }
    .pwa-update-msg {
      font-size: var(--fs-sm);
      line-height: 1.35;
    }
    .pwa-update-reload {
      flex-shrink: 0;
      min-height: 44px;
      padding: 0.45rem 0.9rem;
      border: 0;
      border-radius: 999px;
      background: var(--accent);
      color: var(--on-accent, #fff);
      font: inherit;
      font-size: var(--fs-sm);
      font-weight: 700;
      cursor: pointer;
      transition: background var(--motion-fast, 120ms) ease;
    }
    .pwa-update-reload:hover,
    .pwa-update-reload:focus-visible {
      background: var(--accent-hover);
      outline: none;
    }
    .pwa-update-reload:focus-visible {
      box-shadow: 0 0 0 2px var(--txt);
    }
    .pwa-update-dismiss {
      flex-shrink: 0;
      min-width: 44px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 0;
      border-radius: var(--radius-sm);
      color: var(--txt3);
      font-size: 1.25rem;
      line-height: 1;
      cursor: pointer;
    }
    .pwa-update-dismiss:hover,
    .pwa-update-dismiss:focus-visible {
      color: var(--txt);
      background: var(--card-hover);
      outline: none;
    }
    .pwa-update-dismiss:focus-visible {
      box-shadow: 0 0 0 2px var(--accent);
    }
    .mascot-corner {
      position: fixed;
      left: max(0.85rem, env(safe-area-inset-left));
      bottom: calc(env(safe-area-inset-bottom) + 5.55rem + var(--page-bottom-inset, 0px));
      z-index: 60;
      pointer-events: none;
    }
    .mascot-corner > :global(*) {
      pointer-events: auto;
    }
    /* On wide screens give a little extra breathing room from the edge. */
    @media (min-width: 768px) {
      .fab-stack {
        right: max(1.5rem, env(safe-area-inset-right));
      }
      .mascot-corner {
        left: max(1.25rem, env(safe-area-inset-left));
      }
    }
</style>
