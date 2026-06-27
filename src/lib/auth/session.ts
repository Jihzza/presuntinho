// Session storage keys
const SESSION_KEY = 'presuntinho-session';
const LOCKOUT_KEY = 'presuntinho-lockout';
const ATTEMPTS_KEY = 'presuntinho-attempts';

const LOCKOUT_DURATION_MS = 30_000; // 30 seconds
const MAX_ATTEMPTS = 3;

export interface Session {
  unlocked: true;
  method: 'primary' | 'secret';
  unlockedAt: number;
}

export function getSession(): Session | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(method: 'primary' | 'secret'): void {
  const session: Session = { unlocked: true, method, unlockedAt: Date.now() };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function isLockedOut(): { locked: boolean; remainingMs: number } {
  if (typeof localStorage === 'undefined') return { locked: false, remainingMs: 0 };
  const lockUntil = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0', 10);
  const now = Date.now();
  if (lockUntil > now) {
    return { locked: true, remainingMs: lockUntil - now };
  }
  // Expired or never set — clear it
  if (lockUntil > 0) localStorage.removeItem(LOCKOUT_KEY);
  return { locked: false, remainingMs: 0 };
}

export function recordFailedAttempt(): { attempts: number; locked: boolean; remainingMs: number } {
  if (typeof localStorage === 'undefined') return { attempts: 0, locked: false, remainingMs: 0 };
  const attempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10) + 1;
  localStorage.setItem(ATTEMPTS_KEY, String(attempts));
  if (attempts >= MAX_ATTEMPTS) {
    const lockUntil = Date.now() + LOCKOUT_DURATION_MS;
    localStorage.setItem(LOCKOUT_KEY, String(lockUntil));
    localStorage.removeItem(ATTEMPTS_KEY);
    return { attempts, locked: true, remainingMs: LOCKOUT_DURATION_MS };
  }
  return { attempts, locked: false, remainingMs: 0 };
}

export function resetAttempts(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(ATTEMPTS_KEY);
  localStorage.removeItem(LOCKOUT_KEY);
}