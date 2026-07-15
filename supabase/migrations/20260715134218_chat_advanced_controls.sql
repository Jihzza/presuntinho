-- CHAT-006: forwarding metadata, personal reminders, local GIF/stickers and
-- server-enforced disappearing messages for authenticated account chat.
--
-- The legacy Fatma/Daniel blob chat is intentionally unchanged: it has no
-- account UUID/RLS model on which these controls can be enforced safely.

-- ---------------------------------------------------------------------------
-- Durable message metadata and shared disappearing-message setting
-- ---------------------------------------------------------------------------

alter table public.chat_conversations
  add column if not exists disappearing_seconds integer not null default 0,
  add column if not exists disappearing_updated_at timestamptz,
  add column if not exists disappearing_updated_by uuid
    references public.accounts(id) on delete set null;

alter table public.chat_conversations
  drop constraint if exists chat_conversations_disappearing_seconds_check;
alter table public.chat_conversations
  add constraint chat_conversations_disappearing_seconds_check
    check (disappearing_seconds in (0, 86400, 604800, 7776000));

alter table public.chat_messages
  add column if not exists forwarded_from_id uuid
    references public.chat_messages(id) on delete set null,
  add column if not exists media_variant text not null default 'attachment',
  add column if not exists expires_at timestamptz;

alter table public.chat_messages
  drop constraint if exists chat_messages_media_variant_check,
  drop constraint if exists chat_messages_expiry_order_check,
  drop constraint if exists chat_messages_forward_not_self_check;
alter table public.chat_messages
  add constraint chat_messages_media_variant_check check (
    media_variant in ('attachment', 'gif', 'sticker')
    and (
      media_variant = 'attachment'
      or (media_variant = 'gif' and kind = 'image' and media_mime = 'image/gif')
      or (media_variant = 'sticker' and kind = 'image' and media_mime like 'image/%')
    )
  ),
  add constraint chat_messages_expiry_order_check
    check (expires_at is null or expires_at > created_at),
  add constraint chat_messages_forward_not_self_check
    check (forwarded_from_id is null or forwarded_from_id <> id);

create index if not exists chat_messages_expiry_idx
  on public.chat_messages (expires_at, id)
  where deleted_at is null and expires_at is not null;
create index if not exists chat_messages_forwarded_from_idx
  on public.chat_messages (forwarded_from_id)
  where forwarded_from_id is not null;

-- Clients may submit only provenance/variant hints. Expiry is always a server
-- snapshot of the conversation setting and is deliberately not insertable.
grant insert (forwarded_from_id, media_variant)
  on public.chat_messages to authenticated;
grant select (disappearing_seconds, disappearing_updated_at, disappearing_updated_by)
  on public.chat_conversations to authenticated;

create table if not exists public.chat_disappearing_events (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  actor_id        uuid references public.accounts(id) on delete set null,
  seconds         integer not null,
  created_at      timestamptz not null default now(),
  constraint chat_disappearing_events_seconds_check
    check (seconds in (0, 86400, 604800, 7776000))
);
create index if not exists chat_disappearing_events_conversation_idx
  on public.chat_disappearing_events (conversation_id, created_at desc, id desc);
alter table public.chat_disappearing_events enable row level security;
revoke all on public.chat_disappearing_events from public, anon, authenticated;
grant select on public.chat_disappearing_events to authenticated;
grant select, insert, update, delete on public.chat_disappearing_events to service_role;
drop policy if exists chat_disappearing_events_select_member on public.chat_disappearing_events;
create policy chat_disappearing_events_select_member on public.chat_disappearing_events
for select to authenticated
using (private.chat_is_member(conversation_id, (select auth.uid())));

create or replace function private.prepare_advanced_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seconds integer := 0;
  v_source public.chat_messages;
  v_me uuid := auth.uid();
