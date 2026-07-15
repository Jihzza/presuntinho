-- Transactional integration assertions for 20260715053218_call_delivery_reliability.sql.
-- Run only against a disposable/test transaction after applying the migration;
-- the caller owns BEGIN/ROLLBACK so this file can also be appended to a compile
-- transaction in CI.

do $reliability$
declare
  v_caller constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_callee constant uuid := 'b0000000-0000-4000-8000-000000000002';
  v_conversation constant uuid := 'c0000000-0000-4000-8000-000000000003';
  v_call_one constant uuid := 'd0000000-0000-4000-8000-000000000004';
  v_call_prefix constant uuid := 'd0000000-0000-4000-8000-000000000005';
  v_call_cap constant uuid := 'd0000000-0000-4000-8000-000000000006';
  v_call_replaced constant uuid := 'd0000000-0000-4000-8000-000000000007';
  v_start_request constant uuid := 'e0000000-0000-4000-8000-000000000008';
  v_installation_one constant text := 'phone_A_0000000001';
  v_installation_two constant text := 'phoneXA_0000000001';
  v_subscription uuid;
  v_claim record;
  v_claim_rotated record;
  v_terminal record;
  v_terminal_rotated record;
  v_replaced_claim record;
  v_replacement_claim record;
  v_replacement_subscription uuid;
  v_count integer;
  v_version bigint;
  v_ok boolean;
  v_limit_rejected boolean := false;
  v_mismatch_rejected boolean := false;
  v_reliable_first public.call_sessions;
  v_reliable_replay public.call_sessions;
  v_legacy_start public.call_sessions;
  i integer;
