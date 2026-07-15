// @ts-nocheck -- Netlify runtime globals live outside the Svelte TS build.
// Recovery-only wakeup for durable call outboxes. The normal latency path is
// push-ping -> acknowledged Background Function; this minute sweep only heals
// a crashed/lost job and objectively expired calls.

import {
  callDispatchSignature,
  communicationDispatchSignature,
  parseRows
} from './_shared/push-delivery.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CANDIDATES = 12;
// Scheduled Functions are terminated after 30 seconds. Bound our own work to
// 22 seconds so cold starts, response serialization and platform bookkeeping
// retain a wide safety margin. Every remote step also receives the remaining
// global budget instead of starting an independent five-second timer.
const SWEEP_BUDGET_MS = 22_000;
const FINISH_MARGIN_MS = 750;
const DB_TIMEOUT_MS = 4_000;
const DISPATCH_TIMEOUT_MS = 3_000;
// Claiming a media job creates a 20-second SQL lease. Only claim when there is
// enough budget for claim + storage delete + result recording. If a process is
// still interrupted, the next sweep's claim RPC recovers the expired lease.
const MEDIA_CLAIM_MIN_REMAINING_MS = DB_TIMEOUT_MS * 3 + FINISH_MARGIN_MS;
const MEDIA_BUCKETS = new Set(['couple-chat', 'chat-media']);

function validMediaDeletion(row) {
  const id = String(row?.id || '');
  const token = String(row?.attempt_token || '');
  const bucket = String(row?.bucket || '');
  const objectPath = String(row?.object_path || '');
  if (
    !UUID_RE.test(id) ||
    !UUID_RE.test(token) ||
    !MEDIA_BUCKETS.has(bucket) ||
    objectPath.length < 1 ||
    objectPath.length > 1024 ||
    objectPath.includes('\\') ||
    objectPath.split('/').some((part) => !part || part === '.' || part === '..' || /[\u0000-\u001f\u007f]/.test(part))
  ) return null;
  return { id, token, bucket, objectPath };
}

