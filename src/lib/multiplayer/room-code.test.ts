import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidRoomCode, makeRoomCode, normalizeRoomCode, roomInviteUrl } from './room-code';

describe('multiplayer room codes', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      getRandomValues(bytes: Uint8Array) {
        bytes.set([0, 1, 2, 3, 4, 5]);
        return bytes;
      }
    });
  });

  it('generates six-character codes from the unambiguous alphabet', () => {
    expect(makeRoomCode()).toBe('ABCDEF');
    expect(isValidRoomCode(makeRoomCode())).toBe(true);
  });

  it('normalizes codes and rejects ambiguous or malformed values', () => {
    expect(normalizeRoomCode(' abcd23 ')).toBe('ABCD23');
    expect(isValidRoomCode(' abcd23 ')).toBe(true);
    expect(isValidRoomCode('ABCD01')).toBe(false);
    expect(isValidRoomCode('ABCDE')).toBe(false);
    expect(isValidRoomCode('ABCDEF7')).toBe(false);
  });

  it('builds a complete deep link without a duplicate slash', () => {
    expect(roomInviteUrl('abcd23', 'https://presuntinho.love/')).toBe(
      'https://presuntinho.love/secrets/versus/?join=ABCD23'
    );
  });

  it('does not create a link for an invalid code', () => {
    expect(() => roomInviteUrl('bad', 'https://presuntinho.love')).toThrow('invalid room code');
  });
});
