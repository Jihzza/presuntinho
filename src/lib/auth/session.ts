import type { HashSlot, ProfileId } from './hash';

const SESSION_KEY_PREFIX = 'presuntinho-session';
const LOCKOUT_KEY_PREFIX = 'presuntinho-lockout';
const ATTEMPTS_KEY_PREFIX = 'presuntinho-attempts';
// Ids of dynamic (non-legacy) members created via onboarding. Kept in
// localStorage so getSession()/clearSession() can stay SYNCHRONOUS while still
// discovering uuid members — the registry (IndexedDB) is async and can't be
// read here. The two legacy profiles are always included below.
const KNOWN_MEMBERS_KEY = 'presuntinho-known-members';

const LOCKOUT_DURATION_MS = 30_000;
const MAX_ATTEMPTS = 3;
const LEGACY_PROFILES: ProfileId[] = ['fatma', 'daniel'];

/** Legacy profiles PLUS any onboarded member ids (deduped). Never throws. */
function knownProfiles(): ProfileId[] {
  if (typeof localStorage === 'undefined') return [...LEGACY_PROFILES];
  let extra: string[] = [];
  try {
    const raw = localStorage.getItem(KNOWN_MEMBERS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) extra = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    /* corrupt list — ignore, fall back to legacy only */
  }
  return [...new Set<string>([...LEGACY_PROFILES, ...extra])] as ProfileId[];
}

/**
 * Register an onboarded member's id so future getSession() calls find its
 * session. Legacy ids ('fatma'/'daniel') are already known, so this is only
 * ever needed for uuid members. Idempotent.
 */
export function registerKnownMember(id: string): void {
  if (typeof localStorage === 'undefined') return;
  if (id === 'fatma' || id === 'daniel') return;
  let extra: string[] = [];
  try {
    const raw = localStorage.getItem(KNOWN_MEMBERS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) extra = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    /* corrupt — start fresh */
  }
  if (extra.includes(id)) return;
  try {
    localStorage.setItem(KNOWN_MEMBERS_KEY, JSON.stringify([...extra, id]));
  } catch {
    /* quota — non-fatal */
  }
}

function sessionKey(profile: ProfileId): string {
  return `${SESSION_KEY_PREFIX}-${profile}`;
}
function lockoutKey(profile: ProfileId): string {
  return `${LOCKOUT_KEY_PREFIX}-${profile}`;
}
function attemptsKey(profile: ProfileId): string {
  return `${ATTEMPTS_KEY_PREFIX}-${profile}`;
}

export interface Session {
  unlocked: true;
  profile: ProfileId;
  method: HashSlot;
  unlockedAt: number;
}

export function getSession(profile?: ProfileId): Session | null {
  if (typeof sessionStorage === 'undefined') return null;
  const keys = profile ? [profile] : knownProfiles();
  for (const p of keys) {
    const raw = sessionStorage.getItem(sessionKey(p));
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Session;
      if (parsed?.unlocked && parsed.profile === p) return parsed;
    } catch {
      sessionStorage.removeItem(sessionKey(p));
    }
  }
  return null;
}

export function setSession(profile: ProfileId, method: HashSlot): void {
  if (typeof sessionStorage === 'undefined') return;
  clearSession();
  const session: Session = { unlocked: true, profile, method, unlockedAt: Date.now() };
  sessionStorage.setItem(sessionKey(profile), JSON.stringify(session));
}

export function clearSession(profile?: ProfileId): void {
  if (typeof sessionStorage === 'undefined') return;
  const keys = profile ? [profile] : knownProfiles();
  for (const p of keys) sessionStorage.removeItem(sessionKey(p));
}

export function isLockedOut(profile: ProfileId): { locked: boolean; remainingMs: number } {
  if (typeof localStorage === 'undefined') return { locked: false, remainingMs: 0 };
  const lockUntil = parseInt(localStorage.getItem(lockoutKey(profile)) || '0', 10);
  const now = Date.now();
  if (lockUntil > now) return { locked: true, remainingMs: lockUntil - now };
  if (lockUntil > 0) localStorage.removeItem(lockoutKey(profile));
  return { locked: false, remainingMs: 0 };
}

export function recordFailedAttempt(profile: ProfileId): { attempts: number; locked: boolean; remainingMs: number } {
  if (typeof localStorage === 'undefined') return { attempts: 0, locked: false, remainingMs: 0 };
  const attempts = parseInt(localStorage.getItem(attemptsKey(profile)) || '0', 10) + 1;
  localStorage.setItem(attemptsKey(profile), String(attempts));
  if (attempts >= MAX_ATTEMPTS) {
    const lockUntil = Date.now() + LOCKOUT_DURATION_MS;
    localStorage.setItem(lockoutKey(profile), String(lockUntil));
    localStorage.removeItem(attemptsKey(profile));
    return { attempts, locked: true, remainingMs: LOCKOUT_DURATION_MS };
  }
  return { attempts, locked: false, remainingMs: 0 };
}

export function resetAttempts(profile: ProfileId): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(attemptsKey(profile));
  localStorage.removeItem(lockoutKey(profile));
}
