<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { goto, afterNavigate } from '$app/navigation';
  import { getSession, isLegacyProfile } from '$lib/auth/session';
  import CoupleCelebration from '$lib/components/CoupleCelebration.svelte';
  import { accountState } from '$lib/account/account-store.svelte';
  import { initStores, markVisited } from '$lib/state/stores';
  import Confetti from '$lib/components/Confetti.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import PageLoader from '$lib/components/PageLoader.svelte';
  import Mascot from '$lib/components/Mascot.svelte';
  import SecretModal from '$lib/components/SecretModal.svelte';
  import OfflineIndicator from '$lib/components/OfflineIndicator.svelte';
  import { handleKonamiKey, logoClick, checkSeasonalEggs } from '$lib/easterEggs';
  import { loadEasterEggs } from '$lib/easterEggsConfig';
  import SurpriseHeart from '$lib/components/SurpriseHeart.svelte';
  import XpPill from '$lib/components/XpPill.svelte';
  import XpToast from '$lib/components/XpToast.svelte';
  import InstallButton from '$lib/components/InstallButton.svelte';
  import MoodLayer from '$lib/components/MoodLayer.svelte';
  import GamificationLayer from '$lib/components/GamificationLayer.svelte';
  import CoupleMomentLayer from '$lib/components/CoupleMomentLayer.svelte';
  import GameInviteListener from '$lib/components/GameInviteListener.svelte';
  import CallLayer from '$lib/calls/CallLayer.svelte';
  import HabitReminders from '$lib/components/habitos/HabitReminders.svelte';
  import ArcadeTouchHud from '$lib/components/arcade/ArcadeTouchHud.svelte';
  import { arcadeHud } from '$lib/arcade/hud-state';
  import { arcadeImmersive } from '$lib/arcade/immersive-state';
  import { couple, startCouplePoller, stopCouplePoller } from '$lib/couple/couple-store.svelte';
  import { applyAppLogo, getAppLogo } from '$lib/app-logo';
  import { readActiveMood, isMoodIntroAcknowledged, MOOD_EVENT, MOOD_META, type ActiveMood } from '$lib/mood';

  import { notifBadge, refreshNotifBadge, bindNotifBadge } from '$lib/vida/notif-badge.svelte';
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
  let stopForegroundMessages: (() => void) | null = null;
  let foregroundMessagesProfile: string | null = null;

  // PWA prompt-mode update flow: the SW registration below hands us an
  // `updateSW` callback; when 'presuntinho:pwa-update' fires with
  // type 'needRefresh' we surface a small banner with a reload action.
  let pwaUpdateReady = $state(false);
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
  // Full-screen congrats when a couple link becomes ACTIVE (both accepted).
  let coupleCelebration = $state<{ label: string } | null>(null);
  // Incoming friend/couple requests + couple space invites (nav badge).
  let socialBadge = $state(0);
  let socialInvites = $state(0);
  const socialCount = $derived(socialBadge + socialInvites);
  // Conta para o avatar do header (fonte única de identidade) — o $state do
  // account-store é reativo entre módulos, basta derivar.
  const headerAccount = $derived(accountState.account);
  // Convite one-time para ativar o push quando o casal está ativo mas este
  // dispositivo ainda não tem subscrição (sem ela, pings/mensagens não chegam
  // ao telemóvel — foi exatamente o que aconteceu no primeiro teste real).
  let pushPrompt = $state<'hidden' | 'ask' | 'ios'>('hidden');
  let pushPromptChecked = false;
  const PUSH_PROMPTED_KEY = 'presuntinho-push-prompted';

  $effect(() => {
    if (!couple.available || pushPromptChecked) return;
    pushPromptChecked = true;
    void (async () => {
      try {
        if (localStorage.getItem(PUSH_PROMPTED_KEY)) return;
        const { getPushState } = await import('$lib/push');
        const s = await getPushState();
        if (s === 'off') pushPrompt = 'ask';
        else if (s === 'ios-needs-install') pushPrompt = 'ios';
      } catch {
        /* push indisponível — sem prompt */
      }
    })();
  });

  function dismissPushPrompt(): void {
    pushPrompt = 'hidden';
    try {
      localStorage.setItem(PUSH_PROMPTED_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  async function acceptPushPrompt(): Promise<void> {
    try {
      const { enablePush } = await import('$lib/push');
      const s = await enablePush();
      if (s === 'on') {
        showToast(get(t)('push.enabled', { default: '🔔 Notificações ativas! Os pings chegam mesmo com a app fechada.' }), 3000);
      } else if (s === 'denied') {
        showToast(get(t)('push.denied', { default: 'O browser bloqueou as notificações — ativa-as nas definições do site.' }), 3800, 'error');
      }
    } catch {
      /* best-effort */
    }
    dismissPushPrompt();
  }

  const moodAccent = $derived(activeMood ? MOOD_META[activeMood.kind].accent : null);
  const isMessagesRoute = $derived(isActive('/mensagens/'));
  const isComposerRoute = $derived(isActive('/mensagens/') || isActive('/agente/'));

  // Pages with a fixed bottom composer (chat input) need the floating
  // elements (fab-stack, mascot, mood chip, PWA banner) lifted above it.
  // Consumed via var(--page-bottom-inset) — see app.css for the token.
  const pageBottomInset = $derived(isActive('/agente/') ? '5.5rem' : isActive('/mensagens/') ? '3rem' : '0px');

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
    // A sessão é lida uma vez no arranque; /login e /splash escrevem-na e
    // navegam SPA para "/" sem reload — sem re-ler aqui, a bottom-nav ficava
    // presa em "inicia sessão primeiro" até um refresh manual.
    if (!session) {
      const fresh = getSession();
      if (fresh) {
        session = fresh;
        if (authRedirectTimer) {
          clearTimeout(authRedirectTimer);
          authRedirectTimer = null;
        }
        // initStores é idempotente e sensível ao perfil — chamamos sempre,
        // porque o boot marca storesReady=true mesmo sem sessão (defaults).
        void initStores(fresh.profile)
          .then(() => (storesReady = true))
          .catch((e) => console.error('[presuntinho] initStores failed:', e));
      }
    }
    // Keep the header bell fresh as you move around (throttled inside).
    if (session && storesReady) void refreshNotifBadge();
  });

  // Load the badge as soon as Dexie stores are ready, and keep it live on
  // NOTIF_CHANGED + tab focus. No timer — getDailyQuests() must not be polled.
  $effect(() => {
    if (session && storesReady) void refreshNotifBadge();
  });

  // One account-wide message listener keeps cute foreground delivery working
  // even outside /mensagens/.  Legacy local profiles have no authenticated
  // account/DM identity, so they deliberately do not open this global channel.
  $effect(() => {
    const profile = session?.profile ?? null;
    if (!profile || isLegacyProfile(profile)) {
      stopForegroundMessages?.();
      stopForegroundMessages = null;
      foregroundMessagesProfile = null;
      return;
    }
    if (foregroundMessagesProfile === profile) return;

    stopForegroundMessages?.();
    stopForegroundMessages = null;
    foregroundMessagesProfile = profile;
    let cancelled = false;

    void import('$lib/couple/foreground-messages')
      .then(({ subscribeForegroundMessages }) => {
        if (cancelled || getSession()?.profile !== profile) return;
        stopForegroundMessages = subscribeForegroundMessages(profile, () =>
          couple.accountCouple && couple.coupleId ? couple.coupleId : null
        );
      })
      .catch((error) => {
        if (!cancelled) console.warn('[presuntinho] foreground messages unavailable', error);
      });

    return () => {
      cancelled = true;
      if (foregroundMessagesProfile !== profile) return;
      stopForegroundMessages?.();
      stopForegroundMessages = null;
      foregroundMessagesProfile = null;
    };
  });
  onMount(() => {
    const unbind = bindNotifBadge();
    const onVis = () => {
      if (document.visibilityState === 'visible' && session && storesReady) void refreshNotifBadge();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      unbind();
      document.removeEventListener('visibilitychange', onVis);
    };
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

    // V10.5 — ícone da app personalizado: aplica o manifest/apple-touch-icon
    // do logo escolhido o mais cedo possível (o Chrome só apanha a mudança
    // de ícone quando a página carrega com o manifest novo lincado).
    void getAppLogo()
      .then((logo) => applyAppLogo(logo))
      .catch(() => undefined);

    let unbindKey: (() => void) | null = null;
    let unbindExtra: (() => void) | null = null;
    let moodPoll: ReturnType<typeof setInterval> | null = null;
    let swPoll: ReturnType<typeof setInterval> | null = null;
    let seasonalTimer: ReturnType<typeof setTimeout> | null = null;
    let unwatchCoupleLink: (() => void) | null = null;

    async function refreshMood(): Promise<void> {
      const mood = await readActiveMood();
      // SECURITY (lock-screen feature): a mood must NEVER create a session.
      // The old code called setSession('fatma','secret') here, so typing a
      // mood phrase ('love'/'sad'/'sick') at the splash silently logged you in
      // — a real hole. The mood now only THEMES the app, and only once a real
      // session already exists (the PBKDF2 password or a user-configured
      // lock-screen passphrase). Mood activation itself is untouched.
      activeMood = mood && isMoodIntroAcknowledged(mood) ? mood : null;
    }
    const onMoodChanged = (event: Event) => {
      const mood = event instanceof CustomEvent ? (event.detail as ActiveMood | null) : null;
      // SECURITY: mood changes never grant a session either (see refreshMood).
      activeMood = mood && isMoodIntroAcknowledged(mood) ? mood : null;
      void refreshMood();
    };
    void refreshMood();
    window.addEventListener(MOOD_EVENT, onMoodChanged);
    moodPoll = setInterval(refreshMood, 30_000);

    // Couple sync: one global poller keeps shared points fresh and surfaces
    // incoming love/nudge pings as toasts (+ a buzz). No-ops without a token.
    // Phase 3b: resolve the couple_id from an ACTIVE couple space first (<=3s,
    // timeout-guarded so it can't stall), then start; falls back to legacy.
    void import('$lib/couple/couple-supabase')
      .then((m) => m.resolveCoupleId())
      .catch(() => {})
      .finally(() => startCouplePoller());

    // Couple LINKING: watch for couple invites/activations for account users.
    // When a couple becomes ACTIVE (both said yes), celebrate once per device
    // (full-screen congrats + notification) and re-arm the couple features.
    {
      const sessionProfile = getSession()?.profile;
      if (sessionProfile && !isLegacyProfile(sessionProfile)) {
        void import('$lib/account/couple-link').then(({ watchCoupleLink }) => {
          unwatchCoupleLink = watchCoupleLink(sessionProfile, {
            onCoupleActive: (_space, partner) => {
              const label = partner?.display_name || (partner ? `@${partner.handle}` : '💞');
              coupleCelebration = { label };
              void import('$lib/habitos/reminders')
                .then(({ showAppNotification }) =>
                  showAppNotification(get(t)('couplelink.notif.title', { default: '💞 Modo casal ativado!' }), {
                    body: get(t)('couplelink.notif.body', {
                      values: { name: label },
                      default: `Tu e ${label} estão ligados. Abre o Presuntinho!`
                    })
                  })
                )
                .catch(() => undefined);
              // Re-scope points/pings to the fresh couple space right away.
              void import('$lib/couple/couple-supabase').then((m) => m.invalidateCoupleId()).catch(() => undefined);
              void import('$lib/couple/couple-store.svelte').then((m) => m.refreshCoupleEnabled()).catch(() => undefined);
            },
            onRequestsChanged: (reqs) => {
              socialBadge = reqs.friends.length + reqs.couples.length;
            },
            onInvitesChanged: (invites) => {
              socialInvites = invites.length;
            },
            onNewRequest: (req) => {
              const name = req.from.display_name || `@${req.from.handle}`;
              const title =
                req.kind === 'couple'
                  ? get(t)('social.notif.couple_title', { default: '💞 Pedido de casal!' })
                  : get(t)('social.notif.friend_title', { default: '👋 Pedido de amizade' });
              const body =
                req.kind === 'couple'
                  ? get(t)('social.notif.couple_body', { values: { name }, default: `${name} quer ser teu casal. Toca para responder!` })
                  : get(t)('social.notif.friend_body', { values: { name }, default: `${name} quer ligar-se contigo.` });
              showToast(`${title} ${body}`, 4200);
              void import('$lib/habitos/reminders')
                .then(({ showAppNotification }) => showAppNotification(title, { body }))
                .catch(() => undefined);
            }
          });
        }).catch(() => undefined);
      }
    }

    // Easter-egg boot hooks — used to live on the always-mounted HeartButton,
    // which the SurpriseHeart replaced. Warm the config cache and run the
    // once-per-day seasonal check a beat after boot so its toast doesn't
    // collide with the splash toasts.
    void loadEasterEggs();
    seasonalTimer = setTimeout(() => void checkSeasonalEggs(), 2200);

    // PWA: regista o service worker gerado pelo @vite-pwa/sveltekit.
    // Em dev (devOptions.enabled = false) o módulo virtual:pwa-register não
    // existe, por isso o .catch() mantém a app silenciosamente funcional.
    // Prompt-mode: guardamos o callback devolvido por registerSW para que
    // o banner "nova versão" possa aplicar o update + reload num toque.
    if ('serviceWorker' in navigator) {
      import('virtual:pwa-register')
        .then(async ({ registerSW }) => {
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
          // Expose the update callback so the Definições "Atualizar app" button
          // can force the newest deploy on demand.
          const { setUpdateSW } = await import('$lib/pwa/app-update');
          if (updateSW) setUpdateSW(updateSW);
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
      secretRoomOpen = false;
      window.location.href = '/secrets/';
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

      // Layer A — cross-device achievement sync (XP / badges / secrets /
      // visited / quiz). Non-destructive merge, so it's safe to run
      // automatically. Dynamic import keeps @supabase out of the main bundle;
      // no-ops when Supabase isn't configured.
      if (session && storesReady) {
        void import('$lib/couple/couple-supabase')
          .then((c) => c.resolveCoupleId())
          .catch(() => {})
          .then(() => import('$lib/state/progress-sync'))
          .then((m) => m.startProgressSync(session!.profile))
          .catch((err) => console.warn('[presuntinho] progress sync unavailable', err));
      }

      // Phase 1 — track the real Supabase account (login state) for the whole
      // app. Independent of the local profile; no-ops when Supabase is off.
      void import('$lib/account/account-store.svelte')
        .then((m) => m.startAccountSync())
        .catch((err) => console.warn('[presuntinho] account sync unavailable', err));

      // Visit tracking now runs in afterNavigate (covers EVERY navigation,
      // including the initial one) — see trackVisit() above.

      // Auth gate: each route owns its own empty-state ("iniciar sessão").
            // The layout must NOT redirect-away on user clicks — that turned
            // bottom-nav taps into silent no-ops (the redirect fired 550ms after
            // navigation and yanked the user back to /splash/).
            // Only fire the initial guard once per mount, with a longer delay so
            // users actively navigating are not interrupted mid-tap.
            // Public routes a logged-out visitor is allowed to sit on: the login
            // splash, the new-account wizard, and an invite-redemption link.
            const p = page.url.pathname;
            const isPublicRoute = p === '/splash/' || p.startsWith('/onboarding') || p.startsWith('/juntar') || p.startsWith('/conta') || p.startsWith('/contactos') || p.startsWith('/grupos') || p.startsWith('/convite') || p.startsWith('/u') || p.startsWith('/secrets/versus');
            if (!session && !isPublicRoute && !authRedirectTimer) {
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
      if (seasonalTimer) clearTimeout(seasonalTimer);
      stopCouplePoller();
      stopForegroundMessages?.();
      stopForegroundMessages = null;
      foregroundMessagesProfile = null;
      unwatchCoupleLink?.();
      void import('$lib/state/progress-sync').then((m) => m.stopProgressSync()).catch(() => {});
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

</script>

<PageLoader />

{#if page.url.pathname === '/splash/'}
  {@render children?.()}
{:else}
  <Confetti />
  <Toast />
  <XpToast />
  <GamificationLayer />
  <CoupleMomentLayer />
  <GameInviteListener />
  <CallLayer />
  <HabitReminders />
  <SecretModal bind:open={secretRoomOpen} />
  <!-- Phase 15: offline status banner (listens to online/offline events). -->
  <OfflineIndicator />
  <a class="skip-link" href="#main-content">{$t('a11y.skipToContent')}</a>
  <div
    class={`app ${isMessagesRoute ? 'app-messages' : ''} ${isComposerRoute ? 'app-composer' : ''} ${activeMood ? `app-mood app-mood-${activeMood.kind}` : ''} ${$arcadeHud || $arcadeImmersive ? 'arcade-immersive' : ''}`}
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
                  <!-- O teu perfil, sempre à mão: avatar da CONTA em todas as
                       páginas → abre o perfil público (/u). -->
                  {#if headerAccount}
                    <a
                      href={`/u/?h=${headerAccount.handle}`}
                      class="icon-btn avatar-btn"
                      aria-label={$t('a11y.my_profile', { default: 'O meu perfil' })}
                      title={$t('a11y.my_profile', { default: 'O meu perfil' })}
                    >
                      {#if headerAccount.avatar_url}
                        <img class="avatar-btn-img" src={headerAccount.avatar_url} alt="" />
                      {:else}
                        <span class="avatar-btn-emoji" aria-hidden="true">{headerAccount.emoji ?? '🙂'}</span>
                      {/if}
                    </a>
                  {/if}
                  <!-- Global notifications bell with an unread badge — reachable
                       from every screen, not just the Home hero chip. -->
                  <a
                    href="/notificacoes/"
                    class="icon-btn notif-btn"
                    aria-current={isActive('/notificacoes/') ? 'page' : undefined}
                    aria-label={$t('a11y.notifications', { values: { count: notifBadge.count }, default: 'Notificações' })}
                    title={$t('a11y.notifications', { values: { count: notifBadge.count }, default: 'Notificações' })}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    {#if notifBadge.count > 0}
                      <span class="notif-badge" aria-hidden="true">{notifBadge.count > 9 ? '9+' : notifBadge.count}</span>
                    {/if}
                  </a>
                  <!-- Language + logout moved to /definicoes to declutter the header. -->
                  <a href="/definicoes" class="icon-btn" aria-label={$t('a11y.settings', { default: 'Definições' })} title={$t('a11y.settings', { default: 'Definições' })}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                  </a>
                </div>
              </div>
            </header>

            <main id="main-content" class="content" tabindex="-1">
              <!-- V10: keyed wrapper re-mounts per route → fade/slide-in
                   transition (killed globally by prefers-reduced-motion). -->
              {#key page.url.pathname}
                <div class="route-transition">
                  {@render children?.()}
                </div>
              {/key}
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
                  <a href="/agente/" class="nav-btn nav-btn-center" class:nav-btn-active={isActive('/agente/')} aria-current={isActive('/agente/') ? 'page' : undefined} class:nav-btn-disabled={!storesReady || !session} aria-disabled={!storesReady || !session} onclick={(event) => handleNavClick(event, 'Agente')} aria-label={$t('nav.agente.aria', { default: 'Agente — chat com IA' })} data-sveltekit-preload-data>
                    <span class="nav-icon" aria-hidden="true">🤖</span>
                    <span class="nav-label">{$t('nav.agente', { default: 'Agente' })}</span>
                  </a>
                  <a href="/vida/" class="nav-btn" class:nav-btn-active={isActive('/vida/')} aria-current={isActive('/vida/') ? 'page' : undefined} class:nav-btn-disabled={!storesReady || !session} aria-disabled={!storesReady || !session} onclick={(event) => handleNavClick(event, 'Vida')} aria-label={$t('nav.vida.aria', { default: 'Vida — finanças, hábitos e vícios' })} data-sveltekit-preload-data>
                    <span class="nav-icon" aria-hidden="true">🌿</span>
                    <span class="nav-label">{$t('nav.vida', { default: 'Vida' })}</span>
                  </a>
                  <a href="/mensagens/" class="nav-btn" class:nav-btn-active={isActive('/mensagens/')} aria-current={isActive('/mensagens/') ? 'page' : undefined} class:nav-btn-disabled={!storesReady || !session} aria-disabled={!storesReady || !session} onclick={(event) => handleNavClick(event, 'Mensagens')} aria-label={$t('nav.mensagens.aria', { default: 'Mensagens — conversas com o Daniel' })} data-sveltekit-preload-data>
                    <span class="nav-icon" aria-hidden="true">💬{#if socialCount > 0}<span class="nav-badge" aria-hidden="true">{socialCount > 9 ? '9+' : socialCount}</span>{/if}</span>
                    <span class="nav-label">{$t('nav.mensagens', { default: 'Mensagens' })}</span>
                    {#if socialCount > 0}<span class="sr-only">{$t('social.badge_aria', { values: { n: socialCount }, default: '{n} pedidos pendentes' })}</span>{/if}
                  </a>
                </nav>

                <!--
                  Floating XP + install + easter eggs.
                  One stack above the bottom nav, anchored at the bottom so the
                  heart never moves when the pill/install button toggle.
                -->
                <!-- In arcade game mode the mascot + heart FABs step aside and
                     the game's own touch controls take their corners. -->
                <div class="fab-stack" class:game-hidden={$arcadeHud || $arcadeImmersive} aria-live="polite" aria-hidden={$arcadeHud || $arcadeImmersive ? 'true' : undefined}>
                  <XpPill />
                  <InstallButton />
                </div>
                <!-- Mascot lives bottom-RIGHT; the server-synchronised couple
                     heart appears wholly above it on both devices. -->
                <div class="mascot-corner" class:game-hidden={$arcadeHud || $arcadeImmersive}>
                  <Mascot interactive />
                  <!-- The surprise heart only makes sense when this session can
                       actually contribute couple points — hide the inert affordance
                       for solo / onboarded (non-couple) users. -->
                  {#if couple.accountCouple}
                    <SurpriseHeart />
                  {/if}
                </div>
                {#if coupleCelebration}
                  <CoupleCelebration
                    partnerLabel={coupleCelebration.label}
                    onclose={() => (coupleCelebration = null)}
                  />
                {/if}
                {#if pushPrompt !== 'hidden'}
                  <div class="push-prompt" role="dialog" aria-label={$t('push.prompt_aria', { default: 'Ativar notificações' })}>
                    <span class="pp-icon" aria-hidden="true">🔔</span>
                    <div class="pp-body">
                      <strong>{$t('push.prompt_title', { default: 'Recebe os pings no telemóvel' })}</strong>
                      {#if pushPrompt === 'ios'}
                        <small>{$t('push.ios_hint', { default: 'No iPhone: abre no Safari → Partilhar → "Adicionar ao ecrã principal", e ativa as notificações dentro da app instalada.' })}</small>
                      {:else}
                        <small>{$t('push.prompt_body', { default: 'Os "amo-te", as "saudades" e as mensagens chegam mesmo com a app fechada.' })}</small>
                      {/if}
                    </div>
                    {#if pushPrompt === 'ask'}
                      <button type="button" class="pp-cta" onclick={() => void acceptPushPrompt()}>{$t('push.prompt_cta', { default: 'Ativar' })}</button>
                    {/if}
                    <button type="button" class="pp-close" onclick={dismissPushPrompt} aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}>✕</button>
                  </div>
                {/if}
                {#if $arcadeHud}
                  <ArcadeTouchHud
                    left={$arcadeHud.left}
                    right={$arcadeHud.right}
                    onTurn={$arcadeHud.onTurn}
                    onHold={$arcadeHud.onHold}
                    onAction={$arcadeHud.onAction}
                  />
                {/if}
  </div>
{/if}

<style>
  .app {
    /* Dynamic viewport height: on mobile, `100vh` is the LARGE viewport (URL
       bar hidden), so with the sticky bottom-nav as the last flex child the
       document ends up a few px taller than the visible area whenever the URL
       bar is shown — that overflow lets the sticky footer slide up/down (most
       visible on full-height pages like /agente). `100dvh` tracks the current
       viewport, so there is no overflow and the footer stays put. `100vh` is
       kept as a fallback for browsers without dvh. */
    min-height: 100vh;
    min-height: 100dvh;
    background: var(--bg, #1f2e4a);
    color: var(--txt, #fff);
    display: flex;
    flex-direction: column;
    transition: background 220ms ease;
  }
  /* Rotas de chat (mensagens/agente): altura EXATA ao viewport e documento
     travado. Com min-height, qualquer estimativa interna que passasse uns px
     do viewport fazia o documento scrollar — o footer sticky "subia" e dava
     para arrastar a página por trás. height + overflow hidden tornam isso
     estruturalmente impossível; o único scroller é a lista interna do chat. */
  .app-composer {
    height: 100vh;
    height: 100dvh;
    min-height: 0;
    overflow: hidden;
    overscroll-behavior: none;
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
    /* iOS PWA uses black-translucent status bar + viewport-fit=cover, so the
       header must respect the top safe area (bottom nav already does this). */
    padding: calc(0.75rem + env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) 0.75rem
      max(1rem, env(safe-area-inset-left));
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
  /* V10: route transition — FADE ONLY. Um transform aqui (mesmo identidade,
     com fill-mode) tornaria este wrapper o containing block dos descendentes
     position:fixed — o composer dos chats deixava de colar ao viewport. */
  /* Guard: no route's top-level wrapper may exceed the viewport width. A flex
     item (this wrapper's child) with width:auto resolves to its MAX-content,
     which on narrow phones blew pages ~76px past the viewport and bled the
     fixed chrome. Capping at 100% ties every page to the real viewport. */
  .route-transition > :global(*) {
    max-width: 100%;
    min-width: 0;
  }
  .route-transition {
    animation: route-in var(--motion-base, 220ms) ease;
    /* Height passthrough for full-height routes. Only `opacity` is animated
       (never transform), so this wrapper never becomes a containing block for
       the chat composer's position:fixed — see the note above. */
    flex: 1;
    min-height: 0;
    /* min-width:0 so a wide descendant can't floor this flex item at its
       min-content width and push the page past the viewport (horizontal bleed). */
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  @keyframes route-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  /* V10.1: the "Presuntinho" wordmark stays next to the pig on every
     viewport (Daniel's ask) — narrow phones get a smaller wordmark and a
     compact LanguageSwitcher (flag-only) instead of hiding the brand. */
  @media (max-width: 520px) {
    .logo-text {
      font-size: 0.95rem;
      letter-spacing: -0.01em;
    }
    .nav-inner {
      gap: 0.4rem;
    }
    .nav-actions {
      gap: 0.3rem;
    }
  }
  @media (max-width: 380px) {
    .logo-text {
      font-size: 0.85rem;
    }
  }
  .avatar-btn { overflow: hidden; padding: 0; }
  .avatar-btn-img { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }
  .avatar-btn-emoji { font-size: 1.25rem; line-height: 1; }
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px; /* WCAG 2.5.5 / Apple HIG touch target */
    height: 44px;
    border-radius: var(--radius-md);
    background: transparent;
    /* Tokens, não brancos fixos — nos temas claros um #fff fica invisível
       (antes era "salvo" por uma regra global de <a> que já não se sobrepõe). */
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    color: var(--txt, #fff);
    cursor: pointer;
    text-decoration: none;
    transition: background 0.2s, border-color 0.2s;
  }
  .icon-btn:hover,
  .icon-btn:focus-visible {
    background: color-mix(in srgb, var(--txt, #fff) 8%, transparent);
    border-color: var(--border-strong, rgba(255, 255, 255, 0.3));
    outline: none;
  }
  .icon-btn:focus-visible {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .notif-btn {
    position: relative;
  }
  .notif-badge {
    position: absolute;
    top: -2px;
    inset-inline-end: -2px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--error, #ef4444);
    color: #fff;
    font-size: 0.68rem;
    font-weight: 900;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
  .content {
    flex: 1;
    width: 100%;
    /* Pass the real flex height (100dvh − sticky header − sticky footer) down to
       the page so full-height routes (e.g. the /agente chat) fill EXACTLY the
       gap between header and footer — no hardcoded magic numbers, no dead band
       above the footer, no overflow on notched devices. */
    display: flex;
    flex-direction: column;
    min-height: 0;
    /* min-width:0 so a wide child can't blow the column out horizontally. */
    min-width: 0;
  }
  .bottom-nav {
      position: sticky;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-around;
      align-items: center;
      background: color-mix(in srgb, var(--bg-elev, rgba(255, 255, 255, 0.92)) 86%, transparent);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-top: 1px solid var(--border);
      padding: 0.4rem 0.25rem calc(0.4rem + env(safe-area-inset-bottom));
      z-index: 50;
      box-shadow: var(--shadow-md, 0 -4px 20px rgba(0, 0, 0, 0.15));
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
      /* Token em vez de branco fixo — legível em temas claros e escuros. */
      color: color-mix(in srgb, var(--txt, #fff) 78%, transparent);
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
      color: var(--txt);
      background: color-mix(in srgb, var(--accent) 8%, transparent);
      outline: none;
    }
    .nav-btn:active {
      transform: scale(0.96);
    }
    /* Agente — the raised centre action (design mockups): a pink circle
       floating above the bar with the icon inside; label stays below. */
    .nav-btn-center .nav-icon {
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      margin-top: -26px;
      background: linear-gradient(150deg, var(--accent) 0%, var(--accent-hover, var(--accent)) 100%);
      border: 3px solid var(--bg-elev, #fff);
      border-radius: 999px;
      box-shadow: 0 8px 20px color-mix(in srgb, var(--accent) 45%, transparent);
      font-size: 1.35rem;
      line-height: 1;
    }
    .nav-btn-center.nav-btn-active {
      background: transparent;
    }
    .nav-btn-center.nav-btn-active::before {
      display: none;
    }
    .nav-btn-center:hover,
    .nav-btn-center:focus-visible {
      background: transparent;
    }
    .nav-btn-center:hover .nav-icon {
      transform: translateY(-2px);
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
    .nav-icon { position: relative; }
    .nav-badge {
      position: absolute;
      top: -4px;
      inset-inline-end: -10px;
      min-width: 17px;
      height: 17px;
      padding: 0 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--error, #ef4444);
      color: #fff;
      font-size: 0.6rem;
      font-weight: 800;
      line-height: 1;
      box-shadow: 0 0 0 2px var(--bg-elev, #fff);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      border: 0;
    }
    .push-prompt {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      bottom: calc(5.4rem + env(safe-area-inset-bottom));
      width: min(430px, calc(100vw - 1.2rem));
      z-index: 80;
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.7rem 0.8rem;
      background: var(--card);
      border: 1.5px solid color-mix(in srgb, var(--accent) 45%, var(--border));
      border-radius: var(--radius-lg, 1rem);
      box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.35));
      animation: jump-in-prompt 260ms ease;
    }
    @keyframes jump-in-prompt {
      from { opacity: 0; transform: translateX(-50%) translateY(8px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    .pp-icon { font-size: 1.5rem; line-height: 1; }
    .pp-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .pp-body strong { font-size: 0.9rem; color: var(--txt); }
    .pp-body small { font-size: 0.76rem; color: var(--txt3); line-height: 1.35; }
    .pp-cta {
      flex-shrink: 0;
      min-height: 40px;
      padding: 0 1rem;
      border: 0;
      border-radius: 999px;
      background: var(--accent);
      color: var(--on-accent, #fff);
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .pp-cta:hover { filter: brightness(1.06); }
    .pp-close {
      flex-shrink: 0;
      width: 34px;
      height: 34px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--txt3);
      font-size: 0.9rem;
      cursor: pointer;
    }
    .pp-close:hover { color: var(--txt); background: color-mix(in srgb, var(--txt3) 14%, transparent); }
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
    /* XP pill + install button now sit bottom-LEFT (the mascot took the right
       corner). Two children: XP pill on top, install button below. */
    .fab-stack {
      position: fixed;
      left: max(1rem, env(safe-area-inset-left));
      bottom: calc(env(safe-area-inset-bottom) + 5.75rem + var(--page-bottom-inset, 0px));
      display: flex;
      flex-direction: column;
      align-items: flex-start;
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
      left: 0;
      bottom: 0;
    }
    .fab-stack > :global(:first-child) {
      position: absolute;
      left: 0;
      bottom: 4.05rem;
    }
    /* Arcade game mode keeps controls clear, but the shared heart must still
       honour the same server window on both phones. Hide only the mascot. */
    .fab-stack.game-hidden {
      display: none;
    }
    .mascot-corner.game-hidden > :global(.mascot-fab) {
      display: none;
    }
    /* Immersive play: hide the app chrome so the game gets the whole screen.
       The PWA update banner is hidden too — with the bottom-nav gone it would
       otherwise float over the playfield/controls (it returns after the game). */
    .app.arcade-immersive :global(header.nav),
    .app.arcade-immersive :global(nav.bottom-nav),
    .app.arcade-immersive :global(.pwa-update) {
      display: none;
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
    /* Mascot: bottom-RIGHT, and the anchor for the surprise heart that pops on
       top of it (absolutely positioned inside this fixed box). */
    .mascot-corner {
      position: fixed;
      right: max(0.85rem, env(safe-area-inset-right));
      bottom: calc(env(safe-area-inset-bottom) + 5.55rem + var(--page-bottom-inset, 0px));
      width: 78px;
      height: 78px;
      z-index: 60;
      pointer-events: none;
    }
    .mascot-corner > :global(*) {
      pointer-events: auto;
    }
    /* On wide screens give a little extra breathing room from the edge. */
    @media (min-width: 768px) {
      .fab-stack {
        left: max(1.5rem, env(safe-area-inset-left));
      }
      .mascot-corner {
        right: max(1.25rem, env(safe-area-inset-right));
      }
    }
    /* /mensagens/ and /agente/ have their own fixed composer. On small
       screens hide only the mascot itself: the synchronized heart must still
       appear on both partners' phones regardless of which route is open. */
    @media (max-width: 767px) {
      .app-composer .mascot-corner > :global(.mascot-fab) {
        display: none;
      }
    }
</style>
