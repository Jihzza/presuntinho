export type CallInputKind = 'audio' | 'video';
export type CallMediaDeviceKind = 'audioinput' | 'videoinput' | 'audiooutput';

export interface CallMediaDevice {
	deviceId: string;
	kind: CallMediaDeviceKind;
	/** A control-character-free label supplied by the browser after permission. */
	label: string | null;
	/** Lets the UI localise a truthful "Microphone 1" style fallback. */
	fallbackOrdinal: number;
	selectable: boolean;
}

export interface DevicePermissionRequest {
	audio?: boolean;
	video?: boolean;
}

type MediaDevicesPort = Pick<MediaDevices, 'enumerateDevices' | 'getUserMedia'> &
	Partial<Pick<MediaDevices, 'getDisplayMedia'>>;

export interface EnumerateCallMediaOptions {
	/**
	 * Permission is never requested implicitly. When supplied, a short-lived
	 * stream is opened and stopped so browsers may reveal device labels.
	 */
	requestPermission?: DevicePermissionRequest;
	mediaDevices?: MediaDevicesPort;
}

export interface ReplaceInputTrackOptions {
	kind: CallInputKind;
	deviceId: string;
	peerConnection: RTCPeerConnection;
	localStream: MediaStream;
	mediaDevices?: MediaDevicesPort;
}

export type AudioOutputSelectionResult =
	| { status: 'selected'; deviceId: string }
	| { status: 'unsupported'; deviceId: string }
	| {
			status: 'failed';
			deviceId: string;
			reason: 'not-allowed' | 'not-found' | 'aborted' | 'security' | 'unknown';
	  };

export type ScreenShareEndReason = 'browser-ended' | 'user-stopped' | 'disposed';

export interface ScreenShareChange {
	active: boolean;
	reason: 'started' | ScreenShareEndReason | 'restore-failed';
	cameraRestored: boolean;
}

export interface CallMediaControllerOptions {
	peerConnection: RTCPeerConnection;
	localStream: MediaStream;
	mediaDevices?: MediaDevicesPort;
	onScreenShareChange?: (change: ScreenShareChange) => void;
	onError?: (error: Error) => void;
}

interface ActiveScreenShare {
	track: MediaStreamTrack;
	stream: MediaStream;
	cameraTrack: MediaStreamTrack;
	sender: RTCRtpSender;
	ended: () => void;
	cameraDeviceId: string | null;
}

const MAX_DEVICE_LABEL_LENGTH = 120;
const MEDIA_KINDS = new Set<CallMediaDeviceKind>(['audioinput', 'videoinput', 'audiooutput']);

function requireMediaDevices(port?: MediaDevicesPort): MediaDevicesPort {
	const value = port ?? (typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined);
	if (!value?.getUserMedia || !value.enumerateDevices) throw new Error('media_devices_unsupported');
	return value;
}

function safeDeviceLabel(value: string): string | null {
	const clean = value
		.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!clean) return null;
	return Array.from(clean).slice(0, MAX_DEVICE_LABEL_LENGTH).join('');
}

function stopStream(stream: MediaStream | null | undefined, except?: MediaStreamTrack): void {
	for (const track of stream?.getTracks() ?? []) {
		if (track !== except) track.stop();
	}
}

function inputConstraints(kind: CallInputKind, deviceId: string): MediaStreamConstraints {
	const selected = deviceId ? { deviceId: { exact: deviceId } } : {};
	return kind === 'audio'
		? {
				audio: {
					...selected,
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				},
				video: false
			}
		: {
				audio: false,
				video: {
					...selected,
					width: { ideal: 1280 },
					height: { ideal: 720 },
					frameRate: { ideal: 24, max: 30 }
				}
			};
}

