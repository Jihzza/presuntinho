import { describe, expect, it } from 'vitest';
import { INITIAL_CALL_MACHINE, reduceCallMachine } from './call-machine';
import {
	callTopic,
	deliveryConfirmsRinging,
	isCallSignalEnvelope,
	parseCallDelivery,
	parseCallSession,
	type CallSession
} from './types';

const ROW = {
	id: '18ef18ff-0001-485a-b0ce-08c535bc5c6e',
	conversation_id: '28ef18ff-0001-485a-b0ce-08c535bc5c6e',
	caller: '38ef18ff-0001-485a-b0ce-08c535bc5c6e',
	callee: '48ef18ff-0001-485a-b0ce-08c535bc5c6e',
	caller_device: 'device-a-1234567890',
	callee_device: null,
	kind: 'audio',
	status: 'ringing',
	created_at: '2026-07-15T10:00:00.000Z',
	expires_at: '2026-07-15T10:01:00.000Z',
	caller_heartbeat_at: '2026-07-15T10:00:00.000Z',
	callee_heartbeat_at: null,
	caller_lease_expires_at: '2026-07-15T10:02:00.000Z',
	callee_lease_expires_at: null,
	push_sent_at: null,
	answered_at: null,
	ended_at: null
} as const;

describe('call session boundary', () => {
	it('normalizes a valid database row and rejects forged shapes', () => {
		expect(parseCallSession(ROW)).toMatchObject({
			id: ROW.id,
			conversationId: ROW.conversation_id,
			caller: ROW.caller,
			callee: ROW.callee,
			kind: 'audio',
			status: 'ringing'
		});
		expect(parseCallSession({ ...ROW, callee: ROW.caller })).toBeNull();
		expect(parseCallSession({ ...ROW, kind: 'screen' })).toBeNull();
		expect(parseCallSession({ ...ROW, expires_at: 'never' })).toBeNull();
	});

	it('scopes signalling to the call and authenticated other participant', () => {
		const envelope = {
			v: 1,
			callId: ROW.id,
			from: ROW.callee,
			device: 'device-b-1234567890',
			seq: 2,
			signal: { type: 'restart-request' }
		};
		expect(callTopic(ROW.id)).toBe(`call:${ROW.id}`);
		expect(isCallSignalEnvelope(envelope, ROW.id, ROW.callee)).toBe(true);
		expect(isCallSignalEnvelope(envelope, ROW.id, ROW.callee, 'device-b-1234567890')).toBe(true);
		expect(isCallSignalEnvelope(envelope, ROW.id, ROW.callee, 'device-c-1234567890')).toBe(false);
		expect(isCallSignalEnvelope(envelope, ROW.id, ROW.caller)).toBe(false);
		expect(isCallSignalEnvelope({ ...envelope, seq: 2.5 }, ROW.id, ROW.callee)).toBe(false);
	});

	it('only treats an explicit device ringing/opened ACK as ringing', () => {
		expect(parseCallDelivery({
			call_id: ROW.id,
			installation_id: 'install-a',
			stage: 'presented',
			updated_at: ROW.created_at
		})).toMatchObject({ stage: 'presented' });
		expect(parseCallDelivery({
			call_id: ROW.id,
			installation_id: 'install-a',
			status: 'ringing',
			updated_at: ROW.created_at
		})).toMatchObject({ stage: 'ringing' });
		expect(deliveryConfirmsRinging('provider_accepted')).toBe(false);
		expect(deliveryConfirmsRinging('presented')).toBe(false);
		expect(deliveryConfirmsRinging('ringing')).toBe(true);
		expect(deliveryConfirmsRinging('opened')).toBe(false);
	});
});

describe('call state machine', () => {
	it('moves an outgoing call through factual delivery and connection phases', () => {
		const ringing = parseCallSession(ROW) as CallSession;
		const accepted = {
			...ringing,
			status: 'accepted' as const,
			calleeDevice: 'device-b-1234567890',
			calleeHeartbeatAt: '2026-07-15T10:00:12.000Z',
			calleeLeaseExpiresAt: '2026-07-15T10:02:12.000Z',
			answeredAt: '2026-07-15T10:00:12.000Z'
		};
		let state = reduceCallMachine(INITIAL_CALL_MACHINE, { type: 'PREPARE' });
		expect(state.phase).toBe('preparing');
		state = reduceCallMachine(state, { type: 'CREATE' });
		expect(state.phase).toBe('creating');
		state = reduceCallMachine(state, { type: 'NOTIFYING', call: ringing });
		expect(state.phase).toBe('notifying');
		state = reduceCallMachine(state, { type: 'CONTACTING' });
		expect(state.phase).toBe('contacting');
		state = reduceCallMachine(state, { type: 'RINGING' });
		expect(state.phase).toBe('ringing');
		state = reduceCallMachine(state, { type: 'ACCEPTED', call: accepted });
		expect(state.phase).toBe('connecting');
		state = reduceCallMachine(state, { type: 'CONNECTED' });
		expect(state.phase).toBe('active');
	});

	it('shows reconnection without ending an active call', () => {
		const call = parseCallSession(ROW) as CallSession;
		let state = reduceCallMachine(INITIAL_CALL_MACHINE, { type: 'INCOMING', call });
		state = reduceCallMachine(state, { type: 'ACCEPTED', call: { ...call, status: 'accepted' } });
		state = reduceCallMachine(state, { type: 'CONNECTED' });
		state = reduceCallMachine(state, { type: 'CONNECTION_LOST' });
		expect(state.phase).toBe('reconnecting');
		state = reduceCallMachine(state, { type: 'RECONNECTED' });
		expect(state.phase).toBe('active');
	});

	it('does not accept connection events for another call', () => {
		const ringing = parseCallSession(ROW) as CallSession;
		const incoming = reduceCallMachine(INITIAL_CALL_MACHINE, { type: 'INCOMING', call: ringing });
		const other = { ...ringing, id: '58ef18ff-0001-485a-b0ce-08c535bc5c6e', status: 'accepted' as const };
		expect(reduceCallMachine(incoming, { type: 'ACCEPTED', call: other })).toEqual(incoming);
	});

	it('cannot resurrect an ended call with a late accepted event', () => {
		const ringing = parseCallSession(ROW) as CallSession;
		const incoming = reduceCallMachine(INITIAL_CALL_MACHINE, { type: 'INCOMING', call: ringing });
		const ended = reduceCallMachine(incoming, { type: 'ENDED', call: { ...ringing, status: 'declined' } });
		const accepted = { ...ringing, status: 'accepted' as const };
		expect(reduceCallMachine(ended, { type: 'ACCEPTED', call: accepted })).toEqual(ended);
	});
});
