# Arcade 1v1 multiplayer — setup

The live 1v1 snake duel (`/secrets/versus/`) runs over **Supabase Realtime
broadcast**. It is entirely optional: when the two env vars below are missing,
`isMultiplayerConfigured()` returns `false`, the "JOGAR 1v1" button never
appears, and the single-player arcade is completely unaffected.

Nothing about the game is stored in a database. Realtime *broadcast* is a
fire-and-forget fan-out between the two connected phones — the host runs the
simulation and broadcasts the board each tick, the guest sends its turns back.
So there are **no tables, no rows, and no RLS policies to write**.

## 1. Create a free Supabase project

1. Go to <https://supabase.com>, create a project (free tier is plenty for two
   players — Realtime broadcast has a generous free allowance).
2. In **Project Settings → API**, copy:
   - **Project URL** (e.g. `https://abcd1234.supabase.co`)
   - **anon public** key (the `anon` / publishable key — safe to ship in a
     client bundle; it only allows what your policies allow, and we use no
     tables).

## 2. Expose the keys to the build

The client reads them from Vite env vars at **build time**, so they must be set
wherever the site is built (Netlify) and, if you want to test locally, in a
`.env` file.

**Netlify** → Site configuration → Environment variables → add:

```
VITE_SUPABASE_URL       = https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY  = <your-anon-public-key>
```

Then trigger a redeploy so the values are inlined into the build.

**Local dev** → create `.env` in the repo root (git-ignored):

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
```

## 3. Enable Realtime

Realtime broadcast is on by default for new projects — no extra configuration
is required because we never subscribe to Postgres changes, only to a named
broadcast channel (`arcade:<ROOM-CODE>`).

## 4. Play

1. One player opens the arcade → **JOGAR 1v1** → **Criar sala** and shares the
   6-character code.
2. The other opens **JOGAR 1v1** → types the code → **Entrar**.
3. When both are connected the duel starts automatically. Two snakes, one
   board, one fruit; bite the other snake's tail to steal a point. A crash ends
   the round for the survivor — then **Revanche** for another.

## Notes / limits

- The **host** (whoever created the room) is authoritative. If they close the
  tab the round ends for both.
- Latency is one broadcast round-trip on the guest's turns — comfortable for a
  grid game at ~130 ms/step, not a twitch shooter.
- To swap Supabase for Ably / PartyKit later, re-implement only
  `src/lib/multiplayer/realtime.ts` against the same `Room` interface — the
  lobby, netcode and sim don't change.
