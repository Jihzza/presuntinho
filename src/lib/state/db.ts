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
// Sub-app tables:
//   - Phase 6 / Finanças:   transacoes, orcamentos, categorias (added in v2)
//   - Phase 7 / Hábitos:    habitos, habit_logs                  (added in v3)
//   - Phase 8 / Biblioteca: biblioteca                          (added in v4)
//   - Phase 10 / Caderno:    notes                               (added in v5)
//   - Phase V7+ / Agente:    chat_messages                       (added in v6)
//   - Phase 11 / Trabalhos:  assignments                         (added in v7)
//
// Dexie version: 7.  When the schema changes again, bump to 8 and add a
// `.upgrade()` block.  Versions are additive — older versions stay in
// place so existing IndexedDB databases still open cleanly on first
// load after the deploy.

import Dexie, { type Table } from 'dexie';
import type { ProfileId } from '../auth/hash';
import { buildSeedTransacoes } from './financas-seed';

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
  id: string;          // secret id, e.g. 'konami'
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
  lang: 'pt-PT' | 'en' | 'tn' | 'fr' | 'ar';
  funMode: boolean;   // controls confetti + easter eggs
  updatedAt: number;
}

/**
 * One row per financial transaction (Phase 6 / Finanças).  `id` is
 * auto-incremented by Dexie (see the `++id` primary key in v2 stores).
 * `data` is an ISO date string ('YYYY-MM-DD'); `createdAt` is a
 * Unix timestamp captured at insert time so we can order by recency.
 */
export interface TransacaoRow {
  id?: number;
  tipo: 'receita' | 'despesa';
  valor: number;
  categoria: string;
  descricao: string;
  data: string;   // ISO date 'YYYY-MM-DD'
  createdAt: number;
}

/**
 * Per-category monthly budget cap (Phase 6 / Finanças).  The primary
 * key is the category id (`categoria` field) — we keep a separate row
 * per category and re-key the same row each month by writing through.
 * `mes` is a 'YYYY-MM' string and is exposed as a secondary index so
 * callers can ask "what limits are set for this month?".
 */
export interface OrcamentoRow {
  id: string;     // = categoria id
  limite: number;
  mes: string;    // YYYY-MM
}

/**
 * Category lookup row (Phase 6 / Finanças).  `tipo` is one of
 *   'receita'  — only income
 *   'despesa'  — only expense
 *   'ambos'    — can be either (e.g. 'Outros')
 * 11 defaults are seeded on first boot by ensureDefaults().
 */
export interface CategoriaRow {
  id: string;
  nome: string;
  icone: string;   // emoji
  cor: string;     // hex colour
  tipo: 'receita' | 'despesa' | 'ambos';
}

/**
 * Phase 7 — Hábitos sub-app.
 *
 * One row per habit definition.  `cadence` is stored as a string so we
 * can add more values later (e.g. "weekdays", "3x/week") without a
 * schema bump.  For the MVP only 'daily' is rendered in the UI.
 */
export interface HabitoRow {
  id?: number;            // auto-incremented by Dexie (++)
  name: string;           // user-entered, pt-PT friendly
  icon: string;           // emoji or short text, e.g. '💧'
  color: string;          // hex (#xxxxxx) — used by the heatmap tint
  cadence: 'daily' | 'weekly' | string;
  createdAt: number;      // Date.now()
}

/**
 * Phase 7 — Hábitos sub-app.
 *
 * One row per habit × day the user logged it.  `date` is stored as an
 * ISO YYYY-MM-DD string (in the user's local timezone) so range queries
 * and "has this day been logged" lookups are O(1) on the compound
 * [habitId+date] index.
 */
export interface HabitLogRow {
  id?: number;
  habitId: number;
  date: string;           // 'YYYY-MM-DD' local
  done: boolean;          // always true when a log exists; column reserved
                          // so future versions can record "skipped"/"partial"
                          // without a schema bump.
  createdAt: number;
}

