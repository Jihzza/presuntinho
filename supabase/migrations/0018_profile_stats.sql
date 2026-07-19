-- Estatísticas do perfil (tripla estilo Instagram/TikTok): nº de amigos e
-- ❤ recebidos. A RLS das connections só deixa ver as PRÓPRIAS ligações, por
-- isso a contagem de amigos de outra pessoa vem por RPC security definer.
-- Likes/posts só contam quando o viewer pode ver os posts (amigos aceites).

create or replace function public.profile_stats(p_target uuid)
returns table (friends bigint, likes_received bigint, posts bigint)
language sql security definer set search_path = '' stable as $$
  select
    (select count(*) from public.connections c
      where c.status = 'accepted' and (c.requester = p_target or c.addressee = p_target)),
    case when public.can_see_posts(auth.uid(), p_target) then
      (select count(*) from public.post_likes l
        join public.posts p on p.id = l.post_id where p.author = p_target)
    else 0 end,
    case when public.can_see_posts(auth.uid(), p_target) then
      (select count(*) from public.posts p where p.author = p_target)
    else 0 end;
$$;
grant execute on function public.profile_stats(uuid) to anon, authenticated;
