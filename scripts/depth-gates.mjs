#!/usr/bin/env node
/**
 * depth-gates.mjs — quantitative "phase depth" gate runner (task-063).
 *
 * Runs the 5 automatable gates from the phase-depth-gates plan
 * (derived from the task-049 audit) and reports pass/fail per gate.
 * Gates 2, 3, 6, 7, 10 are documented in CHECKLIST_DEPTH_GATES.md as
 * manual checks (they require human judgement, an emulator, axe-core,
 * or Lighthouse — none of which fit a CI script reliably here).
 *
 * USAGE
 *   node scripts/depth-gates.mjs
 *
 * EXIT CODES
 *   0   all gates passed
 *   1   one or more gates failed
 *   2   a hard prerequisite is missing (build dir, preview binary, …)
 *
 * GATES
 *   1  Forbidden placeholders absent in src/
 *      (TODO|FIXME|lorem|em breve|brevemente|em-breve) — excluding
 *      .audit/ and scripts/.
 *   4  Each sub-app has a minimal Dexie seed
 *      (finanças ≥20 tx / ≥5 cat, hábitos ≥5 / ≥14d tracking,
 *       biblioteca ≥10, trabalhos ≥5).
 *   5  i18n parity: every locale (en/tn/fr/ar) has the same set of
 *      flat keys as pt-PT (the canonical source).
 *   8  11/11 production routes serve HTTP 200 from `vite preview`.
 *   9  `npm run check` 0/0 errors AND `npm run build` exits 0.
 *
 * DESIGN
 *   * Self-contained: no third-party deps, only node: builtins.
 *   * Resilient: each gate catches its own errors and reports a
 *     structured result; one failing gate does not abort the others.
 *   * Read-only on the source tree — the only side-effect is starting
 *     and stopping `vite preview` on a free port for Gate 8.
 */
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ────────────────────────────────────────────────────────────────────────
//  result helpers
// ────────────────────────────────────────────────────────────────────────

const ICONS = { pass: '✓', fail: '✗', warn: '⚠' };
const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m',
};
const useColor = process.stdout.isTTY ?? false;
const c = (color, s) => useColor ? `${COLORS[color]}${s}${COLORS.reset}` : s;

/** @type {Array<{ id: number, label: string, status: 'pass'|'fail'|'warn', detail: string, evidence?: any }>} */
const results = [];
const record = (id, label, status, detail, evidence) => {
  results.push({ id, label, status, detail, evidence });
  const icon = ICONS[status] ?? '?';
  const color = status === 'pass' ? 'green' : status === 'fail' ? 'red' : 'yellow';
  const tag = c('bold', `Gate ${id}`);
  console.log(`  ${c(color, icon)} ${tag}  ${label}`);
  if (detail) console.log(`         ${c('dim', detail)}`);
};

// ────────────────────────────────────────────────────────────────────────
//  Gate 1 — forbidden placeholders
// ────────────────────────────────────────────────────────────────────────

