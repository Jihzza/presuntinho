// scripts/test-lovelock.mjs
//
// Local unit test for netlify/functions/love-lock.js — CI-only, NOT committed.
// Exercises GET (no lock) → POST (sets lock + cookie) → GET with cookie
// (sees the lock) against an in-memory mock of @netlify/blobs.
//
// Run with: `node scripts/test-lovelock.mjs` from the repo root.

import { createRequire } from 'node:module';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// ── 1. Mock @netlify/blobs with an in-memory store BEFORE importing the function ──
//
// Strategy: stash the in-memory store on globalThis so the injected source can
// reach it without needing closure capture (the injected string is a separate
// module, so local `memStore` is out of scope).

globalThis.__LOVE_LOCK_MEM_STORE__ = new Map(); // key → JSON string

const mockGetStoreSource = `
const __mem = globalThis.__LOVE_LOCK_MEM_STORE__;
function connectLambda(_event) {}
function getStore(input) {
  // Accept both the string form (production-safe: getStore(name)) and the
  // object form. The string form is the correct one in production — the
  // object form requires explicit siteID + token unless the runtime
  // context is already wired up.
  const _opts = (typeof input === 'string') ? {} : (input || {});
  return {
    async get(key, { type } = {}) {
      const raw = __mem.get(key);
      if (raw === undefined) return null;
      if (type === 'json') return JSON.parse(raw);
      return raw;
    },
    async setJSON(key, value) {
      __mem.set(key, JSON.stringify(value));
    },
    delete(key) {
      __mem.delete(key);
      return Promise.resolve();
    },
  };
}
`;

const fs = await import('node:fs/promises');
const fnPath = path.join(repoRoot, 'netlify', 'functions', 'love-lock.js');
let src = await fs.readFile(fnPath, 'utf8');

