-- Reliable per-installation call delivery, observable acknowledgements and
-- retryable push outbox. This migration is additive and keeps cached clients
-- that still write the original push_subscriptions shape working.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Account installations and push subscription health
-- ---------------------------------------------------------------------------

create table if not exists public.account_installations (
  account           uuid not null references public.accounts(id) on delete cascade,
  installation_id   text not null,
  platform          text not null default 'unknown',
  capabilities      jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  last_verified_at  timestamptz,
  disabled_at       timestamptz,
  primary key (account, installation_id),
  constraint account_installations_id_format
    check (installation_id ~ '^[A-Za-z0-9._:-]{16,160}$'),
  constraint account_installations_platform
    check (platform in ('ios', 'android', 'windows', 'macos', 'linux', 'other', 'unknown')),
  constraint account_installations_capabilities_object
    check (
      jsonb_typeof(capabilities) = 'object'
      and octet_length(capabilities::text) <= 4096
    )
);

create index if not exists account_installations_seen_idx
  on public.account_installations (account, last_seen_at desc)
  where disabled_at is null;

alter table public.account_installations enable row level security;

drop policy if exists account_installations_own_select on public.account_installations;
create policy account_installations_own_select on public.account_installations
for select to authenticated
using (account = (select auth.uid()));

alter table public.push_subscriptions
  add column if not exists id uuid,
  add column if not exists installation_id text,
  add column if not exists platform text,
  add column if not exists capabilities jsonb,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_verified_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_failure_at timestamptz,
  add column if not exists failure_count integer,
  add column if not exists delivery_version bigint,
  add column if not exists disabled_at timestamptz;

update public.push_subscriptions
set id = coalesce(id, gen_random_uuid()),
    installation_id = coalesce(
      installation_id,
      'legacy:' || substr(encode(extensions.digest(endpoint, 'sha256'), 'hex'), 1, 40)
    ),
    platform = coalesce(
      platform,
      case
        when ua ilike '%iphone%' or ua ilike '%ipad%' then 'ios'
        when ua ilike '%android%' then 'android'
        when ua ilike '%windows%' then 'windows'
        when ua ilike '%macintosh%' then 'macos'
        when ua ilike '%linux%' then 'linux'
        else 'other'
      end
    ),
    capabilities = coalesce(capabilities, '{}'::jsonb),
    last_seen_at = coalesce(last_seen_at, created_at, now()),
    failure_count = coalesce(failure_count, 0),
    delivery_version = coalesce(delivery_version, 1);

alter table public.push_subscriptions
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column installation_id set not null,
  alter column platform set default 'unknown',
  alter column platform set not null,
  alter column capabilities set default '{}'::jsonb,
  alter column capabilities set not null,
  alter column last_seen_at set default now(),
  alter column last_seen_at set not null,
  alter column failure_count set default 0,
  alter column failure_count set not null,
  alter column delivery_version set default 1,
  alter column delivery_version set not null;

create unique index if not exists push_subscriptions_id_uidx
  on public.push_subscriptions (id);
create unique index if not exists push_subscriptions_account_installation_uidx
  on public.push_subscriptions (account, installation_id);
create index if not exists push_subscriptions_delivery_health_idx
  on public.push_subscriptions (account, disabled_at, last_seen_at desc);

insert into public.account_installations (
  account, installation_id, platform, capabilities,
  created_at, last_seen_at, last_verified_at, disabled_at
)
select
  account,
  installation_id,
  platform,
  capabilities,
  created_at,
  last_seen_at,
  last_verified_at,
  disabled_at
from public.push_subscriptions
on conflict (account, installation_id) do update
set platform = excluded.platform,
    capabilities = public.account_installations.capabilities || excluded.capabilities,
    last_seen_at = greatest(public.account_installations.last_seen_at, excluded.last_seen_at),
    last_verified_at = greatest(
      public.account_installations.last_verified_at,
      excluded.last_verified_at
    ),
    disabled_at = excluded.disabled_at;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_installation_fk,
  drop constraint if exists push_subscriptions_installation_format,
  drop constraint if exists push_subscriptions_platform_check,
  drop constraint if exists push_subscriptions_capabilities_check,
  drop constraint if exists push_subscriptions_failure_count_check,
  drop constraint if exists push_subscriptions_delivery_version_check;

alter table public.push_subscriptions
  add constraint push_subscriptions_installation_fk
    foreign key (account, installation_id)
    references public.account_installations(account, installation_id)
    on delete cascade,
  add constraint push_subscriptions_installation_format
    check (installation_id ~ '^[A-Za-z0-9._:-]{16,160}$'),
  add constraint push_subscriptions_platform_check
    check (platform in ('ios', 'android', 'windows', 'macos', 'linux', 'other', 'unknown')),
  add constraint push_subscriptions_capabilities_check
    check (
      jsonb_typeof(capabilities) = 'object'
      and octet_length(capabilities::text) <= 4096
    ),
  add constraint push_subscriptions_failure_count_check
    check (failure_count between 0 and 1000000),
  add constraint push_subscriptions_delivery_version_check
    check (delivery_version between 1 and 9223372036854775807);

-- Cached clients only send endpoint/account/keys/ua. Fill the new device
-- columns before constraints run and keep the installation registry in sync.
create or replace function private.prepare_push_subscription_installation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.delivery_version := case
      when old.endpoint is distinct from new.endpoint
        or old.account is distinct from new.account
        or old.installation_id is distinct from new.installation_id
        or old.p256dh is distinct from new.p256dh
        or old.auth is distinct from new.auth
      then case
        when coalesce(old.delivery_version, 1) < 9223372036854775807
          then coalesce(old.delivery_version, 1) + 1
        else coalesce(old.delivery_version, 1)
      end
      else coalesce(old.delivery_version, 1)
    end;
  else
    new.delivery_version := coalesce(new.delivery_version, 1);
  end if;
  if new.installation_id is null
     or new.installation_id !~ '^[A-Za-z0-9._:-]{16,160}$' then
    new.installation_id :=
      'legacy:' || substr(encode(extensions.digest(new.endpoint, 'sha256'), 'hex'), 1, 40);
  end if;
  new.id := coalesce(new.id, gen_random_uuid());
  new.platform := coalesce(
    new.platform,
    case
      when new.ua ilike '%iphone%' or new.ua ilike '%ipad%' then 'ios'
      when new.ua ilike '%android%' then 'android'
      when new.ua ilike '%windows%' then 'windows'
      when new.ua ilike '%macintosh%' then 'macos'
      when new.ua ilike '%linux%' then 'linux'
      else 'other'
    end
  );
  new.capabilities := coalesce(new.capabilities, '{}'::jsonb);
  new.last_seen_at := now();
  new.failure_count := coalesce(new.failure_count, 0);

  if tg_op = 'INSERT' then
    -- Legacy cached clients still insert directly. Acquire the same advisory
    -- identities and row order as reconcile_push_installation before the
    -- installation UPSERT; otherwise ON CONFLICT could invert
    -- installation -> subscription against provider-result transactions.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('push-endpoint:' || new.endpoint, 0)
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'push-installation:' || new.account::text || ':' || new.installation_id,
        0
      )
    );
    perform 1
    from public.push_subscriptions subscription
    where subscription.endpoint = new.endpoint
       or (
         subscription.account = new.account
         and subscription.installation_id = new.installation_id
       )
    order by subscription.id
    for update;
  end if;

  insert into public.account_installations (
    account, installation_id, platform, capabilities,
    last_seen_at, last_verified_at, disabled_at
  ) values (
    new.account, new.installation_id, new.platform, new.capabilities,
    now(), new.last_verified_at, null
  )
  on conflict (account, installation_id) do update
  set platform = excluded.platform,
      capabilities = public.account_installations.capabilities || excluded.capabilities,
      last_seen_at = now(),
      last_verified_at = coalesce(excluded.last_verified_at, public.account_installations.last_verified_at),
      disabled_at = null;
  return new;
end;
$$;

revoke all on function private.prepare_push_subscription_installation()
  from public, anon, authenticated;

drop trigger if exists push_subscriptions_prepare_installation
  on public.push_subscriptions;
create trigger push_subscriptions_prepare_installation
before insert or update on public.push_subscriptions
for each row execute function private.prepare_push_subscription_installation();

-- ---------------------------------------------------------------------------
-- Durable outbox, per-device delivery state and append-only event ledger
-- ---------------------------------------------------------------------------

create table if not exists public.call_delivery_outbox (
  call_id          uuid primary key references public.call_sessions(id) on delete cascade,
  status           text not null default 'pending',
  attempt_count    integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  locked_at        timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint call_delivery_outbox_status
    check (status in ('pending', 'dispatching', 'partial', 'sent', 'failed', 'cancelled')),
  constraint call_delivery_outbox_attempts
    check (attempt_count between 0 and 1000),
  constraint call_delivery_outbox_error_length
    check (last_error is null or char_length(last_error) <= 240)
);

create index if not exists call_delivery_outbox_pending_idx
  on public.call_delivery_outbox (next_attempt_at, created_at)
  where status in ('pending', 'partial');

-- Incoming-call notifications use `requireInteraction`, so finishing a call
-- must itself be a durable delivery job. The terminal outbox is deliberately
-- separate from the invitation outbox: retries can never resurrect a ringing
-- notification after the call has already changed state.
create table if not exists public.call_terminal_outbox (
  call_id          uuid primary key references public.call_sessions(id) on delete cascade,
  terminal_status  text not null,
  status           text not null default 'pending',
  attempt_count    integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  locked_at        timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  constraint call_terminal_outbox_terminal_status
    check (terminal_status in (
      'accepted', 'declined', 'cancelled', 'ended', 'missed', 'failed'
    )),
  constraint call_terminal_outbox_status
    check (status in ('pending', 'dispatching', 'partial', 'sent', 'failed')),
  constraint call_terminal_outbox_attempts
    check (attempt_count between 0 and 1000),
  constraint call_terminal_outbox_expiry
    check (expires_at > created_at),
  constraint call_terminal_outbox_error_length
    check (last_error is null or char_length(last_error) <= 240)
);

create index if not exists call_terminal_outbox_pending_idx
  on public.call_terminal_outbox (next_attempt_at, created_at)
  where status in ('pending', 'partial');

