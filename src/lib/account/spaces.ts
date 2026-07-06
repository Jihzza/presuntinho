// Spaces — Phase 3 client layer. A space is a couple (2 accounts) or a group
// (N). Membership writes go through SECURITY DEFINER RPCs; reads are RLS-scoped
// to members. This is the account-based shared context the couple features will
// key on (replacing the hard-coded couple_id).

import { getSupabaseClient } from '$lib/multiplayer/client';
import { getAuthUser, type Account } from './auth';

export type SpaceKind = 'couple' | 'group';

export interface SpaceMember extends Account {
  role: 'owner' | 'member';
}
export interface Space {
  id: string;
  kind: SpaceKind;
  name: string | null;
  emoji: string | null;
  owner: string;
  members: SpaceMember[];
}

const sb = () => getSupabaseClient();

// ── writes (RPCs) ────────────────────────────────────────────────────────────

/** Form (or fetch) the couple space with an accepted contact. Returns space id. */
export async function formCouple(otherAccountId: string): Promise<string> {
  const { data, error } = await sb().rpc('form_couple', { p_other: otherAccountId });
  if (error) throw error;
  return data as string;
}

export async function createGroup(name: string, emoji?: string): Promise<string> {
  const { data, error } = await sb().rpc('create_group', { p_name: name, p_emoji: emoji ?? null });
  if (error) throw error;
  return data as string;
}

export async function addToGroup(spaceId: string, accountId: string): Promise<void> {
  const { error } = await sb().rpc('add_to_group', { p_space: spaceId, p_account: accountId });
  if (error) throw error;
}

export async function leaveSpace(spaceId: string): Promise<void> {
  const { error } = await sb().rpc('leave_space', { p_space: spaceId });
  if (error) throw error;
}

// ── reads ────────────────────────────────────────────────────────────────────

/** All spaces I'm a member of, with their members resolved. */
export async function listSpaces(): Promise<Space[]> {
  const user = await getAuthUser();
  if (!user) return [];
  const { data: spaces, error: e1 } = await sb()
    .from('spaces')
    .select('id, kind, name, emoji, owner, created_at')
    .order('created_at', { ascending: true });
  if (e1) throw e1;
  const spaceRows = ((spaces as Omit<Space, 'members'>[]) ?? []);
  if (!spaceRows.length) return [];

  const { data: members, error: e2 } = await sb()
    .from('space_members')
    .select('space_id, account, role')
    .in('space_id', spaceRows.map((s) => s.id));
  if (e2) throw e2;
  const memberRows = (members as { space_id: string; account: string; role: 'owner' | 'member' }[]) ?? [];

  // Resolve the account details for every member in one query.
  const ids = [...new Set(memberRows.map((m) => m.account))];
  const accMap = new Map<string, Account>();
  if (ids.length) {
    const { data: accs, error: e3 } = await sb()
      .from('accounts')
      .select('id, handle, display_name, emoji, avatar_url, bio')
      .in('id', ids);
    if (e3) throw e3;
    for (const a of (accs as Account[]) ?? []) accMap.set(a.id, a);
  }

  return spaceRows.map((s) => ({
    ...s,
    members: memberRows
      .filter((m) => m.space_id === s.id)
      .map((m) => {
        const a = accMap.get(m.account);
        return a ? { ...a, role: m.role } : null;
      })
      .filter((x): x is SpaceMember => x !== null)
  }));
}

/** The other member of a couple space (for labels). */
export function otherMember(space: Space, meId: string): SpaceMember | null {
  return space.members.find((m) => m.id !== meId) ?? null;
}

export function subscribeSpaces(onChange: () => void): () => void {
  const channel = sb()
    .channel('my-spaces')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'space_members' }, () => onChange())
    .subscribe();
  return () => void sb().removeChannel(channel);
}
