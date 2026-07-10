// src/lib/account/couple-link.ts
//
// The "pedido de casal" layer — makes linking two accounts as a COUPLE feel
// like one action, even though the backend needs two consents in sequence
// (contact connection → couple space proposal → acceptance):
//
//   requestCouple(account)
//     • already an accepted contact          → propose_couple right away
//     • not yet connected                    → sendConnect + persist a local
//       COUPLE INTENT; when the contact request is accepted (realtime), the
//       intent auto-fires propose_couple — the sender never has to remember.
//
//   watchCoupleLink(handlers)
//     • single subscription (spaces + connections) mounted once in the layout:
//         - fires pending couple intents when a contact becomes accepted
//         - detects a couple space turning ACTIVE and celebrates it ONCE per
//           device (marker row in the profile's Dexie `visited` table)
//
// Relationship model (v1): 'amigo' (plain contact — no app changes) and
// 'casal' (unlocks the couple features). More kinds can be layered on the
// same intent + celebration plumbing later (família, bff, …).

import { sendConnect, statusWith, subscribeConnections, listContacts } from '$lib/account/contacts';
import {
  listSpaces,
  proposeCouple,
  acceptCouple,
  isCoupleActive,
  otherMember,
  pendingCoupleInvites,
  subscribeSpaces,
  type Space,
  type SpaceMember
} from '$lib/account/spaces';
import type { Account } from '$lib/account/auth';
import { db } from '$lib/state/db';

// ── Couple intents (sender side) ────────────────────────────────────────────
// localStorage (not Dexie) on purpose: the intent belongs to THIS device/user
// session and must be readable synchronously by UI code.

const INTENT_KEY = 'presuntinho-couple-intents';

function readIntents(): string[] {
  try {
    const raw = localStorage.getItem(INTENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeIntents(ids: string[]): void {
  try {
    if (ids.length === 0) localStorage.removeItem(INTENT_KEY);
    else localStorage.setItem(INTENT_KEY, JSON.stringify(ids));
  } catch {
    /* quota — the user can re-send from the UI */
  }
}

export function hasCoupleIntent(accountId: string): boolean {
  return readIntents().includes(accountId);
}

function addIntent(accountId: string): void {
  const ids = readIntents();
  if (!ids.includes(accountId)) writeIntents([...ids, accountId]);
}

function clearIntent(accountId: string): void {
  writeIntents(readIntents().filter((id) => id !== accountId));
}

// ── Pedido de casal (one action for the user) ───────────────────────────────

export type CoupleRequestResult =
  | 'proposed' // couple proposal sent — waiting for their acceptance
  | 'active' // they had already proposed → the couple is NOW active 🎉
  | 'intent' // contact request sent; couple proposal will auto-fire on accept
  | 'already' // an active/pending couple with this person already exists
  | 'self';

export async function requestCouple(other: Account): Promise<CoupleRequestResult> {
  // 1) Already connected? Propose straight away (propose_couple also ACCEPTS
  //    if they proposed first — mutual consent shortcut).
  const conn = await statusWith(other.id);
  if (conn?.status === 'accepted') {
    const { active } = await proposeCouple(other.id);
    clearIntent(other.id);
    return active ? 'active' : 'proposed';
  }
  // 2) Not connected yet → one tap sends the contact request AND remembers the
  //    couple intent for when it's accepted.
  const sent = await sendConnect(other.id);
  if (sent === 'self') return 'self';
  if (sent === 'accepted') {
    // They had already requested ME — the connect auto-accepted, so propose now.
    const { active } = await proposeCouple(other.id);
    clearIntent(other.id);
    return active ? 'active' : 'proposed';
  }
  addIntent(other.id);
  return 'intent';
}

/** Accept a pending couple invite. Returns true when the couple is now ACTIVE. */
export async function acceptCoupleInvite(spaceId: string): Promise<boolean> {
  return acceptCouple(spaceId);
}

// ── Activation watcher + one-time celebration ───────────────────────────────

const CELEBRATED_PREFIX = 'couple-celebrated:';

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

export interface CoupleLinkHandlers {
  /** A couple space just became ACTIVE (fires once per space per device). */
  onCoupleActive?: (space: Space, partner: SpaceMember | null) => void;
  /** A pending couple intent auto-fired propose_couple after connect-accept. */
  onIntentProposed?: (contact: Account) => void;
  /** Pending couple invites addressed to ME changed (badge/UI refresh). */
  onInvitesChanged?: (invites: Space[]) => void;
}

let watching = false;
let activeSweep: (() => Promise<void>) | null = null;

/** Force an immediate sweep (e.g. right after accepting a couple invite, so
 *  the acceptor's celebration doesn't wait for the realtime round-trip). */
export function pokeCoupleLink(): void {
  void activeSweep?.();
}

/**
 * Mount ONCE (layout). Watches connections + spaces:
 *  - auto-fires stored couple intents when the contact link is accepted
 *  - celebrates couple activation exactly once per device
 */
export function watchCoupleLink(meId: string, handlers: CoupleLinkHandlers): () => void {
  if (watching || typeof window === 'undefined') return () => {};
  watching = true;

  let disposed = false;

  const sweep = async (): Promise<void> => {
    if (disposed) return;
    // 1) Fire any couple intents whose contact is now accepted.
    const intents = readIntents();
    if (intents.length > 0) {
      try {
        const contacts = await listContacts();
        for (const c of contacts) {
          if (!intents.includes(c.id)) continue;
          try {
            await proposeCouple(c.id);
            clearIntent(c.id);
            handlers.onIntentProposed?.(c);
          } catch {
            /* transient — retried on the next change event */
          }
        }
      } catch {
        /* offline — retried later */
      }
    }
    // 2) Detect newly-ACTIVE couples + surface pending invites.
    try {
      const spaces = await listSpaces();
      handlers.onInvitesChanged?.(pendingCoupleInvites(spaces, meId));
      for (const s of spaces) {
        if (!isCoupleActive(s)) continue;
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
