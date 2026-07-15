// Web Push — one durable installation per browser profile. The local
// PushSubscription is not enough to report "on": it must also be bound to the
// signed-in account and installation in Postgres.

import { getSupabaseClient } from '$lib/multiplayer/client';
import { isMultiplayerConfigured } from '$lib/multiplayer/config';
import { getAuthSession, getAuthUser, onAuthChange } from '$lib/account/auth';

// Public by design. The private VAPID key only exists in the Netlify runtime.
export const VAPID_PUBLIC_KEY =
  'BKK2RHFTXc4rpyXnN2Y4y1bwb9IuZjtG-mw-flND2OxOWqfvP02wXO888EWmxQ6WFDTvoYHHYZbwk1AgkPfoKQg';

const INSTALLATION_STORAGE_KEY = 'presuntinho:push-installation:v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PushState = 'unsupported' | 'ios-needs-install' | 'denied' | 'off' | 'on';
export type PushKind = 'love' | 'nudge' | 'message' | 'call' | 'game_invite';
export type ForegroundPushKind = PushKind | 'test';
export const PUSH_FOREGROUND_EVENT_TYPE = 'presuntinho:push-event' as const;
export const PUSH_PRESENTED_EVENT_TYPE = 'presuntinho:push-presented' as const;
export const PUSH_ACCOUNT_BINDING_EVENT_TYPE = 'presuntinho:push-account-binding' as const;

export type PushDeliveryStatus =
  | 'sent'
  | 'partial'
  | 'failed'
  | 'retrying'
  | 'no-devices'
  | 'already-processed'
  | 'unauthorized'
  | 'forbidden'
  | 'expired'
  | 'invalid'
  | 'unavailable'
  | 'network-error';

/** Provider details stay private; these counts are safe to surface in UI. */
export interface PushDeliveryResult {
  attempted: number;
  sent: number;
  failed: number;
  stale: number;
  noDevices: boolean;
  status: PushDeliveryStatus;
  /** 0 means the request never reached the Netlify function. */
  httpStatus: number;
}

/** Canonical payload posted by push-sw.js when the app is foregrounded. */
export interface ForegroundPushEvent {
  type: typeof PUSH_FOREGROUND_EVENT_TYPE;
  eventId: string;
  kind: ForegroundPushKind;
  title: string;
  body: string;
  url: string;
  /** Authenticated sender, filled by the server. */
  senderId: string;
  /** Recipient account used by the worker to suppress stale shared-device push. */
  recipientId?: string;
  callId?: string;
  /** Opaque delivery id is useful for diagnostics; no ACK token reaches the page. */
  deliveryId?: string;
}

export type TestPushVerification = 'presented' | 'provider-accepted' | 'queued' | 'failed';

export interface TestPushResult {
  eventId: string;
  sent: number;
  verification: TestPushVerification;
  delivery: PushDeliveryResult;
}

type PushNotifyOptions = {
  title?: string;
  body?: string;
  to?: string;
  url?: string;
  eventId?: string;
  callId?: string;
};

type JsonObject = Record<string, unknown>;

let memoryInstallationId: string | null = null;
let authReconciliationStarted = false;

function finiteCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function statusForHttp(httpStatus: number): PushDeliveryStatus {
  if (httpStatus === 0) return 'network-error';
  if (httpStatus === 400 || httpStatus === 405 || httpStatus === 413) return 'invalid';
  if (httpStatus === 401) return 'unauthorized';
  if (httpStatus === 403) return 'forbidden';
  if (httpStatus === 409 || httpStatus === 410) return 'expired';
  if (httpStatus >= 500) return 'unavailable';
  return 'failed';
}

export function normalizePushDeliveryResult(
  value: unknown,
  httpStatus: number
): PushDeliveryResult {
  const data = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
  const attempted = finiteCount(data.attempted);
  const sent = finiteCount(data.sent);
  const failed = finiteCount(data.failed);
  const stale = finiteCount(data.stale);
  const noDevices = data.noDevices === true;
  const allowed = new Set<PushDeliveryStatus>([
    'sent',
    'partial',
    'failed',
    'retrying',
    'no-devices',
    'already-processed',
    'unauthorized',
    'forbidden',
    'expired',
    'invalid',
    'unavailable',
    'network-error'
  ]);
  const status = typeof data.status === 'string' && allowed.has(data.status as PushDeliveryStatus)
    ? (data.status as PushDeliveryStatus)
    : noDevices
      ? 'no-devices'
      : httpStatus >= 200 && httpStatus < 300
        ? sent > 0 && failed + stale === 0
          ? 'sent'
          : sent > 0
            ? 'partial'
            : 'failed'
        : statusForHttp(httpStatus);
  return { attempted, sent, failed, stale, noDevices, status, httpStatus };
}

