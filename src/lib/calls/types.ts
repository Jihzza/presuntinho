export type CallKind = 'audio' | 'video';

export type CallStatus =
	| 'ringing'
	| 'accepted'
	| 'declined'
	| 'cancelled'
	| 'ended'
	| 'missed'
	| 'failed';

export interface CallSession {
	id: string;
	conversationId: string;
	caller: string;
	callee: string;
	callerDevice: string;
	calleeDevice: string | null;
	kind: CallKind;
	status: CallStatus;
	createdAt: string;
	expiresAt: string;
	callerHeartbeatAt: string;
	calleeHeartbeatAt: string | null;
	callerLeaseExpiresAt: string;
	calleeLeaseExpiresAt: string | null;
	pushSentAt: string | null;
	answeredAt: string | null;
	endedAt: string | null;
}

export interface CallPeerProfile {
	id: string;
	label: string;
	emoji: string;
	avatarUrl: string | null;
}

export type CallDeliveryStage =
	| 'queued'
	| 'dispatching'
	| 'provider_accepted'
	| 'received'
	| 'presented'
	| 'ringing'
	| 'opened'
	| 'failed'
	| 'stale'
	| 'cancelled'
	| 'answered_elsewhere';

export interface CallDelivery {
	callId: string;
	installationId: string | null;
	stage: CallDeliveryStage;
	updatedAt: string | null;
}

export type CallSignal =
	| { type: 'offer'; sdp: RTCSessionDescriptionInit }
	| { type: 'answer'; sdp: RTCSessionDescriptionInit }
	| { type: 'candidate'; candidate: RTCIceCandidateInit | null }
	| { type: 'restart-request' }
	| { type: 'hangup' };

export interface CallSignalEnvelope {
	v: 1;
	callId: string;
	from: string;
	device: string;
	seq: number;
	signal: CallSignal;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE_RE = /^[A-Za-z0-9._:-]{16,160}$/;
const STATUSES = new Set<CallStatus>([
	'ringing',
	'accepted',
	'declined',
	'cancelled',
	'ended',
	'missed',
	'failed'
]);
const DELIVERY_STAGES = new Set<CallDeliveryStage>([
	'queued',
	'dispatching',
	'provider_accepted',
	'received',
	'presented',
	'ringing',
	'opened',
	'failed',
	'stale',
	'cancelled',
	'answered_elsewhere'
]);

function nullableDate(value: unknown): string | null {
	return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

/** Normalize PostgREST/Realtime rows at the trust boundary. */
export function parseCallSession(value: unknown): CallSession | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const row = value as Record<string, unknown>;
	const id = row.id;
	const conversationId = row.conversation_id;
	const caller = row.caller;
	const callee = row.callee;
	const callerDevice = row.caller_device;
	const calleeDevice = row.callee_device;
	const kind = row.kind;
	const status = row.status;
	const createdAt = nullableDate(row.created_at);
	const expiresAt = nullableDate(row.expires_at);
	const callerHeartbeatAt = nullableDate(row.caller_heartbeat_at);
	const calleeHeartbeatAt = nullableDate(row.callee_heartbeat_at);
	const callerLeaseExpiresAt = nullableDate(row.caller_lease_expires_at);
	const calleeLeaseExpiresAt = nullableDate(row.callee_lease_expires_at);
	if (
		typeof id !== 'string' ||
		!UUID_RE.test(id) ||
		typeof conversationId !== 'string' ||
		!UUID_RE.test(conversationId) ||
		typeof caller !== 'string' ||
		!UUID_RE.test(caller) ||
		typeof callee !== 'string' ||
		!UUID_RE.test(callee) ||
		caller === callee ||
		typeof callerDevice !== 'string' ||
		!DEVICE_RE.test(callerDevice) ||
		!(calleeDevice == null || (typeof calleeDevice === 'string' && DEVICE_RE.test(calleeDevice))) ||
		(kind !== 'audio' && kind !== 'video') ||
		typeof status !== 'string' ||
		!STATUSES.has(status as CallStatus) ||
		!createdAt ||
		!expiresAt ||
		!callerHeartbeatAt ||
		!callerLeaseExpiresAt ||
		!(row.callee_heartbeat_at == null || calleeHeartbeatAt) ||
		!(row.callee_lease_expires_at == null || calleeLeaseExpiresAt) ||
		((status === 'accepted') && (!calleeDevice || !calleeHeartbeatAt || !calleeLeaseExpiresAt))
	) {
		return null;
	}
	return {
		id,
		conversationId,
		caller,
		callee,
		callerDevice,
		calleeDevice: typeof calleeDevice === 'string' ? calleeDevice : null,
		kind,
		status: status as CallStatus,
		createdAt,
		expiresAt,
		callerHeartbeatAt,
		calleeHeartbeatAt,
		callerLeaseExpiresAt,
		calleeLeaseExpiresAt,
		pushSentAt: nullableDate(row.push_sent_at),
		answeredAt: nullableDate(row.answered_at),
		endedAt: nullableDate(row.ended_at)
	};
}

/** Parse both Realtime payload rows and PostgREST delivery rows. */
export function parseCallDelivery(value: unknown): CallDelivery | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const row = value as Record<string, unknown>;
	const callId = row.call_id;
	const installationId = row.installation_id;
	const stage = row.stage ?? row.status;
	const updatedAt = nullableDate(row.updated_at ?? row.acknowledged_at ?? row.created_at);
	if (
		typeof callId !== 'string' ||
		!UUID_RE.test(callId) ||
		typeof stage !== 'string' ||
		!DELIVERY_STAGES.has(stage as CallDeliveryStage) ||
		!(installationId == null || typeof installationId === 'string')
	) return null;
	return {
		callId,
		installationId: typeof installationId === 'string' ? installationId : null,
		stage: stage as CallDeliveryStage,
		updatedAt
	};
}