function storageDeletePath(job) {
  return `/storage/v1/object/${encodeURIComponent(job.bucket)}/` +
    job.objectPath.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function retryableStorageStatus(status) {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function remainingMs(deadline) {
  return Math.max(0, deadline - Date.now());
}

function requestTimeout(deadline, maximum) {
  const available = remainingMs(deadline) - FINISH_MARGIN_MS;
  if (available <= 0) return 0;
  return Math.max(1, Math.min(maximum, Math.floor(available)));
}

async function rowsFrom(response, deadline) {
  if (!response?.ok || requestTimeout(deadline, DB_TIMEOUT_MS) === 0) return [];
  try {
    return await parseRows(response);
  } catch {
    return [];
  }
}

export const config = {
  schedule: '* * * * *'
};

function idsFrom(rows) {
  return rows
    .map((row) => String(row?.call_id || row?.id || ''))
    .filter((id) => UUID_RE.test(id));
}

export default async function handler(req) {
  const deadline = Date.now() + SWEEP_BUDGET_MS;
  const supabaseUrl = Netlify.env.get('VITE_SUPABASE_URL');
  const serviceRole = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return new Response(null, { status: 503 });

  const boundedFetch = (input, init = {}, maximum = DB_TIMEOUT_MS) => {
    const timeout = requestTimeout(deadline, maximum);
    if (timeout === 0) return Promise.resolve(null);
    return fetch(input, {
      ...init,
      signal: AbortSignal.timeout(timeout)
    }).catch(() => null);
  };

  const sbAdmin = (path, init = {}) => boundedFetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceRole,
      authorization: `Bearer ${serviceRole}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });

  // Expire deadlines and purge previews before candidate selection. Failure is
  // non-fatal for call recovery; the candidate RPC independently filters
  // expired rows before LIMIT so stale work can never starve fresh jobs.
  await Promise.allSettled([
    sbAdmin('/rest/v1/rpc/maintain_communication_push_outbox', {
      method: 'POST',
      body: '{}'
    }),
    sbAdmin('/rest/v1/rpc/maintain_chat_media_deletion_outbox', {
      method: 'POST',
      body: '{}'
    })
  ]);

  if (requestTimeout(deadline, DB_TIMEOUT_MS) === 0) {
    return new Response(null, { status: 204 });
  }

  let mediaJobs = [];
  if (remainingMs(deadline) >= MEDIA_CLAIM_MIN_REMAINING_MS) {
    const mediaClaimResponse = await sbAdmin('/rest/v1/rpc/claim_chat_media_deletion_batch', {
      method: 'POST',
      body: JSON.stringify({ p_limit: MAX_CANDIDATES })
    });
    mediaJobs = (await rowsFrom(mediaClaimResponse, deadline))
      .map(validMediaDeletion)
      .filter(Boolean);
  }

  await Promise.allSettled(mediaJobs.map(async (job) => {
    const storageResponse = await sbAdmin(storageDeletePath(job), { method: 'DELETE' });
    const status = storageResponse?.status || 0;
    const deleted = Boolean(storageResponse?.ok || status === 404);
    const retryable = !deleted && retryableStorageStatus(status);
    // If the global deadline is exhausted, do not start another request. The
    // row remains `dispatching` and its 20-second lease is reclaimed by the SQL
    // claim function on a later minute. Storage deletion is idempotent (404 is
    // recorded as success), so interruption between delete and record is safe.
    await sbAdmin('/rest/v1/rpc/record_chat_media_deletion_result', {
      method: 'POST',
      body: JSON.stringify({
        p_id: job.id,
        p_attempt_token: job.token,
        p_deleted: deleted,
        p_retryable: retryable,
        p_error: deleted ? null : retryable ? 'storage_temporarily_unavailable' : `storage_rejected_${status}`
      })
    });
  }));

  if (requestTimeout(deadline, DB_TIMEOUT_MS) === 0) {
    return new Response(null, { status: 204 });
  }

  const [initialResponse, terminalResponse, ringingResponse, communicationResponse] = await Promise.all([
    sbAdmin(
      '/rest/v1/call_delivery_outbox' +
        '?status=in.(pending,partial,dispatching)' +
        '&select=call_id&order=next_attempt_at.asc&limit=8'
    ),
    sbAdmin(
      '/rest/v1/call_terminal_outbox' +
        '?status=in.(pending,partial,dispatching)' +
        '&select=call_id&order=next_attempt_at.asc&limit=8'
    ),
    sbAdmin(
      '/rest/v1/call_sessions?status=eq.ringing' +
        '&select=id,expires_at,caller_lease_expires_at&order=expires_at.asc&limit=12'
    ),
    sbAdmin(
      '/rest/v1/rpc/list_communication_push_candidates',
      { method: 'POST', body: JSON.stringify({ p_limit: MAX_CANDIDATES }) }
    )
  ]);

  const [initialRows, terminalRows, ringingRows, communicationRows] = await Promise.all([
    rowsFrom(initialResponse, deadline),
    rowsFrom(terminalResponse, deadline),
    rowsFrom(ringingResponse, deadline),
    rowsFrom(communicationResponse, deadline)
  ]);
  const now = Date.now();
  const expiredRows = ringingRows.filter((row) => {
    const expiresAt = Date.parse(String(row?.expires_at || ''));
    const lease = Date.parse(String(row?.caller_lease_expires_at || ''));
    return (Number.isFinite(expiresAt) && expiresAt <= now) ||
      (Number.isFinite(lease) && lease <= now);
  });
  const callIds = [...new Set([
    ...idsFrom(terminalRows),
    ...idsFrom(initialRows),
    ...idsFrom(expiredRows)
  ])].slice(0, MAX_CANDIDATES);
  const communicationIds = [...new Set(communicationRows
    .map((row) => String(row?.event_id || ''))
    .filter((id) => UUID_RE.test(id)))].slice(0, MAX_CANDIDATES);

  const endpoint = new URL('/api/internal/call-push-dispatch', req.url);
  await Promise.allSettled([
    ...callIds.map((callId) => boundedFetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-presuntinho-dispatch-signature': callDispatchSignature(serviceRole, callId)
      },
      body: JSON.stringify({ callId })
    }, DISPATCH_TIMEOUT_MS)),
    ...communicationIds.map((eventId) => boundedFetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-presuntinho-dispatch-signature': communicationDispatchSignature(serviceRole, eventId)
      },
      body: JSON.stringify({ eventId })
    }, DISPATCH_TIMEOUT_MS))
  ]);

  return new Response(null, { status: 204 });
}