/**
 * Phase 8 — Biblioteca sub-app.
 *
 * One row per bookmark / link the user wants to keep.  `tags` is a
 * string array of user-entered labels (e.g. ['python', 'docs']) and
 * is declared as a **multi-entry** index in the schema below so
 * `where('tags').equals('python')` returns every item tagged
 * "python" — even if the same row also has other tags.
 *
 * `url` is stored verbatim — we don't try to normalise it (stripping
 * trailing slashes, lower-casing host, etc.) because the user
 * probably wants to land on exactly the URL they pasted.
 *
 * `curso_id` (Phase 11 / task-025) and `assignment_id` (task-025)
 * are OPTIONAL fields added on top of the existing v4 schema.  They
 * are stored as plain columns — NOT indexed — and the Dexie version
 * is unchanged so existing rows survive the upgrade.  Old rows have
 * `undefined` for both fields; the UI treats them as "no curso /
 * no assignment link".
 */
export interface BibliotecaRow {
  id?: number;            // auto-incremented by Dexie (++)
  title: string;          // user-friendly label, pt-PT friendly
  url: string;            // full URL (http/https/etc.)
  tags: string[];         // user-entered labels
  description: string;    // free-form notes (Markdown NOT rendered in MVP)
  createdAt: number;      // Date.now() at insert
  curso_id?: string;      // optional: escolar curso slug (e.g. 'marketing-digital')
  assignment_id?: string; // optional: Trabalho id (e.g. 'a3') to attach this bookmark as a resource
}

/**
 * Phase 10 — Meu Caderno (Escola sub-app).
 *
 * One row per note the user creates in the caderno UI.  Notes can be
 * plain text, an audio recording (audio/webm blob), an image, or a
 * generic file attachment.  `category` is a coarse tag so the user
 * can group notes by where they belong (escola / hábitos /
 * finanças / geral) without spinning up a separate "tag" table.
 *
 * `blob` is OPTIONAL — only set for audio / image / file notes.  We
 * store it directly in IndexedDB (Dexie supports Blobs natively) so
 * the caderno works fully offline without any blob storage layer.
 * The `createdAt` index makes "newest first" the cheapest query.
 */
export interface NoteRow {
  id?: number;            // auto-incremented by Dexie (++)
  kind: 'text' | 'audio' | 'image' | 'file';
  title: string;
  body: string;
  category: 'escola' | 'habitos' | 'financas' | 'geral';
  createdAt: number;
  blob?: Blob;
}

/**
 * Phase V7+ — Agente chat. Added in v6.
 *
 * One row per message exchanged with the in-app agent. `role` distinguishes
 * user / assistant / system turns. `attachment` holds optional blob for
 * files the user attached (image / audio / file). `createdAt` index powers
 * newest-first ordering.
 */
export interface ChatMessageRow {
  id?: number;            // auto-incremented by Dexie (++)
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachment?: {
    kind: 'image' | 'audio' | 'file';
    mimeType: string;
    name: string;
    blob?: Blob;
  };
  createdAt: number;
}

/**
 * Phase 11 / Trabalhos (Escola sub-app) — added in v7.
 *
 * One row per school assignment the user has on their plate
 * (a "trabalho").  `id` is a stable slug ('a1', 'a2', …) so we can
 * deep-link to `/trabalhos/assignment/<id>` without colliding with
 * Dexie's auto-increment space and so a user's "in-progress" set can
 * be identified across reloads even if the row order changes.
 *
 * `curso` is a slug from the escola catalogue (e.g. 'marketing-digital',
 * 'branding', 'estrategia', 'comportamento-organizacional',
 * 'gestao-financeira') and is the secondary index the `/trabalhos`
 * list view groups by.  `cadeira` is optional metadata for finer
 * grouping within a curso — kept free-form so the seed row
 * can carry ('SEO', 'Branding', 'Liderança', …) without a schema
 * bump if we add more later.
 *
 * `status` is the lifecycle: the user starts at 'pending', flips to
 * 'in_progress' when they actually sit down to do it, 'submitted'
 * once they hand it in, and 'graded' once it's been marked.  The XP
 * reward is awarded once `status` reaches 'submitted' (the
 * 'graded' step is informational only and does not pay out extra
 * XP in the MVP).
 *
 * `deadline` is a Unix-ms timestamp; 30-60 days ahead for the seed
 * rows so the dashboard shows real urgency when the user first
 * opens the app.  `updatedAt` is the secondary index powering the
 * "recently touched" pill on `/trabalhos`.
 */
