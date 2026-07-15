-- Transactional assertions for 20260715134218_chat_advanced_controls.sql.
-- The caller owns the surrounding BEGIN/ROLLBACK.

do $chat_advanced_setup$
declare
  v_a constant uuid := 'a7000000-0000-4000-8000-000000000001';
  v_b constant uuid := 'b7000000-0000-4000-8000-000000000002';
  v_c constant uuid := 'c7000000-0000-4000-8000-000000000003';
  v_ab constant uuid := 'd7000000-0000-4000-8000-000000000004';
  v_ac constant uuid := 'd7000000-0000-4000-8000-000000000005';
  v_source constant uuid := 'e7000000-0000-4000-8000-000000000006';
  v_forward constant uuid := 'e7000000-0000-4000-8000-000000000007';
  v_media constant uuid := 'e7000000-0000-4000-8000-000000000008';
  v_expired_text constant uuid := 'e7000000-0000-4000-8000-000000000009';
  v_short_text constant uuid := 'e7000000-0000-4000-8000-000000000010';
  v_retained_text constant uuid := 'e7000000-0000-4000-8000-000000000011';
  v_first_reminder uuid;
  v_second_reminder uuid;
  v_expiring_reminder uuid;
  v_count integer;
  v_expiry timestamptz;
begin
  insert into auth.users (id, aud, role, created_at, updated_at)
  values
    (v_a, 'authenticated', 'authenticated', now(), now()),
    (v_b, 'authenticated', 'authenticated', now(), now()),
    (v_c, 'authenticated', 'authenticated', now(), now());
  insert into public.accounts (id, handle, display_name)
  values
    (v_a, 'advanced_a', 'Advanced A'),
    (v_b, 'advanced_b', 'Advanced B'),
    (v_c, 'advanced_c', 'Advanced C');
  insert into public.connections (requester, addressee, status)
  values (v_a, v_b, 'accepted'), (v_a, v_c, 'accepted');
  insert into public.chat_conversations (id, kind, direct_key, topic, created_by)
  values
    (v_ab, 'direct', 'dm:' || v_a::text || ':' || v_b::text, 'main', v_a),
    (v_ac, 'direct', 'dm:' || v_a::text || ':' || v_c::text, 'main', v_a);
  insert into public.chat_members (conversation_id, account)
  values (v_ab, v_a), (v_ab, v_b), (v_ac, v_a), (v_ac, v_c);

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  if public.set_chat_disappearing(v_ab, 86400) <> 86400 then
    raise exception 'disappearing duration was not applied';
  end if;
  if not exists (
    select 1 from public.chat_disappearing_events event
    where event.conversation_id = v_ab and event.actor_id = v_a and event.seconds = 86400
  ) then
    raise exception 'disappearing change did not create a durable audit event';
  end if;

  insert into public.chat_messages (
    id, conversation_id, sender_id, client_id, kind, body
  ) values (
    v_source, v_ab, v_a, 'f7000000-0000-4000-8000-000000000001',
    'text', '  exact forwarded body  '
  );
  select expires_at into v_expiry from public.chat_messages where id = v_source;
  if v_expiry not between statement_timestamp() + interval '23 hours 59 minutes'
                         and statement_timestamp() + interval '24 hours 1 minute' then
    raise exception 'new message did not snapshot the active disappearing duration';
  end if;

  insert into public.chat_messages (
    id, conversation_id, sender_id, client_id, kind, body, forwarded_from_id
  ) values (
    v_forward, v_ac, v_a, 'f7000000-0000-4000-8000-000000000002',
    'text', '  exact forwarded body  ', v_source
  );
  if not exists (
    select 1 from public.chat_messages
    where id = v_forward and forwarded_from_id = v_source
  ) then
    raise exception 'exact text forward lost its provenance';
  end if;

  begin
    insert into public.chat_messages (
      conversation_id, sender_id, client_id, kind, body, forwarded_from_id
    ) values (
      v_ac, v_a, 'f7000000-0000-4000-8000-000000000003',
      'text', 'modified body', v_source
    );
    raise exception 'modified text unexpectedly retained forwarded provenance';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    insert into public.chat_messages (
      conversation_id, sender_id, client_id, kind,
      media_bucket, media_path, media_mime, media_name, media_size,
      media_variant, forwarded_from_id
    ) values (
      v_ac, v_a, 'f7000000-0000-4000-8000-000000000004', 'image',
      'chat-media', v_ac::text || '/' || v_a::text || '/forged.png',
      'image/png', 'forged.png', 10, 'sticker', v_source
    );
    raise exception 'media unexpectedly received a text provenance badge';
  exception when sqlstate 'P0002' then null;
  end;

  perform set_config('request.jwt.claim.sub', v_c::text, true);
  begin
    insert into public.chat_messages (
      conversation_id, sender_id, client_id, kind, body, forwarded_from_id
    ) values (
      v_ac, v_c, 'f7000000-0000-4000-8000-000000000005',
      'text', '  exact forwarded body  ', v_source
    );
    raise exception 'source-conversation outsider unexpectedly forwarded a message';
  exception when sqlstate 'P0002' then null;
  end;
  perform set_config('request.jwt.claim.sub', v_a::text, true);

  insert into public.chat_stars (message_id, account_id)
  values (v_source, v_a), (v_source, v_b);
  select count(*) into v_count from public.list_starred_chat_messages(null, null, 30);
  if v_count <> 1 then
    raise exception 'starred view did not isolate the authenticated account';
  end if;

  select reminder.id into v_first_reminder
  from public.set_chat_reminder(v_source, now() + interval '10 minutes') reminder;
  select reminder.id into v_second_reminder
  from public.set_chat_reminder(v_source, now() + interval '20 minutes') reminder;
  if v_first_reminder is null or v_second_reminder is null or v_first_reminder = v_second_reminder then
    raise exception 'reminder reschedule did not rotate its idempotency event id';
  end if;
  if exists (
    select 1 from public.chat_reminders
    where account_id = v_a and message_id = v_source and id <> v_second_reminder
  ) then
    raise exception 'reminder reschedule left a duplicate row';
  end if;

  insert into public.chat_messages (
    id, conversation_id, sender_id, client_id, kind, body
  ) values (
    v_short_text, v_ab, v_a, 'f7000000-0000-4000-8000-000000000006',
    'text', 'short retention'
  );
  update public.chat_messages
  set expires_at = now() + interval '5 minutes'
  where id = v_short_text;
  begin
    perform public.set_chat_reminder(v_short_text, now() + interval '10 minutes');
    raise exception 'reminder unexpectedly outlived its message';
  exception when sqlstate 'P0002' then null;
  end;

  insert into public.chat_messages (
    id, conversation_id, sender_id, client_id, kind,
    media_bucket, media_path, media_mime, media_name, media_size,
    media_variant, created_at
  ) values (
    v_media, v_ab, v_a, 'f7000000-0000-4000-8000-000000000007', 'image',
    'chat-media', v_ab::text || '/' || v_a::text || '/expiring.gif',
    'image/gif', 'expiring.gif', 64, 'gif', now() - interval '2 days'
  );
  insert into public.chat_messages (
    id, conversation_id, sender_id, client_id, kind, body, created_at
  ) values (
    v_expired_text, v_ab, v_a, 'f7000000-0000-4000-8000-000000000008',
    'text', 'advanced expired secret', now() - interval '2 days'
  );
  select reminder.id into v_expiring_reminder
  from public.set_chat_reminder(v_expired_text, now() + interval '10 minutes') reminder;
  update public.chat_reminders
  set remind_at = now() - interval '1 second'
  where id = v_expiring_reminder;
  if public.enqueue_due_chat_reminders(50) <> 1 then
    raise exception 'pre-expiry reminder was not queued';
  end if;
  if not exists (
    select 1
    from public.communication_push_outbox outbox
    join public.chat_messages message on message.id = v_expired_text
    where outbox.event_id = v_expiring_reminder
      and outbox.status = 'queued'
      and outbox.expires_at <= message.expires_at
  ) then
    raise exception 'reminder push lifetime outlived its source message';
  end if;
  update public.chat_messages
  set expires_at = now() - interval '1 second'
  where id in (v_media, v_expired_text);

  if exists (
    select 1 from public.search_chat_messages(v_ab, 'advanced expired secret', null, null, 30)
  ) or exists (
    select 1 from public.list_chat_media(v_ab, null, null, 100) where id = v_media
  ) then
    raise exception 'security-definer read path exposed expired content';
  end if;
  begin
    perform public.load_chat_message_context(v_expired_text, 5, 5);
    raise exception 'expired message unexpectedly loaded by exact context';
  exception when sqlstate 'P0002' then null;
  end;

  if public.set_chat_disappearing(v_ab, 0) <> 0 then
    raise exception 'disappearing setting could not be disabled';
  end if;
  insert into public.chat_messages (
    id, conversation_id, sender_id, client_id, kind, body
  ) values (
    v_retained_text, v_ab, v_a, 'f7000000-0000-4000-8000-000000000009',
    'text', 'retained after setting change'
  );
  if exists (select 1 from public.chat_messages where id = v_retained_text and expires_at is not null) then
    raise exception 'setting change rewrote the next message expiry incorrectly';
  end if;
