// Minimal Netlify-like static server for the adapter-static build output:
// serves files from build/ verbatim and rewrites every missing path to
// /index.html (SPA fallback) — the same semantics as the production
// _redirects rule. Used for production-faithful local smoke tests
// (`vite preview` regenerates the shell per-path and is NOT faithful).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const ROOT = new URL('../build', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORT = Number(process.env.PORT || 4180);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain',
  '.xml': 'application/xml'
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    let file = normalize(join(ROOT, pathname));
    if (!file.startsWith(normalize(ROOT))) { res.writeHead(403); res.end(); return; }
    let body;
    try {
      body = await readFile(file);
    } catch {
      try {
        body = await readFile(join(ROOT, pathname, 'index.html'));
        file = pathname + '/index.html';
      } catch {
        body = await readFile(join(ROOT, 'index.html'));
        file = '/index.html';
      }
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`static build server on http://127.0.0.1:${PORT}`));
