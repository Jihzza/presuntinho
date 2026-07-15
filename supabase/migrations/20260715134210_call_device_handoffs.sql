-- Explicit, durable handoff of an accepted 1:1 call between installations of
-- the same account. The call row keeps its id/conversation/history; only the
-- participant's device lease moves. SDP, ICE candidates and IP addresses stay
-- exclusively in the private Realtime call topic and are never stored here.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter table public.call_sessions
  add column if not exists handoff_generation bigint not null default 0;

alter table public.call_sessions
  drop constraint if exists call_sessions_handoff_generation_check;
alter table public.call_sessions
  add constraint call_sessions_handoff_generation_check
    check (handoff_generation between 0 and 9223372036854775807);

create table if not exists public.call_handoffs (
  id                     uuid primary key default gen_random_uuid(),
  call_id                uuid not null references public.call_sessions(id) on delete cascade,
  account                uuid not null references public.accounts(id) on delete cascade,
  from_device            text not null,
  from_installation_id   text not null,
  target_installation_id text not null,
  claimed_device         text,
  status                 text not null default 'requested',
  client_request_id      uuid not null,
  source_generation      bigint not null,
  claimed_generation     bigint,
  state_version          bigint not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  expires_at             timestamptz not null default (now() + interval '35 seconds'),
  recovery_expires_at    timestamptz,
  claim_device_lease_expires_at timestamptz,
  claimed_at             timestamptz,
  completed_at           timestamptz,
  cancelled_at           timestamptz,
  constraint call_handoffs_status_check
    check (status in ('requested', 'claimed', 'completed', 'cancelled', 'declined', 'expired', 'reverted', 'terminated')),
  constraint call_handoffs_devices_differ
    check (from_installation_id <> target_installation_id),
  constraint call_handoffs_from_device_format
    check (from_device ~ '^[A-Za-z0-9._:-]{16,160}$'),
  constraint call_handoffs_from_installation_format
    check (from_installation_id ~ '^[A-Za-z0-9._:-]{16,160}$'),
  constraint call_handoffs_target_installation_format
    check (target_installation_id ~ '^[A-Za-z0-9._:-]{16,160}$'),
  constraint call_handoffs_claimed_device_format
    check (claimed_device is null or claimed_device ~ '^[A-Za-z0-9._:-]{16,160}$'),
  constraint call_handoffs_expiry_order check (expires_at > created_at),
  constraint call_handoffs_generation_order check (
    source_generation >= 0
    and state_version >= 0
    and (claimed_generation is null or claimed_generation > source_generation)
  ),
  constraint call_handoffs_claim_shape check (
    (status = 'requested' and claimed_device is null and claimed_at is null
      and claimed_generation is null and recovery_expires_at is null
      and claim_device_lease_expires_at is null)
    or
    (status in ('claimed', 'completed', 'reverted', 'terminated')
      and claimed_device is not null and claimed_at is not null
      and claimed_generation is not null and recovery_expires_at is not null
      and claim_device_lease_expires_at is not null)
    or
    (status in ('cancelled', 'declined', 'expired')
      and claimed_device is null and claimed_at is null
      and claimed_generation is null and recovery_expires_at is null
      and claim_device_lease_expires_at is null)
  ),
  constraint call_handoffs_completion_shape check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint call_handoffs_cancellation_shape check (
    (status in ('cancelled', 'declined', 'expired', 'reverted', 'terminated') and cancelled_at is not null)
    or (status not in ('cancelled', 'declined', 'expired', 'reverted', 'terminated') and cancelled_at is null)
  ),
  constraint call_handoffs_recovery_order check (
    recovery_expires_at is null
    or (
      claimed_at is not null
      and claim_device_lease_expires_at > claimed_at
      and recovery_expires_at > claim_device_lease_expires_at
    )
  ),
  constraint call_handoffs_request_unique unique (account, client_request_id),
  constraint call_handoffs_from_installation_fk
    foreign key (account, from_installation_id)
    references public.account_installations(account, installation_id),
  constraint call_handoffs_target_installation_fk
    foreign key (account, target_installation_id)
    references public.account_installations(account, installation_id)
);

-- The recovery bearer never appears in the exposed handoff row. Cache Storage
-- keeps it installation-local; only this SHA-256 digest is persisted server-side.
create table if not exists private.call_handoff_recovery_tokens (
  handoff_id uuid primary key references public.call_handoffs(id) on delete cascade,
  target_installation_id text not null,
  token_hash bytea not null check (octet_length(token_hash) = 32),
  created_at timestamptz not null default now()
);
revoke all on table private.call_handoff_recovery_tokens from public, anon, authenticated;

-- `handoff_generation` belongs to the call, not to a participant. Serializing
-- one open transfer per call prevents caller/callee claims invalidating each
-- other's completion and recovery generations.
drop index if exists public.call_handoffs_one_open_per_participant;
create unique index if not exists call_handoffs_one_open_per_call
  on public.call_handoffs (call_id)
  where status in ('requested', 'claimed');
create index if not exists call_handoffs_target_pending_idx
  on public.call_handoffs (account, target_installation_id, expires_at)
  where status = 'requested';