function emptyDeliveryResult(status: PushDeliveryStatus, httpStatus = 0): PushDeliveryResult {
  return {
    attempted: 0,
    sent: 0,
    failed: 0,
    stale: 0,
    noDevices: status === 'no-devices',
    status,
    httpStatus
  };
}

function newPushEventId(): string {
  return crypto.randomUUID();
}

function newInstallationId(): string {
  return crypto.randomUUID();
}

/** Stable for this browser profile; account changes rebind the same device. */
export function getPushInstallationId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(INSTALLATION_STORAGE_KEY);
    if (existing && UUID_RE.test(existing)) return existing;
    const created = newInstallationId();
    window.localStorage.setItem(INSTALLATION_STORAGE_KEY, created);
    return created;
  } catch {
    // Private modes can deny localStorage. A session-stable id is still better
    // than conflating every such device, but it is not claimed as durable.
    memoryInstallationId ??= newInstallationId();
    return memoryInstallationId;
  }
}

/**
 * Read the installation identity without creating one. Logout uses this path:
 * manufacturing a fresh id while removing an old account cannot revoke any
 * real binding and makes shared-device diagnostics misleading.
 */
function getExistingPushInstallationId(): string | null {
  if (typeof window === 'undefined') return memoryInstallationId;
  try {
    const existing = window.localStorage.getItem(INSTALLATION_STORAGE_KEY);
    return existing && UUID_RE.test(existing) ? existing : memoryInstallationId;
  } catch {
    return memoryInstallationId;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function platformName(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  if (isIos()) return 'ios';
  if (/android/i.test(navigator.userAgent)) return 'android';
  if (/windows/i.test(navigator.userAgent)) return 'windows';
  if (/macintosh|mac os x/i.test(navigator.userAgent)) return 'macos';
  if (/linux/i.test(navigator.userAgent)) return 'linux';
  return 'other';
}

function installationCapabilities(): JsonObject {
  return {
    push: true,
    standalone: isStandalone(),
    notificationActions:
      typeof Notification !== 'undefined' && 'maxActions' in Notification,
    badges: typeof navigator !== 'undefined' && 'setAppBadge' in navigator
  };
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Tell every local worker which authenticated account currently owns this
 * browser profile. The worker persists the value in Cache Storage, closes
 * notifications from the previous account and rejects late recipient-bound
 * payloads after logout/account switch.
 */
export async function syncPushServiceWorkerAccount(accountId: string | null): Promise<void> {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !(accountId === null || UUID_RE.test(accountId))
  ) return;
  const message = { type: PUSH_ACCOUNT_BINDING_EVENT_TYPE, accountId };
  const notified = new Set<ServiceWorker>();
  const notify = (worker: ServiceWorker | null | undefined) => {
    if (!worker || notified.has(worker)) return;
    notified.add(worker);
    worker.postMessage(message);
  };
  try {
    notify(navigator.serviceWorker.controller);
    const registration = await navigator.serviceWorker.getRegistration();
    notify(registration?.active);
    notify(registration?.waiting);
    notify(registration?.installing);
  } catch {
    // The auth callback will retry on the next session event; delivery remains
    // server-scoped even if no local worker exists yet.
  }
}

function serializeSubscription(sub: PushSubscription): {
  endpoint: string;
  p256dh: string;
  auth: string;
} | null {
  const raw = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) return null;
  return { endpoint: raw.endpoint, p256dh: raw.keys.p256dh, auth: raw.keys.auth };
}

/**
 * Atomically refresh the subscription/account/installation binding. False
 * means the local subscription must not be advertised as enabled.
 */
export async function reconcilePushSubscription(
  options: { subscribeIfMissing?: boolean } = {}
): Promise<boolean> {
  if (!pushSupported() || !isMultiplayerConfigured() || Notification.permission !== 'granted') {
    return false;
  }
  const [user, registration] = await Promise.all([
    getAuthUser(),
    (async () => {
      const existing = await navigator.serviceWorker.getRegistration();
      if (existing || !options.subscribeIfMissing) return existing;
      // A login can race the PWA registration during a cold launch. Waiting for
      // `ready` here lets the fail-closed logout subscription be recreated as
      // soon as the already-granted account signs back in.
      return navigator.serviceWorker.ready;
    })()
  ]);
  if (!user || !registration) return false;
  await syncPushServiceWorkerAccount(user.id);
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription && options.subscribeIfMissing) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    } catch {
      return false;
    }
  }
  const serialized = subscription ? serializeSubscription(subscription) : null;
  const installationId = getPushInstallationId();
  if (!serialized || !installationId) return false;

  const { data, error } = await getSupabaseClient().rpc('reconcile_push_installation', {
    p_installation_id: installationId,
    p_endpoint: serialized.endpoint,
    p_p256dh: serialized.p256dh,
    p_auth: serialized.auth,
    p_ua: navigator.userAgent.slice(0, 160),
    p_platform: platformName(),
    p_capabilities: installationCapabilities()
  });
  if (error) return false;
  return data === true;
}

