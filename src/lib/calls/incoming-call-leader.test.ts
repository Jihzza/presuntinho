import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IncomingCallLeaderCoordinator } from './incoming-call-leader';

const CALL = '44444444-4444-4444-8444-444444444444';
const INSTALLATION = '55555555-5555-4555-8555-555555555555';

class SharedStorage {
	values = new Map<string, string>();
	getItem(key: string): string | null { return this.values.get(key) ?? null; }
	setItem(key: string, value: string): void { this.values.set(key, value); }
	removeItem(key: string): void { this.values.delete(key); }
}

class ThrowingStorage extends SharedStorage {
	override setItem(): void { throw new DOMException('storage denied', 'SecurityError'); }
}

class BroadcastHub {
	channels = new Set<FakeBroadcastChannel>();
	create = () => {
		const channel = new FakeBroadcastChannel(this);
		this.channels.add(channel);
		return channel;
	};
	publish(sender: FakeBroadcastChannel, value: unknown): void {
		for (const channel of this.channels) {
			if (channel !== sender) channel.onmessage?.({ data: value });
		}
	}
}

class FakeBroadcastChannel {
	onmessage: ((event: { data: unknown }) => void) | null = null;
	constructor(private hub: BroadcastHub) {}
	postMessage(value: unknown): void { this.hub.publish(this, value); }
	close(): void { this.hub.channels.delete(this); }
}

class FakeLockManager {
	held = new Set<string>();
	queues = new Map<string, Array<{
		callback: (lock: { name: string } | null) => Promise<void> | void;
		resolve: () => void;
		reject: (error: unknown) => void;
		signal?: AbortSignal;
	}>>();

	async request(
		name: string,
		options: { mode: 'exclusive'; ifAvailable?: boolean; signal?: AbortSignal },
		callback: (lock: { name: string } | null) => Promise<void> | void
	): Promise<void> {
		if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError');
		if (this.held.has(name) && options.ifAvailable) {
			await callback(null);
			return;
		}
		if (this.held.has(name)) {
			await new Promise<void>((resolve, reject) => {
				const queued = { callback, resolve, reject, signal: options.signal };
				const queue = this.queues.get(name) ?? [];
				queue.push(queued);
				this.queues.set(name, queue);
				options.signal?.addEventListener('abort', () => {
					this.queues.set(name, (this.queues.get(name) ?? []).filter((item) => item !== queued));
					reject(new DOMException('aborted', 'AbortError'));
				}, { once: true });
			});
			return;
		}
		await this.#grant(name, callback);
	}

