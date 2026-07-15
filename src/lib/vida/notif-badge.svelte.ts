// Shared notification-badge store — one source of truth for the unread count so
// the global header bell and the Home hero chip agree without double work.
//
// The heavy part (buildNotifications ← loadAgendaItems + loadNotificationExtras)
// reads Dexie and, via loadNotificationExtras → getDailyQuests(), pays due quest
// XP. getDailyQuests() is internally inflight-guarded + idempotent-per-day, so
// concurrent callers are safe, but we still refresh only on DISCRETE triggers
// (ready, navigation, visibility, NOTIF_CHANGED) — NEVER on a timer — and throttle
// back-to-back refetches. Between refetches we just recompute the count from the
// cached list against the live read/snooze state.

import {
  buildNotifications,
  loadAgendaItems,
  loadNotificationExtras,
  type NotificationItem
} from '$lib/vida/agenda';
import { loadNotifState, unreadCount, NOTIF_CHANGED_EVENT } from '$lib/vida/notificationState';

export const notifBadge = $state<{ count: number }>({ count: 0 });

let cached: NotificationItem[] = [];
let inflight: Promise<void> | null = null;
let lastFetchAt = 0;
let lifecycleEpoch = 0;
const THROTTLE_MS = 8000;

function recompute(): void {
  notifBadge.count = unreadCount(cached, loadNotifState());
}

/**
 * Refresh the badge. Cheap path (throttled / no data yet): recompute the count
 * from the cached list. Expensive path: refetch Dexie + rebuild, at most once
 * per THROTTLE_MS unless `force`.
 */
export function refreshNotifBadge(force = false): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  if (inflight) return inflight;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (!force && lastFetchAt !== 0 && now - lastFetchAt < THROTTLE_MS) {
    recompute();
    return Promise.resolve();
  }
  lastFetchAt = now;
  const requestEpoch = lifecycleEpoch;
  let pending!: Promise<void>;
  pending = (async () => {
    try {
      const [items, extras] = await Promise.all([loadAgendaItems(), loadNotificationExtras()]);
      if (requestEpoch !== lifecycleEpoch) return;
      cached = buildNotifications(items, extras);
      recompute();
    } catch (e) {
      console.error('[notif-badge] refresh failed', e);
    } finally {
      if (inflight === pending) inflight = null;
    }
  })();
  inflight = pending;
  return pending;
}

/** Drop another account's cached badge and invalidate any in-flight refresh. */
export function resetNotifBadge(): void {
  lifecycleEpoch += 1;
  inflight = null;
  lastFetchAt = 0;
  cached = [];
  notifBadge.count = 0;
}

/** Keep the count live when /notificacoes marks read / snoozes (no refetch). */
export function bindNotifBadge(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onChange = () => recompute();
  window.addEventListener(NOTIF_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(NOTIF_CHANGED_EVENT, onChange);
}
