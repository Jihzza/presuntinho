-- One authoritative surprise-heart window per active couple.
-- Remote migration version: 20260713211056.
--
-- The previous implementation rolled random timers independently in each
-- browser, so the two partners almost never saw the heart together.  This row
-- stores server timestamps instead: every device schedules the same window,
-- and postgres_changes wakes the partner when the row changes.

create table public.couple_heart_sessions (
  couple_id     uuid primary key references public.spaces(id) on delete cascade,
  session_id    uuid not null default gen_random_uuid(),
  visible_from  timestamptz not null,
  visible_until timestamptz not null,
  tap_seq       bigint not null default 0 check (tap_seq >= 0),
  last_tapper   uuid references public.accounts(id) on delete set null,
  last_tap_at   timestamptz,
  feedback_at   timestamptz,
  updated_at    timestamptz not null default now(),
  constraint couple_heart_window_valid check (visible_until > visible_from)
);

alter table public.couple_heart_sessions enable row level security;

-- Private idempotency ledger.  Browser roles never read or write this table;
-- the checked SECURITY DEFINER tap RPC is its only application entrypoint.
create table public.couple_heart_taps (
  tap_id         uuid primary key,
  couple_id      uuid not null references public.spaces(id) on delete cascade,
  session_id     uuid not null,
  tapper         uuid not null references public.accounts(id) on delete cascade,
  member_points  integer not null check (member_points >= 0),
  total_points   bigint not null check (total_points >= 0),
  tap_seq        bigint not null check (tap_seq >= 0),
  feedback_at    timestamptz not null,
  created_at     timestamptz not null default now()
);

alter table public.couple_heart_taps enable row level security;
revoke all on table public.couple_heart_taps from public, anon, authenticated;

-- Internal primitive: exactly two distinct rows, both accepted, in a couple
-- space.  It intentionally contains no caller check because other definer RPCs
-- use it while holding account locks; browser roles cannot execute it.
create or replace function public.is_fully_active_couple(p_space uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
      from public.spaces s
     where s.id = p_space
       and s.kind = 'couple'
       and (
         select count(*)
           from public.space_members members
          where members.space_id = s.id
       ) = 2
       and not exists (
         select 1
           from public.space_members pending
          where pending.space_id = s.id
            and pending.status <> 'accepted'
       )
  );
$$;

revoke all on function public.is_fully_active_couple(uuid) from public, anon, authenticated;

-- Internal uniqueness predicate used both by the strict RLS helper and by the
-- formation RPCs after they acquire ordered advisory locks.
create or replace function public.has_fully_active_couple_except(
  p_account uuid,
  p_except_space uuid default null
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
      from public.space_members mine
      join public.spaces s
        on s.id = mine.space_id
       and s.kind = 'couple'
     where mine.account = p_account
       and mine.status = 'accepted'
       and (p_except_space is null or s.id <> p_except_space)
       and public.is_fully_active_couple(s.id)
  );
$$;

revoke all on function public.has_fully_active_couple_except(uuid, uuid)
  from public, anon, authenticated;

-- `is_active_space_member` proves only that one member accepted; it does not
-- prove that the space is a unique, fully-formed two-person couple.  This
-- browser-callable predicate is deliberately tied to auth.uid(): it cannot be
-- used as a relationship oracle for arbitrary account ids.  Existing corrupt
-- multi-couple data fails closed for BOTH members until it is repaired.
create or replace function public.is_active_couple_member(
  p_space uuid,
  p_account uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select p_account is not null
     and p_account = auth.uid()
     and public.is_fully_active_couple(p_space)
     and exists (
       select 1
         from public.space_members me
        where me.space_id = p_space
          and me.account = p_account
          and me.status = 'accepted'
     )
     and not exists (
       select 1
         from public.space_members current_member
        where current_member.space_id = p_space
          and public.has_fully_active_couple_except(current_member.account, p_space)
     );
$$;

revoke all on function public.is_active_couple_member(uuid, uuid) from public, anon;
grant execute on function public.is_active_couple_member(uuid, uuid) to authenticated;

create policy couple_heart_sessions_select
  on public.couple_heart_sessions
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and public.is_active_couple_member(couple_id, (select auth.uid()))
  );

