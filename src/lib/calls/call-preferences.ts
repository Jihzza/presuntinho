export const CALL_PREFERENCES_VERSION = 1 as const;
export const CALL_PREFERENCES_EVENT = 'presuntinho:call-preferences-changed' as const;
export const CALL_PREFERENCES_WORKER_EVENT = 'presuntinho:call-preferences' as const;
export const CALL_PREFERENCES_CACHE = 'presuntinho-call-preferences-v1' as const;

export type CallRingtone = 'classic' | 'soft' | 'pulse';
export type CallPermission = 'contacts' | 'direct-chats' | 'nobody';

export interface CallPreferences {
	version: typeof CALL_PREFERENCES_VERSION;
	accountId: string;
	ringtone: CallRingtone;
	ringtoneVolume: number;
	ringbackVolume: number;
	vibration: boolean;
	notificationPreviews: boolean;
	dndEnabled: boolean;
	dndStartMinutes: number;
	dndEndMinutes: number;
	whoMayCall: CallPermission;
	relayOnly: boolean;
	knownContactIds: string[];
	contactsSyncedAt: string | null;
	updatedAt: string;
}

export interface IncomingCallPreferenceDecision {
	allowed: boolean;
	silent: boolean;
	reason: 'blocked' | 'dnd' | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type CacheStorageLike = Pick<CacheStorage, 'open'>;

interface PreferenceDependencies {
	storage?: StorageLike | null;
	caches?: CacheStorageLike | null;
	now?: () => Date;
	postToWorker?: (preferences: CallPreferences) => void;
	dispatch?: (preferences: CallPreferences) => void;
}

const ACCOUNT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RINGTONES = new Set<CallRingtone>(['classic', 'soft', 'pulse']);
const CALL_PERMISSIONS = new Set<CallPermission>(['contacts', 'direct-chats', 'nobody']);
const STORAGE_PREFIX = 'presuntinho:call-preferences:v1:';
const IGNORED_CALLS_PREFIX = 'presuntinho:ignored-calls:v1:';
const CACHE_PATH = '/__presuntinho_call_preferences__/';
const memoryPreferences = new Map<string, CallPreferences>();
const memoryIgnoredCalls = new Map<string, Map<string, number>>();
const writeQueues = new Map<string, Promise<void>>();

function accountId(value: unknown): string | null {
	return typeof value === 'string' && ACCOUNT_RE.test(value) ? value.toLowerCase() : null;
}

function clampVolume(value: unknown, fallback: number): number {
	const number = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.round(Math.min(1, Math.max(0, number)) * 100) / 100;
}

function validMinute(value: unknown, fallback: number): number {
	const number = typeof value === 'number' ? value : Number(value);
	return Number.isInteger(number) && number >= 0 && number < 24 * 60 ? number : fallback;
}

function validDate(value: unknown): string | null {
	return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function uniqueAccounts(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map(accountId).filter((item): item is string => Boolean(item)))].slice(0, 500);
}

function clone(preferences: CallPreferences): CallPreferences {
	return { ...preferences, knownContactIds: [...preferences.knownContactIds] };
}

export function defaultCallPreferences(id: string, now = new Date()): CallPreferences {
	const normalized = accountId(id);
	if (!normalized) throw new Error('invalid_call_preferences_account');
	return {
		version: CALL_PREFERENCES_VERSION,
		accountId: normalized,
		ringtone: 'classic',
		ringtoneVolume: 0.8,
		ringbackVolume: 0.55,
		vibration: true,
		notificationPreviews: true,
		dndEnabled: false,
		dndStartMinutes: 22 * 60,
		dndEndMinutes: 8 * 60,
		whoMayCall: 'contacts',
		relayOnly: false,
		knownContactIds: [],
		contactsSyncedAt: null,
		updatedAt: now.toISOString()
	};
}

