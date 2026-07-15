import { describe, expect, it, vi } from 'vitest';
import {
	buildReadinessItems,
	probeMediaCapture,
	type BrowserReadinessSignals
} from './readiness';

const READY_SIGNALS: BrowserReadinessSignals = {
	online: true,
	secureContext: true,
	serviceWorkerSupported: true,
	serviceWorkerActive: true,
	mediaCaptureSupported: true,
	audioOutputSupported: true,
	vibrationSupported: true,
	ios: false,
	installed: true
};

describe('communications readiness', () => {
	it('reports only observed browser capabilities as ready', () => {
		const items = buildReadinessItems(READY_SIGNALS, 'on');
		expect(items).toHaveLength(6);
		expect(items.every((item) => item.level === 'ready')).toBe(true);
	});

	it('keeps iOS installation, denied push and offline states explicit', () => {
		const ios = buildReadinessItems(
			{ ...READY_SIGNALS, online: false, ios: true, installed: false },
			'ios-needs-install'
		);
		expect(ios.find((item) => item.capability === 'network')).toMatchObject({
			level: 'attention',
			detail: 'offline'
		});
		expect(ios.find((item) => item.capability === 'push')).toMatchObject({
			level: 'attention',
			detail: 'push-ios-install'
		});

		const denied = buildReadinessItems(READY_SIGNALS, 'denied');
		expect(denied.find((item) => item.capability === 'push')).toMatchObject({
			level: 'unavailable',
			detail: 'push-denied'
		});
	});

	it('does not turn unknown or absent platform APIs into false confidence', () => {
		const checking = buildReadinessItems(
			{
				...READY_SIGNALS,
				serviceWorkerActive: null,
				mediaCaptureSupported: false,
				audioOutputSupported: false,
				vibrationSupported: false
			},
			'off'
		);
		expect(checking.find((item) => item.capability === 'serviceWorker')?.level).toBe('unknown');
		expect(checking.find((item) => item.capability === 'media')?.level).toBe('unavailable');
		expect(checking.find((item) => item.capability === 'audio')?.level).toBe('unavailable');
		expect(checking.find((item) => item.capability === 'vibration')?.level).toBe('unavailable');
	});

	it('always releases microphone and camera tracks after a successful probe', async () => {
		const stopAudio = vi.fn();
		const stopVideo = vi.fn();
		const stream = {
			getAudioTracks: () => [{ stop: stopAudio }],
			getVideoTracks: () => [{ stop: stopVideo }],
			getTracks: () => [{ stop: stopAudio }, { stop: stopVideo }]
		} as unknown as MediaStream;
		const getUserMedia = vi.fn(async () => stream);

		await expect(probeMediaCapture(getUserMedia)).resolves.toBe('passed');
		expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: { facingMode: 'user' } });
		expect(stopAudio).toHaveBeenCalledOnce();
		expect(stopVideo).toHaveBeenCalledOnce();
	});

	it('normalizes permission and missing-device failures without leaking errors', async () => {
		await expect(
			probeMediaCapture(async () => {
				throw { name: 'NotAllowedError' };
			})
		).resolves.toBe('denied');
		await expect(
			probeMediaCapture(async () => {
				throw { name: 'NotFoundError' };
			})
		).resolves.toBe('missing');
	});
});
