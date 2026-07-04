<script lang="ts">
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
  <a class="back" href="/">← {$t('nav.home', { default: 'Home' })}</a>
  <header class="hero">
    <span>🔔 {$t('notifications.hero.eyebrow', { default: 'Centro de atenção' })}</span>
    <h1>{$t('notifications.hero.title', { default: 'Notificações' })}</h1>
    <p>{$t('notifications.hero.subtitle', { default: 'Prazos, hábitos e alertas que a Fatma deve ver antes de se perder nas apps.' })}</p>
    {#if !loading && (unreadTotal > 0 || snoozedCount > 0)}
      <div class="hero-actions">
        {#if unreadTotal > 0}
          <button type="button" class="action-chip" onclick={() => markAllRead(visible.map((n) => n.id))}>
            {$t('notifications.mark_all_read', { default: 'Marcar tudo como lido' })}
          </button>
        {/if}
        {#if snoozedCount > 0}
          <button type="button" class="action-chip ghost" onclick={restoreAll}>
            {$t('notifications.restore_snoozed', { values: { n: snoozedCount }, default: 'Repor adiadas ({n})' })}
          </button>
        {/if}
      </div>
    {/if}
  </header>

  <section class="list" aria-label={$t('notifications.list.aria', { default: 'Lista de notificações' })}>
    {#if loading}
      <p class="empty">{$t('notifications.loading', { default: 'A carregar notificações…' })}</p>
    {:else if visible.length === 0}
      <div class="empty-state">
        <span class="mascot" aria-hidden="true">🐷</span>
        <p class="empty-title">{$t('notifications.empty.title', { default: 'Tudo tranquilo por aqui' })}</p>
        <p class="empty">{$t('notifications.empty.body', { default: 'O Presuntinho fica de olho e avisa-te quando algo precisar de ti.' })}</p>
        {#if snoozedCount > 0}
          <button type="button" class="action-chip ghost" onclick={restoreAll}>
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

  <section class="settings-card" aria-label={$t('notifications.next.aria', { default: 'Próximo passo de notificações' })}>
    <h2>{$t('notifications.next.title', { default: 'Próximo nível' })}</h2>
    <p>{$t('notifications.next.body', { default: 'Esta página já agrega alertas locais. Quando houver permissões de push, pode passar a enviar lembretes reais no telemóvel.' })}</p>
  </section>
</div>

<style>
  .notifications-page { max-width: 760px; margin: 0 auto; padding: 1.25rem 1rem 8rem; color: var(--txt); }
  .back { color: var(--accent); text-decoration: none; font-weight: 800; }
  .back:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 55%, var(--txt)); outline-offset: 2px; border-radius: var(--radius-sm, .4rem); }
  .hero, .settings-card { margin-top: var(--space-4, 1rem); padding: var(--space-4, 1rem); border-radius: var(--radius-xl, 1.25rem); background: var(--card); border: 1px solid var(--border); }
  .hero span { color: var(--warning, #fde68a); text-transform: uppercase; font-size: .72rem; font-weight: 900; letter-spacing: .07em; }
  .hero h1 { margin: .35rem 0; font-size: clamp(2rem, 8vw, 3.2rem); }
  .hero p, .notification small, .settings-card p, .empty { color: var(--txt2); }
  .hero-actions { display: flex; flex-wrap: wrap; gap: var(--space-2, .5rem); margin-top: var(--space-3, .75rem); }
  .action-chip { font: inherit; font-size: .8rem; font-weight: 800; color: var(--on-accent, var(--txt)); min-height: 44px; padding: .5rem .95rem; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); background: var(--accent); cursor: pointer; transition: filter var(--motion-fast, 120ms) ease; }
  .action-chip:hover { filter: brightness(1.06); }
  .action-chip:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 55%, var(--txt)); outline-offset: 2px; }
  .action-chip.ghost { color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
  .list { display: grid; gap: .7rem; margin-top: var(--space-4, 1rem); }
  .section-title { margin: .4rem 0 0; font-size: var(--fs-sm, .9rem); font-weight: 900; text-transform: uppercase; letter-spacing: .06em; color: var(--txt3); }
  .notification { display: grid; grid-template-columns: 1fr auto; align-items: stretch; gap: .35rem; }
  .notification-link { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: .8rem; color: var(--txt); text-decoration: none; padding: .95rem; border-radius: var(--radius-lg, 1rem); background: var(--card); border: 1px solid var(--border); border-inline-start: 4px solid var(--border); transition: background var(--motion-fast, 120ms) ease; }
  .notification-link:hover, .notification-link:focus-visible { background: var(--card-hover, var(--card)); outline: none; }
  .notification-link:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 55%, var(--txt)); outline-offset: 2px; }
  .notification[data-tone='danger'] .notification-link { border-inline-start-color: color-mix(in srgb, var(--error, #ef4444) 65%, var(--border)); }
  .notification[data-tone='warning'] .notification-link { border-inline-start-color: color-mix(in srgb, var(--warning, #f59e0b) 65%, var(--border)); }
  .notification[data-tone='habit'] .notification-link { border-inline-start-color: color-mix(in srgb, var(--success, #10b981) 65%, var(--border)); }
  .notification[data-tone='life'] .notification-link { border-inline-start-color: color-mix(in srgb, var(--accent) 55%, var(--border)); }
  .notification:not(.is-unread) .notification-link { opacity: .78; }
  .row-icon { font-size: 1.3rem; line-height: 1; }
  .copy { min-width: 0; display: flex; flex-direction: column; gap: .18rem; }
  .copy strong { display: flex; align-items: center; gap: .4rem; min-width: 0; }
  .when { color: var(--txt3); font-size: .72rem; font-variant-numeric: tabular-nums; }
  .arrow { color: var(--txt3); }
  .unread-dot { flex-shrink: 0; width: .55rem; height: .55rem; border-radius: 999px; background: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent); }
  .dismiss { min-width: 44px; border-radius: var(--radius-lg, 1rem); border: 1px solid var(--border); background: transparent; color: var(--txt3); font-size: .95rem; cursor: pointer; transition: color var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease; }
  .dismiss:hover { color: var(--txt); border-color: color-mix(in srgb, var(--txt) 30%, transparent); }
  .dismiss:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 55%, var(--txt)); outline-offset: 2px; }
  .empty-state { display: grid; gap: .5rem; padding: var(--space-5, 1.5rem) var(--space-4, 1rem); border-radius: var(--radius-lg, 1rem); background: var(--card); border: 1px dashed var(--border); justify-items: center; text-align: center; }
  .mascot { font-size: 2.4rem; line-height: 1; }
  .empty-title { margin: 0; font-weight: 900; font-size: var(--fs-md, 1rem); color: var(--txt); }
  .settings-card h2 { margin: 0 0 .35rem; font-size: var(--fs-md, 1rem); }
  .settings-card p, .empty { margin: 0; }
</style>
