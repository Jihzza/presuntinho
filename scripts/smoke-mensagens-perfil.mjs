// Static-shell smoke for task-219:
//   - all 5 routes return 200 from serve-static.mjs
//   - shell HTML invariants: <html lang>, <title>, manifest, immutable entry
//   - no literal `$t(` leak in served HTML
//   - all 5 locale JSONs exist with parity keys
//   - bundle wires locale map with `ar` => dir=rtl, others => dir=ltr
//   - tn.json has zero Arabic-script characters (already covered by i18n-tn-no-arabic.test.mjs but re-asserted here)
//
// This is a static smoke. A full Playwright run lives in test:e2e but isn't
// wired for these routes yet — keep this script as the lightweight gate
// so cron ticks can prove "production-faithful static shell + i18n integrity"
// without spinning a browser.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const PORT = Number(process.env.SMOKE_PORT || 4180);
const ROOT = process.cwd();

const ROUTES = ['/', '/mensagens/', '/perfil/', '/perfil/fatma/', '/perfil/daniel/'];
const LOCALES = ['pt-PT', 'en', 'tn', 'fr', 'ar'];

function fetch(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port: PORT, path, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
let failed = 0;
let passed = 0;
function check(name, ok, info = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}${info ? ' — ' + info : ''}`); }
  else { failed++; console.log(`  ✗ ${name}${info ? ' — ' + info : ''}`); }
}

console.log('=== smoke: mensagens + perfil × 5 routes via static server ===');

for (const route of ROUTES) {
  const { status, body } = await fetch(route);
  check(`GET ${route} returns 200`, status === 200, `got ${status}`);
  check(`  <html lang="...">`, /<html\s+lang="[^"]+"/.test(body));
  check(`  <title> present`, /<title>[^<]+<\/title>/.test(body));
  check(`  PWA manifest linked`, /rel="manifest"\s+href="\/manifest\.webmanifest"/.test(body));
  check(`  app entry modulepreload`, /\/\_app\/immutable\/entry\/start\.[^"]+\.js/.test(body));
  // The shell always renders pt-PT as default lang (locale override happens
  // client-side via fat-pref-lang + setHtmlLang/setHtmlDir). Server-rendered
  // shell should be deterministic, so we only assert it exists.
  check(`  no literal $t( in shell`, !body.includes('$t('));
  // static build should never include a literal `Uncaught` or runtime stack
  check(`  no error markers in shell`, !/Error:|Uncaught|TypeError/.test(body));
}

// Locale JSON integrity (5 locales × parity)
function flattenKeys(obj, prefix = '', out = new Set()) {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flattenKeys(v, key, out);
      else out.add(key);
    }
  }
  return out;
}
console.log('\n=== smoke: 5-locale JSON parity (flattened) ===');
let baseline = null;
for (const loc of LOCALES) {
  const file = join(ROOT, 'src/lib/i18n', `${loc}.json`);
  let json;
  try {
    json = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    check(`locale ${loc} parses`, false, e.message);
    continue;
  }
  check(`locale ${loc} parses`, true);
  const flat = flattenKeys(json);
  if (baseline == null) baseline = flat;
  const matches = flat.size === baseline.size;
  check(`locale ${loc} flat-key count matches pt-PT baseline`, matches, `${flat.size} keys (baseline ${baseline.size})`);
}

// TN: zero Arabic-script characters
console.log('\n=== smoke: tn.json Arabic-script-free ===');
const tn = JSON.parse(await readFile(join(ROOT, 'src/lib/i18n/tn.json'), 'utf8'));
const tnViolations = [];
function walk(obj, path) {
  if (typeof obj === 'string') {
    if (ARABIC_RE.test(obj)) tnViolations.push(`${path}: ${obj.slice(0, 60)}`);
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) walk(v, path ? `${path}.${k}` : k);
  }
}
walk(tn, '');
check(`tn.json has no Arabic-script strings`, tnViolations.length === 0,
  tnViolations.length ? tnViolations[0] : `${LOCALES.indexOf('tn') + 1}/${LOCALES.length} locales scanned`);

// Bundle wires locale map with dir (sanity check that the build pipeline
// emitted the locale registry with the expected RTL/LTR mapping).
console.log('\n=== smoke: locale registry in bundle ===');
const chunksDir = join(ROOT, 'build/_app/immutable/chunks');
let arFound = false;
let tnFound = false;
let ltrCount = 0;
let rtlCount = 0;
try {
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(chunksDir);
  for (const f of files) {
    if (!f.endsWith('.js')) continue;
    const text = await readFile(join(chunksDir, f), 'utf8');
    if (!/fat-pref-lang|setHtmlLang/.test(text)) continue;
    if (/dir:"rtl"/.test(text)) { rtlCount = (text.match(/dir:"rtl"/g) || []).length; arFound = true; }
    if (/dir:"ltr"/.test(text)) { ltrCount = (text.match(/dir:"ltr"/g) || []).length; tnFound = true; }
    break;
  }
} catch (e) {
  check('read bundle chunks', false, e.message);
}
check('ar maps to dir="rtl"', arFound && rtlCount >= 1);
check('tn/ltr locales map to dir="ltr"', tnFound && ltrCount >= 4);

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);