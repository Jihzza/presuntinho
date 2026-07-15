-- Transactional integration assertions for
-- 20260715073310_chat_receipts_and_search.sql.
-- The caller owns BEGIN/ROLLBACK so this file composes with other migration
-- assertions in one disposable transaction.

do $receipts_and_search$
declare
  v_alice constant uuid := 'a1000000-0000-4000-8000-000000000001';
  v_bruno constant uuid := 'b1000000-0000-4000-8000-000000000002';
  v_carol constant uuid := 'c1000000-0000-4000-8000-000000000003';
  v_conversation constant uuid := 'd1000000-0000-4000-8000-000000000004';
  v_other_conversation constant uuid := 'd1000000-0000-4000-8000-000000000005';

  v_old_match constant uuid := 'e1000000-0000-4000-8000-000000000006';
  v_new_match constant uuid := 'e1000000-0000-4000-8000-000000000007';
  v_deleted_match constant uuid := 'e1000000-0000-4000-8000-000000000008';
  v_wildcard_bait constant uuid := 'e1000000-0000-4000-8000-000000000009';
  v_other_message constant uuid := 'e1000000-0000-4000-8000-00000000000a';

  v_now constant timestamptz := now();
  v_initial_delivery constant timestamptz := now() - interval '10 minutes';
  v_result timestamptz;
  v_peer_delivery timestamptz;
  v_unread bigint;
  v_count bigint;
  v_first record;
  v_second record;
  v_rejected boolean;
