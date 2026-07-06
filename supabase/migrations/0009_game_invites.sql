-- Game invites — Phase 4 of the social layer. Invite a CONTACT to a game lobby
-- (the 1v1 snake): the inviter writes a row with the room code, the invitee gets
-- it live and can join in one tap. Only connected contacts can be invited.

create table if not exists public.game_invites (
  id           uuid primary key default gen_random_uuid(),
  from_account uuid not null references public.accounts(id) on delete cascade,
  to_account   uuid not null references public.accounts(id) on delete cascade,
  room_code    text not null,
  game         text not null default 'versus',
  created_at   timestamptz not null default now()
);
create index if not exists game_invites_to_idx on public.game_invites (to_account, created_at desc);
alter table public.game_invites enable row level security;

-- See invites you sent or received.
drop policy if exists gi_select on public.game_invites;
create policy gi_select on public.game_invites
  for select using (auth.uid() = from_account or auth.uid() = to_account);
-- Send only invites FROM you, and only to one of your accepted contacts.
drop policy if exists gi_insert on public.game_invites;
create policy gi_insert on public.game_invites
  for insert with check (auth.uid() = from_account and public.are_connected(from_account, to_account));
-- Either party may delete (dismiss / cleanup).
drop policy if exists gi_delete on public.game_invites;
create policy gi_delete on public.game_invites
  for delete using (auth.uid() = from_account or auth.uid() = to_account);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_invites') then
    execute 'alter publication supabase_realtime add table public.game_invites';
  end if;
end $$;
