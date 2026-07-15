// push-sw.js — importado pelo sw.js gerado (workbox.importScripts).
// Handlers de Web Push. Notification sound/vibration are controlled by the
// browser and operating system; options below are requests, never delivery
// guarantees. Call delivery ACKs only mean received/presented/opened.

/* eslint-env serviceworker */

// 💛 amor: dois batimentos de coração (da-dum … da-dum)
const LOVE_VIBRATION = [90, 50, 90, 300, 90, 50, 90];
// 👀 saudades: três toques rápidos + um longo (insistente, tipo "anda cá")
const NUDGE_VIBRATION = [60, 70, 60, 70, 60, 260, 200];
// 💬 mensagem: toque duplo curto (discreto)
const MESSAGE_VIBRATION = [70, 60, 70];
// 🎮 convite: três pulsos crescentes, distinguíveis de mensagem e chamada.
const GAME_INVITE_VIBRATION = [70, 70, 110, 70, 170];
// 📞 chamada: toque longo e repetido; a camada global assume quando a app abre.
const CALL_VIBRATION = [220, 100, 220, 600, 220, 100, 220];
const PUSH_EVENT_TYPE = 'presuntinho:push-event';
const PUSH_PRESENTED_EVENT_TYPE = 'presuntinho:push-presented';
const LOCAL_CALL_TERMINAL_TYPE = 'presuntinho:call-terminal-local';
const PUSH_ACCOUNT_BINDING_TYPE = 'presuntinho:push-account-binding';
const ACK_ENDPOINT = '/api/call-delivery-ack';
const ACK_MAX_ATTEMPTS = 3;
const ACK_RETRY_BASE_MS = 180;
const ACK_FETCH_TIMEOUT_MS = 2_500;
const CALL_TOMBSTONE_CACHE = 'presuntinho-call-tombstones-v1';
const CALL_TOMBSTONE_TTL_MS = 15 * 60 * 1000;
const PUSH_EVENT_DEDUPE_CACHE = 'presuntinho-push-events-v1';
const PUSH_EVENT_DEDUPE_TTL_MS = 2 * 60 * 60 * 1000;
const PUSH_ACCOUNT_BINDING_CACHE = 'presuntinho-push-account-v1';
const PUSH_ACCOUNT_BINDING_URL = '/__presuntinho_push_account_binding__';
const TERMINAL_NOTICE_MS = 3500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOM_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const TOKEN_RE = /^[A-Za-z0-9._-]{36,160}$/;
const TERMINAL_EVENTS = new Set([
  'answered_here',
  'answered_elsewhere',
  'declined',
  'cancelled',
  'ended',
  'missed',
  'failed'
]);
const memoryCallTombstones = new Map();
const memoryPushEvents = new Map();
const callOperationQueues = new Map();
let activeAccountKnown = false;
let activeAccountId = null;

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
  const kind = ['love', 'nudge', 'message', 'call', 'test', 'game_invite'].includes(source.kind) ? source.kind : 'love';
  let url = canonicalAppUrl(source.url);
  const callId = typeof source.callId === 'string' && UUID_RE.test(source.callId)
    ? source.callId
    : undefined;
  if (kind === 'call' && callId) {
    try {
      const deepLink = new URL(url || '/mensagens/', self.location.origin);
      deepLink.searchParams.set('callId', callId);
      url = canonicalAppUrl(`${deepLink.pathname}${deepLink.search}${deepLink.hash}`);
    } catch {
      url = `/mensagens/?callId=${encodeURIComponent(callId)}`;
    }
  }
  const terminalEvent =
    kind === 'call' &&
    callId &&
    source.callState === 'terminal' &&
    TERMINAL_EVENTS.has(source.terminalEvent)
      ? source.terminalEvent
      : undefined;
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
    recipientId:
      typeof source.recipientId === 'string' && UUID_RE.test(source.recipientId)
        ? source.recipientId
        : undefined,
    callId,
    callState: terminalEvent ? 'terminal' : 'incoming',
    terminalEvent,
    terminalExpiresAt:
      terminalEvent &&
      typeof source.terminalExpiresAt === 'string' &&
      Number.isFinite(Date.parse(source.terminalExpiresAt))
        ? source.terminalExpiresAt
        : undefined,
    deliveryId:
      typeof source.deliveryId === 'string' && UUID_RE.test(source.deliveryId)
        ? source.deliveryId
        : undefined,
    // Kept inside the worker/notification only. Never post this capability to
    // a page; possession permits unauthenticated delivery acknowledgements.
    deliveryToken:
      typeof source.deliveryToken === 'string' && TOKEN_RE.test(source.deliveryToken)
        ? source.deliveryToken
        : undefined,
    expiresAt:
      typeof source.expiresAt === 'string' && Number.isFinite(Date.parse(source.expiresAt))
        ? source.expiresAt
        : undefined
  };
}

