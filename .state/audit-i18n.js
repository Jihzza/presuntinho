const fs = require('fs');
const files = ['en', 'pt-PT', 'fr', 'tn', 'ar'];
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(`src/lib/i18n/${f}.json`, 'utf8'));
  const w = d.write || {};
  console.log(`==${f}==`);
  console.log('write keys:', Object.keys(w).sort());
  console.log('head keys:', w.head ? Object.keys(w.head).sort() : 'NO head');
  if (w.head && w.head.title) console.log('head.title:', w.head.title);
  // Look for relevant content
  const relevantKeys = Object.keys(w).filter(k => /head|nav|toolbar|button|empty|loading|search|new|create/i.test(k));
  console.log('relevant:', relevantKeys);
}
