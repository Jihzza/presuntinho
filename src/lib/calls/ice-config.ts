export type CallIceSource = 'cloudflare' | 'static' | 'stun-only' | 'legacy' | 'fallback';

export interface CallIceConfiguration {
	iceServers: RTCIceServer[];
	relayAvailable: boolean;
	source: CallIceSource;
	expiresAt: string | null;
}

interface FetchCallIceOptions {
	callId: string;
	device: string;
	accessToken: string;
	fetcher?: typeof fetch;
	timeoutMs?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE_RE = /^[A-Za-z0-9._:-]{16,160}$/;
const ICE_URL_RE = /^(stun|stuns|turn|turns):((?:\[[0-9a-f:.]+\])|(?:[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?))(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/i;
const ICE_ENDPOINTS = ['/api/call-ice', '/.netlify/functions/call-ice'] as const;
const MAX_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 9000;

export const DEFAULT_CALL_ICE_CONFIGURATION: CallIceConfiguration = {
	iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
	relayAvailable: false,
	source: 'fallback',
	expiresAt: null
};

function safeIceUrl(value: unknown): string | null {
	if (
		typeof value !== 'string' ||
		value.length > 512 ||
		value !== value.trim() ||
		/[\u0000-\u0020\u007f]/.test(value)
	) return null;
	const match = ICE_URL_RE.exec(value);
	if (!match) return null;
	const port = match[3] ? Number(match[3]) : null;
	if (port !== null && (port < 1 || port > 65535)) return null;
	const hostname = match[2];
	if (!hostname.startsWith('[') && (hostname.includes('..') || hostname.startsWith('.') || hostname.endsWith('.'))) {
		return null;
	}
	return value;
}

function safeCredential(value: unknown, max: number): string {
	return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
		? value
		: '';
}

/** Treats the function response as untrusted input before passing it to WebRTC. */
export function sanitizeClientIceServers(value: unknown): RTCIceServer[] {
	if (!Array.isArray(value)) return [];
	const servers: RTCIceServer[] = [];
	let totalUrls = 0;
	for (const entry of value) {
		if (servers.length >= 8 || totalUrls >= 16) break;
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
		const candidate = entry as { urls?: unknown; username?: unknown; credential?: unknown };
		const rawUrls = Array.isArray(candidate.urls) ? candidate.urls : [candidate.urls];
		const cleanUrls: string[] = [];
		const seen = new Set<string>();
		for (const rawUrl of rawUrls) {
			const url = safeIceUrl(rawUrl);
			if (!url || seen.has(url)) continue;
			seen.add(url);
			cleanUrls.push(url);
			totalUrls += 1;
			if (cleanUrls.length >= 8 || totalUrls >= 16) break;
		}
		if (!cleanUrls.length) continue;
		const hasTurn = cleanUrls.some((url) => /^turns?:/i.test(url));
		const username = safeCredential(candidate.username, 512);
		const credential = safeCredential(candidate.credential, 1024);
		if (hasTurn && (!username || !credential)) {
			const stunOnly = cleanUrls.filter((url) => /^stuns?:/i.test(url));
			totalUrls -= cleanUrls.length - stunOnly.length;
			if (stunOnly.length) servers.push({ urls: stunOnly });
			continue;
		}
		servers.push(hasTurn ? { urls: cleanUrls, username, credential } : { urls: cleanUrls });
	}
	return servers;
}

export function iceServersHaveRelay(iceServers: RTCIceServer[]): boolean {
	return iceServers.some((server) => {
		const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
		return urls.some((url) => typeof url === 'string' && /^turns?:/i.test(url)) &&
			typeof server.username === 'string' && server.username.length > 0 &&
			typeof server.credential === 'string' && server.credential.length > 0;
	});
}

async function readBoundedText(response: Response): Promise<string> {
	const declared = response.headers.get('content-length');
	if (declared && /^\d{1,10}$/.test(declared) && Number(declared) > MAX_RESPONSE_BYTES) {
		throw new Error('call_ice_response_too_large');
	}
	if (!response.body) return '';
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_RESPONSE_BYTES) {
				await reader.cancel().catch(() => undefined);
				throw new Error('call_ice_response_too_large');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

async function fetchWithTimeout(
	fetcher: typeof fetch,
	endpoint: string,
	init: RequestInit,
	timeoutMs: number
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetcher(endpoint, { ...init, signal: controller.signal });
	} catch (error) {
		if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
			throw new Error('call_ice_timeout');
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}
}

function fallbackConfiguration(): CallIceConfiguration {
	return {
		iceServers: DEFAULT_CALL_ICE_CONFIGURATION.iceServers.map((server) => ({
			...server,
			urls: Array.isArray(server.urls) ? [...server.urls] : server.urls
		})),
		relayAvailable: false,
		source: 'fallback',
		expiresAt: null
	};
}

function errorReason(value: unknown, status: number): string {
	if (value && typeof value === 'object') {
		const code = (value as { error?: unknown }).error;
		if (typeof code === 'string' && /^[a-z0-9_]{1,64}$/.test(code)) return code;
	}
	return String(status);
}

function parseConfiguration(value: unknown): CallIceConfiguration | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const body = value as {
		iceServers?: unknown;
		relayAvailable?: unknown;
		source?: unknown;
		expiresAt?: unknown;
	};
	const iceServers = sanitizeClientIceServers(body.iceServers);
	if (!iceServers.length) return null;
	const relayAvailable = iceServersHaveRelay(iceServers);
	// A positive relay claim without a usable TURN entry is an invalid contract,
	// not permission to pass malformed configuration into RTCPeerConnection.
	if (body.relayAvailable === true && !relayAvailable) return null;
	const source: CallIceSource = relayAvailable && body.source === 'cloudflare'
		? 'cloudflare'
		: relayAvailable && body.source === 'static'
			? 'static'
			: relayAvailable
				? 'legacy'
				: 'stun-only';
	const expiresAt = source === 'cloudflare' && typeof body.expiresAt === 'string' && Number.isFinite(Date.parse(body.expiresAt))
		? body.expiresAt
		: null;
	return { iceServers, relayAvailable, source, expiresAt };
}

export async function fetchCallIceConfiguration({
	callId,
	device,
	accessToken,
	fetcher = fetch,
	timeoutMs = DEFAULT_TIMEOUT_MS
}: FetchCallIceOptions): Promise<CallIceConfiguration> {
	if (
		!UUID_RE.test(callId) ||
		!DEVICE_RE.test(device) ||
		accessToken.length < 20 ||
		accessToken.length > 8192 ||
		/[\s,]/.test(accessToken)
	) {
		throw new Error('call_ice_bad_request');
	}
	const init: RequestInit = {
		method: 'POST',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
			authorization: `Bearer ${accessToken}`
		},
		body: JSON.stringify({ callId, device })
	};

	for (let index = 0; index < ICE_ENDPOINTS.length; index += 1) {
		let response: Response;
		try {
			response = await fetchWithTimeout(fetcher, ICE_ENDPOINTS[index], init, timeoutMs);
		} catch (error) {
			// A timeout/network failure affects both same-origin aliases; continue
			// the call in explicitly degraded, direct-only mode.
			return fallbackConfiguration();
		}

		const contentType = (response.headers.get('content-type') || '').toLowerCase();
		const routeMissing = response.status === 404 || response.status === 405;
		if (routeMissing && index + 1 < ICE_ENDPOINTS.length) continue;
		if (!response.ok) {
			if (response.status >= 500 || response.status === 429) return fallbackConfiguration();
			let failure: unknown = null;
			if (contentType.includes('application/json')) {
				try {
					failure = JSON.parse(await readBoundedText(response));
				} catch {
					failure = null;
				}
			}
			throw new Error(`call_ice_${errorReason(failure, response.status)}`);
		}

		// An old deploy can serve the SPA shell at the not-yet-known custom API
		// route. Treat non-JSON/invalid success as a route miss once, then use the
		// legacy function URL. This is deliberately not a retry of auth failures.
		if (!contentType.includes('application/json')) {
			if (index + 1 < ICE_ENDPOINTS.length) continue;
			return fallbackConfiguration();
		}
		let body: unknown;
		try {
			body = JSON.parse(await readBoundedText(response));
		} catch {
			if (index + 1 < ICE_ENDPOINTS.length) continue;
			return fallbackConfiguration();
		}
		const configuration = parseConfiguration(body);
		if (configuration) return configuration;
		if (index + 1 >= ICE_ENDPOINTS.length) return fallbackConfiguration();
	}
	return fallbackConfiguration();
}
