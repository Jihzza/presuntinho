// Single shared Supabase client for the whole app.
//
// Creating more than one client against the same project makes @supabase log
// "Multiple GoTrueClient instances detected in the same browser context ... may
// produce undefined behavior when used concurrently under the same storage
// key". That concurrent auth-token access is not cosmetic: it was crashing the
// app with `Cannot read properties of undefined (reading 'length')` on the
// home screen once several features (couple points, progress sync, profile
// sync, chat) each spun up their own client. One instance → one storage key →
// no race.
//
// Sessions ARE persisted now (Phase 1 real accounts): a logged-in user's JWT is
// stored + auto-refreshed, so authenticated requests carry auth.uid() for the
// accounts/contacts/groups tables. Anon usage still works unchanged — with no
// session, requests go out as anon and the existing couple/progress policies
// (which apply to public) are unaffected. eventsPerSecond 20 is ample for every
// realtime surface (the 1v1 game ticks ~8×/s per peer).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

let client: SupabaseClient | null = null;

/** The shared client. Throws if Supabase isn't configured — callers gate on
 *  isMultiplayerConfigured()/*Enabled() first, so this only throws by mistake. */
export function getSupabaseClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase not configured');
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'presuntinho-auth'
      },
      realtime: { params: { eventsPerSecond: 20 } }
    });
    // CRÍTICO para o chat em tempo real: as tabelas têm RLS, e o Realtime só
    // entrega postgres_changes se o SOCKET estiver autenticado com o token do
    // utilizador. Depois de um reload, a sessão é restaurada da storage sem
    // garantir o re-auth do socket — que fica como anon, a RLS filtra tudo, e
    // os eventos simplesmente não chegam (sem erro nenhum). Autenticamos o
    // socket explicitamente no arranque e em CADA mudança de sessão.
    const c = client;
    void c.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) c.realtime.setAuth(data.session.access_token);
    });
    c.auth.onAuthStateChange((_event, session) => {
      c.realtime.setAuth(session?.access_token ?? SUPABASE_ANON_KEY);
    });
  }
  return client;
}
