-- Durable at-least-once Web Push delivery for chat messages, couple moments
-- and notification self-tests. Incoming calls keep their richer per-device
-- outbox/ACK lifecycle; this outbox closes the claim-before-provider gap for
-- every other communication notification.

create table if not exists public.communication_push_outbox (
  event_id          uuid primary key,
  kind              text not null,
  sender            uuid not null references public.accounts(id) on delete cascade,
  target            uuid not null references public.accounts(id) on delete cascade,
  title             text not null,
  body              text not null default '',
  url               text not null default '/',
  status            text not null default 'queued',
  attempt_count     integer not null default 0,
  attempt_token     uuid,
  next_attempt_at   timestamptz not null default now(),
  lease_expires_at  timestamptz,
  sent_count        integer not null default 0,
  failed_count      integer not null default 0,
  stale_count       integer not null default 0,
  no_devices        boolean not null default false,
  last_error        text,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz,
  constraint communication_push_outbox_kind
    check (kind in ('love', 'nudge', 'message', 'test')),
  constraint communication_push_outbox_status
    check (status in ('queued', 'dispatching', 'sent', 'failed', 'expired')),
  constraint communication_push_outbox_attempts
    check (attempt_count between 0 and 5),
  constraint communication_push_outbox_copy
    check (
      char_length(title) between 1 and 80
      and char_length(body) <= 160
      and char_length(url) between 1 and 160
      and url ~ '^/'
      and url !~ '[[:cntrl:]]'
    ),
  constraint communication_push_outbox_counts
    check (sent_count >= 0 and failed_count >= 0 and stale_count >= 0),
  constraint communication_push_outbox_error_length
    check (last_error is null or char_length(last_error) <= 240)
);

create index if not exists communication_push_outbox_pending_idx
  on public.communication_push_outbox (next_attempt_at, created_at)
  where status in ('queued', 'failed', 'dispatching');

alter table public.communication_push_outbox enable row level security;
revoke all on public.communication_push_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.communication_push_outbox to service_role;

-- Storage deletion is an external side effect too. Keep the object identity
-- before the chat tombstone clears media_bucket/media_path, then retry it from
-- the scheduled service worker until Storage confirms deleted/not-found.
create table if not exists public.chat_media_deletion_outbox (
  id                uuid primary key default gen_random_uuid(),
  message_id        uuid not null,
  bucket            text not null,
  object_path       text not null,
  status            text not null default 'queued',
  attempt_count     integer not null default 0,
  attempt_token     uuid,
  next_attempt_at   timestamptz not null default now(),
  lease_expires_at  timestamptz,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz,
  unique (bucket, object_path),
  constraint chat_media_deletion_bucket check (bucket in ('couple-chat', 'chat-media')),
  constraint chat_media_deletion_path check (
    char_length(object_path) between 1 and 1024
    and object_path !~ '(^|/)\.\.?(/|$)'
    and object_path !~ '[[:cntrl:]]'
    and position(E'\\' in object_path) = 0
  ),
  constraint chat_media_deletion_status
    check (status in ('queued', 'dispatching', 'failed', 'deleted')),
  constraint chat_media_deletion_attempts check (attempt_count between 0 and 8),
  constraint chat_media_deletion_error
    check (last_error is null or char_length(last_error) <= 240)
);

create index if not exists chat_media_deletion_pending_idx
  on public.chat_media_deletion_outbox (next_attempt_at, created_at)
  where status in ('queued', 'failed', 'dispatching');

alter table public.chat_media_deletion_outbox enable row level security;
revoke all on public.chat_media_deletion_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.chat_media_deletion_outbox to service_role;

create or replace function private.enqueue_chat_media_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null
     and new.deleted_at is not null
     and old.media_bucket is not null
     and old.media_path is not null then
    insert into public.chat_media_deletion_outbox (
      message_id, bucket, object_path
    ) values (
      old.id, old.media_bucket, old.media_path
    )
    on conflict (bucket, object_path) do update
    set message_id = excluded.message_id,
        status = 'queued',
        attempt_count = 0,
        attempt_token = null,
        next_attempt_at = now(),
        lease_expires_at = null,
        last_error = null,
        updated_at = now(),
        completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists chat_message_enqueue_media_delete on public.chat_messages;