begin
  select conversation.disappearing_seconds
    into v_seconds
  from public.chat_conversations conversation
  where conversation.id = new.conversation_id;

  -- Call history is operational history rather than user-authored content.
  -- Every other newly inserted message snapshots the shared setting so later
  -- changes never rewrite the promise made when that message was sent.
  if new.kind in ('call', 'system') or coalesce(v_seconds, 0) = 0 then
    new.expires_at := null;
  else
    new.expires_at := statement_timestamp() + make_interval(secs => v_seconds);
  end if;

  if new.forwarded_from_id is not null then
    select * into v_source
    from public.chat_messages source
    where source.id = new.forwarded_from_id
      and source.deleted_at is null
      and (source.expires_at is null or source.expires_at > statement_timestamp());

    -- A provenance badge means an exact server-checked text copy. Media is
    -- deliberately re-uploaded as a new attachment without this badge because
    -- Postgres cannot attest bytes stored behind the Storage API.
    if v_source.id is null
       or v_source.kind <> 'text'
       or new.kind <> 'text'
       or new.body is distinct from v_source.body
       or new.media_path is not null
       or v_me is null
       or not private.chat_is_member(v_source.conversation_id, v_me) then
      raise exception 'source message unavailable' using errcode = 'P0002';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_advanced_chat_message()
  from public, anon, authenticated;
drop trigger if exists prepare_advanced_chat_message on public.chat_messages;
create trigger prepare_advanced_chat_message
before insert on public.chat_messages
for each row execute function private.prepare_advanced_chat_message();

-- Expired content becomes unreadable at the RLS boundary immediately, even
-- before the minute worker tombstones it and queues private Storage cleanup.
drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
for select to authenticated
using (
  private.chat_is_member(conversation_id, (select auth.uid()))
  and (expires_at is null or expires_at > statement_timestamp())
);

-- ---------------------------------------------------------------------------
-- Personal reminders (private to the account that created them)
-- ---------------------------------------------------------------------------

create table if not exists public.chat_reminders (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.chat_messages(id) on delete cascade,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  remind_at   timestamptz not null,
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  notified_at timestamptz,
  unique (account_id, message_id),
  constraint chat_reminders_status_check
    check (status in ('pending', 'notified', 'cancelled')),
  constraint chat_reminders_notify_shape_check check (
    (status = 'notified' and notified_at is not null)
    or (status <> 'notified')
  )
);

create index if not exists chat_reminders_due_idx
  on public.chat_reminders (remind_at, id)
  where status = 'pending';
create index if not exists chat_reminders_account_idx
  on public.chat_reminders (account_id, remind_at desc, id desc);

alter table public.chat_reminders enable row level security;
revoke all on public.chat_reminders from public, anon, authenticated;
grant select on public.chat_reminders to authenticated;
grant select, insert, update, delete on public.chat_reminders to service_role;

drop policy if exists chat_reminders_select_own on public.chat_reminders;
create policy chat_reminders_select_own on public.chat_reminders
for select to authenticated
using (account_id = (select auth.uid()));

create or replace function private.cancel_chat_reminder_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.communication_push_outbox outbox
  set status = case when outbox.status = 'sent' then outbox.status else 'expired' end,
      title = case when outbox.status = 'sent' then outbox.title else 'Lembrete cancelado' end,
      body = case when outbox.status = 'sent' then outbox.body else '' end,
      next_attempt_at = case when outbox.status = 'sent' then outbox.next_attempt_at else 'infinity'::timestamptz end,
      completed_at = case when outbox.status = 'sent' then outbox.completed_at else coalesce(outbox.completed_at, now()) end,
      last_error = case when outbox.status = 'sent' then outbox.last_error else 'reminder_cancelled' end,
      updated_at = now()
  where outbox.event_id = old.id
    and outbox.kind = 'reminder';
  return old;
end;
$$;

revoke all on function private.cancel_chat_reminder_push()
  from public, anon, authenticated;
drop trigger if exists chat_reminder_cancel_push on public.chat_reminders;
create trigger chat_reminder_cancel_push
before delete on public.chat_reminders
for each row execute function private.cancel_chat_reminder_push();

