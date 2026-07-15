import { afterEach, describe, expect, it, vi } from 'vitest';
import { CallPeer } from './webrtc';
import type { CallSignal } from './types';

class FakePeerConnection {
	localDescription: RTCSessionDescriptionInit | null = null;
	remoteDescription: RTCSessionDescriptionInit | null = null;
	connectionState: RTCPeerConnectionState = 'new';
	iceConnectionState: RTCIceConnectionState = 'new';
	onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
	ontrack: ((event: RTCTrackEvent) => void) | null = null;
	onconnectionstatechange: (() => void) | null = null;
	oniceconnectionstatechange: (() => void) | null = null;
	addedCandidates: (RTCIceCandidateInit | null)[] = [];

	addTrack = vi.fn();
	getSenders = vi.fn(() => []);
	createOffer = vi.fn(async () => ({ type: 'offer' as const, sdp: 'offer-sdp' }));
	createAnswer = vi.fn(async () => ({ type: 'answer' as const, sdp: 'answer-sdp' }));
	setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
		this.localDescription = description;
	});
	setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
		this.remoteDescription = description;
	});
	addIceCandidate = vi.fn(async (candidate: RTCIceCandidateInit | null) => {
		this.addedCandidates.push(candidate);
	});
	close = vi.fn();
}

const originalPeerConnection = globalThis.RTCPeerConnection;

function streamStub(): MediaStream {
	return {
		getTracks: () => [],
		getAudioTracks: () => [],
		getVideoTracks: () => []
	} as unknown as MediaStream;
}

afterEach(() => {
	Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, value: originalPeerConnection });
});

describe('CallPeer signalling', () => {
	it('queues ICE until the remote offer exists', async () => {
		Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, value: FakePeerConnection });
		const sent: CallSignal[] = [];
		const peer = new CallPeer({
			kind: 'audio',
			caller: false,
			iceServers: [],
			localStream: streamStub(),
			sendSignal: async (signal) => {
				sent.push(signal);
			},
			onRemoteStream: vi.fn(),
			onConnected: vi.fn(),
			onDisconnected: vi.fn(),
			onError: vi.fn()
		});
		const candidate = { candidate: 'candidate:1' };
		await peer.receive({ type: 'candidate', candidate });
		expect((peer.pc as unknown as FakePeerConnection).addedCandidates).toEqual([]);
		await peer.receive({ type: 'offer', sdp: { type: 'offer', sdp: 'remote' } });
		expect((peer.pc as unknown as FakePeerConnection).addedCandidates).toEqual([candidate]);
		expect(sent).toContainEqual({ type: 'answer', sdp: { type: 'answer', sdp: 'answer-sdp' } });
	});

	it('answers a restart request without deadlocking its serial queue', async () => {
		Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, value: FakePeerConnection });
		const sent: CallSignal[] = [];
		const peer = new CallPeer({
			kind: 'video',
			caller: true,
			iceServers: [],
			localStream: streamStub(),
			sendSignal: async (signal) => {
				sent.push(signal);
			},
			onRemoteStream: vi.fn(),
			onConnected: vi.fn(),
			onDisconnected: vi.fn(),
			onError: vi.fn()
		});
		await peer.receive({ type: 'restart-request' });
		expect((peer.pc as unknown as FakePeerConnection).createOffer).toHaveBeenCalledWith({ iceRestart: true });
		expect(sent).toContainEqual({ type: 'offer', sdp: { type: 'offer', sdp: 'offer-sdp' } });
	});
});
