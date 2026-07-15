import { describe, expect, it, vi } from 'vitest';
import {
	CallWakeLockController,
	pictureInPictureMode,
	setPictureInPicture,
	type CallWakeLockSentinel
} from './call-runtime';

class VisibilityPort extends EventTarget {
	visibilityState: DocumentVisibilityState = 'visible';
	setVisibility(value: DocumentVisibilityState): void {
		this.visibilityState = value;
		this.dispatchEvent(new Event('visibilitychange'));
	}
}

class Sentinel extends EventTarget implements CallWakeLockSentinel {
	released = false;
	release = vi.fn(async () => {
		if (this.released) return;
		this.released = true;
		this.dispatchEvent(new Event('release'));
	});
	revoke(): void {
		this.released = true;
		this.dispatchEvent(new Event('release'));
	}
}

describe('CallWakeLockController', () => {
	it('coalesces acquisition, reacquires after visible revocation and releases on stop', async () => {
		const first = new Sentinel();
		const second = new Sentinel();
		const request = vi.fn()
			.mockResolvedValueOnce(first)
			.mockResolvedValueOnce(second);
		const visibility = new VisibilityPort();
		const changes = vi.fn();
		const controller = new CallWakeLockController({
			navigator: { wakeLock: { request } },
			document: visibility,
			onChange: changes
		});

		controller.start();
		controller.start();
		await vi.waitFor(() => expect(controller.state).toBe('held'));
		expect(request).toHaveBeenCalledOnce();
		expect(request).toHaveBeenCalledWith('screen');

		first.revoke();
		await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
		await vi.waitFor(() => expect(controller.state).toBe('held'));
		await controller.stop();
		expect(second.release).toHaveBeenCalledOnce();
		expect(controller.state).toBe('inactive');
		expect(changes).toHaveBeenCalledWith('requesting');
	});

	it('waits for a visible document and treats an unsupported browser factually', async () => {
		const visibility = new VisibilityPort();
		visibility.visibilityState = 'hidden';
		const sentinel = new Sentinel();
		const request = vi.fn(async () => sentinel);
		const controller = new CallWakeLockController({
			navigator: { wakeLock: { request } },
			document: visibility
		});
		controller.start();
		expect(request).not.toHaveBeenCalled();
		visibility.setVisibility('visible');
		await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
		await controller.stop();

		const unsupported = new CallWakeLockController({ navigator: {}, document: visibility });
		unsupported.start();
		expect(unsupported.supported).toBe(false);
		expect(unsupported.state).toBe('unsupported');
	});

	it('releases a sentinel that resolves after the call already stopped', async () => {
		let resolve!: (value: CallWakeLockSentinel) => void;
		const pending = new Promise<CallWakeLockSentinel>((done) => { resolve = done; });
		const sentinel = new Sentinel();
		const controller = new CallWakeLockController({
			navigator: { wakeLock: { request: () => pending } },
			document: new VisibilityPort()
		});
		controller.start();
		const stopped = controller.stop();
		resolve(sentinel);
		await stopped;
		await vi.waitFor(() => expect(sentinel.release).toHaveBeenCalledOnce());
		expect(controller.state).toBe('inactive');
	});

	it('acquires for a new call when it starts before the previous pending request resolves', async () => {
		let resolveFirst!: (value: CallWakeLockSentinel) => void;
		const firstRequest = new Promise<CallWakeLockSentinel>((done) => { resolveFirst = done; });
		const stale = new Sentinel();
		const current = new Sentinel();
		const request = vi.fn()
			.mockReturnValueOnce(firstRequest)
			.mockResolvedValueOnce(current);
		const controller = new CallWakeLockController({
			navigator: { wakeLock: { request } },
			document: new VisibilityPort()
		});
		controller.start();
		await controller.stop();
		controller.start();
		expect(request).toHaveBeenCalledOnce();
		resolveFirst(stale);
		await vi.waitFor(() => expect(stale.release).toHaveBeenCalledOnce());
		await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
		await vi.waitFor(() => expect(controller.state).toBe('held'));
		await controller.stop();
		expect(current.release).toHaveBeenCalledOnce();
	});
});

describe('picture-in-picture capability', () => {
	it('uses standard PiP only when the document and video both expose it', async () => {
		const video = { requestPictureInPicture: vi.fn(async () => ({})) };
		const doc = {
			pictureInPictureEnabled: true,
			pictureInPictureElement: video,
			exitPictureInPicture: vi.fn(async () => undefined)
		};
		expect(pictureInPictureMode(video, doc)).toBe('standard');
		expect(await setPictureInPicture(video, true, doc)).toEqual({ status: 'entered', mode: 'standard' });
		expect(await setPictureInPicture(video, false, doc)).toEqual({ status: 'exited', mode: 'standard' });
		expect(video.requestPictureInPicture).toHaveBeenCalledOnce();
		expect(doc.exitPictureInPicture).toHaveBeenCalledOnce();
	});

	it('uses Safari presentation mode when present and otherwise reports unsupported', async () => {
		const setMode = vi.fn();
		const supportsMode = vi.fn((mode: string) => mode === 'picture-in-picture');
		type TestPresentationMode = 'inline' | 'picture-in-picture' | 'fullscreen';
		const video = {
			webkitSupportsPresentationMode: supportsMode,
			webkitPresentationMode: 'inline' as TestPresentationMode,
			webkitSetPresentationMode(mode: TestPresentationMode) {
				setMode(mode);
				this.webkitPresentationMode = mode;
			}
		};
		expect(pictureInPictureMode(video, {})).toBe('webkit');
		expect(supportsMode).toHaveBeenCalledWith('picture-in-picture');
		expect(await setPictureInPicture(video, true, {})).toEqual({ status: 'entered', mode: 'webkit' });
		expect(await setPictureInPicture(video, false, {})).toEqual({ status: 'exited', mode: 'webkit' });
		expect(setMode.mock.calls).toEqual([['picture-in-picture'], ['inline']]);
		expect(await setPictureInPicture({}, true, {})).toEqual({ status: 'unsupported' });
	});

	it('never exits or claims success for another element\'s standard PiP session', async () => {
		const video = { requestPictureInPicture: vi.fn(async () => ({})) };
		const exitPictureInPicture = vi.fn(async () => undefined);
		const doc = {
			pictureInPictureEnabled: true,
			pictureInPictureElement: {},
			exitPictureInPicture
		};
		expect(await setPictureInPicture(video, false, doc)).toEqual({
			status: 'not-active',
			mode: 'standard'
		});
		expect(exitPictureInPicture).not.toHaveBeenCalled();
	});

	it('does not claim PiP success when the browser rejects the gesture', async () => {
		const denied = Object.assign(new Error('gesture required'), { name: 'NotAllowedError' });
		const video = { requestPictureInPicture: vi.fn(async () => { throw denied; }) };
		expect(await setPictureInPicture(video, true, { pictureInPictureEnabled: true })).toEqual({
			status: 'failed',
			reason: 'not-allowed'
		});
	});
});
