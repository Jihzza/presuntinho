import type { RealtimeChannel } from '@supabase/supabase-js';
import { getAuthSession } from '$lib/account/auth';
import { getSupabaseClient } from '$lib/multiplayer/client';
import { getPushInstallationId, sendPushNotify } from '$lib/push';
import {
	INITIAL_CALL_MACHINE,
	reduceCallMachine,
	type CallMachineEvent,
	type CallOutcome,
	type CallPhase
} from './call-machine';
import { callAudio } from './call-audio';
import { startCallReliably } from './call-start';
import {
	ConnectionQualityMonitor,
	type ConnectionQualitySample
} from './connection-quality';
import { fetchCallIceConfiguration, type CallIceSource } from './ice-config';
import {
	CallMediaController,
	enumerateCallMediaDevices,
	type CallMediaDevice
} from './media-controls';
import { CallWakeLockController, type CallWakeLockState } from './call-runtime';
import { IncomingCallLeaderCoordinator } from './incoming-call-leader';
import {
	callDeviceForParticipant,
	callTopic,
	deliveryConfirmsRinging,
	isCallSignalEnvelope,
	isRingingCallLive,
	isTerminalCallStatus,
	otherCallParticipant,
	parseCallHandoff,
	parseCallHandoffTarget,
	parseCallDelivery,
	parseCallSession,
	type CallDeliveryStage,
	type CallKind,
	type CallHandoff,
	type CallHandoffTarget,
	type CallPeerProfile,
	type CallSession,
	type CallSignal,
	type CallSignalEnvelope
} from './types';
import { acquireLocalMedia, CallPeer, stopMediaStream } from './webrtc';
const RESET_AFTER_END_MS = 3200;
const ACTIONABLE_RESET_AFTER_END_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const NEGOTIATION_TIMEOUT_MS = 25_000;
const SIGNAL_SEND_ATTEMPTS = 3;
const GLOBAL_POLL_MS = 4_000;
const PROGRESS_POLL_MS = 2_500;
const INCOMING_ACK_MAX_ATTEMPTS = 4;
const INCOMING_ACK_RETRY_DELAYS_MS = [350, 1_000, 2_500] as const;
const INSTALLATION_HEARTBEAT_MS = 30_000;
const HANDOFF_RECONCILE_MS = 4_000;
const CALL_DELIVERY_PROGRESS_COLUMNS = [
	'id', 'call_id', 'account', 'installation_id', 'channel', 'status',
	'provider_accepted_at', 'received_at', 'presented_at', 'ringing_at',
	'opened_at', 'created_at', 'updated_at'
].join(',');
const CALL_EVENT_PROGRESS_COLUMNS = 'call_id,event,details,created_at';
const DELIVERY_STAGE_RANK: Record<CallDeliveryStage, number> = {
	queued: 1,
	dispatching: 1,
	provider_accepted: 2,
	received: 3,
	presented: 4,
	ringing: 7,
	opened: 6,
	failed: 0,
	stale: 0,
	cancelled: 0,
	answered_elsewhere: 0
};

type PendingIncomingAck = {
	callId: string;
	installationId: string;
	stage: 'presented' | 'ringing';
	attempts: number;
	generation: number;
	inFlight: boolean;
	installationReconciled: boolean;
	upgradeToRinging: boolean;
};

type CallRpcName = 'respond_to_call' | 'heartbeat_call' | 'end_call' | 'expire_call';

export type CallMediaAction =
	| 'refresh-devices'
	| 'microphone'
	| 'camera'
	| 'speaker'
	| 'screen-share'
	| null;

export type CallFollowupAction = 'call_back' | 'cant_now';
export type CallFollowupStatus = 'idle' | 'sending' | 'sent' | 'failed';

let pageDeviceId = '';
function deviceId(install: string): string {
	if (pageDeviceId) return pageDeviceId;
	// Each tab needs its own Presence key and signal sequence. Sharing the
	// persistent installation id would make two open tabs overwrite each other.
	pageDeviceId = `${install}.${crypto.randomUUID()}`;
	return pageDeviceId;
}

