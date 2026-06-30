// watchdog-tick-34 audit
const fs = require('fs');
const path = require('path');
const repo = 'C:/Users/rafaa/Documents/GitHub/presuntinho';

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

const locales = ['pt-PT', 'en', 'tn', 'fr', 'ar'];
const data = Object.fromEntries(locales.map(l => [l, readJSON(path.join(repo, 'src/lib/i18n/' + l + '.json'))]));
const baseKeys = new Set(Object.keys(data['pt-PT']));
console.log('--- i18n parity ---');
console.log('pt-PT keys:', baseKeys.size);
for (const l of locales.slice(1)) {
  const ks = new Set(Object.keys(data[l]));
  const missing = [...baseKeys].filter(k => !ks.has(k));
  const extra = [...ks].filter(k => !baseKeys.has(k));
  console.log(`${l}: ${ks.size} keys | missing ${missing.length} | extra ${extra.length}`);
  if (missing.length) console.log('  MISS:', missing.slice(0, 8).join(','));
  if (extra.length) console.log('  EXTRA:', extra.slice(0, 5).join(','));
}
for (const l of locales) {
  const empties = Object.entries(data[l]).filter(([k, v]) => !v || !String(v).trim()).map(([k]) => k);
  if (empties.length) console.log(`${l}: ${empties.length} EMPTY`, empties.slice(0, 5).join(','));
}

console.log('\n--- lesson body audit ---');
const lessonDirs = fs.readdirSync(path.join(repo, 'static/lessons'));
let ptOnly = 0, withI18n = 0, totalSections = 0;
for (const d of lessonDirs) {
  const dir = path.join(repo, 'static/lessons', d);
  if (!fs.statSync(dir).isDirectory()) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'course.json');
  for (const f of files) {
    const j = readJSON(path.join(dir, f));
    const secs = j.sections || [];
    totalSections += secs.length;
    if (secs.length) {
      if (secs[0].i18n) withI18n++; else ptOnly++;
    }
  }
}
console.log(`courses: ${lessonDirs.length}, sections total: ${totalSections}, pt-only sections: ${ptOnly}, with i18n: ${withI18n}`);

console.log('\n--- orphan check ---');
const orphan = path.join(repo, 'static/lessons/estrategia-corporativa-portfolio');
if (fs.existsSync(orphan)) {
  const files = fs.readdirSync(orphan);
  console.log('ORPHAN exists:', orphan, '| files:', files.length, '|', files.join(','));
  const { execSync } = require('child_process');
  try {
    const out = execSync(`grep -rln "estrategia-corporativa-portfolio" "${repo}/src" "${repo}/static" 2>/dev/null || true`).toString();
    console.log('  src/static refs:', out.trim() || '(none)');
  } catch (e) { console.log('  grep error:', e.message.slice(0, 100)); }
} else {
  console.log('no orphan');
}

console.log('\n--- CATALOGUE ---');
const escola = fs.readFileSync(path.join(repo, 'src/routes/escola/+page.svelte'), 'utf8');
const m = escola.match(/slug:\s*'[^']+'/g) || [];
console.log('CATALOGUE slugs:', m.length);
const lessonDirsSet = new Set(fs.readdirSync(path.join(repo, 'static/lessons')));
console.log('lesson dirs:', lessonDirsSet.size);
const noCourseJson = [...lessonDirsSet].filter(d => !fs.existsSync(path.join(repo, 'static/lessons', d, 'course.json')));
console.log('lesson dirs without course.json:', noCourseJson.length, noCourseJson.slice(0, 10).join(','));