// The realtime channel the two partners share for instant couple updates.
//
// Netlify Blobs (chat.js) stays the durable source of truth for the counter;
// this channel only PUSHES authoritative totals so the partner sees a tap
// without waiting for the next poll. For the singular legacy pair a constant
// channel is enough; override with VITE_COUPLE_CHANNEL to scope it per-couple.

import type { ChatProfile } from '$lib/chat/client';

export const COUPLE_CHANNEL: string =
  (import.meta.env.VITE_COUPLE_CHANNEL as string | undefined) || 'couple-presuntinho';

/** Stable role so the two devices get distinct presence keys on the channel. */
export function coupleRole(profile: ChatProfile): 'host' | 'guest' {
  return profile === 'fatma' ? 'host' : 'guest';
}
