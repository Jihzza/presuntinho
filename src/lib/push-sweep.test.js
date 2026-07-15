// @ts-nocheck -- deterministic scheduled-function harness.
import { afterEach, describe, expect, it, vi } from 'vitest';
import sweepHandler from '../../netlify/functions/call-push-sweep.js';
import { validCommunicationDispatchSignature } from '../../netlify/functions/_shared/push-delivery.js';

const EVENT_ID = '99999999-9999-4999-8999-999999999999';
const MEDIA_JOB_ID = '77777777-7777-4777-8777-777777777777';
const MEDIA_TOKEN = '88888888-8888-4888-8888-888888888888';
const SERVICE_ROLE = 'service-role-'.padEnd(64, 's');

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function stubNetlify() {
  vi.stubGlobal('Netlify', {
    env: {
      get: (key) => ({
        VITE_SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE
      })[key]
    }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('scheduled durable push recovery', () => {
  it('runs retention, obtains pre-filtered candidates and signs each wakeup', async () => {
    stubNetlify();
    const effects = [];
    const fetchMock = vi.fn(async (input, init = {}) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/rpc/maintain_communication_push_outbox')) {
			effects.push('maintain-push');
        return json([{ expired_count: 12, deleted_count: 2 }]);
      }
      if (url.pathname.endsWith('/rpc/maintain_chat_media_deletion_outbox')) {
			effects.push('maintain-media');
			return json(1);
		}
		if (url.pathname.endsWith('/rpc/claim_chat_media_deletion_batch')) {
			effects.push('claim-media');
			return json([{
				id: MEDIA_JOB_ID,
				message_id: EVENT_ID,
				bucket: 'chat-media',
				object_path: 'owner/conversation/photo one.jpg',
				attempt_token: MEDIA_TOKEN,
				attempt_count: 1
			}]);
		}
		if (url.pathname === '/storage/v1/object/chat-media/owner/conversation/photo%20one.jpg') {
			effects.push('delete-media');
			return json({ message: 'not found' }, 404);
		}
		if (url.pathname.endsWith('/rpc/record_chat_media_deletion_result')) {
			effects.push('record-media');
			expect(JSON.parse(String(init.body))).toMatchObject({
				p_id: MEDIA_JOB_ID,
				p_attempt_token: MEDIA_TOKEN,
				p_deleted: true,
				p_retryable: false,
				p_error: null
			});
			return json(true);
		}
      if (url.pathname.endsWith('/rpc/list_communication_push_candidates')) {
        effects.push('list');
        expect(JSON.parse(String(init.body))).toEqual({ p_limit: 12 });
        return json([{ event_id: EVENT_ID }]);
      }
      if (
        url.pathname === '/rest/v1/call_delivery_outbox' ||
        url.pathname === '/rest/v1/call_terminal_outbox' ||
        url.pathname === '/rest/v1/call_sessions'
      ) return json([]);
      if (url.pathname === '/api/internal/call-push-dispatch') {
        effects.push('queue');
        const signature = new Headers(init.headers).get('x-presuntinho-dispatch-signature');
        expect(JSON.parse(String(init.body))).toEqual({ eventId: EVENT_ID });
        expect(validCommunicationDispatchSignature(
          SERVICE_ROLE,
          EVENT_ID,
          signature
        )).toBe(true);
        return new Response(null, { status: 202 });
      }
      throw new Error(`unexpected sweep fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await sweepHandler(new Request('https://presuntinho.love/.netlify/functions/call-push-sweep'));

    expect(response.status).toBe(204);
    expect(effects).toEqual([
			'maintain-push', 'maintain-media', 'claim-media',
			'delete-media', 'record-media', 'list', 'queue'
		]);
  });

  it('stops before claiming a lease when the global sweep budget is exhausted', async () => {
    stubNetlify();
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const effects = [];
    const fetchMock = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/rpc/maintain_communication_push_outbox')) {
        effects.push('maintain-push');
        // Simulate a slow upstream consuming the handler-owned 22s budget.
        now = 22_500;
        return json([{ expired_count: 0, deleted_count: 0 }]);
      }
      effects.push(url.pathname);
      return json([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await sweepHandler(
      new Request('https://presuntinho.love/.netlify/functions/call-push-sweep')
    );

    expect(response.status).toBe(204);
    expect(effects).toEqual(['maintain-push']);
    expect(effects).not.toContain('/rest/v1/rpc/claim_chat_media_deletion_batch');
  });

  it('records transient storage failures as retryable and continues other recovery work', async () => {
    stubNetlify();
    const effects = [];
    const fetchMock = vi.fn(async (input, init = {}) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/rpc/maintain_communication_push_outbox')) {
        effects.push('maintain-push');
        return json([{ expired_count: 0, deleted_count: 0 }]);
      }
      if (url.pathname.endsWith('/rpc/maintain_chat_media_deletion_outbox')) {
        effects.push('maintain-media');
        return json(0);
      }
      if (url.pathname.endsWith('/rpc/claim_chat_media_deletion_batch')) {
        effects.push('claim-media');
        return json([{
          id: MEDIA_JOB_ID,
          message_id: EVENT_ID,
          bucket: 'chat-media',
          object_path: 'owner/conversation/retry.jpg',
          attempt_token: MEDIA_TOKEN,
          attempt_count: 2
        }]);
      }
      if (url.pathname === '/storage/v1/object/chat-media/owner/conversation/retry.jpg') {
        effects.push('delete-media-failed');
        return json({ message: 'temporarily unavailable' }, 503);
      }
      if (url.pathname.endsWith('/rpc/record_chat_media_deletion_result')) {
        effects.push('record-retry');
        expect(JSON.parse(String(init.body))).toMatchObject({
          p_id: MEDIA_JOB_ID,
          p_attempt_token: MEDIA_TOKEN,
          p_deleted: false,
          p_retryable: true,
          p_error: 'storage_temporarily_unavailable'
        });
        return json(true);
      }
      if (url.pathname.endsWith('/rpc/list_communication_push_candidates')) {
        effects.push('list');
        return json([{ event_id: EVENT_ID }]);
      }
      if (
        url.pathname === '/rest/v1/call_delivery_outbox' ||
        url.pathname === '/rest/v1/call_terminal_outbox' ||
        url.pathname === '/rest/v1/call_sessions'
      ) return json([]);
      if (url.pathname === '/api/internal/call-push-dispatch') {
        effects.push('queue-failed');
        throw new Error('temporary background queue failure');
      }
      throw new Error(`unexpected sweep fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await sweepHandler(
      new Request('https://presuntinho.love/.netlify/functions/call-push-sweep')
    );

    expect(response.status).toBe(204);
    expect(effects).toEqual([
      'maintain-push', 'maintain-media', 'claim-media',
      'delete-media-failed', 'record-retry', 'list', 'queue-failed'
    ]);
  });
});
