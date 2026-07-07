// Habit reminders — best-effort client-side scheduling (V11).
//
// HONEST SCOPE: a local-first PWA cannot reliably fire notifications while it
// is fully closed (that needs push infrastructure / a server). What we CAN do
// reliably is fire a notification while the app is open (foreground or a live
// tab): when a scheduled, not-yet-done habit passes its reminder time, we show
// a Notification (if the user granted permission) and fall back to nothing if
// not. This covers "the app is open in a tab and it's 20:00" — the common
// case for someone who keeps the PWA around during the day.
//
// The scheduler lives in a mounted component (HabitReminders.svelte); this
// module is the pure/DOM-light logic it drives.

import { parseReminder, isScheduledOn, isLoggedToday, listActiveHabitos, type Habit } from '$lib/habitos';

/** localStorage flag — user opted into reminders in Definições. */
export const REMINDERS_ENABLED_KEY = 'fat-habit-reminders';
/** localStorage set of 'habitId:YYYY-MM-DD' already notified (per day). */
const NOTIFIED_KEY = 'fat-habit-reminders-fired';

export function remindersEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(REMINDERS_ENABLED_KEY) === '1';
}

export function setRemindersEnabled(on: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(REMINDERS_ENABLED_KEY, on ? '1' : '0');
}

/** True when the browser exposes the Notification API. */
export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

/** Ask for notification permission. Returns the resulting state. */
export async function requestReminderPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function todayKeyLocal(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function firedSet(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveFired(set: Set<string>, today: string): void {
  if (typeof localStorage === 'undefined') return;
  // Keep only today's keys so the store never grows unbounded.
  const kept = [...set].filter((k) => k.endsWith(today));
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(kept));
  } catch {
    /* private mode / quota — ignore */
  }
}

/** Minutes-of-day from an 'HH:MM' string, or null if unparseable. */
function minutesOf(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export interface DueReminder {
  habit: Habit;
  time: string;
}

/**
 * Habits whose reminder is due right now: scheduled today (cadence AND the
 * reminder's own day-subset), reminder time is at/just-past `now` (within a
 * grace window so a minute-tick can't miss it), and not yet logged today.
 */
export async function dueHabitReminders(now: Date = new Date(), graceMinutes = 90): Promise<DueReminder[]> {
  const habits = await listActiveHabitos();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dow = now.getDay();
  const out: DueReminder[] = [];
  for (const h of habits) {
    const rem = parseReminder(h.reminder);
    if (!rem) continue;
    // Habit must be scheduled on this weekday (cadence) …
    if (!isScheduledOn(h.cadence, now)) continue;
    // … and, if the reminder itself pins specific days, today must be one.
    if (rem.days && rem.days.length > 0 && !rem.days.includes(dow)) continue;
    const remMin = minutesOf(rem.time);
    if (remMin === null) continue;
    // Due when we're at or a little past the reminder time (never before).
    if (nowMin < remMin || nowMin > remMin + graceMinutes) continue;
    if (await isLoggedToday(h.id)) continue;
    out.push({ habit: h, time: rem.time });
  }
  return out;
}

/**
 * Fire a browser Notification for every due, not-yet-notified habit.
 * Idempotent per habit per day via the fired-set. Returns how many fired.
 * Safe no-op unless reminders are enabled AND permission is granted.
 */
export async function fireDueReminders(now: Date = new Date()): Promise<number> {
  if (!remindersEnabled()) return 0;
  if (!notificationsSupported() || Notification.permission !== 'granted') return 0;
  const today = todayKeyLocal(now);
  const fired = firedSet();
  const due = await dueHabitReminders(now);
  let count = 0;
  for (const { habit } of due) {
    const key = `${habit.id}:${today}`;
    if (fired.has(key)) continue;
    try {
      new Notification(`${habit.icon} ${habit.name}`, {
        body: 'Ainda não marcaste este hábito hoje 🐷',
        tag: `habit-${habit.id}-${today}`,
        icon: '/icons/icon-192.png'
      });
      fired.add(key);
      count++;
    } catch {
      /* Notification constructor can throw on some engines — skip */
    }
  }
  saveFired(fired, today);
  return count;
}