/** State on this installation, verified against the current account in DB. */
export async function getPushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'ios-needs-install';
  if (!pushSupported()) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  try {
    return (await reconcilePushSubscription()) ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/** Enable push on this installation; must be invoked from a user gesture. */
export async function enablePush(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'ios-needs-install';
  if (!pushSupported()) return 'unsupported';
  if (!isMultiplayerConfigured()) return 'unsupported';
  const user = await getAuthUser();
  if (!user) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = await navigator.serviceWorker.ready;
  await syncPushServiceWorkerAccount(user.id);
  try {
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      await new Promise<void>((resolve) => {
        const done = () => {
          navigator.serviceWorker.removeEventListener('controllerchange', done);
          resolve();
        };
        navigator.serviceWorker.addEventListener('controllerchange', done);
        setTimeout(done, 2500);
      });
    }
  } catch {
    // The active worker can still own the existing subscription.
  }

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    }));
  if (!serializeSubscription(sub)) return 'off';
  return (await reconcilePushSubscription()) ? 'on' : 'off';
}

/** Disable push and revoke its server binding even if browser unsubscribe fails. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  const installationId = getPushInstallationId();
  let revokeError: unknown = null;
  if (installationId && isMultiplayerConfigured()) {
    const { error } = await getSupabaseClient().rpc('revoke_push_installation', {
      p_installation_id: installationId,
      p_endpoint: sub?.endpoint ?? null
    });
    revokeError = error;
  }
  await sub?.unsubscribe();
  if (revokeError) throw revokeError;
}

/**
 * Remove only the current authenticated account's server-side binding for this
 * browser installation. The browser PushSubscription intentionally remains
 * alive so a different account on the same device can rebind it after login.
 * The RPC scopes deletion with auth.uid(), so it cannot revoke another user's
 * installation even when an endpoint is reused by a shared browser profile.
 */
export async function revokeAuthenticatedPushBinding(): Promise<boolean> {
  if (!isMultiplayerConfigured()) return false;
  const installationId = getExistingPushInstallationId();
  if (!installationId) return false;

  let endpoint: string | null = null;
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      endpoint = (await registration?.pushManager.getSubscription())?.endpoint ?? null;
    }
  } catch {
    // Revoking by authenticated installation id is sufficient when the local
    // Service Worker is unavailable during teardown.
  }

  const { data, error } = await getSupabaseClient().rpc('revoke_push_installation', {
    p_installation_id: installationId,
    p_endpoint: endpoint
  });
  if (error) throw error;
  return data === true;
}

/**
 * Fail-closed shared-device fallback. This does not need the old JWT: removing
 * the browser endpoint makes any stale server binding undeliverable. A later
 * login with notification permission already granted can subscribe again.
 */
export async function unsubscribeLocalPushSubscription(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return subscription ? await subscription.unsubscribe() : false;
  } catch {
    return false;
  }
}

async function readDeliveryResponse(response: Response): Promise<PushDeliveryResult> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // The HTTP status remains observable even if an intermediary returned HTML.
  }
  return normalizePushDeliveryResult(data, response.status);
}

/**
 * Request push delivery. It never turns HTTP/network failures into an
 * apparent success: callers always receive counts, semantic status and the
 * actual HTTP status. Existing fire-and-forget callers may safely ignore it.
 */
