#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const I18N = join(ROOT, 'src', 'lib', 'i18n');
const LOCALES = ['pt-PT', 'en', 'fr', 'ar', 'tn'];

function load(locale) {
  try {
    return JSON.parse(readFileSync(join(I18N, `${locale}.json`), 'utf8'));
  } catch (err) {
    console.error(`FAIL ${locale}: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return {};
  }
}

function flatten(value, prefix = '', out = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out[prefix] = value;
  }
  return out;
}

const raw = Object.fromEntries(LOCALES.map((locale) => [locale, load(locale)]));
const data = Object.fromEntries(LOCALES.map((locale) => [locale, flatten(raw[locale])]));
const canonical = Object.keys(data['pt-PT']).sort();
const canonicalSet = new Set(canonical);
let failures = 0;

for (const locale of LOCALES) {
  const keys = Object.keys(data[locale]).sort();
  const keySet = new Set(keys);
  const missing = canonical.filter((key) => !keySet.has(key));
  const extra = keys.filter((key) => !canonicalSet.has(key));
  if (missing.length || extra.length) {
    failures += missing.length + extra.length;
    console.error(`FAIL ${locale}: ${missing.length} missing, ${extra.length} extra`);
    for (const key of missing.slice(0, 50)) console.error(`  missing ${key}`);
    for (const key of extra.slice(0, 50)) console.error(`  extra   ${key}`);
  }
}

if (failures) {
  process.exit(1);
}

console.log(`OK i18n parity — ${LOCALES.length} locales, ${canonical.length} flattened keys each.`);
