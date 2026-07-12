-- Social v2 — the couple request becomes a FIRST-CLASS, single-accept flow and
-- friends get private DMs. Fixes the v1 relay problem: linking two accounts as
-- a couple needed contact-accept → (sender's device online) → propose_couple →
-- couple-accept; if the proposer's device wasn't open at the right moment the
-- flow silently stalled. Now the intent travels ON the request row
-- (connections.wants_couple) and the server finishes the couple atomically on
-- the ONE accept — no device relay, no localStorage intent.
--
--   request_couple(p_other)      one call, any prior state → the right move
--   accept_connection(p_conn)    accept friend OR couple request (atomic)
--   is_dm_member(...)            RLS for friend DMs in couple_messages
--   set_space_meta(...)          couple onboarding names its space
--
-- Depends on 0006 (connections), 0007/0008 (spaces + consent), 0010 (as_uuid /
-- is_active_space_member).

-- ── 1. the couple intent lives on the request row ────────────────────────────

alter table public.connections
  add column if not exists wants_couple boolean not null default false;

-- ── 2. request_couple — ONE call for "quero ser teu casal" ───────────────────
-- Handles every prior state between me and p_other:
--   no connection            → pending connection with wants_couple  ('request_sent')
--   my pending request       → flag it wants_couple                  ('request_sent')
--   their pending request    → accept it; couple if they wanted one,
--                              else propose a couple space           ('couple_active'/'couple_proposed')
--   accepted friendship      → propose a couple space                ('couple_proposed')
--   couple space exists      → accept my pending side if any         ('couple_active'/'already')
-- True when the account is in an ACTIVE couple with someone OTHER than p_with.
create or replace function public.has_other_active_couple(p_account uuid, p_with uuid)
returns boolean
language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.spaces s
    join public.space_members mine on mine.space_id = s.id and mine.account = p_account
    where s.kind = 'couple'
      and not public.is_space_member(s.id, p_with)
      and not exists (select 1 from public.space_members m where m.space_id = s.id and m.status = 'pending')
  );
$$;

