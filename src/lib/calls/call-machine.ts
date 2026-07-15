import type { CallSession } from './types';

/**
 * UI phases are deliberately more precise than call_sessions.status.
 * The legacy backend uses `ringing` for a newly-created call, but the UI must
 * not claim that the other phone is ringing until a delivery acknowledgement
 * has arrived from one of that account's installations.
 */
export type CallPhase =
	| 'idle'
	| 'preparing'
	| 'creating'
	| 'notifying'
	| 'contacting'
	| 'ringing'
	| 'incoming'
	| 'connecting'
	| 'active'
	| 'reconnecting'
	| 'ended'
	| 'error';

export type CallOutcome =
	| 'completed'
	| 'declined'
	| 'cancelled'
	| 'missed'
	| 'busy'
	| 'unreachable'
	| 'failed'
	| 'connection_lost'
	| 'answered_elsewhere';

export interface CallMachineState {
	phase: CallPhase;
	call: CallSession | null;
	error: string | null;
	outcome: CallOutcome | null;
}

export type CallMachineEvent =
	| { type: 'PREPARE' }
	| { type: 'CREATE' }
	| { type: 'NOTIFYING'; call: CallSession }
	| { type: 'CONTACTING'; call?: CallSession }
	| { type: 'RINGING'; call?: CallSession }
	| { type: 'INCOMING'; call: CallSession }
	| { type: 'ACCEPTED'; call: CallSession }
	| { type: 'CONNECTED' }
	| { type: 'CONNECTION_LOST' }
	| { type: 'RECONNECTED' }
	| { type: 'ENDED'; call?: CallSession | null; outcome?: CallOutcome }
	| { type: 'FAIL'; message: string; outcome?: CallOutcome }
	| { type: 'RESET' };

export const INITIAL_CALL_MACHINE: CallMachineState = {
	phase: 'idle',
	call: null,
	error: null,
	outcome: null
};

const OUTGOING_WAIT_PHASES: CallPhase[] = ['notifying', 'contacting', 'ringing'];

/** Pure transition reducer; side effects live in CallStore. */
export function reduceCallMachine(state: CallMachineState, event: CallMachineEvent): CallMachineState {
	switch (event.type) {
		case 'PREPARE':
			return state.phase === 'idle' || state.phase === 'ended' || state.phase === 'error'
				? { phase: 'preparing', call: null, error: null, outcome: null }
				: state;
		case 'CREATE':
			return state.phase === 'preparing' ? { ...state, phase: 'creating', error: null } : state;
		case 'NOTIFYING':
			return state.phase === 'creating'
				? { phase: 'notifying', call: event.call, error: null, outcome: null }
				: state;
		case 'CONTACTING':
			return state.phase === 'notifying' || state.phase === 'contacting'
				? { ...state, phase: 'contacting', call: event.call ?? state.call, error: null }
				: state;
		case 'RINGING':
			return OUTGOING_WAIT_PHASES.includes(state.phase)
				? { ...state, phase: 'ringing', call: event.call ?? state.call, error: null }
				: state;
		case 'INCOMING':
			return state.phase === 'idle' || state.phase === 'ended' || state.phase === 'error'
				? { phase: 'incoming', call: event.call, error: null, outcome: null }
				: state;
		case 'ACCEPTED':
			return state.call?.id === event.call.id &&
				(state.phase === 'incoming' || OUTGOING_WAIT_PHASES.includes(state.phase) || state.phase === 'connecting')
				? { phase: 'connecting', call: event.call, error: null, outcome: null }
				: state;
		case 'CONNECTED':
			return (state.phase === 'connecting' || state.phase === 'reconnecting') && state.call
				? { ...state, phase: 'active', error: null }
				: state;
		case 'CONNECTION_LOST':
			return state.phase === 'active' && state.call
				? { ...state, phase: 'reconnecting', error: null }
				: state;
		case 'RECONNECTED':
			return state.phase === 'reconnecting' && state.call
				? { ...state, phase: 'active', error: null }
				: state;
		case 'ENDED':
			return state.phase === 'idle'
				? state
				: {
						phase: 'ended',
						call: event.call === undefined ? state.call : event.call,
						error: null,
						outcome: event.outcome ?? 'completed'
					};
		case 'FAIL':
			return {
				phase: 'error',
				call: state.call,
				error: event.message,
				outcome: event.outcome ?? 'failed'
			};
		case 'RESET':
			return { ...INITIAL_CALL_MACHINE };
	}
}
