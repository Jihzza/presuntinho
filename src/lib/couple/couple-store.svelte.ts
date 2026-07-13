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
// fires incoming pings.
//
// WHO participates (v2 — account couples):
//   • the two legacy partners (fatma/daniel) — full stack: Blobs snapshot,
//     Supabase points, realtime pings;
//   • ANY two accounts in an ACTIVE couple space — Supabase points + realtime
//     pings, keyed by account id, channel scoped per couple space. The Blobs
//     chat paths stay legacy-only.
// Everything degrades to a no-op when neither identity resolves.

import { getSession, isLegacyProfile } from '$lib/auth/session';
import { isMultiplayerConfigured } from '$lib/multiplayer/config';
import { COUPLE_CHANNEL, coupleRole } from '$lib/couple/couple-channel';
import type { Room } from '$lib/multiplayer/realtime';
import { presentCoupleMoment, type CoupleMomentSource } from '$lib/couple/couple-moments';
import { get } from 'svelte/store';
import { t } from 'svelte-i18n';
import {
  getChatToken,
  fetchCoupleSnapshot,
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
  /** This session participates in couple sync at all (a legacy partner profile).
   *  When false the surprise heart / couple points are inert — so the UI must
   *  hide them rather than show a fake affordance to a solo/onboarded user. */
  available: boolean;
  /** True only for a real two-account couple space with mutual consent. */
  accountCouple: boolean;
  /** Explicit active ids used by the synchronized heart and foreground events. */
  coupleId: string | null;
  me: string | null;
  partnerId: string | null;
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
  /** The partner is connected on the realtime channel right now. */
  partnerOnline: boolean;
}

export const couple: CoupleUiState = $state({
  available: false,
  accountCouple: false,
  coupleId: null,
  me: null,
  partnerId: null,
  enabled: false,
  ready: false,
  online: false,
  points: 0,
  myPoints: 0,
  partnerPoints: 0,
  scores: {},
  partnerOnline: false
});

const POLL_MS = 5000;
const PING_COOLDOWN_MS = 12_000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastLoveAt = 0;
let lastNudgeAt = 0;
// The partner ping ts we've already reacted to. Initialised on first sync so a
// stale ping left in `meta` isn't replayed every reload.
let lastPartnerPingTs = 0;
let seededPing = false;
let started = false;
let cleanupListeners: (() => void) | null = null;

// Realtime fast-path (optional; only when Supabase is configured). Pings ride
// this broadcast channel for instant delivery.
let room: Room | null = null;

// Durable POINTS backend. When Supabase is configured, the shared heart counter
// lives in a real Supabase table (durable + realtime via postgres_changes) with
// NO chat token needed; otherwise it falls back to the Netlify-Blobs counter.
let supaActive = false;
let supa: typeof import('$lib/couple/couple-supabase') | null = null;
let supaPointsUnsub: (() => void) | null = null;

function profile(): ChatProfile | null {
  const p = getSession()?.profile;
  return p && isLegacyProfile(p) ? (p as 'fatma' | 'daniel') : null;
}

// ── Identity: who am I in the couple, and who is the partner? ───────────────
// Legacy pair → profile names; account couple → account uuids + the active
// couple space (its id scopes the realtime channel; RLS already grants both
// members access to couple_points keyed by that space).
interface CoupleIdentity {
  me: string;
  other: string;
  /** Partner display label for ping toasts. */
  label: string;
  legacy: boolean;
  /** Realtime channel scope (legacy constant, or the couple space id). */
  coupleId: string;
}

let identity: CoupleIdentity | null = null;

function publishIdentity(id: CoupleIdentity | null): void {
  couple.available = !!id;
  couple.accountCouple = !!id && !id.legacy;
  couple.coupleId = id && !id.legacy ? id.coupleId : null;
  couple.me = id?.me ?? null;
  couple.partnerId = id?.other ?? null;
  couple.enabled = !!id && (id.legacy ? !!getChatToken(id.me as ChatProfile) : true);
}

async function resolveIdentity(): Promise<CoupleIdentity | null> {
  const p = getSession()?.profile;
  if (!p) return null;
  if (isLegacyProfile(p)) {
    const me = p as ChatProfile;
    const other = otherProfile(me);
    const fallback = other === 'fatma' ? 'Fatma' : 'Daniel';
    const label = get(t)(`couple.name.${other}`, { default: fallback });
    return { me, other, label, legacy: true, coupleId: COUPLE_CHANNEL };
  }
  // Account session (profile === account.id): couple features light up only
  // with an ACTIVE couple space (mutual consent — see propose/accept_couple).
  if (!isMultiplayerConfigured()) return null;
  try {
    const { listSpaces, singleActiveCouple, otherMember } = await import('$lib/account/spaces');
    const spaces = await listSpaces();
    const space = singleActiveCouple(spaces);
    if (!space) return null;
    const partner = otherMember(space, p);
    if (!partner) return null;
    const label = partner.display_name || `@${partner.handle}`;
    return { me: p, other: partner.id, label, legacy: false, coupleId: space.id };
  } catch {
    return null; // offline / no Supabase session — try again on refresh
  }
}

