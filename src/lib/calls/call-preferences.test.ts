import { describe, expect, it, vi } from 'vitest';
import {
	CALL_PREFERENCES_CACHE,
	callPreferencesCacheUrl,
	callTimeToMinutes,
	defaultCallPreferences,
	evaluateIncomingCallPreferences,
	isCallDndActive,
	isCallIgnoredLocally,
	loadCallPreferences,
	isCallPreferencesStorageKey,
	minutesToCallTime,
	parseCallPreferences,
	readCallPreferencesSync,
	rememberLocallyIgnoredCall,
	saveCallPreferences
} from './call-preferences';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const CALLER = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const CALL_ID = '55555555-5555-4555-8555-555555555555';

class MemoryStorage {
	values = new Map<string, string>();
	getItem(key: string): string | null { return this.values.get(key) ?? null; }
	setItem(key: string, value: string): void { this.values.set(key, value); }
}

class MemoryCaches {
	values = new Map<string, Response>();
	async open(name: string) {
		return {
			match: async (key: string | Request) => this.values.get(`${name}|${typeof key === 'string' ? key : key.url}`)?.clone(),
			put: async (key: string | Request, value: Response) => {
				this.values.set(`${name}|${typeof key === 'string' ? key : key.url}`, value.clone());
			}
		} as unknown as Cache;
	}
}

