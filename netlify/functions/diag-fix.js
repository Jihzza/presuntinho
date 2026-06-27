// netlify/functions/diag-fix.js
// Test the actual fix: getStore({ name, siteID, token, consistency: 'eventual' })

import { getStore } from '@netlify/blobs';

export const handler = async () => {
  const siteID = process.env.SITE_ID;
  const token = process.env.NETLIFY_FUNCTIONS_TOKEN;
  if (!siteID || !token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'missing_siteid_or_token' }) };
  }
  try {
    const store = getStore({ name: 'lovelock-test', siteID, token, consistency: 'eventual' });
    const key = `diag:${Date.now()}`;
    await store.set(key, 'hello');
    const v = await store.get(key, { type: 'text' });
    await store.delete(key);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, wrote: key, readBack: v, storeKeys: Object.keys(store) }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: e?.message, stack: String(e?.stack || '').slice(0, 600) }),
    };
  }
};