function partnerName(_me: string): string {
  return identity?.label ?? get(t)('couple.name.partner', { default: 'O teu amor' });
}

/** Fold a fresh server snapshot into the reactive state (+ ping detection). */
function applySnapshot(me: ChatProfile, snap: CoupleSnapshot): void {
  const other = otherProfile(me);
  // In Supabase mode the couple_points table owns the counter — don't let the
  // Blobs snapshot overwrite it (Blobs still carries scores/pings).
  if (!supaActive) {
    couple.myPoints = snap.couple.points[me] ?? 0;
    couple.partnerPoints = snap.couple.points[other] ?? 0;
    couple.points = couple.myPoints + couple.partnerPoints;
  }
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
    receivePing(me, ping.kind, `${ping.kind}:${other}:${ts}`, 'poll');
  }
}

function receivePing(
  me: string,
  kind: 'love' | 'nudge',
  eventId: string,
  source: CoupleMomentSource
): void {
  const name = partnerName(me);
  presentCoupleMoment({
    id: eventId,
    kind,
    senderId: identity?.other ?? '',
    senderName: name,
    body:
      kind === 'love'
        ? get(t)('couple.ping.love.received', { values: { name }, default: `💛 ${name} ama-te muito!` })
        : get(t)('couple.ping.nudge.received', { values: { name }, default: `👀 ${name} tem saudades tuas!` }),
    href: '/',
    createdAt: Date.now(),
    source
  });
}

// ── realtime broadcast fast-path (optional, Supabase-gated) ─────────────────

/** Monotonic merge so a dropped/dup/stale broadcast can never lower the count. */
function applyPartnerPoints(me: string, from: string, total: number): void {
  if (from === me) return; // self:false already filters; belt-and-suspenders
  couple.partnerPoints = Math.max(couple.partnerPoints, total);
  couple.points = couple.myPoints + couple.partnerPoints;
}

async function connectRealtime(id: CoupleIdentity): Promise<void> {
  if (room || typeof window === 'undefined' || !isMultiplayerConfigured()) return;
  try {
    const { joinRoom } = await import('$lib/multiplayer/realtime');
    const me = id.me;
    // Legacy pair keeps its constant channel; account couples get a channel
    // scoped by their couple-space id. Role just needs to differ per member.
    const channel = id.legacy ? COUPLE_CHANNEL : `couple:${id.coupleId}`;
    const role = id.legacy ? coupleRole(me as ChatProfile) : me < id.other ? 'host' : 'guest';
    const r = await joinRoom(channel, { role, name: me, mascot: '' });
    room = r;
    const other = id.other;
    r.on('points', (p: { profile?: string; total?: number }) => {
      if (p?.profile && typeof p.total === 'number') applyPartnerPoints(me, p.profile, p.total);
    });
    const onPing = (kind: 'love' | 'nudge') => (p: { id?: string; profile?: string; ts?: number }) => {
      if (p?.profile !== other) return;
      // Account pings carry the same UUID through broadcast, postgres_changes
      // and Web Push.  Let the exact-id deduper merge those transports instead
      // of dropping legitimate events based on device clocks.
      if (!id.legacy && p.id) {
        receivePing(me, kind, p.id, 'broadcast');
        return;
      }
      const ts = p.ts ?? 0;
      // Before the first snapshot seeds lastPartnerPingTs, adopt without firing.
      if (!seededPing) {
        lastPartnerPingTs = Math.max(lastPartnerPingTs, ts);
        return;
      }
      if (ts > lastPartnerPingTs) {
        lastPartnerPingTs = ts;
        receivePing(me, kind, p.id ?? `${kind}:${p.profile}:${ts}`, 'broadcast');
      }
    };
    r.on('love', onPing('love'));
    r.on('nudge', onPing('nudge'));
    r.onPeerChange((peer) => (couple.partnerOnline = peer !== null));
  } catch (e) {
    // Realtime is a pure enhancement — any failure just leaves the poller alone.
    console.warn('[couple] realtime connect failed; poll-only', e);
    room = null;
  }
}

/** Pull the authoritative point tallies from Supabase — used to seed and to
 *  reconcile after a dropped realtime event or a failed flush. */
