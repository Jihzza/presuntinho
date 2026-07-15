-- Transactional integration assertions for 20260715134210_call_device_handoffs.sql.
-- The caller owns BEGIN/ROLLBACK so this can be appended to the full migration
-- compile transaction without leaving fixtures behind.

do $handoff$
declare
  v_caller constant uuid := 'f1000000-0000-4000-8000-000000000001';
  v_callee constant uuid := 'f2000000-0000-4000-8000-000000000002';
  v_conversation constant uuid := 'f3000000-0000-4000-8000-000000000003';
  v_call constant uuid := 'f4000000-0000-4000-8000-000000000004';
  v_request_one constant uuid := 'f5000000-0000-4000-8000-000000000005';
  v_request_two constant uuid := 'f6000000-0000-4000-8000-000000000006';
  v_request_three constant uuid := 'f7000000-0000-4000-8000-000000000007';
  v_request_four constant uuid := 'f8000000-0000-4000-8000-000000000008';
  v_installation_a constant text := 'handoff_phone_A_0001';
  v_installation_b constant text := 'handoff_phone_B_0002';
  v_installation_c constant text := 'handoff_phone_C_0003';
  v_callee_installation constant text := 'handoff_peer_0000004';
  v_device_a constant text := 'handoff_phone_A_0001.tab_A_00000001';
  v_device_b constant text := 'handoff_phone_B_0002.tab_B_00000002';
  v_device_b_loser constant text := 'handoff_phone_B_0002.tab_B_00000003';
  v_device_c constant text := 'handoff_phone_C_0003.tab_C_00000004';
  v_peer_device constant text := 'handoff_peer_0000004.tab_P_00000005';
  v_handoff_one public.call_handoffs;
  v_handoff_two public.call_handoffs;
  v_handoff_three public.call_handoffs;
  v_handoff_four public.call_handoffs;
  v_result jsonb;
  v_count integer;
  v_rejected boolean := false;
