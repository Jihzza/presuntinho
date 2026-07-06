-- Real accounts — Phase 1 of the social layer. Each account IS a Supabase Auth
-- user (email/password or magic-link) with a searchable, unique @handle. This
-- is the foundation for contacts, couple and group modes (later phases). The
-- existing anon couple/progress tables are untouched and keep working.

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

-- handle format: 3–20 chars, lowercase letters/numbers/underscore.
alter table public.accounts drop constraint if exists accounts_handle_format;
alter table public.accounts add constraint accounts_handle_format
  check (handle ~ '^[a-z0-9_]{3,20}$');
create index if not exists accounts_handle_idx on public.accounts (handle);

-- Any signed-in user can search/read accounts (to find people by @handle);
-- you may only create/update YOUR OWN row (auth.uid() = id).
drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts for select using (true);
drop policy if exists accounts_insert on public.accounts;
create policy accounts_insert on public.accounts for insert with check (auth.uid() = id);
drop policy if exists accounts_update on public.accounts;
create policy accounts_update on public.accounts for update using (auth.uid() = id) with check (auth.uid() = id);

-- Add to the realtime publication only once (a plain ALTER errors on re-run).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'accounts'
  ) then
    execute 'alter publication supabase_realtime add table public.accounts';
  end if;
end $$;
