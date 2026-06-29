const fs = require('fs');
const d = JSON.parse(fs.readFileSync('src/lib/i18n/pt-PT.json', 'utf8'));
const en = JSON.parse(fs.readFileSync('src/lib/i18n/en.json', 'utf8'));
const fr = JSON.parse(fs.readFileSync('src/lib/i18n/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('src/lib/i18n/ar.json', 'utf8'));
const tn = JSON.parse(fs.readFileSync('src/lib/i18n/tn.json', 'utf8'));

const titles = Object.keys(d).filter(k => k.startsWith('routes.escola.curso.') && k.endsWith('.title'));
const descs = Object.keys(d).filter(k => k.startsWith('routes.escola.curso.') && k.endsWith('.description'));
console.log('pt-PT titles:', titles.length);
console.log('pt-PT descriptions:', descs.length);
titles.forEach(k => {
  const slug = k.split('.')[3];
  const hasIn = ['en','fr','ar','tn'].map(l => {
    const other = {en,fr,ar,tn}[l];
    return k.replace('routes.escola.curso.', `routes.escola.curso.`) in other ? '✓' : '✗';
  }).join('');
  console.log(`  ${hasIn} ${slug}  en:${en[`routes.escola.curso.${slug}.title`] || '✗'}`);
});