import type { CallKind, CallSignal } from './types';

export interface CallPeerOptions {
	kind: CallKind;
	caller: boolean;
	iceServers: RTCIceServer[];
	localStream: MediaStream;
	sendSignal: (signal: CallSignal) => Promise<void>;
	onRemoteStream: (stream: MediaStream) => void;
	onConnected: () => void;
	onDisconnected: () => void;
	onError: (error: Error) => void;
}

export interface LocalMediaOptions {
	kind: CallKind;
	facingMode?: 'user' | 'environment';
}

export async function acquireLocalMedia(options: LocalMediaOptions): Promise<MediaStream> {
	if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
		throw new Error('media_unsupported');
	}
	return navigator.mediaDevices.getUserMedia({
		audio: {
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true
		},
		video:
			options.kind === 'video'
				? {
						facingMode: { ideal: options.facingMode ?? 'user' },
						width: { ideal: 1280 },
						height: { ideal: 720 },
						frameRate: { ideal: 24, max: 30 }
					}
				: false
	});
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
	for (const track of stream?.getTracks() ?? []) track.stop();
}

/** A fixed-role 1:1 WebRTC peer: caller offers, callee answers. */
export class CallPeer {
	readonly pc: RTCPeerConnection;
	readonly localStream: MediaStream;
	#options: CallPeerOptions;
	#pendingCandidates: (RTCIceCandidateInit | null)[] = [];
	#serial: Promise<void> = Promise.resolve();
	#closed = false;
	#offered = false;
	#restartAttempts = 0;

	constructor(options: CallPeerOptions) {
		this.#options = options;
		this.localStream = options.localStream;
		this.pc = new RTCPeerConnection({ iceServers: options.iceServers, bundlePolicy: 'max-bundle' });
		for (const track of options.localStream.getTracks()) this.pc.addTrack(track, options.localStream);
		this.pc.onicecandidate = (event) => {
			void options
				.sendSignal({ type: 'candidate', candidate: event.candidate?.toJSON() ?? null })
				.catch((error) => options.onError(error instanceof Error ? error : new Error('signal_candidate_failed')));
		};
		this.pc.ontrack = (event) => {
			const stream = event.streams[0] ?? new MediaStream([event.track]);
			options.onRemoteStream(stream);
		};
		this.pc.onconnectionstatechange = () => this.#onConnectionState();
		this.pc.oniceconnectionstatechange = () => {
			if (this.pc.iceConnectionState === 'failed') this.#recoverIce();
		};
	}

	async startOffer(restart = false): Promise<void> {
		if (!this.#options.caller || this.#closed || (!restart && this.#offered)) return;
		this.#offered = true;
		await this.#enqueue(() => this.#createAndSendOffer(restart));
	}

	async receive(signal: CallSignal): Promise<void> {
		if (this.#closed) return;
		await this.#enqueue(async () => {
			switch (signal.type) {
				case 'offer': {
					await this.pc.setRemoteDescription(signal.sdp);
					await this.#flushCandidates();
					const answer = await this.pc.createAnswer();
					await this.pc.setLocalDescription(answer);
					await this.#options.sendSignal({ type: 'answer', sdp: this.pc.localDescription ?? answer });
					break;
				}
				case 'answer':
					await this.pc.setRemoteDescription(signal.sdp);
					await this.#flushCandidates();
					break;
				case 'candidate':
					if (this.pc.remoteDescription) await this.pc.addIceCandidate(signal.candidate);
					else this.#pendingCandidates.push(signal.candidate);
					break;
				case 'restart-request':
					// This handler already runs inside the serial queue. Enqueuing
					// startOffer() here would wait on itself forever.
					if (this.#options.caller) {
						this.#offered = true;
						await this.#createAndSendOffer(true);
					}
					break;
				case 'hangup':
					this.#options.onDisconnected();
					break;
			}
		});
	}

	setMuted(muted: boolean): void {
		for (const track of this.localStream.getAudioTracks()) track.enabled = !muted;
	}

	setCameraOff(off: boolean): void {
		for (const track of this.localStream.getVideoTracks()) track.enabled = !off;
	}

	async flipCamera(facingMode: 'user' | 'environment'): Promise<void> {
		if (this.#options.kind !== 'video' || this.#closed) return;
		const replacement = await navigator.mediaDevices.getUserMedia({
			video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
			audio: false
		});
		const nextTrack = replacement.getVideoTracks()[0];
		if (!nextTrack) {
			stopMediaStream(replacement);
			throw new Error('camera_unavailable');
		}
		const sender = this.pc.getSenders().find((item) => item.track?.kind === 'video');
		if (!sender) {
			stopMediaStream(replacement);
			throw new Error('camera_sender_missing');
		}
		await sender.replaceTrack(nextTrack);
		for (const old of this.localStream.getVideoTracks()) {
			this.localStream.removeTrack(old);
			old.stop();
		}
		this.localStream.addTrack(nextTrack);
	}

	close(stopLocal = true): void {
		if (this.#closed) return;
		this.#closed = true;
		this.pc.onicecandidate = null;
		this.pc.ontrack = null;
		this.pc.onconnectionstatechange = null;
		this.pc.oniceconnectionstatechange = null;
		this.pc.close();
		if (stopLocal) stopMediaStream(this.localStream);
		this.#pendingCandidates = [];
	}

	async #flushCandidates(): Promise<void> {
		const queued = this.#pendingCandidates.splice(0);
		for (const candidate of queued) await this.pc.addIceCandidate(candidate);
	}

	async #createAndSendOffer(restart: boolean): Promise<void> {
		const offer = await this.pc.createOffer(restart ? { iceRestart: true } : undefined);
		await this.pc.setLocalDescription(offer);
		const description = this.pc.localDescription;
		await this.#options.sendSignal({
			type: 'offer',
			sdp: description ? { type: description.type, sdp: description.sdp } : offer
		});
	}

	#enqueue(work: () => Promise<void>): Promise<void> {
		this.#serial = this.#serial.then(work).catch((error) => {
			this.#options.onError(error instanceof Error ? error : new Error('webrtc_failed'));
		});
		return this.#serial;
	}

	#onConnectionState(): void {
		if (this.#closed) return;
		if (this.pc.connectionState === 'connected') {
			this.#restartAttempts = 0;
			this.#options.onConnected();
		} else if (this.pc.connectionState === 'failed') {
			this.#recoverIce();
		} else if (this.pc.connectionState === 'closed') {
			this.#options.onDisconnected();
		}
	}

	#recoverIce(): void {
		if (this.#closed || this.#restartAttempts >= 2) {
			this.#options.onDisconnected();
			return;
		}
		this.#restartAttempts += 1;
		if (this.#options.caller) void this.startOffer(true);
		else {
			void this.#options
				.sendSignal({ type: 'restart-request' })
				.catch((error) => this.#options.onError(error instanceof Error ? error : new Error('signal_restart_failed')));
		}
	}
}
