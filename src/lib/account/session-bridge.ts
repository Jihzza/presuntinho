// Session bridge — turns a real Supabase login (email/password, Google, later
// Saikan ID) into the app's local profile session, so the rest of the app
// (couple, chat, points, route guards) keeps working while identity lives on
// real accounts.
//
// MULTI-TENANT: each account opens its OWN local profile/IndexedDB, keyed by the
// account id (uuid). The old code collapsed every non-'fatma' handle onto the
// single shared 'daniel' profile, so any two real users read/wrote the same
// local DB and collided on the couple backend — that made real accounts
// meaningless. Now account.id is the ProfileId, exactly like the local
// onboarding path (initStores(uuid)); couples are formed as uuid spaces, not by
// sharing a profile slot.

import type { ProfileId } from '$lib/auth/hash';
import { getSession, setSession, clearSession, registerKnownMember } from '$lib/auth/session';
import { resetStores } from '$lib/state/stores';
import { getAuthSession, getMyAccount, signOut, accountsEnabled } from './auth';

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
  // Each account = its own local profile (its uuid), so two real users never
  // share a database.
  const profile = account.id as ProfileId;
  registerKnownMember(profile);
  setSession(profile, 'primary');
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
  // Reset the in-memory singleton stores (XP/theme/easter-egg progress) so the
  // previous user's state can't bleed into the next login on this device.
  resetStores();
}
