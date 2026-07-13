/**
 * Canonical foreground moments shared by realtime, Postgres and Web Push.
 *
 * Every transport must carry the same stable `id`. Calling
 * `dispatchCoupleMoment` at each ingress then guarantees that the visual layer
 * sees the moment once, even when broadcast, postgres_changes and the service
 * worker all deliver it.
 */

export const COUPLE_MOMENT_EVENT = 'presuntinho:couple-moment';
export const COUPLE_MOMENT_SW_MESSAGE = 'presuntinho:push-event';

export type CoupleMomentKind = 'love' | 'nudge' | 'message' | 'heart-tap';
export type CoupleMomentSource = 'broadcast' | 'postgres' | 'push' | 'poll' | 'local';

/** Normalised event delivered to the visual layer. */
export interface CoupleMoment {
	/** Stable event/row UUID shared by every delivery transport. */
	id: string;
	kind: CoupleMomentKind;
	/** Sender account/profile id. Used by ingress code to reject self-events. */
	senderId?: string;
	/** Already-resolved display label, e.g. "Fatma" or "@jihzza". */
	senderName?: string;
	/** Optional fully-localised title supplied by Web Push. */
	title?: string;
	/** Optional message preview or transport-provided copy. */
	body?: string;
	/** Internal app destination opened when the moment is tapped. */
	href?: string;
	/** Epoch milliseconds. Defaults to receipt time when omitted. */
	createdAt: number;
	source: CoupleMomentSource;
}

/** Convenient ingress shape; receipt time/source are filled in automatically. */
export type CoupleMomentDetail = Omit<CoupleMoment, 'createdAt' | 'source'> & {
	createdAt?: number | string;
	source?: CoupleMomentSource;
};

export type CoupleMomentInput = CoupleMomentDetail;

/**
 * Tiny insertion-ordered exact-id set. It deliberately has no time heuristic:
 * two different moments close together are both valid, while the same id from
 * three transports is still one moment. Old ids are evicted to bound memory.
 */
export class BoundedIdDeduper {
	readonly maxSize: number;
	#ids = new Set<string>();

	constructor(maxSize = 256) {
		if (!Number.isFinite(maxSize) || maxSize < 1) {
			throw new RangeError('maxSize must be a positive finite number');
		}
		this.maxSize = Math.floor(maxSize);
	}

