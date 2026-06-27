// netlify/functions/diag.mjs
// Deep diagnostic — exercise the actual code paths the love-lock function
// uses, and report exactly what fails. Returns a Response (Functions v2).

import { getStore } from '@netlify/blobs';

export default async () => {
  const out = { steps: [], errors: [] };

  // Step 1: read NETLIFY_BLOBS_CONTEXT the way @netlify/blobs does
  try {
    const env = process.env.NETLIFY_BLOBS_CONTEXT;
    out.steps.push({ step: 'read NETLIFY_BLOBS_CONTEXT', ok: !!env });
    if (!env) throw new Error('NETLIFY_BLOBS_CONTEXT not set');
    const decoded = JSON.parse(Buffer.from(env, 'base64').toString('utf8'));
    out.contextKeys = Object.keys(decoded);
    out.hasSiteID = !!decoded.siteID;
    out.hasToken = !!decoded.token;
    out.hasEdgeURL = !!decoded.edgeURL;
    out.hasUncachedEdgeURL = !!decoded.uncachedEdgeURL;
  } catch (e) {
    out.errors.push({ step: 'read env', err: e.message, stack: e.stack });
  }

  // Step 2: getStore (eventual)
  let storeEventual;
  try {
    storeEventual = getStore({ name: 'lovelock', consistency: 'eventual' });
    out.steps.push({ step: 'getStore eventual', ok: true });
  } catch (e) {
    out.errors.push({ step: 'getStore eventual', err: e.message, stack: e.stack });
  }

  // Step 3: getStore (strong)
  let storeStrong;
  try {
    storeStrong = getStore({ name: 'lovelock', consistency: 'strong' });
    out.steps.push({ step: 'getStore strong', ok: true });
  } catch (e) {
    out.errors.push({ step: 'getStore strong', err: e.message, stack: e.stack });
  }

  // Step 4: GET (eventual)
  if (storeEventual) {
    try {
      const got = await storeEventual.get('love-lock:current', { type: 'json' });
      out.steps.push({ step: 'get eventual', ok: true, value: got });
    } catch (e) {
      out.errors.push({ step: 'get eventual', err: e.message, name: e.name, stack: e.stack });
    }
  }

  // Step 5: GET (strong)
  if (storeStrong) {
    try {
      const got = await storeStrong.get('love-lock:current', { type: 'json' });
      out.steps.push({ step: 'get strong', ok: true, value: got });
    } catch (e) {
      out.errors.push({ step: 'get strong', err: e.message, name: e.name, stack: e.stack });
    }
  }

  // Step 6: setJSON (eventual)
  if (storeEventual) {
    try {
      await storeEventual.setJSON('love-lock:diag-' + Date.now(), { kind: 'love', startedAt: Date.now() });
      out.steps.push({ step: 'setJSON eventual', ok: true });
    } catch (e) {
      out.errors.push({ step: 'setJSON eventual', err: e.message, name: e.name, stack: e.stack });
    }
  }

  // Step 7: setJSON (strong)
  if (storeStrong) {
    try {
      await storeStrong.setJSON('love-lock:diag-' + Date.now(), { kind: 'love', startedAt: Date.now() });
      out.steps.push({ step: 'setJSON strong', ok: true });
    } catch (e) {
      out.errors.push({ step: 'setJSON strong', err: e.message, name: e.name, stack: e.stack });
    }
  }

  return new Response(JSON.stringify(out, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};