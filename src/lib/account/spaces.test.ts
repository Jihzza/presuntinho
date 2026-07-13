import { describe, expect, it } from 'vitest';
import { isCoupleActive, singleActiveCouple, type Space } from './spaces';

function couple(id: string, statuses: Array<'accepted' | 'pending'>): Space {
  return {
    id,
    kind: 'couple',
    name: null,
    emoji: null,
    owner: 'a',
    members: statuses.map((status, index) => ({
      id: index === 0 ? 'a' : `member-${index}`,
      handle: `member${index}`,
      display_name: `Member ${index}`,
      emoji: null,
      avatar_url: null,
      bio: null,
      role: index === 0 ? 'owner' : 'member',
      status
    }))
  };
}

describe('active couple selection', () => {
  it('requires exactly two mutually accepted members', () => {
    expect(isCoupleActive(couple('valid', ['accepted', 'accepted']))).toBe(true);
    expect(isCoupleActive(couple('pending', ['accepted', 'pending']))).toBe(false);
    expect(isCoupleActive(couple('group-shaped', ['accepted', 'accepted', 'accepted']))).toBe(false);
  });

  it('returns one unambiguous active couple', () => {
    const active = couple('only', ['accepted', 'accepted']);
    expect(singleActiveCouple([couple('pending', ['accepted', 'pending']), active])).toBe(active);
  });

  it('fails closed when legacy data contains multiple active couples', () => {
    expect(
      singleActiveCouple([
        couple('first', ['accepted', 'accepted']),
        couple('second', ['accepted', 'accepted'])
      ])
    ).toBeNull();
  });
});