	async #grant(name: string, callback: (lock: { name: string }) => Promise<void> | void): Promise<void> {
		this.held.add(name);
		try {
			await callback({ name });
		} finally {
			this.held.delete(name);
			const next = this.queues.get(name)?.shift();
			if (next) {
				void this.#grant(name, next.callback as (lock: { name: string }) => Promise<void> | void)
					.then(next.resolve, next.reject);
			}
		}
	}
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-07-15T10:00:00Z'));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('IncomingCallLeaderCoordinator', () => {
	it('elects one fallback leader and hands over immediately when its tab closes', async () => {
		const storage = new SharedStorage();
		const hub = new BroadcastHub();
		const firstLeadership = vi.fn();
		const secondLeadership = vi.fn();
		const firstLost = vi.fn();
		const options = {
			locks: null,
			storage,
			storageEvents: null,
			createBroadcastChannel: hub.create,
			now: () => Date.now(),
			leaseMs: 600,
			contentionMs: 10
		};
		const first = new IncomingCallLeaderCoordinator({ ...options, tabId: 'tab-first' });
		const second = new IncomingCallLeaderCoordinator({ ...options, tabId: 'tab-second' });
		first.claim({
			callId: CALL,
			installationId: INSTALLATION,
			onLeadership: firstLeadership,
			onLost: firstLost
		});
		second.claim({
			callId: CALL,
			installationId: INSTALLATION,
			onLeadership: secondLeadership
		});
		await vi.advanceTimersByTimeAsync(15);
		expect(first.isLeader(CALL)).toBe(true);
		expect(second.isLeader(CALL)).toBe(false);
		expect(firstLeadership).toHaveBeenCalledWith(false);
		expect(secondLeadership).not.toHaveBeenCalled();

		first.release(CALL);
		await vi.advanceTimersByTimeAsync(15);
		expect(firstLost).toHaveBeenCalledOnce();
		expect(second.isLeader(CALL)).toBe(true);
		expect(secondLeadership).toHaveBeenCalledWith(true);
		second.release(CALL);
		expect(storage.values.size).toBe(0);
	});

	it('removes a waiting follower on terminal cleanup so it cannot take over later', async () => {
		const storage = new SharedStorage();
		const hub = new BroadcastHub();
		const first = new IncomingCallLeaderCoordinator({
			tabId: 'tab-first', locks: null, storage, storageEvents: null,
			createBroadcastChannel: hub.create, now: () => Date.now(), leaseMs: 600, contentionMs: 10
		});
		const secondLeadership = vi.fn();
		const second = new IncomingCallLeaderCoordinator({
			tabId: 'tab-second', locks: null, storage, storageEvents: null,
			createBroadcastChannel: hub.create, now: () => Date.now(), leaseMs: 600, contentionMs: 10
		});
		first.claim({ callId: CALL, installationId: INSTALLATION, onLeadership: vi.fn() });
		second.claim({ callId: CALL, installationId: INSTALLATION, onLeadership: secondLeadership });
		await vi.advanceTimersByTimeAsync(15);
		second.release(CALL);
		first.release(CALL);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(secondLeadership).not.toHaveBeenCalled();
		expect(second.isLeader(CALL)).toBe(false);
	});

	it('uses BroadcastChannel election when storage is unavailable and transfers leadership', async () => {
		const hub = new BroadcastHub();
		const firstLeadership = vi.fn();
		const secondLeadership = vi.fn();
		const first = new IncomingCallLeaderCoordinator({
			tabId: 'tab-a', locks: null, storage: null, storageEvents: null,
			createBroadcastChannel: hub.create, now: () => Date.now(), leaseMs: 600, contentionMs: 10
		});
		const second = new IncomingCallLeaderCoordinator({
			tabId: 'tab-b', locks: null, storage: null, storageEvents: null,
			createBroadcastChannel: hub.create, now: () => Date.now(), leaseMs: 600, contentionMs: 10
		});
		first.claim({ callId: CALL, installationId: INSTALLATION, onLeadership: firstLeadership });
		second.claim({ callId: CALL, installationId: INSTALLATION, onLeadership: secondLeadership });

		await vi.advanceTimersByTimeAsync(15);
		expect(first.isLeader(CALL)).toBe(true);
		expect(second.isLeader(CALL)).toBe(false);
		expect(firstLeadership).toHaveBeenCalledWith(false);
		expect(secondLeadership).not.toHaveBeenCalled();

		first.release(CALL);
		await vi.advanceTimersByTimeAsync(15);
		expect(second.isLeader(CALL)).toBe(true);
		expect(secondLeadership).toHaveBeenCalledWith(true);
		second.release(CALL);
		expect(hub.channels.size).toBe(0);
	});

	it('falls back to one BroadcastChannel leader when storage writes are denied', async () => {
		const storage = new ThrowingStorage();
		const hub = new BroadcastHub();
		const firstLeadership = vi.fn();
		const secondLeadership = vi.fn();
		const options = {
			locks: null,
			storage,
			storageEvents: null,
			createBroadcastChannel: hub.create,
			now: () => Date.now(),
			leaseMs: 600,
			contentionMs: 10
		};
		const first = new IncomingCallLeaderCoordinator({ ...options, tabId: 'tab-a' });
		const second = new IncomingCallLeaderCoordinator({ ...options, tabId: 'tab-b' });
		first.claim({ callId: CALL, installationId: INSTALLATION, onLeadership: firstLeadership });
		second.claim({ callId: CALL, installationId: INSTALLATION, onLeadership: secondLeadership });

		await vi.advanceTimersByTimeAsync(15);
		expect(first.isLeader(CALL)).toBe(true);
		expect(second.isLeader(CALL)).toBe(false);
		expect(firstLeadership).toHaveBeenCalledTimes(1);
		expect(secondLeadership).not.toHaveBeenCalled();

		first.release(CALL);
		await vi.advanceTimersByTimeAsync(15);
		expect(second.isLeader(CALL)).toBe(true);
		expect(secondLeadership).toHaveBeenCalledWith(true);
		second.release(CALL);
	});

	it('only self-elects without coordination when the tab is eligible', async () => {
		let eligible = false;
		const leadership = vi.fn();
		const coordinator = new IncomingCallLeaderCoordinator({
			tabId: 'tab-alone', locks: null, storage: null, storageEvents: null,
			createBroadcastChannel: null, now: () => Date.now(), leaseMs: 600,
			contentionMs: 10, isEligibleWithoutCoordination: () => eligible
		});
		coordinator.claim({ callId: CALL, installationId: INSTALLATION, onLeadership: leadership });
		await vi.advanceTimersByTimeAsync(300);
		expect(coordinator.isLeader(CALL)).toBe(false);
		eligible = true;
		await vi.advanceTimersByTimeAsync(300);
		expect(coordinator.isLeader(CALL)).toBe(true);
		expect(leadership).toHaveBeenCalledWith(true);
		coordinator.release(CALL);
	});

	it('prefers strict Web Locks and queues a takeover without touching storage', async () => {
		const locks = new FakeLockManager();
		const storage = new SharedStorage();
		const firstLeadership = vi.fn();
		const secondLeadership = vi.fn();
		const first = new IncomingCallLeaderCoordinator({ tabId: 'tab-first', locks, storage });
		const second = new IncomingCallLeaderCoordinator({ tabId: 'tab-second', locks, storage });
		first.claim({ callId: CALL, installationId: INSTALLATION, onLeadership: firstLeadership });
		second.claim({ callId: CALL, installationId: INSTALLATION, onLeadership: secondLeadership });
		await vi.runAllTicks();
		expect(first.isLeader(CALL)).toBe(true);
		expect(second.isLeader(CALL)).toBe(false);
		expect(storage.values.size).toBe(0);
		first.release(CALL);
		for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
		expect(second.isLeader(CALL)).toBe(true);
		expect(secondLeadership).toHaveBeenCalledWith(true);
		second.release(CALL);
	});
});