function accountBindingUrl() {
  return `${self.location.origin}${PUSH_ACCOUNT_BINDING_URL}`;
}

async function persistActiveAccount(accountId) {
  activeAccountKnown = true;
  activeAccountId = accountId;
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(PUSH_ACCOUNT_BINDING_CACHE);
    await cache.put(
      accountBindingUrl(),
      new Response(JSON.stringify({ accountId }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
      })
    );
  } catch {
    // The live worker still enforces the binding. A later page lifecycle event
    // retries persistence without weakening current-account isolation.
  }
}

async function readActiveAccount() {
  if (activeAccountKnown) return { known: true, accountId: activeAccountId };
  if (typeof caches === 'undefined') return { known: false, accountId: null };
  try {
    const cache = await caches.open(PUSH_ACCOUNT_BINDING_CACHE);
    const response = await cache.match(accountBindingUrl());
    if (!response) return { known: false, accountId: null };
    const value = await response.json().catch(() => null);
    const accountId = value?.accountId === null
      ? null
      : typeof value?.accountId === 'string' && UUID_RE.test(value.accountId)
        ? value.accountId
        : undefined;
    if (accountId === undefined) return { known: false, accountId: null };
    activeAccountKnown = true;
    activeAccountId = accountId;
    return { known: true, accountId };
  } catch {
    return { known: false, accountId: null };
  }
}

async function pushMatchesActiveAccount(pushEvent) {
  if (!pushEvent.recipientId) return true;
  const binding = await readActiveAccount();
  // Backwards compatibility for an installation that has not loaded the new
  // page code yet. Once a page has identified or logged out this browser, the
  // persisted binding becomes fail-closed across worker restarts.
  return !binding.known || binding.accountId === pushEvent.recipientId;
}

async function closeForeignAccountNotifications() {
  if (typeof self.registration.getNotifications !== 'function') return;
  const binding = await readActiveAccount();
  if (!binding.known) return;
  try {
    const notifications = await self.registration.getNotifications();
    for (const notification of notifications) {
      const notificationEvent = canonicalPushEvent(notification.data || {});
      if (
        notificationEvent.recipientId &&
        notificationEvent.recipientId !== binding.accountId
      ) notification.close();
    }
  } catch {
    // Best effort. Every subsequent recipient-bound push checks the binding
    // again before and immediately after presentation.
  }
}

function publicPushEvent(pushEvent) {
  const { deliveryToken: _privateToken, ...visible } = pushEvent;
  return visible;
}

function reportLocalPresentation(client, pushEvent) {
  if (!client || pushEvent.kind !== 'test') return;
  try {
    client.postMessage({
      type: PUSH_PRESENTED_EVENT_TYPE,
      eventId: pushEvent.eventId,
      kind: pushEvent.kind,
      presentedAt: new Date().toISOString()
    });
  } catch {
    // Notification presentation already succeeded. Page diagnostics are a
    // best-effort second signal and must never turn that success into a retry.
  }
}

