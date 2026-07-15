export interface IncomingCallLeadershipClaim {
	callId: string;
	installationId: string;
	onLeadership: (takeover: boolean) => void;
	onLost?: () => void;
}

interface LockLike { name?: string; }
interface LockManagerPort {
	request(
		name: string,
		options: { mode: 'exclusive'; ifAvailable?: boolean; signal?: AbortSignal },
		callback: (lock: LockLike | null) => Promise<void> | void
	): Promise<void>;
}

interface BroadcastMessageEvent { data: unknown; }
interface BroadcastChannelPort {
	onmessage: ((event: BroadcastMessageEvent) => void) | null;
	postMessage(value: unknown): void;
	close(): void;
}

interface StorageEventPort { key: string | null; newValue: string | null; }
interface StorageEventsPort {
	addEventListener(type: 'storage', listener: (event: StorageEventPort) => void): void;
	removeEventListener(type: 'storage', listener: (event: StorageEventPort) => void): void;
}

export interface IncomingCallLeaderOptions {
	tabId?: string;
	locks?: LockManagerPort | null;
	storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
	storageEvents?: StorageEventsPort | null;
	createBroadcastChannel?: ((name: string) => BroadcastChannelPort) | null;
	now?: () => number;
	setTimeout?: typeof setTimeout;
	clearTimeout?: typeof clearTimeout;
	leaseMs?: number;
	contentionMs?: number;
	isEligibleWithoutCoordination?: () => boolean;
}

interface LeaseRecord {
	owner: string;
	expiresAt: number;
}

interface ActiveClaim extends IncomingCallLeadershipClaim {
	key: string;
	lockName: string;
	abort: AbortController;
	releaseLock: (() => void) | null;
	leader: boolean;
	waited: boolean;
	usingFallback: boolean;
	timer: ReturnType<typeof setTimeout> | null;
	channel: BroadcastChannelPort | null;
	storageListener: ((event: StorageEventPort) => void) | null;
	storageUsable: boolean;
	broadcastOnly: boolean;
	broadcastCandidates: Map<string, number>;
	broadcastLeader: LeaseRecord | null;
}

const LEASE_PREFIX = 'presuntinho:incoming-call-leader:v1:';
const CHANNEL_NAME = 'presuntinho-incoming-call-leader-v1';

function globalStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
	try {
		return typeof localStorage !== 'undefined' ? localStorage : null;
	} catch {
		return null;
	}
}

function globalLocks(): LockManagerPort | null {
	const value = typeof navigator !== 'undefined'
		? (navigator as Navigator & { locks?: LockManagerPort }).locks
		: null;
	return value?.request ? value : null;
}

function globalBroadcastFactory(): ((name: string) => BroadcastChannelPort) | null {
	return typeof BroadcastChannel === 'function'
		? (name) => new BroadcastChannel(name) as unknown as BroadcastChannelPort
		: null;
}

function globalStorageEvents(): StorageEventsPort | null {
	return typeof window !== 'undefined' ? window as unknown as StorageEventsPort : null;
}

function readLease(
	storage: Pick<Storage, 'getItem'>,
	key: string
): LeaseRecord | null {
	try {
		const raw = storage.getItem(key);
		if (!raw) return null;
		const value = JSON.parse(raw) as Partial<LeaseRecord>;
		return typeof value.owner === 'string' &&
			value.owner.length >= 8 &&
			typeof value.expiresAt === 'number' &&
			Number.isFinite(value.expiresAt)
			? { owner: value.owner, expiresAt: value.expiresAt }
			: null;
	} catch {
		return null;
	}
}

/**
 * Elects one visible incoming-call owner per installation and call. Web Locks
 * provide strict mutual exclusion when available; the storage fallback waits
 * through a contention window, renews a short lease and announces release for
 * prompt takeover when the leading tab closes.
 */