export interface AssignmentRow {
  id: string;               // 'a1', 'a2', ... or slug
  title: string;            // PT
  description: string;      // PT
  curso: string;            // curso slug
  cadeira?: string;         // optional: cadeira/módulo
  deadline: number;         // timestamp ms
  status: 'pending' | 'in_progress' | 'submitted' | 'graded';
  xpReward: number;         // XP awarded when status -> submitted
  createdAt: number;
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
  // Phase 6 / Finanças — added in v2.
  //   transacoes: auto-increment PK, indexed by [tipo+data] for monthly
  //               filtering and by categoria for per-category rollups.
  //   orcamentos: PK is the categoria id; indexed by mes (YYYY-MM) so
  //               "what's the budget for this month?" is a single index hit.
  //   categorias: PK is the id (slug like 'alimentacao'); secondary index
  //               on `tipo` lets us split receitas / despesas in one query.
  transacoes!: Table<TransacaoRow, number>;
  orcamentos!: Table<OrcamentoRow, string>;
  categorias!: Table<CategoriaRow, string>;
  // Phase 7 / Hábitos — added in v3.
    //   habitos:     auto-increment PK; secondary `createdAt` index lets
    //                the listing route sort newest-first without a
    //                table scan.
    //   habit_logs:  one row per (habit, day).  The compound
    //                [habitId+date] index is the hot path for
    //                "is this day logged?" lookups (called from the
    //                heatmap and the streak helper on every render).
    habitos!: Table<HabitoRow, number>;
    habit_logs!: Table<HabitLogRow, number>;
    // Phase 8 / Biblioteca — added in v4.
    //   biblioteca: auto-increment PK; `tags` is a **multi-entry** index
    //               so a single `where('tags').equals('python')` query
    //               returns every row whose `tags` array contains
    //               "python" (regardless of how many other tags it has).
    //               `createdAt` is a secondary index so the list view
    //               can sort newest-first without a table scan.
    biblioteca!: Table<BibliotecaRow, number>;
    // Phase 10 / Meu Caderno — added in v5.
        //   notes: auto-increment PK; `category` index supports the
        //          "show me escola notes only" filter; `createdAt` is the
        //          hot-path secondary index used by the caderno list view
        //          to sort newest-first.
        notes!: Table<NoteRow, number>;
        // Phase V7+ — Agente chat — added in v6.
        //   chat_messages: one row per message. `createdAt` is the
        //                  secondary index powering newest-first ordering.
        chat_messages!: Table<ChatMessageRow, number>;
        // Phase 11 / Trabalhos — added in v7.
        //   assignments: PK is the stable id slug ('a1', 'a2', …).
        //                Secondary indexes on `curso` (group by curso
        //                in the /trabalhos list), `status` (filter
        //                pending vs submitted), `deadline` (sort by
        //                urgency), and `updatedAt` (recently touched).
        //                No `.upgrade()` body — brand-new table, Dexie
        //                creates it empty on the first open after deploy.
        assignments!: Table<AssignmentRow, string>;

