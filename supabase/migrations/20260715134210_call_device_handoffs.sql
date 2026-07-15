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
  created_at             timestamptz not null default now(),
  expires_at             timestamptz not null default (now() + interval '35 seconds'),
  claimed_at             timestamptz,
  completed_at           timestamptz,
  cancelled_at           timestamptz,
  constraint call_handoffs_status_check
    check (status in ('requested', 'claimed', 'completed', 'cancelled', 'declined', 'expired')),
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
  constraint call_handoffs_claim_shape check (
    (status = 'requested' and claimed_device is null and claimed_at is null)
    or
    (status in ('claimed', 'completed') and claimed_device is not null and claimed_at is not null)
    or
    (status in ('cancelled', 'declined', 'expired') and claimed_device is null and claimed_at is null)
  ),
  constraint call_handoffs_completion_shape check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint call_handoffs_cancellation_shape check (
    (status in ('cancelled', 'declined', 'expired') and cancelled_at is not null)
    or (status not in ('cancelled', 'declined', 'expired') and cancelled_at is null)
  ),
  constraint call_handoffs_request_unique unique (account, client_request_id),
  constraint call_handoffs_from_installation_fk
    foreign key (account, from_installation_id)
    references public.account_installations(account, installation_id),
  constraint call_handoffs_target_installation_fk
    foreign key (account, target_installation_id)
    references public.account_installations(account, installation_id)
);

create unique index if not exists call_handoffs_one_open_per_participant
  on public.call_handoffs (call_id, account)
  where status in ('requested', 'claimed');
create index if not exists call_handoffs_target_pending_idx
  on public.call_handoffs (account, target_installation_id, expires_at)
  where status = 'requested';
create index if not exists call_handoffs_call_history_idx
  on public.call_handoffs (call_id, created_at, id);

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
  v_recovered_handoff uuid;
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

  -- A target can crash after the atomic ownership move but before its
  -- best-effort completion ACK. If this device is still the authoritative call
  -- owner, a later explicit transfer safely closes that old audit row without
  -- reverting ownership or waiting forever on the partial unique index.
  update public.call_handoffs handoff
  set status = 'completed', completed_at = clock_timestamp()
  where handoff.call_id = p_call
    and handoff.account = v_me
    and handoff.status = 'claimed'
    and handoff.claimed_device = p_device
  returning handoff.id into v_recovered_handoff;
  if v_recovered_handoff is not null then
    insert into public.call_events (
      call_id, actor, installation_id, event, details
    ) values (
      p_call, v_me, v_source_installation, 'handoff_recovered',
      jsonb_build_object(
        'handoffId', v_recovered_handoff,
        'generation', v_call.handoff_generation
      )
    );
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
  set status = 'expired', cancelled_at = clock_timestamp()
  where handoff.call_id = p_call
    and handoff.account = v_me
    and handoff.status = 'requested'
    and handoff.expires_at <= clock_timestamp();

  if exists (
    select 1 from public.call_handoffs handoff
    where handoff.call_id = p_call
      and handoff.account = v_me
      and handoff.status in ('requested', 'claimed')
  ) then
    raise exception 'handoff already pending';
  end if;

  insert into public.call_handoffs (
    call_id, account, from_device, from_installation_id,
    target_installation_id, client_request_id
  ) values (
    p_call, v_me, p_device, v_source_installation,
    p_target_installation_id, p_request_id
  ) returning * into v_row;

  insert into public.call_events (
    call_id, actor, installation_id, event, details
  ) values (
    p_call, v_me, v_source_installation, 'handoff_requested',
    jsonb_build_object(
      'handoffId', v_row.id,
      'fromInstallation', v_source_installation,
      'targetInstallation', p_target_installation_id
    )
  );
  return v_row;
end;
$$;