/** Only the foreground UI's explicit ringtone-started ACK may say “ringing”. */
export function deliveryConfirmsRinging(stage: CallDeliveryStage): boolean {
	return stage === 'ringing';
}

export function isCallDeviceId(value: unknown): value is string {
	return typeof value === 'string' && DEVICE_RE.test(value);
}

export function callDeviceForParticipant(call: CallSession, accountId: string): string | null {
	if (call.caller === accountId) return call.callerDevice;
	if (call.callee === accountId) return call.calleeDevice;
	return null;
}

export function isCallLeaseFresh(call: CallSession, accountId: string, now = Date.now()): boolean {
	const expiry = call.caller === accountId
		? call.callerLeaseExpiresAt
		: call.callee === accountId
			? call.calleeLeaseExpiresAt
			: null;
	return Boolean(expiry && Date.parse(expiry) > now);
}

export function isRingingCallLive(call: CallSession, now = Date.now()): boolean {
	return call.status === 'ringing' && Date.parse(call.expiresAt) > now && Date.parse(call.callerLeaseExpiresAt) > now;
}

export function isTerminalCallStatus(status: CallStatus): boolean {
	return status === 'declined' || status === 'cancelled' || status === 'ended' || status === 'missed' || status === 'failed';
}

export function otherCallParticipant(call: CallSession, me: string): string | null {
	if (call.caller === me) return call.callee;
	if (call.callee === me) return call.caller;
	return null;
}

export function callTopic(callId: string): string {
	if (!UUID_RE.test(callId)) throw new Error('invalid call id');
	return `call:${callId}`;
}

export function isCallSignalEnvelope(
	value: unknown,
	callId: string,
	expectedSender: string,
	expectedDevice?: string | null
): value is CallSignalEnvelope {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const envelope = value as Partial<CallSignalEnvelope>;
	if (
		envelope.v !== 1 ||
		envelope.callId !== callId ||
		envelope.from !== expectedSender ||
		!isCallDeviceId(envelope.device) ||
		(Boolean(expectedDevice) && envelope.device !== expectedDevice) ||
		typeof envelope.seq !== 'number' ||
		!Number.isSafeInteger(envelope.seq) ||
		!envelope.signal ||
		typeof envelope.signal !== 'object'
	) return false;
	const signal = envelope.signal as Partial<CallSignal>;
	return signal.type === 'offer' || signal.type === 'answer' || signal.type === 'candidate' || signal.type === 'restart-request' || signal.type === 'hangup';
}
