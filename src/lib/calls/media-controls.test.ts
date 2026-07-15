import { describe, expect, it, vi } from 'vitest';
import {
	CallMediaController,
	enumerateCallMediaDevices,
	replaceInputTrack,
	selectAudioOutput
} from './media-controls';

class FakeTrack extends EventTarget {
	kind: 'audio' | 'video';
	enabled = true;
	readyState: MediaStreamTrackState = 'live';
	#deviceId: string;
	stop = vi.fn(() => {
		this.readyState = 'ended';
	});

	constructor(kind: 'audio' | 'video', deviceId = '') {
		super();
		this.kind = kind;
		this.#deviceId = deviceId;
	}

	getSettings(): MediaTrackSettings {
		return { deviceId: this.#deviceId };
	}

	endFromBrowser(): void {
		this.readyState = 'ended';
		this.dispatchEvent(new Event('ended'));
	}
}

class FakeStream {
	tracks: FakeTrack[];
	constructor(tracks: FakeTrack[]) {
		this.tracks = [...tracks];
	}
	getTracks = () => [...this.tracks] as unknown as MediaStreamTrack[];
	getAudioTracks = () => this.tracks.filter((track) => track.kind === 'audio') as unknown as MediaStreamTrack[];
	getVideoTracks = () => this.tracks.filter((track) => track.kind === 'video') as unknown as MediaStreamTrack[];
	addTrack = (track: MediaStreamTrack) => {
		if (!this.tracks.includes(track as unknown as FakeTrack)) this.tracks.push(track as unknown as FakeTrack);
	};
	removeTrack = (track: MediaStreamTrack) => {
		this.tracks = this.tracks.filter((item) => item !== (track as unknown as FakeTrack));
	};
}

function device(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
	return { kind, deviceId, label, groupId: 'private-group', toJSON: () => ({}) } as MediaDeviceInfo;
}

function mediaDevices(options: {
	devices?: MediaDeviceInfo[];
	userStreams?: FakeStream[];
	displayStreams?: FakeStream[];
}) {
	const userStreams = [...(options.userStreams ?? [])];
	const displayStreams = [...(options.displayStreams ?? [])];
	return {
		enumerateDevices: vi.fn(async () => options.devices ?? []),
		getUserMedia: vi.fn(async () => {
			const stream = userStreams.shift();
			if (!stream) throw new Error('unexpected getUserMedia');
			return stream as unknown as MediaStream;
		}),
		getDisplayMedia: vi.fn(async () => {
			const stream = displayStreams.shift();
			if (!stream) throw new Error('unexpected getDisplayMedia');
			return stream as unknown as MediaStream;
		})
	} as unknown as MediaDevices;
}

function peer(sender: { track: MediaStreamTrack | null; replaceTrack: ReturnType<typeof vi.fn> }) {
	return { getSenders: () => [sender] } as unknown as RTCPeerConnection;
}

describe('enumerateCallMediaDevices', () => {
	it('opens an explicit permission probe, sanitises labels and always stops the probe', async () => {
		const probeTrack = new FakeTrack('audio');
		const port = mediaDevices({
			userStreams: [new FakeStream([probeTrack])],
			devices: [
				device('audioinput', 'mic-1', '  Studio\u0000 \u202e  Mic  '),
				device('videoinput', 'cam-1', 'Front Camera'),
				device('audiooutput', '', ''),
				device('audioinput', 'mic-1', 'Duplicate')
			]
		});
		const result = await enumerateCallMediaDevices({
			mediaDevices: port,
			requestPermission: { audio: true, video: false }
		});
		expect(port.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
		expect(probeTrack.stop).toHaveBeenCalledOnce();
		expect(result).toEqual([
			{
				deviceId: 'mic-1',
				kind: 'audioinput',
				label: 'Studio Mic',
				fallbackOrdinal: 1,
				selectable: true
			},
			{
				deviceId: 'cam-1',
				kind: 'videoinput',
				label: 'Front Camera',
				fallbackOrdinal: 1,
				selectable: true
			},
			{
				deviceId: '',
				kind: 'audiooutput',
				label: null,
				fallbackOrdinal: 1,
				selectable: false
			}
		]);
	});

	it('does not prompt unless the caller explicitly requests permission', async () => {
		const port = mediaDevices({ devices: [device('audioinput', '', '')] });
		await enumerateCallMediaDevices({ mediaDevices: port });
		expect(port.getUserMedia).not.toHaveBeenCalled();
	});
});

describe('input and output selection', () => {
	it('replaces a microphone track atomically and preserves mute state', async () => {
		const oldTrack = new FakeTrack('audio', 'old');
		oldTrack.enabled = false;
		const nextTrack = new FakeTrack('audio', 'new');
		const local = new FakeStream([oldTrack]);
		const sender = { track: oldTrack as unknown as MediaStreamTrack, replaceTrack: vi.fn(async () => undefined) };
		const port = mediaDevices({ userStreams: [new FakeStream([nextTrack])] });
		const result = await replaceInputTrack({
			kind: 'audio',
			deviceId: 'new',
			peerConnection: peer(sender),
			localStream: local as unknown as MediaStream,
			mediaDevices: port
		});
		expect(result).toBe(nextTrack);
		expect(nextTrack.enabled).toBe(false);
		expect(sender.replaceTrack).toHaveBeenCalledWith(nextTrack);
		expect(oldTrack.stop).toHaveBeenCalledOnce();
		expect(local.tracks).toEqual([nextTrack]);
		expect(port.getUserMedia).toHaveBeenCalledWith({
			audio: {
				deviceId: { exact: 'new' },
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true
			},
			video: false
		});
	});

	it('keeps the current input alive if replaceTrack fails', async () => {
		const oldTrack = new FakeTrack('video', 'old');
		const nextTrack = new FakeTrack('video', 'new');
		const local = new FakeStream([oldTrack]);
		const sender = {
			track: oldTrack as unknown as MediaStreamTrack,
			replaceTrack: vi.fn(async () => {
				throw new Error('codec mismatch');
			})
		};
		await expect(
			replaceInputTrack({
				kind: 'video',
				deviceId: 'new',
				peerConnection: peer(sender),
				localStream: local as unknown as MediaStream,
				mediaDevices: mediaDevices({ userStreams: [new FakeStream([nextTrack])] })
			})
		).rejects.toThrow('codec mismatch');
		expect(nextTrack.stop).toHaveBeenCalledOnce();
		expect(oldTrack.stop).not.toHaveBeenCalled();
		expect(local.tracks).toEqual([oldTrack]);
	});

	it('reports unsupported and failed output routing factually', async () => {
		expect(await selectAudioOutput({} as HTMLMediaElement, 'speaker')).toEqual({
			status: 'unsupported',
			deviceId: 'speaker'
		});
		const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
		const element = { setSinkId: vi.fn(async () => { throw denied; }) } as unknown as HTMLMediaElement;
		expect(await selectAudioOutput(element, 'speaker')).toEqual({
			status: 'failed',
			deviceId: 'speaker',
			reason: 'not-allowed'
		});
	});
});

describe('CallMediaController screen sharing', () => {
	it('restores the retained camera automatically when browser sharing ends', async () => {
		const camera = new FakeTrack('video', 'cam-1');
		const display = new FakeTrack('video');
		const local = new FakeStream([camera]);
		const sender = { track: camera as unknown as MediaStreamTrack, replaceTrack: vi.fn(async () => undefined) };
		const changes = vi.fn();
		const controller = new CallMediaController({
			peerConnection: peer(sender),
			localStream: local as unknown as MediaStream,
			mediaDevices: mediaDevices({ displayStreams: [new FakeStream([display])] }),
			onScreenShareChange: changes
		});
		await controller.startScreenShare();
		expect(sender.replaceTrack).toHaveBeenNthCalledWith(1, display);
		expect(local.tracks).toEqual([display]);
		expect(camera.stop).not.toHaveBeenCalled();
		display.endFromBrowser();
		await vi.waitFor(() => expect(sender.replaceTrack).toHaveBeenCalledTimes(2));
		expect(sender.replaceTrack).toHaveBeenNthCalledWith(2, camera);
		expect(local.tracks).toEqual([camera]);
		expect(display.stop).toHaveBeenCalled();
		expect(controller.isScreenSharing).toBe(false);
		expect(changes).toHaveBeenLastCalledWith({
			active: false,
			reason: 'browser-ended',
			cameraRestored: true
		});
	});

	it('uses a camera selected during sharing when it restores', async () => {
		const camera = new FakeTrack('video', 'cam-1');
		const nextCamera = new FakeTrack('video', 'cam-2');
		const display = new FakeTrack('video');
		const local = new FakeStream([camera]);
		const sender = { track: camera as unknown as MediaStreamTrack, replaceTrack: vi.fn(async () => undefined) };
		const controller = new CallMediaController({
			peerConnection: peer(sender),
			localStream: local as unknown as MediaStream,
			mediaDevices: mediaDevices({
				userStreams: [new FakeStream([nextCamera])],
				displayStreams: [new FakeStream([display])]
			})
		});
		await controller.startScreenShare();
		await controller.switchCamera('cam-2');
		expect(camera.stop).toHaveBeenCalledOnce();
		expect(sender.replaceTrack).toHaveBeenCalledTimes(1);
		display.endFromBrowser();
		await vi.waitFor(() => expect(sender.replaceTrack).toHaveBeenCalledTimes(2));
		expect(sender.replaceTrack).toHaveBeenLastCalledWith(nextCamera);
		expect(local.tracks).toEqual([nextCamera]);
	});

	it('reacquires a camera if the retained track ended while sharing', async () => {
		const camera = new FakeTrack('video', 'cam-1');
		const recovered = new FakeTrack('video', 'cam-1');
		const display = new FakeTrack('video');
		const local = new FakeStream([camera]);
		const sender = { track: camera as unknown as MediaStreamTrack, replaceTrack: vi.fn(async () => undefined) };
		const port = mediaDevices({
			userStreams: [new FakeStream([recovered])],
			displayStreams: [new FakeStream([display])]
		});
		const controller = new CallMediaController({
			peerConnection: peer(sender),
			localStream: local as unknown as MediaStream,
			mediaDevices: port
		});
		await controller.startScreenShare();
		camera.stop();
		display.endFromBrowser();
		await vi.waitFor(() => expect(sender.replaceTrack).toHaveBeenCalledTimes(2));
		expect(sender.replaceTrack).toHaveBeenLastCalledWith(recovered);
		expect(port.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
			video: expect.objectContaining({ deviceId: { exact: 'cam-1' } })
		}));
		expect(local.tracks).toEqual([recovered]);
	});
});
