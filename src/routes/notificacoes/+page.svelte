<script lang="ts">
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import {
    buildNotifications,
    loadAgendaItems,
    type NotificationItem
  } from '$lib/vida/agenda';

  let notifications = $state<NotificationItem[]>([]);
  let loading = $state(true);

  onMount(() => {
    const refresh = () => {
      loading = true;
      void loadAgendaItems()
        .then((items) => (notifications = buildNotifications(items)))
        .finally(() => (loading = false));
    };
    const unsubLocale = locale.subscribe(refresh);
    return unsubLocale;
  });
</script>

<svelte:head>
  <title>{$t('notifications.meta.title', { default: 'Notificações · Presuntinho' })}</title>
</svelte:head>

<div class="notifications-page">
  <a class="back" href="/">← {$t('nav.home', { default: 'Home' })}</a>
  <header class="hero">
    <span>🔔 {$t('notifications.hero.eyebrow', { default: 'Centro de atenção' })}</span>
    <h1>{$t('notifications.hero.title', { default: 'Notificações' })}</h1>
    <p>{$t('notifications.hero.subtitle', { default: 'Prazos, hábitos e alertas que a Fatma deve ver antes de se perder nas apps.' })}</p>
  </header>

  <section class="list" aria-label={$t('notifications.list.aria', { default: 'Lista de notificações' })}>
    {#if loading}
      <p class="empty">{$t('notifications.loading', { default: 'A carregar notificações…' })}</p>
    {:else}
      {#each notifications as item (item.id)}
        <a class="notification" data-tone={item.tone} href={item.href}>
          <span class="dot" aria-hidden="true"></span>
          <span class="copy">
            <strong>{item.title}</strong>
            <small>{item.body}</small>
          </span>
          <span aria-hidden="true">→</span>
        </a>
      {/each}
    {/if}
  </section>

  <section class="settings-card" aria-label={$t('notifications.next.aria', { default: 'Próximo passo de notificações' })}>
    <h2>{$t('notifications.next.title', { default: 'Próximo nível' })}</h2>
    <p>{$t('notifications.next.body', { default: 'Esta página já agrega alertas locais. Quando houver permissões de push, pode passar a enviar lembretes reais no telemóvel.' })}</p>
  </section>
</div>

<style>
  .notifications-page { max-width: 760px; margin: 0 auto; padding: 1.25rem 1rem 8rem; color: #fff; }
  .back { color: #bfdbfe; text-decoration: none; font-weight: 800; }
  .hero, .settings-card { margin-top: 1rem; padding: 1rem; border-radius: 1.25rem; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.11); }
  .hero span { color: #fde68a; text-transform: uppercase; font-size: .72rem; font-weight: 900; letter-spacing: .07em; }
  .hero h1 { margin: .35rem 0; font-size: clamp(2rem, 8vw, 3.2rem); }
  .hero p, .notification small, .settings-card p, .empty { color: #cbd5e1; }
  .list { display: grid; gap: .7rem; margin-top: 1rem; }
  .notification { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: .8rem; color: #fff; text-decoration: none; padding: .95rem; border-radius: 1rem; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.09); }
  .notification:hover, .notification:focus-visible { background: rgba(255,255,255,.085); outline: none; }
  .copy { min-width: 0; display: flex; flex-direction: column; gap: .18rem; }
  .dot { width: .75rem; height: .75rem; border-radius: 999px; background: #60a5fa; box-shadow: 0 0 0 4px rgba(96,165,250,.14); }
  .notification[data-tone='danger'] .dot { background: #ef4444; box-shadow: 0 0 0 4px rgba(239,68,68,.16); }
  .notification[data-tone='warning'] .dot { background: #f59e0b; box-shadow: 0 0 0 4px rgba(245,158,11,.16); }
  .notification[data-tone='habit'] .dot { background: #10b981; box-shadow: 0 0 0 4px rgba(16,185,129,.16); }
  .notification[data-tone='done'] .dot { background: #22c55e; box-shadow: 0 0 0 4px rgba(34,197,94,.16); }
  .settings-card h2 { margin: 0 0 .35rem; font-size: 1rem; }
  .settings-card p, .empty { margin: 0; }
</style>
