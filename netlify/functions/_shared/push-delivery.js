// @ts-nocheck -- shared by Netlify's JS function bundles, outside Svelte TS.
import webpush from 'web-push';
import { createHmac, timingSafeEqual } from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INSTALLATION_RE = /^[A-Za-z0-9._:-]{16,160}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+={0,2}$/;
const DELIVERY_TOKEN_RE = /^[A-Za-z0-9._-]{36,160}$/;
const PUSH_EVENT_TYPE = 'presuntinho:push-event';
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_P256DH_LENGTH = 256;
const MAX_AUTH_LENGTH = 128;
// Two immediate attempts remain comfortably inside the 20-second DB lease.
export const WEB_PUSH_TIMEOUT_MS = 5000;
const PROVIDER_ATTEMPTS = 2;
// Calls ring for roughly 45 seconds; a generic 30-second backoff would leave
// no useful retry window after provider timeouts. Postgres still caps attempts.
const RETRY_DELAY_MS = 4_000;
const DISPATCH_SIGNATURE_CONTEXT = 'presuntinho:call-push-dispatch:v1:';
const START_DISPATCH_SIGNATURE_CONTEXT = 'presuntinho:call-start-dispatch:v1:';
const COMMUNICATION_DISPATCH_SIGNATURE_CONTEXT = 'presuntinho:communication-push-dispatch:v1:';

export const MAX_PUSH_SUBSCRIPTIONS = 10;
export const MAX_PUSH_ROWS = 50;

export function emptyDeliveryResult(status, noDevices = false) {
  return { attempted: 0, sent: 0, failed: 0, stale: 0, noDevices, status };
}

export function deliveryResultStatus({ sent, failed, stale, retrying = false }) {
  if (sent > 0 && failed + stale === 0) return 'sent';
  if (sent > 0) return 'partial';
  if (retrying) return 'retrying';
  return 'failed';
}

function allowedPushHost(hostname) {
  return hostname === 'fcm.googleapis.com' ||
    hostname === 'updates.push.services.mozilla.com' ||
    hostname === 'web.push.apple.com' ||
    hostname === 'notify.windows.com' ||
    hostname.endsWith('.notify.windows.com');
}

function validPushKey(value, maxLength) {
  return typeof value === 'string' &&
    value.length >= 16 &&
    value.length <= maxLength &&
    BASE64URL_RE.test(value);
}

/** Validate private subscription material before web-push performs I/O. */
export function safeSubscription(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  if (
    typeof row.endpoint !== 'string' ||
    row.endpoint.length === 0 ||
    row.endpoint.length > MAX_ENDPOINT_LENGTH ||
    !validPushKey(row.p256dh, MAX_P256DH_LENGTH) ||
    !validPushKey(row.auth, MAX_AUTH_LENGTH)
  ) return null;
  try {
    const endpoint = new URL(row.endpoint);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.port !== '' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash ||
      !allowedPushHost(endpoint.hostname)
    ) return null;
    return {
      endpoint: endpoint.href,
      keys: { p256dh: row.p256dh, auth: row.auth }
    };
  } catch {
    return null;
  }
}

