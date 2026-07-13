// Authoritative surprise-heart windows for account couples.
//
// The database owns the random schedule. Clients only project the server clock,
// render the returned window and listen for changes to that couple's single row.
// Every public operation receives the couple id explicitly: no mutable global
// scope, and therefore no chance of writing/subscribing to a previous couple.

import { getSupabaseClient } from '$lib/multiplayer/client';

export type CoupleHeartPhase = 'scheduled' | 'visible' | 'expired';

export interface CoupleHeartWindow {
  sessionId: string;
  visibleFromMs: number;
  visibleUntilMs: number;
  tapSeq: number;
  lastTapper: string | null;
  /** Shared future server timestamp for the most recently committed tap. */
  feedbackAtMs: number | null;
}

/** Parsed row returned by `couple_heart_state`. */
export interface CoupleHeartStateRow extends CoupleHeartWindow {
  serverNowMs: number;
}

/** State plus the request timing needed to project the server clock locally. */
export interface CoupleHeartState extends CoupleHeartStateRow {
  coupleId: string;
  requestStartedAtMs: number;
  responseReceivedAtMs: number;
  serverOffsetMs: number;
}

export interface CoupleHeartWindowDelays {
  phase: CoupleHeartPhase;
  /** Delay from the RPC's server timestamp until the window opens. */
  showInMs: number;
  /** Delay from the same timestamp until the window closes. */
  hideInMs: number;
  /** When zero, request a fresh authoritative state immediately. */
  refreshInMs: number;
}

/** Parsed row returned by `couple_heart_tap`. */
export interface CoupleHeartTapRow {
  tapId: string;
  memberPoints: number;
  totalPoints: number;
  tapSeq: number;
  feedbackAtMs: number;
  serverNowMs: number;
}

export interface CoupleHeartTapResult extends CoupleHeartTapRow {
  coupleId: string;
  sessionId: string;
  requestStartedAtMs: number;
  responseReceivedAtMs: number;
  serverOffsetMs: number;
}

/** Full table row delivered by `postgres_changes`. */
export interface CoupleHeartRow extends CoupleHeartWindow {
  coupleId: string;
  lastTapAtMs: number | null;
  updatedAtMs: number;
}

/** Backwards-readable name for consumers that treat Realtime rows as changes. */
export type CoupleHeartSessionChange = CoupleHeartRow;

export interface CoupleHeartSubscriptionOptions {
  /** Malformed payloads and terminal channel errors are surfaced here. */
  onError?: (error: Error) => void;
  /** Optional diagnostic hook for SUBSCRIBED/CLOSED/etc. */
  onStatus?: (status: string) => void;
}

type UnknownRow = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let channelSequence = 0;

export class CoupleHeartProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoupleHeartProtocolError';
  }
}

function isRow(value: unknown): value is UnknownRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Supabase returns `RETURNS TABLE` RPCs as an array. Tests, `.single()` callers
 * and future adapters may hand us the row object directly, so accept both while
 * still rejecting empty/malformed responses loudly.
 */
function firstRpcRow(value: unknown, rpcName: string): UnknownRow {
  if (isRow(value)) return value;
  if (Array.isArray(value)) {
    const row = value.find(isRow);
    if (row) return row;
  }
  throw new CoupleHeartProtocolError(`${rpcName} returned no row`);
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) {
    throw new CoupleHeartProtocolError(`${field} must be a UUID`);
  }
  return value.trim().toLowerCase();
}

function nullableUuid(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return uuid(value, field);
}

function freshTapId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new CoupleHeartProtocolError('secure tap UUID generation is unavailable');
  }
  return crypto.randomUUID();
}

function timestampMs(value: unknown, field: string): number {
  const parsed =
    value instanceof Date
      ? value.getTime()
      : typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim()
          ? Date.parse(value)
          : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new CoupleHeartProtocolError(`${field} must be a valid timestamp`);
  }
  return parsed;
}

function nullableTimestampMs(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  return timestampMs(value, field);
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CoupleHeartProtocolError(`${field} must be a non-negative safe integer`);
  }
  return parsed;
}

function validWindow(row: UnknownRow): CoupleHeartWindow {
  const visibleFromMs = timestampMs(row.visible_from, 'visible_from');
  const visibleUntilMs = timestampMs(row.visible_until, 'visible_until');
  if (visibleUntilMs <= visibleFromMs) {
    throw new CoupleHeartProtocolError('visible_until must be after visible_from');
  }
  return {
    sessionId: uuid(row.session_id, 'session_id'),
    visibleFromMs,
    visibleUntilMs,
    tapSeq: nonNegativeInteger(row.tap_seq, 'tap_seq'),
    lastTapper: nullableUuid(row.last_tapper, 'last_tapper'),
    feedbackAtMs: nullableTimestampMs(row.feedback_at, 'feedback_at')
  };
}