begin
  insert into auth.users (id, aud, role, created_at, updated_at)
  values
    (v_caller, 'authenticated', 'authenticated', now(), now()),
    (v_callee, 'authenticated', 'authenticated', now(), now());
  insert into public.accounts (id, handle, display_name)
  values
    (v_caller, 'codexhandoff_a', 'Handoff caller'),
    (v_callee, 'codexhandoff_b', 'Handoff callee');
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

  insert into public.account_installations (
    account, installation_id, platform, capabilities, last_seen_at
  ) values
    (v_caller, v_installation_a, 'ios',
      '{"realtime":true,"call_handoff":true,"video_calls":true}'::jsonb, now()),
    (v_caller, v_installation_b, 'android',
      '{"realtime":true,"call_handoff":true,"video_calls":true}'::jsonb, now()),
    (v_caller, v_installation_c, 'windows',
      '{"realtime":true,"call_handoff":true,"video_calls":true}'::jsonb, now()),
    (v_callee, v_callee_installation, 'android',
      '{"realtime":true,"call_handoff":true,"video_calls":true}'::jsonb, now());

  insert into public.call_sessions (
    id, conversation_id, caller, callee, caller_device, callee_device,
    kind, status, expires_at,
    caller_heartbeat_at, caller_lease_expires_at,
    callee_heartbeat_at, callee_lease_expires_at, answered_at
  ) values (
    v_call, v_conversation, v_caller, v_callee, v_device_a, v_peer_device,
    'video', 'accepted', now() + interval '5 minutes',
    now(), now() + interval '2 minutes',
    now(), now() + interval '2 minutes', now()
  );

  perform set_config('request.jwt.claim.sub', v_caller::text, true);
  select count(*) into v_count
  from public.list_call_handoff_targets(v_call, v_device_a);
  if v_count <> 2 then
    raise exception 'expected two active handoff targets, got %', v_count;
  end if;

  v_handoff_one := public.request_call_handoff(
    v_call, v_device_a, v_installation_b, v_request_one
  );
  if v_handoff_one.id is null
     or v_handoff_one.status <> 'requested'
     or v_handoff_one.call_id <> v_call then
    raise exception 'handoff request was not created for the same call';
  end if;

  -- A different participant cannot claim another account's durable handoff.
  perform set_config('request.jwt.claim.sub', v_callee::text, true);
  begin
    perform public.claim_call_handoff(v_handoff_one.id, v_peer_device);
  exception when others then
    if sqlerrm = 'handoff not found' then v_rejected := true; end if;
  end;
  if not v_rejected then raise exception 'cross-account handoff claim was accepted'; end if;
  perform set_config('request.jwt.claim.sub', v_caller::text, true);

  -- First claim wins transactionally. A losing tab receives a factual result,
  -- while the call id/status stay unchanged and only this participant's lease
  -- moves to the target device.
  v_result := public.claim_call_handoff(v_handoff_one.id, v_device_b);
  if v_result->>'ok' <> 'true'
     or v_result->'call'->>'id' <> v_call::text
     or v_result->'call'->>'status' <> 'accepted'
     or v_result->'call'->>'caller_device' <> v_device_b then
    raise exception 'first handoff claim did not atomically preserve/move the call: %', v_result;
  end if;
  v_result := public.claim_call_handoff(v_handoff_one.id, v_device_b_loser);
  if v_result->>'ok' <> 'false' or v_result->>'reason' <> 'already_claimed' then
    raise exception 'second target tab did not lose deterministically: %', v_result;
  end if;
  if not exists (
    select 1 from public.call_sessions
    where id = v_call and status = 'accepted'
      and caller_device = v_device_b and handoff_generation = 1
  ) then
    raise exception 'call identity/status/generation changed incorrectly during claim';
  end if;

  v_rejected := false;
  begin
    perform public.heartbeat_call(v_call, v_device_a);
  exception when others then
    if sqlerrm = 'call claimed by another device' then v_rejected := true; end if;
  end;
  if not v_rejected then
    raise exception 'old device retained authority after handoff';
  end if;
  if not public.complete_call_handoff(v_handoff_one.id, v_device_b) then
    raise exception 'new device could not complete its handoff';
  end if;

  -- Simulate crash-after-claim: B requests C, C claims ownership, then crashes
  -- before complete_call_handoff. A later explicit request from authoritative C
  -- must recover the old audit row and create a fresh request, never remain
  -- blocked forever and never revert the participant lease.
  v_handoff_two := public.request_call_handoff(
    v_call, v_device_b, v_installation_c, v_request_two
  );
  v_result := public.claim_call_handoff(v_handoff_two.id, v_device_c);
  if v_result->>'ok' <> 'true' then raise exception 'second handoff claim failed'; end if;
  v_handoff_three := public.request_call_handoff(
    v_call, v_device_c, v_installation_a, v_request_three
  );
  if v_handoff_three.status <> 'requested' then
    raise exception 'fresh handoff after crash was not created';
  end if;
  if not exists (
    select 1 from public.call_handoffs
    where id = v_handoff_two.id and status = 'completed' and completed_at is not null
  ) or not exists (
    select 1 from public.call_events
    where call_id = v_call and event = 'handoff_recovered'
      and details->>'handoffId' = v_handoff_two.id::text
  ) then
    raise exception 'crash-after-claim row was not safely recovered/audited';
  end if;
  if not exists (
    select 1 from public.call_sessions
    where id = v_call and status = 'accepted'
      and caller_device = v_device_c and handoff_generation = 2
  ) then
    raise exception 'recovery changed call ownership or identity';
  end if;
  if not public.cancel_call_handoff(v_handoff_three.id, v_device_c) then
    raise exception 'authoritative source could not cancel fresh handoff';
  end if;

  -- A terminal call transition atomically closes an offer that is still on the
  -- target screen, even when the other participant ended the shared call.
  v_handoff_four := public.request_call_handoff(
    v_call, v_device_c, v_installation_b, v_request_four
  );
  update public.call_sessions
  set status = 'ended', ended_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = v_call;
  if not exists (
    select 1 from public.call_handoffs
    where id = v_handoff_four.id and status = 'cancelled' and cancelled_at is not null
  ) or not exists (
    select 1 from public.call_events
    where call_id = v_call and event = 'handoff_cancelled'
      and details->>'handoffId' = v_handoff_four.id::text
      and details->>'reason' = 'call_terminal'
  ) then
    raise exception 'terminal call did not close and audit its pending handoff';
  end if;

  -- Audit rows expose only lifecycle metadata. No private negotiation material
  -- is persisted in either the handoff row or its participant-visible events.
  if exists (
    select 1 from public.call_events
    where call_id = v_call and event like 'handoff_%'
      and details ?| array['sdp', 'ice', 'candidate', 'ip']
  ) then
    raise exception 'handoff event persisted private WebRTC material';
  end if;
  if has_table_privilege('anon', 'public.call_handoffs', 'select')
     or not has_table_privilege('authenticated', 'public.call_handoffs', 'select')
     or has_function_privilege('anon', 'public.claim_call_handoff(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.claim_call_handoff(uuid,text)', 'execute') then
    raise exception 'handoff table/RPC grants are unsafe';
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'call_handoffs'
     ) then
    raise exception 'call_handoffs is missing from supabase_realtime';
  end if;
end
$handoff$;
