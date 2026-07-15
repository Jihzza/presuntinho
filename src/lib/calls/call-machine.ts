import type { CallSession } from './types';

export type CallPhase = 'idle' | 'preparing' | 'incoming' | 'outgoing' | 'connecting' | 'active' | 'ended' | 'error';

export interface CallMachineState {
	phase: CallPhase;
	call: CallSession | null;
	error: string | null;
}

export type CallMachineEvent =
	| { type: 'PREPARE' }
	| { type: 'INCOMING'; call: CallSession }
	| { type: 'OUTGOING'; call: CallSession }
	| { type: 'ACCEPTED'; call: CallSession }
	| { type: 'CONNECTED' }
	| { type: 'ENDED'; call?: CallSession | null }
	| { type: 'FAIL'; message: string }
	| { type: 'RESET' };

export const INITIAL_CALL_MACHINE: CallMachineState = { phase: 'idle', call: null, error: null };

/** Pure transition reducer; side effects live in CallStore. */
export function reduceCallMachine(state: CallMachineState, event: CallMachineEvent): CallMachineState {
	switch (event.type) {
		case 'PREPARE':
			return state.phase === 'idle' || state.phase === 'error'
				? { phase: 'preparing', call: null, error: null }
				: state;
		case 'INCOMING':
			return state.phase === 'idle' || state.phase === 'ended' || state.phase === 'error'
				? { phase: 'incoming', call: event.call, error: null }
				: state;
		case 'OUTGOING':
			return state.phase === 'preparing'
				? { phase: 'outgoing', call: event.call, error: null }
				: state;
		case 'ACCEPTED':
			return state.call?.id === event.call.id &&
				(state.phase === 'incoming' || state.phase === 'outgoing' || state.phase === 'connecting')
				? { phase: 'connecting', call: event.call, error: null }
				: state;
		case 'CONNECTED':
			return state.phase === 'connecting' && state.call
				? { ...state, phase: 'active', error: null }
				: state;
		case 'ENDED':
			return state.phase === 'idle'
				? state
				: { phase: 'ended', call: event.call === undefined ? state.call : event.call, error: null };
		case 'FAIL':
			return { phase: 'error', call: state.call, error: event.message };
		case 'RESET':
			return { ...INITIAL_CALL_MACHINE };
	}
}
