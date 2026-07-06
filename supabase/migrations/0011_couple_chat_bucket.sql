-- Phase 5b — private bucket for ACCOUNT-couple chat media (photos + voice notes).
--
-- The original `couple-media` bucket is PUBLIC: any object URL is world-
-- fetchable forever, so a leaked/saved chat-media URL bypasses the row RLS we
-- added in 0010. For real ACCOUNT couples (whose couple_id is a space uuid) chat
-- media now goes to a new PRIVATE bucket `couple-chat`, served only via short-
-- lived signed URLs, with object access scoped to the couple's ACCEPTED members.
--
-- Deliberately membership-ONLY (no legacy/anon branch): the object's first path
-- segment must be a uuid naming a space you are an accepted member of. A non-uuid
-- or empty first segment makes as_uuid() NULL -> is_active_space_member(NULL,…)
-- false -> DENIED. Combined with `to authenticated`, anon cannot read or write
-- this bucket at all — closing the "anyone can upload under any non-uuid prefix"
-- hole a permissive legacy branch would open.
--
-- The single legacy pair (anonymous, non-uuid couple_id) keeps uploading chat
-- media to the still-public `couple-media` bucket exactly as before — the client
-- picks the bucket by whether the couple_id is a space uuid, so nothing is
-- locked out. Profile avatars also stay in `couple-media` (low sensitivity).
-- Depends on 0010 (as_uuid, is_active_space_member).

-- Private, 25MB per-object cap. No mime allowlist: access is already gated to
-- the two accepted members of the space in the path, so there is no anonymous
-- abuse surface to constrain by type — and an allowlist would risk rejecting
-- legitimate recorder MIME strings (e.g. 'audio/webm;codecs=opus').
insert into storage.buckets (id, name, public, file_size_limit)
values ('couple-chat', 'couple-chat', false, 26214400)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

-- Path is `<space_uuid>/<conversation>/<uuid>.<ext>`. Both read (which governs
-- signed-URL creation) and write require accepted membership of that space.
drop policy if exists couple_chat_select on storage.objects;
create policy couple_chat_select on storage.objects for select to authenticated using (
  bucket_id = 'couple-chat'
  and public.is_active_space_member(public.as_uuid((storage.foldername(name))[1]), auth.uid())
);

drop policy if exists couple_chat_insert on storage.objects;
create policy couple_chat_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'couple-chat'
  and public.is_active_space_member(public.as_uuid((storage.foldername(name))[1]), auth.uid())
);
