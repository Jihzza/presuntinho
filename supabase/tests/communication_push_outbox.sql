-- Transactional integration assertions for
-- 20260715101500_communication_push_outbox.sql. The caller owns BEGIN/ROLLBACK.

do $communication_push$
declare
  v_sender constant uuid := 'a3000000-0000-4000-8000-000000000001';
  v_target constant uuid := 'b3000000-0000-4000-8000-000000000002';
  v_conversation constant uuid := 'c3000000-0000-4000-8000-000000000003';
  v_space constant uuid := 'c3000000-0000-4000-8000-000000000004';
  v_message constant uuid := 'd3000000-0000-4000-8000-000000000004';
  v_ping constant uuid := 'd3000000-0000-4000-8000-000000000005';
  v_ping_throttled constant uuid := 'd3000000-0000-4000-8000-000000000006';
  v_media constant uuid := 'd3000000-0000-4000-8000-000000000007';
  v_media_reuse constant uuid := 'd3000000-0000-4000-8000-000000000008';
  v_test constant uuid := 'e3000000-0000-4000-8000-000000000005';
  v_call_request constant uuid := 'f3000000-0000-4000-8000-000000000006';
  v_fresh constant uuid := 'e3000000-0000-4000-8000-000000000006';
  v_row record;
  v_first_token uuid;
  v_second_token uuid;
  v_media_job_id uuid;
  v_function_def text;
  v_ok boolean;
  v_count integer;
  v_call public.call_sessions;
  i integer;
