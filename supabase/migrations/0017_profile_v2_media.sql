-- Perfil v2 — capa/site/localização na conta, media + pin + edição nos posts,
-- e o bucket PRIVADO 'post-media' para os anexos (fotos, vídeos, áudio,
-- ficheiros). A visibilidade da media segue exatamente a dos posts:
-- can_see_posts(viewer, dono-da-pasta) — o próprio + contactos aceites.

-- ── accounts: campos de perfil novos (tudo aditivo) ──
alter table public.accounts add column if not exists cover_url text;
alter table public.accounts add column if not exists website   text;
alter table public.accounts add column if not exists location  text;

-- ── posts: anexos, pin único por autor, marca de edição ──
alter table public.posts add column if not exists media jsonb not null default '[]'::jsonb;
alter table public.posts add column if not exists pinned boolean not null default false;
alter table public.posts add column if not exists edited_at timestamptz;

-- O body podia ser 1–500; agora pode ser vazio DESDE QUE haja media.
-- (Mais permissivo que o antigo — todos os posts existentes continuam válidos.)
alter table public.posts drop constraint if exists posts_body_check;
alter table public.posts add constraint posts_body_check check (
  char_length(body) <= 500
  and (char_length(body) > 0 or jsonb_array_length(media) > 0)
);

-- No máximo UM post fixado por conta (estilo Twitter/TikTok).
create unique index if not exists posts_one_pin_per_author
  on public.posts (author) where pinned;

-- Editar/fixar: o autor pode atualizar os SEUS posts (body/media/pinned/edited_at).
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update
  using (author = auth.uid()) with check (author = auth.uid());

-- ── Storage: bucket privado post-media/<author-uuid>/<ficheiro> ──
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', false)
on conflict (id) do nothing;

-- Leitura: quem pode ver os posts do dono da pasta (o próprio + amigos aceites).
drop policy if exists post_media_read on storage.objects;
create policy post_media_read on storage.objects for select using (
  bucket_id = 'post-media'
  and public.can_see_posts(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

-- Escrita/gestão: cada conta só na SUA pasta.
drop policy if exists post_media_write_own on storage.objects;
create policy post_media_write_own on storage.objects for insert with check (
  bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists post_media_update_own on storage.objects;
create policy post_media_update_own on storage.objects for update using (
  bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists post_media_delete_own on storage.objects;
create policy post_media_delete_own on storage.objects for delete using (
  bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
);