    constructor(name = 'presuntinho') {
      super(name);
      // Schema string syntax: 'primaryKey, indexA, indexB, ...'
      // v1: existing V3-mirroring tables (singletons + PK-only collections).
      this.version(1).stores({
        state:      'id',   // singleton
        badges:     'id',   // PK only
        visited:    'id',
        quizScores: 'id',
        secrets:    'id',
        settings:   'id'    // singleton
      });
      // v2: Phase 6 / Finanças tables.  No `.upgrade()` callback needed —
      // all three tables are brand new, so Dexie just creates them.  We
      // also re-declare the v1 stores here so Dexie's version chain can
      // validate them; this is idempotent for an existing v1 DB.
      this.version(2).stores({
        state:       'id',
        badges:      'id',
        visited:     'id',
        quizScores:  'id',
        secrets:     'id',
        settings:    'id',
        transacoes:  '++id, tipo, data, [tipo+data], categoria',
        orcamentos:  'id, mes',
        categorias:  'id, tipo'
      });
      // v3: Phase 7 / Hábitos tables.  New tables only — no upgrade body
      // needed.  We re-declare every prior store so Dexie's version chain
      // can validate the cumulative schema.
      this.version(3).stores({
        state:       'id',
        badges:      'id',
        visited:     'id',
        quizScores:  'id',
        secrets:     'id',
        settings:    'id',
        transacoes:  '++id, tipo, data, [tipo+data], categoria',
        orcamentos:  'id, mes',
        categorias:  'id, tipo',
        habitos:     '++id, createdAt',
        habit_logs:  '++id, [habitId+date], habitId, date, createdAt'
      });
      // v4: Phase 8 / Biblioteca table.  Brand-new table, no upgrade
      // body needed.  We re-declare every prior store so Dexie's
      // version chain can validate the cumulative schema.  The `*tags`
      // prefix is Dexie's multi-entry index syntax: every entry of the
      // `tags` array is added to the index so `equals('python')` returns
      // every bookmark that has 'python' as one of its tags.
      this.version(4).stores({
        state:       'id',
        badges:      'id',
        visited:     'id',
        quizScores:  'id',
        secrets:     'id',
        settings:    'id',
        transacoes:  '++id, tipo, data, [tipo+data], categoria',
        orcamentos:  'id, mes',
        categorias:  'id, tipo',
        habitos:     '++id, createdAt',
        habit_logs:  '++id, [habitId+date], habitId, date, createdAt',
        biblioteca:  '++id, *tags, createdAt'
      });
      // v5: Phase 10 / Meu Caderno (Escola sub-app).  Brand-new table,
            // no upgrade body needed — Dexie creates the empty table on the
            // first open after deploy.  `category` is the secondary index the
            // caderno's filter chips use; `createdAt` powers the
            // `orderBy('createdAt').reverse()` list query (the caderno
            // renders newest-first).
            this.version(5).stores({
              state:       'id',
              badges:      'id',
              visited:     'id',
              quizScores:  'id',
              secrets:     'id',
              settings:    'id',
              transacoes:  '++id, tipo, data, [tipo+data], categoria',
              orcamentos:  'id, mes',
              categorias:  'id, tipo',
              habitos:     '++id, createdAt',
              habit_logs:  '++id, [habitId+date], habitId, date, createdAt',
              biblioteca:  '++id, *tags, createdAt',
              notes:       '++id, category, createdAt'
            });
            // v6: Agente chat. Brand-new table, no upgrade body needed.
            this.version(6).stores({
              state:         'id',
              badges:        'id',
              visited:       'id',
              quizScores:    'id',
              secrets:       'id',
              settings:      'id',
              transacoes:    '++id, tipo, data, [tipo+data], categoria',
              orcamentos:    'id, mes',
              categorias:    'id, tipo',
              habitos:       '++id, createdAt',
              habit_logs:    '++id, [habitId+date], habitId, date, createdAt',
              biblioteca:    '++id, *tags, createdAt',
              notes:         '++id, category, createdAt',
              chat_messages: '++id, createdAt'
            });
            // v7: Phase 11 / Trabalhos — Escola sub-app. Brand-new table,
            // no upgrade body needed — Dexie creates it empty on the first
            // open after deploy.  `assignments` uses an explicit string PK
            // ('a1', 'a2', …) declared as `id` (no `++`), with secondary
            // indexes on `curso`, `status`, `deadline` and `updatedAt`
            // matching the indexes declared in the brief.  All prior
            // stores are re-declared so Dexie's version chain can
            // validate the cumulative schema.
            this.version(7).stores({
              state:         'id',
              badges:        'id',
              visited:       'id',
              quizScores:    'id',
              secrets:       'id',
              settings:      'id',
              transacoes:    '++id, tipo, data, [tipo+data], categoria',
              orcamentos:    'id, mes',
              categorias:    'id, tipo',
              habitos:       '++id, createdAt',
              habit_logs:    '++id, [habitId+date], habitId, date, createdAt',
              biblioteca:    '++id, *tags, createdAt',
              notes:         '++id, category, createdAt',
              chat_messages: '++id, createdAt',
              assignments:   'id, curso, status, deadline, updatedAt'
            });
          }
        }

// ---------------------------------------------------------------------------
// Lazy singleton accessor
// ---------------------------------------------------------------------------

// `db()` is lazy so that simply importing this module never opens the
// IndexedDB connection.  This is important for SSR (SvelteKit prerender)
// where `indexedDB` is undefined and any attempt to open Dexie throws.
let activeProfile: ProfileId = 'fatma';
const _dbCache = new Map<ProfileId, PresuntinhoDB>();

