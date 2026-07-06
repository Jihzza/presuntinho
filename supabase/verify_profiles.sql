-- ─────────────────────────────────────────────────────────────────────────
-- VERIFY / APPLY 0003 (profiles) — paste this whole block into the Supabase
-- SQL editor (Dashboard → SQL). It is 100% idempotent: run it as many times
-- as you like. It re-applies 0003 if missing, then prints a status report.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  couple_id    text        not null,
  profile      text        not null,
  display_name text,
  emoji        text,
  bio          text,
  photo_url    text,
  updated_at   timestamptz not null default now(),
  primary key (couple_id, profile)
);
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles for select using (true);
create policy profiles_insert on public.profiles for insert with check (char_length(couple_id) >= 8);
create policy profiles_update on public.profiles for update using (char_length(couple_id) >= 8) with check (char_length(couple_id) >= 8);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    execute 'alter publication supabase_realtime add table public.profiles';
  end if;
end $$;

-- ── status report ─────────────────────────────────────────────────────────
select
  to_regclass('public.profiles') is not null                                        as table_exists,
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass)      as rls_enabled,
  (select count(*) from pg_policies where schemaname='public' and tablename='profiles') as policy_count,
  exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='profiles'
  )                                                                                  as realtime_on,
  (select count(*) from public.profiles)                                            as row_count;
-- Expect: table_exists=t, rls_enabled=t, policy_count=3, realtime_on=t.
