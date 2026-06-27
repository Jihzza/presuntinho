// netlify/functions/diag-env.js
// Dump ALL env vars (keys only) + token-shaped values to find siteID/token source.

export const handler = async () => {
  const keys = Object.keys(process.env).sort();
  const blobs_keys = keys.filter((k) => /blob|netlify|token|site/i.test(k));
  const token_like = {};
  for (const k of blobs_keys) {
    const v = process.env[k];
    if (!v) continue;
    if (/token/i.test(k)) {
      token_like[k] = `${String(v).slice(0, 6)}...len=${v.length}`;
    } else {
      token_like[k] = v;
    }
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      {
        total_keys: keys.length,
        blobs_keys,
        token_like,
        SITE_ID: process.env.SITE_ID || null,
        NETLIFY: process.env.NETLIFY ? `${process.env.NETLIFY.slice(0, 8)}...` : null,
        has_NBC: Boolean(process.env.NETLIFY_BLOBS_CONTEXT),
      },
      null,
      2
    ),
  };
};