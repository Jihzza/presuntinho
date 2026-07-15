import { afterEach, describe, expect, it, vi } from 'vitest';

const ACCESS_TOKEN = 'caller-access-token';
const REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CALL_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONVERSATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CALLER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CALLEE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const DEVICE = 'installation-00000001.tab-00000001';

const auth = vi.hoisted(() => ({ getAuthSession: vi.fn() }));

vi.mock('$lib/account/auth', () => ({ getAuthSession: auth.getAuthSession }));

import { startCallReliably } from './call-start';

function callRow() {
	const now = Date.now();
	return {
		id: CALL_ID,
		conversation_id: CONVERSATION_ID,
		caller: CALLER_ID,
		callee: CALLEE_ID,
		caller_device: DEVICE,
		callee_device: null,
		kind: 'audio',
		status: 'ringing',
		created_at: new Date(now).toISOString(),
		expires_at: new Date(now + 45_000).toISOString(),
		caller_heartbeat_at: new Date(now).toISOString(),
		callee_heartbeat_at: null,
		caller_lease_expires_at: new Date(now + 120_000).toISOString(),
		callee_lease_expires_at: null,
		push_sent_at: null,
		answered_at: null,
		ended_at: null,
		client_request_id: REQUEST_ID
	};
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe('reliable call-start browser client', () => {
	it('replays the same request id after a lost response and recovers the canonical call', async () => {
		vi.useFakeTimers();
		auth.getAuthSession.mockResolvedValue({ access_token: ACCESS_TOKEN });
		const fetchMock = vi.fn()
			.mockRejectedValueOnce(new TypeError('response lost after commit'))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				requestId: REQUEST_ID,
				call: callRow()
			}), { status: 200, headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		const resultPromise = startCallReliably({
			conversationId: CONVERSATION_ID,
			kind: 'audio',
			device: DEVICE,
			requestId: REQUEST_ID
		});
		await vi.runAllTimersAsync();
		const call = await resultPromise;

		expect(call.id).toBe(CALL_ID);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
		expect(bodies).toEqual([
			{
				conversationId: CONVERSATION_ID,
				kind: 'audio',
				device: DEVICE,
				requestId: REQUEST_ID
			},
			{
				conversationId: CONVERSATION_ID,
				kind: 'audio',
				device: DEVICE,
				requestId: REQUEST_ID
			}
		]);
		expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('authorization'))
			.toBe(`Bearer ${ACCESS_TOKEN}`);
	});

	it('does not overlap a retry while the first endpoint invocation can still finish', async () => {
		vi.useFakeTimers();
		auth.getAuthSession.mockResolvedValue({ access_token: ACCESS_TOKEN });
		const fetchMock = vi.fn(async () => {
			await new Promise((resolve) => setTimeout(resolve, 11_000));
			return new Response(JSON.stringify({ requestId: REQUEST_ID, call: callRow() }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = startCallReliably({
			conversationId: CONVERSATION_ID,
			kind: 'audio',
			device: DEVICE,
			requestId: REQUEST_ID
		});
		await vi.advanceTimersByTimeAsync(10_000);
		expect(fetchMock).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1_000);
		await expect(result).resolves.toMatchObject({ id: CALL_ID });
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it('does not replay a factual conflict response', async () => {
		auth.getAuthSession.mockResolvedValue({ access_token: ACCESS_TOKEN });
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({
			error: 'call_request_mismatch',
			message: 'call request mismatch'
		}), { status: 409 }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(startCallReliably({
			conversationId: CONVERSATION_ID,
			kind: 'audio',
			device: DEVICE,
			requestId: REQUEST_ID
		})).rejects.toThrow('call_request_mismatch');
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it.each([
		[409, 'call_peer_busy'],
		[429, 'call_rate_limited']
	])('preserves the public error code for HTTP %s', async (status, code) => {
		auth.getAuthSession.mockResolvedValue({ access_token: ACCESS_TOKEN });
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({
			error: code,
			message: 'human-readable server copy'
		}), { status }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(startCallReliably({
			conversationId: CONVERSATION_ID,
			kind: 'audio',
			device: DEVICE,
			requestId: REQUEST_ID
		})).rejects.toThrow(code);
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it('preserves a 503 dispatcher code across bounded retries', async () => {
		vi.useFakeTimers();
		auth.getAuthSession.mockResolvedValue({ access_token: ACCESS_TOKEN });
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({
			error: 'call_dispatch_unavailable',
			message: 'call dispatcher was not accepted'
		}), { status: 503 }));
		vi.stubGlobal('fetch', fetchMock);

		const result = startCallReliably({
			conversationId: CONVERSATION_ID,
			kind: 'audio',
			device: DEVICE,
			requestId: REQUEST_ID
		});
		const expectation = expect(result).rejects.toThrow('call_dispatch_unavailable');
		await vi.runAllTimersAsync();
		await expectation;
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});
});
