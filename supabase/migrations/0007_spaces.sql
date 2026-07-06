-- Spaces — Phase 3 of the social layer. A "space" is a shared context between
-- real accounts: a COUPLE (exactly 2) or a GROUP (N). Membership writes go
-- through SECURITY DEFINER RPCs (which enforce the rules and avoid RLS
-- recursion on space_members); reads are guarded by RLS via is_space_member().
--
-- This is the account-based replacement for the old hard-coded couple_id: a
-- couple/group's id becomes the shared space the couple features key on
-- (wired in a follow-up). Requires accounts (0005) + connections (0006).

create table if not exists public.spaces (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('couple', 'group')),
  name       text,
  emoji      text,
  owner      uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.space_members (
  space_id  uuid not null references public.spaces(id) on delete cascade,
  account   uuid not null references public.accounts(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (space_id, account)
);
create index if not exists space_members_account_idx on public.space_members (account);

-- Membership test as SECURITY DEFINER so RLS policies can call it without
-- recursing into space_members' own policy.
create or replace function public.is_space_member(p_space uuid, p_account uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.space_members
    where space_id = p_space and account = p_account
  );
$$;

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;

-- Reads: you can see a space and its members only if you're a member.
drop policy if exists spaces_select on public.spaces;
create policy spaces_select on public.spaces
  for select using (public.is_space_member(id, auth.uid()));
drop policy if exists space_members_select on public.space_members;
create policy space_members_select on public.space_members
  for select using (public.is_space_member(space_id, auth.uid()));

-- All writes go through the RPCs below (definer), so no INSERT/UPDATE policies
-- are granted to end users — except leaving, handled by leave_space().

-- ── RPCs ────────────────────────────────────────────────────────────────────

-- Two accounts must have an ACCEPTED connection to share a space.
create or replace function public.are_connected(a uuid, b uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.connections
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

-- Form (or fetch) the couple space between me and an accepted contact.
create or replace function public.form_couple(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  existing uuid;
  new_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if me = p_other then raise exception 'cannot couple with yourself'; end if;
  if not public.are_connected(me, p_other) then
    raise exception 'accounts are not connected';
  end if;
  -- Reuse an existing couple space that has exactly these two members.
  select s.id into existing
  from public.spaces s
  where s.kind = 'couple'
    and public.is_space_member(s.id, me)
    and public.is_space_member(s.id, p_other)
  limit 1;
  if existing is not null then return existing; end if;

  insert into public.spaces (kind, owner) values ('couple', me) returning id into new_id;
  insert into public.space_members (space_id, account, role)
    values (new_id, me, 'owner'), (new_id, p_other, 'member');
  return new_id;
end;
$$;

create or replace function public.create_group(p_name text, p_emoji text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  insert into public.spaces (kind, name, emoji, owner)
    values ('group', coalesce(nullif(trim(p_name), ''), 'Grupo'), p_emoji, me)
    returning id into new_id;
  insert into public.space_members (space_id, account, role) values (new_id, me, 'owner');
  return new_id;
end;
$$;

-- Owner adds a connected account to one of their groups.
create or replace function public.add_to_group(p_space uuid, p_account uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.spaces where id = p_space and owner = me and kind = 'group') then
    raise exception 'not the group owner';
  end if;
  if not public.are_connected(me, p_account) then
    raise exception 'you can only add your contacts';
  end if;
  insert into public.space_members (space_id, account, role)
    values (p_space, p_account, 'member')
    on conflict (space_id, account) do nothing;
end;
$$;

-- Leave a space (removes your membership; owner leaving a group is allowed and
-- the space is deleted if empty).
create or replace function public.leave_space(p_space uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from public.space_members where space_id = p_space and account = me;
  delete from public.spaces s
    where s.id = p_space
      and not exists (select 1 from public.space_members m where m.space_id = s.id);
end;
$$;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='space_members') then
    execute 'alter publication supabase_realtime add table public.space_members';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='spaces') then
    execute 'alter publication supabase_realtime add table public.spaces';
  end if;
end $$;
