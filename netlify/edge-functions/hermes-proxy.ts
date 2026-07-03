// Edge proxy for the Hermes agent gateway.
//
// The /agente chatbot calls same-origin `/api/agent/*`; this function
// forwards to the self-hosted gateway (Tailscale Funnel URL) and injects
// the API key from Netlify env vars — so no device ever needs the key,
// and the key never ships in the client bundle.
//
// Env vars (Netlify → Site settings → Environment variables):
//   HERMES_GATEWAY_URL  e.g. https://desktop-515prlu.tail4e72bb.ts.net
//   HERMES_API_KEY      the gateway's API_SERVER_KEY
//
// Streaming: the SSE body is piped through untouched (edge functions
// support streamed responses; serverless functions would buffer it —
// that's why this is an edge function).

// Only the endpoints the app actually uses are forwarded.
const ALLOWED = [
  /^\/health$/,
  /^\/api\/sessions$/,
  /^\/api\/sessions\/[A-Za-z0-9._-]+$/,
  /^\/api\/sessions\/[A-Za-z0-9._-]+\/chat\/stream$/
];

export default async (request: Request) => {
  const base = Netlify.env.get('HERMES_GATEWAY_URL')?.replace(/\/+$/, '');
  const key = Netlify.env.get('HERMES_API_KEY');
  if (!base || !key) {
    return Response.json({ error: 'agent proxy not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const upstreamPath = url.pathname.replace(/^\/api\/agent/, '') || '/';
  if (!ALLOWED.some((re) => re.test(upstreamPath))) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${key}`);
  const contentType = request.headers.get('Content-Type');
  if (contentType) headers.set('Content-Type', contentType);

  let upstream: Response;
  try {
    upstream = await fetch(`${base}${upstreamPath}`, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body
    });
  } catch {
    return Response.json({ error: 'agent gateway unreachable' }, { status: 502 });
  }

  // Pass the body stream through as-is; keep only the headers that matter.
  const respHeaders = new Headers();
  for (const h of ['Content-Type', 'Cache-Control', 'X-Hermes-Session-Id']) {
    const v = upstream.headers.get(h);
    if (v) respHeaders.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
};

export const config = { path: '/api/agent/*' };