async function reconcileSupabasePoints(): Promise<void> {
  const id = identity;
  if (!supaActive || !supa || !id) return;
  try {
    const points = await supa.fetchCouplePoints(id.coupleId);
    couple.myPoints = points[id.me] ?? 0;
    couple.partnerPoints = points[id.other] ?? 0;
    couple.points = couple.myPoints + couple.partnerPoints;
    couple.online = true;
  } catch {
    /* keep the current display */
  }
}

/** Hydrate + live-subscribe the durable Supabase points counter. On any failure
 *  we clear supaActive so the Blobs counter transparently takes back over. */
async function initSupabasePoints(id: CoupleIdentity): Promise<void> {
  try {
    const mod = await import('$lib/couple/couple-supabase');
    supa = mod;
    const me = id.me;
    const other = id.other;
    // Pings arrive purely over the broadcast channel here (no Blobs snapshot to
    // seed from), so mark seeded → the first incoming ping actually fires.
    seededPing = true;
    // Subscribe FIRST so no change is missed in the gap before the initial fetch.
    supaPointsUnsub?.();
    supaPointsUnsub = mod.subscribeCouplePoints(id.coupleId, (prof, pts) => {
      // Monotonic: never let an out-of-order event lower the count.
      if (prof === me) couple.myPoints = Math.max(couple.myPoints, pts);
      else if (prof === other) couple.partnerPoints = Math.max(couple.partnerPoints, pts);
      couple.points = couple.myPoints + couple.partnerPoints;
    });
    subscribePersistedPings(id);
    await reconcileSupabasePoints();
    couple.ready = true;
  } catch (e) {
    console.warn('[couple] Supabase points unavailable; using the Blobs counter', e);
    supa = null;
    supaActive = false;
    supaPointsUnsub?.();
    supaPointsUnsub = null;
  }
}

