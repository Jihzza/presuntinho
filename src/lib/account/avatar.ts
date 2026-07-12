// Upload da foto de perfil — reduz para 512px webp e envia para o bucket
// público 'avatars' (pasta = o próprio uid, RLS 0016). Devolve o URL público
// com cache-bust, pronto a guardar em accounts.avatar_url.

import { getSupabaseClient } from '$lib/multiplayer/client';
import { getAuthUser } from '$lib/account/auth';

async function toSquareWebp(file: Blob, size = 512): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('decode'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(size, side);
    canvas.getContext('2d')?.drawImage(img, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.86));
    if (!blob) throw new Error('encode');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Envia a foto e devolve o URL público (com ?v= para furar caches). */
export async function uploadAvatar(file: Blob): Promise<string> {
  const me = await getAuthUser();
  if (!me) throw new Error('not signed in');
  if (!file.type.startsWith('image/')) throw new Error('not an image');
  const webp = await toSquareWebp(file);
  const path = `${me.id}/avatar.webp`;
  const { error } = await getSupabaseClient()
    .storage.from('avatars')
    .upload(path, webp, { contentType: 'image/webp', upsert: true });
  if (error) throw error;
  const { data } = getSupabaseClient().storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
