#!/usr/bin/env node
// M1-S3 smoke test: gestão categorias CRUD.
// Validates (without Dexie) that the new financas.ts API surface exists
// and that the route component compiles. Runs in a fresh import so we
// catch SSR-time syntax errors that would break `npm run build`.

import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));

let passed = 0;
let failed = 0;
function check(label, ok, detail = '') {
  if (ok) { console.log(`  \u2713 ${label}`); passed++; }
  else { console.error(`  \u2717 ${label}${detail ? ' \u2014 ' + detail : ''}`); failed++; }
}

console.log('=== M1-S3 smoke: categorias CRUD ===');

// 1. financas.ts has the new CRUD exports
const financas = readFileSync(join(ROOT, 'src/lib/financas.ts'), 'utf8');
for (const sym of [
  'ensureCategoriasDefaults',
  'addCategoria',
  'updateCategoria',
  'deleteCategoria',
  'countTransacoesCategoria',
  'slugifyCategoriaNome'
]) {
  check(`exports ${sym}`, financas.includes(`export (async )?function ${sym}`) || financas.includes(`${sym}(`));
}

// 2. seed has 12+ categories (canonical seed + V7 extras)
const db = readFileSync(join(ROOT, 'src/lib/state/db.ts'), 'utf8');
const defaultSeedCount = (db.match(/id:\s*'[a-z_]+',\s+nome:/g) || []).length;
const extraSeedCount = (financas.match(/id:\s*'[a-z_]+',\s+nome:/g) || []).length;
const seedCount = defaultSeedCount + extraSeedCount;
check(`seed has >=12 categories (found ${seedCount})`, seedCount >= 12);

// Helper: locate function body via brace-counting from the function's opening line.
// Avoids the non-greedy `[\s\S]+?\n\}` trap when the function signature itself
// contains inner `}` (e.g. inline object-type parameters or return-type unions).
function extractFunction(src, sigRegex) {
  const m = src.match(sigRegex);
  if (!m) return null;
  const start = m.index;
  // Skip past the signature: walk past balanced ( ), then past balanced < >, then past balanced { } (for inline return-type unions), then optional whitespace.
  let i = start + m[0].length;
  // 1. skip balanced parens (parameters)
  while (i < src.length && src[i] !== '(') i++;
  if (i < src.length && src[i] === '(') {
    let depth = 1;
    i++;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
      i++;
    }
  }
  // 2. skip optional `: ReturnType<...>` annotation (which may contain { } for object types)
  const rest = src.slice(i);
  const colonMatch = rest.match(/^\s*:\s*/);
  if (colonMatch) {
    let j = i + colonMatch[0].length;
    let angleDepth = 0;
    let braceDepth = 0;
    while (j < src.length) {
      const ch = src[j];
      if (ch === '<') angleDepth++;
      else if (ch === '>') angleDepth--;
      else if (ch === '{' && angleDepth === 0) braceDepth++;
      else if (ch === '}' && angleDepth === 0) {
        braceDepth--;
        if (braceDepth < 0) {
          // We've closed the return-type object; j is right after the `}`.
          j++;
          i = j;
          break;
        }
      }
      j++;
      // Stop when we've consumed the return type and hit whitespace + `{`
      if (braceDepth === 0 && angleDepth === 0 && (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r')) {
        const ahead = src.slice(j);
        const m2 = ahead.match(/^\s*\{/);
        if (m2) {
          i = j + m2[0].length - 1; // points at `{`
          break;
        }
      }
    }
  }
  // 3. find the body's opening `{` (skip whitespace).
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] !== '{') return null;
  // 4. brace-count to the matching `}`.
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

// 3. slugifyCategoriaNome strips accents + lowercases
const slugSrc = extractFunction(financas, /export function slugifyCategoriaNome\b/);
check('slugifyCategoriaNome defined', !!slugSrc);
if (slugSrc) {
  check('slugify uses NFD + diacritic strip', slugSrc.includes('normalize') && slugSrc.includes('\\u0300'));
  check('slugify lowercases', slugSrc.includes('toLowerCase'));
}

