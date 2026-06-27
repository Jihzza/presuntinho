import type { RequestHandler } from './$types';

/**
 * Dynamic sitemap.xml endpoint — Phase 15 (UX polish: SEO).
 *
 * Lists the public, indexable routes. Explicitly excludes:
 *   - /splash/                  auth gate, no SEO value
 *   - /legacy/                  preserved V3 archive; robots.txt disallows
 *   - /biblioteca/item/[id]    per-user content, not canonical pages
 *   - /escola/quiz/[slug]       drill-down content; canonical is /escola
 *   - /escola/curso/[slug]     drill-down content
 *   - /escola/licao/[...]/     drill-down content
 *   - /trabalhos/assignment/[slug]  per-user
 *   - /habitos/habit/[slug]    per-user
 *   - /financas/nova/ /financas/orcamento/ /financas/transacoes/
 *   - /biblioteca/novo/ /habitos/novo/  forms, not indexable
 *
 * The SvelteKit plus-server.ts endpoint is prerendered at build time via the
 * `export const prerender = true` below. This works even though the rest of
 * the app is `ssr = false` (server endpoints are the documented exception).
 * Output is committed to `build/sitemap.xml` so crawlers and humans get a
 * plain XML response with no SPA shell behind it.
 */

const SITE = 'https://presuntinho.netlify.app';

/** Public, indexable routes — keep in sync with PRESERVATION.md. */
const PUBLIC_ROUTES: string[] = [
  '/',
  '/case/',
  '/course/',
  '/walk/',
  '/write/',
  '/pt/',
  '/dl/',
  '/secrets/',
  '/escola/',
  '/trabalhos/',
  '/financas/',
  '/habitos/',
  '/biblioteca/',
  '/definicoes/'
];

/** ISO date used for `<lastmod>` — set at build time. */
function lastmod(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Escape XML 1.0 special characters in `<loc>` URLs. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Prerender at build time so `build/sitemap.xml` is a real static XML file.
// This is the only SvelteKit build artefact that survives `ssr = false`
// globally because plus-server.ts endpoints may opt into prerender.
export const prerender = true;

export const GET: RequestHandler = () => {
  const date = lastmod();
  const urls = PUBLIC_ROUTES.map(
    (path) =>
      `  <url>\n` +
      `    <loc>${xmlEscape(SITE + path)}</loc>\n` +
      `    <lastmod>${date}</lastmod>\n` +
      `    <changefreq>weekly</changefreq>\n` +
      `    <priority>${path === '/' ? '1.0' : '0.7'}</priority>\n` +
      `  </url>`
  ).join('\n');

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${urls}\n` +
    `</urlset>\n`;

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // Allow CDNs and crawlers to cache the sitemap for an hour; rebuild
      // regenerates the file so a 1h TTL is safe.
      'cache-control': 'public, max-age=3600'
    }
  });
};