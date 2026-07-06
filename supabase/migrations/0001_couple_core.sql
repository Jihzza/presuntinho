-- Couple app core — durable, real-time couple points (+ a messages table ready
-- for the chat). Identity is scoped by a shared, high-entropy `couple_id` both
-- partners' devices hold (VITE_COUPLE_ID). There is no Supabase Auth yet, so RLS
-- is ON but permissive — security rests on the couple_id being an unguessable
-- secret (same posture as the anon key already shipped in the bundle).
-- Roadmap: anonymous auth + a couple_members(user_id) table to scope RLS by
-- auth.uid().

-- ── couple_points: one row per (couple, member); summed for the shared total ──
create table if not exists public.couple_points (
  couple_id  text        not null,
  profile    text        not null,
  points     integer     not null default 0 check (points >= 0),
  updated_at timestamptz not null default now(),
  primary key (couple_id, profile)
);
alter table public.couple_points enable row level security;
drop policy if exists couple_points_select on public.couple_points;
drop policy if exists couple_points_insert on public.couple_points;
drop policy if exists couple_points_update on public.couple_points;
create policy couple_points_select on public.couple_points for select using (true);
create policy couple_points_insert on public.couple_points for insert with check (char_length(couple_id) >= 8);
create policy couple_points_update on public.couple_points for update using (char_length(couple_id) >= 8) with check (char_length(couple_id) >= 8);

-- Atomic, idempotent-ish increment so two devices can't clobber each other.
create or replace function public.couple_points_bump(p_couple_id text, p_profile text, p_delta int)
returns integer
language sql
security invoker
set search_path = ''
as $$
  insert into public.couple_points (couple_id, profile, points, updated_at)
  values (p_couple_id, p_profile, greatest(0, p_delta), now())
  on conflict (couple_id, profile)
  do update set points = greatest(0, public.couple_points.points + p_delta),
                updated_at = now()
  returning points;
$$;
grant execute on function public.couple_points_bump(text, text, int) to anon, authenticated;

-- ── couple_messages: the couple chat, per conversation topic ──
create table if not exists public.couple_messages (
  id              uuid        primary key default gen_random_uuid(),
  couple_id       text        not null,
  conversation_id text        not null default 'main',
  sender          text        not null,
  kind            text        not null default 'text' check (kind in ('text','image','audio')),
  body            text,
  media_url       text,
  created_at      timestamptz not null default now()
);
create index if not exists couple_messages_thread_idx
  on public.couple_messages (couple_id, conversation_id, created_at);
alter table public.couple_messages enable row level security;
drop policy if exists couple_messages_select on public.couple_messages;
drop policy if exists couple_messages_insert on public.couple_messages;
create policy couple_messages_select on public.couple_messages for select using (true);
create policy couple_messages_insert on public.couple_messages for insert
  with check (char_length(couple_id) >= 8 and char_length(coalesce(body, '') || coalesce(media_url, '')) > 0);

-- ── Realtime: stream inserts/updates to subscribers (postgres_changes) ──
alter publication supabase_realtime add table public.couple_points;
alter publication supabase_realtime add table public.couple_messages;