begin
  insert into auth.users (id, aud, role, created_at, updated_at)
  values
    (v_caller, 'authenticated', 'authenticated', now(), now()),
    (v_callee, 'authenticated', 'authenticated', now(), now());
  insert into public.accounts (id, handle, display_name)
  values
    (v_caller, 'codexrel_a', 'Reliability caller'),
    (v_callee, 'codexrel_b', 'Reliability callee');
  insert into public.connections (requester, addressee, status)
  values (v_caller, v_callee, 'accepted');
  insert into public.chat_conversations (
    id, kind, direct_key, topic, created_by
  ) values (
    v_conversation,
    'direct',
    'dm:' || v_caller::text || ':' || v_callee::text,
    'main',
    v_caller
  );
  insert into public.chat_members (conversation_id, account)
  values (v_conversation, v_caller), (v_conversation, v_callee);

  -- The Netlify endpoint may replay after losing a successful HTTP response.
  -- The same caller/request returns exactly the committed session, while a
  -- changed payload is rejected. Cached clients retain the three-argument RPC.
  perform set_config('request.jwt.claim.sub', v_caller::text, true);
  if not public.preflight_call_start(v_conversation) then
    raise exception 'valid call-start preflight was rejected';
  end if;
  v_reliable_first := public.start_call_reliable(
    v_conversation, 'audio', 'reliable_caller_0001', v_start_request
  );
  v_reliable_replay := public.start_call_reliable(
    v_conversation, 'audio', 'reliable_caller_0001', v_start_request
  );
  if v_reliable_first.id is null
     or v_reliable_replay.id <> v_reliable_first.id
     or v_reliable_first.client_request_id <> v_start_request then
    raise exception 'reliable call replay did not return one canonical session';
  end if;
  select count(*) into v_count
  from public.call_sessions call_session
  where call_session.caller = v_caller
    and call_session.client_request_id = v_start_request;
  if v_count <> 1 or not exists (
    select 1 from public.call_delivery_outbox
    where call_id = v_reliable_first.id
  ) then
    raise exception 'reliable call replay duplicated or missed its atomic outbox';
  end if;
  begin
    perform public.start_call_reliable(
      v_conversation, 'video', 'reliable_caller_0001', v_start_request
    );
  exception when others then
    if sqlerrm = 'call request mismatch' then v_mismatch_rejected := true; end if;
  end;
  if not v_mismatch_rejected then
    raise exception 'reused call request accepted a mismatched payload';
  end if;

  update public.call_sessions
  set status = 'cancelled', ended_at = now(),
      created_at = now() - interval '10 seconds', updated_at = now()
  where id = v_reliable_first.id;
  v_legacy_start := public.start_call(
    v_conversation, 'audio', 'legacy_caller_000001'
  );
  if v_legacy_start.id is null or v_legacy_start.client_request_id is not null then
    raise exception 'cached three-argument start_call compatibility failed';
  end if;
  update public.call_sessions
  set status = 'cancelled', ended_at = now(),
      created_at = now() - interval '10 seconds', updated_at = now()
  where id = v_legacy_start.id;

  -- A first claim can legitimately observe no subscription. A subscription
  -- registered while the call is still live must reopen exactly that outcome.
  insert into public.call_sessions (
    id, conversation_id, caller, callee, caller_device, kind,
    expires_at, caller_heartbeat_at, caller_lease_expires_at
  ) values (
    v_call_one, v_conversation, v_caller, v_callee,
    'caller_device_0001', 'audio', now() + interval '5 minutes',
    now(), now() + interval '5 minutes'
  );
  insert into public.call_delivery_outbox (call_id) values (v_call_one);
  select count(*) into v_count
  from public.claim_call_delivery_batch(v_call_one, 10);
  if v_count <> 0 then
    raise exception 'expected no initial claim, got %', v_count;
  end if;
  if not exists (
    select 1 from public.call_delivery_outbox
    where call_id = v_call_one
      and status = 'failed'
      and last_error = 'no_push_devices'
  ) then
    raise exception 'no-device outbox result was not persisted';
  end if;
  select count(*) into v_count
  from public.call_events
  where call_id = v_call_one
    and event = 'push_no_devices'
    and details @> '{"channel":"push","reason":"no_push_devices"}'::jsonb;
  if v_count <> 1 then
    raise exception 'no-device result was not exposed as one participant event: %', v_count;
  end if;
  perform public.claim_call_delivery_batch(v_call_one, 10);
  select count(*) into v_count
  from public.call_events
  where call_id = v_call_one and event = 'push_no_devices';
  if v_count <> 1 then
    raise exception 'no-device event was duplicated on replay: %', v_count;
  end if;

  insert into public.push_subscriptions (
    endpoint, account, p256dh, auth, ua,
    installation_id, platform, capabilities
  ) values (
    'https://fcm.googleapis.com/wp/reliability-1', v_callee,
    repeat('A', 64), repeat('B', 32), 'integration-test',
    v_installation_one, 'android', '{"push":true}'::jsonb
  ) returning id into v_subscription;

  select * into v_claim
  from public.claim_call_delivery_batch(v_call_one, 10);
  if v_claim.delivery_id is null or v_claim.subscription_version <> 1 then
    raise exception 'late subscription was not claimed at version 1';
  end if;

  -- Any failure from old key material (including a permanent 400) is only a
  -- result for that snapshot; it must not disable version 2.
  update public.push_subscriptions
  set p256dh = repeat('C', 64)
  where id = v_subscription
  returning delivery_version into v_version;
  if v_version <> 2 then
    raise exception 'subscription version did not rotate to 2';
  end if;
  v_ok := public.record_call_delivery_result(
    v_claim.delivery_id, v_claim.attempt_token, v_claim.subscription_version,
    false, 400, 'old_material_rejected', false, null
  );
  if not v_ok or not exists (
    select 1 from public.push_subscriptions
    where id = v_subscription and delivery_version = 2 and disabled_at is null
  ) then
    raise exception 'late v1 result damaged v2 subscription';
  end if;

  select * into v_claim_rotated
  from public.claim_call_delivery_batch(v_call_one, 10);
  if v_claim_rotated.subscription_version <> 2 then
    raise exception 'rotated invitation was not reclaimed at version 2';
  end if;
  select attempt_count into v_count
  from public.call_deliveries where id = v_claim_rotated.delivery_id;
  if v_count <> 1 then
    raise exception 'rotation did not reset invitation attempts: %', v_count;
  end if;
  select cardinality(ack_token_hashes) into v_count
  from public.call_deliveries where id = v_claim_rotated.delivery_id;
  if v_count <> 1 then
    raise exception 'rotation did not reset ACK capability history: %', v_count;
  end if;

  -- The encrypted ACK token is delivery proof and wins over a later permanent
  -- provider result (or exhausted retry) while the call is still live.
  v_ok := public.record_call_delivery_result(
    v_claim_rotated.delivery_id, v_claim_rotated.attempt_token,
    v_claim_rotated.subscription_version,
    false, 400, 'later_attempt_rejected', false, null
  );
  if not v_ok then raise exception 'permanent result was not recorded'; end if;
  v_ok := public.ack_call_delivery_with_token(
    v_claim_rotated.delivery_id, v_claim_rotated.ack_token, 'presented'
  );
  if not v_ok or not exists (
    select 1 from public.call_deliveries
    where id = v_claim_rotated.delivery_id
      and status = 'presented'
      and next_attempt_at = 'infinity'::timestamptz
  ) then
    raise exception 'late presented ACK did not win';
  end if;

  -- Terminal cleanup has the same version CAS and a server-owned deadline.
  update public.call_sessions
  set status = 'cancelled', ended_at = now(), updated_at = now()
  where id = v_call_one;
  select * into v_terminal
  from public.claim_call_terminal_delivery_batch(v_call_one, 10);
  if v_terminal.delivery_id is null
     or v_terminal.terminal_expires_at <= now()
     or v_terminal.terminal_expires_at > now() + interval '61 seconds' then
    raise exception 'terminal claim/deadline invalid';
  end if;
  update public.push_subscriptions
  set auth = repeat('D', 32)
  where id = v_subscription
  returning delivery_version into v_version;
  if v_version <> 3 then raise exception 'terminal rotation did not reach v3'; end if;
  v_ok := public.record_call_terminal_delivery_result(
    v_terminal.delivery_id, v_terminal.attempt_token,
    v_terminal.subscription_version,
    false, 410, 'old_terminal_gone', true, null
  );
  if not v_ok or not exists (
    select 1 from public.push_subscriptions
    where id = v_subscription and delivery_version = 3 and disabled_at is null
  ) then
    raise exception 'late terminal result damaged v3 subscription';
  end if;
  select * into v_terminal_rotated
  from public.claim_call_terminal_delivery_batch(v_call_one, 10);
  if v_terminal_rotated.subscription_version <> 3 then
    raise exception 'terminal delivery was not reclaimed at v3';
  end if;

  -- A provider result may arrive after S1 was deleted and its delivery FK was
  -- set NULL, while S2 already owns the same installation. SQL NULL must be
  -- treated as "not current": the late permanent 404 remains retryable and the
  -- next seed/claim must bind the existing delivery to S2.
  insert into public.call_sessions (
    id, conversation_id, caller, callee, caller_device, kind,
    expires_at, caller_heartbeat_at, caller_lease_expires_at
  ) values (
    v_call_replaced, v_conversation, v_caller, v_callee,
    'caller_device_0003', 'audio', now() + interval '5 minutes',
    now(), now() + interval '5 minutes'
  );
  insert into public.call_delivery_outbox (call_id) values (v_call_replaced);
  select * into v_replaced_claim
  from public.claim_call_delivery_batch(v_call_replaced, 10);
  if v_replaced_claim.delivery_id is null
     or v_replaced_claim.subscription_id <> v_subscription then
    raise exception 'S1 was not claimed before replacement';
  end if;

  delete from public.push_subscriptions where id = v_subscription;
  if not exists (
    select 1 from public.call_deliveries
    where id = v_replaced_claim.delivery_id and subscription_id is null
  ) then
    raise exception 'deleting S1 did not null the delivery FK';
  end if;
  insert into public.push_subscriptions (
    endpoint, account, p256dh, auth, ua,
    installation_id, platform, capabilities
  ) values (
    'https://fcm.googleapis.com/wp/reliability-replacement', v_callee,
    repeat('I', 64), repeat('J', 32), 'integration-test',
    v_installation_one, 'android', '{"push":true}'::jsonb
  ) returning id into v_replacement_subscription;

  v_ok := public.record_call_delivery_result(
    v_replaced_claim.delivery_id, v_replaced_claim.attempt_token,
    v_replaced_claim.subscription_version,
    false, 404, 'deleted_snapshot_not_found', true, null
  );
  if not v_ok or not exists (
    select 1
    from public.call_deliveries delivery
    join public.call_delivery_outbox outbox on outbox.call_id = delivery.call_id
    where delivery.id = v_replaced_claim.delivery_id
      and delivery.status = 'failed'
      and delivery.last_error = 'subscription_rotated'
      and delivery.next_attempt_at <> 'infinity'::timestamptz
      and outbox.status = 'partial'
      and outbox.next_attempt_at <> 'infinity'::timestamptz
  ) then
    raise exception 'late S1 404 was not preserved as retryable';
  end if;

  select * into v_replacement_claim
  from public.claim_call_delivery_batch(v_call_replaced, 10);
  if v_replacement_claim.delivery_id <> v_replaced_claim.delivery_id
     or v_replacement_claim.subscription_id <> v_replacement_subscription
     or v_replacement_claim.subscription_version <> 1 then
    raise exception 'replacement S2 was not reclaimed after late S1 404';
  end if;
  update public.call_sessions
  set status = 'cancelled', ended_at = now(), updated_at = now()
  where id = v_call_replaced;

  -- Keep the replacement as the canonical first installation for subsequent
  -- fanout and literal-prefix assertions.
  v_subscription := v_replacement_subscription;

  -- Literal installation prefixes: '_' is data, never a LIKE wildcard.
  insert into public.push_subscriptions (
    endpoint, account, p256dh, auth, ua,
    installation_id, platform, capabilities
  ) values (
    'https://fcm.googleapis.com/wp/reliability-2', v_callee,
    repeat('E', 64), repeat('F', 32), 'integration-test',
    v_installation_two, 'android', '{"push":true}'::jsonb
  );
  insert into public.call_sessions (
    id, conversation_id, caller, callee, caller_device, kind,
    expires_at, caller_heartbeat_at, caller_lease_expires_at
  ) values (
    v_call_prefix, v_conversation, v_caller, v_callee,
    'caller_device_0002', 'audio', now() + interval '5 minutes',
    now(), now() + interval '5 minutes'
  );
  insert into public.call_delivery_outbox (call_id) values (v_call_prefix);
  perform private.seed_call_deliveries(v_call_prefix, v_callee);
  update public.call_deliveries
  set status = 'provider_accepted', attempt_count = 1,
      provider_status = 201, provider_accepted_at = now(),
      next_attempt_at = 'infinity'::timestamptz
  where call_id = v_call_prefix and channel = 'push';
  update public.call_sessions
  set status = 'accepted', callee_device = v_installation_two,
      callee_heartbeat_at = now(),
      callee_lease_expires_at = now() + interval '2 minutes',
      answered_at = now(), updated_at = now()
  where id = v_call_prefix;
  if not exists (
    select 1 from public.call_deliveries
    where call_id = v_call_prefix and channel = 'push'
      and installation_id = v_installation_one
      and status = 'answered_elsewhere'
  ) or not exists (
    select 1 from public.call_deliveries
    where call_id = v_call_prefix and channel = 'push'
      and installation_id = v_installation_two
      and status = 'provider_accepted'
  ) then
    raise exception 'literal installation actor attribution failed';
  end if;
  update public.call_sessions
  set status = 'ended', ended_at = now(), updated_at = now()
  where id = v_call_prefix;

  -- The pre-existing account cap and delivery fanout cap agree on ten total
  -- devices; an eleventh write is rejected before it can create call work.
  for i in 3..10 loop
    insert into public.push_subscriptions (
      endpoint, account, p256dh, auth, ua,
      installation_id, platform, capabilities
    ) values (
      'https://fcm.googleapis.com/wp/reliability-' || i,
      v_callee, repeat('G', 64), repeat('H', 32), 'integration-test',
      'fanout_device_' || lpad(i::text, 5, '0'),
      'android', '{"push":true}'::jsonb
    );
  end loop;
  begin
    insert into public.push_subscriptions (
      endpoint, account, p256dh, auth, ua,
      installation_id, platform, capabilities
    ) values (
      'https://fcm.googleapis.com/wp/reliability-11',
      v_callee, repeat('G', 64), repeat('H', 32), 'integration-test',
      'fanout_device_00011', 'android', '{"push":true}'::jsonb
    );
  exception when check_violation then
    v_limit_rejected := true;
  end;
  if not v_limit_rejected then
    raise exception 'eleventh push subscription was not rejected';
  end if;
  insert into public.call_sessions (
    id, conversation_id, caller, callee, caller_device, kind,
    expires_at, caller_heartbeat_at, caller_lease_expires_at
  ) values (
    v_call_cap, v_conversation, v_caller, v_callee,
    'caller_device_0003', 'audio', now() + interval '5 minutes',
    now(), now() + interval '5 minutes'
  );
  insert into public.call_delivery_outbox (call_id) values (v_call_cap);
  perform private.seed_call_deliveries(v_call_cap, v_callee);
  select count(*) into v_count
  from public.call_deliveries
  where call_id = v_call_cap and channel = 'push';
  if v_count <> 10 then
    raise exception 'push fanout cap expected 10, got %', v_count;
  end if;
end
$reliability$;