export function retryableProviderStatus(status) {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function providerStatus(error) {
  const value = Number(error?.statusCode || error?.status || 0);
  return Number.isInteger(value) && value >= 0 && value <= 599 ? value : 0;
}

export function providerErrorCode(status) {
  if (status === 404 || status === 410) return 'subscription_stale';
  if (status === 429) return 'provider_rate_limited';
  if (status >= 500) return 'provider_unavailable';
  if (status === 0) return 'provider_network_error';
  return `provider_rejected_${status}`;
}

export function configureWebPush(subject, publicKey, privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function sendWebPushWithRetry(subscription, message, options) {
  let lastError = null;
  const deadlineAt = Number(options?.deadlineAt);
  const providerOptions = { ...(options || {}) };
  delete providerOptions.deadlineAt;
  for (let attempt = 0; attempt < PROVIDER_ATTEMPTS; attempt++) {
    const remainingSeconds = Number.isFinite(deadlineAt)
      ? Math.ceil((deadlineAt - Date.now()) / 1000)
      : null;
    if (remainingSeconds !== null && remainingSeconds <= 0) {
      return { ok: false, status: 408, expired: true };
    }
    const attemptOptions = remainingSeconds === null
      ? providerOptions
      : {
          ...providerOptions,
          TTL: Math.max(
            1,
            Math.min(Number(providerOptions.TTL) || remainingSeconds, remainingSeconds)
          )
        };
    try {
      const response = await webpush.sendNotification(subscription, message, attemptOptions);
      return { ok: true, status: Number(response?.statusCode || 201) };
    } catch (error) {
      lastError = error;
      const status = providerStatus(error);
      // A rate-limit response is durable-retryable, but never retry it in the
      // same burst. The background dispatcher observes the DB retry deadline.
      if (
        !retryableProviderStatus(status) ||
        status === 429 ||
        attempt === PROVIDER_ATTEMPTS - 1
      ) break;
    }
  }
  return { ok: false, status: providerStatus(lastError) };
}

export async function parseRows(response) {
  const value = await response.json().catch(() => []);
  return Array.isArray(value) ? value : [];
}

function callSummaryStatus(statuses) {
  if (statuses.length === 0) return emptyDeliveryResult('no-devices', true);
  if (
    statuses.some((status) =>
      ['provider_accepted', 'received', 'presented', 'ringing', 'opened'].includes(status)
    )
  ) return emptyDeliveryResult('already-processed');
  if (statuses.some((status) => ['queued', 'dispatching', 'failed'].includes(status))) {
    return emptyDeliveryResult('retrying');
  }
  return emptyDeliveryResult('failed');
}

function validClaimedDelivery(row, callId, target) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  if (
    !UUID_RE.test(String(row.delivery_id || '')) ||
    String(row.call_id || '') !== callId ||
    String(row.account || '') !== target ||
    !INSTALLATION_RE.test(String(row.installation_id || '')) ||
    row.channel !== 'push' ||
    !UUID_RE.test(String(row.subscription_id || '')) ||
    !Number.isSafeInteger(Number(row.subscription_version)) ||
    Number(row.subscription_version) < 1 ||
    !DELIVERY_TOKEN_RE.test(String(row.attempt_token || '')) ||
    !DELIVERY_TOKEN_RE.test(String(row.ack_token || '')) ||
    typeof row.expires_at !== 'string' ||
    !Number.isFinite(Date.parse(row.expires_at))
  ) return null;
  return {
    deliveryId: row.delivery_id,
    callId: row.call_id,
    account: row.account,
    installationId: row.installation_id,
    subscriptionId: row.subscription_id,
    subscriptionVersion: Number(row.subscription_version),
    attemptToken: row.attempt_token,
    ackToken: row.ack_token,
    expiresAt: row.expires_at
  };
}

const TERMINAL_EVENTS = new Set([
  'answered_here',
  'answered_elsewhere',
  'declined',
  'cancelled',
  'ended',
  'missed',
  'failed'
]);

function validClaimedTerminalDelivery(row, callId, target) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  if (
    !UUID_RE.test(String(row.delivery_id || '')) ||
    String(row.call_id || '') !== callId ||
    String(row.account || '') !== target ||
    !INSTALLATION_RE.test(String(row.installation_id || '')) ||
    !UUID_RE.test(String(row.subscription_id || '')) ||
    !Number.isSafeInteger(Number(row.subscription_version)) ||
    Number(row.subscription_version) < 1 ||
    !DELIVERY_TOKEN_RE.test(String(row.attempt_token || '')) ||
    !TERMINAL_EVENTS.has(String(row.terminal_event || '')) ||
    typeof row.terminal_expires_at !== 'string' ||
    !Number.isFinite(Date.parse(row.terminal_expires_at))
  ) return null;
  return {
    deliveryId: row.delivery_id,
    callId: row.call_id,
    account: row.account,
    installationId: row.installation_id,
    subscriptionId: row.subscription_id,
    subscriptionVersion: Number(row.subscription_version),
    attemptToken: row.attempt_token,
    terminalEvent: row.terminal_event,
    terminalExpiresAt: row.terminal_expires_at
  };
}

