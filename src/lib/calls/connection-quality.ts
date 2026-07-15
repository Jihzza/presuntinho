export type ConnectionQualityRating = 'good' | 'fair' | 'poor' | 'unknown';

export type ConnectionQualityReason =
	| 'high-rtt'
	| 'high-jitter'
	| 'packet-loss'
	| 'low-bitrate'
	| 'telemetry-unavailable';

export interface ConnectionQualityMetrics {
	rttMs: number | null;
	jitterMs: number | null;
	packetLossPercent: number | null;
	inboundBitrateKbps: number | null;
	outboundBitrateKbps: number | null;
	totalBitrateKbps: number | null;
}

export interface ConnectionQualityThresholds {
	fairRttMs: number;
	poorRttMs: number;
	fairJitterMs: number;
	poorJitterMs: number;
	fairPacketLossPercent: number;
	poorPacketLossPercent: number;
	/**
	 * Disabled by default because silence suppression and static screen shares
	 * can legitimately produce low bitrates. Enable only while media is known
	 * to be active (for example, a moving camera preview).
	 */
	fairMinimumBitrateKbps: number | null;
	poorMinimumBitrateKbps: number | null;
}

export interface ConnectionQualityBaseline {
	sampledAt: number;
	inboundBytes: number;
	outboundBytes: number;
	inboundPacketsReceived: number;
	inboundPacketsLost: number;
	remotePacketsReceived: number;
	remotePacketsLost: number;
}

export interface ConnectionQualitySample {
	sampledAt: number;
	rating: ConnectionQualityRating;
	reasons: ConnectionQualityReason[];
	metrics: ConnectionQualityMetrics;
	baseline: ConnectionQualityBaseline;
}

export interface ConnectionQualityMonitorOptions {
	intervalMs?: number;
	thresholds?: Partial<ConnectionQualityThresholds>;
	onUpdate: (sample: ConnectionQualitySample) => void;
	now?: () => number;
}

const DEFAULT_THRESHOLDS: ConnectionQualityThresholds = {
	fairRttMs: 200,
	poorRttMs: 400,
	fairJitterMs: 30,
	poorJitterMs: 50,
	fairPacketLossPercent: 2,
	poorPacketLossPercent: 5,
	fairMinimumBitrateKbps: null,
	poorMinimumBitrateKbps: null
};

const EMPTY_METRICS: ConnectionQualityMetrics = {
	rttMs: null,
	jitterMs: null,
	packetLossPercent: null,
	inboundBitrateKbps: null,
	outboundBitrateKbps: null,
	totalBitrateKbps: null
};

interface CollectedStats extends Omit<ConnectionQualityBaseline, 'sampledAt'> {
	rttValuesMs: number[];
	jitterValuesMs: number[];
	remoteFractionLossPercent: number[];
}