create index if not exists call_handoffs_call_history_idx
  on public.call_handoffs (call_id, created_at, id);
create index if not exists call_handoffs_target_recovery_idx
  on public.call_handoffs (
    account, target_installation_id, claim_device_lease_expires_at, recovery_expires_at
  ) where status = 'claimed';
create index if not exists call_handoffs_source_recovery_idx
  on public.call_handoffs (account, from_device, recovery_expires_at)
  where status = 'claimed';

alter table public.call_handoffs enable row level security;
revoke all on table public.call_handoffs from public, anon, authenticated;
grant select on table public.call_handoffs to authenticated;

drop policy if exists call_handoffs_own_participant_select on public.call_handoffs;
create policy call_handoffs_own_participant_select on public.call_handoffs
for select to authenticated
using (
  account = (select auth.uid())
  and exists (
    select 1
    from public.call_sessions call_session
    where call_session.id = call_handoffs.call_id
      and (select auth.uid()) in (call_session.caller, call_session.callee)
  )
);

-- Resolve a tab-scoped call device back to its stable browser installation.
-- Literal prefix comparison is deliberate: '_' and '%' are data, not LIKE
-- wildcards. Longest match protects installations whose ids share a prefix.
create or replace function private.call_device_installation(
  p_account uuid,
  p_device text
)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select installation.installation_id
  from public.account_installations installation
  where installation.account = p_account
    and installation.disabled_at is null
    and (
      p_device = installation.installation_id
      or left(p_device, char_length(installation.installation_id) + 1)
        = installation.installation_id || '.'
    )
  order by char_length(installation.installation_id) desc
  limit 1;
$$;

revoke all on function private.call_device_installation(uuid, text)
  from public, anon, authenticated;