	/** True only for the first accepted occurrence of this exact non-empty id. */
	accept(id: string): boolean {
		const key = typeof id === 'string' ? id.trim() : '';
		if (!key || this.#ids.has(key)) return false;
		this.#ids.add(key);
		while (this.#ids.size > this.maxSize) {
			const oldest = this.#ids.values().next().value as string | undefined;
			if (oldest === undefined) break;
			this.#ids.delete(oldest);
		}
		return true;
	}

	has(id: string): boolean {
		return this.#ids.has(id.trim());
	}

	clear(): void {
		this.#ids.clear();
	}

	get size(): number {
		return this.#ids.size;
	}
}

const deliveredMomentIds = new BoundedIdDeduper(256);
const VALID_KINDS = new Set<CoupleMomentKind>(['love', 'nudge', 'message', 'heart-tap']);
const VALID_SOURCES = new Set<CoupleMomentSource>(['broadcast', 'postgres', 'push', 'poll', 'local']);

function pingsEnabledOnThisDevice(): boolean {
	try {
		const raw = localStorage.getItem('presuntinho-couple-prefs');
		return !raw || (JSON.parse(raw) as { pings?: boolean }).pings !== false;
	} catch {
		return true;
	}
}

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function optionalText(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const text = value.trim();
	return text || undefined;
}

function momentTime(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return Date.now();
}

/** Validate and normalise an untrusted realtime/service-worker payload. */
export function parseCoupleMoment(value: unknown, fallbackSource: CoupleMomentSource = 'local'): CoupleMoment | null {
	const raw = record(value);
	if (!raw) return null;
	const id = optionalText(raw.id);
	const kind = raw.kind;
	if (!id || typeof kind !== 'string' || !VALID_KINDS.has(kind as CoupleMomentKind)) return null;
	const source =
		typeof raw.source === 'string' && VALID_SOURCES.has(raw.source as CoupleMomentSource)
			? (raw.source as CoupleMomentSource)
			: fallbackSource;
	return {
		id,
		kind: kind as CoupleMomentKind,
		senderId: optionalText(raw.senderId),
		senderName: optionalText(raw.senderName),
		title: optionalText(raw.title),
		body: optionalText(raw.body),
		href: optionalText(raw.href),
		createdAt: momentTime(raw.createdAt),
		source
	};
}

/**
 * Dispatch one validated moment to the global visual layer.
 * Returns false for malformed/duplicate input or outside the browser.
 */
export function presentCoupleMoment(detail: CoupleMomentDetail | CoupleMoment | unknown): boolean {
	if (typeof window === 'undefined') return false;
	// Realtime subscriptions remain alive in background tabs. Let Web Push own
	// that state; otherwise a hidden tab consumes the animation and can vibrate
	// alongside the system notification before the user returns to the app.
	if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
	const moment = parseCoupleMoment(detail);
	if (moment && (moment.kind === 'love' || moment.kind === 'nudge') && !pingsEnabledOnThisDevice()) {
		return false;
	}
	if (!moment || !deliveredMomentIds.accept(moment.id)) return false;
	window.dispatchEvent(new CustomEvent<CoupleMoment>(COUPLE_MOMENT_EVENT, { detail: moment }));
	return true;
}

/** Compatibility alias; prefer `presentCoupleMoment` at new ingress points. */
export const dispatchCoupleMoment = presentCoupleMoment;

/** Test/logout helper; normal app code should not need to clear delivery ids. */
export function resetCoupleMomentDedupe(): void {
	deliveredMomentIds.clear();
}

/**
 * Bridge messages posted by `push-sw.js` into the same exact-id dispatcher.
 * Primary worker shape:
 *   { type: 'presuntinho:push-event', eventId, kind, title, body, url, senderId }
 *
 * Canonical `{ moment }` / `{ payload }` envelopes are also accepted so this
 * bridge remains useful to alternate service-worker implementations.
 */
export function bindForegroundPushMoments(): () => void {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {};
	const serviceWorker = navigator.serviceWorker;
	const onMessage = (event: MessageEvent<unknown>) => {
		const envelope = record(event.data);
		if (!envelope) return;
		const canonicalEnvelope = envelope.type === COUPLE_MOMENT_EVENT;
		const pushEnvelope = envelope.type === COUPLE_MOMENT_SW_MESSAGE;
		if (!canonicalEnvelope && !pushEnvelope) return;
		const candidate =
			envelope.moment ??
			envelope.payload ??
			(pushEnvelope
				? {
						id: envelope.eventId ?? envelope.id,
						// A foreground push self-test uses the normal message presentation;
						// `test` is a transport kind, not a user-facing couple moment kind.
						kind: envelope.kind === 'test' ? 'message' : envelope.kind,
						senderId: envelope.senderId,
						senderName: envelope.senderName,
						title: envelope.title,
						body: envelope.body,
						href: envelope.url,
						createdAt: envelope.createdAt,
						source: 'push'
					}
				: null);
		const parsed = parseCoupleMoment(candidate, 'push');
		if (parsed) presentCoupleMoment({ ...parsed, source: 'push' });
	};
	serviceWorker.addEventListener('message', onMessage);
	return () => serviceWorker.removeEventListener('message', onMessage);
}

/** Compatibility alias for the original descriptive name. */
export const bindCoupleMomentServiceWorker = bindForegroundPushMoments;

declare global {
	interface WindowEventMap {
		'presuntinho:couple-moment': CustomEvent<CoupleMoment>;
	}
}
