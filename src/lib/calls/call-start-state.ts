export type CallStartBlockReason =
	| 'call_unavailable'
	| 'call_account_not_ready'
	| 'call_realtime_connecting'
	| 'call_offline'
	| 'call_in_progress'
	| 'call_conversation_missing';

export interface CallStartReasonCopy {
	key: string;
	default: string;
}

const KNOWN_REASONS = new Set<CallStartBlockReason>([
	'call_unavailable',
	'call_account_not_ready',
	'call_realtime_connecting',
	'call_offline',
	'call_in_progress',
	'call_conversation_missing'
]);

export const CALL_START_REASON_COPY: Record<CallStartBlockReason, CallStartReasonCopy> = {
	call_unavailable: {
		key: 'calls.unavailable',
		default: 'Chamadas indisponíveis nesta conversa'
	},
	call_account_not_ready: {
		key: 'calls.readiness.account',
		default: 'A conta ainda está a iniciar'
	},
	call_realtime_connecting: {
		key: 'calls.readiness.connecting',
		default: 'A ligar ao serviço de chamadas'
	},
	call_offline: {
		key: 'calls.readiness.offline',
		default: 'Sem ligação à internet'
	},
	call_in_progress: {
		key: 'calls.readiness.busy',
		default: 'Já existe uma chamada em curso'
	},
	call_conversation_missing: {
		key: 'calls.readiness.conversation',
		default: 'Abre uma conversa primeiro'
	}
};

/**
 * Keep every call entry point on the same blocking rules. An explicit reason
 * comes from the host surface (for example, a chat that is still loading),
 * while the call store remains authoritative for account, network and busy
 * state. Unknown future store errors fail closed with factual generic copy.
 */
export function resolveCallStartBlockReason(
	storeReason: string | null,
	explicitReason: CallStartBlockReason | null = null
): CallStartBlockReason | null {
	if (storeReason) {
		return KNOWN_REASONS.has(storeReason as CallStartBlockReason)
			? (storeReason as CallStartBlockReason)
			: 'call_unavailable';
	}
	return explicitReason;
}
