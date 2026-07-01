// Svelte stores over Dexie. Each store reads its initial value from Dexie
// and persists every change. Migration runs on first boot.
//
// This file is the V4 port of V3's `state` object + persist() in
// static/legacy/assets/js/state.js. The shape of DEFAULT_STATE matches
// db.ts → StateRow exactly (additional V3 fields preserved for fidelity).

import { writable, type Writable } from 'svelte/store';
import { db, DEFAULT_STATE, DEFAULT_SETTINGS, ensureDefaults, resetDbCache, setActiveProfile } from './db';
import { bootMigration } from './migration';
import type { ProfileId } from '../auth/hash';

// We use Svelte's classic writable stores here (not runes) so they work
// across SSR boundaries and can be subscribed to from any component
// (including non-rune legacy code or plain .ts modules).

let _initialized = false;
let _initializedProfile: ProfileId | null = null;
let _initPromise: Promise<void> | null = null;
let _initializingProfile: ProfileId | null = null;

function resolveInitProfile(profile?: ProfileId): ProfileId {
  return profile ?? _initializedProfile ?? _initializingProfile ?? 'fatma';
}

/**
 * Initialize all stores: run migration, ensure default rows exist.
 * Idempotent — safe to call from multiple places.
 */
export async function initStores(profile?: ProfileId): Promise<void> {
  const targetProfile = resolveInitProfile(profile);
  if (_initialized && _initializedProfile === targetProfile) return;
  if (_initPromise) {
    if (_initializingProfile === targetProfile) return _initPromise;
    await _initPromise;
    return initStores(targetProfile);
  }
  _initializingProfile = targetProfile;
  _initPromise = (async () => {
    setActiveProfile(targetProfile);
    await bootMigration(targetProfile);
    await ensureDefaults(targetProfile);
    await hydrateStores(targetProfile);
    _initialized = true;
    _initializedProfile = targetProfile;
  })().finally(() => {
    _initPromise = null;
    _initializingProfile = null;
  });
  return _initPromise;
}

export function resetStores(): void {
  _initialized = false;
  _initializedProfile = null;
  _initPromise = null;
  resetDbCache();
}

/**
 * Create a writable store backed by a single field in the `state` row.
 * On creation, hydrate from Dexie. After initStores() resolves, every
 * update is persisted back via a Dexie write.
 *
 * Note: a small write happens immediately after hydration (because the
 * `subscribe` callback fires on the initial `writable` value, which
 * equals the default). That is intentional — it normalises the row to
 * have every field present after first boot.
 */
function createPersistedStore<K extends keyof typeof DEFAULT_STATE>(
  key: K,
  defaultValue: (typeof DEFAULT_STATE)[K]
): Writable<(typeof DEFAULT_STATE)[K]> {
  const store = writable(defaultValue);

  // Hydrate from Dexie (async; fires once)
  void db().state.get('main').then((row) => {
    if (row && key in row) {
      // Cast because TS key→type mapping is brittle here
      store.set((row as unknown as Record<string, unknown>)[key] as (typeof DEFAULT_STATE)[K]);
    }
  });

  // Persist on every change (no-op until initStores has completed so
  // we don't write defaults before migration may have overwritten them).
  store.subscribe(async (value) => {
    if (!_initialized) return;
    try {
      await db().state.update('main', { [key]: value } as Partial<typeof DEFAULT_STATE>);
    } catch (e) {
      console.error(`[stores] failed to persist ${String(key)}`, e);
    }
  });

  return store;
}

// ============================================================================
// Singleton state stores (mirror V3 state object fields)
// ============================================================================

export const xp = createPersistedStore('xp', DEFAULT_STATE.xp);
export const heartClicks = createPersistedStore('heartClicks', DEFAULT_STATE.heartClicks);
export const heartMaxClicks = createPersistedStore('heartMaxClicks', DEFAULT_STATE.heartMaxClicks);
export const logoClicks = createPersistedStore('logoClicks', DEFAULT_STATE.logoClicks);
export const logoTimer = createPersistedStore('logoTimer', DEFAULT_STATE.logoTimer);
export const konamiProg = createPersistedStore('konamiProg', DEFAULT_STATE.konamiProg);
export const keyBuf = createPersistedStore('keyBuf', DEFAULT_STATE.keyBuf);
export const footerClicks = createPersistedStore('footerClicks', DEFAULT_STATE.footerClicks);
export const mascotShown = createPersistedStore('mascotShown', DEFAULT_STATE.mascotShown);
export const sroomOpened = createPersistedStore('sroomOpened', DEFAULT_STATE.sroomOpened);

// ============================================================================
// Settings (Phase 9 will use these; defaults applied now via Dexie)
// ============================================================================

// We type-narrow these as the SettingsRow union members; the field name
// does not actually live on the `state` row — it lives on the
// `settings` singleton. So we wrap them in a separate factory.
function createSettingsStore<K extends keyof Omit<typeof DEFAULT_SETTINGS, 'id' | 'updatedAt'>>(
  key: K,
  defaultValue: (typeof DEFAULT_SETTINGS)[K]
): Writable<(typeof DEFAULT_SETTINGS)[K]> {
  const store = writable(defaultValue);
  void db().settings.get('main').then((row) => {
    if (row && key in row) {
      store.set((row as unknown as Record<string, unknown>)[key] as (typeof DEFAULT_SETTINGS)[K]);
    }
  });
  store.subscribe(async (value) => {
    if (!_initialized) return;
    try {
      await db().settings.update('main', { [key]: value } as Partial<typeof DEFAULT_SETTINGS>);
    } catch (e) {
      console.error(`[stores] failed to persist setting ${String(key)}`, e);
    }
  });
  return store;
}