-- Called by the same-origin call-ice endpoint with the user's JWT. It grants a
-- not-yet-authoritative target just enough permission to preflight TURN for one
-- live handoff. A random device on the account cannot satisfy these predicates.
create or replace function public.authorize_call_handoff_ice(
  p_call uuid,
  p_handoff uuid,
  p_device text,
  p_recovery_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_call public.call_sessions;
  v_row public.call_handoffs;
  v_target public.account_installations;
  v_token private.call_handoff_recovery_tokens;
  v_target_installation text;
begin
  if v_me is null or p_recovery_id is null or not private.call_device_valid(p_device) then return false; end if;
  -- Same lock order as claim/end/abort: call -> handoff -> installation.
  -- This prevents a terminal trigger from racing a stale preflight token insert.
  select * into v_call from public.call_sessions where id = p_call for update;
  select * into v_row
  from public.call_handoffs
  where id = p_handoff and call_id = p_call and account = v_me
  for update;
  if v_call.id is null or v_row.id is null or v_me not in (v_call.caller, v_call.callee) then
    return false;
  end if;
  if v_call.status <> 'accepted'
     or v_call.caller_lease_expires_at <= clock_timestamp()
     or v_call.callee_lease_expires_at is null
     or v_call.callee_lease_expires_at <= clock_timestamp() then
    return false;
  end if;
  v_target_installation := private.call_device_installation(v_me, p_device);
  if v_target_installation is distinct from v_row.target_installation_id then return false; end if;
  select * into v_target
  from public.account_installations
  where account = v_me and installation_id = v_target_installation
  for update;
  if v_target.installation_id is null
     or v_target.disabled_at is not null
     or v_target.last_seen_at <= clock_timestamp() - interval '90 seconds'
     or not (v_target.capabilities @> '{"realtime":true,"call_handoff":true}'::jsonb)
     or (v_call.kind = 'video' and not (v_target.capabilities @> '{"video_calls":true}'::jsonb)) then
    return false;
  end if;
  if v_row.status = 'requested' then
    if v_row.expires_at <= clock_timestamp()
       or v_row.source_generation <> v_call.handoff_generation
       or not (
         (v_me = v_call.caller and v_call.caller_device = v_row.from_device)
         or (v_me = v_call.callee and v_call.callee_device = v_row.from_device)
       ) then
      return false;
    end if;
    -- The first strictly-authorized target preflight binds the installation
    -- bearer before TURN credentials are issued. Only its digest is stored;
    -- later preflights/claims must prove the exact same UUID.
    insert into private.call_handoff_recovery_tokens (
      handoff_id, target_installation_id, token_hash
    ) values (
      v_row.id,
      v_row.target_installation_id,
      extensions.digest(p_recovery_id::text, 'sha256')
    ) on conflict (handoff_id) do nothing;
    select * into v_token
    from private.call_handoff_recovery_tokens
    where handoff_id = v_row.id;
    return v_token.handoff_id is not null
      and v_token.target_installation_id = v_row.target_installation_id
      and v_token.token_hash = extensions.digest(p_recovery_id::text, 'sha256');
  end if;
  if v_row.status <> 'claimed'
     or p_recovery_id is null
     or v_row.claim_device_lease_expires_at > clock_timestamp()
     or v_row.recovery_expires_at <= clock_timestamp()
     or v_row.claimed_generation <> v_call.handoff_generation
     or (
       (v_me = v_call.caller and v_call.caller_device <> v_row.claimed_device)
       or (v_me = v_call.callee and v_call.callee_device <> v_row.claimed_device)
     ) then
    return false;
  end if;
  select * into v_token from private.call_handoff_recovery_tokens where handoff_id = v_row.id;
  return v_token.handoff_id is not null
    and v_token.target_installation_id = v_row.target_installation_id
    and v_token.token_hash = extensions.digest(p_recovery_id::text, 'sha256');
end;
$$;

create or replace function public.list_call_handoff_targets(
  p_call uuid,
  p_device text
)
returns table (
  installation_id text,
  platform text,
  last_seen_at timestamptz,
  supports_video boolean
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_me uuid := auth.uid();
  v_call public.call_sessions;
  v_source_installation text;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not private.call_device_valid(p_device) then raise exception 'invalid call device'; end if;

  select * into v_call
  from public.call_sessions call_session
  where call_session.id = p_call;
  if v_call.id is null or v_me not in (v_call.caller, v_call.callee) then
    raise exception 'call not found';
  end if;
  if v_call.status <> 'accepted'
     or v_call.caller_lease_expires_at <= clock_timestamp()
     or v_call.callee_lease_expires_at is null
     or v_call.callee_lease_expires_at <= clock_timestamp() then
    raise exception 'call is not active';
  end if;
  if (v_me = v_call.caller and v_call.caller_device <> p_device)
     or (v_me = v_call.callee and v_call.callee_device <> p_device) then
    raise exception 'call claimed by another device';
  end if;

  v_source_installation := private.call_device_installation(v_me, p_device);
  if v_source_installation is null then
    raise exception 'source installation is not registered';
  end if;

  return query
  select installation.installation_id,
         installation.platform,
         installation.last_seen_at,
         installation.capabilities @> '{"video_calls":true}'::jsonb
  from public.account_installations installation
  where installation.account = v_me
    and installation.installation_id <> v_source_installation
    and installation.disabled_at is null
    and installation.last_seen_at > clock_timestamp() - interval '90 seconds'
    and installation.capabilities @> '{"realtime":true,"call_handoff":true}'::jsonb
    and (
      v_call.kind = 'audio'
      or installation.capabilities @> '{"video_calls":true}'::jsonb
    )
  order by installation.last_seen_at desc, installation.installation_id;
end;
$$;

create or replace function public.request_call_handoff(
  p_call uuid,
  p_device text,
  p_target_installation_id text,
  p_request_id uuid
)
returns public.call_handoffs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_call public.call_sessions;
  v_row public.call_handoffs;
  v_source_installation text;
  v_target public.account_installations;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_request_id is null then raise exception 'invalid handoff request'; end if;
  if not private.call_device_valid(p_device)
     or not private.call_installation_valid(p_target_installation_id) then
    raise exception 'invalid handoff device';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'call-handoff-request:' || v_me::text || ':' || p_request_id::text,
      0
    )
  );
  select * into v_row
  from public.call_handoffs handoff
  where handoff.account = v_me
    and handoff.client_request_id = p_request_id
  for update;
  if v_row.id is not null then
    if v_row.call_id is distinct from p_call
       or v_row.from_device is distinct from p_device
       or v_row.target_installation_id is distinct from p_target_installation_id then
      raise exception 'handoff request mismatch';
    end if;
    return v_row;
  end if;

  select * into v_call
  from public.call_sessions call_session
  where call_session.id = p_call
  for update;
  if v_call.id is null or v_me not in (v_call.caller, v_call.callee) then
    raise exception 'call not found';
  end if;
  if v_call.status <> 'accepted'
     or v_call.caller_lease_expires_at <= clock_timestamp()
     or v_call.callee_lease_expires_at is null
     or v_call.callee_lease_expires_at <= clock_timestamp() then
    raise exception 'call is not active';
  end if;
  if (v_me = v_call.caller and v_call.caller_device <> p_device)
     or (v_me = v_call.callee and v_call.callee_device <> p_device) then
    raise exception 'call claimed by another device';
  end if;

  v_source_installation := private.call_device_installation(v_me, p_device);
  if v_source_installation is null then
    raise exception 'source installation is not registered';
  end if;
  if v_source_installation = p_target_installation_id then
    raise exception 'handoff target is this installation';
  end if;

  select * into v_target
  from public.account_installations installation
  where installation.account = v_me
    and installation.installation_id = p_target_installation_id
  for update;
  if v_target.installation_id is null
     or v_target.disabled_at is not null
     or v_target.last_seen_at <= clock_timestamp() - interval '90 seconds'
     or not (v_target.capabilities @> '{"realtime":true,"call_handoff":true}'::jsonb)
     or (v_call.kind = 'video' and not (v_target.capabilities @> '{"video_calls":true}'::jsonb)) then
    raise exception 'handoff target is not active';
  end if;

  -- Expired, never-claimed requests cannot block a fresh explicit attempt.
  update public.call_handoffs handoff
  set status = 'expired',
      cancelled_at = clock_timestamp(),
      updated_at = clock_timestamp(),
      state_version = state_version + 1
  where handoff.call_id = p_call
    and handoff.status = 'requested'
    and handoff.expires_at <= clock_timestamp();
  delete from private.call_handoff_recovery_tokens token
  using public.call_handoffs handoff
  where token.handoff_id = handoff.id
    and handoff.call_id = p_call
    and handoff.status = 'expired';

  if exists (
    select 1 from public.call_handoffs handoff
    where handoff.call_id = p_call
      and handoff.status in ('requested', 'claimed')
  ) then
    raise exception 'handoff already pending';
  end if;

  insert into public.call_handoffs (
    call_id, account, from_device, from_installation_id,
    target_installation_id, client_request_id, source_generation
  ) values (
    p_call, v_me, p_device, v_source_installation,
    p_target_installation_id, p_request_id, v_call.handoff_generation
  ) returning * into v_row;

  insert into public.call_events (
    call_id, actor, installation_id, event, details
  ) values (
    p_call, v_me, null, 'handoff_requested',
    jsonb_build_object(
      'handoffId', v_row.id,
      'generation', v_call.handoff_generation
    )
  );
  return v_row;