describe('account-scoped call preferences', () => {
	it('sanitizes persisted input and never accepts another account key', () => {
		expect(parseCallPreferences({ accountId: ACCOUNT_B }, ACCOUNT_A)).toBeNull();
		const parsed = parseCallPreferences({
			accountId: ACCOUNT_A,
			ringtone: 'malicious',
			ringtoneVolume: 5,
			ringbackVolume: -2,
			vibration: false,
			dndStartMinutes: 9999,
			whoMayCall: 'nobody',
			knownContactIds: [CALLER, CALLER, 'bad'],
			updatedAt: '2026-07-15T10:00:00.000Z'
		}, ACCOUNT_A);
		expect(parsed).toMatchObject({
			accountId: ACCOUNT_A,
			ringtone: 'classic',
			ringtoneVolume: 1,
			ringbackVolume: 0,
			vibration: false,
			dndStartMinutes: 1320,
			whoMayCall: 'nobody',
			knownContactIds: [CALLER]
		});
	});

	it('persists one account locally and in the worker-readable cache without leaking to another', async () => {
		const storage = new MemoryStorage();
		const caches = new MemoryCaches();
		const postToWorker = vi.fn();
		const dispatch = vi.fn();
		const saved = await saveCallPreferences(ACCOUNT_A, {
			ringtone: 'pulse',
			notificationPreviews: false,
			relayOnly: true
		}, {
			storage,
			caches,
			now: () => new Date('2026-07-15T10:00:00.000Z'),
			postToWorker,
			dispatch
		});
		expect(saved).toMatchObject({ ringtone: 'pulse', notificationPreviews: false, relayOnly: true });
		expect(postToWorker).toHaveBeenCalledWith(expect.objectContaining({ accountId: ACCOUNT_A }));
		expect(dispatch).toHaveBeenCalledTimes(1);
		const cacheKey = `${CALL_PREFERENCES_CACHE}|${callPreferencesCacheUrl(ACCOUNT_A)}`;
		expect(await caches.values.get(cacheKey)?.json()).toMatchObject({ accountId: ACCOUNT_A, ringtone: 'pulse' });
		expect(await loadCallPreferences(ACCOUNT_A, { storage, caches })).toMatchObject({ relayOnly: true });
		expect(readCallPreferencesSync(ACCOUNT_A, storage)).toMatchObject({ ringtone: 'pulse', relayOnly: true });
		expect(await loadCallPreferences(ACCOUNT_B, { storage, caches })).toMatchObject({
			accountId: ACCOUNT_B,
			relayOnly: false,
			notificationPreviews: true
		});
		expect(isCallPreferencesStorageKey(
			`presuntinho:call-preferences:v1:${ACCOUNT_A}`,
			ACCOUNT_A
		)).toBe(true);
		expect(isCallPreferencesStorageKey(
			`presuntinho:call-preferences:v1:${ACCOUNT_B}`,
			ACCOUNT_A
		)).toBe(false);
		storage.setItem(
			`presuntinho:call-preferences:v1:${ACCOUNT_A}`,
			JSON.stringify({ ...saved, ringtone: 'soft' })
		);
		expect(readCallPreferencesSync(ACCOUNT_A, storage).ringtone).toBe('soft');
	});

	it('evaluates overnight, daytime and all-day quiet hours in device local time', () => {
		const overnight = { ...defaultCallPreferences(ACCOUNT_A), dndEnabled: true };
		expect(isCallDndActive(overnight, new Date(2026, 6, 15, 23, 0))).toBe(true);
		expect(isCallDndActive(overnight, new Date(2026, 6, 15, 7, 59))).toBe(true);
		expect(isCallDndActive(overnight, new Date(2026, 6, 15, 12, 0))).toBe(false);
		const daytime = { ...overnight, dndStartMinutes: 9 * 60, dndEndMinutes: 17 * 60 };
		expect(isCallDndActive(daytime, new Date(2026, 6, 15, 12, 0))).toBe(true);
		expect(isCallDndActive(daytime, new Date(2026, 6, 15, 18, 0))).toBe(false);
		expect(isCallDndActive({ ...daytime, dndEndMinutes: 9 * 60 }, new Date(2026, 6, 15, 18, 0))).toBe(true);
	});

	it('keeps the live runtime and local fallback updated when Cache Storage is unavailable', async () => {
		const storage = new MemoryStorage();
		const postToWorker = vi.fn();
		const dispatch = vi.fn();
		const saved = await saveCallPreferences(OTHER, { vibration: false }, {
			storage,
			caches: { open: async () => { throw new Error('cache disabled'); } },
			postToWorker,
			dispatch
		});
		expect(saved.vibration).toBe(false);
		expect(readCallPreferencesSync(OTHER, storage).vibration).toBe(false);
		expect(postToWorker).toHaveBeenCalledTimes(1);
		expect(dispatch).toHaveBeenCalledTimes(1);
	});

	it('fails open to server-authorized direct calls before contact sync, then enforces the local snapshot', () => {
		const base = defaultCallPreferences(ACCOUNT_A);
		expect(evaluateIncomingCallPreferences(base, CALLER).allowed).toBe(true);
		const synced = {
			...base,
			contactsSyncedAt: '2026-07-15T10:00:00.000Z',
			knownContactIds: [CALLER]
		};
		expect(evaluateIncomingCallPreferences(synced, CALLER).allowed).toBe(true);
		expect(evaluateIncomingCallPreferences(synced, OTHER)).toEqual({
			allowed: false,
			silent: true,
			reason: 'blocked'
		});
		expect(evaluateIncomingCallPreferences({ ...synced, whoMayCall: 'direct-chats' }, OTHER).allowed).toBe(true);
		expect(evaluateIncomingCallPreferences({ ...synced, whoMayCall: 'nobody' }, CALLER).allowed).toBe(false);
	});

	it('remembers an ignored call per installation/account until its TTL without affecting another account', () => {
		const storage = new MemoryStorage();
		const now = Date.now();
		rememberLocallyIgnoredCall(ACCOUNT_A, CALL_ID, new Date(now + 60_000).toISOString(), storage);
		expect(isCallIgnoredLocally(ACCOUNT_A, CALL_ID, now, storage)).toBe(true);
		expect(isCallIgnoredLocally(ACCOUNT_B, CALL_ID, now, storage)).toBe(false);
		expect(isCallIgnoredLocally(ACCOUNT_A, CALL_ID, now + 61_000, storage)).toBe(false);
	});

	it('round-trips valid time controls and rejects malformed values', () => {
		expect(callTimeToMinutes('08:05')).toBe(485);
		expect(minutesToCallTime(485)).toBe('08:05');
		expect(callTimeToMinutes('24:00')).toBeNull();
		expect(callTimeToMinutes('8:05')).toBeNull();
	});
});
