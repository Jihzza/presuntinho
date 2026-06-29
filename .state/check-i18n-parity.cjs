const fs = require('fs');
const files = ['pt-PT', 'en', 'fr', 'ar', 'tn'].map(l => ({
  l,
  d: JSON.parse(fs.readFileSync(`src/lib/i18n/${l}.json`, 'utf8'))
}));
const allKeys = new Set();
files.forEach(f => Object.keys(f.d).forEach(k => allKeys.add(k)));
const missing = {};
files.forEach(f => missing[f.l] = [...allKeys].filter(k => !(k in f.d)));
files.forEach(f => console.log(`${f.l}: ${Object.keys(f.d).length} keys, ${missing[f.l].length} missing`));
console.log('total unique keys:', allKeys.size);
// find keys only in 1 locale (probably auto-injected PT fallbacks)
const presenceCount = {};
[...allKeys].forEach(k => {
  presenceCount[k] = files.filter(f => k in f.d).length;
});
const onlyIn1 = [...allKeys].filter(k => presenceCount[k] === 1);
const missingIn4plus = [...allKeys].filter(k => presenceCount[k] < 5);
console.log('\nkeys present in only 1 locale (likely fallback-only):', onlyIn1.length);
onlyIn1.slice(0, 30).forEach(k => {
  const where = files.filter(f => k in f.d).map(f => f.l).join(',');
  console.log(`  [${where}] ${k}`);
});
console.log('\nkeys missing in 4+ locales:', missingIn4plus.length);
missingIn4plus.slice(0, 30).forEach(k => {
  const have = files.filter(f => k in f.d).map(f => f.l).join(',');
  const missingLocales = files.filter(f => !(k in f.d)).map(f => f.l).join(',');
  console.log(`  present=[${have}] missing=[${missingLocales}] ${k}`);
});