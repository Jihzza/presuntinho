import type { RealtimeChannel } from '@supabase/supabase-js';
import { getAuthSession } from '$lib/account/auth';
import { getSupabaseClient } from '$lib/multiplayer/client';
import { sendPushNotify } from '$lib/push';
import { INITIAL_CALL_MACHINE, reduceCallMachine, type CallMachineEvent, type CallPhase } from './call-machine';
import {
	callDeviceForParticipant,
	callTopic,
	isCallSignalEnvelope,
	isRingingCallLive,
	isTerminalCallStatus,
	otherCallParticipant,
	parseCallSession,
	type CallKind,
	type CallPeerProfile,
	type CallSession,
	type CallSignal,
	type CallSignalEnvelope
} from './types';
import { acquireLocalMedia, CallPeer, stopMediaStream } from './webrtc';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478'] }];
const RESET_AFTER_END_MS = 1600;
const HEARTBEAT_INTERVAL_MS = 20_000;
const NEGOTIATION_TIMEOUT_MS = 25_000;
const SIGNAL_SEND_ATTEMPTS = 3;

type CallRpcName = 'start_call' | 'respond_to_call' | 'heartbeat_call' | 'end_call' | 'expire_call';

let pageDeviceId = '';

function deviceId(): string {
	if (pageDeviceId) return pageDeviceId;
	const key = 'presuntinho-call-device';
	try {
		let install = localStorage.getItem(key);
		if (!install) {
			install = crypto.randomUUID();
			localStorage.setItem(key, install);
		}
		// Each tab needs its own Presence key and signal sequence. Sharing the
		// persistent installation id would make two open tabs overwrite each other.
		pageDeviceId = `${install}.${crypto.randomUUID()}`;
	} catch {
		pageDeviceId = crypto.randomUUID();
	}
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
	peerProfile = $state<CallPeerProfile | null>(null);
	localStream = $state.raw<MediaStream | null>(null);
	remoteStream = $state.raw<MediaStream | null>(null);
	muted = $state(false);
	cameraOff = $state(false);
	facingMode = $state<'user' | 'environment'>('user');
	connectedAt = $state<number | null>(null);
	accepting = $state(false);

	#userId: string | null = null;
	#deviceId = '';
	#globalChannel: RealtimeChannel | null = null;
	#callChannel: RealtimeChannel | null = null;
	#peer: CallPeer | null = null;
	#peerSetupPromise: Promise<void> | null = null;
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
	#pushListener: ((event: MessageEvent<unknown>) => void) | null = null;
	#resumeListener: (() => void) | null = null;

	get busy(): boolean {
		return this.phase !== 'idle' && this.phase !== 'ended' && this.phase !== 'error';
	}

	get direction(): 'incoming' | 'outgoing' | null {
		if (!this.session || !this.#userId) return null;
		return this.session.caller === this.#userId ? 'outgoing' : 'incoming';
	}

	get kind(): CallKind | null {
		return this.session?.kind ?? null;
	}

	bindUser(userId: string | null): void {
		const next = userId?.trim() || null;
		if (next === this.#userId) return;
		this.#globalGeneration += 1;
		this.#removeGlobalChannel();
		this.#removeLifecycleListeners();
		this.#resetNow();
		this.#userId = next;
		if (!next || typeof window === 'undefined') return;
		this.#deviceId = deviceId();
		this.#openGlobalChannel(next, this.#globalGeneration);
		this.#installLifecycleListeners();
	}

	async startCall(conversationId: string, kind: CallKind): Promise<void> {
		if (!this.#userId || this.busy) return;
		const operation = ++this.#operationGeneration;
		this.#transition({ type: 'PREPARE' });
		let stream: MediaStream | null = null;
		try {
			stream = await acquireLocalMedia({ kind, facingMode: this.facingMode });
			if (operation !== this.#operationGeneration || this.phase !== 'preparing') {
				stopMediaStream(stream);
				return;
			}
			this.localStream = stream;
			const call = await this.#callRpc('start_call', {
				p_conversation: conversationId,
				p_kind: kind,
				p_device: this.#deviceId
			});
			if (!call || call.caller !== this.#userId) throw new Error('call_start_invalid');
			if (operation !== this.#operationGeneration || this.phase !== 'preparing') {
				stopMediaStream(stream);
				if (this.localStream === stream) this.localStream = null;
				void this.#retryCallRpc('end_call', { p_call: call.id, p_device: this.#deviceId }).catch(() => undefined);
				return;
			}
			this.#transition({ type: 'OUTGOING', call });
			this.#scheduleExpiry(call);
			this.#startHeartbeat(call);
			void this.#loadPeerProfile(call);
			await this.#openCallChannel(call);
			if (
				operation === this.#operationGeneration &&
				this.session?.id === call.id &&
				this.session.status === 'ringing' &&
				this.#channelSubscribed
			) {
				void sendPushNotify('call', { callId: call.id });
			}
		} catch (error) {
			if (operation !== this.#operationGeneration) {
				stopMediaStream(stream);
				return;
			}
			this.#fail(this.#errorCode(error, 'call_start_failed'));
		}
	}

	async accept(): Promise<void> {
		const call = this.session;
		if (!call || !this.#userId || call.callee !== this.#userId || this.phase !== 'incoming' || this.accepting) return;
		const operation = ++this.#operationGeneration;
		this.accepting = true;
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
			const accepted = await this.#callRpc('respond_to_call', {
				p_call: call.id,
				p_accept: true,
				p_device: this.#deviceId
			});
			if (operation !== this.#operationGeneration || this.session?.id !== call.id) {
				stopMediaStream(stream);
				if (this.localStream === stream) this.localStream = null;
				if (accepted.status === 'accepted' && accepted.calleeDevice === this.#deviceId) {
					void this.#retryCallRpc('end_call', { p_call: accepted.id, p_device: this.#deviceId }).catch(() => undefined);
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
			this.#clearExpiry();
			this.#closeCallNotification(accepted.id);
			this.#startHeartbeat(accepted);
			this.#scheduleNegotiationTimeout(accepted);
			await this.#openCallChannel(accepted);
		} catch (error) {
			stopMediaStream(stream);
			if (this.localStream === stream) this.localStream = null;
			if (operation !== this.#operationGeneration) return;
			if (this.#errorCode(error, '').includes('claimed by another device')) {
				this.#finish({ ...call, status: 'ended', endedAt: new Date().toISOString() });
				return;
			}
			if (serverAccepted) {
				this.#fail(this.#errorCode(error, 'call_accept_failed'));
			} else {
				this.error = this.#errorCode(error, 'call_accept_failed');
				this.phase = 'incoming';
			}
		} finally {
			this.accepting = false;
		}
	}

	async decline(): Promise<void> {
		const call = this.session;
		if (!call || call.status !== 'ringing' || this.accepting) return;
		const operation = ++this.#operationGeneration;
		try {
			const declined = await this.#retryCallRpc('respond_to_call', {
				p_call: call.id,
				p_accept: false,
				p_device: this.#deviceId
			});
			if (operation !== this.#operationGeneration || this.session?.id !== call.id) return;
			if (isTerminalCallStatus(declined.status) || declined.status === 'accepted') {
				this.#finish(declined);
				return;
			}
		} catch (error) {
			if (operation === this.#operationGeneration && this.session?.id === call.id) {
				this.error = this.#errorCode(error, 'call_decline_failed');
			}
		}
	}

	async end(): Promise<void> {
		this.#operationGeneration += 1;
		const call = this.session;
		if (!call) {
			this.#resetNow();
			return;
		}
		this.phase = 'ended';
		await Promise.race([this.#sendSignal({ type: 'hangup' }).catch(() => undefined), wait(400)]);
		void this.#retryCallRpc('end_call', { p_call: call.id, p_device: this.#deviceId }).catch(() => undefined);
		this.#finish({ ...call, status: call.status === 'ringing' ? 'cancelled' : 'ended', endedAt: new Date().toISOString() });
	}

	dismiss(): void {
		if (this.phase === 'error' || this.phase === 'ended') this.#resetNow();
	}

	toggleMute(): void {
		this.muted = !this.muted;
		if (this.#peer) this.#peer.setMuted(this.muted);
		else for (const track of this.localStream?.getAudioTracks() ?? []) track.enabled = !this.muted;
	}

	toggleCamera(): void {
		if (this.kind !== 'video') return;
		this.cameraOff = !this.cameraOff;
		if (this.#peer) this.#peer.setCameraOff(this.cameraOff);
		else for (const track of this.localStream?.getVideoTracks() ?? []) track.enabled = !this.cameraOff;
	}

	async flipCamera(): Promise<void> {
		if (this.kind !== 'video' || !this.#peer) return;
		const next = this.facingMode === 'user' ? 'environment' : 'user';
		try {
			await this.#peer.flipCamera(next);
			this.facingMode = next;
			this.cameraOff = false;
		} catch (error) {
			this.error = this.#errorCode(error, 'camera_flip_failed');
		}
	}

	#transition(event: CallMachineEvent): void {
		const next = reduceCallMachine({ phase: this.phase, call: this.session, error: this.error }, event);
		this.phase = next.phase;
		this.session = next.call;
		this.error = next.error;
	}

	#openGlobalChannel(userId: string, generation: number): void {
		const sb = getSupabaseClient();
		const channel = sb
			.channel(`call_sessions:${userId}:${generation}`)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'call_sessions' }, (payload) => {
				if (generation !== this.#globalGeneration) return;
				this.#applyDatabaseRow(payload.new);
			})
			.subscribe((status) => {
				if (generation !== this.#globalGeneration) return;
				if (status === 'SUBSCRIBED') void this.#loadIncoming(generation);
			});
		this.#globalChannel = channel;
		void this.#loadIncoming(generation);
	}

	async #loadIncoming(generation: number): Promise<void> {
		const userId = this.#userId;
		if (!userId || generation !== this.#globalGeneration || this.busy) return;
		try {
			const { error: reapError } = await getSupabaseClient().rpc('reap_stale_calls');
			if (reapError) throw reapError;
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
			/* offline: Realtime/visibility retry will reconcile */
		}
	}

	#applyDatabaseRow(value: unknown): void {
		const call = parseCallSession(value);
		if (!call || !this.#userId || (call.caller !== this.#userId && call.callee !== this.#userId)) return;
		if (this.session?.id === call.id) {
			if (call.status === 'accepted') {
				this.#closeCallNotification(call.id);
				if (!this.#isClaimedByThisDevice(call)) {
					// Another tab/phone of this account claimed the call first.
					this.#finish({ ...call, status: 'ended', endedAt: new Date().toISOString() });
					return;
				}
				this.session = call;
				if (this.phase === 'outgoing' || this.phase === 'incoming') this.#transition({ type: 'ACCEPTED', call });
				this.#clearExpiry();
				this.#startHeartbeat(call);
				if (this.phase !== 'active') this.#scheduleNegotiationTimeout(call);
				if (this.#callChannel) void this.#ensureTransport(call);
			} else if (isTerminalCallStatus(call.status) && this.phase !== 'error') {
				this.#finish(call);
			} else {
				this.session = call;
			}
			return;
		}
		if (call.callee === this.#userId && call.status === 'ringing' && !this.busy) this.#presentIncoming(call);
	}

	#presentIncoming(call: CallSession): void {
		if (!isRingingCallLive(call)) {
			void this.#retryCallRpc('expire_call', { p_call: call.id, p_device: this.#deviceId }).catch(() => undefined);
			return;
		}
		this.#transition({ type: 'INCOMING', call });
		this.#scheduleExpiry(call);
		void this.#loadPeerProfile(call);
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

	async #openCallChannel(call: CallSession): Promise<void> {
		if (!this.#userId || this.session?.id !== call.id) return;
		if (call.status === 'accepted' && !this.#isClaimedByThisDevice(call)) throw new Error('call_claimed_elsewhere');
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
			const iceServers = await this.#fetchIceServers(call.id);
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

			const peer = new CallPeer({
				kind: active.kind,
				caller: active.caller === this.#userId,
				iceServers,
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

	async #fetchIceServers(callId: string): Promise<RTCIceServer[]> {
		try {
			const auth = await getAuthSession();
			if (!auth) throw new Error('call_ice_auth_missing');
			const response = await fetch('/.netlify/functions/call-ice', {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.access_token}` },
				body: JSON.stringify({ callId, device: this.#deviceId })
			});
			if (!response.ok) {
				if (response.status >= 500) return DEFAULT_ICE_SERVERS;
				const failure = (await response.json().catch(() => null)) as { error?: unknown } | null;
				const reason = typeof failure?.error === 'string' ? failure.error.replace(/\s+/g, '_') : String(response.status);
				throw new Error(`call_ice_${reason}`);
			}
			const body = (await response.json()) as { iceServers?: RTCIceServer[] };
			if (!Array.isArray(body.iceServers) || body.iceServers.length === 0) return DEFAULT_ICE_SERVERS;
			return body.iceServers.filter((server) => Boolean(server && server.urls));
		} catch (error) {
			if (error instanceof Error && error.message.startsWith('call_ice_')) throw error;
			return DEFAULT_ICE_SERVERS;
		}
	}

	async #finishRemote(call: CallSession): Promise<void> {
		if (this.session?.id !== call.id) return;
		void this.#retryCallRpc('end_call', { p_call: call.id, p_device: this.#deviceId }).catch(() => undefined);
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
					expired = await this.#retryCallRpc('expire_call', { p_call: call.id, p_device: this.#deviceId });
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

	#finish(call: CallSession): void {
		this.#operationGeneration += 1;
		this.accepting = false;
		this.#clearExpiry();
		this.#clearHeartbeat();
		this.#clearNegotiationTimeout();
		this.#closeCallNotification(call.id);
		this.#cleanupTransport();
		this.#transition({ type: 'ENDED', call });
		if (this.#resetTimer) clearTimeout(this.#resetTimer);
		this.#resetTimer = setTimeout(() => this.#resetNow(), RESET_AFTER_END_MS);
	}

	#fail(message: string): void {
		this.#operationGeneration += 1;
		this.accepting = false;
		const call = this.session;
		if (call && (call.status === 'ringing' || call.status === 'accepted') && this.#isClaimedByThisDevice(call)) {
			void this.#retryCallRpc('end_call', { p_call: call.id, p_device: this.#deviceId }).catch(() => undefined);
		}
		this.#clearExpiry();
		this.#clearHeartbeat();
		this.#clearNegotiationTimeout();
		this.#cleanupTransport();
		this.#transition({ type: 'FAIL', message });
	}

	#cleanupTransport(): void {
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
		this.#pendingSignals = [];
		this.#remoteDevice = null;
		this.#otherPresent = false;
		this.#offerRequested = false;
		if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
		this.#reconnectTimer = null;
		this.#reconnectAttempts = 0;
		this.#heartbeatInFlight = false;
		this.#clearHeartbeat();
		this.#clearNegotiationTimeout();
	}

	#resetNow(): void {
		this.#operationGeneration += 1;
		if (this.#resetTimer) clearTimeout(this.#resetTimer);
		this.#resetTimer = null;
		this.#clearExpiry();
		this.#cleanupTransport();
		this.phase = 'idle';
		this.session = null;
		this.error = null;
		this.peerProfile = null;
		this.muted = false;
		this.cameraOff = false;
		this.facingMode = 'user';
		this.accepting = false;
	}

	#removeGlobalChannel(): void {
		if (this.#globalChannel) void getSupabaseClient().removeChannel(this.#globalChannel);
		this.#globalChannel = null;
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
		if (
			this.#reconnectTimer ||
			generation !== this.#callGeneration ||
			this.session?.id !== call.id ||
			!['ringing', 'accepted'].includes(this.session.status) ||
			this.#reconnectAttempts >= 3
		) return;
		const delay = 900 * 2 ** this.#reconnectAttempts++;
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
		void navigator.serviceWorker.ready
			.then((registration) => registration.getNotifications({ tag: `presuntinho-call-${callId}` }))
			.then((notifications) => notifications.forEach((notification) => notification.close()))
			.catch(() => undefined);
	}

	#installLifecycleListeners(): void {
		this.#resumeListener = () => {
			if (document.visibilityState !== 'visible') return;
			void this.#loadIncoming(this.#globalGeneration);
			const call = this.session;
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
		if ('serviceWorker' in navigator) {
			this.#pushListener = (event: MessageEvent<unknown>) => {
				const data = event.data as { type?: unknown; kind?: unknown } | null;
				if (data?.type === 'presuntinho:push-event' && data.kind === 'call') void this.#loadIncoming(this.#globalGeneration);
			};
			navigator.serviceWorker.addEventListener('message', this.#pushListener);
		}
	}

	#removeLifecycleListeners(): void {
		if (this.#resumeListener && typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this.#resumeListener);
			window.removeEventListener('online', this.#resumeListener);
		}
		if (this.#pushListener && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
			navigator.serviceWorker.removeEventListener('message', this.#pushListener);
		}
		this.#resumeListener = null;
		this.#pushListener = null;
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

	#isClaimedByThisDevice(call: CallSession): boolean {
		return Boolean(this.#userId && this.#deviceId && callDeviceForParticipant(call, this.#userId) === this.#deviceId);
	}

	#errorCode(error: unknown, fallback: string): string {
		if (error instanceof DOMException) {
			if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'media_denied';
			if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return 'media_missing';
		}
		if (error && typeof error === 'object') {
			const message = (error as { message?: unknown }).message;
			if (typeof message === 'string' && message) return message;
		}
		return error instanceof Error && error.message ? error.message : fallback;
	}
}

export const callStore = new CallStore();