/** Treat every persisted value as untrusted. Invalid fields fall back safely. */
export function parseCallPreferences(value: unknown, expectedAccountId: string): CallPreferences | null {
	const expected = accountId(expectedAccountId);
	if (!expected || !value || typeof value !== 'object' || Array.isArray(value)) return null;
	const source = value as Record<string, unknown>;
	if (accountId(source.accountId) !== expected) return null;
	const fallback = defaultCallPreferences(expected);
	const updatedAt = validDate(source.updatedAt) ?? fallback.updatedAt;
	const contactsSyncedAt = source.contactsSyncedAt === null ? null : validDate(source.contactsSyncedAt);
	return {
		version: CALL_PREFERENCES_VERSION,
		accountId: expected,
		ringtone: RINGTONES.has(source.ringtone as CallRingtone)
			? source.ringtone as CallRingtone
			: fallback.ringtone,
		ringtoneVolume: clampVolume(source.ringtoneVolume, fallback.ringtoneVolume),
		ringbackVolume: clampVolume(source.ringbackVolume, fallback.ringbackVolume),
		vibration: typeof source.vibration === 'boolean' ? source.vibration : fallback.vibration,
		notificationPreviews: typeof source.notificationPreviews === 'boolean'
			? source.notificationPreviews
			: fallback.notificationPreviews,
		dndEnabled: typeof source.dndEnabled === 'boolean' ? source.dndEnabled : fallback.dndEnabled,
		dndStartMinutes: validMinute(source.dndStartMinutes, fallback.dndStartMinutes),
		dndEndMinutes: validMinute(source.dndEndMinutes, fallback.dndEndMinutes),
		whoMayCall: CALL_PERMISSIONS.has(source.whoMayCall as CallPermission)
			? source.whoMayCall as CallPermission
			: fallback.whoMayCall,
		relayOnly: typeof source.relayOnly === 'boolean' ? source.relayOnly : fallback.relayOnly,
		knownContactIds: uniqueAccounts(source.knownContactIds).filter((item) => item !== expected),
		contactsSyncedAt,
		updatedAt
	};
}

