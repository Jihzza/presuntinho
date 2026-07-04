// Notification read/snooze state — localStorage-backed, per-day.
//
// Two tiny stores, both holding arrays of '<notificationId>|<YYYY-MM-DD>'
// entries (the same format the /notificacoes page used historically for
// dismissals, so existing snoozes survive the upgrade):
//
//   * 'presuntinho:notif-dismissed' — snoozed "until tomorrow" (✕)
//   * 'presuntinho:notif-read'      — seen/read today (auto-resets daily)
//
// Entries from previous days are pruned on every read, so both stores
// stay tiny and everything naturally comes back the next morning.
//
// Every write dispatches 'presuntinho:notif-changed' on window so the
// hub bell chip and the inbox page stay in sync without polling.
//
// SSR safety: every localStorage touch is wrapped in try/catch, so
// importing/calling this module during SSR (or in private mode with
// storage blocked) degrades to "everything unread, nothing snoozed".

import { localDateKey } from './agenda';

const SNOOZE_STORAGE_KEY = 'presuntinho:notif-dismissed';
const READ_STORAGE_KEY = 'presuntinho:notif-read';

/** Window event fired after every state write. */
export const NOTIF_CHANGED_EVENT = 'presuntinho:notif-changed';

export interface NotifState {
  /** Notification ids snoozed until tomorrow. */
  snoozed: Set<string>;
  /** Notification ids already read today. */
  read: Set<string>;
}

function todayKey(): string {
  return localDateKey(new Date());
}

/** Entries are per notification AND per day — tomorrow they reset. */
function entryKey(id: string): string {
  return `${id}|${todayKey()}`;
}

function writeStore(storageKey: string, entries: string[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(entries));
  } catch {
    // Private mode / quota / SSR — state still holds for this session.
  }
}

/**
 * Read one store, pruning entries from older days (migrated from the
 * old inline prune in /notificacoes) so the store never grows.
 */
function readStore(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const suffix = `|${todayKey()}`;
    const fresh = parsed.filter((k): k is string => typeof k === 'string' && k.endsWith(suffix));
    if (fresh.length !== parsed.length) writeStore(storageKey, fresh);
    return fresh;
  } catch {
    // Corrupt/blocked storage — start clean.
    return [];
  }
}

/** '<id>|<day>' → '<id>' (ids never contain '|'). */
function idsFrom(entries: string[]): Set<string> {
  return new Set(entries.map((e) => e.slice(0, e.lastIndexOf('|'))));
}

function notifyChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NOTIF_CHANGED_EVENT));
}

/** Current snooze + read state for TODAY (stale days pruned). */
export function loadNotifState(): NotifState {
  return {
    snoozed: idsFrom(readStore(SNOOZE_STORAGE_KEY)),
    read: idsFrom(readStore(READ_STORAGE_KEY))
  };
}

/** Hide a notification until tomorrow (✕ «até amanhã»). */
export function snooze(id: string): void {
  const entries = readStore(SNOOZE_STORAGE_KEY);
  const key = entryKey(id);
  if (!entries.includes(key)) {
    entries.push(key);
    writeStore(SNOOZE_STORAGE_KEY, entries);
  }
  notifyChanged();
}

/** Mark one notification as read for today (row tap-through). */
export function markRead(id: string): void {
  const entries = readStore(READ_STORAGE_KEY);
  const key = entryKey(id);
  if (!entries.includes(key)) {
    entries.push(key);
    writeStore(READ_STORAGE_KEY, entries);
  }
  notifyChanged();
}

/** Mark a batch of notifications as read (header «Marcar tudo como lido»). */
export function markAllRead(ids: string[]): void {
  const entries = readStore(READ_STORAGE_KEY);
  let changed = false;
  for (const id of ids) {
    const key = entryKey(id);
    if (!entries.includes(key)) {
      entries.push(key);
      changed = true;
    }
  }
  if (changed) writeStore(READ_STORAGE_KEY, entries);
  notifyChanged();
}

/** Bring back everything snoozed today. */
export function restoreAll(): void {
  writeStore(SNOOZE_STORAGE_KEY, []);
  notifyChanged();
}

/** True while the notification is snoozed for the rest of today. */
export function isSnoozed(id: string, state: NotifState = loadNotifState()): boolean {
  return state.snoozed.has(id);
}

/** Unread = not read today and not snoozed away. */
export function isUnread(id: string, state: NotifState = loadNotifState()): boolean {
  return !state.read.has(id) && !state.snoozed.has(id);
}

/** How many of these notifications are still unread (hub bell chip). */
export function unreadCount(
  notifications: ReadonlyArray<{ id: string }>,
  state: NotifState = loadNotifState()
): number {
  let count = 0;
  for (const n of notifications) {
    if (isUnread(n.id, state)) count += 1;
  }
  return count;
}
