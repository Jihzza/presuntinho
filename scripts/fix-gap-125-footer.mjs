import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const LOC_DIR = 'C:/Users/rafaa/Documents/GitHub/presuntinho/src/lib/i18n';

const labels = {
  'pt-PT': {biblioteca: 'Hub · Biblioteca', trabalhos: 'Hub · Trabalhos'},
  en: {biblioteca: 'Hub · Library', trabalhos: 'Hub · Work'},
  tn: {biblioteca: 'Hub · El Maktaba', trabalhos: 'Hub · El A3mal'},
  fr: {biblioteca: 'Hub · Bibliothèque', trabalhos: 'Hub · Travaux'},
  ar: {biblioteca: 'المحور · المكتبة', trabalhos: 'المحور · الأعمال'},
};

for (const loc of Object.keys(labels)) {
  const fp = join(LOC_DIR, `${loc}.json`);
  let content = readFileSync(fp, 'utf-8');
  for (const sub of ['biblioteca', 'trabalhos']) {
    const key = `${sub}.footer.position`;
    if (content.includes(`"${key}"`)) {
      console.log(`  ${loc}: ${key} already exists, skip`);
      continue;
    }
    const label = labels[loc][sub];
    // Insert new key after `${sub}.footer.subapp` line
    const re = new RegExp(`(  "${sub}\\.footer\\.subapp":\\s*"[^"]*",\\n)`);
    const m = content.match(re);
    if (!m) {
      console.log(`  ${loc}: ${sub}.footer.subapp not found, FAIL`);
      continue;
    }
    content = content.replace(m[0], `${m[0]}  "${key}": "${label}",\n`);
    console.log(`  ${loc}: inserted ${key} = ${label}`);
  }
  writeFileSync(fp, content, 'utf-8');
}

// Validate JSON
for (const loc of Object.keys(labels)) {
  const fp = join(LOC_DIR, `${loc}.json`);
  const d = JSON.parse(readFileSync(fp, 'utf-8'));
  for (const sub of ['biblioteca', 'trabalhos']) {
    const key = `${sub}.footer.position`;
    console.log(`  OK ${loc}/${key} = ${JSON.stringify(d[key])}`);
  }
}