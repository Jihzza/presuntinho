-- Couple pings are account-only. Legacy Fatma/Daniel pings use the Netlify
-- snapshot transport and must never rely on anonymous database access.
revoke all on public.couple_pings from public, anon, authenticated;
grant select, insert on public.couple_pings to authenticated;

drop policy if exists couple_pings_select on public.couple_pings;
create policy couple_pings_select on public.couple_pings
for select to authenticated
using (
  public.as_uuid(couple_id) is not null
  and public.is_active_space_member(public.as_uuid(couple_id), (select auth.uid()))
);

drop policy if exists couple_pings_insert on public.couple_pings;
create policy couple_pings_insert on public.couple_pings
for insert to authenticated
with check (
  public.as_uuid(couple_id) is not null
  and sender = (select auth.uid())::text
  and public.is_active_space_member(public.as_uuid(couple_id), (select auth.uid()))
);