function gate1() {
  const label = 'No TODO/FIXME/lorem/em-breve in src/';
  // Two separate matchers:
  //   - TODO/FIXME: screaming-case by convention, with word boundaries
  //     so identifiers like `toDo`/`onTodo` (camelCase task types) are
  //     NOT flagged.
  //   - lorem / em breve / brevemente / em-breve: copy-level strings,
  //     case-insensitive. These never appear in identifiers.
  const reScreaming = /\b(TODO|FIXME)\b/;
  const reCopy = /(lorem|em breve|brevemente|em-breve)/i;
  const excludeDirs = new Set(['.audit', 'scripts', 'node_modules', '.svelte-kit', 'build']);
  const includeExt = new Set(['.svelte', '.ts']);

  /** @type {Array<{ file: string, line: number, match: string, snippet: string }>} */
  const hits = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = relative(ROOT, full);
      const top = rel.split(/[\\/]/)[0];
      if (excludeDirs.has(top)) continue;
      const st = statSync(full);
      if (st.isDirectory()) { walk(full); continue; }
      if (!includeExt.has('.' + entry.split('.').pop())) continue;
      const text = readFileSync(full, 'utf-8');
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip pure comment lines that are obvious section markers
        // (lines that are entirely `// ──…──` decoration).
        if (/^\s*\/\/\s*[─-]+\s*$/.test(line)) continue;
        const mScream = line.match(reScreaming);
        const mCopy = line.match(reCopy);
        const m = mScream ?? mCopy;
        if (m) hits.push({ file: rel, line: i + 1, match: m[0], snippet: line.trim().slice(0, 120) });
      }
    }
  };
  try {
    walk(join(ROOT, 'src'));
    if (hits.length === 0) {
      record(1, label, 'pass', 'scanned src/ — 0 hits');
    } else {
      const preview = hits.slice(0, 5).map(h => `${h.file}:${h.line}  ${h.match}`).join(' | ');
      record(1, label, 'fail', `${hits.length} hit(s): ${preview}${hits.length > 5 ? ' …' : ''}`,
        { total: hits.length, first: hits.slice(0, 20) });
    }
  } catch (err) {
    record(1, label, 'fail', `error: ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────────────────────
//  Gate 4 — Dexie seed minimums
// ────────────────────────────────────────────────────────────────────────

/**
 * Count the number of top-level object literals inside an array
 * expression. Handles two shapes:
 *   1. `export const X = Object.freeze([ ... ])` — direct literal.
 *   2. `export const X = buildFoo()` — count the rows inside the
 *      factory function's `return [ ... ]` (used by bookmarks and
 *      assignments seed modules).
 *
 * Returns the count, or null if no array is found.
 */
function countArrayLiteral(src, exportName) {
  const escaped = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Shape 1: direct literal
  const reLiteral = new RegExp(`export\\s+const\\s+${escaped}[^=]*=\\s*(?:Object\\.freeze\\()?\\s*\\[`);
  const mLiteral = src.match(reLiteral);
  if (mLiteral) return countRowsInArray(src, mLiteral.index + mLiteral[0].length);
  // Shape 2: factory call — find `buildDefaultXxx(` and then its
  // `return [ ... ]`.
  const reFactory = new RegExp(`export\\s+const\\s+${escaped}[^=]*=\\s*(build\\w+)\\s*\\(`);
  const mFactory = src.match(reFactory);
  if (mFactory) {
    const fnName = mFactory[1];
    const fnRe = new RegExp(`function\\s+${fnName}\\b[\\s\\S]*?\\breturn\\s*\\[`);
    const mFn = src.match(fnRe);
    if (mFn) return countRowsInArray(src, mFn.index + mFn[0].length);
  }
  return null;
}

function countRowsInArray(src, startIdx) {
  const tail = src.slice(startIdx);
  const lines = tail.split(/\r?\n/);
  let n = 0, depth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed === '') continue;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '{') {
        if (depth === 0) n++;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth < 0) return n;
      } else if (ch === ']' && depth === 0) {
        return n;
      }
    }
  }
  return n;
}

function gate4() {
  const label = 'Sub-app Dexie seeds hit minimum sizes';
  const targets = [
    { file: 'src/lib/state/financas-seed.ts', export: 'DEFAULT_TRANSACOES', label: 'finanças (transactions)', min: 20 },
    { file: 'src/lib/state/db.ts',             export: 'DEFAULT_CATEGORIAS', label: 'finanças (categories)',  min: 5 },
    { file: 'src/lib/state/habitos-seed.ts',   export: 'DEFAULT_HABITOS_PRO', label: 'hábitos (habits)',      min: 5 },
    { file: 'src/lib/state/bookmarks-seed.ts', export: 'DEFAULT_BOOKMARKS',  label: 'biblioteca (bookmarks)', min: 10 },
    { file: 'src/lib/state/assignments-seed.ts', export: 'DEFAULT_ASSIGNMENTS', label: 'trabalhos (assignments)', min: 5 },
  ];
  const lines = [];
  let allPass = true;
  for (const t of targets) {
    const path = join(ROOT, t.file);
    if (!existsSync(path)) { lines.push(`  ${t.label}: MISSING ${t.file}`); allPass = false; continue; }
    const src = readFileSync(path, 'utf-8');
    const n = countArrayLiteral(src, t.export);
    if (n === null) { lines.push(`  ${t.label}: export ${t.export} not found`); allPass = false; continue; }
    const ok = n >= t.min;
    if (!ok) allPass = false;
    const icon = ok ? c('green', '✓') : c('red', '✗');
    lines.push(`  ${icon} ${t.label}: ${n} (min ${t.min})`);
  }
  // tracking history is a separate signal — habitos-seed.ts ships 14d of
  // history via buildSeedHabitLogs(); confirm the helper exists.
  const habitosSrc = readFileSync(join(ROOT, 'src/lib/state/habitos-seed.ts'), 'utf-8');
  const hasTracking = /buildSeedHabitLogs/i.test(habitosSrc);
  const trackIcon = hasTracking ? c('green', '✓') : c('red', '✗');
  lines.push(`  ${trackIcon} hábitos (14-day tracking): ${hasTracking ? 'helper present' : 'MISSING buildSeedHabitLogs'}`);
  if (!hasTracking) allPass = false;

  record(4, label, allPass ? 'pass' : 'fail', lines.join('\n'));
}

// ────────────────────────────────────────────────────────────────────────
//  Gate 5 — i18n parity (inlined; the standalone parity script does
//  not exist in the tree, so we replicate its check here).
// ────────────────────────────────────────────────────────────────────────

function flatten(obj, prefix = '') {
  const out = [];
  for (const k of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatten(v, path));
    else out.push(path);
  }
  return out;
}

function gate5() {
  const label = 'i18n parity: en/tn/fr/ar match pt-PT';
  const locales = ['pt-PT', 'en', 'tn', 'fr', 'ar'];
  try {
    const ref = JSON.parse(readFileSync(join(ROOT, 'src/lib/i18n/pt-PT.json'), 'utf-8'));
    const refKeys = new Set(flatten(ref));
    const lines = [`  pt-PT (reference): ${refKeys.size} keys`];
    let allPass = true;
    for (const loc of locales.slice(1)) {
      const m = JSON.parse(readFileSync(join(ROOT, `src/lib/i18n/${loc}.json`), 'utf-8'));
      const keys = new Set(flatten(m));
      const missing = [...refKeys].filter(k => !keys.has(k));
      const extra = [...keys].filter(k => !refKeys.has(k));
      const ok = missing.length === 0 && extra.length === 0;
      if (!ok) allPass = false;
      const icon = ok ? c('green', '✓') : c('red', '✗');
      const detail = missing.length
        ? `missing ${missing.length}: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ' …' : ''}`
        : `${keys.size} keys`;
      lines.push(`  ${icon} ${loc}: ${detail}`);
    }
    record(5, label, allPass ? 'pass' : 'fail', lines.join('\n'));
  } catch (err) {
    record(5, label, 'fail', `error: ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────────────────────
//  Gate 8 — 11/11 preview routes return 200
// ────────────────────────────────────────────────────────────────────────

function pickPort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function fetchStatus(url, timeoutMs = 8000, redirects = 0) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      // drain to free socket
      res.resume();
      if ([301, 302, 303, 307, 308].includes(status) && location && redirects < 5) {
        resolve(fetchStatus(new URL(location, url).toString(), timeoutMs, redirects + 1));
      } else {
        resolve(status);
      }
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
  });
}

function stopPreview(preview) {
  try {
    if (process.platform === 'win32' && preview.pid) {
      execFileSync('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      preview.kill('SIGTERM');
    }
  } catch {
    try { preview.kill('SIGTERM'); } catch {}
  }
}

async function gate8() {
  const label = '11/11 production routes serve HTTP 200 from `vite preview`';
  // 11 top-level sub-app routes — the same 11 the depth plan calls out.
  // We use SPA-friendly paths (adapter-static fallback) so every entry
  // hits the index shell regardless of dynamic params.
  const routes = [
    '/',
    '/agente',
    '/biblioteca',
    '/definicoes',
    '/escola',
    '/financas',
    '/habitos',
    '/login',
    '/pt',
    '/splash',
    '/trabalhos',
  ];
  let port;
  try { port = await pickPort(); } catch (err) { record(8, label, 'fail', `cannot pick port: ${err.message}`); return; }

  // Start preview in background. `shell: true` is required on Windows
  // for `npm.cmd` to be spawnable without EINVAL.
  const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: true,
  });

  /** @type {string} */
  let previewLog = '';
  preview.stdout.on('data', (d) => { previewLog += d.toString(); });
  preview.stderr.on('data', (d) => { previewLog += d.toString(); });

  // Wait for preview to become ready — vite preview prints the local URL.
  // The banner uses a unicode arrow like `➜  Local:   http://...`. We
  // also probe the port directly so a slow log flush does not time us out.
  const readyDeadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < readyDeadline) {
    if (preview.exitCode !== null) break;
    if (/Local:\s+http/i.test(previewLog)) { ready = true; break; }
    // HTTP probe — if a request returns ANY status code (even 404 from
    // the SPA fallback), the server is up.
    const probeStatus = await fetchStatus(`http://127.0.0.1:${port}/`, 1500);
    if (probeStatus > 0) { ready = true; break; }
    await new Promise(r => setTimeout(r, 500));
  }
  if (!ready) {
    stopPreview(preview);
    record(8, label, 'fail', `vite preview did not become ready within 90s\n${previewLog.slice(-1200)}`);
    return;
  }

  const baseUrl = `http://127.0.0.1:${port}`;
  const lines = [`  preview listening on ${baseUrl}`];
  let pass = 0;
  for (const path of routes) {
    const url = `${baseUrl}${path}`;
    const status = await fetchStatus(url);
    const ok = status === 200;
    if (ok) pass++;
    const icon = ok ? c('green', '✓') : c('red', '✗');
    lines.push(`  ${icon} ${path.padEnd(14)} ${status}`);
  }
  stopPreview(preview);
  // give it a moment to release the port
  await new Promise(r => setTimeout(r, 200));

  const allOk = pass === routes.length;
  record(8, label, allOk ? 'pass' : 'fail',
    `${pass}/${routes.length} routes returned 200\n${lines.join('\n')}`,
    { pass, total: routes.length });
}

// ────────────────────────────────────────────────────────────────────────
//  Gate 9 — `npm run check` 0/0 + `npm run build` exit 0
// ────────────────────────────────────────────────────────────────────────

function gate9() {
  const label = '`npm run check` clean AND `npm run build` exits 0';
  const lines = [];
  let allPass = true;

  // 9a — svelte-check
  try {
    const out = execFileSync('npm', ['run', 'check'], {
      cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024, shell: true,
    });
    // svelte-check reports "0 errors and 0 warnings" on success.
    const clean = /0 errors? and 0 warnings?/i.test(out);
    if (clean) {
      lines.push(`  ${c('green', '✓')} npm run check: 0 errors / 0 warnings`);
    } else {
      allPass = false;
      const tail = out.split(/\r?\n/).slice(-10).join('\n');
      lines.push(`  ${c('red', '✗')} npm run check: not clean\n${tail}`);
    }
  } catch (err) {
    allPass = false;
    const status = err.status ?? '?';
    const stderr = (err.stderr ?? '').toString();
    const stdout = (err.stdout ?? '').toString();
    const blob = (stderr || stdout).split(/\r?\n/).slice(-20).join('\n');
    lines.push(`  ${c('red', '✗')} npm run check: exit ${status}\n${blob || '(no output captured)'}`);
  }

  // 9b — vite build
  try {
    const out = execFileSync('npm', ['run', 'build'], {
      cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024, shell: true,
    });
    lines.push(`  ${c('green', '✓')} npm run build: exit 0`);
  } catch (err) {
    allPass = false;
    const status = err.status ?? '?';
    const stderr = (err.stderr ?? '').toString();
    const stdout = (err.stdout ?? '').toString();
    const blob = (stderr || stdout).split(/\r?\n/).slice(-20).join('\n');
    lines.push(`  ${c('red', '✗')} npm run build: exit ${status}\n${blob || '(no output captured)'}`);
  }

  record(9, label, allPass ? 'pass' : 'fail', lines.join('\n'));
}

// ────────────────────────────────────────────────────────────────────────
//  main
// ────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(c('bold', '\nPresuntinho — phase-depth gates (task-063)\n'));
  console.log(c('dim', `root: ${ROOT}\n`));

  // Synchronous gates
  gate1();
  gate4();
  gate5();
  gate9();

  // Async gate (spawns vite preview)
  await gate8();

  // Summary
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  console.log('');
  console.log(c('bold', `Summary: ${passed} pass, ${failed} fail (of ${results.length} automatable gates)`));
  console.log(c('dim', 'Manual gates (2, 3, 6, 7, 10) are documented in CHECKLIST_DEPTH_GATES.md'));

  if (failed > 0) {
    console.log(c('red', '\nFAIL — see details above'));
    process.exit(1);
  }
  console.log(c('green', '\nOK — all automatable gates passed'));
  process.exit(0);
}

main().catch((err) => {
  console.error('depth-gates: fatal error:', err);
  process.exit(2);
});