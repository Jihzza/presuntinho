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

## Durable couple points on Supabase (no chat token)

To make the shared heart counter persist across reloads and sync live **without
the Netlify-Blobs chat token**, apply the migration and set one more env var:

1. **Apply the schema** — run `supabase/migrations/0001_couple_core.sql` against
   the project (Supabase dashboard → SQL editor, or `supabase db push`). It
   creates `couple_points` + `couple_messages`, RLS, the `couple_points_bump`
   RPC, and adds both tables to the Realtime publication.
2. **Set the couple id** — add `VITE_COUPLE_ID` in Netlify (a shared, hard-to-guess
   string used by BOTH phones to scope the couple's rows), then redeploy. If
   unset it falls back to a constant, which works but is guessable.

Once applied: tapping the heart writes to `couple_points` (atomic bump) and the
partner's total updates live via `postgres_changes`. With no Supabase configured
it transparently falls back to the Netlify-Blobs counter. Security note: there is
no Supabase Auth yet, so RLS is permissive and access rests on the secret
`couple_id` (same posture as the shipped anon key). Roadmap: anonymous auth +
`couple_members` to scope RLS by `auth.uid()`.

## Also powers real-time couple points

The same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` also switch on **instant
couple-point sync**: tapping the surprise heart now pushes the confirmed total
over a shared realtime channel (`couple-presuntinho`, override with
`VITE_COUPLE_CHANNEL`) so the partner's count updates immediately instead of
waiting for the ~5s poll. Netlify Blobs stays the durable source of truth; the
channel only accelerates delivery. With no Supabase configured it silently
falls back to the existing poller — nothing breaks. A "parceira online"
indicator is also available (`couple.partnerOnline`).

## Notes / limits

- The **host** (whoever created the room) is authoritative. If they close the
  tab the round ends for both.
- Latency is one broadcast round-trip on the guest's turns — comfortable for a
  grid game at ~130 ms/step, not a twitch shooter.
- To swap Supabase for Ably / PartyKit later, re-implement only
  `src/lib/multiplayer/realtime.ts` against the same `Room` interface — the
  lobby, netcode and sim don't change.
