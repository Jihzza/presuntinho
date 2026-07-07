// Session bridge — turns a real Supabase login (email/password, Google, later
// Saikan ID) into the app's local profile session, so the rest of the app
// (couple, chat, points, route guards) keeps working unchanged while identity
// moves to real accounts.
//
// The couple app's internal identity is a ProfileId ('fatma' | 'daniel'). We map
// the signed-in account's @handle to that profile: 'fatma' → fatma, anything
// else → daniel. That covers the launch couple exactly; multi-couple onboarding
// (arbitrary handles → per-couple profile slots) is the couple-space model's job
// and is tracked separately.

import type { ProfileId } from '$lib/auth/hash';
import { getSession, setSession, clearSession, registerKnownMember } from '$lib/auth/session';
import { getAuthSession, getMyAccount, signOut, accountsEnabled } from './auth';

/** Map an account @handle to the app's local ProfileId. */
function handleToProfile(handle: string): ProfileId {
  return handle === 'fatma' ? 'fatma' : 'daniel';
}

/** True when a Supabase auth session exists (signed in via email/Google/etc.). */
export async function hasSupabaseSession(): Promise<boolean> {
  if (!accountsEnabled()) return false;
  return Boolean(await getAuthSession());
}

export type BridgeResult = 'bridged' | 'needs-handle' | 'no-session';

/**
 * If signed in to a real account, establish the matching local profile session
 * so the app opens. Returns:
 *  - 'bridged'      — local session is now set (or was already set)
 *  - 'needs-handle' — signed in but no @handle claimed yet (send to /conta)
 *  - 'no-session'   — not signed in to a real account
 * Idempotent and safe to call on every mount.
 */
export async function bridgeSupabaseSession(): Promise<BridgeResult> {
  if (!accountsEnabled()) return 'no-session';
  const authSession = await getAuthSession();
  if (!authSession) return 'no-session';
  // Already have a local session — nothing to do.
  if (getSession()) return 'bridged';
  const account = await getMyAccount();
  if (!account?.handle) return 'needs-handle';
  const profile = handleToProfile(account.handle);
  registerKnownMember(profile);
  setSession(profile, profile === 'fatma' ? 'primary' : 'daniel');
  return 'bridged';
}

/** Sign out of both the real account and the local profile session. */
export async function signOutEverywhere(): Promise<void> {
  try {
    if (accountsEnabled() && (await getAuthSession())) await signOut();
  } catch {
    /* best-effort — still clear the local session below */
  }
  // Honour the name: always drop the local profile session too, otherwise the
  // app stays unlocked after "sign out" (a shared-device exposure).
  clearSession();
}
