const fs = require('fs');
const path = require('path');
const dir = 'src/lib/i18n';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
const data = {};
for (const f of files) {
  data[f] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).translation || JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
}
const all = {};
for (const [fn, d] of Object.entries(data)) {
  for (const k of Object.keys(d)) (all[k] ||= []).push(fn);
}
const orphans = [];
for (const [k, locs] of Object.entries(all)) {
  if (locs.length < files.length) orphans.push({k, locs});
}
console.log('files:', files);
console.log('total unique keys:', Object.keys(all).length);
console.log('orphans (keys not in all locales):');
for (const o of orphans) console.log('  ', o.k, '→', o.locs.join(','));