/** Pure parser for the table-return value from `couple_heart_state`. */
export function parseCoupleHeartState(value: unknown): CoupleHeartStateRow {
  const row = firstRpcRow(value, 'couple_heart_state');
  return {
    ...validWindow(row),
    serverNowMs: timestampMs(row.server_now, 'server_now')
  };
}

/** Pure parser for the table-return value from `couple_heart_tap`. */
export function parseCoupleHeartTap(value: unknown): CoupleHeartTapRow {
  const row = firstRpcRow(value, 'couple_heart_tap');
  return {
    tapId: uuid(row.tap_id, 'tap_id'),
    memberPoints: nonNegativeInteger(row.member_points, 'member_points'),
    totalPoints: nonNegativeInteger(row.total_points, 'total_points'),
    tapSeq: nonNegativeInteger(row.tap_seq, 'tap_seq'),
    feedbackAtMs: timestampMs(row.feedback_at, 'feedback_at'),
    serverNowMs: timestampMs(row.server_now, 'server_now')
  };
}

/** Pure parser for an INSERT/UPDATE `couple_heart_sessions` payload. */
export function parseCoupleHeartSessionChange(value: unknown): CoupleHeartSessionChange {
  if (!isRow(value)) {
    throw new CoupleHeartProtocolError('couple_heart_sessions change returned no row');
  }
  return {
    ...validWindow(value),
    coupleId: uuid(value.couple_id, 'couple_id'),
    lastTapAtMs: nullableTimestampMs(value.last_tap_at, 'last_tap_at'),
    updatedAtMs: timestampMs(value.updated_at, 'updated_at')
  };
}

/**
 * Estimate `server - local` using the request midpoint, which halves symmetric
 * network latency instead of treating the response arrival as server-now.
 */
export function estimateServerOffsetMs(
  serverNowMs: number,
  requestStartedAtMs: number,
  responseReceivedAtMs: number
): number {
  if (![serverNowMs, requestStartedAtMs, responseReceivedAtMs].every(Number.isFinite)) {
    throw new TypeError('server clock inputs must be finite');
  }
  if (responseReceivedAtMs < requestStartedAtMs) {
    throw new RangeError('responseReceivedAtMs must not precede requestStartedAtMs');
  }
  return serverNowMs - (requestStartedAtMs + responseReceivedAtMs) / 2;
}

/** Project the current server timestamp from a local timestamp and offset. */
export function serverTimeMs(localNowMs: number, serverOffsetMs: number): number {
  if (!Number.isFinite(localNowMs) || !Number.isFinite(serverOffsetMs)) {
    throw new TypeError('server time inputs must be finite');
  }
  return localNowMs + serverOffsetMs;
}

/** Database-compatible phase: start inclusive, end exclusive. */
export function heartPhaseAtServerTime(
  window: Pick<CoupleHeartWindow, 'visibleFromMs' | 'visibleUntilMs'>,
  serverNowMs: number
): CoupleHeartPhase {
  if (![window.visibleFromMs, window.visibleUntilMs, serverNowMs].every(Number.isFinite)) {
    throw new TypeError('heart phase inputs must be finite');
  }
  if (window.visibleUntilMs <= window.visibleFromMs) {
    throw new RangeError('visibleUntilMs must be after visibleFromMs');
  }
  if (serverNowMs < window.visibleFromMs) return 'scheduled';
  if (serverNowMs < window.visibleUntilMs) return 'visible';
  return 'expired';
}

/** Milliseconds until the next phase boundary; expired windows return zero. */
export function delayToNextHeartPhaseMs(
  window: Pick<CoupleHeartWindow, 'visibleFromMs' | 'visibleUntilMs'>,
  serverNowMs: number
): number {
  const phase = heartPhaseAtServerTime(window, serverNowMs);
  if (phase === 'scheduled') return Math.max(0, window.visibleFromMs - serverNowMs);
  if (phase === 'visible') return Math.max(0, window.visibleUntilMs - serverNowMs);
  return 0;
}

