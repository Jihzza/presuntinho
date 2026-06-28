// Quick LH JSON inspector — single-shot, no return-at-top-level surprises.
const fs = require('fs');
const path = require('path');
const file = process.argv[2];
if (!file) { console.error('usage: node inspect-lh.js <lighthouse.json>'); process.exit(1); }
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const c = j.categories && j.categories.accessibility;
if (!c) { console.log('NO accessibility category'); process.exit(0); }
const pct = Math.round((c.score || 0) * 100);
const audits = j.audits || {};
const fails = Object.entries(audits).filter(([k, v]) => {
  if (v.score === null || v.score === undefined) return false;
  if (v.scoreDisplayMode === 'manual') return false;
  if (v.scoreDisplayMode === 'notApplicable') return false;
  if (v.scoreDisplayMode === 'informative') return false;
  return v.score < 1;
});
console.log(`score=${c.score} (${pct}%)`);
console.log(`fails=${fails.length}`);
fails.forEach(([k, v]) => {
  console.log(`  - ${k} | ${(v.title || '').slice(0, 70)} | score=${v.score}`);
});
// Also surface the manual checks that were *not* run (informative/manual)
const manual = Object.entries(audits).filter(([, v]) => v.scoreDisplayMode === 'manual').length;
const na = Object.entries(audits).filter(([, v]) => v.scoreDisplayMode === 'notApplicable').length;
console.log(`manual=${manual} notApplicable=${na}`);