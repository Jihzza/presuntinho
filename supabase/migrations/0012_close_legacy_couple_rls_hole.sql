-- 0012 — Close the anon read/write hole on couple-scoped tables.
--
-- 0010 kept a legacy branch: `as_uuid(couple_id) IS NULL` (a non-uuid, text
-- couple_id like the shared 'presuntinho-couple-v1') was allowed through to
-- `public` on SELECT, and INSERT/UPDATE required only `char_length >= 8`. Since
-- the anon key ships in the JS bundle by design, anyone could read and write the
-- legacy couple bucket.
--
-- Multi-tenant launch: every couple is now a uuid space formed by two real
-- accounts, so make all four couple tables fail-closed — access requires a uuid
-- couple_id AND active, authenticated space membership. Legacy text-id rows
-- become inaccessible (intended; that single-couple data is retired). uuid-space
-- couples are unaffected: they already matched the membership branch.
--
-- Applied to production via Supabase MCP on 2026-07-07; this file mirrors it.

alter policy couple_points_select on public.couple_points
  using (as_uuid(couple_id) is not null and is_active_space_member(as_uuid(couple_id), auth.uid()));
alter policy couple_points_insert on public.couple_points
  with check (as_uuid(couple_id) is not null and is_active_space_member(as_uuid(couple_id), auth.uid()));
alter policy couple_points_update on public.couple_points
  using (as_uuid(couple_id) is not null and is_active_space_member(as_uuid(couple_id), auth.uid()))
  with check (as_uuid(couple_id) is not null and is_active_space_member(as_uuid(couple_id), auth.uid()));

alter policy couple_messages_select on public.couple_messages
  using (as_uuid(couple_id) is not null and is_active_space_member(as_uuid(couple_id), auth.uid()));
alter policy couple_messages_insert on public.couple_messages
  with check (
    char_length(coalesce(body, ''::text) || coalesce(media_url, ''::text)) > 0
    and as_uuid(couple_id) is not null
    and is_active_space_member(as_uuid(couple_id), auth.uid())
  );

alter policy profiles_select on public.profiles
  using (as_uuid(couple_id) is not null and is_active_space_member(as_uuid(couple_id), auth.uid()));
alter policy profiles_insert on public.profiles
  with check (as_uuid(couple_id) is not null and is_active_space_member(as_uuid(couple_id), auth.uid()));
alter policy profiles_update on public.profiles
  using (as_uuid(couple_id) is not null and is_active_space_member(as_uuid(couple_id), auth.uid()))
  with check (as_uuid(couple_id) is not null and is_active_space_member(as_uuid(couple_id), auth.uid()));

alter policy progress_select on public.progress
  using (as_uuid(couple_id) is not null and is_active_space_member(as_uuid(couple_id), auth.uid()));
alter policy progress_insert on public.progress
  with check (as_uuid(couple_id) is not null and is_active_space_member(as_uuid(couple_id), auth.uid()));
alter policy progress_update on public.progress
  using (as_uuid(couple_id) is not null and is_active_space_member(as_uuid(couple_id), auth.uid()))
  with check (as_uuid(couple_id) is not null and is_active_space_member(as_uuid(couple_id), auth.uid()));
