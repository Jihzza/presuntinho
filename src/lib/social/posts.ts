// Posts de perfil (estilo Twitter, v1) — texto até 500 chars, likes e
// comentários. Visibilidade imposta pela RLS (0016): o autor e os seus
// contactos ACEITES; para mais ninguém as queries devolvem simplesmente vazio.

import { getSupabaseClient } from '$lib/multiplayer/client';
import { getAuthUser, type Account } from '$lib/account/auth';

export interface Post {
  id: string;
  author: string;
  body: string;
  created_at: string;
  likeCount: number;
  commentCount: number;
  /** Eu já gostei deste post? */
  likedByMe: boolean;
}

export interface PostComment {
  id: string;
  post_id: string;
  author: string;
  body: string;
  created_at: string;
  /** Conta resolvida (nome/emoji/avatar) para o render. */
  account?: Account;
}

const sb = () => getSupabaseClient();

/** Posts de um autor, mais recentes primeiro (com contagens + o meu like). */
export async function listPosts(authorId: string, limit = 50): Promise<Post[]> {
  const me = await getAuthUser();
  const { data, error } = await sb()
    .from('posts')
    .select('id, author, body, created_at, post_likes(account), post_comments(count)')
    .eq('author', authorId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  type Row = {
    id: string;
    author: string;
    body: string;
    created_at: string;
    post_likes: { account: string }[];
    post_comments: { count: number }[];
  };
  return ((data as Row[]) ?? []).map((r) => ({
    id: r.id,
    author: r.author,
    body: r.body,
    created_at: r.created_at,
    likeCount: r.post_likes?.length ?? 0,
    commentCount: r.post_comments?.[0]?.count ?? 0,
    likedByMe: Boolean(me && r.post_likes?.some((l) => l.account === me.id))
  }));
}

export async function createPost(body: string): Promise<void> {
  const me = await getAuthUser();
  if (!me) throw new Error('not signed in');
  const trimmed = body.trim();
  if (!trimmed) throw new Error('empty');
  const { error } = await sb().from('posts').insert({ author: me.id, body: trimmed.slice(0, 500) });
  if (error) throw error;
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await sb().from('posts').delete().eq('id', postId);
  if (error) throw error;
}

/** Alterna o meu like; devolve o novo estado. */
export async function toggleLike(postId: string, likedByMe: boolean): Promise<boolean> {
  const me = await getAuthUser();
  if (!me) throw new Error('not signed in');
  if (likedByMe) {
    const { error } = await sb().from('post_likes').delete().eq('post_id', postId).eq('account', me.id);
    if (error) throw error;
    return false;
  }
  const { error } = await sb()
    .from('post_likes')
    .upsert({ post_id: postId, account: me.id }, { onConflict: 'post_id,account' });
  if (error) throw error;
  return true;
}

/** Comentários de um post (ascendente) com as contas resolvidas. */
export async function listComments(postId: string): Promise<PostComment[]> {
  const { data, error } = await sb()
    .from('post_comments')
    .select('id, post_id, author, body, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  const rows = (data as PostComment[]) ?? [];
  const ids = [...new Set(rows.map((c) => c.author))];
  if (ids.length) {
    const { data: accs } = await sb()
      .from('accounts')
      .select('id, handle, display_name, emoji, avatar_url, bio')
      .in('id', ids);
    const map = new Map(((accs as Account[]) ?? []).map((a) => [a.id, a]));
    for (const c of rows) c.account = map.get(c.author);
  }
  return rows;
}

export async function addComment(postId: string, body: string): Promise<void> {
  const me = await getAuthUser();
  if (!me) throw new Error('not signed in');
  const trimmed = body.trim();
  if (!trimmed) throw new Error('empty');
  const { error } = await sb()
    .from('post_comments')
    .insert({ post_id: postId, author: me.id, body: trimmed.slice(0, 300) });
  if (error) throw error;
}

/** Tempo relativo curto ("2 min", "3 h", "ontem", "12/07"). */
export function timeAgo(iso: string, locale = 'pt-PT'): string {
  const ts = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 7) return `${days} d`;
  try {
    return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  } catch {
    return `${days} d`;
  }
}
