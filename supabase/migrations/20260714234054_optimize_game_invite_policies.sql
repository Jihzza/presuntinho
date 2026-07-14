-- Keep only the policies used by the client grants and evaluate auth.uid()
-- once per statement instead of once per candidate row.
drop policy if exists gi_select on public.game_invites;
drop policy if exists gi_insert on public.game_invites;
drop policy if exists gi_update on public.game_invites;
drop policy if exists gi_delete on public.game_invites;

create policy gi_select on public.game_invites
  for select to authenticated
  using (
    (select auth.uid()) = from_account
    or (select auth.uid()) = to_account
  );

create policy gi_delete on public.game_invites
  for delete to authenticated
  using (
    (select auth.uid()) = from_account
    or (select auth.uid()) = to_account
  );
