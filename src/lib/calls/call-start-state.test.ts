import { describe, expect, it } from 'vitest';
import {
	CALL_START_REASON_COPY,
	resolveCallStartBlockReason,
	type CallStartBlockReason
} from './call-start-state';

describe('shared call start state', () => {
	it.each<CallStartBlockReason>([
		'call_unavailable',
		'call_account_not_ready',
		'call_realtime_connecting',
		'call_offline',
		'call_in_progress',
		'call_conversation_missing'
	])('preserves the known factual reason %s', (reason) => {
		expect(resolveCallStartBlockReason(reason)).toBe(reason);
		expect(CALL_START_REASON_COPY[reason].key).toMatch(/^calls\./);
		expect(CALL_START_REASON_COPY[reason].default).not.toBe('');
	});

	it('allows a call only when neither the surface nor the store reports a blocker', () => {
		expect(resolveCallStartBlockReason(null)).toBeNull();
	});

	it('uses the surface reason while a conversation is offline or still loading', () => {
		expect(resolveCallStartBlockReason(null, 'call_offline')).toBe('call_offline');
	});

	it('keeps the call store authoritative when a call is already in progress', () => {
		expect(resolveCallStartBlockReason('call_in_progress', 'call_account_not_ready')).toBe(
			'call_in_progress'
		);
	});

	it('fails closed if the call store adds an unrecognised blocker', () => {
		expect(resolveCallStartBlockReason('call_future_blocker')).toBe('call_unavailable');
	});
});
