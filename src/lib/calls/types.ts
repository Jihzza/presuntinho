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
	updatedAt: string;
	expiresAt: string;
	callerHeartbeatAt: string;
	calleeHeartbeatAt: string | null;
	callerLeaseExpiresAt: string;
	calleeLeaseExpiresAt: string | null;
	pushSentAt: string | null;
	answeredAt: string | null;
	endedAt: string | null;
	handoffGeneration: number;
}

export type CallHandoffStatus =
	| 'requested'
	| 'claimed'
	| 'completed'
	| 'cancelled'
	| 'declined'
	| 'expired'
	| 'reverted'
	| 'terminated';

export interface CallHandoff {
	id: string;
	callId: string;
	account: string;
	fromDevice: string;
	fromInstallationId: string;
	targetInstallationId: string;
	claimedDevice: string | null;
	status: CallHandoffStatus;
	clientRequestId: string;
	sourceGeneration: number;
	claimedGeneration: number | null;
	stateVersion: number;
	createdAt: string;
	updatedAt: string;
	expiresAt: string;
	recoveryExpiresAt: string | null;
	claimDeviceLeaseExpiresAt: string | null;
	claimedAt: string | null;
	completedAt: string | null;
	cancelledAt: string | null;
}

export interface CallHandoffTarget {
	installationId: string;
	platform: string;
	lastSeenAt: string;
	supportsVideo: boolean;
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
	/** Omitted only by rolling generation-zero clients. */
	handoffGeneration?: number;
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
const HANDOFF_STATUSES = new Set<CallHandoffStatus>([
	'requested',
	'claimed',
	'completed',
	'cancelled',
	'declined',
	'expired',
	'reverted',
	'terminated'
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
	const updatedAt = nullableDate(row.updated_at) ?? createdAt;
	const expiresAt = nullableDate(row.expires_at);
	const callerHeartbeatAt = nullableDate(row.caller_heartbeat_at);
	const calleeHeartbeatAt = nullableDate(row.callee_heartbeat_at);
	const callerLeaseExpiresAt = nullableDate(row.caller_lease_expires_at);
	const calleeLeaseExpiresAt = nullableDate(row.callee_lease_expires_at);
	const handoffGeneration = row.handoff_generation ?? 0;
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
		((status === 'accepted') && (!calleeDevice || !calleeHeartbeatAt || !calleeLeaseExpiresAt)) ||
		typeof handoffGeneration !== 'number' ||
		!Number.isSafeInteger(handoffGeneration) ||
		handoffGeneration < 0
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
		updatedAt: updatedAt!,
		expiresAt,
		callerHeartbeatAt,
		calleeHeartbeatAt,
		callerLeaseExpiresAt,
		calleeLeaseExpiresAt,
		pushSentAt: nullableDate(row.push_sent_at),
		answeredAt: nullableDate(row.answered_at),
		endedAt: nullableDate(row.ended_at),
		handoffGeneration
	};
}

/** Account-scoped durable handoff row; it intentionally contains no SDP/ICE. */
export function parseCallHandoff(value: unknown): CallHandoff | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const row = value as Record<string, unknown>;
	const status = row.status;
	const claimedDevice = row.claimed_device;
	const createdAt = nullableDate(row.created_at);
	const expiresAt = nullableDate(row.expires_at);
	const claimedAt = nullableDate(row.claimed_at);
	const completedAt = nullableDate(row.completed_at);
	const cancelledAt = nullableDate(row.cancelled_at);
	const recoveryExpiresAt = nullableDate(row.recovery_expires_at);
	const claimDeviceLeaseExpiresAt = nullableDate(row.claim_device_lease_expires_at);
	const updatedAt = nullableDate(row.updated_at);
	const sourceGeneration = row.source_generation;
	const claimedGeneration = row.claimed_generation;
	const stateVersion = row.state_version;
	const isClaimed = status === 'claimed' || status === 'completed';
	const isClosedWithoutClaim = status === 'cancelled' || status === 'declined' || status === 'expired';
	const isClosedAfterClaim = status === 'reverted' || status === 'terminated';
	if (
		typeof row.id !== 'string' || !UUID_RE.test(row.id) ||
		typeof row.call_id !== 'string' || !UUID_RE.test(row.call_id) ||
		typeof row.account !== 'string' || !UUID_RE.test(row.account) ||
		typeof row.from_device !== 'string' || !DEVICE_RE.test(row.from_device) ||
		typeof row.from_installation_id !== 'string' || !DEVICE_RE.test(row.from_installation_id) ||
		typeof row.target_installation_id !== 'string' || !DEVICE_RE.test(row.target_installation_id) ||
		row.from_installation_id === row.target_installation_id ||
		!(claimedDevice == null || (typeof claimedDevice === 'string' && DEVICE_RE.test(claimedDevice))) ||
		typeof status !== 'string' || !HANDOFF_STATUSES.has(status as CallHandoffStatus) ||
		typeof row.client_request_id !== 'string' || !UUID_RE.test(row.client_request_id) ||
		typeof sourceGeneration !== 'number' || !Number.isSafeInteger(sourceGeneration) || sourceGeneration < 0 ||
		typeof stateVersion !== 'number' || !Number.isSafeInteger(stateVersion) || stateVersion < 0 ||
		!(claimedGeneration == null || (
			typeof claimedGeneration === 'number' &&
			Number.isSafeInteger(claimedGeneration) &&
			claimedGeneration > sourceGeneration
		)) ||
		!createdAt || !updatedAt || !expiresAt ||
		!(row.recovery_expires_at == null || recoveryExpiresAt) ||
		!(row.claim_device_lease_expires_at == null || claimDeviceLeaseExpiresAt) ||
		!(row.claimed_at == null || claimedAt) ||
		!(row.completed_at == null || completedAt) ||
		!(row.cancelled_at == null || cancelledAt) ||
		Date.parse(expiresAt) <= Date.parse(createdAt) ||
		(status === 'requested' && (claimedDevice != null || claimedGeneration != null || recoveryExpiresAt || claimDeviceLeaseExpiresAt || claimedAt || completedAt || cancelledAt)) ||
		(isClaimed && (!claimedDevice || claimedGeneration == null || !recoveryExpiresAt || !claimDeviceLeaseExpiresAt || !claimedAt || cancelledAt)) ||
		(status === 'claimed' && completedAt) ||
		(status === 'completed' && !completedAt) ||
		(isClosedWithoutClaim && (claimedDevice != null || claimedGeneration != null || recoveryExpiresAt || claimDeviceLeaseExpiresAt || claimedAt || completedAt || !cancelledAt)) ||
		(isClosedAfterClaim && (!claimedDevice || claimedGeneration == null || !recoveryExpiresAt || !claimDeviceLeaseExpiresAt || !claimedAt || completedAt || !cancelledAt)) ||
		(Boolean(claimedAt && recoveryExpiresAt) && Date.parse(recoveryExpiresAt!) <= Date.parse(claimedAt!)) ||
		(Boolean(claimedAt && claimDeviceLeaseExpiresAt) && Date.parse(claimDeviceLeaseExpiresAt!) <= Date.parse(claimedAt!)) ||
		(Boolean(claimDeviceLeaseExpiresAt && recoveryExpiresAt) && Date.parse(claimDeviceLeaseExpiresAt!) >= Date.parse(recoveryExpiresAt!)) ||
		(typeof claimedDevice === 'string' && !(
			claimedDevice === row.target_installation_id ||
			claimedDevice.startsWith(`${row.target_installation_id}.`)
		))
	) return null;
	return {
		id: row.id,
		callId: row.call_id,
		account: row.account,
		fromDevice: row.from_device,
		fromInstallationId: row.from_installation_id,
		targetInstallationId: row.target_installation_id,
		claimedDevice: typeof claimedDevice === 'string' ? claimedDevice : null,
		status: status as CallHandoffStatus,
		clientRequestId: row.client_request_id,
		sourceGeneration,
		claimedGeneration: typeof claimedGeneration === 'number' ? claimedGeneration : null,
		stateVersion,
		createdAt,
		updatedAt,
		expiresAt,
		recoveryExpiresAt,
		claimDeviceLeaseExpiresAt,
		claimedAt,
		completedAt,
		cancelledAt
	};
}

