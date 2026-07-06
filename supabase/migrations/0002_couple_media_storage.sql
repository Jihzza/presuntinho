-- Storage bucket for couple chat media (photos + voice notes). Public bucket so
-- object URLs load without a session; the path carries a uuid so URLs are
-- unguessable. Uploads are allowed for anon/authenticated (same posture as the
-- shipped anon key). NO broad SELECT policy on storage.objects — a public bucket
-- serves object URLs directly, and adding one would let clients LIST every file.

insert into storage.buckets (id, name, public)
values ('couple-media', 'couple-media', true)
on conflict (id) do update set public = true;

drop policy if exists couple_media_insert on storage.objects;
create policy couple_media_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'couple-media');
