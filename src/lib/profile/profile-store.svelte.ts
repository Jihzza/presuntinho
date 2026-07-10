// Live, editable profile for the signed-in member. Merges the user-editable
// registry Membership (displayName/emoji/accent/photo/bio) over the static
// people.ts fallback, persists edits to the registry (IndexedDB), and fires a
// window event so the home hero + anywhere else refresh without a reload.

import { getSession, isLegacyProfile } from '$lib/auth/session';
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
  const p = getSession()?.profile ?? null;
  // Legacy couple (fatma/daniel) keep their static people.ts identity + cloud
  // sync. Every OTHER (uuid) member is a generic tenant whose real name/emoji/
  // bio come from their own registry row — never from Fatma's defaults. Passing
  // the real id (uuid included) to profileFor() yields the neutral 🐷 profile
  // carrying that id, so the hub hero can never show '@fatma'/🌙 to a new user.
  const legacy = isLegacyProfile(p);
  const id = p as ChatProfile | null;
  const person = profileFor(id);
  profileState.id = id;
  profileState.nameKey = person.nameKey;
  profileState.handleKey = person.handleKey;
  profileState.displayName = '';
  profileState.emoji = person.emoji;
  profileState.accent = person.accent;
  profileState.photo = '';
  profileState.bio = '';

  if (id && typeof indexedDB !== 'undefined') {
    try {
      if (legacy) await seedLegacyRegistry(); // idempotent; legacy-only seed
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

  // Cross-device Supabase profile sync is wired for the legacy pair only; a uuid
  // member's profile lives in their own registry row (edited via saveProfile).
  if (legacy) void hydrateFromCloud(id as 'fatma' | 'daniel');
}

/** Pull the cloud profile over the local one and subscribe for live updates so
 *  an edit on one phone shows on the other. Non-fatal if Supabase is off/down. */
async function hydrateFromCloud(id: 'fatma' | 'daniel'): Promise<void> {
  try {
    const sync = await import('$lib/profile/profile-sync');
    if (!sync.profileSyncEnabled()) return;
    // Phase 3b: resolve the couple space id (timeout-guarded) before fetch/
    // subscribe so an account-couple's profiles are scoped to its own space.
    await (await import('$lib/couple/couple-supabase')).resolveCoupleId();
    const remote = await sync.fetchRemoteProfile(id);
    if (remote) applyRemote(remote);
    remoteUnsub?.();
    remoteUnsub = sync.subscribeRemoteProfile(id, applyRemote);
  } catch (e) {
    console.warn('[profile] cloud sync unavailable', e);
  }
}

let remoteUnsub: (() => void) | null = null;
// Timestamp of the last LOCAL edit, so a stale remote echo can't clobber a fresh
// local change (last-write-wins by recency instead of by arrival order).
let lastLocalSaveTs = 0;
function applyRemote(r: {
  display_name: string | null;
  emoji: string | null;
  bio: string | null;
  photo_url: string | null;
  updated_at?: string;
}): void {
  const remoteTs = r.updated_at ? new Date(r.updated_at).getTime() : 0;
  if (lastLocalSaveTs && remoteTs && remoteTs < lastLocalSaveTs) return; // local is newer — keep it
  profileState.displayName = r.display_name ?? '';
  if (r.emoji) profileState.emoji = r.emoji;
  profileState.bio = r.bio ?? '';
  profileState.photo = r.photo_url ?? '';
  // Persist to the local registry so IndexedDB matches the cloud (survives reload).
  const id = profileState.id;
  if (id) {
    void updateMember(id, {
      displayName: profileState.displayName,
      emoji: profileState.emoji,
      bio: profileState.bio,
      photo: profileState.photo
    });
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PROFILE_CHANGED_EVENT));
}

export async function saveProfile(patch: ProfilePatch): Promise<void> {
  const id = profileState.id;
  if (!id) return;
  lastLocalSaveTs = Date.now();
  await seedLegacyRegistry();
  await updateMember(id, patch);
  if (patch.displayName !== undefined) profileState.displayName = patch.displayName;
  if (patch.emoji !== undefined) profileState.emoji = patch.emoji;
  if (patch.photo !== undefined) profileState.photo = patch.photo;
  if (patch.bio !== undefined) profileState.bio = patch.bio;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PROFILE_CHANGED_EVENT));

  // Mirror to the cloud so the other device sees it (photo → Storage URL).
  try {
    const sync = await import('$lib/profile/profile-sync');
    if (sync.profileSyncEnabled()) {
      const url = await sync.pushRemoteProfile(id, patch);
      // Persist the resolved Storage URL locally too, so we stop carrying the
      // heavy data-URI once it's uploaded.
      if (url && url !== profileState.photo) {
        profileState.photo = url;
        await updateMember(id, { photo: url });
      }
    }
  } catch (e) {
    console.warn('[profile] cloud push failed (kept locally)', e);
  }
}
