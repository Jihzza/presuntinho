-- Durable delivery receipts and bounded server-side message search.
--
-- Delivery/read timestamps are account-owned member state. Keep writes behind
-- SECURITY DEFINER RPCs so a client can never advance another member's receipt.

create or replace function public.mark_chat_delivered(
  p_conversation uuid,
  p_delivered_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_at timestamptz := least(coalesce(p_delivered_at, now()), now());
  v_result timestamptz;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  update public.chat_members
  set last_delivered_at = greatest(
    coalesce(last_delivered_at, '-infinity'::timestamptz),
    v_at
  )
  where conversation_id = p_conversation
    and account = v_me
  returning last_delivered_at into v_result;

  if v_result is null then
    -- Do not reveal whether a conversation exists when the caller is not a
    -- member of it.
    raise exception 'conversation not found';
  end if;

  return v_result;
end;
$$;

revoke all on function public.mark_chat_delivered(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.mark_chat_delivered(uuid, timestamptz)
  to authenticated;

comment on function public.mark_chat_delivered(uuid, timestamptz) is
  'Monotonically advances only the authenticated member delivery receipt, clamped to server time.';

-- Deleting a message is a tombstone operation because replies and call history
-- may still reference it. Reactions and personal stars must not survive the
-- tombstone.
create or replace function public.delete_chat_message(p_message uuid)
returns public.chat_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.chat_messages;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  select * into v_row
  from public.chat_messages
  where id = p_message
    and sender_id = v_me
  for update;

  if v_row.id is null then
    raise exception 'message not found';
  end if;

  delete from public.chat_reactions where message_id = p_message;
  delete from public.chat_stars where message_id = p_message;

  update public.chat_messages
  set body = null,
      media_bucket = null,
      media_path = null,
      media_mime = null,
      media_name = null,
      media_size = null,
      deleted_at = coalesce(deleted_at, now())
  where id = p_message
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.delete_chat_message(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_chat_message(uuid)
  to authenticated;

-- Compact account inbox. Deleted tombstones can remain the latest visible row,
-- but they never contribute to unread badges.
create or replace function public.list_chat_inbox()
returns table (
  conversation_id uuid,
  kind text,
  topic text,
  space_id uuid,
  direct_key text,
  other_account uuid,
  other_handle text,
  other_display_name text,
  other_emoji text,
  other_avatar_url text,
  last_message_id uuid,
  last_message_kind text,
  last_message_body text,
  last_message_at timestamptz,
  unread_count bigint,
  pinned_at timestamptz,
  muted_until timestamptz,
  archived_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  with caller as (
    select auth.uid() as account
  )
  select
    c.id,
    c.kind,
    c.topic,
    c.space_id,
    c.direct_key,
    peer.account,
    a.handle::text,
    a.display_name,
    a.emoji,
    a.avatar_url,
    last_message.id,
    last_message.kind,
    case when last_message.deleted_at is null then last_message.body else null end,
    last_message.created_at,
    (
      select count(*)
      from public.chat_messages unread
      where unread.conversation_id = c.id
        and unread.sender_id <> caller.account
        and unread.deleted_at is null
        and unread.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)
    ),
    me.pinned_at,
    me.muted_until,
    me.archived_at
  from caller
  join public.chat_members me on me.account = caller.account
  join public.chat_conversations c on c.id = me.conversation_id
  left join lateral (
    select m.account
    from public.chat_members m
    where m.conversation_id = c.id
      and m.account <> caller.account
    order by m.joined_at, m.account
    limit 1
  ) peer on true
  left join public.accounts a on a.id = peer.account
  left join lateral (
    select msg.id, msg.kind, msg.body, msg.deleted_at, msg.created_at
    from public.chat_messages msg
    where msg.conversation_id = c.id
    order by msg.created_at desc, msg.id desc
    limit 1
  ) last_message on true
  where caller.account is not null
  order by me.pinned_at desc nulls last,
           coalesce(c.last_message_at, c.created_at) desc;
$$;

revoke all on function public.list_chat_inbox()
  from public, anon, authenticated;
grant execute on function public.list_chat_inbox()
  to authenticated;

-- Search is intentionally a literal, case-insensitive substring match rather
-- than a tsquery/LIKE expression. User input therefore cannot become wildcard
-- syntax. The existing (conversation_id, created_at desc, id desc) index backs
-- the exclusive keyset cursor and avoids OFFSET drift.
create or replace function public.search_chat_messages(
  p_conversation uuid,
  p_query text,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  client_id uuid,
  kind text,
  body text,
  reply_to_id uuid,
  media_bucket text,
  media_path text,
  media_mime text,
  media_name text,
  media_size bigint,
  edited_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_me uuid := auth.uid();
  v_query text := btrim(p_query);
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 100));
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from public.chat_members member
    where member.conversation_id = p_conversation
      and member.account = v_me
  ) then
    raise exception 'conversation not found';
  end if;

  if v_query is null or char_length(v_query) = 0 or char_length(v_query) > 160 then
    raise exception 'search query must contain between 1 and 160 characters'
      using errcode = '22023';
  end if;

  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'search cursor requires both timestamp and message id'
      using errcode = '22023';
  end if;

  return query
  select
    message.id,
    message.conversation_id,
    message.sender_id,
    message.client_id,
    message.kind,
    message.body,
    message.reply_to_id,
    message.media_bucket,
    message.media_path,
    message.media_mime,
    message.media_name,
    message.media_size,
    message.edited_at,
    message.created_at
  from public.chat_messages message
  where message.conversation_id = p_conversation
    and message.deleted_at is null
    and message.body is not null
    and position(lower(v_query) in lower(message.body)) > 0
    and (
      p_before_at is null
      or (message.created_at, message.id) < (p_before_at, p_before_id)
    )
  order by message.created_at desc, message.id desc
  limit v_limit;
end;
$$;

revoke all on function public.search_chat_messages(uuid, text, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.search_chat_messages(uuid, text, timestamptz, uuid, integer)
  to authenticated;

comment on function public.search_chat_messages(uuid, text, timestamptz, uuid, integer) is
  'Searches undeleted message bodies for an authenticated conversation member using literal substring matching and an exclusive keyset cursor.';
