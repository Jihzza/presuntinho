-- Pings persistidos (aparecem na página de notificações + entrega in-app via
-- postgres_changes, sem depender do broadcast presence) e subscrições push
-- legíveis também por AMIGOS ligados (para os pushes de mensagens DM).

create table if not exists public.couple_pings (
  id         uuid primary key default gen_random_uuid(),
  couple_id  text not null,
  sender     text not null,
  kind       text not null check (kind in ('love', 'nudge')),
  created_at timestamptz not null default now()
);
create index if not exists couple_pings_couple_idx on public.couple_pings (couple_id, created_at desc);

alter table public.couple_pings enable row level security;

drop policy if exists couple_pings_select on public.couple_pings;
create policy couple_pings_select on public.couple_pings for select using (
  case
    when public.as_uuid(couple_id) is not null then public.is_active_space_member(public.as_uuid(couple_id), auth.uid())
    else true
  end
);
drop policy if exists couple_pings_insert on public.couple_pings;
create policy couple_pings_insert on public.couple_pings for insert with check (
  case
    when public.as_uuid(couple_id) is not null
      then public.is_active_space_member(public.as_uuid(couple_id), auth.uid()) and sender = auth.uid()::text
    else char_length(couple_id) >= 8
  end
);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='couple_pings') then
    execute 'alter publication supabase_realtime add table public.couple_pings';
  end if;
end $$;

-- Push de mensagens DM: um amigo LIGADO também pode ler as tuas subscrições
-- (só endpoint/chaves de entrega — é o que permite entregar-te a notificação).
grant execute on function public.are_connected(uuid, uuid) to anon, authenticated;

drop policy if exists push_subs_couple_select on public.push_subscriptions;
drop policy if exists push_subs_reachable_select on public.push_subscriptions;
create policy push_subs_reachable_select on public.push_subscriptions
  for select using (
    public.are_connected(auth.uid(), account)
    or exists (
      select 1 from public.spaces s
      where s.kind = 'couple'
        and public.is_active_space_member(s.id, auth.uid())
        and public.is_active_space_member(s.id, account)
    )
  );