function terminalCopy(event, callerName) {
  switch (event) {
    case 'missed':
      return { title: '📞 Chamada não atendida', body: `${callerName} tentou ligar-te.` };
    case 'answered_elsewhere':
      return { title: 'Chamada atendida', body: 'Atendeste noutro dispositivo.' };
    case 'answered_here':
      return { title: 'Chamada atendida', body: 'A chamada foi atendida neste dispositivo.' };
    case 'declined':
      return { title: 'Chamada recusada', body: 'A chamada foi recusada.' };
    case 'cancelled':
      return { title: 'Chamada terminada', body: `${callerName} já não está a ligar.` };
    case 'ended':
      return { title: 'Chamada terminada', body: 'A chamada terminou.' };
    default:
      return { title: 'Não foi possível ligar', body: 'A chamada terminou antes de ser atendida.' };
  }
}

/**
 * Claim and send one database-backed call delivery batch. Every provider side
 * effect happens before its result is persisted; stale endpoints are pruned.
 */
export async function dispatchCallDeliveryBatch({
  sbAdmin,
  callId,
  target,
  eventId,
  title,
  body,
  url,
  senderId
}) {
  const claimRes = await sbAdmin('/rest/v1/rpc/claim_call_delivery_batch', {
    method: 'POST',
    body: JSON.stringify({ p_call: callId, p_limit: MAX_PUSH_SUBSCRIPTIONS })
  }).catch(() => null);
  if (!claimRes?.ok) {
    return { httpStatus: 502, result: emptyDeliveryResult('unavailable') };
  }
  const claimedRows = await parseRows(claimRes);

  if (claimedRows.length === 0) {
    const summaryRes = await sbAdmin(
      `/rest/v1/call_deliveries?call_id=eq.${callId}` +
        `&channel=eq.push&select=status&limit=${MAX_PUSH_ROWS}`
    ).catch(() => null);
    if (!summaryRes?.ok) {
      return { httpStatus: 502, result: emptyDeliveryResult('unavailable') };
    }
    const summary = await parseRows(summaryRes);
    return {
      httpStatus: 200,
      result: callSummaryStatus(summary.map((row) => String(row.status || '')))
    };
  }

  const deliveries = claimedRows
    .map((row) => validClaimedDelivery(row, callId, target))
    .filter(Boolean);
  const invalidClaimCount = claimedRows.length - deliveries.length;
  const subscriptionIds = [...new Set(deliveries.map((delivery) => delivery.subscriptionId))];
  const subscriptionsRes = subscriptionIds.length > 0
    ? await sbAdmin(
        `/rest/v1/push_subscriptions?id=in.(${subscriptionIds.join(',')})` +
          '&select=id,endpoint,p256dh,auth,delivery_version'
      ).catch(() => null)
    : null;
  if (subscriptionIds.length > 0 && !subscriptionsRes?.ok) {
    return { httpStatus: 502, result: emptyDeliveryResult('unavailable') };
  }
  const subscriptionRows = subscriptionsRes ? await parseRows(subscriptionsRes) : [];
  const subscriptions = new Map(subscriptionRows.map((row) => [String(row.id || ''), row]));

  let sent = 0;
  let failed = invalidClaimCount;
  let stale = 0;
  let retrying = false;

  const recordResult = async (delivery, values) => {
    const response = await sbAdmin('/rest/v1/rpc/record_call_delivery_result', {
      method: 'POST',
      body: JSON.stringify({
        p_delivery: delivery.deliveryId,
        // CAS capability for this exact claim attempt. A late provider result
        // from an expired lease cannot overwrite a newer dispatch attempt.
        p_attempt_token: delivery.attemptToken,
        p_subscription_version: delivery.subscriptionVersion,
        p_success: values.success,
        p_status: values.status ?? null,
        p_error: values.error || null,
        p_stale: values.stale === true,
        p_retry_at: values.retryAt || null
      })
    }).catch(() => null);
    if (!response?.ok) return false;
    return (await response.json().catch(() => false)) === true;
  };

  await Promise.all(deliveries.map(async (delivery) => {
    const row = subscriptions.get(delivery.subscriptionId);
    const subscription = safeSubscription(row);
    const subscriptionMatchesClaim =
      Number.isSafeInteger(Number(row?.delivery_version)) &&
      Number(row.delivery_version) === delivery.subscriptionVersion;
    if (!subscription || !subscriptionMatchesClaim || Date.parse(delivery.expiresAt) <= Date.now()) {
      const marked = await recordResult(delivery, {
        success: false,
        status: !subscription ? 404 : !subscriptionMatchesClaim ? 409 : 410,
        error: !subscription
          ? 'subscription_missing'
          : !subscriptionMatchesClaim
            ? 'subscription_rotated'
            : 'call_expired',
        stale: !subscription,
        retryAt: !subscriptionMatchesClaim
          ? new Date(Date.now() + 1000).toISOString()
          : null
      });
      if (!marked) failed++;
      else if (!subscription) stale++;
      else failed++;
      return;
    }

    const message = JSON.stringify({
      type: PUSH_EVENT_TYPE,
      eventId,
      kind: 'call',
      title,
      body,
      url,
      senderId,
      recipientId: target,
      callId,
      expiresAt: delivery.expiresAt,
      deliveryId: delivery.deliveryId,
      // This capability remains valid if a later provider retry rotates the
      // worker's independent attempt/CAS token.
      deliveryToken: delivery.ackToken
    });
    const ttl = Math.max(
      1,
      Math.min(90, Math.ceil((Date.parse(delivery.expiresAt) - Date.now()) / 1000))
    );
    const provider = await sendWebPushWithRetry(subscription, message, {
      TTL: ttl,
      urgency: 'high',
      timeout: WEB_PUSH_TIMEOUT_MS,
      deadlineAt: Date.parse(delivery.expiresAt)
    });

    if (provider.expired) {
      const marked = await recordResult(delivery, {
        success: false,
        status: 408,
        error: 'call_expired',
        stale: false,
        retryAt: null
      });
      failed++;
      if (!marked) console.warn('[push-delivery] expired result could not be recorded');
      return;
    }

    if (provider.ok) {
      const marked = await recordResult(delivery, {
        success: true,
        status: provider.status,
        error: null,
        stale: false,
        retryAt: null
      });
      if (marked) sent++;
      else failed++;
      return;
    }

    const isStale = provider.status === 404 || provider.status === 410;
    const isRetryable = retryableProviderStatus(provider.status) && !isStale;
    const retryAt = isRetryable
      ? new Date(Date.now() + RETRY_DELAY_MS).toISOString()
      : null;
    const marked = await recordResult(delivery, {
      success: false,
      status: provider.status,
      error: providerErrorCode(provider.status),
      stale: isStale,
      retryAt
    });
    if (isStale && marked) {
      // The version-CAS RPC prunes transactionally. A direct DELETE here could
      // remove refreshed key material that appeared while the request flew.
      stale++;
    } else if (isStale) {
      failed++;
    } else {
      failed++;
      retrying ||= isRetryable && marked;
    }
    if (!marked && isStale) console.warn('[push-delivery] stale result could not be recorded');
  }));

  return {
    httpStatus: 200,
    result: {
      attempted: claimedRows.length,
      sent,
      failed,
      stale,
      noDevices: false,
      status: deliveryResultStatus({ sent, failed, stale, retrying })
    }
  };
}

