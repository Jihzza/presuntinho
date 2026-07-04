#!/usr/bin/env node
// scripts/i18n-scan.mjs
//
// Find user-facing text in src/ .svelte files that is NOT wrapped in
// svelte-i18n's $t(...) call. Exits 0 when zero hardcoded strings remain
// (the success criterion of the i18n sweep). Exits 1 otherwise, with a
// per-file, per-line report.
//
// Strategy:
//   1. Strip <script>, <style>, and HTML comments.
//   2. Split the remaining template into "segments" alternating between
//      raw text and Svelte expressions ({...}). Only raw-text segments
//      are scanned. A segment that is entirely a single $t(...) call is
//      considered i18n'd and ignored.
//   3. For each raw-text segment, strip attribute names + their values
//      so we only look at the actual displayed text.
//   4. Flag any text containing a letter that is not in the allowlist.
//
// Usage:
//   node scripts/i18n-scan.mjs                # strict: exit 1 on hits
//   node scripts/i18n-scan.mjs --report-only  # print report, exit 0

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..', '..');
const ROOT = __dirname;
const SRC = join(ROOT, 'src');
const REPORT_ONLY = process.argv.includes('--report-only');

// Patterns that NEVER count as hardcoded user-facing strings.
const ALLOWLIST_REGEXES = [
  /^[\s\W]+$/u,                                          // pure whitespace/punct
  /^\d+(\.\d+)?(px|rem|em|%|vh|vw|s|ms|deg)?$/iu,       // numbers/units
  /^[\d\s\-–—/]+$/u,                                    // numeric ranges
  /^https?:\/\//iu,                                     // URLs
  /^\/[a-z0-9_\-./]*$/iu,                               // route paths
  /^[A-Z][A-Z0-9_-]{0,40}$/u,                           // SCREAMING_CASE technical tokens
  /^[a-z][a-z0-9_-]{0,40}$/iu,                          // lowercase technical tokens
  /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+$/u,          // emoji-only segments
];

const ALLOWLIST_LITERALS = new Set([
  'on', 'off', 'true', 'false', 'null', 'undefined', 'ok',
]);

// Files exempt from the scan entirely. Document each entry.
const EXEMPT_FILES = new Set([
  // HubCard, BadgeCard, etc. — they receive text via props, so their
  // template regions contain only {propName} expressions. They are
  // expected to render through other components that already i18n
  // their props. Listed for clarity; the scanner would skip them
  // anyway because their template contains no literal text.

  // Pedagogical Portuguese content: these pages TEACH European
  // Portuguese, so their example sentences/vocabulary are intentionally
  // Portuguese in every UI locale (the teaching language is the
  // content, not chrome). UI labels around them still use $t().
  'src/routes/pt/+page.svelte',
  'src/routes/case/+page.svelte',
  'src/routes/escola/curso/portugues/+page.svelte',
]);

// -------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (full.endsWith('.svelte')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip <script>, <style>, and HTML comments from the source. The
 * result is the template region, with curly braces preserved.
 */
function templateOf(source) {
  let s = source.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  return s;
}

/**
 * Split the template into alternating [type, content] tokens.
 *   type === 'expr' for {...}  (Svelte expressions — skipped)
 *   type === 'text' for raw markup/text between expressions
 * Brace counting respects strings, regexes, and template literals so
 * that `{"}"}` doesn't split in the middle.
 */
function tokenize(template) {
  const tokens = [];
  let i = 0;
  let buf = '';
  while (i < template.length) {
    const ch = template[i];
    if (ch === '{') {
      if (buf) { tokens.push(['text', buf]); buf = ''; }
      // Scan the expression with brace tracking
      let j = i + 1;
      let depth = 1;
      while (j < template.length && depth > 0) {
        const c = template[j];
        // Skip over strings/regexes/templates
        if (c === '"' || c === "'" || c === '`') {
          const quote = c;
          j++;
          while (j < template.length && template[j] !== quote) {
            if (template[j] === '\\') j++;
            j++;
          }
          j++;
          continue;
        }
        if (c === '{') depth++;
        else if (c === '}') depth--;
        j++;
      }
      tokens.push(['expr', template.slice(i, j)]);
      i = j;
    } else {
      buf += ch;
      i++;
    }
  }
  if (buf) tokens.push(['text', buf]);
  return tokens;
}

/**
 * Walk a text segment and yield (lineOffset, snippet) pairs for any
 * run of user-facing copy. We track the running line number across
 * the whole template.
 */
