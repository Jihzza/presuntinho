// Reactive account state (Phase 1). Tracks the signed-in Supabase user and their
// `accounts` row (@handle profile), and keeps them fresh on auth changes so the
// whole UI can react to login/logout without prop-drilling.

import type { User } from '@supabase/supabase-js';
import { accountsEnabled, getAuthUser, getMyAccount, onAuthChange, type Account } from './auth';

export const accountState = $state<{
  ready: boolean; // finished the initial check
  user: User | null; // signed-in auth user (has email), or null
  account: Account | null; // their @handle row, or null if not yet claimed
}>({ ready: false, user: null, account: null });

let unsub: (() => void) | null = null;

/** True once signed in AND a @handle has been claimed. */
export function isOnboardedAccount(): boolean {
  return Boolean(accountState.user && accountState.account);
}

async function hydrate(user: User | null): Promise<void> {
  accountState.user = user;
  if (!user) {
    accountState.account = null;
    accountState.ready = true;
    return;
  }
  try {
    accountState.account = await getMyAccount();
  } catch (e) {
    console.warn('[account] load failed', e);
    accountState.account = null;
  }
  accountState.ready = true;
}

/** Start tracking auth state. Idempotent; safe to call from the layout onMount. */
export async function startAccountSync(): Promise<void> {
  if (!accountsEnabled()) {
    accountState.ready = true;
    return;
  }
  if (unsub) return;
  try {
    await hydrate(await getAuthUser());
  } catch (e) {
    console.warn('[account] initial hydrate failed', e);
    accountState.ready = true;
  }
  unsub = onAuthChange((user) => void hydrate(user));
}

export function stopAccountSync(): void {
  unsub?.();
  unsub = null;
}

/** Re-read the account row (after claiming/editing a handle). */
export async function refreshAccount(): Promise<void> {
  if (accountState.user) accountState.account = await getMyAccount();
}
