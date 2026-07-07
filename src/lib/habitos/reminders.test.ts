import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The reminder logic pulls habits + "done today" from habitos.ts; stub that
// module so we can unit-test the pure scheduling decision (time window,
// cadence day, reminder day-subset, done-today gate) without IndexedDB.
const state = {
  habits: [] as any[],
  doneToday: new Set<number>()
};

vi.mock('$lib/habitos', () => ({
  parseReminder: (raw: any) => {
    if (!raw) return null;
    if (typeof raw === 'object' && typeof raw.time === 'string') {
      return { time: raw.time.padStart(5, '0'), days: raw.days };
    }
    if (typeof raw === 'string' && /^\d{1,2}:\d{2}$/.test(raw)) return { time: raw.padStart(5, '0') };
    return null;
  },
  isScheduledOn: (cadence: any, d: Date) => {
    if (cadence === 'daily' || cadence === 'weekly') return true;
    if (cadence && Array.isArray(cadence.days)) return cadence.days.includes(d.getDay());
    return true;
  },
  isLoggedToday: async (id: number) => state.doneToday.has(id),
  listActiveHabitos: async () => state.habits
}));

import { dueHabitReminders } from './reminders';

function habit(over: Partial<any> = {}) {
  return { id: 1, name: 'Água', icon: '💧', color: '#3b82f6', cadence: 'daily', createdAt: 0, reminder: { time: '20:00' }, ...over };
}

describe('dueHabitReminders', () => {
  beforeEach(() => {
    state.habits = [];
    state.doneToday = new Set();
  });
  afterEach(() => vi.restoreAllMocks());

  it('is due when now is at/just past the reminder time and not done', async () => {
    state.habits = [habit({ reminder: { time: '20:00' } })];
    const now = new Date(2026, 0, 5, 20, 5); // 20:05
    const due = await dueHabitReminders(now);
    expect(due.map((d) => d.habit.id)).toEqual([1]);
  });

  it('is NOT due before the reminder time', async () => {
    state.habits = [habit({ reminder: { time: '20:00' } })];
    const now = new Date(2026, 0, 5, 19, 59);
    expect(await dueHabitReminders(now)).toHaveLength(0);
  });

  it('is NOT due past the grace window', async () => {
    state.habits = [habit({ reminder: { time: '20:00' } })];
    const now = new Date(2026, 0, 5, 22, 0); // 120min later, grace is 90
    expect(await dueHabitReminders(now)).toHaveLength(0);
  });

  it('is NOT due once logged today', async () => {
    state.habits = [habit({ reminder: { time: '20:00' } })];
    state.doneToday = new Set([1]);
    const now = new Date(2026, 0, 5, 20, 5);
    expect(await dueHabitReminders(now)).toHaveLength(0);
  });

  it("respects the reminder's own day-subset", async () => {
    // 2026-01-05 is a Monday (getDay 1). Reminder only on Tue/Thu (2,4).
    state.habits = [habit({ reminder: { time: '20:00', days: [2, 4] } })];
    const monday = new Date(2026, 0, 5, 20, 5);
    expect(await dueHabitReminders(monday)).toHaveLength(0);
    const tuesday = new Date(2026, 0, 6, 20, 5);
    expect(await dueHabitReminders(tuesday)).toHaveLength(1);
  });

  it('skips habits without a reminder', async () => {
    state.habits = [habit({ reminder: undefined })];
    const now = new Date(2026, 0, 5, 20, 5);
    expect(await dueHabitReminders(now)).toHaveLength(0);
  });
});
