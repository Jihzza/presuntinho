import { describe, expect, it } from 'vitest';
import {
  CoupleHeartProtocolError,
  delayToNextHeartPhaseMs,
  estimateServerOffsetMs,
  heartPhaseAtServerTime,
  heartWindowDelays,
  parseCoupleHeartSessionChange,
  parseCoupleHeartState,
  parseCoupleHeartTap,
  serverTimeMs
} from './couple-heart';

const COUPLE_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const TAPPER_ID = '33333333-3333-4333-8333-333333333333';
const TAP_ID = '44444444-4444-4444-8444-444444444444';
const FROM = '2026-07-13T20:00:10.000Z';
const UNTIL = '2026-07-13T20:00:19.000Z';
const SERVER_NOW = '2026-07-13T20:00:12.250Z';
const FEEDBACK_AT = '2026-07-13T20:00:12.650Z';

const stateRow = {
  session_id: SESSION_ID,
  visible_from: FROM,
  visible_until: UNTIL,
  tap_seq: 7,
  last_tapper: TAPPER_ID,
  feedback_at: FEEDBACK_AT,
  server_now: SERVER_NOW
};

describe('couple heart RPC parsing', () => {
  it('parses the normal RETURNS TABLE array shape', () => {
    expect(parseCoupleHeartState([stateRow])).toEqual({
      sessionId: SESSION_ID,
      visibleFromMs: Date.parse(FROM),
      visibleUntilMs: Date.parse(UNTIL),
      tapSeq: 7,
      lastTapper: TAPPER_ID,
      feedbackAtMs: Date.parse(FEEDBACK_AT),
      serverNowMs: Date.parse(SERVER_NOW)
    });
  });

  it('also accepts a direct row and numeric strings', () => {
    expect(parseCoupleHeartState({ ...stateRow, tap_seq: '8', last_tapper: null })).toMatchObject({
      sessionId: SESSION_ID,
      tapSeq: 8,
      lastTapper: null
    });
  });

  it('finds a row in a defensively wrapped array', () => {
    expect(parseCoupleHeartState([null, stateRow]).sessionId).toBe(SESSION_ID);
  });

  it('rejects empty responses, invalid ids and inverted windows', () => {
    expect(() => parseCoupleHeartState([])).toThrow(CoupleHeartProtocolError);
    expect(() => parseCoupleHeartState({ ...stateRow, session_id: 'not-a-uuid' })).toThrow(
      /session_id/
    );
    expect(() =>
      parseCoupleHeartState({ ...stateRow, visible_until: stateRow.visible_from })
    ).toThrow(/visible_until/);
  });

  it('parses tap totals returned as either numbers or bigint-like strings', () => {
    expect(
      parseCoupleHeartTap([
        {
          tap_id: TAP_ID,
          member_points: '12',
          total_points: 29,
          tap_seq: '41',
          feedback_at: FEEDBACK_AT,
          server_now: SERVER_NOW
        }
      ])
    ).toEqual({
      tapId: TAP_ID,
      memberPoints: 12,
      totalPoints: 29,
      tapSeq: 41,
      feedbackAtMs: Date.parse(FEEDBACK_AT),
      serverNowMs: Date.parse(SERVER_NOW)
    });
  });

  it('rejects negative, fractional and unsafe counters', () => {
    const base = {
      tap_id: TAP_ID,
      member_points: 1,
      total_points: 2,
      tap_seq: 3,
      feedback_at: FEEDBACK_AT,
      server_now: SERVER_NOW
    };
    expect(() => parseCoupleHeartTap({ ...base, member_points: -1 })).toThrow(/member_points/);
    expect(() => parseCoupleHeartTap({ ...base, total_points: 1.5 })).toThrow(/total_points/);
    expect(() => parseCoupleHeartTap({ ...base, tap_seq: '9007199254740992' })).toThrow(/tap_seq/);
  });
});

