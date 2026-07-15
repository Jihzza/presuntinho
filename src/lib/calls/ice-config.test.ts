import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	fetchCallIceConfiguration,
	iceServersHaveRelay,
	sanitizeClientIceServers
} from './ice-config';

const CALL_ID = '00000000-0000-4000-8000-000000000001';
const DEVICE = 'install-0123456789.device-abcdef';
const ACCESS_TOKEN = 'header.payload.signature-value';

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function json(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function fetchIce(fetcher: typeof fetch, timeoutMs?: number) {
	return fetchCallIceConfiguration({
		callId: CALL_ID,
		device: DEVICE,
		accessToken: ACCESS_TOKEN,
		fetcher,
		timeoutMs
	});
}

describe('call ICE client contract', () => {
	it('uses the stable route first and accepts a verified relay response', async () => {
		const fetcher = vi.fn<typeof fetch>(async () => json({
			iceServers: [{
				urls: ['turn:relay.example.com:3478?transport=udp'],
				username: 'short-user',
				credential: 'short-secret'
			}],
			relayAvailable: true,
			source: 'cloudflare',
			expiresAt: '2026-07-15T13:00:00.000Z'
		}));

		const configuration = await fetchIce(fetcher);
		expect(fetcher).toHaveBeenCalledOnce();
		expect(fetcher.mock.calls[0][0]).toBe('/api/call-ice');
		expect(configuration).toMatchObject({
			relayAvailable: true,
			source: 'cloudflare',
			expiresAt: '2026-07-15T13:00:00.000Z'
		});
	});

	it.each([
		['an absent custom route', new Response(null, { status: 404 })],
		['an old SPA shell at the custom route', new Response('<!doctype html>', {
			status: 200,
			headers: { 'content-type': 'text/html' }
		})]
	])('falls back to the legacy function URL during a rolling deploy: %s', async (_label, first) => {
		const fetcher = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(first)
			.mockResolvedValueOnce(json({
				iceServers: [{
					urls: 'turn:legacy.example.com:3478?transport=tcp',
					username: 'legacy-user',
					credential: 'legacy-secret'
				}]
			}));

		const configuration = await fetchIce(fetcher);
		expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
			'/api/call-ice',
			'/.netlify/functions/call-ice'
		]);
		expect(configuration).toMatchObject({ relayAvailable: true, source: 'legacy' });
	});

	it('does not bypass an authorization failure through the legacy alias', async () => {
		const fetcher = vi.fn<typeof fetch>(async () => json({ error: 'bad_token' }, 401));
		await expect(fetchIce(fetcher)).rejects.toThrow('call_ice_bad_token');
		expect(fetcher).toHaveBeenCalledOnce();
	});

	it('degrades explicitly to direct-only ICE when the function times out', async () => {
		vi.useFakeTimers();
		const fetcher = vi.fn<typeof fetch>(async (_input, init) => new Promise((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
		}));

		const pending = fetchIce(fetcher, 50);
		await vi.advanceTimersByTimeAsync(60);
		const configuration = await pending;
		expect(configuration).toEqual({
			iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
			relayAvailable: false,
			source: 'fallback',
			expiresAt: null
		});
		expect(fetcher).toHaveBeenCalledOnce();
	});

	it('rejects malformed inputs before a credential-bearing request is sent', async () => {
		const fetcher = vi.fn<typeof fetch>();
		await expect(fetchCallIceConfiguration({
			callId: '../not-a-call',
			device: DEVICE,
			accessToken: ACCESS_TOKEN,
			fetcher
		})).rejects.toThrow('call_ice_bad_request');
		expect(fetcher).not.toHaveBeenCalled();
	});
});

describe('call ICE client sanitizer', () => {
	it('never trusts a relay flag without usable TURN credentials', async () => {
		const fetcher = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(json({
				iceServers: [{ urls: 'turn:relay.example.com:3478' }],
				relayAvailable: true,
				source: 'cloudflare'
			}))
			.mockResolvedValueOnce(new Response('<!doctype html>', {
				status: 200,
				headers: { 'content-type': 'text/html' }
			}));

		const configuration = await fetchIce(fetcher);
		expect(configuration.relayAvailable).toBe(false);
		expect(configuration.source).toBe('fallback');
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('drops malformed URLs, embedded whitespace and incomplete relay entries', () => {
		const iceServers = sanitizeClientIceServers([
			{ urls: ['stun:stun.example.com:3478', 'turn:relay.example.com:99999'] },
			{ urls: 'turn:relay.example.com:3478?transport=udp', username: 'user', credential: 'secret' },
			{ urls: 'turn:https://attacker.example', username: 'user', credential: 'secret' },
			{ urls: 'stun:good.example.com:3478\nturn:bad.example.com:3478' }
		]);

		expect(iceServers).toEqual([
			{ urls: ['stun:stun.example.com:3478'] },
			{
				urls: ['turn:relay.example.com:3478?transport=udp'],
				username: 'user',
				credential: 'secret'
			}
		]);
		expect(iceServersHaveRelay(iceServers)).toBe(true);
	});
});
