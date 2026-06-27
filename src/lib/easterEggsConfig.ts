// Data-driven easter eggs loader. Reads /config/easterEggs.json at runtime.
// Single source of truth — replaces the inline SECRET_DEFS, HEART_TIERS,
// and MASCOT_TIPS arrays that previously lived in easterEggs.ts /
// secrets/+page.svelte.

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

// Convenience: check if a secret id is unlocked for this user.
// Falls back to localStorage (no Dexie reads to keep this pure / sync-safe).
export function isSecretUnlocked(secretId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(`fat-secret-${secretId}`) === '1';
  } catch {
    return false;
  }
}

export function getSecretDiscoveredAt(secretId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(`fat-secret-${secretId}-at`);
    return v ? parseInt(v, 10) : null;
  } catch {
    return null;
  }
}