-- Transactional integration assertions for 20260715134210_call_device_handoffs.sql.
-- The caller owns BEGIN/ROLLBACK so this can be appended to the full migration
-- compile transaction without leaving fixtures behind.

do $handoff$
declare
  v_caller constant uuid := 'f1000000-0000-4000-8000-000000000001';
  v_callee constant uuid := 'f2000000-0000-4000-8000-000000000002';
  v_conversation constant uuid := 'f3000000-0000-4000-8000-000000000003';

  v_call_main constant uuid := 'f4000000-0000-4000-8000-000000000004';
  v_call_abort constant uuid := 'f4100000-0000-4000-8000-000000000014';
  v_call_source_recovery constant uuid := 'f4200000-0000-4000-8000-000000000024';
  v_call_end_before_claim constant uuid := 'f4300000-0000-4000-8000-000000000034';
  v_call_end_after_claim constant uuid := 'f4400000-0000-4000-8000-000000000044';
  v_call_end_after_complete constant uuid := 'f4500000-0000-4000-8000-000000000054';
  v_call_end_after_window constant uuid := 'f4600000-0000-4000-8000-000000000064';

  v_request_main constant uuid := 'f5000000-0000-4000-8000-000000000005';
  v_request_parallel constant uuid := 'f5100000-0000-4000-8000-000000000015';
  v_request_abort constant uuid := 'f5200000-0000-4000-8000-000000000025';
  v_request_source_recovery constant uuid := 'f5300000-0000-4000-8000-000000000035';
  v_request_end_before_claim constant uuid := 'f5400000-0000-4000-8000-000000000045';
  v_request_end_after_claim constant uuid := 'f5500000-0000-4000-8000-000000000055';
  v_request_end_after_complete constant uuid := 'f5600000-0000-4000-8000-000000000065';
  v_request_end_after_window constant uuid := 'f5700000-0000-4000-8000-000000000075';

  v_recovery_main constant uuid := 'a1000000-0000-4000-8000-000000000001';
  v_recovery_abort constant uuid := 'a2000000-0000-4000-8000-000000000002';
  v_recovery_source constant uuid := 'a3000000-0000-4000-8000-000000000003';
  v_recovery_end_before constant uuid := 'a4000000-0000-4000-8000-000000000004';
  v_recovery_end_claimed constant uuid := 'a5000000-0000-4000-8000-000000000005';
  v_recovery_end_completed constant uuid := 'a6000000-0000-4000-8000-000000000006';
  v_recovery_end_window constant uuid := 'a7000000-0000-4000-8000-000000000007';
  v_recovery_wrong constant uuid := 'af000000-0000-4000-8000-000000000099';

  v_installation_a constant text := 'handoff_source_0001';
  v_installation_b constant text := 'handoff_target_0002';
  v_installation_c constant text := 'handoff_other_00003';
  v_callee_installation constant text := 'handoff_peer_000004';
  v_callee_target constant text := 'handoff_peer_alt_05';
  v_device_a constant text := 'handoff_source_0001.tab_A_00000001';
  v_device_b constant text := 'handoff_target_0002.tab_B_00000002';
  v_device_b_suffix constant text := 'handoff_target_0002.tab_B_00000003';
  v_device_c constant text := 'handoff_other_00003.tab_C_00000004';
  v_peer_device constant text := 'handoff_peer_000004.tab_P_00000005';
  v_peer_target_device constant text := 'handoff_peer_alt_05.tab_Q_00000006';

  v_handoff_main public.call_handoffs;
  v_handoff_abort public.call_handoffs;
  v_handoff_source public.call_handoffs;
  v_handoff_end_before public.call_handoffs;
  v_handoff_end_claimed public.call_handoffs;
  v_handoff_end_completed public.call_handoffs;
  v_handoff_end_window public.call_handoffs;
  v_result jsonb;
  v_count integer;
  v_rejected boolean;
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
      '{"realtime":true,"call_handoff":true,"video_calls":true}'::jsonb, now()),
    (v_callee, v_callee_target, 'ios',
      '{"realtime":true,"call_handoff":true,"video_calls":true}'::jsonb, now());

  insert into public.call_sessions (
    id, conversation_id, caller, callee, caller_device, callee_device,
    kind, status, expires_at,
    caller_heartbeat_at, caller_lease_expires_at,
    callee_heartbeat_at, callee_lease_expires_at, answered_at
  ) values
    (v_call_main, v_conversation, v_caller, v_callee, v_device_a, v_peer_device,
      'video', 'accepted', now() + interval '5 minutes',
      now(), now() + interval '5 minutes', now(), now() + interval '5 minutes', now()),
    (v_call_abort, v_conversation, v_caller, v_callee, v_device_a, v_peer_device,
      'video', 'accepted', now() + interval '5 minutes',
      now(), now() + interval '5 minutes', now(), now() + interval '5 minutes', now()),
    (v_call_source_recovery, v_conversation, v_caller, v_callee, v_device_a, v_peer_device,
      'video', 'accepted', now() + interval '5 minutes',
      now(), now() + interval '5 minutes', now(), now() + interval '5 minutes', now()),
    (v_call_end_before_claim, v_conversation, v_caller, v_callee, v_device_a, v_peer_device,
      'video', 'accepted', now() + interval '5 minutes',
      now(), now() + interval '5 minutes', now(), now() + interval '5 minutes', now()),
    (v_call_end_after_claim, v_conversation, v_caller, v_callee, v_device_a, v_peer_device,
      'video', 'accepted', now() + interval '5 minutes',
      now(), now() + interval '5 minutes', now(), now() + interval '5 minutes', now()),
    (v_call_end_after_complete, v_conversation, v_caller, v_callee, v_device_a, v_peer_device,
      'video', 'accepted', now() + interval '5 minutes',
      now(), now() + interval '5 minutes', now(), now() + interval '5 minutes', now()),
    (v_call_end_after_window, v_conversation, v_caller, v_callee, v_device_a, v_peer_device,
      'video', 'accepted', now() + interval '5 minutes',
      now(), now() + interval '5 minutes', now(), now() + interval '5 minutes', now());

  perform set_config('request.jwt.claim.sub', v_caller::text, true);
  select count(*) into v_count
  from public.list_call_handoff_targets(v_call_main, v_device_a);
  if v_count <> 2 then
    raise exception 'expected two active caller handoff targets, got %', v_count;
  end if;

  -- Requested target preflight is scoped to the target installation and still
  -- requires a non-null installation-local recovery id.
  v_handoff_main := public.request_call_handoff(
    v_call_main, v_device_a, v_installation_b, v_request_main
  );
  if v_handoff_main.status <> 'requested'
     or v_handoff_main.source_generation <> 0
     or v_handoff_main.state_version <> 0 then
    raise exception 'main handoff request shape/version is wrong: %', row_to_json(v_handoff_main);
  end if;
  if not public.authorize_call_handoff_ice(
    v_call_main, v_handoff_main.id, v_device_b, v_recovery_main
  ) then
    raise exception 'requested target could not preflight ICE';
  end if;
  if public.authorize_call_handoff_ice(
    v_call_main, v_handoff_main.id, v_device_b, v_recovery_wrong
  ) then
    raise exception 'requested target replaced its preflight-bound recovery bearer';
  end if;
  if public.authorize_call_handoff_ice(
    v_call_main, v_handoff_main.id, v_device_c, v_recovery_main
  ) then
    raise exception 'an arbitrary same-account installation was authorized for ICE';
  end if;
  if public.authorize_call_handoff_ice(
    v_call_main, v_handoff_main.id, v_device_b, null
  ) then
    raise exception 'requested target was authorized without a recovery id';
  end if;

  -- There is one generation for the whole call. An open caller handoff must
  -- therefore block the callee from opening a parallel handoff on that call.
  perform set_config('request.jwt.claim.sub', v_callee::text, true);
  v_rejected := false;
  begin
    perform public.request_call_handoff(
      v_call_main, v_peer_device, v_callee_target, v_request_parallel
    );
  exception when others then
    if sqlerrm = 'handoff already pending' then v_rejected := true; end if;
  end;
  if not v_rejected then
    raise exception 'parallel handoff from the other participant was accepted';
  end if;

  -- The account boundary is enforced even when the attacker knows every id.
  v_rejected := false;
  begin
    perform public.claim_call_handoff(
      v_handoff_main.id, v_peer_target_device, v_recovery_main
    );
  exception when others then
    if sqlerrm = 'handoff not found' then v_rejected := true; end if;
  end;
  if not v_rejected then raise exception 'cross-account handoff claim was accepted'; end if;
  perform set_config('request.jwt.claim.sub', v_caller::text, true);

  -- First target claim stores only a digest. A second suffix cannot recover
  -- with the wrong bearer, nor with the right bearer before the short lease.
  v_result := public.claim_call_handoff(
    v_handoff_main.id, v_device_b, v_recovery_main
  );
  if v_result->>'ok' <> 'true'
     or v_result->'call'->>'id' <> v_call_main::text
     or v_result->'call'->>'status' <> 'accepted'
     or v_result->'call'->>'caller_device' <> v_device_b
     or (v_result->'call'->>'handoff_generation')::bigint <> 1 then
    raise exception 'first claim did not atomically move the call: %', v_result;
  end if;
  if not exists (
    select 1 from public.call_handoffs
    where id = v_handoff_main.id and status = 'claimed'
      and claimed_generation = 1 and state_version = 1
  ) then
    raise exception 'first claim did not advance generation/state_version once';
  end if;
  if not exists (
    select 1 from private.call_handoff_recovery_tokens
    where handoff_id = v_handoff_main.id
      and target_installation_id = v_installation_b
      and token_hash = extensions.digest(v_recovery_main::text, 'sha256')
  ) then
    raise exception 'first claim did not store the expected private token digest';
  end if;

  v_result := public.claim_call_handoff(
    v_handoff_main.id, v_device_b_suffix, v_recovery_wrong
  );
  if v_result->>'ok' <> 'false' or v_result->>'reason' <> 'already_claimed' then
    raise exception 'wrong recovery bearer was not rejected: %', v_result;
  end if;
  v_result := public.claim_call_handoff(
    v_handoff_main.id, v_device_b_suffix, v_recovery_main
  );
  if v_result->>'ok' <> 'false' or v_result->>'reason' <> 'recovery_not_available' then
    raise exception 'same-installation suffix bypassed the short claim lease: %', v_result;
  end if;
  if public.authorize_call_handoff_ice(
    v_call_main, v_handoff_main.id, v_device_b_suffix, v_recovery_main
  ) then
    raise exception 'suffix ICE preflight bypassed the short claim lease';
  end if;

  update public.call_handoffs
  set claimed_at = clock_timestamp() - interval '20 seconds',
      claim_device_lease_expires_at = clock_timestamp() - interval '1 second'
  where id = v_handoff_main.id;
  if public.authorize_call_handoff_ice(
    v_call_main, v_handoff_main.id, v_device_b_suffix, v_recovery_wrong
  ) then
    raise exception 'suffix ICE preflight accepted the wrong recovery bearer';
  end if;
  if not public.authorize_call_handoff_ice(
    v_call_main, v_handoff_main.id, v_device_b_suffix, v_recovery_main
  ) then
    raise exception 'eligible same-installation suffix could not preflight ICE';
  end if;
  v_result := public.claim_call_handoff(
    v_handoff_main.id, v_device_b_suffix, v_recovery_main
  );
  if v_result->>'ok' <> 'true'
     or v_result->'call'->>'caller_device' <> v_device_b_suffix
     or (v_result->'call'->>'handoff_generation')::bigint <> 2 then
    raise exception 'same-installation suffix recovery failed: %', v_result;
  end if;
  if not exists (
    select 1 from public.call_handoffs
    where id = v_handoff_main.id and status = 'claimed'
      and claimed_device = v_device_b_suffix
      and claimed_generation = 2 and state_version = 2
  ) then
    raise exception 'suffix recovery did not monotonically advance state/generation';
  end if;

  -- Completion is an ACK from the currently leased target. It must fail while
  -- that participant lease is stale, then succeed and erase the private bearer.
  update public.call_sessions
  set caller_heartbeat_at = clock_timestamp() - interval '2 minutes',
      caller_lease_expires_at = clock_timestamp() - interval '1 second'
  where id = v_call_main;
  if public.complete_call_handoff(v_handoff_main.id, v_device_b_suffix) then
    raise exception 'handoff completed with a stale target participant lease';
  end if;
  update public.call_sessions
  set caller_heartbeat_at = clock_timestamp(),
      caller_lease_expires_at = clock_timestamp() + interval '2 minutes'
  where id = v_call_main;
  if not public.complete_call_handoff(v_handoff_main.id, v_device_b_suffix) then
    raise exception 'live recovered target could not complete the handoff';
  end if;
  if not exists (
    select 1 from public.call_handoffs
    where id = v_handoff_main.id and status = 'completed'
      and state_version = 3 and completed_at is not null
  ) or exists (
    select 1 from private.call_handoff_recovery_tokens
    where handoff_id = v_handoff_main.id
  ) then
    raise exception 'completion did not advance state_version/delete private bearer';
  end if;

  -- A target-side setup failure may abort only with the exact bearer. Ownership
  -- returns to the original source and the generation remains monotonic.
  v_handoff_abort := public.request_call_handoff(
    v_call_abort, v_device_a, v_installation_b, v_request_abort
  );
  v_result := public.claim_call_handoff(
    v_handoff_abort.id, v_device_b, v_recovery_abort
  );
  if v_result->>'ok' <> 'true' then raise exception 'abort fixture claim failed: %', v_result; end if;
  if public.abort_call_handoff(
    v_handoff_abort.id, v_device_b, v_recovery_wrong
  ) then
    raise exception 'target abort accepted the wrong recovery bearer';
  end if;
  if not exists (
    select 1 from public.call_handoffs
    where id = v_handoff_abort.id and status = 'claimed' and state_version = 1
  ) then
    raise exception 'wrong abort mutated the claimed handoff';
  end if;
  if not public.abort_call_handoff(
    v_handoff_abort.id, v_device_b, v_recovery_abort
  ) then
    raise exception 'target could not abort with its recovery bearer';
  end if;
  if not exists (
    select 1 from public.call_sessions
    where id = v_call_abort and status = 'accepted'
      and caller_device = v_device_a and handoff_generation = 2
  ) or not exists (
    select 1 from public.call_handoffs
    where id = v_handoff_abort.id and status = 'reverted'
      and state_version = 2 and cancelled_at is not null
  ) or exists (
    select 1 from private.call_handoff_recovery_tokens
    where handoff_id = v_handoff_abort.id
  ) then
    raise exception 'target abort did not safely revert ownership/state/token';
  end if;

  -- Source recovery is deliberately slower than target recovery. Expiring the
  -- handoff grace is insufficient while the target call heartbeat remains live.
  v_handoff_source := public.request_call_handoff(
    v_call_source_recovery, v_device_a, v_installation_b, v_request_source_recovery
  );
  v_result := public.claim_call_handoff(
    v_handoff_source.id, v_device_b, v_recovery_source
  );
  if v_result->>'ok' <> 'true' then raise exception 'source recovery fixture claim failed: %', v_result; end if;
  update public.call_handoffs
  set claimed_at = clock_timestamp() - interval '2 minutes',
      claim_device_lease_expires_at = clock_timestamp() - interval '90 seconds',
      recovery_expires_at = clock_timestamp() - interval '60 seconds'
  where id = v_handoff_source.id;
  if public.recover_call_handoff_source(v_handoff_source.id, v_device_a) then
    raise exception 'source rollback ignored a live target participant heartbeat';
  end if;
  update public.call_sessions
  set caller_heartbeat_at = clock_timestamp() - interval '2 minutes',
      caller_lease_expires_at = clock_timestamp() - interval '1 second'
  where id = v_call_source_recovery;
  if not public.recover_call_handoff_source(v_handoff_source.id, v_device_a) then
    raise exception 'source could not recover after target participant lease became stale';
  end if;
  if not exists (
    select 1 from public.call_sessions
    where id = v_call_source_recovery and status = 'accepted'
      and caller_device = v_device_a and handoff_generation = 2
  ) or not exists (
    select 1 from public.call_handoffs
    where id = v_handoff_source.id and status = 'reverted' and state_version = 2
  ) or exists (
    select 1 from private.call_handoff_recovery_tokens
    where handoff_id = v_handoff_source.id
  ) then
    raise exception 'source recovery did not restore ownership/state/token safely';
  end if;

  -- Lock-order regression, order 1: explicit source hang-up commits before a
  -- pending target claim. The terminal trigger cancels the request and claim
  -- cannot resurrect the ended call.
  v_handoff_end_before := public.request_call_handoff(
    v_call_end_before_claim, v_device_a, v_installation_b, v_request_end_before_claim
  );
  if not public.authorize_call_handoff_ice(
    v_call_end_before_claim, v_handoff_end_before.id, v_device_b, v_recovery_end_before
  ) then
    raise exception 'end-before-claim fixture could not bind its preflight bearer';
  end if;
  v_result := to_jsonb(public.end_call(v_call_end_before_claim, v_device_a));
  if v_result->>'status' <> 'ended' then raise exception 'source end-before-claim failed: %', v_result; end if;
  if public.authorize_call_handoff_ice(
    v_call_end_before_claim, v_handoff_end_before.id, v_device_b, v_recovery_end_before
  ) then
    raise exception 'terminal call was authorized for ICE from a stale requested snapshot';
  end if;
  v_result := public.claim_call_handoff(
    v_handoff_end_before.id, v_device_b, v_recovery_end_before
  );
  if v_result->>'ok' <> 'false' or v_result->>'reason' <> 'cancelled' then
    raise exception 'claim resurrected a source-ended call: %', v_result;
  end if;
  if not exists (
    select 1 from public.call_handoffs
    where id = v_handoff_end_before.id and status = 'cancelled'
      and state_version = 1 and cancelled_at is not null
  ) or exists (
    select 1 from private.call_handoff_recovery_tokens
    where handoff_id = v_handoff_end_before.id
  ) or not exists (
    select 1 from public.call_events
    where call_id = v_call_end_before_claim
      and event = 'handoff_cancelled'
      and details->>'handoffId' = v_handoff_end_before.id::text
      and details->>'reason' = 'call_terminal'
  ) then
    raise exception 'terminal trigger did not cancel/version/audit a requested handoff';
  end if;

  -- Lock-order regression, order 2: claim commits first. The old source remains
  -- allowed to express explicit hang-up during the unresolved recovery window;
  -- the terminal trigger terminates the claim and destroys its bearer.
  v_handoff_end_claimed := public.request_call_handoff(
    v_call_end_after_claim, v_device_a, v_installation_b, v_request_end_after_claim
  );
  v_result := public.claim_call_handoff(
    v_handoff_end_claimed.id, v_device_b, v_recovery_end_claimed
  );
  if v_result->>'ok' <> 'true' then raise exception 'claim-before-end fixture failed: %', v_result; end if;
  v_result := to_jsonb(public.end_call(v_call_end_after_claim, v_device_a));
  if v_result->>'status' <> 'ended' then raise exception 'old source end-after-claim failed: %', v_result; end if;
  if not exists (
    select 1 from public.call_handoffs
    where id = v_handoff_end_claimed.id and status = 'terminated'
      and state_version = 2 and cancelled_at is not null
  ) or exists (
    select 1 from private.call_handoff_recovery_tokens
    where handoff_id = v_handoff_end_claimed.id
  ) or not exists (
    select 1 from public.call_events
    where call_id = v_call_end_after_claim
      and event = 'handoff_terminated'
      and details->>'handoffId' = v_handoff_end_claimed.id::text
      and details->>'reason' = 'call_terminal'
  ) then
    raise exception 'terminal trigger did not terminate/audit claim or delete bearer';
  end if;

  -- Complete and source hang-up may cross in flight. A completed target ACK
  -- grants the old source only the migration's bounded five-second final window.
  v_handoff_end_completed := public.request_call_handoff(
    v_call_end_after_complete, v_device_a, v_installation_b, v_request_end_after_complete
  );
  v_result := public.claim_call_handoff(
    v_handoff_end_completed.id, v_device_b, v_recovery_end_completed
  );
  if v_result->>'ok' <> 'true'
     or not public.complete_call_handoff(v_handoff_end_completed.id, v_device_b) then
    raise exception 'complete-before-source-end fixture failed: %', v_result;
  end if;
  v_result := to_jsonb(public.end_call(v_call_end_after_complete, v_device_a));
  if v_result->>'status' <> 'ended' then
    raise exception 'old source lost the five-second post-complete end window: %', v_result;
  end if;
  if not exists (
    select 1 from public.call_handoffs
    where id = v_handoff_end_completed.id and status = 'completed'
      and state_version = 2 and completed_at is not null
  ) then
    raise exception 'post-complete end regressed the absorbing completed state';
  end if;

  -- The exceptional old-source authority is short-lived after a successful
  -- target ACK. Once five seconds pass, only the current target device may end.
  v_handoff_end_window := public.request_call_handoff(
    v_call_end_after_window, v_device_a, v_installation_b, v_request_end_after_window
  );
  v_result := public.claim_call_handoff(
    v_handoff_end_window.id, v_device_b, v_recovery_end_window
  );
  if v_result->>'ok' <> 'true'
     or not public.complete_call_handoff(v_handoff_end_window.id, v_device_b) then
    raise exception 'expired post-complete window fixture failed: %', v_result;
  end if;
  update public.call_handoffs
  set completed_at = clock_timestamp() - interval '6 seconds',
      updated_at = clock_timestamp()
  where id = v_handoff_end_window.id;
  v_rejected := false;
  begin
    perform public.end_call(v_call_end_after_window, v_device_a);
  exception when others then
    if sqlerrm = 'call claimed by another device' then v_rejected := true; end if;
  end;
  if not v_rejected then
    raise exception 'old source retained authority after the five-second completed window';
  end if;
  if not exists (
    select 1 from public.call_sessions
    where id = v_call_end_after_window and status = 'accepted' and caller_device = v_device_b
  ) then
    raise exception 'expired old-source end window changed the live target call';
  end if;

  -- Every lifecycle transition above advances state_version from 0 exactly
  -- once per committed state/device-owner mutation; no path may regress it.
  if exists (
    select 1
    from public.call_handoffs
    where call_id in (
      v_call_main, v_call_abort, v_call_source_recovery,
      v_call_end_before_claim, v_call_end_after_claim, v_call_end_after_complete,
      v_call_end_after_window
    ) and state_version < 1
  ) then
    raise exception 'a committed handoff lifecycle retained/regressed state_version';
  end if;

  -- Participant-visible audit rows contain lifecycle metadata only. They never
  -- reveal an installation/device id, recovery bearer/hash, SDP or ICE material.
  if exists (
    select 1 from public.call_events
    where call_id in (
      v_call_main, v_call_abort, v_call_source_recovery,
      v_call_end_before_claim, v_call_end_after_claim, v_call_end_after_complete
    ) and event like 'handoff_%'
      and installation_id is not null
  ) then
    raise exception 'handoff audit event exposed installation_id';
  end if;
  if exists (
    select 1 from public.call_events
    where call_id in (
      v_call_main, v_call_abort, v_call_source_recovery,
      v_call_end_before_claim, v_call_end_after_claim, v_call_end_after_complete
    ) and event like 'handoff_%'
      and (
        details ?| array[
          'installationId', 'fromInstallationId', 'targetInstallationId',
          'device', 'claimedDevice', 'recoveryId', 'bearer', 'token',
          'tokenHash', 'sdp', 'ice', 'candidate', 'ip'
        ]
        or lower(details::text) ~ '"(sdp|ice|candidate|ip|bearer|token|tokenhash|recoveryid)"[[:space:]]*:'
        or position(v_installation_a in details::text) > 0
        or position(v_installation_b in details::text) > 0
        or position(v_installation_c in details::text) > 0
        or position(v_callee_installation in details::text) > 0
        or position(v_callee_target in details::text) > 0
        or position(v_device_a in details::text) > 0
        or position(v_device_b in details::text) > 0
        or position(v_device_b_suffix in details::text) > 0
        or position(v_recovery_main::text in details::text) > 0
        or position(v_recovery_abort::text in details::text) > 0
        or position(v_recovery_source::text in details::text) > 0
        or position(v_recovery_end_before::text in details::text) > 0
        or position(v_recovery_end_claimed::text in details::text) > 0
        or position(v_recovery_end_completed::text in details::text) > 0
        or position(v_recovery_wrong::text in details::text) > 0
        or exists (
          select 1
          from unnest(array[
            v_recovery_main, v_recovery_abort, v_recovery_source,
            v_recovery_end_before, v_recovery_end_claimed,
            v_recovery_end_completed, v_recovery_wrong
          ]) as recovery_secret(recovery_id)
          where position(
            encode(extensions.digest(recovery_id::text, 'sha256'), 'hex')
            in lower(details::text)
          ) > 0
        )
      )
  ) then
    raise exception 'handoff audit event persisted private handoff/WebRTC material';
  end if;

  -- Public Data API/RPC grants are explicit. The recovery digest table and
  -- private resolver remain inaccessible even to authenticated clients.
  if has_table_privilege('anon', 'public.call_handoffs', 'select')
     or not has_table_privilege('authenticated', 'public.call_handoffs', 'select')
     or has_table_privilege('authenticated', 'public.call_handoffs', 'insert')
     or has_table_privilege('authenticated', 'public.call_handoffs', 'update')
     or has_table_privilege('authenticated', 'public.call_handoffs', 'delete')
     or has_table_privilege('anon', 'private.call_handoff_recovery_tokens', 'select')
     or has_table_privilege('authenticated', 'private.call_handoff_recovery_tokens', 'select')
     or has_table_privilege('authenticated', 'private.call_handoff_recovery_tokens', 'insert')
     or has_table_privilege('authenticated', 'private.call_handoff_recovery_tokens', 'update')
     or has_table_privilege('authenticated', 'private.call_handoff_recovery_tokens', 'delete')
     or has_function_privilege('authenticated', 'private.call_device_installation(uuid,text)', 'execute') then
    raise exception 'handoff table/private token grants are unsafe';
  end if;

  if has_function_privilege('anon', 'public.list_call_handoff_targets(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.request_call_handoff(uuid,text,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.authorize_call_handoff_ice(uuid,uuid,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.claim_call_handoff(uuid,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.complete_call_handoff(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.cancel_call_handoff(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.abort_call_handoff(uuid,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.recover_call_handoff_source(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.end_call(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.list_call_handoff_targets(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.request_call_handoff(uuid,text,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.authorize_call_handoff_ice(uuid,uuid,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.claim_call_handoff(uuid,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.complete_call_handoff(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.cancel_call_handoff(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.abort_call_handoff(uuid,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.recover_call_handoff_source(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.end_call(uuid,text)', 'execute')
     or to_regprocedure('public.claim_call_handoff(uuid,text)') is not null then
    raise exception 'handoff RPC signatures/grants are unsafe or stale';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index index_row
    join pg_catalog.pg_class index_class on index_class.oid = index_row.indexrelid
    join pg_catalog.pg_class table_class on table_class.oid = index_row.indrelid
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = table_class.relnamespace
    where namespace_row.nspname = 'public'
      and table_class.relname = 'call_handoffs'
      and index_class.relname = 'call_handoffs_one_open_per_call'
      and index_row.indisunique
      and index_row.indpred is not null
      and position('(call_id)' in pg_catalog.pg_get_indexdef(index_row.indexrelid)) > 0
  ) then
    raise exception 'one-open-handoff-per-call partial unique index is missing';
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
