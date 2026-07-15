-- A multiplayer invite must reach the recipient even when no Realtime client
-- is open. The invite row and its communication outbox entry commit together;
-- Netlify only accelerates a job that already exists durably.

alter table public.communication_push_outbox
  drop constraint if exists communication_push_outbox_kind;
alter table public.communication_push_outbox
  add constraint communication_push_outbox_kind
    check (kind in ('love', 'nudge', 'message', 'test', 'game_invite'));

create or replace function private.enqueue_game_invite_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_name text;
begin
  if new.cancelled_at is not null
     or new.expires_at <= now()
     or new.game <> 'versus'
     or not public.are_connected(new.from_account, new.to_account) then
    return new;
  end if;

  select coalesce(account.display_name, '@' || account.handle::text, 'Um amigo')
    into v_sender_name
  from public.accounts account
  where account.id = new.from_account;

  insert into public.communication_push_outbox (
    event_id, kind, sender, target, title, body, url, expires_at
  ) values (
    new.id,
    'game_invite',
    new.from_account,
    new.to_account,
    left('🎮 ' || coalesce(v_sender_name, 'Um amigo') || ' convidou-te para jogar', 80),
    left('Entra na sala ' || new.room_code || ' com um toque.', 160),
    '/secrets/versus/?join=' || new.room_code || '&invite=' || new.id::text,
    least(new.expires_at, now() + interval '15 minutes')
  );
  return new;
end;
$$;

create or replace function private.expire_game_invite_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  if tg_op = 'DELETE'
     or (new.cancelled_at is not null and old.cancelled_at is null) then
    update public.communication_push_outbox outbox
    set status = case
          when outbox.status in ('queued', 'failed', 'dispatching') then 'expired'
          else outbox.status
        end,
        title = '🎮 Convite terminado',
        body = '',
        url = '/secrets/versus/',
        attempt_token = case
          when outbox.status in ('queued', 'failed', 'dispatching') then null
          else outbox.attempt_token
        end,
        lease_expires_at = case
          when outbox.status in ('queued', 'failed', 'dispatching') then null
          else outbox.lease_expires_at
        end,
        next_attempt_at = 'infinity'::timestamptz,
        completed_at = coalesce(outbox.completed_at, now()),
        updated_at = now(),
        last_error = coalesce(outbox.last_error, 'invite_closed')
    where outbox.event_id = v_id
      and outbox.kind = 'game_invite';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists game_invites_enqueue_push on public.game_invites;
create trigger game_invites_enqueue_push
after insert on public.game_invites
for each row execute function private.enqueue_game_invite_push();

drop trigger if exists game_invites_expire_push on public.game_invites;
create trigger game_invites_expire_push
before update of cancelled_at or delete on public.game_invites
for each row execute function private.expire_game_invite_push();

-- An invitation is relationship-scoped, not a capability that survives an
-- unfriend. DELETE remains available to either participant for cleanup, while
-- SELECT (including push-ping validation and the join proof) fails closed as
-- soon as the accepted connection no longer exists.
drop policy if exists gi_select on public.game_invites;
create policy gi_select on public.game_invites
  for select to authenticated
  using (
    (
      (select auth.uid()) = from_account
      or (select auth.uid()) = to_account
    )
    and public.are_connected(from_account, to_account)
  );

-- A replacement is a new semantic invitation with a new id. Reusing the old
-- id would be suppressed by Service Worker dedupe and could open a stale room.
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'game-invite:' || v_from::text || ':' || p_to_account::text || ':' || p_game,
      0
    )
  );

  -- Publish an explicit cancellation before replacement. Supabase cannot
  -- filter DELETE events, and RLS DELETE payloads expose only the primary key;
  -- this UPDATE lets the recipient remove the old banner deterministically.
  update public.game_invites invite
  set cancelled_at = v_now
  where invite.from_account = v_from
    and invite.to_account = p_to_account
    and invite.game = p_game
    and invite.cancelled_at is null;

  delete from public.game_invites invite
  where invite.from_account = v_from
    and invite.to_account = p_to_account
    and invite.game = p_game;

  insert into public.game_invites (
    from_account, to_account, room_code, game, created_at, expires_at, cancelled_at
  ) values (
    v_from, p_to_account, v_code, p_game,
    v_now, v_now + interval '15 minutes', null
  )
  returning id into v_invite;

  return v_invite;
end;
$$;

revoke all on function private.enqueue_game_invite_push() from public, anon, authenticated;
revoke all on function private.expire_game_invite_push() from public, anon, authenticated;
revoke all on function public.send_game_invite(uuid, text, text) from public, anon;
grant execute on function public.send_game_invite(uuid, text, text) to authenticated;