end;
$chat_advanced_setup$;

-- Exercise actual table RLS as each account, not merely SECURITY DEFINER RPCs.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b7000000-0000-4000-8000-000000000002', true);
do $chat_advanced_member_rls$
declare
  v_conversation constant uuid := 'd7000000-0000-4000-8000-000000000004';
  v_expired_text constant uuid := 'e7000000-0000-4000-8000-000000000009';
  v_count integer;
begin
  select count(*) into v_count
  from public.chat_disappearing_events
  where conversation_id = v_conversation;
  if v_count <> 2 then
    raise exception 'other member cannot see the complete disappearing audit history';
  end if;
  if exists (select 1 from public.chat_reminders) then
    raise exception 'another member can read private reminders';
  end if;
  if exists (select 1 from public.chat_messages where id = v_expired_text) then
    raise exception 'message RLS exposed expired content before tombstoning';
  end if;
end;
$chat_advanced_member_rls$;

select set_config('request.jwt.claim.sub', 'c7000000-0000-4000-8000-000000000003', true);
do $chat_advanced_outsider_rls$
begin
  if exists (
    select 1 from public.chat_disappearing_events
    where conversation_id = 'd7000000-0000-4000-8000-000000000004'::uuid
  ) then
    raise exception 'conversation outsider can read disappearing audit events';
  end if;
