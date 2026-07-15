import { afterEach, describe, expect, it, vi } from 'vitest';

const pushDeps = vi.hoisted(() => ({
	rpc: vi.fn(),
	getAuthSession: vi.fn(async () => null as { access_token: string } | null),
	getAuthUser: vi.fn(async () => ({ id: 'account-a' })),
	onAuthChange: vi.fn(() => () => {})
}));

vi.mock('$lib/multiplayer/client', () => ({
	getSupabaseClient: () => ({ rpc: pushDeps.rpc })
}));
vi.mock('$lib/multiplayer/config', () => ({ isMultiplayerConfigured: () => true }));
vi.mock('$lib/account/auth', () => ({
	getAuthSession: pushDeps.getAuthSession,
	getAuthUser: pushDeps.getAuthUser,
	onAuthChange: pushDeps.onAuthChange
}));

import {
	getPushInstallationId,
	normalizePushDeliveryResult,
	reconcilePushSubscription,
	revokeAuthenticatedPushBinding,
	sendTestPush,
	syncPushServiceWorkerAccount,
	unsubscribeLocalPushSubscription
} from './push';

afterEach(() => {
	vi.unstubAllGlobals();
	pushDeps.rpc.mockReset();
	pushDeps.getAuthSession.mockReset().mockResolvedValue(null);
	pushDeps.getAuthUser.mockReset().mockResolvedValue({ id: 'account-a' });
});

describe('notification self-test verification', () => {
	function serviceWorkerMessages() {
		let listener: ((event: MessageEvent) => void) | null = null;
		return {
			container: {
				addEventListener: vi.fn((_name: string, callback: (event: MessageEvent) => void) => {
					listener = callback;
				}),
				removeEventListener: vi.fn((_name: string, callback: (event: MessageEvent) => void) => {
					if (listener === callback) listener = null;
				})
			},
			emit(data: unknown) {
				listener?.({ data } as MessageEvent);
			}
		};
	}

	it('reports success only after this service worker confirms presentation', async () => {
		const messages = serviceWorkerMessages();
		vi.stubGlobal('navigator', { serviceWorker: messages.container });
		pushDeps.getAuthSession.mockResolvedValue({ access_token: 'jwt' });
		vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
			const eventId = JSON.parse(String(init.body)).eventId;
			queueMicrotask(() => messages.emit({
				type: 'presuntinho:push-presented',
				eventId
			}));
			return new Response(JSON.stringify({
				attempted: 1, sent: 1, failed: 0, stale: 0, noDevices: false, status: 'sent'
			}), { status: 200, headers: { 'content-type': 'application/json' } });
		}));

		await expect(sendTestPush('Test', 'Body', 50)).resolves.toMatchObject({
			sent: 1,
			verification: 'presented'
		});
		expect(messages.container.removeEventListener).toHaveBeenCalledOnce();
	});

	it('does not confuse provider acceptance with presentation on this device', async () => {
		const messages = serviceWorkerMessages();
		vi.stubGlobal('navigator', { serviceWorker: messages.container });
		pushDeps.getAuthSession.mockResolvedValue({ access_token: 'jwt' });
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
			attempted: 2, sent: 2, failed: 0, stale: 0, noDevices: false, status: 'sent'
		}), { status: 200, headers: { 'content-type': 'application/json' } })));

		await expect(sendTestPush('Test', 'Body', 1)).resolves.toMatchObject({
			sent: 2,
			verification: 'provider-accepted'
		});
	});
});

describe('push delivery result', () => {
	it('preserves structured provider counts and the actual HTTP status', () => {
		expect(
			normalizePushDeliveryResult(
				{ attempted: 3, sent: 1, failed: 1, stale: 1, noDevices: false, status: 'partial' },
				200
			)
		).toEqual({
			attempted: 3,
			sent: 1,
			failed: 1,
			stale: 1,
			noDevices: false,
			status: 'partial',
			httpStatus: 200
		});
	});

	it('does not turn an opaque HTTP failure into success', () => {
		expect(normalizePushDeliveryResult('<html>upstream error</html>', 502)).toMatchObject({
			status: 'unavailable',
			httpStatus: 502,
			sent: 0
		});
	});

	it('reports no-device responses explicitly', () => {
		expect(
			normalizePushDeliveryResult(
				{ attempted: 0, sent: 0, failed: 0, stale: 0, noDevices: true },
				200
			)
		).toMatchObject({ status: 'no-devices', noDevices: true });
	});
});