/**
 * Replace a possibly persistent incoming-call notification on every
 * installation where an invitation push was attempted. This has its own CAS
 * token/outbox, so a late invitation result can never resurrect the call.
 */
export async function dispatchCallTerminalBatch({
  sbAdmin,
  callId,
  target,
  eventId,
  url,
  senderId,
  callerName
}) {
  const claimRes = await sbAdmin('/rest/v1/rpc/claim_call_terminal_delivery_batch', {
    method: 'POST',
    body: JSON.stringify({ p_call: callId, p_limit: MAX_PUSH_SUBSCRIPTIONS })
  }).catch(() => null);
  if (!claimRes?.ok) {
    return { httpStatus: 502, result: emptyDeliveryResult('unavailable') };
  }
  const claimedRows = await parseRows(claimRes);

  if (claimedRows.length === 0) {
    const summaryRes = await sbAdmin(
      `/rest/v1/call_terminal_outbox?call_id=eq.${callId}&select=status&limit=1`
    ).catch(() => null);
    if (!summaryRes?.ok) {
      return { httpStatus: 502, result: emptyDeliveryResult('unavailable') };
    }
    const summary = await parseRows(summaryRes);
    const status = String(summary[0]?.status || '');
    if (status === 'sent') {
      return { httpStatus: 200, result: emptyDeliveryResult('already-processed') };
    }
    if (['pending', 'partial', 'dispatching'].includes(status)) {
      return { httpStatus: 200, result: emptyDeliveryResult('retrying') };
    }
    return { httpStatus: 200, result: emptyDeliveryResult('failed') };
  }

  const deliveries = claimedRows
    .map((row) => validClaimedTerminalDelivery(row, callId, target))
    .filter(Boolean);
  const invalidClaimCount = claimedRows.length - deliveries.length;
  const subscriptionIds = [...new Set(deliveries.map((delivery) => delivery.subscriptionId))];
  const subscriptionsRes = subscriptionIds.length > 0
    ? await sbAdmin(
        `/rest/v1/push_subscriptions?id=in.(${subscriptionIds.join(',')})` +
          '&select=id,endpoint,p256dh,auth,delivery_version'
      ).catch(() => null)
    : null;
  if (subscriptionIds.length > 0 && !subscriptionsRes?.ok) {
    return { httpStatus: 502, result: emptyDeliveryResult('unavailable') };
  }
  const subscriptionRows = subscriptionsRes ? await parseRows(subscriptionsRes) : [];
  const subscriptions = new Map(subscriptionRows.map((row) => [String(row.id || ''), row]));

  let sent = 0;
  let failed = invalidClaimCount;
  let stale = 0;
  let retrying = false;

  const recordResult = async (delivery, values) => {
    const response = await sbAdmin('/rest/v1/rpc/record_call_terminal_delivery_result', {
      method: 'POST',
      body: JSON.stringify({
        p_delivery: delivery.deliveryId,
        p_attempt_token: delivery.attemptToken,
        p_subscription_version: delivery.subscriptionVersion,
        p_success: values.success,
        p_status: values.status ?? null,
        p_error: values.error || null,
        p_stale: values.stale === true,
        p_retry_at: values.retryAt || null
      })
    }).catch(() => null);
    if (!response?.ok) return false;
    return (await response.json().catch(() => false)) === true;
  };

  await Promise.all(deliveries.map(async (delivery) => {
    const row = subscriptions.get(delivery.subscriptionId);
    const subscription = safeSubscription(row);
    const subscriptionMatchesClaim =
      Number.isSafeInteger(Number(row?.delivery_version)) &&
      Number(row.delivery_version) === delivery.subscriptionVersion;
    const remainingSeconds = Math.ceil(
      (Date.parse(delivery.terminalExpiresAt) - Date.now()) / 1000
    );
    if (!subscription || !subscriptionMatchesClaim || remainingSeconds <= 0) {
      const marked = await recordResult(delivery, {
        success: false,
        status: !subscription ? 404 : !subscriptionMatchesClaim ? 409 : 410,
        error: !subscription
          ? 'subscription_missing'
          : !subscriptionMatchesClaim
            ? 'subscription_rotated'
            : 'terminal_delivery_expired',
        stale: !subscription,
        retryAt: !subscriptionMatchesClaim && remainingSeconds > 1
          ? new Date(Date.now() + 1000).toISOString()
          : null
      });
      if (marked && !subscription) stale++;
      else failed++;
      return;
    }

    const copy = terminalCopy(delivery.terminalEvent, callerName);
    const message = JSON.stringify({
      type: PUSH_EVENT_TYPE,
      eventId: `${eventId}:terminal:${delivery.terminalEvent}`,
      kind: 'call',
      callState: 'terminal',
      terminalEvent: delivery.terminalEvent,
      title: copy.title,
      body: copy.body.slice(0, 160),
      url,
      senderId,
      recipientId: target,
      callId,
      terminalExpiresAt: delivery.terminalExpiresAt
    });
    const provider = await sendWebPushWithRetry(subscription, message, {
      // Missed calls are useful history. Cancellation/decline/answer cleanup
      // is deliberately short-lived so a recovered provider never surfaces a
      // confusing terminal-only alert minutes later.
      TTL: Math.max(
        1,
        Math.min(delivery.terminalEvent === 'missed' ? 3600 : 60, remainingSeconds)
      ),
      urgency: 'high',
      timeout: WEB_PUSH_TIMEOUT_MS,
      deadlineAt: Date.parse(delivery.terminalExpiresAt)
    });

    if (provider.expired) {
      const marked = await recordResult(delivery, {
        success: false,
        status: 408,
        error: 'terminal_delivery_expired',
        stale: false,
        retryAt: null
      });
      if (!marked) failed++;
      else failed++;
      return;
    }

    if (provider.ok) {
      const marked = await recordResult(delivery, {
        success: true,
        status: provider.status,
        error: null,
        stale: false,
        retryAt: null
      });
      if (marked) sent++;
      else failed++;
      return;
    }

    const isStale = provider.status === 404 || provider.status === 410;
    const isRetryable = retryableProviderStatus(provider.status) && !isStale;
    const retryAt = isRetryable
      ? new Date(Date.now() + RETRY_DELAY_MS).toISOString()
      : null;
    const marked = await recordResult(delivery, {
      success: false,
      status: provider.status,
      error: providerErrorCode(provider.status),
      stale: isStale,
      retryAt
    });
    if (isStale && marked) stale++;
    else failed++;
    retrying ||= isRetryable && marked;
  }));

  return {
    httpStatus: 200,
    result: {
      attempted: claimedRows.length,
      sent,
      failed,
      stale,
      noDevices: false,
      status: deliveryResultStatus({ sent, failed, stale, retrying })
    }
  };
}

