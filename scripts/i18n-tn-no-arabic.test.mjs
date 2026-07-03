#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const tnPath = join(ROOT, 'src', 'lib', 'i18n', 'tn.json');
const data = JSON.parse(readFileSync(tnPath, 'utf8'));
const STRICT = process.argv.includes('--strict');
const arabicScript = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
const failures = [];

function walk(value, path = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      walk(child, path ? `${path}.${key}` : key);
    }
    return;
  }
  if (typeof value === 'string' && arabicScript.test(value)) {
    failures.push([path, value]);
  }
}
walk(data);

if (failures.length) {
  const level = STRICT ? 'FAIL' : 'WARN';
  console.error(`${level} tn.json contains Arabic-script characters in ${failures.length} key(s):`);
  for (const [key, value] of failures.slice(0, 50)) {
    console.error(`  ${key}: ${JSON.stringify(value)}`);
  }
  process.exit(STRICT ? 1 : 0);
}

console.log(`OK tn.json — ${Object.keys(data).length} top-level entries, zero Arabic-script characters.`);
