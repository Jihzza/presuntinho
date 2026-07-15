import { describe, expect, it, vi } from 'vitest';
import { CHAT_STICKERS, createStickerBlob, isGifFile } from './chat-stickers';

describe('local chat stickers and GIFs', () => {
  it('recognizes GIF MIME types and mobile files whose MIME is missing', () => {
    expect(isGifFile({ type: 'image/gif', name: 'animation.bin' })).toBe(true);
    expect(isGifFile({ type: '', name: 'ABRACO.GIF' })).toBe(true);
    expect(isGifFile({ type: 'image/png', name: 'still.png' })).toBe(false);
  });

  it('renders the built-in pack locally to a transparent PNG Blob', async () => {
    const fillText = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect: vi.fn(),
        fillText,
        textAlign: '',
        textBaseline: '',
        font: '',
        shadowColor: '',
        shadowBlur: 0,
        shadowOffsetY: 0
      }),
      toBlob: (callback: (blob: Blob | null) => void, type: string) =>
        callback(new Blob(['png'], { type }))
    };
    const documentRef = { createElement: vi.fn(() => canvas) };

    const blob = await createStickerBlob(CHAT_STICKERS[0], documentRef as never);

    expect(documentRef.createElement).toHaveBeenCalledWith('canvas');
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(512);
    expect(fillText).toHaveBeenCalledWith(CHAT_STICKERS[0].emoji, 256, 260, 460);
    expect(blob.type).toBe('image/png');
  });
});
