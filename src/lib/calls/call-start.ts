import { getAuthSession } from '$lib/account/auth';
import { parseCallSession, type CallKind, type CallSession } from './types';

const START_ATTEMPTS = 3;
// Server call-start has one 8.5-second end-to-end budget. Keep a transport
// margin so the browser cannot overlap a replay with an invocation that is
// still allowed to create the session.
const START_TIMEOUT_MS = 12_000;
const START_RETRY_MS = 250;
const PUBLIC_START_ERRORS = new Set([
	'call_unauthorized',
	'call_invalid',
	'call_request_mismatch',
	'call_peer_busy',
	'call_rate_limited',
	'call_conversation_inactive',
	'call_conversation_invalid',
	'call_dispatch_unavailable',
	'call_start_unavailable',
	'call_start_mismatch'
]);

interface ReliableCallStart {
	conversationId: string;
	kind: CallKind;
	device: string;
	requestId?: string;
}

async function responseValue(response: Response): Promise<Record<string, unknown> | null> {
	const value: unknown = await response.json().catch(() => null);
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function responseError(value: Record<string, unknown> | null, fallback: string): Error {
	const code = value?.error;
	if (typeof code === 'string' && PUBLIC_START_ERRORS.has(code)) return new Error(code);
	const message = value?.message;
	return new Error(typeof message === 'string' && message ? message : fallback);
}

async function postCallStart(body: string, accessToken: string): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), START_TIMEOUT_MS);
	try {
		return await fetch('/api/call-start', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${accessToken}`
			},
			body,
			signal: controller.signal
		});
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Start one semantic call. Every retry reuses the same request id, so a lost
 * HTTP response can recover the already committed session instead of creating
 * a second one.
 */
export async function startCallReliably(options: ReliableCallStart): Promise<CallSession> {
	const session = await getAuthSession().catch(() => null);
	if (!session?.access_token) throw new Error('not authenticated');
	const requestId = options.requestId ?? crypto.randomUUID();
	const body = JSON.stringify({
		conversationId: options.conversationId,
		kind: options.kind,
		device: options.device,
		requestId
	});
	let lastError: Error = new Error('call start unavailable');

	for (let attempt = 0; attempt < START_ATTEMPTS; attempt += 1) {
		let response: Response;
		try {
			response = await postCallStart(body, session.access_token);
		} catch {
			lastError = new Error('call start network error');
			if (attempt + 1 < START_ATTEMPTS) {
				await new Promise((resolve) => setTimeout(resolve, START_RETRY_MS * 2 ** attempt));
				continue;
			}
			throw lastError;
		}

		const value = await responseValue(response);
		if (response.ok) {
			if (value?.requestId !== requestId) throw new Error('call_start_invalid_response');
			const call = parseCallSession(value.call);
			if (!call) throw new Error('call_start_invalid_response');
			return call;
		}

		lastError = responseError(value, `call start failed (${response.status})`);
		if (response.status < 500 || attempt + 1 >= START_ATTEMPTS) throw lastError;
		await new Promise((resolve) => setTimeout(resolve, START_RETRY_MS * 2 ** attempt));
	}

	throw lastError;
}