// ── pings persistidos (couple_pings) ────────────────────────────────────────
// O broadcast (room) exige as DUAS apps abertas e ligadas ao mesmo tempo; as
// rows em couple_pings chegam por postgres_changes a qualquer app aberta e
// alimentam a página de notificações. Todos os transportes carregam o mesmo
// UUID; CoupleMomentLayer apresenta cada evento exatamente uma vez.
let pingsChannelUnsub: (() => void) | null = null;
function subscribePersistedPings(id: CoupleIdentity): void {
  if (id.legacy) return; // par legado: pings continuam via Blobs snapshot
  void (async () => {
    try {
      const { getSupabaseClient } = await import('$lib/multiplayer/client');
      const startedAt = Date.now();
      pingsChannelUnsub?.();
      const channel = getSupabaseClient()
        .channel(`couple_pings:${id.coupleId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'couple_pings', filter: `couple_id=eq.${id.coupleId}` },
          (payload) => {
            const row = payload.new as { id?: string; sender?: string; kind?: 'love' | 'nudge'; created_at?: string };
            if (row.sender !== id.other) return; // os meus próprios não tocam
            if (row.created_at && Date.parse(row.created_at) < startedAt) return; // histórico
            const kind = row.kind === 'nudge' ? 'nudge' : 'love';
            receivePing(id.me, kind, row.id ?? `${kind}:${row.sender}:${row.created_at ?? Date.now()}`, 'postgres');
          }
        )
        .subscribe();
      pingsChannelUnsub = () => void getSupabaseClient().removeChannel(channel);
    } catch {
      /* realtime é enhancement — o push e o broadcast continuam */
    }
  })();
}

/** Fire-and-forget a channel message; a dead channel is fine (poll reconciles). */
function broadcast(event: string, payload: unknown): void {
  try {
    room?.send(event, payload);
  } catch {
    /* channel down — the poller reconciles */
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

async function sendPing(kind: 'love' | 'nudge'): Promise<PingResult> {
  const id = identity;
  if (!id) return 'disabled';
  const me = id.me;
  // Legacy pair needs its chat token (durable Blobs ping); account couples
  // deliver via broadcast (app aberta) E via Web Push (app fechada), por isso
  // já não exigem o room.
  if (id.legacy && !getChatToken(me as ChatProfile)) return 'disabled';
  const now = Date.now();
  const lastAt = kind === 'love' ? lastLoveAt : lastNudgeAt;
  if (now - lastAt < PING_COOLDOWN_MS) return 'cooldown';
  if (kind === 'love') lastLoveAt = now;
  else lastNudgeAt = now;
  if (!id.legacy) {
    const eventId = crypto.randomUUID();
    // Account couple: instant broadcast (ephemeral by design — like the
    // surprise heart, a ping is a "right now" moment, not a mailbox) + Web
    // Push real nos dispositivos do parceiro, com o MEU nome no título.
    if (room) broadcast(kind, { id: eventId, profile: me, ts: now });
    // Persistência (couple_pings): alimenta a página de notificações e entrega
    // o toast via postgres_changes quando a sala broadcast não está ligada.
    void (async () => {
      try {
        const { getSupabaseClient } = await import('$lib/multiplayer/client');
        await getSupabaseClient()
          .from('couple_pings')
          .insert({ id: eventId, couple_id: id.coupleId, sender: me, kind });
      } catch {
        /* best-effort */
      }
    })();
    void (async () => {
      const [{ sendPingPush }, { accountState }] = await Promise.all([
        import('$lib/push'),
        import('$lib/account/account-store.svelte')
      ]);
      const myName =
        accountState.account?.display_name ||
        (accountState.account ? `@${accountState.account.handle}` : '💞');
      const title =
        kind === 'love'
          ? get(t)('couple.ping.love.received', { values: { name: myName }, default: `💛 ${myName} ama-te muito!` })
          : get(t)('couple.ping.nudge.received', { values: { name: myName }, default: `👀 ${myName} tem saudades tuas!` });
      const body = get(t)('couple.ping.push_body', { default: 'Toca para abrir o Presuntinho 🐷' });
      await sendPingPush(kind, title, body, eventId);
    })();
    return 'sent';
  }
  try {
    const snap =
      kind === 'love' ? await postCoupleLove(me as ChatProfile) : await postCoupleNudge(me as ChatProfile);
    applySnapshot(me as ChatProfile, snap);
    // Use the timestamp committed by the server so the Realtime fast-path and
    // the subsequent poll share one event id. Falling back only protects old
    // server responses that predate the ping snapshot field.
    broadcast(kind, { profile: me, ts: snap.couple.pings[me as ChatProfile]?.ts ?? now });
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
  // Identity resolution is async for account couples (needs listSpaces). The
  // legacy pair resolves on the fast path inside resolveIdentity().
  void (async () => {
    identity = await resolveIdentity();
    const id = identity;
    publishIdentity(id);
    if (!id) return;
    // Open the realtime fast-path when Supabase is configured (no-op otherwise).
    void connectRealtime(id);
    // Durable POINTS via Supabase when configured — set the flag synchronously
    // so the Blobs poll never overwrites the Supabase counter, then hydrate.
    if (isMultiplayerConfigured() && !id.legacy) {
      supaActive = true;
      void initSupabasePoints(id);
    }
  })();

  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      void poll();
      void reconcileSupabasePoints(); // catch up on anything realtime missed
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  void poll();
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    void poll();
    // In Supabase mode poll() no-ops on points; reconcile heals realtime gaps.
    void reconcileSupabasePoints();
  }, POLL_MS);

  cleanupListeners = () => {
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/**
 * Recompute `couple.enabled` after the chat token changes (e.g. saved/cleared in
 * Settings) so the couple features light up WITHOUT a reload, and (re)open the
 * realtime channel + do an immediate reconciliation poll.
 */
export function refreshCoupleEnabled(): void {
  void (async () => {
    const next = await resolveIdentity();
    const previous = identity;
    identity = next;
    const id = next;
    publishIdentity(id);

    // A freshly accepted/changed couple must never keep the prior points/ping
    // subscriptions alive.  This also fixes the no-reload activation race.
    if (previous?.coupleId !== id?.coupleId || previous?.me !== id?.me) {
      supaPointsUnsub?.();
      supaPointsUnsub = null;
      pingsChannelUnsub?.();
      pingsChannelUnsub = null;
      supa = null;
      supaActive = false;
      couple.myPoints = 0;
      couple.partnerPoints = 0;
      couple.points = 0;
    }
    if (id) {
      // The channel may have re-scoped (a couple just became active) — rejoin.
      void room?.leave();
      room = null;
      void connectRealtime(id);
      if (isMultiplayerConfigured() && !id.legacy && !supaActive) {
        supaActive = true;
        void initSupabasePoints(id);
      }
      void poll();
      void reconcileSupabasePoints();
    } else {
      void room?.leave();
      room = null;
      couple.partnerOnline = false;
      supaPointsUnsub?.();
      supaPointsUnsub = null;
      pingsChannelUnsub?.();
      pingsChannelUnsub = null;
      supa = null;
      supaActive = false;
    }
  })();
}

export function stopCouplePoller(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  started = false;
  cleanupListeners?.();
  cleanupListeners = null;
  void room?.leave();
  room = null;
  couple.partnerOnline = false;
  supaPointsUnsub?.();
  supaPointsUnsub = null;
  pingsChannelUnsub?.();
  pingsChannelUnsub = null;
  supa = null;
  supaActive = false;
  identity = null;
  publishIdentity(null);
}
