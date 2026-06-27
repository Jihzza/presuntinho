// netlify/functions/diag-blobs.js
// One-shot diagnostic: dump what the Netlify runtime actually injects for Blobs.
// Will be deleted after the fix is confirmed working in production.

import { getStore, setEnvironmentContext, getDeployStore } from '@netlify/blobs';

function decode(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch (e) {
    return { __decode_error: String(e), __raw_first80: String(raw).slice(0, 80) };
  }
}

export const handler = async (event) => {
  const ctx = {
    process_env_has_NBC: Boolean(process.env.NETLIFY_BLOBS_CONTEXT),
    process_env_NBC_len: (process.env.NETLIFY_BLOBS_CONTEXT || '').length,
    process_env_NBC_decoded: decode(process.env.NETLIFY_BLOBS_CONTEXT),
    global_netlifyBlobsContext_present: Boolean(globalThis.netlifyBlobsContext),
    global_netlify_present: Boolean(globalThis.Netlify),
    global_netlify_env_NBC_present: Boolean(globalThis.Netlify?.env?.get?.('NETLIFY_BLOBS_CONTEXT')),
    global_netlify_env_NBC_decoded: decode(globalThis.Netlify?.env?.get?.('NETLIFY_BLOBS_CONTEXT')),
    process_env_keys_with_BLOB: Object.keys(process.env).filter((k) => k.includes('BLOB')),
    process_env_keys_count: Object.keys(process.env).length,
    global_netlify_env_keys_with_BLOB: globalThis.Netlify?.env?.toObject
      ? Object.keys(globalThis.Netlify.env.toObject()).filter((k) => k.includes('BLOB'))
      : null,
    node_version: process.version,
    context: process.env.CONTEXT || null,
    deploy_id: process.env.DEPLOY_ID || null,
    site_id: process.env.SITE_ID || null,
    commit_ref: process.env.COMMIT_REF || null,
  };

  // Now try: if env var is present, call setEnvironmentContext and try getStore
  let tryResult = null;
  try {
    if (process.env.NETLIFY_BLOBS_CONTEXT) {
      const decoded = JSON.parse(Buffer.from(process.env.NETLIFY_BLOBS_CONTEXT, 'base64').toString('utf8'));
      setEnvironmentContext(decoded);
    }
    if (globalThis.Netlify?.env?.get?.('NETLIFY_BLOBS_CONTEXT') && !process.env.NETLIFY_BLOBS_CONTEXT) {
      const raw = globalThis.Netlify.env.get('NETLIFY_BLOBS_CONTEXT');
      const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      setEnvironmentContext(decoded);
    }
    // also set globalThis.netlifyBlobsContext (the primary read path)
    if (process.env.NETLIFY_BLOBS_CONTEXT) {
      globalThis.netlifyBlobsContext = process.env.NETLIFY_BLOBS_CONTEXT;
    } else if (globalThis.Netlify?.env?.get?.('NETLIFY_BLOBS_CONTEXT')) {
      globalThis.netlifyBlobsContext = globalThis.Netlify.env.get('NETLIFY_BLOBS_CONTEXT');
    }

    const store = getStore({ name: 'diag-store', consistency: 'eventual' });
    tryResult = {
      ok: true,
      storeKeys: Object.keys(store || {}),
      storeProto: Object.getPrototypeOf(store)?.constructor?.name,
    };
  } catch (e) {
    tryResult = {
      ok: false,
      error_name: e?.name,
      error_message: e?.message,
      error_stack: String(e?.stack || '').slice(0, 400),
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ctx, tryResult }, null, 2),
  };
};