-- Phase 5 — security hardening of the couple DATA tables (points, chat,
-- profiles, progress). Until now these four tables had `select using (true)`
-- and `char_length(couple_id) >= 8` write checks: any holder of the public
-- anon key could read (or write) EVERY couple's rows — security rested only on
-- the couple_id being an unguessable secret.
--
-- Now that couples form real account-based SPACES (0007/0008), a couple's
-- couple_id is that space's uuid. This migration scopes such rows to the
-- space's ACCEPTED members (auth.uid()), so an account couple's data is private
-- to the two people who both consented — airtight, not secret-dependent.
--
-- Two design points the review pinned down:
--  * We branch on whether couple_id is UUID-SHAPED, not on whether a space
--    currently exists. So a uuid whose space was deleted (orphaned rows) is
--    DENIED (fail-closed), never silently reverted to public.
--  * We require status='accepted', so a merely-invited (pending) member cannot
--    read/write/subscribe to the couple's data before they consent — RLS is the
--    real backstop for any client that talks to the DB directly.
--
-- The one legacy pair still on the hard-coded text id (`presuntinho-couple-v1`,
-- and any custom non-uuid VITE_COUPLE_ID) is NOT uuid-shaped, so it keeps its
-- previous permissive posture and the existing 2-phone flow is never locked
-- out. Every real account couple lands on the scoped path.
--
-- Each policy is dropped-if-exists by its exact legacy name before being
-- recreated, so this migration replaces the old permissive policies (permissive
-- policies OR together — a surviving `using(true)` would defeat the whole
-- change) and is fully re-runnable.
--
-- Depends on 0007/0008 (spaces, space_members.status). Run those first.
--
-- Accepted residuals (reviewed, non-exploitable): (a) membership is checked by
-- space id, not space kind, so an accepted member of a GROUP could in theory
-- address these tables with that group's uuid — but access stays confined to
-- that space's accepted members (no cross-tenant leak) and the client only ever
-- keys couple data on a COUPLE space uuid. (b) is_active_space_member relies on
-- the definer bypassing RLS on space_members (standard on Supabase; don't put
-- FORCE ROW LEVEL SECURITY on space_members). The couple-media bucket stays
-- public (unguessable URLs); row visibility here does not govern object bytes.

-- ── helpers ───────────────────────────────────────────────────────────────────

-- Parse a text couple_id to a uuid IFF it is uuid-shaped, else NULL. Pure /
-- immutable and DB-free; the regex guards the cast so a legacy id can never
-- raise invalid_text_representation. plpgsql (not inlined) so the cast is never
-- constant-folded at plan time.
create or replace function public.as_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null then return null; end if;
  if p !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return p::uuid;
end;
$$;

-- Accepted (consented) membership test. SECURITY DEFINER so it can read
-- space_members from within a policy that runs as anon/authenticated, without
-- recursing into space_members' own RLS. A uuid that names no space (deleted /
-- never existed) simply has no rows here -> false -> access denied.
create or replace function public.is_active_space_member(p_space uuid, p_account uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.space_members
    where space_id = p_space and account = p_account and status = 'accepted'
  );
$$;

-- These are evaluated per-row inside the RLS policies below, so the querying
-- roles must be able to execute them.
grant execute on function public.as_uuid(text) to anon, authenticated;
grant execute on function public.is_active_space_member(uuid, uuid) to anon, authenticated;

-- ── couple_points ─────────────────────────────────────────────────────────────
drop policy if exists couple_points_select on public.couple_points;
create policy couple_points_select on public.couple_points for select using (
  public.as_uuid(couple_id) is null
  or public.is_active_space_member(public.as_uuid(couple_id), auth.uid())
);
drop policy if exists couple_points_insert on public.couple_points;
create policy couple_points_insert on public.couple_points for insert with check (
  case when public.as_uuid(couple_id) is null
       then char_length(couple_id) >= 8
       else public.is_active_space_member(public.as_uuid(couple_id), auth.uid()) end
);
drop policy if exists couple_points_update on public.couple_points;
create policy couple_points_update on public.couple_points for update using (
  case when public.as_uuid(couple_id) is null
       then char_length(couple_id) >= 8
       else public.is_active_space_member(public.as_uuid(couple_id), auth.uid()) end
) with check (
  case when public.as_uuid(couple_id) is null
       then char_length(couple_id) >= 8
       else public.is_active_space_member(public.as_uuid(couple_id), auth.uid()) end
);

-- ── couple_messages (insert-only; messages are immutable, no UPDATE policy) ────
drop policy if exists couple_messages_select on public.couple_messages;
create policy couple_messages_select on public.couple_messages for select using (
  public.as_uuid(couple_id) is null
  or public.is_active_space_member(public.as_uuid(couple_id), auth.uid())
);
drop policy if exists couple_messages_insert on public.couple_messages;
create policy couple_messages_insert on public.couple_messages for insert with check (
  char_length(coalesce(body, '') || coalesce(media_url, '')) > 0
  and case when public.as_uuid(couple_id) is null
           then char_length(couple_id) >= 8
           else public.is_active_space_member(public.as_uuid(couple_id), auth.uid()) end
);

-- ── profiles ──────────────────────────────────────────────────────────────────
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  public.as_uuid(couple_id) is null
  or public.is_active_space_member(public.as_uuid(couple_id), auth.uid())
);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert with check (
  case when public.as_uuid(couple_id) is null
       then char_length(couple_id) >= 8
       else public.is_active_space_member(public.as_uuid(couple_id), auth.uid()) end
);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (
  case when public.as_uuid(couple_id) is null
       then char_length(couple_id) >= 8
       else public.is_active_space_member(public.as_uuid(couple_id), auth.uid()) end
) with check (
  case when public.as_uuid(couple_id) is null
       then char_length(couple_id) >= 8
       else public.is_active_space_member(public.as_uuid(couple_id), auth.uid()) end
);

-- ── progress ──────────────────────────────────────────────────────────────────
drop policy if exists progress_select on public.progress;
create policy progress_select on public.progress for select using (
  public.as_uuid(couple_id) is null
  or public.is_active_space_member(public.as_uuid(couple_id), auth.uid())
);
drop policy if exists progress_insert on public.progress;
create policy progress_insert on public.progress for insert with check (
  case when public.as_uuid(couple_id) is null
       then char_length(couple_id) >= 8
       else public.is_active_space_member(public.as_uuid(couple_id), auth.uid()) end
);
drop policy if exists progress_update on public.progress;
create policy progress_update on public.progress for update using (
  case when public.as_uuid(couple_id) is null
       then char_length(couple_id) >= 8
       else public.is_active_space_member(public.as_uuid(couple_id), auth.uid()) end
) with check (
  case when public.as_uuid(couple_id) is null
       then char_length(couple_id) >= 8
       else public.is_active_space_member(public.as_uuid(couple_id), auth.uid()) end
);

-- ── ship gate (run manually after applying) ───────────────────────────────────
-- Exactly one permissive policy must remain per (table, command) — otherwise a
-- stale `using(true)` would still leak. This query must return ZERO rows:
--
--   select tablename, cmd, count(*)
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('couple_points','couple_messages','profiles','progress')
--   group by 1, 2 having count(*) > 1;