create or replace function public.set_chat_reminder(
  p_message uuid,
  p_remind_at timestamptz
)
returns public.chat_reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_message public.chat_messages;
  v_row public.chat_reminders;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_remind_at is null
     or p_remind_at < now() + interval '1 minute'
     or p_remind_at > now() + interval '1 year' then
    raise exception 'invalid reminder time' using errcode = '22023';
  end if;

  select * into v_message
  from public.chat_messages message
  where message.id = p_message
    and message.deleted_at is null
    and (message.expires_at is null or message.expires_at > p_remind_at)
    and private.chat_is_member(message.conversation_id, v_me);
  if v_message.id is null then
    raise exception 'message unavailable' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chat-reminder:' || v_me::text || ':' || p_message::text, 0)
  );
  -- A fresh UUID prevents a reminder that was already enqueued from colliding
  -- with a later reschedule in communication_push_outbox(event_id).
  delete from public.chat_reminders reminder
  where reminder.account_id = v_me and reminder.message_id = p_message;

  insert into public.chat_reminders (message_id, account_id, remind_at)
  values (p_message, v_me, p_remind_at)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.cancel_chat_reminder(p_message uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  delete from public.chat_reminders reminder
  where reminder.account_id = v_me and reminder.message_id = p_message;
  return found;
end;
$$;

revoke all on function public.set_chat_reminder(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.cancel_chat_reminder(uuid)
  from public, anon, authenticated;
grant execute on function public.set_chat_reminder(uuid, timestamptz)
  to authenticated;
grant execute on function public.cancel_chat_reminder(uuid)
  to authenticated;

create or replace function public.list_chat_reminders()
returns table (
  id uuid,
  message_id uuid,
  conversation_id uuid,
  remind_at timestamptz,
  status text,
  notified_at timestamptz,
  message_kind text,
  message_body text,
  media_name text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    reminder.id,
    reminder.message_id,
    message.conversation_id,
    reminder.remind_at,
    reminder.status,
    reminder.notified_at,
    message.kind,
    message.body,
    message.media_name,
    reminder.created_at
  from public.chat_reminders reminder
  join public.chat_messages message on message.id = reminder.message_id
  where reminder.account_id = auth.uid()
    and reminder.status in ('pending', 'notified')
    and message.deleted_at is null
    and (message.expires_at is null or message.expires_at > statement_timestamp())
    and private.chat_is_member(message.conversation_id, auth.uid())
  order by
    case reminder.status when 'pending' then 0 else 1 end,
    reminder.remind_at,
    reminder.id;
$$;

revoke all on function public.list_chat_reminders()
  from public, anon, authenticated;
grant execute on function public.list_chat_reminders()
  to authenticated;

-- Stars already existed in the rich-chat foundation. This bounded RPC turns
-- them into a useful cross-conversation view without exposing another user's
-- private stars or relying on every thread being loaded in memory.
create or replace function public.list_starred_chat_messages(
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 30
)
returns table (
  message_id uuid,
  conversation_id uuid,
  conversation_kind text,
  topic text,
  sender_id uuid,
  message_kind text,
  body text,
  media_name text,
  media_mime text,
  media_variant text,
  forwarded_from_id uuid,
  expires_at timestamptz,
  message_created_at timestamptz,
  starred_at timestamptz
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
  if v_me is null then raise exception 'not authenticated'; end if;
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'star cursor requires timestamp and message id' using errcode = '22023';
  end if;

  return query
  select
    message.id,
    message.conversation_id,
    conversation.kind,
    conversation.topic,
    message.sender_id,
    message.kind,
    message.body,
    message.media_name,
    message.media_mime,
    message.media_variant,
    message.forwarded_from_id,
    message.expires_at,
    message.created_at,
    star.created_at
  from public.chat_stars star
  join public.chat_messages message on message.id = star.message_id
  join public.chat_conversations conversation on conversation.id = message.conversation_id
  where star.account_id = v_me
    and private.chat_is_member(message.conversation_id, v_me)
    and message.deleted_at is null
    and (message.expires_at is null or message.expires_at > statement_timestamp())
    and (
      p_before_at is null
      or (star.created_at, message.id) < (p_before_at, p_before_id)
    )
  order by star.created_at desc, message.id desc
  limit v_limit;
end;
$$;

revoke all on function public.list_starred_chat_messages(timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.list_starred_chat_messages(timestamptz, uuid, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Shared disappearing-message control + service-side expiry
-- ---------------------------------------------------------------------------

create or replace function public.set_chat_disappearing(
  p_conversation uuid,
  p_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_result integer;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_seconds is null or p_seconds not in (0, 86400, 604800, 7776000) then
    raise exception 'invalid disappearing duration' using errcode = '22023';
  end if;

  update public.chat_conversations conversation
  set disappearing_seconds = p_seconds,
      disappearing_updated_at = now(),
      disappearing_updated_by = v_me,
      updated_at = now()
  where conversation.id = p_conversation
    and private.chat_can_interact(conversation.id, v_me)
    and (
      select count(*) from public.chat_members member
      where member.conversation_id = conversation.id
    ) = 2
  returning conversation.disappearing_seconds into v_result;

  if v_result is null then
    raise exception 'conversation unavailable' using errcode = 'P0002';
  end if;
  insert into public.chat_disappearing_events (conversation_id, actor_id, seconds)
  values (p_conversation, v_me, p_seconds);
  return v_result;
end;
$$;

revoke all on function public.set_chat_disappearing(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.set_chat_disappearing(uuid, integer)
  to authenticated;

create or replace function public.expire_chat_messages(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_due_ids uuid[] := '{}'::uuid[];
begin
  select coalesce(pg_catalog.array_agg(due.id), '{}'::uuid[])
  into v_due_ids
  from (
    select message.id
    from public.chat_messages message
    where message.deleted_at is null
      and message.expires_at is not null
      and message.expires_at <= statement_timestamp()
    order by message.expires_at, message.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) due;

  if pg_catalog.cardinality(v_due_ids) = 0 then return 0; end if;

  -- A reminder can already be queued when its source reaches the retention
  -- deadline. Cancel the private reminder row first (waiting out any concurrent
  -- enqueue transaction), then make every still-unsent push non-deliverable.
  update public.chat_reminders reminder
  set status = 'cancelled', updated_at = now()
  where reminder.message_id = any(v_due_ids)
    and reminder.status <> 'cancelled';

  update public.communication_push_outbox outbox
  set status = case when outbox.status = 'sent' then outbox.status else 'expired' end,
      title = case when outbox.status = 'sent' then outbox.title else 'Lembrete expirado' end,
      body = case when outbox.status = 'sent' then outbox.body else '' end,
      next_attempt_at = case when outbox.status = 'sent' then outbox.next_attempt_at else 'infinity'::timestamptz end,
      completed_at = case when outbox.status = 'sent' then outbox.completed_at else coalesce(outbox.completed_at, now()) end,
      last_error = case when outbox.status = 'sent' then outbox.last_error else 'reminder_source_expired' end,
      updated_at = now()
  from public.chat_reminders reminder
  where reminder.message_id = any(v_due_ids)
    and outbox.event_id = reminder.id
    and outbox.kind = 'reminder';

  update public.chat_messages message
  set body = null,
      media_bucket = null,
      media_path = null,
      media_mime = null,
      media_name = null,
      media_size = null,
      deleted_at = coalesce(message.deleted_at, statement_timestamp())
  where message.id = any(v_due_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_chat_messages(integer)
  from public, anon, authenticated;
grant execute on function public.expire_chat_messages(integer)
  to service_role;

-- Reminders share the existing durable communication outbox. Only the service
-- worker can mint this kind; the authenticated enqueue RPC deliberately still
-- rejects it, so clients cannot send arbitrary self-push copy.
alter table public.communication_push_outbox
  drop constraint if exists communication_push_outbox_kind;
alter table public.communication_push_outbox
  add constraint communication_push_outbox_kind
    check (kind in ('love', 'nudge', 'message', 'test', 'game_invite', 'reminder'));

create or replace function public.enqueue_due_chat_reminders(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due record;
  v_count integer := 0;
begin
  for v_due in
    select
      reminder.id,
      reminder.account_id,
      reminder.message_id,
      message.conversation_id,
      message.deleted_at,
      message.expires_at,
      private.chat_is_member(message.conversation_id, reminder.account_id) as still_member
    from public.chat_reminders reminder
    join public.chat_messages message on message.id = reminder.message_id
    where reminder.status = 'pending'
      and reminder.remind_at <= statement_timestamp()
    order by reminder.remind_at, reminder.id
    for update of reminder skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  loop
    if v_due.deleted_at is not null
       or (v_due.expires_at is not null and v_due.expires_at <= statement_timestamp())
       or not v_due.still_member then
      update public.chat_reminders reminder
      set status = 'cancelled', updated_at = now()
      where reminder.id = v_due.id;
      continue;
    end if;

    insert into public.communication_push_outbox (
      event_id, kind, sender, target, title, body, url, expires_at
    ) values (
      v_due.id,
      'reminder',
      v_due.account_id,
      v_due.account_id,
      '⏰ Lembrete do Presuntinho',
      'Guardaste uma mensagem para rever agora.',
      '/mensagens/?conversation=' || v_due.conversation_id::text
        || '&message=' || v_due.message_id::text,
      case
        when v_due.expires_at is null then now() + interval '1 hour'
        else least(now() + interval '1 hour', v_due.expires_at)
      end
    ) on conflict (event_id) do nothing;

    update public.chat_reminders reminder
    set status = 'notified', notified_at = now(), updated_at = now()
    where reminder.id = v_due.id and reminder.status = 'pending';
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.enqueue_due_chat_reminders(integer)
  from public, anon, authenticated;
grant execute on function public.enqueue_due_chat_reminders(integer)
  to service_role;

-- Every SECURITY DEFINER read path must repeat the expiry predicate because it
-- intentionally bypasses table RLS. Keeping the existing return signatures
-- avoids breaking rolling clients.
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
    conversation.id,
    conversation.kind,
    conversation.topic,
    conversation.space_id,
    conversation.direct_key,
    peer.account,
    account.handle::text,
    account.display_name,
    account.emoji,
    account.avatar_url,
    last_message.id,
    last_message.kind,
    case when last_message.deleted_at is null then last_message.body else null end,
    last_message.created_at,
    (
      select count(*)
      from public.chat_messages unread
      where unread.conversation_id = conversation.id
        and unread.sender_id <> caller.account
        and unread.deleted_at is null
        and (unread.expires_at is null or unread.expires_at > statement_timestamp())
        and unread.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)
    ),
    me.pinned_at,
    me.muted_until,
    me.archived_at
  from caller
  join public.chat_members me on me.account = caller.account
  join public.chat_conversations conversation on conversation.id = me.conversation_id
  left join lateral (
    select member.account
    from public.chat_members member
    where member.conversation_id = conversation.id
      and member.account <> caller.account
    order by member.joined_at, member.account
    limit 1
  ) peer on true
  left join public.accounts account on account.id = peer.account
  left join lateral (
    select message.id, message.kind, message.body, message.deleted_at, message.created_at
    from public.chat_messages message
    where message.conversation_id = conversation.id
      and (message.expires_at is null or message.expires_at > statement_timestamp())
    order by message.created_at desc, message.id desc
    limit 1
  ) last_message on true
  where caller.account is not null
  order by me.pinned_at desc nulls last,
           coalesce(conversation.last_message_at, conversation.created_at) desc;
$$;

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
  if v_me is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.chat_members member
    where member.conversation_id = p_conversation and member.account = v_me
  ) then
    raise exception 'conversation not found';
  end if;
  if v_query is null or char_length(v_query) = 0 or char_length(v_query) > 160 then
    raise exception 'search query must contain between 1 and 160 characters' using errcode = '22023';
  end if;
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'search cursor requires both timestamp and message id' using errcode = '22023';
  end if;

  return query
  select
    message.id, message.conversation_id, message.sender_id, message.client_id,
    message.kind, message.body, message.reply_to_id, message.media_bucket,
    message.media_path, message.media_mime, message.media_name,
    message.media_size, message.edited_at, message.created_at
  from public.chat_messages message
  where message.conversation_id = p_conversation
    and message.deleted_at is null
    and (message.expires_at is null or message.expires_at > statement_timestamp())
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
  where message.id = p_message
    and (message.expires_at is null or message.expires_at > statement_timestamp());
  if v_target.id is null or not exists (
    select 1 from public.chat_members member
    where member.conversation_id = v_target.conversation_id and member.account = v_me
  ) then
    raise exception 'message not found' using errcode = 'P0002';
  end if;

  return query
  with before_rows as (
    select message.*
    from public.chat_messages message
    where message.conversation_id = v_target.conversation_id
      and (message.expires_at is null or message.expires_at > statement_timestamp())
      and (message.created_at, message.id) < (v_target.created_at, v_target.id)
    order by message.created_at desc, message.id desc
    limit v_before
  ), after_rows as (
    select message.*
    from public.chat_messages message
    where message.conversation_id = v_target.conversation_id
      and (message.expires_at is null or message.expires_at > statement_timestamp())
      and (message.created_at, message.id) > (v_target.created_at, v_target.id)
    order by message.created_at, message.id
    limit v_after
  ), context_rows as (
    select * from before_rows
    union all select * from public.chat_messages message where message.id = v_target.id
    union all select * from after_rows
  )
  select
    message.id, message.conversation_id, message.sender_id, message.client_id,
    message.kind, message.body, message.reply_to_id, message.media_bucket,
    message.media_path, message.media_mime, message.media_name,
    message.media_size, message.edited_at, message.deleted_at,
    message.created_at
  from context_rows message
  order by message.created_at, message.id;
end;
$$;

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
    where member.conversation_id = p_conversation and member.account = v_me
  ) then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'media cursor requires timestamp and message id' using errcode = '22023';
  end if;

  return query
  select
    message.id, message.conversation_id, message.sender_id, message.client_id,
    message.kind, message.body, message.reply_to_id, message.media_bucket,
    message.media_path, message.media_mime, message.media_name,
    message.media_size, message.edited_at, message.deleted_at,
    message.created_at
  from public.chat_messages message
  where message.conversation_id = p_conversation
    and message.deleted_at is null
    and (message.expires_at is null or message.expires_at > statement_timestamp())
    and message.kind in ('image', 'audio', 'video', 'file')
    and (
      p_before_at is null
      or (message.created_at, message.id) < (p_before_at, p_before_id)
    )
  order by message.created_at desc, message.id desc
  limit v_limit;
end;
$$;

create or replace function public.edit_chat_message(p_message uuid, p_body text)
returns public.chat_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.chat_messages;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if nullif(trim(coalesce(p_body, '')), '') is null or char_length(p_body) > 4000 then
    raise exception 'invalid message body';
  end if;
  update public.chat_messages message
  set body = p_body, edited_at = now()
  where message.id = p_message
    and message.sender_id = v_me
    and message.kind = 'text'
    -- A forwarded badge attests the exact server-checked copy made at send
    -- time. Editing that copy would make the provenance claim misleading.
    and message.forwarded_from_id is null
    and message.deleted_at is null
    and (message.expires_at is null or message.expires_at > statement_timestamp())
    and message.created_at >= now() - interval '15 minutes'
  returning * into v_row;
  if v_row.id is null then raise exception 'message cannot be edited'; end if;
  return v_row;
end;
$$;

-- Preserve the grants after replacing SECURITY DEFINER bodies.
revoke all on function public.list_chat_inbox()
  from public, anon, authenticated;
revoke all on function public.search_chat_messages(uuid, text, timestamptz, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.load_chat_message_context(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.list_chat_media(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.edit_chat_message(uuid, text)
  from public, anon, authenticated;
grant execute on function public.list_chat_inbox() to authenticated;
grant execute on function public.search_chat_messages(uuid, text, timestamptz, uuid, integer)
  to authenticated;
grant execute on function public.load_chat_message_context(uuid, integer, integer)
  to authenticated;
grant execute on function public.list_chat_media(uuid, timestamptz, uuid, integer)
  to authenticated;
grant execute on function public.edit_chat_message(uuid, text)
  to authenticated;

comment on column public.chat_messages.expires_at is
  'Server snapshot of the shared disappearing-message setting; NULL means retained.';
comment on column public.chat_messages.forwarded_from_id is
  'Private provenance marker validated against a source conversation visible to the sender.';
comment on table public.chat_reminders is
  'Personal account-owned reminders; due delivery is queued by a service-role sweep.';
