// netlify/functions/diag-tokens.js
// Test every token-shaped env var to find which one authorizes the blobs API.

import { getStore } from '@netlify/blobs';

const CANDIDATES = [
  'AWS_SESSION_TOKEN',
  'AWS_LAMBDA_METADATA_TOKEN',
  'NETLIFY_FUNCTIONS_TOKEN',
];

export const handler = async () => {
  const siteID = process.env.SITE_ID;
  const results = {};

  for (const key of CANDIDATES) {
    const token = process.env[key];
    if (!token) {
      results[key] = { skipped: 'not present' };
      continue;
    }
    try {
      const store = getStore({ name: 'lovelock-token-probe', siteID, token, consistency: 'eventual' });
      const k = `probe:${Date.now()}`;
      await store.set(k, 'x');
      await store.delete(k);
      results[key] = { ok: true, length: token.length };
    } catch (e) {
      results[key] = {
        ok: false,
        error: e?.message,
        error_name: e?.name,
        length: token.length,
      };
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteID, results }, null, 2),
  };
};