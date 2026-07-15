import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CALLER = '11111111-1111-4111-8111-111111111111';
const CALLEE = '22222222-2222-4222-8222-222222222222';
const CONVERSATION = '33333333-3333-4333-8333-333333333333';
const CALL_ID = '44444444-4444-4444-8444-444444444444';
const INSTALLATION = '55555555-5555-4555-8555-555555555555';
const OTHER_DEVICE = `${INSTALLATION}.66666666-6666-4666-8666-666666666666`;

type RpcResult = { data: unknown; error: unknown };
type RpcHandler = (args: Record<string, unknown>) => RpcResult | Promise<RpcResult>;

const harness = vi.hoisted(() => ({
	supabase: null as FakeSupabase | null,
	rpcHandlers: new Map<string, RpcHandler>(),
	acquireLocalMedia: vi.fn(),
	stopMediaStream: vi.fn(),
	startCallReliably: vi.fn(),
	sendPushNotify: vi.fn(),
	getAuthSession: vi.fn(),
	fetchIceConfiguration: vi.fn(),
	peerOptions: [] as Array<Record<string, (...args: any[]) => unknown>>,
	peerInstances: [] as Array<{
		pc: RTCPeerConnection;
		localStream: MediaStream;
		startOffer: ReturnType<typeof vi.fn>;
		receive: ReturnType<typeof vi.fn>;
		close: ReturnType<typeof vi.fn>;
	}>,
	enumerateDevices: vi.fn(),
	mediaGetUserMedia: vi.fn(),
	mediaGetDisplayMedia: vi.fn(),
	audio: {
		mode: 'idle' as 'idle' | 'incoming' | 'ringback',
		unlocked: true,
		primeFromGesture: vi.fn(),
		startIncoming: vi.fn(),
		startRingback: vi.fn(),
		confirmIncomingFeedback: vi.fn(),
		stop: vi.fn(),
		setMuted: vi.fn(),
		setReducedMotion: vi.fn(),
		configure: vi.fn()
	}
}));

vi.mock('$lib/multiplayer/client', () => ({
	getSupabaseClient: () => harness.supabase
}));

vi.mock('$lib/account/auth', () => ({
	getAuthSession: harness.getAuthSession
}));

vi.mock('$lib/push', () => ({
	getPushInstallationId: () => INSTALLATION,
	sendPushNotify: harness.sendPushNotify
}));

vi.mock('./call-audio', () => ({
	callAudio: harness.audio
}));

vi.mock('./call-start', () => ({
	startCallReliably: harness.startCallReliably
}));

vi.mock('./ice-config', () => ({
	fetchCallIceConfiguration: harness.fetchIceConfiguration
}));

vi.mock('./webrtc', () => ({
	acquireLocalMedia: harness.acquireLocalMedia,
	stopMediaStream: harness.stopMediaStream,
	CallPeer: class FakeCallPeer {
		pc: RTCPeerConnection;
		localStream: MediaStream;
		constructor(options: Record<string, (...args: any[]) => unknown>) {
			harness.peerOptions.push(options);
			this.localStream = options.localStream as unknown as MediaStream;
			const senders = this.localStream.getTracks().map((initialTrack) => {
				const sender = {
					track: initialTrack,
					replaceTrack: vi.fn(async (track: MediaStreamTrack | null) => {
						sender.track = track as MediaStreamTrack;
					})
				};
				return sender;
			});
			this.pc = {
				getSenders: () => senders,
				getStats: vi.fn(async () => new Map())
			} as unknown as RTCPeerConnection;
			harness.peerInstances.push(this);
		}
		close = vi.fn();
		setMuted = vi.fn();
		setCameraOff = vi.fn();
		startOffer = vi.fn(async () => undefined);
		receive = vi.fn(async () => true);
		flipCamera = vi.fn(async () => undefined);
	}
}));

import { CallStore } from './call-store.svelte';
import {
	clearLocallyIgnoredCalls,
	defaultCallPreferences,
	saveCallPreferences
} from './call-preferences';
import { isCallSessionSnapshotMonotonic, parseCallSession, type CallSession } from './types';

class Deferred<T> {
	promise: Promise<T>;
	resolve!: (value: T) => void;
	reject!: (reason?: unknown) => void;

	constructor() {
		this.promise = new Promise<T>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}

class FakeChannel {
	state = 'joined';
	readonly handlers: Array<{
		type: string;
		filter: Record<string, unknown>;
		callback: (payload: any) => void;
	}> = [];
	statusCallback: ((status: string, error?: Error) => void) | null = null;
	presence: Record<string, Array<{ account?: string; device?: string; handoffGeneration?: number }>> = {};
	send = vi.fn(async () => 'ok');
	track = vi.fn(async () => 'ok');
	untrack = vi.fn(async () => 'ok');

	constructor(readonly topic: string) {}

	on(type: string, filter: Record<string, unknown>, callback: (payload: any) => void): this {
		this.handlers.push({ type, filter, callback });
		return this;
	}

	subscribe(callback: (status: string, error?: Error) => void): this {
		this.statusCallback = callback;
		queueMicrotask(() => callback('SUBSCRIBED'));
		return this;
	}

	presenceState<T>(): Record<string, T[]> {
		return this.presence as Record<string, T[]>;
	}

	emitStatus(status: string, error?: Error): void {
		this.state = status === 'SUBSCRIBED' ? 'joined' : 'closed';
		this.statusCallback?.(status, error);
	}

	emitPostgres(table: string, row: unknown): void {
		for (const handler of this.handlers) {
			if (handler.type === 'postgres_changes' && handler.filter.table === table) {
				handler.callback({ new: row });
			}
		}
	}

	emitPresence(event: 'sync' | 'join' | 'leave' = 'sync'): void {
		for (const handler of this.handlers) {
			if (handler.type === 'presence' && handler.filter.event === event) handler.callback({});
		}
	}

	emitBroadcast(event: string, payload: unknown): void {
		for (const handler of this.handlers) {
			if (handler.type === 'broadcast' && handler.filter.event === event) handler.callback({ payload });
		}
	}
}

class SharedCallBroadcastHub {
	channels = new Set<SharedCallBroadcastChannel>();
	publish(sender: SharedCallBroadcastChannel, data: unknown): void {
		for (const channel of this.channels) {
			if (channel !== sender) channel.onmessage?.({ data } as MessageEvent<unknown>);
		}
	}
}

class SharedCallBroadcastChannel {
	onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
	constructor(private hub: SharedCallBroadcastHub) { hub.channels.add(this); }
	postMessage(data: unknown): void { this.hub.publish(this, data); }
	close(): void { this.hub.channels.delete(this); }
}

class FakeQuery implements PromiseLike<RpcResult> {
	filters = new Map<string, unknown>();
	insertValue: Record<string, unknown> | null = null;

	constructor(readonly database: FakeSupabase, readonly table: string) {}

	select(): this { return this; }
	insert(value: Record<string, unknown>): this { this.insertValue = value; return this; }
	eq(column: string, value: unknown): this { this.filters.set(column, value); return this; }
	in(column: string, values: unknown[]): this { this.filters.set(column, values); return this; }
	gt(): this { return this; }
	order(): this { return this; }
	limit(): this { return this; }

	maybeSingle(): Promise<RpcResult> {
		return Promise.resolve(this.database.queryResult(this.table, this.filters, true));
	}

	single(): Promise<RpcResult> {
		return Promise.resolve(this.insertValue
			? this.database.insertResult(this.table, this.insertValue)
			: this.database.queryResult(this.table, this.filters, true));
	}

	then<TResult1 = RpcResult, TResult2 = never>(
		onfulfilled?: ((value: RpcResult) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	): PromiseLike<TResult1 | TResult2> {
		return Promise.resolve(this.database.queryResult(this.table, this.filters, false)).then(onfulfilled, onrejected);
	}
}

class FakeSupabase {
	channels: FakeChannel[] = [];
	rows = new Map<string, unknown>();
	tableRows = new Map<string, unknown[]>();
	rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
	insertCalls: Array<{ table: string; value: Record<string, unknown> }> = [];
	insertHandler: ((table: string, value: Record<string, unknown>) => RpcResult) | null = null;
	removeChannel = vi.fn(async () => 'ok');

	channel(topic: string): FakeChannel {
		const channel = new FakeChannel(topic);
		this.channels.push(channel);
		return channel;
	}

	rpc(name: string, args: Record<string, unknown> = {}): Promise<RpcResult> {
		this.rpcCalls.push({ name, args });
		const handler = harness.rpcHandlers.get(name);
		return Promise.resolve(handler ? handler(args) : { data: true, error: null });
	}

	from(table: string): FakeQuery {
		return new FakeQuery(this, table);
	}

	insertResult(table: string, value: Record<string, unknown>): RpcResult {
		this.insertCalls.push({ table, value });
		return this.insertHandler?.(table, value) ?? { data: { id: 'message-committed' }, error: null };
	}

	queryResult(table: string, filters: Map<string, unknown>, single: boolean): RpcResult {
		if (table === 'call_sessions' && single && filters.has('id')) {
			return { data: this.rows.get(String(filters.get('id'))) ?? null, error: null };
		}
		if (table === 'account_profiles' && single) return { data: null, error: null };
		if (table === 'chat_messages' && single) {
			const row = (this.tableRows.get(table) ?? []).find((candidate) => {
				if (!candidate || typeof candidate !== 'object') return false;
				return [...filters].every(([column, value]) =>
					(candidate as Record<string, unknown>)[column] === value
				);
			});
			return { data: row ?? null, error: null };
		}
		if (this.tableRows.has(table)) {
			const rows = (this.tableRows.get(table) ?? []).filter((candidate) => {
				if (!candidate || typeof candidate !== 'object') return false;
				return [...filters].every(([column, value]) => {
					const actual = (candidate as Record<string, unknown>)[column];
					return Array.isArray(value) ? value.includes(actual) : actual === value;
				});
			});
			return { data: single ? rows[0] ?? null : rows, error: null };
		}
		return { data: [], error: null };
	}

