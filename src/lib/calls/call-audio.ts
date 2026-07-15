import type { CallRingtone } from './call-preferences';

export type CallAttentionMode = 'idle' | 'ringback' | 'incoming';

export interface CallAudioPreferences {
	ringtone: CallRingtone;
	ringtoneVolume: number;
	ringbackVolume: number;
	vibration: boolean;
}

interface AudioDependencies {
	createContext?: () => AudioContext | null;
	setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
	clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
	vibrate?: (pattern: number | number[]) => boolean;
}

const defaultCreateContext = (): AudioContext | null => {
	if (typeof window === 'undefined') return null;
	const AudioContextCtor = window.AudioContext ??
		(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	return AudioContextCtor ? new AudioContextCtor() : null;
};

/**
 * Owns every synthetic call tone and vibration. Keeping this out of Svelte
 * effects makes accept/decline/cancel cleanup immediate and deterministic.
 */
export class CallAudioManager {
	mode: CallAttentionMode = 'idle';
	unlocked = false;
	muted = false;
	reducedMotion = false;

	#context: AudioContext | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#generation = 0;
	#nodes = new Set<OscillatorNode>();
	#incomingHapticStarted = false;
	#incomingAudioScheduled = false;
	#preferences: CallAudioPreferences = {
		ringtone: 'classic',
		ringtoneVolume: 0.8,
		ringbackVolume: 0.55,
		vibration: true
	};
	#createContext: () => AudioContext | null;
	#setTimer: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
	#clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
	#vibrate: (pattern: number | number[]) => boolean;

	constructor(dependencies: AudioDependencies = {}) {
		this.#createContext = dependencies.createContext ?? defaultCreateContext;
		this.#setTimer = dependencies.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
		this.#clearTimer = dependencies.clearTimer ?? ((timer) => clearTimeout(timer));
		this.#vibrate = dependencies.vibrate ?? ((pattern) => {
			if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return false;
			return navigator.vibrate(pattern);
		});
	}

	/** Must be invoked synchronously from a click/tap to satisfy autoplay rules. */
	primeFromGesture(): void {
		const context = this.#ensureContext();
		if (!context) return;
		void context.resume().then(() => {
			this.unlocked = context.state === 'running';
		}).catch(() => undefined);
		try {
			const oscillator = context.createOscillator();
			const gain = context.createGain();
			gain.gain.setValueAtTime(0.00001, context.currentTime);
			oscillator.connect(gain).connect(context.destination);
			oscillator.start(context.currentTime);
			oscillator.stop(context.currentTime + 0.025);
			oscillator.onended = () => oscillator.disconnect();
		} catch {
			/* Browsers can reject before AudioContext has resumed; the next tap retries. */
		}
	}

	setMuted(muted: boolean): void {
		this.muted = muted;
		if (muted) this.stop();
	}

	setReducedMotion(reduced: boolean): void {
		this.reducedMotion = reduced;
		if (reduced) this.#vibrate(0);
	}

	configure(preferences: Partial<CallAudioPreferences>): void {
		const ringtone = preferences.ringtone;
		if (ringtone === 'classic' || ringtone === 'soft' || ringtone === 'pulse') {
			this.#preferences.ringtone = ringtone;
		}
		if (typeof preferences.ringtoneVolume === 'number' && Number.isFinite(preferences.ringtoneVolume)) {
			this.#preferences.ringtoneVolume = Math.min(1, Math.max(0, preferences.ringtoneVolume));
		}
		if (typeof preferences.ringbackVolume === 'number' && Number.isFinite(preferences.ringbackVolume)) {
			this.#preferences.ringbackVolume = Math.min(1, Math.max(0, preferences.ringbackVolume));
		}
		if (typeof preferences.vibration === 'boolean') {
			this.#preferences.vibration = preferences.vibration;
			if (!preferences.vibration) {
				this.#incomingHapticStarted = false;
				this.#vibrate(0);
			}
		}
		// Apply a changed tone/volume immediately without leaving overlapping
		// oscillator nodes behind. The active call attention mode is restored.
		const mode = this.mode;
		if (mode !== 'idle') {
			this.stop();
			this.#start(mode);
		}
	}

	startRingback(): void {
		this.#start('ringback');
	}

	startIncoming(): void {
		this.#start('incoming');
	}

	/**
	 * Confirms that an incoming call produced attention feedback beyond the
	 * visual overlay. `mode === 'incoming'` alone is not enough: iOS has no
	 * `navigator.vibrate`, and autoplay policy may keep AudioContext suspended.
	 * The caller may only be told “ringing” after one of those channels really
	 * started; otherwise delivery remains truthfully at “presented”.
	 */
	async confirmIncomingFeedback(): Promise<boolean> {
		if (this.mode !== 'incoming' || this.muted) return false;
		if (this.#incomingHapticStarted) return true;
		if (!this.#incomingAudioScheduled) return false;
		const context = this.#ensureContext();
		if (!context) return false;
		if (context.state === 'running') {
			this.unlocked = true;
			return true;
		}
		// `unlocked` records a successful gesture in the past, but mobile
		// browsers can suspend that same context while the app is backgrounded.
		// The live AudioContext state is the authority for this delivery ACK.
		this.unlocked = false;
		try {
			await context.resume();
			// TypeScript keeps the pre-await `state !== running` narrowing even
			// though resume() mutates the live AudioContext state.
			this.unlocked = String(context.state) === 'running';
		} catch {
			return false;
		}
		return this.mode === 'incoming' && !this.muted && this.unlocked;
	}

	stop(): void {
		this.#generation += 1;
		this.mode = 'idle';
		this.#incomingHapticStarted = false;
		this.#incomingAudioScheduled = false;
		if (this.#timer) this.#clearTimer(this.#timer);
		this.#timer = null;
		for (const node of this.#nodes) {
			try { node.stop(); } catch { /* already stopped */ }
			try { node.disconnect(); } catch { /* already disconnected */ }
		}
		this.#nodes.clear();
		this.#vibrate(0);
	}

	#start(mode: Exclude<CallAttentionMode, 'idle'>): void {
		if (this.mode === mode || this.muted) return;
		this.stop();
		this.mode = mode;
		const generation = ++this.#generation;
		const repeat = () => {
			if (generation !== this.#generation || this.mode !== mode || this.muted) return;
			if (mode === 'incoming') {
				this.#incomingAudioScheduled = this.#scheduleIncomingTone() || this.#incomingAudioScheduled;
				if (!this.reducedMotion && this.#preferences.vibration) {
					this.#incomingHapticStarted = this.#vibrate([180, 90, 180, 500, 220]) === true;
				}
			} else {
				const volume = this.#preferences.ringbackVolume;
				this.#tone(440, 0, 0.42, 0.055 * volume);
				this.#tone(480, 0, 0.42, 0.045 * volume);
				this.#tone(440, 0.58, 0.42, 0.055 * volume);
				this.#tone(480, 0.58, 0.42, 0.045 * volume);
			}
			this.#timer = this.#setTimer(repeat, mode === 'incoming' ? 2350 : 3300);
		};
		repeat();
	}

	#scheduleIncomingTone(): boolean {
		const volume = this.#preferences.ringtoneVolume;
		switch (this.#preferences.ringtone) {
			case 'soft':
				return [
					this.#tone(523, 0, 0.28, 0.055 * volume, 'sine'),
					this.#tone(659, 0.34, 0.34, 0.065 * volume, 'sine'),
					this.#tone(784, 0.76, 0.42, 0.06 * volume, 'sine')
				].some(Boolean);
			case 'pulse':
				return [
					this.#tone(740, 0, 0.1, 0.085 * volume, 'triangle'),
					this.#tone(880, 0.15, 0.1, 0.09 * volume, 'triangle'),
					this.#tone(740, 0.3, 0.1, 0.085 * volume, 'triangle'),
					this.#tone(988, 0.48, 0.22, 0.08 * volume, 'triangle')
				].some(Boolean);
			default:
				return [
					this.#tone(659, 0, 0.16, 0.09 * volume),
					this.#tone(784, 0.19, 0.16, 0.09 * volume),
					this.#tone(988, 0.42, 0.34, 0.1 * volume)
				].some(Boolean);
		}
	}

	#ensureContext(): AudioContext | null {
		if (this.#context && this.#context.state !== 'closed') return this.#context;
		try {
			this.#context = this.#createContext();
		} catch {
			this.#context = null;
		}
		return this.#context;
	}

	#tone(
		frequency: number,
		offset: number,
		duration: number,
		volume: number,
		waveform: OscillatorType = 'sine'
	): boolean {
		if (volume <= 0) return false;
		const context = this.#ensureContext();
		if (!context) return false;
		void context.resume().then(() => { this.unlocked = context.state === 'running'; }).catch(() => undefined);
		try {
			const start = context.currentTime + offset;
			const oscillator = context.createOscillator();
			const gain = context.createGain();
			oscillator.type = waveform;
			oscillator.frequency.setValueAtTime(frequency, start);
			gain.gain.setValueAtTime(0.0001, start);
			gain.gain.exponentialRampToValueAtTime(volume, start + 0.025);
			gain.gain.setValueAtTime(volume, start + Math.max(0.03, duration - 0.045));
			gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
			oscillator.connect(gain).connect(context.destination);
			this.#nodes.add(oscillator);
			oscillator.onended = () => {
				this.#nodes.delete(oscillator);
				oscillator.disconnect();
			};
			oscillator.start(start);
			oscillator.stop(start + duration + 0.01);
			return true;
		} catch {
			/* Call UI still works when the platform blocks synthetic audio. */
			return false;
		}
	}
}

export const callAudio = new CallAudioManager();
