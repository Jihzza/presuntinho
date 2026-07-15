-- Rich account chat + 1:1 voice/video calls.
--
-- This migration deliberately leaves the token-authenticated legacy
-- Fatma/Daniel Netlify chat outside Supabase. Real account conversations use
-- UUID conversations, strict membership RLS and private Storage/Realtime.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Web Push credentials + replay-safe couple ping delivery
-- ---------------------------------------------------------------------------

-- A PushSubscription endpoint is effectively a bearer credential. Remove
-- legacy/malformed rows before enforcing a deliberately small provider
-- allowlist and bounded key material. Keep this list in lockstep with the
-- server delivery guard: FCM, Mozilla Autopush, Apple Web Push and WNS.
delete from public.push_subscriptions
where char_length(endpoint) not between 32 and 2048
   or endpoint ~ '[[:space:]#]'
   or endpoint !~* '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|([a-z0-9-]+[.])*notify[.]windows[.]com)/'
   or char_length(p256dh) not between 16 and 256
   or p256dh !~ '^[A-Za-z0-9_-]+={0,2}$'
   or char_length(auth) not between 16 and 128
   or auth !~ '^[A-Za-z0-9_-]+={0,2}$'
   or (ua is not null and char_length(ua) not between 1 and 512);

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_length_check,
  drop constraint if exists push_subscriptions_endpoint_provider_check,
  drop constraint if exists push_subscriptions_p256dh_length_check,
  drop constraint if exists push_subscriptions_auth_length_check,
  drop constraint if exists push_subscriptions_ua_length_check;

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_length_check
    check (char_length(endpoint) between 32 and 2048 and endpoint !~ '[[:space:]#]'),
  add constraint push_subscriptions_endpoint_provider_check
    check (
      endpoint ~* '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|([a-z0-9-]+[.])*notify[.]windows[.]com)/'
    ),
  add constraint push_subscriptions_p256dh_length_check
    check (
      char_length(p256dh) between 16 and 256
      and p256dh ~ '^[A-Za-z0-9_-]+={0,2}$'
    ),
  add constraint push_subscriptions_auth_length_check
    check (
      char_length(auth) between 16 and 128
      and auth ~ '^[A-Za-z0-9_-]+={0,2}$'
    ),
  add constraint push_subscriptions_ua_length_check
    check (ua is null or char_length(ua) between 1 and 512);

-- Keep the newest ten valid devices if legacy data already exceeded the cap.
with ranked_subscriptions as (
  select endpoint,
         row_number() over (
           partition by account
           order by created_at desc, endpoint
         ) as position
  from public.push_subscriptions
)
delete from public.push_subscriptions subscriptions
using ranked_subscriptions ranked
where subscriptions.endpoint = ranked.endpoint
  and ranked.position > 10;

-- Serialize each account's writes so concurrent tabs cannot both observe a
-- ninth subscription and create an eleventh device. Existing-endpoint UPSERTs
-- remain possible at the cap; their UPDATE pass is checked as well.
create or replace function private.enforce_push_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('push-subscriptions:' || new.account::text, 0)
  );

  if tg_op = 'INSERT' and exists (
    select 1
    from public.push_subscriptions existing
    where existing.endpoint = new.endpoint
      and existing.account = new.account
  ) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select count(*) into v_count
    from public.push_subscriptions existing
    where existing.account = new.account
      and existing.endpoint <> old.endpoint;
  else
    select count(*) into v_count
    from public.push_subscriptions existing
    where existing.account = new.account;
  end if;

  if v_count >= 10 then
    raise exception 'push subscription limit reached'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_push_subscription_limit()
  from public, anon, authenticated;

drop trigger if exists push_subscriptions_enforce_limit
  on public.push_subscriptions;
create trigger push_subscriptions_enforce_limit
before insert or update on public.push_subscriptions
for each row execute function private.enforce_push_subscription_limit();

alter table public.couple_pings
  add column if not exists push_claimed_at timestamptz;

-- The browser supplies only the durable ping id and its expected kind. The
-- destination is derived from an exact, unique, fully-active couple and the
-- claim is consumed atomically, preventing recipient spoofing and replays.
create or replace function public.claim_couple_ping_push(
  p_ping uuid,
  p_kind text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_space uuid;
  v_partner uuid;
begin
  if v_me is null or p_kind not in ('love', 'nudge') then
    return null;
  end if;

  -- The UI cooldown is only feedback; this lock + durable claim timestamp is
  -- the authority. A modified client cannot mint fresh UUIDs to spam pushes.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('couple-ping-push:' || v_me::text || ':' || p_kind, 0)
  );
  if exists (
    select 1
    from public.couple_pings recent
    where recent.sender = v_me::text
      and recent.kind = p_kind
      and recent.id <> p_ping
      and recent.push_claimed_at > now() - interval '12 seconds'
  ) then
    return null;
  end if;

  select public.as_uuid(ping.couple_id)
    into v_space
  from public.couple_pings ping
  where ping.id = p_ping
    and ping.sender = v_me::text
    and ping.kind = p_kind
    and ping.push_claimed_at is null
    and ping.created_at >= now() - interval '5 minutes'
    and ping.created_at <= now()
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
    return null;
  end if;

  select member.account
    into v_partner
  from public.space_members member
  where member.space_id = v_space
    and member.account <> v_me
    and member.status = 'accepted';

  if v_partner is null
     or public.has_fully_active_couple_except(v_me, v_space)
     or public.has_fully_active_couple_except(v_partner, v_space) then
    return null;
  end if;

  update public.couple_pings ping
  set push_claimed_at = now()
  where ping.id = p_ping
    and ping.sender = v_me::text
    and ping.kind = p_kind
    and ping.push_claimed_at is null
    and ping.created_at >= now() - interval '5 minutes'
    and ping.created_at <= now();
  if not found then return null; end if;

  return v_partner;
end;
$$;

