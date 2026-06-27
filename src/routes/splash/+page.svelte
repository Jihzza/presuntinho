<script lang="ts">
  import { verifyAgainstHashes } from '$lib/auth/hash';
  import { setSession, isLockedOut, recordFailedAttempt, resetAttempts, getSession } from '$lib/auth/session';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { t, waitLocale } from 'svelte-i18n';
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

  onMount(() => {
    // Ensure translations are ready before first paint.
    void waitLocale();
    // If already unlocked, skip splash
    if (getSession()) {
      goto('/');
      return;
    }
    locked = isLockedOut();
    if (locked.locked) {
      const interval = setInterval(() => {
        locked = isLockedOut();
        if (!locked.locked) clearInterval(interval);
      }, 500);
    }
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
      const method = await verifyAgainstHashes(password);
      if (method) {
        setSession(method);
        resetAttempts();
        await goto('/');
      } else {
        const result = recordFailedAttempt();
        error = $t('splash.error.wrong', { values: { n: result.attempts } });
        password = '';
        shake = true;
        setTimeout(() => (shake = false), 500);
        if (result.locked) {
          locked = { locked: true, remainingMs: result.remainingMs };
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      error = $t('splash.error.generic', { values: { msg } });
    } finally {
      loading = false;
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

<main class="splash">
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