create or replace function public.request_couple(p_other uuid)
returns table(outcome text, space_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  conn record;
  existing uuid;
  new_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if me = p_other then return query select 'self'::text, null::uuid; return; end if;

  -- v1 product rule: ONE active couple per person. A request involving someone
  -- already coupled (with a third person) is answered, not errored.
  if public.has_other_active_couple(me, p_other) or public.has_other_active_couple(p_other, me) then
    return query select 'taken'::text, null::uuid;
    return;
  end if;

  -- An existing couple space between us wins over everything else.
  select s.id into existing
  from public.spaces s
  where s.kind = 'couple'
    and public.is_space_member(s.id, me)
    and public.is_space_member(s.id, p_other)
  limit 1;
  if existing is not null then
    update public.space_members set status = 'accepted'
      where space_id = existing and account = me and status = 'pending';
    if exists (select 1 from public.space_members m where m.space_id = existing and m.status = 'pending') then
      return query select 'already'::text, existing;
    else
      return query select 'couple_active'::text, existing;
    end if;
    return;
  end if;

  select * into conn from public.connections
    where (requester = me and addressee = p_other) or (requester = p_other and addressee = me)
    limit 1
    for update;

  if conn.id is null then
    insert into public.connections (requester, addressee, status, wants_couple)
      values (me, p_other, 'pending', true);
    return query select 'request_sent'::text, null::uuid;
    return;
  end if;

  if conn.status = 'pending' and conn.requester = me then
    update public.connections set wants_couple = true, updated_at = now() where id = conn.id;
    return query select 'request_sent'::text, null::uuid;
    return;
  end if;

  if conn.status = 'pending' and conn.addressee = me then
    -- They already knocked. Me asking for a couple accepts the friendship; if
    -- THEY had asked for a couple too, both consents exist → couple is live.
    update public.connections set status = 'accepted', updated_at = now() where id = conn.id;
    if conn.wants_couple then
      insert into public.spaces (kind, owner) values ('couple', me) returning id into new_id;
      insert into public.space_members (space_id, account, role, status)
        values (new_id, me, 'owner', 'accepted'), (new_id, p_other, 'member', 'accepted');
      return query select 'couple_active'::text, new_id;
    else
      insert into public.spaces (kind, owner) values ('couple', me) returning id into new_id;
      insert into public.space_members (space_id, account, role, status)
        values (new_id, me, 'owner', 'accepted'), (new_id, p_other, 'member', 'pending');
      return query select 'couple_proposed'::text, new_id;
    end if;
    return;
  end if;

  -- Accepted friends → classic proposal (their explicit accept still required).
  insert into public.spaces (kind, owner) values ('couple', me) returning id into new_id;
  insert into public.space_members (space_id, account, role, status)
    values (new_id, me, 'owner', 'accepted'), (new_id, p_other, 'member', 'pending');
  return query select 'couple_proposed'::text, new_id;
end; $$;

-- ── 3. accept_connection — one accept closes friend AND couple requests ──────
create or replace function public.accept_connection(p_connection uuid)
returns table(couple_space uuid, couple_active boolean, couple_blocked boolean)
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  conn record;
  existing uuid;
  new_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into conn from public.connections
    where id = p_connection and addressee = me and status = 'pending'
    for update;
  if conn.id is null then raise exception 'request not found'; end if;

  update public.connections set status = 'accepted', updated_at = now() where id = conn.id;

  if not conn.wants_couple then
    return query select null::uuid, false, false;
    return;
  end if;

  -- ONE active couple per person: the friendship still lands, the couple half
  -- is refused (couple_blocked=true) when either side is already coupled.
  if public.has_other_active_couple(me, conn.requester) or public.has_other_active_couple(conn.requester, me) then
    return query select null::uuid, false, true;
    return;
  end if;

  -- A couple request: the sender consented by sending, I consent by accepting —
  -- the couple activates NOW (single accept, as the product flow promises).
  select s.id into existing
  from public.spaces s
  where s.kind = 'couple'
    and public.is_space_member(s.id, me)
    and public.is_space_member(s.id, conn.requester)
  limit 1;
  if existing is not null then
    update public.space_members set status = 'accepted' where space_id = existing and status = 'pending';
    return query select existing, true, false;
    return;
  end if;

  insert into public.spaces (kind, owner) values ('couple', conn.requester) returning id into new_id;
  insert into public.space_members (space_id, account, role, status)
    values (new_id, conn.requester, 'owner', 'accepted'), (new_id, me, 'member', 'accepted');
  return query select new_id, true, false;
end; $$;

-- ── 4. friend DMs — RLS branch for 'dm:<uuidA>:<uuidB>' conversation ids ─────
-- Canonical id: the two account uuids sorted ascending. Both parties must be
-- ACCEPTED contacts; each row's sender must be the authenticated writer, so a
-- party can't forge the other's bubbles.
create or replace function public.is_dm_member(p_id text, p_uid uuid)
returns boolean
language plpgsql security definer set search_path = '' stable as $$
declare
  a uuid; b uuid;
begin
  if p_uid is null or p_id is null then return false; end if;
  if p_id !~* '^dm:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  a := split_part(p_id, ':', 2)::uuid;
  b := split_part(p_id, ':', 3)::uuid;
  if a >= b then return false; end if; -- canonical ordering only (no dup threads)
  if p_uid <> a and p_uid <> b then return false; end if;
  return public.are_connected(a, b);
end; $$;

grant execute on function public.is_dm_member(text, uuid) to anon, authenticated;

-- Rebuild the couple_messages policies with the DM branch. The 0010 legacy
-- posture (non-uuid, non-dm ids) is preserved bit-for-bit.
drop policy if exists couple_messages_select on public.couple_messages;
create policy couple_messages_select on public.couple_messages for select using (
  case
    when couple_id like 'dm:%' then public.is_dm_member(couple_id, auth.uid())
    when public.as_uuid(couple_id) is not null then public.is_active_space_member(public.as_uuid(couple_id), auth.uid())
    else true
  end
);
drop policy if exists couple_messages_insert on public.couple_messages;
create policy couple_messages_insert on public.couple_messages for insert with check (
  char_length(coalesce(body, '') || coalesce(media_url, '')) > 0
  and case
    when couple_id like 'dm:%' then public.is_dm_member(couple_id, auth.uid()) and sender = auth.uid()::text
    when public.as_uuid(couple_id) is not null then public.is_active_space_member(public.as_uuid(couple_id), auth.uid())
    else char_length(couple_id) >= 8
  end
);

-- ── 5. couple onboarding can name its space ──────────────────────────────────
create or replace function public.set_space_meta(p_space uuid, p_name text, p_emoji text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.is_active_space_member(p_space, me) then
    raise exception 'not a member of this space';
  end if;
  update public.spaces
    set name = nullif(trim(coalesce(p_name, '')), ''),
        emoji = nullif(trim(coalesce(p_emoji, '')), '')
    where id = p_space;
end; $$;

grant execute on function public.request_couple(uuid) to authenticated;
grant execute on function public.accept_connection(uuid) to authenticated;
grant execute on function public.set_space_meta(uuid, text, text) to authenticated;