const COMMUNICATION_KINDS = new Set(['love', 'nudge', 'message', 'test', 'game_invite', 'reminder']);

function validCommunicationClaim(row, eventId) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const expiresAt = Date.parse(String(row.expires_at || ''));
  if (
    String(row.event_id || '') !== eventId ||
    !COMMUNICATION_KINDS.has(String(row.kind || '')) ||
    !UUID_RE.test(String(row.sender || '')) ||
    !UUID_RE.test(String(row.target || '')) ||
    !UUID_RE.test(String(row.attempt_token || '')) ||
    !Number.isSafeInteger(Number(row.attempt_count)) ||
    Number(row.attempt_count) < 1 ||
    Number(row.attempt_count) > 5 ||
    typeof row.title !== 'string' ||
    row.title.length < 1 ||
    row.title.length > 80 ||
    typeof row.body !== 'string' ||
    row.body.length > 160 ||
    typeof row.url !== 'string' ||
    row.url.length < 1 ||
    row.url.length > 160 ||
    !row.url.startsWith('/') ||
    !Number.isFinite(expiresAt)
  ) return null;
  return {
    eventId,
    kind: row.kind,
    sender: row.sender,
    target: row.target,
    title: row.title,
    body: row.body,
    url: row.url,
    attemptToken: row.attempt_token,
    attemptCount: Number(row.attempt_count),
    expiresAt
  };
}