/**
 * Show/hide timers for a server-time projection. Callers must first project the
 * current server clock with `Date.now() + serverOffsetMs`; passing the frozen
 * timestamp from an older RPC response would reintroduce network-delay skew.
 * The helper itself stays fully pure for deterministic scheduling/tests.
 */
export function heartWindowDelays(
  state: Pick<CoupleHeartStateRow, 'visibleFromMs' | 'visibleUntilMs' | 'serverNowMs'>
): CoupleHeartWindowDelays {
  const phase = heartPhaseAtServerTime(state, state.serverNowMs);
  const showInMs = Math.max(0, state.visibleFromMs - state.serverNowMs);
  const hideInMs = Math.max(0, state.visibleUntilMs - state.serverNowMs);
  return {
    phase,
    showInMs,
    hideInMs,
    refreshInMs: phase === 'expired' ? 0 : hideInMs
  };
}

/** Fetch/create/advance the one authoritative window for this explicit couple. */
export async function fetchCoupleHeartState(coupleId: string): Promise<CoupleHeartState> {
  const scopedCoupleId = uuid(coupleId, 'coupleId');
  const requestStartedAtMs = Date.now();
  const { data, error } = await getSupabaseClient().rpc('couple_heart_state', {
    p_couple_id: scopedCoupleId
  });
  const responseReceivedAtMs = Date.now();
  if (error) throw error;
  const row = parseCoupleHeartState(data);
  return {
    ...row,
    coupleId: scopedCoupleId,
    requestStartedAtMs,
    responseReceivedAtMs,
    serverOffsetMs: estimateServerOffsetMs(
      row.serverNowMs,
      requestStartedAtMs,
      responseReceivedAtMs
    )
  };
}

/** Compatibility alias for call sites that prefer `get` terminology. */
export const getCoupleHeartState = fetchCoupleHeartState;

/** Atomically award one point for the caller during this exact shared window. */
export async function tapCoupleHeart(
  coupleId: string,
  sessionId: string,
  tapId: string = freshTapId()
): Promise<CoupleHeartTapResult> {
  const scopedCoupleId = uuid(coupleId, 'coupleId');
  const scopedSessionId = uuid(sessionId, 'sessionId');
  const scopedTapId = uuid(tapId, 'tapId');
  const requestStartedAtMs = Date.now();
  const { data, error } = await getSupabaseClient().rpc('couple_heart_tap', {
    p_couple_id: scopedCoupleId,
    p_session_id: scopedSessionId,
    p_tap_id: scopedTapId
  });
  const responseReceivedAtMs = Date.now();
  if (error) throw error;
  const row = parseCoupleHeartTap(data);
  if (row.tapId !== scopedTapId) {
    throw new CoupleHeartProtocolError('couple_heart_tap returned a different tap_id');
  }
  return {
    ...row,
    coupleId: scopedCoupleId,
    sessionId: scopedSessionId,
    requestStartedAtMs,
    responseReceivedAtMs,
    serverOffsetMs: estimateServerOffsetMs(
      row.serverNowMs,
      requestStartedAtMs,
      responseReceivedAtMs
    )
  };
}

/**
 * Subscribe to this couple's authoritative session row. DELETE is intentionally
 * ignored: couple membership/state owns unmounting; INSERT and UPDATE carry the
 * full new row needed to schedule, count taps and identify the remote tapper.
 */
export function subscribeCoupleHeart(
  coupleId: string,
  onChange: (change: CoupleHeartSessionChange) => void,
  options: CoupleHeartSubscriptionOptions = {}
): () => void {
  const scopedCoupleId = uuid(coupleId, 'coupleId');
  const client = getSupabaseClient();
  const channel = client
    .channel(`couple_heart:${scopedCoupleId}:${++channelSequence}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'couple_heart_sessions',
        filter: `couple_id=eq.${scopedCoupleId}`
      },
      (payload) => {
        if (payload.eventType === 'DELETE') return;
        try {
          const change = parseCoupleHeartSessionChange(payload.new);
          // The server-side filter should guarantee this; keep the callback
          // scoped even if a mocked/misconfigured Realtime server does not.
          if (change.coupleId === scopedCoupleId) onChange(change);
        } catch (error) {
          options.onError?.(
            error instanceof Error ? error : new CoupleHeartProtocolError('Invalid heart change')
          );
        }
      }
    )
    .subscribe((status) => {
      options.onStatus?.(status);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        options.onError?.(new Error(`couple heart realtime ${status.toLowerCase()}`));
      }
    });

  return () => {
    void client.removeChannel(channel);
  };
}
