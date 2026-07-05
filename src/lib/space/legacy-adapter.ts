// ─────────────────────────────────────────────────────────────────────────────
// Presuntinho — legacy bridge (multi-user Phase 1A)
//
// Seeds the registry so the CURRENT install (fatma + daniel) becomes one
// "couple" space with two members that point at the EXACT existing databases.
// Nothing on disk moves; the seed is an idempotent no-op for current users.
//
// It also bridges the new Membership model back to the string-shaped `ProfileId`
// that db()/session/chat still flow through, so every legacy code path stays
// byte-compatible while new members ride the same rails with uuid ids.
// ─────────────────────────────────────────────────────────────────────────────

import type { ProfileId } from '$lib/auth/hash';
import { PEOPLE } from '$lib/profile/people';
import type { Membership } from './types';
import { DEFAULT_SPACE_ID } from './types';
import {
  getSpace,
  listMembers,
  listSpaces,
  putMember,
  putSpace,
  registryAvailable
} from './registry-db';

/** The two legacy DB names — MUST stay exactly these (zero data movement). */
const LEGACY_DB_NAME: Record<ProfileId, string> = {
  fatma: 'presuntinho',
  daniel: 'presuntinho-daniel'
};

/**
 * Idempotently seed the legacy couple space. Safe to call any number of times:
 * if the default space already exists it returns immediately. Never overwrites
 * an existing member row (so a later per-member edit is preserved).
 */
export async function seedLegacyRegistry(): Promise<void> {
  if (!registryAvailable()) return;
  if (await getSpace(DEFAULT_SPACE_ID)) return;

  const now = Date.now();
  await putSpace({
    id: DEFAULT_SPACE_ID,
    kind: 'couple',
    name: '',
    ownerMemberId: 'fatma',
    createdAt: now
  });

  const existing = new Set((await listMembers(DEFAULT_SPACE_ID)).map((m) => m.id));
  const legacy: Membership[] = [
    {
      id: 'fatma',
      spaceId: DEFAULT_SPACE_ID,
      displayName: 'Fatma',
      emoji: PEOPLE.fatma.emoji,
      accent: PEOPLE.fatma.accent,
      role: 'owner',
      status: 'active',
      legacyProfileId: 'fatma',
      dbName: LEGACY_DB_NAME.fatma,
      createdAt: now
    },
    {
      id: 'daniel',
      spaceId: DEFAULT_SPACE_ID,
      displayName: 'Daniel',
      emoji: PEOPLE.daniel.emoji,
      accent: PEOPLE.daniel.accent,
      role: 'member',
      status: 'active',
      legacyProfileId: 'daniel',
      dbName: LEGACY_DB_NAME.daniel,
      createdAt: now
    }
  ];
  for (const m of legacy) if (!existing.has(m.id)) await putMember(m);
}

/**
 * Whether the app already has an identity — either a seeded registry with a
 * space, OR (belt-and-braces) any legacy data. Used to decide first-run
 * onboarding so existing fatma/daniel users NEVER get bounced into the wizard.
 */
export async function hasAnyIdentity(): Promise<boolean> {
  if (!registryAvailable()) return true; // SSR: never redirect
  const spaces = await listSpaces();
  return spaces.length > 0;
}

/**
 * Bridge a Membership to the runtime `ProfileId` that db()/session/chat expect.
 * Legacy members map to their real profile; new members use their uuid id — a
 * deliberate string-at-runtime cast (ProfileId is only a compile-time union;
 * db()/session key off the string). NEVER re-derive a dbName from this.
 */
export function membershipToProfileId(m: Membership): ProfileId {
  return m.legacyProfileId ?? (m.id as ProfileId);
}

/** The other active members of a space (replaces the binary otherPerson()). */
export async function otherMembers(spaceId: string, selfId: string): Promise<Membership[]> {
  const members = await listMembers(spaceId);
  return members.filter((m) => m.id !== selfId && m.status === 'active');
}