function firstRow(value: unknown): unknown {
	return Array.isArray(value) ? value[0] : value;
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CallStore {
	phase = $state<CallPhase>(INITIAL_CALL_MACHINE.phase);
	session = $state<CallSession | null>(null);
	error = $state<string | null>(null);
	outcome = $state<CallOutcome | null>(null);
	peerProfile = $state<CallPeerProfile | null>(null);
	localStream = $state.raw<MediaStream | null>(null);
	remoteStream = $state.raw<MediaStream | null>(null);
	muted = $state(false);
	cameraOff = $state(false);
	facingMode = $state<'user' | 'environment'>('user');
	connectedAt = $state<number | null>(null);
	relayAvailable = $state<boolean | null>(null);
	iceSource = $state<CallIceSource | null>(null);
	accepting = $state(false);
	responseAction = $state<'accept' | 'decline' | null>(null);
	attentionMuted = $state(false);
	deliveryStage = $state<CallDeliveryStage | null>(null);
	deliveryIssue = $state<'no_push_devices' | null>(null);
	requestedKind = $state<CallKind | null>(null);
	realtimeHealth = $state<'connecting' | 'online' | 'degraded' | 'offline'>('connecting');
	readiness = $state<'unbound' | 'connecting' | 'ready' | 'offline'>('unbound');
	mediaDevices = $state.raw<CallMediaDevice[]>([]);
	selectedMicrophoneId = $state<string | null>(null);
	selectedCameraId = $state<string | null>(null);
	selectedSpeakerId = $state<string | null>(null);
	mediaAction = $state<CallMediaAction>(null);
	mediaError = $state<string | null>(null);
	screenSharing = $state(false);
	screenShareSupported = $state(false);
	connectionQuality = $state.raw<ConnectionQualitySample | null>(null);
	wakeLockState = $state<CallWakeLockState>('inactive');
	minimized = $state(false);
	followupAction = $state<CallFollowupAction | null>(null);
	followupStatus = $state<CallFollowupStatus>('idle');
	handoffTargets = $state.raw<CallHandoffTarget[]>([]);
	handoffPickerOpen = $state(false);
	handoffBusy = $state(false);
	handoffError = $state<string | null>(null);
	handoffOffer = $state<CallHandoff | null>(null);
	handoffOutgoing = $state<CallHandoff | null>(null);

	#userId: string | null = null;
	#deviceId = '';
	#installationId = '';
	#installationRegistered = false;
	#globalChannel: RealtimeChannel | null = null;
	#callChannel: RealtimeChannel | null = null;
	#progressChannel: RealtimeChannel | null = null;
	#peer: CallPeer | null = null;
	#peerSetupPromise: Promise<void> | null = null;
	#mediaController: CallMediaController | null = null;
	#qualityMonitor: ConnectionQualityMonitor | null = null;
	#wakeLock: CallWakeLockController | null = null;
	#deviceChangeListener: (() => void) | null = null;
	#mediaRefreshGeneration = 0;
	#globalGeneration = 0;
	#callGeneration = 0;
	#operationGeneration = 0;
	#channelSubscribed = false;
	#otherPresent = false;
	#signalSequence = 0;
	#lastRemoteSequence = new Map<string, number>();
	#remoteDevice: string | null = null;
	#pendingSignals: CallSignal[] = [];
	#offerRequested = false;
	#expiryTimer: ReturnType<typeof setTimeout> | null = null;
	#heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	#heartbeatCallId: string | null = null;
	#heartbeatInFlight = false;
	#heartbeatFailures = 0;
	#negotiationTimer: ReturnType<typeof setTimeout> | null = null;
	#resetTimer: ReturnType<typeof setTimeout> | null = null;
	#reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	#reconnectAttempts = 0;
	#globalReconnectTimer: ReturnType<typeof setTimeout> | null = null;
	#globalReconnectAttempts = 0;
	#incomingPollTimer: ReturnType<typeof setTimeout> | null = null;
	#progressPollTimer: ReturnType<typeof setTimeout> | null = null;
	#incomingAckTimer: ReturnType<typeof setTimeout> | null = null;
	#incomingAckPending: PendingIncomingAck | null = null;
	#incomingAckGeneration = 0;
	#incomingLeader: IncomingCallLeaderCoordinator | null = null;
	#pendingIncoming: CallSession | null = null;
	#incomingLeadershipTimer: ReturnType<typeof setTimeout> | null = null;
	#progressGeneration = 0;
	#lastReapAt = 0;
	#pushListener: ((event: MessageEvent<unknown>) => void) | null = null;
	#resumeListener: (() => void) | null = null;
	#audioUnlockListener: (() => void) | null = null;
	#lastStart: { conversationId: string; kind: CallKind; requestId: string } | null = null;
	#followupClientIds = new Map<string, string>();
	#installationHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
	#handoffPollTimer: ReturnType<typeof setTimeout> | null = null;
	#handoffExpiryTimer: ReturnType<typeof setTimeout> | null = null;
	#handoffOperationGeneration = 0;
	#activeHandoffId: string | null = null;
	#locallyTransferredCallId: string | null = null;

	get busy(): boolean {
		return this.phase !== 'idle' && this.phase !== 'ended' && this.phase !== 'error';
	}

	get direction(): 'incoming' | 'outgoing' | null {
		if (!this.session || !this.#userId) return null;
		return this.session.caller === this.#userId ? 'outgoing' : 'incoming';
	}

	get kind(): CallKind | null {
		return this.session?.kind ?? this.requestedKind;
	}

	get conversationId(): string | null {
		return this.session?.conversationId ?? this.#lastStart?.conversationId ?? null;
	}

	get canSendCallFollowup(): boolean {
		return Boolean(
			this.#userId &&
			this.session &&
			this.phase === 'ended' &&
			this.outcome === 'declined' &&
			this.direction === 'incoming'
		);
	}

	get canHandoff(): boolean {
		const call = this.session;
		return Boolean(
			call &&
			call.status === 'accepted' &&
			this.#isClaimedByThisDevice(call) &&
			(this.phase === 'active' || this.phase === 'reconnecting') &&
			!this.handoffOutgoing
		);
	}

	getStartDisabledReason(conversationId: string | null): string | null {
		if (!conversationId) return 'call_conversation_missing';
		if (this.busy) return 'call_in_progress';
		if (!this.#userId) return 'call_account_not_ready';
		if (typeof navigator !== 'undefined' && !navigator.onLine) return 'call_offline';
		if (this.readiness === 'connecting') return 'call_realtime_connecting';
		return null;
	}

	bindUser(userId: string | null): void {
		const next = userId?.trim() || null;
		if (next === this.#userId) return;
		this.#globalGeneration += 1;
		this.#removeGlobalChannel();
		this.#removeLifecycleListeners();
		this.#resetNow();
		this.#incomingLeader?.dispose();
		this.#incomingLeader = null;
		this.#userId = next;
		this.#installationRegistered = false;
		if (!next || typeof window === 'undefined') {
			this.readiness = 'unbound';
			return;
		}
		this.readiness = navigator.onLine ? 'connecting' : 'offline';
		this.realtimeHealth = navigator.onLine ? 'connecting' : 'offline';
		this.#installationId = getPushInstallationId() ?? crypto.randomUUID();
		this.#deviceId = deviceId(this.#installationId);
		this.#openGlobalChannel(next, this.#globalGeneration);
		this.#installLifecycleListeners();
		this.#startInstallationHeartbeat();
		this.#startHandoffPoll(this.#globalGeneration);
		void this.#registerInstallation();
	}

	async startCall(
		conversationId: string,
		kind: CallKind,
		requestId: string = crypto.randomUUID()
	): Promise<void> {
		// This must remain before the first await: browsers only unlock AudioContext
		// while handling the original user gesture.
		callAudio.primeFromGesture();
		if (this.busy) {
			this.error = 'call_in_progress';
			return;
		}
		if (this.#resetTimer) clearTimeout(this.#resetTimer);
		this.#resetTimer = null;
		this.requestedKind = kind;
		this.deliveryIssue = null;
		this.followupAction = null;
		this.followupStatus = 'idle';
		const operation = ++this.#operationGeneration;
		this.#transition({ type: 'PREPARE' });
		this.#lastStart = { conversationId, kind, requestId };
		if (!conversationId) {
			this.#fail('call_conversation_missing');
			return;
		}
		if (!this.#userId) {
			this.#fail('call_account_not_ready');
			return;
		}
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			this.#fail('call_offline');
			return;
		}
		let stream: MediaStream | null = null;
		try {
			stream = await acquireLocalMedia({ kind, facingMode: this.facingMode });
			if (operation !== this.#operationGeneration || this.phase !== 'preparing') {
				stopMediaStream(stream);
				return;
			}
			this.localStream = stream;
			this.#prepareLocalMediaState(kind, stream);
			this.#transition({ type: 'CREATE' });
			const call = await startCallReliably({
				conversationId,
				kind,
				device: this.#deviceId,
				requestId
			});
			if (!call || call.caller !== this.#userId) throw new Error('call_start_invalid');
			if (operation !== this.#operationGeneration || (this.phase as CallPhase) !== 'creating') {
				stopMediaStream(stream);
				if (this.localStream === stream) this.localStream = null;
				void this.#retryTerminalCallRpc('end_call', { p_call: call.id, p_device: this.#deviceId }).catch(() => undefined);
				return;
			}
			this.#transition({ type: 'NOTIFYING', call });
			if (isTerminalCallStatus(call.status)) {
				this.#finish(call);
				return;
			}
			if (call.status === 'accepted') {
				if (!this.#isClaimedByThisDevice(call)) {
					this.#finish(
						{ ...call, status: 'ended', endedAt: call.endedAt ?? new Date().toISOString() },
						'answered_elsewhere'
					);
					return;
				}
				this.deliveryStage = 'ringing';
				this.#transition({ type: 'ACCEPTED', call });
				this.#clearExpiry();
				this.#startHeartbeat(call);
				void this.#loadPeerProfile(call);
				void this.#watchCallProgress(call);
				this.#scheduleNegotiationTimeout(call);
				await this.#openCallChannel(call).catch(() => {
					if (operation === this.#operationGeneration && this.session?.id === call.id) {
						this.realtimeHealth = 'degraded';
						this.#scheduleReconnect(call, this.#callGeneration);
					}
				});
				return;
			}
			// `/api/call-start` returns only after Netlify accepted the durable
			// worker. This is queue truth, not yet provider/device delivery truth.
			this.deliveryStage = 'queued';
			this.#scheduleExpiry(call);
			this.#startHeartbeat(call);
			void this.#loadPeerProfile(call);
			void this.#watchCallProgress(call);
			const callChannel = this.#openCallChannel(call);
			this.#transition({ type: 'CONTACTING', call });
			await callChannel.catch(() => {
				if (operation === this.#operationGeneration && this.session?.id === call.id) {
					this.realtimeHealth = 'degraded';
					this.#scheduleReconnect(call, this.#callGeneration);
				}
			});
			if (
				operation === this.#operationGeneration &&
				this.session?.id === call.id &&
				this.session.status === 'ringing' &&
				this.#channelSubscribed
			) {
				void this.#pollCallProgress(call.id);
			}
		} catch (error) {
			if (operation !== this.#operationGeneration) {
				stopMediaStream(stream);
				return;
			}
			this.#fail(this.#errorCode(error, 'call_start_failed'));
		}
	}

	retryLastStart(): void {
		if (!this.#lastStart || this.busy) return;
		const { conversationId, kind, requestId } = this.#lastStart;
		void this.startCall(conversationId, kind, requestId);
	}

	async openHandoffPicker(): Promise<void> {
		const call = this.session;
		if (!call || !this.canHandoff || this.handoffBusy) return;
		this.handoffPickerOpen = true;
		this.handoffBusy = true;
		this.handoffError = null;
		try {
			const { data, error } = await getSupabaseClient().rpc('list_call_handoff_targets', {
				p_call: call.id,
				p_device: this.#deviceId
			});
			if (error) throw error;
			if (this.session?.id !== call.id || !this.#isClaimedByThisDevice(this.session)) return;
			this.handoffTargets = (Array.isArray(data) ? data : [])
				.map(parseCallHandoffTarget)
				.filter((target): target is CallHandoffTarget => Boolean(target));
		} catch (error) {
			this.handoffTargets = [];
			this.handoffError = this.#handoffErrorCode(error, 'handoff_unavailable');
		} finally {
			this.handoffBusy = false;
		}
	}

	closeHandoffPicker(): void {
		if (this.handoffBusy) return;
		this.handoffPickerOpen = false;
		this.handoffTargets = [];
		this.handoffError = null;
	}

	async requestHandoff(targetInstallationId: string): Promise<void> {
		const call = this.session;
		if (
			!call ||
			!this.canHandoff ||
			this.handoffBusy ||
			!this.handoffTargets.some((target) => target.installationId === targetInstallationId)
		) return;
		const requestId = crypto.randomUUID();
		const operation = ++this.#handoffOperationGeneration;
		this.handoffBusy = true;
		this.handoffError = null;
		try {
			const { data, error } = await getSupabaseClient().rpc('request_call_handoff', {
				p_call: call.id,
				p_device: this.#deviceId,
				p_target_installation_id: targetInstallationId,
				p_request_id: requestId
			});
			if (error) throw error;
			const handoff = parseCallHandoff(firstRow(data));
			if (!handoff || handoff.callId !== call.id || handoff.fromDevice !== this.#deviceId) {
				throw new Error('handoff_invalid_response');
			}
			if (operation !== this.#handoffOperationGeneration || this.session?.id !== call.id) return;
			this.handoffOutgoing = handoff;
			this.handoffPickerOpen = false;
			this.handoffTargets = [];
			this.#scheduleHandoffExpiry(handoff);
		} catch (error) {
			if (operation === this.#handoffOperationGeneration) {
				this.handoffError = this.#handoffErrorCode(error, 'handoff_request_failed');
			}
		} finally {
			if (operation === this.#handoffOperationGeneration) this.handoffBusy = false;
		}
	}

	async cancelOutgoingHandoff(): Promise<void> {
		const handoff = this.handoffOutgoing;
		if (!handoff || this.handoffBusy) return;
		const operation = ++this.#handoffOperationGeneration;
		this.handoffBusy = true;
		this.handoffError = null;
		try {
			const { data, error } = await getSupabaseClient().rpc('cancel_call_handoff', {
				p_handoff: handoff.id,
				p_device: this.#deviceId
			});
			if (error || data !== true) throw error ?? new Error('handoff_cancel_rejected');
			if (operation !== this.#handoffOperationGeneration) return;
			this.#clearHandoffExpiry();
			this.handoffOutgoing = null;
		} catch (error) {
			if (operation === this.#handoffOperationGeneration) {
				this.handoffError = this.#handoffErrorCode(error, 'handoff_cancel_failed');
			}
		} finally {
			if (operation === this.#handoffOperationGeneration) this.handoffBusy = false;
		}
	}

	async declineHandoffOffer(): Promise<void> {
		const handoff = this.handoffOffer;
		if (!handoff || this.handoffBusy) return;
		const operation = ++this.#handoffOperationGeneration;
		this.handoffBusy = true;
		this.handoffError = null;
		try {
			const { data, error } = await getSupabaseClient().rpc('cancel_call_handoff', {
				p_handoff: handoff.id,
				p_device: this.#deviceId
			});
			if (error || data !== true) throw error ?? new Error('handoff_decline_rejected');
			if (operation === this.#handoffOperationGeneration) this.handoffOffer = null;
		} catch (error) {
			if (operation === this.#handoffOperationGeneration) {
				this.handoffError = this.#handoffErrorCode(error, 'handoff_decline_failed');
			}
		} finally {
			if (operation === this.#handoffOperationGeneration) this.handoffBusy = false;
		}
	}

	async acceptHandoffOffer(): Promise<void> {
		// Media APIs and AudioContext require the original user gesture. Ownership
		// moves only after media succeeds, so a permission denial cannot strand the
		// live call on a device that never became usable.
		callAudio.primeFromGesture();
		const handoff = this.handoffOffer;
		if (!handoff || this.handoffBusy || this.phase !== 'idle') return;
		const userId = this.#userId;
		const device = this.#deviceId;
		const globalGeneration = this.#globalGeneration;
		if (!userId || !device) return;
		const operation = ++this.#handoffOperationGeneration;
		this.handoffBusy = true;
		this.handoffError = null;
		let stream: MediaStream | null = null;
		try {
			const { data: rawCall, error: callError } = await getSupabaseClient()
				.from('call_sessions')
				.select('*')
				.eq('id', handoff.callId)
				.maybeSingle();
			if (callError) throw callError;
			const pendingCall = parseCallSession(rawCall);
			if (
				!pendingCall ||
				pendingCall.status !== 'accepted' ||
				callDeviceForParticipant(pendingCall, userId) !== handoff.fromDevice
			) throw new Error('handoff_call_changed');
			stream = await acquireLocalMedia({ kind: pendingCall.kind, facingMode: this.facingMode });
			if (
				operation !== this.#handoffOperationGeneration ||
				this.handoffOffer?.id !== handoff.id ||
				this.phase !== 'idle'
			) {
				stopMediaStream(stream);
				return;
			}
			const { data, error } = await getSupabaseClient().rpc('claim_call_handoff', {
				p_handoff: handoff.id,
				p_device: device
			});
			let call: CallSession | null = null;
			if (error) {
				// The claim RPC is an atomic ownership boundary, but its HTTP response can
				// still be lost after commit. Re-read the durable call before reporting a
				// failure: if this exact device owns the participant lease, continuing is
				// the only truthful and safe outcome.
				const { data: recoveredRow, error: recoveryError } = await getSupabaseClient()
					.from('call_sessions')
					.select('*')
					.eq('id', handoff.callId)
					.maybeSingle();
				if (!recoveryError) call = parseCallSession(recoveredRow);
				if (!call || call.status !== 'accepted' || callDeviceForParticipant(call, userId) !== device) {
					throw error;
				}
			} else {
				const result = data && typeof data === 'object' && !Array.isArray(data)
					? data as Record<string, unknown>
					: null;
				if (!result || result.ok !== true) {
					throw new Error(`handoff_${typeof result?.reason === 'string' ? result.reason : 'claim_rejected'}`);
				}
				call = parseCallSession(result.call);
			}
			if (
				!call ||
				call.status !== 'accepted' ||
				callDeviceForParticipant(call, userId) !== device
			) throw new Error('handoff_claim_invalid');
			// `call_handoffs=claimed` can arrive before this RPC response and clear the
			// visual offer. Once the transaction commits, its returned call row is the
			// authority; presentation state must not strand the transferred lease.
			if (
				operation !== this.#handoffOperationGeneration ||
				this.#userId !== userId ||
				this.#deviceId !== device ||
				this.#globalGeneration !== globalGeneration ||
				this.phase !== 'idle'
			) {
				stopMediaStream(stream);
				return;
			}

			this.requestedKind = call.kind;
			this.localStream = stream;
			this.#prepareLocalMediaState(call.kind, stream);
			this.handoffOffer = null;
			this.handoffBusy = false;
			this.#activeHandoffId = handoff.id;
			this.#transition({ type: 'HANDOFF_ACCEPTED', call });
			if (this.session?.id !== call.id || (this.phase as CallPhase) !== 'connecting') {
				stopMediaStream(stream);
				this.localStream = null;
				throw new Error('handoff_transition_failed');
			}
			this.#startHeartbeat(call);
			void this.#loadPeerProfile(call);
			this.#scheduleNegotiationTimeout(call);
			await this.#openCallChannel(call).catch(() => {
				if (this.session?.id === call.id) {
					this.realtimeHealth = 'degraded';
					this.#scheduleReconnect(call, this.#callGeneration);
				}
			});
		} catch (error) {
			if (stream && this.localStream !== stream) stopMediaStream(stream);
			if (operation === this.#handoffOperationGeneration) {
				this.handoffError = this.#handoffErrorCode(error, 'handoff_claim_failed');
				this.handoffBusy = false;
			}
		}
	}

	minimize(): void {
		if (this.phase === 'active' || this.phase === 'reconnecting') this.minimized = true;
	}

	restore(): void {
		this.minimized = false;
	}

	async sendCallFollowup(action: CallFollowupAction, text: string): Promise<void> {
		const call = this.session;
		const senderId = this.#userId;
		const conversationId = this.conversationId;
		const body = text.trim();
		if (
			!call ||
			!senderId ||
			!conversationId ||
			!this.canSendCallFollowup ||
			!body ||
			body.length > 160 ||
			this.followupStatus === 'sending' ||
			this.followupStatus === 'sent'
		) return;
		const operationCallId = call.id;
		const requestKey = `${operationCallId}:${action}`;
		const clientId = this.#followupClientIds.get(requestKey) ?? crypto.randomUUID();
		this.#followupClientIds.set(requestKey, clientId);
		this.followupAction = action;
		this.followupStatus = 'sending';
		let committedId: string | null = null;
		try {
			const { data, error } = await getSupabaseClient()
				.from('chat_messages')
				.insert({
					conversation_id: conversationId,
					sender_id: senderId,
					client_id: clientId,
					kind: 'text',
					body,
					reply_to_id: null
				})
				.select('id')
				.single();
			if (error) throw error;
			committedId = data && typeof data === 'object' && 'id' in data ? String(data.id) : clientId;
		} catch {
			try {
				const { data, error } = await getSupabaseClient()
					.from('chat_messages')
					.select('id')
					.eq('conversation_id', conversationId)
					.eq('sender_id', senderId)
					.eq('client_id', clientId)
					.maybeSingle();
				if (error || !data) throw error ?? new Error('call_followup_not_committed');
				committedId = typeof data === 'object' && 'id' in data ? String(data.id) : clientId;
			} catch {
				if (this.session?.id === operationCallId) this.followupStatus = 'failed';
				return;
			}
		}
		if (this.session?.id !== operationCallId || !committedId) return;
		this.followupStatus = 'sent';
		const recipient = otherCallParticipant(call, senderId);
		if (!recipient) return;
		void sendPushNotify('message', {
			to: recipient,
			title: '💬 Presuntinho',
			body: body.slice(0, 120),
			url: `/mensagens/?conversation=${encodeURIComponent(conversationId)}`,
			eventId: committedId
		}).catch(() => undefined);
	}

	async accept(): Promise<void> {
		const call = this.session;
		if (
			!call ||
			!this.#userId ||
			call.callee !== this.#userId ||
			this.phase !== 'incoming' ||
			this.accepting ||
			!this.#incomingLeader?.isLeader(call.id)
		) return;
		callAudio.primeFromGesture();
		callAudio.stop();
		const operation = ++this.#operationGeneration;
		this.accepting = true;
		this.responseAction = 'accept';
		this.error = null;
		let serverAccepted = false;
		let stream: MediaStream | null = null;
		try {
			stream = await acquireLocalMedia({ kind: call.kind, facingMode: this.facingMode });
			if (operation !== this.#operationGeneration || this.session?.id !== call.id || this.phase !== 'incoming') {
				stopMediaStream(stream);
				return;
			}
			this.localStream = stream;
			this.#prepareLocalMediaState(call.kind, stream);
			const accepted = await this.#callRpc('respond_to_call', {
				p_call: call.id,
				p_accept: true,
				p_device: this.#deviceId
			});
			if (accepted.status !== 'ringing') void this.#wakeCallLifecycle(accepted.id);
			if (operation !== this.#operationGeneration || this.session?.id !== call.id) {
				stopMediaStream(stream);
				if (this.localStream === stream) this.localStream = null;
				if (accepted.status === 'accepted' && accepted.calleeDevice === this.#deviceId) {
					void this.#retryTerminalCallRpc('end_call', { p_call: accepted.id, p_device: this.#deviceId }).catch(() => undefined);
				}
				return;
			}
			if (accepted.status !== 'accepted') {
				stopMediaStream(this.localStream);
				this.localStream = null;
				if (isTerminalCallStatus(accepted.status)) this.#finish(accepted);
				return;
			}
			if (accepted.calleeDevice !== this.#deviceId) {
				stopMediaStream(this.localStream);
				this.localStream = null;
				this.#finish({ ...accepted, status: 'ended', endedAt: new Date().toISOString() });
				return;
			}
			serverAccepted = true;
			this.#transition({ type: 'ACCEPTED', call: accepted });
			this.#releaseIncomingLeadership(accepted.id);
			this.#clearExpiry();
			this.#closeCallNotification(accepted.id);
			this.#startHeartbeat(accepted);
			this.#scheduleNegotiationTimeout(accepted);
			await this.#openCallChannel(accepted).catch(() => {
				if (operation === this.#operationGeneration && this.session?.id === accepted.id) {
					this.realtimeHealth = 'degraded';
					this.#scheduleReconnect(accepted, this.#callGeneration);
				}
			});
		} catch (error) {
			stopMediaStream(stream);
			if (this.localStream === stream) this.localStream = null;
			if (operation !== this.#operationGeneration) return;
			if (this.#errorCode(error, '').includes('claimed by another device')) {
				this.#finish({ ...call, status: 'ended', endedAt: new Date().toISOString() }, 'answered_elsewhere');
				return;
			}
			if (serverAccepted) {
				this.#fail(this.#errorCode(error, 'call_accept_failed'));
			} else {
				this.error = this.#errorCode(error, 'call_accept_failed');
				this.phase = 'incoming';
				if (!this.attentionMuted) callAudio.startIncoming();
			}
		} finally {
			this.accepting = false;
			this.responseAction = null;
		}
	}

	async decline(): Promise<void> {
		const call = this.session;
		if (!call || call.status !== 'ringing' || this.accepting || !this.#incomingLeader?.isLeader(call.id)) return;
		callAudio.stop();
		const operation = ++this.#operationGeneration;
		this.accepting = true;
		this.responseAction = 'decline';
		try {
			const declined = await this.#retryCallRpc('respond_to_call', {
				p_call: call.id,
				p_accept: false,
				p_device: this.#deviceId
			});
			if (declined.status !== 'ringing') void this.#wakeCallLifecycle(declined.id);
			if (operation !== this.#operationGeneration || this.session?.id !== call.id) return;
			if (declined.status === 'accepted' && declined.calleeDevice !== this.#deviceId) {
				this.#finish(
					{ ...declined, status: 'ended', endedAt: new Date().toISOString() },
					'answered_elsewhere'
				);
				return;
			}
			if (isTerminalCallStatus(declined.status) || declined.status === 'accepted') {
				this.#finish(declined);
				return;
			}
		} catch (error) {
			if (operation === this.#operationGeneration && this.session?.id === call.id) {
				this.error = this.#errorCode(error, 'call_decline_failed');
				if (!this.attentionMuted) callAudio.startIncoming();
			}
		} finally {
			if (this.session?.id === call.id) {
				this.accepting = false;
				this.responseAction = null;
			}
		}
	}

	async end(): Promise<void> {
		this.#operationGeneration += 1;
		callAudio.stop();
		const call = this.session;
		if (!call) {
			this.#resetNow();
			return;
		}
		this.phase = 'ended';
		await Promise.race([this.#sendSignal({ type: 'hangup' }).catch(() => undefined), wait(400)]);
		void this.#retryTerminalCallRpc('end_call', { p_call: call.id, p_device: this.#deviceId }).catch(() => undefined);
		this.#finish(
			{ ...call, status: call.status === 'ringing' ? 'cancelled' : 'ended', endedAt: new Date().toISOString() },
			call.status === 'ringing' ? 'cancelled' : 'completed'
		);
	}

	dismiss(): void {
		if (this.phase === 'error' || this.phase === 'ended') this.#resetNow();
	}

	toggleMute(): void {
		this.muted = !this.muted;
		if (this.#peer) this.#peer.setMuted(this.muted);
		else for (const track of this.localStream?.getAudioTracks() ?? []) track.enabled = !this.muted;
	}

	toggleAttentionMuted(): void {
		this.attentionMuted = !this.attentionMuted;
		callAudio.setMuted(this.attentionMuted);
		if (!this.attentionMuted) {
			if (this.phase === 'incoming' && this.session && this.#incomingLeader?.isLeader(this.session.id)) {
				callAudio.startIncoming();
			}
			else if (this.direction === 'outgoing' && ['notifying', 'contacting', 'ringing'].includes(this.phase)) {
				callAudio.startRingback();
			}
			if (
				this.phase === 'incoming' &&
				this.session &&
				this.#incomingLeader?.isLeader(this.session.id)
			) void this.#ackIncomingPresentation(this.session);
		}
	}

	toggleCamera(): void {
		if (this.kind !== 'video') return;
		this.cameraOff = !this.cameraOff;
		if (this.#peer) this.#peer.setCameraOff(this.cameraOff);
		else for (const track of this.localStream?.getVideoTracks() ?? []) track.enabled = !this.cameraOff;
	}

	async flipCamera(): Promise<void> {
		if (this.kind !== 'video' || !this.#peer || this.screenSharing) return;
		const next = this.facingMode === 'user' ? 'environment' : 'user';
		try {
			await this.#peer.flipCamera(next);
			this.facingMode = next;
			this.cameraOff = false;
			this.#syncSelectedInputIds();
			void this.#enumerateMediaDevices(false);
		} catch (error) {
			this.error = this.#errorCode(error, 'camera_flip_failed');
		}
	}

	async refreshMediaDevices(): Promise<void> {
		await this.#runMediaAction('refresh-devices', async () => {
			await this.#enumerateMediaDevices(true);
		});
	}

	async selectMicrophone(deviceId: string): Promise<void> {
		await this.#runMediaAction('microphone', async () => {
			const controller = this.#requireMediaController();
			this.#requireSelectableDevice('audioinput', deviceId);
			const track = await controller.switchMicrophone(deviceId);
			this.selectedMicrophoneId = this.#trackDeviceId(track) ?? deviceId;
		});
	}

	async selectCamera(deviceId: string): Promise<void> {
		if (this.kind !== 'video') return;
		await this.#runMediaAction('camera', async () => {
			const controller = this.#requireMediaController();
			this.#requireSelectableDevice('videoinput', deviceId);
			const track = await controller.switchCamera(deviceId);
			this.selectedCameraId = this.#trackDeviceId(track) ?? deviceId;
		});
	}

	async selectSpeaker(element: HTMLMediaElement, deviceId: string): Promise<void> {
		await this.#runMediaAction('speaker', async () => {
			const controller = this.#requireMediaController();
			this.#requireSelectableDevice('audiooutput', deviceId);
			const result = await controller.selectAudioOutput(element, deviceId);
			if (result.status === 'unsupported') throw new Error('speaker_selection_unsupported');
			if (result.status === 'failed') throw new Error(`speaker_selection_${result.reason}`);
			this.selectedSpeakerId = result.deviceId;
		});
	}

	async toggleScreenShare(): Promise<void> {
		if (this.kind !== 'video' || !this.screenShareSupported) return;
		await this.#runMediaAction('screen-share', async () => {
			const controller = this.#requireMediaController();
			if (controller.isScreenSharing) await controller.stopScreenShare();
			else await controller.startScreenShare();
		});
	}

	#prepareLocalMediaState(kind: CallKind, stream: MediaStream): void {
		this.mediaError = null;
		this.screenSharing = false;
		this.screenShareSupported = kind === 'video' &&
			typeof navigator !== 'undefined' &&
			typeof navigator.mediaDevices?.getDisplayMedia === 'function';
		this.#syncSelectedInputIds(stream);
		void this.#enumerateMediaDevices(false);
	}

	#syncSelectedInputIds(stream = this.localStream): void {
		this.selectedMicrophoneId = this.#trackDeviceId(stream?.getAudioTracks()[0]) ?? null;
		this.selectedCameraId = this.#trackDeviceId(stream?.getVideoTracks()[0]) ?? null;
	}

	#trackDeviceId(track: MediaStreamTrack | null | undefined): string | null {
		const value = track?.getSettings?.().deviceId;
		return typeof value === 'string' && value ? value : null;
	}

	async #enumerateMediaDevices(surfaceError: boolean): Promise<void> {
		const generation = ++this.#mediaRefreshGeneration;
		if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
			if (surfaceError) throw new Error('media_devices_unsupported');
			return;
		}
		try {
			const devices = await enumerateCallMediaDevices();
			if (generation !== this.#mediaRefreshGeneration || !this.localStream) return;
			this.mediaDevices = devices;
			this.#syncSelectedInputIds();
			if (
				this.selectedSpeakerId &&
				!devices.some((device) =>
					device.kind === 'audiooutput' &&
					device.deviceId === this.selectedSpeakerId &&
					device.selectable
				)
			) this.selectedSpeakerId = null;
		} catch (error) {
			if (generation !== this.#mediaRefreshGeneration) return;
			if (surfaceError) throw error;
		}
	}

	#requireMediaController(): CallMediaController {
		if (!this.#mediaController || !['active', 'reconnecting'].includes(this.phase)) {
			throw new Error('media_controller_not_ready');
		}
		return this.#mediaController;
	}

	#requireSelectableDevice(kind: CallMediaDevice['kind'], deviceId: string): void {
		if (!this.mediaDevices.some((device) =>
			device.kind === kind && device.deviceId === deviceId && device.selectable
		)) throw new Error('media_device_unavailable');
	}

	async #runMediaAction(action: Exclude<CallMediaAction, null>, work: () => Promise<void>): Promise<void> {
		if (this.mediaAction) return;
		this.mediaAction = action;
		this.mediaError = null;
		try {
			await work();
		} catch (error) {
			this.mediaError = this.#mediaErrorCode(error);
		} finally {
			if (this.mediaAction === action) this.mediaAction = null;
		}
	}

	#mediaErrorCode(error: unknown): string {
		const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
		const message = error instanceof Error ? error.message : String(error ?? '');
		if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission_denied';
		if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'device_unavailable';
		if (name === 'AbortError') return 'action_cancelled';
		if (message.includes('screen_share_unsupported')) return 'screen_share_unsupported';
		if (message.includes('speaker_selection_unsupported')) return 'speaker_unsupported';
		if (message.includes('speaker_selection_not-allowed')) return 'permission_denied';
		if (message.includes('media_device_unavailable')) return 'device_unavailable';
		if (message.includes('media_controller_not_ready') || message.includes('media_controller_disposed')) {
			return 'not_ready';
		}
		return 'generic';
	}

	#transition(event: CallMachineEvent): void {
		const previousPhase = this.phase;
		const next = reduceCallMachine(
			{ phase: this.phase, call: this.session, error: this.error, outcome: this.outcome },
			event
		);
		this.phase = next.phase;
		this.session = next.call;
		this.error = next.error;
		this.outcome = next.outcome;
		if (next.phase !== 'active' && next.phase !== 'reconnecting') this.minimized = false;
		if (next.phase === previousPhase) return;
		if (next.phase === 'incoming') {
			if (!this.attentionMuted) callAudio.startIncoming();
		} else if (
			this.direction === 'outgoing' &&
			(next.phase === 'notifying' || next.phase === 'contacting' || next.phase === 'ringing')
		) {
			if (!this.attentionMuted) callAudio.startRingback();
		} else {
			callAudio.stop();
		}
	}

	#openGlobalChannel(userId: string, generation: number): void {
		if (generation !== this.#globalGeneration || userId !== this.#userId) return;
		const sb = getSupabaseClient();
		const channel = sb
			.channel(`call_sessions:${userId}:${generation}:${Date.now()}`)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'call_sessions' }, (payload) => {
				if (generation !== this.#globalGeneration || this.#globalChannel !== channel) return;
				this.#applyDatabaseRow(payload.new);
			})
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'call_handoffs', filter: `account=eq.${userId}` },
				(payload) => {
					if (generation !== this.#globalGeneration || this.#globalChannel !== channel) return;
					this.#applyHandoffRow(payload.new);
				}
			)
			.subscribe((status) => {
				if (generation !== this.#globalGeneration || this.#globalChannel !== channel) return;
				if (status === 'SUBSCRIBED') {
					this.#globalReconnectAttempts = 0;
					this.realtimeHealth = 'online';
					this.readiness = 'ready';
					this.#stopIncomingPoll();
					void this.#reconcileGlobalCalls(generation);
					void this.#reconcileHandoffs(generation);
					void this.#heartbeatInstallation();
					if (this.phase === 'incoming') this.#retryPendingIncomingAckNow();
				} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
					this.realtimeHealth = navigator.onLine ? 'degraded' : 'offline';
					this.readiness = navigator.onLine ? 'connecting' : 'offline';
					this.#startIncomingPoll(generation);
					this.#scheduleGlobalReconnect(userId, generation, channel);
				}
			});
		this.#globalChannel = channel;
		this.realtimeHealth = navigator.onLine ? 'connecting' : 'offline';
		this.readiness = navigator.onLine ? 'connecting' : 'offline';
		this.#startIncomingPoll(generation);
		void this.#reconcileGlobalCalls(generation);
		void this.#reconcileHandoffs(generation);
	}

	#scheduleGlobalReconnect(userId: string, generation: number, channel: RealtimeChannel): void {
		if (
			this.#globalReconnectTimer ||
			generation !== this.#globalGeneration ||
			this.#globalChannel !== channel ||
			userId !== this.#userId
		) return;
		this.#globalChannel = null;
		void getSupabaseClient().removeChannel(channel);
		const delay = Math.min(30_000, 700 * 2 ** Math.min(this.#globalReconnectAttempts++, 6));
		this.#globalReconnectTimer = setTimeout(() => {
			this.#globalReconnectTimer = null;
			if (generation !== this.#globalGeneration || userId !== this.#userId) return;
			if (typeof navigator !== 'undefined' && !navigator.onLine) {
				this.#startIncomingPoll(generation);
				return;
			}
			this.#openGlobalChannel(userId, generation);
		}, delay);
	}

	#startIncomingPoll(generation: number): void {
		if (this.#incomingPollTimer || generation !== this.#globalGeneration) return;
		const poll = () => {
			this.#incomingPollTimer = null;
			if (generation !== this.#globalGeneration || !this.#userId) return;
			void this.#reconcileGlobalCalls(generation);
			this.#incomingPollTimer = setTimeout(poll, GLOBAL_POLL_MS);
		};
		this.#incomingPollTimer = setTimeout(poll, 350);
	}

	#stopIncomingPoll(): void {
		if (this.#incomingPollTimer) clearTimeout(this.#incomingPollTimer);
		this.#incomingPollTimer = null;
	}

	async #reconcileGlobalCalls(generation: number): Promise<void> {
		if (generation !== this.#globalGeneration || !this.#userId) return;
		const active = this.session;
		if (!active || !this.busy) {
			await this.#loadIncoming(generation);
			return;
		}
		try {
			const { data, error } = await getSupabaseClient()
				.from('call_sessions')
				.select('*')
				.eq('id', active.id)
				.maybeSingle();
			if (error) throw error;
			if (generation !== this.#globalGeneration || this.session?.id !== active.id) return;
			if (data) this.#applyDatabaseRow(data);
		} catch {
			if (generation === this.#globalGeneration) {
				this.realtimeHealth = typeof navigator !== 'undefined' && navigator.onLine ? 'degraded' : 'offline';
			}
		}
	}

	async #reconcileHandoffs(generation: number): Promise<void> {
		const userId = this.#userId;
		const installationId = this.#installationId;
		if (!userId || !installationId || generation !== this.#globalGeneration) return;
		try {
			const { data: incoming, error: incomingError } = await getSupabaseClient()
				.from('call_handoffs')
				.select('*')
				.eq('account', userId)
				.eq('target_installation_id', installationId)
				.eq('status', 'requested')
				.gt('expires_at', new Date().toISOString())
				.order('created_at', { ascending: false })
				.limit(1);
			if (incomingError) throw incomingError;
			if (generation !== this.#globalGeneration || userId !== this.#userId) return;
			const offer = parseCallHandoff(incoming?.[0]);
			if (offer) this.#applyHandoffRow(incoming?.[0]);
			else if (this.handoffOffer?.targetInstallationId === installationId) this.handoffOffer = null;

			const call = this.session;
			if (call?.status === 'accepted' && this.#isClaimedByThisDevice(call)) {
				const { data: outgoing, error: outgoingError } = await getSupabaseClient()
					.from('call_handoffs')
					.select('*')
					.eq('account', userId)
					.eq('call_id', call.id)
					.in('status', ['requested', 'claimed'])
					.order('created_at', { ascending: false })
					.limit(1);
				if (outgoingError) throw outgoingError;
				if (generation !== this.#globalGeneration || this.session?.id !== call.id) return;
				if (outgoing?.[0]) this.#applyHandoffRow(outgoing[0]);
			}
		} catch {
			/* Backend-first rollout: Realtime/visibility will retry after migration. */
		}
	}

	#applyHandoffRow(value: unknown): void {
		const handoff = parseCallHandoff(value);
		if (!handoff || !this.#userId || handoff.account !== this.#userId) return;
		const pending = handoff.status === 'requested' && Date.parse(handoff.expiresAt) > Date.now();

		if (handoff.targetInstallationId === this.#installationId) {
			if (pending && handoff.fromDevice !== this.#deviceId && this.phase === 'idle') {
				this.handoffOffer = handoff;
				this.handoffError = null;
			} else if (this.handoffOffer?.id === handoff.id && !pending) {
				this.handoffOffer = null;
			}
		}

		if (this.handoffOutgoing?.id === handoff.id || handoff.fromDevice === this.#deviceId) {
			if (pending) {
				this.handoffOutgoing = handoff;
				this.#scheduleHandoffExpiry(handoff);
				return;
			}
			this.#clearHandoffExpiry();
			if (handoff.status === 'claimed' || handoff.status === 'completed') {
				const call = this.session;
				if (call?.id === handoff.callId && call.status === 'accepted') this.#finishTransferred(call);
				return;
			}
			this.handoffOutgoing = null;
			if (handoff.status === 'declined') this.handoffError = 'handoff_declined';
			else if (handoff.status === 'expired') this.handoffError = 'handoff_expired';
		}
	}

	async #loadIncoming(generation: number): Promise<void> {
		const userId = this.#userId;
		if (!userId || generation !== this.#globalGeneration || this.busy) return;
		try {
			if (Date.now() - this.#lastReapAt > 30_000) {
				this.#lastReapAt = Date.now();
				const { error: reapError } = await getSupabaseClient().rpc('reap_stale_calls');
				if (reapError) throw reapError;
			}
			const { data, error } = await getSupabaseClient()
				.from('call_sessions')
				.select('*')
				.eq('callee', userId)
				.eq('status', 'ringing')
				.gt('expires_at', new Date().toISOString())
				.order('created_at', { ascending: false })
				.limit(1);
			if (error) throw error;
			if (generation !== this.#globalGeneration || this.busy) return;
			const call = parseCallSession(data?.[0]);
			if (call) this.#presentIncoming(call);
		} catch {
			if (generation === this.#globalGeneration) {
				this.realtimeHealth = navigator.onLine ? 'degraded' : 'offline';
			}
			/* offline: Realtime/visibility retry will reconcile */
		}
	}

	#applyDatabaseRow(value: unknown): void {
		const call = parseCallSession(value);
		if (!call || !this.#userId || (call.caller !== this.#userId && call.callee !== this.#userId)) return;
		if (this.#pendingIncoming?.id === call.id && this.session?.id !== call.id) {
			if (call.callee === this.#userId && call.status === 'ringing') {
				this.#presentIncoming(call);
			} else {
				this.#closeCallNotification(call.id);
				this.#releaseIncomingLeadership(call.id);
			}
			return;
		}
		if (this.session?.id === call.id) {
			if (
				this.#locallyTransferredCallId === call.id &&
				this.phase === 'ended' &&
				this.outcome === 'transferred'
			) return;
			const previous = this.session;
			if (call.status === 'accepted') {
				this.#closeCallNotification(call.id);
				if (!this.#isClaimedByThisDevice(call)) {
					const movedActiveCall = previous.status === 'accepted' &&
						callDeviceForParticipant(previous, this.#userId) === this.#deviceId &&
						['connecting', 'active', 'reconnecting'].includes(this.phase);
					if (movedActiveCall) this.#finishTransferred(call);
					else {
						// Another tab/phone of this account answered the incoming call first.
						this.#finish(
							{ ...call, status: 'ended', endedAt: new Date().toISOString() },
							'answered_elsewhere'
						);
					}
					return;
				}
				const other = otherCallParticipant(call, this.#userId);
				const remoteDeviceChanged = Boolean(
					other &&
					previous.status === 'accepted' &&
					callDeviceForParticipant(previous, other) &&
					callDeviceForParticipant(call, other) &&
					callDeviceForParticipant(previous, other) !== callDeviceForParticipant(call, other)
				);
				this.session = call;
				if (
					this.phase === 'notifying' ||
					this.phase === 'contacting' ||
					this.phase === 'ringing' ||
					this.phase === 'incoming'
				) this.#transition({ type: 'ACCEPTED', call });
				this.#releaseIncomingLeadership(call.id);
				this.#removeProgressChannel();
				this.#clearExpiry();
				this.#startHeartbeat(call);
				if (this.phase !== 'active') this.#scheduleNegotiationTimeout(call);
				if (remoteDeviceChanged) this.#restartForRemoteHandoff(call);
				else if (this.#callChannel) void this.#ensureTransport(call);
			} else if (isTerminalCallStatus(call.status) && this.phase !== 'error') {
				this.#finish(call, this.#outcomeForCall(call));
			} else {
				this.session = call;
				if (call.status === 'ringing' && this.phase === 'incoming') {
					this.#retryPendingIncomingAckNow();
				}
			}
			return;
		}
		if (call.callee === this.#userId && call.status === 'ringing' && !this.busy) this.#presentIncoming(call);
	}

	#presentIncoming(call: CallSession): void {
		if (!isRingingCallLive(call)) {
			this.#releaseIncomingLeadership(call.id);
			void this.#retryTerminalCallRpc('expire_call', { p_call: call.id, p_device: this.#deviceId }).catch(() => undefined);
			return;
		}
		if (!this.#userId || !this.#installationId || call.callee !== this.#userId) return;
		this.#pendingIncoming = call;
		// A hidden tab must not acquire the installation-wide Web Lock before the
		// tab the user is actually looking at. Background delivery is owned by the
		// OS notification; visibility reconciliation claims the call on foreground.
		if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
		this.#incomingLeader ??= new IncomingCallLeaderCoordinator();
		const generation = this.#globalGeneration;
		this.#incomingLeader.claim({
			callId: call.id,
			installationId: this.#installationId,
			onLeadership: (takeover) => {
				void this.#activateIncomingLeadership(call.id, takeover, generation);
			},
			onLost: () => this.#yieldIncomingLeadership(call.id)
		});
	}

	async #activateIncomingLeadership(callId: string, takeover: boolean, generation: number): Promise<void> {
		let call = this.#pendingIncoming;
		if (
			generation !== this.#globalGeneration ||
			call?.id !== callId ||
			!this.#incomingLeader?.isLeader(callId)
		) return;
		if (takeover) {
			try {
				const { data, error } = await getSupabaseClient()
					.from('call_sessions')
					.select('*')
					.eq('id', callId)
					.maybeSingle();
				if (error) throw error;
				const refreshed = parseCallSession(data);
				if (
					!refreshed ||
					refreshed.callee !== this.#userId ||
					refreshed.status !== 'ringing' ||
					!isRingingCallLive(refreshed)
				) {
					this.#closeCallNotification(callId);
					this.#releaseIncomingLeadership(callId);
					return;
				}
				this.#pendingIncoming = refreshed;
				call = refreshed;
			} catch {
				this.#scheduleIncomingLeadershipRetry(callId, generation);
				return;
			}
		}
		if (
			generation !== this.#globalGeneration ||
			this.#pendingIncoming?.id !== callId ||
			!this.#incomingLeader?.isLeader(callId) ||
			!this.#userId ||
			call.callee !== this.#userId ||
			call.status !== 'ringing' ||
			!isRingingCallLive(call)
		) return;
		if (this.busy && !(this.phase === 'incoming' && this.session?.id === callId)) {
			this.#releaseIncomingLeadership(callId);
			return;
		}
		if (this.#resetTimer) clearTimeout(this.#resetTimer);
		this.#resetTimer = null;
		this.followupAction = null;
		this.followupStatus = 'idle';
		this.#transition({ type: 'INCOMING', call });
		if (this.phase !== 'incoming' || this.session?.id !== callId) {
			this.#releaseIncomingLeadership(callId);
			return;
		}
		this.#scheduleExpiry(call);
		void this.#loadPeerProfile(call);
		void this.#ackIncomingPresentation(call);
	}

	#scheduleIncomingLeadershipRetry(callId: string, generation: number): void {
		if (this.#incomingLeadershipTimer) clearTimeout(this.#incomingLeadershipTimer);
		this.#incomingLeadershipTimer = setTimeout(() => {
			this.#incomingLeadershipTimer = null;
			if (
				generation === this.#globalGeneration &&
				this.#pendingIncoming?.id === callId &&
				this.#incomingLeader?.isLeader(callId)
			) void this.#activateIncomingLeadership(callId, true, generation);
		}, 400);
	}

	#releaseIncomingLeadership(callId?: string): void {
		if (callId && this.#pendingIncoming?.id !== callId && !this.#incomingLeader?.isLeader(callId)) return;
		if (this.#incomingLeadershipTimer) clearTimeout(this.#incomingLeadershipTimer);
		this.#incomingLeadershipTimer = null;
		if (!callId || this.#pendingIncoming?.id === callId) this.#pendingIncoming = null;
		this.#incomingLeader?.release(callId);
	}

	#yieldIncomingLeadership(callId: string): void {
		if (this.#pendingIncoming?.id !== callId) return;
		if (this.#incomingLeadershipTimer) clearTimeout(this.#incomingLeadershipTimer);
		this.#incomingLeadershipTimer = null;
		if (this.session?.id !== callId || this.phase !== 'incoming') return;
		this.#operationGeneration += 1;
		this.#clearIncomingAck();
		this.#clearExpiry();
		callAudio.stop();
		this.#cleanupTransport();
		this.#transition({ type: 'RESET' });
		this.peerProfile = null;
		this.accepting = false;
		this.responseAction = null;
	}

	async #ackIncomingPresentation(call: CallSession): Promise<void> {
		if (
			this.session?.id !== call.id ||
			call.callee !== this.#userId ||
			!this.#installationId ||
			!this.#incomingLeader?.isLeader(call.id)
		) return;
		const existing = this.#incomingAckPending;
		if (existing?.callId === call.id) {
			if (existing.stage === 'presented' && !this.attentionMuted) {
				const feedbackStarted = await callAudio.confirmIncomingFeedback();
				if (!this.#incomingAckStillValid(existing)) return;
				if (feedbackStarted) {
					if (existing.inFlight) {
						existing.upgradeToRinging = true;
					} else {
						existing.stage = 'ringing';
						existing.attempts = 0;
						existing.upgradeToRinging = false;
					}
				}
			}
			this.#retryPendingIncomingAckNow();
			return;
		}
		const installationId = this.#installationId;
		let stage: 'presented' | 'ringing' = 'presented';
		if (!this.attentionMuted) {
			const feedbackStarted = await callAudio.confirmIncomingFeedback();
			// resume() crosses an async boundary. Accept/decline, account changes or
			// another tab claiming the call must never produce a late fake ringing ACK.
			const current = this.session;
			if (
				!current ||
				current.id !== call.id ||
				current.status !== 'ringing' ||
				current.callee !== this.#userId ||
				this.#installationId !== installationId ||
				this.attentionMuted ||
				this.phase !== 'incoming' ||
				!this.#incomingLeader?.isLeader(call.id)
			) return;
			if (feedbackStarted) stage = 'ringing';
		}
		this.#clearIncomingAck();
		this.#incomingAckPending = {
			callId: call.id,
			installationId,
			stage,
			attempts: 0,
			generation: this.#incomingAckGeneration,
			inFlight: false,
			installationReconciled: this.#installationRegistered,
			upgradeToRinging: false
		};
		await this.#flushIncomingAck();
	}

	#incomingAckStillValid(pending: PendingIncomingAck): boolean {
		const current = this.session;
		return Boolean(
			this.#incomingAckPending === pending &&
			pending.generation === this.#incomingAckGeneration &&
			current?.id === pending.callId &&
			current.status === 'ringing' &&
			current.callee === this.#userId &&
			this.#installationId === pending.installationId &&
			this.phase === 'incoming' &&
			this.#incomingLeader?.isLeader(pending.callId)
		);
	}

	async #flushIncomingAck(): Promise<void> {
		const pending = this.#incomingAckPending;
		if (!pending || pending.inFlight) return;
		if (!this.#incomingAckStillValid(pending)) {
			this.#clearIncomingAck();
			return;
		}
		pending.inFlight = true;
		pending.attempts += 1;
		let retryImmediately = false;
		try {
			const { data, error } = await getSupabaseClient().rpc('ack_call_delivery', {
				p_call: pending.callId,
				p_installation_id: pending.installationId,
				p_stage: pending.stage
			});
			if (!this.#incomingAckStillValid(pending)) return;
			if (!error && data === true) {
				if (pending.stage === 'presented' && pending.upgradeToRinging) {
					pending.stage = 'ringing';
					pending.upgradeToRinging = false;
					pending.attempts = 0;
					retryImmediately = true;
				} else {
					this.#clearIncomingAck();
					return;
				}
			}
			if ((error || data !== true) && !pending.installationReconciled) {
				pending.installationReconciled = await this.#registerInstallation();
				retryImmediately = pending.installationReconciled;
			}
		} catch {
			if (this.#incomingAckStillValid(pending) && !pending.installationReconciled) {
				pending.installationReconciled = await this.#registerInstallation();
				retryImmediately = pending.installationReconciled;
			}
		} finally {
			if (this.#incomingAckPending === pending) pending.inFlight = false;
		}
		if (!this.#incomingAckStillValid(pending)) return;
		if (pending.stage === 'presented' && pending.upgradeToRinging) {
			pending.stage = 'ringing';
			pending.upgradeToRinging = false;
			pending.attempts = 0;
			retryImmediately = true;
		}
		if (retryImmediately) this.#retryPendingIncomingAckNow();
		else this.#scheduleIncomingAckRetry(pending);
	}

	#scheduleIncomingAckRetry(pending: PendingIncomingAck): void {
		if (pending.attempts >= INCOMING_ACK_MAX_ATTEMPTS || this.#incomingAckTimer) return;
		const delay = INCOMING_ACK_RETRY_DELAYS_MS[
			Math.min(pending.attempts - 1, INCOMING_ACK_RETRY_DELAYS_MS.length - 1)
		];
		this.#incomingAckTimer = setTimeout(() => {
			this.#incomingAckTimer = null;
			if (this.#incomingAckStillValid(pending)) void this.#flushIncomingAck();
		}, delay);
	}

	#retryPendingIncomingAckNow(): void {
		const pending = this.#incomingAckPending;
		if (!pending || pending.inFlight) return;
		if (!this.#incomingAckStillValid(pending)) {
			this.#clearIncomingAck();
			return;
		}
		if (this.#incomingAckTimer) clearTimeout(this.#incomingAckTimer);
		this.#incomingAckTimer = null;
		// A visibility/online/Realtime recovery starts a new bounded cycle. There
		// is never a free-running loop while the device remains offline.
		if (pending.attempts >= INCOMING_ACK_MAX_ATTEMPTS) pending.attempts = 0;
		if (!this.#installationRegistered) pending.installationReconciled = false;
		void this.#flushIncomingAck();
	}

	#clearIncomingAck(): void {
		this.#incomingAckGeneration += 1;
		if (this.#incomingAckTimer) clearTimeout(this.#incomingAckTimer);
		this.#incomingAckTimer = null;
		this.#incomingAckPending = null;
	}

	async #watchCallProgress(call: CallSession): Promise<void> {
		if (!this.#userId || call.caller !== this.#userId || this.session?.id !== call.id) return;
		const generation = ++this.#progressGeneration;
		this.#removeProgressChannel(false);
		const sb = getSupabaseClient();
		// Feature detection doubles as immediate reconciliation. A 404/42P01 on an
		// older deployment is intentionally ignored; the call remains “contacting”
		// instead of falsely claiming that the other phone is ringing.
		const { data, error } = await sb
			.from('call_deliveries')
			.select(CALL_DELIVERY_PROGRESS_COLUMNS)
			.eq('call_id', call.id)
			.in('channel', ['realtime', 'push'])
			.order('updated_at', { ascending: false })
			.limit(20);
		if (generation !== this.#progressGeneration || this.session?.id !== call.id) return;
		if (error) return;
		for (const row of data ?? []) this.#applyDeliveryRow(row);
		const { data: eventData, error: eventError } = await sb
			.from('call_events')
			.select(CALL_EVENT_PROGRESS_COLUMNS)
			.eq('call_id', call.id)
			.order('created_at', { ascending: true })
			.limit(100);
		if (generation !== this.#progressGeneration || this.session?.id !== call.id) return;
		if (!eventError) for (const row of eventData ?? []) this.#applyCallEvent(row);

		// Only the append-only, participant-safe event ledger is published. The
		// richer delivery table is reconciled through the explicit safe-column
		// query above/poll below, so provider internals and ACK hashes never enter
		// the Realtime stream.
		const channel = sb
			.channel(`call-progress:${call.id}:${generation}`)
			.on(
				'postgres_changes',
				{ event: 'INSERT', schema: 'public', table: 'call_events', filter: `call_id=eq.${call.id}` },
				(payload) => {
					if (generation === this.#progressGeneration && this.#progressChannel === channel) {
						this.#applyCallEvent(payload.new);
					}
				}
			)
			.subscribe((status) => {
				if (generation !== this.#progressGeneration || this.#progressChannel !== channel) return;
				if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
					this.#startProgressPoll(call.id, generation, 250);
				}
			});
		this.#progressChannel = channel;
		this.#startProgressPoll(call.id, generation, PROGRESS_POLL_MS);
	}

	#applyDeliveryRow(value: unknown): void {
		const delivery = parseCallDelivery(value);
		const call = this.session;
		if (!delivery || !call || delivery.callId !== call.id || call.caller !== this.#userId) return;
		const current = this.deliveryStage;
		if (
			current &&
			DELIVERY_STAGE_RANK[delivery.stage] < DELIVERY_STAGE_RANK[current] &&
			DELIVERY_STAGE_RANK[current] > 1
		) return;
		this.deliveryStage = delivery.stage;
		if (!['failed', 'stale'].includes(delivery.stage)) this.deliveryIssue = null;
		if (deliveryConfirmsRinging(delivery.stage)) this.#transition({ type: 'RINGING', call });
	}

	#applyCallEvent(value: unknown): void {
		if (!value || typeof value !== 'object' || Array.isArray(value) || !this.session) return;
		const row = value as Record<string, unknown>;
		const rawEvent = row.event_type ?? row.event;
		if (row.call_id !== this.session.id || typeof rawEvent !== 'string') return;
		const eventType = rawEvent.toLowerCase().replaceAll('_', '.');
		const stageByEvent: Record<string, CallDeliveryStage | undefined> = {
			'push.provider.accepted': 'provider_accepted',
			'delivery.received': 'received',
			'delivery.presented': 'presented',
			'delivery.opened': 'opened',
			'delivery.ringing': 'ringing',
			'call.ringing': 'ringing',
			'push.failed': 'failed',
			'push.no.devices': 'failed',
			'push.subscription.stale': 'stale'
		};
		const stage = stageByEvent[eventType];
		if (!stage) return;
		const current = this.deliveryStage;
		if (current && DELIVERY_STAGE_RANK[stage] < DELIVERY_STAGE_RANK[current] && DELIVERY_STAGE_RANK[current] > 1) return;
		if (eventType === 'push.no.devices') this.deliveryIssue = 'no_push_devices';
		else if (!['failed', 'stale'].includes(stage)) this.deliveryIssue = null;
		this.deliveryStage = stage;
		if (deliveryConfirmsRinging(stage)) this.#transition({ type: 'RINGING', call: this.session });
	}

	#startProgressPoll(callId: string, generation: number, delay: number): void {
		if (this.#progressPollTimer || generation !== this.#progressGeneration) return;
		this.#progressPollTimer = setTimeout(() => {
			this.#progressPollTimer = null;
			if (
				generation !== this.#progressGeneration ||
				this.session?.id !== callId ||
				!['notifying', 'contacting', 'ringing'].includes(this.phase)
			) return;
			void this.#pollCallProgress(callId).finally(() => {
				this.#startProgressPoll(callId, generation, PROGRESS_POLL_MS);
			});
		}, delay);
	}

	async #pollCallProgress(callId: string): Promise<void> {
		try {
			const { data, error } = await getSupabaseClient()
				.from('call_deliveries')
				.select(CALL_DELIVERY_PROGRESS_COLUMNS)
				.eq('call_id', callId)
				.in('channel', ['realtime', 'push'])
				.order('updated_at', { ascending: false })
				.limit(20);
			if (error) throw error;
			if (this.session?.id !== callId) return;
			for (const row of data ?? []) this.#applyDeliveryRow(row);
			const { data: eventData, error: eventError } = await getSupabaseClient()
				.from('call_events')
				.select(CALL_EVENT_PROGRESS_COLUMNS)
				.eq('call_id', callId)
				.order('created_at', { ascending: true })
				.limit(100);
			if (eventError) throw eventError;
			if (this.session?.id !== callId) return;
			for (const row of eventData ?? []) this.#applyCallEvent(row);
		} catch {
			/* Realtime may recover; the current factual state remains valid. */
		}
	}

	async #loadPeerProfile(call: CallSession): Promise<void> {
		const me = this.#userId;
		if (!me) return;
		const other = otherCallParticipant(call, me);
		if (!other) return;
		try {
			const { data } = await getSupabaseClient()
				.from('accounts')
				.select('id,handle,display_name,emoji,avatar_url')
				.eq('id', other)
				.maybeSingle();
			if (this.session?.id !== call.id || !data) return;
			this.peerProfile = {
				id: data.id as string,
				label: (data.display_name as string | null) || `@${data.handle as string}`,
				emoji: (data.emoji as string | null) || '💞',
				avatarUrl: (data.avatar_url as string | null) ?? null
			};
		} catch {
			if (this.session?.id === call.id) this.peerProfile = { id: other, label: 'Presuntinho', emoji: '💞', avatarUrl: null };
		}
	}

	#restartForRemoteHandoff(call: CallSession): void {
		if (this.session?.id !== call.id || !this.#isClaimedByThisDevice(call)) return;
		if (this.phase === 'active') this.#transition({ type: 'CONNECTION_LOST' });
		this.#clearNegotiationTimeout();
		this.#scheduleNegotiationTimeout(call);
		this.#reconnectAttempts = 0;
		void this.#openCallChannel(call).catch(() => {
			if (this.session?.id === call.id) {
				this.realtimeHealth = 'degraded';
				this.#scheduleReconnect(call, this.#callGeneration);
			}
		});
	}

	async #openCallChannel(call: CallSession): Promise<void> {
		if (!this.#userId || this.session?.id !== call.id) return;
		if (call.status === 'accepted' && !this.#isClaimedByThisDevice(call)) throw new Error('call_claimed_elsewhere');
		await this.#preparePeerRebuild();
		const generation = ++this.#callGeneration;
		this.#removeCallChannel(false);
		if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
		this.#reconnectTimer = null;
		// A browser can resume with a stale RTCPeerConnection after changing
		// network. Keep its captured media, but rebuild the peer/signalling pair.
		this.#peer?.close(false);
		this.#peer = null;
		this.#peerSetupPromise = null;
		stopMediaStream(this.remoteStream);
		this.remoteStream = null;
		this.#pendingSignals = [];
		this.#channelSubscribed = false;
		this.#otherPresent = false;
		this.#offerRequested = false;
		this.#lastRemoteSequence.clear();
		this.#remoteDevice = null;
		const me = this.#userId;
		const other = otherCallParticipant(call, me);
		if (!other) throw new Error('call_participant_invalid');
		const channel = getSupabaseClient().channel(callTopic(call.id), {
			config: {
				private: true,
				broadcast: { self: false, ack: true },
				presence: { key: `${me}:${this.#deviceId}` }
			}
		});
		channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
			const active = this.session;
			const expectedDevice = active?.id === call.id ? callDeviceForParticipant(active, other) : null;
			if (
				generation !== this.#callGeneration ||
				active?.status !== 'accepted' ||
				!expectedDevice ||
				!isCallSignalEnvelope(payload, call.id, other, expectedDevice)
			) return;
			const last = this.#lastRemoteSequence.get(payload.device) ?? -1;
			if (payload.seq <= last) return;
			this.#lastRemoteSequence.set(payload.device, payload.seq);
			this.#remoteDevice ??= payload.device;
			if (payload.signal.type === 'hangup') {
				void this.#finishRemote(call);
				return;
			}
			if (this.#peer) void this.#peer.receive(payload.signal);
			else this.#pendingSignals.push(payload.signal);
		});
		const syncPresence = () => {
			if (generation !== this.#callGeneration) return;
			const state = channel.presenceState<{ account?: string; device?: string }>();
			const active = this.session;
			const expectedDevice = active?.id === call.id ? callDeviceForParticipant(active, other) : null;
			this.#otherPresent = Boolean(expectedDevice) && Object.values(state).some((entries) =>
				entries.some((entry) => entry.account === other && entry.device === expectedDevice)
			);
			this.#maybeOffer();
		};
		channel.on('presence', { event: 'sync' }, syncPresence);
		channel.on('presence', { event: 'join' }, syncPresence);
		channel.on('presence', { event: 'leave' }, syncPresence);
		this.#callChannel = channel;
		await new Promise<void>((resolve, reject) => {
			let settled = false;
			channel.subscribe((status, error) => {
				if (generation !== this.#callGeneration) {
					if (!settled) {
						settled = true;
						resolve();
					}
					return;
				}
				if (status === 'SUBSCRIBED') {
					this.#channelSubscribed = true;
					this.#reconnectAttempts = 0;
					void channel.track({ account: me, device: this.#deviceId, kind: call.kind }).then((result) => {
						if (generation === this.#callGeneration && result !== 'ok') this.#scheduleReconnect(call, generation);
					});
					const active = this.session;
					if (active?.id === call.id && active.status === 'accepted') void this.#ensureTransport(active);
					if (!settled) {
						settled = true;
						resolve();
					}
				} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
					this.#channelSubscribed = false;
					if (!settled) {
						settled = true;
						reject(error ?? new Error(`call_channel_${status.toLowerCase()}`));
					} else {
						this.#scheduleReconnect(call, generation);
					}
				}
			});
		});
	}

	async #ensureTransport(call: CallSession): Promise<void> {
		if (
			!this.#userId ||
			call.status !== 'accepted' ||
			this.session?.id !== call.id ||
			this.session.status !== 'accepted' ||
			!this.#isClaimedByThisDevice(this.session) ||
			!this.localStream ||
			!this.#channelSubscribed
		) return;
		if (this.#peer) {
			this.#maybeOffer();
			return;
		}
		if (this.#peerSetupPromise) return this.#peerSetupPromise;

		const generation = this.#callGeneration;
		const localStream = this.localStream;
		let setup: Promise<void>;
		setup = (async () => {
			const ice = await this.#fetchIceConfiguration(call.id);
			const active = this.session;
			if (
				generation !== this.#callGeneration ||
				active?.id !== call.id ||
				active.status !== 'accepted' ||
				!this.#isClaimedByThisDevice(active) ||
				this.localStream !== localStream ||
				!this.#channelSubscribed ||
				this.#peer
			) return;
			this.relayAvailable = ice.relayAvailable;
			this.iceSource = ice.source;

			let peer!: CallPeer;
			peer = new CallPeer({
				kind: active.kind,
				caller: active.caller === this.#userId,
				iceServers: ice.iceServers,
				localStream,
				sendSignal: (signal) => this.#sendSignal(signal),
				onRemoteStream: (stream) => {
					if (generation === this.#callGeneration) this.remoteStream = stream;
				},
				onConnected: () => {
					if (generation !== this.#callGeneration || this.session?.id !== call.id) return;
					this.connectedAt ??= Date.now();
					this.#clearNegotiationTimeout();
					this.#transition({ type: 'CONNECTED' });
					this.#activateConnectedRuntime(peer, generation);
					void this.#completeActiveHandoff(call.id);
				},
				onReconnecting: () => {
					if (generation === this.#callGeneration && this.session?.id === call.id) {
						this.#transition({ type: 'CONNECTION_LOST' });
					}
				},
				onDisconnected: () => {
					if (generation === this.#callGeneration && this.session?.id === call.id && this.phase !== 'ended') {
						void this.#finishRemote(call);
					}
				},
				onError: (error) => {
					if (generation !== this.#callGeneration || this.session?.id !== call.id) return;
					const message = this.#errorCode(error, 'call_connection_failed');
					if (this.phase === 'connecting') this.#fail(message);
					else this.error = message;
				}
			});
			if (generation !== this.#callGeneration || this.session?.id !== call.id || this.#peer) {
				peer.close(false);
				return;
			}
			this.#peer = peer;
			this.#installPeerMediaRuntime(peer, generation);
			peer.setMuted(this.muted);
			peer.setCameraOff(this.cameraOff);
			const queued = this.#pendingSignals.splice(0);
			for (const signal of queued) {
				if (generation !== this.#callGeneration || this.#peer !== peer) break;
				await peer.receive(signal);
			}
			this.#maybeOffer();
		})().catch((error) => {
			if (generation === this.#callGeneration && this.session?.id === call.id) {
				this.#fail(this.#errorCode(error, 'call_transport_failed'));
			}
		}).finally(() => {
			if (this.#peerSetupPromise === setup) this.#peerSetupPromise = null;
		});
		this.#peerSetupPromise = setup;
		return setup;
	}

	async #preparePeerRebuild(): Promise<void> {
		const controller = this.#mediaController;
		if (controller?.isScreenSharing) {
			try {
				await controller.stopScreenShare();
			} catch (error) {
				this.mediaError = this.#mediaErrorCode(error);
			}
		}
		this.#disposePeerMediaRuntime(false);
	}

	#installPeerMediaRuntime(peer: CallPeer, generation: number): void {
		if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
			throw new Error('media_devices_unsupported');
		}
		this.#disposePeerMediaRuntime(false);
		this.#mediaController = new CallMediaController({
			peerConnection: peer.pc,
			localStream: peer.localStream,
			onScreenShareChange: (change) => {
				if (generation !== this.#callGeneration || this.#peer !== peer) return;
				this.screenSharing = change.active;
				if (change.reason === 'restore-failed') this.mediaError = 'screen_share_restore_failed';
				if (!change.active && change.cameraRestored) this.#syncSelectedInputIds();
			},
			onError: (error) => {
				if (generation === this.#callGeneration && this.#peer === peer) {
					this.mediaError = this.#mediaErrorCode(error);
				}
			}
		});
		this.#qualityMonitor = new ConnectionQualityMonitor(peer.pc, {
			onUpdate: (sample) => {
				if (generation === this.#callGeneration && this.#peer === peer) {
					this.connectionQuality = sample;
				}
			}
		});
		this.#deviceChangeListener = () => {
			if (generation === this.#callGeneration && this.#peer === peer) {
				void this.#enumerateMediaDevices(false);
			}
		};
		navigator.mediaDevices.addEventListener('devicechange', this.#deviceChangeListener);
		void this.#enumerateMediaDevices(false);
	}

	#activateConnectedRuntime(peer: CallPeer, generation: number): void {
		if (generation !== this.#callGeneration || this.#peer !== peer) return;
		this.#qualityMonitor?.start();
		if (!this.#wakeLock) {
			this.#wakeLock = new CallWakeLockController({
				onChange: (state) => (this.wakeLockState = state)
			});
		}
		this.wakeLockState = this.#wakeLock.state;
		this.#wakeLock.start();
	}

	#disposePeerMediaRuntime(releaseWakeLock: boolean): void {
		this.#mediaController?.dispose();
		this.#mediaController = null;
		this.#qualityMonitor?.stop();
		this.#qualityMonitor = null;
		this.connectionQuality = null;
		this.screenSharing = false;
		this.mediaAction = null;
		this.#mediaRefreshGeneration += 1;
		if (
			this.#deviceChangeListener &&
			typeof navigator !== 'undefined' &&
			navigator.mediaDevices
		) navigator.mediaDevices.removeEventListener('devicechange', this.#deviceChangeListener);
		this.#deviceChangeListener = null;
		if (releaseWakeLock) void this.#wakeLock?.stop();
	}

	#maybeOffer(): void {
		const call = this.session;
		if (
			!call ||
			call.status !== 'accepted' ||
			call.caller !== this.#userId ||
			!this.#peer ||
			!this.#otherPresent ||
			this.#offerRequested
		) return;
		this.#offerRequested = true;
		void this.#peer.startOffer();
	}

	async #sendSignal(signal: CallSignal): Promise<void> {
		const call = this.session;
		const channel = this.#callChannel;
		if (!call || !channel || !this.#userId || !this.#channelSubscribed || !this.#isClaimedByThisDevice(call)) {
			throw new Error('call_signal_not_ready');
		}
		if (signal.type !== 'hangup' && call.status !== 'accepted') throw new Error('call_signal_not_accepted');
		const generation = this.#callGeneration;
		const payload: CallSignalEnvelope = {
			v: 1,
			callId: call.id,
			from: this.#userId,
			device: this.#deviceId,
			seq: ++this.#signalSequence,
			signal
		};
		let lastError: unknown = new Error('call_signal_failed');
		for (let attempt = 0; attempt < SIGNAL_SEND_ATTEMPTS; attempt += 1) {
			if (
				generation !== this.#callGeneration ||
				this.#callChannel !== channel ||
				this.session?.id !== call.id ||
				!this.#channelSubscribed
			) throw new Error('call_signal_cancelled');
			try {
				const result = await channel.send({ type: 'broadcast', event: 'signal', payload });
				if (result === 'ok') return;
				lastError = new Error(`call_signal_${result}`);
			} catch (error) {
				lastError = error;
			}
			if (attempt + 1 < SIGNAL_SEND_ATTEMPTS) await wait(180 * 2 ** attempt);
		}
		throw lastError instanceof Error ? lastError : new Error('call_signal_failed');
	}

	async #fetchIceConfiguration(callId: string) {
		const auth = await getAuthSession();
		if (!auth) throw new Error('call_ice_auth_missing');
		return fetchCallIceConfiguration({
			callId,
			device: this.#deviceId,
			accessToken: auth.access_token
		});
	}

	async #finishRemote(call: CallSession): Promise<void> {
		if (this.session?.id !== call.id) return;
		void this.#retryTerminalCallRpc('end_call', { p_call: call.id, p_device: this.#deviceId }).catch(() => undefined);
		this.#finish({ ...call, status: 'ended', endedAt: new Date().toISOString() });
	}

	#startHeartbeat(call: CallSession): void {
		if (!this.#shouldHeartbeat(call)) {
			this.#clearHeartbeat();
			return;
		}
		if (this.#heartbeatTimer && this.#heartbeatCallId === call.id) return;
		this.#clearHeartbeat();
		this.#heartbeatFailures = 0;
		this.#heartbeatCallId = call.id;
		this.#heartbeatTimer = setInterval(() => void this.#heartbeat(call.id), HEARTBEAT_INTERVAL_MS);
	}

	#clearHeartbeat(): void {
		if (this.#heartbeatTimer) clearInterval(this.#heartbeatTimer);
		this.#heartbeatTimer = null;
		this.#heartbeatCallId = null;
		this.#heartbeatFailures = 0;
	}

	#shouldHeartbeat(call: CallSession): boolean {
		if (!this.#userId || !this.#isClaimedByThisDevice(call)) return false;
		return call.status === 'accepted' || (call.status === 'ringing' && call.caller === this.#userId);
	}

	async #heartbeat(callId: string): Promise<void> {
		const call = this.session;
		if (this.#heartbeatInFlight || !call || call.id !== callId || !this.#shouldHeartbeat(call)) return;
		this.#heartbeatInFlight = true;
		void this.#heartbeatInstallation();
		try {
			const refreshed = await this.#callRpc('heartbeat_call', { p_call: call.id, p_device: this.#deviceId });
			if (this.session?.id !== call.id) return;
			this.#heartbeatFailures = 0;
			if (isTerminalCallStatus(refreshed.status)) {
				this.#finish(refreshed);
				return;
			}
			if (!this.#isClaimedByThisDevice(refreshed)) {
				this.#finish({ ...refreshed, status: 'ended', endedAt: new Date().toISOString() });
				return;
			}
			this.session = refreshed;
		} catch (error) {
			if (this.session?.id !== call.id) return;
			this.#heartbeatFailures += 1;
			const message = this.#errorCode(error, 'call_heartbeat_failed');
			if (message.includes('claimed by another device')) {
				this.#finish({ ...call, status: 'ended', endedAt: new Date().toISOString() });
				return;
			}
			const lease = call.caller === this.#userId ? call.callerLeaseExpiresAt : call.calleeLeaseExpiresAt;
			if (this.#heartbeatFailures >= 3 && (!lease || Date.parse(lease) <= Date.now())) this.#fail('call_connection_lost');
		} finally {
			this.#heartbeatInFlight = false;
		}
	}

	#scheduleNegotiationTimeout(call: CallSession): void {
		if (this.#negotiationTimer || this.connectedAt || call.status !== 'accepted') return;
		this.#negotiationTimer = setTimeout(() => {
			this.#negotiationTimer = null;
			if (this.session?.id === call.id && this.session.status === 'accepted' && this.phase === 'connecting') {
				this.#fail('call_negotiation_timeout');
			}
		}, NEGOTIATION_TIMEOUT_MS);
	}

	#clearNegotiationTimeout(): void {
		if (this.#negotiationTimer) clearTimeout(this.#negotiationTimer);
		this.#negotiationTimer = null;
	}

	#scheduleExpiry(call: CallSession): void {
		this.#clearExpiry();
		const delay = Math.max(0, Date.parse(call.expiresAt) - Date.now());
		this.#expiryTimer = setTimeout(() => {
			if (this.session?.id !== call.id || this.session.status !== 'ringing') return;
			void (async () => {
				let expired: CallSession | null = null;
				try {
					expired = await this.#retryTerminalCallRpc('expire_call', { p_call: call.id, p_device: this.#deviceId });
				} catch {
					/* A stale ringing row is also reaped by the next client/server action. */
				}
				if (this.session?.id !== call.id || this.session.status !== 'ringing') return;
				this.#finish(
					expired && isTerminalCallStatus(expired.status)
						? expired
						: { ...call, status: 'missed', endedAt: new Date().toISOString() }
				);
			})();
		}, delay + 30);
	}

	#clearExpiry(): void {
		if (this.#expiryTimer) clearTimeout(this.#expiryTimer);
		this.#expiryTimer = null;
	}

	#scheduleHandoffExpiry(handoff: CallHandoff): void {
		this.#clearHandoffExpiry();
		const delay = Math.max(0, Date.parse(handoff.expiresAt) - Date.now()) + 80;
		this.#handoffExpiryTimer = setTimeout(() => {
			this.#handoffExpiryTimer = null;
			if (this.handoffOutgoing?.id !== handoff.id || this.handoffOutgoing.status !== 'requested') return;
			void this.cancelOutgoingHandoff().finally(() => {
				if (!this.handoffOutgoing || this.handoffOutgoing.id === handoff.id) {
					this.handoffError = 'handoff_expired';
				}
			});
		}, delay);
	}

	#clearHandoffExpiry(): void {
		if (this.#handoffExpiryTimer) clearTimeout(this.#handoffExpiryTimer);
		this.#handoffExpiryTimer = null;
	}

	async #completeActiveHandoff(callId: string): Promise<void> {
		const handoffId = this.#activeHandoffId;
		if (!handoffId || this.session?.id !== callId || !this.#isClaimedByThisDevice(this.session)) return;
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				const { data, error } = await getSupabaseClient().rpc('complete_call_handoff', {
					p_handoff: handoffId,
					p_device: this.#deviceId
				});
				if (error) throw error;
				if (data === true && this.#activeHandoffId === handoffId) this.#activeHandoffId = null;
				return;
			} catch {
				if (attempt + 1 < 3) await wait(250 * 2 ** attempt);
			}
		}
	}

	#finishTransferred(call: CallSession): void {
		if (
			this.#locallyTransferredCallId === call.id &&
			this.phase === 'ended' &&
			this.outcome === 'transferred'
		) return;
		this.#locallyTransferredCallId = call.id;
		this.#handoffOperationGeneration += 1;
		this.#clearHandoffExpiry();
		this.handoffOutgoing = null;
		this.handoffPickerOpen = false;
		this.handoffTargets = [];
		this.handoffBusy = false;
		this.handoffError = null;
		this.#activeHandoffId = null;
		// This is local teardown only. Never call end_call: the same durable call
		// continues on the device that atomically acquired this participant lease.
		this.#finish(call, 'transferred');
	}

	#finish(call: CallSession, outcome = this.#outcomeForCall(call)): void {
		this.#operationGeneration += 1;
		this.#clearIncomingAck();
		this.#releaseIncomingLeadership(call.id);
		this.accepting = false;
		this.responseAction = null;
		this.followupAction = null;
		this.followupStatus = 'idle';
		callAudio.stop();
		this.#clearExpiry();
		this.#clearHeartbeat();
		this.#clearNegotiationTimeout();
		this.#closeCallNotification(call.id);
		this.#cleanupTransport();
		this.#removeProgressChannel();
		this.#transition({ type: 'ENDED', call, outcome });
		if (this.#resetTimer) clearTimeout(this.#resetTimer);
		this.#resetTimer = setTimeout(
			() => this.#resetNow(),
			outcome === 'declined' || outcome === 'unreachable'
				? ACTIONABLE_RESET_AFTER_END_MS
				: RESET_AFTER_END_MS
		);
	}

	#fail(message: string): void {
		this.#operationGeneration += 1;
		this.#clearIncomingAck();
		this.#releaseIncomingLeadership(this.session?.id);
		this.accepting = false;
		this.responseAction = null;
		this.followupAction = null;
		this.followupStatus = 'idle';
		callAudio.stop();
		const call = this.session;
		if (call && (call.status === 'ringing' || call.status === 'accepted') && this.#isClaimedByThisDevice(call)) {
			void this.#retryTerminalCallRpc('end_call', { p_call: call.id, p_device: this.#deviceId }).catch(() => undefined);
		}
		this.#clearExpiry();
		this.#clearHeartbeat();
		this.#clearNegotiationTimeout();
		this.#removeProgressChannel();
		this.#cleanupTransport();
		this.#transition({
			type: 'FAIL',
			message,
			outcome: message === 'call_connection_lost'
				? 'connection_lost'
				: message === 'call_peer_busy'
					? 'busy'
					: 'failed'
		});
	}

	#cleanupTransport(): void {
		this.#disposePeerMediaRuntime(true);
		const peer = this.#peer;
		peer?.close();
		this.#peer = null;
		this.#peerSetupPromise = null;
		if (!peer) stopMediaStream(this.localStream);
		stopMediaStream(this.remoteStream);
		this.localStream = null;
		this.remoteStream = null;
		this.#removeCallChannel(true);
		this.connectedAt = null;
		this.relayAvailable = null;
		this.iceSource = null;
		this.#pendingSignals = [];
		this.#remoteDevice = null;
		this.#otherPresent = false;
		this.#offerRequested = false;
		if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
		this.#reconnectTimer = null;
		this.#reconnectAttempts = 0;
		this.#heartbeatInFlight = false;
		this.mediaDevices = [];
		this.selectedMicrophoneId = null;
		this.selectedCameraId = null;
		this.selectedSpeakerId = null;
		this.mediaError = null;
		this.screenShareSupported = false;
		this.#clearHeartbeat();
		this.#clearNegotiationTimeout();
	}

	#resetNow(): void {
		this.#operationGeneration += 1;
		this.#clearIncomingAck();
		this.#releaseIncomingLeadership();
		if (this.#resetTimer) clearTimeout(this.#resetTimer);
		this.#resetTimer = null;
		this.#clearExpiry();
		callAudio.stop();
		this.#removeProgressChannel();
		this.#cleanupTransport();
		this.phase = 'idle';
		this.session = null;
		this.error = null;
		this.outcome = null;
		this.peerProfile = null;
		this.muted = false;
		this.cameraOff = false;
		this.facingMode = 'user';
		this.accepting = false;
		this.responseAction = null;
		this.deliveryStage = null;
		this.deliveryIssue = null;
		this.requestedKind = null;
		this.minimized = false;
		this.followupAction = null;
		this.followupStatus = 'idle';
		this.#followupClientIds.clear();
		this.#lastStart = null;
		this.#handoffOperationGeneration += 1;
		this.#clearHandoffExpiry();
		this.handoffTargets = [];
		this.handoffPickerOpen = false;
		this.handoffBusy = false;
		this.handoffError = null;
		this.handoffOffer = null;
		this.handoffOutgoing = null;
		this.#activeHandoffId = null;
		this.#locallyTransferredCallId = null;
		this.attentionMuted = false;
		callAudio.setMuted(false);
	}

	#removeGlobalChannel(): void {
		if (this.#globalReconnectTimer) clearTimeout(this.#globalReconnectTimer);
		this.#globalReconnectTimer = null;
		this.#globalReconnectAttempts = 0;
		this.#stopIncomingPoll();
		const channel = this.#globalChannel;
		this.#globalChannel = null;
		if (channel) void getSupabaseClient().removeChannel(channel);
	}

	#removeProgressChannel(increment = true): void {
		if (increment) this.#progressGeneration += 1;
		if (this.#progressPollTimer) clearTimeout(this.#progressPollTimer);
		this.#progressPollTimer = null;
		const channel = this.#progressChannel;
		this.#progressChannel = null;
		if (channel) void getSupabaseClient().removeChannel(channel);
	}

	#removeCallChannel(increment = true): void {
		if (increment) this.#callGeneration += 1;
		this.#channelSubscribed = false;
		if (this.#callChannel) {
			try {
				void this.#callChannel.untrack();
			} catch {
				/* already closed */
			}
			void getSupabaseClient().removeChannel(this.#callChannel);
		}
		this.#callChannel = null;
	}

	#scheduleReconnect(call: CallSession, generation: number): void {
		if (this.phase === 'active') this.#transition({ type: 'CONNECTION_LOST' });
		if (
			this.#reconnectTimer ||
			generation !== this.#callGeneration ||
			this.session?.id !== call.id ||
			!['ringing', 'accepted'].includes(this.session.status)
		) return;
		if (this.#reconnectAttempts >= 5) {
			this.#fail('call_connection_lost');
			return;
		}
		const delay = Math.min(12_000, 900 * 2 ** this.#reconnectAttempts++);
		this.#reconnectTimer = setTimeout(() => {
			this.#reconnectTimer = null;
			if (generation !== this.#callGeneration || this.session?.id !== call.id) return;
			void this.#openCallChannel(this.session).catch(() => {
				if (this.session?.id === call.id) this.#scheduleReconnect(call, this.#callGeneration);
			});
		}, delay);
	}

	#closeCallNotification(callId: string): void {
		if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
		const message = { type: 'presuntinho:call-terminal-local', callId };
		const controller = navigator.serviceWorker.controller;
		// Do this before awaiting `ready`: the page may close immediately after the
		// accept/decline commit, and this installation is intentionally excluded
		// from the terminal Web Push fanout.
		controller?.postMessage(message);
		void navigator.serviceWorker.ready
			.then(async (registration) => {
				if (registration.active && registration.active !== controller) {
					registration.active.postMessage(message);
				}
				const notifications = await registration.getNotifications({ tag: `presuntinho-call-${callId}` });
				notifications.forEach((notification) => notification.close());
			})
			.catch(() => undefined);
	}

	#installLifecycleListeners(): void {
		this.#resumeListener = () => {
			const online = navigator.onLine;
			if (!online) {
				this.readiness = 'offline';
				this.realtimeHealth = 'offline';
				this.#startIncomingPoll(this.#globalGeneration);
				return;
			}
			if (!this.#globalChannel && this.#userId) {
				if (this.#globalReconnectTimer) clearTimeout(this.#globalReconnectTimer);
				this.#globalReconnectTimer = null;
				this.#openGlobalChannel(this.#userId, this.#globalGeneration);
			}
			if (document.visibilityState !== 'visible') {
				const hiddenCall = this.session;
				if (
					hiddenCall?.status === 'ringing' &&
					this.phase === 'incoming' &&
					this.#incomingLeader?.isLeader(hiddenCall.id)
				) {
					// Releasing the coordinator invokes #yieldIncomingLeadership, which
					// stops local audio/UI while keeping the durable call pending for a
					// visible sibling tab or this tab's next visibility reconciliation.
					this.#incomingLeader.release(hiddenCall.id);
				}
				return;
			}
			void this.#reconcileGlobalCalls(this.#globalGeneration);
			void this.#reconcileHandoffs(this.#globalGeneration);
			void this.#heartbeatInstallation();
			const call = this.session;
			if (
				call?.status === 'ringing' &&
				this.phase === 'incoming' &&
				this.#incomingLeader?.isLeader(call.id)
			) {
				this.#retryPendingIncomingAckNow();
			}
			if (call && this.#shouldHeartbeat(call)) void this.#heartbeat(call.id);
			if (
				call?.status === 'accepted' &&
				this.#isClaimedByThisDevice(call) &&
				(!this.#callChannel || String(this.#callChannel.state) === 'closed')
			) {
				this.#reconnectAttempts = 0;
				void this.#openCallChannel(call).catch(() => undefined);
			}
		};
		document.addEventListener('visibilitychange', this.#resumeListener);
		window.addEventListener('online', this.#resumeListener);
		window.addEventListener('offline', this.#resumeListener);
		this.#audioUnlockListener = () => {
			if (!callAudio.unlocked) callAudio.primeFromGesture();
			if (
				this.phase === 'incoming' &&
				this.session?.status === 'ringing' &&
				this.#incomingLeader?.isLeader(this.session.id)
			) {
				if (!this.attentionMuted) callAudio.startIncoming();
				void this.#ackIncomingPresentation(this.session);
			}
		};
		window.addEventListener('pointerdown', this.#audioUnlockListener, { capture: true, passive: true });
		window.addEventListener('keydown', this.#audioUnlockListener, { capture: true });
		callAudio.setReducedMotion(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
		if ('serviceWorker' in navigator) {
			this.#pushListener = (event: MessageEvent<unknown>) => {
				const data = event.data as { type?: unknown; kind?: unknown } | null;
				if (data?.type === 'presuntinho:push-event' && data.kind === 'call') {
					void this.#reconcileGlobalCalls(this.#globalGeneration);
				}
			};
			navigator.serviceWorker.addEventListener('message', this.#pushListener);
		}
	}

	#removeLifecycleListeners(): void {
		if (this.#resumeListener && typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this.#resumeListener);
			window.removeEventListener('online', this.#resumeListener);
			window.removeEventListener('offline', this.#resumeListener);
		}
		if (this.#pushListener && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
			navigator.serviceWorker.removeEventListener('message', this.#pushListener);
		}
		if (this.#audioUnlockListener && typeof window !== 'undefined') {
			window.removeEventListener('pointerdown', this.#audioUnlockListener, true);
			window.removeEventListener('keydown', this.#audioUnlockListener, true);
		}
		this.#resumeListener = null;
		this.#pushListener = null;
		this.#audioUnlockListener = null;
		if (this.#installationHeartbeatTimer) clearInterval(this.#installationHeartbeatTimer);
		this.#installationHeartbeatTimer = null;
		if (this.#handoffPollTimer) clearTimeout(this.#handoffPollTimer);
		this.#handoffPollTimer = null;
	}

	#startInstallationHeartbeat(): void {
		if (this.#installationHeartbeatTimer) clearInterval(this.#installationHeartbeatTimer);
		this.#installationHeartbeatTimer = setInterval(() => {
			if (
				this.#userId &&
				typeof document !== 'undefined' &&
				document.visibilityState === 'visible' &&
				typeof navigator !== 'undefined' &&
				navigator.onLine
			) void this.#heartbeatInstallation();
		}, INSTALLATION_HEARTBEAT_MS);
	}

	#startHandoffPoll(generation: number): void {
		if (this.#handoffPollTimer || generation !== this.#globalGeneration) return;
		const poll = () => {
			this.#handoffPollTimer = null;
			if (generation !== this.#globalGeneration || !this.#userId) return;
			if (
				typeof document !== 'undefined' &&
				document.visibilityState === 'visible' &&
				typeof navigator !== 'undefined' &&
				navigator.onLine
			) void this.#reconcileHandoffs(generation);
			this.#handoffPollTimer = setTimeout(poll, HANDOFF_RECONCILE_MS);
		};
		this.#handoffPollTimer = setTimeout(poll, 500);
	}

	async #registerInstallation(): Promise<boolean> {
		if (!this.#userId || !this.#installationId) return false;
		const userId = this.#userId;
		const installationId = this.#installationId;
		try {
			const { data, error } = await getSupabaseClient().rpc('upsert_account_installation', {
				p_installation_id: installationId,
				p_platform: this.#platform(),
				p_capabilities: this.#installationCapabilities()
			});
			if (error || data !== true) throw error ?? new Error('call_installation_rejected');
			if (this.#userId !== userId || this.#installationId !== installationId) return false;
			this.#installationRegistered = true;
			return true;
		} catch {
			if (this.#userId === userId && this.#installationId === installationId) {
				this.#installationRegistered = false;
			}
			/* Compatibility with deployments before installation tracking. */
			return false;
		}
	}

	async #heartbeatInstallation(): Promise<void> {
		if (!this.#userId || !this.#installationId) return;
		try {
			const { data, error } = await getSupabaseClient().rpc('heartbeat_account_installation', {
				p_installation_id: this.#installationId,
				p_capabilities: this.#installationCapabilities()
			});
			if (error || data !== true) throw error ?? new Error('call_installation_heartbeat_rejected');
		} catch {
			/* Best effort: call_sessions heartbeat remains the lease authority. */
		}
	}

	#installationCapabilities(): Record<string, boolean> {
		const standalone = typeof window !== 'undefined' && (
			window.matchMedia?.('(display-mode: standalone)').matches === true ||
			(window.navigator as Navigator & { standalone?: boolean }).standalone === true
		);
		return {
			realtime: true,
			call_handoff: true,
			video_calls: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
			web_push: typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window,
			notification_actions: typeof window !== 'undefined' && 'Notification' in window,
			vibrate: typeof navigator !== 'undefined' && 'vibrate' in navigator,
			audio_unlocked: callAudio.unlocked,
			standalone
		};
	}

	#platform(): string {
		if (typeof navigator === 'undefined') return 'unknown';
		const ua = navigator.userAgent.toLowerCase();
		if (/iphone|ipad|ipod/.test(ua)) return 'ios';
		if (/android/.test(ua)) return 'android';
		if (/windows/.test(ua)) return 'windows';
		if (/macintosh|mac os x/.test(ua)) return 'macos';
		if (/linux/.test(ua)) return 'linux';
		return 'other';
	}

	#outcomeForCall(call: CallSession): CallOutcome {
		switch (call.status) {
			case 'declined': return 'declined';
			case 'cancelled': return 'cancelled';
			case 'missed': return this.direction === 'outgoing' && (this.deliveryStage === 'failed' || this.deliveryStage === 'stale')
				? 'unreachable'
				: 'missed';
			case 'failed': return 'failed';
			default: return 'completed';
		}
	}

	async #callRpc(name: CallRpcName, args: Record<string, unknown>): Promise<CallSession> {
		const { data, error } = await getSupabaseClient().rpc(name, args);
		if (error) throw error;
		const call = parseCallSession(firstRow(data));
		if (!call) throw new Error(`${name}_invalid_response`);
		return call;
	}

	async #retryCallRpc(name: CallRpcName, args: Record<string, unknown>, attempts = 3): Promise<CallSession> {
		let lastError: unknown = new Error(`${name}_failed`);
		for (let attempt = 0; attempt < attempts; attempt += 1) {
			try {
				return await this.#callRpc(name, args);
			} catch (error) {
				lastError = error;
				const message = this.#errorCode(error, '');
				if (
					message.includes('claimed by another device') ||
					message.includes('not found') ||
					message.includes('not authenticated') ||
					message.includes('not active') ||
					message.includes('invalid call')
				) break;
				if (attempt + 1 < attempts) await wait(220 * 2 ** attempt);
			}
		}
		throw lastError instanceof Error ? lastError : new Error(`${name}_failed`);
	}

	async #retryTerminalCallRpc(
		name: 'end_call' | 'expire_call',
		args: Record<string, unknown>,
		attempts = 3
	): Promise<CallSession> {
		const call = await this.#retryCallRpc(name, args, attempts);
		if (call.status !== 'ringing') void this.#wakeCallLifecycle(call.id);
		return call;
	}

	async #wakeCallLifecycle(callId: string): Promise<void> {
		await sendPushNotify('call', { callId });
	}

	#isClaimedByThisDevice(call: CallSession): boolean {
		return Boolean(this.#userId && this.#deviceId && callDeviceForParticipant(call, this.#userId) === this.#deviceId);
	}

	#handoffErrorCode(error: unknown, fallback: string): string {
		const code = this.#errorCode(error, fallback).toLowerCase();
		if (code === 'media_denied' || code === 'media_missing' || code === 'media_unsupported') return code;
		if (code.includes('already_claimed') || code.includes('source_changed') || code.includes('claimed by another device')) {
			return 'handoff_claimed_elsewhere';
		}
		if (code.includes('expired')) return 'handoff_expired';
		if (code.includes('declined')) return 'handoff_declined';
		if (code.includes('not active') || code.includes('not registered') || code.includes('unavailable')) {
			return 'handoff_unavailable';
		}
		return code || fallback;
	}

	#errorCode(error: unknown, fallback: string): string {
		if (error instanceof DOMException) {
			if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'media_denied';
			if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return 'media_missing';
		}
		if (error && typeof error === 'object') {
			const message = (error as { message?: unknown }).message;
			if (typeof message === 'string' && message) {
				const normalized = message.toLowerCase();
				if (normalized.includes('already in a call')) return 'call_peer_busy';
				if (normalized.includes('please wait before calling again')) return 'call_rate_limited';
				if (normalized.includes('conversation is not active')) return 'call_conversation_inactive';
				return message;
			}
		}
		return error instanceof Error && error.message ? error.message : fallback;
	}
}

export const callStore = new CallStore();