begin
  insert into auth.users (id, aud, role, created_at, updated_at)
  values
    (v_alice, 'authenticated', 'authenticated', now(), now()),
    (v_bruno, 'authenticated', 'authenticated', now(), now()),
    (v_carol, 'authenticated', 'authenticated', now(), now());

  insert into public.accounts (id, handle, display_name)
  values
    (v_alice, 'codexreceipt_a', 'Receipt Alice'),
    (v_bruno, 'codexreceipt_b', 'Receipt Bruno'),
    (v_carol, 'codexreceipt_c', 'Receipt Carol');

  insert into public.chat_conversations (
    id, kind, direct_key, topic, created_by
  ) values
    (
      v_conversation,
      'direct',
      'dm:' || v_alice::text || ':' || v_bruno::text,
      'main',
      v_alice
    ),
    (
      v_other_conversation,
      'direct',
      'dm:' || v_bruno::text || ':' || v_carol::text,
      'main',
      v_bruno
    );

  insert into public.chat_members (
    conversation_id, account, last_read_at
  ) values
    (v_conversation, v_alice, now() - interval '3 minutes'),
    (v_conversation, v_bruno, null),
    (v_other_conversation, v_bruno, null),
    (v_other_conversation, v_carol, null);

  insert into public.chat_messages (
    id, conversation_id, sender_id, client_id, kind, body, created_at
  ) values
    (
      v_old_match, v_conversation, v_bruno,
      'f1000000-0000-4000-8000-000000000001',
      'text', 'Case Needle %_ older', now() - interval '4 minutes'
    ),
    (
      v_new_match, v_conversation, v_bruno,
      'f1000000-0000-4000-8000-000000000002',
      'text', 'case needle %_ newest', now() - interval '2 minutes'
    ),
    (
      v_deleted_match, v_conversation, v_bruno,
      'f1000000-0000-4000-8000-000000000003',
      'text', 'case needle %_ deleted', now() - interval '1 minute'
    ),
    (
      v_wildcard_bait, v_conversation, v_alice,
      'f1000000-0000-4000-8000-000000000004',
      'text', 'wildcard bait has percent % and underscore _ apart',
      now() - interval '30 seconds'
    ),
    (
      v_other_message, v_other_conversation, v_bruno,
      'f1000000-0000-4000-8000-000000000005',
      'text', 'case needle %_ belongs elsewhere', now() - interval '1 minute'
    );

  insert into public.chat_reactions (message_id, account_id, emoji)
  values
    (v_deleted_match, v_alice, '💛'),
    (v_deleted_match, v_bruno, '👍');
  insert into public.chat_stars (message_id, account_id)
  values
    (v_deleted_match, v_alice),
    (v_deleted_match, v_bruno);

  -- Public/anonymous callers never inherit EXECUTE on account-owned RPCs.
  if has_function_privilege(
       'anon',
       'public.mark_chat_delivered(uuid,timestamp with time zone)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.search_chat_messages(uuid,text,timestamp with time zone,uuid,integer)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.mark_chat_delivered(uuid,timestamp with time zone)',
       'EXECUTE'
     ) then
    raise exception 'chat RPC grants are not least-privilege';
  end if;

  -- A missing JWT must fail even when the SQL session itself is privileged.
  perform set_config('request.jwt.claim.sub', '', true);
  v_rejected := false;
  begin
    perform public.mark_chat_delivered(v_conversation, now());
  exception when others then
    if sqlerrm = 'not authenticated' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected then
    raise exception 'unauthenticated delivery receipt was accepted';
  end if;

  -- The caller may advance only their own member row. Values are monotonic and
  -- a dishonest/faulty future clock is clamped to the database transaction time.
  perform set_config('request.jwt.claim.sub', v_alice::text, true);
  v_result := public.mark_chat_delivered(v_conversation, v_initial_delivery);
  if v_result <> v_initial_delivery then
    raise exception 'initial delivery receipt was not recorded: %', v_result;
  end if;

  select last_delivered_at into v_peer_delivery
  from public.chat_members
  where conversation_id = v_conversation and account = v_bruno;
  if v_peer_delivery is not null then
    raise exception 'delivery receipt modified the peer row';
  end if;

  v_result := public.mark_chat_delivered(
    v_conversation,
    v_initial_delivery - interval '5 minutes'
  );
  if v_result <> v_initial_delivery then
    raise exception 'older receipt moved delivery time backwards: %', v_result;
  end if;

  v_result := public.mark_chat_delivered(
    v_conversation,
    now() + interval '1 day'
  );
  if v_result <> v_now then
    raise exception 'future receipt was not clamped to server time: % <> %',
      v_result, v_now;
  end if;

  v_rejected := false;
  begin
    perform public.mark_chat_delivered(v_other_conversation, now());
  exception when others then
    if sqlerrm = 'conversation not found' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected then
    raise exception 'non-member advanced a cross-conversation receipt';
  end if;

  -- Only the sender can tombstone a message. Tombstoning removes every
  -- reaction and every account's star, not just the sender's metadata.
  v_rejected := false;
  begin
    perform public.delete_chat_message(v_new_match);
  exception when others then
    if sqlerrm = 'message not found' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected then
    raise exception 'non-sender deleted another account message';
  end if;

  perform set_config('request.jwt.claim.sub', v_bruno::text, true);
  perform public.delete_chat_message(v_deleted_match);

  select count(*) into v_count
  from public.chat_reactions where message_id = v_deleted_match;
  if v_count <> 0 then
    raise exception 'deleted message retained % reactions', v_count;
  end if;
  select count(*) into v_count
  from public.chat_stars where message_id = v_deleted_match;
  if v_count <> 0 then
    raise exception 'deleted message retained % stars', v_count;
  end if;
  if not exists (
    select 1
    from public.chat_messages
    where id = v_deleted_match
      and deleted_at is not null
      and body is null
      and media_path is null
  ) then
    raise exception 'deleted message was not safely tombstoned';
  end if;

  -- Alice has one live peer message after last_read_at. The newer deleted peer
  -- message must never inflate the inbox badge.
  perform set_config('request.jwt.claim.sub', v_alice::text, true);
  select inbox.unread_count into v_unread
  from public.list_chat_inbox() inbox
  where inbox.conversation_id = v_conversation;
  if v_unread <> 1 then
    raise exception 'inbox counted deleted/own/read messages as unread: %', v_unread;
  end if;

  -- `%_` is literal text, not LIKE wildcard syntax. The deleted match and the
  -- matching message in an inaccessible conversation are both excluded.
  select count(*) into v_count
  from public.search_chat_messages(
    v_conversation,
    'CASE NEEDLE %_',
    null::timestamptz,
    null::uuid,
    100
  );
  if v_count <> 2 then
    raise exception 'literal/deleted search filtering returned % rows', v_count;
  end if;

  select * into v_first
  from public.search_chat_messages(
    v_conversation,
    'needle %_',
    null::timestamptz,
    null::uuid,
    1
  );
  if v_first.id <> v_new_match then
    raise exception 'first search page returned %, expected %',
      v_first.id, v_new_match;
  end if;

  select * into v_second
  from public.search_chat_messages(
    v_conversation,
    'needle %_',
    v_first.created_at,
    v_first.id,
    1
  );
  if v_second.id <> v_old_match then
    raise exception 'keyset search page returned %, expected %',
      v_second.id, v_old_match;
  end if;

  select count(*) into v_count
  from public.search_chat_messages(
    v_conversation,
    'needle %_',
    v_second.created_at,
    v_second.id,
    10
  );
  if v_count <> 0 then
    raise exception 'exclusive search cursor repeated/exceeded the result set';
  end if;

  v_rejected := false;
  begin
    perform public.search_chat_messages(
      v_other_conversation,
      'needle',
      null::timestamptz,
      null::uuid,
      10
    );
  exception when others then
    if sqlerrm = 'conversation not found' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected then
    raise exception 'search exposed a cross-conversation result';
  end if;

  v_rejected := false;
  begin
    perform public.search_chat_messages(
      v_conversation,
      'needle',
      now(),
      null::uuid,
      10
    );
  exception when sqlstate '22023' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'partial search cursor was accepted';
  end if;
end;
$receipts_and_search$;
