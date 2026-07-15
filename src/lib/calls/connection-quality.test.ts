import { describe, expect, it, vi } from 'vitest';
import {
	ConnectionQualityMonitor,
	classifyConnectionQuality,
	deriveConnectionQuality
} from './connection-quality';

function report(...stats: Record<string, unknown>[]): RTCStatsReport {
	const values = new Map(stats.map((stat, index) => [String(index), stat]));
	return values as unknown as RTCStatsReport;
}

describe('deriveConnectionQuality', () => {
	it('produces a good first sample from healthy impairment metrics', () => {
		const sample = deriveConnectionQuality(
			report(
				{
					type: 'inbound-rtp',
					kind: 'audio',
					bytesReceived: 10_000,
					packetsReceived: 99,
					packetsLost: 1,
					jitter: 0.01
				},
				{ type: 'outbound-rtp', kind: 'audio', bytesSent: 5_000 },
				{
					type: 'candidate-pair',
					state: 'succeeded',
					nominated: true,
					currentRoundTripTime: 0.08
				}
			),
			1_000
		);
		expect(sample.rating).toBe('good');
		expect(sample.metrics).toEqual({
			rttMs: 80,
			jitterMs: 10,
			packetLossPercent: 1,
			inboundBitrateKbps: null,
			outboundBitrateKbps: null,
			totalBitrateKbps: null
		});
	});

	it('uses counter deltas for bitrate and current packet loss', () => {
		const first = deriveConnectionQuality(
			report(
				{ type: 'inbound-rtp', kind: 'video', bytesReceived: 100_000, packetsReceived: 1_000, packetsLost: 10 },
				{ type: 'outbound-rtp', kind: 'video', bytesSent: 50_000 }
			),
			1_000
		);
		const second = deriveConnectionQuality(
			report(
				{
					type: 'inbound-rtp',
					kind: 'video',
					bytesReceived: 350_000,
					packetsReceived: 1_095,
					packetsLost: 15,
					jitter: 0.055
				},
				{ type: 'outbound-rtp', kind: 'video', bytesSent: 175_000 },
				{
					type: 'candidate-pair',
					state: 'succeeded',
					selected: true,
					currentRoundTripTime: 0.45
				}
			),
			3_000,
			first.baseline
		);
		expect(second.metrics.inboundBitrateKbps).toBe(1_000);
		expect(second.metrics.outboundBitrateKbps).toBe(500);
		expect(second.metrics.totalBitrateKbps).toBe(1_500);
		expect(second.metrics.packetLossPercent).toBe(5);
		expect(second.rating).toBe('poor');
		expect(second.reasons).toEqual(expect.arrayContaining(['high-rtt', 'high-jitter', 'packet-loss']));
	});

	it('takes the worse available direction and ignores RTX/FEC-like RTP entries without a media kind', () => {
		const sample = deriveConnectionQuality(
			report(
				{ type: 'inbound-rtp', kind: 'audio', packetsReceived: 100, packetsLost: 0, jitter: 0.005 },
				{ type: 'inbound-rtp', bytesReceived: 999_999, packetsReceived: 1, packetsLost: 99 },
				{
					type: 'remote-inbound-rtp',
					kind: 'audio',
					fractionLost: 0.03,
					roundTripTime: 0.22
				}
			),
			1_000
		);
		expect(sample.metrics.packetLossPercent).toBe(3);
		expect(sample.metrics.rttMs).toBe(220);
		expect(sample.rating).toBe('fair');
	});

	it('returns unknown when the browser exposes no useful telemetry', () => {
		const sample = deriveConnectionQuality(report({ type: 'codec', mimeType: 'audio/opus' }), 1_000);
		expect(sample.rating).toBe('unknown');
		expect(sample.reasons).toEqual(['telemetry-unavailable']);
	});

	it('does not invent 100% outbound loss when remote packet totals are unavailable', () => {
		const sample = deriveConnectionQuality(
			report({ type: 'remote-inbound-rtp', kind: 'audio', packetsLost: 4, roundTripTime: 0.09 }),
			1_000
		);
		expect(sample.metrics.packetLossPercent).toBeNull();
		expect(sample.rating).toBe('good');
	});

	it('does not turn a counter reset into a false zero bitrate', () => {
		const first = deriveConnectionQuality(
			report({ type: 'inbound-rtp', kind: 'audio', bytesReceived: 50_000, packetsReceived: 500, packetsLost: 2 }),
			1_000
		);
		const reset = deriveConnectionQuality(
			report({ type: 'inbound-rtp', kind: 'audio', bytesReceived: 1_000, packetsReceived: 10, packetsLost: 0 }),
			3_000,
			first.baseline
		);
		expect(reset.metrics.inboundBitrateKbps).toBeNull();
		expect(reset.metrics.packetLossPercent).toBeNull();
	});
});

describe('classifyConnectionQuality', () => {
	it('only applies bitrate thresholds when the caller knows media should be active', () => {
		const metrics = {
			rttMs: 80,
			jitterMs: 5,
			packetLossPercent: 0,
			inboundBitrateKbps: 20,
			outboundBitrateKbps: 20,
			totalBitrateKbps: 40
		};
		expect(classifyConnectionQuality(metrics).rating).toBe('good');
		expect(
			classifyConnectionQuality(metrics, {
				fairMinimumBitrateKbps: 500,
				poorMinimumBitrateKbps: 100
			})
		).toEqual({ rating: 'poor', reasons: ['low-bitrate'] });
	});
});

describe('ConnectionQualityMonitor', () => {
	it('publishes an honest unknown sample when getStats fails', async () => {
		const onUpdate = vi.fn();
		const monitor = new ConnectionQualityMonitor(
			{ getStats: vi.fn(async () => { throw new Error('closed'); }) },
			{ onUpdate, now: () => 42 }
		);
		const sample = await monitor.sample();
		expect(sample?.rating).toBe('unknown');
		expect(sample?.sampledAt).toBe(42);
		expect(onUpdate).toHaveBeenCalledWith(sample);
	});

	it('never overlaps getStats samples', async () => {
		let resolve!: (value: RTCStatsReport) => void;
		const getStats = vi.fn(() => new Promise<RTCStatsReport>((done) => { resolve = done; }));
		const monitor = new ConnectionQualityMonitor(
			{ getStats },
			{ onUpdate: vi.fn(), now: () => 1 }
		);
		const first = monitor.sample();
		expect(await monitor.sample()).toBeNull();
		expect(getStats).toHaveBeenCalledOnce();
		resolve(report());
		await first;
	});

	it('does not publish a sample that resolves after the monitor is stopped', async () => {
		let resolve!: (value: RTCStatsReport) => void;
		const onUpdate = vi.fn();
		const monitor = new ConnectionQualityMonitor(
			{ getStats: () => new Promise<RTCStatsReport>((done) => { resolve = done; }) },
			{ onUpdate }
		);
		const pending = monitor.sample();
		monitor.stop();
		resolve(report({ type: 'candidate-pair', state: 'succeeded', selected: true, currentRoundTripTime: 0.1 }));
		expect(await pending).toBeNull();
		expect(onUpdate).not.toHaveBeenCalled();
	});
});
