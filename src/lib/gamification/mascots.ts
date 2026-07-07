// Gamification — mascots (V9, Duolingo-inspired collection).
//
// A small roster of collectible mascots the user unlocks by earning XP
// or badges. The ACTIVE mascot is rendered by Mascot.svelte (the FAB)
// and cheers the user on in QuizVictory / CaminhoPath.
//
// Persistence: the active mascot id lives on the singleton Dexie
// `settings` row ('main') as a NEW NON-INDEXED field (`activeMascot`) —
// same additive pattern as streak.ts uses on the `state` row, so db.ts
// (owned by the foundation) needs no schema bump.
//
// Names / descriptions / personality lines are i18n keys
// (`mascots.<id>.name|desc|line`) resolved by the UI via $t — this
// module only carries the stable ids, emoji art and unlock rules.
//
// SSR safety: same contract as streak.ts — callers MUST invoke the
// async helpers from onMount / behind a browser check.

import type { UpdateSpec } from 'dexie';
import { db } from '$lib/state/db';
import type { SettingsRow } from '$lib/state/db';

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

export interface MascotDef {
  id: string;
  emoji: string;
  /** XP needed to unlock (undefined + no minBadges = free). */
  minXp?: number;
  /** Unlocked badge count needed to unlock. */
  minBadges?: number;
  /** The three personal "família" mascots (Fatma, Rafa, o gato Hamy). They are
   *  always unlocked and get special treatment: a glowing aura + a gentle
   *  heartbeat idle, and a heart burst instead of the generic sparkle. */
  special?: boolean;
}

export const MASCOTS: readonly MascotDef[] = Object.freeze([
  // ── Família (especiais) — sempre desbloqueadas, com brilho próprio. ──
  { id: 'fatma', emoji: '🌙', special: true },
  { id: 'rafa', emoji: '🧔', special: true },
  { id: 'hamy', emoji: '🐈', special: true },
  // ── Coleção clássica (desbloqueadas por XP / medalhas). ──
  { id: 'porquinho', emoji: '🐷' },
  { id: 'perfume', emoji: '🧴' },
  { id: 'bola-barca', emoji: '⚽', minXp: 100 },
  { id: 'gata-anime', emoji: '🐱', minXp: 250 },
  { id: 'moto', emoji: '🏍️', minXp: 500 },
  { id: 'falcao-tunisia', emoji: '🦅', minXp: 750 },
  { id: 'coracao', emoji: '💖', minBadges: 10 }
]);

/** Is this mascot one of the special "família" trio? */
export function isSpecialMascot(id: string | undefined): boolean {
  return Boolean(mascotById(id)?.special);
}

/** Default active mascot — 🧴 preserves the pre-V9 FAB appearance. */
export const DEFAULT_MASCOT_ID = 'perfume';

// ---------------------------------------------------------------------------
// Arte (V10.4) — cada mascote tem 8 poses + retrato em /static/mascotes/<id>/
// (webp com fundo transparente, gerados por scripts/build-mascots.mjs).
// ---------------------------------------------------------------------------

/** Poses disponíveis nas folhas de arte (ordem das células 4×2). */
export type MascotPose =
  | 'hero'
  | 'wave'
  | 'jump'
  | 'think'
  | 'sleep'
  | 'cheer'
  | 'point'
  | 'love'
  | 'sit';

/** URL absoluto do webp de uma pose (todas as mascotes têm as 9). */
export function mascotArt(id: string, pose: MascotPose = 'wave'): string {
  const safe = mascotById(id) ? id : DEFAULT_MASCOT_ID;
  return `/mascotes/${safe}/${pose}.webp`;
}

/** Mapa emoção → pose (o MascotAvatar usa quando não recebe pose explícita). */
export function poseForEmotion(emotion: string | undefined): MascotPose {
  switch (emotion) {
    case 'euphoric':
      return 'cheer';
    case 'happy':
      return 'wave';
    case 'worried':
    case 'sad':
      return 'think';
    default:
      return 'sit';
  }
}

/** Window event dispatched whenever the active mascot changes. */
export const MASCOT_CHANGED_EVENT = 'presuntinho:mascot-changed';

export function mascotById(id: string | undefined): MascotDef | undefined {
  return MASCOTS.find((m) => m.id === id);
}

// ---------------------------------------------------------------------------
// Active mascot persistence (settings row 'main', non-indexed field)
// ---------------------------------------------------------------------------