describe('couple heart Realtime row parsing', () => {
  it('parses the full postgres_changes row', () => {
    expect(
      parseCoupleHeartSessionChange({
        couple_id: COUPLE_ID,
        session_id: SESSION_ID,
        visible_from: FROM,
        visible_until: UNTIL,
        tap_seq: '9',
        last_tapper: TAPPER_ID,
        last_tap_at: SERVER_NOW,
        feedback_at: FEEDBACK_AT,
        updated_at: SERVER_NOW
      })
    ).toEqual({
      coupleId: COUPLE_ID,
      sessionId: SESSION_ID,
      visibleFromMs: Date.parse(FROM),
      visibleUntilMs: Date.parse(UNTIL),
      tapSeq: 9,
      lastTapper: TAPPER_ID,
      feedbackAtMs: Date.parse(FEEDBACK_AT),
      lastTapAtMs: Date.parse(SERVER_NOW),
      updatedAtMs: Date.parse(SERVER_NOW)
    });
  });

  it('allows the nullable tap metadata from a fresh window', () => {
    const parsed = parseCoupleHeartSessionChange({
      couple_id: COUPLE_ID,
      session_id: SESSION_ID,
      visible_from: FROM,
      visible_until: UNTIL,
      tap_seq: 0,
      last_tapper: null,
      last_tap_at: null,
      feedback_at: null,
      updated_at: SERVER_NOW
    });
    expect(parsed).toMatchObject({
      tapSeq: 0,
      lastTapper: null,
      feedbackAtMs: null,
      lastTapAtMs: null
    });
  });
});

describe('server-time heart phase helpers', () => {
  const window = { visibleFromMs: 10_000, visibleUntilMs: 19_000 };

  it('uses the same inclusive-start/exclusive-end boundaries as the RPC', () => {
    expect(heartPhaseAtServerTime(window, 9_999)).toBe('scheduled');
    expect(heartPhaseAtServerTime(window, 10_000)).toBe('visible');
    expect(heartPhaseAtServerTime(window, 18_999)).toBe('visible');
    expect(heartPhaseAtServerTime(window, 19_000)).toBe('expired');
  });

  it('returns the exact delay to start/end and zero once expired', () => {
    expect(delayToNextHeartPhaseMs(window, 8_500)).toBe(1_500);
    expect(delayToNextHeartPhaseMs(window, 12_500)).toBe(6_500);
    expect(delayToNextHeartPhaseMs(window, 19_000)).toBe(0);
  });

  it('derives deterministic show/hide timers from the supplied server-time projection', () => {
    expect(
      heartWindowDelays({ ...window, serverNowMs: 8_500 })
    ).toEqual({
      phase: 'scheduled',
      showInMs: 1_500,
      hideInMs: 10_500,
      refreshInMs: 10_500
    });
    expect(
      heartWindowDelays({ ...window, serverNowMs: 12_500 })
    ).toEqual({
      phase: 'visible',
      showInMs: 0,
      hideInMs: 6_500,
      refreshInMs: 6_500
    });
    expect(
      heartWindowDelays({ ...window, serverNowMs: 19_000 })
    ).toEqual({
      phase: 'expired',
      showInMs: 0,
      hideInMs: 0,
      refreshInMs: 0
    });
  });

  it('rejects malformed timing inputs', () => {
    expect(() => heartPhaseAtServerTime({ visibleFromMs: 2, visibleUntilMs: 1 }, 1)).toThrow(
      RangeError
    );
    expect(() => delayToNextHeartPhaseMs(window, Number.NaN)).toThrow(TypeError);
  });
});

describe('server clock projection', () => {
  it('estimates offset from the request midpoint', () => {
    // Local request midpoint = 1,100; the server says 10,000 → +8,900 offset.
    const offset = estimateServerOffsetMs(10_000, 1_000, 1_200);
    expect(offset).toBe(8_900);
    expect(serverTimeMs(1_300, offset)).toBe(10_200);
  });

  it('rejects an impossible response ordering', () => {
    expect(() => estimateServerOffsetMs(10_000, 1_200, 1_000)).toThrow(RangeError);
  });
});
