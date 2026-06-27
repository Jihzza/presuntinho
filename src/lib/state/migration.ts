// localStorage → Dexie migration. Runs once on first V4 launch per browser.
// Reads legacy state blob from localStorage.presuntinho (set by V3), writes
// to Dexie tables (Phase 3 #16 schema). Does NOT delete the localStorage
// key — kept for one rollback cycle per the project brief.

import { db, DEFAULT_STATE, DEFAULT_SETTINGS, ensureDefaults } from './db';
import type { ProfileId } from '../auth/hash';

const LEGACY_KEY = 'presuntinho';
const MIGRATION_FLAG_KEY = 'presuntinho-migrated-v4';

export interface MigrationResult {
  migrated: boolean;
  alreadyDone: boolean;
  badgesCount: number;
  visitedCount: number;
  quizScoresCount: number;
  secretsCount: number;
  totalXp: number;
  errors: string[];
}

// LegacyBlob mirrors the V3 `state` object in
// static/legacy/assets/js/state.js.  Field types are based on the ACTUAL
// V3 source, not the simplified Phase 3 brief:
//   - logoTimer is a setTimeout handle in V3 (stored as 0 in DB).
//   - konamiProg is an ARRAY of keyCodes (rolling window).
//   - quizAnswered[id] is an ARRAY of answered question indices
//     (truthy arrays mean "user answered at least one", so we
//     convert to "answered = answered.length > 0" for migration).
//   - secretDiscovered[id] is a timestamp (Date.now() at first view),
//     so the value can be a number, not just boolean.
interface LegacyBlob {
  xp?: number;
  badges?: Record<string, boolean | number>;
  visited?: Record<string, boolean>;
  heartClicks?: number;
  heartMaxClicks?: number;
  logoClicks?: number;
  logoTimer?: number;            // setTimeout handle in V3 — discard
  konamiProg?: number[];          // array of keyCodes
  keyBuf?: string;
  footerClicks?: number;
  mascotShown?: boolean;
  sroomOpened?: boolean;
  quizScore?: Record<string, number>;
  quizAnswered?: Record<string, number[] | unknown>;
  secretDiscovered?: Record<string, boolean | number>;
}

