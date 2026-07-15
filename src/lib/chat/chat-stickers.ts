export const CHAT_STICKERS = [
  { id: 'ham-love', emoji: '🐷💖' },
  { id: 'big-love', emoji: '🥰' },
  { id: 'kiss', emoji: '😘' },
  { id: 'hug', emoji: '🫂' },
  { id: 'laugh', emoji: '😂' },
  { id: 'party', emoji: '🥳' },
  { id: 'miss-you', emoji: '🥺' },
  { id: 'fire', emoji: '🔥' }
] as const;

export type ChatSticker = (typeof CHAT_STICKERS)[number];

export function isGifFile(file: Pick<File, 'type' | 'name'>): boolean {
  return file.type.toLowerCase() === 'image/gif' || /\.gif$/i.test(file.name);
}

/** Render the small built-in sticker pack locally. No search query, image or
 * identifier is sent to an advertising/paid GIF provider. */
export async function createStickerBlob(
  sticker: ChatSticker,
  documentRef: Pick<Document, 'createElement'> = document
): Promise<Blob> {
  const canvas = documentRef.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('sticker_canvas_unavailable');

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 176px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  context.shadowColor = 'rgba(76, 28, 60, .24)';
  context.shadowBlur = 18;
  context.shadowOffsetY = 10;
  context.fillText(sticker.emoji, 256, 260, 460);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('sticker_encode_failed')),
      'image/png'
    );
  });
}
