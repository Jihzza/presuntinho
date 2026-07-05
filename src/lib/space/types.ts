// ─────────────────────────────────────────────────────────────────────────────
// Presuntinho — Space + Member domain (multi-user Phase 1A)
//
// This is the foundation that lets the app grow past its two hardcoded profiles
// (fatma / daniel) into dynamic members organised in "spaces" (a couple, a
// group, a solo person), WITHOUT moving any stored data and WITHOUT widening the
// compile-time `ProfileId = 'fatma' | 'daniel'` union in this phase.
//
// The whole roster lives in a SEPARATE IndexedDB (`presuntinho-registry`, see
// registry-db.ts) so none of this touches the existing per-profile databases.
// A member's `id` is the string that already flows through db()/session/chat —
// for legacy users it stays 'fatma' / 'daniel'; new members get a uuid.
// ─────────────────────────────────────────────────────────────────────────────

import type { ProfileId } from '$lib/auth/hash';

/** A member's stable id. Legacy: 'fatma' | 'daniel'. New members: a uuid. */
export type MemberId = string;

export type SpaceKind = 'solo' | 'couple' | 'friends' | 'family' | 'group';

/** How many active members a space of each kind may hold. */
export const CAPACITY: Record<SpaceKind, number> = {
  solo: 1,
  couple: 2,
  friends: 8,
  family: 12,
  group: 8
};

/** The one space every current install already has (fatma + daniel). */
export const DEFAULT_SPACE_ID = 'default';

export interface Space {
  id: string;
  kind: SpaceKind;
  /** Optional user-visible name ('Fatma & Daniel', 'A minha casa'); '' = none. */
  name: string;
  ownerMemberId: MemberId;
  createdAt: number;
}

/**
 * A per-member password (PBKDF2), stored on the member row for non-legacy users.
 * Verified with verifyPassword(pw, salt, hash) — the iteration count lives in
 * auth/hash.ts (fixed), so it is not duplicated here.
 */
export interface MemberSecret {
  hash: string;
  salt: string;
}

export interface Membership {
  id: MemberId;
  spaceId: string;
  displayName: string;
  emoji: string;
  accent: string;
  role: 'owner' | 'member';
  status: 'active' | 'invited' | 'pending';
  /** Present only for the two legacy members; drives the compatibility adapter. */
  legacyProfileId?: ProfileId;
  /**
   * IMMUTABLE IndexedDB name for this member's data. Stored once at creation and
   * never re-derived — legacy: 'presuntinho' / 'presuntinho-daniel'; new members:
   * 'presuntinho-<uuid>'. This freezes the fatma→'presuntinho' special case.
   */
  dbName: string;
  mascotId?: string;
  /** Optional per-member password (legacy members auth via the existing flow). */
  secret?: MemberSecret;
  createdAt: number;
}

/** A pending cross-device invite (redeemed via /juntar/<code>). */
export interface Invite {
  code: string;
  spaceId: string;
  status: 'open' | 'redeemed' | 'expired';
  createdAt: number;
  expiresAt: number;
}

/** The composed view a screen consumes. */
export interface UserProfile {
  member: Membership;
  space: Space;
}

export type OnboardingStep = 'intent' | 'profile' | 'privacy' | 'invite' | 'done';

export interface OnboardingState {
  step: OnboardingStep;
  kind: SpaceKind | null;
  displayName: string;
  emoji: string;
  accent: string;
  mascotId: string;
  /** Privacy default — private-first. Whether to share private data on invite. */
  sharePrivateOnInvite: boolean;
  /** Plaintext password held only in memory during the wizard (never persisted). */
  secret: string;
  completedAt?: number;
}
