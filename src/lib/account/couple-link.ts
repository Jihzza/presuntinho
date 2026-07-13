// src/lib/account/couple-link.ts
//
// The "pedido de casal" layer — Social v2. A couple request is now a
// FIRST-CLASS request resolved server-side (0013_social_v2.sql):
//
//   requestCouple(other)
//     • not connected yet   → ONE pending request flagged wants_couple; the
//       other person accepts ONCE and the couple activates atomically.
//     • already friends     → classic couple proposal (space pending on them).
//     • they had asked us   → the server closes the loop immediately.
//   No localStorage intents, no device-online relay — the intent travels on
//   the connection row and the server finishes the job.
//
//   watchCoupleLink(meId, handlers)
//     Single subscription (connections + spaces) mounted once in the layout:
//       - onRequestsChanged: incoming friend/couple requests (badges/UI)
//       - onNewRequest: fires ONCE per request id (system notification hook)
//       - onInvitesChanged: couple space invites awaiting MY acceptance
//       - onCoupleActive: a couple just became ACTIVE — celebrate (once per
//         space per device; marker row in the profile's Dexie `visited` table)

import { listIncoming, subscribeConnections, type Contact } from '$lib/account/contacts';
import {
  listSpaces,
  acceptCouple,
  isCoupleActive,
  otherMember,
  pendingCoupleInvites,
  subscribeSpaces,
  type Space,
  type SpaceMember
} from '$lib/account/spaces';
import type { Account } from '$lib/account/auth';
import { getSupabaseClient } from '$lib/multiplayer/client';
import { db } from '$lib/state/db';

// ── Pedido de casal (one action, resolved server-side) ──────────────────────

export type CoupleRequestResult =
  | 'sent' // couple request delivered — ONE accept from them activates it
  | 'proposed' // couple proposal sent to an existing friend — awaiting accept
  | 'active' // both consents were present → the couple is NOW active 🎉
  | 'already' // an active/pending couple with this person already exists
  | 'taken' // one of the two already has an active couple with someone else
  | 'self';

