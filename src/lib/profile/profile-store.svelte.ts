// Live, editable profile for the signed-in member. Merges the user-editable
// registry Membership (displayName/emoji/accent/photo/bio) over the static
// people.ts fallback, persists edits to the registry (IndexedDB), and fires a
// window event so the home hero + anywhere else refresh without a reload.

import { getSession } from '$lib/auth/session';
import { getMember, updateMember } from '$lib/space/registry-db';
import { seedLegacyRegistry } from '$lib/space/legacy-adapter';
import { profileFor } from '$lib/profile/people';
import type { ChatProfile } from '$lib/chat/client';

export const PROFILE_CHANGED_EVENT = 'presuntinho:profile-changed';

export interface ProfilePatch {
  displayName?: string;
  emoji?: string;
  photo?: string;
  bio?: string;
}

export const profileState = $state<{
  loaded: boolean;
  id: ChatProfile | null;
  nameKey: string;
  handleKey: string;
  displayName: string; // editable override; '' → fall back to $t(nameKey)
  emoji: string;
  accent: string;
  photo: string;
  bio: string;
}>({
  loaded: false,
  id: null,
  nameKey: 'profile.fatma.name',
  handleKey: 'profile.fatma.handle',
  displayName: '',
  emoji: '🌙',
  accent: 'var(--accent)',
  photo: '',
  bio: ''
});

export async function loadProfile(): Promise<void> {
  const p = getSession()?.profile;
  const id = p === 'fatma' || p === 'daniel' ? p : null;
  const person = profileFor(id);
  profileState.id = id;
  profileState.nameKey = person.nameKey;
  profileState.handleKey = person.handleKey;
  profileState.emoji = person.emoji;
  profileState.accent = person.accent;

  if (id && typeof indexedDB !== 'undefined') {
    try {
      await seedLegacyRegistry(); // idempotent; never overwrites edited rows
      const m = await getMember(id);
      if (m) {
        profileState.displayName = m.displayName && m.displayName !== person.id ? m.displayName : '';
        profileState.emoji = m.emoji || person.emoji;
        profileState.accent = m.accent || person.accent;
        profileState.photo = m.photo ?? '';
        profileState.bio = m.bio ?? '';
      }
    } catch (e) {
      console.warn('[profile] load failed', e);
    }
  }
  profileState.loaded = true;
}

export async function saveProfile(patch: ProfilePatch): Promise<void> {
  const id = profileState.id;
  if (!id) return;
  await seedLegacyRegistry();
  await updateMember(id, patch);
  if (patch.displayName !== undefined) profileState.displayName = patch.displayName;
  if (patch.emoji !== undefined) profileState.emoji = patch.emoji;
  if (patch.photo !== undefined) profileState.photo = patch.photo;
  if (patch.bio !== undefined) profileState.bio = patch.bio;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PROFILE_CHANGED_EVENT));
}
