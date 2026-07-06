// src/lib/couple/couple-store.svelte.ts
//
// Couple sync — a shared, cross-device layer over the chat blob backend:
//   • synced points   — either partner tapping the surprise heart bumps ONE
//                        shared counter (per-profile tally, summed for display)
//   • love / nudge     — transient pings the partner surfaces as a toast (+ a
//                        strong buzz for a "saudades" nudge)
//   • async scores     — arcade high scores per game per profile, so you can
//                        "play against her" without real-time netcode
//
// A single global poller (mounted once in +layout) keeps `couple` fresh and
// fires incoming pings. Everything degrades to a no-op when there is no chat
// token or the session profile isn't one of the two legacy partners.

import { getSession } from '$lib/auth/session';
import { showToast } from '$lib/components/events';
import { playSfx, vibrate, vibrateNudge } from '$lib/gamification/sound';
import { get } from 'svelte/store';
import { t } from 'svelte-i18n';
import {
  getChatToken,
  fetchCoupleSnapshot,
  postCouplePoints,
  postCoupleLove,
  postCoupleNudge,
  postCoupleScore,
  otherProfile,
  isNetworkError,
  type ChatProfile,
  type CoupleSnapshot
} from '$lib/chat/client';

export type PingResult = 'sent' | 'cooldown' | 'offline' | 'disabled';

interface CoupleUiState {
  /** A partner profile + a chat token are present — sync can happen. */
  enabled: boolean;
  /** At least one snapshot has synced from the server. */
  ready: boolean;
  /** The last poll/flush reached the server. */
  online: boolean;
  /** Total shared points (my tally + partner's tally). */
  points: number;
  myPoints: number;
  partnerPoints: number;
  /** Async-competition high scores: scores[gameId] = { fatma?, daniel? }. */
  scores: Record<string, Partial<Record<ChatProfile, number>>>;
}

export const couple: CoupleUiState = $state({
  enabled: false,
  ready: false,
  online: false,
  points: 0,
  myPoints: 0,
  partnerPoints: 0,
  scores: {}
});

const POLL_MS = 5000;
const POINT_FLUSH_MS = 1200;
const PING_COOLDOWN_MS = 12_000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTaps = 0;
let lastLoveAt = 0;
let lastNudgeAt = 0;
// The partner ping ts we've already reacted to. Initialised on first sync so a
// stale ping left in `meta` isn't replayed every reload.
let lastPartnerPingTs = 0;
let seededPing = false;
let started = false;
let cleanupListeners: (() => void) | null = null;

function profile(): ChatProfile | null {
  const p = getSession()?.profile;
  return p === 'fatma' || p === 'daniel' ? p : null;
}

function partnerName(me: ChatProfile): string {
  const other = otherProfile(me);
  const fallback = other === 'fatma' ? 'Fatma' : 'Daniel';
  return get(t)(`couple.name.${other}`, { default: fallback });
}

/** Fold a fresh server snapshot into the reactive state (+ ping detection). */
function applySnapshot(me: ChatProfile, snap: CoupleSnapshot): void {
  const other = otherProfile(me);
  couple.myPoints = snap.couple.points[me] ?? 0;
  couple.partnerPoints = snap.couple.points[other] ?? 0;
  // Keep any not-yet-flushed optimistic taps on top of the authoritative total.
  couple.points = couple.myPoints + couple.partnerPoints + pendingTaps;
  couple.scores = snap.couple.scores ?? {};
  couple.online = true;
  couple.ready = true;

  const ping = snap.couple.pings[other];
  const ts = ping?.ts ?? 0;
  if (!seededPing) {
    // First sync — adopt whatever's there without firing (avoid replay on load).
    lastPartnerPingTs = ts;
    seededPing = true;
    return;
  }
  if (ping && ts > lastPartnerPingTs) {
    lastPartnerPingTs = ts;
    receivePing(me, ping.kind);
  }
}

function receivePing(me: ChatProfile, kind: 'love' | 'nudge'): void {
  const name = partnerName(me);
  if (kind === 'love') {
    showToast(get(t)('couple.ping.love.received', { values: { name }, default: `💛 ${name} ama-te muito!` }), 4200);
    vibrate('success');
    playSfx('ding');
  } else {
    showToast(get(t)('couple.ping.nudge.received', { values: { name }, default: `👀 ${name} tem saudades tuas!` }), 4200);
    vibrateNudge();
    playSfx('milestone');
  }
}

