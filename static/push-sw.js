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
// 📞 chamada: toque longo e repetido; a camada global assume quando a app abre.
const CALL_VIBRATION = [220, 100, 220, 600, 220, 100, 220];
const PUSH_EVENT_TYPE = 'presuntinho:push-event';

function canonicalAppUrl(value) {
  if (typeof value !== 'string' || value.length > 120) return '/';
  try {
    // WHATWG URL treats backslashes as separators for http(s), so values such
    // as `/\\evil.com` become cross-origin and are rejected here.
    const parsed = new URL(value, self.location.origin);
    if (
      parsed.origin !== self.location.origin ||
      parsed.username ||
      parsed.password
    ) return '/';
    const relative = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return relative.length <= 120 ? relative : '/';
  } catch {
    return '/';
  }
}

function canonicalPushEvent(data) {
  const source = data && typeof data === 'object' ? data : {};
  const kind = ['love', 'nudge', 'message', 'call', 'test'].includes(source.kind) ? source.kind : 'love';
  const url = canonicalAppUrl(source.url);
  return {
    type: PUSH_EVENT_TYPE,
    eventId:
      typeof source.eventId === 'string' && source.eventId
        ? source.eventId
        : `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind,
    title: typeof source.title === 'string' && source.title ? source.title : 'Presuntinho 💞',
    body: typeof source.body === 'string' ? source.body : '',
    url,
    senderId: typeof source.senderId === 'string' ? source.senderId : '',
    callId: typeof source.callId === 'string' ? source.callId : undefined,
    expiresAt:
      typeof source.expiresAt === 'string' && Number.isFinite(Date.parse(source.expiresAt))
        ? source.expiresAt
        : undefined
  };
}

function callNotificationTag(pushEvent) {
  return `presuntinho-call-${pushEvent.callId || 'incoming'}`;
}

function callExpired(pushEvent, now = Date.now()) {
  if (pushEvent.kind !== 'call') return false;
  const expiresAt = pushEvent.expiresAt ? Date.parse(pushEvent.expiresAt) : NaN;
  // Fail closed for old/malformed call pushes: unlike a normal message, a call
  // notification is actively misleading once its short ringing window is gone.
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

async function closeCallNotifications(pushEvent) {
  if (typeof self.registration.getNotifications !== 'function') return;
  try {
    const notifications = await self.registration.getNotifications({ tag: callNotificationTag(pushEvent) });
    for (const notification of notifications) notification.close();
  } catch {
    // Older browsers may expose Notifications without getNotifications.
  }
}

async function closeExpiredCallNotifications() {
  if (typeof self.registration.getNotifications !== 'function') return;
  try {
    const notifications = await self.registration.getNotifications();
    for (const notification of notifications) {
      const pushEvent = canonicalPushEvent(notification.data || {});
      if (callExpired(pushEvent)) notification.close();
    }
  } catch {
    // Best-effort cleanup; never let it prevent delivery of a fresh push.
  }
}

function notificationOptions(pushEvent, foreground) {
  const { kind, body, url } = pushEvent;
  const options = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Mensagens coalescem por conversa (o url identifica a thread); pings
    // coalescem por tipo — a última substitui a anterior, com re-aviso.
    tag:
      kind === 'call'
        ? callNotificationTag(pushEvent)
        : kind === 'message'
          ? `presuntinho-msg-${url}`
          : `presuntinho-ping-${kind}`,
    renotify: true,
    requireInteraction: kind === 'call',
    data: pushEvent
  };
  if (foreground) {
    // `silent` and `vibrate` must not be combined. The focused app owns the
    // cute in-app feedback and haptics, while this still fulfils userVisibleOnly.
    options.silent = true;
  } else {
    options.vibrate = kind === 'call'
      ? CALL_VIBRATION
      : kind === 'nudge'
        ? NUDGE_VIBRATION
        : kind === 'message'
          ? MESSAGE_VIBRATION
          : LOVE_VIBRATION;
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
      await closeExpiredCallNotifications();
      if (callExpired(pushEvent)) {
        await closeCallNotifications(pushEvent);
        return;
      }
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

self.addEventListener('activate', (event) => {
  event.waitUntil(closeExpiredCallNotifications());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const pushEvent = canonicalPushEvent(event.notification.data || {});
  if (callExpired(pushEvent)) {
    event.waitUntil(closeCallNotifications(pushEvent));
    return;
  }
  const url = pushEvent.url || '/';
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
