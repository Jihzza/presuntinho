// Cross-device profile sync over Supabase. Each person's editable identity is
// mirrored to the `profiles` table (keyed by couple_id + profile) so it follows
// them to any device and updates live. Photos are uploaded to Storage and
// referenced by URL (never a base64 blob in the row). Offline-first: the local
// Dexie registry stays the working copy; this just mirrors + hydrates.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isMultiplayerConfigured } from '$lib/multiplayer/config';
import { COUPLE_ID } from '$lib/couple/couple-supabase';
import type { ChatProfile } from '$lib/chat/client';

const BUCKET = 'couple-media';

export interface RemoteProfile {
  profile: string;
  display_name: string | null;
  emoji: string | null;
  bio: string | null;
  photo_url: string | null;
  updated_at: string;
}

export interface ProfilePushPatch {
  displayName?: string;
  emoji?: string;
  bio?: string;
  photo?: string; // data-URI or an existing http(s) URL, or '' to clear
}

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase not configured');
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } }
    });
  }
  return client;
}

export function profileSyncEnabled(): boolean {
  return isMultiplayerConfigured();
}

export async function fetchRemoteProfile(profile: ChatProfile): Promise<RemoteProfile | null> {
  const { data, error } = await sb()
    .from('profiles')
    .select('profile, display_name, emoji, bio, photo_url, updated_at')
    .eq('couple_id', COUPLE_ID)
    .eq('profile', profile)
    .maybeSingle();
  if (error) throw error;
  return (data as RemoteProfile) ?? null;
}

/** Upload a data-URI photo to Storage and return its public URL; pass http(s)
 *  URLs and empty strings through unchanged. */
async function ensurePhotoUrl(profile: ChatProfile, photo: string): Promise<string> {
  if (!photo || photo.startsWith('http')) return photo;
  const blob = await (await fetch(photo)).blob();
  const path = `profiles/${COUPLE_ID}/${profile}-${crypto.randomUUID()}.webp`;
  const { error } = await sb().storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || 'image/webp',
    upsert: true
  });
  if (error) throw error;
  return sb().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Mirror an edited profile to Supabase. Returns the resolved photo URL (if the
 *  photo changed) so the caller can persist the URL locally too. */
export async function pushRemoteProfile(
  profile: ChatProfile,
  patch: ProfilePushPatch
): Promise<string | undefined> {
  let photoUrl: string | undefined;
  if (patch.photo !== undefined) photoUrl = patch.photo ? await ensurePhotoUrl(profile, patch.photo) : '';
  const row: Record<string, unknown> = {
    couple_id: COUPLE_ID,
    profile,
    updated_at: new Date().toISOString()
  };
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.emoji !== undefined) row.emoji = patch.emoji;
  if (patch.bio !== undefined) row.bio = patch.bio;
  if (photoUrl !== undefined) row.photo_url = photoUrl || null;
  const { error } = await sb().from('profiles').upsert(row, { onConflict: 'couple_id,profile' });
  if (error) throw error;
  return photoUrl;
}

export function subscribeRemoteProfile(
  profile: ChatProfile,
  onChange: (p: RemoteProfile) => void
): () => void {
  const channel = sb()
    .channel(`profiles:${COUPLE_ID}:${profile}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles', filter: `couple_id=eq.${COUPLE_ID}` },
      (payload) => {
        const row = payload.new as RemoteProfile;
        if (row?.profile === profile) onChange(row);
      }
    )
    .subscribe();
  return () => void sb().removeChannel(channel);
}
