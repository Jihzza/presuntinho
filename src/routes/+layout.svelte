<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { getSession, clearSession } from '$lib/auth/session';
  import { onMount } from 'svelte';

  let { children } = $props();
  let session = $state(getSession());

  onMount(() => {
    // Redirect to splash if not authenticated (and not already on /splash/)
    // Note: trailingSlash='always' in +layout.ts forces /splash → /splash/ at runtime.
    if (!session && page.url.pathname !== '/splash/') {
      goto('/splash/');
    }
  });

  function logout() {
    clearSession();
    session = null;
    goto('/splash/');
  }
</script>

{#if page.url.pathname === '/splash/'}
  {@render children?.()}
{:else}
  <div class="app">
    <header class="nav">
      <div class="nav-inner">
        <a href="/" class="logo" aria-label="Presuntinho home">
          <span class="logo-pig" aria-hidden="true">🐷</span>
          <span>Presuntinho</span>
        </a>
        <div class="nav-actions">
          <a href="/definicoes" class="icon-btn" aria-label="Definições" title="Definições">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </a>
          <button type="button" class="icon-btn" onclick={logout} aria-label="Sair" title="Sair">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </header>

    <main class="content">
      {@render children?.()}
    </main>
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
    text-decoration: none;
    font-weight: 600;
    font-size: 1.125rem;
  }
  .logo-pig {
    font-size: 1.5rem;
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
    width: 40px;
    height: 40px;
    border-radius: 0.5rem;
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
</style>