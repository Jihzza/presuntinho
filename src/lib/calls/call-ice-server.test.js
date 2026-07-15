// @ts-nocheck -- this JS harness mocks Netlify runtime globals.
import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, {
	config,
	hasRelay,
	sanitizeIceServers
} from '../../../netlify/functions/call-ice.js';

const CALL_ID = '00000000-0000-4000-8000-000000000001';
const CALLER_ID = '00000000-0000-4000-8000-000000000002';
const CALLEE_ID = '00000000-0000-4000-8000-000000000003';
const CONVERSATION_ID = '00000000-0000-4000-8000-000000000004';
const DEVICE = 'install-0123456789.device-abcdef';
const AUTH = 'header.payload.signature-value';

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function netlifyEnvironment(extra = {}) {
	const values = {
		VITE_SUPABASE_URL: 'https://project.supabase.co',
		VITE_SUPABASE_ANON_KEY: 'anon-key-with-enough-entropy',
		...extra
	};
	vi.stubGlobal('Netlify', { env: { get: (key) => values[key] } });
}

function json(value, status = 200, headers = {}) {
	return new Response(JSON.stringify(value), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});
}

function request(body = { callId: CALL_ID, device: DEVICE }, headers = {}) {
	return new Request('https://presuntinho.love/api/call-ice', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${AUTH}`,
			...headers
		},
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
}

function authenticatedCallRouter({ cloudflareResponse } = {}) {
	return vi.fn(async (input, init = {}) => {
		const url = new URL(String(input));
		if (url.hostname === 'rtc.live.cloudflare.com') {
			if (cloudflareResponse) return cloudflareResponse(url, init);
			throw new Error('unexpected Cloudflare request');
		}
		if (url.pathname === '/auth/v1/user') return json({ id: CALLER_ID });
		if (url.pathname === '/rest/v1/call_sessions') {
			return json([{
				conversation_id: CONVERSATION_ID,
				caller: CALLER_ID,
				callee: CALLEE_ID,
				caller_device: DEVICE,
				callee_device: null,
				status: 'ringing',
				expires_at: new Date(Date.now() + 60_000).toISOString(),
				caller_lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
				callee_lease_expires_at: null
			}]);
		}
		if (url.pathname === '/rest/v1/chat_conversations') {
			return json([{
				id: CONVERSATION_ID,
				kind: 'direct',
				space_id: null,
				direct_key: `dm:${CALLER_ID}:${CALLEE_ID}`
			}]);
		}
		if (url.pathname.endsWith('/rpc/is_dm_member')) return json(true);
		throw new Error(`unexpected fetch ${init.method || 'GET'} ${url}`);
	});
}

describe('call ICE endpoint hardening', () => {
	it('keeps both rolling-deploy routes behind a POST rate limit', () => {
		expect(config).toEqual({
			path: ['/api/call-ice', '/.netlify/functions/call-ice'],
			method: 'POST',
			rateLimit: {
				windowLimit: 120,
				windowSize: 60,
				aggregateBy: ['ip', 'domain']
			}
		});
	});

	it('rejects declared and streamed oversized bodies before any upstream I/O', async () => {
		netlifyEnvironment();
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const declared = await handler(request('{}', { 'content-length': '2048' }));
		expect(declared.status).toBe(413);
		expect(await declared.json()).toEqual({ error: 'body_too_large' });

		const streamed = await handler(request(JSON.stringify({ padding: 'x'.repeat(1100) })));
		expect(streamed.status).toBe(413);
		expect(await streamed.json()).toEqual({ error: 'body_too_large' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('bounds stalled Supabase requests and returns a stable timeout error', async () => {
		vi.useFakeTimers();
		netlifyEnvironment();
		vi.stubGlobal('fetch', vi.fn((_input, init = {}) => new Promise((_resolve, reject) => {
			init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
		})));

		const pending = handler(request());
		await vi.advanceTimersByTimeAsync(2600);
		const response = await pending;
		expect(response.status).toBe(504);
		expect(await response.json()).toEqual({ error: 'upstream_timeout' });
	});

	it('returns short-lived Cloudflare relay configuration without exposing provider keys', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
		netlifyEnvironment({
			CLOUDFLARE_TURN_KEY_ID: 'turn-key-id',
			CLOUDFLARE_TURN_API_TOKEN: 'server-only-api-token'
		});
		const fetchMock = authenticatedCallRouter({
			cloudflareResponse: (_url, init) => {
				expect(init.headers.authorization).toBe('Bearer server-only-api-token');
				expect(JSON.parse(init.body)).toEqual({ ttl: 86_400 });
				return json({
					iceServers: [
						{ urls: ['stun:stun.cloudflare.com:3478'] },
						{
							urls: ['turn:turn.cloudflare.com:3478?transport=udp'],
							username: 'short-lived-user',
							credential: 'short-lived-secret'
						}
					]
				}, 201);
			}
		});
		vi.stubGlobal('fetch', fetchMock);

		const response = await handler(request());
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({
			relayAvailable: true,
			source: 'cloudflare',
			expiresAt: '2026-07-16T12:00:00.000Z'
		});
		expect(JSON.stringify(body)).not.toContain('turn-key-id');
		expect(JSON.stringify(body)).not.toContain('server-only-api-token');
		expect(hasRelay(body.iceServers)).toBe(true);
	});

	it('falls back to configured static TURN when the ephemeral provider times out', async () => {
		vi.useFakeTimers();
		netlifyEnvironment({
			CLOUDFLARE_TURN_KEY_ID: 'turn-key-id',
			CLOUDFLARE_TURN_API_TOKEN: 'server-only-api-token',
			CALL_TURN_URLS: 'turn:relay.example.com:3478?transport=udp',
			CALL_TURN_USERNAME: 'static-user',
			CALL_TURN_CREDENTIAL: 'static-secret'
		});
		const fetchMock = authenticatedCallRouter({
			cloudflareResponse: (_url, init) => new Promise((_resolve, reject) => {
				init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
			})
		});
		vi.stubGlobal('fetch', fetchMock);

		const pending = handler(request());
		await vi.advanceTimersByTimeAsync(3600);
		const response = await pending;
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			relayAvailable: true,
			source: 'static',
			expiresAt: null
		});
	});

	it('truthfully labels the default as STUN-only when no TURN is configured', async () => {
		netlifyEnvironment();
		vi.stubGlobal('fetch', authenticatedCallRouter());

		const response = await handler(request());
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({ relayAvailable: false, source: 'stun-only', expiresAt: null });
		expect(hasRelay(body.iceServers)).toBe(false);
	});
});

describe('ICE server sanitizer', () => {
	it('accepts usable relay entries and removes malformed or credential-less TURN', () => {
		const value = sanitizeIceServers([
			{ urls: ['stun:stun.example.com:3478', 'turn:relay.example.com:70000'], username: 'x', credential: 'y' },
			{ urls: 'turn:relay.example.com:3478?transport=udp' },
			{ urls: 'turn:relay.example.com:3478?transport=tcp', username: 'user', credential: 'secret' },
			{ urls: 'turn:https://attacker.example' },
			{ urls: 'stun:good.example.com:3478\nturn:evil.example.com:3478' }
		]);
		expect(value).toEqual([
			{ urls: ['stun:stun.example.com:3478'] },
			{
				urls: ['turn:relay.example.com:3478?transport=tcp'],
				username: 'user',
				credential: 'secret'
			}
		]);
		expect(hasRelay(value)).toBe(true);
	});
});
