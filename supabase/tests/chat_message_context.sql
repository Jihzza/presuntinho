-- Transactional assertions for load_chat_message_context. Caller owns the
-- surrounding BEGIN/ROLLBACK.

do $chat_context$
declare
  v_a constant uuid := 'a5000000-0000-4000-8000-000000000001';
  v_b constant uuid := 'b5000000-0000-4000-8000-000000000002';
  v_outsider constant uuid := 'b5000000-0000-4000-8000-000000000003';
  v_conversation constant uuid := 'c5000000-0000-4000-8000-000000000004';
  v_target uuid;
  v_count integer;
  v_min timestamptz;
  v_max timestamptz;
  v_target_at timestamptz;
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  i integer;
begin
  insert into auth.users (id, aud, role, created_at, updated_at)
  values
    (v_a, 'authenticated', 'authenticated', now(), now()),
    (v_b, 'authenticated', 'authenticated', now(), now()),
    (v_outsider, 'authenticated', 'authenticated', now(), now());
  insert into public.accounts (id, handle, display_name)
  values
    (v_a, 'context_a', 'Context A'),
    (v_b, 'context_b', 'Context B'),
    (v_outsider, 'context_x', 'Context outsider');
  insert into public.connections (requester, addressee, status)
  values (v_a, v_b, 'accepted');
  insert into public.chat_conversations (id, kind, direct_key, topic, created_by)
  values (v_conversation, 'direct', 'dm:' || v_a::text || ':' || v_b::text, 'main', v_a);
  insert into public.chat_members (conversation_id, account)
  values (v_conversation, v_a), (v_conversation, v_b);

  for i in 1..21 loop
    insert into public.chat_messages (
      conversation_id, sender_id, client_id, kind, body, created_at
    ) values (
      v_conversation, v_a, gen_random_uuid(), 'text', 'context message ' || i,
      timestamptz '2026-07-15 10:00:00+00' + make_interval(secs => i)
    );
  end loop;
  for i in 1..3 loop
    insert into public.chat_messages (
      conversation_id, sender_id, client_id, kind,
      media_bucket, media_path, media_mime, media_name, media_size, created_at
    ) values (
      v_conversation, v_a, gen_random_uuid(), 'image',
      'chat-media', v_conversation::text || '/gallery-' || i || '.jpg',
      'image/jpeg', 'gallery-' || i || '.jpg', 1024 + i,
      timestamptz '2026-07-15 11:00:00+00' + make_interval(secs => i)
    );
  end loop;
  select message.id, message.created_at into v_target, v_target_at
  from public.chat_messages message
  where message.conversation_id = v_conversation
  order by message.created_at, message.id
  offset 10 limit 1;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  select count(*), min(created_at), max(created_at)
    into v_count, v_min, v_max
  from public.load_chat_message_context(v_target, 5, 5);
  if v_count <> 11 or not (v_min < v_target_at and v_max > v_target_at) then
    raise exception 'bounded context did not include five rows either side of target';
  end if;

  select count(*) into v_count
  from public.list_chat_media(v_conversation, null, null, 2);
  if v_count <> 2 then
    raise exception 'media gallery did not obey its first page limit';
  end if;
  select created_at, id into v_cursor_at, v_cursor_id
  from public.list_chat_media(v_conversation, null, null, 2)
  order by created_at, id limit 1;
  select count(*) into v_count
  from public.list_chat_media(v_conversation, v_cursor_at, v_cursor_id, 2);
  if v_count <> 1 then
    raise exception 'media gallery cursor skipped or duplicated history';
  end if;

  perform set_config('request.jwt.claim.sub', v_outsider::text, true);
  begin
    perform public.load_chat_message_context(v_target, 5, 5);
    raise exception 'outsider unexpectedly loaded chat context';
  exception
    when no_data_found then null;
  end;
end;
$chat_context$;
