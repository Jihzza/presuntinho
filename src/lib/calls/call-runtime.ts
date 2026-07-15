export type CallWakeLockState = 'unsupported' | 'inactive' | 'requesting' | 'held' | 'failed';

export interface CallWakeLockSentinel {
	released?: boolean;
	release(): Promise<void>;
	addEventListener?(type: 'release', listener: () => void, options?: AddEventListenerOptions): void;
	removeEventListener?(type: 'release', listener: () => void): void;
}

interface WakeLockPort {
	request(type: 'screen'): Promise<CallWakeLockSentinel>;
}

interface WakeLockNavigatorPort {
	wakeLock?: WakeLockPort;
}

interface VisibilityDocumentPort {
	visibilityState: DocumentVisibilityState;
	addEventListener(type: 'visibilitychange', listener: () => void): void;
	removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface CallWakeLockControllerOptions {
	navigator?: WakeLockNavigatorPort;
	document?: VisibilityDocumentPort;
	onChange?: (state: CallWakeLockState) => void;
}

/**
 * Keeps the display awake only while a connected call owns this controller.
 * Browser revocation and backgrounding are expected: a visible document gets
 * one fresh request, while denial remains an honest non-fatal `failed` state.
 */
export class CallWakeLockController {
	#navigator: WakeLockNavigatorPort | undefined;
	#document: VisibilityDocumentPort | undefined;
	#onChange: ((state: CallWakeLockState) => void) | undefined;
	#sentinel: CallWakeLockSentinel | null = null;
	#request: Promise<void> | null = null;
	#generation = 0;
	#enabled = false;
	#listening = false;
	state: CallWakeLockState;