async function ackCallDelivery(pushEvent, stage) {
  if (
    pushEvent.kind !== 'call' ||
    pushEvent.callState !== 'incoming' ||
    !pushEvent.deliveryId ||
    !pushEvent.deliveryToken ||
    !['received', 'presented', 'opened'].includes(stage)
  ) return false;
  for (let attempt = 0; attempt < ACK_MAX_ATTEMPTS; attempt += 1) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timeoutId;
    try {
      const response = await Promise.race([
        fetch(ACK_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            deliveryId: pushEvent.deliveryId,
            token: pushEvent.deliveryToken,
            stage
          }),
          ...(controller ? { signal: controller.signal } : {})
        }),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            controller?.abort();
            reject(new Error('call_delivery_ack_timeout'));
          }, ACK_FETCH_TIMEOUT_MS);
        })
      ]);
      if (response.ok) {
        const result = await response.json().catch(() => null);
        if (result?.acknowledged === true) return true;
      }
      // An invalid/expired capability will not recover inside this worker.
      // Retry only provider/network-style failures and explicit throttling.
      if (
        response.status >= 400 &&
        response.status < 500 &&
        ![408, 425, 429].includes(response.status)
      ) return false;
    } catch {
      // A short network interruption is retryable while waitUntil keeps this
      // worker alive. Every fetch and the complete retry loop stay bounded.
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
    if (attempt + 1 < ACK_MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, ACK_RETRY_BASE_MS * 2 ** attempt));
    }
  }
  return false;
}

function callNotificationTag(pushEvent) {
  return `presuntinho-call-${pushEvent.callId || 'incoming'}`;
}

function messageNotificationTag(url) {
  try {
    const conversation = new URL(url, self.location.origin).searchParams.get('conversation');
    if (conversation && UUID_RE.test(conversation)) return `presuntinho-msg-${conversation}`;
  } catch {
    // Fall through to the already-canonical bounded relative URL.
  }
  return `presuntinho-msg-${url}`;
}

function callExpired(pushEvent, now = Date.now()) {
  if (pushEvent.kind !== 'call' || pushEvent.callState !== 'incoming') return false;
  const expiresAt = pushEvent.expiresAt ? Date.parse(pushEvent.expiresAt) : NaN;
  // Fail closed for old/malformed call pushes: unlike a normal message, a call
  // notification is actively misleading once its short ringing window is gone.
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

function terminalCallExpired(pushEvent, now = Date.now()) {
  if (pushEvent.kind !== 'call' || pushEvent.callState !== 'terminal') return false;
  const expiresAt = pushEvent.terminalExpiresAt
    ? Date.parse(pushEvent.terminalExpiresAt)
    : NaN;
  // Terminal-only notices are cleanup/history for a specific lifecycle. Old
  // or malformed payloads must never appear as fresh call activity.
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

function gameInviteExpired(pushEvent, now = Date.now()) {
  if (pushEvent.kind !== 'game_invite') return false;
  const expiresAt = pushEvent.expiresAt ? Date.parse(pushEvent.expiresAt) : NaN;
  if (!UUID_RE.test(String(pushEvent.eventId || '')) || !Number.isFinite(expiresAt) || expiresAt <= now) {
    return true;
  }
  try {
    const deepLink = new URL(pushEvent.url, self.location.origin);
    return deepLink.origin !== self.location.origin ||
      deepLink.pathname !== '/secrets/versus/' ||
      !ROOM_CODE_RE.test(String(deepLink.searchParams.get('join') || '')) ||
      deepLink.searchParams.get('invite') !== pushEvent.eventId;
  } catch {
    return true;
  }
}

function tombstoneUrl(callId) {
  return `${self.location.origin}/__presuntinho_call_tombstone__/${encodeURIComponent(callId)}`;
}

async function markCallTerminal(callId, now = Date.now()) {
  if (!callId) return;
  const expiresAt = now + CALL_TOMBSTONE_TTL_MS;
  memoryCallTombstones.set(callId, expiresAt);
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CALL_TOMBSTONE_CACHE);
    await cache.put(
      tombstoneUrl(callId),
      new Response(JSON.stringify({ expiresAt }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
      })
    );
  } catch {
    // The in-memory marker still orders concurrent events in this worker.
  }
}

