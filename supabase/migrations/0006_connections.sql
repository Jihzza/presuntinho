-- Connections — Phase 2 of the social layer. A connection is a "connect
-- request" between two accounts (like a friend request): the requester sends it
-- pending, the addressee accepts → both become contacts. Foundation for the
-- couple/group modes and lobby invites (only connected people can be invited).

create table if not exists public.connections (
  id         uuid primary key default gen_random_uuid(),
  requester  uuid not null references public.accounts(id) on delete cascade,
  addressee  uuid not null references public.accounts(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connections_no_self check (requester <> addressee),
  constraint connections_unique_pair unique (requester, addressee)
);
create index if not exists connections_requester_idx on public.connections (requester);
create index if not exists connections_addressee_idx on public.connections (addressee);

alter table public.connections enable row level security;

-- You can see a connection only if you're one of its two parties.
drop policy if exists connections_select on public.connections;
create policy connections_select on public.connections
  for select using (auth.uid() = requester or auth.uid() = addressee);
-- You may only create requests you send.
drop policy if exists connections_insert on public.connections;
create policy connections_insert on public.connections
  for insert with check (auth.uid() = requester);
-- Only the addressee may accept (update status).
drop policy if exists connections_update on public.connections;
create policy connections_update on public.connections
  for update using (auth.uid() = addressee) with check (auth.uid() = addressee);
-- Either party may delete (decline / cancel / unfriend).
drop policy if exists connections_delete on public.connections;
create policy connections_delete on public.connections
  for delete using (auth.uid() = requester or auth.uid() = addressee);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'connections'
  ) then
    execute 'alter publication supabase_realtime add table public.connections';
  end if;
end $$;
