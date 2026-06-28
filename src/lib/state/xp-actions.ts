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
//     components (XpPill, dashboard, badge grids) can react.

import { addXP } from './stores';
import { showToast } from '../components/events';

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
  transacao_delete: -1,
  orcamento_define: 5,
  orcamento_remove: 0,

  // Hábitos
  habito_create: 5,
  habito_edit: 1,
  habito_log_today: 4,
  habito_streak_7: 20,
  habito_streak_14: 40,
  habito_streak_30: 75,
  habito_streak_50: 100,
  habito_streak_100: 250,
  habito_streak_365: 1000,
  habito_delete: -1,

  // Escola
  lesson_complete: 8,
  quiz_first_answer: 1,
  quiz_perfect_score: 25,

  // Trabalhos
  assignment_status_in_progress: 3,
  assignment_status_done: 15,

  // Biblioteca
  biblioteca_add: 4,
  biblioteca_use_tag: 1,

  // Easter eggs (replaces direct addXP calls)
  easteregg_heart_tier: 0, // amount passed explicitly; lookup is fallback
  easteregg_logo_3click: 30,
  easteregg_secret_room: 100,
  easteregg_konami: 100,
  easteregg_keyword: 50,
  easteregg_mascot: 5
});

export type XpReason = keyof typeof XP_TABLE;

// Debounce map — same reason fired within 50ms = ignored (race condition guard).
const _recentAwards = new Map<string, number>();
const DEBOUNCE_MS = 50;

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

  await addXP(finalAmount);

  // Toast feedback (pt-PT format)
  if (typeof window !== 'undefined') {
    const sign = finalAmount > 0 ? '+' : '';
    showToast(`${sign}${finalAmount} XP`);

    // Notify subscribers (XpPill, dashboard counters, etc.)
    window.dispatchEvent(
      new CustomEvent(XP_CHANGED_EVENT, {
        detail: { reason, amount: finalAmount }
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