	latest(prefix: string): FakeChannel {
		const channel = [...this.channels].reverse().find((candidate) => candidate.topic.startsWith(prefix));
		if (!channel) throw new Error(`missing fake channel ${prefix}`);
		return channel;
	}
}

function callRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	const now = Date.now();
	return {
		id: CALL_ID,
		conversation_id: CONVERSATION,
		caller: CALLER,
		callee: CALLEE,
		caller_device: OTHER_DEVICE,
		callee_device: null,
		kind: 'audio',
		status: 'ringing',
		created_at: new Date(now).toISOString(),
		updated_at: new Date(now).toISOString(),
		expires_at: new Date(now + 60_000).toISOString(),
		caller_heartbeat_at: new Date(now).toISOString(),
		callee_heartbeat_at: null,
		caller_lease_expires_at: new Date(now + 120_000).toISOString(),
		callee_lease_expires_at: null,
		push_sent_at: null,
		answered_at: null,
		ended_at: null,
		handoff_generation: 0,
		...overrides
	};
}

function mediaDevice(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
	return { kind, deviceId, label, groupId: 'private', toJSON: () => ({}) } as MediaDeviceInfo;
}

class TestMediaTrack extends EventTarget {
	enabled = true;
	readyState: MediaStreamTrackState = 'live';
	stop = vi.fn(() => { this.readyState = 'ended'; });
	constructor(readonly kind: 'audio' | 'video', readonly deviceId = '') { super(); }
	getSettings(): MediaTrackSettings { return { deviceId: this.deviceId }; }
}

function testStream(...initialTracks: TestMediaTrack[]): MediaStream {
	let tracks = [...initialTracks] as unknown as MediaStreamTrack[];
	return {
		getTracks: () => [...tracks],
		getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
		getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
		addTrack: (track: MediaStreamTrack) => {
			if (!tracks.includes(track)) tracks.push(track);
		},
		removeTrack: (track: MediaStreamTrack) => {
			tracks = tracks.filter((candidate) => candidate !== track);
		}
	} as unknown as MediaStream;
}

function streamStub(audioDeviceId = 'mic-1', videoDeviceId = 'cam-1') {
	const audioTrack = new TestMediaTrack('audio', audioDeviceId);
	const videoTrack = new TestMediaTrack('video', videoDeviceId);
	let tracks = [audioTrack, videoTrack];
	return {
		stream: testStream(...tracks),
		audioTrack,
		videoTrack
	};
}

async function settle(turns = 6): Promise<void> {
	for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

async function eventually(assertion: () => void, attempts = 30): Promise<void> {
	let error: unknown;
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			assertion();
			return;
		} catch (caught) {
			error = caught;
			await settle(2);
		}
	}
	throw error;
}

function bind(store: CallStore, userId: string): void {
	store.bindUser(userId);
}