export class IncomingCallLeaderCoordinator {
	#options: Required<Pick<IncomingCallLeaderOptions, 'now' | 'setTimeout' | 'clearTimeout' | 'leaseMs' | 'contentionMs'>> & IncomingCallLeaderOptions;
	#tabId: string;
	#active: ActiveClaim | null = null;

	constructor(options: IncomingCallLeaderOptions = {}) {
		this.#tabId = options.tabId ?? crypto.randomUUID();
		this.#options = {
			...options,
			locks: options.locks === undefined ? globalLocks() : options.locks,
			storage: options.storage === undefined ? globalStorage() : options.storage,
			storageEvents: options.storageEvents === undefined ? globalStorageEvents() : options.storageEvents,
			createBroadcastChannel: options.createBroadcastChannel === undefined
				? globalBroadcastFactory()
				: options.createBroadcastChannel,
			now: options.now ?? Date.now,
			setTimeout: options.setTimeout ?? setTimeout,
			clearTimeout: options.clearTimeout ?? clearTimeout,
			leaseMs: Math.max(600, options.leaseMs ?? 1_800),
			contentionMs: Math.max(10, options.contentionMs ?? 45)
		};
	}

	claim(claim: IncomingCallLeadershipClaim): void {
		const key = `${LEASE_PREFIX}${claim.installationId}:${claim.callId}`;
		if (this.#active?.key === key) {
			this.#active.onLeadership = claim.onLeadership;
			this.#active.onLost = claim.onLost;
			return;
		}
		this.release();
		const active: ActiveClaim = {
			...claim,
			key,
			lockName: key,
			abort: new AbortController(),
			releaseLock: null,
			leader: false,
			waited: false,
			usingFallback: false,
			timer: null,
			channel: null,
			storageListener: null,
			storageUsable: Boolean(this.#options.storage),
			broadcastOnly: false,
			broadcastCandidates: new Map(),
			broadcastLeader: null
		};
		this.#active = active;
		if (this.#options.locks?.request) this.#startWebLock(active);
		else this.#startFallback(active);
	}

	isLeader(callId: string): boolean {
		return Boolean(this.#active?.callId === callId && this.#active.leader);
	}

	release(callId?: string): void {
		const active = this.#active;
		if (!active || (callId && active.callId !== callId)) return;
		this.#active = null;
		active.abort.abort();
		active.releaseLock?.();
		active.releaseLock = null;
		if (active.timer) this.#options.clearTimeout(active.timer);
		active.timer = null;
		if (active.usingFallback) this.#releaseFallbackLease(active);
		active.channel?.close();
		active.channel = null;
		if (active.storageListener && this.#options.storageEvents) {
			this.#options.storageEvents.removeEventListener('storage', active.storageListener);
		}
		active.storageListener = null;
		if (active.leader) active.onLost?.();
		active.leader = false;
	}

	dispose(): void {
		this.release();
	}

	#startWebLock(active: ActiveClaim): void {
		const locks = this.#options.locks;
		if (!locks) return this.#startFallback(active);
		let unavailable = false;
		void locks.request(
			active.lockName,
			{ mode: 'exclusive', ifAvailable: true, signal: active.abort.signal },
			async (lock) => {
				if (!this.#isCurrent(active)) return;
				if (!lock) {
					unavailable = true;
					active.waited = true;
					return;
				}
				await this.#holdWebLock(active, false);
			}
		).then(() => {
			if (!unavailable || !this.#isCurrent(active)) return;
			return locks.request(
				active.lockName,
				{ mode: 'exclusive', signal: active.abort.signal },
				async (lock) => {
					if (lock && this.#isCurrent(active)) await this.#holdWebLock(active, true);
				}
			);
		}).catch((error) => {
			if (!this.#isCurrent(active) || active.abort.signal.aborted) return;
			const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
			if (name !== 'AbortError') this.#startFallback(active);
		});
	}

	async #holdWebLock(active: ActiveClaim, takeover: boolean): Promise<void> {
		if (!this.#isCurrent(active)) return;
		active.leader = true;
		active.onLeadership(takeover);
		await new Promise<void>((resolve) => { active.releaseLock = resolve; });
		active.releaseLock = null;
	}

	#startFallback(active: ActiveClaim): void {
		if (!this.#isCurrent(active) || active.usingFallback) return;
		active.usingFallback = true;
		const factory = this.#options.createBroadcastChannel;
		if (factory) {
			try {
				active.channel = factory(CHANNEL_NAME);
				active.channel.onmessage = (event) => this.#onFallbackMessage(active, event.data);
			} catch {
				active.channel = null;
			}
		}
		if (active.storageUsable && this.#options.storageEvents) {
			active.storageListener = (event) => {
				if (event.key !== active.key || !this.#isCurrent(active)) return;
				this.#verifyFallback(active, event.newValue == null);
			};
			this.#options.storageEvents.addEventListener('storage', active.storageListener);
		}
		if (!active.storageUsable || !this.#options.storage) {
			if (active.channel) this.#startBroadcastOnly(active);
			else this.#attemptUncoordinatedClaim(active);
			return;
		}
		this.#attemptFallbackClaim(active, false);
	}

	#attemptFallbackClaim(active: ActiveClaim, takeover: boolean): void {
		if (!this.#isCurrent(active) || !active.storageUsable || !this.#options.storage) return;
		if (active.timer) this.#options.clearTimeout(active.timer);
		active.timer = null;
		const now = this.#options.now();
		const existing = readLease(this.#options.storage, active.key);
		if (existing && existing.owner !== this.#tabId && existing.expiresAt > now) {
			active.waited = true;
			this.#scheduleFallback(active, Math.min(
				this.#options.leaseMs / 2,
				Math.max(this.#options.contentionMs, existing.expiresAt - now + 5)
			));
			return;
		}
		try {
			this.#options.storage.setItem(active.key, JSON.stringify({
				owner: this.#tabId,
				expiresAt: now + this.#options.leaseMs
			} satisfies LeaseRecord));
		} catch {
			this.#abandonStorageFallback(active);
			return;
		}
		active.channel?.postMessage({ type: 'claim', key: active.key, owner: this.#tabId });
		this.#scheduleFallback(active, this.#options.contentionMs, () => {
			const settled = readLease(this.#options.storage!, active.key);
			if (!settled || settled.owner !== this.#tabId || settled.expiresAt <= this.#options.now()) {
				active.waited = true;
				this.#scheduleFallback(active, this.#options.contentionMs * 2);
				return;
			}
			const wasLeader = active.leader;
			active.leader = true;
			if (!wasLeader) active.onLeadership(active.waited || takeover);
			this.#scheduleFallback(active, Math.floor(this.#options.leaseMs / 3), () => {
				this.#renewFallback(active);
			});
		});
	}

	#renewFallback(active: ActiveClaim): void {
		if (!this.#isCurrent(active) || !active.leader || !active.storageUsable || !this.#options.storage) return;
		const lease = readLease(this.#options.storage, active.key);
		if (!lease || lease.owner !== this.#tabId) {
			active.leader = false;
			active.onLost?.();
			active.waited = true;
			this.#attemptFallbackClaim(active, true);
			return;
		}
		const expiresAt = this.#options.now() + this.#options.leaseMs;
		try {
			this.#options.storage.setItem(active.key, JSON.stringify({ owner: this.#tabId, expiresAt } satisfies LeaseRecord));
			active.channel?.postMessage({ type: 'heartbeat', key: active.key, owner: this.#tabId });
		} catch {
			this.#abandonStorageFallback(active);
			return;
		}
		this.#scheduleFallback(active, Math.floor(this.#options.leaseMs / 3), () => {
			this.#renewFallback(active);
		});
	}

	#verifyFallback(active: ActiveClaim, released: boolean): void {
		if (!this.#isCurrent(active) || !active.storageUsable || !this.#options.storage) return;
		const lease = readLease(this.#options.storage, active.key);
		if (active.leader && lease?.owner !== this.#tabId) {
			active.leader = false;
			active.onLost?.();
			active.waited = true;
		}
		if (released || !lease || lease.expiresAt <= this.#options.now()) {
			this.#attemptFallbackClaim(active, true);
		} else if (!active.leader) {
			this.#scheduleFallback(active, Math.max(
				this.#options.contentionMs,
				Math.min(this.#options.leaseMs / 2, lease.expiresAt - this.#options.now() + 5)
			));
		}
	}

	#onFallbackMessage(active: ActiveClaim, value: unknown): void {
		if (!this.#isCurrent(active) || !value || typeof value !== 'object') return;
		const message = value as { type?: unknown; key?: unknown; owner?: unknown; mode?: unknown };
		if (message.key !== active.key || message.owner === this.#tabId) return;
		if (active.broadcastOnly) {
			this.#onBroadcastOnlyMessage(active, message);
			return;
		}
		if (message.type === 'storage-failed' || message.mode === 'broadcast') {
			this.#abandonStorageFallback(active);
			this.#onBroadcastOnlyMessage(active, message);
			return;
		}
		if (message.type === 'release') this.#verifyFallback(active, true);
		else if (message.type === 'claim' || message.type === 'heartbeat') this.#verifyFallback(active, false);
	}

	#startBroadcastOnly(active: ActiveClaim): void {
		active.broadcastOnly = true;
		active.broadcastCandidates.set(this.#tabId, this.#options.now());
		active.channel?.postMessage({ type: 'claim', key: active.key, owner: this.#tabId, mode: 'broadcast' });
		this.#scheduleFallback(active, this.#options.contentionMs, () => {
			this.#settleBroadcastOnly(active, false);
		});
	}

	#onBroadcastOnlyMessage(
		active: ActiveClaim,
		message: { type?: unknown; owner?: unknown }
	): void {
		const owner = typeof message.owner === 'string' ? message.owner : null;
		if (!owner) return;
		const now = this.#options.now();
		if (message.type === 'release') {
			active.broadcastCandidates.delete(owner);
			if (active.broadcastLeader?.owner === owner) active.broadcastLeader = null;
			if (!active.leader) {
				active.waited = true;
				this.#scheduleFallback(active, this.#options.contentionMs, () => {
					this.#settleBroadcastOnly(active, true);
				});
			}
			return;
		}
		if (message.type === 'claim') {
			active.broadcastCandidates.set(owner, now);
			if (active.leader) this.#broadcastOnlyHeartbeat(active);
			return;
		}
		if (message.type !== 'heartbeat') return;
		active.broadcastCandidates.set(owner, now);
		if (active.leader && owner < this.#tabId) {
			active.leader = false;
			active.waited = true;
			active.onLost?.();
		} else if (active.leader && this.#tabId < owner) {
			this.#broadcastOnlyHeartbeat(active);
			return;
		}
		active.broadcastLeader = { owner, expiresAt: now + this.#options.leaseMs };
		if (!active.leader) {
			this.#scheduleFallback(active, this.#options.leaseMs + 5, () => {
				this.#settleBroadcastOnly(active, true);
			});
		}
	}

	#settleBroadcastOnly(active: ActiveClaim, takeover: boolean): void {
		if (!this.#isCurrent(active) || !active.broadcastOnly) return;
		const now = this.#options.now();
		for (const [owner, seenAt] of active.broadcastCandidates) {
			if (now - seenAt > this.#options.leaseMs) active.broadcastCandidates.delete(owner);
		}
		const liveLeader = active.broadcastLeader;
		if (
			liveLeader &&
			liveLeader.owner !== this.#tabId &&
			liveLeader.expiresAt > now
		) {
			active.waited = true;
			this.#scheduleFallback(active, liveLeader.expiresAt - now + 5, () => {
				this.#settleBroadcastOnly(active, true);
			});
			return;
		}
		active.broadcastCandidates.set(this.#tabId, now);
		const winner = [...active.broadcastCandidates.keys()].sort()[0];
		if (winner !== this.#tabId) {
			active.waited = true;
			this.#scheduleFallback(active, Math.floor(this.#options.leaseMs / 2), () => {
				active.channel?.postMessage({
					type: 'claim', key: active.key, owner: this.#tabId, mode: 'broadcast'
				});
				this.#settleBroadcastOnly(active, true);
			});
			return;
		}
		const wasLeader = active.leader;
		active.leader = true;
		active.broadcastLeader = { owner: this.#tabId, expiresAt: now + this.#options.leaseMs };
		if (!wasLeader) active.onLeadership(active.waited || takeover);
		this.#broadcastOnlyHeartbeat(active);
	}

	#broadcastOnlyHeartbeat(active: ActiveClaim): void {
		if (!this.#isCurrent(active) || !active.leader) return;
		const now = this.#options.now();
		active.broadcastCandidates.set(this.#tabId, now);
		active.broadcastLeader = { owner: this.#tabId, expiresAt: now + this.#options.leaseMs };
		active.channel?.postMessage({ type: 'heartbeat', key: active.key, owner: this.#tabId, mode: 'broadcast' });
		this.#scheduleFallback(active, Math.floor(this.#options.leaseMs / 3), () => {
			this.#broadcastOnlyHeartbeat(active);
		});
	}

	#attemptUncoordinatedClaim(active: ActiveClaim): void {
		if (!this.#isCurrent(active)) return;
		const eligible = this.#options.isEligibleWithoutCoordination?.() ?? (
			typeof document !== 'undefined' &&
			document.visibilityState === 'visible' &&
			(typeof document.hasFocus !== 'function' || document.hasFocus())
		);
		if (eligible) {
			active.leader = true;
			active.onLeadership(active.waited);
			return;
		}
		active.waited = true;
		this.#scheduleFallback(active, Math.floor(this.#options.leaseMs / 3), () => {
			this.#attemptUncoordinatedClaim(active);
		});
	}

	#abandonStorageFallback(active: ActiveClaim): void {
		if (!this.#isCurrent(active) || active.broadcastOnly) return;
		const wasLeader = active.leader;
		active.storageUsable = false;
		active.leader = false;
		if (active.storageListener && this.#options.storageEvents) {
			this.#options.storageEvents.removeEventListener('storage', active.storageListener);
		}
		active.storageListener = null;
		if (wasLeader) {
			active.waited = true;
			active.onLost?.();
		}
		if (active.channel) {
			active.broadcastOnly = true;
			active.channel.postMessage({
				type: 'storage-failed', key: active.key, owner: this.#tabId, mode: 'broadcast'
			});
			this.#startBroadcastOnly(active);
		} else {
			this.#attemptUncoordinatedClaim(active);
		}
	}

	#releaseFallbackLease(active: ActiveClaim): void {
		const storage = this.#options.storage;
		if (!storage || !active.storageUsable) {
			if (active.broadcastOnly && active.leader) {
				active.channel?.postMessage({
					type: 'release', key: active.key, owner: this.#tabId, mode: 'broadcast'
				});
			}
			return;
		}
		const lease = readLease(storage, active.key);
		if (lease?.owner !== this.#tabId) return;
		try { storage.removeItem(active.key); } catch { /* best effort */ }
		active.channel?.postMessage({ type: 'release', key: active.key, owner: this.#tabId });
	}

	#scheduleFallback(active: ActiveClaim, delay: number, work?: () => void): void {
		if (!this.#isCurrent(active)) return;
		if (active.timer) this.#options.clearTimeout(active.timer);
		active.timer = this.#options.setTimeout(() => {
			active.timer = null;
			if (!this.#isCurrent(active)) return;
			if (work) work();
			else this.#attemptFallbackClaim(active, true);
		}, Math.max(1, delay));
	}

	#isCurrent(active: ActiveClaim): boolean {
		return this.#active === active && !active.abort.signal.aborted;
	}
}
