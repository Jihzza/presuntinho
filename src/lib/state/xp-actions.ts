// XP actions — central table for XP rewards + helper to award them.
//
// M0-S2: Daniel's P2 was "XP doesn't go up when I click buttons in sub-apps".
// Root cause: addXP() was only called from easterEggs.ts. No sub-app
// (Finanças, Hábitos, Biblioteca, Trabalhos, Escola) ever called addXP.
//
// This module provides:
//   - XP_TABLE: every auditable XP reward, keyed by reason string
//   - awardXP(reason, amount?): the single entry point sub-apps call
//   - onXpChanged(handler): subscribe to XP changes (XPPill uses this)
//
// Design notes:
//   * XP_TABLE is the single source of truth. Sub-apps NEVER call addXP()
//     directly — they call awardXP('reason'). This means changing a reward
//     (e.g. +3 → +5 for a great habit streak) is a one-line edit.
//   * awardXP is idempotent at the REASON level — debounced within the same
//     tick to avoid double-fires from race conditions. It is NOT idempotent
//     at the value level; calling awardXP twice awards twice (that's
//     intentional — e.g. logging 2 habits at once = +8 XP).
//   * If `reason` is unknown, we log a warning and no-op. This catches
//     typos at runtime in dev without breaking prod.
//   * awardXP fires a 'presuntinho:xp-changed' window event so other
//     components (XpPill, XpToast, dashboard, badge grids) can react.
//     Event detail shape:
//       { reason, amount, delta, total, source }
//     - reason  : XP_TABLE key (e.g. 'habito_mark_done'). Internal use.
//     - amount  : signed delta applied (back-compat field name).
//     - delta   : alias of `amount`, kept for forward-compat with consumers
//                 that follow the spec contract `{delta, total, source}`.
//     - total   : xp store snapshot AFTER the award.
//     - source  : same value as `reason` for external consumers.

import { get } from 'svelte/store';
import { addXP, xp } from './stores';

export const XP_CHANGED_EVENT = 'presuntinho:xp-changed';

/**
 * Single source of truth for XP rewards.
 *
 * Keys are namespaced by domain so it's obvious where each reward fires:
 *   transacao_*   — Finanças transactions
 *   orcamento_*   — Finanças budgets
 *   habito_*      — Hábitos (incl. streak_* milestones)
 *   quiz_*        — Escola quizzes
 *   assignment_*  — Trabalhos status changes
 *   biblioteca_*  — Biblioteca bookmarks
 *   lesson_*      — Escola lessons
 *   easteregg_*   — Easter eggs (replaces direct addXP calls in easterEggs.ts)
 */
