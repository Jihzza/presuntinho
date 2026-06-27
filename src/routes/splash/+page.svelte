<script lang="ts">
  import { verifyAgainstHashes } from '$lib/auth/hash';
  import { setSession, isLockedOut, recordFailedAttempt, resetAttempts, getSession } from '$lib/auth/session';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { t, waitLocale } from 'svelte-i18n';
  import { locale as localeStore } from '$lib/i18n';
  import LoveLock from '$lib/components/LoveLock.svelte';
  import {
    detectLoveLock,
    activateLoveLock,
    readLoveLock,
    clearLoveLock,
    type LoveLockState,
  } from '$lib/auth/loveLock';
  // svelte-i18n 4 ships `$t` as the message-formatter store.  In a
  // <script lang="ts"> block we call it as `$t(...)` via Svelte's
  // store auto-subscription — `t(...)` would try to call the store
  // itself which isn't callable.  Match the pattern in
  // src/routes/definicoes/+page.svelte.

  let password = $state('');
  let error = $state('');
  let shake = $state(false);
  let locked = $state({ locked: false, remainingMs: 0 });
  let loading = $state(false);
  // Love Lock state — when non-null the splash card is replaced by the
  // LoveLock full-screen modal until the user clicks the confirmation.
  let loveLockState = $state<LoveLockState | null>(null);
  // Locale reactive — used by LoveLock to pick the right copy. Defaults to
  // 'en' until svelte-i18n has hydrated (LoveLock falls back to en anyway).
  let currentLocale = $state<string>('en');

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
      // Async love-lock fetch — onMount itself isn't async so we void the promise.
      void (async () => {
        // If a Love Lock is active (persisted from a previous tab or refresh),
        // surface it before the lockout-counter logic.
        const existingLock = await readLoveLock();
        if (existingLock) {
          loveLockState = existingLock;
          // Don't return — still wire up the lockout counter underneath for the
          // case where the user lets the love-lock TTL expire mid-session.
        }
        locked = isLockedOut();
      })();
      let interval: ReturnType<typeof setInterval> | undefined;
      if (locked.locked) {
        interval = setInterval(() => {
          locked = isLockedOut();
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
          const fresh = await readLoveLock();
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
        if (interval) clearInterval(interval);
        if (lovePoll) clearInterval(lovePoll);
      };
    });

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
        try {
          // ── PBKDF2 check FIRST ──
          // Critical ordering: if Fatma's real password happens to contain the
          // words "love" or "sad" (e.g. "LoveFofinho2026!"), we must NOT intercept
          // it as a love-lock trigger. Only if PBKDF2 rejects do we check the
          // emotional phrase — at which point we know the user typed it on purpose
          // and the real password isn't it.
          const method = await verifyAgainstHashes(password);
          if (method) {
            setSession(method);
            resetAttempts();
            await goto('/');
            return;
          }

          // ── Love Lock check SECOND ──
          // Only fires when the password was wrong AND looks like an emotional
          // declaration. "love" alone, "sad" alone, "i love you", "amo-te" — all
          // trigger here. We DO NOT burn a failed-attempt counter (this is
          // emotional, not adversarial).
          const loveKind = detectLoveLock(password);
                    if (loveKind) {
                      const newLock = await activateLoveLock(loveKind);
                      if (newLock) loveLockState = newLock;
                      password = '';
                      loading = false;
                      return;
                    }

          // Real auth failure — record attempt, show error, shake.
          const result = recordFailedAttempt();
          error = $t('splash.error.wrong', { values: { n: result.attempts } });
          password = '';
          shake = true;
          setTimeout(() => (shake = false), 500);
          if (result.locked) {
            locked = { locked: true, remainingMs: result.remainingMs };
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          error = $t('splash.error.generic', { values: { msg } });
        } finally {
          loading = false;
        }
      }

  async function handleLoveUnlock() {
      await clearLoveLock();
      loveLockState = null;
      // The user did the emotional work — drop them at the hub without forcing
      // them to type their real password a second time. (They still have to
      // authenticate normally on the next cold-load because the session is
      // separate from the love-lock state.)
      void goto('/');
    }

  function formatRemaining(ms: number): string {
    return Math.ceil(ms / 1000).toString();
  }
</script>

<svelte:head>
  <title>{$t('splash.title')} — Presuntinho</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
</svelte:head>

<main class="splash">
  {#if loveLockState}
    <LoveLock
      lockState={loveLockState}
      locale={currentLocale}
      onUnlock={handleLoveUnlock}
    />
  {:else}
  <div class="card" class:shake>
    <div class="mascot">🐷</div>
    <h1>{$t('splash.title')}</h1>
    <p class="sub">{$t('splash.subtitle')}</p>

    {#if locked.locked}
      <p class="lockout">{$t('splash.lockout', { values: { n: formatRemaining(locked.remainingMs) } })}</p>
    {:else}
      <form onsubmit={handleSubmit}>
        <input
          type="password"
          bind:value={password}
          placeholder={$t('splash.placeholder')}
          aria-label={$t('splash.password.label')}
          disabled={loading}
          autocomplete="off"
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
    border-color: #ec4899;
  }
  button {
    padding: 0.75rem 1rem;
    font-size: 1rem;
    font-weight: 600;
    border: 0;
    border-radius: 0.5rem;
    background: #ec4899;
    color: #fff;
    cursor: pointer;
    transition: transform 0.1s, background 0.2s;
  }
  button:hover:not(:disabled) {
    background: #db2777;
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
  .credit {
    color: #94a3b8;
    font-size: 0.8rem;
    margin-top: 1.5rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .card.shake { animation: none; }
  }
</style>