// Gamification — daily quest engine (V8, Duolingo-inspired loop).
//
// Every day, 3 quests are picked DETERMINISTICALLY from a pool (seeded
// by the LOCAL date string, so a reload / re-render always shows the
// same 3). Completion is verified against REAL Dexie data — there is
// no "mark quest done" button anywhere; doing the actual activity in
// the app is what completes the quest.
//
// XP payout rules:
//   * quest transitions to done  → awardXP('quest_daily_complete') once
//     per quest per day
//   * all 3 done                 → awardXP('quest_all_daily') once per day
//   * bookkeeping lives in the state row's non-indexed `questsPaid`
//     field ({date, ids[]}) so refreshes / new tabs never re-award.
//
// SSR safety: browser-only (Dexie). Call from onMount.

import { db } from '$lib/state/db';
import { awardXP, XP_TABLE } from '$lib/state/xp-actions';
import { localDateKey, readStateV8, updateStateV8 } from './streak';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyQuest {
  id: string;
  icon: string;
  titleKey: string;
  done: boolean;
  href: string;
}

export interface DailyQuestsResult {
  /** Today's 3 quests, in display order, with live `done` flags. */
  quests: DailyQuest[];
  /** True when every quest is done. */
  allDone: boolean;
  /** Quest ids whose +10 XP was paid during THIS call. */
  newlyCompleted: string[];
  /** True when the 3/3 +20 XP bonus was paid during THIS call. */
  allJustCompleted: boolean;
}

/** Sentinel id stored in questsPaid.ids once the 3/3 bonus is paid. */
export const ALL_BONUS_ID = '__all__';

// ---------------------------------------------------------------------------
// Quest pool — each entry checks REAL data via the shared TodayContext
// ---------------------------------------------------------------------------

interface TodayContext {
  habitLoggedToday: boolean;
  transacaoToday: boolean;
  moodCheckinToday: boolean;
  newLessonToday: boolean;
  quizToday: boolean;
  noteToday: boolean;
  eventAddedToday: boolean;
}

interface QuestDef {
  id: string;
  icon: string;
  titleKey: string;
  href: string;
  check: (ctx: TodayContext) => boolean;
}

const QUEST_POOL: QuestDef[] = [
  {
    id: 'log_habit',
    icon: '🌱',
    titleKey: 'components.quests.pool.log_habit.title',
    href: '/habitos',
    check: (ctx) => ctx.habitLoggedToday
  },
  {
    id: 'add_transaction',
    icon: '💶',
    titleKey: 'components.quests.pool.add_transaction.title',
    href: '/financas/nova',
    check: (ctx) => ctx.transacaoToday
  },
  {
    id: 'mood_checkin',
    icon: '💗',
    titleKey: 'components.quests.pool.mood_checkin.title',
    href: '/vida',
    check: (ctx) => ctx.moodCheckinToday
  },
  {
    id: 'new_lesson',
    icon: '📖',
    titleKey: 'components.quests.pool.new_lesson.title',
    href: '/escola',
    check: (ctx) => ctx.newLessonToday
  },
  {
    id: 'quiz_answer',
    icon: '🧠',
    titleKey: 'components.quests.pool.quiz_answer.title',
    href: '/escola',
    check: (ctx) => ctx.quizToday
  },
  {
    id: 'add_note',
    icon: '📝',
    titleKey: 'components.quests.pool.add_note.title',
    href: '/escola/caderno',
    check: (ctx) => ctx.noteToday
  },
  {
    id: 'add_event',
    icon: '📅',
    titleKey: 'components.quests.pool.add_event.title',
    href: '/calendario',
    check: (ctx) => ctx.eventAddedToday
  }
];

/**
 * pt-PT fallback titles for each quest — used as $t()'s `default` so
 * the card never renders a raw key if a locale entry is missing.
 */
export const QUEST_TITLE_FALLBACKS: Record<string, string> = {
  log_habit: 'Marca um hábito como feito',
  add_transaction: 'Regista uma transação',
  mood_checkin: 'Faz o check-in de humor',
  new_lesson: 'Abre uma lição nova',
  quiz_answer: 'Responde a um quiz',
  add_note: 'Escreve uma nota no caderno',
  add_event: 'Adiciona um evento ao calendário'
};

// ---------------------------------------------------------------------------
// Deterministic per-day selection
// ---------------------------------------------------------------------------

/** FNV-1a hash of a string → 32-bit unsigned seed. */
function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Tiny deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick today's 3 quest ids — a seeded Fisher–Yates shuffle of the pool,
 * take the first 3. Pure function of the date key, so every caller
 * (and every reload) agrees on the day's quests.
 */
