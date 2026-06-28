import type { PageLoad } from './$types';

// ============================================================================
// /aulas universal load — forwards the server load result and opts the route
// into prerendering (overrides the global ssr=false from +layout.ts so the
// build can bake the aggregated timeline into static HTML).
//
// Pattern reference: src/routes/sitemap.xml/+server.ts — the only other
// route in this repo that opts back into prerender despite global ssr=false.
// ============================================================================

export const prerender = true;
export const ssr = true;

export const load: PageLoad = ({ data }) => {
  // Server load already returns the final shape; pass through.
  return data;
};