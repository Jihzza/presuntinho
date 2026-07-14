-- Durable one-tap multiplayer invites. The original game_invites migration was
-- never applied to the live project, so this migration is intentionally
-- idempotent and also upgrades installations where the old table does exist.

create table if not exists public.game_invites (
  id           uuid primary key default gen_random_uuid(),
  from_account uuid not null references public.accounts(id) on delete cascade,
  to_account   uuid not null references public.accounts(id) on delete cascade,
  room_code    text not null,
  game         text not null default 'versus',
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '15 minutes'),
  cancelled_at timestamptz
);

alter table public.game_invites
  add column if not exists expires_at timestamptz;
alter table public.game_invites
  add column if not exists cancelled_at timestamptz;

update public.game_invites
set expires_at = created_at + interval '15 minutes'
where expires_at is null;

alter table public.game_invites
  alter column expires_at set default (now() + interval '15 minutes'),
  alter column expires_at set not null;

-- Old malformed/expired capability codes cannot identify a real room.
delete from public.game_invites
where upper(trim(room_code)) !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$';

update public.game_invites set room_code = upper(trim(room_code));

delete from public.game_invites where game <> 'versus';

alter table public.game_invites
  drop constraint if exists game_invites_room_code_format;
alter table public.game_invites
  add constraint game_invites_room_code_format
    check (room_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$');

alter table public.game_invites
  drop constraint if exists game_invites_supported_game;
alter table public.game_invites
  add constraint game_invites_supported_game check (game = 'versus');

alter table public.game_invites
  drop constraint if exists game_invites_valid_expiry;
alter table public.game_invites
  add constraint game_invites_valid_expiry
    check (expires_at > created_at and expires_at <= created_at + interval '30 minutes');

-- Keep only the newest pending invite per sender/recipient/game before adding
-- the idempotency key used by PostgREST upsert.
with ranked as (
  select id,
         row_number() over (
           partition by from_account, to_account, game
           order by created_at desc, id desc
         ) as row_number
  from public.game_invites
)
delete from public.game_invites gi
using ranked r
where gi.id = r.id and r.row_number > 1;

create unique index if not exists game_invites_sender_recipient_game_uidx
  on public.game_invites (from_account, to_account, game);
create index if not exists game_invites_to_idx
  on public.game_invites (to_account, created_at desc);
create index if not exists game_invites_expiry_idx
  on public.game_invites (expires_at);

alter table public.game_invites enable row level security;

drop policy if exists gi_select on public.game_invites;
create policy gi_select on public.game_invites
  for select to authenticated
  using (auth.uid() = from_account or auth.uid() = to_account);

drop policy if exists gi_insert on public.game_invites;
create policy gi_insert on public.game_invites
  for insert to authenticated
  with check (
    auth.uid() = from_account
    and from_account <> to_account
    and public.are_connected(from_account, to_account)
  );

drop policy if exists gi_update on public.game_invites;
create policy gi_update on public.game_invites
  for update to authenticated
  using (auth.uid() = from_account)
  with check (
    auth.uid() = from_account
    and from_account <> to_account
    and public.are_connected(from_account, to_account)
  );

drop policy if exists gi_delete on public.game_invites;
create policy gi_delete on public.game_invites
  for delete to authenticated
  using (auth.uid() = from_account or auth.uid() = to_account);

revoke all on table public.game_invites from public, anon, authenticated;
grant select, delete on table public.game_invites to authenticated;

-- Server-owned timestamps keep retries idempotent without letting a client
-- manufacture a never-expiring invite. SECURITY DEFINER is deliberately
-- narrow, authenticates the caller and checks the friendship itself.
create or replace function public.send_game_invite(
  p_to_account uuid,
  p_room_code text,
  p_game text default 'versus'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from uuid := auth.uid();
  v_invite uuid;
  v_now timestamptz := clock_timestamp();
  v_code text := upper(trim(p_room_code));
begin
  if v_from is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_to_account is null or p_to_account = v_from then
    raise exception 'invalid invite recipient' using errcode = '22023';
  end if;
  if p_game is distinct from 'versus' then
    raise exception 'unsupported game' using errcode = '22023';
  end if;
  if v_code is null or v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' then
    raise exception 'invalid room code' using errcode = '22023';
  end if;
  if not public.are_connected(v_from, p_to_account) then
    raise exception 'recipient is not a contact' using errcode = '42501';
  end if;

  insert into public.game_invites (
    from_account, to_account, room_code, game, created_at, expires_at, cancelled_at
  ) values (
    v_from, p_to_account, v_code, p_game, v_now, v_now + interval '15 minutes', null
  )
  on conflict (from_account, to_account, game) do update
    set room_code = excluded.room_code,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at,
        cancelled_at = null
  returning id into v_invite;

  return v_invite;
end;
$$;

revoke all on function public.send_game_invite(uuid, text, text) from public, anon;
grant execute on function public.send_game_invite(uuid, text, text) to authenticated;

create or replace function public.cancel_game_invites(
  p_room_code text,
  p_game text default 'versus'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from uuid := auth.uid();
  v_code text := upper(trim(p_room_code));
  v_count integer;
begin
  if v_from is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_game is distinct from 'versus' then
    raise exception 'unsupported game' using errcode = '22023';
  end if;
  if v_code is null or v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' then
    raise exception 'invalid room code' using errcode = '22023';
  end if;

  update public.game_invites
  set cancelled_at = clock_timestamp()
  where from_account = v_from
    and room_code = v_code
    and game = p_game
    and cancelled_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.cancel_game_invites(text, text) from public, anon;
grant execute on function public.cancel_game_invites(text, text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_invites'
  ) then
    alter publication supabase_realtime add table public.game_invites;
  end if;
end
$$;