end;
$chat_advanced_outsider_rls$;
reset role;

do $chat_advanced_worker$
declare
  v_a constant uuid := 'a7000000-0000-4000-8000-000000000001';
  v_ab constant uuid := 'd7000000-0000-4000-8000-000000000004';
  v_source constant uuid := 'e7000000-0000-4000-8000-000000000006';
  v_forward constant uuid := 'e7000000-0000-4000-8000-000000000007';
  v_media constant uuid := 'e7000000-0000-4000-8000-000000000008';
  v_expired_text constant uuid := 'e7000000-0000-4000-8000-000000000009';
  v_reminder uuid;
  v_expiring_reminder uuid;
  v_count integer;
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  select id into v_reminder
  from public.chat_reminders
  where account_id = v_a and message_id = v_source;
  select id into v_expiring_reminder
  from public.chat_reminders
  where account_id = v_a and message_id = v_expired_text;
  update public.chat_reminders
  set remind_at = now() - interval '1 second'
  where id = v_reminder;

  if public.enqueue_due_chat_reminders(50) <> 1 then
    raise exception 'due reminder was not enqueued exactly once';
  end if;
  if not exists (
    select 1 from public.communication_push_outbox outbox
    where outbox.event_id = v_reminder
      and outbox.kind = 'reminder'
      and outbox.sender = v_a
      and outbox.target = v_a
      and outbox.status = 'queued'
      and outbox.url = '/mensagens/?conversation=' || v_ab::text
        || '&message=' || v_source::text
  ) then
    raise exception 'reminder did not create the private durable push/deep link';
  end if;
  if public.enqueue_due_chat_reminders(50) <> 0 then
    raise exception 'reminder worker duplicated an already-notified event';
  end if;
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  if not public.cancel_chat_reminder(v_source) then
    raise exception 'owner could not remove a notified reminder';
  end if;
  if not exists (
    select 1 from public.communication_push_outbox outbox
    where outbox.event_id = v_reminder
      and outbox.status = 'expired'
      and outbox.body = ''
      and outbox.last_error = 'reminder_cancelled'
  ) then
    raise exception 'reminder cancellation left a deliverable private preview';
  end if;

  v_count := public.expire_chat_messages(100);
  if v_count < 2 then
    raise exception 'expiry worker did not tombstone due chat rows';
  end if;
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
      and job.object_path = v_ab::text || '/' || v_a::text || '/expiring.gif'
      and job.status = 'queued'
  ) then
    raise exception 'expiry did not atomically queue private media deletion';
  end if;
  if exists (
    select 1 from public.chat_messages
    where id = v_expired_text and (deleted_at is null or body is not null)
  ) then
    raise exception 'expired text content was not tombstoned';
  end if;
  if not exists (
    select 1 from public.chat_reminders reminder
    where reminder.id = v_expiring_reminder
      and reminder.status = 'cancelled'
  ) or not exists (
    select 1 from public.communication_push_outbox outbox
    where outbox.event_id = v_expiring_reminder
      and outbox.status = 'expired'
      and outbox.body = ''
      and outbox.last_error = 'reminder_source_expired'
  ) then
    raise exception 'message expiry left a stale reminder push deliverable';
  end if;

  perform set_config('request.jwt.claim.sub', v_a::text, true);
  begin
    perform public.edit_chat_message(v_forward, 'edited provenance');
    raise exception 'forwarded provenance remained editable';
  exception when others then
    if sqlerrm <> 'message cannot be edited' then raise; end if;
  end;

  if has_function_privilege(
       'authenticated', 'public.expire_chat_messages(integer)', 'EXECUTE'
     ) or has_function_privilege(
       'authenticated', 'public.enqueue_due_chat_reminders(integer)', 'EXECUTE'
     ) then
    raise exception 'browser role can execute a service-only chat worker';
  end if;
  if not has_function_privilege(
       'service_role', 'public.expire_chat_messages(integer)', 'EXECUTE'
     ) or not has_function_privilege(
       'service_role', 'public.enqueue_due_chat_reminders(integer)', 'EXECUTE'
     ) then
    raise exception 'service role cannot execute chat maintenance workers';
  end if;
  if has_table_privilege('authenticated', 'public.chat_reminders', 'INSERT')
     or has_column_privilege('authenticated', 'public.chat_messages', 'expires_at', 'INSERT')
     or not has_column_privilege('authenticated', 'public.chat_messages', 'forwarded_from_id', 'INSERT') then
    raise exception 'advanced chat Data API grants are not least-privilege';
  end if;
end;
$chat_advanced_worker$;