async function poll(): Promise<void> {
  const me = profile();
  if (!me || !getChatToken(me)) return;
  try {
    // Date.now() as the cursor keeps every poll on the cheap meta fast-path;
    // we only care about `meta.couple`, never the message list.
    const snap = await fetchCoupleSnapshot(me, Date.now());
    applySnapshot(me, snap);
  } catch (e) {
    if (isNetworkError(e)) couple.online = false;
    // token/4xx errors: stay quiet — the feature is simply unavailable.
  }
}

async function flushPoints(): Promise<void> {
  flushTimer = null;
  const me = profile();
  if (!me || pendingTaps <= 0) return;
  const n = pendingTaps;
  pendingTaps = 0;
  try {
    const snap = await postCouplePoints(me, n);
    applySnapshot(me, snap);
  } catch (e) {
    // Roll the taps back into the pending bucket so a later flush retries them,
    // but drop the optimistic display back in step so it doesn't drift upward.
    if (isNetworkError(e)) {
      pendingTaps += n;
      couple.online = false;
    }
  }
}

/**
 * Optimistically add one shared point and schedule a batched flush. Returns the
 * new displayed total so the caller can animate a "+1".
 */
export function tapCouplePoint(): number {
  const me = profile();
  if (!me) return couple.points;
  pendingTaps += 1;
  couple.points += 1;
  couple.myPoints += 1;
  if (!flushTimer) flushTimer = setTimeout(() => void flushPoints(), POINT_FLUSH_MS);
  return couple.points;
}

async function sendPing(kind: 'love' | 'nudge'): Promise<PingResult> {
  const me = profile();
  if (!me || !getChatToken(me)) return 'disabled';
  const now = Date.now();
  const lastAt = kind === 'love' ? lastLoveAt : lastNudgeAt;
  if (now - lastAt < PING_COOLDOWN_MS) return 'cooldown';
  if (kind === 'love') lastLoveAt = now;
  else lastNudgeAt = now;
  try {
    const snap = kind === 'love' ? await postCoupleLove(me) : await postCoupleNudge(me);
    applySnapshot(me, snap);
    return 'sent';
  } catch (e) {
    // Let the user retry immediately after a network failure.
    if (kind === 'love') lastLoveAt = 0;
    else lastNudgeAt = 0;
    if (isNetworkError(e)) {
      couple.online = false;
      return 'offline';
    }
    return 'disabled';
  }
}

/** Tell the partner "amo-te muito" (love ping). */
export function sendLove(): Promise<PingResult> {
  return sendPing('love');
}

/** Tell the partner "saudades" and buzz their phone (nudge ping). */
export function sendNudge(): Promise<PingResult> {
  return sendPing('nudge');
}

/** Fire-and-forget an async-competition score for a game. */
export function submitCoupleScore(gameId: string, score: number): void {
  const me = profile();
  if (!me || !getChatToken(me) || score <= 0) return;
  postCoupleScore(me, gameId, score)
    .then((snap) => applySnapshot(me, snap))
    .catch(() => undefined);
}

/** The partner's best score for a game, if we've synced one. */
export function partnerBest(gameId: string): number | null {
  const me = profile();
  if (!me) return null;
  const other = otherProfile(me);
  const v = couple.scores[gameId]?.[other];
  return typeof v === 'number' ? v : null;
}

/** Start the single global poller (idempotent). Mount once in the layout. */
export function startCouplePoller(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const me = profile();
  couple.enabled = !!(me && getChatToken(me));

  const onVisible = () => {
    if (document.visibilityState === 'visible') void poll();
  };
  const onHide = () => {
    // Best-effort flush of queued taps before the tab is frozen/closed.
    if (pendingTaps > 0) void flushPoints();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pagehide', onHide);

  void poll();
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    void poll();
  }, POLL_MS);

  cleanupListeners = () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pagehide', onHide);
  };
}

export function stopCouplePoller(): void {
  if (pollTimer) clearInterval(pollTimer);
  if (flushTimer) clearTimeout(flushTimer);
  pollTimer = null;
  flushTimer = null;
  started = false;
  cleanupListeners?.();
  cleanupListeners = null;
}