/** V9 additive, NON-indexed field on the singleton settings row. */
type SettingsRowV9 = SettingsRow & { activeMascot?: string };

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** The currently active mascot (falls back to the default 🧴). */
export async function getActiveMascot(): Promise<MascotDef> {
  const fallback = mascotById(DEFAULT_MASCOT_ID) ?? MASCOTS[0];
  if (!hasIndexedDb()) return fallback;
  try {
    const row = (await db().settings.get('main')) as SettingsRowV9 | undefined;
    return mascotById(row?.activeMascot) ?? fallback;
  } catch (err) {
    console.warn('[mascots] active-mascot read failed (non-fatal):', err);
    return fallback;
  }
}

/**
 * Persist the active mascot and notify listeners (Mascot.svelte FAB).
 * The cast is deliberate: `activeMascot` is additive + non-indexed and
 * db.ts must not be edited for it (streak.ts pattern).
 */
export async function setActiveMascot(id: string): Promise<void> {
  const def = mascotById(id);
  if (!def || !hasIndexedDb()) return;
  await db().settings.update('main', { activeMascot: id } as unknown as UpdateSpec<SettingsRow>);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(MASCOT_CHANGED_EVENT, { detail: { id, emoji: def.emoji } })
    );
  }
}

// ---------------------------------------------------------------------------
// Unlock checks (XP from the state row + unlocked badge count)
// ---------------------------------------------------------------------------

export interface MascotUnlockContext {
  xp: number;
  badges: number;
}

export interface MascotStatus extends MascotDef {
  unlocked: boolean;
  active: boolean;
}

/** Pure rule check — exported so views can re-derive without re-reading. */
export function isMascotUnlocked(def: MascotDef, ctx: MascotUnlockContext): boolean {
  if (typeof def.minXp === 'number' && ctx.xp < def.minXp) return false;
  if (typeof def.minBadges === 'number' && ctx.badges < def.minBadges) return false;
  return true;
}

/** Current XP + unlocked-badge count (one read each). */
export async function mascotUnlockContext(): Promise<MascotUnlockContext> {
  if (!hasIndexedDb()) return { xp: 0, badges: 0 };
  const d = db();
  const [stateRow, badgeRows] = await Promise.all([d.state.get('main'), d.badges.toArray()]);
  return {
    xp: typeof stateRow?.xp === 'number' ? stateRow.xp : 0,
    badges: badgeRows.filter((b) => b.unlocked).length
  };
}

/** Full roster with unlock/active flags, plus the context used. */
export async function mascotStatuses(): Promise<{
  statuses: MascotStatus[];
  ctx: MascotUnlockContext;
  activeId: string;
}> {
  const [ctx, active] = await Promise.all([mascotUnlockContext(), getActiveMascot()]);
  return {
    statuses: MASCOTS.map((def) => ({
      ...def,
      unlocked: isMascotUnlocked(def, ctx),
      active: def.id === active.id
    })),
    ctx,
    activeId: active.id
  };
}

/**
 * Mascots newly unlocked since the last check — drives a one-time unlock
 * celebration (mascot unlocks were previously completely silent). Persists a
 * per-profile marker in the `visited` table so each mascot celebrates exactly
 * once. On the FIRST call it silently adopts whatever's already unlocked, so
 * existing users aren't flooded with celebrations for mascots earned long ago;
 * only genuine crossings fire afterwards. Excludes the always-unlocked special
 * "família" mascots.
 */
export async function claimNewMascotUnlocks(): Promise<string[]> {
  if (!hasIndexedDb()) return [];
  const d = db();
  const { statuses } = await mascotStatuses();
  const unlocked = statuses.filter((s) => s.unlocked && !s.special).map((s) => s.id);
  const now = Date.now();
  const seeded = await d.visited.get('mascot-celebrated:__seeded__');
  if (!seeded?.visited) {
    const rows = unlocked.map((id) => ({ id: `mascot-celebrated:${id}`, visited: true, visitedAt: now }));
    rows.push({ id: 'mascot-celebrated:__seeded__', visited: true, visitedAt: now });
    await d.visited.bulkPut(rows);
    return [];
  }
  const fresh: string[] = [];
  for (const id of unlocked) {
    const marker = await d.visited.get(`mascot-celebrated:${id}`);
    if (!marker?.visited) {
      await d.visited.put({ id: `mascot-celebrated:${id}`, visited: true, visitedAt: now });
      fresh.push(id);
    }
  }
  return fresh;
}
