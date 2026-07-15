import type { HashSlot, ProfileId } from './hash';

const SESSION_KEY_PREFIX = 'presuntinho-session';
const LOCKOUT_KEY_PREFIX = 'presuntinho-lockout';
const ATTEMPTS_KEY_PREFIX = 'presuntinho-attempts';
// Ids of dynamic (non-legacy) members created via onboarding. Kept in
// localStorage so getSession()/clearSession() can stay SYNCHRONOUS while still
// discovering uuid members — the registry (IndexedDB) is async and can't be
// read here. The two legacy profiles are always included below.
const KNOWN_MEMBERS_KEY = 'presuntinho-known-members';
const SESSION_SYNC_KEY = 'presuntinho-session-sync-v1';
const SESSION_CHANNEL_NAME = 'presuntinho-session-v1';
export const SESSION_CHANGED_EVENT = 'presuntinho:session-changed' as const;

const LOCKOUT_DURATION_MS = 30_000;
const MAX_ATTEMPTS = 3;
const LEGACY_PROFILES: ProfileId[] = ['fatma', 'daniel'];

/**
 * Is this id one of the two grandfathered single-tenant profiles?
 * SINGLE HOME for the check — call this instead of inlining
 * `id === 'fatma' || id === 'daniel'` so a future legacy→uuid migration
 * (or a third grandfathered id) is a one-line change.
 */
export function isLegacyProfile(id: string | null | undefined): boolean {
  return !!id && (LEGACY_PROFILES as string[]).includes(id);
}

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

export interface SessionChangeDetail {
  session: Session | null;
  previousProfile: ProfileId | null;
  reason: 'set' | 'clear' | 'remote';
}

type SessionSignal = {
  v: 1;
  id: string;
  source: string;
  at: number;
  action: 'clear' | 'switch';
  profile: ProfileId | null;
  previousProfile: ProfileId | null;
};

const sessionSyncSource =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let sessionChannel: BroadcastChannel | null = null;
let sessionSyncStarted = false;
const seenSessionSignals = new Set<string>();

function signalId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseSessionSignal(value: unknown): SessionSignal | null {
  let candidate = value;
  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object') return null;
  const raw = candidate as Partial<SessionSignal>;
  if (
    raw.v !== 1 ||
    typeof raw.id !== 'string' ||
    typeof raw.source !== 'string' ||
    typeof raw.at !== 'number' ||
    !Number.isFinite(raw.at) ||
    (raw.action !== 'clear' && raw.action !== 'switch') ||
    (raw.profile !== null && typeof raw.profile !== 'string') ||
    (raw.previousProfile !== null && typeof raw.previousProfile !== 'string')
  ) return null;
  return raw as SessionSignal;
}

function removeSessionRecords(profile?: ProfileId): void {
  if (typeof sessionStorage === 'undefined') return;
  if (profile) {
    sessionStorage.removeItem(sessionKey(profile));
    return;
  }
  // Include orphaned dynamic ids even if the local known-member registry was
  // cleared or corrupted before logout.
  const keys = new Set(knownProfiles().map(sessionKey));
  try {
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(`${SESSION_KEY_PREFIX}-`)) keys.add(key);
    }
  } catch {
    /* the known-profile keys still cover normal operation */
  }
  for (const key of keys) sessionStorage.removeItem(key);
}

function dispatchSessionChange(detail: SessionChangeDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SessionChangeDetail>(SESSION_CHANGED_EVENT, { detail }));
}

function rememberSignal(id: string): boolean {
  if (seenSessionSignals.has(id)) return false;
  seenSessionSignals.add(id);
  if (seenSessionSignals.size > 64) {
    const oldest = seenSessionSignals.values().next().value as string | undefined;
    if (oldest) seenSessionSignals.delete(oldest);
  }
  return true;
}

function applyRemoteSessionSignal(value: unknown): void {
  const signal = parseSessionSignal(value);
  if (!signal || signal.source === sessionSyncSource || !rememberSignal(signal.id)) return;
  const current = getSession();
  if (!current || current.unlockedAt > signal.at) return;
  const shouldClear = signal.action === 'switch'
    ? current.profile !== signal.profile
    : signal.profile === null || current.profile === signal.profile;
  if (!shouldClear) return;
  const previousProfile = current.profile;
  if (signal.action === 'switch') removeSessionRecords();
  else removeSessionRecords(signal.profile ?? undefined);
  dispatchSessionChange({ session: getSession(), previousProfile, reason: 'remote' });
}

function startSessionSync(): void {
  if (sessionSyncStarted || typeof window === 'undefined') return;
  sessionSyncStarted = true;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      sessionChannel = new BroadcastChannel(SESSION_CHANNEL_NAME);
      sessionChannel.addEventListener('message', (event) => applyRemoteSessionSignal(event.data));
    } catch {
      sessionChannel = null;
    }
  }
  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_SYNC_KEY && event.newValue) {
      applyRemoteSessionSignal(event.newValue);
    }
  });
  try {
    const persisted = localStorage.getItem(SESSION_SYNC_KEY);
    if (persisted) applyRemoteSessionSignal(persisted);
  } catch {
    /* BroadcastChannel/local events still work */
  }
}

function publishSessionSignal(
  action: SessionSignal['action'],
  profile: ProfileId | null,
  previousProfile: ProfileId | null
): void {
  if (typeof window === 'undefined') return;
  startSessionSync();
  const signal: SessionSignal = {
    v: 1,
    id: signalId(),
    source: sessionSyncSource,
    at: Date.now(),
    action,
    profile,
    previousProfile
  };
  rememberSignal(signal.id);
  try {
    localStorage.setItem(SESSION_SYNC_KEY, JSON.stringify(signal));
  } catch {
    /* BroadcastChannel remains the fast path */
  }
  try {
    sessionChannel?.postMessage(signal);
  } catch {
    /* the storage tombstone remains the fallback */
  }
}

/** React to login/logout/profile-switch in this tab and in sibling tabs. */
export function subscribeSessionChanges(listener: (detail: SessionChangeDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onChange = (event: Event) => {
    if (event instanceof CustomEvent) listener(event.detail as SessionChangeDetail);
  };
  window.addEventListener(SESSION_CHANGED_EVENT, onChange);
  startSessionSync();
  return () => window.removeEventListener(SESSION_CHANGED_EVENT, onChange);
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
  startSessionSync();
  const previousProfile = getSession()?.profile ?? null;
  registerKnownMember(profile);
  removeSessionRecords();
  const session: Session = { unlocked: true, profile, method, unlockedAt: Date.now() };
  sessionStorage.setItem(sessionKey(profile), JSON.stringify(session));
  dispatchSessionChange({ session, previousProfile, reason: 'set' });
  publishSessionSignal('switch', profile, previousProfile);
}

export function clearSession(profile?: ProfileId): void {
  if (typeof sessionStorage === 'undefined') return;
  startSessionSync();
  const before = getSession();
  removeSessionRecords(profile);
  const after = getSession();
  if (before?.profile !== after?.profile) {
    dispatchSessionChange({
      session: after,
      previousProfile: before?.profile ?? null,
      reason: 'clear'
    });
  }
  publishSessionSignal('clear', profile ?? before?.profile ?? null, before?.profile ?? null);
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
