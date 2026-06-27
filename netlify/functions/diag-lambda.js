// netlify/functions/diag-lambda.js
// Test the official connectLambda(event) bootstrap pattern.

import { connectLambda, getStore } from '@netlify/blobs';

export const handler = async (event) => {
  // Dump the relevant Lambda-compat event fields BEFORE calling connectLambda.
  const pre = {
    has_event_blobs: Boolean(event?.blobs),
    event_blobs_first80: typeof event?.blobs === 'string' ? event.blobs.slice(0, 80) : null,
    x_nf_site_id: event?.headers?.['x-nf-site-id'] || event?.headers?.['X-Nf-Site-Id'] || null,
    x_nf_deploy_id: event?.headers?.['x-nf-deploy-id'] || event?.headers?.['X-Nf-Deploy-Id'] || null,
  };

  let bootstrap;
  try {
    connectLambda(event);
    bootstrap = { ok: true };
  } catch (e) {
    bootstrap = {
      ok: false,
      error: e?.message,
      stack: String(e?.stack || '').slice(0, 500),
    };
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pre, bootstrap }),
    };
  }

  // Now try to read/write the store.
  let tryResult;
  try {
    const store = getStore('lovelock-lambda-probe');
    const key = `probe:${Date.now()}`;
    await store.set(key, 'hello');
    const v = await store.get(key, { type: 'text' });
    await store.delete(key);
    tryResult = { ok: true, readBack: v };
  } catch (e) {
    tryResult = {
      ok: false,
      error: e?.message,
      stack: String(e?.stack || '').slice(0, 500),
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pre, bootstrap, tryResult }, null, 2),
  };
};