beforeEach(async () => {
	vi.clearAllMocks();
	harness.rpcHandlers.clear();
	harness.peerOptions.length = 0;
	harness.peerInstances.length = 0;
	harness.supabase = new FakeSupabase();
	harness.audio.mode = 'idle';
	harness.audio.startIncoming.mockImplementation(() => { harness.audio.mode = 'incoming'; });
	harness.audio.startRingback.mockImplementation(() => { harness.audio.mode = 'ringback'; });
	harness.audio.stop.mockImplementation(() => { harness.audio.mode = 'idle'; });
	harness.audio.confirmIncomingFeedback.mockResolvedValue(true);
	harness.sendPushNotify.mockResolvedValue({
		attempted: 1,
		sent: 1,
		failed: 0,
		stale: 0,
		noDevices: false,
		status: 'sent',
		httpStatus: 202
	});
	harness.getAuthSession.mockResolvedValue({ access_token: 'test-access-token' });
	harness.fetchIceConfiguration.mockResolvedValue({
		iceServers: [{ urls: ['stun:example.test:3478'] }],
		relayAvailable: false,
		source: 'stun-only'
	});
	harness.enumerateDevices.mockResolvedValue([]);

	const listeners = new Map<string, Set<EventListener>>();
	const notifications = [{ close: vi.fn() }];
	const serviceWorker = {
		ready: Promise.resolve({ getNotifications: vi.fn(async () => notifications) }),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn()
	};
	const navigatorStub = {
		onLine: true,
		userAgent: 'Mozilla/5.0 Test Chrome',
		serviceWorker,
		vibrate: vi.fn(() => true),
		mediaDevices: {
			enumerateDevices: harness.enumerateDevices,
			getUserMedia: harness.mediaGetUserMedia,
			getDisplayMedia: harness.mediaGetDisplayMedia,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		}
	};
	const windowStub = {
		navigator: navigatorStub,
		PushManager: class {},
		Notification: class {},
		matchMedia: vi.fn(() => ({ matches: false })),
		addEventListener: vi.fn((name: string, listener: EventListener) => {
			const bucket = listeners.get(name) ?? new Set<EventListener>();
			bucket.add(listener);
			listeners.set(name, bucket);
		}),
		removeEventListener: vi.fn((name: string, listener: EventListener) => listeners.get(name)?.delete(listener))
	};
	const documentStub = {
		visibilityState: 'visible',
		addEventListener: vi.fn(),
		removeEventListener: vi.fn()
	};
	vi.stubGlobal('navigator', navigatorStub);
	vi.stubGlobal('window', windowStub);
	vi.stubGlobal('document', documentStub);
	vi.stubGlobal('Notification', windowStub.Notification);
	// Individual store tests model one foreground tab. Multi-tab election gets a
	// dedicated shared BroadcastChannel harness below.
	vi.stubGlobal('BroadcastChannel', undefined);
	vi.stubGlobal('localStorage', undefined);
	clearLocallyIgnoredCalls(CALLER, null);
	clearLocallyIgnoredCalls(CALLEE, null);
	for (const accountId of [CALLER, CALLEE]) {
		await saveCallPreferences(accountId, defaultCallPreferences(accountId), {
			storage: null,
			caches: null,
			postToWorker: () => undefined,
			dispatch: () => undefined
		});
	}

	harness.rpcHandlers.set('upsert_account_installation', () => ({ data: true, error: null }));
	harness.rpcHandlers.set('heartbeat_account_installation', () => ({ data: true, error: null }));
	harness.rpcHandlers.set('reap_stale_calls', () => ({ data: true, error: null }));
	harness.rpcHandlers.set('ack_call_delivery', () => ({ data: true, error: null }));
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('CallStore deterministic experience matrix', () => {
	it('silences an incoming call during local DND but still presents controls factually', async () => {
		await saveCallPreferences(CALLEE, {
			dndEnabled: true,
			dndStartMinutes: 0,
			dndEndMinutes: 0
		}, { storage: null, caches: null, postToWorker: () => undefined, dispatch: () => undefined });
		const store = new CallStore();
		bind(store, CALLEE);
		await settle();
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		await eventually(() => expect(store.phase).toBe('incoming'));
		expect(store.attentionMuted).toBe(true);
		expect(store.attentionPreferenceReason).toBe('dnd');
		expect(harness.audio.startIncoming).not.toHaveBeenCalled();
		expect(harness.audio.setMuted).toHaveBeenCalledWith(true);
		expect(harness.supabase!.rpcCalls.filter(({ name }) => name === 'respond_to_call')).toHaveLength(0);
		store.bindUser(null);
	});

	it('suppresses blocked calls on one installation without declining them for another device', async () => {
		await saveCallPreferences(CALLEE, { whoMayCall: 'nobody' }, {
			storage: null, caches: null, postToWorker: () => undefined, dispatch: () => undefined
		});
		const blockedInstallation = new CallStore();
		bind(blockedInstallation, CALLEE);
		await settle();
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		await settle(10);
		expect(blockedInstallation.phase).toBe('idle');
		expect(blockedInstallation.session).toBeNull();
		expect(harness.audio.startIncoming).not.toHaveBeenCalled();
		expect(harness.supabase!.rpcCalls.filter(({ name }) => name === 'respond_to_call')).toHaveLength(0);
		blockedInstallation.bindUser(null);

		// A separate physical installation has its own preference/ignored-call
		// storage. Model that boundary by clearing only the local test registry.
		clearLocallyIgnoredCalls(CALLEE, null);
		await saveCallPreferences(CALLEE, { whoMayCall: 'direct-chats' }, {
			storage: null, caches: null, postToWorker: () => undefined, dispatch: () => undefined
		});
		const allowedInstallation = new CallStore();
		bind(allowedInstallation, CALLEE);
		await settle();
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		await eventually(() => expect(allowedInstallation.phase).toBe('incoming'));
		expect(harness.audio.startIncoming).toHaveBeenCalledTimes(1);
		expect(harness.supabase!.rpcCalls.filter(({ name }) => name === 'respond_to_call')).toHaveLength(0);
		allowedInstallation.bindUser(null);
	});

	it('fails relay-only explicitly without TURN and uses relay policy only with validated TURN', async () => {
		await saveCallPreferences(CALLEE, { relayOnly: true }, {
			storage: null, caches: null, postToWorker: () => undefined, dispatch: () => undefined
		});
		const unavailable = new CallStore();
		bind(unavailable, CALLEE);
		await settle();
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		const firstMedia = streamStub();
		harness.acquireLocalMedia.mockResolvedValueOnce(firstMedia.stream);
		harness.rpcHandlers.set('respond_to_call', (args) => ({
			data: callRow({
				status: 'accepted',
				callee_device: args.p_device,
				callee_heartbeat_at: new Date().toISOString(),
				callee_lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
				answered_at: new Date().toISOString()
			}),
			error: null
		}));
		await unavailable.accept();
		await eventually(() => expect(unavailable.phase).toBe('error'));
		expect(unavailable.error).toBe('call_relay_required_unavailable');
		expect(unavailable.relayAvailable).toBeNull();
		expect(unavailable.relayOnlyActive).toBe(false);
		expect(harness.peerOptions).toHaveLength(0);
		unavailable.bindUser(null);

		harness.supabase = new FakeSupabase();
		harness.fetchIceConfiguration.mockResolvedValue({
			iceServers: [{ urls: ['turn:relay.example.test:3478'], username: 'user', credential: 'secret' }],
			relayAvailable: true,
			source: 'static'
		});
		harness.rpcHandlers.set('upsert_account_installation', () => ({ data: true, error: null }));
		harness.rpcHandlers.set('heartbeat_account_installation', () => ({ data: true, error: null }));
		harness.rpcHandlers.set('reap_stale_calls', () => ({ data: true, error: null }));
		harness.rpcHandlers.set('ack_call_delivery', () => ({ data: true, error: null }));
		harness.rpcHandlers.set('respond_to_call', (args) => ({
			data: callRow({
				status: 'accepted',
				callee_device: args.p_device,
				callee_heartbeat_at: new Date().toISOString(),
				callee_lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
				answered_at: new Date().toISOString()
			}),
			error: null
		}));
		const relayed = new CallStore();
		bind(relayed, CALLEE);
		await settle();
		harness.supabase.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		harness.acquireLocalMedia.mockResolvedValueOnce(streamStub().stream);
		await relayed.accept();
		await eventually(() => expect(harness.peerOptions).toHaveLength(1));
		expect(harness.peerOptions[0].iceTransportPolicy).toBe('relay');
		expect(relayed.relayAvailable).toBe(true);
		expect(relayed.relayOnlyActive).toBe(true);
		relayed.bindUser(null);
	});

	it('replaces account preferences synchronously on switch and clears them on logout', async () => {
		await saveCallPreferences(CALLEE, { ringtone: 'pulse', relayOnly: true }, {
			storage: null, caches: null, postToWorker: () => undefined, dispatch: () => undefined
		});
		const store = new CallStore();
		bind(store, CALLEE);
		await settle();
		expect(store.callPreferences).toMatchObject({ accountId: CALLEE, ringtone: 'pulse', relayOnly: true });
		bind(store, CALLER);
		expect(store.callPreferences).toMatchObject({ accountId: CALLER, ringtone: 'classic', relayOnly: false });
		store.bindUser(null);
		expect(store.callPreferences).toBeNull();
	});

	it('shows the caller immediately, keeps delivery wording factual, and cancels cleanly', async () => {
		const store = new CallStore();
		bind(store, CALLER);
		await settle();
		const media = new Deferred<MediaStream>();
		const started = new Deferred<CallSession>();
		const local = streamStub();
		let callerDevice = '';
		harness.acquireLocalMedia.mockReturnValueOnce(media.promise);
		harness.startCallReliably.mockImplementation((args) => {
			callerDevice = String(args.device);
			return started.promise;
		});
		harness.rpcHandlers.set('end_call', () => ({
			data: callRow({ caller_device: callerDevice, status: 'cancelled', ended_at: new Date().toISOString() }),
			error: null
		}));

		const start = store.startCall(CONVERSATION, 'audio');
		expect(store.phase).toBe('preparing');
		expect(store.kind).toBe('audio');
		expect(harness.audio.primeFromGesture).toHaveBeenCalledTimes(1);

		media.resolve(local.stream);
		await eventually(() => expect(store.phase).toBe('creating'));
		started.resolve(parseCallSession(callRow({ caller_device: callerDevice }))!);
		await start;
		expect(store.phase).toBe('contacting');
		expect(store.direction).toBe('outgoing');
		expect(store.deliveryStage).toBe('queued');
		expect(harness.startCallReliably).toHaveBeenCalledWith(expect.objectContaining({
			conversationId: CONVERSATION,
			kind: 'audio',
			device: callerDevice
		}));
		expect(harness.startCallReliably.mock.calls[0][0].requestId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f-]{27}$/i
		);
		expect(harness.sendPushNotify).not.toHaveBeenCalled();

		await eventually(() => expect(harness.supabase?.latest(`call-progress:${CALL_ID}:`)).toBeTruthy());
		const progress = harness.supabase!.latest(`call-progress:${CALL_ID}:`);
		progress.emitPostgres('call_events', {
			call_id: CALL_ID,
			event_type: 'delivery.presented'
		});
		expect(store.deliveryStage).toBe('presented');
		expect(store.phase).toBe('contacting');
		progress.emitPostgres('call_events', {
			call_id: CALL_ID,
			event_type: 'delivery.ringing'
		});
		expect(store.deliveryStage).toBe('ringing');
		expect(store.phase).toBe('ringing');

		await store.end();
		expect(store.phase).toBe('ended');
		expect(store.outcome).toBe('cancelled');
		expect(harness.audio.stop).toHaveBeenCalled();
		store.bindUser(null);
	});

	it('surfaces denied media, does not create a ghost call, and retries the same call', async () => {
		const store = new CallStore();
		bind(store, CALLER);
		await settle();
		harness.acquireLocalMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
		await store.startCall(CONVERSATION, 'video');
		expect(store.phase).toBe('error');
		expect(store.error).toBe('media_denied');
		expect(harness.sendPushNotify).not.toHaveBeenCalled();

		const local = streamStub();
		harness.acquireLocalMedia.mockResolvedValueOnce(local.stream);
		harness.startCallReliably.mockImplementation((args) => Promise.resolve(
			parseCallSession(callRow({ caller_device: args.device, kind: 'video' }))!
		));
		store.retryLastStart();
		await eventually(() => expect(store.phase).toBe('contacting'));
		expect(store.kind).toBe('video');
		expect(harness.startCallReliably).toHaveBeenCalledTimes(1);
		expect(harness.sendPushNotify).not.toHaveBeenCalled();
		await store.end();
		store.bindUser(null);
	});

	it('reuses one semantic request after ambiguous start failure and rotates it after dismiss', async () => {
		const store = new CallStore();
		bind(store, CALLER);
		await settle();
		harness.acquireLocalMedia.mockImplementation(async () => streamStub().stream);
		harness.startCallReliably
			.mockRejectedValueOnce(new Error('call_start_unavailable'))
			.mockImplementation(async (args) => parseCallSession(callRow({ caller_device: args.device }))!);

		await store.startCall(CONVERSATION, 'audio');
		expect(store.phase).toBe('error');
		const firstRequestId = harness.startCallReliably.mock.calls[0][0].requestId;

		store.retryLastStart();
		await eventually(() => expect(store.phase).toBe('contacting'));
		expect(harness.startCallReliably.mock.calls[1][0].requestId).toBe(firstRequestId);

		await store.end();
		store.dismiss();
		await store.startCall(CONVERSATION, 'audio');
		expect(store.phase).toBe('contacting');
		expect(harness.startCallReliably.mock.calls[2][0].requestId).not.toBe(firstRequestId);
		await store.end();
		store.bindUser(null);
	});

	it('resumes accepted response-loss replays and finishes terminal replays factually', async () => {
		const acceptedStore = new CallStore();
		bind(acceptedStore, CALLER);
		await settle();
		harness.acquireLocalMedia.mockResolvedValueOnce(streamStub().stream);
		harness.startCallReliably.mockImplementationOnce(async (args) => parseCallSession(callRow({
			caller_device: args.device,
			status: 'accepted',
			callee_device: OTHER_DEVICE,
			callee_heartbeat_at: new Date().toISOString(),
			callee_lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
			answered_at: new Date().toISOString()
		}))!);

		await acceptedStore.startCall(CONVERSATION, 'audio');
		expect(acceptedStore.phase).toBe('connecting');
		expect(acceptedStore.session?.status).toBe('accepted');
		expect(acceptedStore.deliveryStage).toBe('ringing');
		expect(harness.sendPushNotify).not.toHaveBeenCalled();
		acceptedStore.bindUser(null);

		harness.supabase = new FakeSupabase();
		const terminalStore = new CallStore();
		bind(terminalStore, CALLER);
		await settle();
		harness.acquireLocalMedia.mockResolvedValueOnce(streamStub().stream);
		harness.startCallReliably.mockImplementationOnce(async (args) => parseCallSession(callRow({
			caller_device: args.device,
			status: 'cancelled',
			ended_at: new Date().toISOString()
		}))!);

		await terminalStore.startCall(CONVERSATION, 'audio');
		expect(terminalStore.phase).toBe('ended');
		expect(terminalStore.outcome).toBe('cancelled');
		expect(terminalStore.session?.status).toBe('cancelled');
		terminalStore.bindUser(null);
	});

	it('presents a foreground incoming call, ACKs real ringing, and declines it', async () => {
		const store = new CallStore();
		bind(store, CALLEE);
		await settle();
		const incoming = callRow();
		harness.rpcHandlers.set('respond_to_call', () => ({
			data: callRow({ status: 'declined', ended_at: new Date().toISOString() }),
			error: null
		}));

		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', incoming);
		expect(store.phase).toBe('incoming');
		expect(store.direction).toBe('incoming');
		expect(harness.audio.startIncoming).toHaveBeenCalledTimes(1);
		await eventually(() => expect(harness.supabase!.rpcCalls).toContainEqual({
			name: 'ack_call_delivery',
			args: expect.objectContaining({ p_call: CALL_ID, p_installation_id: INSTALLATION, p_stage: 'ringing' })
		}));
		await store.decline();
		expect(store.phase).toBe('ended');
		expect(store.outcome).toBe('declined');
		expect(harness.audio.mode).toBe('idle');
		store.bindUser(null);
	});

	it('leaves background attention to Web Push and transfers call UI when a tab becomes visible', async () => {
		(document as unknown as { visibilityState: string }).visibilityState = 'hidden';
		const store = new CallStore();
		bind(store, CALLEE);
		await settle();
		const incoming = callRow();
		harness.supabase!.tableRows.set('call_sessions', [incoming]);

		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', incoming);
		expect(store.phase).toBe('idle');
		expect(harness.audio.startIncoming).not.toHaveBeenCalled();
		expect(harness.supabase!.rpcCalls.filter(({ name }) => name === 'ack_call_delivery')).toHaveLength(0);

		const visibilityListener = (
			document.addEventListener as unknown as { mock: { calls: Array<[string, EventListener]> } }
		).mock.calls.find(([name]) => name === 'visibilitychange')?.[1];
		expect(visibilityListener).toBeTruthy();
		(document as unknown as { visibilityState: string }).visibilityState = 'visible';
		visibilityListener?.(new Event('visibilitychange'));
		await eventually(() => expect(store.phase).toBe('incoming'));
		expect(harness.audio.startIncoming).toHaveBeenCalledTimes(1);

		(document as unknown as { visibilityState: string }).visibilityState = 'hidden';
		visibilityListener?.(new Event('visibilitychange'));
		expect(store.phase).toBe('idle');
		expect(harness.audio.mode).toBe('idle');

		store.bindUser(null);
	});

	it('rings in one tab only, hands over on close, and cancels every waiter on terminal state', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-15T10:00:00Z'));
		const hub = new SharedCallBroadcastHub();
		vi.stubGlobal('BroadcastChannel', class {
			#port = new SharedCallBroadcastChannel(hub);
			get onmessage(): ((event: MessageEvent<unknown>) => void) | null { return this.#port.onmessage; }
			set onmessage(value: ((event: MessageEvent<unknown>) => void) | null) { this.#port.onmessage = value; }
			postMessage(data: unknown): void { this.#port.postMessage(data); }
			close(): void { this.#port.close(); }
		});

		const first = new CallStore();
		const second = new CallStore();
		bind(first, CALLEE);
		bind(second, CALLEE);
		await settle();
		const incoming = callRow();
		harness.supabase!.rows.set(CALL_ID, incoming);
		const globalChannels = harness.supabase!.channels.filter(({ topic }) => topic.startsWith('call_sessions:'));
		expect(globalChannels).toHaveLength(2);
		for (const channel of globalChannels) channel.emitPostgres('call_sessions', incoming);
		expect(first.phase).toBe('idle');
		expect(second.phase).toBe('idle');

		await vi.advanceTimersByTimeAsync(60);
		await settle();
		const stores = [first, second];
		const leader = stores.find(({ phase }) => phase === 'incoming');
		const follower = stores.find(({ phase }) => phase === 'idle');
		expect(leader).toBeTruthy();
		expect(follower).toBeTruthy();
		expect(harness.audio.startIncoming).toHaveBeenCalledTimes(1);
		await eventually(() => expect(
			harness.supabase!.rpcCalls.filter(({ name }) => name === 'ack_call_delivery')
		).toHaveLength(1));

		leader!.bindUser(null);
		await vi.advanceTimersByTimeAsync(60);
		await settle();
		expect(follower!.phase).toBe('incoming');
		expect(harness.audio.startIncoming).toHaveBeenCalledTimes(2);

		const terminal = callRow({ status: 'missed', ended_at: new Date().toISOString() });
		harness.supabase!.rows.set(CALL_ID, terminal);
		for (const channel of globalChannels) channel.emitPostgres('call_sessions', terminal);
		expect(follower!.phase).toBe('ended');
		const feedbackCount = harness.audio.startIncoming.mock.calls.length;
		await vi.advanceTimersByTimeAsync(2_000);
		expect(harness.audio.startIncoming).toHaveBeenCalledTimes(feedbackCount);
		expect(hub.channels.size).toBe(0);
		follower!.bindUser(null);
	});

	it('retries a truthful foreground ringing ACK as soon as the app comes back online', async () => {
		let attempts = 0;
		harness.rpcHandlers.set('ack_call_delivery', () => {
			attempts += 1;
			return attempts === 1
				? { data: null, error: new Error('temporary network failure') }
				: { data: true, error: null };
		});
		const store = new CallStore();
		bind(store, CALLEE);
		await settle();

		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		await eventually(() => expect(attempts).toBe(1));
		const onlineListener = (
			window.addEventListener as unknown as { mock: { calls: Array<[string, EventListener]> } }
		).mock.calls.find(([name]) => name === 'online')?.[1];
		expect(onlineListener).toBeTruthy();
		onlineListener?.(new Event('online'));

		await eventually(() => expect(attempts).toBe(2));
		const ackCalls = harness.supabase!.rpcCalls.filter(({ name }) => name === 'ack_call_delivery');
		expect(ackCalls).toHaveLength(2);
		expect(ackCalls.every(({ args }) => args.p_stage === 'ringing')).toBe(true);
		store.bindUser(null);
	});

	it('upgrades a pending presented ACK to ringing after a real gesture unlocks feedback', async () => {
		const stages: unknown[] = [];
		harness.audio.confirmIncomingFeedback
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true);
		harness.rpcHandlers.set('ack_call_delivery', (args) => {
			stages.push(args.p_stage);
			return args.p_stage === 'ringing'
				? { data: true, error: null }
				: { data: null, error: new Error('temporary network failure') };
		});
		const store = new CallStore();
		bind(store, CALLEE);
		await settle();

		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		await eventually(() => expect(stages).toEqual(['presented']));
		const gestureListener = (
			window.addEventListener as unknown as { mock: { calls: Array<[string, EventListener]> } }
		).mock.calls.find(([name]) => name === 'pointerdown')?.[1];
		expect(gestureListener).toBeTruthy();
		gestureListener?.(new Event('pointerdown'));

		await eventually(() => expect(stages).toEqual(['presented', 'ringing']));
		store.bindUser(null);
	});

	it('reconciles an initially missing installation again on online recovery', async () => {
		let registrationAttempts = 0;
		let registered = false;
		const stages: unknown[] = [];
		harness.rpcHandlers.set('upsert_account_installation', () => {
			registrationAttempts += 1;
			if (registrationAttempts < 3) {
				return { data: null, error: new Error('installation not persisted') };
			}
			registered = true;
			return { data: true, error: null };
		});
		harness.rpcHandlers.set('ack_call_delivery', (args) => {
			stages.push(args.p_stage);
			return registered
				? { data: true, error: null }
				: { data: null, error: new Error('installation missing') };
		});
		const store = new CallStore();
		bind(store, CALLEE);
		await settle();
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		await eventually(() => expect(registrationAttempts).toBe(2));

		const onlineListener = (
			window.addEventListener as unknown as { mock: { calls: Array<[string, EventListener]> } }
		).mock.calls.find(([name]) => name === 'online')?.[1];
		onlineListener?.(new Event('online'));

		await eventually(() => expect(stages).toHaveLength(3));
		expect(registrationAttempts).toBe(3);
		expect(stages).toEqual(['ringing', 'ringing', 'ringing']);
		store.bindUser(null);
	});

	it('cancels a pending ringing ACK when the call becomes terminal', async () => {
		vi.useFakeTimers();
		let attempts = 0;
		harness.rpcHandlers.set('ack_call_delivery', () => {
			attempts += 1;
			return { data: null, error: new Error('temporary network failure') };
		});
		const store = new CallStore();
		bind(store, CALLEE);
		await settle();

		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		await eventually(() => expect(attempts).toBe(1));
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow({
			status: 'declined',
			ended_at: new Date().toISOString()
		}));
		await vi.advanceTimersByTimeAsync(10_000);

		expect(attempts).toBe(1);
		expect(store.phase).toBe('idle');
		store.bindUser(null);
	});

	it('tombstones the call through the current worker before ready resolves', async () => {
		const ready = new Deferred<{ active: { postMessage: ReturnType<typeof vi.fn> }; getNotifications: () => Promise<never[]> }>();
		const controller = { postMessage: vi.fn() };
		Object.assign(navigator.serviceWorker, {
			controller,
			ready: ready.promise
		});
		const store = new CallStore();
		bind(store, CALLEE);
		await settle();
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		harness.rpcHandlers.set('respond_to_call', () => ({
			data: callRow({ status: 'declined', ended_at: new Date().toISOString() }),
			error: null
		}));

		await store.decline();
		expect(controller.postMessage).toHaveBeenCalledWith({
			type: 'presuntinho:call-terminal-local',
			callId: CALL_ID
		});
		ready.resolve({ active: controller, getNotifications: async () => [] });
		await settle();
		store.bindUser(null);
	});

	it('commits one idempotent quick reply after an incoming decline and reconciles response loss', async () => {
		const store = new CallStore();
		bind(store, CALLEE);
		await settle();
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		harness.rpcHandlers.set('respond_to_call', () => ({
			data: callRow({ status: 'declined', ended_at: new Date().toISOString() }),
			error: null
		}));
		await store.decline();
		expect(store.canSendCallFollowup).toBe(true);

		harness.supabase!.insertHandler = (table, value) => {
			harness.supabase!.tableRows.set(table, [{ id: 'followup-1', ...value }]);
			return { data: null, error: new Error('response lost after commit') };
		};
		await store.sendCallFollowup('call_back', 'Já te ligo');
		expect(store.followupStatus).toBe('sent');
		expect(harness.supabase!.insertCalls).toHaveLength(1);
		expect(harness.supabase!.insertCalls[0]).toEqual({
			table: 'chat_messages',
			value: expect.objectContaining({
				conversation_id: CONVERSATION,
				sender_id: CALLEE,
				kind: 'text',
				body: 'Já te ligo',
				client_id: expect.stringMatching(/^[0-9a-f-]{36}$/i)
			})
		});
		await store.sendCallFollowup('call_back', 'Já te ligo');
		expect(harness.supabase!.insertCalls).toHaveLength(1);
		await eventually(() => expect(harness.sendPushNotify).toHaveBeenCalledWith('message', expect.objectContaining({
			to: CALLER,
			body: 'Já te ligo',
			eventId: 'followup-1'
		})));
		store.bindUser(null);
	});

	it('reports a quick-reply failure truthfully and retries with the same client id', async () => {
		const store = new CallStore();
		bind(store, CALLEE);
		await settle();
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		harness.rpcHandlers.set('respond_to_call', () => ({
			data: callRow({ status: 'declined', ended_at: new Date().toISOString() }),
			error: null
		}));
		await store.decline();
		harness.supabase!.insertHandler = () => ({ data: null, error: new Error('offline') });

		await store.sendCallFollowup('cant_now', 'Agora não consigo');
		expect(store.followupStatus).toBe('failed');
		expect(harness.sendPushNotify).not.toHaveBeenCalledWith('message', expect.anything());
		const clientId = harness.supabase!.insertCalls[0].value.client_id;

		harness.supabase!.insertHandler = () => ({ data: { id: 'followup-2' }, error: null });
		await store.sendCallFollowup('cant_now', 'Agora não consigo');
		expect(store.followupStatus).toBe('sent');
		expect(harness.supabase!.insertCalls[1].value.client_id).toBe(clientId);
		store.bindUser(null);
	});

	it('accepts on one device, becomes active, and exposes reconnect recovery', async () => {
		const store = new CallStore();
		bind(store, CALLEE);
		await settle();
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		const local = streamStub();
		harness.acquireLocalMedia.mockResolvedValueOnce(local.stream);
		harness.rpcHandlers.set('respond_to_call', (args) => ({
			data: callRow({
				status: 'accepted',
				callee_device: args.p_device,
				callee_heartbeat_at: new Date().toISOString(),
				callee_lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
				answered_at: new Date().toISOString()
			}),
			error: null
		}));

		await store.accept();
		expect(store.phase).toBe('connecting');
		await eventually(() => expect(harness.peerOptions).toHaveLength(1));
		const peer = harness.peerOptions[0];
		peer.onConnected();
		expect(store.phase).toBe('active');
		expect(store.connectedAt).not.toBeNull();
		store.minimize();
		expect(store.minimized).toBe(true);
		peer.onReconnecting();
		expect(store.phase).toBe('reconnecting');
		expect(store.minimized).toBe(true);
		peer.onConnected();
		expect(store.phase).toBe('active');
		store.restore();
		expect(store.minimized).toBe(false);
		await store.end();
		expect(store.outcome).toBe('completed');
		expect(store.minimized).toBe(false);
		store.bindUser(null);
	});

	it('wires device switching, screen restore, quality, devicechange and cleanup to the live peer', async () => {
		harness.enumerateDevices.mockResolvedValue([
			mediaDevice('audioinput', 'mic-1', 'Built-in mic'),
			mediaDevice('audioinput', 'mic-2', 'USB mic'),
			mediaDevice('videoinput', 'cam-1', 'Front camera'),
			mediaDevice('videoinput', 'cam-2', 'Desk camera'),
			mediaDevice('audiooutput', 'speaker-1', 'Headphones')
		]);
		const local = streamStub('mic-1', 'cam-1');
		const nextMicrophone = new TestMediaTrack('audio', 'mic-2');
		const nextCamera = new TestMediaTrack('video', 'cam-2');
		const display = new TestMediaTrack('video');
		harness.mediaGetUserMedia
			.mockResolvedValueOnce(testStream(nextMicrophone))
			.mockResolvedValueOnce(testStream(nextCamera));
		harness.mediaGetDisplayMedia.mockResolvedValueOnce(testStream(display));
		harness.acquireLocalMedia.mockResolvedValueOnce(local.stream);
		harness.rpcHandlers.set('respond_to_call', (args) => ({
			data: callRow({
				kind: 'video',
				status: 'accepted',
				callee_device: args.p_device,
				callee_heartbeat_at: new Date().toISOString(),
				callee_lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
				answered_at: new Date().toISOString()
			}),
			error: null
		}));
		const store = new CallStore();
		bind(store, CALLEE);
		await settle();
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow({ kind: 'video' }));
		await store.accept();
		await eventually(() => expect(harness.peerOptions).toHaveLength(1));
		harness.peerOptions[0].onConnected();
		await eventually(() => expect(store.mediaDevices).toHaveLength(5));
		await eventually(() => expect(store.connectionQuality?.rating).toBe('unknown'));
		expect(store.phase).toBe('active');
		expect(store.screenShareSupported).toBe(true);
		expect(store.wakeLockState).toBe('unsupported');

		await store.selectMicrophone('mic-2');
		expect(store.selectedMicrophoneId).toBe('mic-2');
		expect(local.audioTrack.stop).toHaveBeenCalledOnce();
		await store.selectCamera('cam-2');
		expect(store.selectedCameraId).toBe('cam-2');
		expect(local.videoTrack.stop).toHaveBeenCalledOnce();

		const setSinkId = vi.fn(async () => undefined);
		await store.selectSpeaker({ setSinkId } as unknown as HTMLMediaElement, 'speaker-1');
		expect(setSinkId).toHaveBeenCalledWith('speaker-1');
		expect(store.selectedSpeakerId).toBe('speaker-1');

		await store.toggleScreenShare();
		expect(store.screenSharing).toBe(true);
		expect(local.stream.getVideoTracks()).toEqual([display]);
		await store.toggleScreenShare();
		expect(store.screenSharing).toBe(false);
		expect(local.stream.getVideoTracks()).toEqual([nextCamera]);

		harness.enumerateDevices.mockResolvedValue([
			mediaDevice('audioinput', 'mic-2', 'USB mic'),
			mediaDevice('videoinput', 'cam-2', 'Desk camera')
		]);
		const deviceChange = (
			navigator.mediaDevices.addEventListener as unknown as {
				mock: { calls: Array<[string, () => void]> };
			}
		).mock.calls.find(([name]) => name === 'devicechange')?.[1];
		deviceChange?.();
		await eventually(() => expect(store.mediaDevices).toHaveLength(2));
		expect(store.selectedSpeakerId).toBeNull();

		await store.end();
		expect(store.mediaDevices).toEqual([]);
		expect(store.connectionQuality).toBeNull();
		expect(store.screenSharing).toBe(false);
		expect(navigator.mediaDevices.removeEventListener).toHaveBeenCalledWith(
			'devicechange',
			expect.any(Function)
		);
		store.bindUser(null);
	});

	it('makes first-answer-wins visible as answered elsewhere and closes stale UI', async () => {
		const store = new CallStore();
		bind(store, CALLEE);
		await settle();
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		expect(store.phase).toBe('incoming');

		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow({
			status: 'accepted',
			callee_device: OTHER_DEVICE,
			callee_heartbeat_at: new Date().toISOString(),
			callee_lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
			answered_at: new Date().toISOString()
		}));
		expect(store.phase).toBe('ended');
		expect(store.outcome).toBe('answered_elsewhere');
		expect(harness.audio.mode).toBe('idle');
		store.bindUser(null);
	});

	it('reports busy and offline failures without claiming that a phone is ringing', async () => {
		const busyStore = new CallStore();
		bind(busyStore, CALLER);
		await settle();
		harness.acquireLocalMedia.mockResolvedValueOnce(streamStub().stream);
		harness.startCallReliably.mockRejectedValueOnce(new Error('peer already in a call'));
		await busyStore.startCall(CONVERSATION, 'audio');
		expect(busyStore.phase).toBe('error');
		expect(busyStore.error).toBe('call_peer_busy');
		expect(busyStore.outcome).toBe('busy');
		expect(busyStore.deliveryStage).toBeNull();
		busyStore.bindUser(null);

		Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
		const offlineStore = new CallStore();
		bind(offlineStore, CALLER);
		await offlineStore.startCall(CONVERSATION, 'audio');
		expect(offlineStore.phase).toBe('error');
		expect(offlineStore.error).toBe('call_offline');
		expect(harness.acquireLocalMedia).toHaveBeenCalledTimes(1);
		offlineStore.bindUser(null);
	});

	it('distinguishes a genuinely missed call from an unreachable device', async () => {
		const calleeStore = new CallStore();
		bind(calleeStore, CALLEE);
		await settle();
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow({
			status: 'missed',
			ended_at: new Date().toISOString()
		}));
		expect(calleeStore.phase).toBe('ended');
		expect(calleeStore.outcome).toBe('missed');
		calleeStore.bindUser(null);

		harness.supabase = new FakeSupabase();
		const callerStore = new CallStore();
		bind(callerStore, CALLER);
		await settle();
		harness.acquireLocalMedia.mockResolvedValueOnce(streamStub().stream);
		let callerDevice = '';
		harness.startCallReliably.mockImplementation((args) => {
			callerDevice = String(args.device);
			return Promise.resolve(parseCallSession(callRow({ caller_device: callerDevice }))!);
		});
		await callerStore.startCall(CONVERSATION, 'audio');
		await eventually(() => expect(harness.supabase?.latest(`call-progress:${CALL_ID}:`)).toBeTruthy());
		await settle();
		harness.supabase!.latest(`call-progress:${CALL_ID}:`).emitPostgres('call_events', {
			call_id: CALL_ID,
			event: 'push_no_devices',
			details: { channel: 'push', reason: 'no_push_devices' }
		});
		await eventually(() => expect(callerStore.deliveryStage).toBe('failed'));
		expect(callerStore.deliveryIssue).toBe('no_push_devices');
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow({
			caller_device: callerDevice,
			status: 'missed',
			ended_at: new Date().toISOString()
		}));
		expect(callerStore.phase).toBe('ended');
		expect(callerStore.outcome).toBe('unreachable');
		callerStore.bindUser(null);
	});

	it('does not let a late no-device event regress presented or ringing truth', async () => {
		const store = new CallStore();
		bind(store, CALLER);
		await settle();
		harness.acquireLocalMedia.mockResolvedValueOnce(streamStub().stream);
		harness.startCallReliably.mockImplementation((args) => Promise.resolve(parseCallSession(callRow({
			caller_device: String(args.device)
		}))!));
		await store.startCall(CONVERSATION, 'audio');
		await eventually(() => expect(
			harness.supabase!.channels.some(({ topic }) => topic.startsWith(`call-progress:${CALL_ID}:`))
		).toBe(true));
		const progress = harness.supabase!.latest(`call-progress:${CALL_ID}:`);

		progress.emitPostgres('call_events', { call_id: CALL_ID, event: 'delivery_presented' });
		expect(store.deliveryStage).toBe('presented');
		progress.emitPostgres('call_events', { call_id: CALL_ID, event: 'push_no_devices' });
		expect(store.deliveryStage).toBe('presented');
		expect(store.deliveryIssue).toBeNull();

		progress.emitPostgres('call_events', { call_id: CALL_ID, event: 'delivery_ringing' });
		expect(store.deliveryStage).toBe('ringing');
		progress.emitPostgres('call_events', { call_id: CALL_ID, event: 'push_no_devices' });
		expect(store.deliveryStage).toBe('ringing');
		expect(store.deliveryIssue).toBeNull();
		store.bindUser(null);
	});

	it('reconciles a no-device event created before the Realtime subscription', async () => {
		const store = new CallStore();
		bind(store, CALLER);
		await settle();
		harness.supabase!.tableRows.set('call_events', [{
			call_id: CALL_ID,
			event: 'push_no_devices',
			details: { channel: 'push', reason: 'no_push_devices' },
			created_at: new Date().toISOString()
		}]);
		harness.acquireLocalMedia.mockResolvedValueOnce(streamStub().stream);
		harness.startCallReliably.mockImplementation((args) => Promise.resolve(parseCallSession(callRow({
			caller_device: String(args.device)
		}))!));

		await store.startCall(CONVERSATION, 'audio');
		await eventually(() => expect(store.deliveryIssue).toBe('no_push_devices'));
		expect(store.deliveryStage).toBe('failed');
		store.bindUser(null);
	});

	it('degrades explicitly when Realtime drops instead of silently freezing', async () => {
		const store = new CallStore();
		bind(store, CALLER);
		await settle();
		expect(store.readiness).toBe('ready');
		expect(store.realtimeHealth).toBe('online');
		const globalChannel = harness.supabase!.latest('call_sessions:');
		globalChannel.emitStatus('CHANNEL_ERROR', new Error('network lost'));
		expect(store.readiness).toBe('connecting');
		expect(store.realtimeHealth).toBe('degraded');
		store.bindUser(null);
	});
});

