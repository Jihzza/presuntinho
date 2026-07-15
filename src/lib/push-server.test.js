// @ts-nocheck -- this JS harness mocks Netlify runtime globals.
import { afterEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import {
	dispatchCommunicationPush,
	dispatchCallTerminalBatch,
	sendWebPushWithRetry,
	communicationDispatchSignature,
	validCommunicationDispatchSignature
} from '../../netlify/functions/_shared/push-delivery.js';
import ackHandler, {
	config as ackConfig,
	validAckPayload
} from '../../netlify/functions/call-delivery-ack.js';
import backgroundHandler, {
	config as backgroundConfig,
	signedDispatchRequest
} from '../../netlify/functions/call-push-dispatch.js';
import {
	canonicalAppUrl,
	config as pushConfig,
	default as pushHandler,
	retryableProviderStatus,
	safeSubscription
} from '../../netlify/functions/push-ping.js';

const CALL_ID = '00000000-0000-4000-8000-000000000001';
const MESSAGE_ID = '00000000-0000-4000-8000-000000000004';
const GAME_INVITE_ID = '77777777-7777-4777-8777-777777777777';
const REMINDER_ID = '99999999-9999-4999-8999-999999999998';
const SENDER_ID = '00000000-0000-4000-8000-000000000002';
const CALLEE_ID = '00000000-0000-4000-8000-000000000003';
const DELIVERY_ID = '11111111-1111-4111-8111-111111111111';
const INSTALLATION_ID = 'legacy:0123456789abcdef0123456789abcdef01234567';
const SUBSCRIPTION_ID = '33333333-3333-4333-8333-333333333333';
const ACK_TOKEN = '4'.repeat(64);
const RETRY_ACK_TOKEN = '5'.repeat(64);
const ATTEMPT_TOKEN = '6'.repeat(64);
const RETRY_ATTEMPT_TOKEN = '7'.repeat(64);
const COMMUNICATION_ATTEMPT_TOKEN = '88888888-8888-4888-8888-888888888888';
const SERVICE_ROLE = 'service-role-'.padEnd(64, 's');

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function netlifyEnvironment() {
	vi.stubGlobal('Netlify', {
		env: {
			get: (key) =>
				({
					VITE_SUPABASE_URL: 'https://project.supabase.co',
					VITE_SUPABASE_ANON_KEY: 'anon',
					SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
					VAPID_PUBLIC_KEY: 'vapid-public',
					VAPID_PRIVATE_KEY: 'vapid-private',
					VAPID_SUBJECT: 'mailto:test@presuntinho.love'
				})[key]
		}
	});
}

function callRequest() {
	return new Request('https://presuntinho.love/.netlify/functions/push-ping', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: 'Bearer caller-token'
		},
		body: JSON.stringify({ kind: 'call', callId: CALL_ID })
	});
}

function messageRequest(to = CALLEE_ID) {
	return new Request('https://presuntinho.love/.netlify/functions/push-ping', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: 'Bearer sender-token'
		},
		body: JSON.stringify({ kind: 'message', to, eventId: MESSAGE_ID, title: 'Olá' })
	});
}

