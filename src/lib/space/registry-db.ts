// ─────────────────────────────────────────────────────────────────────────────
// Presuntinho — the roster registry (multi-user Phase 1A)
//
// A dedicated IndexedDB (`presuntinho-registry`) that records WHO exists, kept
// deliberately separate from every member's own data DB. This breaks the
// chicken-and-egg problem — you must know who exists before you can open a
// per-member database — and, crucially, means the whole multi-user layer is
// ADDITIVE: it never touches `presuntinho` / `presuntinho-daniel`, so current
// data is untouched and the change is fully reversible.
// ─────────────────────────────────────────────────────────────────────────────

import Dexie, { type Table } from 'dexie';
import type { Space, Membership, Invite, MemberId } from './types';

const REGISTRY_DB_NAME = 'presuntinho-registry';

class RegistryDB extends Dexie {
  spaces!: Table<Space, string>;
  members!: Table<Membership, MemberId>;
  invites!: Table<Invite, string>;

  constructor() {
    super(REGISTRY_DB_NAME);
    this.version(1).stores({
      spaces: 'id, kind',
      members: 'id, spaceId, status',
      invites: 'code, spaceId, status'
    });
  }
}

let _registry: RegistryDB | null = null;

/** True when IndexedDB is available (browser, not SSR). */
export function registryAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Lazily open the registry DB. Never called at module top-level (SSR-safe). */
export function registryDb(): RegistryDB {
  if (!_registry) _registry = new RegistryDB();
  return _registry;
}

// ── spaces ───────────────────────────────────────────────────────────────────

export async function getSpace(id: string): Promise<Space | undefined> {
  if (!registryAvailable()) return undefined;
  return registryDb().spaces.get(id);
}

export async function listSpaces(): Promise<Space[]> {
  if (!registryAvailable()) return [];
  return registryDb().spaces.toArray();
}

export async function putSpace(space: Space): Promise<void> {
  if (!registryAvailable()) return;
  await registryDb().spaces.put(space);
}

// ── members ──────────────────────────────────────────────────────────────────

export async function getMember(id: MemberId): Promise<Membership | undefined> {
  if (!registryAvailable()) return undefined;
  return registryDb().members.get(id);
}

export async function listMembers(spaceId?: string): Promise<Membership[]> {
  if (!registryAvailable()) return [];
  const all = await registryDb().members.toArray();
  return spaceId ? all.filter((m) => m.spaceId === spaceId) : all;
}

export async function putMember(member: Membership): Promise<void> {
  if (!registryAvailable()) return;
  await registryDb().members.put(member);
}

export async function updateMember(id: MemberId, patch: Partial<Membership>): Promise<void> {
  if (!registryAvailable()) return;
  await registryDb().members.update(id, patch);
}

/** Count active members in a space — used to enforce SpaceKind capacity. */
export async function activeMemberCount(spaceId: string): Promise<number> {
  if (!registryAvailable()) return 0;
  const members = await listMembers(spaceId);
  return members.filter((m) => m.status === 'active').length;
}

// ── invites ──────────────────────────────────────────────────────────────────

export async function getInvite(code: string): Promise<Invite | undefined> {
  if (!registryAvailable()) return undefined;
  return registryDb().invites.get(code);
}

export async function putInvite(invite: Invite): Promise<void> {
  if (!registryAvailable()) return;
  await registryDb().invites.put(invite);
}

export async function updateInvite(code: string, patch: Partial<Invite>): Promise<void> {
  if (!registryAvailable()) return;
  await registryDb().invites.update(code, patch);
}

/** Drop the cached handle (e.g. tests / a hard reset). */
export function closeRegistry(): void {
  _registry?.close();
  _registry = null;
}
