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
  /** Perfil v2 (0017) — presentes quando a query os seleciona. */
  cover_url?: string | null;
  website?: string | null;
  location?: string | null;
  created_at?: string;
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

/** Start the "Sign in with Google" OAuth flow. Redirects the browser to Google
 *  and back to /splash/, where detectSessionInUrl picks up the session and the
 *  session bridge maps the account to the local profile. Requires the Google
 *  provider enabled in Supabase Auth + the redirect URL allow-listed. */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/splash/` : undefined;
  const { error } = await getSupabaseClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  });
  if (error) throw error;
}

// Saikan ID is a public OIDC provider; the issuer and client_id are NOT secret
// (only the client_secret is, and it stays server-side in the callback
// function). Overridable via build-time env, with stable public defaults.
const SAIKAN_ISSUER = (import.meta.env.VITE_SAIKAN_OIDC_ISSUER ?? 'https://id.saikan.io').replace(
  /\/+$/,
  ''
);
const SAIKAN_CLIENT_ID = import.meta.env.VITE_SAIKAN_CLIENT_ID ?? 'presuntinho';
const SAIKAN_STATE_COOKIE = 'saikan_oidc';

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/**
 * Start the "Continuar com Saikan ID" OIDC flow. PKCE + state + nonce are
 * generated in the browser and stashed in a short-lived SameSite=Lax cookie
 * (readable by the callback function on the way back), then we redirect
 * STRAIGHT to id.saikan.io — no intermediate serverless hop, so the jump is
 * instant. The code→token exchange (which needs the client secret) still
 * happens server-side in saikan-auth-callback. The cookie is not HttpOnly (JS
 * sets it), which is fine: the PKCE verifier is a single-use, short-lived
 * value, exactly like the sessionStorage verifier a normal SPA PKCE client
 * would keep.
 */
export async function signInWithSaikan(): Promise<void> {
  if (typeof window === 'undefined') return;

  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const origin = window.location.origin;
  const challenge = await pkceChallenge(verifier);

  const payload = base64url(
    new TextEncoder().encode(JSON.stringify({ v: verifier, s: state, n: nonce, o: origin }))
  );
  // Path is the functions dir so the callback receives it; Lax survives the
  // top-level redirect back from id.saikan.io.
  document.cookie = `${SAIKAN_STATE_COOKIE}=${payload}; Path=/.netlify/functions/; Max-Age=600; SameSite=Lax; Secure`;

  const authorize = new URL(`${SAIKAN_ISSUER}/oauth/authorize`);
  authorize.searchParams.set('client_id', SAIKAN_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', `${origin}/.netlify/functions/saikan-auth-callback`);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', 'openid email profile');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('nonce', nonce);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');

  window.location.href = authorize.toString();
}

/**
 * Complete a Saikan ID sign-in if the URL fragment carries the one-time
 * token_hash minted by the callback function. Exchanges it for a real
 * Supabase session (verifyOtp), scrubs the fragment, and returns true when a
 * session was just established. Safe to call on every /splash/ mount.
 */
export async function completeSaikanSignIn(): Promise<boolean> {
  if (typeof window === 'undefined' || !accountsEnabled()) return false;
  const match = /(?:^#|&)saikan_token_hash=([^&]+)/.exec(window.location.hash);
  if (!match) return false;
  // Scrub the one-time token from the address bar/history immediately.
  history.replaceState(null, '', window.location.pathname + window.location.search);
  const tokenHash = decodeURIComponent(match[1]);
  const { error } = await getSupabaseClient().auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash
  });
  if (error) throw error;
  return true;
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

const ACCOUNT_COLS = 'id, handle, display_name, emoji, avatar_url, bio, cover_url, website, location, created_at';

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

/** Exact @handle lookup (public profile pages). Case-insensitive (citext). */
export async function getAccountByHandle(handle: string): Promise<Account | null> {
  const h = normalizeHandle(handle);
  if (!isValidHandle(h)) return null;
  const { data, error } = await getSupabaseClient()
    .from('accounts')
    .select(ACCOUNT_COLS)
    .eq('handle', h)
    .maybeSingle();
  if (error) throw error;
  return (data as Account) ?? null;
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
