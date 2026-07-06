-- ─────────────────────────────────────────────────────────────────────────
-- SOCIAL LAYER — full setup in ONE script, in dependency order:
--   accounts (0005) → connections (0006) → spaces (0007)
-- Paste the whole thing into the Supabase SQL editor and Run. 100% idempotent
-- (safe to re-run). Fixes the "relation public.connections does not exist"
-- error, which happened because 0007 was run before 0006.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ 0005 · accounts ═══════════════════════════════════════════════════════
create extension if not exists citext;

create table if not exists public.accounts (
  id           uuid primary key references auth.users(id) on delete cascade,
  handle       citext unique not null,
  display_name text,
  emoji        text,
  avatar_url   text,
  bio          text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.accounts enable row level security;
alter table public.accounts drop constraint if exists accounts_handle_format;
alter table public.accounts add constraint accounts_handle_format
  check (handle ~ '^[a-z0-9_]{3,20}$');
create index if not exists accounts_handle_idx on public.accounts (handle);
drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts for select using (true);
drop policy if exists accounts_insert on public.accounts;
create policy accounts_insert on public.accounts for insert with check (auth.uid() = id);
drop policy if exists accounts_update on public.accounts;
create policy accounts_update on public.accounts for update using (auth.uid() = id) with check (auth.uid() = id);

-- ═══ 0006 · connections ════════════════════════════════════════════════════
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
drop policy if exists connections_select on public.connections;
create policy connections_select on public.connections for select using (auth.uid() = requester or auth.uid() = addressee);
drop policy if exists connections_insert on public.connections;
create policy connections_insert on public.connections for insert with check (auth.uid() = requester);
drop policy if exists connections_update on public.connections;
create policy connections_update on public.connections for update using (auth.uid() = addressee) with check (auth.uid() = addressee);
drop policy if exists connections_delete on public.connections;
create policy connections_delete on public.connections for delete using (auth.uid() = requester or auth.uid() = addressee);

-- ═══ 0007 · spaces (couple + groups) ═══════════════════════════════════════
create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('couple', 'group')),
  name text, emoji text,
  owner uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  account uuid not null references public.accounts(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (space_id, account)
);
create index if not exists space_members_account_idx on public.space_members (account);

create or replace function public.is_space_member(p_space uuid, p_account uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (select 1 from public.space_members where space_id = p_space and account = p_account); $$;
create or replace function public.are_connected(a uuid, b uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (select 1 from public.connections where status = 'accepted'
    and ((requester = a and addressee = b) or (requester = b and addressee = a))); $$;

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
drop policy if exists spaces_select on public.spaces;
create policy spaces_select on public.spaces for select using (public.is_space_member(id, auth.uid()));
drop policy if exists space_members_select on public.space_members;
create policy space_members_select on public.space_members for select using (public.is_space_member(space_id, auth.uid()));

create or replace function public.form_couple(p_other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); existing uuid; new_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if me = p_other then raise exception 'cannot couple with yourself'; end if;
  if not public.are_connected(me, p_other) then raise exception 'accounts are not connected'; end if;
  select s.id into existing from public.spaces s where s.kind = 'couple'
    and public.is_space_member(s.id, me) and public.is_space_member(s.id, p_other) limit 1;
  if existing is not null then return existing; end if;
  insert into public.spaces (kind, owner) values ('couple', me) returning id into new_id;
  insert into public.space_members (space_id, account, role) values (new_id, me, 'owner'), (new_id, p_other, 'member');
  return new_id;
end; $$;

create or replace function public.create_group(p_name text, p_emoji text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); new_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  insert into public.spaces (kind, name, emoji, owner) values ('group', coalesce(nullif(trim(p_name), ''), 'Grupo'), p_emoji, me) returning id into new_id;
  insert into public.space_members (space_id, account, role) values (new_id, me, 'owner');
  return new_id;
end; $$;

create or replace function public.add_to_group(p_space uuid, p_account uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.spaces where id = p_space and owner = me and kind = 'group') then raise exception 'not the group owner'; end if;
  if not public.are_connected(me, p_account) then raise exception 'you can only add your contacts'; end if;
  insert into public.space_members (space_id, account, role) values (p_space, p_account, 'member') on conflict (space_id, account) do nothing;
end; $$;

create or replace function public.leave_space(p_space uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from public.space_members where space_id = p_space and account = me;
  delete from public.spaces s where s.id = p_space and not exists (select 1 from public.space_members m where m.space_id = s.id);
end; $$;

-- ═══ realtime (guarded — each ALTER errors if the table is already in it) ═══
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='accounts') then execute 'alter publication supabase_realtime add table public.accounts'; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='connections') then execute 'alter publication supabase_realtime add table public.connections'; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='spaces') then execute 'alter publication supabase_realtime add table public.spaces'; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='space_members') then execute 'alter publication supabase_realtime add table public.space_members'; end if;
end $$;

-- ═══ verification ══════════════════════════════════════════════════════════
select
  to_regclass('public.accounts')      is not null as accounts_ok,
  to_regclass('public.connections')   is not null as connections_ok,
  to_regclass('public.spaces')        is not null as spaces_ok,
  to_regclass('public.space_members') is not null as members_ok,
  (select count(*) from pg_proc where proname in
    ('form_couple','create_group','add_to_group','leave_space','is_space_member','are_connected')) as functions;