begin
  insert into auth.users (id, aud, role, created_at, updated_at)
  values
    (v_sender, 'authenticated', 'authenticated', now(), now()),
    (v_target, 'authenticated', 'authenticated', now(), now());
  insert into public.accounts (id, handle, display_name)
  values
    (v_sender, 'pushout_a', 'Push sender'),
    (v_target, 'pushout_b', 'Push target');
  insert into public.connections (requester, addressee, status)
  values (v_sender, v_target, 'accepted');
  insert into public.spaces (id, kind, name, owner)
  values (v_space, 'couple', 'Push couple', v_sender);
  insert into public.space_members (space_id, account, role, status)
  values
    (v_space, v_sender, 'owner', 'accepted'),
    (v_space, v_target, 'member', 'accepted');
  insert into public.chat_conversations (id, kind, direct_key, topic, created_by)
  values (
    v_conversation,
    'direct',
    'dm:' || v_sender::text || ':' || v_target::text,
    'main',
    v_sender
  );
  insert into public.chat_members (conversation_id, account)
  values (v_conversation, v_sender), (v_conversation, v_target);
  insert into public.chat_messages (
    id, conversation_id, sender_id, client_id, kind, body
  ) values (
    v_message, v_conversation, v_sender,
    'd3000000-0000-4000-8000-000000000099', 'text', 'durable hello'
  );
  insert into public.chat_messages (
    id, conversation_id, sender_id, client_id, kind,
    media_bucket, media_path, media_mime, media_name, media_size
  ) values (
    v_media, v_conversation, v_sender,
    'd3000000-0000-4000-8000-000000000098', 'image',
    'chat-media', v_conversation::text || '/photo one.jpg',
    'image/jpeg', 'photo one.jpg', 1024
  );

  -- No browser HTTP wakeup occurs between this source commit and the check:
  -- the AFTER INSERT trigger is the atomic durability boundary.
  if not exists (
    select 1 from public.communication_push_outbox outbox
    where outbox.event_id = v_message
      and outbox.kind = 'message'
      and outbox.sender = v_sender
      and outbox.target = v_target
      and outbox.status = 'queued'
      and outbox.url = '/mensagens/?conversation=' || v_conversation::text
        || '&message=' || v_message::text
  ) then
    raise exception 'chat source commit did not atomically enqueue its push';
  end if;

  insert into public.couple_pings (id, couple_id, sender, kind)
  values (v_ping, v_space::text, v_sender::text, 'love');
  if not exists (
    select 1 from public.communication_push_outbox outbox
    where outbox.event_id = v_ping
      and outbox.kind = 'love'
      and outbox.target = v_target
      and outbox.status = 'queued'
  ) then
    raise exception 'couple ping commit did not atomically enqueue its push';
  end if;
  insert into public.couple_pings (id, couple_id, sender, kind)
  values (v_ping_throttled, v_space::text, v_sender::text, 'love');
  if exists (
    select 1 from public.communication_push_outbox
    where event_id = v_ping_throttled
  ) or not exists (
    select 1 from public.couple_pings
    where id = v_ping_throttled and push_claimed_at is not null
  ) then
    raise exception 'durable couple-ping throttle did not consume without enqueueing';
  end if;
  select lower(pg_catalog.pg_get_functiondef(
    'private.enqueue_couple_ping_push()'::regprocedure
  )) into v_function_def;
  if position('pg_advisory_xact_lock' in v_function_def) = 0
     or position('couple-ping-push:' in v_function_def) = 0
     or position('pg_advisory_xact_lock' in v_function_def)
        > position('from public.communication_push_outbox recent' in v_function_def) then
    raise exception 'couple-ping throttle read is not serialized by its sender/kind lock';
  end if;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_sender::text, true);
  select * into v_row
  from public.enqueue_communication_push(
    v_message, 'message', 'New message', 'durable hello', '/mensagens/'
  );
  if v_row.event_id <> v_message or v_row.target <> v_target or v_row.status <> 'queued' then
    raise exception 'valid message did not create the expected durable job';
  end if;
  if not exists (
    select 1 from public.chat_messages message
    where message.id = v_message and message.push_claimed_at is not null
  ) then
    raise exception 'source message claim was not committed with its outbox';
  end if;

  perform public.enqueue_communication_push(
    v_message, 'message', 'New message', 'durable hello', '/mensagens/'
  );
  select count(*) into v_count
  from public.communication_push_outbox outbox
  where outbox.event_id = v_message;
  if v_count <> 1 then raise exception 'idempotent enqueue duplicated the outbox'; end if;

  -- The worker lease token is a CAS capability. A retry rotates it and a late
  -- result from the first provider attempt must not overwrite the second.
  select * into v_row from public.claim_communication_push(v_message);
  v_first_token := v_row.attempt_token;
  if v_first_token is null or v_row.attempt_count <> 1 then
    raise exception 'first durable delivery claim failed';
  end if;
  v_ok := public.record_communication_push_result(
    v_message, v_first_token, 0, 1, 0, 1, false, 'provider_unavailable'
  );
  if not v_ok then raise exception 'retryable provider result was rejected'; end if;
  update public.communication_push_outbox
  set next_attempt_at = now()
  where event_id = v_message;
  select * into v_row from public.claim_communication_push(v_message);
  v_second_token := v_row.attempt_token;
  if v_second_token is null or v_second_token = v_first_token or v_row.attempt_count <> 2 then
    raise exception 'retry did not rotate its delivery token';
  end if;
  if public.record_communication_push_result(
    v_message, v_first_token, 1, 0, 0, 0, false, null
  ) then
    raise exception 'late provider result overwrote a newer lease';
  end if;
  if not public.record_communication_push_result(
    v_message, v_second_token, 1, 0, 0, 0, false, null
  ) then
    raise exception 'successful current provider result was rejected';
  end if;
  if not exists (
    select 1 from public.communication_push_outbox outbox
    where outbox.event_id = v_message
      and outbox.status = 'sent'
      and outbox.sent_count = 1
      and outbox.completed_at is not null
  ) then
    raise exception 'successful delivery did not terminally complete the job';
  end if;

  update public.chat_messages set deleted_at = now() where id = v_message;
  if not exists (
    select 1 from public.communication_push_outbox outbox
    where outbox.event_id = v_message
      and outbox.body = ''
      and outbox.title = '💬 Mensagem eliminada'
  ) then
    raise exception 'deleted message preview remained in the push outbox';
  end if;

  perform public.delete_chat_message(v_media);
  if not exists (
    select 1 from public.chat_messages message
    where message.id = v_media
      and message.deleted_at is not null
      and message.media_bucket is null
      and message.media_path is null
  ) or not exists (
    select 1 from public.chat_media_deletion_outbox job
    where job.message_id = v_media
      and job.bucket = 'chat-media'
      and job.object_path = v_conversation::text || '/photo one.jpg'
      and job.status = 'queued'
  ) then
    raise exception 'media tombstone did not atomically enqueue object deletion';
  end if;
  select * into v_row from public.claim_chat_media_deletion_batch(1);
  v_media_job_id := v_row.id;
  v_first_token := v_row.attempt_token;
  if v_first_token is null then raise exception 'media deletion lease was not claimed'; end if;
  if not public.record_chat_media_deletion_result(
    v_row.id, v_first_token, false, true, 'storage_temporarily_unavailable'
  ) then
    raise exception 'retryable media deletion result was rejected';
  end if;
  update public.chat_media_deletion_outbox set next_attempt_at = now()
  where message_id = v_media;
  select * into v_row from public.claim_chat_media_deletion_batch(1);
  v_second_token := v_row.attempt_token;
  if v_second_token is null or v_second_token = v_first_token then
    raise exception 'media deletion retry did not rotate its lease token';
  end if;
  if public.record_chat_media_deletion_result(
    v_media_job_id, v_first_token, true, false, null
  ) then
    raise exception 'late media deletion result overwrote the current lease';
  end if;
  v_ok := public.record_chat_media_deletion_result(
    v_media_job_id, v_second_token, true, false, null
  );
  if not v_ok then
    raise exception 'confirmed media deletion result was rejected';
  end if;
  if not exists (
    select 1 from public.chat_media_deletion_outbox job
    where job.id = v_media_job_id
      and job.message_id = v_media
      and job.status = 'deleted'
  ) then
    raise exception 'confirmed media deletion did not complete its durable job';
  end if;

  -- Reusing an object path must rearm even a previously completed job. Storage
  -- deletion remains retryable forever: attempt_count is diagnostic and caps
  -- at eight, but never becomes a terminal retry gate.
  insert into public.chat_messages (
    id, conversation_id, sender_id, client_id, kind,
    media_bucket, media_path, media_mime, media_name, media_size
  ) values (
    v_media_reuse, v_conversation, v_sender,
    'd3000000-0000-4000-8000-000000000097', 'image',
    'chat-media', v_conversation::text || '/photo one.jpg',
    'image/jpeg', 'photo one.jpg', 2048
  );
  perform public.delete_chat_message(v_media_reuse);
  if not exists (
    select 1 from public.chat_media_deletion_outbox job
    where job.id = v_media_job_id
      and job.message_id = v_media_reuse
      and job.status = 'queued'
      and job.attempt_count = 0
      and job.attempt_token is null
      and job.lease_expires_at is null
      and job.completed_at is null
  ) then
    raise exception 'reused media path did not rearm its durable deletion job';
  end if;

  update public.chat_media_deletion_outbox job
  set status = 'dispatching',
      attempt_count = 8,
      attempt_token = gen_random_uuid(),
      lease_expires_at = now() - interval '1 second',
      next_attempt_at = now()
  where job.id = v_media_job_id;
  select * into v_row from public.claim_chat_media_deletion_batch(1);
  v_first_token := v_row.attempt_token;
  if v_row.id <> v_media_job_id
     or v_first_token is null
     or v_row.attempt_count <> 8 then
    raise exception 'expired media lease was not recovered after attempt eight';
  end if;
  v_ok := public.record_chat_media_deletion_result(
    v_media_job_id, v_first_token, false, false, 'storage_forbidden'
  );
  if not v_ok then
    raise exception 'non-transient media deletion result was rejected';
  end if;
  if not exists (
    select 1 from public.chat_media_deletion_outbox job
    where job.id = v_media_job_id
      and job.status = 'failed'
      and job.attempt_count = 8
      and job.attempt_token is null
      and job.lease_expires_at is null
      and job.completed_at is null
      and job.next_attempt_at between now() + interval '5 hours 59 minutes'
                                  and now() + interval '6 hours 1 minute'
  ) then
    raise exception 'non-transient media failure lost its long-backoff retry';
  end if;

  update public.chat_media_deletion_outbox job
  set completed_at = now() - interval '8 days'
  where job.id = v_media_job_id;
  perform public.maintain_chat_media_deletion_outbox();
  if not exists (
    select 1 from public.chat_media_deletion_outbox job
    where job.id = v_media_job_id and job.status = 'failed'
  ) then
    raise exception 'maintenance purged an unconfirmed media deletion';
  end if;

  update public.chat_media_deletion_outbox job
  set next_attempt_at = now(), completed_at = null
  where job.id = v_media_job_id;
  select * into v_row from public.claim_chat_media_deletion_batch(1);
  v_second_token := v_row.attempt_token;
  if v_row.id <> v_media_job_id
     or v_second_token is null
     or v_second_token = v_first_token
     or v_row.attempt_count <> 8 then
    raise exception 'media deletion did not retry indefinitely at the attempt cap';
  end if;
  v_ok := public.record_chat_media_deletion_result(
    v_media_job_id, v_second_token, true, false, null
  );
  if not v_ok then
    raise exception 'eventual confirmed media deletion was rejected';
  end if;
  update public.chat_media_deletion_outbox job
  set completed_at = now() - interval '8 days'
  where job.id = v_media_job_id;
  perform public.maintain_chat_media_deletion_outbox();
  if exists (
    select 1 from public.chat_media_deletion_outbox job
    where job.id = v_media_job_id
  ) then
    raise exception 'confirmed media deletion exceeded its retention window';
  end if;

  -- Self-tests use the same outbox and terminate factually when no device is
  -- registered, rather than claiming a provider send that never happened.
  select * into v_row
  from public.enqueue_communication_push(
    v_test, 'test', 'Test notification', 'hello', '/definicoes/'
  );
  if v_row.target <> v_sender then raise exception 'self-test target was not the sender'; end if;
  select * into v_row from public.claim_communication_push(v_test);
  if not public.record_communication_push_result(
    v_test, v_row.attempt_token, 0, 0, 0, 0, true, null
  ) then
    raise exception 'no-device result was rejected';
  end if;
  if not exists (
    select 1 from public.communication_push_outbox outbox
    where outbox.event_id = v_test
      and outbox.status = 'sent'
      and outbox.no_devices
      and outbox.last_error = 'no_push_devices'
  ) then
    raise exception 'no-device completion was not recorded factually';
  end if;

  -- Expired rows are filtered before LIMIT. A backlog of old work must never
  -- hide a fresh due event from the scheduled recovery worker.
  for i in 1..12 loop
    insert into public.communication_push_outbox (
      event_id, kind, sender, target, title, body, url,
      status, expires_at, next_attempt_at
    ) values (
      ('e2000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
      'test', v_sender, v_sender, 'Expired', '', '/',
      'queued', now() - interval '1 minute', now() - interval '2 minutes'
    );
  end loop;
  insert into public.communication_push_outbox (
    event_id, kind, sender, target, title, body, url, expires_at, next_attempt_at
  ) values (
    v_fresh, 'test', v_sender, v_sender, 'Fresh', '', '/',
    now() + interval '5 minutes', now() - interval '1 second'
  );
  select * into v_row from public.list_communication_push_candidates(1);
  if v_row.event_id <> v_fresh then
    raise exception 'expired backlog starved the fresh push candidate';
  end if;

  update public.communication_push_outbox
  set completed_at = now() - interval '25 hours'
  where event_id = v_message;
  perform public.maintain_communication_push_outbox();
  if exists (
    select 1 from public.communication_push_outbox where event_id = v_message
  ) then
    raise exception 'terminal message preview exceeded the retention window';
  end if;

  if has_function_privilege(
       'authenticated', 'public.start_call(uuid,text,text)', 'EXECUTE'
     ) or has_function_privilege(
       'authenticated', 'public.start_call_reliable(uuid,text,text,uuid)', 'EXECUTE'
     ) then
    raise exception 'browser role can still bypass the call-start gateway';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.start_call_from_gateway(uuid,uuid,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'service role cannot execute the call-start gateway';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  v_call := public.start_call_from_gateway(
    v_sender, v_conversation, 'audio', 'gateway_device_0001', v_call_request
  );
  if v_call.id is null
     or v_call.caller <> v_sender
     or v_call.client_request_id <> v_call_request
     or not exists (
       select 1 from public.call_delivery_outbox outbox where outbox.call_id = v_call.id
     ) then
    raise exception 'gateway did not create the call and atomic call outbox';
  end if;
end;
$communication_push$;
