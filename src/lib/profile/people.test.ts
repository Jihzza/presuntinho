import { describe, it, expect } from 'vitest';
import { profileFor, PEOPLE } from './people';

describe('profileFor (multi-tenant)', () => {
  it('returns the legacy profiles for their ids', () => {
    expect(profileFor('fatma')).toBe(PEOPLE.fatma);
    expect(profileFor('daniel')).toBe(PEOPLE.daniel);
  });

  it('returns a GENERIC (non-Fatma) profile for an onboarded member uuid', () => {
    const p = profileFor('7b2c1a90-uuid-member' as never);
    expect(p.nameKey).toBe('profile.generic.name');
    expect(p.nameKey).not.toBe(PEOPLE.fatma.nameKey);
    expect(p.bioKey).toBe('profile.generic.bio');
    // carries the real id (for the display guard), not 'fatma'
    expect(p.id).toBe('7b2c1a90-uuid-member');
  });

  it('falls back to fatma only when there is no id at all', () => {
    expect(profileFor(null)).toBe(PEOPLE.fatma);
    expect(profileFor(undefined)).toBe(PEOPLE.fatma);
  });
});
