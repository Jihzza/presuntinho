// src/lib/lockscreen/lockscreen.ts
//
// Lock screens — an opt-in, couple-friendly replacement for the old "love
// lock". A lock screen personalizes the splash gate (its emoji / title /
// message replace the generic copy) and, when it carries a passphrase, ADDS a
// second, user-created way to unlock the app.
//
// SECURITY
//   * A lock-screen passphrase is a real credential the user explicitly set.
//     It is hashed with the SAME PBKDF2-SHA256 primitive as the account
//     password (see $lib/auth/hash) — we NEVER store or compare plaintext.
//   * A lock screen with NO passphrase only themes the gate; it grants nothing.
//   * This module is purely additive: it never touches, weakens, or replaces
//     the PBKDF2 account-password gate. The real password keeps working as-is.
//
// STORAGE: local-first. The list lives in localStorage under 'fat-lockscreens'
// and the single active id under 'fat-lockscreen-active'. Every access is
// guarded (SSR / private-mode / quota) so it can never throw.

import { hashPassword, verifyPassword, type ProfileId } from '$lib/auth/hash';

const STORE_KEY = 'fat-lockscreens';
const ACTIVE_KEY = 'fat-lockscreen-active';

/** Fired on any mutation so open UIs (settings, gate) can refresh. */
export const LOCKSCREEN_EVENT = 'presuntinho:lockscreens-changed';

export interface LockScreen {
  id: string;
  title: string;
  message: string;
  emoji: string;
  /** PBKDF2-SHA256 hash of the passphrase (hex). Absent → visuals-only lock. */
  passphraseHash?: string;
  /** Salt paired with `passphraseHash` (written together on create). */
  salt?: string;
  createdAt: number;
  /**
   * Optional partner @handle this lock screen is aimed at ("lock a connected
   * account"). Stored normalized (no leading '@', lowercased). Local-only for
   * now — see the note on the couple sync follow-up below.
   */
  targetHandle?: string;
  /**
   * Profile to open when the passphrase unlocks the app. Captured from the
   * logged-in creator so re-entry via the lock passphrase restores THEIR
   * session instead of a hard-coded default. Falls back to 'fatma' if unknown.
   */
  ownerProfile?: ProfileId;
}

export interface CreateLockScreenInput {
  title: string;
  message: string;
  emoji: string;
  /** Optional — when set, the lock screen can also unlock the app. */
  passphrase?: string;
  targetHandle?: string;
  ownerProfile?: ProfileId;
}

function hasLS(): boolean {
  return typeof localStorage !== 'undefined';
}

function emit(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(LOCKSCREEN_EVENT));
  } catch {
    /* CustomEvent unavailable (very old / non-DOM env) — non-fatal */
  }
}

function isLockScreen(v: unknown): v is LockScreen {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.title === 'string' &&
    typeof o.message === 'string' &&
    typeof o.emoji === 'string' &&
    typeof o.createdAt === 'number'
  );
}

function readAll(): LockScreen[] {
  if (!hasLS()) return [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLockScreen);
  } catch {
    return [];
  }
}

function writeAll(list: LockScreen[]): void {
  if (!hasLS()) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    /* quota / private-mode — best-effort, never throw */
  }
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the timestamp id */
  }
  return `ls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function randomSalt(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return `lockscreen-${hex}`;
    }
  } catch {
    /* fall through */
  }
  return `lockscreen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Normalize a partner @handle: strip leading '@', lowercase, trim. */
export function normalizeLockHandle(handle: string): string {
  return handle.trim().replace(/^@+/, '').toLowerCase();
}

export function listLockScreens(): LockScreen[] {
  return readAll();
}

export async function createLockScreen(input: CreateLockScreenInput): Promise<LockScreen> {
  const passphrase = (input.passphrase ?? '').trim();
  const screen: LockScreen = {
    id: newId(),
    title: input.title.trim(),
    message: input.message.trim(),
    emoji: input.emoji.trim() || '🔒',
    createdAt: Date.now()
  };
  const target = input.targetHandle ? normalizeLockHandle(input.targetHandle) : '';
  if (target) screen.targetHandle = target;
  if (input.ownerProfile) screen.ownerProfile = input.ownerProfile;
  if (passphrase) {
    const salt = randomSalt();
    screen.salt = salt;
    // PBKDF2 on create; verified with the same params on unlock. Never plaintext.
    screen.passphraseHash = await hashPassword(passphrase, salt);
  }
  const list = readAll();
  list.push(screen);
  writeAll(list);
  emit();
  return screen;
}