export async function migrateFromLocalStorage(profile: ProfileId = 'fatma'): Promise<MigrationResult> {
  const result: MigrationResult = {
    migrated: false,
    alreadyDone: false,
    badgesCount: 0,
    visitedCount: 0,
    quizScoresCount: 0,
    secretsCount: 0,
    totalXp: 0,
    errors: []
  };

  if (profile !== 'fatma') {
    await ensureDefaults(profile);
    return result;
  }

  if (typeof localStorage === 'undefined') {
    result.errors.push('localStorage unavailable (SSR context)');
    return result;
  }

  // Idempotency check
  if (localStorage.getItem(MIGRATION_FLAG_KEY) === 'done') {
    result.alreadyDone = true;
    return result;
  }

  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) {
    // Nothing to migrate — but mark as done so we don't keep checking
    localStorage.setItem(MIGRATION_FLAG_KEY, 'done');
    await ensureDefaults(profile);
    return result;
  }

  let legacy: LegacyBlob;
  try {
    legacy = JSON.parse(raw);
  } catch (e) {
    result.errors.push(`Failed to parse legacy blob: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }

  try {
    await ensureDefaults(profile);
    const d = db(profile);
    const now = Date.now();

    // 1. Singleton state row.
    // `logoTimer` is a transient setTimeout handle in V3 and does NOT
    // survive a reload — normalise null/undefined to 0.  `konamiProg`
    // is an array of keyCodes (rolling window) in V3 — default to [].
    await d.state.update('main', {
      xp: legacy.xp ?? DEFAULT_STATE.xp,
      heartClicks: legacy.heartClicks ?? DEFAULT_STATE.heartClicks,
      heartMaxClicks: legacy.heartMaxClicks ?? DEFAULT_STATE.heartMaxClicks,
      logoClicks: legacy.logoClicks ?? DEFAULT_STATE.logoClicks,
      logoTimer: typeof legacy.logoTimer === 'number' ? legacy.logoTimer : DEFAULT_STATE.logoTimer,
      konamiProg: Array.isArray(legacy.konamiProg) ? legacy.konamiProg : DEFAULT_STATE.konamiProg,
      keyBuf: legacy.keyBuf ?? DEFAULT_STATE.keyBuf,
      footerClicks: legacy.footerClicks ?? DEFAULT_STATE.footerClicks,
      mascotShown: legacy.mascotShown ?? DEFAULT_STATE.mascotShown,
      sroomOpened: legacy.sroomOpened ?? DEFAULT_STATE.sroomOpened,
      updatedAt: now
    });
    result.totalXp = legacy.xp ?? 0;

    // 2. Badges — one row per badge id
    if (legacy.badges) {
      const badgeRows = Object.entries(legacy.badges).map(([id, val]) => ({
        id,
        unlocked: Boolean(val),
        unlockedAt: typeof val === 'number' ? val : (val ? now : 0)
      }));
      await d.badges.bulkPut(badgeRows);
      result.badgesCount = badgeRows.length;
    }

    // 3. Visited — one row per page
    if (legacy.visited) {
      const visitedRows = Object.entries(legacy.visited).map(([id, val]) => ({
        id,
        visited: Boolean(val),
        visitedAt: val ? now : 0
      }));
      await d.visited.bulkPut(visitedRows);
      result.visitedCount = visitedRows.length;
    }

    // 4. Quiz scores + answered flags merged into quizScores.
    //    In V3, quizAnswered[id] is an array of answered question
    //    indices.  We preserve those indices so the V4 UI can rebuild
    //    per-question state if needed.  When the legacy field is
    //    missing or not array-like, we fall back to "every question
    //    answered" only if `score === QUIZZES length` — otherwise empty.
    if (legacy.quizScore || legacy.quizAnswered) {
      const allQuizIds = new Set([
        ...Object.keys(legacy.quizScore || {}),
        ...Object.keys(legacy.quizAnswered || {})
      ]);
      const quizRows = Array.from(allQuizIds).map(id => {
        const answeredRaw = legacy.quizAnswered?.[id];
        const answeredArr: number[] = Array.isArray(answeredRaw)
          ? answeredRaw.filter((n): n is number => typeof n === 'number')
          : [];
        return {
          id,
          score: legacy.quizScore?.[id] ?? 0,
          answered: answeredArr,
          updatedAt: now
        };
      });
      await d.quizScores.bulkPut(quizRows);
      result.quizScoresCount = quizRows.length;
    }

    // 5. Secrets — one row per secret definition.  V3 stores discovery
    // timestamps (see easter-eggs.js line 216); accept true|number.
    if (legacy.secretDiscovered) {
      const secretRows = Object.entries(legacy.secretDiscovered).map(([id, val]) => ({
        id,
        discovered: Boolean(val),
        discoveredAt: typeof val === 'number' ? val : (val ? now : 0)
      }));
      await d.secrets.bulkPut(secretRows);
      result.secretsCount = secretRows.length;
    }

    // 6. Settings stay at defaults — DO NOT overwrite from legacy
    // (Phase 9 will add UI for these)

    // Mark migration done. Do NOT delete the localStorage key — kept for rollback.
    localStorage.setItem(MIGRATION_FLAG_KEY, 'done');
    result.migrated = true;

    if (import.meta.env.DEV) console.log('[presuntinho] Migration complete:', result);
  } catch (e) {
    result.errors.push(`Migration failed: ${e instanceof Error ? e.message : String(e)}`);
    console.error('[presuntinho] Migration error:', e);
  }

  return result;
}

// Auto-run on import (browser only). Layout can call this on mount.
export async function bootMigration(profile: ProfileId = 'fatma'): Promise<void> {
  if (typeof window === 'undefined') return;
  await migrateFromLocalStorage(profile);
}