export function pickQuestIdsForDay(dateKey: string): string[] {
  const rand = mulberry32(seedFromString(dateKey));
  const ids = QUEST_POOL.map((q) => q.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Today-context loader (one read per source table)
// ---------------------------------------------------------------------------

async function loadTodayContext(todayKey: string): Promise<TodayContext> {
  const d = db();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const [habitCount, transCount, moodCount, noteCount, visitedRows, quizRows, eventRows] =
    await Promise.all([
      d.habit_logs.where('date').equals(todayKey).count(),
      d.transacoes.where('data').equals(todayKey).count(),
      d.mood_logs.where('date').equals(todayKey).count().catch(() => 0),
      d.notes.where('createdAt').aboveOrEqual(startOfDay).count(),
      d.visited.toArray(),
      d.quizScores.toArray(),
      d.events.toArray().catch(() => [])
    ]);

  return {
    habitLoggedToday: habitCount > 0,
    transacaoToday: transCount > 0,
    moodCheckinToday: moodCount > 0,
    noteToday: noteCount > 0,
    // visited rows only record the FIRST visit ever, so this quest is
    // specifically "open a NEW lesson" (titled accordingly in i18n).
    newLessonToday: visitedRows.some(
      (v) => typeof v.id === 'string' && v.id.startsWith('lesson:') && v.visitedAt >= startOfDay
    ),
    quizToday: quizRows.some((q) => typeof q.updatedAt === 'number' && q.updatedAt >= startOfDay),
    eventAddedToday: eventRows.some((e) => typeof e.createdAt === 'number' && e.createdAt >= startOfDay)
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Concurrent-call guard: the hub card refreshes on several window
// events that can land in the same tick; sharing one in-flight promise
// prevents duplicate reads AND duplicate payout races.
let inflight: Promise<DailyQuestsResult> | null = null;

/**
 * Resolve today's 3 quests + their done states, paying out any XP that
 * became due since the last call (idempotent per quest per day via the
 * state row's `questsPaid` bookkeeping).
 */
export function getDailyQuests(): Promise<DailyQuestsResult> {
  if (!inflight) {
    inflight = resolveDailyQuests().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function resolveDailyQuests(): Promise<DailyQuestsResult> {
  const todayKey = localDateKey(new Date());
  const todaysIds = pickQuestIdsForDay(todayKey);
  const ctx = await loadTodayContext(todayKey);

  const quests: DailyQuest[] = todaysIds
    .map((id) => QUEST_POOL.find((q) => q.id === id))
    .filter((q): q is QuestDef => Boolean(q))
    .map((q) => ({
      id: q.id,
      icon: q.icon,
      titleKey: q.titleKey,
      href: q.href,
      done: q.check(ctx)
    }));

  const allDone = quests.length > 0 && quests.every((q) => q.done);

  // --- payout bookkeeping -------------------------------------------------
  const newlyCompleted: string[] = [];
  let allJustCompleted = false;

  try {
    const state = await readStateV8();
    const paid: string[] =
      state?.questsPaid && state.questsPaid.date === todayKey ? [...state.questsPaid.ids] : [];

    for (const q of quests) {
      if (q.done && !paid.includes(q.id)) {
        newlyCompleted.push(q.id);
        paid.push(q.id);
      }
    }
    if (allDone && !paid.includes(ALL_BONUS_ID)) {
      allJustCompleted = true;
      paid.push(ALL_BONUS_ID);
    }

    if (newlyCompleted.length > 0 || allJustCompleted) {
      // Persist FIRST so a re-entrant call (xp-changed listeners firing
      // getDailyQuests again) sees the ids as already paid.
      await updateStateV8({ questsPaid: { date: todayKey, ids: paid } });

      if (newlyCompleted.length > 0) {
        // awardXP debounces the SAME reason within 50ms, so paying two
        // quests with two back-to-back calls would silently drop one.
        // Pay once with the combined amount instead (same reason, same
        // event stream, correct total).
        const per = XP_TABLE['quest_daily_complete'] ?? 0;
        await awardXP('quest_daily_complete', per * newlyCompleted.length);
      }
      if (allJustCompleted) {
        await awardXP('quest_all_daily');
      }
    }
  } catch (err) {
    // Payout must never break the read path — the card still renders.
    console.warn('[gamification] quest payout failed (non-fatal):', err);
  }

  return { quests, allDone, newlyCompleted, allJustCompleted };
}
