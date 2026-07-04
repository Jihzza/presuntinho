<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import { getSession } from '$lib/auth/session';

  let noSession = $state(false);

  onMount(() => {
    const session = getSession();
    if (!session) {
      noSession = true;
      return;
    }
    void goto(`/perfil/${session.profile}/`, { replaceState: true });
  });
</script>

<svelte:head>
  <title>{$t('profile.page.title')} — Presuntinho</title>
</svelte:head>

<section class="profile-entry">
  {#if noSession}
    <div class="entry-card">
      <span class="avatar" aria-hidden="true">🔐</span>
      <h1>{$t('profile.no_session.title')}</h1>
      <p>{$t('profile.no_session.body')}</p>
      <a class="primary" href="/splash/">{$t('profile.no_session.cta')}</a>
    </div>
  {:else}
    <div class="entry-card">
      <span class="avatar" aria-hidden="true">👤</span>
      <h1>{$t('profile.loading.title')}</h1>
      <p>{$t('profile.loading.body')}</p>
    </div>
  {/if}
</section>

<style>
  .profile-entry { min-height: 60dvh; display: grid; place-items: center; padding: 1rem; color: var(--txt); }
  .entry-card { width: min(100%, 28rem); display: grid; justify-items: center; gap: .75rem; text-align: center; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--card); padding: 1.25rem; box-shadow: var(--shadow-md); }
  .avatar { width: 4rem; height: 4rem; border-radius: 1.3rem; display: inline-flex; align-items: center; justify-content: center; background: var(--bg-elev); font-size: 2rem; }
  h1, p { margin: 0; }
  p { color: var(--txt2); line-height: 1.55; }
  .primary { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 0 .95rem; background: var(--accent); color: var(--on-accent); text-decoration: none; font-weight: 800; }
  .primary:focus-visible { outline: none; box-shadow: var(--focus-ring); }
</style>