async function acquireInputTrack(
	kind: CallInputKind,
	deviceId: string,
	mediaDevices: MediaDevicesPort
): Promise<{ track: MediaStreamTrack; stream: MediaStream }> {
	const stream = await mediaDevices.getUserMedia(inputConstraints(kind, deviceId));
	const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
	if (!track) {
		stopStream(stream);
		throw new Error(kind === 'audio' ? 'microphone_unavailable' : 'camera_unavailable');
	}
	stopStream(stream, track);
	return { track, stream };
}

function senderForKind(peerConnection: RTCPeerConnection, kind: CallInputKind): RTCRtpSender | null {
	return peerConnection.getSenders().find((sender) => sender.track?.kind === kind) ?? null;
}

function replaceLocalTrack(localStream: MediaStream, next: MediaStreamTrack): MediaStreamTrack[] {
	const previous = localStream.getTracks().filter((track) => track.kind === next.kind && track !== next);
	for (const track of previous) localStream.removeTrack(track);
	if (!localStream.getTracks().includes(next)) localStream.addTrack(next);
	return previous;
}

function normaliseOutputError(error: unknown): 'not-allowed' | 'not-found' | 'aborted' | 'security' | 'unknown' {
	const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
	if (name === 'NotAllowedError') return 'not-allowed';
	if (name === 'NotFoundError') return 'not-found';
	if (name === 'AbortError') return 'aborted';
	if (name === 'SecurityError') return 'security';
	return 'unknown';
}

function asError(error: unknown, fallback: string): Error {
	return error instanceof Error ? error : new Error(fallback);
}

/**
 * Enumerates only the fields needed by the device picker. groupId is
 * deliberately not exposed and labels are stripped of control characters.
 */
export async function enumerateCallMediaDevices(
	options: EnumerateCallMediaOptions = {}
): Promise<CallMediaDevice[]> {
	const mediaDevices = requireMediaDevices(options.mediaDevices);
	const permission = options.requestPermission;
	let probe: MediaStream | null = null;
	try {
		if (permission?.audio || permission?.video) {
			probe = await mediaDevices.getUserMedia({
				audio: Boolean(permission.audio),
				video: Boolean(permission.video)
			});
		}
		const devices = await mediaDevices.enumerateDevices();
		const ordinals: Record<CallMediaDeviceKind, number> = {
			audioinput: 0,
			videoinput: 0,
			audiooutput: 0
		};
		const seen = new Set<string>();
		const result: CallMediaDevice[] = [];
		for (const device of devices) {
			if (!MEDIA_KINDS.has(device.kind as CallMediaDeviceKind)) continue;
			const kind = device.kind as CallMediaDeviceKind;
			const key = `${kind}:${device.deviceId}`;
			if (device.deviceId && seen.has(key)) continue;
			if (device.deviceId) seen.add(key);
			ordinals[kind] += 1;
			result.push({
				deviceId: device.deviceId,
				kind,
				label: safeDeviceLabel(device.label),
				fallbackOrdinal: ordinals[kind],
				selectable: Boolean(device.deviceId)
			});
		}
		return result;
	} finally {
		stopStream(probe);
	}
}

/** Acquire a selected input, atomically put it on the sender, then retire the old track. */
export async function replaceInputTrack(options: ReplaceInputTrackOptions): Promise<MediaStreamTrack> {
	const mediaDevices = requireMediaDevices(options.mediaDevices);
	const sender = senderForKind(options.peerConnection, options.kind);
	if (!sender) throw new Error(`${options.kind}_sender_missing`);
	const previous = options.localStream.getTracks().filter((track) => track.kind === options.kind);
	const acquired = await acquireInputTrack(options.kind, options.deviceId, mediaDevices);
	acquired.track.enabled = previous[0]?.enabled ?? sender.track?.enabled ?? true;
	try {
		await sender.replaceTrack(acquired.track);
	} catch (error) {
		acquired.track.stop();
		throw asError(error, 'replace_track_failed');
	}
	const retired = replaceLocalTrack(options.localStream, acquired.track);
	for (const track of retired) track.stop();
	return acquired.track;
}

