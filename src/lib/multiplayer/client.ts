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
// Auth is disabled (persistSession/autoRefreshToken false) — every table uses
// anon RLS, so there is no user session to persist. eventsPerSecond 20 is ample
// for every realtime surface (the 1v1 game ticks ~8×/s per peer).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

let client: SupabaseClient | null = null;

/** The shared client. Throws if Supabase isn't configured — callers gate on
 *  isMultiplayerConfigured()/*Enabled() first, so this only throws by mistake. */
export function getSupabaseClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase not configured');
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } }
    });
  }
  return client;
}
