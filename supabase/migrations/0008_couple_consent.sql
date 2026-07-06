-- Phase 3b (redesigned) — couple formation now requires MUTUAL CONSENT, and a
-- couple only "activates" (rescopes couple data) once BOTH people accept. This
-- fixes the adversarial-review findings: forming a couple was unilateral and
-- could rescope someone's data without their agreement.
--
-- space_members gains a `status` (pending | accepted). Groups add members as
-- 'accepted' (owner-driven, low sensitivity). Couples: the proposer is
-- 'accepted', the invitee is 'pending' until they accept. A couple is ACTIVE
-- only when every member is 'accepted' — and only active couples ever become
-- the couple_id (see the client's getActiveCoupleSpaceId).

alter table public.space_members
  add column if not exists status text not null default 'accepted'
  check (status in ('pending', 'accepted'));

-- Replace the old unilateral form_couple with a consent-based propose/accept.
drop function if exists public.form_couple(uuid);

-- Propose a couple to an accepted contact. If they already proposed ME, this
-- accepts (closes the loop). Returns the couple space id + whether it's active.
create or replace function public.propose_couple(p_other uuid)
returns table(space_id uuid, active boolean)
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  existing uuid;
  new_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if me = p_other then raise exception 'cannot couple with yourself'; end if;
  if not public.are_connected(me, p_other) then raise exception 'accounts are not connected'; end if;

  -- Any existing couple space between the two of us (pending or active)?
  select s.id into existing
  from public.spaces s
  where s.kind = 'couple'
    and public.is_space_member(s.id, me)
    and public.is_space_member(s.id, p_other)
  limit 1;

  if existing is not null then
    -- If I was the pending invitee, accept it now.
    update public.space_members set status = 'accepted'
      where space_id = existing and account = me and status = 'pending';
    return query
      select existing,
        not exists (select 1 from public.space_members m where m.space_id = existing and m.status = 'pending');
    return;
  end if;

  -- Fresh proposal: I accept, they're pending until they accept.
  insert into public.spaces (kind, owner) values ('couple', me) returning id into new_id;
  insert into public.space_members (space_id, account, role, status)
    values (new_id, me, 'owner', 'accepted'), (new_id, p_other, 'member', 'pending');
  return query select new_id, false;
end; $$;

-- Accept a pending couple invite (I'm the pending member).
create or replace function public.accept_couple(p_space uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  update public.space_members set status = 'accepted'
    where space_id = p_space and account = me and status = 'pending';
  return not exists (select 1 from public.space_members m where m.space_id = p_space and m.status = 'pending');
end; $$;
