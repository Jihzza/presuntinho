import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const CALL_ID = '11111111-1111-4111-8111-111111111111';
const DELIVERY_ID = '22222222-2222-4222-8222-222222222222';
const RECIPIENT_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ACCOUNT_ID = '99999999-9999-4999-8999-999999999999';
const TOKEN = '4'.repeat(64);

function createWorkerHarness({
	clients = [] as any[],
	cacheEntries = new Map<string, Response>()
}: { clients?: any[]; cacheEntries?: Map<string, Response> } = {}) {
	const handlers = new Map<string, (event: any) => void>();
	const shown: Array<{ title: string; options: any }> = [];
	const messages: any[] = [];
	const navigations: string[] = [];
	const ackStages: string[] = [];
	const fetchOutcomes: Array<'network' | 'hang' | number> = [];
	const notifications = new Map<string, any>();
	const cacheKey = (key: string | Request) => typeof key === 'string' ? key : key.url;
	const cachesMock = {
		open: async (cacheName: string) => ({
			put: async (key: string | Request, response: Response) => {
				cacheEntries.set(`${cacheName}|${cacheKey(key)}`, response.clone());
			},
			match: async (key: string | Request) => cacheEntries.get(`${cacheName}|${cacheKey(key)}`)?.clone(),
			delete: async (key: string | Request) => cacheEntries.delete(`${cacheName}|${cacheKey(key)}`),
			keys: async () => [...cacheEntries.keys()]
				.filter((entry) => entry.startsWith(`${cacheName}|`))
				.map((entry) => new Request(entry.slice(cacheName.length + 1)))
		})
	};
	const sandboxSelf = {
		location: { origin: 'https://presuntinho.love' },
		registration: {
			getNotifications: async ({ tag }: { tag?: string } = {}) =>
				[...notifications.values()].filter((notification) => !tag || notification.tag === tag),
			showNotification: async (title: string, options: any) => {
				shown.push({ title, options });
				const notification = {
					tag: options.tag,
					data: options.data,
					close: vi.fn(() => notifications.delete(options.tag))
				};
				notifications.set(options.tag, notification);
			}
		},
		clients: {
			matchAll: async () => clients,
			openWindow: async (url: string) => {
				navigations.push(url);
				return null;
			}
		},
		addEventListener: (name: string, callback: (event: any) => void) => handlers.set(name, callback)
	};
	for (const client of clients) {
		const original = client.postMessage;
		client.postMessage = (message: any) => {
			messages.push(message);
			original?.(message);
		};
	}
	const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
		ackStages.push(JSON.parse(String(init.body)).stage);
		const outcome = fetchOutcomes.shift();
		if (outcome === 'network') throw new TypeError('temporary network failure');
		if (outcome === 'hang') {
			return await new Promise<Response>((_resolve, reject) => {
				init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
			});
		}
		const status = typeof outcome === 'number' ? outcome : 202;
		return new Response(
			JSON.stringify({ acknowledged: status >= 200 && status < 300 }),
			{ status }
		);
	});
	const source = readFileSync(new URL('../../static/push-sw.js', import.meta.url), 'utf8');
	runInNewContext(source, {
		self: sandboxSelf,
		caches: cachesMock,
		fetch: fetchMock,
		URL,
		Request,
		Response,
		JSON,
		Date,
		Math,
		Promise,
		AbortController,
		DOMException,
		Error,
		encodeURIComponent,
		setTimeout: (callback: () => void) => {
			callback();
			return 1;
		},
		clearTimeout: () => undefined
	});

	const push = async (data: Record<string, unknown>) => {
		let work: Promise<unknown> | undefined;
		handlers.get('push')?.({
			data: { json: () => data },
			waitUntil: (value: Promise<unknown>) => (work = value)
		});
		await work;
	};
	const activate = async () => {
		let work: Promise<unknown> | undefined;
		handlers.get('activate')?.({ waitUntil: (value: Promise<unknown>) => (work = value) });
		await work;
	};
	const message = async (data: Record<string, unknown>) => {
		let work: Promise<unknown> | undefined;
		handlers.get('message')?.({
			data,
			waitUntil: (value: Promise<unknown>) => (work = value)
		});
		await work;
	};
	const setNotification = (tag: string, data: any) => {
		const notification = { tag, data, close: vi.fn(() => notifications.delete(tag)) };
		notifications.set(tag, notification);
		return notification;
	};
	return {
		ackStages,
		activate,
		cacheEntries,
		fetchMock,
		fetchOutcomes,
		handlers,
		messages,
		message,
		navigations,
		notifications,
		push,
		setNotification,
		shown
	};
}