const HANDOFF_ID = '77777777-7777-4777-8777-777777777777';
const HANDOFF_RECOVERY_ID = '76767676-7676-4676-8676-767676767676';
const HANDOFF_REQUEST_ID = '88888888-8888-4888-8888-888888888888';
const TARGET_INSTALLATION = '99999999-9999-4999-8999-999999999999';
const TARGET_DEVICE = `${TARGET_INSTALLATION}.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
const PEER_DEVICE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function acceptedCallRow(ownerDevice: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
	const now = new Date().toISOString();
	return callRow({
		caller_device: ownerDevice,
		callee_device: PEER_DEVICE,
		status: 'accepted',
		callee_heartbeat_at: now,
		callee_lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
		answered_at: now,
		...overrides
	});
}

function handoffRow(
	fromDevice: string,
	status: 'requested' | 'claimed' | 'completed' | 'cancelled' | 'declined' | 'expired' | 'reverted' | 'terminated' = 'requested',
	overrides: Record<string, unknown> = {}
): Record<string, unknown> {
	const now = new Date().toISOString();
	const claimed = ['claimed', 'completed', 'reverted', 'terminated'].includes(status);
	const closed = ['cancelled', 'declined', 'expired', 'reverted', 'terminated'].includes(status);
	return {
		id: HANDOFF_ID,
		call_id: CALL_ID,
		account: CALLER,
		from_device: fromDevice,
		from_installation_id: status === 'requested' && fromDevice.startsWith('source-')
			? 'source-installation-0001'
			: INSTALLATION,
		target_installation_id: status === 'requested' && fromDevice.startsWith('source-')
			? INSTALLATION
			: TARGET_INSTALLATION,
		claimed_device: claimed ? TARGET_DEVICE : null,
		status,
		client_request_id: HANDOFF_REQUEST_ID,
		source_generation: 0,
		claimed_generation: claimed ? 1 : null,
		state_version: status === 'requested' ? 0 : status === 'claimed' ? 1 : 2,
		created_at: now,
		updated_at: now,
		expires_at: new Date(Date.now() + 35_000).toISOString(),
		recovery_expires_at: claimed ? new Date(Date.now() + 45_000).toISOString() : null,
		claim_device_lease_expires_at: claimed ? new Date(Date.now() + 12_000).toISOString() : null,
		claimed_at: claimed ? now : null,
		completed_at: status === 'completed' ? now : null,
		cancelled_at: closed ? now : null,
		...overrides
	};
}

async function connectCallerStore(): Promise<{ store: CallStore; device: string; channel: FakeChannel }> {
	const store = new CallStore();
	bind(store, CALLER);
	await settle();
	const local = streamStub();
	let device = '';
	harness.acquireLocalMedia.mockResolvedValueOnce(local.stream);
	harness.startCallReliably.mockImplementationOnce(async (args) => {
		device = String(args.device);
		return parseCallSession(callRow({ caller_device: device }))!;
	});
	await store.startCall(CONVERSATION, 'audio');
	const channel = harness.supabase!.latest('call_sessions:');
	channel.emitPostgres('call_sessions', acceptedCallRow(device));
	await eventually(() => expect(harness.peerOptions.length).toBeGreaterThan(0));
	const options = harness.peerOptions.at(-1)!;
	options.onConnected();
	expect(store.phase).toBe('active');
	return { store, device, channel };
}

function sharedCacheHarness() {
	const values = new Map<string, Response>();
	const put = vi.fn(async (key: RequestInfo | URL, response: Response) => {
		values.set(String(key), response.clone());
	});
	const match = vi.fn(async (key: RequestInfo | URL) => values.get(String(key))?.clone() ?? null);
	const remove = vi.fn(async (key: RequestInfo | URL) => values.delete(String(key)));
	return {
		storage: { open: vi.fn(async () => ({ put, match, delete: remove })) },
		put,
		match,
		remove,
		values
	};
}

async function prepareHandoffTarget(kind: 'audio' | 'video' = 'audio') {
	const store = new CallStore();
	bind(store, CALLER);
	await settle();
	const sourceDevice = 'source-installation-0001.source-tab-00000001';
	const global = harness.supabase!.latest('call_sessions:');
	global.emitPostgres('call_handoffs', handoffRow(sourceDevice, 'requested'));
	expect(store.handoffOffer?.id).toBe(HANDOFF_ID);
	harness.supabase!.rows.set(CALL_ID, acceptedCallRow(sourceDevice, { kind }));
	const local = streamStub();
	harness.acquireLocalMedia.mockResolvedValueOnce(local.stream);
	return { store, sourceDevice, global, local };
}

describe('CallStore active-call handoff', () => {
	it('recovers an authoritative claim when the RPC response is lost after commit', async () => {
		const store = new CallStore();
		bind(store, CALLER);
		await settle();
		const sourceDevice = 'source-installation-0001.source-tab-00000001';
		const requested = handoffRow(sourceDevice, 'requested');
		const global = harness.supabase!.latest('call_sessions:');
		global.emitPostgres('call_handoffs', requested);
		expect(store.handoffOffer?.id).toBe(HANDOFF_ID);

		harness.supabase!.rows.set(CALL_ID, acceptedCallRow(sourceDevice, { kind: 'video' }));
		const local = streamStub();
		harness.acquireLocalMedia.mockResolvedValueOnce(local.stream);
		let claimedDevice = '';
		harness.rpcHandlers.set('claim_call_handoff', (args) => {
			claimedDevice = String(args.p_device);
			harness.supabase!.rows.set(CALL_ID, acceptedCallRow(claimedDevice, {
				handoff_generation: 1,
				kind: 'video'
			}));
			return { data: null, error: new Error('response lost after commit') };
		});
		harness.rpcHandlers.set('complete_call_handoff', () => ({ data: true, error: null }));

		await store.acceptHandoffOffer();

		expect(claimedDevice).toContain(`${INSTALLATION}.`);
		expect(store.phase).toBe('connecting');
		expect(store.session?.handoffGeneration).toBe(1);
		expect(store.localStream).toEqual(local.stream);
		expect(local.audioTrack.enabled).toBe(false);
		expect(local.videoTrack.enabled).toBe(false);
		expect(store.muted).toBe(true);
		expect(store.cameraOff).toBe(true);
		expect(harness.fetchIceConfiguration).toHaveBeenCalledWith(expect.objectContaining({
			callId: CALL_ID,
			handoffId: HANDOFF_ID,
			handoffRecoveryId: expect.any(String)
		}));
		expect(harness.stopMediaStream).not.toHaveBeenCalledWith(local.stream);
		await eventually(() => expect(harness.peerOptions.length).toBeGreaterThan(0));
		harness.peerOptions.at(-1)!.onConnected();
		await eventually(() => expect(
			harness.supabase!.rpcCalls.some(({ name }) => name === 'complete_call_handoff')
		).toBe(true));
		store.bindUser(null);
	});

	it('adopts the authoritative claim even when claimed Realtime clears the offer before the RPC resolves', async () => {
		const store = new CallStore();
		bind(store, CALLER);
		await settle();
		const sourceDevice = 'source-installation-0001.source-tab-00000001';
		const requested = handoffRow(sourceDevice, 'requested');
		const global = harness.supabase!.latest('call_sessions:');
		global.emitPostgres('call_handoffs', requested);
		expect(store.handoffOffer?.id).toBe(HANDOFF_ID);

		const pendingCall = acceptedCallRow(sourceDevice);
		harness.supabase!.rows.set(CALL_ID, pendingCall);
		const local = streamStub();
		harness.acquireLocalMedia.mockResolvedValueOnce(local.stream);
		const claim = new Deferred<RpcResult>();
		let claimedDevice = '';
		harness.rpcHandlers.set('claim_call_handoff', (args) => {
			claimedDevice = String(args.p_device);
			return claim.promise;
		});
		harness.rpcHandlers.set('complete_call_handoff', () => ({ data: true, error: null }));

		const accepting = store.acceptHandoffOffer();
		await eventually(() => expect(claimedDevice).toContain(`${INSTALLATION}.`));
		global.emitPostgres('call_handoffs', handoffRow(sourceDevice, 'claimed', {
			from_installation_id: 'source-installation-0001',
			target_installation_id: INSTALLATION,
			claimed_device: claimedDevice
		}));
		expect(store.handoffOffer).toBeNull();
		claim.resolve({
			data: {
				ok: true,
				handoffId: HANDOFF_ID,
				call: acceptedCallRow(claimedDevice, { handoff_generation: 1 })
			},
			error: null
		});
		await accepting;

		expect(store.phase).toBe('connecting');
		expect(store.session?.id).toBe(CALL_ID);
		expect(store.localStream).toEqual(local.stream);
		expect(local.audioTrack.enabled).toBe(false);
		expect(harness.stopMediaStream).not.toHaveBeenCalledWith(local.stream);
		await eventually(() => expect(harness.peerOptions.length).toBeGreaterThan(0));
		harness.peerOptions.at(-1)!.onConnected();
		await eventually(() => expect(
			harness.supabase!.rpcCalls.some(({ name, args }) =>
				name === 'complete_call_handoff' && args.p_handoff === HANDOFF_ID
			)
		).toBe(true));
		expect(store.phase).toBe('active');
		store.bindUser(null);
	});

	it.each(['handoff-first', 'call-first'] as const)(
		'keeps source media through claim and exits only after connected completion when events arrive %s',
		async (order) => {
			const { store, device, channel } = await connectCallerStore();
			const claimed = handoffRow(device, 'claimed');
			// Generation 2 models an unrelated later participant handoff overtaking
			// this row. completed(v2 for this handoff) must remain absorbing by id.
			const moved = acceptedCallRow(TARGET_DEVICE, { handoff_generation: 2 });
			if (order === 'handoff-first') {
				channel.emitPostgres('call_handoffs', claimed);
				expect(store.phase).toBe('active');
				channel.emitPostgres('call_sessions', moved);
			} else {
				channel.emitPostgres('call_sessions', moved);
				expect(store.phase).toBe('reconnecting');
				channel.emitPostgres('call_handoffs', claimed);
			}
			expect(store.phase).toBe('reconnecting');
			expect(store.outcome).toBeNull();
			expect(store.localStream).not.toBeNull();
			channel.emitPostgres('call_handoffs', handoffRow(device, 'completed', {
				claimed_generation: 1,
				state_version: 2
			}));
			expect(store.phase).toBe('ended');
			expect(store.outcome).toBe('transferred');
			expect(harness.supabase!.rpcCalls.some(({ name }) => name === 'end_call')).toBe(false);
			store.bindUser(null);
		}
	);

	it('preflights relay-only ICE before claim and leaves ownership on the source when TURN is unavailable', async () => {
		await saveCallPreferences(CALLER, { relayOnly: true }, {
			storage: null, caches: null, postToWorker: () => undefined, dispatch: () => undefined
		});
		const { store, local } = await prepareHandoffTarget('video');

		await store.acceptHandoffOffer();

		expect(store.phase).toBe('idle');
		expect(store.handoffError).toBe('call_relay_required_unavailable');
		expect(harness.fetchIceConfiguration).toHaveBeenCalledWith(expect.objectContaining({
			handoffId: HANDOFF_ID,
			handoffRecoveryId: expect.any(String)
		}));
		expect(harness.supabase!.rpcCalls.some(({ name }) => name === 'claim_call_handoff')).toBe(false);
		expect(harness.stopMediaStream).toHaveBeenCalledWith(local.stream);
		store.bindUser(null);
	});

	it('does not regress claimed state when a delayed requested RPC response arrives', async () => {
		const { store, device, channel } = await connectCallerStore();
		store.handoffTargets = [{
			installationId: TARGET_INSTALLATION,
			platform: 'android',
			lastSeenAt: new Date().toISOString(),
			supportsVideo: true
		}];
		const requested = handoffRow(device, 'requested');
		const response = new Deferred<RpcResult>();
		harness.rpcHandlers.set('request_call_handoff', () => response.promise);

		const requesting = store.requestHandoff(TARGET_INSTALLATION);
		await eventually(() => expect(
			harness.supabase!.rpcCalls.some(({ name }) => name === 'request_call_handoff')
		).toBe(true));
		channel.emitPostgres('call_handoffs', handoffRow(device, 'claimed', {
			updated_at: new Date(Date.now() + 1_000).toISOString()
		}));
		expect(store.handoffOutgoing?.status).toBe('claimed');
		response.resolve({ data: requested, error: null });
		await requesting;

		expect(store.handoffOutgoing?.status).toBe('claimed');
		store.bindUser(null);
	});

	it('aborts a committed claim if account context changes while the RPC response is in flight', async () => {
		const { store } = await prepareHandoffTarget();
		const claim = new Deferred<RpcResult>();
		let claimedDevice = '';
		harness.rpcHandlers.set('claim_call_handoff', (args) => {
			claimedDevice = String(args.p_device);
			return claim.promise;
		});
		harness.rpcHandlers.set('abort_call_handoff', () => ({ data: true, error: null }));

		const accepting = store.acceptHandoffOffer();
		await eventually(() => expect(claimedDevice).toContain(`${INSTALLATION}.`));
		expect(store.busy).toBe(true);
		store.bindUser(null);
		claim.resolve({
			data: {
				ok: true,
				handoffId: HANDOFF_ID,
				call: acceptedCallRow(claimedDevice, { handoff_generation: 1 })
			},
			error: null
		});
		await accepting;

		expect(harness.supabase!.rpcCalls).toContainEqual({
			name: 'abort_call_handoff',
			args: expect.objectContaining({
				p_handoff: HANDOFF_ID,
				p_device: claimedDevice,
				p_recovery_id: expect.any(String)
			})
		});
	});

	it('retries a lost completion ACK from the next successful heartbeat', async () => {
		vi.useFakeTimers();
		const { store } = await prepareHandoffTarget();
		let claimedDevice = '';
		harness.rpcHandlers.set('claim_call_handoff', (args) => {
			claimedDevice = String(args.p_device);
			return {
				data: {
					ok: true,
					handoffId: HANDOFF_ID,
					call: acceptedCallRow(claimedDevice, { handoff_generation: 1 })
				},
				error: null
			};
		});
		let completionAttempts = 0;
		harness.rpcHandlers.set('complete_call_handoff', () => {
			completionAttempts += 1;
			return completionAttempts <= 3
				? { data: null, error: new Error('temporary completion outage') }
				: { data: true, error: null };
		});
		harness.rpcHandlers.set('heartbeat_call', () => ({
			data: acceptedCallRow(claimedDevice, {
				handoff_generation: 1,
				updated_at: new Date(Date.now()).toISOString()
			}),
			error: null
		}));

		await store.acceptHandoffOffer();
		await eventually(() => expect(harness.peerOptions.length).toBeGreaterThan(0));
		harness.peerOptions.at(-1)!.onConnected();
		await vi.advanceTimersByTimeAsync(800);
		expect(completionAttempts).toBe(3);
		await vi.advanceTimersByTimeAsync(20_100);
		await eventually(() => expect(completionAttempts).toBe(4));
		store.bindUser(null);
	});

	it('clears the shared recovery bearer when a terminal handoff row is observed after a lost RPC response', async () => {
		const cache = sharedCacheHarness();
		vi.stubGlobal('caches', cache.storage);
		const { store, sourceDevice, global } = await prepareHandoffTarget();
		let claimedDevice = '';
		harness.rpcHandlers.set('claim_call_handoff', (args) => {
			claimedDevice = String(args.p_device);
			return {
				data: {
					ok: true,
					handoffId: HANDOFF_ID,
					call: acceptedCallRow(claimedDevice, { handoff_generation: 1 })
				},
				error: null
			};
		});
		await store.acceptHandoffOffer();
		expect(cache.put).toHaveBeenCalled();

		global.emitPostgres('call_handoffs', handoffRow(sourceDevice, 'terminated', {
			from_installation_id: 'source-installation-0001',
			target_installation_id: INSTALLATION,
			claimed_device: claimedDevice,
			state_version: 2
		}));
		await eventually(() => expect(cache.remove).toHaveBeenCalled());
		store.bindUser(null);
	});

	it('fences presence by handoff generation and re-offers after an exact-generation rebuild', async () => {
		const { store, device, channel } = await connectCallerStore();
		const firstCallChannel = harness.supabase!.latest(`call:${CALL_ID}`);
		const firstPeer = harness.peerInstances.at(-1)!;
		firstCallChannel.presence = {
			remote: [{ account: CALLEE, device: PEER_DEVICE, handoffGeneration: 1 }]
		};
		firstCallChannel.emitPresence();
		expect(firstPeer.startOffer).not.toHaveBeenCalled();
		firstCallChannel.presence.remote[0].handoffGeneration = 0;
		firstCallChannel.emitPresence();
		await eventually(() => expect(firstPeer.startOffer).toHaveBeenCalledTimes(1));

		channel.emitPostgres('call_sessions', acceptedCallRow(device, {
			handoff_generation: 1,
			updated_at: new Date(Date.now() + 1_000).toISOString()
		}));
		await eventually(() => expect(harness.peerInstances.length).toBeGreaterThan(1));
		const rebuiltChannel = harness.supabase!.latest(`call:${CALL_ID}`);
		const rebuiltPeer = harness.peerInstances.at(-1)!;
		rebuiltChannel.presence = {
			remote: [{ account: CALLEE, device: PEER_DEVICE, handoffGeneration: 0 }]
		};
		rebuiltChannel.emitPresence();
		expect(rebuiltPeer.startOffer).not.toHaveBeenCalled();
		rebuiltChannel.presence.remote[0].handoffGeneration = 1;
		rebuiltChannel.emitPresence();
		await eventually(() => expect(rebuiltPeer.startOffer).toHaveBeenCalledTimes(1));
		store.bindUser(null);
	});

	it('retries a vanished first offer in the same presence and generation until an answer arrives', async () => {
		vi.useFakeTimers();
		const store = new CallStore();
		bind(store, CALLER);
		await settle();
		const local = streamStub();
		let device = '';
		harness.acquireLocalMedia.mockResolvedValueOnce(local.stream);
		harness.startCallReliably.mockImplementationOnce(async (args) => {
			device = String(args.device);
			return parseCallSession(callRow({ caller_device: device }))!;
		});
		await store.startCall(CONVERSATION, 'audio');
		const global = harness.supabase!.latest('call_sessions:');
		global.emitPostgres('call_sessions', acceptedCallRow(device));
		await eventually(() => expect(harness.peerInstances.length).toBeGreaterThan(0));
		const callChannel = harness.supabase!.latest(`call:${CALL_ID}`);
		const peer = harness.peerInstances.at(-1)!;
		callChannel.presence = {
			remote: [{ account: CALLEE, device: PEER_DEVICE, handoffGeneration: 0 }]
		};
		callChannel.emitPresence();
		await eventually(() => expect(peer.startOffer).toHaveBeenCalledTimes(1));

		// The first server ACK did not mean the remote received the broadcast.
		await vi.advanceTimersByTimeAsync(1_500);
		await eventually(() => expect(peer.startOffer).toHaveBeenCalledTimes(2));
		expect(peer.startOffer.mock.calls[1]).toEqual([true]);
		peer.receive.mockRejectedValueOnce(new Error('stale answer'));
		callChannel.emitBroadcast('signal', {
			v: 1,
			callId: CALL_ID,
			from: CALLEE,
			device: PEER_DEVICE,
			handoffGeneration: 0,
			seq: 1,
			signal: { type: 'answer', sdp: { type: 'answer', sdp: 'v=0' } }
		});
		await settle(10);
		await vi.advanceTimersByTimeAsync(3_000);
		await eventually(() => expect(peer.startOffer).toHaveBeenCalledTimes(3));
		callChannel.emitBroadcast('signal', {
			v: 1,
			callId: CALL_ID,
			from: CALLEE,
			device: PEER_DEVICE,
			handoffGeneration: 0,
			seq: 2,
			signal: { type: 'answer', sdp: { type: 'answer', sdp: 'v=0' } }
		});
		await eventually(() => expect(peer.receive).toHaveBeenCalledTimes(2));
		harness.peerOptions.at(-1)!.onConnected();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(peer.startOffer).toHaveBeenCalledTimes(3);
		expect(store.phase).toBe('active');
		store.bindUser(null);
	});

	it('ignores a regressive heartbeat snapshot after a higher handoff generation is active', async () => {
		vi.useFakeTimers();
		const { store, device, channel } = await connectCallerStore();
		channel.emitPostgres('call_sessions', acceptedCallRow(device, {
			handoff_generation: 1,
			updated_at: new Date(Date.now() + 1_000).toISOString()
		}));
		await settle(10);
		harness.rpcHandlers.set('heartbeat_call', () => ({
			data: acceptedCallRow(device, {
				handoff_generation: 0,
				updated_at: new Date(Date.now() + 60_000).toISOString()
			}),
			error: null
		}));
		await vi.advanceTimersByTimeAsync(20_100);
		expect(store.session?.handoffGeneration).toBe(1);
		store.bindUser(null);
	});

	it('reconciles a terminal outgoing handoff even when its Realtime event was lost', async () => {
		vi.useFakeTimers();
		const { store, device, channel } = await connectCallerStore();
		channel.emitPostgres('call_handoffs', handoffRow(device, 'requested'));
		expect(store.handoffOutgoing?.status).toBe('requested');
		harness.supabase!.tableRows.set('call_handoffs', [handoffRow(device, 'completed')]);

		await vi.advanceTimersByTimeAsync(600);
		await eventually(() => expect(store.phase).toBe('ended'));
		expect(store.outcome).toBe('transferred');
		store.bindUser(null);
	});

	it('lets a recovered sibling suffix take over without deleting its shared bearer', async () => {
		const cache = sharedCacheHarness();
		vi.stubGlobal('caches', cache.storage);
		const { store, sourceDevice, global } = await prepareHandoffTarget();
		let firstTargetDevice = '';
		harness.rpcHandlers.set('claim_call_handoff', (args) => {
			firstTargetDevice = String(args.p_device);
			return {
				data: {
					ok: true,
					handoffId: HANDOFF_ID,
					call: acceptedCallRow(firstTargetDevice, { handoff_generation: 1 })
				},
				error: null
			};
		});
		await store.acceptHandoffOffer();
		await eventually(() => expect(harness.peerOptions.length).toBeGreaterThan(0));
		harness.peerOptions.at(-1)!.onDisconnected();
		expect(store.phase).toBe('connecting');
		expect(cache.remove).not.toHaveBeenCalled();
		const siblingDevice = `${INSTALLATION}.dddddddd-dddd-4ddd-8ddd-dddddddddddd`;
		global.emitPostgres('call_sessions', acceptedCallRow(siblingDevice, {
			handoff_generation: 2,
			updated_at: new Date(Date.now() + 1_000).toISOString()
		}));

		expect(store.phase).toBe('ended');
		expect(store.outcome).toBe('transferred');
		expect(cache.remove).not.toHaveBeenCalled();
		expect(harness.supabase!.rpcCalls.some(({ name }) => name === 'end_call')).toBe(false);
		global.emitPostgres('call_handoffs', handoffRow(sourceDevice, 'completed', {
			from_installation_id: 'source-installation-0001',
			target_installation_id: INSTALLATION,
			claimed_device: siblingDevice,
			claimed_generation: 2,
			state_version: 3
		}));
		await eventually(() => expect(cache.remove).toHaveBeenCalled());
		store.bindUser(null);
	});

	it('recovers after reload by reading the installation bearer and waiting for the old suffix lease', async () => {
		vi.useFakeTimers();
		const cache = sharedCacheHarness();
		vi.stubGlobal('caches', cache.storage);
		const recoveryToken = 'abababab-abab-4bab-8bab-abababababab';
		const cacheUrl = new URL(
			`/__presuntinho_call_handoff_recovery__/${INSTALLATION}/${HANDOFF_RECOVERY_ID}`,
			'https://presuntinho.invalid'
		).toString();
		cache.values.set(cacheUrl, new Response(JSON.stringify({
			handoffId: HANDOFF_RECOVERY_ID,
			installationId: INSTALLATION,
			token: recoveryToken
		}), { headers: { 'content-type': 'application/json' } }));
		const oldSuffix = `${INSTALLATION}.eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`;
		const claimed = handoffRow('source-installation-0001.source-tab-00000001', 'claimed', {
			id: HANDOFF_RECOVERY_ID,
			from_installation_id: 'source-installation-0001',
			target_installation_id: INSTALLATION,
			claimed_device: oldSuffix,
			claimed_at: new Date(Date.now() - 20_000).toISOString(),
			claim_device_lease_expires_at: new Date(Date.now() - 1_000).toISOString(),
			recovery_expires_at: new Date(Date.now() + 30_000).toISOString()
		});
		harness.supabase!.tableRows.set('call_handoffs', [claimed]);
		harness.supabase!.rows.set(CALL_ID, acceptedCallRow(oldSuffix, { handoff_generation: 1 }));
		const store = new CallStore();
		bind(store, CALLER);
		await settle();
		const global = harness.supabase!.latest('call_sessions:');
		global.emitPostgres('call_handoffs', claimed);
		expect(store.handoffOffer).toBeNull();
		await vi.advanceTimersByTimeAsync(50);
		await eventually(() => expect(store.handoffOffer?.id).toBe(HANDOFF_RECOVERY_ID));
		const local = streamStub();
		harness.acquireLocalMedia.mockResolvedValueOnce(local.stream);
		let recoveredDevice = '';
		harness.rpcHandlers.set('claim_call_handoff', (args) => {
			recoveredDevice = String(args.p_device);
			expect(args.p_recovery_id).toBe(recoveryToken);
			return {
				data: {
					ok: true,
					handoffId: HANDOFF_RECOVERY_ID,
					call: acceptedCallRow(recoveredDevice, { handoff_generation: 2 })
				},
				error: null
			};
		});
		harness.rpcHandlers.set('abort_call_handoff', () => ({ data: true, error: null }));

		await store.acceptHandoffOffer();
		expect(recoveredDevice).toContain(`${INSTALLATION}.`);
		expect(recoveredDevice).not.toBe(oldSuffix);
		expect(store.session?.handoffGeneration).toBe(2);
		expect(harness.fetchIceConfiguration).toHaveBeenCalledWith(expect.objectContaining({
			handoffId: HANDOFF_RECOVERY_ID,
			handoffRecoveryId: recoveryToken
		}));
		store.bindUser(null);
	});

	it('keeps the original source call alive when backend recovery reverts ownership', async () => {
		const { store, device, channel } = await connectCallerStore();
		channel.emitPostgres('call_handoffs', handoffRow(device, 'claimed'));
		channel.emitPostgres('call_sessions', acceptedCallRow(TARGET_DEVICE, { handoff_generation: 1 }));
		expect(store.phase).toBe('reconnecting');
		channel.emitPostgres('call_handoffs', handoffRow(device, 'reverted', { state_version: 2 }));
		channel.emitPostgres('call_sessions', acceptedCallRow(device, {
			handoff_generation: 2,
			updated_at: new Date(Date.now() + 1_000).toISOString()
		}));

		expect(store.phase).toBe('reconnecting');
		expect(store.outcome).toBeNull();
		expect(store.handoffOutgoing).toBeNull();
		expect(harness.supabase!.rpcCalls.some(({ name }) => name === 'end_call')).toBe(false);
		store.bindUser(null);
	});
});

describe('CallStore durable preference and snapshot gates', () => {
	it('does not present or ring until the durable Cache Storage preference settles', async () => {
		const cacheRead = new Deferred<Response | null>();
		vi.stubGlobal('caches', {
			open: vi.fn(async () => ({
				match: vi.fn(() => cacheRead.promise),
				put: vi.fn(async () => undefined),
				delete: vi.fn(async () => true)
			}))
		});
		const store = new CallStore();
		bind(store, CALLEE);
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		await settle(10);
		expect(store.preferencesReady).toBe(false);
		expect(store.phase).toBe('idle');
		expect(harness.audio.startIncoming).not.toHaveBeenCalled();

		cacheRead.resolve(new Response(JSON.stringify({
			...defaultCallPreferences(CALLEE),
			dndEnabled: true,
			dndStartMinutes: 0,
			dndEndMinutes: 0,
			updatedAt: new Date(Date.now() + 60_000).toISOString()
		}), { headers: { 'content-type': 'application/json' } }));
		await eventually(() => expect(store.phase).toBe('incoming'));
		expect(store.preferencesReady).toBe(true);
		expect(store.attentionMuted).toBe(true);
		expect(harness.audio.startIncoming).not.toHaveBeenCalled();
		store.bindUser(null);
	});

	it('keeps the call fully hidden when a deferred durable permission blocks the caller', async () => {
		const cacheRead = new Deferred<Response | null>();
		vi.stubGlobal('caches', {
			open: vi.fn(async () => ({
				match: vi.fn(() => cacheRead.promise),
				put: vi.fn(async () => undefined),
				delete: vi.fn(async () => true)
			}))
		});
		const store = new CallStore();
		bind(store, CALLEE);
		harness.supabase!.latest('call_sessions:').emitPostgres('call_sessions', callRow());
		await settle(10);
		expect(store.phase).toBe('idle');
		cacheRead.resolve(new Response(JSON.stringify({
			...defaultCallPreferences(CALLEE),
			whoMayCall: 'nobody',
			updatedAt: new Date(Date.now() + 60_000).toISOString()
		}), { headers: { 'content-type': 'application/json' } }));
		await eventually(() => expect(store.preferencesReady).toBe(true));
		await settle(10);
		expect(store.phase).toBe('idle');
		expect(store.session).toBeNull();
		expect(harness.audio.startIncoming).not.toHaveBeenCalled();
		expect(harness.audio.confirmIncomingFeedback).not.toHaveBeenCalled();
		store.bindUser(null);
	});

	it('rejects lower generations, older same-generation rows, and resurrection after terminal state', () => {
		const current = parseCallSession(acceptedCallRow(OTHER_DEVICE, {
			handoff_generation: 1,
			updated_at: '2026-07-15T12:00:02.000Z'
		}))!;
		const lowerGeneration = parseCallSession(acceptedCallRow(OTHER_DEVICE, {
			handoff_generation: 0,
			updated_at: '2026-07-15T12:00:03.000Z'
		}))!;
		const olderSameGeneration = parseCallSession(acceptedCallRow(OTHER_DEVICE, {
			handoff_generation: 1,
			updated_at: '2026-07-15T12:00:01.000Z'
		}))!;
		const terminal = parseCallSession(acceptedCallRow(OTHER_DEVICE, {
			status: 'ended',
			ended_at: '2026-07-15T12:00:04.000Z',
			handoff_generation: 1,
			updated_at: '2026-07-15T12:00:04.000Z'
		}))!;
		const resurrected = parseCallSession(acceptedCallRow(OTHER_DEVICE, {
			handoff_generation: 2,
			updated_at: '2026-07-15T12:00:05.000Z'
		}))!;

		expect(isCallSessionSnapshotMonotonic(current, lowerGeneration)).toBe(false);
		expect(isCallSessionSnapshotMonotonic(current, olderSameGeneration)).toBe(false);
		expect(isCallSessionSnapshotMonotonic(terminal, resurrected)).toBe(false);
	});
});