// Strip the @netlify/blobs import and inject our mock in its place.
src = src.replace(
  /import\s*\{\s*connectLambda\s*,\s*getStore\s*\}\s*from\s*['"]@netlify\/blobs['"];?/,
  mockGetStoreSource
);

// Write to a tmp .mjs and import it as a data URL? No — just write next to
// the original and import.
const tmpPath = path.join(repoRoot, '.lovelock-fn-under-test.mjs');
await fs.writeFile(tmpPath, src, 'utf8');

let handler;
try {
  const mod = await import(pathToFileURL(tmpPath).href);
  handler = mod.handler;
} finally {
  await fs.unlink(tmpPath).catch(() => {});
}

if (typeof handler !== 'function') {
  console.error('FAIL: handler not exported');
  process.exit(1);
}

let passed = 0;
let failed = 0;
const memStore = () => globalThis.__LOVE_LOCK_MEM_STORE__;
function assert(label, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function makeEvent({ method = 'GET', body, headers = {} } = {}) {
  return {
    httpMethod: method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  };
}

function getSetCookie(res) {
  const sc = res.headers['Set-Cookie'] || res.headers['set-cookie'];
  return Array.isArray(sc) ? sc[0] : sc;
}

function parseSetCookie(sc) {
  if (!sc) return null;
  const [pair] = sc.split(';');
  const eq = pair.indexOf('=');
  return { name: pair.slice(0, eq), value: pair.slice(eq + 1) };
}

// ── Test 1: GET on cold store → active:false ──
console.log('\nTest 1: GET on cold store');
{
  memStore().clear();
  const res = await handler(makeEvent({ method: 'GET', headers: { cookie: '' } }));
  assert('status 200', res.statusCode === 200, `got ${res.statusCode}`);
  const body = JSON.parse(res.body);
  assert('active:false', body.active === false);
  assert('kind:null', body.kind === null);
  assert('expiresAt:null', body.expiresAt === null);
  assert('no Set-Cookie', getSetCookie(res) == null);
}

// ── Test 2: POST without origin → 403 forbidden_origin ──
console.log('\nTest 2: POST without origin header');
{
  memStore().clear();
  const res = await handler(makeEvent({ method: 'POST', body: { kind: 'love' } }));
  assert('status 403', res.statusCode === 403, `got ${res.statusCode}`);
  const body = JSON.parse(res.body);
  assert('error:forbidden_origin', body.error === 'forbidden_origin');
  assert('blob not set', !memStore().has('love-lock:current'));
}

// ── Test 3: POST with allowed origin → blob set + cookie returned ──
console.log('\nTest 3: POST with allowed origin');
let cookieValue = '';
{
  memStore().clear();
  const res = await handler(
    makeEvent({
      method: 'POST',
      body: { kind: 'love' },
      headers: { origin: 'https://presuntinho.netlify.app' },
    })
  );
  assert('status 200', res.statusCode === 200, `got ${res.statusCode}`);
  const body = JSON.parse(res.body);
  assert('active:true', body.active === true);
  assert('kind:love', body.kind === 'love');
  assert('expiresAt is number', typeof body.expiresAt === 'number');
  assert('expiresAt ~ now+1h', Math.abs(body.expiresAt - (Date.now() + 3_600_000)) < 5000);

  const sc = getSetCookie(res);
  assert('Set-Cookie present', !!sc);
  const parsed = parseSetCookie(sc);
  assert('cookie name = lovelock_id', parsed?.name === 'lovelock_id');
  assert('cookie value is non-empty', !!parsed?.value);
  assert('cookie has Max-Age=2592000', /Max-Age=2592000/.test(sc));
  assert('cookie has Path=/', /Path=\//.test(sc));
  assert('cookie has SameSite=Lax', /SameSite=Lax/.test(sc));
  assert('cookie NOT HttpOnly', !/HttpOnly/i.test(sc));
  assert('blob written', memStore().has('love-lock:current'));

  cookieValue = parsed.value;
}

// ── Test 4: GET with cookie → active:true + same kind ──
console.log('\nTest 4: GET with cookie after POST');
{
  const res = await handler(
    makeEvent({ method: 'GET', headers: { cookie: `lovelock_id=${encodeURIComponent(cookieValue)}` } })
  );
  assert('status 200', res.statusCode === 200);
  const body = JSON.parse(res.body);
  assert('active:true', body.active === true);
  assert('kind:love', body.kind === 'love');
}

// ── Test 5: GET does not 400 on garbage cookie (we always read the blob) ──
console.log('\nTest 5: GET with garbage cookie is tolerated');
{
  // In the unsigned-id mode (no LOVE_LOCK_SECRET), ANY cookie value is
  // accepted as a session token — the blob is the source of truth. So the
  // response reflects the blob's state, not the cookie's shape. This is
  // intentional: ignore invalid, don't 400.
  const res = await handler(
    makeEvent({ method: 'GET', headers: { cookie: 'lovelock_id=garbage' } })
  );
  assert('status 200', res.statusCode === 200);
  const body = JSON.parse(res.body);
  assert('response reflects blob (active:true since prior POST set it)',
    body.active === true && body.kind === 'love',
    JSON.stringify(body));
}

// ── Test 6: POST with invalid kind → 400 ──
console.log('\nTest 6: POST with invalid kind');
{
  const res = await handler(
    makeEvent({
      method: 'POST',
      body: { kind: 'angry' },
      headers: { origin: 'https://presuntinho.netlify.app' },
    })
  );
  assert('status 400', res.statusCode === 400);
  const body = JSON.parse(res.body);
  assert('error:invalid_kind', body.error === 'invalid_kind');
}

// ── Test 7: POST rotates id cookie (two POSTs → two different ids) ──
console.log('\nTest 7: POST rotates id');
let secondCookie = '';
{
  const res = await handler(
    makeEvent({
      method: 'POST',
      body: { kind: 'sad' },
      headers: { origin: 'https://presuntinho.netlify.app' },
    })
  );
  assert('status 200', res.statusCode === 200);
  const parsed = parseSetCookie(getSetCookie(res));
  secondCookie = parsed.value;
  assert('rotated (different from first)', secondCookie && secondCookie !== cookieValue);
}

// ── Test 8: DELETE → blob cleared, cookie cleared ──
console.log('\nTest 8: DELETE');
{
  const res = await handler(makeEvent({ method: 'DELETE' }));
  assert('status 200', res.statusCode === 200);
  assert('blob deleted', !memStore().has('love-lock:current'));
  const sc = getSetCookie(res);
  assert('Set-Cookie present', !!sc);
  assert('Max-Age=0', /Max-Age=0/.test(sc));
}

// ── Test 8b: POST accepts sick lock kind ──
console.log('\nTest 8b: POST accepts sick kind');
{
  const res = await handler(
    makeEvent({
      method: 'POST',
      body: { kind: 'sick' },
      headers: { origin: 'https://presuntinho.netlify.app' },
    })
  );
  assert('status 200', res.statusCode === 200, `got ${res.statusCode}`);
  const body = JSON.parse(res.body);
  assert('active:true', body.active === true);
  assert('kind:sick', body.kind === 'sick');
  assert('blob stores sick', JSON.parse(memStore().get('love-lock:current')).kind === 'sick');
  await handler(makeEvent({ method: 'DELETE' }));
}

// ── Test 9: GET after DELETE → active:false ──
console.log('\nTest 9: GET after DELETE');
{
  const res = await handler(makeEvent({ method: 'GET', headers: { cookie: '' } }));
  const body = JSON.parse(res.body);
  assert('active:false', body.active === false);
}

// ── Test 10: GET on expired blob → active:false + lazy GC ──
console.log('\nTest 10: GET on expired blob triggers lazy GC');
{
  memStore().set(
    'love-lock:current',
    JSON.stringify({ kind: 'sad', startedAt: Date.now() - 7200_000, expiresAt: Date.now() - 60_000 })
  );
  const res = await handler(makeEvent({ method: 'GET', headers: { cookie: '' } }));
  const body = JSON.parse(res.body);
  assert('active:false', body.active === false);
  // Give the fire-and-forget delete a tick to land.
  await new Promise((r) => setTimeout(r, 50));
  assert('blob gc\'d', !memStore().has('love-lock:current'));
}

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
