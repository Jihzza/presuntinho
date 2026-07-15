// Reactive account state (Phase 1). Tracks the signed-in Supabase user and their
// `accounts` row (@handle profile), and keeps them fresh on auth changes so the
// whole UI can react to login/logout without prop-drilling.

import type { User } from '@supabase/supabase-js';
import { accountsEnabled, getAuthUser, getMyAccount, onAuthChange, type Account } from './auth';
import { isCurrentAccountHydration } from './account-hydration';

export const accountState = $state<{
  ready: boolean; // finished the initial check
  user: User | null; // signed-in auth user (has email), or null
  account: Account | null; // their @handle row, or null if not yet claimed
}>({ ready: false, user: null, account: null });

let unsub: (() => void) | null = null;
let startPromise: Promise<void> | null = null;
let hydrateEpoch = 0;
let lifecycleEpoch = 0;

/** True once signed in AND a @handle has been claimed. */
export function isOnboardedAccount(): boolean {
  return Boolean(accountState.user && accountState.account);
}

async function hydrate(user: User | null): Promise<void> {
  const requestEpoch = ++hydrateEpoch;
  const previousUserId = accountState.user?.id ?? null;
  const identityChanged = previousUserId !== (user?.id ?? null);
  accountState.user = user;
  // Never leave account A visible while B (or logout) is hydrating.
  if (identityChanged) accountState.account = null;
  if (!user) {
    accountState.ready = true;
    return;
  }
  try {
    const account = await getMyAccount();
    if (isCurrentAccountHydration(requestEpoch, hydrateEpoch, user.id, accountState.user?.id)) {
      accountState.account = account;
    }
  } catch (e) {
    if (isCurrentAccountHydration(requestEpoch, hydrateEpoch, user.id, accountState.user?.id)) {
      console.warn('[account] load failed', e);
      if (identityChanged) accountState.account = null;
    }
  }
  if (isCurrentAccountHydration(requestEpoch, hydrateEpoch, user.id, accountState.user?.id)) {
    accountState.ready = true;
  }
}

/** Start tracking auth state. Idempotent; safe to call from the layout onMount. */
export async function startAccountSync(): Promise<void> {
  if (!accountsEnabled()) {
    accountState.ready = true;
    return;
  }
  if (unsub) return;
  if (startPromise) return startPromise;
  const generation = lifecycleEpoch;
  const pending = (async () => {
    try {
      await hydrate(await getAuthUser());
    } catch (e) {
      if (generation === lifecycleEpoch) {
        console.warn('[account] initial hydrate failed', e);
        accountState.ready = true;
      }
    }
    if (generation === lifecycleEpoch && !unsub) {
      unsub = onAuthChange((user) => void hydrate(user));
    }
  })();
  startPromise = pending;
  try {
    await pending;
  } finally {
    if (startPromise === pending) startPromise = null;
  }
}

export function stopAccountSync(): void {
  lifecycleEpoch += 1;
  hydrateEpoch += 1;
  startPromise = null;
  unsub?.();
  unsub = null;
}

/** Re-read the account row (after claiming/editing a handle). */
export async function refreshAccount(): Promise<void> {
  if (accountState.user) await hydrate(accountState.user);
}