export function parseCallHandoffTarget(value: unknown): CallHandoffTarget | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const row = value as Record<string, unknown>;
	const installationId = row.installation_id;
	const platform = row.platform;
	const lastSeenAt = nullableDate(row.last_seen_at);
	const supportsVideo = row.supports_video;
	if (
		typeof installationId !== 'string' || !DEVICE_RE.test(installationId) ||
		typeof platform !== 'string' || platform.length > 32 ||
		!lastSeenAt || typeof supportsVideo !== 'boolean'
	) return null;
	return { installationId, platform, lastSeenAt, supportsVideo };
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

/** Reject stale poll/Realtime snapshots and make a terminal row absorbing. */
export function isCallSessionSnapshotMonotonic(previous: CallSession, next: CallSession): boolean {
	if (previous.id !== next.id) return true;
	if (isTerminalCallStatus(previous.status) && !isTerminalCallStatus(next.status)) return false;
	if (next.handoffGeneration < previous.handoffGeneration) return false;
	if (
		next.handoffGeneration === previous.handoffGeneration &&
		Date.parse(next.updatedAt) < Date.parse(previous.updatedAt)
	) return false;
	return true;
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
	expectedDevice?: string | null,
	expectedHandoffGeneration?: number
): value is CallSignalEnvelope {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const envelope = value as Partial<CallSignalEnvelope>;
	if (
		envelope.v !== 1 ||
		envelope.callId !== callId ||
		envelope.from !== expectedSender ||
		!isCallDeviceId(envelope.device) ||
		(Boolean(expectedDevice) && envelope.device !== expectedDevice) ||
		!(envelope.handoffGeneration == null || (
			typeof envelope.handoffGeneration === 'number' &&
			Number.isSafeInteger(envelope.handoffGeneration) &&
			envelope.handoffGeneration >= 0
		)) ||
		(expectedHandoffGeneration !== undefined &&
			!callHandoffGenerationMatches(envelope.handoffGeneration, expectedHandoffGeneration)) ||
		typeof envelope.seq !== 'number' ||
		!Number.isSafeInteger(envelope.seq) ||
		!envelope.signal ||
		typeof envelope.signal !== 'object'
	) return false;
	const signal = envelope.signal as Partial<CallSignal>;
	return signal.type === 'offer' || signal.type === 'answer' || signal.type === 'candidate' || signal.type === 'restart-request' || signal.type === 'hangup';
}

/** Generation zero accepts an omitted field during rolling deployment; later generations are exact. */
export function callHandoffGenerationMatches(value: unknown, expected: number): boolean {
	if (!Number.isSafeInteger(expected) || expected < 0) return false;
	if (value == null) return expected === 0;
	return typeof value === 'number' && Number.isSafeInteger(value) && value === expected;
}
