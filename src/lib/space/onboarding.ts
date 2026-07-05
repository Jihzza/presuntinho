// ─────────────────────────────────────────────────────────────────────────────
// Presuntinho — onboarding state machine (multi-user Phase 1A)
//
// Pure logic: no DB, no session, no DOM. The /onboarding route drives this and
// does the side-effecting glue (hash the password, write the registry, set the
// session). Kept pure so it is trivially unit-testable and can't corrupt data.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Membership,
  MemberSecret,
  OnboardingState,
  OnboardingStep,
  Space,
  SpaceKind
} from './types';

export function initialOnboarding(): OnboardingState {
  return {
    step: 'intent',
    kind: null,
    displayName: '',
    emoji: '🐷',
    accent: 'var(--accent)',
    mascotId: '',
    sharePrivateOnInvite: false, // private-first default
    secret: ''
  };
}

/** The step order for a given intent — solo has no one to invite. */
export function stepsFor(kind: SpaceKind | null): OnboardingStep[] {
  const base: OnboardingStep[] = ['intent', 'profile', 'privacy'];
  if (kind && kind !== 'solo') base.push('invite');
  base.push('done');
  return base;
}

/** Whether the wizard can leave the current step (per-step validation). */
export function canAdvance(state: OnboardingState): boolean {
  switch (state.step) {
    case 'intent':
      return state.kind !== null;
    case 'profile':
      return state.displayName.trim().length > 0 && state.mascotId.trim().length > 0;
    case 'privacy':
      // Password is ALWAYS required (product decision) — min 4 chars.
      return state.secret.trim().length >= 4;
    case 'invite':
      return true; // invite is optional / can be skipped
    case 'done':
      return true;
  }
}

export function nextStep(state: OnboardingState): OnboardingState {
  const order = stepsFor(state.kind);
  const i = order.indexOf(state.step);
  const next = order[Math.min(i + 1, order.length - 1)];
  return { ...state, step: next };
}

export function prevStep(state: OnboardingState): OnboardingState {
  const order = stepsFor(state.kind);
  const i = order.indexOf(state.step);
  const prev = order[Math.max(i - 1, 0)];
  return { ...state, step: prev };
}

/** Progress fraction (0..1) for a progress bar. */
export function progress(state: OnboardingState): number {
  const order = stepsFor(state.kind);
  const i = order.indexOf(state.step);
  return order.length > 1 ? i / (order.length - 1) : 1;
}

/** The IndexedDB name for a member — legacy names are never produced here. */
export function dbNameForMember(memberId: string): string {
  return `presuntinho-${memberId}`;
}

/** Build the Space row from the wizard state (pure). */
export function newSpace(state: OnboardingState, ownerId: string, now: number): Space {
  return {
    id: `space-${ownerId}`,
    kind: state.kind ?? 'solo',
    name: '',
    ownerMemberId: ownerId,
    createdAt: now
  };
}

/** Build the owner Membership from the wizard state (pure). */
export function newOwnerMembership(
  state: OnboardingState,
  spaceId: string,
  ownerId: string,
  now: number,
  secret?: MemberSecret
): Membership {
  return {
    id: ownerId,
    spaceId,
    displayName: state.displayName.trim(),
    emoji: state.emoji,
    accent: state.accent,
    role: 'owner',
    status: 'active',
    dbName: dbNameForMember(ownerId),
    mascotId: state.mascotId || undefined,
    secret,
    createdAt: now
  };
}