create table if not exists public.call_deliveries (
  id                    uuid primary key default gen_random_uuid(),
  call_id               uuid not null references public.call_sessions(id) on delete cascade,
  account               uuid not null references public.accounts(id) on delete cascade,
  installation_id       text not null,
  channel               text not null,
  status                text not null default 'queued',
  subscription_id       uuid references public.push_subscriptions(id) on delete set null,
  subscription_version  bigint,
  attempt_count         integer not null default 0,
  provider_status       integer,
  last_error            text,
  attempt_token_hash    bytea,
  ack_token_hashes      bytea[] not null default '{}'::bytea[],
  ack_token_expires_at  timestamptz,
  provider_accepted_at  timestamptz,
  received_at           timestamptz,
  presented_at          timestamptz,
  ringing_at            timestamptz,
  opened_at             timestamptz,
  failed_at             timestamptz,
  next_attempt_at       timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (call_id, account, installation_id, channel),
  constraint call_deliveries_installation_format
    check (installation_id ~ '^[A-Za-z0-9._:-]{16,160}$'),
  constraint call_deliveries_channel
    check (channel in ('realtime', 'push', 'push_terminal')),
  constraint call_deliveries_status
    check (status in (
      'queued', 'dispatching', 'provider_accepted', 'received', 'presented',
      'ringing', 'opened', 'failed', 'stale', 'cancelled', 'answered_elsewhere'
    )),
  constraint call_deliveries_attempts
    check (attempt_count between 0 and 1000),
  constraint call_deliveries_provider_status
    check (provider_status is null or provider_status between 0 and 599),
  constraint call_deliveries_subscription_version
    check (subscription_version is null or subscription_version > 0),
  constraint call_deliveries_error_length
    check (last_error is null or char_length(last_error) <= 240),
  constraint call_deliveries_ack_token_limit
    check (cardinality(ack_token_hashes) between 0 and 4)
);

create index if not exists call_deliveries_call_status_idx
  on public.call_deliveries (call_id, status, updated_at desc);
create index if not exists call_deliveries_dispatch_idx
  on public.call_deliveries (next_attempt_at, created_at)
  where channel = 'push' and status in ('queued', 'failed');
create index if not exists call_terminal_deliveries_dispatch_idx
  on public.call_deliveries (next_attempt_at, created_at)
  where channel = 'push_terminal' and status in ('queued', 'failed');
create index if not exists call_deliveries_account_idx
  on public.call_deliveries (account, created_at desc);

create table if not exists public.call_events (
  id               bigint generated by default as identity primary key,
  call_id          uuid not null references public.call_sessions(id) on delete cascade,
  actor            uuid references public.accounts(id) on delete set null,
  installation_id  text,
  event            text not null,
  details          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  constraint call_events_event_format
    check (event ~ '^[a-z][a-z0-9_]{1,47}$'),
  constraint call_events_installation_format
    check (
      installation_id is null
      or installation_id ~ '^[A-Za-z0-9._:-]{16,160}$'
    ),
  constraint call_events_details_object
    check (
      jsonb_typeof(details) = 'object'
      and octet_length(details::text) <= 4096
    )
);

create index if not exists call_events_call_idx
  on public.call_events (call_id, created_at, id);

alter table public.call_delivery_outbox enable row level security;
alter table public.call_terminal_outbox enable row level security;
alter table public.call_deliveries enable row level security;
alter table public.call_events enable row level security;

drop policy if exists call_delivery_outbox_participant_select on public.call_delivery_outbox;
create policy call_delivery_outbox_participant_select on public.call_delivery_outbox
for select to authenticated
using (
  exists (
    select 1
    from public.call_sessions c
    where c.id = call_delivery_outbox.call_id
      and (select auth.uid()) in (c.caller, c.callee)
  )
);

drop policy if exists call_deliveries_participant_select on public.call_deliveries;
create policy call_deliveries_participant_select on public.call_deliveries
for select to authenticated
using (
  exists (
    select 1
    from public.call_sessions c
    where c.id = call_deliveries.call_id
      and (select auth.uid()) in (c.caller, c.callee)
  )
);

drop policy if exists call_events_participant_select on public.call_events;
create policy call_events_participant_select on public.call_events
for select to authenticated
using (
  exists (
    select 1
    from public.call_sessions c
    where c.id = call_events.call_id
      and (select auth.uid()) in (c.caller, c.callee)
  )
);