revoke all on function public.claim_couple_ping_push(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_couple_ping_push(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Durable chat model
-- ---------------------------------------------------------------------------

create table if not exists public.chat_conversations (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('couple', 'direct')),
  space_id        uuid,
  direct_key      text,
  topic           text not null default 'main',
  created_by      uuid references public.accounts(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_message_at timestamptz,
  constraint chat_conversations_topic_format
    check (topic ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  constraint chat_conversations_shape check (
    (kind = 'couple' and space_id is not null and direct_key is null)
    or
    (kind = 'direct' and space_id is null and direct_key ~* '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$')
  ),
  constraint chat_conversations_space_topic_unique unique (space_id, topic),
  constraint chat_conversations_direct_topic_unique unique (direct_key, topic)
);

create index if not exists chat_conversations_activity_idx
  on public.chat_conversations (last_message_at desc nulls last, created_at desc);

create table if not exists public.chat_members (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  account         uuid not null references public.accounts(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  last_delivered_at timestamptz,
  last_seen_at    timestamptz,
  typing_until    timestamptz,
  muted_until     timestamptz,
  pinned_at       timestamptz,
  archived_at     timestamptz,
  primary key (conversation_id, account)
);

create index if not exists chat_members_account_activity_idx
  on public.chat_members (account, pinned_at desc nulls last, archived_at, conversation_id);

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id       uuid not null,
  client_id       uuid not null,
  kind            text not null default 'text'
                    check (kind in ('text', 'image', 'audio', 'video', 'file', 'call')),
  body            text,
  reply_to_id     uuid references public.chat_messages(id) on delete set null,
  media_bucket    text check (media_bucket in ('couple-chat', 'chat-media')),
  media_path      text,
  media_mime      text,
  media_name      text,
  media_size      bigint,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  push_claimed_at timestamptz,
  created_at      timestamptz not null default now(),
  constraint chat_messages_sender_client_unique unique (sender_id, client_id),
  constraint chat_messages_body_size check (body is null or char_length(body) between 1 and 4000),
  constraint chat_messages_media_path_safe check (
    media_path is null
    or (
      char_length(media_path) between 3 and 512
      and media_path !~ '(^|/)\.\.(/|$)'
      and media_path !~* '^(https?:)?//'
    )
  ),
  constraint chat_messages_media_meta_size check (
    media_mime is null or char_length(media_mime) <= 160
  ),
  constraint chat_messages_media_name_size check (
    media_name is null or char_length(media_name) <= 240
  ),
  constraint chat_messages_media_bytes check (
    media_size is null or media_size between 0 and 26214400
  ),
  constraint chat_messages_content check (
    deleted_at is not null
    or (kind in ('text', 'call') and body is not null)
    or (kind in ('image', 'audio', 'video', 'file') and media_bucket is not null and media_path is not null)
  )
);

create index if not exists chat_messages_page_idx
  on public.chat_messages (conversation_id, created_at desc, id desc);
create index if not exists chat_messages_reply_idx
  on public.chat_messages (reply_to_id) where reply_to_id is not null;

create table if not exists public.chat_reactions (
  message_id  uuid not null references public.chat_messages(id) on delete cascade,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  emoji       text not null check (char_length(emoji) between 1 and 16),
  created_at  timestamptz not null default now(),
  primary key (message_id, account_id)
);

create table if not exists public.chat_stars (
  message_id  uuid not null references public.chat_messages(id) on delete cascade,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (message_id, account_id)
);

create index if not exists chat_stars_account_idx
  on public.chat_stars (account_id, created_at desc);

-- A call row is durable history only. SDP, ICE candidates and IP addresses are
-- never persisted; they travel through an authorised private Realtime topic.
create table if not exists public.call_sessions (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  caller          uuid not null references public.accounts(id) on delete cascade,
  callee          uuid not null references public.accounts(id) on delete cascade,
  caller_device   text not null,
  callee_device   text,
  kind            text not null check (kind in ('audio', 'video')),
  status          text not null default 'ringing'
                    check (status in ('ringing', 'accepted', 'declined', 'cancelled', 'ended', 'missed', 'failed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '45 seconds'),
  caller_heartbeat_at timestamptz not null default now(),
  callee_heartbeat_at timestamptz,
  caller_lease_expires_at timestamptz not null default (now() + interval '120 seconds'),
  callee_lease_expires_at timestamptz,
  push_sent_at    timestamptz,
  answered_at     timestamptz,
  ended_at        timestamptz,
  constraint call_sessions_two_people check (caller <> callee),
  constraint call_sessions_expiry check (expires_at > created_at),
  constraint call_sessions_caller_device_format
    check (caller_device ~ '^[A-Za-z0-9._:-]{16,160}$'),
  constraint call_sessions_callee_device_format
    check (callee_device is null or callee_device ~ '^[A-Za-z0-9._:-]{16,160}$'),
  constraint call_sessions_caller_lease_order
    check (caller_lease_expires_at > caller_heartbeat_at),
  constraint call_sessions_callee_lease_order
    check (
      (callee_heartbeat_at is null and callee_lease_expires_at is null and callee_device is null)
      or
      (callee_heartbeat_at is not null and callee_lease_expires_at > callee_heartbeat_at and callee_device is not null)
    )
);

create index if not exists call_sessions_callee_pending_idx
  on public.call_sessions (callee, created_at desc)
  where status = 'ringing';
create index if not exists call_sessions_participants_idx
  on public.call_sessions (caller, callee, created_at desc);
create index if not exists call_sessions_caller_active_idx
  on public.call_sessions (caller)
  where status in ('ringing', 'accepted');
create index if not exists call_sessions_callee_active_idx
  on public.call_sessions (callee)
  where status in ('ringing', 'accepted');
create index if not exists call_sessions_conversation_idx
  on public.call_sessions (conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Private policy helpers (not exposed through the Data API)
-- ---------------------------------------------------------------------------

create or replace function private.chat_is_member(p_conversation uuid, p_account uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select p_account is not null and exists (
    select 1
    from public.chat_members m
    where m.conversation_id = p_conversation
      and m.account = p_account
  );
$$;

-- Durable membership preserves a person's chat history. Interaction is a
-- stricter live relationship check: former friends/ex-couples cannot send,
-- type, upload, signal or call.
create or replace function private.chat_can_interact(p_conversation uuid, p_account uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select private.chat_is_member(p_conversation, p_account)
     and exists (
       select 1
       from public.chat_conversations c
       where c.id = p_conversation
         and case c.kind
           when 'direct' then public.is_dm_member(c.direct_key, p_account)
           when 'couple' then
             public.is_fully_active_couple(c.space_id)
             and exists (
               select 1 from public.space_members member
               where member.space_id = c.space_id
                 and member.account = p_account
                 and member.status = 'accepted'
             )
             and not exists (
               select 1
               from public.space_members current_member
               where current_member.space_id = c.space_id
                 and public.has_fully_active_couple_except(current_member.account, c.space_id)
             )
           else false
         end
     );
$$;

create or replace function private.chat_peer(p_conversation uuid, p_account uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select m.account
  from public.chat_members m
  where m.conversation_id = p_conversation
    and m.account <> p_account
  order by m.joined_at, m.account
  limit 1;
$$;

create or replace function private.legacy_chat_is_member(
  p_thread text,
  p_topic text,
  p_account uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select p_account is not null and exists (
    select 1
    from public.chat_conversations c
    join public.chat_members m on m.conversation_id = c.id
    where coalesce(c.space_id::text, c.direct_key) = p_thread
      and c.topic = p_topic
      and m.account = p_account
  );
$$;

create or replace function private.realtime_chat_or_call_allowed(p_topic text, p_account uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_account is null or p_topic is null then return false; end if;

  if p_topic ~* '^chat:[0-9a-f-]{36}$' then
    v_id := split_part(p_topic, ':', 2)::uuid;
    return private.chat_can_interact(v_id, p_account);
  end if;

  if p_topic ~* '^call:[0-9a-f-]{36}$' then
    v_id := split_part(p_topic, ':', 2)::uuid;
    return exists (
      select 1 from public.call_sessions c
      where c.id = v_id
        and p_account in (c.caller, c.callee)
        and private.chat_can_interact(c.conversation_id, p_account)
        and (
          (
            c.status = 'ringing'
            and c.expires_at > now()
            and c.caller_lease_expires_at > now()
          )
          or
          (
            c.status = 'accepted'
            and c.caller_device is not null
            and c.callee_device is not null
            and c.caller_lease_expires_at > now()
            and c.callee_lease_expires_at > now()
          )
        )
    );
  end if;

  return false;
exception when invalid_text_representation then
  return false;
end;
$$;

revoke all on function private.chat_is_member(uuid, uuid) from public, anon;
revoke all on function private.chat_can_interact(uuid, uuid) from public, anon;
revoke all on function private.chat_peer(uuid, uuid) from public, anon;
revoke all on function private.legacy_chat_is_member(text, text, uuid) from public, anon;
revoke all on function private.realtime_chat_or_call_allowed(text, uuid) from public, anon;
grant execute on function private.chat_is_member(uuid, uuid) to authenticated;
grant execute on function private.chat_can_interact(uuid, uuid) to authenticated;
grant execute on function private.chat_peer(uuid, uuid) to authenticated;
grant execute on function private.legacy_chat_is_member(text, text, uuid) to authenticated;
grant execute on function private.realtime_chat_or_call_allowed(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

create or replace function private.validate_chat_message()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.reply_to_id is not null and not exists (
    select 1 from public.chat_messages parent
    where parent.id = new.reply_to_id and parent.conversation_id = new.conversation_id
  ) then
    raise exception 'reply must belong to the same conversation';
  end if;

  if new.media_path is not null
     and split_part(new.media_path, '/', 1) <> new.conversation_id::text
     and not (
       new.media_bucket = 'couple-chat'
       and exists (
         select 1 from public.chat_conversations c
         where c.id = new.conversation_id
           and c.space_id::text = split_part(new.media_path, '/', 1)
       )
     ) then
    raise exception 'media path must be scoped to the conversation or its couple space';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_chat_message on public.chat_messages;
create trigger validate_chat_message
before insert or update on public.chat_messages
for each row execute function private.validate_chat_message();

create or replace function private.touch_chat_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_conversations
  set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at),
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists touch_chat_conversation on public.chat_messages;
create trigger touch_chat_conversation
after insert on public.chat_messages
for each row execute function private.touch_chat_conversation();

-- ---------------------------------------------------------------------------
-- Table grants and row-level security
-- ---------------------------------------------------------------------------

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reactions enable row level security;
alter table public.chat_stars enable row level security;
alter table public.call_sessions enable row level security;

revoke all on public.chat_conversations, public.chat_members, public.chat_messages,
  public.chat_reactions, public.chat_stars, public.call_sessions from anon;
revoke all on public.chat_conversations, public.chat_members, public.chat_messages,
  public.chat_reactions, public.chat_stars, public.call_sessions from authenticated;

grant select on public.chat_conversations, public.chat_messages,
  public.chat_reactions, public.chat_stars, public.call_sessions to authenticated;
grant select (conversation_id, account, joined_at, last_read_at,
  last_delivered_at, last_seen_at, typing_until)
  on public.chat_members to authenticated;
grant insert (conversation_id, sender_id, client_id, kind, body, reply_to_id,
  media_bucket, media_path, media_mime, media_name, media_size)
  on public.chat_messages to authenticated;
grant insert (message_id, account_id, emoji) on public.chat_reactions to authenticated;
grant insert (message_id, account_id) on public.chat_stars to authenticated;
grant delete on public.chat_reactions, public.chat_stars to authenticated;
-- PostgREST's UPSERT includes the conflict-key columns in DO UPDATE, so all
-- three submitted columns need privileges. RLS below still pins account_id to
-- auth.uid() and the target message to an active private conversation.
grant update (message_id, account_id, emoji) on public.chat_reactions to authenticated;
grant update (last_seen_at, typing_until) on public.chat_members to authenticated;

-- Push endpoints and their Web Push key material are private credentials.
-- Devices may manage only their own rows; delivery reads use the Netlify
-- function's server-side service role after it validates the sender/target.
drop policy if exists push_subs_couple_select on public.push_subscriptions;
drop policy if exists push_subs_reachable_select on public.push_subscriptions;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

drop policy if exists chat_conversations_select on public.chat_conversations;
create policy chat_conversations_select on public.chat_conversations
for select to authenticated
using (private.chat_is_member(id, (select auth.uid())));

drop policy if exists chat_members_select on public.chat_members;
create policy chat_members_select on public.chat_members
for select to authenticated
using (private.chat_is_member(conversation_id, (select auth.uid())));

drop policy if exists chat_members_update_own on public.chat_members;
create policy chat_members_update_own on public.chat_members
for update to authenticated
using (
  account = (select auth.uid())
  and private.chat_can_interact(conversation_id, (select auth.uid()))
)
with check (
  account = (select auth.uid())
  and private.chat_can_interact(conversation_id, (select auth.uid()))
  and (last_seen_at is null or last_seen_at <= now() + interval '1 minute')
  and (typing_until is null or typing_until <= now() + interval '10 seconds')
);

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
for select to authenticated
using (private.chat_is_member(conversation_id, (select auth.uid())));

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and kind <> 'call'
  and private.chat_can_interact(conversation_id, (select auth.uid()))
  and (
    media_path is null
    or (
      split_part(media_path, '/', 1) = conversation_id::text
      and split_part(media_path, '/', 2) = sender_id::text
    )
  )
);

drop policy if exists chat_reactions_select on public.chat_reactions;
create policy chat_reactions_select on public.chat_reactions
for select to authenticated
using (exists (
  select 1 from public.chat_messages m
  where m.id = message_id
    and private.chat_is_member(m.conversation_id, (select auth.uid()))
));

drop policy if exists chat_reactions_insert on public.chat_reactions;
create policy chat_reactions_insert on public.chat_reactions
for insert to authenticated
with check (
  account_id = (select auth.uid())
  and exists (
    select 1 from public.chat_messages m
    where m.id = message_id
      and private.chat_can_interact(m.conversation_id, (select auth.uid()))
  )
);

drop policy if exists chat_reactions_update_own on public.chat_reactions;
create policy chat_reactions_update_own on public.chat_reactions
for update to authenticated
using (account_id = (select auth.uid()))
with check (
  account_id = (select auth.uid())
  and exists (
    select 1 from public.chat_messages m
    where m.id = message_id
      and private.chat_can_interact(m.conversation_id, (select auth.uid()))
  )
);

drop policy if exists chat_reactions_delete on public.chat_reactions;
create policy chat_reactions_delete on public.chat_reactions
for delete to authenticated
using (account_id = (select auth.uid()));

drop policy if exists chat_stars_select on public.chat_stars;
create policy chat_stars_select on public.chat_stars
for select to authenticated
using (account_id = (select auth.uid()));

drop policy if exists chat_stars_insert on public.chat_stars;
create policy chat_stars_insert on public.chat_stars
for insert to authenticated
with check (
  account_id = (select auth.uid())
  and exists (
    select 1 from public.chat_messages m
    where m.id = message_id
      and private.chat_is_member(m.conversation_id, (select auth.uid()))
  )
);

drop policy if exists chat_stars_delete on public.chat_stars;
create policy chat_stars_delete on public.chat_stars
for delete to authenticated
using (account_id = (select auth.uid()));

drop policy if exists call_sessions_select on public.call_sessions;
create policy call_sessions_select on public.call_sessions
for select to authenticated
using ((select auth.uid()) in (caller, callee));

-- Private Broadcast + Presence for chat typing/presence and WebRTC signaling.
drop policy if exists presuntinho_private_realtime_read on realtime.messages;
create policy presuntinho_private_realtime_read on realtime.messages
for select to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.realtime_chat_or_call_allowed((select realtime.topic()), (select auth.uid()))
);

drop policy if exists presuntinho_private_realtime_write on realtime.messages;
create policy presuntinho_private_realtime_write on realtime.messages
for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.realtime_chat_or_call_allowed((select realtime.topic()), (select auth.uid()))
);

-- Postgres Changes for durable rows. RLS remains the delivery authority.
do $$
declare t text;
begin
  -- Reactions/stars are deliberately excluded: Postgres Changes DELETE events
  -- are not filtered by RLS. The client reconciles these small decorations on
  -- its eight-second authenticated poll instead of exposing cross-chat keys.
  foreach t in array array['chat_messages','call_sessions']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Private chat media bucket (used by direct messages; existing couple media
-- remains in the already-private `couple-chat` bucket).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-media', 'chat-media', false, 26214400)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists chat_media_select on storage.objects;
create policy chat_media_select on storage.objects
for select to authenticated
using (
  bucket_id = 'chat-media'
  and private.chat_is_member(
    public.as_uuid((storage.foldername(name))[1]),
    (select auth.uid())
  )
);

drop policy if exists chat_media_insert on storage.objects;
create policy chat_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.chat_can_interact(
    public.as_uuid((storage.foldername(name))[1]),
    (select auth.uid())
  )
);

drop policy if exists chat_media_delete_own on storage.objects;
create policy chat_media_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'chat-media'
  and owner_id = (select auth.uid())::text
);

-- New account-couple uploads are scoped by conversation UUID; rolling clients
-- still use the old space UUID path. Accept both shapes in the private bucket.
drop policy if exists couple_chat_select on storage.objects;
create policy couple_chat_select on storage.objects
for select to authenticated
using (
  bucket_id = 'couple-chat'
  and (
    private.legacy_chat_is_member(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2],
      (select auth.uid())
    )
    or private.chat_is_member(
      public.as_uuid((storage.foldername(name))[1]),
      (select auth.uid())
    )
  )
);

drop policy if exists couple_chat_insert on storage.objects;
create policy couple_chat_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'couple-chat'
  and (
    public.is_active_couple_member(
      public.as_uuid((storage.foldername(name))[1]),
      (select auth.uid())
    )
    or (
      (storage.foldername(name))[2] = (select auth.uid())::text
      and private.chat_can_interact(
        public.as_uuid((storage.foldername(name))[1]),
        (select auth.uid())
      )
    )
  )
);

drop policy if exists couple_chat_delete_own on storage.objects;
create policy couple_chat_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'couple-chat'
  and owner_id = (select auth.uid())::text
);

-- ---------------------------------------------------------------------------
-- Chat RPCs
-- ---------------------------------------------------------------------------

create or replace function public.ensure_chat_conversation(
  p_kind text,
  p_peer uuid default null,
  p_space uuid default null,
  p_topic text default 'main'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_peer uuid := p_peer;
  v_id uuid;
  v_key text;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_topic is null or p_topic !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception 'invalid topic';
  end if;

  if p_kind = 'couple' then
    if p_space is null
       or not public.is_active_couple_member(p_space, v_me) then
      raise exception 'active couple required';
    end if;

    if v_peer is null then
      select m.account into v_peer
      from public.space_members m
      where m.space_id = p_space and m.status = 'accepted' and m.account <> v_me
      order by m.joined_at, m.account
      limit 1;
    end if;
    if v_peer is null
       or v_peer = v_me
       or not public.is_active_space_member(p_space, v_peer) then
      raise exception 'invalid couple peer';
    end if;

    perform pg_advisory_xact_lock(hashtext('chat:couple:' || p_space::text || ':' || p_topic));
    insert into public.chat_conversations (kind, space_id, topic, created_by, updated_at)
    values ('couple', p_space, p_topic, v_me, now())
    on conflict (space_id, topic) do update set updated_at = excluded.updated_at
    returning id into v_id;

    insert into public.chat_members (conversation_id, account)
    select v_id, m.account
    from public.space_members m
    where m.space_id = p_space and m.status = 'accepted'
    on conflict (conversation_id, account) do nothing;

  elsif p_kind = 'direct' then
    if v_peer is null or v_peer = v_me or not public.are_connected(v_me, v_peer) then
      raise exception 'accepted contact required';
    end if;
    v_key := case
      when v_me::text < v_peer::text then 'dm:' || v_me::text || ':' || v_peer::text
      else 'dm:' || v_peer::text || ':' || v_me::text
    end;

    perform pg_advisory_xact_lock(hashtext('chat:direct:' || v_key || ':' || p_topic));
    insert into public.chat_conversations (kind, direct_key, topic, created_by, updated_at)
    values ('direct', v_key, p_topic, v_me, now())
    on conflict (direct_key, topic) do update set updated_at = excluded.updated_at
    returning id into v_id;

    insert into public.chat_members (conversation_id, account)
    values (v_id, v_me), (v_id, v_peer)
    on conflict (conversation_id, account) do nothing;
  else
    raise exception 'invalid conversation kind';
  end if;

  return v_id;
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

  update public.chat_messages
  set body = p_body, edited_at = now()
  where id = p_message
    and sender_id = v_me
    and kind = 'text'
    and deleted_at is null
    and created_at >= now() - interval '15 minutes'
  returning * into v_row;

  if v_row.id is null then raise exception 'message cannot be edited'; end if;
  return v_row;
end;
$$;

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
  if v_me is null then raise exception 'not authenticated'; end if;

  select * into v_row
  from public.chat_messages
  where id = p_message and sender_id = v_me
  for update;
  if v_row.id is null then raise exception 'message not found'; end if;

  delete from public.chat_reactions where message_id = p_message;

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

create or replace function public.mark_chat_read(p_conversation uuid, p_read_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_at timestamptz := least(coalesce(p_read_at, now()), now());
  v_result timestamptz;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  update public.chat_members
  set last_read_at = greatest(coalesce(last_read_at, '-infinity'::timestamptz), v_at),
      last_delivered_at = greatest(coalesce(last_delivered_at, '-infinity'::timestamptz), v_at),
      last_seen_at = now(),
      typing_until = null
  where conversation_id = p_conversation and account = v_me
  returning last_read_at into v_result;
  if v_result is null then raise exception 'conversation not found'; end if;
  return v_result;
end;
$$;

-- Push delivery derives the destination from a newly-created message instead
-- of trusting a browser-supplied account id. This also gives the Netlify
-- function a narrow, replay-limited authorisation check before it uses its
-- server-only access to Web Push endpoints.
create or replace function public.chat_push_target(p_message uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_conversation uuid;
  v_peer uuid;
begin
  if v_me is null then return null; end if;
  select m.conversation_id into v_conversation
  from public.chat_messages m
  where m.id = p_message
    and m.sender_id = v_me
    and m.kind <> 'call'
    and m.deleted_at is null
    and m.push_claimed_at is null
    and m.created_at >= now() - interval '5 minutes';
  if v_conversation is null
     or not private.chat_can_interact(v_conversation, v_me)
     or (select count(*) from public.chat_members cm where cm.conversation_id = v_conversation) <> 2 then
    return null;
  end if;
  v_peer := private.chat_peer(v_conversation, v_me);
  if v_peer is null or not private.chat_can_interact(v_conversation, v_peer) then return null; end if;
  update public.chat_messages
  set push_claimed_at = now()
  where id = p_message
    and conversation_id = v_conversation
    and sender_id = v_me
    and kind <> 'call'
    and deleted_at is null
    and push_claimed_at is null
    and created_at >= now() - interval '5 minutes';
  if not found then return null; end if;
  return v_peer;
end;
$$;

revoke all on function public.ensure_chat_conversation(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.edit_chat_message(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_chat_message(uuid) from public, anon, authenticated;
revoke all on function public.mark_chat_read(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.chat_push_target(uuid) from public, anon, authenticated;
grant execute on function public.ensure_chat_conversation(text, uuid, uuid, text) to authenticated;
grant execute on function public.edit_chat_message(uuid, text) to authenticated;
grant execute on function public.delete_chat_message(uuid) to authenticated;
grant execute on function public.mark_chat_read(uuid, timestamptz) to authenticated;
grant execute on function public.chat_push_target(uuid) to authenticated;

-- Compact account inbox. It returns only conversations visible through
-- membership and never exposes another member's private preferences.
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
        and unread.sender_id <> auth.uid()
        and unread.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)
    ),
    me.pinned_at,
    me.muted_until,
    me.archived_at
  from public.chat_members me
  join public.chat_conversations c on c.id = me.conversation_id
  left join lateral (
    select m.account
    from public.chat_members m
    where m.conversation_id = c.id and m.account <> auth.uid()
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
  where me.account = auth.uid()
  order by me.pinned_at desc nulls last,
           coalesce(c.last_message_at, c.created_at) desc;
$$;

revoke all on function public.list_chat_inbox() from public, anon, authenticated;
grant execute on function public.list_chat_inbox() to authenticated;

-- ---------------------------------------------------------------------------
-- Call state RPCs
-- ---------------------------------------------------------------------------

create or replace function private.call_device_valid(p_device text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_device is not null and p_device ~ '^[A-Za-z0-9._:-]{16,160}$';
$$;

-- Objectively expire stale rows. The wrapper below lets authenticated clients
-- trigger cleanup for their own calls; start/heartbeat also invoke it so a
-- crashed accepted call can never block somebody forever.
create or replace function private.reap_stale_calls(p_account uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  with reaped as (
    update public.call_sessions c
    set status = case when c.status = 'ringing' then 'missed' else 'failed' end,
        ended_at = coalesce(c.ended_at, now()),
        updated_at = now()
    where p_account is not null
      and p_account in (c.caller, c.callee)
      and (
        (
          c.status = 'ringing'
          and (c.expires_at <= now() or c.caller_lease_expires_at <= now())
        )
        or
        (
          c.status = 'accepted'
          and (
            c.caller_lease_expires_at <= now()
            or c.callee_lease_expires_at is null
            or c.callee_lease_expires_at <= now()
          )
        )
      )
    returning 1
  )
  select count(*)::integer from reaped;
$$;

revoke all on function private.call_device_valid(text) from public, anon, authenticated;
revoke all on function private.reap_stale_calls(uuid) from public, anon, authenticated;

create or replace function public.reap_stale_calls()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  return private.reap_stale_calls(v_me);
end;
$$;

create or replace function public.start_call(p_conversation uuid, p_kind text, p_device text)
returns public.call_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_peer uuid;
  v_row public.call_sessions;
  v_first uuid;
  v_second uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('audio', 'video') then raise exception 'invalid call kind'; end if;
  if not private.call_device_valid(p_device) then raise exception 'invalid call device'; end if;
  if not private.chat_can_interact(p_conversation, v_me) then raise exception 'conversation is not active'; end if;

  v_peer := private.chat_peer(p_conversation, v_me);
  if v_peer is null or (
    select count(*) from public.chat_members m where m.conversation_id = p_conversation
  ) <> 2 or not private.chat_can_interact(p_conversation, v_peer) then
    raise exception 'calls require a two-person conversation';
  end if;

  -- Lock EACH participant, in canonical order. A pair-only lock would allow
  -- A→B and C→B to start concurrently because those are different pairs.
  v_first := case when v_me::text < v_peer::text then v_me else v_peer end;
  v_second := case when v_me::text < v_peer::text then v_peer else v_me end;
  perform pg_advisory_xact_lock(hashtextextended('call-user:' || v_first::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('call-user:' || v_second::text, 0));

  perform private.reap_stale_calls(v_me);
  perform private.reap_stale_calls(v_peer);

  if exists (
    select 1 from public.call_sessions c
    where c.status in ('ringing', 'accepted')
      and (c.caller in (v_me, v_peer) or c.callee in (v_me, v_peer))
  ) then
    raise exception 'one of the participants is already in a call';
  end if;

  if exists (
    select 1 from public.call_sessions c
    where c.caller = v_me and c.created_at > now() - interval '3 seconds'
  ) then
    raise exception 'please wait before calling again';
  end if;

  insert into public.call_sessions (
    conversation_id, caller, callee, caller_device, kind,
    caller_heartbeat_at, caller_lease_expires_at
  )
  values (p_conversation, v_me, v_peer, p_device, p_kind, now(), now() + interval '120 seconds')
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.respond_to_call(p_call uuid, p_accept boolean, p_device text)
returns public.call_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.call_sessions;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not private.call_device_valid(p_device) then raise exception 'invalid call device'; end if;
  select * into v_row from public.call_sessions where id = p_call for update;
  if v_row.id is null or v_row.callee <> v_me then raise exception 'incoming call not found'; end if;
  if v_row.status = 'accepted' then
    if p_accept and v_row.callee_device <> p_device then
      raise exception 'call claimed by another device';
    end if;
    return v_row;
  end if;
  if v_row.status <> 'ringing' then return v_row; end if;

  if v_row.expires_at <= now() then
    update public.call_sessions
    set status = 'missed', ended_at = now(), updated_at = now()
    where id = p_call returning * into v_row;
  elsif v_row.caller_lease_expires_at <= now()
     or not private.chat_can_interact(v_row.conversation_id, v_me) then
    update public.call_sessions
    set status = 'failed', ended_at = now(), updated_at = now()
    where id = p_call returning * into v_row;
  elsif p_accept then
    update public.call_sessions
    set status = 'accepted',
        callee_device = p_device,
        callee_heartbeat_at = now(),
        callee_lease_expires_at = now() + interval '120 seconds',
        answered_at = now(),
        updated_at = now()
    where id = p_call returning * into v_row;
  else
    update public.call_sessions
    set status = 'declined', ended_at = now(), updated_at = now()
    where id = p_call returning * into v_row;
  end if;
  return v_row;
end;
$$;

-- The push sender calls this immediately before delivery. The atomic update
-- makes a replay of the same callId harmless, even across concurrent requests.
create or replace function public.claim_call_push(p_call uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_claimed uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  update public.call_sessions c
  set push_sent_at = now(), updated_at = now()
  where c.id = p_call
    and c.caller = v_me
    and c.status = 'ringing'
    and c.expires_at > now()
    and c.caller_lease_expires_at > now()
    and c.push_sent_at is null
  returning c.id into v_claimed;
  return v_claimed is not null;
end;
$$;

create or replace function public.heartbeat_call(p_call uuid, p_device text)
returns public.call_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.call_sessions;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not private.call_device_valid(p_device) then raise exception 'invalid call device'; end if;

  perform private.reap_stale_calls(v_me);
  select * into v_row from public.call_sessions where id = p_call for update;
  if v_row.id is null or v_me not in (v_row.caller, v_row.callee) then
    raise exception 'call not found';
  end if;
  if v_row.status in ('declined', 'cancelled', 'ended', 'missed', 'failed') then return v_row; end if;

  if not private.chat_can_interact(v_row.conversation_id, v_me) then
    update public.call_sessions
    set status = 'failed', ended_at = now(), updated_at = now()
    where id = p_call returning * into v_row;
    return v_row;
  end if;

  if v_row.status = 'ringing' then
    if v_me <> v_row.caller or v_row.caller_device <> p_device then
      raise exception 'call claimed by another device';
    end if;
    if v_row.expires_at <= now() then
      update public.call_sessions
      set status = 'missed', ended_at = now(), updated_at = now()
      where id = p_call returning * into v_row;
    else
      update public.call_sessions
      set caller_heartbeat_at = now(),
          caller_lease_expires_at = now() + interval '120 seconds',
          updated_at = now()
      where id = p_call returning * into v_row;
    end if;
    return v_row;
  end if;

  if v_row.caller_lease_expires_at <= now()
     or v_row.callee_lease_expires_at is null
     or v_row.callee_lease_expires_at <= now() then
    update public.call_sessions
    set status = 'failed', ended_at = now(), updated_at = now()
    where id = p_call returning * into v_row;
    return v_row;
  end if;

  if v_me = v_row.caller then
    if v_row.caller_device <> p_device then raise exception 'call claimed by another device'; end if;
    update public.call_sessions
    set caller_heartbeat_at = now(),
        caller_lease_expires_at = now() + interval '120 seconds',
        updated_at = now()
    where id = p_call returning * into v_row;
  else
    if v_row.callee_device <> p_device then raise exception 'call claimed by another device'; end if;
    update public.call_sessions
    set callee_heartbeat_at = now(),
        callee_lease_expires_at = now() + interval '120 seconds',
        updated_at = now()
    where id = p_call returning * into v_row;
  end if;
  return v_row;
end;
$$;

create or replace function public.end_call(p_call uuid, p_device text)
returns public.call_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.call_sessions;
  v_status text;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not private.call_device_valid(p_device) then raise exception 'invalid call device'; end if;
  select * into v_row from public.call_sessions where id = p_call for update;
  if v_row.id is null or v_me not in (v_row.caller, v_row.callee) then
    raise exception 'call not found';
  end if;
  if v_row.status in ('declined', 'cancelled', 'ended', 'missed', 'failed') then return v_row; end if;
  if v_me = v_row.caller and v_row.caller_device <> p_device then
    raise exception 'call claimed by another device';
  end if;
  if v_me = v_row.callee and (v_row.status <> 'accepted' or v_row.callee_device <> p_device) then
    raise exception 'call is not claimed by this device';
  end if;

  v_status := case
    when v_row.status = 'accepted' then 'ended'
    when v_row.expires_at <= now() then 'missed'
    when v_me = v_row.caller then 'cancelled'
    else 'declined'
  end;
  update public.call_sessions
  set status = v_status, ended_at = now(), updated_at = now()
  where id = p_call returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.expire_call(p_call uuid, p_device text)
returns public.call_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.call_sessions;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not private.call_device_valid(p_device) then raise exception 'invalid call device'; end if;
  select * into v_row from public.call_sessions where id = p_call for update;
  if v_row.id is null or v_me not in (v_row.caller, v_row.callee) then
    raise exception 'call not found';
  end if;
  if v_me = v_row.caller and v_row.caller_device <> p_device then
    raise exception 'call claimed by another device';
  end if;
  if v_row.status = 'ringing' and v_row.expires_at <= now() then
    update public.call_sessions
    set status = 'missed', ended_at = now(), updated_at = now()
    where id = p_call returning * into v_row;
  end if;
  return v_row;
end;
$$;

revoke all on function public.reap_stale_calls() from public, anon, authenticated;
revoke all on function public.start_call(uuid, text, text) from public, anon, authenticated;
revoke all on function public.respond_to_call(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.claim_call_push(uuid) from public, anon, authenticated;
revoke all on function public.heartbeat_call(uuid, text) from public, anon, authenticated;
revoke all on function public.end_call(uuid, text) from public, anon, authenticated;
revoke all on function public.expire_call(uuid, text) from public, anon, authenticated;
grant execute on function public.reap_stale_calls() to authenticated;
grant execute on function public.start_call(uuid, text, text) to authenticated;
grant execute on function public.respond_to_call(uuid, boolean, text) to authenticated;
grant execute on function public.claim_call_push(uuid) to authenticated;
grant execute on function public.heartbeat_call(uuid, text) to authenticated;
grant execute on function public.end_call(uuid, text) to authenticated;
grant execute on function public.expire_call(uuid, text) to authenticated;

-- Keep one durable call-history bubble in the conversation. Its body is small
-- machine-readable JSON; the client renders it as a friendly call card.
create or replace function private.sync_call_history_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text;
begin
  v_body := jsonb_build_object(
    'callId', new.id,
    'kind', new.kind,
    'status', new.status,
    'caller', new.caller,
    'callee', new.callee,
    'answeredAt', new.answered_at,
    'endedAt', new.ended_at
  )::text;

  insert into public.chat_messages (
    id, conversation_id, sender_id, client_id, kind, body, created_at, edited_at
  ) values (
    new.id, new.conversation_id, new.caller, new.id, 'call', v_body,
    new.created_at, case when tg_op = 'UPDATE' then now() else null end
  )
  on conflict (id) do update
    set body = excluded.body, edited_at = now();
  return new;
end;
$$;

drop trigger if exists sync_call_history_message on public.call_sessions;
create trigger sync_call_history_message
after insert or update of status, answered_at, ended_at on public.call_sessions
for each row execute function private.sync_call_history_message();

-- ---------------------------------------------------------------------------
-- Existing account-chat migration and rolling-PWA compatibility
-- ---------------------------------------------------------------------------

-- Every current production account chat is keyed by an active couple-space
-- UUID. Create its normalised conversation without inventing legacy identities.
insert into public.chat_conversations (
  kind, space_id, topic, created_by, created_at, updated_at, last_message_at
)
select
  'couple',
  public.as_uuid(old.couple_id),
  old.conversation_id,
  s.owner,
  min(least(old.created_at, now())),
  now(),
  max(least(old.created_at, now()))
from public.couple_messages old
join public.spaces s
  on s.id = public.as_uuid(old.couple_id) and s.kind = 'couple'
where public.as_uuid(old.couple_id) is not null
  and old.conversation_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
group by public.as_uuid(old.couple_id), old.conversation_id, s.owner
on conflict (space_id, topic) do update
set last_message_at = greatest(
      coalesce(chat_conversations.last_message_at, '-infinity'::timestamptz),
      excluded.last_message_at
    ),
    updated_at = now();

-- Backfill friend DMs created by the previous couple_messages transport.
insert into public.chat_conversations (
  kind, direct_key, topic, created_by, created_at, updated_at, last_message_at
)
select
  'direct',
  old.couple_id,
  old.conversation_id,
  first_account.id,
  min(least(old.created_at, now())),
  now(),
  max(least(old.created_at, now()))
from public.couple_messages old
join public.accounts first_account
  on first_account.id = public.as_uuid(split_part(old.couple_id, ':', 2))
join public.accounts second_account
  on second_account.id = public.as_uuid(split_part(old.couple_id, ':', 3))
where old.couple_id like 'dm:%'
  and old.couple_id ~* '^dm:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and first_account.id::text < second_account.id::text
  and old.conversation_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
group by old.couple_id, old.conversation_id, first_account.id
on conflict (direct_key, topic) do update
set last_message_at = greatest(
      coalesce(chat_conversations.last_message_at, '-infinity'::timestamptz),
      excluded.last_message_at
    ),
    updated_at = now();

insert into public.chat_members (conversation_id, account, joined_at)
select c.id, sm.account, sm.joined_at
from public.chat_conversations c
join public.space_members sm
  on sm.space_id = c.space_id and sm.status = 'accepted'
where c.kind = 'couple'
on conflict (conversation_id, account) do nothing;

insert into public.chat_members (conversation_id, account, joined_at)
select c.id, public.as_uuid(split_part(c.direct_key, ':', participant.position)), c.created_at
from public.chat_conversations c
cross join (values (2), (3)) as participant(position)
join public.accounts participant_account
  on participant_account.id = public.as_uuid(split_part(c.direct_key, ':', participant.position))
where c.kind = 'direct'
on conflict (conversation_id, account) do nothing;

insert into public.chat_messages (
  id, conversation_id, sender_id, client_id, kind, body,
  media_bucket, media_path, media_mime, created_at
)
select
  old.id,
  c.id,
  public.as_uuid(old.sender),
  old.id,
  old.kind,
  old.body,
  case when old.media_url is not null then 'couple-chat' else null end,
  case
    when old.media_url is not null and old.media_url !~* '^(https?:)?//' then old.media_url
    else null
  end,
  case old.kind when 'image' then 'image/*' when 'audio' then 'audio/*' else null end,
  least(old.created_at, now())
from public.couple_messages old
join public.chat_conversations c
  on c.kind = 'couple'
 and c.space_id = public.as_uuid(old.couple_id)
 and c.topic = old.conversation_id
where public.as_uuid(old.sender) is not null
  and exists (
    select 1 from public.space_members sender_member
    where sender_member.space_id = c.space_id
      and sender_member.account = public.as_uuid(old.sender)
      and sender_member.status = 'accepted'
  )
  and (
    (old.kind = 'text' and old.body is not null)
    or
    (old.kind in ('image', 'audio') and old.media_url is not null and old.media_url !~* '^(https?:)?//')
  )
on conflict (id) do nothing;

insert into public.chat_messages (
  id, conversation_id, sender_id, client_id, kind, body,
  media_bucket, media_path, media_mime, created_at
)
select
  old.id,
  c.id,
  public.as_uuid(old.sender),
  old.id,
  old.kind,
  old.body,
  case when old.media_url is not null then 'couple-chat' else null end,
  case when old.media_url is not null and old.media_url !~* '^(https?:)?//' then old.media_url else null end,
  case old.kind when 'image' then 'image/*' when 'audio' then 'audio/*' else null end,
  least(old.created_at, now())
from public.couple_messages old
join public.chat_conversations c
  on c.kind = 'direct'
 and c.direct_key = old.couple_id
 and c.topic = old.conversation_id
where public.as_uuid(old.sender) in (
    public.as_uuid(split_part(old.couple_id, ':', 2)),
    public.as_uuid(split_part(old.couple_id, ':', 3))
  )
  and old.kind = 'text'
  and old.body is not null
on conflict (id) do nothing;

-- Turn a rolling old-client insert into the corresponding normalised row.
create or replace function private.mirror_legacy_message_to_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation uuid;
  v_space uuid := public.as_uuid(new.couple_id);
  v_sender uuid := public.as_uuid(new.sender);
  v_first uuid;
  v_second uuid;
begin
  if v_sender is null or new.conversation_id !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    return new;
  end if;

  if v_space is not null then
    insert into public.chat_conversations (kind, space_id, topic, created_by)
    select 'couple', v_space, new.conversation_id, s.owner
    from public.spaces s where s.id = v_space and s.kind = 'couple'
    on conflict (space_id, topic) do update set updated_at = now()
    returning id into v_conversation;

    insert into public.chat_members (conversation_id, account)
    select v_conversation, sm.account
    from public.space_members sm
    where sm.space_id = v_space and sm.status = 'accepted'
    on conflict (conversation_id, account) do nothing;
  elsif new.couple_id ~* '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$' then
    v_first := split_part(new.couple_id, ':', 2)::uuid;
    v_second := split_part(new.couple_id, ':', 3)::uuid;
    if v_first::text >= v_second::text or not public.are_connected(v_first, v_second) then return new; end if;

    insert into public.chat_conversations (kind, direct_key, topic, created_by)
    values ('direct', new.couple_id, new.conversation_id, v_sender)
    on conflict (direct_key, topic) do update set updated_at = now()
    returning id into v_conversation;
    insert into public.chat_members (conversation_id, account)
    values (v_conversation, v_first), (v_conversation, v_second)
    on conflict (conversation_id, account) do nothing;
  else
    return new;
  end if;

  if v_conversation is null then return new; end if;
  insert into public.chat_messages (
    id, conversation_id, sender_id, client_id, kind, body,
    media_bucket, media_path, media_mime, created_at
  ) values (
    new.id,
    v_conversation,
    v_sender,
    new.id,
    new.kind,
    new.body,
    case when new.media_url is not null then 'couple-chat' else null end,
    case when new.media_url is not null and new.media_url !~* '^(https?:)?//' then new.media_url else null end,
    case new.kind when 'image' then 'image/*' when 'audio' then 'audio/*' else null end,
    new.created_at
  ) on conflict (id) do nothing;
  return new;
exception when invalid_text_representation then
  return new;
end;
$$;

-- Turn a new-client text/photo/voice insert into a row old cached PWAs still
-- understand. Video/files/call cards intentionally stay on the new model.
create or replace function private.mirror_chat_message_to_legacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread text;
  v_topic text;
begin
  if new.kind not in ('text', 'image', 'audio') then return new; end if;
  select coalesce(c.space_id::text, c.direct_key), c.topic
  into v_thread, v_topic
  from public.chat_conversations c where c.id = new.conversation_id;
  if v_thread is null then return new; end if;

  insert into public.couple_messages (
    id, couple_id, conversation_id, sender, kind, body, media_url, created_at
  ) values (
    new.id, v_thread, v_topic, new.sender_id::text, new.kind,
    new.body, new.media_path, new.created_at
  ) on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function private.mirror_chat_message_update_to_legacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind not in ('text', 'image', 'audio') then return new; end if;
  update public.couple_messages
  set kind = case when new.deleted_at is not null then 'text' else new.kind end,
      body = case when new.deleted_at is not null then '🚫' else new.body end,
      media_url = case when new.deleted_at is not null then null else new.media_path end
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists mirror_legacy_message_to_chat on public.couple_messages;
create trigger mirror_legacy_message_to_chat
after insert on public.couple_messages
for each row execute function private.mirror_legacy_message_to_chat();

drop trigger if exists mirror_chat_message_to_legacy on public.chat_messages;
create trigger mirror_chat_message_to_legacy
after insert on public.chat_messages
for each row execute function private.mirror_chat_message_to_legacy();

drop trigger if exists mirror_chat_message_update_to_legacy on public.chat_messages;
create trigger mirror_chat_message_update_to_legacy
after update of body, media_path, media_mime, media_name, deleted_at on public.chat_messages
for each row execute function private.mirror_chat_message_update_to_legacy();

-- The legacy Supabase policy admitted arbitrary anonymous namespaces and did
-- not bind account-couple sender to auth.uid(). Keep only authenticated rolling
-- clients, with the exact same relationship checks as the new model.
revoke all on public.couple_messages from anon;
revoke all on public.couple_messages from authenticated;
grant select on public.couple_messages to authenticated;
grant insert (couple_id, conversation_id, sender, kind, body, media_url)
  on public.couple_messages to authenticated;

drop policy if exists couple_messages_select on public.couple_messages;
create policy couple_messages_select on public.couple_messages
for select to authenticated
using (
  private.legacy_chat_is_member(couple_id, conversation_id, (select auth.uid()))
);

drop policy if exists couple_messages_insert on public.couple_messages;
create policy couple_messages_insert on public.couple_messages
for insert to authenticated
with check (
  sender = (select auth.uid())::text
  and char_length(coalesce(body, '') || coalesce(media_url, '')) between 1 and 5000000
  and (body is null or char_length(body) between 1 and 4000)
  and (media_url is null or (
    char_length(media_url) between 3 and 512
    and media_url !~* '^(https?:)?//'
    and media_url !~ '(^|/)\.\.(/|$)'
  ))
  and case
    when couple_id like 'dm:%' then public.is_dm_member(couple_id, (select auth.uid()))
    when public.as_uuid(couple_id) is not null
      then public.is_active_couple_member(public.as_uuid(couple_id), (select auth.uid()))
    else false
  end
);

comment on table public.chat_conversations is 'Private account chat threads; membership is authoritative.';
comment on table public.chat_messages is 'Rich durable messages. SDP/ICE are never stored here.';
comment on table public.call_sessions is 'Two-person call state/history; media flows peer-to-peer or through TURN.';