export const XP_TABLE: Readonly<Record<string, number>> = Object.freeze({
  // Finanças
   transacao_add_despesa: 3,
   transacao_add_receita: 3,
   transacao_edit: 1,
   // 0 (era -1): apagar uma transação é limpeza legítima e não deve custar XP
   // (não há undo — penalizar seria um dark pattern).
   transacao_delete: 0,
   orcamento_define: 5,
   orcamento_remove: 0,
   // task-038 — first dashboard visit of the day (idempotent per day).
   financas_dashboard_first_view: 2,
   // task-038 — user defined a monthly budget cap and stayed under it
   // at end-of-month evaluation.  Bonus is paid once per category per
   // month; awarded only when saldo >= 0 for that month's spend.
   financas_orcamento_meta_batida: 50,

  // Hábitos
  habito_create: 5,
  habito_edit: 1,
  // task-040 (Hábitos Pro): brief specifies the marker XP for "marcar
  // feito" is +2.  The pre-task-040 value was +4 (kept as
  // `habito_log_today` for backwards compatibility — any code that
  // still references it gets the same +4).
  habito_mark_done: 2,
  habito_log_today: 4,
  // task-040 (Hábitos Pro): brief specifies
  //   - streak 7 days  → +30 XP + badge (b16)
  //   - streak 30 days → +200 XP + badge (b17)
  // Pre-task-040 values were 20 / 75 / 100 / 250 / 1000 for 7/14/30/50/100/365.
  // We add new keys for the brief-aligned rewards and keep the
  // legacy keys untouched so older code paths (or tests) still work.
  // Curva monótona crescente — antes o marco dos 50 dias (100) pagava MENOS
  // que o dos 30 (200), o que parecia um bug ao utilizador.
  habito_streak_7: 30,
  habito_streak_14: 60,
  habito_streak_30: 150,
  habito_streak_50: 300,
  habito_streak_100: 600,
  habito_streak_365: 1500,
  habito_delete: 0,

  // Escola
  lesson_complete: 8,
  quiz_first_answer: 1,
  quiz_complete: 10, // any finished quiz — effort/accuracy rewarded, not only 100%
  quiz_perfect_score: 25,

  // Trabalhos
  assignment_status_in_progress: 3,
  assignment_status_done: 15,

  // Biblioteca
  biblioteca_add: 4,
  biblioteca_use_tag: 1,
  // task-025 — attach an existing bookmark to a Trabalho so it shows
  // up as a resource on the assignment detail page.
  biblioteca_attach: 5,

  // Easter eggs (replaces direct addXP calls)
  easteregg_heart_tier: 0, // amount passed explicitly; lookup is fallback
  easteregg_logo_3click: 30,
  easteregg_secret_room: 100,
  easteregg_konami: 100,
  easteregg_keyword: 50,
  easteregg_mascot: 5,

  // V8 — Humor (mood check-ins)
  mood_checkin: 2,

  // V8 — Calendário (personal events / special dates)
  event_add: 2,

  // V8 — Finanças metas (savings goals)
  meta_add: 3,
  meta_progress: 1,
  meta_reached: 25,

  // V8 — Daily quests (gamification loop)
  quest_daily_complete: 10,
  quest_all_daily: 20
});

export type XpReason = keyof typeof XP_TABLE;

// Debounce map — same reason fired within 50ms = ignored (race condition guard).
const _recentAwards = new Map<string, number>();
const DEBOUNCE_MS = 50;

// ---------------------------------------------------------------------------
// V10 — temporary XP boost (chest reward: 2x for 15 minutes)
// ---------------------------------------------------------------------------
// Cached in module scope so awardXP stays synchronous-cheap; persisted on the
// state row (xpBoostUntil/xpBoostMult, additive non-indexed fields) so the
// boost survives reloads. GamificationLayer hydrates it at boot.

export const XP_BOOST_EVENT = 'presuntinho:boost-changed';

let _boostUntil = 0;
let _boostMult = 1;

/** Activate (or clear, with mult=1) the XP multiplier and persist it. */
export function setXpBoost(until: number, mult: number): void {
  _boostUntil = until;
  _boostMult = mult;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(XP_BOOST_EVENT, { detail: { until, mult } })
    );
  }
  // Persist via a dynamic import to keep this module dependency-light.
  void (async () => {
    try {
      const { updateStateV8 } = await import('$lib/gamification/streak');
      await updateStateV8({ xpBoostUntil: until, xpBoostMult: mult });
    } catch (e) {
      console.warn('[xp-boost] persist failed (non-fatal):', e);
    }
  })();
}

/** Hydrate the boost cache from the persisted state row (call at boot). */
export async function initXpBoost(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const { readStateV8 } = await import('$lib/gamification/streak');
    const row = await readStateV8();
    const until = typeof row?.xpBoostUntil === 'number' ? row.xpBoostUntil : 0;
    const mult = typeof row?.xpBoostMult === 'number' ? row.xpBoostMult : 1;
    if (until > Date.now() && mult > 1) {
      _boostUntil = until;
      _boostMult = mult;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(XP_BOOST_EVENT, { detail: { until, mult } })
        );
      }
    }
  } catch (e) {
    console.warn('[xp-boost] hydration failed (non-fatal):', e);
  }
}