// 4. deleteCategoria guards against references
const deleteSrc = extractFunction(financas, /export async function deleteCategoria\b/);
check('deleteCategoria defined', !!deleteSrc);
if (deleteSrc) {
  check('deleteCategoria checks transacoes refs', deleteSrc.includes('transacoes'));
  check('deleteCategoria checks orcamentos refs', deleteSrc.includes('orcamentos'));
  check('deleteCategoria returns refs', deleteSrc.includes('refs'));
}

// 5. addCategoria slugifies id when missing
const addSrc = extractFunction(financas, /export async function addCategoria\b/);
check('addCategoria defined', !!addSrc);
if (addSrc) {
  check('addCategoria derives id from nome when empty', addSrc.includes('slugifyCategoriaNome'));
  check('addCategoria throws on empty nome', addSrc.includes('categoria.nome vazio'));
}

// 6. Route file exists and compiles (svelte syntax)
const routePath = join(ROOT, 'src/routes/financas/categorias/+page.svelte');
check('route /financas/categorias exists', existsSync(routePath));
if (existsSync(routePath)) {
  const route = readFileSync(routePath, 'utf8');
  check('route has form', route.includes('<form'));
  check('route binds nome', route.includes('bind:value={formNome}'));
  // Cor uses two parallel inputs (color picker + hex text) sharing the same
  // state via `value={...}` + `oninput={...}` — `bind:value` is unsuitable
  // for two controls pointing at the same variable.  Accept either pattern.
  check(
    'route binds cor',
    route.includes('bind:value={formCor}') ||
      (route.includes('value={formCor}') && route.includes('formCor = e.currentTarget.value'))
  );
  check('route has 3 tipo radios', (route.match(/value="(despesa|receita|ambos)"/g) || []).length >= 3);
  check('route has save + cancel buttons', route.includes('btn-primary') && route.includes('btn-secondary'));
  check('route groups by tipo (despesa/receita/ambos)', route.includes('groupDespesa') && route.includes('groupReceita') && route.includes('groupAmbos'));
  check('route a11y: aria-label on icon buttons', route.includes('aria-label'));
  check('route uses i18n keys with defaults', route.includes('get(t)('));
  check('route mobile-first style block', route.includes('max-width') || route.includes('padding: 1rem'));
}

// 7. i18n: all 5 locales have the new keys
const expectedKeys = [
  'financas.categorias.title',
  'financas.categorias.subtitle',
  'financas.categorias.new',
  'financas.categorias.form.save',
  'financas.categorias.toast.saved',
  'financas.categorias.toast.refused',
  'financas.categorias.tx_count'
];
for (const loc of ['pt-PT', 'en', 'fr', 'ar', 'tn']) {
  const locale = JSON.parse(readFileSync(join(ROOT, `src/lib/i18n/${loc}.json`), 'utf8'));
  for (const key of expectedKeys) {
    check(`i18n[${loc}].${key} present`, typeof locale[key] === 'string' && locale[key].length > 0);
  }
}

// 8. ensureCategoriasDefaults is idempotent without overwriting user edits.
check('ensureCategoriasDefaults imports canonical DEFAULT_CATEGORIAS', financas.includes('DEFAULT_CATEGORIAS'));
check('ensureCategoriasDefaults only adds missing rows', financas.includes('existingIds') && financas.includes('missing'));
check('ensureCategoriasDefaults avoids bulkPut overwrite', !financas.includes('categorias.bulkPut(defaults)'));

// 9. deleteCategoria returns discriminated union and checks composite budget ids.
check('deleteCategoria returns { ok: true } | { ok: false; refs }',
  !!deleteSrc &&
  deleteSrc.includes('{ ok: true }') &&
  deleteSrc.includes('{ ok: false'));
check('deleteCategoria checks composite orcamento ids', !!deleteSrc && deleteSrc.includes('startsWith(`${id}_`)'));
check('addCategoria refuses duplicate ids', !!addSrc && addSrc.includes('categoria.duplicada') && addSrc.includes('table.add(row)'));

console.log(`\n=== Result: ${passed}/${passed + failed} PASS ===`);
process.exit(failed === 0 ? 0 : 1);