/** Selects the remote-audio sink without claiming success on unsupported browsers. */
export async function selectAudioOutput(
	element: HTMLMediaElement,
	deviceId: string
): Promise<AudioOutputSelectionResult> {
	const setSinkId = (element as HTMLMediaElement & {
		setSinkId?: (id: string) => Promise<void>;
	}).setSinkId;
	if (typeof setSinkId !== 'function') return { status: 'unsupported', deviceId };
	try {
		await setSinkId.call(element, deviceId);
		return { status: 'selected', deviceId };
	} catch (error) {
		return { status: 'failed', deviceId, reason: normaliseOutputError(error) };
	}
}

/**
 * Owns device switching and screen-share restoration for a single CallPeer.
 * Call dispose() before CallPeer.close() so a camera retained during sharing
 * cannot survive the call.
 */
export class CallMediaController {
	readonly peerConnection: RTCPeerConnection;
	readonly localStream: MediaStream;
	#mediaDevices: MediaDevicesPort;
	#options: CallMediaControllerOptions;
	#screenShare: ActiveScreenShare | null = null;
	#audioQueue: Promise<void> = Promise.resolve();
	#videoQueue: Promise<void> = Promise.resolve();
	#disposed = false;

	constructor(options: CallMediaControllerOptions) {
		this.#options = options;
		this.peerConnection = options.peerConnection;
		this.localStream = options.localStream;
		this.#mediaDevices = requireMediaDevices(options.mediaDevices);
	}