create trigger chat_message_enqueue_media_delete
before update of deleted_at on public.chat_messages
for each row execute function private.enqueue_chat_media_deletion();
revoke all on function private.enqueue_chat_media_deletion()
  from public, anon, authenticated;

-- Source inserts, not browser follow-up HTTP calls, are the durable enqueue
-- boundary. The endpoint remains a low-latency wakeup and idempotent replay;
-- if the app closes immediately after commit, the minute sweep still finds
-- these jobs.
create or replace function private.enqueue_chat_message_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_muted boolean := false;
  v_sender_name text;
  v_preview text;
begin
  if new.deleted_at is not null or new.kind = 'call' then return new; end if;
  if not private.chat_can_interact(new.conversation_id, new.sender_id)
     or (
       select count(*) from public.chat_members member
       where member.conversation_id = new.conversation_id
     ) <> 2 then
    return new;
  end if;
  v_target := private.chat_peer(new.conversation_id, new.sender_id);
  if v_target is null or not private.chat_can_interact(new.conversation_id, v_target) then
    return new;
  end if;

  update public.chat_messages message
  set push_claimed_at = coalesce(message.push_claimed_at, now())
  where message.id = new.id;

  select coalesce(member.muted_until > now(), false)
    into v_muted
  from public.chat_members member
  where member.conversation_id = new.conversation_id
    and member.account = v_target;
  if coalesce(v_muted, false) then return new; end if;

  select coalesce(account.display_name, '@' || account.handle::text, 'Alguém especial')
    into v_sender_name
  from public.accounts account
  where account.id = new.sender_id;
  v_preview := case new.kind
    when 'text' then left(coalesce(nullif(new.body, ''), 'Nova mensagem'), 120)
    when 'image' then 'Enviou-te uma fotografia.'
    when 'audio' then 'Enviou-te uma mensagem de voz.'
    when 'video' then 'Enviou-te um vídeo.'
    when 'file' then left(coalesce(nullif(new.media_name, ''), 'Enviou-te um ficheiro.'), 120)
    else 'Nova mensagem'
  end;

  insert into public.communication_push_outbox (
    event_id, kind, sender, target, title, body, url, expires_at
  ) values (
    new.id, 'message', new.sender_id, v_target,
    left('💬 ' || coalesce(v_sender_name, 'Alguém especial'), 80),
    left(v_preview, 160),
    '/mensagens/?conversation=' || new.conversation_id::text || '&message=' || new.id::text,
    now() + interval '1 hour'
  ) on conflict (event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists chat_message_enqueue_push on public.chat_messages;
create trigger chat_message_enqueue_push
after insert on public.chat_messages
for each row execute function private.enqueue_chat_message_push();
revoke all on function private.enqueue_chat_message_push()
  from public, anon, authenticated;

create or replace function private.enqueue_couple_ping_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender uuid := public.as_uuid(new.sender);
  v_space uuid := public.as_uuid(new.couple_id);
  v_target uuid;
  v_sender_name text;
begin
  if v_sender is null or v_space is null or new.kind not in ('love', 'nudge') then
    return new;
  end if;
  if not public.is_fully_active_couple(v_space)
     or not exists (
       select 1 from public.space_members member
       where member.space_id = v_space
         and member.account = v_sender
         and member.status = 'accepted'
     ) then
    return new;
  end if;
  select member.account into v_target
  from public.space_members member
  where member.space_id = v_space
    and member.account <> v_sender
    and member.status = 'accepted';
  if v_target is null
     or public.has_fully_active_couple_except(v_sender, v_space)
     or public.has_fully_active_couple_except(v_target, v_space) then
    return new;
  end if;

  -- Serialize source-triggered pings with the authenticated fallback RPC.
  -- Without this lock, concurrent inserts can both pass the throttle read
  -- before either transaction makes its durable outbox row visible.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'couple-ping-push:' || v_sender::text || ':' || new.kind,
      0
    )
  );

  update public.couple_pings ping
  set push_claimed_at = coalesce(ping.push_claimed_at, now())
  where ping.id = new.id;
  if exists (
    select 1 from public.communication_push_outbox recent
    where recent.sender = v_sender
      and recent.kind = new.kind
      and recent.event_id <> new.id
      and recent.created_at > now() - interval '12 seconds'
  ) then
    return new;
  end if;

  select coalesce(account.display_name, '@' || account.handle::text, 'Alguém especial')
    into v_sender_name
  from public.accounts account
  where account.id = v_sender;
  insert into public.communication_push_outbox (
    event_id, kind, sender, target, title, body, url, expires_at
  ) values (
    new.id,
    new.kind,
    v_sender,
    v_target,
    case new.kind when 'love' then '💛 Amo-te muito!' else '👀 Tenho saudades tuas!' end,
    left(
      case new.kind
        when 'love' then coalesce(v_sender_name, 'Alguém especial') || ' ama-te muito!'
        else coalesce(v_sender_name, 'Alguém especial') || ' tem saudades tuas!'
      end,
      160
    ),
    '/',
    now() + interval '1 hour'
  ) on conflict (event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists couple_ping_enqueue_push on public.couple_pings;
create trigger couple_ping_enqueue_push
after insert on public.couple_pings
for each row execute function private.enqueue_couple_ping_push();
revoke all on function private.enqueue_couple_ping_push()
  from public, anon, authenticated;

-- Validate and consume the source event in the SAME transaction that creates
-- its outbox row. A function crash after this commit can delay delivery, but
-- can no longer permanently lose it. Replays return the existing job without
-- learning whether a message was muted or otherwise ineligible.
create or replace function public.enqueue_communication_push(
  p_event uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_url text
)
returns table (
  event_id uuid,
  status text,
  target uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_space uuid;
  v_conversation uuid;
  v_muted boolean := false;
  v_title text := coalesce(p_title, '');
  v_body text := coalesce(p_body, '');
  v_url text := coalesce(p_url, '/');
  v_existing public.communication_push_outbox;
begin
  if v_me is null
     or p_event is null
     or p_kind not in ('love', 'nudge', 'message', 'test')
     or char_length(v_title) not between 1 and 80
     or char_length(v_body) > 160
     or char_length(v_url) not between 1 and 160
     or v_url !~ '^/'
     or v_url ~ '[[:cntrl:]]' then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('communication-push:' || p_event::text, 0)
  );

  select * into v_existing
  from public.communication_push_outbox outbox
  where outbox.event_id = p_event;
  if v_existing.event_id is not null then
    if v_existing.sender = v_me and v_existing.kind = p_kind then
      event_id := v_existing.event_id;
      status := v_existing.status;
      target := v_existing.target;
      return next;
    end if;
    return;
  end if;

  if p_kind = 'message' then
    select message.conversation_id into v_conversation
    from public.chat_messages message
    where message.id = p_event
      and message.sender_id = v_me
      and message.kind <> 'call'
      and message.deleted_at is null
      and message.push_claimed_at is null
      and message.created_at >= now() - interval '5 minutes'
    for update;

    if v_conversation is null
       or not private.chat_can_interact(v_conversation, v_me)
       or (
         select count(*)
         from public.chat_members member
         where member.conversation_id = v_conversation
       ) <> 2 then
      return;
    end if;

    v_target := private.chat_peer(v_conversation, v_me);
    if v_target is null or not private.chat_can_interact(v_conversation, v_target) then
      return;
    end if;

    -- Consume before testing the private mute preference so duplicate/muted
    -- outcomes remain indistinguishable to the sender.
    update public.chat_messages message
    set push_claimed_at = now()
    where message.id = p_event
      and message.conversation_id = v_conversation
      and message.sender_id = v_me
      and message.kind <> 'call'
      and message.deleted_at is null
      and message.push_claimed_at is null
      and message.created_at >= now() - interval '5 minutes';
    if not found then return; end if;

    select coalesce(member.muted_until > now(), false)
      into v_muted
    from public.chat_members member
    where member.conversation_id = v_conversation
      and member.account = v_target;
    if coalesce(v_muted, false) then return; end if;

  elsif p_kind in ('love', 'nudge') then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'couple-ping-push:' || v_me::text || ':' || p_kind,
        0
      )
    );
    if exists (
      select 1
      from public.couple_pings recent
      where recent.sender = v_me::text
        and recent.kind = p_kind
        and recent.id <> p_event
        and recent.push_claimed_at > now() - interval '12 seconds'
    ) then
      return;
    end if;

    select public.as_uuid(ping.couple_id) into v_space
    from public.couple_pings ping
    where ping.id = p_event
      and ping.sender = v_me::text
      and ping.kind = p_kind
      and ping.push_claimed_at is null
      and ping.created_at between now() - interval '5 minutes' and now()
    for update;

    if v_space is null
       or not public.is_fully_active_couple(v_space)
       or not exists (
         select 1
         from public.space_members member
         where member.space_id = v_space
           and member.account = v_me
           and member.status = 'accepted'
       ) then
      return;
    end if;

    select member.account into v_target
    from public.space_members member
    where member.space_id = v_space
      and member.account <> v_me
      and member.status = 'accepted';

    if v_target is null
       or public.has_fully_active_couple_except(v_me, v_space)
       or public.has_fully_active_couple_except(v_target, v_space) then
      return;
    end if;

    update public.couple_pings ping
    set push_claimed_at = now()
    where ping.id = p_event
      and ping.sender = v_me::text
      and ping.kind = p_kind
      and ping.push_claimed_at is null
      and ping.created_at between now() - interval '5 minutes' and now();
    if not found then return; end if;

  else
    -- Test notifications are self-targeted and rate limited durably, not only
    -- by a browser button or an IP-based platform limit.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('push-test:' || v_me::text, 0)
    );
    if exists (
      select 1
      from public.communication_push_outbox recent
      where recent.sender = v_me
        and recent.kind = 'test'
        and recent.event_id <> p_event
        and recent.created_at > now() - interval '5 seconds'
    ) then
      return;
    end if;
    v_target := v_me;
  end if;

  insert into public.communication_push_outbox (
    event_id, kind, sender, target, title, body, url, expires_at
  ) values (
    p_event,
    p_kind,
    v_me,
    v_target,
    v_title,
    v_body,
    v_url,
    now() + case when p_kind = 'test' then interval '5 minutes' else interval '1 hour' end
  );

  event_id := p_event;
  status := 'queued';
  target := v_target;
  return next;
