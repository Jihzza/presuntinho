<script lang="ts">
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import {
    buildNotifications,
    loadAgendaItems,
    loadNotificationExtras,
    localDateKey,
    type NotificationItem
  } from '$lib/vida/agenda';
  import {
    NOTIF_CHANGED_EVENT,
    isUnread,
    loadNotifState,
    markAllRead,
    markRead,
    restoreAll,
    snooze,
    type NotifState
  } from '$lib/vida/notificationState';

  let notifications = $state<NotificationItem[]>([]);
  let notifState = $state<NotifState>({ snoozed: new Set(), read: new Set() });
  let loading = $state(true);

  const todayKey = localDateKey(new Date());
  const todayMs = new Date(`${todayKey}T00:00:00`).getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const visible = $derived(notifications.filter((n) => !notifState.snoozed.has(n.id)));
  const todayList = $derived(visible.filter((n) => n.section === 'today'));
  const weekList = $derived(visible.filter((n) => n.section === 'week'));
  const snoozedCount = $derived(notifications.length - visible.length);
  const unreadTotal = $derived(visible.filter((n) => isUnread(n.id, notifState)).length);

  /** Soft relative label for the row ("hoje", "em 3 dias", "há 2 dias"). */
  function whenLabel(item: NotificationItem): string {
    if (!item.date) return '';
    const delta = Math.round((new Date(`${item.date}T00:00:00`).getTime() - todayMs) / DAY_MS);
    if (delta === 0) return $t('notifications.when.today', { default: 'hoje' });
    if (delta === 1) return $t('notifications.when.tomorrow', { default: 'amanhã' });
    if (delta === -1) return $t('notifications.when.yesterday', { default: 'ontem' });
    if (delta > 1) return $t('notifications.when.in_days', { values: { n: delta }, default: 'em {n} dias' });
    return $t('notifications.when.days_ago', { values: { n: Math.abs(delta) }, default: 'há {n} dias' });
  }

  function refreshState(): void {
    notifState = loadNotifState();
  }

  onMount(() => {
    refreshState();
    const refresh = () => {
      loading = true;
      void Promise.all([loadAgendaItems(), loadNotificationExtras()])
        .then(([items, extras]) => (notifications = buildNotifications(items, extras)))
        .catch((err) => console.error('[notificacoes] load failed', err))
        .finally(() => (loading = false));
    };
    const unsubLocale = locale.subscribe(refresh);
    const onChanged = () => refreshState();
    window.addEventListener(NOTIF_CHANGED_EVENT, onChanged);
    return () => {
      unsubLocale();
      window.removeEventListener(NOTIF_CHANGED_EVENT, onChanged);
    };
  });
</script>

