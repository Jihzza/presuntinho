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
import { clearChatDraftsForAccount } from '$lib/chat/message-drafts';
import {
  revokeAuthenticatedPushBinding,
  unsubscribeLocalPushSubscription
} from '$lib/push';
import { resetStores } from '$lib/state/stores';
import { getAuthSession, getMyAccount, signOut, accountsEnabled } from './auth';

/** True when a Supabase auth session exists (signed in via email/Google/etc.). */
export async function hasSupabaseSession(): Promise<boolean> {
  if (!accountsEnabled()) return false;
  return Boolean(await getAuthSession());
}

export type BridgeResult = 'bridged' | 'needs-handle' | 'no-session';

function clearLocalIdentity(profile: ProfileId | null | undefined): void {
  if (profile) clearChatDraftsForAccount(profile);
  // With an active local session, clear every stray key and publish that exact
  // identity. Without one, publish the authenticated UUID explicitly instead
  // of a global tombstone that could evict a newer B login in another tab.
  if (getSession()) clearSession();
  else if (profile) clearSession(profile);
  else clearSession();
  resetStores();
}

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
  const authUserId = authSession.user.id;
  const localSession = getSession();
  // An existing local session is reusable only for the exact authenticated
  // Supabase identity. On a shared device, remove A before hydrating B.
  if (localSession?.profile === authUserId) return 'bridged';
  if (localSession) clearLocalIdentity(localSession.profile);

  const account = await getMyAccount();
  // Auth may change while the account row is loading. Never publish A's row
  // into B's local session; the next bridge pass will hydrate the new user.
  const currentAuthSession = await getAuthSession();
  if (!currentAuthSession || currentAuthSession.user.id !== authUserId) {
    const staleLocal = getSession();
    if (staleLocal && staleLocal.profile !== currentAuthSession?.user.id) {
      clearLocalIdentity(staleLocal.profile);
    }
    return 'no-session';
  }
  if (!account?.handle || account.id !== authUserId) return 'needs-handle';
  // Each account = its own local profile (its uuid), so two real users never
  // share a database.
  const profile = account.id as ProfileId;
  registerKnownMember(profile);
  setSession(profile, 'primary');
  return 'bridged';
}

/** Sign out of both the real account and the local profile session. */
export async function signOutEverywhere(): Promise<void> {
  const localProfile = getSession()?.profile;
  let authenticatedProfile: ProfileId | null = null;
  try {
    const authSession = accountsEnabled() ? await getAuthSession() : null;
    authenticatedProfile = (authSession?.user.id as ProfileId | undefined) ?? null;
    if (authSession) {
      // Stop new account-wide replay work before its private IndexedDB Blobs
      // are purged. A request already accepted by the network remains governed
      // by its stable client id and server truth.
      try {
        const { stopAndPurgeAccountChatOutbox } = await import('$lib/chat/account-chat-outbox-pump');
        await stopAndPurgeAccountChatOutbox(authSession.user.id);
      } catch {
        /* layout/session cleanup retries the local purge below */
      }
      // This must complete while the JWT still identifies the old account.
      // Keep the browser subscription itself so a subsequent account can bind
      // the same installation without another permission prompt.
      try {
        await revokeAuthenticatedPushBinding();
      } catch {
        // Fail closed before the JWT disappears: the stale server row may
        // remain, but its endpoint can no longer receive A's private pushes.
        await unsubscribeLocalPushSubscription();
      }
      await signOut();
    }
  } catch {
    /* best-effort — still clear the local session below */
  }
  // Text drafts live only on this device. Remove the active account's private
  // scope before dropping its identity so a shared-device login can never
  // render the previous person's unsent words.
  // Honour the name: always drop all local state too, otherwise the app stays
  // unlocked after "sign out" and leaks A into B on a shared device.
  clearLocalIdentity(localProfile ?? authenticatedProfile);
  // If a corrupted/stale local profile differed from the authenticated user,
  // invalidate both identities in sibling tabs without retaining either key.
  if (localProfile && authenticatedProfile && localProfile !== authenticatedProfile) {
    clearSession(authenticatedProfile);
  }
}