describe('push installation id', () => {
	it('persists one valid id per browser profile and replaces malformed storage', () => {
		const storage = new Map<string, string>([['presuntinho:push-installation:v1', 'not-a-uuid']]);
		vi.stubGlobal('window', {
			localStorage: {
				getItem: (key: string) => storage.get(key) ?? null,
				setItem: (key: string, value: string) => storage.set(key, value)
			}
		});
		const first = getPushInstallationId();
		const second = getPushInstallationId();
		expect(first).toMatch(/^[0-9a-f-]{36}$/i);
		expect(second).toBe(first);
	});
});

describe('shared-device push teardown', () => {
	it('publishes login and logout identity to every distinct local worker', async () => {
		const controller = { postMessage: vi.fn() };
		const active = { postMessage: vi.fn() };
		const waiting = { postMessage: vi.fn() };
		vi.stubGlobal('navigator', {
			serviceWorker: {
				controller,
				getRegistration: async () => ({ active, waiting, installing: active })
			}
		});
		const accountId = '77777777-7777-4777-8777-777777777777';

		await syncPushServiceWorkerAccount(accountId);
		await syncPushServiceWorkerAccount(null);

		for (const worker of [controller, active, waiting]) {
			expect(worker.postMessage).toHaveBeenNthCalledWith(1, {
				type: 'presuntinho:push-account-binding',
				accountId
			});
			expect(worker.postMessage).toHaveBeenNthCalledWith(2, {
				type: 'presuntinho:push-account-binding',
				accountId: null
			});
		}
	});

	it('revokes only the authenticated installation binding and keeps the browser subscription', async () => {
		const installationId = '11111111-1111-4111-8111-111111111111';
		const unsubscribe = vi.fn(async () => true);
		const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/device-a', unsubscribe };
		vi.stubGlobal('window', {
			localStorage: { getItem: () => installationId }
		});
		vi.stubGlobal('navigator', {
			serviceWorker: {
				getRegistration: async () => ({
					pushManager: { getSubscription: async () => subscription }
				})
			}
		});
		pushDeps.rpc.mockResolvedValue({ data: true, error: null });

		await expect(revokeAuthenticatedPushBinding()).resolves.toBe(true);
		expect(pushDeps.rpc).toHaveBeenCalledWith('revoke_push_installation', {
			p_installation_id: installationId,
			p_endpoint: subscription.endpoint
		});
		expect(unsubscribe).not.toHaveBeenCalled();
	});

	it('does not manufacture an installation id merely to log out', async () => {
		const setItem = vi.fn();
		vi.stubGlobal('window', {
			localStorage: { getItem: () => null, setItem }
		});

		await expect(revokeAuthenticatedPushBinding()).resolves.toBe(false);
		expect(setItem).not.toHaveBeenCalled();
		expect(pushDeps.rpc).not.toHaveBeenCalled();
	});

	it('can fail closed by unsubscribing the local endpoint', async () => {
		const unsubscribe = vi.fn(async () => true);
		vi.stubGlobal('navigator', {
			serviceWorker: {
				getRegistration: async () => ({
					pushManager: { getSubscription: async () => ({ unsubscribe }) }
				})
			}
		});

		await expect(unsubscribeLocalPushSubscription()).resolves.toBe(true);
		expect(unsubscribe).toHaveBeenCalledOnce();
	});

	it('re-subscribes after login when permission remains granted', async () => {
		const installationId = '22222222-2222-4222-8222-222222222222';
		const subscription = {
			toJSON: () => ({
				endpoint: 'https://fcm.googleapis.com/fcm/send/device-b',
				keys: { p256dh: 'abcdefghijklmnop', auth: 'ponmlkjihgfedcba' }
			})
		};
		const subscribe = vi.fn(async () => subscription);
		vi.stubGlobal('Notification', { permission: 'granted' });
		vi.stubGlobal('window', {
			localStorage: { getItem: () => installationId },
			matchMedia: () => ({ matches: false }),
			PushManager: class {},
			Notification: {}
		});
		vi.stubGlobal('navigator', {
			userAgent: 'Mozilla/5.0 Android',
			serviceWorker: {
				getRegistration: async () => ({
					pushManager: { getSubscription: async () => null, subscribe }
				})
			}
		});
		pushDeps.rpc.mockResolvedValue({ data: true, error: null });

		await expect(reconcilePushSubscription({ subscribeIfMissing: true })).resolves.toBe(true);
		expect(subscribe).toHaveBeenCalledOnce();
	});
});