export async function requestCouple(other: Account | string): Promise<CoupleRequestResult> {
  const otherId = typeof other === 'string' ? other : other.id;
  const { data, error } = await getSupabaseClient().rpc('request_couple', { p_other: otherId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  switch (row?.outcome as string | undefined) {
    case 'couple_active':
      return 'active';
    case 'couple_proposed':
      return 'proposed';
    case 'already':
      return 'already';
    case 'taken':
      return 'taken';
    case 'self':
      return 'self';
    default:
      return 'sent';
  }
}

/** Accept a pending couple SPACE invite. Returns true when now ACTIVE. */
export async function acceptCoupleInvite(spaceId: string): Promise<boolean> {
  return acceptCouple(spaceId);
}

// ── Requests addressed to me (split by kind for the UI) ─────────────────────

export interface SocialRequests {
  friends: Contact[];
  couples: Contact[];
}

export function splitRequests(incoming: Contact[]): SocialRequests {
  return {
    friends: incoming.filter((c) => !c.wantsCouple),
    couples: incoming.filter((c) => c.wantsCouple)
  };
}

// ── One-time markers ─────────────────────────────────────────────────────────
// Celebration: once per SPACE per device (Dexie `visited`, per-profile DB).
// New-request notification: once per request id (localStorage — light + sync).

const CELEBRATED_PREFIX = 'couple-celebrated:';
const NOTIFIED_KEY = 'presuntinho-social-notified';
const NOTIFIED_MAX = 200;

async function alreadyCelebrated(spaceId: string): Promise<boolean> {
  try {
    const row = await db().visited.get(`${CELEBRATED_PREFIX}${spaceId}`);
    return !!row?.visited;
  } catch {
    return true; // IDB down — never spam the overlay
  }
}

async function markCelebrated(spaceId: string): Promise<void> {
  try {
    await db().visited.put({ id: `${CELEBRATED_PREFIX}${spaceId}`, visited: true, visitedAt: Date.now() });
  } catch {
    /* non-fatal */
  }
}

/** The acceptor celebrates inside the /casal/bemvindos wizard — mark the space
 *  as celebrated up-front so the layout overlay doesn't double up on top. */
export async function markCoupleCelebrated(spaceId: string): Promise<void> {
  await markCelebrated(spaceId);
}

function readNotified(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function markNotified(id: string): void {
  try {
    const ids = readNotified().filter((x) => x !== id);
    ids.push(id);
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(ids.slice(-NOTIFIED_MAX)));
  } catch {
    /* quota — worst case a repeat notification */
  }
}

// ── Watcher ──────────────────────────────────────────────────────────────────

export interface NewSocialRequest {
  kind: 'friend' | 'couple';
  /** Who is asking. */
  from: Account;
  /** Deep link the notification should open. */
  href: string;
}

export interface CoupleLinkHandlers {
  /** A couple space just became ACTIVE (fires once per space per device). */
  onCoupleActive?: (space: Space, partner: SpaceMember | null) => void;
  /** Incoming friend/couple requests changed (badges/lists). */
  onRequestsChanged?: (requests: SocialRequests) => void;
  /** Pending couple SPACE invites addressed to ME changed. */
  onInvitesChanged?: (invites: Space[]) => void;
  /** A request/invite arrived that was never notified before (once per id). */
  onNewRequest?: (req: NewSocialRequest) => void;
}

let watching = false;
let activeSweep: (() => Promise<void>) | null = null;

/** Force an immediate sweep (e.g. right after accepting a couple invite, so
 *  the acceptor's celebration doesn't wait for the realtime round-trip). */
export function pokeCoupleLink(): void {
  void activeSweep?.();
}

/**
 * Mount ONCE (layout). Watches connections + spaces and keeps the social
 * surfaces (badges, notifications, celebration) in sync.
 */
export function watchCoupleLink(meId: string, handlers: CoupleLinkHandlers): () => void {
  if (watching || typeof window === 'undefined') return () => {};
  watching = true;

  let disposed = false;

  const sweep = async (): Promise<void> => {
    if (disposed) return;
    // 1) Incoming requests (friend + couple) → badges + one-time notification.
    try {
      const incoming = await listIncoming();
      const requests = splitRequests(incoming);
      handlers.onRequestsChanged?.(requests);
      if (handlers.onNewRequest) {
        const seen = new Set(readNotified());
        for (const c of incoming) {
          const key = `conn:${c.connectionId}`;
          if (seen.has(key)) continue;
          markNotified(key);
          handlers.onNewRequest({
            kind: c.wantsCouple ? 'couple' : 'friend',
            from: c,
            href: c.wantsCouple ? `/casal/pedido/?conn=${c.connectionId}` : `/contactos/`
          });
        }
      }
    } catch {
      /* offline — retried on the next change event */
    }
    // 2) Couple space invites + newly-ACTIVE couples.
    try {
      const spaces = await listSpaces();
      const invites = pendingCoupleInvites(spaces, meId);
      handlers.onInvitesChanged?.(invites);
      if (handlers.onNewRequest) {
        const seen = new Set(readNotified());
        for (const s of invites) {
          const key = `space:${s.id}`;
          if (seen.has(key)) continue;
          const other = otherMember(s, meId);
          if (!other) continue;
          markNotified(key);
          handlers.onNewRequest({ kind: 'couple', from: other, href: `/casal/pedido/?space=${s.id}` });
        }
      }
      const activeCouples = spaces.filter(isCoupleActive);
      for (const s of activeCouples.length === 1 ? activeCouples : []) {
        if (await alreadyCelebrated(s.id)) continue;
        await markCelebrated(s.id);
        handlers.onCoupleActive?.(s, otherMember(s, meId));
      }
    } catch {
      /* offline — retried later */
    }
  };

  activeSweep = sweep;
  const unsubConn = subscribeConnections(() => void sweep());
  const unsubSpaces = subscribeSpaces(() => void sweep());
  void sweep(); // initial pass (covers acceptances that happened while away)

  return () => {
    disposed = true;
    watching = false;
    activeSweep = null;
    unsubConn();
    unsubSpaces();
  };
}

// ── Convite por link (onboarding / partilha) ────────────────────────────────
// The inviter shares `/convite/?de=<handle>`; the invitee lands there, and the
// pending inviter handle survives signup in localStorage until an account
// exists to send the couple request from.

const INVITE_FROM_KEY = 'presuntinho-couple-invite-from';

export function coupleInviteUrl(myHandle: string): string {
  const origin = typeof location !== 'undefined' ? location.origin : 'https://presuntinho.netlify.app';
  return `${origin}/convite/?de=${encodeURIComponent(myHandle)}`;
}

export function profileUrl(handle: string): string {
  const origin = typeof location !== 'undefined' ? location.origin : 'https://presuntinho.netlify.app';
  return `${origin}/u/?h=${encodeURIComponent(handle)}`;
}

export function stashInviteFrom(handle: string): void {
  try {
    localStorage.setItem(INVITE_FROM_KEY, handle.replace(/^@/, '').toLowerCase());
  } catch {
    /* ignore */
  }
}

export function peekInviteFrom(): string | null {
  try {
    return localStorage.getItem(INVITE_FROM_KEY);
  } catch {
    return null;
  }
}

export function clearInviteFrom(): void {
  try {
    localStorage.removeItem(INVITE_FROM_KEY);
  } catch {
    /* ignore */
  }
}