	get isScreenSharing(): boolean {
		return Boolean(this.#screenShare);
	}

	switchMicrophone(deviceId: string): Promise<MediaStreamTrack> {
		return this.#enqueue('audio', () => this.#switchInput('audio', deviceId));
	}

	switchCamera(deviceId: string): Promise<MediaStreamTrack> {
		return this.#enqueue('video', async () => {
			this.#assertOpen();
			if (!this.#screenShare) return this.#switchInput('video', deviceId);
			const share = this.#screenShare;
			const acquired = await acquireInputTrack('video', deviceId, this.#mediaDevices);
			if (this.#disposed || this.#screenShare !== share) {
				acquired.track.stop();
				throw new Error('media_controller_disposed');
			}
			acquired.track.enabled = share.cameraTrack.enabled;
			const previous = share.cameraTrack;
			share.cameraTrack = acquired.track;
			share.cameraDeviceId = deviceId || this.#trackDeviceId(acquired.track);
			previous.stop();
			return acquired.track;
		});
	}

	selectAudioOutput(element: HTMLMediaElement, deviceId: string): Promise<AudioOutputSelectionResult> {
		return selectAudioOutput(element, deviceId);
	}

	startScreenShare(): Promise<MediaStreamTrack> {
		return this.#enqueue('video', async () => {
			this.#assertOpen();
			if (this.#screenShare) return this.#screenShare.track;
			if (typeof this.#mediaDevices.getDisplayMedia !== 'function') {
				throw new Error('screen_share_unsupported');
			}
			const sender = senderForKind(this.peerConnection, 'video');
			const cameraTrack = sender?.track ?? this.localStream.getVideoTracks()[0];
			if (!sender || !cameraTrack || cameraTrack.kind !== 'video') throw new Error('video_sender_missing');
			const stream = await this.#mediaDevices.getDisplayMedia({ video: true, audio: false });
			const track = stream.getVideoTracks()[0];
			if (!track) {
				stopStream(stream);
				throw new Error('screen_share_unavailable');
			}
			stopStream(stream, track);
			if (this.#disposed) {
				track.stop();
				throw new Error('media_controller_disposed');
			}
			try {
				await sender.replaceTrack(track);
			} catch (error) {
				track.stop();
				throw asError(error, 'screen_share_replace_failed');
			}
			if (this.#disposed) {
				track.stop();
				throw new Error('media_controller_disposed');
			}
			const ended = () => {
				void this.#restoreCamera('browser-ended').catch((error) => {
					this.#options.onError?.(asError(error, 'screen_share_restore_failed'));
				});
			};
			this.#screenShare = {
				track,
				stream,
				cameraTrack,
				sender,
				ended,
				cameraDeviceId: this.#trackDeviceId(cameraTrack)
			};
			track.addEventListener('ended', ended, { once: true });
			replaceLocalTrack(this.localStream, track);
			this.#options.onScreenShareChange?.({ active: true, reason: 'started', cameraRestored: true });
			// A user can stop sharing while replaceTrack is pending.
			if (track.readyState === 'ended') ended();
			return track;
		});
	}

	stopScreenShare(): Promise<void> {
		return this.#restoreCamera('user-stopped');
	}

	/** Synchronous call-end cleanup; intentionally does not renegotiate. */
	dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		const share = this.#screenShare;
		this.#screenShare = null;
		if (!share) return;
		share.track.removeEventListener('ended', share.ended);
		share.track.stop();
		share.cameraTrack.stop();
		this.#options.onScreenShareChange?.({ active: false, reason: 'disposed', cameraRestored: false });
	}

	#restoreCamera(reason: Exclude<ScreenShareEndReason, 'disposed'>): Promise<void> {
		return this.#enqueue('video', async () => {
			const share = this.#screenShare;
			if (!share) return;
			share.track.removeEventListener('ended', share.ended);
			let cameraTrack = share.cameraTrack;
			let acquiredCamera = false;
			try {
				if (cameraTrack.readyState === 'ended') {
					const acquired = await acquireInputTrack('video', share.cameraDeviceId ?? '', this.#mediaDevices);
					cameraTrack = acquired.track;
					acquiredCamera = true;
				}
				if (this.#disposed || this.#screenShare !== share) {
					if (acquiredCamera) cameraTrack.stop();
					return;
				}
				await share.sender.replaceTrack(cameraTrack);
				if (this.#disposed || this.#screenShare !== share) {
					if (acquiredCamera) cameraTrack.stop();
					return;
				}
				const retired = replaceLocalTrack(this.localStream, cameraTrack);
				for (const track of retired) {
					if (track !== share.track) track.stop();
				}
				share.track.stop();
				this.#screenShare = null;
				this.#options.onScreenShareChange?.({ active: false, reason, cameraRestored: true });
			} catch (error) {
				if (acquiredCamera) cameraTrack.stop();
				share.track.stop();
				this.localStream.removeTrack(share.track);
				this.#screenShare = null;
				this.#options.onScreenShareChange?.({
					active: false,
					reason: 'restore-failed',
					cameraRestored: false
				});
				throw asError(error, 'screen_share_restore_failed');
			}
		});
	}

	async #switchInput(kind: CallInputKind, deviceId: string): Promise<MediaStreamTrack> {
		this.#assertOpen();
		const track = await replaceInputTrack({
			kind,
			deviceId,
			peerConnection: this.peerConnection,
			localStream: this.localStream,
			mediaDevices: this.#mediaDevices
		});
		if (this.#disposed) {
			track.stop();
			throw new Error('media_controller_disposed');
		}
		return track;
	}

	#enqueue<T>(kind: CallInputKind, work: () => Promise<T>): Promise<T> {
		const previous = kind === 'audio' ? this.#audioQueue : this.#videoQueue;
		const run = previous.then(work, work);
		const settled = run.then(
			() => undefined,
			() => undefined
		);
		if (kind === 'audio') this.#audioQueue = settled;
		else this.#videoQueue = settled;
		return run;
	}

	#trackDeviceId(track: MediaStreamTrack): string | null {
		const deviceId = track.getSettings?.().deviceId;
		return typeof deviceId === 'string' && deviceId ? deviceId : null;
	}

	#assertOpen(): void {
		if (this.#disposed) throw new Error('media_controller_disposed');
	}
}
