import { listHabitos, isLoggedToday, type Habit } from '../habitos';
import { ensureAssignmentDefaults, listAssignments, type Assignment } from '../trabalhos';
import { get } from 'svelte/store';
import { t } from 'svelte-i18n';

export type AgendaItemKind = 'assignment' | 'habit' | 'life';
export type AgendaItemTone = 'danger' | 'warning' | 'school' | 'habit' | 'life' | 'done';

export interface AgendaItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  date: string;
  kind: AgendaItemKind;
  tone: AgendaItemTone;
  status?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  href: string;
  tone: AgendaItemTone;
  priority: number;
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

export async function loadAgendaItems(): Promise<AgendaItem[]> {
  await ensureAssignmentDefaults();
  const [assignments, habits] = await Promise.all([listAssignments(), listHabitos()]);
  const todayKey = localDateKey(new Date());

  const assignmentItems: AgendaItem[] = assignments.map((a) => ({
    id: `assignment:${a.id}`,
    title: a.title,
    subtitle: `${a.cadeira ? `${a.cadeira} · ` : ''}${assignmentStatusLabel(a.status)}`,
    href: `/trabalhos/assignment/${a.id}/`,
    date: localDateKey(new Date(a.deadline)),
    kind: 'assignment',
    tone: assignmentTone(a),
    status: a.status
  }));

  const habitStates = await Promise.all(
    habits.map(async (h: Habit) => ({ habit: h, done: await isLoggedToday(h.id) }))
  );
  const habitItems: AgendaItem[] = habitStates.map(({ habit, done }) => ({
    id: `habit:${habit.id}`,
    title: `${habit.icon} ${habit.name}`,
    subtitle: done
      ? tr('agenda.habit.done_today', 'feito hoje')
      : (habit.reminder
        ? tr('agenda.habit.reminder', 'lembrar: {reminder}', { reminder: habit.reminder })
        : tr('agenda.habit.today', 'hábito de hoje')),
    href: '/habitos/',
    date: todayKey,
    kind: 'habit',
    tone: done ? 'done' : 'habit',
    status: done ? 'done' : 'pending'
  }));

  return [...assignmentItems, ...habitItems].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.tone === 'danger' && b.tone !== 'danger') return -1;
    if (b.tone === 'danger' && a.tone !== 'danger') return 1;
    const loc = typeof localStorage === 'undefined' ? 'pt-PT' : localStorage.getItem('fat-pref-lang') || 'pt-PT';
    return a.title.localeCompare(b.title, loc);
  });
}

export function buildNotifications(items: AgendaItem[]): NotificationItem[] {
  const today = localDateKey(new Date());
  const todayDate = new Date(`${today}T00:00:00`).getTime();
  const pendingAssignments = items.filter((i) => i.kind === 'assignment' && i.status !== 'submitted' && i.status !== 'graded');
  const overdue = pendingAssignments.filter((i) => new Date(`${i.date}T00:00:00`).getTime() < todayDate);
  const urgent = pendingAssignments.filter((i) => {
    const delta = Math.round((new Date(`${i.date}T00:00:00`).getTime() - todayDate) / DAY_MS);
    return delta >= 0 && delta <= 7;
  });
  const todayHabits = items.filter((i) => i.kind === 'habit' && i.status !== 'done');

  const notifications: NotificationItem[] = [];
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
      priority: 1
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
      priority: 2
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
      priority: 3
    });
  }
  if (notifications.length === 0) {
    notifications.push({
      id: 'all-clear',
      title: tr('agenda.notifications.clear.title', 'Nada urgente agora'),
      body: tr('agenda.notifications.clear.body', 'A Home está limpa. Bom momento para planear a semana.'),
      href: '/',
      tone: 'done',
      priority: 9
    });
  }
  return notifications.sort((a, b) => a.priority - b.priority);
}
