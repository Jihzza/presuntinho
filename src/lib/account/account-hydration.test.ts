import { describe, expect, it } from 'vitest';
import { isCurrentAccountHydration } from './account-hydration';

describe('account hydration epoch', () => {
  it('allows only the latest response for the still-current user', () => {
    expect(isCurrentAccountHydration(2, 2, 'user-b', 'user-b')).toBe(true);
    expect(isCurrentAccountHydration(1, 2, 'user-a', 'user-b')).toBe(false);
    expect(isCurrentAccountHydration(2, 2, 'user-a', 'user-b')).toBe(false);
    expect(isCurrentAccountHydration(2, 2, 'user-b', null)).toBe(false);
  });
});
