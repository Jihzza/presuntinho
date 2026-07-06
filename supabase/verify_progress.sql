-- ─────────────────────────────────────────────────────────────────────────
-- VERIFY / APPLY 0004 (progress) — paste this whole block into the Supabase
-- SQL editor (Dashboard → SQL). 100% idempotent: run it as many times as you
-- like. Creates the cross-device achievement table (XP / badges / secrets /
-- visited / quiz), then prints a status report.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.progress (
  couple_id  text        not null,
  profile    text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (couple_id, profile)
);
alter table public.progress enable row level security;
drop policy if exists progress_select on public.progress;
drop policy if exists progress_insert on public.progress;
drop policy if exists progress_update on public.progress;
create policy progress_select on public.progress for select using (true);
create policy progress_insert on public.progress for insert with check (char_length(couple_id) >= 8);
create policy progress_update on public.progress for update using (char_length(couple_id) >= 8) with check (char_length(couple_id) >= 8);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='progress'
  ) then
    execute 'alter publication supabase_realtime add table public.progress';
  end if;
end $$;

select
  to_regclass('public.progress') is not null                                          as table_exists,
  (select relrowsecurity from pg_class where oid='public.progress'::regclass)          as rls_enabled,
  (select count(*) from pg_policies where schemaname='public' and tablename='progress') as policy_count,
  exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='progress') as realtime_on;
-- Expect: table_exists=t, rls_enabled=t, policy_count=3, realtime_on=t.
