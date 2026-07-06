-- Cross-device ACHIEVEMENT progress (Layer A). Holds only the parts of each
-- person's progress whose merge rule is provably NON-DESTRUCTIVE — XP (grows),
-- badges/secrets/visited (unlock-once), quiz scores (best-so-far + union of
-- answered questions). Because every field can only move forward, a last-writer
-- can never erase the other device's progress, which makes automatic realtime
-- sync safe. Collection data (habits/finances/notes/…) is intentionally NOT
-- here — those need explicit backup/restore first (Layer B).
--
-- Keyed by (couple_id, profile) — the same interim identity as couple_points
-- and profiles; swaps to auth.uid() when Supabase Auth lands. The whole
-- snapshot lives in one JSONB column so the shape can grow without a migration.

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

-- Add to the realtime publication only once (a plain ALTER errors on re-run).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'progress'
  ) then
    execute 'alter publication supabase_realtime add table public.progress';
  end if;
end $$;
