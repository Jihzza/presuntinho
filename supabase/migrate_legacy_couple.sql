-- One-time helper to move the LEGACY couple's data (the shared hard-coded
-- 'presuntinho-couple-v1' id used before real accounts) into a real account
-- COUPLE space, so the couple can drop the legacy id for good.
--
-- WHY THIS IS A PRIVILEGED SQL HELPER AND NOT AN IN-APP BUTTON
-- The legacy couple_id is the default constant compiled into the client bundle,
-- and every pre-accounts user shared that ONE id. It has no account ownership,
-- so an in-app RPC callable by authenticated users would let ANYONE pull that
-- data into their own couple space. Instead this function is REVOKED from anon /
-- authenticated: only the database owner (the Supabase SQL editor / service
-- role) can run it. Run it once, by hand, after the couple forms their account
-- couple. It is idempotent (re-running finds no legacy rows and is a no-op).
--
-- The merge is NON-DESTRUCTIVE where the target already has a row (points take
-- the max; profiles/progress keep whichever snapshot is newer), matching the
-- app's Layer-A sync philosophy, then the legacy rows are cleared.
--
-- Depends on 0010 (as_uuid, is_active_space_member) and the couple space
-- already existing (0007/0008).

create or replace function public.migrate_legacy_couple(p_legacy text, p_space uuid)
returns table(points_rows int, profile_rows int, progress_rows int, messages_rows int)
language plpgsql
set search_path = ''
as $$
declare
  n_points int; n_profiles int; n_progress int; n_messages int;
begin
  -- Refuse to move an account-couple (uuid) source; only a legacy text id.
  if public.as_uuid(p_legacy) is not null then
    raise exception 'source % must be a legacy (non-uuid) couple_id', p_legacy;
  end if;
  if not exists (select 1 from public.spaces where id = p_space and kind = 'couple') then
    raise exception 'target % is not a couple space', p_space;
  end if;

  -- couple_points — non-destructive max merge.
  insert into public.couple_points (couple_id, profile, points, updated_at)
    select p_space::text, profile, points, updated_at
    from public.couple_points where couple_id = p_legacy
  on conflict (couple_id, profile) do update
    set points = greatest(public.couple_points.points, excluded.points),
        updated_at = greatest(public.couple_points.updated_at, excluded.updated_at);
  get diagnostics n_points = row_count;
  delete from public.couple_points where couple_id = p_legacy;

  -- profiles — newer updated_at wins.
  insert into public.profiles (couple_id, profile, display_name, emoji, bio, photo_url, updated_at)
    select p_space::text, profile, display_name, emoji, bio, photo_url, updated_at
    from public.profiles where couple_id = p_legacy
  on conflict (couple_id, profile) do update set
    display_name = case when excluded.updated_at > public.profiles.updated_at then excluded.display_name else public.profiles.display_name end,
    emoji        = case when excluded.updated_at > public.profiles.updated_at then excluded.emoji        else public.profiles.emoji end,
    bio          = case when excluded.updated_at > public.profiles.updated_at then excluded.bio          else public.profiles.bio end,
    photo_url    = case when excluded.updated_at > public.profiles.updated_at then excluded.photo_url    else public.profiles.photo_url end,
    updated_at   = greatest(public.profiles.updated_at, excluded.updated_at);
  get diagnostics n_profiles = row_count;
  delete from public.profiles where couple_id = p_legacy;

  -- progress — newer snapshot wins (the client re-merges non-destructively).
  insert into public.progress (couple_id, profile, data, updated_at)
    select p_space::text, profile, data, updated_at
    from public.progress where couple_id = p_legacy
  on conflict (couple_id, profile) do update set
    data       = case when excluded.updated_at > public.progress.updated_at then excluded.data else public.progress.data end,
    updated_at = greatest(public.progress.updated_at, excluded.updated_at);
  get diagnostics n_progress = row_count;
  delete from public.progress where couple_id = p_legacy;

  -- couple_messages — move (id is the PK, so no conflict; media_url on old rows
  -- is a public couple-media URL that keeps working after the re-key).
  update public.couple_messages set couple_id = p_space::text where couple_id = p_legacy;
  get diagnostics n_messages = row_count;

  return query select n_points, n_profiles, n_progress, n_messages;
end;
$$;

-- Not callable through the API. `revoke from public` alone is NOT enough on
-- Supabase: its default privileges grant EXECUTE directly to anon/authenticated,
-- so those direct grants must be revoked explicitly or the function stays
-- reachable via PostgREST /rpc (a destructive theft vector). The owner
-- (postgres) keeps EXECUTE and runs it from the SQL editor.
revoke all on function public.migrate_legacy_couple(text, uuid) from public;
revoke all on function public.migrate_legacy_couple(text, uuid) from anon, authenticated;
-- Verify only the owner retains it:  \df+ public.migrate_legacy_couple
--   (proacl should show no anon/authenticated EXECUTE)

-- ── HOW TO RUN (once) ─────────────────────────────────────────────────────────
-- 1) Find your couple space id and confirm the members:
--
--    select s.id, s.kind, array_agg(a.handle) as members
--    from public.spaces s
--    join public.space_members m on m.space_id = s.id
--    join public.accounts a on a.id = m.account
--    where s.kind = 'couple'
--    group by s.id, s.kind;
--
-- 2) Run the move with YOUR space id (and your legacy id if you set a custom
--    VITE_COUPLE_ID; otherwise the default below):
--
--    select * from public.migrate_legacy_couple(
--      'presuntinho-couple-v1',
--      'PASTE-YOUR-COUPLE-SPACE-UUID-HERE'::uuid
--    );
--
-- The returned row shows how many points/profile/progress/message rows moved.
-- Afterwards the couple's data lives under the space uuid and is protected by
-- the 0010 member-scoped RLS; the app picks it up on next load.
--
-- RESIDUALS (reviewed): (a) historical chat MEDIA stays where it was uploaded —
-- the public `couple-media` bucket — and the moved messages keep their public
-- media_url, so old media stays reachable by its (unguessable) URL. Only NEW
-- media (sent after the couple is active) is private (couple-chat + signed
-- URLs). Fully privatising old media would require moving the storage objects
-- too; do that separately if it matters. (b) On the rare conflict where the
-- target space already has a row for a profile, points take the max and
-- profiles/progress keep the newer snapshot, then the legacy row is cleared —
-- so run this BEFORE the couple accumulates new data (the intended flow) to
-- avoid any loss.