function localStorageDependency(dependencies: PreferenceDependencies): StorageLike | null {
	if ('storage' in dependencies) return dependencies.storage ?? null;
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

function cacheDependency(dependencies: PreferenceDependencies): CacheStorageLike | null {
	if ('caches' in dependencies) return dependencies.caches ?? null;
	try {
		return typeof caches === 'undefined' ? null : caches;
	} catch {
		return null;
	}
}

function storageKey(id: string): string {
	return `${STORAGE_PREFIX}${id}`;
}

export function isCallPreferencesStorageKey(key: string | null, id: string): boolean {
	const normalized = accountId(id);
	return Boolean(normalized && key === storageKey(normalized));
}

export function callPreferencesCacheUrl(id: string, origin?: string): string {
	const normalized = accountId(id);
	if (!normalized) throw new Error('invalid_call_preferences_account');
	const base = origin ?? (typeof location !== 'undefined' ? location.origin : 'https://presuntinho.invalid');
	return new URL(`${CACHE_PATH}${encodeURIComponent(normalized)}`, base).toString();
}

function defaultPostToWorker(preferences: CallPreferences): void {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	const message = { type: CALL_PREFERENCES_WORKER_EVENT, preferences };
	const controller = navigator.serviceWorker.controller;
	controller?.postMessage(message);
	void navigator.serviceWorker.ready.then((registration) => {
		if (registration.active && registration.active !== controller) registration.active.postMessage(message);
	}).catch(() => undefined);
}

function defaultDispatch(preferences: CallPreferences): void {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(new CustomEvent<CallPreferences>(CALL_PREFERENCES_EVENT, { detail: clone(preferences) }));
}

async function readCached(id: string, cacheStorage: CacheStorageLike | null): Promise<CallPreferences | null> {
	if (!cacheStorage) return null;
	try {
		const cache = await cacheStorage.open(CALL_PREFERENCES_CACHE);
		const response = await cache.match(callPreferencesCacheUrl(id));
		return response ? parseCallPreferences(await response.json().catch(() => null), id) : null;
	} catch {
		return null;
	}
}

function newest(...values: Array<CallPreferences | null | undefined>): CallPreferences | null {
	let selected: CallPreferences | null = null;
	for (const value of values) {
		if (!value) continue;
		// Later sources win exact timestamp ties. In particular, a storage event
		// must beat this tab's in-memory snapshot even when both writes happened
		// inside the same millisecond.
		if (!selected || Date.parse(value.updatedAt) >= Date.parse(selected.updatedAt)) selected = value;
	}
	return selected;
}

export async function loadCallPreferences(
	id: string,
	dependencies: PreferenceDependencies = {}
): Promise<CallPreferences> {
	const normalized = accountId(id);
	if (!normalized) throw new Error('invalid_call_preferences_account');
	const storage = localStorageDependency(dependencies);
	let stored: CallPreferences | null = null;
	try {
		const raw = storage?.getItem(storageKey(normalized));
		stored = raw ? parseCallPreferences(JSON.parse(raw), normalized) : null;
	} catch {
		stored = null;
	}
	const cached = await readCached(normalized, cacheDependency(dependencies));
	const resolved = newest(memoryPreferences.get(normalized), stored, cached) ?? defaultCallPreferences(normalized);
	memoryPreferences.set(normalized, clone(resolved));
	return clone(resolved);
}

/** Immediate account-safe snapshot used before Realtime listeners can ring. */
export function readCallPreferencesSync(
	id: string,
	storage: StorageLike | null = localStorageDependency({})
): CallPreferences {
	const normalized = accountId(id);
	if (!normalized) throw new Error('invalid_call_preferences_account');
	let stored: CallPreferences | null = null;
	try {
		const raw = storage?.getItem(storageKey(normalized));
		stored = raw ? parseCallPreferences(JSON.parse(raw), normalized) : null;
	} catch {
		stored = null;
	}
	const resolved = newest(memoryPreferences.get(normalized), stored) ?? defaultCallPreferences(normalized);
	memoryPreferences.set(normalized, clone(resolved));
	return clone(resolved);
}

async function writeCached(preferences: CallPreferences, cacheStorage: CacheStorageLike | null): Promise<void> {
	if (!cacheStorage) return;
	const cache = await cacheStorage.open(CALL_PREFERENCES_CACHE);
	await cache.put(
		callPreferencesCacheUrl(preferences.accountId),
		new Response(JSON.stringify(preferences), {
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
		})
	);
}

/**
 * Persists synchronously to account-scoped localStorage, then serializes the
 * shared Cache Storage write so rapid range input cannot overwrite a newer
 * value with an older async write.
 */
export async function saveCallPreferences(
	id: string,
	value: CallPreferences | Partial<Omit<CallPreferences, 'version' | 'accountId' | 'updatedAt'>>,
	dependencies: PreferenceDependencies = {}
): Promise<CallPreferences> {
	const normalized = accountId(id);
	if (!normalized) throw new Error('invalid_call_preferences_account');
	const current = await loadCallPreferences(normalized, dependencies);
	const now = dependencies.now?.() ?? new Date();
	const parsed = parseCallPreferences({
		...current,
		...value,
		version: CALL_PREFERENCES_VERSION,
		accountId: normalized,
		updatedAt: now.toISOString()
	}, normalized);
	if (!parsed) throw new Error('invalid_call_preferences');
	memoryPreferences.set(normalized, clone(parsed));
	try {
		localStorageDependency(dependencies)?.setItem(storageKey(normalized), JSON.stringify(parsed));
	} catch {
		// Cache Storage + the active service worker remain available fallbacks.
	}
	const cacheStorage = cacheDependency(dependencies);
	const previous = writeQueues.get(normalized) ?? Promise.resolve();
	const queued = previous.catch(() => undefined).then(() => writeCached(parsed, cacheStorage));
	writeQueues.set(normalized, queued);
	try {
		await queued;
	} catch {
		// localStorage and the active worker message are independent fallbacks;
		// Cache Storage being unavailable must not freeze the live runtime.
	} finally {
		if (writeQueues.get(normalized) === queued) writeQueues.delete(normalized);
	}
	(dependencies.postToWorker ?? defaultPostToWorker)(clone(parsed));
	(dependencies.dispatch ?? defaultDispatch)(clone(parsed));
	return clone(parsed);
}

export async function updateKnownCallContacts(
	id: string,
	contactIds: string[],
	dependencies: PreferenceDependencies = {}
): Promise<CallPreferences> {
	const now = dependencies.now?.() ?? new Date();
	return saveCallPreferences(id, {
		knownContactIds: uniqueAccounts(contactIds),
		contactsSyncedAt: now.toISOString()
	}, dependencies);
}

export function isCallDndActive(preferences: CallPreferences, now = new Date()): boolean {
	if (!preferences.dndEnabled) return false;
	const minute = now.getHours() * 60 + now.getMinutes();
	const start = preferences.dndStartMinutes;
	const end = preferences.dndEndMinutes;
	if (start === end) return true;
	return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/**
 * `contacts` is fail-open only until this installation has a contact snapshot.
 * The call-start backend still authorizes the direct conversation; once a
 * snapshot exists, a removed/unknown caller is rejected locally as well.
 */
export function evaluateIncomingCallPreferences(
	preferences: CallPreferences,
	callerId: string,
	now = new Date()
): IncomingCallPreferenceDecision {
	const caller = accountId(callerId);
	const blocked = preferences.whoMayCall === 'nobody' || (
		preferences.whoMayCall === 'contacts' &&
		Boolean(preferences.contactsSyncedAt) &&
		(!caller || !preferences.knownContactIds.includes(caller))
	);
	if (blocked) return { allowed: false, silent: true, reason: 'blocked' };
	const dnd = isCallDndActive(preferences, now);
	return { allowed: true, silent: dnd, reason: dnd ? 'dnd' : null };
}

export function minutesToCallTime(minutes: number): string {
	const safe = validMinute(minutes, 0);
	return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function callTimeToMinutes(value: string): number | null {
	const match = /^(\d{2}):(\d{2})$/.exec(value);
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null;
}

function ignoredCallsKey(id: string): string {
	return `${IGNORED_CALLS_PREFIX}${id}`;
}

function readIgnoredCalls(id: string, storage?: StorageLike | null, now = Date.now()): Map<string, number> {
	const normalized = accountId(id);
	if (!normalized) return new Map();
	const calls = new Map(memoryIgnoredCalls.get(normalized) ?? []);
	try {
		const raw = storage?.getItem(ignoredCallsKey(normalized));
		const parsed = raw ? JSON.parse(raw) : null;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			for (const [callId, expiresAt] of Object.entries(parsed)) {
				if (ACCOUNT_RE.test(callId) && Number.isFinite(Number(expiresAt))) {
					calls.set(callId.toLowerCase(), Number(expiresAt));
				}
			}
		}
	} catch {
		// The in-memory registry still prevents a same-tab replay.
	}
	for (const [callId, expiresAt] of calls) {
		if (expiresAt <= now) calls.delete(callId);
	}
	memoryIgnoredCalls.set(normalized, calls);
	return calls;
}

/** Installation-local suppression; it never mutates the shared call session. */
export function rememberLocallyIgnoredCall(
	id: string,
	callId: string,
	expiresAt: string,
	storage: StorageLike | null = localStorageDependency({})
): void {
	const normalized = accountId(id);
	const normalizedCall = accountId(callId);
	const expiry = Date.parse(expiresAt);
	if (!normalized || !normalizedCall || !Number.isFinite(expiry) || expiry <= Date.now()) return;
	const calls = readIgnoredCalls(normalized, storage);
	calls.set(normalizedCall, expiry);
	const bounded = [...calls.entries()].sort((a, b) => b[1] - a[1]).slice(0, 64);
	memoryIgnoredCalls.set(normalized, new Map(bounded));
	try {
		storage?.setItem(ignoredCallsKey(normalized), JSON.stringify(Object.fromEntries(bounded)));
	} catch {
		// Private browsing can reject writes; memory remains safe for this tab.
	}
}

export function isCallIgnoredLocally(
	id: string,
	callId: string,
	now = Date.now(),
	storage: StorageLike | null = localStorageDependency({})
): boolean {
	const normalized = accountId(id);
	const normalizedCall = accountId(callId);
	if (!normalized || !normalizedCall) return false;
	return (readIgnoredCalls(normalized, storage, now).get(normalizedCall) ?? 0) > now;
}

export function clearLocallyIgnoredCalls(id: string, storage: StorageLike | null = localStorageDependency({})): void {
	const normalized = accountId(id);
	if (!normalized) return;
	memoryIgnoredCalls.delete(normalized);
	try {
		storage?.setItem(ignoredCallsKey(normalized), '{}');
	} catch {
		// Memory was still cleared for this runtime.
	}
}
