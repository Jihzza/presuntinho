// Multiplayer config gate — deliberately dependency-free so the arcade lobby
// can ask "is 1v1 available?" without pulling the Supabase SDK into the main
// bundle (that lives in the code-split /secrets/versus route).
//
// Setup: create a free Supabase project and expose its URL + anon key to the
// build as VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (Netlify → Site settings →
// Environment variables). Realtime "broadcast" needs no tables and no RLS —
// game state is ephemeral and never touches the database. See
// docs/MULTIPLAYER_SETUP.md.

export const SUPABASE_URL: string | undefined = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when the realtime backend is configured — the 1v1 lobby is only offered
 *  then, so the single-player arcade never breaks for an unconfigured build. */
export function isMultiplayerConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