function finite(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegative(value: unknown): number {
	const number = finite(value);
	return number == null ? 0 : Math.max(0, number);
}

function isPrimaryRtpStat(stat: Record<string, unknown>): boolean {
	const kind = stat.kind ?? stat.mediaType;
	return (kind === 'audio' || kind === 'video') && stat.isRemote !== true;
}

function collectStats(report: RTCStatsReport): CollectedStats {
	const collected: CollectedStats = {
		inboundBytes: 0,
		outboundBytes: 0,
		inboundPacketsReceived: 0,
		inboundPacketsLost: 0,
		remotePacketsReceived: 0,
		remotePacketsLost: 0,
		rttValuesMs: [],
		jitterValuesMs: [],
		remoteFractionLossPercent: []
	};
	report.forEach((raw) => {
		const stat = raw as unknown as Record<string, unknown>;
		if (stat.type === 'inbound-rtp' && isPrimaryRtpStat(stat)) {
			collected.inboundBytes += nonNegative(stat.bytesReceived);
			collected.inboundPacketsReceived += nonNegative(stat.packetsReceived);
			collected.inboundPacketsLost += nonNegative(stat.packetsLost);
			const jitter = finite(stat.jitter);
			if (jitter != null && jitter >= 0) collected.jitterValuesMs.push(jitter * 1_000);
			return;
		}
		if (stat.type === 'outbound-rtp' && isPrimaryRtpStat(stat)) {
			collected.outboundBytes += nonNegative(stat.bytesSent);
			return;
		}
		if (stat.type === 'remote-inbound-rtp' && isPrimaryRtpStat(stat)) {
			collected.remotePacketsReceived += nonNegative(stat.packetsReceived);
			collected.remotePacketsLost += nonNegative(stat.packetsLost);
			const rtt = finite(stat.roundTripTime);
			if (rtt != null && rtt >= 0) collected.rttValuesMs.push(rtt * 1_000);
			const jitter = finite(stat.jitter);
			if (jitter != null && jitter >= 0) collected.jitterValuesMs.push(jitter * 1_000);
			const fractionLost = finite(stat.fractionLost);
			if (fractionLost != null && fractionLost >= 0) {
				collected.remoteFractionLossPercent.push(Math.min(100, fractionLost * 100));
			}
			return;
		}
		if (
			stat.type === 'candidate-pair' &&
			stat.state === 'succeeded' &&
			(stat.nominated === true || stat.selected === true)
		) {
			const rtt = finite(stat.currentRoundTripTime);
			if (rtt != null && rtt >= 0) collected.rttValuesMs.push(rtt * 1_000);
		}
	});
	return collected;
}

function maximum(values: number[]): number | null {
	return values.length ? Math.max(...values) : null;
}

function delta(current: number, previous: number): number | null {
	return current >= previous ? current - previous : null;
}

function bitrateKbps(current: number, previous: number, elapsedMs: number): number | null {
	const bytes = delta(current, previous);
	if (bytes == null || elapsedMs <= 0) return null;
	return (bytes * 8) / elapsedMs;
}

function lossPercent(received: number, lost: number, previousReceived?: number, previousLost?: number): number | null {
	const receivedValue = previousReceived == null ? received : delta(received, previousReceived);
	const lostValue = previousLost == null ? lost : delta(lost, previousLost);
	if (receivedValue == null || lostValue == null) return null;
	const total = receivedValue + lostValue;
	return total > 0 ? (lostValue / total) * 100 : null;
}

function rounded(value: number | null, digits = 1): number | null {
	if (value == null) return null;
	const scale = 10 ** digits;
	return Math.round(value * scale) / scale;
}

function makeBaseline(collected: CollectedStats, sampledAt: number): ConnectionQualityBaseline {
	return {
		sampledAt,
		inboundBytes: collected.inboundBytes,
		outboundBytes: collected.outboundBytes,
		inboundPacketsReceived: collected.inboundPacketsReceived,
		inboundPacketsLost: collected.inboundPacketsLost,
		remotePacketsReceived: collected.remotePacketsReceived,
		remotePacketsLost: collected.remotePacketsLost
	};
}

function mergeThresholds(overrides?: Partial<ConnectionQualityThresholds>): ConnectionQualityThresholds {
	return { ...DEFAULT_THRESHOLDS, ...overrides };
}

export function classifyConnectionQuality(
	metrics: ConnectionQualityMetrics,
	overrides?: Partial<ConnectionQualityThresholds>
): Pick<ConnectionQualitySample, 'rating' | 'reasons'> {
	const thresholds = mergeThresholds(overrides);
	const reasons: ConnectionQualityReason[] = [];
	let severity: number = 0;
	const mark = (level: 1 | 2, reason: ConnectionQualityReason) => {
		severity = Math.max(severity, level);
		if (!reasons.includes(reason)) reasons.push(reason);
	};
	if (metrics.rttMs != null) {
		if (metrics.rttMs >= thresholds.poorRttMs) mark(2, 'high-rtt');
		else if (metrics.rttMs >= thresholds.fairRttMs) mark(1, 'high-rtt');
	}
	if (metrics.jitterMs != null) {
		if (metrics.jitterMs >= thresholds.poorJitterMs) mark(2, 'high-jitter');
		else if (metrics.jitterMs >= thresholds.fairJitterMs) mark(1, 'high-jitter');
	}
	if (metrics.packetLossPercent != null) {
		if (metrics.packetLossPercent >= thresholds.poorPacketLossPercent) mark(2, 'packet-loss');
		else if (metrics.packetLossPercent >= thresholds.fairPacketLossPercent) mark(1, 'packet-loss');
	}
	if (metrics.totalBitrateKbps != null && thresholds.poorMinimumBitrateKbps != null) {
		if (metrics.totalBitrateKbps < thresholds.poorMinimumBitrateKbps) mark(2, 'low-bitrate');
		else if (
			thresholds.fairMinimumBitrateKbps != null &&
			metrics.totalBitrateKbps < thresholds.fairMinimumBitrateKbps
		) mark(1, 'low-bitrate');
	}
	const hasTelemetry = Object.values(metrics).some((value) => value != null);
	if (!hasTelemetry) return { rating: 'unknown', reasons: ['telemetry-unavailable'] };
	return { rating: severity === 2 ? 'poor' : severity === 1 ? 'fair' : 'good', reasons };
}

/** Converts one getStats report into stable, UI-ready metrics. */
export function deriveConnectionQuality(
	report: RTCStatsReport,
	sampledAt: number,
	previous?: ConnectionQualityBaseline | null,
	thresholds?: Partial<ConnectionQualityThresholds>
): ConnectionQualitySample {
	const collected = collectStats(report);
	const baseline = makeBaseline(collected, sampledAt);
	const elapsedMs = previous ? sampledAt - previous.sampledAt : 0;
	const inboundBitrate = previous
		? bitrateKbps(collected.inboundBytes, previous.inboundBytes, elapsedMs)
		: null;
	const outboundBitrate = previous
		? bitrateKbps(collected.outboundBytes, previous.outboundBytes, elapsedMs)
		: null;
	const inboundLoss = lossPercent(
		collected.inboundPacketsReceived,
		collected.inboundPacketsLost,
		previous?.inboundPacketsReceived,
		previous?.inboundPacketsLost
	);
	const remoteCounterLoss = collected.remotePacketsReceived > 0
		? lossPercent(
				collected.remotePacketsReceived,
				collected.remotePacketsLost,
				previous?.remotePacketsReceived,
				previous?.remotePacketsLost
			)
		: null;
	const remoteLoss = maximum([
		...collected.remoteFractionLossPercent,
		...(remoteCounterLoss == null ? [] : [remoteCounterLoss])
	]);
	const metrics: ConnectionQualityMetrics = {
		rttMs: rounded(maximum(collected.rttValuesMs)),
		jitterMs: rounded(maximum(collected.jitterValuesMs)),
		packetLossPercent: rounded(maximum([...(inboundLoss == null ? [] : [inboundLoss]), ...(remoteLoss == null ? [] : [remoteLoss])])),
		inboundBitrateKbps: rounded(inboundBitrate),
		outboundBitrateKbps: rounded(outboundBitrate),
		totalBitrateKbps: rounded(
			inboundBitrate == null && outboundBitrate == null
				? null
				: (inboundBitrate ?? 0) + (outboundBitrate ?? 0)
		)
	};
	const classification = classifyConnectionQuality(metrics, thresholds);
	return { sampledAt, ...classification, metrics, baseline };
}

function unavailableSample(sampledAt: number): ConnectionQualitySample {
	return {
		sampledAt,
		rating: 'unknown',
		reasons: ['telemetry-unavailable'],
		metrics: { ...EMPTY_METRICS },
		baseline: {
			sampledAt,
			inboundBytes: 0,
			outboundBytes: 0,
			inboundPacketsReceived: 0,
			inboundPacketsLost: 0,
			remotePacketsReceived: 0,
			remotePacketsLost: 0
		}
	};
}

/** A non-overlapping, low-frequency getStats sampler for the in-call UI. */
export class ConnectionQualityMonitor {
	#peerConnection: Pick<RTCPeerConnection, 'getStats'>;
	#options: ConnectionQualityMonitorOptions;
	#baseline: ConnectionQualityBaseline | null = null;
	#timer: ReturnType<typeof setInterval> | null = null;
	#sampling = false;
	#generation = 0;

	constructor(
		peerConnection: Pick<RTCPeerConnection, 'getStats'>,
		options: ConnectionQualityMonitorOptions
	) {
		this.#peerConnection = peerConnection;
		this.#options = options;
	}

	get running(): boolean {
		return this.#timer != null;
	}

	start(): void {
		if (this.#timer != null) return;
		const interval = Math.max(1_000, this.#options.intervalMs ?? 2_500);
		this.#timer = setInterval(() => void this.sample(), interval);
		void this.sample();
	}

	stop(): void {
		if (this.#timer != null) clearInterval(this.#timer);
		this.#timer = null;
		this.#baseline = null;
		this.#generation += 1;
	}

	async sample(): Promise<ConnectionQualitySample | null> {
		if (this.#sampling) return null;
		this.#sampling = true;
		const generation = this.#generation;
		const sampledAt = (this.#options.now ?? Date.now)();
		try {
			const report = await this.#peerConnection.getStats();
			if (generation !== this.#generation) return null;
			const sample = deriveConnectionQuality(
				report,
				sampledAt,
				this.#baseline,
				this.#options.thresholds
			);
			this.#baseline = sample.baseline;
			this.#publish(sample);
			return sample;
		} catch {
			if (generation !== this.#generation) return null;
			const sample = unavailableSample(sampledAt);
			this.#baseline = null;
			this.#publish(sample);
			return sample;
		} finally {
			this.#sampling = false;
		}
	}

	#publish(sample: ConnectionQualitySample): void {
		try {
			this.#options.onUpdate(sample);
		} catch {
			// A rendering callback must not stop future network samples.
		}
	}
}
