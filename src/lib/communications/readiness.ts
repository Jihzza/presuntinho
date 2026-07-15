import type { PushState } from '$lib/push';

export type ReadinessLevel = 'ready' | 'attention' | 'unavailable' | 'unknown';
export type ReadinessCapability =
	| 'network'
	| 'push'
	| 'serviceWorker'
	| 'media'
	| 'audio'
	| 'vibration';

export interface BrowserReadinessSignals {
	online: boolean;
	secureContext: boolean;
	serviceWorkerSupported: boolean;
	/** null while the asynchronous registration check is still running. */
	serviceWorkerActive: boolean | null;
	mediaCaptureSupported: boolean;
	audioOutputSupported: boolean;
	vibrationSupported: boolean;
	ios: boolean;
	installed: boolean;
}

export interface ReadinessItem {
	capability: ReadinessCapability;
	level: ReadinessLevel;
	detail:
		| 'online'
		| 'offline'
		| 'push-on'
		| 'push-off'
		| 'push-denied'
		| 'push-unsupported'
		| 'push-ios-install'
		| 'worker-active'
		| 'worker-missing'
		| 'worker-checking'
		| 'media-supported'
		| 'media-unsupported'
		| 'audio-supported'
		| 'audio-unsupported'
		| 'vibration-supported'
		| 'vibration-unsupported';
}

function pushReadiness(pushState: PushState): ReadinessItem {
	switch (pushState) {
		case 'on':
			return { capability: 'push', level: 'ready', detail: 'push-on' };
		case 'off':
			return { capability: 'push', level: 'attention', detail: 'push-off' };
		case 'ios-needs-install':
			return { capability: 'push', level: 'attention', detail: 'push-ios-install' };
		case 'denied':
			return { capability: 'push', level: 'unavailable', detail: 'push-denied' };
		default:
			return { capability: 'push', level: 'unavailable', detail: 'push-unsupported' };
	}
}

/**
 * Turns browser feature signals into honest, UI-ready states. It deliberately
 * does not infer that a physical speaker, vibration motor or remote phone will
 * react: browsers cannot prove any of those things.
 */
export function buildReadinessItems(
	signals: BrowserReadinessSignals,
	pushState: PushState
): ReadinessItem[] {
	const push = signals.ios && !signals.installed
		? ({ capability: 'push', level: 'attention', detail: 'push-ios-install' } satisfies ReadinessItem)
		: pushReadiness(pushState);
	const worker: ReadinessItem = !signals.serviceWorkerSupported
		? { capability: 'serviceWorker', level: 'unavailable', detail: 'worker-missing' }
		: signals.serviceWorkerActive === null
			? { capability: 'serviceWorker', level: 'unknown', detail: 'worker-checking' }
			: signals.serviceWorkerActive
				? { capability: 'serviceWorker', level: 'ready', detail: 'worker-active' }
				: { capability: 'serviceWorker', level: 'attention', detail: 'worker-missing' };

	return [
		{
			capability: 'network',
			level: signals.online ? 'ready' : 'attention',
			detail: signals.online ? 'online' : 'offline'
		},
		push,
		worker,
		{
			capability: 'media',
			level: signals.mediaCaptureSupported && signals.secureContext ? 'ready' : 'unavailable',
			detail:
				signals.mediaCaptureSupported && signals.secureContext
					? 'media-supported'
					: 'media-unsupported'
		},
		{
			capability: 'audio',
			level: signals.audioOutputSupported ? 'ready' : 'unavailable',
			detail: signals.audioOutputSupported ? 'audio-supported' : 'audio-unsupported'
		},
		{
			capability: 'vibration',
			level: signals.vibrationSupported ? 'ready' : 'unavailable',
			detail: signals.vibrationSupported ? 'vibration-supported' : 'vibration-unsupported'
		}
	];
}

export type MediaProbeResult = 'passed' | 'denied' | 'missing' | 'failed';

function mediaProbeFailure(error: unknown): MediaProbeResult {
	const name = typeof DOMException !== 'undefined' && error instanceof DOMException
		? error.name
		: typeof error === 'object' && error !== null && 'name' in error
			? String((error as { name: unknown }).name)
			: '';
	if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
	if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
	return 'failed';
}

/**
 * Opens microphone and camera only long enough to verify that tracks exist.
 * Every acquired track is stopped in `finally`, including partial/failure
 * paths, so the browser privacy indicator cannot be left on by this test.
 */
export async function probeMediaCapture(
	getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
): Promise<MediaProbeResult> {
	let stream: MediaStream | null = null;
	try {
		stream = await getUserMedia({ audio: true, video: { facingMode: 'user' } });
		return stream.getAudioTracks().length > 0 && stream.getVideoTracks().length > 0
			? 'passed'
			: 'missing';
	} catch (error) {
		return mediaProbeFailure(error);
	} finally {
		stream?.getTracks().forEach((track) => track.stop());
	}
}
