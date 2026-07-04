// Data-driven easter eggs loader. Reads /config/easterEggs.json at runtime.
// Single source of truth — easterEggs.ts consumes these getters instead of
// keeping inline copies of SECRET_DEFS / HEART_TIERS / MASCOT_TIPS, and the
// /secrets + /memorias routes render from the same catalogue.
//
// V8 change: the old `fat-secret-*` localStorage API is GONE. Discovery
// truth lives in the Dexie `secrets` table (written by discoverSecret() in
// $lib/state/stores). The helpers below are async and read that table.

import { db } from './state/db';

export interface Secret {
  id: string;
  icon: string;
  name: string;
  hint: string;
  reward: string;
  badge: string | null;
  trigger: string;
}

export interface Badge {
  id: string;
  icon: string;
  label: string;
}

export interface HeartTier {
  at: number;
  msg: string;
  xp: number;
  conf: number;
  emoji: string;
  /** Optional badge id awarded when the tier is reached (e.g. b13 at 100). */
  badge?: string;
}

export interface EasterEggsData {
  version: number;
  secrets: Secret[];
  badges: Badge[];
  heartTiers: HeartTier[];
  mascotTips: string[];
}

let cache: EasterEggsData | null = null;

export async function loadEasterEggs(): Promise<EasterEggsData | null> {
  if (cache) return cache;
  if (typeof window === 'undefined') return null;
  try {
    const r = await fetch('/config/easterEggs.json');
    if (!r.ok) return null;
    cache = await r.json();
    return cache;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to load easterEggs.json:', e);
    return null;
  }
}

export async function getSecrets(): Promise<Secret[]> {
  const d = await loadEasterEggs();
  return d?.secrets ?? [];
}

export async function getBadges(): Promise<Badge[]> {
  const d = await loadEasterEggs();
  return d?.badges ?? [];
}

export async function getHeartTiers(): Promise<HeartTier[]> {
  const d = await loadEasterEggs();
  return d?.heartTiers ?? [];
}

export async function getMascotTips(): Promise<string[]> {
  const d = await loadEasterEggs();
  return d?.mascotTips ?? [];
}

/**
 * Check if a secret id has been discovered. Dexie-backed — the `secrets`
 * table written by discoverSecret() is the single source of truth
 * (replaces the dead `fat-secret-<id>` localStorage flags).
 */
export async function isSecretUnlocked(secretId: string): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    const row = await db().secrets.get(secretId);
    return Boolean(row?.discovered);
  } catch {
    return false;
  }
}

/**
 * Timestamp (ms) at which a secret was discovered, or null when it has not
 * been discovered yet. Dexie-backed (replaces `fat-secret-<id>-at`).
 */
export async function getSecretDiscoveredAt(secretId: string): Promise<number | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const row = await db().secrets.get(secretId);
    return row?.discoveredAt ? row.discoveredAt : null;
  } catch {
    return null;
  }
}