/**
 * Patch a lock screen's non-secret fields (title/message/emoji/targetHandle).
 * Id and createdAt are immutable. To change a passphrase, delete + recreate.
 */
export function updateLockScreen(
  id: string,
  patch: Partial<Omit<LockScreen, 'id' | 'createdAt'>>
): LockScreen | null {
  const list = readAll();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const current = list[idx];
  const next: LockScreen = { ...current, ...patch, id: current.id, createdAt: current.createdAt };
  if (patch.targetHandle !== undefined) {
    const t = patch.targetHandle ? normalizeLockHandle(patch.targetHandle) : '';
    if (t) next.targetHandle = t;
    else delete next.targetHandle;
  }
  list[idx] = next;
  writeAll(list);
  emit();
  return next;
}

export function deleteLockScreen(id: string): void {
  const list = readAll().filter((s) => s.id !== id);
  const wasActive = getActiveLockScreenId() === id;
  writeAll(list);
  // Clearing a dangling active pointer also emits; otherwise emit here.
  if (wasActive) setActiveLockScreen(null);
  else emit();
}

export function getActiveLockScreenId(): string | null {
  if (!hasLS()) return null;
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function getActiveLockScreen(): LockScreen | null {
  const id = getActiveLockScreenId();
  if (!id) return null;
  return readAll().find((s) => s.id === id) ?? null;
}

/**
 * Activate a lock screen, or pass null to deactivate. ONE active at a time —
 * the key holds a single id, so activating a new screen replaces the previous.
 * Unknown ids are ignored (no-op) so a stale id can't blank the gate.
 */
export function setActiveLockScreen(id: string | null): void {
  if (!hasLS()) return;
  try {
    if (id === null) {
      localStorage.removeItem(ACTIVE_KEY);
    } else {
      if (!readAll().some((s) => s.id === id)) return;
      localStorage.setItem(ACTIVE_KEY, id);
    }
  } catch {
    /* best-effort */
  }
  emit();
}

export function lockScreenHasPassphrase(screen: LockScreen | null): boolean {
  return !!(screen && screen.passphraseHash && screen.salt);
}

/**
 * Verify `pass` against the stored PBKDF2 hash of lock screen `id`. Returns
 * false (never throws) for a missing screen, a visuals-only screen (no
 * passphrase), an empty input, or any crypto failure.
 */
export async function verifyLockPassphrase(id: string, pass: string): Promise<boolean> {
  const screen = readAll().find((s) => s.id === id);
  if (!screen || !screen.passphraseHash || !screen.salt) return false;
  const candidate = (pass ?? '').trim();
  if (!candidate) return false;
  try {
    return await verifyPassword(candidate, screen.salt, screen.passphraseHash);
  } catch {
    return false;
  }
}

/**
 * Find an ACTIVE lock screen whose targetHandle matches `handle` and whose
 * passphrase verifies. Used by the login @tag path so a partner @handle +
 * passphrase can open the app.
 *
 * NOTE (follow-up): this is LOCAL only — it resolves against lock screens
 * stored in THIS device's localStorage. Delivering a lock screen a user made
 * for their partner to the partner's OTHER device needs the Supabase couple
 * sync (space_members / couple_* tables). That cross-device push is a
 * deliberate follow-up; the local slice proves the flow end-to-end here.
 */
export async function verifyHandleUnlock(
  handle: string,
  pass: string
): Promise<LockScreen | null> {
  const active = getActiveLockScreen();
  if (!active || !active.targetHandle) return null;
  if (active.targetHandle !== normalizeLockHandle(handle)) return null;
  const ok = await verifyLockPassphrase(active.id, pass);
  return ok ? active : null;
}