/** Milliseconds of boost remaining (0 when inactive). */
export function xpBoostRemainingMs(): number {
  return _boostMult > 1 ? Math.max(0, _boostUntil - Date.now()) : 0;
}

/** Current multiplier (1 when no boost is active). */
export function xpBoostMultiplier(): number {
  return xpBoostRemainingMs() > 0 ? _boostMult : 1;
}

/**
 * The amount a positive base award actually pays right now (boost applied).
 * Shared by awardXP and every UI that DISPLAYS an amount, so the number on
 * screen always matches the number paid.
 */
export function boostedXp(base: number): number {
  return base > 0 ? Math.round(base * xpBoostMultiplier()) : base;
}

/**
 * Award XP for an action.
 *
 * @param reason  Key into XP_TABLE (e.g. 'transacao_add_despesa').
 *                Unknown reasons log a warning and no-op.
 * @param amount  Optional explicit amount. If omitted, uses XP_TABLE[reason].
 *                Useful for easter eggs where tier-based amounts vary.
 */
export async function awardXP(reason: string, amount?: number): Promise<void> {
  // Debounce same-reason double-fires (race conditions, React 18 strict-mode-like)
  const last = _recentAwards.get(reason);
  const now = Date.now();
  if (last !== undefined && now - last < DEBOUNCE_MS) {
    return;
  }
  _recentAwards.set(reason, now);

  let finalAmount = amount;
  if (finalAmount === undefined) {
    const tableAmount = (XP_TABLE as Record<string, number>)[reason];
    if (tableAmount === undefined) {
      // Unknown reason — warn but don't break prod
      console.warn(`[awardXP] unknown reason "${reason}" — no XP awarded`);
      return;
    }
    finalAmount = tableAmount;
  }

  if (!finalAmount) return; // 0 XP is a no-op

  // V10 — active chest boost multiplies GAINS only (never deepens losses).
  finalAmount = boostedXp(finalAmount);

  await addXP(finalAmount);

  // V10.1 — per-day XP log for the /streaks charts. Fire-and-forget and
  // capped to ~30 days; a failure here must never break the award path.
  if (finalAmount > 0) {
    void (async () => {
      try {
        const { readStateV8, updateStateV8, localDateKey } = await import(
          '$lib/gamification/streak'
        );
        const key = localDateKey(new Date());
        const row = await readStateV8();
        const log: Record<string, number> = { ...(row?.xpDailyLog ?? {}) };
        log[key] = (log[key] ?? 0) + finalAmount;
        const keys = Object.keys(log).sort();
        while (keys.length > 30) delete log[keys.shift() as string];
        await updateStateV8({ xpDailyLog: log });
      } catch {
        // non-fatal
      }
    })();
  }

  // Notify subscribers (XpToast, XpPill, dashboard counters, etc.).
  // Do not also call the generic Toast channel here: that produced two
  // simultaneous “+XP” notifications for one click/action.
  if (typeof window !== 'undefined') {
    const total = get(xp);
    window.dispatchEvent(
      new CustomEvent(XP_CHANGED_EVENT, {
        detail: {
          reason,
          amount: finalAmount,
          delta: finalAmount,
          total,
          source: reason
        }
      })
    );
  }
}

/**
 * Subscribe to XP changes. Returns an unsubscribe function.
 * Use this if you need to react to XP changes from outside XpPill.
 */
export function onXpChanged(
  handler: (detail: { reason: string; amount: number }) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    const ce = e as CustomEvent<{ reason: string; amount: number }>;
    handler(ce.detail);
  };
  window.addEventListener(XP_CHANGED_EVENT, listener);
  return () => window.removeEventListener(XP_CHANGED_EVENT, listener);
}

/** Expose XP_TABLE for UI inspection (debug panel, settings page, tests). */
export function getXpTable(): Readonly<Record<string, number>> {
  return XP_TABLE;
}