{#snippet notifRows(list: NotificationItem[])}
  {#each list as item (item.id)}
    <div class="notification" data-tone={item.tone} class:is-unread={isUnread(item.id, notifState)}>
      <a class="notification-link" href={item.href} onclick={() => markRead(item.id)}>
        <span class="row-icon" aria-hidden="true">{item.icon}</span>
        <span class="copy">
          <strong>
            {#if isUnread(item.id, notifState)}
              <span class="unread-dot" role="img" aria-label={$t('notifications.unread', { default: 'Por ler' })}></span>
            {/if}
            {item.title}
          </strong>
          <small>{item.body}</small>
          {#if whenLabel(item)}
            <small class="when">{whenLabel(item)}</small>
          {/if}
        </span>
        <span class="arrow" aria-hidden="true">→</span>
      </a>
      <button
        type="button"
        class="dismiss"
        onclick={() => snooze(item.id)}
        aria-label={$t('notifications.snooze_aria', { values: { title: item.title }, default: 'Adiar «{title}» até amanhã' })}
        title={$t('notifications.snooze', { default: 'Adiar até amanhã' })}
      >✕</button>
    </div>
  {/each}
{/snippet}

<svelte:head>
  <title>{$t('notifications.meta.title', { default: 'Notificações · Presuntinho' })}</title>
</svelte:head>

<div class="notifications-page">
  <!-- Compact header — inspired by the Mensagens list: a title, a back link and
       a single quiet "read all" action, instead of a big hero that overwhelms
       a simple notifications screen. -->
  <header class="topbar">
    <a class="back" href="/" aria-label={$t('nav.home', { default: 'Home' })}>←</a>
    <h1>{$t('notifications.hero.title', { default: 'Notificações' })}</h1>
    {#if !loading && unreadTotal > 0}
      <button type="button" class="link-action" onclick={() => markAllRead(visible.map((n) => n.id))}>
        {$t('notifications.mark_all_read_short', { default: 'Ler tudo' })}
      </button>
    {/if}
  </header>
  {#if !loading && snoozedCount > 0}
    <button type="button" class="restore-line" onclick={restoreAll}>
      {$t('notifications.restore_snoozed', { values: { n: snoozedCount }, default: 'Repor adiadas ({n})' })}
    </button>
  {/if}

  <section class="list" aria-label={$t('notifications.list.aria', { default: 'Lista de notificações' })}>
    {#if loading}
      <Skeleton variant="list" lines={4} label={$t('notifications.loading', { default: 'A carregar notificações…' })} />
    {:else if visible.length === 0}
      <div class="empty-state">
        <span class="mascot" aria-hidden="true">🐷</span>
        <p class="empty-title">{$t('notifications.empty.title', { default: 'Tudo tranquilo por aqui' })}</p>
        <p class="empty">{$t('notifications.empty.body', { default: 'O Presuntinho fica de olho e avisa-te quando algo precisar de ti.' })}</p>
        {#if snoozedCount > 0}
          <button type="button" class="restore-line" onclick={restoreAll} style="text-align:center">
            {$t('notifications.restore_snoozed', { values: { n: snoozedCount }, default: 'Repor adiadas ({n})' })}
          </button>
        {/if}
      </div>
    {:else}
      {#if todayList.length > 0}
        <h2 class="section-title">{$t('notifications.section.today', { default: 'Hoje' })}</h2>
        {@render notifRows(todayList)}
      {/if}
      {#if weekList.length > 0}
        <h2 class="section-title">{$t('notifications.section.week', { default: 'Esta semana' })}</h2>
        {@render notifRows(weekList)}
      {/if}
    {/if}
  </section>
</div>

<style>
  .notifications-page { width: 100%; max-width: 640px; margin: 0 auto; padding: 1rem 1rem calc(6rem + env(safe-area-inset-bottom)); color: var(--txt); }
  /* Compact header row (Mensagens-style): back · title · quiet action. */
  .topbar { display: flex; align-items: center; gap: .75rem; padding: .25rem 0 .5rem; }
  .back { color: var(--txt); text-decoration: none; font-size: 1.4rem; line-height: 1; width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; }
  .back:hover { background: var(--card-hover, var(--card)); }
  .back:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 55%, var(--txt)); outline-offset: 2px; }
  .topbar h1 { margin: 0; font-size: 1.4rem; font-weight: 800; flex: 1; }
  .link-action { font: inherit; font-size: .85rem; font-weight: 700; color: var(--accent); background: transparent; border: 0; cursor: pointer; padding: .5rem .35rem; border-radius: var(--radius-sm, .4rem); }
  .link-action:hover { text-decoration: underline; }
  .link-action:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 55%, var(--txt)); outline-offset: 2px; }
  .restore-line { display: block; width: 100%; text-align: left; font: inherit; font-size: .82rem; color: var(--txt3); background: transparent; border: 0; cursor: pointer; padding: .35rem 0 .5rem; }
  .restore-line:hover { color: var(--txt2); text-decoration: underline; }
  .notification small, .empty { color: var(--txt2); }
  /* Flat list of rows, no big gaps or cards-in-cards. */
  .list { display: flex; flex-direction: column; margin-top: .25rem; }
  .section-title { margin: .9rem 0 .35rem; font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: var(--txt3); }
  .notification { display: grid; grid-template-columns: 1fr auto; align-items: center; }
  .notification-link { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: .8rem; color: var(--txt); text-decoration: none; padding: .8rem .25rem; border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent); transition: background var(--motion-fast, 120ms) ease; border-radius: .4rem; }
  .notification-link:hover, .notification-link:focus-visible { background: var(--card-hover, var(--card)); outline: none; }
  .notification-link:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 55%, var(--txt)); outline-offset: 2px; }
  .notification:not(.is-unread) .notification-link { opacity: .72; }
  .row-icon { font-size: 1.5rem; line-height: 1; width: 2.2rem; text-align: center; }
  .copy { min-width: 0; display: flex; flex-direction: column; gap: .12rem; }
  .copy strong { display: flex; align-items: center; gap: .4rem; min-width: 0; font-weight: 700; }
  .copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .when { color: var(--txt3); font-size: .72rem; font-variant-numeric: tabular-nums; }
  .arrow { color: var(--txt3); }
  .unread-dot { flex-shrink: 0; width: .5rem; height: .5rem; border-radius: 999px; background: var(--accent); }
  .dismiss { min-width: 40px; height: 40px; border-radius: 999px; border: 0; background: transparent; color: var(--txt3); font-size: .95rem; cursor: pointer; transition: color var(--motion-fast, 120ms) ease, background var(--motion-fast, 120ms) ease; }
  .dismiss:hover { color: var(--txt); background: var(--card-hover, var(--card)); }
  .dismiss:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 55%, var(--txt)); outline-offset: 2px; }
  .empty-state { display: grid; gap: .5rem; padding: var(--space-5, 1.5rem) var(--space-4, 1rem); justify-items: center; text-align: center; margin-top: 2rem; }
  .mascot { font-size: 2.4rem; line-height: 1; }
  .empty-title { margin: 0; font-weight: 800; font-size: var(--fs-md, 1rem); color: var(--txt); }
  .empty { margin: 0; }
</style>
