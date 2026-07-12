// Connections — Phase 2 client layer. Send a connect request, accept it, and
// list accepted contacts / pending requests. Built on the `connections` table
// (RLS scopes every row to its two parties). Account details are resolved in a
// single follow-up query, so no fragile FK-hint joins.

import { getSupabaseClient } from '$lib/multiplayer/client';
import { isMultiplayerConfigured } from '$lib/multiplayer/config';
import { getAuthUser, type Account } from './auth';

export type ConnStatus = 'pending' | 'accepted';

interface ConnectionRow {
  id: string;
  requester: string;
  addressee: string;
  status: ConnStatus;
  wants_couple: boolean;
}

/** A resolved contact/request: the OTHER account + the connection metadata. */
export interface Contact extends Account {
  connectionId: string;
  status: ConnStatus;
  /** 'in' = they requested me, 'out' = I requested them. */
  direction: 'in' | 'out';
  /** The request carries a couple intent — accepting it activates couple mode. */
  wantsCouple: boolean;
}

const sb = () => getSupabaseClient();

async function resolveAccounts(ids: string[]): Promise<Map<string, Account>> {
  const map = new Map<string, Account>();
  const unique = [...new Set(ids)];
  if (!unique.length) return map;
  const { data, error } = await sb()
    .from('accounts')
    .select('id, handle, display_name, emoji, avatar_url, bio')
    .in('id', unique);
  if (error) throw error;
  for (const a of (data as Account[]) ?? []) map.set(a.id, a);
  return map;
}

/** All my connections (any status, either direction). */
async function myConnections(): Promise<{ me: string; rows: ConnectionRow[] }> {
  const user = await getAuthUser();
  if (!user) throw new Error('not signed in');
  const { data, error } = await sb()
    .from('connections')
    .select('id, requester, addressee, status, wants_couple')
    .or(`requester.eq.${user.id},addressee.eq.${user.id}`);
  if (error) throw error;
  return { me: user.id, rows: (data as ConnectionRow[]) ?? [] };
}

function toContacts(me: string, rows: ConnectionRow[], accounts: Map<string, Account>): Contact[] {
  const out: Contact[] = [];
  for (const r of rows) {
    const otherId = r.requester === me ? r.addressee : r.requester;
    const acc = accounts.get(otherId);
    if (!acc) continue;
    out.push({
      ...acc,
      connectionId: r.id,
      status: r.status,
      direction: r.requester === me ? 'out' : 'in',
      wantsCouple: Boolean(r.wants_couple)
    });
  }
  return out;
}

/** Accepted contacts. */
export async function listContacts(): Promise<Contact[]> {
  const { me, rows } = await myConnections();
  const accepted = rows.filter((r) => r.status === 'accepted');
  const accounts = await resolveAccounts(accepted.map((r) => (r.requester === me ? r.addressee : r.requester)));
  return toContacts(me, accepted, accounts).sort((a, b) => a.handle.localeCompare(b.handle));
}

/** Pending requests waiting for MY answer (they requested me). */
export async function listIncoming(): Promise<Contact[]> {
  const { me, rows } = await myConnections();
  const incoming = rows.filter((r) => r.status === 'pending' && r.addressee === me);
  const accounts = await resolveAccounts(incoming.map((r) => r.requester));
  return toContacts(me, incoming, accounts);
}

/** Pending requests I sent (awaiting their answer). */
export async function listOutgoing(): Promise<Contact[]> {
  const { me, rows } = await myConnections();
  const outgoing = rows.filter((r) => r.status === 'pending' && r.requester === me);
  const accounts = await resolveAccounts(outgoing.map((r) => r.addressee));
  return toContacts(me, outgoing, accounts);
}

/** My relationship to a given account, if any. */
export async function statusWith(
  accountId: string
): Promise<{ status: ConnStatus; direction: 'in' | 'out'; connectionId: string; wantsCouple: boolean } | null> {
  const { me, rows } = await myConnections();
  const r = rows.find((c) => c.requester === accountId || c.addressee === accountId);
  if (!r) return null;
  return {
    status: r.status,
    direction: r.requester === me ? 'out' : 'in',
    connectionId: r.id,
    wantsCouple: Boolean(r.wants_couple)
  };
}

export type SendResult = 'sent' | 'accepted' | 'already' | 'self';

/** Send a connect request. If they already requested ME, accept instead. */
export async function sendConnect(addresseeId: string): Promise<SendResult> {
  const user = await getAuthUser();
  if (!user) throw new Error('not signed in');
  if (addresseeId === user.id) return 'self';

  const existing = await statusWith(addresseeId);
  if (existing) {
    if (existing.status === 'accepted') return 'already';
    // A pending request already exists between us.
    if (existing.direction === 'in') {
      // They requested me first → accepting closes the loop.
      await acceptConnect(existing.connectionId);
      return 'accepted';
    }
    return 'already'; // I already sent them one
  }

  const { error } = await sb()
    .from('connections')
    .insert({ requester: user.id, addressee: addresseeId, status: 'pending' });
  if (error) throw error;
  return 'sent';
}

/** Accept a friend OR couple request. A couple request activates the couple
 *  atomically on this single accept (see 0013's accept_connection RPC).
 *  coupleBlocked: the friendship landed but one side already has an active
 *  couple, so the couple half was refused (one active couple per person). */
export async function acceptConnect(
  connectionId: string
): Promise<{ coupleSpace: string | null; coupleActive: boolean; coupleBlocked: boolean }> {
  const { data, error } = await sb().rpc('accept_connection', { p_connection: connectionId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    coupleSpace: (row?.couple_space as string | null) ?? null,
    coupleActive: Boolean(row?.couple_active),
    coupleBlocked: Boolean(row?.couple_blocked)
  };
}

/** Decline an incoming request, cancel an outgoing one, or remove a contact. */
export async function removeConnection(connectionId: string): Promise<void> {
  const { error } = await sb().from('connections').delete().eq('id', connectionId);
  if (error) throw error;
}

let connSubSeq = 0;

/** Live-subscribe to changes in my connections (new requests / accepts). */
export function subscribeConnections(onChange: () => void): () => void {
  // Sem Supabase configurado não há canal a abrir — devolve um unsubscribe
  // inerte em vez de rebentar o onMount das páginas com uma rejeição solta.
  if (!isMultiplayerConfigured()) return () => {};
  // Nome único por subscrição: o layout e as páginas subscrevem em paralelo, e
  // reutilizar o MESMO tópico faria o supabase-js rejeitar o segundo callback
  // ("cannot add postgres_changes callbacks after subscribe").
  const channel = sb()
    .channel(`my-connections-${++connSubSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, () => onChange())
    .subscribe();
  return () => void sb().removeChannel(channel);
}
