-- Posts estilo Twitter no perfil + bucket de avatares.
-- Visibilidade dos posts: o próprio autor e os seus CONTACTOS aceites
-- (are_connected) — exatamente o modelo "aceitou o pedido → vês e interages".

create or replace function public.can_see_posts(p_viewer uuid, p_author uuid)
returns boolean
language sql security definer set search_path = '' stable as $$
  select p_viewer is not null and (p_viewer = p_author or public.are_connected(p_viewer, p_author));
$$;
grant execute on function public.can_see_posts(uuid, uuid) to anon, authenticated;

create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  author     uuid not null references public.accounts(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists posts_author_idx on public.posts (author, created_at desc);

create table if not exists public.post_likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  account    uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, account)
);

create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author     uuid not null references public.accounts(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select using (public.can_see_posts(auth.uid(), author));
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert with check (author = auth.uid());
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete using (author = auth.uid());

drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select on public.post_likes for select using (
  exists (select 1 from public.posts p where p.id = post_id and public.can_see_posts(auth.uid(), p.author))
);
drop policy if exists post_likes_insert on public.post_likes;
create policy post_likes_insert on public.post_likes for insert with check (
  account = auth.uid()
  and exists (select 1 from public.posts p where p.id = post_id and public.can_see_posts(auth.uid(), p.author))
);
drop policy if exists post_likes_delete on public.post_likes;
create policy post_likes_delete on public.post_likes for delete using (account = auth.uid());

drop policy if exists post_comments_select on public.post_comments;
create policy post_comments_select on public.post_comments for select using (
  exists (select 1 from public.posts p where p.id = post_id and public.can_see_posts(auth.uid(), p.author))
);
drop policy if exists post_comments_insert on public.post_comments;
create policy post_comments_insert on public.post_comments for insert with check (
  author = auth.uid()
  and exists (select 1 from public.posts p where p.id = post_id and public.can_see_posts(auth.uid(), p.author))
);
drop policy if exists post_comments_delete on public.post_comments;
create policy post_comments_delete on public.post_comments for delete using (author = auth.uid());

-- ── Avatares: bucket público, cada conta escreve só na SUA pasta ──
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists avatars_write_own on storage.objects;
create policy avatars_write_own on storage.objects for insert with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects for delete using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