export const theme = createSettingsStore('theme', DEFAULT_SETTINGS.theme) as Writable<'light' | 'dark' | 'auto'>;
export const lang = createSettingsStore('lang', DEFAULT_SETTINGS.lang) as Writable<'pt-PT' | 'en' | 'tn' | 'fr' | 'ar'>;
export const funMode = createSettingsStore('funMode', DEFAULT_SETTINGS.funMode) as Writable<boolean>;

async function hydrateStores(profile: ProfileId): Promise<void> {
  const d = db(profile);
  const [stateRow, settingsRow] = await Promise.all([
    d.state.get('main'),
    d.settings.get('main')
  ]);
  if (stateRow) {
    xp.set(stateRow.xp);
    heartClicks.set(stateRow.heartClicks);
    heartMaxClicks.set(stateRow.heartMaxClicks);
    logoClicks.set(stateRow.logoClicks);
    logoTimer.set(stateRow.logoTimer);
    konamiProg.set(stateRow.konamiProg);
    keyBuf.set(stateRow.keyBuf);
    footerClicks.set(stateRow.footerClicks);
    mascotShown.set(stateRow.mascotShown);
    sroomOpened.set(stateRow.sroomOpened);
  }
  if (settingsRow) {
    theme.set(settingsRow.theme);
    lang.set(settingsRow.lang);
    funMode.set(settingsRow.funMode);
  }
}

// ============================================================================
// High-level helpers (preserve V3 addXP / awardBadge semantics)
// ============================================================================

/** Add XP and persist. Mirrors V3 `addXP(n)`. */
export async function addXP(n: number): Promise<void> {
  if (!n) return;
  xp.update((v) => v + n);
}

/**
 * Award a badge. Idempotent — won't re-award if already unlocked.
 * V3 `awardBadge(id, xp)` also added XP if `xp` was passed; we keep
 * that behaviour for callers that pass it (no badge XP grants in
 * current easterEggs.ts, but the door is open).
 */
export async function awardBadge(id: string, xpAmount: number = 0): Promise<void> {
  const existing = await db().badges.get(id);
  if (existing?.unlocked) return;
  const now = Date.now();
  await db().badges.put({ id, unlocked: true, unlockedAt: now });
  if (xpAmount) await addXP(xpAmount);
}

/** Discover a secret. Idempotent. Mirrors V3 setting `state.secretDiscovered[id]`. */
export async function discoverSecret(id: string): Promise<void> {
  const existing = await db().secrets.get(id);
  if (existing?.discovered) return;
  await db().secrets.put({ id, discovered: true, discoveredAt: Date.now() });
}

/** Mark a page visited (V3 `state.visited[page] = true`). */
export async function markVisited(pageId: string): Promise<void> {
  const existing = await db().visited.get(pageId);
  if (existing?.visited) return;
  await db().visited.put({ id: pageId, visited: true, visitedAt: Date.now() });
}

/** Look up badge status. */
export async function isBadgeUnlocked(id: string): Promise<boolean> {
  const row = await db().badges.get(id);
  return Boolean(row?.unlocked);
}

/** Look up secret status. */
export async function isSecretDiscovered(id: string): Promise<boolean> {
  const row = await db().secrets.get(id);
  return Boolean(row?.discovered);
}

/**
 * Save a quiz score. Mirrors V3 setting `state.quizScore[id]` and
 * appending to `state.quizAnswered[id]`.
 *
 * NOTE: Dexie schema (db.ts → QuizScoreRow) stores `answered` as a
 * `number[]` of answered question indices. V4 callers should pass
 * either `boolean` (meaning "fully answered") or `number[]`.
 */
export async function saveQuizScore(
  quizId: string,
  score: number,
  answered: boolean | number[] = true
): Promise<void> {
  const answeredArr: number[] = Array.isArray(answered)
    ? answered
    : answered
      ? [] // boolean true → caller doesn't track per-question indices
      : [];
  await db().quizScores.put({ id: quizId, score, answered: answeredArr, updatedAt: Date.now() });
}

/** Append a single answered question index for a quiz (V3 quizAnswered push). */
export async function recordQuizAnswer(quizId: string, qIdx: number, isCorrect: boolean): Promise<void> {
  const row = await db().quizScores.get(quizId);
  const prevAnswered = Array.isArray(row?.answered) ? row!.answered : [];
  const prevScore = row?.score ?? 0;
  // Only record the index the first time the user answers it.
  if (!prevAnswered.includes(qIdx)) prevAnswered.push(qIdx);
  await db().quizScores.put({
    id: quizId,
    score: prevScore + (isCorrect ? 1 : 0),
    answered: prevAnswered,
    updatedAt: Date.now()
  });
}

/** Read a quiz score. */
export async function getQuizScore(quizId: string): Promise<{ score: number; answered: number[] } | null> {
  const row = await db().quizScores.get(quizId);
  if (!row) return null;
  return { score: row.score, answered: Array.isArray(row.answered) ? row.answered : [] };
}

/** Mark quiz as fully answered (set answered=true semantics via empty answered array means "all done"). */
export async function markQuizComplete(quizId: string): Promise<void> {
  const row = await db().quizScores.get(quizId);
  await db().quizScores.put({
    id: quizId,
    score: row?.score ?? 0,
    answered: row?.answered ?? [],
    updatedAt: Date.now()
  });
}

// ============================================================================
// Test helpers (only used in vitest; harmless in production)
// ============================================================================

/** Reset _initialized so tests can re-run initStores. */
export function __resetForTests(): void {
  _initialized = false;
  _initializedProfile = null;
  _initPromise = null;
}