async function callIsTerminal(callId, now = Date.now()) {
  if (!callId) return false;
  const memoryExpiry = memoryCallTombstones.get(callId);
  if (typeof memoryExpiry === 'number') {
    if (memoryExpiry > now) return true;
    memoryCallTombstones.delete(callId);
  }
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(CALL_TOMBSTONE_CACHE);
    const response = await cache.match(tombstoneUrl(callId));
    if (!response) return false;
    const value = await response.json().catch(() => null);
    const expiresAt = Number(value?.expiresAt || 0);
    if (Number.isFinite(expiresAt) && expiresAt > now) {
      memoryCallTombstones.set(callId, expiresAt);
      return true;
    }
    await cache.delete(tombstoneUrl(callId));
  } catch {
    // Cache Storage can be unavailable in hardened/private contexts.
  }
  return false;
}

async function cleanupCallTombstones(now = Date.now()) {
  for (const [callId, expiresAt] of memoryCallTombstones) {
    if (expiresAt <= now) memoryCallTombstones.delete(callId);
  }
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CALL_TOMBSTONE_CACHE);
    const requests = await cache.keys();
    await Promise.all(requests.map(async (request) => {
      const response = await cache.match(request);
      const value = response ? await response.json().catch(() => null) : null;
      if (!Number.isFinite(Number(value?.expiresAt)) || Number(value.expiresAt) <= now) {
        await cache.delete(request);
      }
    }));
  } catch {
    // Best-effort bounded cache maintenance.
  }
}

function pushEventDedupeUrl(eventId) {
  return `${self.location.origin}/__presuntinho_push_event__/${encodeURIComponent(eventId)}`;
}

/** Claim the user-visible presentation of one semantic push event. Provider
 * retries are deliberately at-least-once; this persistent marker makes those
 * retries silent across service-worker restarts while call ACK retries remain
 * free to run. */
async function claimPushPresentation(eventId, now = Date.now()) {
  if (typeof eventId !== 'string' || eventId.length < 1 || eventId.length > 200) return true;
  const memoryExpiry = memoryPushEvents.get(eventId);
  if (typeof memoryExpiry === 'number' && memoryExpiry > now) return false;
  if (typeof memoryExpiry === 'number') memoryPushEvents.delete(eventId);

  const expiresAt = now + PUSH_EVENT_DEDUPE_TTL_MS;
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(PUSH_EVENT_DEDUPE_CACHE);
      const existing = await cache.match(pushEventDedupeUrl(eventId));
      if (existing) {
        const value = await existing.json().catch(() => null);
        const existingExpiry = Number(value?.expiresAt || 0);
        if (Number.isFinite(existingExpiry) && existingExpiry > now) {
          memoryPushEvents.set(eventId, existingExpiry);
          return false;
        }
      }
      await cache.put(
        pushEventDedupeUrl(eventId),
        new Response(JSON.stringify({ expiresAt }), {
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
        })
      );
    } catch {
      // The in-memory marker still deduplicates this worker lifetime.
    }
  }
  memoryPushEvents.set(eventId, expiresAt);
  return true;
}

async function releasePushPresentation(eventId) {
  memoryPushEvents.delete(eventId);
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(PUSH_EVENT_DEDUPE_CACHE);
    await cache.delete(pushEventDedupeUrl(eventId));
  } catch {
    // A later retry can still replace the same notification tag.
  }
}

