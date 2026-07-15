-- Transactional assertions for durable game-invite delivery. Caller owns the
-- surrounding BEGIN/ROLLBACK and applies communication outbox first.

do $game_invite_push$
declare
  v_sender constant uuid := 'a4000000-0000-4000-8000-000000000001';
  v_target constant uuid := 'b4000000-0000-4000-8000-000000000002';
  v_first uuid;
  v_second uuid;
begin
  insert into auth.users (id, aud, role, created_at, updated_at)
  values
    (v_sender, 'authenticated', 'authenticated', now(), now()),
    (v_target, 'authenticated', 'authenticated', now(), now());
  insert into public.accounts (id, handle, display_name)
  values
    (v_sender, 'invite_push_a', 'Rafael'),
    (v_target, 'invite_push_b', 'Fatma');
  insert into public.connections (requester, addressee, status)
  values (v_sender, v_target, 'accepted');

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_sender::text, true);
  v_first := public.send_game_invite(v_target, 'ABC234', 'versus');

  if not exists (
    select 1
    from public.communication_push_outbox outbox
    where outbox.event_id = v_first
      and outbox.kind = 'game_invite'
      and outbox.sender = v_sender
      and outbox.target = v_target
      and outbox.status = 'queued'
      and outbox.url = '/secrets/versus/?join=ABC234&invite=' || v_first::text
  ) then
    raise exception 'game invite source did not atomically enqueue its push';
  end if;

  v_second := public.send_game_invite(v_target, 'XYZ567', 'versus');
  if v_second = v_first then
    raise exception 'replacement invite reused a deduplicated semantic id';
  end if;
  if not exists (
    select 1 from public.communication_push_outbox
    where event_id = v_first and status = 'expired' and body = ''
      and url = '/secrets/versus/'
  ) or not exists (
    select 1 from public.communication_push_outbox
    where event_id = v_second and status = 'queued'
      and url = '/secrets/versus/?join=XYZ567&invite=' || v_second::text
  ) then
    raise exception 'replacement did not expire old push and queue the new invite';
  end if;

  perform public.cancel_game_invites('XYZ567', 'versus');
  if not exists (
    select 1 from public.communication_push_outbox
    where event_id = v_second and status = 'expired' and body = ''
      and url = '/secrets/versus/'
  ) then
    raise exception 'cancelled invite left a deliverable stale push';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.send_game_invite(uuid,text,text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.send_game_invite(uuid,text,text)', 'EXECUTE') then
    raise exception 'send_game_invite execute grants are unsafe';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.game_invites'::regclass
      and policy.polname = 'gi_select'
      and pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) like '%are_connected%'
  ) then
    raise exception 'game invite SELECT policy outlives the friendship';
  end if;
end;
$game_invite_push$;