end;
$$;

-- Service-role workers take short renewable leases. Expired leases are made
-- retryable before the claim, so a killed background function cannot strand a
-- committed notification indefinitely.
create or replace function public.claim_communication_push(
  p_event uuid default null
)
returns table (
  event_id uuid,
  kind text,
  sender uuid,
  target uuid,
  title text,
  body text,
  url text,
  attempt_token uuid,
  attempt_count integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  update public.communication_push_outbox outbox
  set status = 'expired',
      attempt_token = null,
      lease_expires_at = null,
      next_attempt_at = 'infinity'::timestamptz,
      completed_at = coalesce(outbox.completed_at, now()),
      updated_at = now(),
      last_error = coalesce(outbox.last_error, 'delivery_expired')
  where outbox.status in ('queued', 'failed', 'dispatching')
    and outbox.expires_at <= now()
    and (p_event is null or outbox.event_id = p_event);

  update public.communication_push_outbox outbox
  set status = 'failed',
      attempt_token = null,
      lease_expires_at = null,
      next_attempt_at = now(),
      updated_at = now(),
      last_error = 'dispatch_lease_expired'
  where outbox.status = 'dispatching'
    and outbox.lease_expires_at <= now()
    and outbox.expires_at > now()
    and outbox.attempt_count < 5
    and (p_event is null or outbox.event_id = p_event);

  return query
  with candidate as (
    select pending.event_id
    from public.communication_push_outbox pending
    where pending.status in ('queued', 'failed')
      and pending.next_attempt_at <= now()
      and pending.expires_at > now()
      and pending.attempt_count < 5
      and (p_event is null or pending.event_id = p_event)
    order by pending.next_attempt_at, pending.created_at
    for update skip locked
    limit 1
  ), claimed as (
    update public.communication_push_outbox pending
    set status = 'dispatching',
        attempt_count = pending.attempt_count + 1,
        attempt_token = v_token,
        lease_expires_at = now() + interval '20 seconds',
        updated_at = now(),
        last_error = null
    from candidate
    where pending.event_id = candidate.event_id
    returning pending.*
  )
  select claimed.event_id, claimed.kind, claimed.sender, claimed.target,
         claimed.title, claimed.body, claimed.url, claimed.attempt_token,
         claimed.attempt_count, claimed.expires_at
  from claimed;
end;
$$;

create or replace function public.record_communication_push_result(
  p_event uuid,
  p_attempt_token uuid,
  p_sent integer,
  p_failed integer,
  p_stale integer,
  p_retryable integer,
  p_no_devices boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.communication_push_outbox;
  v_retry boolean;
begin
  if p_sent < 0 or p_failed < 0 or p_stale < 0 or p_retryable < 0
     or p_retryable > p_failed
     or p_error is not null and char_length(p_error) > 240 then
    return false;
  end if;

  select * into v_row
  from public.communication_push_outbox outbox
  where outbox.event_id = p_event
    and outbox.status = 'dispatching'
    and outbox.attempt_token = p_attempt_token
    and outbox.lease_expires_at > now()
  for update;
  if v_row.event_id is null then return false; end if;

  v_retry := not coalesce(p_no_devices, false)
    and p_retryable > 0
    and v_row.attempt_count < 5
    and v_row.expires_at > now();

  update public.communication_push_outbox outbox
  set status = case
        when v_retry then 'failed'
        when v_row.expires_at <= now() then 'expired'
        when p_no_devices or p_sent > 0 or p_failed = 0 then 'sent'
        else 'failed'
      end,
      sent_count = greatest(outbox.sent_count, p_sent),
      failed_count = greatest(outbox.failed_count, p_failed),
      stale_count = greatest(outbox.stale_count, p_stale),
      no_devices = coalesce(p_no_devices, false),
      attempt_token = null,
      lease_expires_at = null,
      next_attempt_at = case
        when v_retry then least(
          v_row.expires_at,
          now() + make_interval(secs => least(60, 4 * (2 ^ greatest(0, v_row.attempt_count - 1)))::integer)
        )
        else 'infinity'::timestamptz
      end,
      completed_at = case when v_retry then null else coalesce(outbox.completed_at, now()) end,
      updated_at = now(),
      last_error = case
        when v_retry then coalesce(p_error, 'provider_retryable')
        when p_no_devices then 'no_push_devices'
        else p_error
      end
  where outbox.event_id = p_event;
  return true;
end;
$$;

-- A deleted message must neither produce a late push nor leave its preview in
-- the service-only diagnostics table. Already-sent rows retain only lifecycle
-- counters; pending rows become terminal before a worker can claim them.
create or replace function private.redact_deleted_message_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.communication_push_outbox outbox
    set title = '💬 Mensagem eliminada',
        body = '',
        status = case
          when outbox.status in ('queued', 'failed') then 'expired'
          else outbox.status
        end,
        next_attempt_at = case
          when outbox.status in ('queued', 'failed') then 'infinity'::timestamptz
          else outbox.next_attempt_at
        end,
        completed_at = case
          when outbox.status in ('queued', 'failed') then coalesce(outbox.completed_at, now())
          else outbox.completed_at
        end,
        last_error = case
          when outbox.status in ('queued', 'failed') then 'source_message_deleted'
          else outbox.last_error
        end,
        updated_at = now()
    where outbox.event_id = new.id
      and outbox.kind = 'message';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_message_redact_push on public.chat_messages;
create trigger chat_message_redact_push
after update of deleted_at on public.chat_messages
for each row execute function private.redact_deleted_message_push();
revoke all on function private.redact_deleted_message_push()
  from public, anon, authenticated;

-- Scheduled recovery asks Postgres for due work before applying LIMIT, so old
-- expired rows or active leases can never starve fresh notifications.
create or replace function public.list_communication_push_candidates(
  p_limit integer default 12
)
returns table (event_id uuid)
language sql
security definer
set search_path = ''
stable
as $$
  select outbox.event_id
  from public.communication_push_outbox outbox
  where outbox.expires_at > now()
    and outbox.attempt_count < 5
    and (
      (outbox.status in ('queued', 'failed') and outbox.next_attempt_at <= now())
      or (outbox.status = 'dispatching' and outbox.lease_expires_at <= now())
    )
  order by
    case when outbox.status = 'dispatching' then outbox.lease_expires_at
         else outbox.next_attempt_at end,
    outbox.created_at
  limit least(50, greatest(1, coalesce(p_limit, 12)));
$$;

-- Notification previews are operational transients, not message history.
-- Keep at most 24 hours of terminal diagnostics and mark deadlines even when
-- no dispatcher happened to wake for that event.
create or replace function public.maintain_communication_push_outbox()
returns table (expired_count integer, deleted_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired integer := 0;
  v_deleted integer := 0;
begin
  update public.communication_push_outbox outbox
  set status = 'expired',
      attempt_token = null,
      lease_expires_at = null,
      next_attempt_at = 'infinity'::timestamptz,
      completed_at = coalesce(outbox.completed_at, now()),
      updated_at = now(),
      last_error = coalesce(outbox.last_error, 'delivery_expired')
  where outbox.status in ('queued', 'failed', 'dispatching')
    and outbox.expires_at <= now();
  get diagnostics v_expired = row_count;

  delete from public.communication_push_outbox outbox
  where outbox.status in ('sent', 'failed', 'expired')
    and coalesce(outbox.completed_at, outbox.expires_at, outbox.updated_at)
      < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;

  expired_count := v_expired;
  deleted_count := v_deleted;
  return next;
end;
$$;

create or replace function public.claim_chat_media_deletion_batch(
  p_limit integer default 12
)
returns table (
  id uuid,
  message_id uuid,
  bucket text,
  object_path text,
  attempt_token uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(25, greatest(1, coalesce(p_limit, 12)));
begin
  update public.chat_media_deletion_outbox job
  set status = 'failed',
      attempt_token = null,
      lease_expires_at = null,
      next_attempt_at = now(),
      updated_at = now(),
      last_error = 'deletion_lease_expired'
  where job.status = 'dispatching'
    and job.lease_expires_at <= now();

  return query
  with candidates as (
    select job.id
    from public.chat_media_deletion_outbox job
    where job.status in ('queued', 'failed')
      and job.next_attempt_at <= now()
    order by job.next_attempt_at, job.created_at
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.chat_media_deletion_outbox job
    set status = 'dispatching',
        attempt_count = least(8, job.attempt_count + 1),
        attempt_token = gen_random_uuid(),
        lease_expires_at = now() + interval '20 seconds',
        updated_at = now(),
        last_error = null
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select claimed.id, claimed.message_id, claimed.bucket,
         claimed.object_path, claimed.attempt_token, claimed.attempt_count
  from claimed;
end;
$$;

create or replace function public.record_chat_media_deletion_result(
  p_id uuid,
  p_attempt_token uuid,
  p_deleted boolean,
  p_retryable boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.chat_media_deletion_outbox;
begin
  if p_error is not null and char_length(p_error) > 240 then return false; end if;
  select * into v_job
  from public.chat_media_deletion_outbox job
  where job.id = p_id
    and job.status = 'dispatching'
    and job.attempt_token = p_attempt_token
    and job.lease_expires_at > now()
  for update;
  if v_job.id is null then return false; end if;

  update public.chat_media_deletion_outbox job
  set status = case when coalesce(p_deleted, false) then 'deleted' else 'failed' end,
      attempt_token = null,
      lease_expires_at = null,
      next_attempt_at = case
        when coalesce(p_deleted, false) then 'infinity'::timestamptz
        when coalesce(p_retryable, false) then now() + make_interval(
          secs => least(3600, 15 * (2 ^ greatest(0, v_job.attempt_count - 1)))::integer
        )
        else now() + interval '6 hours'
      end,
      completed_at = case
        when coalesce(p_deleted, false) then coalesce(job.completed_at, now())
        else null
      end,
      updated_at = now(),
      last_error = case
        when coalesce(p_deleted, false) then null
        else coalesce(p_error, 'storage_delete_failed')
      end
  where job.id = p_id;
  return true;
end;
$$;

create or replace function public.maintain_chat_media_deletion_outbox()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.chat_media_deletion_outbox job
  where job.status = 'deleted'
    and job.completed_at < now() - interval '7 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.enqueue_communication_push(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_communication_push(uuid, text, text, text, text)
  to authenticated;

revoke all on function public.claim_communication_push(uuid)
  from public, anon, authenticated;
revoke all on function public.record_communication_push_result(
  uuid, uuid, integer, integer, integer, integer, boolean, text
) from public, anon, authenticated;
grant execute on function public.claim_communication_push(uuid) to service_role;
grant execute on function public.record_communication_push_result(
  uuid, uuid, integer, integer, integer, integer, boolean, text
) to service_role;
revoke all on function public.list_communication_push_candidates(integer)
  from public, anon, authenticated;
revoke all on function public.maintain_communication_push_outbox()
  from public, anon, authenticated;
grant execute on function public.list_communication_push_candidates(integer) to service_role;
grant execute on function public.maintain_communication_push_outbox() to service_role;
revoke all on function public.claim_chat_media_deletion_batch(integer)
  from public, anon, authenticated;
revoke all on function public.record_chat_media_deletion_result(uuid, uuid, boolean, boolean, text)
  from public, anon, authenticated;
revoke all on function public.maintain_chat_media_deletion_outbox()
  from public, anon, authenticated;
grant execute on function public.claim_chat_media_deletion_batch(integer) to service_role;
grant execute on function public.record_chat_media_deletion_result(uuid, uuid, boolean, boolean, text)
  to service_role;
grant execute on function public.maintain_chat_media_deletion_outbox() to service_role;

-- Call creation is a gateway-only operation. The gateway verifies the user's
-- JWT and obtains a 202 from Netlify's durable Background Function BEFORE it
-- invokes this service-role-only wrapper. Keeping the old functions defined
-- avoids schema-cache breakage, but revoking them prevents a modified/cached
-- browser from bypassing that queue-before-create trust boundary.
create or replace function public.start_call_from_gateway(
  p_caller uuid,
  p_conversation uuid,
  p_kind text,
  p_device text,
  p_request_id uuid
)
returns public.call_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_row public.call_sessions;
begin
  if auth.role() <> 'service_role' or p_caller is null or p_request_id is null then
    raise exception 'gateway authorization required';
  end if;
  if not exists (select 1 from public.accounts account where account.id = p_caller) then
    raise exception 'caller account not found';
  end if;

  -- private.start_call_internal intentionally centralizes all relationship,
  -- throttle, busy, lease and atomic-outbox invariants around auth.uid(). This
  -- transaction-local claim substitutes only the already verified caller.
  perform set_config('request.jwt.claim.sub', p_caller::text, true);
  v_row := private.start_call_internal(
    p_conversation,
    p_kind,
    p_device,
    p_request_id
  );
  perform set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
  return v_row;
exception when others then
  perform set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
  raise;
end;
$$;

revoke all on function public.start_call(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.start_call_reliable(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.start_call_from_gateway(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.start_call_from_gateway(uuid, uuid, text, text, uuid)
  to service_role;

comment on table public.communication_push_outbox is
  'Service-only durable at-least-once Web Push jobs for non-call communication events.';
comment on function public.enqueue_communication_push(uuid, text, text, text, text) is
  'Atomically validates and claims a source communication event and creates its durable push job.';