export function setActiveProfile(profile: ProfileId): void {
  activeProfile = profile;
}

export function dbNameForProfile(profile: ProfileId): string {
  return profile === 'fatma' ? 'presuntinho' : `presuntinho-${profile}`;
}

export function db(profile: ProfileId = activeProfile): PresuntinhoDB {
  const cached = _dbCache.get(profile);
  if (cached) return cached;
  const fresh = new PresuntinhoDB(dbNameForProfile(profile));
  _dbCache.set(profile, fresh);
  return fresh;
}

export function resetDbCache(): void {
  for (const inst of Array.from(_dbCache.values())) {
    try { inst.close(); } catch { /* ignore */ }
  }
  _dbCache.clear();
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

/**
 * Phase 6 / Finanças — default categories seeded on first run.
 *
 * Eleven entries (9 despesa + 1 ambos + 1 receita) per the V4 brief:
 *   Alimentação, Transporte, Habitação, Saúde, Educação, Lazer, Roupa,
 *   Beleza, Presentes, Outros, Salário.
 *
 * The user can rename or recolour them later, but the `id` is the
 * stable identifier transactions reference, so we don't expose
 * "delete" until Phase 10 ships the settings UI.
 *
 * IDs are slugs — never translate, never reorder.  UI sorts by `nome`
 * (Portuguese alphabetical) so order in this array does not affect
 * the rendered list.
 */
export const DEFAULT_CATEGORIAS: CategoriaRow[] = [
  { id: 'alimentacao', nome: 'Alimentação', icone: '🍔', cor: '#f59e0b', tipo: 'despesa' },
  { id: 'transporte',  nome: 'Transporte',  icone: '🚗', cor: '#3b82f6', tipo: 'despesa' },
  { id: 'habitacao',   nome: 'Habitação',   icone: '🏠', cor: '#8b5cf6', tipo: 'despesa' },
  { id: 'saude',       nome: 'Saúde',       icone: '⚕️', cor: '#10b981', tipo: 'despesa' },
  { id: 'educacao',    nome: 'Educação',    icone: '📚', cor: '#6366f1', tipo: 'despesa' },
  { id: 'lazer',       nome: 'Lazer',       icone: '🎭', cor: '#ec4899', tipo: 'despesa' },
  { id: 'roupa',       nome: 'Roupa',       icone: '👕', cor: '#f43f5e', tipo: 'despesa' },
  { id: 'beleza',      nome: 'Beleza',      icone: '💄', cor: '#f9a8d4', tipo: 'despesa' },
  { id: 'presentes',   nome: 'Presentes',   icone: '🎁', cor: '#d946ef', tipo: 'despesa' },
  { id: 'outros',      nome: 'Outros',      icone: '📦', cor: '#94a3b8', tipo: 'ambos'    },
  { id: 'salario',     nome: 'Salário',     icone: '💰', cor: '#10b981', tipo: 'receita'  }
  ];

  /**
   * Phase 7 / Hábitos — default habits seeded on first run for Fatma.
   *
   * Eight sensible, non-overlapping daily habits chosen to give a new
   * user a populated list the moment they open the Hábitos sub-app, so
   * the streak/heatmap UI has something to render and the user can pick
   * the ones they actually want (or delete the rest) instead of facing
   * an empty state and not knowing what to type.
   *
   * The user can rename / recolour / delete any of these later — the
   * `id` (auto-incremented by Dexie) is the only stable identifier and
   * `createdAt` is the only field we set automatically, so there is no
   * collision risk with future user-created habits.
   *
   * `cadence` is hard-coded to 'daily' for all eight.  The schema already
   * allows 'weekly' / arbitrary strings, but the MVP UI only renders
   * daily habits, so seeding anything else would create rows the user
   * couldn't see or interact with.
   */
  export const DEFAULT_HABITOS: HabitoRow[] = [
  { name: 'Beber água 2L',        icon: '💧', color: '#3b82f6', cadence: 'daily', createdAt: 0 },
  { name: 'Dormir 8h',            icon: '😴', color: '#6366f1', cadence: 'daily', createdAt: 0 },
  { name: 'Exercício 30min',      icon: '🏃', color: '#10b981', cadence: 'daily', createdAt: 0 },
  { name: 'Meditar 10min',        icon: '🧘', color: '#8b5cf6', cadence: 'daily', createdAt: 0 },
  { name: 'Estudar 1h',           icon: '📚', color: '#f59e0b', cadence: 'daily', createdAt: 0 },
  { name: 'Ler 20min',            icon: '📖', color: '#ec4899', cadence: 'daily', createdAt: 0 },
  { name: 'Sem açúcar',           icon: '🍎', color: '#22c55e', cadence: 'daily', createdAt: 0 },
  { name: 'Caminhar 8000 passos', icon: '👟', color: '#f43f5e', cadence: 'daily', createdAt: 0 }
  ];

  // ---------------------------------------------------------------------------
  // Bootstrap helper
  // ---------------------------------------------------------------------------

/**
 * Ensure the singleton rows (`state`, `settings`) and the default
 * category seed rows exist in the DB.
 *
 * Idempotent — safe to call on every app boot:
 *   - `state` and `settings` are only `put()` when the row does NOT
 *     yet exist.  This is critical: an unconditional `put()` would
 *     overwrite the user's real XP / heartClicks / badge progress
 *     back to the defaults on every boot, which is exactly the bug
 *     Daniel reported (XP and badges "voltam a 0 ao refresh").
 *     The V3-migration code in Phase 3 #17 runs AFTER this and still
 *     overwrites them on the very first boot from localStorage.
 *   - `categorias` is `bulkPut()` but only when the table is empty, so
 *     users who have already added / edited categories won't see their
 *     custom rows stomped by the seed list.
 *
 * The 11 default categories cover the MVP Finanças needs (see
 * `DEFAULT_CATEGORIAS` for the source of truth).
 */
export async function ensureDefaults(profile: ProfileId = activeProfile): Promise<void> {
  const d = db(profile);
  const now = Date.now();
  // Singleton state — only seed if it doesn't exist yet.  Once the
  // user has any XP / clicks / badges, their values must NOT be
  // clobbered back to 0 by a fresh `put`.
  const existingState = await d.state.get('main');
  if (!existingState) {
    await d.state.put({ ...DEFAULT_STATE, updatedAt: now });
  }
  const existingSettings = await d.settings.get('main');
  if (!existingSettings) {
    await d.settings.put({ ...DEFAULT_SETTINGS, updatedAt: now });
  }
  // Seed default categories only on a fresh DB (table count === 0).
  // We use count() — not a per-id bulkPut() — so the operation stays
  // O(1) on the categories PK index and never silently overwrites a
  // user's custom row.
  const existingCategoryCount = await d.categorias.count();
  if (existingCategoryCount === 0) {
    await d.categorias.bulkPut(DEFAULT_CATEGORIAS);
  }
  // Seed the eight default habits (Phase 7) only on a fresh DB —
  // same idempotent pattern as `categorias` above.  We stamp
  // `createdAt` here so the list comes out newest-first within the
  // seed batch and any user-created habit added later naturally sorts
  // after all eight seeds (because Dexie auto-assigns a higher id AND
  // we use createdAt+1 ms increments between the seeds to make the
  // ordering deterministic on first render).
  const existingHabitCount = await d.habitos.count();
  if (existingHabitCount === 0) {
    const seeded = DEFAULT_HABITOS.map((h, i) => ({
      ...h,
      // createdAt: 0 would sort to the very back of the `orderBy('createdAt')`
      // query and put all eight seeds at the bottom of the list.  Add a
      // small per-index delta so the seed order is stable and predictable.
      createdAt: now + i
    }));
    await d.habitos.bulkPut(seeded);
  }
  // Seed a handful of example transactions (task-038) so the /financas
    // dashboard is populated on first open.  Twenty realistic rows
    // spanning two months and eight categories — gives the chart, totals
    // and category breakdown real shape from the first render.  The seed
    // lives in its own module (`./financas-seed.ts`) so it stays editable
    // without bloating `ensureDefaults`.  Only runs when the table is
    // empty, so users who have already added their own transactions will
    // never see their list stomped.
    const existingTransacaoCount = await d.transacoes.count();
    if (existingTransacaoCount === 0) {
      await d.transacoes.bulkPut(buildSeedTransacoes(now));
    }
  }
