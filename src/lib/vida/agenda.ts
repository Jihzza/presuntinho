// Vida / Calendário domain helpers — the unified daily operating system.
//
// This module is the ONLY place calendar-related pages read/write Dexie:
//   - habit logs land on their REAL dates (range read, not N point reads)
//   - assignments land on their deadlines
//   - events table (V8): personal events / special dates / reminders,
//     with yearly repeat expansion → AgendaItem kind 'life'
//   - optional finance layer: one informational item per day with movements
//   - mood overlay: read-only map date → mood kind (the mood sub-app owns
//     the writes; we only read for the calendar dots)
//
// `loadAgendaItems()` is kept back-compat for the Home hub (all
// assignments + today's habits + the next 30 days of events).
// `loadAgendaItemsForRange()` is the calendar-grade loader.

import { listHabitos, getAllLogsInRange, localizedHabit, isScheduledOnKey, type Habit } from '../habitos';
import { ensureAssignmentDefaults, listAssignments, localizedAssignment, type Assignment } from '../trabalhos';
import { db, type EventRow } from '../state/db';
import { awardXP } from '../state/xp-actions';
import { formatValor, getMesAtual, getOrcamentoStatus, type OrcamentoStatus } from '../financas';
import { getDailyQuests, type DailyQuestsResult } from '../gamification/quests';
import { get } from 'svelte/store';
import { t } from 'svelte-i18n';
import { locale } from '../i18n';

/**
 * V8: habit reminders may be a legacy free-text string or the structured
 * { time, days? } shape — the agenda only needs a display label.
 */
function reminderLabel(r: unknown): string | undefined {
  if (!r) return undefined;
  if (typeof r === 'string') return r;
  if (typeof r === 'object' && 'time' in (r as Record<string, unknown>)) {
    return String((r as { time: string }).time);
  }
  return undefined;
}

export type AgendaItemKind = 'assignment' | 'habit' | 'life' | 'finance';
export type AgendaItemTone = 'danger' | 'warning' | 'school' | 'habit' | 'life' | 'done';
export type EventKind = EventRow['kind'];

export interface AgendaItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  date: string;
  kind: AgendaItemKind;
  tone: AgendaItemTone;
  status?: string;
  /** Set on kind 'habit' items so the calendar can toggle logs. */
  habitId?: number;
  /** Structured reminder label ("20:00", "manhã") on habit items. */
  reminder?: string;
  /** Set on kind 'life' items so the calendar can delete the row. */
  eventId?: number;
  /** 'event' | 'special' | 'reminder' on kind 'life' items. */
  eventKind?: EventKind;
  yearly?: boolean;
  icon?: string;
}

export type NotificationType = 'deadline' | 'habit' | 'special' | 'budget' | 'quest' | 'love';
export type NotificationSection = 'today' | 'week';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  href: string;
  tone: AgendaItemTone;
  priority: number;
  /** What kind of alert this is — drives the row icon and filters. */
  type: NotificationType;
  /** Leading emoji for the inbox row. */
  icon: string;
  /** Local 'YYYY-MM-DD' the alert refers to (deadline, special date…). */
  date?: string;
  /** Inbox grouping: needs attention today vs. coming up this week. */
  section: NotificationSection;
}

/** A pending friend/couple request surfaced in the notification inbox. */
export interface SocialRequestNotif {
  id: string;
  kind: 'friend' | 'couple';
  name: string;
  href: string;
}

/** Atividade do casal/amigos para o inbox: pings recentes e mensagens por ler. */
export interface CoupleActivityNotif {
  id: string;
  kind: 'ping-love' | 'ping-nudge' | 'messages';
  /** Quem enviou (nome de exibição). */
  name: string;
  count: number;
  href: string;
}

/** Optional non-agenda sources merged into the notification inbox. */
export interface NotificationExtras {
  orcamentos?: OrcamentoStatus[];
  quests?: DailyQuestsResult;
  social?: SocialRequestNotif[];
  coupleActivity?: CoupleActivityNotif[];
}

/** Which sources to include when loading a range. All default to true. */
export interface AgendaLayers {
  habits: boolean;
  school: boolean;
  events: boolean;
  finance: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function tr(key: string, fallback: string, values?: Record<string, string | number>): string {
  return get(t)(key, values ? { values, default: fallback } : { default: fallback });
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfWeek(date = new Date()): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + offset);
  return copy;
}

export function weekDays(date = new Date()): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export function monthGridDays(date = new Date()): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
}

export function formatDayLabel(dateKey: string, locale = 'pt-PT'): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: 'short'
  });
}

// ---------------------------------------------------------------------------
// Shared per-day helpers (were duplicated in Home + /calendario)
// ---------------------------------------------------------------------------