/**
 * Deliver one non-call communication event from its durable outbox. Delivery
 * is at-least-once: if the function dies after provider acceptance, the lease
 * recovery can resend the same semantic event; the service worker's stable
 * event/tag then collapses the duplicate instead of silently losing it.
 */
export async function dispatchCommunicationPush({ sbAdmin, eventId }) {
  const claimRes = await sbAdmin('/rest/v1/rpc/claim_communication_push', {
    method: 'POST',
    body: JSON.stringify({ p_event: eventId })
  }).catch(() => null);
  if (!claimRes?.ok) {
    return { httpStatus: 502, result: emptyDeliveryResult('unavailable') };
  }
  const claimedRows = await parseRows(claimRes);
  if (claimedRows.length === 0) {
    const summaryRes = await sbAdmin(
      `/rest/v1/communication_push_outbox?event_id=eq.${eventId}` +
        '&select=status,sent_count,failed_count,stale_count,no_devices,next_attempt_at&limit=1'
    ).catch(() => null);
    if (!summaryRes?.ok) {
      return { httpStatus: 502, result: emptyDeliveryResult('unavailable') };
    }
    const summary = (await parseRows(summaryRes))[0];
    if (!summary) return { httpStatus: 200, result: emptyDeliveryResult('already-processed') };
    const counts = {
      attempted: Number(summary.sent_count || 0) +
        Number(summary.failed_count || 0) + Number(summary.stale_count || 0),
      sent: Number(summary.sent_count || 0),
      failed: Number(summary.failed_count || 0),
      stale: Number(summary.stale_count || 0),
      noDevices: summary.no_devices === true
    };
    if (summary.status === 'sent') {
      return {
        httpStatus: 200,
        result: {
          ...counts,
          status: counts.noDevices ? 'no-devices' : 'already-processed'
        }
      };
    }
    if (summary.status === 'queued' || summary.status === 'dispatching' ||
        (summary.status === 'failed' && Number.isFinite(Date.parse(summary.next_attempt_at)))) {
      return { httpStatus: 200, result: { ...counts, status: 'retrying' } };
    }
    return { httpStatus: 200, result: { ...counts, status: 'failed' } };
  }

  const claim = claimedRows.length === 1
    ? validCommunicationClaim(claimedRows[0], eventId)
    : null;
  if (!claim || claim.expiresAt <= Date.now()) {
    return { httpStatus: 502, result: emptyDeliveryResult('unavailable') };
  }

  const subscriptionsRes = await sbAdmin(
    `/rest/v1/push_subscriptions?account=eq.${claim.target}` +
      '&disabled_at=is.null&select=id,delivery_version,endpoint,p256dh,auth' +
      `&order=created_at.desc&limit=${MAX_PUSH_ROWS}`
  ).catch(() => null);
  if (!subscriptionsRes?.ok) {
    return { httpStatus: 502, result: emptyDeliveryResult('unavailable') };
  }
  const rows = await parseRows(subscriptionsRes);
  const subscriptions = rows
    .map((row) => ({
      id: String(row?.id || ''),
      version: Number(row?.delivery_version),
      subscription: safeSubscription(row)
    }))
    .filter((entry) =>
      UUID_RE.test(entry.id) &&
      Number.isSafeInteger(entry.version) &&
      entry.version > 0 &&
      entry.subscription
    )
    .slice(0, MAX_PUSH_SUBSCRIPTIONS);

  let sent = 0;
  let failed = 0;
  let stale = 0;
  let retryable = 0;
  let lastError = null;
  const message = JSON.stringify({
    type: PUSH_EVENT_TYPE,
    eventId: claim.eventId,
    kind: claim.kind,
    title: claim.title,
    body: claim.body,
    url: claim.url,
    senderId: claim.sender,
    recipientId: claim.target,
    // Provider acceptance is not presentation. A device can receive a queued
    // push near the end of its TTL, so the worker also needs the authoritative
    // deadline to suppress an invitation that is already unusable.
    expiresAt: new Date(claim.expiresAt).toISOString()
  });

  await Promise.all(subscriptions.map(async ({ id, version, subscription }) => {
    const provider = await sendWebPushWithRetry(subscription, message, {
      TTL: Math.max(1, Math.min(3600, Math.ceil((claim.expiresAt - Date.now()) / 1000))),
      urgency: claim.kind === 'message' || claim.kind === 'reminder' ? 'normal' : 'high',
      timeout: WEB_PUSH_TIMEOUT_MS,
      deadlineAt: claim.expiresAt
    });
    if (provider.ok) {
      sent += 1;
      return;
    }
    const isStale = provider.status === 404 || provider.status === 410;
    if (isStale) {
      stale += 1;
      await sbAdmin(
        `/rest/v1/push_subscriptions?id=eq.${id}&delivery_version=eq.${version}`,
        { method: 'DELETE' }
      ).catch(() => null);
      return;
    }
    failed += 1;
    if (retryableProviderStatus(provider.status)) retryable += 1;
    lastError = providerErrorCode(provider.status);
  }));

  const noDevices = subscriptions.length === 0;
  const recordRes = await sbAdmin('/rest/v1/rpc/record_communication_push_result', {
    method: 'POST',
    body: JSON.stringify({
      p_event: claim.eventId,
      p_attempt_token: claim.attemptToken,
      p_sent: sent,
      p_failed: failed,
      p_stale: stale,
      p_retryable: retryable,
      p_no_devices: noDevices,
      p_error: lastError
    })
  }).catch(() => null);
  if (!recordRes?.ok || (await recordRes.json().catch(() => false)) !== true) {
    return { httpStatus: 502, result: emptyDeliveryResult('unavailable') };
  }

  return {
    httpStatus: 200,
    result: {
      attempted: subscriptions.length,
      sent,
      failed,
      stale,
      noDevices,
      status: noDevices
        ? 'no-devices'
        : retryable > 0
          ? 'retrying'
          : deliveryResultStatus({ sent, failed, stale })
    }
  };
}