function* scanText(text, lineBase) {
  let line = lineBase;
  // Strip attribute assignments key="..." or key='...' so we don't
  // double-count attribute strings (they're scanned separately).
  const cleaned = text
    .replace(/\b[a-zA-Z_-][a-zA-Z0-9_-]*\s*=\s*"[^"]*"/g, '')
    .replace(/\b[a-zA-Z_-][a-zA-Z0-9_-]*\s*=\s*'[^']*'/g, '');

  // Match text between tags: > ... <. Inside each match, strip pure
  // whitespace and check what remains.
  const tagRe = />([^<>]*?)</g;
  let m;
  while ((m = tagRe.exec(cleaned)) !== null) {
    const raw = m[1];
    const newlines = (raw.match(/\n/g) || []).length;
    const startLine = line;
    line += newlines;
    // Collapse whitespace for the actual text check
    const stripped = raw.replace(/\s+/g, ' ').trim();
    if (!stripped) continue;
    // If it contains any letter or emoji, it's user-facing
    if (!/[\p{L}\p{Extended_Pictographic}]/u.test(stripped)) continue;
    yield [startLine, stripped];
  }
}

/**
 * Scan attribute values for UI slots: placeholder, title, alt, aria-*.
 */
function* scanAttributes(text, lineBase) {
  const UI_ATTRS = ['placeholder', 'title', 'alt', 'aria-label', 'aria-placeholder', 'aria-describedby'];
  const attrRe = new RegExp(`\\b(${UI_ATTRS.join('|')})\\s*=\\s*"([^"]*)"`, 'gi');
  let line = lineBase;
  let m;
  // Walk character by character so newlines in multiline attrs are tracked
  let i = 0;
  while ((m = attrRe.exec(text)) !== null) {
    // Count newlines from the start of this chunk to the match position
    const chunk = text.slice(i, m.index);
    line += (chunk.match(/\n/g) || []).length;
    i = m.index + m[0].length;
    const value = m[2];
    if (!value) continue;
    if (!/[\p{L}\p{Extended_Pictographic}]/u.test(value)) continue;
    yield [line, m[1].toLowerCase(), value];
  }
}

function isAllowed(s) {
  if (!s) return true;
  if (ALLOWLIST_LITERALS.has(s)) return true;
  for (const re of ALLOWLIST_REGEXES) {
    if (re.test(s)) return true;
  }
  return false;
}

function isExempt(relPath) {
  return EXEMPT_FILES.has(relPath);
}

// -------------------------------------------------------------------

const files = walk(SRC);
const findings = [];

for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/');
  if (isExempt(rel)) continue;
  const src = readFileSync(file, 'utf8');
  const tpl = templateOf(src);

  let lineBase = 1;
  for (const [type, content] of tokenize(tpl)) {
    if (type === 'text') {
      for (const [line, text] of scanText(content, lineBase)) {
        if (isAllowed(text)) continue;
        findings.push({ file: rel, line, kind: 'text', text });
      }
      for (const [line, attr, value] of scanAttributes(content, lineBase)) {
        if (isAllowed(value)) continue;
        findings.push({ file: rel, line, kind: 'attr', attr, text: value });
      }
    }
    // Keep lineBase in sync with newlines, even for expressions
    lineBase += (content.match(/\n/g) || []).length;
  }
}

// Group findings by file.
const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}

const totalFiles = byFile.size;
const totalHits = findings.length;

if (totalHits === 0) {
  console.log(`OK  src/**/*.svelte — zero hardcoded user-facing strings. (${files.length} files scanned)`);
  process.exit(REPORT_ONLY ? 0 : 0);
}

console.log(`FAIL  ${totalHits} hardcoded string(s) across ${totalFiles} file(s):\n`);
for (const [file, items] of [...byFile.entries()].sort()) {
  console.log(`  ${file}`);
  for (const it of items.slice(0, 50)) {
    const tag = it.kind === 'attr' ? `[${it.attr}]` : '       ';
    const snippet = it.text.length > 90 ? it.text.slice(0, 87) + '...' : it.text;
    console.log(`    L${String(it.line).padStart(4)}  ${tag}  ${JSON.stringify(snippet)}`);
  }
  if (items.length > 50) {
    console.log(`    ... (${items.length - 50} more in this file)`);
  }
}

process.exit(REPORT_ONLY ? 0 : 1);