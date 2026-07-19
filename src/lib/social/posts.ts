// Posts de perfil v2 — texto até 500 chars E/OU anexos de media (fotos,
// vídeo, áudio, ficheiros), likes, comentários, post fixado e edição.
// Visibilidade imposta pela RLS (0016/0017): o autor e os seus contactos
// ACEITES; a media vive no bucket PRIVADO 'post-media' e é servida por
// signed URLs de curta duração (mesmo padrão do chat).

import { getSupabaseClient } from '$lib/multiplayer/client';
import { getAuthUser, type Account } from '$lib/account/auth';

export type PostMediaKind = 'image' | 'video' | 'audio' | 'file';

export interface PostMedia {
  kind: PostMediaKind;
  /** Caminho no bucket post-media: <author-uuid>/<uuid>.<ext> */
  path: string;
  mime: string;
  /** Nome original (mostrado nos cartões de ficheiro). */
  name: string;
  /** Tamanho em bytes depois de qualquer compressão. */
  size: number;
  width?: number;
  height?: number;
}

export interface Post {
  id: string;
  author: string;
  body: string;
  created_at: string;
  media: PostMedia[];
  pinned: boolean;
  edited_at: string | null;
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

export interface ProfileStats {
  friends: number;
  likesReceived: number;
  posts: number;
}

const sb = () => getSupabaseClient();

// ── Regras de anexos (estilo Twitter: 1–4 imagens OU 1 vídeo; extra nosso:
//    áudio e ficheiros genéricos) ────────────────────────────────────────────

export const MAX_ATTACHMENTS = 4;
export const MAX_IMAGE_SIDE = 1600;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function classifyFile(mime: string): PostMediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

export type AttachmentError = 'too-many' | 'one-video' | 'one-audio' | 'video-too-big' | 'audio-too-big' | 'file-too-big';

/** Valida uma lista candidata de anexos (pura, testável).
 *  Devolve null quando OK, ou o primeiro problema encontrado. */
export function validateAttachments(list: { kind: PostMediaKind; size: number }[]): AttachmentError | null {
  if (list.length > MAX_ATTACHMENTS) return 'too-many';
  if (list.filter((f) => f.kind === 'video').length > 1) return 'one-video';
  if (list.filter((f) => f.kind === 'audio').length > 1) return 'one-audio';
  for (const f of list) {
    if (f.kind === 'video' && f.size > MAX_VIDEO_BYTES) return 'video-too-big';
    if (f.kind === 'audio' && f.size > MAX_AUDIO_BYTES) return 'audio-too-big';
    if (f.kind === 'file' && f.size > MAX_FILE_BYTES) return 'file-too-big';
  }
  return null;
}

/** "1.2 MB" / "340 kB" — para os cartões de ficheiro. */
export function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${bytes} B`;
}

/** Divide texto em segmentos texto/link (só https), para render SEGURO via
 *  {#each} — nunca {@html}. */
export function linkify(text: string): { type: 'text' | 'link'; value: string }[] {
  const out: { type: 'text' | 'link'; value: string }[] = [];
  const re = /https:\/\/[^\s<>"')\]]+/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ type: 'text', value: text.slice(last, i) });
    out.push({ type: 'link', value: m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

// ── Compressão de imagem (mesmo espírito do avatar: canvas → webp) ──────────

async function toWebpMax(file: Blob, maxSide = MAX_IMAGE_SIDE): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('decode'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.85));
    if (!blob) throw new Error('encode');
    return { blob, width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function extFor(kind: PostMediaKind, file: File): string {
  if (kind === 'image') return 'webp';
  const fromName = /\.([a-z0-9]{1,8})$/i.exec(file.name)?.[1]?.toLowerCase();
  return fromName ?? (file.type.split('/')[1] || 'bin');
}

/** Faz upload dos anexos para post-media/<uid>/… e devolve os PostMedia. */
export async function uploadPostMedia(files: File[]): Promise<PostMedia[]> {
  const me = await getAuthUser();
  if (!me) throw new Error('not signed in');
  const out: PostMedia[] = [];
  for (const file of files) {
    const kind = classifyFile(file.type);
    let blob: Blob = file;
    let width: number | undefined;
    let height: number | undefined;
    let mime = file.type || 'application/octet-stream';
    if (kind === 'image') {
      const r = await toWebpMax(file);
      blob = r.blob;
      width = r.width;
      height = r.height;
      mime = 'image/webp';
    }
    const path = `${me.id}/${crypto.randomUUID()}.${extFor(kind, file)}`;
    const { error } = await sb().storage.from('post-media').upload(path, blob, { contentType: mime });
    if (error) throw error;
    out.push({ kind, path, mime, name: file.name, size: blob.size, width, height });
  }
  return out;
}

// ── Signed URLs (cache em memória, TTL 1 h com margem) ──────────────────────

const SIGN_TTL = 3600;
const urlCache = new Map<string, { url: string; expires: number }>();

/** Resolve URLs assinados para todos os paths dados (em lote, com cache). */
export async function resolveMediaUrls(media: PostMedia[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const m of media) {
    const hit = urlCache.get(m.path);
    if (hit && hit.expires > now) out[m.path] = hit.url;
    else missing.push(m.path);
  }
  if (missing.length) {
    const { data, error } = await sb().storage.from('post-media').createSignedUrls(missing, SIGN_TTL);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.signedUrl && row.path) {
        out[row.path] = row.signedUrl;
        urlCache.set(row.path, { url: row.signedUrl, expires: now + (SIGN_TTL - 120) * 1000 });
      }
    }
  }
  return out;
}

// ── CRUD ────────────────────────────────────────────────────────────────────

function normalizeMedia(raw: unknown): PostMedia[] {
  return Array.isArray(raw) ? (raw as PostMedia[]) : [];
}

/** Posts de um autor — fixado primeiro, depois mais recentes (com contagens +
 *  o meu like). Três queries PLANAS de propósito — nada de embeds/agregados
 *  do PostgREST, cuja disponibilidade varia com a configuração e falhava em
 *  silêncio (o perfil mostrava "sem publicações" com posts visíveis pela RLS). */
export async function listPosts(authorId: string, limit = 50): Promise<Post[]> {
  const me = await getAuthUser();
  const { data, error } = await sb()
    .from('posts')
    .select('id, author, body, created_at, media, pinned, edited_at')
    .eq('author', authorId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  type Row = {
    id: string;
    author: string;
    body: string;
    created_at: string;
    media: unknown;
    pinned: boolean;
    edited_at: string | null;
  };
  const rows = (data as Row[]) ?? [];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const [likesRes, commentsRes] = await Promise.all([
    sb().from('post_likes').select('post_id, account').in('post_id', ids),
    sb().from('post_comments').select('post_id').in('post_id', ids)
  ]);
  const likes = (likesRes.data as { post_id: string; account: string }[] | null) ?? [];
  const comments = (commentsRes.data as { post_id: string }[] | null) ?? [];

  return rows.map((r) => ({
    id: r.id,
    author: r.author,
    body: r.body,
    created_at: r.created_at,
    media: normalizeMedia(r.media),
    pinned: r.pinned,
    edited_at: r.edited_at,
    likeCount: likes.filter((l) => l.post_id === r.id).length,
    commentCount: comments.filter((c) => c.post_id === r.id).length,
    likedByMe: Boolean(me && likes.some((l) => l.post_id === r.id && l.account === me.id))
  }));
}

export async function createPost(body: string, files: File[] = []): Promise<void> {
  const me = await getAuthUser();
  if (!me) throw new Error('not signed in');
  const trimmed = body.trim();
  if (!trimmed && !files.length) throw new Error('empty');
  const media = files.length ? await uploadPostMedia(files) : [];
  const { error } = await sb()
    .from('posts')
    .insert({ author: me.id, body: trimmed.slice(0, 500), media });
  if (error) throw error;
}

/** Edita o texto de um post meu (marca edited_at, estilo "edited" do X). */
export async function updatePost(postId: string, body: string, hasMedia: boolean): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed && !hasMedia) throw new Error('empty');
  const { error } = await sb()
    .from('posts')
    .update({ body: trimmed.slice(0, 500), edited_at: new Date().toISOString() })
    .eq('id', postId);
  if (error) throw error;
}

/** Fixa/desafixa um post meu (no máx. 1 fixado — desafixa o anterior). */
export async function setPinned(postId: string, on: boolean): Promise<void> {
  const me = await getAuthUser();
  if (!me) throw new Error('not signed in');
  if (on) {
    const { error: unpinErr } = await sb().from('posts').update({ pinned: false }).eq('author', me.id).eq('pinned', true);
    if (unpinErr) throw unpinErr;
  }
  const { error } = await sb().from('posts').update({ pinned: on }).eq('id', postId);
  if (error) throw error;
}

export async function deletePost(postId: string, media: PostMedia[] = []): Promise<void> {
  const { error } = await sb().from('posts').delete().eq('id', postId);
  if (error) throw error;
  if (media.length) {
    // Limpeza best-effort do storage — a linha já foi; órfãos só custam espaço.
    try {
      await sb().storage.from('post-media').remove(media.map((m) => m.path));
    } catch (e) {
      console.warn('[posts] media cleanup failed', e);
    }
  }
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

/** Estatísticas da tripla do perfil (amigos / ❤ recebidos / posts) via RPC
 *  security definer (0018) — a RLS não deixa contar amizades de terceiros. */
export async function profileStats(targetId: string): Promise<ProfileStats> {
  const { data, error } = await sb().rpc('profile_stats', { p_target: targetId });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { friends: number; likes_received: number; posts: number }
    | undefined;
  return {
    friends: Number(row?.friends ?? 0),
    likesReceived: Number(row?.likes_received ?? 0),
    posts: Number(row?.posts ?? 0)
  };
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