async function cleanupPushEventDedupe(now = Date.now()) {
  for (const [eventId, expiresAt] of memoryPushEvents) {
    if (expiresAt <= now) memoryPushEvents.delete(eventId);
  }
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(PUSH_EVENT_DEDUPE_CACHE);
    const requests = await cache.keys();
    await Promise.all(requests.map(async (request) => {
      const response = await cache.match(request);
      const value = response ? await response.json().catch(() => null) : null;
      if (!Number.isFinite(Number(value?.expiresAt)) || Number(value.expiresAt) <= now) {
        await cache.delete(request);
      }
    }));
  } catch {
    // Best-effort bounded cache maintenance.
  }
}

function serializeCallOperation(callId, task) {
  if (!callId) return task();
  const previous = callOperationQueues.get(callId) || Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  callOperationQueues.set(callId, current);
  return current.finally(() => {
    if (callOperationQueues.get(callId) === current) callOperationQueues.delete(callId);
  });
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
      if (
        callExpired(pushEvent) ||
        (pushEvent.callState === 'terminal' && pushEvent.terminalEvent !== 'missed')
      ) notification.close();
    }
  } catch {
    // Best-effort cleanup; never let it prevent delivery of a fresh push.
  }
}

function notificationOptions(pushEvent, foreground) {
  const { kind, body, url } = pushEvent;
  const terminalCall = kind === 'call' && pushEvent.callState === 'terminal';
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
          ? messageNotificationTag(url)
          : kind === 'game_invite'
            ? `presuntinho-game-invite-${pushEvent.eventId}`
          : `presuntinho-ping-${kind}`,
    renotify: !terminalCall,
    requireInteraction: kind === 'call' && !terminalCall,
    data: pushEvent
  };
  if (terminalCall) {
    // userVisibleOnly still receives a real notification, but terminal updates
    // must never ring/vibrate a second time.
    options.silent = true;
  } else if (foreground && kind !== 'call') {
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
          : kind === 'game_invite'
            ? GAME_INVITE_VIBRATION
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
    serializeCallOperation(
      pushEvent.kind === 'call' ? `call:${pushEvent.callId}` : `push:${pushEvent.eventId}`,
      async () => {
      await cleanupCallTombstones();
      await cleanupPushEventDedupe();
      await closeExpiredCallNotifications();
      // A provider can deliver at the edge of the TTL. Never vibrate or open a
      // room for an expired/malformed durable invite; the page independently
      // revalidates the database row before joining as the final authority.
      if (gameInviteExpired(pushEvent)) return;
      if (!await pushMatchesActiveAccount(pushEvent)) {
        if (pushEvent.kind === 'call') await closeCallNotifications(pushEvent);
        return;
      }
      if (pushEvent.kind === 'call' && pushEvent.callState === 'terminal') {
        await markCallTerminal(pushEvent.callId);
        if (terminalCallExpired(pushEvent)) {
          await closeCallNotifications(pushEvent);
          return;
        }
        if (!await claimPushPresentation(pushEvent.eventId)) {
          if (pushEvent.terminalEvent !== 'missed') await closeCallNotifications(pushEvent);
          return;
        }
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const foregroundClient =
          clients.find((client) => client.focused === true) ||
          clients.find((client) => client.visibilityState === 'visible');
        try {
          if (foregroundClient) foregroundClient.postMessage(publicPushEvent(pushEvent));
          await self.registration.showNotification(
            pushEvent.title,
            notificationOptions(pushEvent, Boolean(foregroundClient))
          );
          if (!await pushMatchesActiveAccount(pushEvent)) {
            await closeCallNotifications(pushEvent);
            return;
          }
          reportLocalPresentation(foregroundClient, pushEvent);
        } catch (error) {
          await releasePushPresentation(pushEvent.eventId);
          throw error;
        }
        if (pushEvent.terminalEvent !== 'missed') {
          await new Promise((resolve) => setTimeout(resolve, TERMINAL_NOTICE_MS));
          await closeCallNotifications(pushEvent);
        }
        return;
      }
      // Do not delay the visible notification on a network round-trip. The DB
      // stage machine is monotonic if presented happens to reach it first.
      const receivedAck = ackCallDelivery(pushEvent, 'received');
      if (callExpired(pushEvent)) {
        await markCallTerminal(pushEvent.callId);
        await closeCallNotifications(pushEvent);
        await receivedAck;
        return;
      }
      // A terminal update can overtake an ambiguous provider timeout. The
      // persistent tombstone makes a late invitation harmless across both
      // concurrent push events and service-worker restarts.
      if (pushEvent.kind === 'call' && await callIsTerminal(pushEvent.callId)) {
        await closeCallNotifications(pushEvent);
        await receivedAck;
        return;
      }
      const shouldPresent = await claimPushPresentation(pushEvent.eventId);
      if (!shouldPresent) {
        await Promise.allSettled([
          receivedAck,
          ackCallDelivery(pushEvent, 'presented')
        ]);
        return;
      }
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Send to one client only, otherwise two open tabs could both animate and
      // vibrate the same physical phone. Prefer focused, then any visible tab.
      const foregroundClient =
        clients.find((client) => client.focused === true) ||
        clients.find((client) => client.visibilityState === 'visible');
      try {
        if (foregroundClient) foregroundClient.postMessage(publicPushEvent(pushEvent));
        await self.registration.showNotification(
          pushEvent.title,
          notificationOptions(pushEvent, Boolean(foregroundClient))
        );
        if (!await pushMatchesActiveAccount(pushEvent)) {
          if (pushEvent.kind === 'call') await closeCallNotifications(pushEvent);
          else await closeForeignAccountNotifications();
          return;
        }
        reportLocalPresentation(foregroundClient, pushEvent);
      } catch (error) {
        await releasePushPresentation(pushEvent.eventId);
        throw error;
      }
      await Promise.allSettled([
        receivedAck,
        ackCallDelivery(pushEvent, 'presented')
      ]);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    closeExpiredCallNotifications(),
    cleanupCallTombstones(),
    cleanupPushEventDedupe()
  ]));
});

