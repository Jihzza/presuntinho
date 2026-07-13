// push-sw.js — importado pelo sw.js gerado (workbox.importScripts).
// Handlers de Web Push dos pings de casal: notificação de sistema com padrão
// de vibração PRÓPRIO por tipo (Android; o iOS usa sempre a vibração de
// sistema) e clique que foca/abre a app.

/* eslint-env serviceworker */

// 💛 amor: dois batimentos de coração (da-dum … da-dum)
const LOVE_VIBRATION = [90, 50, 90, 300, 90, 50, 90];
// 👀 saudades: três toques rápidos + um longo (insistente, tipo "anda cá")
const NUDGE_VIBRATION = [60, 70, 60, 70, 60, 260, 200];
// 💬 mensagem: toque duplo curto (discreto)
const MESSAGE_VIBRATION = [70, 60, 70];
const PUSH_EVENT_TYPE = 'presuntinho:push-event';

function canonicalPushEvent(data) {
  const kind = ['love', 'nudge', 'message', 'test'].includes(data.kind) ? data.kind : 'love';
  const rawUrl = typeof data.url === 'string' ? data.url : '/';
  const url = rawUrl.startsWith('/') && !rawUrl.startsWith('//') ? rawUrl : '/';
  return {
    type: PUSH_EVENT_TYPE,
    eventId:
      typeof data.eventId === 'string' && data.eventId
        ? data.eventId
        : `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind,
    title: typeof data.title === 'string' && data.title ? data.title : 'Presuntinho 💞',
    body: typeof data.body === 'string' ? data.body : '',
    url,
    senderId: typeof data.senderId === 'string' ? data.senderId : ''
  };
}

function notificationOptions(pushEvent, foreground) {
  const { kind, body, url } = pushEvent;
  const options = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Mensagens coalescem por conversa (o url identifica a thread); pings
    // coalescem por tipo — a última substitui a anterior, com re-aviso.
    tag: kind === 'message' ? `presuntinho-msg-${url}` : `presuntinho-ping-${kind}`,
    renotify: true,
    data: pushEvent
  };
  if (foreground) {
    // `silent` and `vibrate` must not be combined. The focused app owns the
    // cute in-app feedback and haptics, while this still fulfils userVisibleOnly.
    options.silent = true;
  } else {
    options.vibrate = kind === 'nudge' ? NUDGE_VIBRATION : kind === 'message' ? MESSAGE_VIBRATION : LOVE_VIBRATION;
  }
  return options;
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const pushEvent = canonicalPushEvent(data);
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Send to one client only, otherwise two open tabs could both animate and
      // vibrate the same physical phone. Prefer focused, then any visible tab.
      const foregroundClient =
        clients.find((client) => client.focused === true) ||
        clients.find((client) => client.visibilityState === 'visible');
      if (foregroundClient) foregroundClient.postMessage(pushEvent);
      await self.registration.showNotification(
        pushEvent.title,
        notificationOptions(pushEvent, Boolean(foregroundClient))
      );
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