export function callDispatchSignature(secret, callId) {
  return createHmac('sha256', secret)
    .update(`${DISPATCH_SIGNATURE_CONTEXT}${callId}`)
    .digest('hex');
}

export function validCallDispatchSignature(secret, callId, candidate) {
  if (
    typeof secret !== 'string' ||
    secret.length < 32 ||
    !UUID_RE.test(String(callId || '')) ||
    typeof candidate !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(candidate)
  ) return false;
  const expected = Buffer.from(callDispatchSignature(secret, callId), 'hex');
  const supplied = Buffer.from(candidate, 'hex');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

/**
 * Bind a pre-commit dispatcher job to the authenticated caller and the
 * browser's idempotency key. The call id does not exist when this is signed.
 */
export function callStartDispatchSignature(secret, caller, requestId) {
  return createHmac('sha256', secret)
    .update(`${START_DISPATCH_SIGNATURE_CONTEXT}${caller}:${requestId}`)
    .digest('hex');
}

export function validCallStartDispatchSignature(secret, caller, requestId, candidate) {
  if (
    typeof secret !== 'string' ||
    secret.length < 32 ||
    !UUID_RE.test(String(caller || '')) ||
    !UUID_RE.test(String(requestId || '')) ||
    typeof candidate !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(candidate)
  ) return false;
  const expected = Buffer.from(callStartDispatchSignature(secret, caller, requestId), 'hex');
  const supplied = Buffer.from(candidate, 'hex');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function communicationDispatchSignature(secret, eventId) {
  return createHmac('sha256', secret)
    .update(`${COMMUNICATION_DISPATCH_SIGNATURE_CONTEXT}${eventId}`)
    .digest('hex');
}

export function validCommunicationDispatchSignature(secret, eventId, candidate) {
  if (
    typeof secret !== 'string' ||
    secret.length < 32 ||
    !UUID_RE.test(String(eventId || '')) ||
    typeof candidate !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(candidate)
  ) return false;
  const expected = Buffer.from(communicationDispatchSignature(secret, eventId), 'hex');
  const supplied = Buffer.from(candidate, 'hex');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