/** All items that fall on a given 'YYYY-MM-DD' local date key. */
export function itemsForDate(items: AgendaItem[], dateKey: string): AgendaItem[] {
  return items.filter((item) => item.date === dateKey);
}

export type DayToneName = 'today' | 'danger' | 'warning' | 'special' | 'busy' | 'quiet';

/**
 * Resolve the visual tone of a day cell from that day's items.
 * `isToday` wins over everything (the cell highlights the current day).
 */
export function dayTone(dayItems: AgendaItem[], isToday = false): DayToneName {
  if (isToday) return 'today';
  if (dayItems.some((item) => item.tone === 'danger')) return 'danger';
  if (dayItems.some((item) => item.tone === 'warning')) return 'warning';
  if (dayItems.some((item) => item.eventKind === 'special')) return 'special';
  if (dayItems.length > 0) return 'busy';
  return 'quiet';
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

// ensureAssignmentDefaults() seeds the table on first boot. It only needs
// to run once per session — the old code ran it on EVERY loadAgendaItems
// call, which is wasted work on each Home/calendar refresh.
let assignmentsEnsured: Promise<void> | null = null;
function ensureAssignmentsOnce(): Promise<void> {
  if (!assignmentsEnsured) {
    assignmentsEnsured = ensureAssignmentDefaults().catch((err) => {
      // Allow a retry on the next load if seeding failed (e.g. transient
      // IndexedDB error) instead of caching the rejection forever.
      assignmentsEnsured = null;
      throw err;
    });
  }
  return assignmentsEnsured;
}

function assignmentTone(a: Assignment): AgendaItemTone {
  if (a.status === 'submitted' || a.status === 'graded') return 'done';
  const today = new Date(localDateKey(new Date()) + 'T00:00:00').getTime();
  const due = new Date(localDateKey(new Date(a.deadline)) + 'T00:00:00').getTime();
  const days = Math.round((due - today) / DAY_MS);
  if (days <= 2) return 'danger';
  if (days <= 7) return 'warning';
  return 'school';
}

function assignmentStatusLabel(status: Assignment['status']): string {
  switch (status) {
    case 'pending': return tr('agenda.assignment.status.pending', 'por começar');
    case 'in_progress': return tr('agenda.assignment.status.in_progress', 'em curso');
    case 'submitted': return tr('agenda.assignment.status.submitted', 'entregue');
    case 'graded': return tr('agenda.assignment.status.graded', 'avaliado');
  }
}

function assignmentToItem(assignment: Assignment): AgendaItem {
  const translate = get(t);
  const a = localizedAssignment(translate, assignment);
  return {
    id: `assignment:${a.id}`,
    title: a.title,
    subtitle: `${a.cadeira ? `${a.cadeira} · ` : ''}${assignmentStatusLabel(a.status)}`,
    href: `/trabalhos/assignment/${a.id}/`,
    date: localDateKey(new Date(a.deadline)),
    kind: 'assignment',
    tone: assignmentTone(a),
    status: a.status
  };
}

// ---------------------------------------------------------------------------
// Habits — logs on their real dates (one range read, not N point reads)
// ---------------------------------------------------------------------------

function habitItemsForRange(
  habits: Habit[],
  logs: Array<{ habitId: number; date: string; done: boolean }>,
  sinceKey: string,
  untilKey: string
): AgendaItem[] {
  const translate = get(t);
  const byId = new Map(habits.map((h) => [h.id, localizedHabit(translate, h)]));
  const items: AgendaItem[] = [];
  const seen = new Set<string>();

  for (const log of logs) {
    if (!log.done) continue;
    const habit = byId.get(log.habitId);
    if (!habit) continue; // habit was deleted; orphan-safe
    const key = `${log.habitId}:${log.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: `habit:${habit.id}:${log.date}`,
      title: `${habit.icon} ${habit.name}`,
      subtitle: tr('agenda.habit.done_on_day', 'feito neste dia'),
      href: '/habitos/',
      date: log.date,
      kind: 'habit',
      tone: 'done',
      status: 'done',
      habitId: habit.id,
      reminder: reminderLabel(habit.reminder)
    });
  }

  // Today's still-pending habits (only when today is inside the range) so
  // the calendar shows what's left to do without waiting for a log.
  const todayKey = localDateKey(new Date());
  if (todayKey >= sinceKey && todayKey <= untilKey) {
    for (const habit of byId.values()) {
      if (seen.has(`${habit.id}:${todayKey}`)) continue;
      // Só mostrar como pendente se HOJE for um dia agendado — hábitos de dias
      // específicos (ex.: ginásio 2ª/4ª/6ª) não aparecem como "por fazer" num
      // dia de descanso.
      if (!isScheduledOnKey(habit.cadence, todayKey)) continue;
      items.push({
        id: `habit:${habit.id}:${todayKey}`,
        title: `${habit.icon} ${habit.name}`,
        subtitle: reminderLabel(habit.reminder)
          ? tr('agenda.habit.reminder', 'lembrar: {reminder}', { reminder: reminderLabel(habit.reminder) ?? '' })
          : tr('agenda.habit.today', 'hábito de hoje'),
        href: '/habitos/',
        date: todayKey,
        kind: 'habit',
        tone: 'habit',
        status: 'pending',
        habitId: habit.id,
        reminder: reminderLabel(habit.reminder)
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Events (V8) — personal events / special dates / reminders
// ---------------------------------------------------------------------------

/** Input shape for `addEvent` — caller does not pass `id` or `createdAt`. */
export interface NewEventInput {
  date: string; // 'YYYY-MM-DD' local
  title: string;
  icon?: string;
  kind: EventKind;
  yearly?: boolean;
  notes?: string;
}

/** Create a calendar event and award the `event_add` XP. Returns the row id. */
export async function addEvent(input: NewEventInput): Promise<number> {
  const row: EventRow = {
    date: input.date,
    title: input.title.trim(),
    icon: input.icon || undefined,
    kind: input.kind,
    notes: input.notes?.trim() || undefined,
    yearly: input.yearly === true ? true : undefined,
    createdAt: Date.now()
  };
  const id = (await db().events.add(row)) as number;
  await awardXP('event_add');
  return id;
}

/** Delete a calendar event row (also removes every yearly repeat of it). */
export async function deleteEvent(id: number): Promise<void> {
  await db().events.delete(id);
}

function isValidDateKey(key: string): boolean {
  const d = new Date(`${key}T12:00:00`);
  return !Number.isNaN(d.getTime()) && localDateKey(d) === key;
}

function eventKindLabel(kind: EventKind): string {
  switch (kind) {
    case 'special': return tr('agenda.event.kind.special', 'data especial');
    case 'reminder': return tr('agenda.event.kind.reminder', 'lembrete');
    default: return tr('agenda.event.kind.event', 'evento');
  }
}

function eventFallbackIcon(kind: EventKind): string {
  switch (kind) {
    case 'special': return '💗';
    case 'reminder': return '⏰';
    default: return '📌';
  }
}

function eventToItem(row: EventRow & { id: number }, dateKey: string): AgendaItem {
  const icon = row.icon || eventFallbackIcon(row.kind);
  const yearlySuffix = row.yearly ? ` · ${tr('agenda.event.yearly', 'todos os anos')}` : '';
  return {
    id: `event:${row.id}:${dateKey}`,
    title: `${icon} ${row.title}`,
    subtitle: `${eventKindLabel(row.kind)}${yearlySuffix}`,
    href: '/calendario/',
    date: dateKey,
    kind: 'life',
    tone: 'life',
    eventId: row.id,
    eventKind: row.kind,
    yearly: row.yearly === true,
    icon
  };
}

/**
 * Every event that lands inside [sinceKey, untilKey], with yearly rows
 * expanded into each year the range touches (birthdays, anniversaries).
 * One table read — the events table is small (personal data).
 */
export async function loadEventsForRange(sinceKey: string, untilKey: string): Promise<AgendaItem[]> {
  const all = await db().events.toArray();
  const items: AgendaItem[] = [];
  const seen = new Set<string>();

  const yearFrom = Number(sinceKey.slice(0, 4));
  const yearTo = Number(untilKey.slice(0, 4));

  for (const row of all) {
    if (typeof row.id !== 'number') continue;
    const withId = row as EventRow & { id: number };
    const dates: string[] = [];
    if (row.date >= sinceKey && row.date <= untilKey) dates.push(row.date);
    if (row.yearly) {
      const monthDay = row.date.slice(5);
      for (let y = yearFrom; y <= yearTo; y++) {
        const candidate = `${y}-${monthDay}`;
        if (candidate === row.date) continue;
        if (candidate < sinceKey || candidate > untilKey) continue;
        if (!isValidDateKey(candidate)) continue; // e.g. 29 Feb in a non-leap year
        dates.push(candidate);
      }
    }
    for (const dateKey of dates) {
      const dedupe = `${row.id}:${dateKey}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      items.push(eventToItem(withId, dateKey));
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Finance layer — one informational item per day with movements
// ---------------------------------------------------------------------------

async function financeItemsForRange(sinceKey: string, untilKey: string): Promise<AgendaItem[]> {
  const rows = await db().transacoes
    .where('data')
    .between(sinceKey, untilKey, true, true)
    .toArray();

  const byDay = new Map<string, { count: number; net: number }>();
  for (const row of rows) {
    const bucket = byDay.get(row.data) ?? { count: 0, net: 0 };
    bucket.count += 1;
    bucket.net += row.tipo === 'receita' ? row.valor : -row.valor;
    byDay.set(row.data, bucket);
  }

  const items: AgendaItem[] = [];
  for (const [date, { count, net }] of byDay) {
    const countLabel = tr(
      count === 1 ? 'agenda.finance.day.one' : 'agenda.finance.day.other',
      count === 1 ? '{n} movimento' : '{n} movimentos',
      { n: count }
    );
    items.push({
      id: `finance:${date}`,
      title: `💶 ${countLabel}`,
      subtitle: tr('agenda.finance.net', 'saldo do dia: {value}', { value: formatValor(net) }),
      href: '/financas/transacoes/',
      date,
      kind: 'finance',
      tone: 'life'
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Mood overlay (read-only — the Humor sub-app owns the writes)
// ---------------------------------------------------------------------------

const MOOD_EMOJI: Record<string, string> = {
  sick: '🤒',
  sad: '🥺',
  love: '💗',
  happy: '😊',
  calm: '😌',
  tired: '😴',
  stressed: '😮‍💨',
  anxious: '🫨',
  proud: '🌟',
  grateful: '🥰'
};

/** Soft emoji for a mood kind; unknown kinds get a gentle thought bubble. */
export function moodEmoji(kind: string): string {
  return MOOD_EMOJI[kind] ?? '💭';
}

/**
 * Map of date → mood kind for the range (latest check-in of each day wins).
 * Used by the month view to draw a soft mood dot per day.
 */
export async function loadMoodsForRange(sinceKey: string, untilKey: string): Promise<Record<string, string>> {
  const rows = await db().mood_logs
    .where('date')
    .between(sinceKey, untilKey, true, true)
    .toArray();
  rows.sort((a, b) => a.startedAt - b.startedAt);
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (row.kind) out[row.date] = row.kind;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function sortAgendaItems(items: AgendaItem[]): AgendaItem[] {
  return items.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.tone === 'danger' && b.tone !== 'danger') return -1;
    if (b.tone === 'danger' && a.tone !== 'danger') return 1;
    // Pendentes antes de concluídos no mesmo dia — senão hábitos já feitos
    // (ordenados por título) podiam ocupar os poucos lugares visíveis do
    // cockpit "Hoje" e esconder o que ainda falta fazer.
    const aDone = a.status === 'done';
    const bDone = b.status === 'done';
    if (aDone !== bDone) return aDone ? 1 : -1;
    const loc = get(locale) || 'pt-PT';
    return a.title.localeCompare(b.title, loc);
  });
}

/**
 * Calendar-grade loader: everything that happens between `sinceKey` and
 * `untilKey` (inclusive local 'YYYY-MM-DD' keys).
 *
 * Habit LOGS are placed on their real dates via ONE `getAllLogsInRange`
 * read (instead of N `isLoggedToday` point reads); assignments land on
 * their deadlines; the events table and the finance layer are merged in.
 * Pass `layers` to skip sources you don't need.
 */
export async function loadAgendaItemsForRange(
  sinceKey: string,
  untilKey: string,
  layers?: Partial<AgendaLayers>
): Promise<AgendaItem[]> {
  const want: AgendaLayers = { habits: true, school: true, events: true, finance: true, ...layers };
  if (want.school) await ensureAssignmentsOnce();

  const [assignments, habits, logs, eventItems, financeItems] = await Promise.all([
    want.school ? listAssignments() : Promise.resolve([] as Assignment[]),
    want.habits ? listHabitos() : Promise.resolve([] as Habit[]),
    want.habits ? getAllLogsInRange(sinceKey, untilKey) : Promise.resolve([]),
    want.events ? loadEventsForRange(sinceKey, untilKey) : Promise.resolve([] as AgendaItem[]),
    want.finance ? financeItemsForRange(sinceKey, untilKey) : Promise.resolve([] as AgendaItem[])
  ]);

  const assignmentItems = assignments
    .map(assignmentToItem)
    .filter((item) => item.date >= sinceKey && item.date <= untilKey);
  const habitItems = habitItemsForRange(habits, logs, sinceKey, untilKey);

  return sortAgendaItems([...assignmentItems, ...habitItems, ...eventItems, ...financeItems]);
}

/**
 * Back-compat loader for the Home hub and /notificacoes:
 *   - EVERY assignment (including overdue ones — notifications need them)
 *   - today's habits (done + pending), via one batched range read
 *   - events for the next 30 days (so special dates surface in
 *     notifications and in the hub's "next" list)
 */
export async function loadAgendaItems(): Promise<AgendaItem[]> {
  await ensureAssignmentsOnce();
  const todayKey = localDateKey(new Date());
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 30);
  const horizonKey = localDateKey(horizon);

  const [assignments, habits, logs, eventItems] = await Promise.all([
    listAssignments(),
    listHabitos(),
    getAllLogsInRange(todayKey, todayKey),
    loadEventsForRange(todayKey, horizonKey)
  ]);

  const assignmentItems = assignments.map(assignmentToItem);
  const doneToday = new Set(logs.filter((l) => l.done).map((l) => l.habitId));
  const translate = get(t);
  const habitItems: AgendaItem[] = habits
    // Hábitos de dias específicos só entram na agenda de hoje se hoje for um
    // dia agendado (ou se já foram feitos hoje — aí mostra-se o ✓).
    .filter((raw) => isScheduledOnKey(raw.cadence, todayKey) || doneToday.has(raw.id))
    .map((raw) => {
    const habit = localizedHabit(translate, raw);
    const done = doneToday.has(habit.id);
    return {
      id: `habit:${habit.id}`,
      title: `${habit.icon} ${habit.name}`,
      subtitle: done
        ? tr('agenda.habit.done_today', 'feito hoje')
        : (reminderLabel(habit.reminder)
          ? tr('agenda.habit.reminder', 'lembrar: {reminder}', { reminder: reminderLabel(habit.reminder) ?? '' })
          : tr('agenda.habit.today', 'hábito de hoje')),
      href: '/habitos/',
      date: todayKey,
      kind: 'habit',
      tone: done ? 'done' : 'habit',
      status: done ? 'done' : 'pending',
      habitId: habit.id,
      reminder: reminderLabel(habit.reminder)
    };
  });

  return sortAgendaItems([...assignmentItems, ...habitItems, ...eventItems]);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Load the non-agenda notification sources (budget status + daily
 * quests) in ONE place, with catch-fallbacks so a broken source never
 * blanks the inbox.
 *
 * NOTE: getDailyQuests() pays any due quest XP idempotently — share the
 * result of a SINGLE call per refresh; never call it in a loop or on an
 * interval.
 */
/** Pending friend/couple requests for the inbox (account sessions only). */
async function loadSocialRequests(): Promise<SocialRequestNotif[]> {
  try {
    const { getSession, isLegacyProfile } = await import('$lib/auth/session');
    const me = getSession()?.profile;
    if (!me || isLegacyProfile(me)) return [];
    const { isMultiplayerConfigured } = await import('$lib/multiplayer/config');
    if (!isMultiplayerConfigured()) return [];
    const [{ listIncoming }, { listSpaces, pendingCoupleInvites, otherMember }] = await Promise.all([
      import('$lib/account/contacts'),
      import('$lib/account/spaces')
    ]);
    const out: SocialRequestNotif[] = [];
    for (const c of await listIncoming().catch(() => [])) {
      out.push({
        id: `social:conn:${c.connectionId}`,
        kind: c.wantsCouple ? 'couple' : 'friend',
        name: c.display_name || `@${c.handle}`,
        href: c.wantsCouple ? `/casal/pedido/?conn=${c.connectionId}` : '/contactos/'
      });
    }
    const spaces = await listSpaces().catch(() => [] as Awaited<ReturnType<typeof listSpaces>>);
    for (const s of pendingCoupleInvites(spaces, me)) {
      const other = otherMember(s, me);
      out.push({
        id: `social:space:${s.id}`,
        kind: 'couple',
        name: other?.display_name || (other ? `@${other.handle}` : '💞'),
        href: `/casal/pedido/?space=${s.id}`
      });
    }
    return out;
  } catch {
    return []; // signed-out / offline — the inbox simply has no social rows
  }
}

/** Pings recentes (48h) do parceiro + mensagens por ler (couple + DMs),
 *  medidos contra os cursores de leitura locais dos chats. */
async function loadCoupleActivity(): Promise<CoupleActivityNotif[]> {
  try {
    const { getSession, isLegacyProfile } = await import('$lib/auth/session');
    const me = getSession()?.profile;
    if (!me || isLegacyProfile(me)) return [];
    const { isMultiplayerConfigured } = await import('$lib/multiplayer/config');
    if (!isMultiplayerConfigured()) return [];
    const [{ getSupabaseClient }, { listContacts }, { listSpaces, singleActiveCouple, otherMember }, { dmConversationId }] =
      await Promise.all([
        import('$lib/multiplayer/client'),
        import('$lib/account/contacts'),
        import('$lib/account/spaces'),
        import('$lib/chat/dm-id')
      ]);
    const sb = getSupabaseClient();
    const out: CoupleActivityNotif[] = [];

    const spaces = await listSpaces().catch(() => [] as Awaited<ReturnType<typeof listSpaces>>);
    const active = singleActiveCouple(spaces);
    const partner = active ? otherMember(active, me) : null;
    const partnerName = partner?.display_name || (partner ? `@${partner.handle}` : '');

    const cursor = (key: string): number => {
      try {
        return Number(localStorage.getItem(key)) || 0;
      } catch {
        return 0;
      }
    };

    // Pings do parceiro nas últimas 48h — id inclui a row mais recente, para
    // um ping novo voltar a contar como "por ler" no inbox.
    if (active && partner) {
      const since = new Date(Date.now() - 48 * 3600_000).toISOString();
      const { data } = await sb
        .from('couple_pings')
        .select('id, kind, created_at')
        .eq('couple_id', active.id)
        .eq('sender', partner.id)
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);
      const rows = (data ?? []) as { id: string; kind: 'love' | 'nudge' }[];
      for (const kind of ['love', 'nudge'] as const) {
        const ofKind = rows.filter((r) => r.kind === kind);
        if (!ofKind.length) continue;
        out.push({
          id: `ping:${kind}:${ofKind[0].id}`,
          kind: kind === 'love' ? 'ping-love' : 'ping-nudge',
          name: partnerName,
          count: ofKind.length,
          href: '/mensagens/'
        });
      }
    }

    // Mensagens por ler (couple 'main' + DMs), numa só query consolidada.
    const contacts = (await listContacts().catch(() => [])).filter((c) => c.id !== partner?.id).slice(0, 15);
    const threads: { key: string; couple: boolean; name: string; href: string; cursorKey: string }[] = [];
    if (active && partner) {
      threads.push({
        key: active.id,
        couple: true,
        name: partnerName,
        href: '/mensagens/',
        cursorKey: 'presuntinho-couple-chat-read-main'
      });
    }
    for (const c of contacts) {
      threads.push({
        key: dmConversationId(me, c.id),
        couple: false,
        name: c.display_name || `@${c.handle}`,
        href: `/mensagens/?dm=${c.handle}`,
        cursorKey: `presuntinho-dm-read-${dmConversationId(me, c.id)}`
      });
    }
    if (threads.length) {
      const since = new Date(Date.now() - 72 * 3600_000).toISOString();
      const { data } = await sb
        .from('couple_messages')
        .select('couple_id, conversation_id, sender, created_at')
        .in('couple_id', threads.map((t) => t.key))
        .neq('sender', me)
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(300);
      const rows = (data ?? []) as { couple_id: string; conversation_id: string; sender: string; created_at: string }[];
      for (const t of threads) {
        const cur = cursor(t.cursorKey);
        const unread = rows.filter(
          (r) =>
            r.couple_id === t.key &&
            (!t.couple || r.conversation_id === 'main') &&
            new Date(r.created_at).getTime() > cur
        );
        if (!unread.length) continue;
        out.push({
          id: `msgs:${t.key}:${new Date(unread[0].created_at).getTime()}`,
          kind: 'messages',
          name: t.name,
          count: unread.length,
          href: t.href
        });
      }
    }
    return out;
  } catch {
    return []; // signed-out / offline — inbox sem atividade de casal
  }
}

export async function loadNotificationExtras(): Promise<NotificationExtras> {
  const [orcamentos, quests, social, coupleActivity] = await Promise.all([
    getOrcamentoStatus(getMesAtual()).catch((err) => {
      console.warn('[agenda] budget status unavailable (non-fatal)', err);
      return [] as OrcamentoStatus[];
    }),
    getDailyQuests().catch((err) => {
      console.warn('[agenda] daily quests unavailable (non-fatal)', err);
      return undefined;
    }),
    loadSocialRequests(),
    loadCoupleActivity()
  ]);
  return { orcamentos, quests, social, coupleActivity };
}

export function buildNotifications(items: AgendaItem[], extras: NotificationExtras = {}): NotificationItem[] {
  const today = localDateKey(new Date());
  const todayDate = new Date(`${today}T00:00:00`).getTime();
  const pendingAssignments = items.filter((i) => i.kind === 'assignment' && i.status !== 'submitted' && i.status !== 'graded');
  const overdue = pendingAssignments.filter((i) => new Date(`${i.date}T00:00:00`).getTime() < todayDate);
  const urgent = pendingAssignments.filter((i) => {
    const delta = Math.round((new Date(`${i.date}T00:00:00`).getTime() - todayDate) / DAY_MS);
    return delta >= 0 && delta <= 7;
  });
  const todayHabits = items.filter((i) => i.kind === 'habit' && i.date === today && i.status !== 'done');
  const earliestDate = (list: AgendaItem[]): string | undefined =>
    list.length > 0 ? list.reduce((min, i) => (i.date < min ? i.date : min), list[0].date) : undefined;

  const notifications: NotificationItem[] = [];

  // Coração primeiro: pings do parceiro e mensagens por ler.
  for (const a of extras.coupleActivity ?? []) {
    const title =
      a.kind === 'ping-love'
        ? a.count > 1
          ? tr('agenda.notifications.ping.love_many', '💛 {name} mandou-te amor ×{n}', { name: a.name, n: a.count })
          : tr('agenda.notifications.ping.love', '💛 {name} mandou-te amor', { name: a.name })
        : a.kind === 'ping-nudge'
          ? a.count > 1
            ? tr('agenda.notifications.ping.nudge_many', '👀 {name} teve saudades tuas ×{n}', { name: a.name, n: a.count })
            : tr('agenda.notifications.ping.nudge', '👀 {name} teve saudades tuas', { name: a.name })
          : a.count > 1
            ? tr('agenda.notifications.msgs.many', '💬 {n} mensagens novas de {name}', { name: a.name, n: a.count })
            : tr('agenda.notifications.msgs.one', '💬 Mensagem nova de {name}', { name: a.name });
    notifications.push({
      id: a.id,
      title,
      body:
        a.kind === 'messages'
          ? tr('agenda.notifications.msgs.body', 'Toca para abrir a conversa.')
          : tr('agenda.notifications.ping.body', 'Do coração para o teu ecrã. 💌'),
      href: a.href,
      tone: 'life',
      priority: 1,
      type: 'love',
      icon: a.kind === 'ping-love' ? '💛' : a.kind === 'ping-nudge' ? '👀' : '💬',
      date: today,
      section: 'today'
    });
  }

  // People first: pending friend/couple requests answer in one tap.
  for (const s of extras.social ?? []) {
    notifications.push({
      id: s.id,
      title:
        s.kind === 'couple'
          ? tr('agenda.notifications.social.couple_title', '{name} quer ser teu casal! 💞', { name: s.name })
          : tr('agenda.notifications.social.friend_title', '{name} quer ligar-se contigo', { name: s.name }),
      body:
        s.kind === 'couple'
          ? tr('agenda.notifications.social.couple_body', 'Toca para responder ao pedido.')
          : tr('agenda.notifications.social.friend_body', 'Toca para aceitar em Contactos.'),
      href: s.href,
      tone: 'life',
      priority: 1,
      type: 'love',
      icon: s.kind === 'couple' ? '💞' : '👋',
      date: today,
      section: 'today'
    });
  }

  if (overdue.length > 0) {
    notifications.push({
      id: 'overdue-assignments',
      title: tr(
        overdue.length === 1 ? 'agenda.notifications.overdue.one' : 'agenda.notifications.overdue.other',
        overdue.length === 1 ? '{n} prazo em atraso' : '{n} prazos em atraso',
        { n: overdue.length }
      ),
      body: tr('agenda.notifications.overdue.body', 'Começa por limpar os trabalhos que já passaram do prazo.'),
      href: '/escola/trabalhos/',
      tone: 'danger',
      priority: 1,
      type: 'deadline',
      icon: '⏳',
      date: earliestDate(overdue),
      section: 'today'
    });
  }
  if (urgent.length > 0) {
    notifications.push({
      id: 'urgent-assignments',
      title: tr(
        urgent.length === 1 ? 'agenda.notifications.urgent.one' : 'agenda.notifications.urgent.other',
        urgent.length === 1 ? '{n} entrega nos próximos 7 dias' : '{n} entregas nos próximos 7 dias',
        { n: urgent.length }
      ),
      body: tr('agenda.notifications.urgent.body', 'Toca para ver a lista de trabalhos por prioridade.'),
      href: '/escola/trabalhos/',
      tone: 'warning',
      priority: 2,
      type: 'deadline',
      icon: '📝',
      date: earliestDate(urgent),
      section: 'week'
    });
  }

  // Budget warnings — top 3 categories that crossed their thresholds
  // this month (getOrcamentoStatus already sorts by percent desc).
  const budgets = (extras.orcamentos ?? []).filter((b) => b.status !== 'ok').slice(0, 3);
  for (const b of budgets) {
    const over = b.status === 'over';
    const percent = Math.round(b.percent);
    notifications.push({
      id: `budget:${b.categoria.id}`,
      title: over
        ? tr('agenda.notifications.budget.over.title', 'Orçamento de {categoria} ultrapassado', { categoria: b.categoria.nome })
        : tr('agenda.notifications.budget.warn.title', 'Orçamento de {categoria} quase no limite', { categoria: b.categoria.nome }),
      body: over
        ? tr('agenda.notifications.budget.over.body', 'Já vai em {percent}% do limite deste mês — vê onde podes aliviar.', { percent })
        : tr('agenda.notifications.budget.warn.body', 'Vai em {percent}% — ainda restam {restante}.', {
            percent,
            restante: formatValor(Math.max(0, b.restante))
          }),
      href: '/financas/orcamento/',
      tone: over ? 'danger' : 'warning',
      priority: over ? 1 : 2,
      type: 'budget',
      icon: b.categoria.icone || '📊',
      date: today,
      section: 'today'
    });
  }

  if (todayHabits.length > 0) {
    notifications.push({
      id: 'today-habits',
      title: tr(
        todayHabits.length === 1 ? 'agenda.notifications.habits.one' : 'agenda.notifications.habits.other',
        todayHabits.length === 1 ? '{n} hábito por fechar hoje' : '{n} hábitos por fechar hoje',
        { n: todayHabits.length }
      ),
      body: tr('agenda.notifications.habits.body', 'Mantém a streak viva antes do fim do dia.'),
      href: '/habitos/',
      tone: 'habit',
      priority: 3,
      type: 'habit',
      icon: '✅',
      date: today,
      section: 'today'
    });
  }

  // Daily quests still pending — one gentle nudge back to the hub card.
  const pendingQuests = extras.quests ? extras.quests.quests.filter((q) => !q.done).length : 0;
  if (pendingQuests > 0) {
    notifications.push({
      id: 'daily-quests',
      title: tr(
        pendingQuests === 1 ? 'agenda.notifications.quests.one' : 'agenda.notifications.quests.other',
        pendingQuests === 1 ? 'Falta {n} missão diária' : 'Faltam {n} missões diárias',
        { n: pendingQuests }
      ),
      body: tr('agenda.notifications.quests.body', 'Pequenas vitórias, XP garantido.'),
      href: '/',
      tone: 'habit',
      priority: 3,
      type: 'quest',
      icon: '🎯',
      date: today,
      section: 'today'
    });
  }

  // Structured habit reminders — one line per habit that set a reminder
  // label and is still pending today ("20:00", "ao pequeno-almoço", ...).
  for (const habit of todayHabits) {
    if (!habit.reminder || typeof habit.habitId !== 'number') continue;
    notifications.push({
      id: `habit-reminder:${habit.habitId}`,
      title: habit.title,
      body: tr('agenda.notifications.reminder.body', 'Lembrete: {reminder}', { reminder: reminderLabel(habit.reminder) ?? '' }),
      href: '/habitos/',
      tone: 'habit',
      priority: 4,
      type: 'habit',
      icon: '⏰',
      date: today,
      section: 'today'
    });
  }

  // Upcoming special dates (next 14 days) — a little romance in the inbox.
  // A special that lands TODAY becomes a love note pointing to /memorias/.
  const specials = items
    .filter((i) => i.kind === 'life' && i.eventKind === 'special' && i.date >= today)
    .filter((i) => {
      const delta = Math.round((new Date(`${i.date}T00:00:00`).getTime() - todayDate) / DAY_MS);
      return delta >= 0 && delta <= 14;
    });
  for (const special of specials) {
    const delta = Math.round((new Date(`${special.date}T00:00:00`).getTime() - todayDate) / DAY_MS);
    const isToday = delta === 0;
    // eventToItem prefixes the icon into the title; the inbox row shows
    // the icon separately, so strip the duplicate prefix when present.
    const cleanTitle = special.icon && special.title.startsWith(`${special.icon} `)
      ? special.title.slice(special.icon.length + 1)
      : special.title;
    const body = isToday
      ? tr('agenda.notifications.love.body', 'É hoje! Guarda este momento nas memórias. 💖')
      : delta === 1
        ? tr('agenda.notifications.special.tomorrow', 'É amanhã — prepara algo bonito.')
        : tr('agenda.notifications.special.days', 'Faltam {n} dias.', { n: delta });
    notifications.push({
      id: `special:${special.id}`,
      title: cleanTitle,
      body,
      href: isToday ? '/memorias/' : '/calendario/',
      tone: 'life',
      priority: isToday ? 2 : 5,
      type: isToday ? 'love' : 'special',
      icon: isToday ? '💌' : (special.icon || '💗'),
      date: special.date,
      section: isToday ? 'today' : 'week'
    });
  }

  // No all-clear sentinel anymore — an empty inbox IS the good news
  // (the /notificacoes page renders its own gentle empty state).
  return notifications.sort((a, b) => a.priority - b.priority);
}