describe('push service worker call delivery', () => {
	it('confirms a self-test to the local page only after notification presentation succeeds', async () => {
		const client = { focused: true, visibilityState: 'visible' };
		const worker = createWorkerHarness({ clients: [client] });
		const eventId = '88888888-8888-4888-8888-888888888888';

		await worker.push({
			type: 'presuntinho:push-event',
			eventId,
			kind: 'test',
			title: 'Teste',
			body: 'Confirma este aparelho',
			url: '/definicoes/'
		});

		expect(worker.shown).toHaveLength(1);
		expect(worker.messages).toHaveLength(2);
		expect(worker.messages[0]).toMatchObject({
			type: 'presuntinho:push-event',
			eventId
		});
		expect(worker.messages[1]).toMatchObject({
			type: 'presuntinho:push-presented',
			eventId,
			kind: 'test'
		});
	});

	it('presents a durable game invite with a distinct haptic pattern and deep link', async () => {
		const worker = createWorkerHarness();
		const eventId = '77777777-7777-4777-8777-777777777777';
		await worker.push({
			type: 'presuntinho:push-event',
			eventId,
			kind: 'game_invite',
			title: 'Convite para jogar',
			body: 'Entra na sala ABC234 com um toque.',
			url: `/secrets/versus/?join=ABC234&invite=${eventId}`,
			expiresAt: new Date(Date.now() + 60_000).toISOString()
		});

		expect(worker.shown).toHaveLength(1);
		expect(worker.shown[0].options).toMatchObject({
			tag: `presuntinho-game-invite-${eventId}`,
			vibrate: [70, 70, 110, 70, 170]
		});
		expect(worker.shown[0].options.data.url).toContain(`invite=${eventId}`);
	});

	it('suppresses expired or mismatched game-invite capabilities', async () => {
		const eventId = '77777777-7777-4777-8777-777777777777';
		const expiredWorker = createWorkerHarness();
		await expiredWorker.push({
			type: 'presuntinho:push-event',
			eventId,
			kind: 'game_invite',
			title: 'Convite para jogar',
			url: `/secrets/versus/?join=ABC234&invite=${eventId}`,
			expiresAt: new Date(Date.now() - 1).toISOString()
		});
		expect(expiredWorker.shown).toHaveLength(0);

		const mismatchedWorker = createWorkerHarness();
		await mismatchedWorker.push({
			type: 'presuntinho:push-event',
			eventId,
			kind: 'game_invite',
			title: 'Convite para jogar',
			url: '/secrets/versus/?join=ABC234&invite=11111111-1111-4111-8111-111111111111',
			expiresAt: new Date(Date.now() + 60_000).toISOString()
		});
		expect(mismatchedWorker.shown).toHaveLength(0);
	});

	it('deduplicates at-least-once communication retries across worker restarts', async () => {
		const cacheEntries = new Map<string, Response>();
		const client = { focused: true, visibilityState: 'visible' };
		const payload = {
			type: 'presuntinho:push-event',
			eventId: '99999999-9999-4999-8999-999999999999',
			kind: 'message',
			title: 'Nova mensagem',
			body: 'Olá',
			url: '/mensagens/'
		};
		const firstWorker = createWorkerHarness({ clients: [client], cacheEntries });
		await firstWorker.push(payload);
		await firstWorker.push(payload);
		expect(firstWorker.shown).toHaveLength(1);
		expect(firstWorker.messages).toHaveLength(1);

		const restartedWorker = createWorkerHarness({ clients: [client], cacheEntries });
		await restartedWorker.push(payload);
		expect(restartedWorker.shown).toHaveLength(0);
		expect(restartedWorker.messages).toHaveLength(0);
	});

	it('coalesces message notifications by conversation while retaining the newest exact link', async () => {
		const worker = createWorkerHarness();
		const conversation = '66666666-6666-4666-8666-666666666666';
		await worker.push({
			eventId: '11111111-aaaa-4111-8111-111111111111',
			kind: 'message',
			title: 'Mensagem',
			body: 'Primeira',
			url: `/mensagens/?conversation=${conversation}&message=11111111-aaaa-4111-8111-111111111111`
		});
		await worker.push({
			eventId: '22222222-bbbb-4222-8222-222222222222',
			kind: 'message',
			title: 'Mensagem',
			body: 'Segunda',
			url: `/mensagens/?conversation=${conversation}&message=22222222-bbbb-4222-8222-222222222222`
		});

		expect(worker.shown).toHaveLength(2);
		expect(worker.shown[0].options.tag).toBe(`presuntinho-msg-${conversation}`);
		expect(worker.shown[1].options.tag).toBe(`presuntinho-msg-${conversation}`);
		expect(worker.shown[1].options.data.url).toContain('message=22222222');
		expect(worker.notifications.size).toBe(1);
	});

	it('shows a visible foreground notification, ACKs only observable stages and strips the token', async () => {
		const handlers = new Map<string, (event: any) => void>();
		const notifications: Array<{ title: string; options: any }> = [];
		const messages: any[] = [];
		const navigations: string[] = [];
		const ackStages: string[] = [];
		const client = {
			focused: true,
			visibilityState: 'visible',
			postMessage: (message: any) => messages.push(message),
			navigate: async (url: string) => {
				navigations.push(url);
				return client;
			},
			focus: async () => client
		};
		const sandboxSelf = {
			location: { origin: 'https://presuntinho.love' },
			registration: {
				getNotifications: async () => [],
				showNotification: async (title: string, options: any) => {
					notifications.push({ title, options });
				}
			},
			clients: {
				matchAll: async () => [client],
				openWindow: async () => client
			},
			addEventListener: (name: string, callback: (event: any) => void) => handlers.set(name, callback)
		};
		const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
			ackStages.push(JSON.parse(String(init.body)).stage);
			return new Response(JSON.stringify({ acknowledged: true }), { status: 202 });
		});
		const source = readFileSync(new URL('../../static/push-sw.js', import.meta.url), 'utf8');
		runInNewContext(source, {
			self: sandboxSelf,
			fetch: fetchMock,
			URL,
			Response,
			JSON,
			Date,
			Math,
			Promise,
			AbortController,
			Error,
			encodeURIComponent,
			setTimeout,
			clearTimeout
		});

		let pushWork: Promise<unknown> | undefined;
		handlers.get('push')?.({
			data: {
				json: () => ({
					type: 'presuntinho:push-event',
					eventId: 'evt',
					kind: 'call',
					title: 'Chamada recebida',
					body: 'Rafael está a ligar-te.',
					url: '/mensagens/',
					callId: CALL_ID,
					deliveryId: DELIVERY_ID,
					deliveryToken: TOKEN,
					expiresAt: new Date(Date.now() + 60_000).toISOString()
				})
			},
			waitUntil: (work: Promise<unknown>) => (pushWork = work)
		});
		await pushWork;

		expect(ackStages).toEqual(['received', 'presented']);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/call-delivery-ack',
			expect.objectContaining({ method: 'POST' })
		);
		expect(messages).toHaveLength(1);
		expect(messages[0].deliveryToken).toBeUndefined();
		expect(messages[0].deliveryId).toBe(DELIVERY_ID);
		expect(notifications).toHaveLength(1);
		const options = notifications[0].options;
		expect(options.silent).toBeUndefined();
		expect(options.renotify).toBe(true);
		expect(options.requireInteraction).toBe(true);
		expect(options.vibrate).toEqual([220, 100, 220, 600, 220, 100, 220]);
		expect(options.data.url).toContain(`callId=${CALL_ID}`);

		let clickWork: Promise<unknown> | undefined;
		handlers.get('notificationclick')?.({
			notification: { data: options.data, close: vi.fn() },
			waitUntil: (work: Promise<unknown>) => (clickWork = work)
		});
		await clickWork;
		expect(ackStages).toEqual(['received', 'presented', 'opened']);
		expect(navigations[0]).toContain(`callId=${CALL_ID}`);
		expect(ackStages).not.toContain('ringing');
	});

	it('shows the incoming call with no visible page and ACKs received + presented', async () => {
		const worker = createWorkerHarness();
		await worker.push({
			type: 'presuntinho:push-event',
			eventId: CALL_ID,
			kind: 'call',
			title: 'Chamada recebida',
			body: 'Rafael está a ligar-te.',
			url: '/mensagens/',
			callId: CALL_ID,
			deliveryId: DELIVERY_ID,
			deliveryToken: TOKEN,
			expiresAt: new Date(Date.now() + 60_000).toISOString()
		});

		expect(worker.ackStages).toEqual(['received', 'presented']);
		expect(worker.messages).toHaveLength(0);
		expect(worker.shown).toHaveLength(1);
		expect(worker.shown[0].options).toMatchObject({
			tag: `presuntinho-call-${CALL_ID}`,
			requireInteraction: true,
			renotify: true
		});
		expect(worker.shown[0].options.silent).toBeUndefined();
	});

	it('suppresses a late call for the previous account and never ACKs it as received', async () => {
		const cacheEntries = new Map<string, Response>();
		const worker = createWorkerHarness({ cacheEntries });
		await worker.message({
			type: 'presuntinho:push-account-binding',
			accountId: OTHER_ACCOUNT_ID
		});

		await worker.push({
			type: 'presuntinho:push-event',
			eventId: CALL_ID,
			kind: 'call',
			title: 'Chamada recebida',
			body: 'Conta anterior está a ligar.',
			url: '/mensagens/',
			recipientId: RECIPIENT_ID,
			callId: CALL_ID,
			deliveryId: DELIVERY_ID,
			deliveryToken: TOKEN,
			expiresAt: new Date(Date.now() + 60_000).toISOString()
		});

		expect(worker.shown).toHaveLength(0);
		expect(worker.notifications.size).toBe(0);
		expect(worker.ackStages).toEqual([]);

		const restarted = createWorkerHarness({ cacheEntries });
		await restarted.push({
			type: 'presuntinho:push-event',
			eventId: CALL_ID,
			kind: 'call',
			title: 'Chamada recebida',
			body: 'Conta anterior está a ligar.',
			url: '/mensagens/',
			recipientId: RECIPIENT_ID,
			callId: CALL_ID,
			deliveryId: DELIVERY_ID,
			deliveryToken: TOKEN,
			expiresAt: new Date(Date.now() + 60_000).toISOString()
		});
		expect(restarted.shown).toHaveLength(0);
		expect(restarted.ackStages).toEqual([]);
	});

	it('closes recipient-bound notifications immediately on logout', async () => {
		const worker = createWorkerHarness();
		await worker.message({
			type: 'presuntinho:push-account-binding',
			accountId: RECIPIENT_ID
		});
		await worker.push({
			type: 'presuntinho:push-event',
			eventId: CALL_ID,
			kind: 'call',
			title: 'Chamada recebida',
			url: '/mensagens/',
			recipientId: RECIPIENT_ID,
			callId: CALL_ID,
			deliveryId: DELIVERY_ID,
			deliveryToken: TOKEN,
			expiresAt: new Date(Date.now() + 60_000).toISOString()
		});
		expect(worker.notifications.size).toBe(1);

		await worker.message({
			type: 'presuntinho:push-account-binding',
			accountId: null
		});
		expect(worker.notifications.size).toBe(0);
	});

	it('ignores a stale notification click that races an account switch', async () => {
		const worker = createWorkerHarness();
		await worker.message({
			type: 'presuntinho:push-account-binding',
			accountId: RECIPIENT_ID
		});
		await worker.push({
			type: 'presuntinho:push-event',
			eventId: CALL_ID,
			kind: 'call',
			title: 'Chamada recebida',
			url: `/mensagens/?callId=${CALL_ID}`,
			recipientId: RECIPIENT_ID,
			callId: CALL_ID,
			deliveryId: DELIVERY_ID,
			deliveryToken: TOKEN,
			expiresAt: new Date(Date.now() + 60_000).toISOString()
		});
		const notificationData = worker.shown[0].options.data;

		await worker.message({
			type: 'presuntinho:push-account-binding',
			accountId: OTHER_ACCOUNT_ID
		});
		let clickWork: Promise<unknown> | undefined;
		worker.handlers.get('notificationclick')?.({
			notification: { data: notificationData, close: vi.fn() },
			waitUntil: (work: Promise<unknown>) => (clickWork = work)
		});
		await clickWork;

		expect(worker.ackStages).toEqual(['received', 'presented']);
		expect(worker.navigations).toEqual([]);
	});

	it('serializes local terminal cleanup with an in-flight invitation push', async () => {
		const worker = createWorkerHarness();
		const incoming = worker.push({
			type: 'presuntinho:push-event',
			eventId: CALL_ID,
			kind: 'call',
			title: 'Chamada recebida',
			url: '/mensagens/',
			callId: CALL_ID,
			deliveryId: DELIVERY_ID,
			deliveryToken: TOKEN,
			expiresAt: new Date(Date.now() + 60_000).toISOString()
		});
		const terminal = worker.message({
			type: 'presuntinho:call-terminal-local',
			callId: CALL_ID
		});

		await Promise.all([incoming, terminal]);
		expect(worker.notifications.size).toBe(0);
	});

	it('retries transient delivery ACK failures inside waitUntil and stops after success', async () => {
		const worker = createWorkerHarness();
		worker.fetchOutcomes.push('network', 503, 202, 429, 202);
		await worker.push({
			type: 'presuntinho:push-event',
			eventId: CALL_ID,
			kind: 'call',
			title: 'Chamada recebida',
			body: 'Rafael está a ligar-te.',
			url: '/mensagens/',
			callId: CALL_ID,
			deliveryId: DELIVERY_ID,
			deliveryToken: TOKEN,
			expiresAt: new Date(Date.now() + 60_000).toISOString()
		});

		expect(worker.ackStages).toEqual([
			'received', 'received', 'received',
			'presented', 'presented'
		]);
		expect(worker.shown).toHaveLength(1);
	});

	it('aborts a hung ACK attempt and completes the bounded waitUntil retry', async () => {
		const worker = createWorkerHarness();
		worker.fetchOutcomes.push('hang');
		await worker.push({
			type: 'presuntinho:push-event',
			eventId: CALL_ID,
			kind: 'call',
			title: 'Chamada recebida',
			body: 'Rafael está a ligar-te.',
			url: '/mensagens/',
			callId: CALL_ID,
			deliveryId: DELIVERY_ID,
			deliveryToken: TOKEN,
			expiresAt: new Date(Date.now() + 60_000).toISOString()
		});

		expect(worker.ackStages.filter((stage) => stage === 'received')).toHaveLength(2);
		expect(worker.ackStages.filter((stage) => stage === 'presented')).toHaveLength(1);
		expect(worker.shown).toHaveLength(1);
	});

	it('does not retry a permanently rejected delivery capability', async () => {
		const worker = createWorkerHarness();
		worker.fetchOutcomes.push(403, 403);
		await worker.push({
			type: 'presuntinho:push-event',
			eventId: CALL_ID,
			kind: 'call',
			title: 'Chamada recebida',
			body: 'Rafael está a ligar-te.',
			url: '/mensagens/',
			callId: CALL_ID,
			deliveryId: DELIVERY_ID,
			deliveryToken: TOKEN,
			expiresAt: new Date(Date.now() + 60_000).toISOString()
		});

		expect(worker.ackStages).toEqual(['received', 'presented']);
	});

	it('persists a terminal tombstone so a late incoming push cannot reopen the call', async () => {
		const client = { focused: true, visibilityState: 'visible' };
		const worker = createWorkerHarness({ clients: [client] });
		await worker.push({
			type: 'presuntinho:push-event',
			eventId: `${CALL_ID}:terminal:cancelled`,
			kind: 'call',
			callState: 'terminal',
			terminalEvent: 'cancelled',
			terminalExpiresAt: new Date(Date.now() + 60_000).toISOString(),
			title: 'Chamada terminada',
			body: 'Rafael já não está a ligar.',
			url: '/mensagens/',
			callId: CALL_ID
		});
		expect(worker.shown[0].options).toMatchObject({
			tag: `presuntinho-call-${CALL_ID}`,
			silent: true,
			renotify: false,
			requireInteraction: false
		});
		expect(worker.shown[0].options.vibrate).toBeUndefined();
		expect(worker.notifications.size).toBe(0);

		await worker.push({
			type: 'presuntinho:push-event',
			eventId: CALL_ID,
			kind: 'call',
			title: 'Chamada recebida',
			body: 'Rafael está a ligar-te.',
			url: '/mensagens/',
			callId: CALL_ID,
			deliveryId: DELIVERY_ID,
			deliveryToken: TOKEN,
			expiresAt: new Date(Date.now() + 60_000).toISOString()
		});
		expect(worker.shown).toHaveLength(1);
		expect(worker.ackStages).toEqual(['received']);
		expect(worker.messages[0].deliveryToken).toBeUndefined();
	});

	it('persists a page-observed terminal state across worker restart before a late invitation arrives', async () => {
		const cacheEntries = new Map<string, Response>();
		const firstWorker = createWorkerHarness({ cacheEntries });
		await firstWorker.message({
			type: 'presuntinho:call-terminal-local',
			callId: CALL_ID
		});
		expect(cacheEntries.size).toBe(1);

		// A fresh VM has no in-memory tombstone; only Cache Storage survives.
		const restartedWorker = createWorkerHarness({ cacheEntries });
		await restartedWorker.push({
			type: 'presuntinho:push-event',
			eventId: CALL_ID,
			kind: 'call',
			title: 'Chamada recebida',
			body: 'Rafael está a ligar-te.',
			url: '/mensagens/',
			callId: CALL_ID,
			deliveryId: DELIVERY_ID,
			deliveryToken: TOKEN,
			expiresAt: new Date(Date.now() + 60_000).toISOString()
		});

		expect(restartedWorker.shown).toHaveLength(0);
		expect(restartedWorker.notifications.size).toBe(0);
		expect(restartedWorker.ackStages).toEqual(['received']);
	});

	it('replaces an already-visible incoming notification and keeps missed calls as normal history', async () => {
		const worker = createWorkerHarness();
		const incoming = {
			type: 'presuntinho:push-event',
			eventId: CALL_ID,
			kind: 'call',
			title: 'Chamada recebida',
			body: 'Rafael está a ligar-te.',
			url: '/mensagens/',
			callId: CALL_ID,
			deliveryId: DELIVERY_ID,
			deliveryToken: TOKEN,
			expiresAt: new Date(Date.now() + 60_000).toISOString()
		};
		await worker.push(incoming);
		expect(worker.notifications.size).toBe(1);

		await worker.push({
			...incoming,
			eventId: `${CALL_ID}:terminal:missed`,
			callState: 'terminal',
			terminalEvent: 'missed',
			terminalExpiresAt: new Date(Date.now() + 60_000).toISOString(),
			title: 'Chamada não atendida',
			body: 'Rafael tentou ligar-te.',
			deliveryId: undefined,
			deliveryToken: undefined,
			expiresAt: undefined
		});
		expect(worker.shown).toHaveLength(2);
		expect(worker.notifications.size).toBe(1);
		const current = [...worker.notifications.values()][0];
		expect(current.data.terminalEvent).toBe('missed');
		expect(worker.shown[1].options.silent).toBe(true);
		expect(worker.shown[1].options.requireInteraction).toBe(false);
	});

	it('closes an expired incoming call without displaying it and activate cleans stale terminal notices', async () => {
		const worker = createWorkerHarness();
		const staleTerminal = worker.setNotification(`presuntinho-call-${CALL_ID}`, {
			type: 'presuntinho:push-event',
			kind: 'call',
			callState: 'terminal',
			terminalEvent: 'answered_elsewhere',
			callId: CALL_ID,
			url: '/mensagens/'
		});
		await worker.activate();
		expect(staleTerminal.close).toHaveBeenCalledOnce();

		await worker.push({
			type: 'presuntinho:push-event',
			eventId: CALL_ID,
			kind: 'call',
			title: 'Chamada recebida',
			body: 'Já expirou.',
			url: '/mensagens/',
			callId: CALL_ID,
			deliveryId: DELIVERY_ID,
			deliveryToken: TOKEN,
			expiresAt: new Date(Date.now() - 1).toISOString()
		});
		expect(worker.shown).toHaveLength(0);
		expect(worker.notifications.size).toBe(0);
		expect(worker.ackStages).toEqual(['received']);
	});

	it('fails closed when a terminal payload reaches the worker after its deadline', async () => {
		const worker = createWorkerHarness();
		await worker.push({
			type: 'presuntinho:push-event',
			eventId: `${CALL_ID}:terminal:cancelled`,
			kind: 'call',
			callState: 'terminal',
			terminalEvent: 'cancelled',
			terminalExpiresAt: new Date(Date.now() - 1).toISOString(),
			title: 'Chamada terminada',
			body: 'Já terminou.',
			url: '/mensagens/',
			callId: CALL_ID
		});

		expect(worker.shown).toHaveLength(0);
		expect(worker.notifications.size).toBe(0);
		expect(worker.messages).toHaveLength(0);
	});
});
