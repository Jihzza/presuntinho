import { describe, it, expect } from 'vitest';
import {
  initialOnboarding,
  stepsFor,
  canAdvance,
  nextStep,
  prevStep,
  progress,
  dbNameForMember,
  newSpace,
  newOwnerMembership
} from './onboarding';
import { membershipToProfileId } from './legacy-adapter';
import type { Membership, OnboardingState } from './types';

describe('onboarding state machine', () => {
  it('starts on intent with private-first defaults', () => {
    const s = initialOnboarding();
    expect(s.step).toBe('intent');
    expect(s.kind).toBeNull();
    expect(s.sharePrivateOnInvite).toBe(false);
  });

  it('solo skips the invite step; couple includes it', () => {
    expect(stepsFor('solo')).toEqual(['intent', 'profile', 'privacy', 'done']);
    expect(stepsFor('couple')).toEqual(['intent', 'profile', 'privacy', 'invite', 'done']);
    expect(stepsFor(null)).toEqual(['intent', 'profile', 'privacy', 'done']);
  });

  it('gates each step: intent needs a kind, profile needs name+mascot, privacy needs a 4+ char password', () => {
    let s = initialOnboarding();
    expect(canAdvance(s)).toBe(false); // no kind yet
    s = { ...s, kind: 'solo' };
    expect(canAdvance(s)).toBe(true);

    s = { ...s, step: 'profile' };
    expect(canAdvance(s)).toBe(false); // no name/mascot
    s = { ...s, displayName: 'Sara', mascotId: 'porquinho' };
    expect(canAdvance(s)).toBe(true);

    s = { ...s, step: 'privacy', secret: '123' };
    expect(canAdvance(s)).toBe(false); // too short
    s = { ...s, secret: '1234' };
    expect(canAdvance(s)).toBe(true); // password ALWAYS required
  });

  it('navigates forward/back without leaving the ordered path (solo skips invite)', () => {
    let s: OnboardingState = { ...initialOnboarding(), kind: 'solo' };
    s = nextStep(s); // profile
    expect(s.step).toBe('profile');
    s = nextStep(s); // privacy
    expect(s.step).toBe('privacy');
    s = nextStep(s); // done (invite skipped for solo)
    expect(s.step).toBe('done');
    s = nextStep(s); // clamp at done
    expect(s.step).toBe('done');
    s = prevStep(s); // privacy
    expect(s.step).toBe('privacy');
  });

  it('couple routes through the invite step', () => {
    let s: OnboardingState = { ...initialOnboarding(), kind: 'couple', step: 'privacy' };
    s = nextStep(s);
    expect(s.step).toBe('invite');
    s = nextStep(s);
    expect(s.step).toBe('done');
  });

  it('progress goes 0..1 across the path', () => {
    const s: OnboardingState = { ...initialOnboarding(), kind: 'solo' };
    expect(progress({ ...s, step: 'intent' })).toBe(0);
    expect(progress({ ...s, step: 'done' })).toBe(1);
    expect(progress({ ...s, step: 'privacy' })).toBeGreaterThan(0);
  });

  it('builds a member DB name that can never collide with the legacy names', () => {
    expect(dbNameForMember('abc-123')).toBe('presuntinho-abc-123');
    // legacy fatma DB is bare 'presuntinho'; a uuid member can't produce that.
    expect(dbNameForMember('abc-123')).not.toBe('presuntinho');
  });

  it('builds space + owner membership from wizard state', () => {
    const state: OnboardingState = {
      ...initialOnboarding(),
      kind: 'couple',
      displayName: '  Nour ',
      emoji: '🐱',
      accent: 'var(--accent)',
      mascotId: 'gata-anime',
      secret: 'hunter2'
    };
    const space = newSpace(state, 'm1', 1000);
    expect(space.kind).toBe('couple');
    expect(space.ownerMemberId).toBe('m1');

    const member = newOwnerMembership(state, space.id, 'm1', 1000, { hash: 'h', salt: 's' });
    expect(member.displayName).toBe('Nour'); // trimmed
    expect(member.role).toBe('owner');
    expect(member.status).toBe('active');
    expect(member.dbName).toBe('presuntinho-m1');
    expect(member.secret).toEqual({ hash: 'h', salt: 's' });
  });
});

describe('legacy adapter bridge', () => {
  it('maps legacy members to their real ProfileId and new members to their uuid', () => {
    const fatma: Membership = {
      id: 'fatma',
      spaceId: 'default',
      displayName: 'Fatma',
      emoji: '🌙',
      accent: 'var(--accent)',
      role: 'owner',
      status: 'active',
      legacyProfileId: 'fatma',
      dbName: 'presuntinho',
      createdAt: 0
    };
    expect(membershipToProfileId(fatma)).toBe('fatma');

    const newbie: Membership = {
      id: 'uuid-xyz',
      spaceId: 'space-uuid-xyz',
      displayName: 'Nour',
      emoji: '🐱',
      accent: 'var(--accent)',
      role: 'owner',
      status: 'active',
      dbName: 'presuntinho-uuid-xyz',
      createdAt: 0
    };
    expect(membershipToProfileId(newbie)).toBe('uuid-xyz');
  });
});
