// Turn a picked image File into a small, square-ish data-URI safe to store in
// IndexedDB (and to sync later). We downscale to <=256px and re-encode as WebP
// (falling back to JPEG) so a phone photo doesn't bloat the registry row.

const MAX = 256;

export async function fileToProfilePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not an image');
  const dataUrl = await readAsDataUrl(file);
  try {
    return await downscale(dataUrl);
  } catch {
    // If canvas processing fails (rare), fall back to the raw data-URI.
    return dataUrl;
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function downscale(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('no 2d context'));
      ctx.drawImage(img, 0, 0, w, h);
      const webp = canvas.toDataURL('image/webp', 0.82);
      resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('decode failed'));
    img.src = dataUrl;
  });
}