function json(value, status = 200) {
	return new Response(JSON.stringify(value), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function callFetchRouter({
	claimed = true,
	summaryStatus = 'provider_accepted',
	recordResult = true,
	backgroundStatus = 202
} = {}) {
	const effects = [];
	const backgroundRequests = [];
	const fetchMock = vi.fn(async (input, init = {}) => {
		const url = new URL(String(input));
		if (url.pathname === '/api/internal/call-push-dispatch') {
			backgroundRequests.push({
				body: JSON.parse(String(init.body)),
				signature: new Headers(init.headers).get('x-presuntinho-dispatch-signature')
			});
			return new Response(null, { status: backgroundStatus });
		}
		if (url.pathname === '/auth/v1/user') return json({ id: SENDER_ID });
		if (url.pathname === '/rest/v1/call_sessions') {
			return json([
				{
					id: CALL_ID,
					caller: SENDER_ID,
					callee: CALLEE_ID,
					kind: 'audio',
					status: 'ringing',
					expires_at: new Date(Date.now() + 60_000).toISOString()
				}
			]);
		}
		if (url.pathname === '/rest/v1/accounts') return json([{ display_name: 'Rafael' }]);
		if (url.pathname.endsWith('/rpc/claim_call_delivery_batch')) {
			return json(
				claimed
					? [
							{
								delivery_id: DELIVERY_ID,
								call_id: CALL_ID,
								account: CALLEE_ID,
								installation_id: INSTALLATION_ID,
								channel: 'push',
								subscription_id: SUBSCRIPTION_ID,
								subscription_version: 1,
								attempt_token: ATTEMPT_TOKEN,
								ack_token: ACK_TOKEN,
								expires_at: new Date(Date.now() + 60_000).toISOString()
							}
						]
					: []
			);
		}
		if (url.pathname === '/rest/v1/push_subscriptions' && init.method === 'DELETE') {
			effects.push({ name: 'delete' });
			return new Response(null, { status: 204 });
		}
		if (url.pathname === '/rest/v1/push_subscriptions') {
			return json([
				{
					id: SUBSCRIPTION_ID,
					delivery_version: 1,
					endpoint: 'https://fcm.googleapis.com/wp/call-device',
					p256dh: 'A'.repeat(64),
					auth: 'B'.repeat(32)
				}
			]);
		}
		if (url.pathname.endsWith('/rpc/record_call_delivery_result')) {
			effects.push({ name: 'record', body: JSON.parse(String(init.body)) });
			return json(recordResult);
		}
		if (url.pathname === '/rest/v1/call_deliveries') {
			return json(summaryStatus ? [{ status: summaryStatus }] : []);
		}
		throw new Error(`unexpected fetch ${init.method || 'GET'} ${url}`);
	});
	return { backgroundRequests, effects, fetchMock };
}

describe('push sender security and retry helpers', () => {
	it('bounds the browser-facing push entrypoint on a custom Netlify path', () => {
		expect(pushConfig).toMatchObject({
			path: ['/api/push-ping', '/.netlify/functions/push-ping'],
			method: 'POST',
			rateLimit: { windowLimit: 60, windowSize: 60 }
		});
	});

	it('keeps deep links same-origin and rejects URL confusion', () => {
		expect(canonicalAppUrl('/mensagens/?callId=abc')).toBe('/mensagens/?callId=abc');
		expect(canonicalAppUrl('/\\evil.example/path')).toBe('/');
		expect(canonicalAppUrl('https://evil.example/path')).toBe('/');
	});

	it('accepts only known HTTPS push providers without credentials or ports', () => {
		const keys = { p256dh: 'A'.repeat(64), auth: 'B'.repeat(32) };
		expect(
			safeSubscription({ endpoint: 'https://fcm.googleapis.com/wp/abc', ...keys })
		).toMatchObject({ endpoint: 'https://fcm.googleapis.com/wp/abc' });
		expect(
			safeSubscription({ endpoint: 'https://attacker.example/wp/abc', ...keys })
		).toBeNull();
		expect(
			safeSubscription({ endpoint: 'https://user@fcm.googleapis.com/wp/abc', ...keys })
		).toBeNull();
	});

	it('retries only transient provider outcomes', () => {
		expect(retryableProviderStatus(0)).toBe(true);
		expect(retryableProviderStatus(429)).toBe(true);
		expect(retryableProviderStatus(503)).toBe(true);
		expect(retryableProviderStatus(404)).toBe(false);
		expect(retryableProviderStatus(410)).toBe(false);
		expect(retryableProviderStatus(400)).toBe(false);
	});

	it('defers 429 retries to the durable dispatcher instead of bursting the provider', async () => {
		const send = vi.spyOn(webpush, 'sendNotification').mockRejectedValue(
			Object.assign(new Error('rate limited'), { statusCode: 429 })
		);
		const result = await sendWebPushWithRetry(
			{
				endpoint: 'https://fcm.googleapis.com/wp/device',
				keys: { p256dh: 'A'.repeat(64), auth: 'B'.repeat(32) }
			},
			'{}',
			{ TTL: 30 }
		);
		expect(result).toEqual({ ok: false, status: 429 });
		expect(send).toHaveBeenCalledOnce();
	});

	it('does not begin a second provider attempt after the delivery deadline', async () => {
		vi.useFakeTimers();
		const now = new Date('2026-07-15T12:00:00.000Z').getTime();
		vi.setSystemTime(now);
		const send = vi.spyOn(webpush, 'sendNotification').mockImplementation(async () => {
			vi.setSystemTime(now + 1500);
			throw Object.assign(new Error('provider timeout'), { statusCode: 503 });
		});

		const result = await sendWebPushWithRetry(
			{
				endpoint: 'https://fcm.googleapis.com/wp/device',
				keys: { p256dh: 'A'.repeat(64), auth: 'B'.repeat(32) }
			},
			'{}',
			{ TTL: 60, deadlineAt: now + 1000 }
		);

		expect(result).toEqual({ ok: false, status: 408, expired: true });
		expect(send).toHaveBeenCalledOnce();
		expect(send.mock.calls[0][2]).not.toHaveProperty('deadlineAt');
		expect(send.mock.calls[0][2]).toMatchObject({ TTL: 1 });
	});

	it.each([null, 'not-a-uuid'])('does not enumerate a consumed or muted message claim (%s)', async (target) => {
		netlifyEnvironment();
		const fetchMock = vi.fn(async (input) => {
			const url = new URL(String(input));
			if (url.pathname === '/auth/v1/user') return json({ id: SENDER_ID });
			if (url.pathname.endsWith('/rpc/enqueue_communication_push')) {
				return json(target === null ? [] : [{ event_id: MESSAGE_ID, target }]);
			}
			throw new Error(`unexpected message fetch ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);
		const send = vi.spyOn(webpush, 'sendNotification');

		const response = await pushHandler(messageRequest());

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			attempted: 0,
			sent: 0,
			status: 'already-processed'
		});
		expect(send).not.toHaveBeenCalled();
	});

	it('still rejects an explicit message target that differs from the claimed peer', async () => {
		netlifyEnvironment();
		const fetchMock = vi.fn(async (input) => {
			const url = new URL(String(input));
			if (url.pathname === '/auth/v1/user') return json({ id: SENDER_ID });
			if (url.pathname.endsWith('/rpc/enqueue_communication_push')) {
				return json([{ event_id: MESSAGE_ID, status: 'queued', target: CALLEE_ID }]);
			}
			throw new Error(`unexpected message fetch ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);
		const send = vi.spyOn(webpush, 'sendNotification');

		const response = await pushHandler(messageRequest(CALL_ID));

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ status: 'forbidden' });
		expect(send).not.toHaveBeenCalled();
	});

	it('CAS-deletes only the stale generic-push subscription version', async () => {
		netlifyEnvironment();
		let deleteUrl = null;
		const fetchMock = vi.fn(async (input, init = {}) => {
			const url = new URL(String(input));
			if (url.pathname === '/auth/v1/user') return json({ id: SENDER_ID });
			if (url.pathname.endsWith('/rpc/enqueue_communication_push')) {
				return json([{ event_id: MESSAGE_ID, status: 'queued', target: CALLEE_ID }]);
			}
			if (url.pathname === '/api/internal/call-push-dispatch') {
				return new Response(null, { status: 202 });
			}
			if (url.pathname.endsWith('/rpc/claim_communication_push')) {
				return json([{
					event_id: MESSAGE_ID,
					kind: 'message',
					sender: SENDER_ID,
					target: CALLEE_ID,
					title: 'Olá',
					body: '',
					url: '/',
					attempt_token: COMMUNICATION_ATTEMPT_TOKEN,
					attempt_count: 1,
					expires_at: new Date(Date.now() + 60_000).toISOString()
				}]);
			}
			if (url.pathname === '/rest/v1/push_subscriptions' && init.method === 'DELETE') {
				deleteUrl = url;
				return new Response(null, { status: 204 });
			}
			if (url.pathname === '/rest/v1/push_subscriptions') {
				return json([{
					id: SUBSCRIPTION_ID,
					delivery_version: 7,
					endpoint: 'https://fcm.googleapis.com/wp/message-device',
					p256dh: 'A'.repeat(64),
					auth: 'B'.repeat(32)
				}]);
			}
			if (url.pathname.endsWith('/rpc/record_communication_push_result')) return json(true);
			throw new Error(`unexpected generic push fetch ${init.method || 'GET'} ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => undefined);
		vi.spyOn(webpush, 'sendNotification').mockRejectedValue(
			Object.assign(new Error('gone'), { statusCode: 410 })
		);

		const response = await pushHandler(messageRequest());
		expect(await response.json()).toMatchObject({ stale: 1, sent: 0 });
		expect(deleteUrl?.searchParams.get('id')).toBe(`eq.${SUBSCRIPTION_ID}`);
		expect(deleteUrl?.searchParams.get('delivery_version')).toBe('eq.7');
	});

	it('keeps one semantic event id across a partial provider retry', async () => {
		let round = 1;
		const recorded = [];
		const payloads = [];
		const sbAdmin = vi.fn(async (path, init = {}) => {
			if (path.endsWith('/rpc/claim_communication_push')) {
				return json([{
					event_id: MESSAGE_ID,
					kind: 'message',
					sender: SENDER_ID,
					target: CALLEE_ID,
					title: 'Olá',
					body: 'Um detalhe',
					url: '/mensagens/',
					attempt_token: round === 1
						? COMMUNICATION_ATTEMPT_TOKEN
						: '99999999-9999-4999-8999-999999999999',
					attempt_count: round,
					expires_at: new Date(Date.now() + 60_000).toISOString()
				}]);
			}
			if (path.startsWith('/rest/v1/push_subscriptions?')) {
				return json([
					{ id: SUBSCRIPTION_ID, delivery_version: 1, endpoint: 'https://fcm.googleapis.com/wp/a', p256dh: 'A'.repeat(64), auth: 'B'.repeat(32) },
					{ id: '44444444-4444-4444-8444-444444444444', delivery_version: 1, endpoint: 'https://fcm.googleapis.com/wp/b', p256dh: 'C'.repeat(64), auth: 'D'.repeat(32) }
				]);
			}
			if (path.endsWith('/rpc/record_communication_push_result')) {
				recorded.push(JSON.parse(String(init.body)));
				return json(true);
			}
			throw new Error(`unexpected communication fetch ${path}`);
		});
		vi.spyOn(webpush, 'sendNotification').mockImplementation(async (subscription, payload) => {
			payloads.push(JSON.parse(String(payload)));
			if (round === 1 && subscription.endpoint.endsWith('/b')) {
				throw Object.assign(new Error('temporary'), { statusCode: 503 });
			}
			return { statusCode: 201 };
		});

		const first = await dispatchCommunicationPush({ sbAdmin, eventId: MESSAGE_ID });
		expect(first.result).toMatchObject({ sent: 1, failed: 1, status: 'retrying' });
		expect(recorded[0]).toMatchObject({ p_sent: 1, p_failed: 1, p_retryable: 1 });
		round = 2;
		const second = await dispatchCommunicationPush({ sbAdmin, eventId: MESSAGE_ID });
		expect(second.result).toMatchObject({ sent: 2, failed: 0, status: 'sent' });
		expect(payloads.every((payload) => payload.eventId === MESSAGE_ID)).toBe(true);
		// The service-worker suite verifies this repeated id is presented only
		// once, including after a worker restart.
	});

	it('dispatches a durable game invite with its authoritative expiry', async () => {
		const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
		const recorded = [];
		const sbAdmin = vi.fn(async (path, init = {}) => {
			if (path.endsWith('/rpc/claim_communication_push')) {
				return json([{
					event_id: GAME_INVITE_ID,
					kind: 'game_invite',
					sender: SENDER_ID,
					target: CALLEE_ID,
					title: 'Convite para jogar',
					body: 'Entra na sala ABC234 com um toque.',
					url: `/secrets/versus/?join=ABC234&invite=${GAME_INVITE_ID}`,
					attempt_token: COMMUNICATION_ATTEMPT_TOKEN,
					attempt_count: 1,
					expires_at: expiresAt
				}]);
			}
			if (path.startsWith('/rest/v1/push_subscriptions?')) {
				return json([{
					id: SUBSCRIPTION_ID,
					delivery_version: 1,
					endpoint: 'https://fcm.googleapis.com/wp/game-invite',
					p256dh: 'A'.repeat(64),
					auth: 'B'.repeat(32)
				}]);
			}
			if (path.endsWith('/rpc/record_communication_push_result')) {
				recorded.push(JSON.parse(String(init.body)));
				return json(true);
			}
			throw new Error(`unexpected game invite fetch ${path}`);
		});
		const send = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({ statusCode: 201 });

		const result = await dispatchCommunicationPush({ sbAdmin, eventId: GAME_INVITE_ID });

		expect(result.result).toMatchObject({ sent: 1, failed: 0, status: 'sent' });
		expect(recorded[0]).toMatchObject({ p_event: GAME_INVITE_ID, p_sent: 1 });
		const payload = JSON.parse(String(send.mock.calls[0][1]));
		expect(payload).toMatchObject({
			eventId: GAME_INVITE_ID,
			kind: 'game_invite',
			expiresAt,
			url: `/secrets/versus/?join=ABC234&invite=${GAME_INVITE_ID}`
		});
		expect(send.mock.calls[0][2]).toMatchObject({ urgency: 'high' });
	});

	it('delivers a private reminder to the owning account with a normal-priority exact deep link', async () => {
		const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
		const sbAdmin = vi.fn(async (path) => {
			if (path.endsWith('/rpc/claim_communication_push')) {
				return json([{
					event_id: REMINDER_ID,
					kind: 'reminder',
					sender: SENDER_ID,
					target: SENDER_ID,
					title: 'Lembrete do Presuntinho',
					body: 'Guardaste uma mensagem para rever agora.',
					url: `/mensagens/?conversation=${CALL_ID}&message=${MESSAGE_ID}`,
					attempt_token: COMMUNICATION_ATTEMPT_TOKEN,
					attempt_count: 1,
					expires_at: expiresAt
				}]);
			}
			if (path.startsWith('/rest/v1/push_subscriptions?')) {
				expect(path).toContain(`account=eq.${SENDER_ID}`);
				return json([{
					id: SUBSCRIPTION_ID,
					delivery_version: 1,
					endpoint: 'https://fcm.googleapis.com/wp/reminder',
					p256dh: 'A'.repeat(64),
					auth: 'B'.repeat(32)
				}]);
			}
			if (path.endsWith('/rpc/record_communication_push_result')) return json(true);
			throw new Error(`unexpected reminder fetch ${path}`);
		});
		const send = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({ statusCode: 201 });

		const result = await dispatchCommunicationPush({ sbAdmin, eventId: REMINDER_ID });

		expect(result.result).toMatchObject({ sent: 1, failed: 0, status: 'sent' });
		const payload = JSON.parse(String(send.mock.calls[0][1]));
		expect(payload).toMatchObject({
			eventId: REMINDER_ID,
			kind: 'reminder',
			recipientId: SENDER_ID,
			url: `/mensagens/?conversation=${CALL_ID}&message=${MESSAGE_ID}`
		});
		expect(send.mock.calls[0][2]).toMatchObject({ urgency: 'normal' });
	});

	it('binds generic background jobs to the event id', () => {
		const signature = communicationDispatchSignature(SERVICE_ROLE, MESSAGE_ID);
		expect(validCommunicationDispatchSignature(SERVICE_ROLE, MESSAGE_ID, signature)).toBe(true);
		expect(validCommunicationDispatchSignature(SERVICE_ROLE, CALL_ID, signature)).toBe(false);
	});
});

describe('durable incoming-call push delivery', () => {
	it('records provider acceptance only after the push side effect and returns structured counts', async () => {
		netlifyEnvironment();
		const { backgroundRequests, effects, fetchMock } = callFetchRouter();
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => undefined);
		vi.spyOn(webpush, 'sendNotification').mockImplementation(async (_subscription, payload, options) => {
			effects.push({ name: 'provider', payload: JSON.parse(payload), options });
			return { statusCode: 201 };
		});

		const response = await pushHandler(callRequest());
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			attempted: 1,
			sent: 1,
			failed: 0,
			stale: 0,
			noDevices: false,
			status: 'sent'
		});
		expect(effects.map((effect) => effect.name)).toEqual(['provider', 'record']);
			expect(effects[0].payload).toMatchObject({
			kind: 'call',
			callId: CALL_ID,
			recipientId: CALLEE_ID,
			deliveryId: DELIVERY_ID,
			deliveryToken: ACK_TOKEN,
			url: `/mensagens/?callId=${CALL_ID}`
		});
		expect(effects[0].options).toMatchObject({ urgency: 'high' });
			expect(effects[1].body).toMatchObject({
				p_delivery: DELIVERY_ID,
				p_attempt_token: ATTEMPT_TOKEN,
				p_subscription_version: 1,
			p_success: true,
			p_status: 201
		});
		expect(backgroundRequests).toHaveLength(1);
		expect(backgroundRequests[0]).toMatchObject({ body: { callId: CALL_ID } });
		expect(backgroundRequests[0].signature).toMatch(/^[a-f0-9]{64}$/);
	});

	it('does not redeliver when the durable claim reports an already accepted delivery', async () => {
		netlifyEnvironment();
		const { fetchMock } = callFetchRouter({ claimed: false });
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => undefined);
		const send = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({ statusCode: 201 });

		const response = await pushHandler(callRequest());
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			attempted: 0,
			sent: 0,
			status: 'already-processed'
		});
		expect(send).not.toHaveBeenCalled();
		const summaryRequest = fetchMock.mock.calls
			.map(([input]) => new URL(String(input)))
			.find((url) => url.pathname === '/rest/v1/call_deliveries');
		expect(summaryRequest?.searchParams.get('channel')).toBe('eq.push');
	});

	it('truthfully reports no push devices when only non-push delivery channels may exist', async () => {
		netlifyEnvironment();
		const { fetchMock } = callFetchRouter({ claimed: false, summaryStatus: null });
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => undefined);
		const send = vi.spyOn(webpush, 'sendNotification');

		const response = await pushHandler(callRequest());
		expect(await response.json()).toMatchObject({
			attempted: 0,
			sent: 0,
			noDevices: true,
			status: 'no-devices'
		});
		expect(send).not.toHaveBeenCalled();
	});

	it('records a stale installation for transactional version-CAS pruning', async () => {
		netlifyEnvironment();
		const { effects, fetchMock } = callFetchRouter();
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => undefined);
		const send = vi.spyOn(webpush, 'sendNotification').mockImplementation(async () => {
			effects.push({ name: 'provider' });
			throw Object.assign(new Error('gone'), { statusCode: 410 });
		});

		const response = await pushHandler(callRequest());
		expect(await response.json()).toMatchObject({
			attempted: 1,
			sent: 0,
			failed: 0,
			stale: 1,
			status: 'failed'
		});
		expect(send).toHaveBeenCalledOnce();
		expect(effects.map((effect) => effect.name)).toEqual(['provider', 'record']);
		expect(effects[1].body).toMatchObject({
			p_delivery: DELIVERY_ID,
			p_attempt_token: ATTEMPT_TOKEN,
			p_subscription_version: 1,
			p_success: false,
			p_status: 410,
			p_stale: true
		});
	});

	it('does not prune a subscription when a stale provider result loses the attempt CAS', async () => {
		netlifyEnvironment();
		const { effects, fetchMock } = callFetchRouter({ recordResult: false });
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => undefined);
		vi.spyOn(webpush, 'sendNotification').mockImplementation(async () => {
			effects.push({ name: 'provider' });
			throw Object.assign(new Error('late gone'), { statusCode: 410 });
		});

		const response = await pushHandler(callRequest());
		expect(await response.json()).toMatchObject({
			attempted: 1,
			failed: 1,
			stale: 0,
			status: 'failed'
		});
		expect(effects.map((effect) => effect.name)).toEqual(['provider', 'record']);
	});

	it('reports retrying when the background queue is not acknowledged with 202', async () => {
		netlifyEnvironment();
		const { backgroundRequests, fetchMock } = callFetchRouter({ backgroundStatus: 503 });
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => undefined);
		vi.spyOn(webpush, 'sendNotification').mockResolvedValue({ statusCode: 201 });

		const response = await pushHandler(callRequest());
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ status: 'retrying', sent: 1 });
		expect(backgroundRequests).toHaveLength(1);
	});

	it.each([
		['cancelled', 60],
		['missed', 3600]
	])('sends a token-free %s terminal replacement with bounded TTL', async (terminalEvent, ttl) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
		const records = [];
		const sbAdmin = vi.fn(async (path, init = {}) => {
			if (path.endsWith('/rpc/claim_call_terminal_delivery_batch')) {
				return json([{
					delivery_id: DELIVERY_ID,
					call_id: CALL_ID,
					account: CALLEE_ID,
					installation_id: INSTALLATION_ID,
					subscription_id: SUBSCRIPTION_ID,
					subscription_version: 1,
					attempt_token: ATTEMPT_TOKEN,
					terminal_event: terminalEvent,
					terminal_expires_at: new Date(Date.now() + ttl * 1000).toISOString()
				}]);
			}
			if (path.startsWith('/rest/v1/push_subscriptions')) {
				return json([{
					id: SUBSCRIPTION_ID,
					delivery_version: 1,
					endpoint: 'https://fcm.googleapis.com/wp/terminal-device',
					p256dh: 'A'.repeat(64),
					auth: 'B'.repeat(32)
				}]);
			}
			if (path.endsWith('/rpc/record_call_terminal_delivery_result')) {
				records.push(JSON.parse(String(init.body)));
				return json(true);
			}
			throw new Error(`unexpected terminal admin fetch ${path}`);
		});
		const send = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({ statusCode: 201 });

		const outcome = await dispatchCallTerminalBatch({
			sbAdmin,
			callId: CALL_ID,
			target: CALLEE_ID,
			eventId: CALL_ID,
			url: `/mensagens/?callId=${CALL_ID}`,
			senderId: SENDER_ID,
			callerName: 'Rafael'
		});

		expect(outcome.result).toMatchObject({ attempted: 1, sent: 1, status: 'sent' });
		const [, payload, options] = send.mock.calls.at(-1);
		const event = JSON.parse(payload);
		expect(event).toMatchObject({
			kind: 'call',
			callState: 'terminal',
			terminalEvent,
			recipientId: CALLEE_ID,
			callId: CALL_ID
		});
		expect(event.deliveryToken).toBeUndefined();
		expect(options.TTL).toBe(ttl);
		expect(records[0]).toMatchObject({
			p_attempt_token: ATTEMPT_TOKEN,
			p_subscription_version: 1,
			p_success: true
		});
	});

	it('does not send a terminal push after its server deadline', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
		const records = [];
		const sbAdmin = vi.fn(async (path, init = {}) => {
			if (path.endsWith('/rpc/claim_call_terminal_delivery_batch')) {
				return json([{
					delivery_id: DELIVERY_ID,
					call_id: CALL_ID,
					account: CALLEE_ID,
					installation_id: INSTALLATION_ID,
					subscription_id: SUBSCRIPTION_ID,
					subscription_version: 1,
					attempt_token: ATTEMPT_TOKEN,
					terminal_event: 'cancelled',
					terminal_expires_at: new Date(Date.now() - 1).toISOString()
				}]);
			}
			if (path.startsWith('/rest/v1/push_subscriptions')) {
				return json([{
					id: SUBSCRIPTION_ID,
					delivery_version: 1,
					endpoint: 'https://fcm.googleapis.com/wp/terminal-device',
					p256dh: 'A'.repeat(64),
					auth: 'B'.repeat(32)
				}]);
			}
			if (path.endsWith('/rpc/record_call_terminal_delivery_result')) {
				records.push(JSON.parse(String(init.body)));
				return json(false);
			}
			throw new Error(`unexpected terminal expiry fetch ${path}`);
		});
		const send = vi.spyOn(webpush, 'sendNotification');

		const outcome = await dispatchCallTerminalBatch({
			sbAdmin,
			callId: CALL_ID,
			target: CALLEE_ID,
			eventId: CALL_ID,
			url: `/mensagens/?callId=${CALL_ID}`,
			senderId: SENDER_ID,
			callerName: 'Rafael'
		});

		expect(send).not.toHaveBeenCalled();
		expect(outcome.result).toMatchObject({ attempted: 1, sent: 0, failed: 1 });
		expect(records[0]).toMatchObject({
			p_subscription_version: 1,
			p_error: 'terminal_delivery_expired',
			p_success: false
		});
	});
});

describe('background call push dispatcher', () => {
	it('is configured as a Background Function and drains a live claimed delivery', async () => {
		netlifyEnvironment();
		expect(backgroundConfig).toMatchObject({
			background: true,
			path: '/api/internal/call-push-dispatch',
			method: 'POST'
		});
		const effects = [];
		let invitationRecorded = false;
		const fetchMock = vi.fn(async (input, init = {}) => {
			const url = new URL(String(input));
			if (url.pathname === '/rest/v1/call_sessions') {
				return json([
					{
						id: CALL_ID,
						caller: SENDER_ID,
						callee: CALLEE_ID,
						kind: 'audio',
						status: invitationRecorded ? 'cancelled' : 'ringing',
						expires_at: new Date(Date.now() + 30_000).toISOString(),
						caller_lease_expires_at: new Date(Date.now() + 60_000).toISOString()
					}
				]);
			}
			if (url.pathname === '/rest/v1/accounts') return json([{ display_name: 'Rafael' }]);
			if (url.pathname.endsWith('/rpc/claim_call_delivery_batch')) {
				return json([
					{
						delivery_id: DELIVERY_ID,
						call_id: CALL_ID,
						account: CALLEE_ID,
						installation_id: INSTALLATION_ID,
						channel: 'push',
						subscription_id: SUBSCRIPTION_ID,
						subscription_version: 1,
						attempt_token: ATTEMPT_TOKEN,
						ack_token: ACK_TOKEN,
						expires_at: new Date(Date.now() + 30_000).toISOString()
					}
				]);
			}
			if (url.pathname === '/rest/v1/push_subscriptions') {
				return json([
					{
						id: SUBSCRIPTION_ID,
						delivery_version: 1,
						endpoint: 'https://fcm.googleapis.com/wp/background-device',
						p256dh: 'A'.repeat(64),
						auth: 'B'.repeat(32)
					}
				]);
			}
			if (url.pathname.endsWith('/rpc/record_call_delivery_result')) {
				effects.push({ name: 'record', body: JSON.parse(String(init.body)) });
				invitationRecorded = true;
				return json(true);
			}
			if (url.pathname.endsWith('/rpc/claim_call_terminal_delivery_batch')) return json([]);
			if (url.pathname === '/rest/v1/call_terminal_outbox') return json([{ status: 'sent' }]);
			if (url.pathname === '/rest/v1/call_deliveries') {
				return json([
					{
						status: 'provider_accepted',
						attempt_count: 1,
						next_attempt_at: 'infinity',
						updated_at: new Date().toISOString()
					}
				]);
			}
			throw new Error(`unexpected background fetch ${init.method || 'GET'} ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => undefined);
		vi.spyOn(webpush, 'sendNotification').mockImplementation(async (_sub, payload) => {
			effects.push({ name: 'provider', payload: JSON.parse(payload) });
			return { statusCode: 201 };
		});

		const response = await backgroundHandler(
			signedDispatchRequest(
				'https://presuntinho.love/api/internal/call-push-dispatch',
				SERVICE_ROLE,
				CALL_ID
			)
		);
		expect(response.status).toBe(204);
		expect(effects.map((effect) => effect.name)).toEqual(['provider', 'record']);
		expect(effects[0].payload).toMatchObject({
			eventId: CALL_ID,
			callId: CALL_ID,
			deliveryToken: ACK_TOKEN
		});
	});

	it('rejects an unsigned public invocation before any database or provider I/O', async () => {
		netlifyEnvironment();
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const send = vi.spyOn(webpush, 'sendNotification');
		const response = await backgroundHandler(
			new Request('https://presuntinho.love/api/internal/call-push-dispatch', {
				method: 'POST',
				headers: { 'x-presuntinho-dispatch-signature': '0'.repeat(64) },
				body: JSON.stringify({ callId: CALL_ID })
			})
		);
		expect(response.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(send).not.toHaveBeenCalled();
	});

	it('keeps watching a live no-device call, then exits after its terminal state', async () => {
		netlifyEnvironment();
		let callReads = 0;
		const fetchMock = vi.fn(async (input, init = {}) => {
			const url = new URL(String(input));
			if (url.pathname === '/rest/v1/call_sessions') {
				return json([
					{
						id: CALL_ID,
						caller: SENDER_ID,
						callee: CALLEE_ID,
						kind: 'audio',
						status: ++callReads >= 4 ? 'cancelled' : 'ringing',
						expires_at: new Date(Date.now() + 30_000).toISOString(),
						caller_lease_expires_at: new Date(Date.now() + 60_000).toISOString()
					}
				]);
			}
			if (url.pathname === '/rest/v1/accounts') return json([{ display_name: 'Rafael' }]);
			if (url.pathname.endsWith('/rpc/claim_call_delivery_batch')) return json([]);
			if (url.pathname.endsWith('/rpc/claim_call_terminal_delivery_batch')) return json([]);
			if (url.pathname === '/rest/v1/call_terminal_outbox') return json([{ status: 'sent' }]);
			if (url.pathname === '/rest/v1/call_deliveries') return json([]);
			throw new Error(`unexpected no-device fetch ${init.method || 'GET'} ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => undefined);
		const send = vi.spyOn(webpush, 'sendNotification');

		const response = await backgroundHandler(
			signedDispatchRequest(
				'https://presuntinho.love/api/internal/call-push-dispatch',
				SERVICE_ROLE,
				CALL_ID
			)
		);
		expect(response.status).toBe(204);
		expect(send).not.toHaveBeenCalled();
		const deliveryQueries = fetchMock.mock.calls.filter(
			([input]) => new URL(String(input)).pathname === '/rest/v1/call_deliveries'
		);
		expect(deliveryQueries.length).toBeGreaterThanOrEqual(2);
	});

	it('waits for a retryable DB deadline, reclaims once, then terminates on acceptance', async () => {
		vi.useFakeTimers();
		netlifyEnvironment();
		const now = Date.now();
		let recordCount = 0;
		let providerAttempts = 0;
		const records = [];
		const deliveredAckTokens = [];
		const fetchMock = vi.fn(async (input, init = {}) => {
			const url = new URL(String(input));
			if (url.pathname === '/rest/v1/call_sessions') {
				return json([
					{
						id: CALL_ID,
						caller: SENDER_ID,
						callee: CALLEE_ID,
						kind: 'audio',
						status: recordCount >= 2 ? 'cancelled' : 'ringing',
						expires_at: new Date(now + 30_000).toISOString(),
						caller_lease_expires_at: new Date(now + 60_000).toISOString()
					}
				]);
			}
			if (url.pathname === '/rest/v1/accounts') return json([{ display_name: 'Rafael' }]);
			if (url.pathname.endsWith('/rpc/claim_call_delivery_batch')) {
				return json([
					{
						delivery_id: DELIVERY_ID,
						call_id: CALL_ID,
						account: CALLEE_ID,
						installation_id: INSTALLATION_ID,
						channel: 'push',
						subscription_id: SUBSCRIPTION_ID,
						subscription_version: 1,
						attempt_token: recordCount === 0 ? ATTEMPT_TOKEN : RETRY_ATTEMPT_TOKEN,
						ack_token: recordCount === 0 ? ACK_TOKEN : RETRY_ACK_TOKEN,
						expires_at: new Date(now + 30_000).toISOString()
					}
				]);
			}
			if (url.pathname === '/rest/v1/push_subscriptions') {
				return json([
					{
						id: SUBSCRIPTION_ID,
						delivery_version: 1,
						endpoint: 'https://fcm.googleapis.com/wp/retry-device',
						p256dh: 'A'.repeat(64),
						auth: 'B'.repeat(32)
					}
				]);
			}
			if (url.pathname.endsWith('/rpc/record_call_delivery_result')) {
				const value = JSON.parse(String(init.body));
				records.push(value);
				recordCount++;
				return json(true);
			}
			if (url.pathname.endsWith('/rpc/claim_call_terminal_delivery_batch')) return json([]);
			if (url.pathname === '/rest/v1/call_terminal_outbox') return json([{ status: 'sent' }]);
			if (url.pathname === '/rest/v1/call_deliveries') {
				return recordCount === 1
					? json([
							{
								status: 'failed',
								attempt_count: 1,
								next_attempt_at: new Date(Date.now()).toISOString(),
								updated_at: new Date(Date.now()).toISOString()
							}
						])
					: json([
							{
								status: 'provider_accepted',
								attempt_count: 2,
								next_attempt_at: 'infinity',
								updated_at: new Date(Date.now()).toISOString()
							}
						]);
			}
			throw new Error(`unexpected retry fetch ${init.method || 'GET'} ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => undefined);
		vi.spyOn(webpush, 'sendNotification').mockImplementation(async (_subscription, payload) => {
			providerAttempts++;
			deliveredAckTokens.push(JSON.parse(payload).deliveryToken);
			if (providerAttempts <= 2) throw Object.assign(new Error('temporary'), { statusCode: 503 });
			return { statusCode: 201 };
		});

		const outcome = backgroundHandler(
			signedDispatchRequest(
				'https://presuntinho.love/api/internal/call-push-dispatch',
				SERVICE_ROLE,
				CALL_ID
			)
		);
		await vi.advanceTimersByTimeAsync(0);
		expect(recordCount).toBe(1);
		await vi.advanceTimersByTimeAsync(2000);
		const response = await outcome;

		expect(response.status).toBe(204);
		expect(providerAttempts).toBe(3);
		expect(recordCount).toBe(2);
		expect(records.map((record) => record.p_success)).toEqual([false, true]);
		expect(records.map((record) => record.p_attempt_token)).toEqual([
			ATTEMPT_TOKEN,
			RETRY_ATTEMPT_TOKEN
		]);
		expect(deliveredAckTokens).toEqual([ACK_TOKEN, ACK_TOKEN, RETRY_ACK_TOKEN]);
		expect(deliveredAckTokens[0]).not.toBe(records[0].p_attempt_token);
		expect(deliveredAckTokens[2]).not.toBe(records[1].p_attempt_token);
		expect(records[0].p_retry_at).toBeTruthy();
	});
});

describe('call delivery ACK endpoint', () => {
	it('uses a rate-limited custom POST route', () => {
		expect(ackConfig).toEqual({
			path: '/api/call-delivery-ack',
			method: 'POST',
			rateLimit: {
				windowLimit: 240,
				windowSize: 60,
				aggregateBy: ['ip', 'domain']
			}
		});
	});

	it('rejects an id without its high-entropy token', () => {
		expect(validAckPayload({ deliveryId: DELIVERY_ID, stage: 'received' })).toBeNull();
		expect(validAckPayload({ deliveryId: DELIVERY_ID, token: ACK_TOKEN, stage: 'ringing' })).toBeNull();
	});

	it('passes only the capability token to the service-only RPC', async () => {
		vi.stubGlobal('Netlify', {
			env: {
				get: (key) =>
					key === 'VITE_SUPABASE_URL' ? 'https://project.supabase.co' : 'service-secret'
			}
		});
		const fetchMock = vi.fn(async () => new Response('true', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const response = await ackHandler(
			new Request('https://presuntinho.love/api/call-delivery-ack', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ deliveryId: DELIVERY_ID, token: ACK_TOKEN, stage: 'presented' })
			})
		);

		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({ acknowledged: true });
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://project.supabase.co/rest/v1/rpc/ack_call_delivery_with_token');
		expect(JSON.parse(init.body)).toEqual({
			p_delivery: DELIVERY_ID,
			p_token: ACK_TOKEN,
			p_stage: 'presented'
		});
	});

	it('does not enumerate invalid or expired capabilities', async () => {
		vi.stubGlobal('Netlify', {
			env: {
				get: (key) =>
					key === 'VITE_SUPABASE_URL' ? 'https://project.supabase.co' : 'service-secret'
			}
		});
		vi.stubGlobal('fetch', vi.fn(async () => new Response('false', { status: 200 })));
		const response = await ackHandler(
			new Request('https://presuntinho.love/api/call-delivery-ack', {
				method: 'POST',
				body: JSON.stringify({ deliveryId: DELIVERY_ID, token: ACK_TOKEN, stage: 'received' })
			})
		);
		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({ acknowledged: false });
	});
});
