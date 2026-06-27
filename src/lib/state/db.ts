// Dexie database for Presuntinho V4.
// Mirrors the V3 localStorage state shape (static/legacy/assets/js/state.js)
// so existing users' XP / badges / quiz scores survive the Phase 3 #17
// migration.
//
// Schema decision: HYBRID (option 3 from the design notes).
//   - Singleton `state` row for scalars that are written very frequently
//     (heartClicks, logoClicks, keyBuf, ...) — single-row updates are
//     cheapest when there is no fan-out by id.
//   - Per-row tables (`badges`, `visited`, `quizScores`, `secrets`) for
//     collections that benefit from primary-key lookups and from being
//     queried by id ("show all unlocked", "has user visited /home").
//   - Separate `settings` singleton so user preferences (theme, lang,
//     funMode) live in the same IndexedDB but in their own well-known row.
//
// Sub-app tables (transacoes, orcamentos, categorias, habitos,
// habit_logs, biblioteca) are added in Phase 6+ / 7+ via a version bump.
//
// Dexie version: 1.  When the schema changes, bump to 2 and add a
// `.upgrade()` block.

import Dexie, { type Table } from 'dexie';

// ---------------------------------------------------------------------------
// Row interfaces
// ---------------------------------------------------------------------------

/**
 * Singleton row holding the V3 scalar state fields.
 *
 * IMPORTANT: the field types below reflect the ACTUAL V3 source code in
 * `static/legacy/assets/js/state.js`, not the simplified summary in the
 * Phase 3 #16 task brief.  Notes:
 *
 *   - `logoTimer`    In V3 this is a `setTimeout` handle (transient,
 *                    does not survive reload).  Stored as 0 by default;
 *                    the live timer handle lives only in memory.
 *   - `konamiProg`   In V3 this is an **array** of keyCodes (rolling
 *                    window of the last N keys pressed).  Stored as an
 *                    empty array by default.
 *   - `heartMaxClicks`, `mascotShown`, `sroomOpened` are additional
 *                    V3 keys that the V4 store preserves for round-trip
 *                    fidelity even though they are not in the brief.
 */
export interface StateRow {
  id: 'main';
  xp: number;
  heartClicks: number;
  heartMaxClicks: number;
  logoClicks: number;
  logoTimer: number;          // 0 in DB; live handle is in-memory only
  konamiProg: number[];       // rolling buffer of keyCodes
  keyBuf: string;             // rolling buffer of typed letters
  footerClicks: number;
  mascotShown: boolean;
  sroomOpened: boolean;
  updatedAt: number;
}

/**
 * One row per V3 badge id (b1..b15).  `unlockedAt` is 0 when the badge
 * has not yet been earned.
 */
export interface BadgeRow {
  id: string;          // 'b1' .. 'b15'
  unlocked: boolean;
  unlockedAt: number;  // timestamp (0 if not unlocked)
}

/**
 * One row per V3 page visited.  V3 visited keys observed in source:
 *   case, course, walk, secrets, quiz, write, pt, dl, home
 */
export interface VisitedRow {
  id: string;          // page key, e.g. 'case', 'home'
  visited: boolean;
  visitedAt: number;   // timestamp (0 if never visited)
}

/**
 * One row per V3 quiz (q1, q2, q3, q4, ptq).
 *
 * In V3, `state.quizScore[q]` is an integer count of correct answers
 * (NOT a 0-100 percentage) and `state.quizAnswered[q]` is an array of
 * the question indices the user has answered.  We preserve both shapes
 * here so the V4 UI can compute percentages the same way V3 did.
 */
export interface QuizScoreRow {
  id: string;          // 'q1' | 'q2' | 'q3' | 'q4' | 'ptq'
  score: number;       // count of correct answers (0..QUIZZES[id].length)
  answered: number[];  // indices of questions the user has answered
  updatedAt: number;
}

/**
 * One row per V3 secret definition id.  V3 secret ids observed in
 * `static/legacy/assets/js/easter-eggs.js`:
 *   heart, logo3, logo7, konami, perfume, behi, mascot, footer
 *
 * `discoveredAt` is a timestamp; 0 means "not yet discovered".
 */
export interface SecretRow {
  id: string;          // secret id, e.g. 'konami', 'logo3'
  discovered: boolean;
  discoveredAt: number;
}

/**
 * User preferences (used from Phase 9).  Kept in IndexedDB so the
 * values persist across reloads and are available before any UI
 * renders (the V4 splash screen reads them on first paint).
 */
export interface SettingsRow {
  id: 'main';
  theme: 'light' | 'dark' | 'auto';
  lang: 'pt-PT' | 'en';
  funMode: boolean;   // controls confetti + easter eggs
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Database class
// ---------------------------------------------------------------------------

class PresuntinhoDB extends Dexie {
  state!: Table<StateRow, 'main'>;
  badges!: Table<BadgeRow, string>;
  visited!: Table<VisitedRow, string>;
  quizScores!: Table<QuizScoreRow, string>;
  secrets!: Table<SecretRow, string>;
  settings!: Table<SettingsRow, 'main'>;

  constructor() {
    super('presuntinho');
    // Schema string syntax: 'primaryKey, indexA, indexB, ...'
    // We only declare primary keys here.  Future versions can add
    // secondary indexes (e.g. 'unlocked' on badges) via a version bump.
    this.version(1).stores({
      state:      'id',   // singleton
      badges:     'id',   // PK only
      visited:    'id',
      quizScores: 'id',
      secrets:    'id',
      settings:   'id'    // singleton
    });
  }
}

// ---------------------------------------------------------------------------
// Lazy singleton accessor
// ---------------------------------------------------------------------------

// `db()` is lazy so that simply importing this module never opens the
// IndexedDB connection.  This is important for SSR (SvelteKit prerender)
// where `indexedDB` is undefined and any attempt to open Dexie throws.
let _db: PresuntinhoDB | null = null;
export function db(): PresuntinhoDB {
  if (!_db) _db = new PresuntinhoDB();
  return _db;
}

// ---------------------------------------------------------------------------
// Defaults — mirror the V3 `state` object's initial values
// ---------------------------------------------------------------------------

export const DEFAULT_STATE: StateRow = {
  id: 'main',
  xp: 0,
  heartClicks: 0,
  heartMaxClicks: 0,
  logoClicks: 0,
  logoTimer: 0,
  konamiProg: [],
  keyBuf: '',
  footerClicks: 0,
  mascotShown: false,
  sroomOpened: false,
  updatedAt: 0
};

export const DEFAULT_SETTINGS: SettingsRow = {
  id: 'main',
  theme: 'auto',
  lang: 'pt-PT',
  funMode: true,
  updatedAt: 0
};

// ---------------------------------------------------------------------------
// Bootstrap helper
// ---------------------------------------------------------------------------

/**
 * Ensure the two singleton rows (`state`, `settings`) exist in the DB.
 *
 * Idempotent — safe to call on every app boot.  Uses `put()` so it
 * overwrites with fresh `updatedAt` only if the row is missing OR
 * materially empty; in practice we just write defaults and let the
 * migration code in Phase 3 #17 overwrite them with the user's real
 * values if localStorage.presuntinho had any.
 */
export async function ensureDefaults(): Promise<void> {
  const d = db();
  const now = Date.now();
  await d.state.put({ ...DEFAULT_STATE, updatedAt: now });
  await d.settings.put({ ...DEFAULT_SETTINGS, updatedAt: now });
}