// Realtime can resolve a call before an invitation delayed by the push
// provider reaches this worker. Persist the page-observed terminal state first
// so that delayed push cannot reopen an already accepted/declined call, even
// after the worker is restarted.
self.addEventListener('message', (event) => {
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  const accountId = data.type === PUSH_ACCOUNT_BINDING_TYPE && (
    data.accountId === null || UUID_RE.test(String(data.accountId || ''))
  ) ? data.accountId : undefined;
  if (accountId !== undefined) {
    // Update memory before the first await so a concurrently-dispatched push
    // cannot present private content for the account that just signed out.
    activeAccountKnown = true;
    activeAccountId = accountId;
    event.waitUntil((async () => {
      await persistActiveAccount(accountId);
      await closeForeignAccountNotifications();
    })());
    return;
  }
  const callId = data.type === LOCAL_CALL_TERMINAL_TYPE && UUID_RE.test(String(data.callId || ''))
    ? String(data.callId)
    : null;
  if (!callId) return;
  event.waitUntil(
    serializeCallOperation(`call:${callId}`, async () => {
      await markCallTerminal(callId);
      await closeCallNotifications({ kind: 'call', callId });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const pushEvent = canonicalPushEvent(event.notification.data || {});
  if (callExpired(pushEvent) || terminalCallExpired(pushEvent) || gameInviteExpired(pushEvent)) {
    event.waitUntil(closeCallNotifications(pushEvent));
    return;
  }
  const url = pushEvent.url || '/';
  event.waitUntil(
    (async () => {
      // A click can race the logout/account-switch message that is closing an
      // already-visible notification. Never navigate or report `opened` for
      // private content that no longer belongs to the active account.
      if (!await pushMatchesActiveAccount(pushEvent)) {
        await closeForeignAccountNotifications();
        return;
      }
      const openedAck = ackCallDelivery(pushEvent, 'opened');
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      let opened;
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) await client.navigate(url);
          opened = await client.focus();
          break;
        }
      }
      if (!opened) opened = await self.clients.openWindow(url);
      await openedAck;
      return opened;
    })()
  );
});
