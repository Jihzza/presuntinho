import { describe, expect, it } from 'vitest';
import { dmConversationId } from './dm-id';

const A = '18ef18ff-0001-485a-b0ce-08c535bc5c6e';
const B = 'e9f24d52-6bec-4ca0-805c-6641c4c0dd46';

describe('dmConversationId', () => {
  it('é simétrico — os dois lados derivam o MESMO id', () => {
    expect(dmConversationId(A, B)).toBe(dmConversationId(B, A));
  });

  it('ordena os uuids ascendentemente (formato canónico da RLS is_dm_member)', () => {
    expect(dmConversationId(B, A)).toBe(`dm:${A}:${B}`);
  });

  it('bate certo com o regex da política 0013 (dm:<uuid>:<uuid>)', () => {
    const RLS_RE =
      /^dm:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(dmConversationId(A, B)).toMatch(RLS_RE);
  });
});
