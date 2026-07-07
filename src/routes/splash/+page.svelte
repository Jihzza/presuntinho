<script lang="ts">
  import { verifyAgainstHashes, verifyPassword, type ProfileId } from '$lib/auth/hash';
  import { setSession, isLockedOut, recordFailedAttempt, resetAttempts, getSession, registerKnownMember } from '$lib/auth/session';
  import { listMembers } from '$lib/space/registry-db';
  import type { Membership } from '$lib/space/types';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { signInWithGoogle } from '$lib/account/auth';
  import { bridgeSupabaseSession } from '$lib/account/session-bridge';
  import { t, waitLocale } from 'svelte-i18n';
  import { locale as localeStore } from '$lib/i18n';
  import LoveLock from '$lib/components/LoveLock.svelte';
  import MascotAvatar from '$lib/components/MascotAvatar.svelte';
  import {
    detectMoodTrigger,
    activateMood,
    readActiveMood,
    acknowledgeMoodIntro,
    isMoodIntroAcknowledged,
    type ActiveMood,
  } from '$lib/mood';
  import {
    getActiveLockScreen,
    verifyLockPassphrase,
    verifyHandleUnlock,
    lockScreenHasPassphrase,
    LOCKSCREEN_EVENT,
    type LockScreen,
  } from '$lib/lockscreen/lockscreen';
  // svelte-i18n 4 ships `$t` as the message-formatter store.  In a
  // <script lang="ts"> block we call it as `$t(...)` via Svelte's
  // store auto-subscription — `t(...)` would try to call the store
  // itself which isn't callable.  Match the pattern in
  // src/routes/definicoes/+page.svelte.

  let password = $state('');
  // V10.1 (login sério): explicit username field. The pass-order inference
  // stays the auth source of truth; the username personalizes the lockout
  // bucket and must MATCH the inferred profile when filled in.
  let username = $state('');
  let error = $state('');
  let shake = $state(false);
  let locked = $state({ locked: false, remainingMs: 0 });
  let loading = $state(false);
  let googleBusy = $state(false);
  let selectedProfile = $state<ProfileId>('fatma');

  // ── Lock screens (opt-in couple feature) ──
  // When a lock screen is ACTIVE it personalizes this gate (its emoji/title/
  // message replace the generic copy) and, if it has a passphrase, that
  // passphrase becomes an ADDITIONAL way in — verified with PBKDF2. It never
  // replaces or weakens the real password path below.
  let activeLock = $state<LockScreen | null>(null);
  const lockHasPassphrase = $derived(lockScreenHasPassphrase(activeLock));

  // Login via a partner @handle + a lock-screen passphrase (couple "lock a
  // connected account" flow). Local-only for now — see lockscreen.ts.
  let tagHandle = $state('');
  let tagPass = $state('');
  let tagError = $state('');
  let tagLoading = $state(false);

  /** Start "Continue with Google" (redirects to Google, returns to /splash/). */
  async function onGoogle(): Promise<void> {
    if (googleBusy) return;
    googleBusy = true;
    error = '';
    try {
      await signInWithGoogle(); // navigates away on success
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      googleBusy = false;
    }
  }
  // Love Lock state — when non-null the splash card is replaced by the
  // LoveLock full-screen modal until the user clicks the confirmation.
  let loveLockState = $state<ActiveMood | null>(null);
  // Locale reactive — used by LoveLock to pick the right copy. Defaults to
  // 'en' until svelte-i18n has hydrated (LoveLock falls back to en anyway).
  let currentLocale = $state<string>('en');

  // Returning onboarded members on THIS device (uuid members with a password).
  // Legacy fatma/daniel keep their own pass-order form above; this only adds a
  // way for a new member to log back in after their session expired.
  let extraMembers = $state<Membership[]>([]);
  let pickedMember = $state<Membership | null>(null);
  let memberPassword = $state('');
  let memberError = $state('');
  let memberLoading = $state(false);

  function pickMember(m: Membership): void {
    pickedMember = pickedMember?.id === m.id ? null : m;
    memberPassword = '';
    memberError = '';
  }

  async function loginMember(e: Event, m: Membership): Promise<void> {
    e.preventDefault();
    if (memberLoading || !m.secret) return;
    if (!memberPassword.trim()) {
      memberError = $t('splash.error.empty', { default: 'Escreve a palavra-passe.' });
      return;
    }
    memberLoading = true;
    memberError = '';
    try {
      const ok = await verifyPassword(memberPassword, m.secret.salt, m.secret.hash);
      if (!ok) {
        memberError = $t('splash.members.wrong', { default: 'Palavra-passe errada.' });
        return;
      }
      registerKnownMember(m.id);
      setSession(m.id as ProfileId, 'primary');
      await goto('/');
    } catch (err) {
      console.error('[splash] member login failed', err);
      memberError = $t('splash.members.error', { default: 'Não consegui entrar. Tenta outra vez.' });
    } finally {
      memberLoading = false;
    }
  }

  onMount(() => {
      // Ensure translations are ready before first paint.
      void waitLocale();
      // Track the active locale so LoveLock copy follows the user's preference.
      const unsubLocale = localeStore.subscribe((v) => {
        if (typeof v === 'string') currentLocale = v;
      });
      // If already unlocked, skip splash
      if (getSession()) {
        unsubLocale();
        goto('/');
        return;
      }
      // Real-account bridge: a Supabase session (email / Google / later Saikan
      // ID) opens the app as the matching profile. This also catches the Google
      // OAuth redirect that lands back here.
      void bridgeSupabaseSession()
        .then((r) => {
          if (r === 'bridged') location.href = '/';
          else if (r === 'needs-handle') void goto('/conta/');
        })
        .catch(() => undefined);
      // Load returning onboarded members (uuid + password) so they can log back
      // in. Legacy fatma/daniel are excluded — they use the pass-order form.
      void listMembers()
        .then((ms) => (extraMembers = ms.filter((m) => !m.legacyProfileId && m.status === 'active' && !!m.secret)))
        .catch(() => undefined);
      // Surface the ACTIVE lock screen (if any) so the gate renders its custom
      // emoji/title/message and can accept its passphrase. Sync localStorage
      // read; kept fresh if it changes in another tab.
      activeLock = getActiveLockScreen();
      const onLockChanged = () => (activeLock = getActiveLockScreen());
      window.addEventListener(LOCKSCREEN_EVENT, onLockChanged);
      // Async love-lock fetch — onMount itself isn't async so we void the promise.
      void (async () => {
        // If a Love Lock is active (persisted from a previous tab or refresh),
        // surface it before the lockout-counter logic.
        const existingLock = await readActiveMood();
        if (existingLock && !isMoodIntroAcknowledged(existingLock)) {
          loveLockState = existingLock;
          // Don't return — still wire up the lockout counter underneath for the
          // case where the user lets the love-lock TTL expire mid-session.
        }
        locked = isLockedOut(selectedProfile);
      })();
      let interval: ReturnType<typeof setInterval> | undefined;
      if (locked.locked) {
        interval = setInterval(() => {
          locked = isLockedOut(selectedProfile);
          if (!locked.locked && interval) clearInterval(interval);
        }, 500);
      }
      // M1 — Poll the server every 30 s while a Love Lock is active so that
      // when the partner taps "I said it again" (or activates one from a
      // different browser), this client picks it up within ~30 s instead of
      // waiting until the next page load. Server is the source of truth —
      // we never invent a lock locally.
      let lovePoll: ReturnType<typeof setInterval> | undefined;
      if (loveLockState) {
        lovePoll = setInterval(async () => {
          const fresh = await readActiveMood();
          if (!fresh) {
            // Server says no lock → drop it locally too.
            loveLockState = null;
            if (lovePoll) {
              clearInterval(lovePoll);
              lovePoll = undefined;
            }
            return;
          }
          // If the partner changed kind (sad → love or vice versa), sync.
          if (!loveLockState || fresh.kind !== loveLockState.kind || fresh.expiresAt !== loveLockState.expiresAt) {
            loveLockState = fresh;
          }
        }, 30_000);
      }
      return () => {
        unsubLocale();
        window.removeEventListener(LOCKSCREEN_EVENT, onLockChanged);
        if (interval) clearInterval(interval);
        if (lovePoll) clearInterval(lovePoll);
      };
    });

  function inferProfileFromPassOrder(rawPassword: string): ProfileId | null {
    const submitted = rawPassword.trim();

    if (submitted === 'princesa') return 'daniel';
    if (submitted === 'fofinho') return 'fatma';
    if (submitted === 'I have the best boyfriend in the world') return 'fatma';

    return null;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (locked.locked || loading) return;
    if (!password.trim()) {
      error = $t('splash.error.empty');
      shake = true;
      setTimeout(() => (shake = false), 500);
      return;
    }

    loading = true;
    error = '';

    // ── Lock-screen passphrase (opt-in, PBKDF2) — checked FIRST ──
    // If the user configured an ACTIVE lock screen WITH a passphrase, that
    // passphrase is an ADDITIONAL way to unlock. It is verified with PBKDF2
    // (verifyLockPassphrase), never a plaintext compare, and opens the profile
    // that CREATED the lock screen. When it doesn't match we fall straight
    // through to the real-password path below — nothing there is weakened.
    // Lockout is already enforced by the guard at the top of this function.
    if (activeLock && lockHasPassphrase) {
      try {
        if (await verifyLockPassphrase(activeLock.id, password)) {
          const profile: ProfileId = activeLock.ownerProfile ?? 'fatma';
          setSession(profile, profile === 'daniel' ? 'daniel' : 'primary');
          resetAttempts(profile);
          password = '';
          if (typeof location !== 'undefined') location.href = '/';
          else await goto('/');
          return;
        }
      } catch {
        /* fall through to the normal password flow */
      }
    }

    const inferredProfile = inferProfileFromPassOrder(password);

    // Love Lock triggers are intentionally NOT pass-order passwords. They must
    // be allowed through before the pass-order guard, otherwise phrases like
    // "Sick" / "sad" / "love" are rejected as an invalid profile password
    // before the mood lock code ever runs.
    if (!inferredProfile) {
      const loveKind = detectMoodTrigger(password);
      if (loveKind) {
        const newLock = await activateMood(loveKind);
        if (newLock) loveLockState = newLock;
        password = '';
        loading = false;
        return;
      }

      // A wrong guess against an ACTIVE lock-screen passphrase burns a failed
      // attempt (shared lockout) so the passphrase can't be brute-forced.
      // Without an active lock passphrase this stays unchanged — arbitrary
      // wrong strings still don't burn attempts.
      if (activeLock && lockHasPassphrase) {
        const r = recordFailedAttempt(activeLock.ownerProfile ?? selectedProfile);
        if (r.locked) locked = { locked: true, remainingMs: r.remainingMs };
      }

      error = $t('splash.wrong_password', { default: 'pass-order invalida' });
      password = '';
      shake = true;
      setTimeout(() => (shake = false), 500);
      loading = false;
      return;
    }
    selectedProfile = inferredProfile;

    // V10.1 — a filled-in username that contradicts the inferred profile is
    // rejected with a distinct copy (no hint about which profile the
    // password belongs to). Empty username keeps the legacy flow.
    const typedUser = username.trim().toLowerCase();
    if (typedUser && typedUser !== 'fatma' && typedUser !== 'daniel') {
      error = $t('splash.wrong_user', { default: 'Utilizador desconhecido — tenta "fatma" ou "daniel".' });
      shake = true;
      setTimeout(() => (shake = false), 500);
      loading = false;
      return;
    }
    if (typedUser && typedUser !== inferredProfile) {
      error = $t('splash.user_mismatch', { default: 'Esse utilizador e essa palavra-passe não combinam.' });
      password = '';
      shake = true;
      setTimeout(() => (shake = false), 500);
      loading = false;
      return;
    }

        try {
          // ── PBKDF2 check FIRST ──
          // Critical ordering: if Fatma's real password happens to contain the
          // words "love" or "sad" (e.g. "LoveFofinho2026!"), we must NOT intercept
          // it as a love-lock trigger. Only if PBKDF2 rejects do we check the
          // emotional phrase — at which point we know the user typed it on purpose
          // and the real password isn't it.
          const authResult = await verifyAgainstHashes(password);
                    if (authResult && authResult.profile === selectedProfile) {
                      setSession(authResult.profile, authResult.method);
                      resetAttempts(authResult.profile);
                      if (typeof location !== 'undefined') location.href = '/';
                      else await goto('/');
                      return;
                    }

          // ── Love Lock check SECOND ──
          // Only fires when the password was wrong AND looks like an emotional
          // declaration. "love" alone, "sad" alone, "i love you", "amo-te" — all
          // trigger here. We DO NOT burn a failed-attempt counter (this is
          // emotional, not adversarial).
          const loveKind = detectMoodTrigger(password);
                    if (loveKind) {
                      const newLock = await activateMood(loveKind);
                      if (newLock) loveLockState = newLock;
                      password = '';
                      loading = false;
                      return;
                    }

          // Known pass-order but failed auth — record attempt, show a generic
          // pass-order error without exposing which profile was expected.
          const attemptResult = recordFailedAttempt(selectedProfile);
          error = $t('splash.wrong_password', { default: 'pass-order invalida' });
          password = '';
          shake = true;
          setTimeout(() => (shake = false), 500);
          if (attemptResult.locked) {
            locked = { locked: true, remainingMs: attemptResult.remainingMs };
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          error = $t('splash.error.generic', { values: { msg } });
        } finally {
          loading = false;
        }
      }

  async function handleLoveUnlock() {
      if (loveLockState) acknowledgeMoodIntro(loveLockState);
      loveLockState = null;
      // SECURITY: acknowledging a mood must NOT grant a session. The old code
      // called setSession('fatma','secret') here, so typing 'love'/'sad'/'sick'
      // at the splash logged anyone straight in — exactly the hole this feature
      // closes. The mood is still acknowledged and persists (it themes the app),
      // but entry now requires the REAL password or a user-configured
      // lock-screen passphrase. If a session already exists (mood set from
      // inside the app), continue to Home; otherwise fall back to the splash
      // gate so the user logs in properly.
      if (getSession()) {
        void goto('/');
      }
      // else: loveLockState = null reveals the password / lock gate below.
    }

  // Login via a partner @handle + a lock-screen passphrase. Matches an ACTIVE
  // lock screen whose targetHandle + passphrase were configured on THIS device
  // (local-only for now — cross-device delivery needs the Supabase couple sync,
  // see lockscreen.ts). Kept behind the same lockout guard as the main gate.
  async function handleTagUnlock(e: Event) {
      e.preventDefault();
      if (tagLoading || locked.locked) return;
      if (!tagHandle.trim() || !tagPass.trim()) {
        tagError = $t('splash.lockscreen.tag.empty', { default: 'Escreve o @handle e a palavra-passe.' });
        return;
      }
      tagLoading = true;
      tagError = '';
      try {
        const match = await verifyHandleUnlock(tagHandle, tagPass);
        if (match) {
          const profile: ProfileId = match.ownerProfile ?? 'fatma';
          setSession(profile, profile === 'daniel' ? 'daniel' : 'primary');
          resetAttempts(profile);
          if (typeof location !== 'undefined') location.href = '/';
          else await goto('/');
          return;
        }
        // Wrong @handle/passphrase burns an attempt (shared lockout).
        const r = recordFailedAttempt(activeLock?.ownerProfile ?? 'fatma');
        if (r.locked) locked = { locked: true, remainingMs: r.remainingMs };
        tagError = $t('splash.lockscreen.tag.wrong', { default: 'Não corresponde a nenhum ecrã de bloqueio ativo.' });
        tagPass = '';
      } catch {
        tagError = $t('splash.lockscreen.tag.wrong', { default: 'Não corresponde a nenhum ecrã de bloqueio ativo.' });
      } finally {
        tagLoading = false;
      }
    }

  function formatRemaining(ms: number): string {
    return Math.ceil(ms / 1000).toString();
  }
</script>

<svelte:head>
  <title>{$t('splash.title')} — Presuntinho</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
</svelte:head>

<main id="main-content" class="splash" tabindex="-1">
  {#if loveLockState}
    <LoveLock
      lockState={loveLockState}
      locale={currentLocale}
      onUnlock={handleLoveUnlock}
    />
  {:else}
  <div class="card" class:shake>
    {#if activeLock}
      <!-- An ACTIVE lock screen personalizes the gate: its emoji/title/message
           replace the generic Presuntinho welcome. The real password form stays
           exactly as-is underneath — this only swaps the copy. -->
      <div class="mascot" aria-hidden="true">{activeLock.emoji}</div>
      <h1>{activeLock.title}</h1>
      <p class="sub">{activeLock.message}</p>
    {:else}
      <!-- Marca: no splash (pré-login) é sempre o Presuntinho a dar as boas-vindas. -->
      <div class="mascot"><MascotAvatar mascot="porquinho" pose="wave" size={104} entrance eager /></div>
      <h1>{$t('splash.title')}</h1>
      <p class="sub">{$t('splash.subtitle')}</p>
    {/if}

        {#if locked.locked}
          <p class="lockout">{$t('splash.lockout', { values: { n: formatRemaining(locked.remainingMs) } })}</p>
        {:else}
          <form onsubmit={handleSubmit}>
            <input
              type="text"
              bind:value={username}
              placeholder={$t('splash.username.placeholder', { default: 'Nome de utilizador' })}
              aria-label={$t('splash.username.label', { default: 'Nome de utilizador' })}
              disabled={loading}
              autocomplete="username"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
            />
            <input
              type="password"
              bind:value={password}
              placeholder={$t('splash.password.placeholder', { default: 'Palavra-passe' })}
              aria-label={$t('splash.password.label')}
              disabled={loading}
              autocomplete="current-password"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
            />
        <button type="submit" disabled={loading}>
          {loading ? $t('splash.checking') : $t('splash.submit')}
        </button>
        {#if error}
          <p class="error">{error}</p>
        {/if}
      </form>

      <div class="providers">
        <span class="providers-divider" aria-hidden="true">{$t('splash.providers.or', { default: 'ou' })}</span>
        <button type="button" class="google-btn" onclick={onGoogle} disabled={googleBusy}>
          <span class="google-g" aria-hidden="true">G</span>
          {googleBusy ? $t('splash.google.connecting', { default: 'A ligar…' }) : $t('splash.google.cta', { default: 'Continuar com Google' })}
        </button>
        <button type="button" class="saikan-btn" disabled aria-describedby="saikan-hint">
          <span class="saikan-s" aria-hidden="true">S</span>
          {$t('splash.saikan.cta', { default: 'Continuar com Saikan ID' })}
        </button>
        <p id="saikan-hint" class="google-hint">
          {$t('splash.saikan.hint', { default: 'Entrar com Saikan ID está a caminho.' })}
        </p>
      </div>

      <a class="create-account" href="/onboarding/" data-sveltekit-preload-data>
        {$t('splash.create_account', { default: 'Novo por aqui? Criar conta →' })}
      </a>
    {/if}

    {#if extraMembers.length > 0}
      <div class="members">
        <span class="members-label">{$t('splash.members.on_device', { default: 'Contas neste dispositivo' })}</span>
        <div class="member-list">
          {#each extraMembers as m (m.id)}
            {#if pickedMember?.id === m.id}
              <form class="member-login" onsubmit={(e) => loginMember(e, m)}>
                <div class="member-head"><span class="member-emoji" aria-hidden="true">{m.emoji}</span> <strong>{m.displayName}</strong></div>
                <input
                  type="password"
                  bind:value={memberPassword}
                  placeholder={$t('splash.password.placeholder', { default: 'Palavra-passe' })}
                  aria-label={$t('splash.password.label')}
                  autocomplete="current-password"
                  disabled={memberLoading}
                />
                <button type="submit" disabled={memberLoading}>
                  {memberLoading ? $t('splash.checking') : $t('splash.members.enter', { default: 'Entrar' })}
                </button>
                {#if memberError}<p class="error">{memberError}</p>{/if}
              </form>
            {:else}
              <button type="button" class="member-tile" onclick={() => pickMember(m)}>
                <span class="member-emoji" aria-hidden="true">{m.emoji}</span>
                <span class="member-name">{m.displayName}</span>
              </button>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    <p class="credit">{$t('splash.credit')}</p>
  </div>
  {/if}
</main>

<style>
  .splash {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: linear-gradient(135deg, #1f2e4a 0%, #2d4373 100%);
  }
  .card {
    background: rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 1.5rem;
    padding: 2rem 1.5rem;
    max-width: 360px;
    width: 100%;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }
  .card.shake {
    animation: shake 0.5s;
  }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
    20%, 40%, 60%, 80% { transform: translateX(8px); }
  }
  .mascot {
    font-size: 4rem;
    line-height: 1;
    margin-bottom: 0.5rem;
  }
  h1 {
    font-size: 1.75rem;
    margin: 0 0 0.25rem 0;
    color: #fff;
  }
  .sub {
    color: #cbd5e1;
    margin: 0 0 1.5rem 0;
    font-size: 0.95rem;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  input {
    padding: 0.75rem 1rem;
    font-size: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    outline: none;
  }
  input:focus {
    border-color: #be185d;
  }
  button {
    padding: 0.75rem 1rem;
    font-size: 1rem;
    font-weight: 600;
    border: 0;
    border-radius: 0.5rem;
    background: #be185d;
    color: #fff;
    cursor: pointer;
    transition: transform 0.1s, background 0.2s;
  }
  button:hover:not(:disabled) {
    background: #9d174d;
    transform: translateY(-1px);
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .error {
    color: #fca5a5;
    font-size: 0.875rem;
    margin: 0;
  }
  .lockout {
    color: #fcd34d;
    font-size: 0.95rem;
  }
  /* V10.1 — provedores externos (Google preparado, ainda sem backend). */
  .providers {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    margin-top: 1rem;
  }
  .providers-divider {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: #94a3b8;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .providers-divider::before,
  .providers-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.14);
  }
  .google-btn,
  .saikan-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    width: 100%;
    min-height: 44px;
    padding: 0.6rem 1rem;
    border: 1px solid rgba(0, 0, 0, 0.16);
    border-radius: 0.5rem;
    background: #ffffff;
    color: #1f2937;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
  }
  .google-btn:hover { background: #f3f4f6; }
  .google-btn:disabled { cursor: progress; opacity: 0.7; }
  .saikan-btn { cursor: not-allowed; opacity: 0.6; }
  .google-g,
  .saikan-s {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #4285f4;
    color: #fff;
    font-weight: 900;
    font-size: 0.85rem;
  }
  .saikan-s {
    background: linear-gradient(135deg, #f472b6, #a78bfa);
    color: #fff;
  }
  .google-hint {
    margin: 0;
    color: #94a3b8;
    font-size: 0.72rem;
    line-height: 1.4;
  }
  .create-account {
    display: inline-block;
    margin-top: 1.1rem;
    color: #bfdbfe;
    font-weight: 700;
    font-size: 0.9rem;
    text-decoration: none;
  }
  .create-account:hover,
  .create-account:focus-visible {
    text-decoration: underline;
  }
  .members {
    margin-top: 1.4rem;
    text-align: left;
  }
  .members-label {
    display: block;
    color: #94a3b8;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.5rem;
  }
  .member-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .member-tile {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.7rem 0.9rem;
    border-radius: 0.8rem;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    font-weight: 700;
    cursor: pointer;
    text-align: left;
  }
  .member-emoji {
    font-size: 1.3rem;
  }
  .member-login {
    display: grid;
    gap: 0.5rem;
    padding: 0.8rem;
    border-radius: 0.9rem;
    border: 1px solid var(--accent, #ec4899);
    background: rgba(255, 255, 255, 0.04);
  }
  .member-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .credit {
    color: #94a3b8;
    font-size: 0.8rem;
    margin-top: 1.5rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .card.shake { animation: none; }
  }
</style>