	constructor(options: CallWakeLockControllerOptions = {}) {
		this.#navigator = options.navigator ?? (
			typeof navigator !== 'undefined' ? navigator as unknown as WakeLockNavigatorPort : undefined
		);
		this.#document = options.document ?? (
			typeof document !== 'undefined' ? document as unknown as VisibilityDocumentPort : undefined
		);
		this.#onChange = options.onChange;
		this.state = this.#navigator?.wakeLock ? 'inactive' : 'unsupported';
	}

	get supported(): boolean {
		return Boolean(this.#navigator?.wakeLock);
	}

	start(): void {
		if (this.#enabled) return;
		this.#enabled = true;
		if (!this.supported) {
			this.#setState('unsupported');
			return;
		}
		if (!this.#listening && this.#document) {
			this.#document.addEventListener('visibilitychange', this.#onVisibilityChange);
			this.#listening = true;
		}
		if (!this.#document || this.#document.visibilityState === 'visible') void this.#acquire();
	}

	async stop(): Promise<void> {
		if (!this.#enabled && !this.#sentinel && !this.#request) return;
		this.#enabled = false;
		this.#generation += 1;
		if (this.#listening && this.#document) {
			this.#document.removeEventListener('visibilitychange', this.#onVisibilityChange);
			this.#listening = false;
		}
		const sentinel = this.#sentinel;
		this.#sentinel = null;
		if (sentinel) {
			sentinel.removeEventListener?.('release', this.#onReleased);
			if (!sentinel.released) await sentinel.release().catch(() => undefined);
		}
		this.#setState(this.supported ? 'inactive' : 'unsupported');
	}

	#onVisibilityChange = (): void => {
		if (!this.#enabled || this.#document?.visibilityState !== 'visible') return;
		void this.#acquire();
	};

	#onReleased = (): void => {
		const sentinel = this.#sentinel;
		sentinel?.removeEventListener?.('release', this.#onReleased);
		this.#sentinel = null;
		if (!this.#enabled) {
			this.#setState(this.supported ? 'inactive' : 'unsupported');
			return;
		}
		this.#setState('inactive');
		// A visible browser can revoke a sentinel during a display transition.
		// Queue exactly one coalesced reacquisition; failures do not loop.
		if (!this.#document || this.#document.visibilityState === 'visible') {
			queueMicrotask(() => void this.#acquire());
		}
	};

	#acquire(): Promise<void> {
		if (!this.#enabled || !this.#navigator?.wakeLock || this.#sentinel) {
			return Promise.resolve();
		}
		if (this.#request) return this.#request;
		const generation = this.#generation;
		this.#setState('requesting');
		let request: Promise<void>;
		request = this.#navigator.wakeLock.request('screen').then(async (sentinel) => {
			if (!this.#enabled || generation !== this.#generation) {
				if (!sentinel.released) await sentinel.release().catch(() => undefined);
				return;
			}
			this.#sentinel = sentinel;
			sentinel.addEventListener?.('release', this.#onReleased);
			this.#setState('held');
		}).catch(() => {
			if (this.#enabled && generation === this.#generation) this.#setState('failed');
		}).finally(() => {
			if (this.#request === request) this.#request = null;
			// A finished call can release while the next call has already started.
			// The second start initially coalesces on this stale request; once it
			// settles, perform exactly one acquisition for the newer generation.
			if (
				this.#enabled &&
				generation !== this.#generation &&
				!this.#sentinel &&
				(!this.#document || this.#document.visibilityState === 'visible')
			) queueMicrotask(() => void this.#acquire());
		});
		this.#request = request;
		return request;
	}

	#setState(state: CallWakeLockState): void {
		if (this.state === state) return;
		this.state = state;
		this.#onChange?.(state);
	}
}

type WebkitPresentationMode = 'inline' | 'picture-in-picture' | 'fullscreen';

export interface PictureInPictureVideoPort {
	requestPictureInPicture?: () => Promise<unknown>;
	webkitSupportsPresentationMode?: (mode: WebkitPresentationMode) => boolean;
	webkitPresentationMode?: WebkitPresentationMode;
	webkitSetPresentationMode?: (mode: WebkitPresentationMode) => void;
}

export interface PictureInPictureDocumentPort {
	pictureInPictureEnabled?: boolean;
	pictureInPictureElement?: unknown;
	exitPictureInPicture?: () => Promise<void>;
}

export type PictureInPictureMode = 'standard' | 'webkit' | null;
export type PictureInPictureResult =
	| { status: 'entered' | 'exited'; mode: Exclude<PictureInPictureMode, null> }
	| { status: 'not-active'; mode: Exclude<PictureInPictureMode, null> }
	| { status: 'unsupported' }
	| { status: 'failed'; reason: 'not-allowed' | 'invalid-state' | 'security' | 'unknown' };

export function pictureInPictureMode(
	video: PictureInPictureVideoPort | null | undefined,
	doc: PictureInPictureDocumentPort | null | undefined = typeof document !== 'undefined'
		? document as unknown as PictureInPictureDocumentPort
		: undefined
): PictureInPictureMode {
	if (!video) return null;
	if (doc?.pictureInPictureEnabled === true && typeof video.requestPictureInPicture === 'function') {
		return 'standard';
	}
	try {
		if (
			typeof video.webkitSupportsPresentationMode === 'function' &&
			video.webkitSupportsPresentationMode('picture-in-picture') === true &&
			typeof video.webkitSetPresentationMode === 'function'
		) return 'webkit';
	} catch {
		return null;
	}
	return null;
}

function pictureInPictureFailure(error: unknown): PictureInPictureResult {
	const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
	if (name === 'NotAllowedError') return { status: 'failed', reason: 'not-allowed' };
	if (name === 'InvalidStateError') return { status: 'failed', reason: 'invalid-state' };
	if (name === 'SecurityError') return { status: 'failed', reason: 'security' };
	return { status: 'failed', reason: 'unknown' };
}

/** Feature-detected PiP toggle; callers only render the action for a non-null mode. */
export async function setPictureInPicture(
	video: PictureInPictureVideoPort | null | undefined,
	active: boolean,
	doc: PictureInPictureDocumentPort | null | undefined = typeof document !== 'undefined'
		? document as unknown as PictureInPictureDocumentPort
		: undefined
): Promise<PictureInPictureResult> {
	const mode = pictureInPictureMode(video, doc);
	if (!video || !mode) return { status: 'unsupported' };
	try {
		if (mode === 'standard') {
			if (active) await video.requestPictureInPicture?.();
			else {
				if (doc?.pictureInPictureElement !== video) return { status: 'not-active', mode };
				if (!doc.exitPictureInPicture) return { status: 'failed', reason: 'invalid-state' };
				await doc.exitPictureInPicture();
			}
			return { status: active ? 'entered' : 'exited', mode };
		}
		if (!active && video.webkitPresentationMode !== 'picture-in-picture') {
			return { status: 'not-active', mode };
		}
		video.webkitSetPresentationMode?.(active ? 'picture-in-picture' : 'inline');
		return { status: active ? 'entered' : 'exited', mode };
	} catch (error) {
		return pictureInPictureFailure(error);
	}
}
