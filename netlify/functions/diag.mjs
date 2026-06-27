// netlify/functions/diag.mjs
// One-shot diagnostic: list every env var the runtime exposes that
// relates to Netlify Blobs. Returns a Response (Functions v2 format).

export default async () => {
  const keys = Object.keys(process.env).sort();
  const blobRelated = keys.filter((k) => /blob|netlify|nf_|site|deploy|context/i.test(k));
  const payload = {
    blobRelated,
    blobRelatedCount: blobRelated.length,
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
    globalThisNetlifyBlobsContextType: typeof globalThis.netlifyBlobsContext,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};