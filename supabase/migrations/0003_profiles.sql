-- Cross-device profiles. Each person's editable identity (name/emoji/bio/photo)
-- lives here so it follows them to any device instead of staying in one phone's
-- IndexedDB. Keyed by (couple_id, profile) for now — the same interim identity
-- model as couple_points; swaps to auth.uid() when Supabase Auth lands.
-- Photos are uploaded to the couple-media bucket and referenced by URL.

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

alter publication supabase_realtime add table public.profiles;
