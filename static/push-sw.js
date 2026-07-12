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

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const kind = data.kind === 'nudge' ? 'nudge' : data.kind === 'message' ? 'message' : 'love';
  const title = data.title || 'Presuntinho 💞';
  const url = data.url || '/';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Mensagens coalescem por conversa (o url identifica a thread); pings
      // coalescem por tipo — a última substitui a anterior, com re-aviso.
      tag: kind === 'message' ? `presuntinho-msg-${url}` : `presuntinho-ping-${kind}`,
      renotify: true,
      vibrate: kind === 'nudge' ? NUDGE_VIBRATION : kind === 'message' ? MESSAGE_VIBRATION : LOVE_VIBRATION,
      data: { url }
    })
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
