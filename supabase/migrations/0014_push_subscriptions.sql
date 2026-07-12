-- Web Push para os pings de casal — cada dispositivo que ativa as notificações
-- guarda aqui a sua subscrição push. O envio é feito pela função Netlify
-- push-ping (que detém a chave VAPID privada) COM O JWT DO REMETENTE: a RLS
-- é quem garante que só o parceiro de casal consegue ler as subscrições do
-- outro — a função não precisa de service role nenhum.

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  account    uuid not null references public.accounts(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  ua         text,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_account_idx on public.push_subscriptions (account);

alter table public.push_subscriptions enable row level security;

-- O dono gere as suas subscrições (criar/atualizar/apagar/ler).
drop policy if exists push_subs_own on public.push_subscriptions;
create policy push_subs_own on public.push_subscriptions
  for all using (account = auth.uid()) with check (account = auth.uid());

-- O parceiro de casal ATIVO pode LER as subscrições do outro — é o que permite
-- à função push-ping (agindo com o JWT do remetente) entregar o ping.
drop policy if exists push_subs_couple_select on public.push_subscriptions;
create policy push_subs_couple_select on public.push_subscriptions
  for select using (
    exists (
      select 1 from public.spaces s
      where s.kind = 'couple'
        and public.is_active_space_member(s.id, auth.uid())
        and public.is_active_space_member(s.id, account)
    )
  );

-- O parceiro do casal ativo de auth.uid() (null sem casal ativo).
create or replace function public.couple_partner()
returns uuid
language sql security definer set search_path = '' stable as $$
  select m.account
  from public.space_members m
  join public.spaces s on s.id = m.space_id and s.kind = 'couple'
  where m.account <> auth.uid()
    and m.status = 'accepted'
    and public.is_active_space_member(s.id, auth.uid())
    and not exists (select 1 from public.space_members p where p.space_id = s.id and p.status = 'pending')
  limit 1;
$$;

grant execute on function public.couple_partner() to authenticated;