end;
$$;

-- The target acquires media before invoking this RPC. This transaction is the
-- ownership boundary: row locks + status predicate make the first target tab
-- win, move exactly one participant lease, and preserve the shared call id.
drop function if exists public.claim_call_handoff(uuid, text);
create or replace function public.claim_call_handoff(
  p_handoff uuid,
  p_device text,
  p_recovery_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_call_id uuid;
  v_call public.call_sessions;
  v_row public.call_handoffs;
  v_target public.account_installations;
  v_token private.call_handoff_recovery_tokens;
  v_target_installation text;
  v_now timestamptz := clock_timestamp();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_recovery_id is null then raise exception 'invalid handoff recovery'; end if;
  if not private.call_device_valid(p_device) then raise exception 'invalid call device'; end if;

  select handoff.call_id into v_call_id
  from public.call_handoffs handoff
  where handoff.id = p_handoff
    and handoff.account = v_me;
  if v_call_id is null then raise exception 'handoff not found'; end if;

  -- Every mutating path locks call -> handoff -> installation in this order.
  select * into v_call
  from public.call_sessions call_session
  where call_session.id = v_call_id
  for update;
  select * into v_row
  from public.call_handoffs handoff
  where handoff.id = p_handoff
    and handoff.account = v_me
  for update;
  if v_row.id is null or v_me not in (v_call.caller, v_call.callee) then
    raise exception 'handoff not found';
  end if;
  if v_row.status = 'completed' then
    if v_row.claimed_device = p_device then
      return jsonb_build_object(
        'ok', true,
        'handoffId', v_row.id,
        'call', to_jsonb(v_call)
      );
    end if;
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;
  if v_row.status = 'claimed' then
    select * into v_token
    from private.call_handoff_recovery_tokens
    where handoff_id = v_row.id;
    if v_token.handoff_id is null
       or v_token.target_installation_id <> v_row.target_installation_id
       or v_token.token_hash <> extensions.digest(p_recovery_id::text, 'sha256') then
      return jsonb_build_object('ok', false, 'reason', 'already_claimed');
    end if;
    if v_row.claimed_device = p_device then
      return jsonb_build_object(
        'ok', true,
        'handoffId', v_row.id,
        'call', to_jsonb(v_call)
      );
    end if;
    -- A new tab suffix may recover only after the first target's short claim
    -- lease elapsed, with the installation bearer and the same live generation.
    if v_row.claim_device_lease_expires_at > v_now
       or v_row.recovery_expires_at <= v_now
       or v_row.claimed_generation <> v_call.handoff_generation
       or v_call.status <> 'accepted'
       or v_call.caller_lease_expires_at <= v_now
       or v_call.callee_lease_expires_at is null
       or v_call.callee_lease_expires_at <= v_now
       or (
         (v_me = v_call.caller and v_call.caller_device <> v_row.claimed_device)
         or (v_me = v_call.callee and v_call.callee_device <> v_row.claimed_device)
       ) then
      return jsonb_build_object('ok', false, 'reason', 'recovery_not_available');
    end if;
    v_target_installation := private.call_device_installation(v_me, p_device);
    if v_target_installation is distinct from v_row.target_installation_id then
      return jsonb_build_object('ok', false, 'reason', 'already_claimed');
    end if;
    select * into v_target
    from public.account_installations installation
    where installation.account = v_me
      and installation.installation_id = v_row.target_installation_id
    for update;
    if v_target.installation_id is null
       or v_target.disabled_at is not null
       or v_target.last_seen_at <= v_now - interval '90 seconds'
       or not (v_target.capabilities @> '{"realtime":true,"call_handoff":true}'::jsonb)
       or (v_call.kind = 'video' and not (v_target.capabilities @> '{"video_calls":true}'::jsonb)) then
      return jsonb_build_object('ok', false, 'reason', 'recovery_not_available');
    end if;
    if v_me = v_call.caller then
      update public.call_sessions
      set caller_device = p_device,
          caller_heartbeat_at = v_now,
          caller_lease_expires_at = v_now + interval '70 seconds',
          handoff_generation = handoff_generation + 1,
          updated_at = v_now
      where id = v_call.id returning * into v_call;
    else
      update public.call_sessions
      set callee_device = p_device,
          callee_heartbeat_at = v_now,
          callee_lease_expires_at = v_now + interval '70 seconds',
          handoff_generation = handoff_generation + 1,
          updated_at = v_now
      where id = v_call.id returning * into v_call;
    end if;
    update public.call_handoffs
    set claimed_device = p_device,
        claimed_generation = v_call.handoff_generation,
        claim_device_lease_expires_at = v_now + interval '12 seconds',
        updated_at = v_now,
        state_version = state_version + 1
    where id = v_row.id returning * into v_row;
    insert into public.call_events (call_id, actor, installation_id, event, details)
    values (
      v_call.id, v_me, null, 'handoff_recovered',
      jsonb_build_object('handoffId', v_row.id, 'generation', v_call.handoff_generation)
    );
    return jsonb_build_object('ok', true, 'handoffId', v_row.id, 'call', to_jsonb(v_call));
  end if;
  if v_row.status <> 'requested' then
    return jsonb_build_object('ok', false, 'reason', v_row.status);
  end if;
  if v_row.expires_at <= v_now then
    update public.call_handoffs
    set status = 'expired',
        cancelled_at = v_now,
        updated_at = v_now,
        state_version = state_version + 1
    where id = v_row.id
    returning * into v_row;
    delete from private.call_handoff_recovery_tokens where handoff_id = v_row.id;
    insert into public.call_events (
      call_id, actor, installation_id, event, details
    ) values (
      v_call.id, v_me, null, 'handoff_expired',
      jsonb_build_object('handoffId', v_row.id)
    );
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select * into v_target
  from public.account_installations installation
  where installation.account = v_me
    and installation.installation_id = v_row.target_installation_id
  for update;
  if v_target.installation_id is null
     or v_target.disabled_at is not null
     or v_target.last_seen_at <= clock_timestamp() - interval '90 seconds'
     or not (v_target.capabilities @> '{"realtime":true,"call_handoff":true}'::jsonb)
     or not (
       p_device = v_target.installation_id
       or left(p_device, char_length(v_target.installation_id) + 1)
         = v_target.installation_id || '.'
     ) then
    raise exception 'handoff target device is not active';
  end if;
  if v_call.status <> 'accepted'
     or v_call.handoff_generation <> v_row.source_generation
     or v_call.caller_lease_expires_at <= v_now
     or v_call.callee_lease_expires_at is null
     or v_call.callee_lease_expires_at <= v_now then
    raise exception 'call is not active';
  end if;
  if (v_me = v_call.caller and v_call.caller_device <> v_row.from_device)
     or (v_me = v_call.callee and v_call.callee_device <> v_row.from_device) then
    return jsonb_build_object('ok', false, 'reason', 'source_changed');
  end if;

  -- Direct API clients may reach claim without an ICE preflight. Bind once if
  -- absent, then verify before moving the participant lease. A preflight-bound
  -- different bearer can never be replaced by claim.
  insert into private.call_handoff_recovery_tokens (
    handoff_id, target_installation_id, token_hash
  ) values (
    v_row.id, v_row.target_installation_id, extensions.digest(p_recovery_id::text, 'sha256')
  ) on conflict (handoff_id) do nothing;
  select * into v_token
  from private.call_handoff_recovery_tokens
  where handoff_id = v_row.id;
  if v_token.handoff_id is null
     or v_token.target_installation_id <> v_row.target_installation_id
     or v_token.token_hash <> extensions.digest(p_recovery_id::text, 'sha256') then
    return jsonb_build_object('ok', false, 'reason', 'recovery_mismatch');
  end if;

  if v_me = v_call.caller then
    update public.call_sessions
    set caller_device = p_device,
        caller_heartbeat_at = v_now,
        caller_lease_expires_at = v_now + interval '70 seconds',
        handoff_generation = handoff_generation + 1,
        updated_at = v_now
    where id = v_call.id
    returning * into v_call;
  else
    update public.call_sessions
    set callee_device = p_device,
        callee_heartbeat_at = v_now,
        callee_lease_expires_at = v_now + interval '70 seconds',
        handoff_generation = handoff_generation + 1,
        updated_at = v_now
    where id = v_call.id
    returning * into v_call;
  end if;

  update public.call_handoffs
  set status = 'claimed',
      claimed_device = p_device,
      claimed_at = v_now,
      claimed_generation = v_call.handoff_generation,
      recovery_expires_at = v_now + interval '45 seconds',
      claim_device_lease_expires_at = v_now + interval '12 seconds',
      updated_at = v_now,
      state_version = state_version + 1
  where id = v_row.id
    and status = 'requested'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'handoff claim race';
  end if;

  insert into public.call_events (
    call_id, actor, installation_id, event, details
  ) values (
    v_call.id, v_me, null, 'handoff_claimed',
    jsonb_build_object(
      'handoffId', v_row.id,
      'generation', v_call.handoff_generation
    )
  );
  return jsonb_build_object(
    'ok', true,
    'handoffId', v_row.id,
    'call', to_jsonb(v_call)
  );
end;
$$;

create or replace function public.complete_call_handoff(
  p_handoff uuid,
  p_device text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_call_id uuid;
  v_call public.call_sessions;
  v_row public.call_handoffs;
  v_now timestamptz := clock_timestamp();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not private.call_device_valid(p_device) then raise exception 'invalid call device'; end if;
  select handoff.call_id into v_call_id
  from public.call_handoffs handoff
  where handoff.id = p_handoff and handoff.account = v_me;
  if v_call_id is null then return false; end if;
  select * into v_call from public.call_sessions where id = v_call_id for update;
  select * into v_row
  from public.call_handoffs
  where id = p_handoff and account = v_me
  for update;
  if v_row.status = 'completed' and v_row.claimed_device = p_device then return true; end if;
  if v_row.status <> 'claimed'
     or v_row.claimed_device <> p_device
     or v_row.claimed_generation <> v_call.handoff_generation
     or v_call.status <> 'accepted'
     or v_call.caller_lease_expires_at <= v_now
     or v_call.callee_lease_expires_at is null
     or v_call.callee_lease_expires_at <= v_now
     or (
       v_me = v_call.caller and v_call.caller_device <> p_device
     ) or (
       v_me = v_call.callee and v_call.callee_device <> p_device
     ) then
    return false;
  end if;
  update public.call_handoffs
  set status = 'completed',
      completed_at = v_now,
      updated_at = v_now,
      state_version = state_version + 1
  where id = v_row.id;
  delete from private.call_handoff_recovery_tokens where handoff_id = v_row.id;
  insert into public.call_events (
    call_id, actor, installation_id, event, details
  ) values (
    v_call.id, v_me, null, 'handoff_completed',
    jsonb_build_object('handoffId', v_row.id, 'generation', v_call.handoff_generation)
  );
  return true;
end;
$$;

create or replace function public.cancel_call_handoff(
  p_handoff uuid,
  p_device text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_call_id uuid;
  v_call public.call_sessions;
  v_row public.call_handoffs;
  v_device_installation text;
  v_next_status text;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not private.call_device_valid(p_device) then raise exception 'invalid call device'; end if;
  select handoff.call_id into v_call_id
  from public.call_handoffs handoff
  where handoff.id = p_handoff and handoff.account = v_me;
  if v_call_id is null then return false; end if;
  select * into v_call from public.call_sessions where id = v_call_id for update;
  select * into v_row
  from public.call_handoffs
  where id = p_handoff and account = v_me
  for update;
  if v_row.status <> 'requested' or v_me not in (v_call.caller, v_call.callee) then
    return false;
  end if;
  v_device_installation := private.call_device_installation(v_me, p_device);
  if p_device = v_row.from_device then
    v_next_status := case when v_row.expires_at <= clock_timestamp() then 'expired' else 'cancelled' end;
  elsif v_device_installation = v_row.target_installation_id then
    v_next_status := case when v_row.expires_at <= clock_timestamp() then 'expired' else 'declined' end;
  else
    return false;
  end if;
  update public.call_handoffs
  set status = v_next_status,
      cancelled_at = clock_timestamp(),
      updated_at = clock_timestamp(),
      state_version = state_version + 1
  where id = v_row.id;
  delete from private.call_handoff_recovery_tokens where handoff_id = v_row.id;
  insert into public.call_events (
    call_id, actor, installation_id, event, details
  ) values (
    v_call.id,
    v_me,
    null,
    case v_next_status
      when 'declined' then 'handoff_declined'
      when 'expired' then 'handoff_expired'
      else 'handoff_cancelled'
    end,
    jsonb_build_object('handoffId', v_row.id)
  );
  return true;
end;
$$;

-- A target that cannot finish setup rolls ownership back while the source is
-- still registered. The private bearer prevents another target tab/account
-- from manufacturing an abort.
create or replace function public.abort_call_handoff(
  p_handoff uuid,
  p_device text,
  p_recovery_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_call_id uuid;
  v_call public.call_sessions;
  v_row public.call_handoffs;
  v_token private.call_handoff_recovery_tokens;
  v_source public.account_installations;
  v_now timestamptz := clock_timestamp();
begin
  if v_me is null or p_recovery_id is null or not private.call_device_valid(p_device) then return false; end if;
  select call_id into v_call_id from public.call_handoffs where id = p_handoff and account = v_me;
  if v_call_id is null then return false; end if;
  select * into v_call from public.call_sessions where id = v_call_id for update;
  select * into v_row from public.call_handoffs where id = p_handoff and account = v_me for update;
  if v_row.status <> 'claimed'
     or v_row.claimed_device <> p_device
     or v_row.claimed_generation <> v_call.handoff_generation
     or v_row.recovery_expires_at <= v_now
     or v_call.status <> 'accepted'
     or (v_me = v_call.caller and (
       v_call.callee_lease_expires_at is null or v_call.callee_lease_expires_at <= v_now
     ))
     or (v_me = v_call.callee and v_call.caller_lease_expires_at <= v_now)
     or (
       (v_me = v_call.caller and v_call.caller_device <> p_device)
       or (v_me = v_call.callee and v_call.callee_device <> p_device)
     ) then
    return false;
  end if;
  select * into v_token from private.call_handoff_recovery_tokens where handoff_id = v_row.id;
  if v_token.handoff_id is null
     or v_token.target_installation_id <> v_row.target_installation_id
     or v_token.token_hash <> extensions.digest(p_recovery_id::text, 'sha256') then
    return false;
  end if;
  select * into v_source
  from public.account_installations
  where account = v_me and installation_id = v_row.from_installation_id
  for update;
  if v_source.installation_id is null
     or v_source.disabled_at is not null
     or v_source.last_seen_at <= v_now - interval '90 seconds' then
    return false;
  end if;
  if v_me = v_call.caller then
    update public.call_sessions
    set caller_device = v_row.from_device,
        caller_heartbeat_at = v_now,
        caller_lease_expires_at = v_now + interval '30 seconds',
        handoff_generation = handoff_generation + 1,
        updated_at = v_now
    where id = v_call.id returning * into v_call;
  else
    update public.call_sessions
    set callee_device = v_row.from_device,
        callee_heartbeat_at = v_now,
        callee_lease_expires_at = v_now + interval '30 seconds',
        handoff_generation = handoff_generation + 1,
        updated_at = v_now
    where id = v_call.id returning * into v_call;
  end if;
  update public.call_handoffs
  set status = 'reverted',
      cancelled_at = v_now,
      updated_at = v_now,
      state_version = state_version + 1
  where id = v_row.id;
  delete from private.call_handoff_recovery_tokens where handoff_id = v_row.id;
  insert into public.call_events (call_id, actor, installation_id, event, details)
  values (
    v_call.id, v_me, null, 'handoff_reverted',
    jsonb_build_object('handoffId', v_row.id, 'generation', v_call.handoff_generation, 'reason', 'target_abort')
  );
  return true;
end;
$$;

-- If the target never completes and its short call lease is genuinely stale,
-- the still-registered source can recover after the bearer grace. A live target
-- heartbeat blocks rollback even when its completion ACK was transiently lost.
create or replace function public.recover_call_handoff_source(
  p_handoff uuid,
  p_device text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_call_id uuid;
  v_call public.call_sessions;
  v_row public.call_handoffs;
  v_source public.account_installations;
  v_now timestamptz := clock_timestamp();
begin
  if v_me is null or not private.call_device_valid(p_device) then return false; end if;
  select call_id into v_call_id from public.call_handoffs where id = p_handoff and account = v_me;
  if v_call_id is null then return false; end if;
  select * into v_call from public.call_sessions where id = v_call_id for update;
  select * into v_row from public.call_handoffs where id = p_handoff and account = v_me for update;
  if v_row.status <> 'claimed'
     or v_row.from_device <> p_device
     or v_row.claimed_generation <> v_call.handoff_generation
     or v_row.recovery_expires_at > v_now
     or v_call.status <> 'accepted'
     or (
       v_me = v_call.caller and (
         v_call.caller_device <> v_row.claimed_device
         or v_call.caller_lease_expires_at > v_now
         or v_call.callee_lease_expires_at is null
         or v_call.callee_lease_expires_at <= v_now
       )
     ) or (
       v_me = v_call.callee and (
         v_call.callee_device <> v_row.claimed_device
         or v_call.callee_lease_expires_at is null
         or v_call.callee_lease_expires_at > v_now
         or v_call.caller_lease_expires_at <= v_now
       )
     ) then
    return false;
  end if;
  select * into v_source
  from public.account_installations
  where account = v_me and installation_id = v_row.from_installation_id
  for update;
  if v_source.installation_id is null
     or v_source.disabled_at is not null
     or v_source.last_seen_at <= v_now - interval '90 seconds' then
    return false;
  end if;
  if v_me = v_call.caller then
    update public.call_sessions
    set caller_device = p_device,
        caller_heartbeat_at = v_now,
        caller_lease_expires_at = v_now + interval '30 seconds',
        handoff_generation = handoff_generation + 1,
        updated_at = v_now
    where id = v_call.id returning * into v_call;
  else
    update public.call_sessions
    set callee_device = p_device,
        callee_heartbeat_at = v_now,
        callee_lease_expires_at = v_now + interval '30 seconds',
        handoff_generation = handoff_generation + 1,
        updated_at = v_now
    where id = v_call.id returning * into v_call;
  end if;
  update public.call_handoffs
  set status = 'reverted',
      cancelled_at = v_now,
      updated_at = v_now,
      state_version = state_version + 1
  where id = v_row.id;
  delete from private.call_handoff_recovery_tokens where handoff_id = v_row.id;
  insert into public.call_events (call_id, actor, installation_id, event, details)
  values (
    v_call.id, v_me, null, 'handoff_reverted',
    jsonb_build_object('handoffId', v_row.id, 'generation', v_call.handoff_generation, 'reason', 'target_lease_expired')
  );
  return true;
end;
$$;

-- Preserve the user's explicit hang-up intent across a concurrent handoff
-- claim. The former source device remains authorized only for that claimed row
-- and only inside its bounded recovery grace.
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
  v_source_handoff boolean := false;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not private.call_device_valid(p_device) then raise exception 'invalid call device'; end if;
  select * into v_row from public.call_sessions where id = p_call for update;
  if v_row.id is null or v_me not in (v_row.caller, v_row.callee) then
    raise exception 'call not found';
  end if;
  if v_row.status in ('declined', 'cancelled', 'ended', 'missed', 'failed') then return v_row; end if;

  if v_row.status = 'accepted' then
    select exists (
      select 1
      from public.call_handoffs handoff
      where handoff.call_id = p_call
        and handoff.account = v_me
        and handoff.status in ('claimed', 'completed')
        and handoff.from_device = p_device
        and (
          (
            handoff.status = 'claimed'
            and handoff.claimed_generation = v_row.handoff_generation
            -- A sibling may recover near the end of the 45s bearer grace and
            -- receive a fresh 70s call lease. Keep explicit source hang-up
            -- authoritative through that maximum unresolved interval + jitter.
            and greatest(
              handoff.recovery_expires_at,
              handoff.claimed_at + interval '130 seconds'
            ) > clock_timestamp()
          )
          or (
            handoff.status = 'completed'
            -- Complete/explicit-hangup can cross in flight. The old source gets
            -- only a short post-ACK window, not an open-ended second owner.
            and handoff.completed_at + interval '5 seconds' > clock_timestamp()
            and (
              (v_me = v_row.caller and v_row.caller_device = handoff.claimed_device)
              or (v_me = v_row.callee and v_row.callee_device = handoff.claimed_device)
            )
            and not exists (
              select 1
              from public.call_handoffs later
              where later.call_id = handoff.call_id
                and later.account = handoff.account
                and (
                  later.created_at > handoff.created_at
                  or (later.created_at = handoff.created_at and later.id > handoff.id)
                )
            )
          )
        )
    ) into v_source_handoff;
  end if;
  if v_me = v_row.caller and v_row.caller_device <> p_device and not v_source_handoff then
    raise exception 'call claimed by another device';
  end if;
  if v_me = v_row.callee and (
    v_row.status <> 'accepted'
    or (v_row.callee_device <> p_device and not v_source_handoff)
  ) then
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

-- A call can end from either participant while a transfer is visible. Close
-- both requested and claimed rows in the same transaction as the terminal call
-- update so another device never keeps a live recovery bearer for a dead call.
create or replace function private.cancel_open_call_handoffs_on_terminal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handoff public.call_handoffs;
begin
  if old.status = 'accepted' and new.status <> 'accepted' then
    for v_handoff in
      update public.call_handoffs handoff
      set status = case when handoff.status = 'claimed' then 'terminated' else 'cancelled' end,
          cancelled_at = clock_timestamp(),
          updated_at = clock_timestamp(),
          state_version = state_version + 1
      where handoff.call_id = new.id
        and handoff.status in ('requested', 'claimed')
      returning handoff.*
    loop
      delete from private.call_handoff_recovery_tokens where handoff_id = v_handoff.id;
      insert into public.call_events (
        call_id, actor, installation_id, event, details
      ) values (
        new.id,
        null,
        null,
        case when v_handoff.status = 'terminated' then 'handoff_terminated' else 'handoff_cancelled' end,
        jsonb_build_object(
          'handoffId', v_handoff.id,
          'reason', 'call_terminal',
          'callStatus', new.status
        )
      );
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.cancel_open_call_handoffs_on_terminal()
  from public, anon, authenticated;

drop trigger if exists call_sessions_cancel_open_handoffs on public.call_sessions;
create trigger call_sessions_cancel_open_handoffs
after update of status on public.call_sessions
for each row execute function private.cancel_open_call_handoffs_on_terminal();

revoke all on function public.list_call_handoff_targets(uuid, text)
  from public, anon, authenticated;
revoke all on function public.request_call_handoff(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.authorize_call_handoff_ice(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.claim_call_handoff(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_call_handoff(uuid, text)
  from public, anon, authenticated;
revoke all on function public.cancel_call_handoff(uuid, text)
  from public, anon, authenticated;
revoke all on function public.abort_call_handoff(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.recover_call_handoff_source(uuid, text)
  from public, anon, authenticated;
revoke all on function public.end_call(uuid, text)
  from public, anon, authenticated;
grant execute on function public.list_call_handoff_targets(uuid, text) to authenticated;
grant execute on function public.request_call_handoff(uuid, text, text, uuid) to authenticated;
grant execute on function public.authorize_call_handoff_ice(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.claim_call_handoff(uuid, text, uuid) to authenticated;
grant execute on function public.complete_call_handoff(uuid, text) to authenticated;
grant execute on function public.cancel_call_handoff(uuid, text) to authenticated;
grant execute on function public.abort_call_handoff(uuid, text, uuid) to authenticated;
grant execute on function public.recover_call_handoff_source(uuid, text) to authenticated;
grant execute on function public.end_call(uuid, text) to authenticated;

-- Postgres Changes is only a wake-up signal. Every client still validates the
-- authenticated row and re-reads the authoritative call before claiming.
do $publication$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'call_handoffs'
     ) then
    alter publication supabase_realtime add table public.call_handoffs;
  end if;
end
$publication$;

comment on table public.call_handoffs is
  'Durable, account-scoped ownership transfer for an accepted call; never stores SDP or ICE.';