-- April 2026 Supabase projects may no longer expose SQL-created tables to the
-- Data API automatically.  The browser only needs SELECT; all writes go through
-- the two checked RPCs below.
grant select on table public.couple_heart_sessions to authenticated;
revoke insert, update, delete on table public.couple_heart_sessions from anon, authenticated;

-- Return the current shared window, creating/advancing it atomically when
-- necessary.  The row lock makes simultaneous calls from both phones converge
-- on exactly the same session id and timestamps.
create or replace function public.couple_heart_state(p_couple_id uuid)
returns table (
  session_id uuid,
  visible_from timestamptz,
  visible_until timestamptz,
  tap_seq bigint,
  last_tapper uuid,
  feedback_at timestamptz,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.accounts.id%type := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_start timestamptz;
  v_row public.couple_heart_sessions%rowtype;
begin
  if v_user is null
     or not public.is_active_couple_member(p_couple_id, v_user) then
    raise exception 'active couple membership required' using errcode = '42501';
  end if;

  -- First discovery window: soon enough to teach the mechanic, but shared.
  v_start := v_now + make_interval(secs => 12 + floor(random() * 17)::int);
  insert into public.couple_heart_sessions (
    couple_id,
    session_id,
    visible_from,
    visible_until,
    updated_at
  )
  values (
    p_couple_id,
    gen_random_uuid(),
    v_start,
    v_start + make_interval(secs => 7 + floor(random() * 5)::int),
    v_now
  )
  on conflict (couple_id) do nothing;

  select h.*
    into v_row
    from public.couple_heart_sessions h
   where h.couple_id = p_couple_id
   for update;

  -- `clock_timestamp()` above may precede a conflict/row-lock wait.  Refresh it
  -- after owning the row so an expired window is never returned as current.
  v_now := clock_timestamp();

  if not public.is_active_couple_member(p_couple_id, v_user) then
    raise exception 'active couple membership required' using errcode = '42501';
  end if;

  -- Once a window has elapsed, whichever phone checks first schedules the
  -- next one; the row lock ensures the other phone reads that same window.
  if v_row.visible_until <= v_now then
    v_start := v_now + make_interval(secs => 45 + floor(random() * 76)::int);
    update public.couple_heart_sessions h
       set session_id = gen_random_uuid(),
           visible_from = v_start,
           visible_until = v_start + make_interval(secs => 7 + floor(random() * 5)::int),
           last_tapper = null,
           last_tap_at = null,
           feedback_at = null,
           updated_at = v_now
     where h.couple_id = p_couple_id
     returning h.* into v_row;
  end if;

  return query
  select v_row.session_id,
         v_row.visible_from,
         v_row.visible_until,
         v_row.tap_seq,
         v_row.last_tapper,
         v_row.feedback_at,
         clock_timestamp();
end;
$$;

-- A tap is accepted only for the caller's active, currently-visible session.
-- The caller identity comes from auth.uid(), never from client-supplied profile
-- text.  Points remain in couple_points and never touch the normal XP store.
drop function if exists public.couple_heart_tap(uuid, uuid);
create or replace function public.couple_heart_tap(
  p_couple_id uuid,
  p_session_id uuid,
  p_tap_id uuid
)
returns table (
  tap_id uuid,
  member_points integer,
  total_points bigint,
  tap_seq bigint,
  feedback_at timestamptz,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.accounts.id%type := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_heart public.couple_heart_sessions%rowtype;
  v_member_points integer;
  v_total_points bigint;
  v_tap_seq bigint;
  v_feedback_at timestamptz;
  v_existing public.couple_heart_taps%rowtype;
begin
  if p_couple_id is null or p_session_id is null or p_tap_id is null then
    raise exception 'couple, session and tap ids are required' using errcode = '22004';
  end if;

  if v_user is null
     or not public.is_active_couple_member(p_couple_id, v_user) then
    raise exception 'active couple membership required' using errcode = '42501';
  end if;

  -- One transaction at a time owns an idempotency key, even if a malicious or
  -- buggy client reuses it across different couples.  A retry sees the durable
  -- ledger row and returns the original result without incrementing anything.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('couple-heart-tap:' || p_tap_id::text, 731947)
  );

  select ledger.*
    into v_existing
    from public.couple_heart_taps ledger
   where ledger.tap_id = p_tap_id;

  if found then
    if v_existing.couple_id is distinct from p_couple_id
       or v_existing.session_id is distinct from p_session_id
       or v_existing.tapper is distinct from v_user then
      raise exception 'tap id already belongs to another request' using errcode = '23505';
    end if;

    return query
    select v_existing.tap_id,
           v_existing.member_points,
           v_existing.total_points,
           v_existing.tap_seq,
           v_existing.feedback_at,
           clock_timestamp();
    return;
  end if;

  select h.*
    into v_heart
    from public.couple_heart_sessions h
   where h.couple_id = p_couple_id
   for update;

  -- Do not validate against a timestamp captured before a lock wait.  Without
  -- this refresh, a queued tap could earn a point after the window had closed.
  v_now := clock_timestamp();

  -- Membership can change while waiting for the row lock.  Recheck using the
  -- fresh statement snapshot before any privileged write.
  if not public.is_active_couple_member(p_couple_id, v_user) then
    raise exception 'active couple membership required' using errcode = '42501';
  end if;

  if v_heart.couple_id is null
     or v_heart.session_id <> p_session_id
     or v_now < v_heart.visible_from
     or v_now >= v_heart.visible_until then
    raise exception 'heart session is not active' using errcode = 'P0001';
  end if;

  -- Both phones receive this exact server timestamp.  Scheduling feedback a
  -- short distance ahead absorbs normal RPC/Realtime skew and lets the two
  -- haptic animations fire together instead of merely "as soon as delivered".
  v_feedback_at := v_now + interval '400 milliseconds';

  insert into public.couple_points (couple_id, profile, points, updated_at)
  values (p_couple_id::text, v_user::text, 1, v_now)
  on conflict (couple_id, profile)
  do update
     set points = least(2147483647::bigint, public.couple_points.points::bigint + 1)::integer,
         updated_at = v_now
  returning points into v_member_points;

  update public.couple_heart_sessions h
     set tap_seq = h.tap_seq + 1,
         last_tapper = v_user,
         last_tap_at = v_now,
         feedback_at = v_feedback_at,
         updated_at = v_now
   where h.couple_id = p_couple_id
   returning h.tap_seq into v_tap_seq;

  select coalesce(sum(p.points), 0)::bigint
    into v_total_points
    from public.couple_points p
    join public.space_members member
      on member.space_id = p_couple_id
     and member.account::text = p.profile
     and member.status = 'accepted'
   where p.couple_id = p_couple_id::text;

  insert into public.couple_heart_taps (
    tap_id,
    couple_id,
    session_id,
    tapper,
    member_points,
    total_points,
    tap_seq,
    feedback_at,
    created_at
  )
  values (
    p_tap_id,
    p_couple_id,
    p_session_id,
    v_user,
    v_member_points,
    v_total_points,
    v_tap_seq,
    v_feedback_at,
    v_now
  );

  return query
  select p_tap_id,
         v_member_points,
         v_total_points,
         v_tap_seq,
         v_feedback_at,
         clock_timestamp();
end;
$$;

-- SECURITY DEFINER functions are APIs: remove PUBLIC's implicit EXECUTE and
-- expose them only to authenticated users after the membership checks above.
revoke all on function public.couple_heart_state(uuid) from public, anon;
revoke all on function public.couple_heart_tap(uuid, uuid, uuid) from public, anon;
grant execute on function public.couple_heart_state(uuid) to authenticated;
grant execute on function public.couple_heart_tap(uuid, uuid, uuid) to authenticated;

-- Retire the old arbitrary-profile/delta endpoint and direct table writes.  It
-- allowed points outside a visible heart window and could attribute them to the
-- partner.  Existing reads/realtime remain available to active members.
revoke all on function public.couple_points_bump(text, text, integer) from public, anon, authenticated;
revoke insert, update, delete on table public.couple_points from anon, authenticated;
grant select on table public.couple_points to authenticated;

alter policy couple_points_select on public.couple_points
  to authenticated
  using (
    public.as_uuid(couple_id) is not null
    and public.is_active_couple_member(public.as_uuid(couple_id), (select auth.uid()))
  );
drop policy if exists couple_points_insert on public.couple_points;
drop policy if exists couple_points_update on public.couple_points;

-- ── Couple-formation serialization and uniqueness hardening ─────────────────

-- Serialize every operation touching the same account pair.  Advisory keys are
-- sorted before locking, so A→B and B→A acquire them in the same order;
-- operations A→B and A→C also share A's key, closing the activation race.
create or replace function public.lock_couple_accounts(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key_a bigint;
  v_key_b bigint;
  v_first_key bigint;
  v_second_key bigint;
begin
  if p_a is null or p_b is null or p_a = p_b then
    raise exception 'two distinct accounts are required' using errcode = '22023';
  end if;

  v_key_a := pg_catalog.hashtextextended('couple-account:' || p_a::text, 481516);
  v_key_b := pg_catalog.hashtextextended('couple-account:' || p_b::text, 481516);

  if v_key_a <= v_key_b then
    v_first_key := v_key_a;
    v_second_key := v_key_b;
  else
    v_first_key := v_key_b;
    v_second_key := v_key_a;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(v_first_key);
  if v_second_key <> v_first_key then
    perform pg_catalog.pg_advisory_xact_lock(v_second_key);
  end if;
end;
$$;

revoke all on function public.lock_couple_accounts(uuid, uuid)
  from public, anon, authenticated;

-- Preserve the 0013 helper signature while making "active" mean the same
-- exact two-accepted-member invariant used by the heart/RLS path.
create or replace function public.has_other_active_couple(p_account uuid, p_with uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
      from public.space_members mine
      join public.spaces s
        on s.id = mine.space_id
       and s.kind = 'couple'
     where mine.account = p_account
       and mine.status = 'accepted'
       and public.is_fully_active_couple(s.id)
       and not exists (
         select 1
           from public.space_members partner
          where partner.space_id = s.id
            and partner.account = p_with
       )
  );
$$;

revoke all on function public.has_other_active_couple(uuid, uuid)
  from public, anon, authenticated;

-- Legacy proposal flow: same result shape, now serialized and rechecked while
-- both account locks are held.
create or replace function public.propose_couple(p_other uuid)
returns table(space_id uuid, active boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_existing uuid;
  v_new_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_other is null or v_me = p_other then raise exception 'cannot couple with yourself'; end if;

  perform public.lock_couple_accounts(v_me, p_other);

  if not public.are_connected(v_me, p_other) then
    raise exception 'accounts are not connected' using errcode = '42501';
  end if;
  if public.has_other_active_couple(v_me, p_other)
     or public.has_other_active_couple(p_other, v_me) then
    raise exception 'account already has an active couple' using errcode = 'P0001';
  end if;

  select s.id
    into v_existing
    from public.spaces s
   where s.kind = 'couple'
     and public.is_space_member(s.id, v_me)
     and public.is_space_member(s.id, p_other)
   -- Legacy data can contain more than one A-B space.  Prefer the already
   -- active one so a stale pending duplicate can never be activated instead.
   order by public.is_fully_active_couple(s.id) desc,
            ((select count(*) from public.space_members m where m.space_id = s.id) = 2) desc,
            s.created_at,
            s.id
   limit 1;

  if v_existing is not null then
    -- Unlike has_other_active_couple(), this also detects a second active
    -- space with the SAME partner.  That makes duplicate legacy data fail
    -- closed instead of activating another A-B row.
    if public.has_fully_active_couple_except(v_me, v_existing)
       or public.has_fully_active_couple_except(p_other, v_existing) then
      return query select v_existing, false;
      return;
    end if;
    if not exists (
         select 1
           from public.spaces s
          where s.id = v_existing
            and s.kind = 'couple'
            and (select count(*) from public.space_members m where m.space_id = s.id) = 2
            and public.is_space_member(s.id, v_me)
            and public.is_space_member(s.id, p_other)
       ) then
      return query select v_existing, false;
      return;
    end if;
    update public.space_members
       set status = 'accepted'
     where public.space_members.space_id = v_existing
       and account = v_me
       and status = 'pending';
    return query select v_existing, public.is_fully_active_couple(v_existing);
    return;
  end if;

  if public.has_other_active_couple(v_me, p_other)
     or public.has_other_active_couple(p_other, v_me) then
    raise exception 'account already has an active couple' using errcode = 'P0001';
  end if;

  insert into public.spaces (kind, owner)
  values ('couple', v_me)
  returning id into v_new_id;
  insert into public.space_members (space_id, account, role, status)
  values (v_new_id, v_me, 'owner', 'accepted'),
         (v_new_id, p_other, 'member', 'pending');
  return query select v_new_id, false;
end;
$$;

-- Legacy invite acceptance is idempotent for an already-active pair, returns
-- false for invalid/blocked invitations, and never activates a second partner.
create or replace function public.accept_couple(p_space uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;

  select partner.account
    into v_other
    from public.spaces s
    join public.space_members mine
      on mine.space_id = s.id
     and mine.account = v_me
    join public.space_members partner
      on partner.space_id = s.id
     and partner.account <> v_me
   where s.id = p_space
     and s.kind = 'couple'
   order by partner.account
   limit 1;

  if v_other is null then return false; end if;
  perform public.lock_couple_accounts(v_me, v_other);

  -- Re-read the pair after waiting for the ordered locks.
  if not exists (
       select 1
         from public.spaces s
        where s.id = p_space
          and s.kind = 'couple'
          and (select count(*) from public.space_members m where m.space_id = s.id) = 2
          and public.is_space_member(s.id, v_me)
          and public.is_space_member(s.id, v_other)
     ) then
    return false;
  end if;

  if public.has_fully_active_couple_except(v_me, p_space)
     or public.has_fully_active_couple_except(v_other, p_space) then
    return false;
  end if;

  update public.space_members
     set status = 'accepted'
   where public.space_members.space_id = p_space
     and account = v_me
     and status = 'pending';

  return public.is_fully_active_couple(p_space);
end;
$$;

-- Social-v2 request flow, preserving every documented outcome while moving the
-- availability checks under the same ordered account locks as every activator.
create or replace function public.request_couple(p_other uuid)
returns table(outcome text, space_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_conn public.connections%rowtype;
  v_existing uuid;
  v_new_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_other is null or v_me = p_other then
    return query select 'self'::text, null::uuid;
    return;
  end if;

  perform public.lock_couple_accounts(v_me, p_other);

  if public.has_other_active_couple(v_me, p_other)
     or public.has_other_active_couple(p_other, v_me) then
    return query select 'taken'::text, null::uuid;
    return;
  end if;

  select s.id
    into v_existing
    from public.spaces s
   where s.kind = 'couple'
     and public.is_space_member(s.id, v_me)
     and public.is_space_member(s.id, p_other)
   order by public.is_fully_active_couple(s.id) desc,
            ((select count(*) from public.space_members m where m.space_id = s.id) = 2) desc,
            s.created_at,
            s.id
   limit 1;

  if v_existing is not null then
    if public.has_fully_active_couple_except(v_me, v_existing)
       or public.has_fully_active_couple_except(p_other, v_existing) then
      return query select 'taken'::text, null::uuid;
      return;
    end if;
    if not exists (
         select 1
           from public.spaces s
          where s.id = v_existing
            and s.kind = 'couple'
            and (select count(*) from public.space_members m where m.space_id = s.id) = 2
            and public.is_space_member(s.id, v_me)
            and public.is_space_member(s.id, p_other)
       ) then
      return query select 'already'::text, v_existing;
      return;
    end if;
    update public.space_members
       set status = 'accepted'
     where public.space_members.space_id = v_existing
       and account = v_me
       and status = 'pending';
    if public.is_fully_active_couple(v_existing) then
      return query select 'couple_active'::text, v_existing;
    else
      return query select 'already'::text, v_existing;
    end if;
    return;
  end if;

  select connection.*
    into v_conn
    from public.connections connection
   where (connection.requester = v_me and connection.addressee = p_other)
      or (connection.requester = p_other and connection.addressee = v_me)
   order by connection.created_at, connection.id
   limit 1
   for update;

  if v_conn.id is null then
    insert into public.connections (requester, addressee, status, wants_couple)
    values (v_me, p_other, 'pending', true);
    return query select 'request_sent'::text, null::uuid;
    return;
  end if;

  if v_conn.status = 'pending' and v_conn.requester = v_me then
    update public.connections
       set wants_couple = true,
           updated_at = clock_timestamp()
     where id = v_conn.id;
    return query select 'request_sent'::text, null::uuid;
    return;
  end if;

  if v_conn.status = 'pending' and v_conn.addressee = v_me then
    update public.connections
       set status = 'accepted',
           updated_at = clock_timestamp()
     where id = v_conn.id;

    if public.has_other_active_couple(v_me, p_other)
       or public.has_other_active_couple(p_other, v_me) then
      return query select 'taken'::text, null::uuid;
      return;
    end if;

    insert into public.spaces (kind, owner)
    values ('couple', v_me)
    returning id into v_new_id;
    insert into public.space_members (space_id, account, role, status)
    values (
      v_new_id,
      v_me,
      'owner',
      'accepted'
    ), (
      v_new_id,
      p_other,
      'member',
      case when v_conn.wants_couple then 'accepted' else 'pending' end
    );
    return query
    select case when v_conn.wants_couple then 'couple_active' else 'couple_proposed' end,
           v_new_id;
    return;
  end if;

  if public.has_other_active_couple(v_me, p_other)
     or public.has_other_active_couple(p_other, v_me) then
    return query select 'taken'::text, null::uuid;
    return;
  end if;

  insert into public.spaces (kind, owner)
  values ('couple', v_me)
  returning id into v_new_id;
  insert into public.space_members (space_id, account, role, status)
  values (v_new_id, v_me, 'owner', 'accepted'),
         (v_new_id, p_other, 'member', 'pending');
  return query select 'couple_proposed'::text, v_new_id;
end;
$$;

-- One connection accept still always lands the friendship.  Couple activation
-- is serialized/rechecked and reports couple_blocked=true if either side became
-- unavailable while the request was pending.
create or replace function public.accept_connection(p_connection uuid)
returns table(couple_space uuid, couple_active boolean, couple_blocked boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_requester uuid;
  v_conn public.connections%rowtype;
  v_existing uuid;
  v_new_id uuid;
  v_active boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '42501'; end if;

  select connection.requester
    into v_requester
    from public.connections connection
   where connection.id = p_connection
     and connection.addressee = v_me
     and connection.status = 'pending';
  if v_requester is null then raise exception 'request not found'; end if;

  perform public.lock_couple_accounts(v_me, v_requester);

  select connection.*
    into v_conn
    from public.connections connection
   where connection.id = p_connection
     and connection.addressee = v_me
     and connection.requester = v_requester
     and connection.status = 'pending'
   for update;
  if v_conn.id is null then raise exception 'request not found'; end if;

  update public.connections
     set status = 'accepted',
         updated_at = clock_timestamp()
   where id = v_conn.id;

  if not v_conn.wants_couple then
    return query select null::uuid, false, false;
    return;
  end if;

  if public.has_other_active_couple(v_me, v_requester)
     or public.has_other_active_couple(v_requester, v_me) then
    return query select null::uuid, false, true;
    return;
  end if;

  select s.id
    into v_existing
    from public.spaces s
   where s.kind = 'couple'
     and public.is_space_member(s.id, v_me)
     and public.is_space_member(s.id, v_requester)
   order by public.is_fully_active_couple(s.id) desc,
            ((select count(*) from public.space_members m where m.space_id = s.id) = 2) desc,
            s.created_at,
            s.id
   limit 1;

  if v_existing is not null then
    if public.has_fully_active_couple_except(v_me, v_existing)
       or public.has_fully_active_couple_except(v_requester, v_existing) then
      return query select null::uuid, false, true;
      return;
    end if;
    if not exists (
         select 1
           from public.spaces s
          where s.id = v_existing
            and s.kind = 'couple'
            and (select count(*) from public.space_members m where m.space_id = s.id) = 2
            and public.is_space_member(s.id, v_me)
            and public.is_space_member(s.id, v_requester)
       ) then
      return query select null::uuid, false, true;
      return;
    end if;
    update public.space_members
       set status = 'accepted'
     where public.space_members.space_id = v_existing
       and account in (v_me, v_requester)
       and status = 'pending';
    v_active := public.is_fully_active_couple(v_existing);
    return query select v_existing, v_active, not v_active;
    return;
  end if;

  if public.has_other_active_couple(v_me, v_requester)
     or public.has_other_active_couple(v_requester, v_me) then
    return query select null::uuid, false, true;
    return;
  end if;

  insert into public.spaces (kind, owner)
  values ('couple', v_requester)
  returning id into v_new_id;
  insert into public.space_members (space_id, account, role, status)
  values (v_new_id, v_requester, 'owner', 'accepted'),
         (v_new_id, v_me, 'member', 'accepted');
  return query select v_new_id, true, false;
end;
$$;

-- Fail closed unless auth.uid() has exactly one strict active couple.  This
-- prevents love/nudge pushes from selecting an arbitrary partner in corrupted
-- legacy multi-couple data.
create or replace function public.couple_partner()
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  with candidates as (
    select partner.account
      from public.spaces s
      join public.space_members mine
        on mine.space_id = s.id
       and mine.account = auth.uid()
       and mine.status = 'accepted'
      join public.space_members partner
        on partner.space_id = s.id
       and partner.account <> auth.uid()
       and partner.status = 'accepted'
     where s.kind = 'couple'
       and public.is_active_couple_member(s.id, auth.uid())
  )
  select case
           when count(*) = 1 then (array_agg(candidates.account))[1]
           else null::uuid
         end
    from candidates;
$$;

revoke all on function public.propose_couple(uuid) from public, anon, authenticated;
revoke all on function public.accept_couple(uuid) from public, anon, authenticated;
revoke all on function public.request_couple(uuid) from public, anon, authenticated;
revoke all on function public.accept_connection(uuid) from public, anon, authenticated;
revoke all on function public.couple_partner() from public, anon, authenticated;
grant execute on function public.propose_couple(uuid) to authenticated;
grant execute on function public.accept_couple(uuid) to authenticated;
grant execute on function public.request_couple(uuid) to authenticated;
grant execute on function public.accept_connection(uuid) to authenticated;
grant execute on function public.couple_partner() to authenticated;

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'couple_heart_sessions'
  ) then
    alter publication supabase_realtime add table public.couple_heart_sessions;
  end if;
end;
$$;