-- The target acquires media before invoking this RPC. This transaction is the
-- ownership boundary: row locks + status predicate make the first target tab
-- win, move exactly one participant lease, and preserve the shared call id.
create or replace function public.claim_call_handoff(
  p_handoff uuid,
  p_device text
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
begin
  if v_me is null then raise exception 'not authenticated'; end if;
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
  if v_row.status in ('claimed', 'completed') then
    if v_row.claimed_device = p_device then
      return jsonb_build_object(
        'ok', true,
        'handoffId', v_row.id,
        'call', to_jsonb(v_call)
      );
    end if;
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;
  if v_row.status <> 'requested' then
    return jsonb_build_object('ok', false, 'reason', v_row.status);
  end if;
  if v_row.expires_at <= clock_timestamp() then
    update public.call_handoffs
    set status = 'expired', cancelled_at = clock_timestamp()
    where id = v_row.id
    returning * into v_row;
    insert into public.call_events (
      call_id, actor, installation_id, event, details
    ) values (
      v_call.id, v_me, v_row.target_installation_id, 'handoff_expired',
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
     or v_call.caller_lease_expires_at <= clock_timestamp()
     or v_call.callee_lease_expires_at is null
     or v_call.callee_lease_expires_at <= clock_timestamp() then
    raise exception 'call is not active';
  end if;
  if (v_me = v_call.caller and v_call.caller_device <> v_row.from_device)
     or (v_me = v_call.callee and v_call.callee_device <> v_row.from_device) then
    return jsonb_build_object('ok', false, 'reason', 'source_changed');
  end if;

  if v_me = v_call.caller then
    update public.call_sessions
    set caller_device = p_device,
        caller_heartbeat_at = clock_timestamp(),
        caller_lease_expires_at = clock_timestamp() + interval '120 seconds',
        handoff_generation = handoff_generation + 1,
        updated_at = clock_timestamp()
    where id = v_call.id
    returning * into v_call;
  else
    update public.call_sessions
    set callee_device = p_device,
        callee_heartbeat_at = clock_timestamp(),
        callee_lease_expires_at = clock_timestamp() + interval '120 seconds',
        handoff_generation = handoff_generation + 1,
        updated_at = clock_timestamp()
    where id = v_call.id
    returning * into v_call;
  end if;

  update public.call_handoffs
  set status = 'claimed',
      claimed_device = p_device,
      claimed_at = clock_timestamp()
  where id = v_row.id
    and status = 'requested'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'handoff claim race';
  end if;

  insert into public.call_events (
    call_id, actor, installation_id, event, details
  ) values (
    v_call.id, v_me, v_row.target_installation_id, 'handoff_claimed',
    jsonb_build_object(
      'handoffId', v_row.id,
      'fromInstallation', v_row.from_installation_id,
      'targetInstallation', v_row.target_installation_id,
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
     or v_call.status <> 'accepted'
     or (
       v_me = v_call.caller and v_call.caller_device <> p_device
     ) or (
       v_me = v_call.callee and v_call.callee_device <> p_device
     ) then
    return false;
  end if;
  update public.call_handoffs
  set status = 'completed', completed_at = clock_timestamp()
  where id = v_row.id;
  insert into public.call_events (
    call_id, actor, installation_id, event, details
  ) values (
    v_call.id, v_me, v_row.target_installation_id, 'handoff_completed',
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
  set status = v_next_status, cancelled_at = clock_timestamp()
  where id = v_row.id;
  insert into public.call_events (
    call_id, actor, installation_id, event, details
  ) values (
    v_call.id,
    v_me,
    case when p_device = v_row.from_device
      then v_row.from_installation_id else v_row.target_installation_id end,
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

-- A call can end from either participant while a transfer offer is visible.
-- Close every unclaimed offer in the same transaction as the terminal call
-- update so another device never keeps showing an offer for a dead call.
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
      set status = 'cancelled', cancelled_at = clock_timestamp()
      where handoff.call_id = new.id
        and handoff.status = 'requested'
      returning handoff.*
    loop
      insert into public.call_events (
        call_id, actor, installation_id, event, details
      ) values (
        new.id, null, v_handoff.from_installation_id, 'handoff_cancelled',
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
revoke all on function public.claim_call_handoff(uuid, text)
  from public, anon, authenticated;
revoke all on function public.complete_call_handoff(uuid, text)
  from public, anon, authenticated;
revoke all on function public.cancel_call_handoff(uuid, text)
  from public, anon, authenticated;
grant execute on function public.list_call_handoff_targets(uuid, text) to authenticated;
grant execute on function public.request_call_handoff(uuid, text, text, uuid) to authenticated;
grant execute on function public.claim_call_handoff(uuid, text) to authenticated;
grant execute on function public.complete_call_handoff(uuid, text) to authenticated;
grant execute on function public.cancel_call_handoff(uuid, text) to authenticated;

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
