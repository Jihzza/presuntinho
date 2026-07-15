import { describe, expect, it, vi } from 'vitest';
import { CallAudioManager } from './call-audio';

function fakeContext() {
	const oscillator = () => ({
		type: 'sine',
		frequency: { setValueAtTime: vi.fn() },
		connect: vi.fn(() => ({ connect: vi.fn() })),
		disconnect: vi.fn(),
		start: vi.fn(),
		stop: vi.fn(),
		onended: null as (() => void) | null
	});
	const gain = () => ({
		gain: {
			setValueAtTime: vi.fn(),
			exponentialRampToValueAtTime: vi.fn()
		},
		connect: vi.fn(() => ({ connect: vi.fn() }))
	});
	return {
		state: 'running',
		currentTime: 0,
		destination: {},
		resume: vi.fn(async () => undefined),
		createOscillator: vi.fn(oscillator),
		createGain: vi.fn(gain)
	} as unknown as AudioContext;
}

describe('CallAudioManager', () => {
	it('primes audio in the gesture and cleans ringtone plus vibration deterministically', async () => {
		vi.useFakeTimers();
		const vibrate = vi.fn(() => true);
		const context = fakeContext();
		const audio = new CallAudioManager({ createContext: () => context, vibrate });
		audio.primeFromGesture();
		audio.startIncoming();
		expect(audio.mode).toBe('incoming');
		expect(vibrate).toHaveBeenCalledWith([180, 90, 180, 500, 220]);
		expect(await audio.confirmIncomingFeedback()).toBe(true);
		audio.stop();
		expect(audio.mode).toBe('idle');
		expect(vibrate).toHaveBeenLastCalledWith(0);
		const callsAfterStop = vibrate.mock.calls.length;
		vi.advanceTimersByTime(5000);
		expect(vibrate).toHaveBeenCalledTimes(callsAfterStop);
		vi.useRealTimers();
	});

	it('does not claim real ringing when autoplay is blocked and haptics are unavailable', async () => {
		const context = fakeContext();
		Object.defineProperty(context, 'state', { configurable: true, value: 'suspended' });
		(context.resume as ReturnType<typeof vi.fn>).mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
		const audio = new CallAudioManager({ createContext: () => context, vibrate: () => false });
		audio.startIncoming();
		expect(audio.mode).toBe('incoming');
		expect(await audio.confirmIncomingFeedback()).toBe(false);
	});

	it('confirms ringing when audio resumes even without navigator vibration', async () => {
		const context = fakeContext();
		Object.defineProperty(context, 'state', { configurable: true, writable: true, value: 'suspended' });
		(context.resume as ReturnType<typeof vi.fn>).mockImplementation(async () => {
			Object.defineProperty(context, 'state', { configurable: true, writable: true, value: 'running' });
		});
		const audio = new CallAudioManager({ createContext: () => context, vibrate: () => false });
		audio.startIncoming();
		expect(await audio.confirmIncomingFeedback()).toBe(true);
	});

	it('rejects a stale unlock after background suspension when resume is blocked', async () => {
		const context = fakeContext();
		const audio = new CallAudioManager({ createContext: () => context, vibrate: () => false });
		audio.primeFromGesture();
		await Promise.resolve();
		expect(audio.unlocked).toBe(true);
		Object.defineProperty(context, 'state', { configurable: true, value: 'suspended' });
		(context.resume as ReturnType<typeof vi.fn>).mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
		audio.startIncoming();
		expect(await audio.confirmIncomingFeedback()).toBe(false);
		expect(audio.unlocked).toBe(false);
	});

	it('suppresses vibration for reduced motion and all tones when muted', () => {
		const vibrate = vi.fn(() => true);
		const context = fakeContext();
		const audio = new CallAudioManager({ createContext: () => context, vibrate });
		audio.setReducedMotion(true);
		audio.startIncoming();
		expect(vibrate).not.toHaveBeenCalledWith(expect.any(Array));
		audio.setMuted(true);
		audio.startRingback();
		expect(audio.mode).toBe('idle');
	});
});
