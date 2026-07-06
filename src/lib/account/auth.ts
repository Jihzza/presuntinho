// Real accounts — Phase 1 client layer. Wraps Supabase Auth (email/password +
// magic-link) and the `accounts` table (searchable @handle profile). This is
// the foundation the contacts / couple / group features build on.
//
// Gated on isMultiplayerConfigured() like the rest of the Supabase layer, so an
// unconfigured build simply reports "not available" instead of throwing.

import type { Session, User } from '@supabase/supabase-js';
import { isMultiplayerConfigured } from '$lib/multiplayer/config';
import { getSupabaseClient } from '$lib/multiplayer/client';

export interface Account {
  id: string;
  handle: string;
  display_name: string | null;
  emoji: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export function accountsEnabled(): boolean {
  return isMultiplayerConfigured();
}

/** 3–20 chars, lowercase letters/numbers/underscore (mirrors the DB CHECK). */
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, '');
}
export function isValidHandle(handle: string): boolean {
  return HANDLE_RE.test(normalizeHandle(handle));
}

// ── auth ────────────────────────────────────────────────────────────────────

export async function signUpWithEmail(email: string, password: string): Promise<{ needsConfirm: boolean }> {
  const { data, error } = await getSupabaseClient().auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  // When email confirmations are ON, there's no active session yet.
  return { needsConfirm: !data.session };
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function signInWithMagicLink(email: string): Promise<void> {
  const emailRedirectTo = typeof window !== 'undefined' ? `${window.location.origin}/conta` : undefined;
  const { error } = await getSupabaseClient().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo } });
  if (error) throw error;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/conta` : undefined;
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) throw error;
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function updateEmail(newEmail: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.updateUser({ email: newEmail.trim() });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}

export async function getAuthUser(): Promise<User | null> {
  if (!accountsEnabled()) return null;
  const { data } = await getSupabaseClient().auth.getUser();
  return data.user ?? null;
}

export async function getAuthSession(): Promise<Session | null> {
  if (!accountsEnabled()) return null;
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session ?? null;
}

/** Subscribe to auth state (login/logout/token refresh). Returns an unsubscribe. */
export function onAuthChange(cb: (user: User | null) => void): () => void {
  if (!accountsEnabled()) return () => {};
  const { data } = getSupabaseClient().auth.onAuthStateChange((_e, session) => cb(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

// ── accounts table ────────────────────────────────────────────────────────

const ACCOUNT_COLS = 'id, handle, display_name, emoji, avatar_url, bio';

/** The signed-in user's account row (null if not signed in or not yet claimed). */
export async function getMyAccount(): Promise<Account | null> {
  const user = await getAuthUser();
  if (!user) return null;
  const { data, error } = await getSupabaseClient()
    .from('accounts')
    .select(ACCOUNT_COLS)
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as Account) ?? null;
}

/** True if the @handle is free (case-insensitive). */
export async function isHandleAvailable(handle: string): Promise<boolean> {
  const h = normalizeHandle(handle);
  if (!isValidHandle(h)) return false;
  const { data, error } = await getSupabaseClient()
    .from('accounts')
    .select('id')
    .eq('handle', h)
    .maybeSingle();
  if (error) throw error;
  return !data;
}

/** Create the signed-in user's account row (first-time @handle claim). */
export async function claimAccount(patch: {
  handle: string;
  display_name?: string;
  emoji?: string;
}): Promise<Account> {
  const user = await getAuthUser();
  if (!user) throw new Error('not signed in');
  const handle = normalizeHandle(patch.handle);
  if (!isValidHandle(handle)) throw new Error('invalid handle');
  const row = {
    id: user.id,
    handle,
    display_name: patch.display_name ?? null,
    emoji: patch.emoji ?? null,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await getSupabaseClient().from('accounts').insert(row).select(ACCOUNT_COLS).single();
  if (error) throw error;
  return data as Account;
}

export async function updateMyAccount(patch: Partial<Omit<Account, 'id'>>): Promise<void> {
  const user = await getAuthUser();
  if (!user) throw new Error('not signed in');
  const { error } = await getSupabaseClient()
    .from('accounts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (error) throw error;
}

/** Search accounts by @handle prefix (for the contacts page). */
export async function searchAccounts(query: string, limit = 20): Promise<Account[]> {
  const q = normalizeHandle(query);
  if (q.length < 2) return [];
  const user = await getAuthUser();
  const { data, error } = await getSupabaseClient()
    .from('accounts')
    .select(ACCOUNT_COLS)
    .ilike('handle', `${q}%`)
    .limit(limit);
  if (error) throw error;
  const rows = (data as Account[]) ?? [];
  // Never surface the searcher's own account in results.
  return user ? rows.filter((a) => a.id !== user.id) : rows;
}
