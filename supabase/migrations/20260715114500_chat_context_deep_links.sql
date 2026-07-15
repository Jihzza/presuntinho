-- A reply/search/push deep link can point outside the page currently loaded in
-- the browser. Fetch a bounded window around that exact message without OFFSET
-- drift and without exposing whether a message exists to non-members.

create or replace function public.load_chat_message_context(
  p_message uuid,
  p_before integer default 20,
  p_after integer default 20
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
  deleted_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_me uuid := auth.uid();
  v_target public.chat_messages;
  v_before integer := greatest(0, least(coalesce(p_before, 20), 50));
  v_after integer := greatest(0, least(coalesce(p_after, 20), 50));
begin
  if v_me is null or p_message is null then
    raise exception 'message not found' using errcode = 'P0002';
  end if;

  select * into v_target
  from public.chat_messages message
  where message.id = p_message;

  if v_target.id is null or not exists (
    select 1
    from public.chat_members member
    where member.conversation_id = v_target.conversation_id
      and member.account = v_me
  ) then
    raise exception 'message not found' using errcode = 'P0002';
  end if;

  return query
  with before_rows as (
    select message.*
    from public.chat_messages message
    where message.conversation_id = v_target.conversation_id
      and (message.created_at, message.id) < (v_target.created_at, v_target.id)
    order by message.created_at desc, message.id desc
    limit v_before
  ), after_rows as (
    select message.*
    from public.chat_messages message
    where message.conversation_id = v_target.conversation_id
      and (message.created_at, message.id) > (v_target.created_at, v_target.id)
    order by message.created_at asc, message.id asc
    limit v_after
  ), context_rows as (
    select * from before_rows
    union all
    select * from public.chat_messages message where message.id = v_target.id
    union all
    select * from after_rows
  )
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
    message.deleted_at,
    message.created_at
  from context_rows message
  order by message.created_at asc, message.id asc;
end;
$$;

revoke all on function public.load_chat_message_context(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.load_chat_message_context(uuid, integer, integer)
  to authenticated;

comment on function public.load_chat_message_context(uuid, integer, integer) is
  'Returns a bounded chronological window around one message only when auth.uid() belongs to its conversation.';

-- The media gallery is independent from whichever text page happens to be in
-- memory. It uses the same exclusive composite cursor as normal history.
create or replace function public.list_chat_media(
  p_conversation uuid,
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
  deleted_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_me uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 100));
begin
  if v_me is null or not exists (
    select 1 from public.chat_members member
    where member.conversation_id = p_conversation
      and member.account = v_me
  ) then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'media cursor requires timestamp and message id' using errcode = '22023';
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
    message.deleted_at,
    message.created_at
  from public.chat_messages message
  where message.conversation_id = p_conversation
    and message.deleted_at is null
    and message.kind in ('image', 'audio', 'video', 'file')
    and (
      p_before_at is null
      or (message.created_at, message.id) < (p_before_at, p_before_id)
    )
  order by message.created_at desc, message.id desc
  limit v_limit;
end;
$$;

revoke all on function public.list_chat_media(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.list_chat_media(uuid, timestamptz, uuid, integer)
  to authenticated;

comment on function public.list_chat_media(uuid, timestamptz, uuid, integer) is
  'Lists undeleted media for an authenticated conversation member using an exclusive keyset cursor.';
