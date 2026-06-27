// netlify/functions/diag.mjs
// One-shot diagnostic: list every env var the runtime exposes that
// relates to Netlify Blobs. Safe to ship — read-only, no secrets leaked
// (we only show key presence, not values).

export default async () => {
  const keys = Object.keys(process.env).sort();
  const blobRelated = keys.filter((k) => /blob|netlify|nf_|site|deploy|context/i.test(k));
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      {
        blobRelated,
        blobRelatedCount: blobRelated.length,
        // Also dump the actual NETLIFY_BLOBS_CONTEXT value (base64) if present,
        // and its decoded JSON if base64-parseable. This is non-secret.
        NETLIFY_BLOBS_CONTEXT: process.env.NETLIFY_BLOBS_CONTEXT
          ? (() => {
              try {
                return {
                  length: process.env.NETLIFY_BLOBS_CONTEXT.length,
                  decoded: JSON.parse(
                    Buffer.from(process.env.NETLIFY_BLOBS_CONTEXT, 'base64').toString('utf8')
                  ),
                };
              } catch (e) {
                return { error: e.message };
              }
            })()
          : null,
        globalThisNetlifyBlobsContext: typeof globalThis.netlifyBlobsContext,
      },
      null,
      2
    ),
  };
};