create or replace function private.call_installation_valid(p_installation text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_installation is not null
     and p_installation ~ '^[A-Za-z0-9._:-]{16,160}$';
$$;

create or replace function private.call_capabilities_valid(p_capabilities jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_capabilities is null
      or (
        jsonb_typeof(p_capabilities) = 'object'
        and octet_length(p_capabilities::text) <= 4096
      );
$$;

create or replace function private.call_platform(p_platform text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_platform, 'unknown'))
    when 'ios' then 'ios'
    when 'android' then 'android'
    when 'windows' then 'windows'
    when 'macos' then 'macos'
    when 'linux' then 'linux'
    when 'other' then 'other'
    else 'unknown'
  end;
$$;

revoke all on function private.call_installation_valid(text)
  from public, anon, authenticated;
revoke all on function private.call_capabilities_valid(jsonb)
  from public, anon, authenticated;
revoke all on function private.call_platform(text)
  from public, anon, authenticated;

create or replace function public.upsert_account_installation(
  p_installation_id text,
  p_platform text,
  p_capabilities jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not private.call_installation_valid(p_installation_id) then
    raise exception 'invalid installation';
  end if;
  if not private.call_capabilities_valid(p_capabilities) then
    raise exception 'invalid capabilities';
  end if;

  insert into public.account_installations (
    account, installation_id, platform, capabilities,
    last_seen_at, disabled_at
  ) values (
    v_me,
    p_installation_id,
    private.call_platform(p_platform),
    coalesce(p_capabilities, '{}'::jsonb),
    now(),
    null
  )
  on conflict (account, installation_id) do update
  set platform = excluded.platform,
      capabilities = public.account_installations.capabilities || excluded.capabilities,
      last_seen_at = now(),
      disabled_at = null;
  return true;
end;
$$;

create or replace function public.heartbeat_account_installation(
  p_installation_id text,
  p_capabilities jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_updated uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not private.call_installation_valid(p_installation_id) then
    raise exception 'invalid installation';
  end if;
  if not private.call_capabilities_valid(p_capabilities) then
    raise exception 'invalid capabilities';
  end if;

  update public.account_installations
  set last_seen_at = now(),
      capabilities = case
        when p_capabilities is null then capabilities
        else capabilities || p_capabilities
      end,
      disabled_at = null
  where account = v_me
    and installation_id = p_installation_id
  returning account into v_updated;
  return v_updated is not null;
end;
$$;

create or replace function public.reconcile_push_installation(
  p_installation_id text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_ua text,
  p_platform text,
  p_capabilities jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_existing public.push_subscriptions;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not private.call_installation_valid(p_installation_id) then
    raise exception 'invalid installation';
  end if;
  if not private.call_capabilities_valid(p_capabilities) then
    raise exception 'invalid capabilities';
  end if;
  if p_endpoint is null
     or char_length(p_endpoint) not between 32 and 2048
     or p_endpoint ~ '[[:space:]#]'
     or p_endpoint !~* '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|([a-z0-9-]+[.])*notify[.]windows[.]com)/' then
    raise exception 'invalid push endpoint';
  end if;
  if p_p256dh is null
     or char_length(p_p256dh) not between 16 and 256
     or p_p256dh !~ '^[A-Za-z0-9_-]+={0,2}$' then
    raise exception 'invalid push key';
  end if;
  if p_auth is null
     or char_length(p_auth) not between 16 and 128
     or p_auth !~ '^[A-Za-z0-9_-]+={0,2}$' then
    raise exception 'invalid push auth';
  end if;
  if p_ua is not null and char_length(p_ua) not between 1 and 512 then
    raise exception 'invalid user agent';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('push-endpoint:' || p_endpoint, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'push-installation:' || v_me::text || ':' || p_installation_id,
      0
    )
  );

  -- Lock every existing subscription identity that this reconciliation may
  -- update/delete before the installation row. FK actions can then only touch
  -- deliveries in the global subscription -> installation -> delivery order.
  perform 1
  from public.push_subscriptions subscription
  where subscription.endpoint = p_endpoint
     or (
       subscription.account = v_me
       and subscription.installation_id = p_installation_id
     )
  order by subscription.id
  for update;

  select * into v_existing
  from public.push_subscriptions
  where endpoint = p_endpoint;
  if v_existing.endpoint is not null
     and v_existing.account <> v_me
     and (
       v_existing.p256dh <> p_p256dh
       or v_existing.auth <> p_auth
     ) then
    raise exception 'push endpoint belongs to another installation';
  end if;

  insert into public.account_installations (
    account, installation_id, platform, capabilities,
    last_seen_at, last_verified_at, disabled_at
  ) values (
    v_me,
    p_installation_id,
    private.call_platform(p_platform),
    coalesce(p_capabilities, '{}'::jsonb),
    now(),
    now(),
    null
  )
  on conflict (account, installation_id) do update
  set platform = excluded.platform,
      capabilities = public.account_installations.capabilities || excluded.capabilities,
      last_seen_at = now(),
      last_verified_at = now(),
      disabled_at = null;

  -- One live endpoint per installation. A browser account switch may rebind
  -- the exact same endpoint only when its key material also matches.
  delete from public.push_subscriptions
  where (
      account = v_me
      and installation_id = p_installation_id
      and endpoint <> p_endpoint
    )
    or (
      endpoint = p_endpoint
      and account <> v_me
      and p256dh = p_p256dh
      and auth = p_auth
    );

  insert into public.push_subscriptions (
    endpoint, account, p256dh, auth, ua,
    installation_id, platform, capabilities,
    last_seen_at, last_verified_at, failure_count, disabled_at
  ) values (
    p_endpoint, v_me, p_p256dh, p_auth, p_ua,
    p_installation_id, private.call_platform(p_platform),
    coalesce(p_capabilities, '{}'::jsonb),
    now(), now(), 0, null
  )
  on conflict (endpoint) do update
  set account = excluded.account,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      ua = excluded.ua,
      installation_id = excluded.installation_id,
      platform = excluded.platform,
      capabilities = excluded.capabilities,
      last_seen_at = now(),
      last_verified_at = now(),
      failure_count = 0,
      disabled_at = null;
  return true;
end;
$$;

create or replace function public.push_installation_is_bound(
  p_installation_id text,
  p_endpoint text
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select auth.uid() is not null
     and private.call_installation_valid(p_installation_id)
     and exists (
       select 1
       from public.push_subscriptions p
       where p.account = auth.uid()
         and p.installation_id = p_installation_id
         and p.endpoint = p_endpoint
         and p.disabled_at is null
     );
$$;

create or replace function public.revoke_push_installation(
  p_installation_id text,
  p_endpoint text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_deleted integer;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not private.call_installation_valid(p_installation_id) then
    raise exception 'invalid installation';
  end if;
  -- Match reconciliation/ACK lock order before ON DELETE SET NULL touches any
  -- call delivery rows belonging to this installation.
  perform 1
  from public.push_subscriptions subscription
  where subscription.account = v_me
    and subscription.installation_id = p_installation_id
    and (p_endpoint is null or subscription.endpoint = p_endpoint)
  order by subscription.id
  for update;
  perform 1
  from public.account_installations installation
  where installation.account = v_me
    and installation.installation_id = p_installation_id
  for update;
  delete from public.push_subscriptions
  where account = v_me
    and installation_id = p_installation_id
    and (p_endpoint is null or endpoint = p_endpoint);
  get diagnostics v_deleted = row_count;
  update public.account_installations
  set disabled_at = now(), last_seen_at = now()
  where account = v_me
    and installation_id = p_installation_id
    and not exists (
      select 1
      from public.push_subscriptions p
      where p.account = v_me
        and p.installation_id = p_installation_id
    );
  return v_deleted > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Conversation preferences and notification suppression
-- ---------------------------------------------------------------------------

-- Keep the message push claim atomic even when the recipient muted the
-- conversation. Returning NULL is intentionally indistinguishable from a
-- replay/invalid claim to the browser-facing function: the message remains in
-- the inbox, but no Web Push is emitted and the sender learns no private mute
-- preference.
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
  v_muted boolean := false;
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
     or (
       select count(*)
       from public.chat_members cm
       where cm.conversation_id = v_conversation
     ) <> 2 then
    return null;
  end if;

  v_peer := private.chat_peer(v_conversation, v_me);
  if v_peer is null
     or not private.chat_can_interact(v_conversation, v_peer) then
    return null;
  end if;

  -- Consume the one-shot claim before consulting the private preference. This
  -- makes muted delivery and replay equally idempotent and opaque.
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

  select coalesce(cm.muted_until > now(), false)
  into v_muted
  from public.chat_members cm
  where cm.conversation_id = v_conversation
    and cm.account = v_peer;
  if coalesce(v_muted, false) then return null; end if;
  return v_peer;
end;
$$;

create or replace function private.seed_call_deliveries(
  p_call uuid,
  p_callee uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Global order for delivery mutations is call -> subscription -> delivery ->
  -- outbox. Callers already own the call row; lock subscription identities in
  -- a deterministic order before an FK check or ON CONFLICT touches delivery.
  perform 1
  from public.push_subscriptions subscription
  where subscription.id in (
    select candidate.id
    from public.push_subscriptions candidate
    where candidate.account = p_callee
      and candidate.disabled_at is null
      and candidate.last_seen_at > now() - interval '90 days'
    order by candidate.last_seen_at desc, candidate.id
    limit 10
  )
  order by subscription.id
  for update;

  insert into public.call_deliveries (
    call_id, account, installation_id, channel, status
  )
  select p_call, installation.account, installation.installation_id,
         'realtime', 'queued'
  from public.account_installations installation
  where installation.account = p_callee
    and installation.disabled_at is null
    and installation.last_seen_at > now() - interval '90 days'
  order by installation.last_seen_at desc, installation.installation_id
  limit 10
  on conflict (call_id, account, installation_id, channel) do nothing;

  insert into public.call_deliveries (
    call_id, account, installation_id, channel, status,
    subscription_id, subscription_version
  )
  select p_call, subscription.account, subscription.installation_id,
         'push', 'queued', subscription.id, subscription.delivery_version
  from public.push_subscriptions subscription
  where subscription.account = p_callee
    and subscription.disabled_at is null
    and subscription.last_seen_at > now() - interval '90 days'
  order by subscription.last_seen_at desc, subscription.id
  limit 10
  on conflict (call_id, account, installation_id, channel) do update
  set subscription_id = excluded.subscription_id,
      subscription_version = excluded.subscription_version,
      status = 'queued',
      attempt_count = 0,
      provider_status = null,
      last_error = null,
      attempt_token_hash = null,
      -- ACK capabilities encrypt the exact subscription snapshot. Rotating
      -- key material invalidates the old capabilities and also prevents a
      -- fifth array element after four attempts on the previous version.
      ack_token_hashes = '{}'::bytea[],
      ack_token_expires_at = null,
      provider_accepted_at = null,
      received_at = null,
      presented_at = null,
      ringing_at = null,
      opened_at = null,
      failed_at = null,
      next_attempt_at = now(),
      updated_at = now()
  -- Never refresh the lease timestamp of a delivery currently owned by a
  -- dispatcher: doing that would prevent the crash-recovery timeout below.
  where call_deliveries.status in ('queued', 'failed', 'stale')
    and (
      call_deliveries.subscription_id is distinct from excluded.subscription_id
      or call_deliveries.subscription_version is distinct from excluded.subscription_version
    );

  -- A worker can observe zero devices just before this installation is
  -- reconciled. A later claim reseeds the still-live call and may reopen only
  -- that explicit no-device outcome; permanent provider failures stay final.
  update public.call_delivery_outbox outbox
  set status = 'pending',
      next_attempt_at = now(),
      locked_at = null,
      last_error = null,
      updated_at = now()
  where outbox.call_id = p_call
    and outbox.status = 'failed'
    and outbox.last_error = 'no_push_devices'
    and exists (
      select 1
      from public.call_sessions c
      where c.id = p_call
        and c.status = 'ringing'
        and c.expires_at > now()
        and c.caller_lease_expires_at > now()
    )
    and exists (
      select 1
      from public.call_deliveries delivery
      join public.push_subscriptions subscription
        on subscription.id = delivery.subscription_id
       and subscription.delivery_version = delivery.subscription_version
       and subscription.disabled_at is null
      where delivery.call_id = p_call
        and delivery.channel = 'push'
        and delivery.status in ('queued', 'failed')
    );
end;
$$;

revoke all on function private.seed_call_deliveries(uuid, uuid)
  from public, anon, authenticated;

create or replace function private.seed_call_terminal_deliveries(
  p_call uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  perform 1
  from public.push_subscriptions subscription
  join public.call_deliveries initial
    on initial.account = subscription.account
   and initial.installation_id = subscription.installation_id
   and initial.call_id = p_call
   and initial.channel = 'push'
  where subscription.disabled_at is null
  order by subscription.id
  for update of subscription;

  -- A terminal push is only useful on an installation where an incoming push
  -- may already have escaped to the provider. `attempt_count > 0` includes an
  -- ambiguous provider timeout, which is exactly the race that needs cleanup.
  insert into public.call_deliveries (
    call_id, account, installation_id, channel, status,
    subscription_id, subscription_version
  )
  select
    initial.call_id,
    initial.account,
    initial.installation_id,
    'push_terminal',
    'queued',
    subscription.id,
    subscription.delivery_version
  from public.call_deliveries initial
  join public.call_terminal_outbox terminal
    on terminal.call_id = initial.call_id
  join public.call_sessions c on c.id = initial.call_id
  join public.push_subscriptions subscription
    on subscription.account = initial.account
   and subscription.installation_id = initial.installation_id
   and subscription.disabled_at is null
  where initial.call_id = p_call
    and initial.channel = 'push'
    -- Do not send a terminal-only notification after a proven permanent
    -- provider rejection. Include accepted/device-observed pushes and outcomes
    -- where the provider may still have delivered despite a timeout/5xx.
    and (
      initial.provider_accepted_at is not null
      or initial.received_at is not null
      or initial.presented_at is not null
      or initial.ringing_at is not null
      or initial.opened_at is not null
      or (
        initial.attempt_count > 0
        and (
          initial.status = 'dispatching'
          or initial.provider_status is null
          or initial.provider_status in (0, 408, 425, 429)
          or initial.provider_status >= 500
        )
      )
    )
    -- The accepting/declining installation has the app open and closes its
    -- own notification synchronously. Only its other installations should be
    -- told that the call was handled elsewhere.
    and not (
      terminal.terminal_status in ('accepted', 'declined')
      and c.callee_device is not null
      and (
        c.callee_device = initial.installation_id
        or left(c.callee_device, char_length(initial.installation_id) + 1)
          = initial.installation_id || '.'
      )
    )
  on conflict (call_id, account, installation_id, channel) do update
  set subscription_id = excluded.subscription_id,
      subscription_version = excluded.subscription_version,
      status = 'queued',
      attempt_count = 0,
      provider_status = null,
      last_error = null,
      attempt_token_hash = null,
      provider_accepted_at = null,
      failed_at = null,
      next_attempt_at = now(),
      updated_at = now()
  where call_deliveries.status in ('queued', 'failed', 'stale')
    and (
      call_deliveries.subscription_id is distinct from excluded.subscription_id
      or call_deliveries.subscription_version is distinct from excluded.subscription_version
    );
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function private.seed_call_terminal_deliveries(uuid)
  from public, anon, authenticated;

create or replace function private.call_delivery_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_installation text;
  v_answered_installation text;
begin
  if v_actor not in (new.caller, new.callee) then v_actor := null; end if;

  -- Signalling/Presence identifies a tab (`installation.uuid`), while push
  -- fanout identifies the stable installation. Resolve the longest registered
  -- prefix instead of ever persisting a tab id as another installation.
  if v_actor is not null then
    select installation.installation_id
    into v_actor_installation
    from public.account_installations installation
    where installation.account = v_actor
      and (
        (
          case when v_actor = new.caller
            then new.caller_device
            else new.callee_device
          end
        ) = installation.installation_id
        or left(
          case when v_actor = new.caller
            then new.caller_device
            else new.callee_device
          end,
          char_length(installation.installation_id) + 1
        ) = installation.installation_id || '.'
      )
    order by char_length(installation.installation_id) desc
    limit 1;
  end if;

  if tg_op = 'INSERT' then
    insert into public.call_events (call_id, actor, installation_id, event)
    values (new.id, new.caller, v_actor_installation, 'created');
    return new;
  end if;

  if new.status is not distinct from old.status then return new; end if;
  insert into public.call_events (
    call_id, actor, installation_id, event, details
  ) values (
    new.id,
    v_actor,
    v_actor_installation,
    case new.status
      when 'accepted' then 'accepted'
      when 'declined' then 'declined'
      when 'cancelled' then 'caller_cancelled'
      when 'ended' then 'ended'
      when 'missed' then 'missed'
      when 'failed' then 'failed'
      else 'state_changed'
    end,
    jsonb_build_object('status', new.status)
  );

  if new.status in ('accepted', 'declined', 'cancelled', 'ended', 'missed', 'failed') then
    -- First terminal transition wins. In particular, accepted -> ended must
    -- not generate a second OS notification after the incoming alert has
    -- already been replaced on every installation.
    insert into public.call_terminal_outbox (
      call_id, terminal_status, status, next_attempt_at, expires_at
    ) values (
      new.id,
      new.status,
      'pending',
      now(),
      case
        when new.status = 'missed' then now() + interval '24 hours'
        else now() + interval '60 seconds'
      end
    )
    on conflict (call_id) do nothing;

    perform private.seed_call_terminal_deliveries(new.id);
    update public.call_terminal_outbox terminal
    set status = 'sent',
        next_attempt_at = 'infinity'::timestamptz,
        locked_at = null,
        last_error = 'no_initial_push_attempt',
        updated_at = now()
    where terminal.call_id = new.id
      and terminal.status = 'pending'
      and not exists (
        select 1
        from public.call_deliveries delivery
        where delivery.call_id = new.id
          and delivery.channel = 'push_terminal'
      );
  end if;

  if new.status = 'accepted' then
    select installation.installation_id
    into v_answered_installation
    from public.account_installations installation
    where installation.account = new.callee
      and (
        new.callee_device = installation.installation_id
        or left(new.callee_device, char_length(installation.installation_id) + 1)
          = installation.installation_id || '.'
      )
    order by char_length(installation.installation_id) desc
    limit 1;

    update public.call_deliveries
    set status = 'answered_elsewhere', updated_at = now()
    where call_id = new.id
      and channel in ('realtime', 'push')
      and v_answered_installation is not null
      and installation_id <> v_answered_installation
      and status not in (
        'failed', 'stale', 'cancelled', 'answered_elsewhere'
      );
    update public.call_delivery_outbox
    set status = 'sent', locked_at = null, updated_at = now()
    where call_id = new.id;
  elsif new.status in ('declined', 'cancelled', 'ended', 'missed', 'failed') then
    update public.call_deliveries
    set status = 'cancelled', updated_at = now()
    where call_id = new.id
      and channel in ('realtime', 'push')
      and status not in (
        'failed', 'stale', 'cancelled', 'answered_elsewhere'
      );
    update public.call_delivery_outbox
    set status = 'cancelled', locked_at = null, updated_at = now()
    where call_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.call_delivery_lifecycle()
  from public, anon, authenticated;

drop trigger if exists call_delivery_lifecycle on public.call_sessions;
create trigger call_delivery_lifecycle
after insert or update of status on public.call_sessions
for each row execute function private.call_delivery_lifecycle();

-- A browser-generated request id lets a synchronous API response be retried
-- after an ambiguous network failure without creating a second call. Legacy
-- cached clients leave it NULL and keep the original start_call signature.
alter table public.call_sessions
  add column if not exists client_request_id uuid;

create unique index if not exists call_sessions_caller_request_uidx
  on public.call_sessions (caller, client_request_id)
  where client_request_id is not null;

-- One private implementation keeps relationship, lease, throttling and outbox
-- invariants identical for the legacy and reliable public RPCs.
create or replace function private.start_call_internal(
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
  v_me uuid := auth.uid();
  v_peer uuid;
  v_row public.call_sessions;
  v_first uuid;
  v_second uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('audio', 'video') then raise exception 'invalid call kind'; end if;
  if not private.call_device_valid(p_device) then raise exception 'invalid call device'; end if;

  if p_request_id is not null then
    -- Serialize retries before participant locks. A response-loss replay sees
    -- the committed row and never trips the busy/rate checks below.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'call-request:' || v_me::text || ':' || p_request_id::text,
        0
      )
    );
    select * into v_row
    from public.call_sessions call_session
    where call_session.caller = v_me
      and call_session.client_request_id = p_request_id
    for update;
    if v_row.id is not null then
      if v_row.conversation_id is distinct from p_conversation
         or v_row.kind is distinct from p_kind
         or v_row.caller_device is distinct from p_device then
        raise exception 'call request mismatch';
      end if;
      return v_row;
    end if;
  end if;

  if not private.chat_can_interact(p_conversation, v_me) then
    raise exception 'conversation is not active';
  end if;

  v_peer := private.chat_peer(p_conversation, v_me);
  if v_peer is null or (
    select count(*) from public.chat_members m
    where m.conversation_id = p_conversation
  ) <> 2 or not private.chat_can_interact(p_conversation, v_peer) then
    raise exception 'calls require a two-person conversation';
  end if;

  v_first := case when v_me::text < v_peer::text then v_me else v_peer end;
  v_second := case when v_me::text < v_peer::text then v_peer else v_me end;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('call-user:' || v_first::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('call-user:' || v_second::text, 0)
  );

  perform private.reap_stale_calls(v_me);
  perform private.reap_stale_calls(v_peer);

  if exists (
    select 1
    from public.call_sessions c
    where c.status in ('ringing', 'accepted')
      and (c.caller in (v_me, v_peer) or c.callee in (v_me, v_peer))
  ) then
    raise exception 'one of the participants is already in a call';
  end if;
  if exists (
    select 1
    from public.call_sessions c
    where c.caller = v_me
      and c.created_at > now() - interval '3 seconds'
  ) then
    raise exception 'please wait before calling again';
  end if;

  insert into public.call_sessions (
    conversation_id, caller, callee, caller_device, kind,
    caller_heartbeat_at, caller_lease_expires_at, client_request_id
  ) values (
    p_conversation, v_me, v_peer, p_device, p_kind,
    now(), now() + interval '120 seconds', p_request_id
  )
  returning * into v_row;

  insert into public.call_delivery_outbox (call_id, status, next_attempt_at)
  values (v_row.id, 'pending', now())
  on conflict (call_id) do nothing;
  perform private.seed_call_deliveries(v_row.id, v_peer);
  return v_row;
end;
$$;

revoke all on function private.start_call_internal(uuid, text, text, uuid)
  from public, anon, authenticated;

-- Cheap user-scoped admission check for the public Netlify endpoint. It keeps
-- invalid JWT traffic from enqueueing background workers; start_call_reliable
-- repeats every invariant transactionally and remains authoritative.
create or replace function public.preflight_call_start(p_conversation uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_me uuid := auth.uid();
  v_peer uuid;
begin
  if v_me is null or p_conversation is null then return false; end if;
  if not private.chat_can_interact(p_conversation, v_me) then return false; end if;
  v_peer := private.chat_peer(p_conversation, v_me);
  return v_peer is not null
    and (
      select count(*) from public.chat_members member
      where member.conversation_id = p_conversation
    ) = 2
    and private.chat_can_interact(p_conversation, v_peer);
end;
$$;

create or replace function public.start_call(
  p_conversation uuid,
  p_kind text,
  p_device text
)
returns public.call_sessions
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.start_call_internal(p_conversation, p_kind, p_device, null);
end;
$$;

create or replace function public.start_call_reliable(
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
begin
  if p_request_id is null then raise exception 'invalid call request'; end if;
  return private.start_call_internal(
    p_conversation,
    p_kind,
    p_device,
    p_request_id
  );
end;
$$;

-- Preserve first-answer-wins while recording which concrete callee device
-- declined. Terminal fanout can then skip the actor (its foreground page
-- already closes the notification) and notify only the other installations.
create or replace function public.respond_to_call(
  p_call uuid,
  p_accept boolean,
  p_device text
)
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
  if not private.call_device_valid(p_device) then
    raise exception 'invalid call device';
  end if;
  select * into v_row
  from public.call_sessions
  where id = p_call
  for update;
  if v_row.id is null or v_row.callee <> v_me then
    raise exception 'incoming call not found';
  end if;
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
    set status = 'declined',
        callee_device = p_device,
        callee_heartbeat_at = now(),
        callee_lease_expires_at = now() + interval '120 seconds',
        ended_at = now(),
        updated_at = now()
    where id = p_call returning * into v_row;
  end if;
  return v_row;
end;
$$;

create or replace function private.call_delivery_rank(p_status text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'queued' then 0
    when 'dispatching' then 1
    when 'provider_accepted' then 2
    when 'received' then 3
    when 'presented' then 4
    -- Opening a notification proves attention, but not that the foreground
    -- client actually managed to start its ringtone. Keep ringing as the
    -- strongest non-terminal delivery fact.
    when 'opened' then 5
    when 'ringing' then 6
    else 100
  end;
$$;

revoke all on function private.call_delivery_rank(text)
  from public, anon, authenticated;

create or replace function public.ack_call_delivery(
  p_call uuid,
  p_installation_id text,
  p_stage text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_call public.call_sessions;
  v_delivery public.call_deliveries;
  v_installation_found boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not private.call_installation_valid(p_installation_id) then
    raise exception 'invalid installation';
  end if;
  if p_stage not in ('received', 'presented', 'ringing', 'opened') then
    raise exception 'invalid delivery stage';
  end if;
  select * into v_call
  from public.call_sessions
  where id = p_call
  for update;
  if v_call.id is null or v_call.callee <> v_me then
    raise exception 'incoming call not found';
  end if;
  if v_call.status not in ('ringing', 'accepted')
     or (v_call.status = 'ringing' and v_call.expires_at <= v_now) then
    return false;
  end if;

  -- Reconciliation/revocation lock a subscription (when present), then this
  -- installation, then delivery rows. Realtime ACK has no subscription row,
  -- so it joins the same order at installation -> delivery.
  select true into v_installation_found
  from public.account_installations installation
  where installation.account = v_me
    and installation.installation_id = p_installation_id
    and installation.disabled_at is null
  for update;
  if not coalesce(v_installation_found, false) then
    raise exception 'installation is not registered';
  end if;

  insert into public.call_deliveries (
    call_id, account, installation_id, channel, status
  ) values (
    p_call, v_me, p_installation_id, 'realtime', 'queued'
  )
  on conflict (call_id, account, installation_id, channel) do nothing;

  select * into v_delivery
  from public.call_deliveries
  where call_id = p_call
    and account = v_me
    and installation_id = p_installation_id
    and channel = 'realtime'
  for update;
  if v_delivery.id is null
     or v_delivery.status in (
       'failed', 'stale', 'cancelled', 'answered_elsewhere'
     ) then
    return false;
  end if;
  if (p_stage = 'received' and v_delivery.received_at is not null)
     or (p_stage = 'presented' and v_delivery.presented_at is not null)
     or (p_stage = 'ringing' and v_delivery.ringing_at is not null)
     or (p_stage = 'opened' and v_delivery.opened_at is not null) then
    update public.account_installations
    set last_seen_at = v_now
    where account = v_me and installation_id = p_installation_id;
    return true;
  end if;

  update public.call_deliveries
  set status = case
        when private.call_delivery_rank(p_stage)
             > private.call_delivery_rank(status) then p_stage
        else status
      end,
      received_at = case
        when p_stage in ('received', 'presented', 'ringing', 'opened')
          then coalesce(received_at, v_now)
        else received_at
      end,
      presented_at = case
        when p_stage in ('presented', 'ringing', 'opened')
          then coalesce(presented_at, v_now)
        else presented_at
      end,
      ringing_at = case
        when p_stage = 'ringing'
          then coalesce(ringing_at, v_now)
        else ringing_at
      end,
      opened_at = case
        when p_stage = 'opened' then coalesce(opened_at, v_now)
        else opened_at
      end,
      updated_at = v_now
  where id = v_delivery.id;

  update public.account_installations
  set last_seen_at = v_now
  where account = v_me and installation_id = p_installation_id;

  insert into public.call_events (
    call_id, actor, installation_id, event, details
  ) values (
    p_call, v_me, p_installation_id, 'delivery_' || p_stage,
    jsonb_build_object('channel', 'realtime')
  );
  return true;
end;
$$;

create or replace function public.ack_call_delivery_with_token(
  p_delivery uuid,
  p_token text,
  p_stage text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.call_deliveries;
  v_call public.call_sessions;
  v_call_id uuid;
  v_subscription_id uuid;
  v_account uuid;
  v_installation_id text;
  v_recoverable_failure boolean := false;
  v_now timestamptz := clock_timestamp();
  v_token_hash bytea;
begin
  -- A service-role endpoint is the only grantee. The token is carried inside
  -- the encrypted Web Push payload and only its SHA-256 digest is persisted.
  if p_token is null or char_length(p_token) not between 36 and 160 then
    return false;
  end if;
  if p_stage not in ('received', 'presented', 'opened') then
    return false;
  end if;
  v_token_hash := extensions.digest(p_token, 'sha256');

  -- Read routing metadata without a lock, then acquire every mutable row in
  -- the shared order call -> subscription -> installation -> delivery. Every
  -- field/token is revalidated after the locks, so a concurrent rotation is
  -- harmless.
  select delivery.call_id, delivery.subscription_id,
         delivery.account, delivery.installation_id
  into v_call_id, v_subscription_id, v_account, v_installation_id
  from public.call_deliveries delivery
  where delivery.id = p_delivery;
  if v_call_id is null then return false; end if;
  select * into v_call
  from public.call_sessions
  where id = v_call_id
  for update;
  if v_call.id is null
     or v_call.status not in ('ringing', 'accepted')
     or (v_call.status = 'ringing' and v_call.expires_at <= v_now) then
    return false;
  end if;

  if v_subscription_id is not null then
    perform 1
    from public.push_subscriptions subscription
    where subscription.id = v_subscription_id
    for update;
  end if;
  perform 1
  from public.account_installations installation
  where installation.account = v_account
    and installation.installation_id = v_installation_id
  for update;

  select * into v_delivery
  from public.call_deliveries
  where id = p_delivery
  for update;
  if v_delivery.id is null
     or v_delivery.call_id <> v_call_id
     or v_delivery.channel <> 'push'
     or cardinality(v_delivery.ack_token_hashes) = 0
     or v_delivery.ack_token_expires_at <= v_now
     or pg_catalog.array_position(
       v_delivery.ack_token_hashes,
       v_token_hash
     ) is null then
    return false;
  end if;
  -- Possession of any unexpired ACK token proves that one encrypted attempt
  -- reached this worker. That proof outranks a later provider timeout, 400 or
  -- 410 from another attempt, even if the durable row is failed/stale.
  v_recoverable_failure := v_delivery.status in ('failed', 'stale');
  if v_delivery.status in ('cancelled', 'answered_elsewhere') then
    return false;
  end if;
  if (p_stage = 'received' and v_delivery.received_at is not null)
     or (p_stage = 'presented' and v_delivery.presented_at is not null)
     or (p_stage = 'opened' and v_delivery.opened_at is not null) then
    return true;
  end if;

  update public.call_deliveries
  set status = case
        when v_recoverable_failure then p_stage
        when private.call_delivery_rank(p_stage)
             > private.call_delivery_rank(status) then p_stage
        else status
      end,
      received_at = case
        when p_stage in ('received', 'presented', 'opened')
          then coalesce(received_at, v_now)
        else received_at
      end,
      presented_at = case
        when p_stage in ('presented', 'opened')
          then coalesce(presented_at, v_now)
        else presented_at
      end,
      opened_at = case
        when p_stage = 'opened' then coalesce(opened_at, v_now)
        else opened_at
      end,
      provider_accepted_at = coalesce(provider_accepted_at, v_now),
      failed_at = null,
      last_error = null,
      next_attempt_at = 'infinity'::timestamptz,
      updated_at = v_now
  where id = v_delivery.id;

  update public.account_installations
  set last_seen_at = v_now,
      last_verified_at = case
        when p_stage in ('presented', 'opened') then v_now
        else last_verified_at
      end
  where account = v_delivery.account
    and installation_id = v_delivery.installation_id;

  update public.call_sessions
  set push_sent_at = coalesce(push_sent_at, v_now),
      updated_at = v_now
  where id = v_delivery.call_id;

  update public.call_delivery_outbox outbox
  set status = case
        when exists (
          select 1 from public.call_deliveries pending
          where pending.call_id = v_delivery.call_id
            and pending.channel = 'push'
            and (
              pending.status in ('queued', 'dispatching')
              or (
                pending.status = 'failed'
                and pending.attempt_count < 4
                and pending.next_attempt_at <> 'infinity'::timestamptz
              )
            )
        ) then 'partial'
        else 'sent'
      end,
      next_attempt_at = coalesce((
        select min(pending.next_attempt_at)
        from public.call_deliveries pending
        where pending.call_id = v_delivery.call_id
          and pending.channel = 'push'
          and pending.status in ('queued', 'failed')
          and pending.next_attempt_at <> 'infinity'::timestamptz
      ), 'infinity'::timestamptz),
      locked_at = null,
      last_error = null,
      updated_at = v_now
  where outbox.call_id = v_delivery.call_id;

  insert into public.call_events (
    call_id, actor, installation_id, event, details
  ) values (
    v_delivery.call_id,
    v_delivery.account,
    v_delivery.installation_id,
    'delivery_' || p_stage,
    jsonb_build_object('channel', 'push')
  );
  return true;
end;
$$;

create or replace function public.claim_call_delivery_batch(
  p_call uuid default null,
  p_limit integer default 20
)
returns table (
  delivery_id uuid,
  call_id uuid,
  account uuid,
  installation_id text,
  channel text,
  subscription_id uuid,
  subscription_version bigint,
  attempt_token text,
  ack_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_attempt_token text;
  v_ack_token text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_call public.call_sessions;
begin
  -- Every dispatcher supplies a concrete call id (the recovery sweep first
  -- enumerates bounded outbox ids). Refuse an unsafe global claim rather than
  -- selecting delivery rows before their parent call can be locked.
  if p_call is null then return; end if;
  select * into v_call
  from public.call_sessions
  where id = p_call
  for update;
  if v_call.id is null
     or v_call.status <> 'ringing'
     or v_call.expires_at <= now()
     or v_call.caller_lease_expires_at <= now() then
    return;
  end if;
  perform private.seed_call_deliveries(v_call.id, v_call.callee);

  -- A crashed function must not strand a delivery forever.
  update public.call_deliveries delivery
  set status = 'queued',
      next_attempt_at = now(),
      updated_at = now()
  from public.call_sessions c
  where delivery.call_id = c.id
    and delivery.status = 'dispatching'
    and delivery.updated_at < now() - interval '20 seconds'
    and c.status = 'ringing'
    and c.expires_at > now()
    and (p_call is null or delivery.call_id = p_call);

  -- The subscription was locked by the first seed. If an expired dispatch
  -- lease used older key material, reseeding now resets attempts/ACK tokens
  -- before this same claim can select it again.
  perform private.seed_call_deliveries(v_call.id, v_call.callee);

  for v_candidate in
    select
      delivery.id,
      delivery.call_id,
      delivery.account,
      delivery.installation_id,
      delivery.channel,
      delivery.subscription_id,
      subscription.delivery_version,
      c.expires_at
    from public.call_deliveries delivery
    join public.call_sessions c on c.id = delivery.call_id
    join public.call_delivery_outbox outbox on outbox.call_id = c.id
    join public.push_subscriptions subscription
      on subscription.id = delivery.subscription_id
     and subscription.account = delivery.account
     and subscription.installation_id = delivery.installation_id
     and subscription.disabled_at is null
     and subscription.delivery_version = delivery.subscription_version
    where delivery.channel = 'push'
      and delivery.status in ('queued', 'failed')
      and delivery.attempt_count < 4
      and delivery.next_attempt_at <= now()
      and outbox.status in ('pending', 'partial', 'dispatching')
      and c.status = 'ringing'
      and c.expires_at > now()
      and c.caller_lease_expires_at > now()
      and (p_call is null or delivery.call_id = p_call)
    order by delivery.next_attempt_at, delivery.created_at
    for update of delivery skip locked
    limit v_limit
  loop
    v_attempt_token :=
      replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
    v_ack_token :=
      replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
    update public.call_deliveries
    set status = 'dispatching',
        attempt_count = attempt_count + 1,
        subscription_version = v_candidate.delivery_version,
        -- The attempt token is a short-lived CAS for this worker lease. ACK
        -- capabilities are independent and remain valid across later retries:
        -- an ambiguous provider timeout may still deliver the older push.
        attempt_token_hash = extensions.digest(v_attempt_token, 'sha256'),
        ack_token_hashes = ack_token_hashes
          || extensions.digest(v_ack_token, 'sha256'),
        ack_token_expires_at = least(
          v_candidate.expires_at + interval '30 seconds',
          now() + interval '120 seconds'
        ),
        updated_at = now()
    where id = v_candidate.id;

    update public.call_delivery_outbox
    set status = 'dispatching',
        attempt_count = attempt_count + 1,
        locked_at = now(),
        updated_at = now()
    where call_delivery_outbox.call_id = v_candidate.call_id;

    delivery_id := v_candidate.id;
    call_id := v_candidate.call_id;
    account := v_candidate.account;
    installation_id := v_candidate.installation_id;
    channel := v_candidate.channel;
    subscription_id := v_candidate.subscription_id;
    subscription_version := v_candidate.delivery_version;
    attempt_token := v_attempt_token;
    ack_token := v_ack_token;
    expires_at := v_candidate.expires_at;
    return next;
  end loop;

  -- A call with no reachable push installation is a durable, observable
  -- outcome—not an outbox item that remains pending forever. Foreground
  -- Realtime may still surface the call if the other app is open.
  with no_device_calls as (
    update public.call_delivery_outbox outbox
    set status = 'failed',
        next_attempt_at = 'infinity'::timestamptz,
        locked_at = null,
        last_error = 'no_push_devices',
        updated_at = now()
    where (p_call is null or outbox.call_id = p_call)
      and outbox.status in ('pending', 'partial', 'dispatching')
      and not exists (
        select 1
        from public.call_deliveries delivery
        where delivery.call_id = outbox.call_id
          and delivery.channel = 'push'
      )
    returning outbox.call_id
  )
  insert into public.call_events (
    call_id, actor, installation_id, event, details
  )
  select
    no_device_calls.call_id,
    null,
    null,
    'push_no_devices',
    jsonb_build_object('channel', 'push', 'reason', 'no_push_devices')
  from no_device_calls;
end;
$$;

drop function if exists public.record_call_delivery_result(
  uuid, text, boolean, integer, text, boolean, timestamptz
);
create or replace function public.record_call_delivery_result(
  p_delivery uuid,
  p_attempt_token text,
  p_subscription_version bigint,
  p_success boolean,
  p_status integer default null,
  p_error text default null,
  p_stale boolean default false,
  p_retry_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.call_deliveries;
  v_call_id uuid;
  v_subscription_id uuid;
  v_account uuid;
  v_installation_id text;
  v_current_subscription_version bigint;
  v_subscription_is_current boolean := false;
  v_call public.call_sessions;
  v_now timestamptz := clock_timestamp();
  v_retry_at timestamptz;
begin
  if p_attempt_token is null
     or char_length(p_attempt_token) not between 36 and 160 then
    return false;
  end if;
  if p_subscription_version is null or p_subscription_version < 1 then
    return false;
  end if;
  if p_status is not null and p_status not between 0 and 599 then
    raise exception 'invalid provider status';
  end if;
  if p_error is not null and char_length(p_error) > 240 then
    p_error := left(p_error, 240);
  end if;

  -- Routing metadata is revalidated after the canonical lock sequence.
  select delivery.call_id, delivery.subscription_id,
         delivery.account, delivery.installation_id
  into v_call_id, v_subscription_id, v_account, v_installation_id
  from public.call_deliveries delivery
  where delivery.id = p_delivery;
  if v_call_id is null then return false; end if;

  select * into v_call
  from public.call_sessions
  where id = v_call_id
  for update;
  if v_call.id is null then return false; end if;

  -- Reconciliation and provider results share this order after the call lock:
  -- subscription -> installation -> delivery -> outbox. The installation lock
  -- is required because subscription health updates run the prepare trigger.
  select subscription.delivery_version
  into v_current_subscription_version
  from public.push_subscriptions subscription
  where subscription.id = v_subscription_id
  for update;
  -- DELETE ... ON DELETE SET NULL can remove the claimed subscription before
  -- its provider result returns. Treat a missing row as an obsolete snapshot,
  -- never as SQL's unknown boolean (where `not null` would skip recovery).
  v_subscription_is_current := coalesce(
    v_current_subscription_version = p_subscription_version,
    false
  );

  perform 1
  from public.account_installations installation
  where installation.account = v_account
    and installation.installation_id = v_installation_id
  for update;

  select * into v_delivery
  from public.call_deliveries
  where id = p_delivery
  for update;
  if v_delivery.id is null
     or v_delivery.channel <> 'push'
     or v_delivery.subscription_version is distinct from p_subscription_version
     or v_delivery.attempt_token_hash is null
     or v_delivery.attempt_token_hash
        <> extensions.digest(p_attempt_token, 'sha256') then
    return false;
  end if;
  if v_delivery.status in ('stale', 'cancelled', 'answered_elsewhere') then
    return false;
  end if;
  -- A late failure must never overwrite proof that the provider/device already
  -- accepted or displayed the call. A recovered lease receives a fresh token,
  -- so the hash comparison above is also a CAS against an older worker.
  if not p_success and v_delivery.status in (
    'provider_accepted', 'received', 'presented', 'ringing', 'opened'
  ) then
    return false;
  end if;

  -- Any failure belongs to the claimed subscription snapshot. If its key
  -- material rotated while the provider request was in flight, retry the
  -- current version even when the old provider returned a permanent 400/403;
  -- only success is durable proof that the old push actually escaped.
  if not p_success and not v_subscription_is_current then
    p_stale := false;
    p_error := 'subscription_rotated';
    p_retry_at := v_now + interval '1 second';
  end if;

  if p_success then
    update public.call_deliveries
    set status = case
          when private.call_delivery_rank(status) < 2
            then 'provider_accepted'
          else status
        end,
        provider_status = p_status,
        last_error = null,
        provider_accepted_at = coalesce(provider_accepted_at, v_now),
        failed_at = null,
        next_attempt_at = 'infinity'::timestamptz,
        updated_at = v_now
    where id = p_delivery
      and attempt_token_hash = extensions.digest(p_attempt_token, 'sha256');
    update public.push_subscriptions
    set last_success_at = v_now,
        last_failure_at = null,
        failure_count = 0,
        disabled_at = null
    where id = v_delivery.subscription_id
      and delivery_version = p_subscription_version;
    update public.call_sessions
    set push_sent_at = coalesce(push_sent_at, v_now),
        updated_at = v_now
    where id = v_delivery.call_id;
    insert into public.call_events (
      call_id, installation_id, event, details
    ) values (
      v_delivery.call_id,
      v_delivery.installation_id,
      'push_provider_accepted',
      jsonb_build_object('status', p_status)
    );
  else
    v_retry_at := case
      when p_stale or v_delivery.attempt_count >= 4 then 'infinity'::timestamptz
      when p_retry_at is not null and p_retry_at > v_now
        then least(p_retry_at, v_now + interval '30 seconds')
      -- The dispatcher supplies p_retry_at only for transient outcomes.
      -- NULL therefore means a permanent provider rejection, not "guess a
      -- retry", otherwise 400/403 responses would be sent four times.
      else 'infinity'::timestamptz
    end;
    update public.call_deliveries
    set status = case when p_stale then 'stale' else 'failed' end,
        provider_status = p_status,
        last_error = nullif(left(coalesce(p_error, ''), 240), ''),
        failed_at = v_now,
        next_attempt_at = v_retry_at,
        updated_at = v_now
    where id = p_delivery
      and attempt_token_hash = extensions.digest(p_attempt_token, 'sha256');
    update public.push_subscriptions
    set last_failure_at = v_now,
        failure_count = least(failure_count + 1, 1000000),
        disabled_at = case when p_stale then v_now else disabled_at end
    where id = v_delivery.subscription_id
      and delivery_version = p_subscription_version;
    if p_stale then
      delete from public.push_subscriptions
      where id = v_delivery.subscription_id
        and delivery_version = p_subscription_version;
    end if;
    insert into public.call_events (
      call_id, installation_id, event, details
    ) values (
      v_delivery.call_id,
      v_delivery.installation_id,
      case when p_stale then 'push_subscription_stale' else 'push_failed' end,
      jsonb_build_object('status', p_status, 'retry', v_retry_at <> 'infinity'::timestamptz)
    );
  end if;

  update public.call_delivery_outbox outbox
  set status = case
        when exists (
          select 1 from public.call_deliveries delivery
          where delivery.call_id = v_delivery.call_id
            and delivery.channel = 'push'
            and delivery.status in (
              'provider_accepted', 'received', 'presented', 'ringing', 'opened'
            )
        ) and not exists (
          select 1 from public.call_deliveries delivery
          where delivery.call_id = v_delivery.call_id
            and delivery.channel = 'push'
            and (
              delivery.status in ('queued', 'dispatching')
              or (
                delivery.status = 'failed'
                and delivery.attempt_count < 4
                and delivery.next_attempt_at <> 'infinity'::timestamptz
              )
            )
        ) then 'sent'
        when exists (
          select 1 from public.call_deliveries delivery
          where delivery.call_id = v_delivery.call_id
            and delivery.channel = 'push'
            and delivery.status in (
              'provider_accepted', 'received', 'presented', 'ringing', 'opened'
            )
        ) then 'partial'
        when exists (
          select 1 from public.call_deliveries delivery
          where delivery.call_id = v_delivery.call_id
            and delivery.channel = 'push'
            and (
              delivery.status in ('queued', 'dispatching')
              or (
                delivery.status = 'failed'
                and delivery.attempt_count < 4
                and delivery.next_attempt_at <> 'infinity'::timestamptz
              )
            )
        ) then 'partial'
        else 'failed'
      end,
      next_attempt_at = coalesce((
        select min(delivery.next_attempt_at)
        from public.call_deliveries delivery
        where delivery.call_id = v_delivery.call_id
          and delivery.channel = 'push'
          and delivery.status in ('queued', 'failed')
      ), 'infinity'::timestamptz),
      locked_at = null,
      last_error = case
        when p_success then null
        else nullif(left(coalesce(p_error, ''), 240), '')
      end,
      updated_at = v_now
  where outbox.call_id = v_delivery.call_id;
  return true;
end;
$$;

create or replace function public.claim_call_terminal_delivery_batch(
  p_call uuid,
  p_limit integer default 20
)
returns table (
  delivery_id uuid,
  call_id uuid,
  account uuid,
  installation_id text,
  subscription_id uuid,
  subscription_version bigint,
  attempt_token text,
  terminal_event text,
  terminal_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_attempt_token text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_call public.call_sessions;
  v_terminal public.call_terminal_outbox;
begin
  select * into v_call
  from public.call_sessions
  where id = p_call
  for update;
  if v_call.id is null
     or v_call.status not in (
       'accepted', 'declined', 'cancelled', 'ended', 'missed', 'failed'
     ) then
    return;
  end if;

  select * into v_terminal
  from public.call_terminal_outbox
  where call_terminal_outbox.call_id = p_call;
  if v_terminal.call_id is null then return; end if;

  if v_terminal.expires_at <= now() then
    update public.call_deliveries delivery
    set status = 'cancelled',
        last_error = 'terminal_delivery_expired',
        next_attempt_at = 'infinity'::timestamptz,
        updated_at = now()
    where delivery.call_id = p_call
      and delivery.channel = 'push_terminal'
      and delivery.status in ('queued', 'dispatching', 'failed');
    update public.call_terminal_outbox terminal
    set status = 'failed',
        next_attempt_at = 'infinity'::timestamptz,
        locked_at = null,
        last_error = 'terminal_delivery_expired',
        updated_at = now()
    where terminal.call_id = p_call;
    return;
  end if;

  perform private.seed_call_terminal_deliveries(p_call);

  -- Provider calls are outside the SQL transaction. Recover only an expired
  -- lease and rotate its token so a late result cannot overwrite the retry.
  update public.call_deliveries delivery
  set status = 'queued',
      next_attempt_at = now(),
      updated_at = now()
  where delivery.call_id = p_call
    and delivery.channel = 'push_terminal'
    and delivery.status = 'dispatching'
    and delivery.updated_at < now() - interval '20 seconds';

  -- Same expired-lease rotation rule as invitation delivery.
  perform private.seed_call_terminal_deliveries(p_call);

  -- A subscription can disappear between the terminal transition and claim.
  update public.call_deliveries delivery
  set status = 'stale',
      last_error = 'subscription_missing',
      failed_at = coalesce(failed_at, now()),
      next_attempt_at = 'infinity'::timestamptz,
      updated_at = now()
  where delivery.call_id = p_call
    and delivery.channel = 'push_terminal'
    and delivery.status in ('queued', 'failed')
    and not exists (
      select 1
      from public.push_subscriptions subscription
      where subscription.id = delivery.subscription_id
        and subscription.account = delivery.account
        and subscription.installation_id = delivery.installation_id
        and subscription.disabled_at is null
    );

  for v_candidate in
    select
      delivery.id,
      delivery.call_id,
      delivery.account,
      delivery.installation_id,
      delivery.subscription_id,
      subscription.delivery_version,
      terminal.terminal_status,
      terminal.expires_at,
      c.callee_device
    from public.call_deliveries delivery
    join public.call_terminal_outbox terminal
      on terminal.call_id = delivery.call_id
    join public.call_sessions c on c.id = delivery.call_id
    join public.push_subscriptions subscription
      on subscription.id = delivery.subscription_id
     and subscription.account = delivery.account
     and subscription.installation_id = delivery.installation_id
     and subscription.disabled_at is null
     and subscription.delivery_version = delivery.subscription_version
    where delivery.call_id = p_call
      and delivery.channel = 'push_terminal'
      and delivery.status in ('queued', 'failed')
      and delivery.attempt_count < 4
      and delivery.next_attempt_at <= now()
      and terminal.status in ('pending', 'partial', 'dispatching')
    order by delivery.next_attempt_at, delivery.created_at
    for update of delivery skip locked
    limit v_limit
  loop
    v_attempt_token :=
      replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
    update public.call_deliveries
    set status = 'dispatching',
        attempt_count = attempt_count + 1,
        subscription_version = v_candidate.delivery_version,
        attempt_token_hash = extensions.digest(v_attempt_token, 'sha256'),
        updated_at = now()
    where id = v_candidate.id;

    update public.call_terminal_outbox
    set status = 'dispatching',
        attempt_count = attempt_count + 1,
        locked_at = now(),
        updated_at = now()
    where call_terminal_outbox.call_id = v_candidate.call_id;

    delivery_id := v_candidate.id;
    call_id := v_candidate.call_id;
    account := v_candidate.account;
    installation_id := v_candidate.installation_id;
    subscription_id := v_candidate.subscription_id;
    subscription_version := v_candidate.delivery_version;
    attempt_token := v_attempt_token;
    terminal_event := case v_candidate.terminal_status
      when 'accepted' then case
        when v_candidate.callee_device = v_candidate.installation_id
          or left(
            v_candidate.callee_device,
            char_length(v_candidate.installation_id) + 1
          ) = v_candidate.installation_id || '.'
          then 'answered_here'
        else 'answered_elsewhere'
      end
      else v_candidate.terminal_status
    end;
    terminal_expires_at := v_candidate.expires_at;
    return next;
  end loop;

  update public.call_terminal_outbox terminal
  set status = case
        when not exists (
          select 1 from public.call_deliveries delivery
          where delivery.call_id = p_call
            and delivery.channel = 'push_terminal'
        ) then 'sent'
        when not exists (
          select 1 from public.call_deliveries delivery
          where delivery.call_id = p_call
            and delivery.channel = 'push_terminal'
            and (
              delivery.status in ('queued', 'dispatching')
              or (
                delivery.status = 'failed'
                and delivery.attempt_count < 4
                and delivery.next_attempt_at <> 'infinity'::timestamptz
              )
            )
        ) and exists (
          select 1 from public.call_deliveries delivery
          where delivery.call_id = p_call
            and delivery.channel = 'push_terminal'
            and delivery.status = 'provider_accepted'
        ) then 'sent'
        when not exists (
          select 1 from public.call_deliveries delivery
          where delivery.call_id = p_call
            and delivery.channel = 'push_terminal'
            and (
              delivery.status in ('queued', 'dispatching')
              or (
                delivery.status = 'failed'
                and delivery.attempt_count < 4
                and delivery.next_attempt_at <> 'infinity'::timestamptz
              )
            )
        ) then 'failed'
        else terminal.status
      end,
      next_attempt_at = case
        when not exists (
          select 1 from public.call_deliveries delivery
          where delivery.call_id = p_call
            and delivery.channel = 'push_terminal'
            and (
              delivery.status in ('queued', 'dispatching')
              or (
                delivery.status = 'failed'
                and delivery.attempt_count < 4
                and delivery.next_attempt_at <> 'infinity'::timestamptz
              )
            )
        ) then 'infinity'::timestamptz
        else terminal.next_attempt_at
      end,
      locked_at = case
        when terminal.status = 'dispatching' then terminal.locked_at
        else null
      end,
      updated_at = now()
  where terminal.call_id = p_call;
end;
$$;

drop function if exists public.record_call_terminal_delivery_result(
  uuid, text, boolean, integer, text, boolean, timestamptz
);
create or replace function public.record_call_terminal_delivery_result(
  p_delivery uuid,
  p_attempt_token text,
  p_subscription_version bigint,
  p_success boolean,
  p_status integer default null,
  p_error text default null,
  p_stale boolean default false,
  p_retry_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.call_deliveries;
  v_call_id uuid;
  v_subscription_id uuid;
  v_account uuid;
  v_installation_id text;
  v_current_subscription_version bigint;
  v_subscription_is_current boolean := false;
  v_call public.call_sessions;
  v_terminal public.call_terminal_outbox;
  v_now timestamptz := clock_timestamp();
  v_retry_at timestamptz;
begin
  if p_attempt_token is null
     or char_length(p_attempt_token) not between 36 and 160 then
    return false;
  end if;
  if p_subscription_version is null or p_subscription_version < 1 then
    return false;
  end if;
  if p_status is not null and p_status not between 0 and 599 then
    raise exception 'invalid provider status';
  end if;
  if p_error is not null and char_length(p_error) > 240 then
    p_error := left(p_error, 240);
  end if;

  select delivery.call_id, delivery.subscription_id,
         delivery.account, delivery.installation_id
  into v_call_id, v_subscription_id, v_account, v_installation_id
  from public.call_deliveries delivery
  where delivery.id = p_delivery;
  if v_call_id is null then return false; end if;

  -- Same canonical order as invitation results and subscription rotation:
  -- call -> subscription -> installation -> delivery -> terminal outbox.
  select * into v_call
  from public.call_sessions
  where id = v_call_id
  for update;
  if v_call.id is null then return false; end if;

  select subscription.delivery_version
  into v_current_subscription_version
  from public.push_subscriptions subscription
  where subscription.id = v_subscription_id
  for update;
  -- The invitation RPC has the same deleted-subscription race. A missing row
  -- is an obsolete snapshot so a replacement on the installation can retry.
  v_subscription_is_current := coalesce(
    v_current_subscription_version = p_subscription_version,
    false
  );

  perform 1
  from public.account_installations installation
  where installation.account = v_account
    and installation.installation_id = v_installation_id
  for update;

  select * into v_delivery
  from public.call_deliveries
  where id = p_delivery
  for update;
  if v_delivery.id is null
     or v_delivery.channel <> 'push_terminal'
     or v_delivery.subscription_version is distinct from p_subscription_version
     or v_delivery.attempt_token_hash is null
     or v_delivery.attempt_token_hash
        <> extensions.digest(p_attempt_token, 'sha256')
      or v_delivery.status in (
        'provider_accepted', 'stale', 'cancelled', 'answered_elsewhere'
      ) then
    return false;
  end if;

  select * into v_terminal
  from public.call_terminal_outbox terminal
  where terminal.call_id = v_delivery.call_id
  for update;
  if v_terminal.call_id is null then return false; end if;
  if v_terminal.expires_at <= v_now
     or (
       v_terminal.status = 'failed'
       and v_terminal.last_error = 'terminal_delivery_expired'
     ) then
    update public.call_deliveries
    set status = 'cancelled',
        last_error = 'terminal_delivery_expired',
        next_attempt_at = 'infinity'::timestamptz,
        updated_at = v_now
    where id = p_delivery
      and attempt_token_hash = extensions.digest(p_attempt_token, 'sha256');
    update public.call_terminal_outbox
    set status = 'failed',
        next_attempt_at = 'infinity'::timestamptz,
        locked_at = null,
        last_error = 'terminal_delivery_expired',
        updated_at = v_now
    where call_id = v_delivery.call_id;
    return false;
  end if;

  if not p_success and not v_subscription_is_current then
    p_stale := false;
    p_error := 'subscription_rotated';
    p_retry_at := v_now + interval '1 second';
  end if;

  if p_success then
    update public.call_deliveries
    set status = 'provider_accepted',
        provider_status = p_status,
        last_error = null,
        provider_accepted_at = coalesce(provider_accepted_at, v_now),
        failed_at = null,
        next_attempt_at = 'infinity'::timestamptz,
        updated_at = v_now
    where id = p_delivery
      and attempt_token_hash = extensions.digest(p_attempt_token, 'sha256');
    update public.push_subscriptions
    set last_success_at = v_now,
        last_failure_at = null,
        failure_count = 0,
        disabled_at = null
    where id = v_delivery.subscription_id
      and delivery_version = p_subscription_version;
    insert into public.call_events (
      call_id, installation_id, event, details
    ) values (
      v_delivery.call_id,
      v_delivery.installation_id,
      'terminal_push_accepted',
      jsonb_build_object('status', p_status)
    );
  else
    v_retry_at := case
      when p_stale or v_delivery.attempt_count >= 4 then 'infinity'::timestamptz
      when p_retry_at is not null and p_retry_at > v_now
        then least(
          p_retry_at,
          v_now + interval '30 seconds',
          v_terminal.expires_at
        )
      else 'infinity'::timestamptz
    end;
    update public.call_deliveries
    set status = case when p_stale then 'stale' else 'failed' end,
        provider_status = p_status,
        last_error = nullif(left(coalesce(p_error, ''), 240), ''),
        failed_at = v_now,
        next_attempt_at = v_retry_at,
        updated_at = v_now
    where id = p_delivery
      and attempt_token_hash = extensions.digest(p_attempt_token, 'sha256');
    update public.push_subscriptions
    set last_failure_at = v_now,
        failure_count = least(failure_count + 1, 1000000),
        disabled_at = case when p_stale then v_now else disabled_at end
    where id = v_delivery.subscription_id
      and delivery_version = p_subscription_version;
    if p_stale then
      delete from public.push_subscriptions
      where id = v_delivery.subscription_id
        and delivery_version = p_subscription_version;
    end if;
    insert into public.call_events (
      call_id, installation_id, event, details
    ) values (
      v_delivery.call_id,
      v_delivery.installation_id,
      case when p_stale
        then 'terminal_push_stale'
        else 'terminal_push_failed'
      end,
      jsonb_build_object(
        'status', p_status,
        'retry', v_retry_at <> 'infinity'::timestamptz
      )
    );
  end if;

  update public.call_terminal_outbox terminal
  set status = case
        when exists (
          select 1 from public.call_deliveries delivery
          where delivery.call_id = v_delivery.call_id
            and delivery.channel = 'push_terminal'
            and delivery.status = 'provider_accepted'
        ) and not exists (
          select 1 from public.call_deliveries delivery
          where delivery.call_id = v_delivery.call_id
            and delivery.channel = 'push_terminal'
            and (
              delivery.status in ('queued', 'dispatching')
              or (
                delivery.status = 'failed'
                and delivery.attempt_count < 4
                and delivery.next_attempt_at <> 'infinity'::timestamptz
              )
            )
        ) then 'sent'
        when exists (
          select 1 from public.call_deliveries delivery
          where delivery.call_id = v_delivery.call_id
            and delivery.channel = 'push_terminal'
            and delivery.status = 'provider_accepted'
        ) then 'partial'
        when exists (
          select 1 from public.call_deliveries delivery
          where delivery.call_id = v_delivery.call_id
            and delivery.channel = 'push_terminal'
            and (
              delivery.status in ('queued', 'dispatching')
              or (
                delivery.status = 'failed'
                and delivery.attempt_count < 4
                and delivery.next_attempt_at <> 'infinity'::timestamptz
              )
            )
        ) then 'partial'
        else 'failed'
      end,
      next_attempt_at = coalesce((
        select min(delivery.next_attempt_at)
        from public.call_deliveries delivery
        where delivery.call_id = v_delivery.call_id
          and delivery.channel = 'push_terminal'
          and delivery.status in ('queued', 'failed')
      ), 'infinity'::timestamptz),
      locked_at = null,
      last_error = case
        when p_success then null
        else nullif(left(coalesce(p_error, ''), 240), '')
      end,
      updated_at = v_now
  where terminal.call_id = v_delivery.call_id;
  return true;
end;
$$;

-- Service-only objective expiry used by the already-authenticated background
-- dispatcher. It cannot end a live call early and exposes no participant data.
create or replace function public.expire_call_for_delivery(p_call uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_call public.call_sessions;
begin
  select * into v_call
  from public.call_sessions
  where id = p_call
  for update;
  if v_call.id is null then return null; end if;
  if v_call.status = 'ringing'
     and (
       v_call.expires_at <= now()
       or v_call.caller_lease_expires_at <= now()
     ) then
    update public.call_sessions
    set status = case
          when expires_at <= now() then 'missed'
          else 'failed'
        end,
        ended_at = coalesce(ended_at, now()),
        updated_at = now()
    where id = p_call
    returning * into v_call;
  end if;
  return v_call.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Least-privilege grants and Realtime publication
-- ---------------------------------------------------------------------------

drop policy if exists push_subs_couple_select on public.push_subscriptions;
drop policy if exists push_subs_reachable_select on public.push_subscriptions;
drop policy if exists push_subs_own on public.push_subscriptions;
create policy push_subs_own on public.push_subscriptions
for all to authenticated
using (account = (select auth.uid()))
with check (account = (select auth.uid()));

revoke all on public.account_installations from public, anon, authenticated;
grant select on public.account_installations to authenticated;

revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant insert (
  endpoint, account, p256dh, auth, ua
) on public.push_subscriptions to authenticated;
grant update (
  account, p256dh, auth, ua
) on public.push_subscriptions to authenticated;

-- The existing `chat_members_update_own` RLS policy restricts writes to the
-- authenticated member's own row. These column grants expose preferences
-- without granting broad UPDATE access or another member's private values.
grant update (
  pinned_at, muted_until, archived_at
) on public.chat_members to authenticated;

revoke all on public.call_delivery_outbox from public, anon, authenticated;
revoke all on public.call_terminal_outbox from public, anon, authenticated;
revoke all on public.call_deliveries from public, anon, authenticated;
revoke all on public.call_events from public, anon, authenticated;
-- Participants only need the observable projection. Dispatch leases, provider
-- diagnostics, subscription ids and ACK-token hashes remain service-only.
grant select (
  id, call_id, account, installation_id, channel, status,
  provider_accepted_at, received_at, presented_at, ringing_at, opened_at,
  created_at, updated_at
) on public.call_deliveries to authenticated;
grant select on public.call_events to authenticated;

grant select, insert, update, delete on public.account_installations to service_role;
grant select, insert, update, delete on public.push_subscriptions to service_role;
grant select, insert, update, delete on public.call_delivery_outbox to service_role;
grant select, insert, update, delete on public.call_terminal_outbox to service_role;
grant select, insert, update, delete on public.call_deliveries to service_role;
grant select, insert on public.call_events to service_role;

revoke all on function public.upsert_account_installation(text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.heartbeat_account_installation(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.reconcile_push_installation(
  text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.push_installation_is_bound(text, text)
  from public, anon, authenticated;
revoke all on function public.revoke_push_installation(text, text)
  from public, anon, authenticated;
revoke all on function public.chat_push_target(uuid)
  from public, anon, authenticated;
revoke all on function public.ack_call_delivery(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.ack_call_delivery_with_token(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.claim_call_delivery_batch(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.record_call_delivery_result(
  uuid, text, bigint, boolean, integer, text, boolean, timestamptz
) from public, anon, authenticated;
revoke all on function public.claim_call_terminal_delivery_batch(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.record_call_terminal_delivery_result(
  uuid, text, bigint, boolean, integer, text, boolean, timestamptz
) from public, anon, authenticated;
revoke all on function public.expire_call_for_delivery(uuid)
  from public, anon, authenticated;
revoke all on function public.start_call(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.preflight_call_start(uuid)
  from public, anon, authenticated;
revoke all on function public.start_call_reliable(uuid, text, text, uuid)
  from public, anon, authenticated;

grant execute on function public.upsert_account_installation(text, text, jsonb)
  to authenticated;
grant execute on function public.heartbeat_account_installation(text, jsonb)
  to authenticated;
grant execute on function public.reconcile_push_installation(
  text, text, text, text, text, text, jsonb
) to authenticated;
grant execute on function public.push_installation_is_bound(text, text)
  to authenticated;
grant execute on function public.revoke_push_installation(text, text)
  to authenticated;
grant execute on function public.chat_push_target(uuid)
  to authenticated;
grant execute on function public.ack_call_delivery(uuid, text, text)
  to authenticated;
grant execute on function public.start_call(uuid, text, text)
  to authenticated;
grant execute on function public.preflight_call_start(uuid)
  to authenticated;
grant execute on function public.start_call_reliable(uuid, text, text, uuid)
  to authenticated;

grant execute on function public.ack_call_delivery_with_token(uuid, text, text)
  to service_role;
grant execute on function public.claim_call_delivery_batch(uuid, integer)
  to service_role;
grant execute on function public.record_call_delivery_result(
  uuid, text, bigint, boolean, integer, text, boolean, timestamptz
) to service_role;
grant execute on function public.claim_call_terminal_delivery_batch(uuid, integer)
  to service_role;
grant execute on function public.record_call_terminal_delivery_result(
  uuid, text, bigint, boolean, integer, text, boolean, timestamptz
) to service_role;
grant execute on function public.expire_call_for_delivery(uuid)
  to service_role;

alter table public.call_events replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_events'
  ) then
    alter publication supabase_realtime
      add table public.call_events;
  end if;
end
$$;

comment on table public.account_installations is
  'Per-account browser/PWA installations and their call capabilities.';
comment on table public.call_delivery_outbox is
  'Durable retry state for notifying devices about a call.';
comment on table public.call_terminal_outbox is
  'Durable retry state for replacing stale incoming-call notifications.';
comment on table public.call_deliveries is
  'Per-installation delivery lifecycle; no SDP, ICE or media is stored.';
comment on table public.call_events is
  'Append-only observable call lifecycle without signalling or media payloads.';
