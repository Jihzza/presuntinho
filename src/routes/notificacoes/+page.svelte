<script lang="ts">
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import {
    buildNotifications,
    loadAgendaItems,
    localDateKey,
    type NotificationItem
  } from '$lib/vida/agenda';

  const DISMISS_STORAGE_KEY = 'presuntinho:notif-dismissed';

  let notifications = $state<NotificationItem[]>([]);
  let dismissed = $state<Set<string>>(new Set());
  let loading = $state(true);

  const todayKey = localDateKey(new Date());

  let visible = $derived(notifications.filter((n) => !dismissed.has(dismissKey(n.id))));
  let dismissedCount = $derived(notifications.length - visible.length);

  /** Dismissals are per notification AND per day — tomorrow it comes back. */
  function dismissKey(id: string): string {
    return `${id}|${todayKey}`;
  }

  function loadDismissed(): void {
    try {
      const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      // Prune stale entries (older days) so the store stays tiny.
      const fresh = parsed.filter((k): k is string => typeof k === 'string' && k.endsWith(`|${todayKey}`));
      dismissed = new Set(fresh);
      if (fresh.length !== parsed.length) persistDismissed();
    } catch {
      // Corrupt/blocked storage — start clean.
    }
  }

  function persistDismissed(): void {
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(Array.from(dismissed)));
    } catch {
      // Private mode / quota — dismissals still hold for this session.
    }
  }

  function dismiss(item: NotificationItem): void {
    dismissed = new Set([...dismissed, dismissKey(item.id)]);
    persistDismissed();
  }

  function restoreAll(): void {
    dismissed = new Set();
    persistDismissed();
  }

  onMount(() => {
    loadDismissed();
    const refresh = () => {
      loading = true;
      void loadAgendaItems()
        .then((items) => (notifications = buildNotifications(items)))
        .catch((err) => console.error('[notificacoes] load failed', err))
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
    {:else if visible.length === 0}
      <div class="all-dismissed">
        <p class="empty">{$t('notifications.all_dismissed', { default: 'Tudo dispensado por hoje. Descansa a cabeça. 💤' })}</p>
        {#if dismissedCount > 0}
          <button type="button" class="restore" onclick={restoreAll}>
            {$t('notifications.restore', { values: { n: dismissedCount }, default: 'Repor dispensadas ({n})' })}
          </button>
        {/if}
      </div>
    {:else}
      {#each visible as item (item.id)}
        <div class="notification" data-tone={item.tone}>
          <a class="notification-link" href={item.href}>
            <span class="dot" aria-hidden="true"></span>
            <span class="copy">
              <strong>{item.title}</strong>
              <small>{item.body}</small>
            </span>
            <span aria-hidden="true">→</span>
          </a>
          <button
            type="button"
            class="dismiss"
            onclick={() => dismiss(item)}
            aria-label={$t('notifications.dismiss_aria', { values: { title: item.title }, default: 'Dispensar {title}' })}
            title={$t('notifications.dismiss', { default: 'Dispensar' })}
          >✕</button>
        </div>
      {/each}
      {#if dismissedCount > 0}
        <button type="button" class="restore" onclick={restoreAll}>
          {$t('notifications.restore', { values: { n: dismissedCount }, default: 'Repor dispensadas ({n})' })}
        </button>
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
  .list { display: grid; gap: .7rem; margin-top: var(--space-4, 1rem); }
  .notification { display: grid; grid-template-columns: 1fr auto; align-items: stretch; gap: .35rem; }
  .notification-link { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: .8rem; color: var(--txt); text-decoration: none; padding: .95rem; border-radius: var(--radius-lg, 1rem); background: var(--card); border: 1px solid var(--border); transition: background var(--motion-fast, 120ms) ease; }
  .notification-link:hover, .notification-link:focus-visible { background: var(--card-hover, var(--card)); outline: none; }
  .notification-link:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 55%, var(--txt)); outline-offset: 2px; }
  .copy { min-width: 0; display: flex; flex-direction: column; gap: .18rem; }
  .dot { width: .75rem; height: .75rem; border-radius: 999px; background: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 16%, transparent); }
  .notification[data-tone='danger'] .dot { background: var(--error, #ef4444); box-shadow: 0 0 0 4px color-mix(in srgb, var(--error, #ef4444) 16%, transparent); }
  .notification[data-tone='warning'] .dot { background: var(--warning, #f59e0b); box-shadow: 0 0 0 4px color-mix(in srgb, var(--warning, #f59e0b) 16%, transparent); }
  .notification[data-tone='habit'] .dot { background: var(--success, #10b981); box-shadow: 0 0 0 4px color-mix(in srgb, var(--success, #10b981) 16%, transparent); }
  .notification[data-tone='done'] .dot { background: var(--success, #22c55e); box-shadow: 0 0 0 4px color-mix(in srgb, var(--success, #22c55e) 16%, transparent); }
  .notification[data-tone='life'] .dot { background: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 20%, transparent); }
  .dismiss { min-width: 44px; border-radius: var(--radius-lg, 1rem); border: 1px solid var(--border); background: transparent; color: var(--txt3); font-size: .95rem; cursor: pointer; transition: color var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease; }
  .dismiss:hover { color: var(--txt); border-color: color-mix(in srgb, var(--txt) 30%, transparent); }
  .dismiss:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 55%, var(--txt)); outline-offset: 2px; }
  .all-dismissed { display: grid; gap: .7rem; padding: var(--space-4, 1rem); border-radius: var(--radius-lg, 1rem); background: var(--card); border: 1px dashed var(--border); justify-items: start; }
  .restore { font: inherit; font-size: .8rem; font-weight: 800; color: var(--accent); min-height: 44px; padding: .5rem .85rem; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); background: color-mix(in srgb, var(--accent) 10%, transparent); cursor: pointer; justify-self: start; }
  .restore:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 55%, var(--txt)); outline-offset: 2px; }
  .settings-card h2 { margin: 0 0 .35rem; font-size: var(--fs-md, 1rem); }
  .settings-card p, .empty { margin: 0; }
</style>
