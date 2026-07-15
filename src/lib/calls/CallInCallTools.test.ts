import { beforeAll, describe, expect, it, vi } from 'vitest';
import { addMessages, init } from 'svelte-i18n';
import { render } from 'svelte/server';
import CallInCallTools from './CallInCallTools.svelte';

beforeAll(() => {
	addMessages('en', {
		calls: {
			quality: { poor: 'Weak connection' },
			tools: { open: 'Devices and options' }
		}
	});
	init({ fallbackLocale: 'en', initialLocale: 'en' });
});

function renderTools(overrides: Record<string, unknown> = {}): string {
	const noop = vi.fn();
	return render(CallInCallTools, {
		props: {
			kind: 'video',
			quality: null,
			devices: [],
			microphoneId: null,
			cameraId: null,
			speakerId: null,
			onRefreshDevices: noop,
			onSelectMicrophone: noop,
			onSelectCamera: noop,
			onSelectSpeaker: noop,
			onToggleScreenShare: noop,
			onTogglePictureInPicture: noop,
			...overrides
		}
	}).body;
}

describe('CallInCallTools', () => {
	it('renders an honest unknown quality state and a discoverable device action', () => {
		const html = renderTools();
		expect(html).toContain('data-quality="unknown"');
		expect(html).toContain('aria-controls="call-quality-details"');
		expect(html).toContain('aria-controls="call-media-tools"');
		expect(html).toContain('Devices and options');
	});

	it('renders the measured rating without inventing unsupported actions', () => {
		const html = renderTools({
			quality: {
				sampledAt: 1,
				rating: 'poor',
				reasons: ['packet-loss'],
				metrics: {
					rttMs: 450,
					jitterMs: 55,
					packetLossPercent: 8,
					inboundBitrateKbps: 90,
					outboundBitrateKbps: 60,
					totalBitrateKbps: 150
				},
				baseline: {
					sampledAt: 1,
					inboundBytes: 0,
					outboundBytes: 0,
					inboundPacketsReceived: 0,
					inboundPacketsLost: 0,
					remotePacketsReceived: 0,
					remotePacketsLost: 0
				}
			},
			screenShareSupported: false,
			pictureInPictureSupported: false
		});
		expect(html).toContain('data-quality="poor"');
		expect(html).toContain('Weak connection');
		// Closed controls do not advertise unsupported share/PiP operations.
		expect(html).not.toContain('Share screen');
		expect(html).not.toContain('Floating window');
	});
});