export async function sendPushNotify(
  kind: PushKind,
  opts: PushNotifyOptions
): Promise<PushDeliveryResult> {
  const session = await getAuthSession().catch(() => null);
  if (!session) return emptyDeliveryResult('unauthorized', 401);
  const eventId =
    kind === 'love' || kind === 'nudge' ? opts.eventId : (opts.eventId ?? newPushEventId());
  if (!eventId) return emptyDeliveryResult('invalid', 400);
  const attempts = kind === 'call' ? 4 : 1;
  let result = emptyDeliveryResult('network-error');
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch('/api/push-ping', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          eventId,
          kind,
          title: opts.title,
          body: opts.body ?? '',
          to: kind === 'message' ? opts.to : undefined,
          url: opts.url,
          callId: kind === 'call' ? opts.callId : undefined
        })
      });
      result = await readDeliveryResponse(response);
    } catch {
      result = emptyDeliveryResult('network-error');
    }
    if (
      kind !== 'call' ||
      !['network-error', 'unavailable', 'retrying'].includes(result.status) ||
      attempt + 1 >= attempts
    ) return result;
    // Replays are safe: Postgres claims each installation with a rotating CAS
    // token, while Netlify returns success only after its background job is
    // accepted. This closes the one-fire-and-forget request gap.
    await new Promise((resolve) => setTimeout(resolve, 450 * 2 ** attempt));
  }
  return result;
}

/** Backwards-compatible couple ping wrapper. */
export async function sendPingPush(
  kind: 'love' | 'nudge',
  title: string,
  body: string,
  eventId: string
): Promise<void> {
  await sendPushNotify(kind, { title, body, eventId });
}

function observeLocalPushPresentation(eventId: string, timeoutMs: number): {
  promise: Promise<boolean>;
  cancel: () => void;
} {
  const serviceWorker = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  if (!serviceWorker?.addEventListener) {
    return { promise: Promise.resolve(false), cancel: () => undefined };
  }
  let settled = false;
  let resolveResult: (value: boolean) => void = () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    serviceWorker.removeEventListener('message', onMessage as EventListener);
    if (timer !== undefined) clearTimeout(timer);
  };
  const finish = (value: boolean) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolveResult(value);
  };
  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type?: unknown; eventId?: unknown } | null;
    if (
      data?.type === PUSH_PRESENTED_EVENT_TYPE &&
      data.eventId === eventId
    ) finish(true);
  };
  const promise = new Promise<boolean>((resolve) => {
    resolveResult = resolve;
    serviceWorker.addEventListener('message', onMessage as EventListener);
    timer = setTimeout(() => finish(false), Math.max(250, timeoutMs));
  });
  return { promise, cancel: () => finish(false) };
}

/**
 * Self-test used by settings. `sent` means a push provider accepted work;
 * `presented` is stronger and is emitted by this installation only after its
 * Service Worker successfully calls showNotification().
 */
export async function sendTestPush(
  title: string,
  body: string,
  presentationTimeoutMs = 12_000
): Promise<TestPushResult | null> {
  const session = await getAuthSession().catch(() => null);
  if (!session) return null;
  const eventId = newPushEventId();
  const presentation = observeLocalPushPresentation(eventId, presentationTimeoutMs);
  try {
    const response = await fetch('/api/push-ping', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ eventId, kind: 'test', title, body })
    });
    const result = await readDeliveryResponse(response);
    if (!response.ok) {
      presentation.cancel();
      return null;
    }
    if (result.sent === 0 && result.status !== 'retrying') {
      presentation.cancel();
      return {
        eventId,
        sent: 0,
        verification: 'failed',
        delivery: result
      };
    }
    const locallyPresented = await presentation.promise;
    return {
      eventId,
      sent: result.sent,
      verification: locallyPresented
        ? 'presented'
        : result.sent > 0
          ? 'provider-accepted'
          : result.status === 'retrying'
            ? 'queued'
            : 'failed',
      delivery: result
    };
  } catch {
    presentation.cancel();
    return null;
  }
}

const MSG_PUSH_GAP_MS = 15_000;
const lastMsgPushAt = new Map<string, number>();

export function shouldPushMessage(threadKey: string): boolean {
  const now = Date.now();
  const last = lastMsgPushAt.get(threadKey) ?? 0;
  if (now - last < MSG_PUSH_GAP_MS) return false;
  lastMsgPushAt.set(threadKey, now);
  return true;
}

/** Rebind an already-authorized subscription after sign-in/account switch. */
function startAuthPushReconciliation(): void {
  if (
    authReconciliationStarted ||
    !pushSupported() ||
    !isMultiplayerConfigured()
  ) return;
  authReconciliationStarted = true;
  onAuthChange((user) => {
    void syncPushServiceWorkerAccount(user?.id ?? null);
    if (!user || Notification.permission !== 'granted') return;
    // Do not call another Supabase method synchronously from an auth callback.
    setTimeout(() => void reconcilePushSubscription({ subscribeIfMissing: true }), 0);
  });
}

startAuthPushReconciliation();
