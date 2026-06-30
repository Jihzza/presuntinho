import { readFileSync } from 'fs';
const files = ['en', 'pt-PT', 'fr', 'tn', 'ar'];
for (const f of files) {
  const d = JSON.parse(readFileSync(`src/lib/i18n/${f}.json`, 'utf8'));
  const w = d.write || {};
  console.log(`==${f}==`);
  console.log('write keys:', Object.keys(w).sort());
  if (w.head) console.log('head:', JSON.stringify(w.head));
  // Show all flat keys with 'head' in them
  for (const k of Object.keys(w)) {
    if (k.includes('head') || k.includes('title')) {
      console.log(`  ${k} =`, JSON.stringify(w[k]).substring(0,80));
    }
  }
}
