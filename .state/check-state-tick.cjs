const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = 'C:/Users/rafaa/Documents/GitHub/presuntinho';

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// 1. i18n pt-PT keys
const pt = readJSON(path.join(ROOT, 'src/lib/i18n/pt-PT.json'));
const ctaKeys = ['agente.cta.o_que_falta', 'agente.cta.resumo_financeiro', 'agente.cta.habitos', 'agente.cta.progresso'];
console.log('=== i18n pt-PT ===');
console.log('total keys:', Object.keys(pt).length);
ctaKeys.forEach(k => console.log(k, '=>', k in pt ? 'PRESENT' : 'MISSING'));

// 2. mdq2 quiz
const mdq2 = readJSON(path.join(ROOT, 'static/quizzes/mdq2.json'));
console.log('\n=== mdq2 quiz ===');
console.log('id:', mdq2.id);
console.log('title:', mdq2.title);
console.log('questions:', mdq2.questions.length);
const valid = mdq2.questions.every(q => Array.isArray(q.opts) && q.opts.length === 4 && typeof q.a === 'number' && q.a >= 0 && q.a < 4);
console.log('all questions valid:', valid);

// 3. marketing-digital lessons
console.log('\n=== marketing-digital lessons ===');
const mdDir = path.join(ROOT, 'static/lessons/marketing-digital');
const files = fs.readdirSync(mdDir).filter(f => f.endsWith('.json')).sort();
files.forEach(f => {
  const d = readJSON(path.join(mdDir, f));
  console.log(f, '| id:', d.id, '| title:', d.title, '| sections:', d.sections ? d.sections.length : 0, '| courseSlug:', d.courseSlug, '| lessonNumber:', d.lessonNumber);
});

// 4. curso/[slug] entry for marketing-digital
console.log('\n=== curso/[slug] marketing-digital ===');
const curSlug = fs.readFileSync(path.join(ROOT, 'src/routes/escola/curso/[slug]/+page.svelte'), 'utf8');
const mdMatch = curSlug.match(/'marketing-digital':\s*\{[\s\S]*?\}\s*\},/);
if (mdMatch) {
  console.log(mdMatch[0].split('\n').slice(0, 20).join('\n'));
}

// 5. check escola marketing-digital in COURSES array
console.log('\n=== escola COURSES array marketing-digital ===');
const escolaPage = fs.readFileSync(path.join(ROOT, 'src/routes/escola/+page.svelte'), 'utf8');
const mdCourse = escolaPage.match(/slug:\s*'marketing-digital'[\s\S]{0,800}?\},/);
if (mdCourse) console.log(mdCourse[0].substring(0, 600));

// 6. confirm gap-068 was about agent cta and last commit gap-064 is the head
console.log('\n=== last commits ===');
console.log(execSync('git -C ' + ROOT + ' log --oneline -5', { encoding: 'utf8' }));

// 7. i18n parity check
console.log('\n=== i18n parity ===');
['pt-PT', 'en', 'fr', 'ar', 'tn'].forEach(l => {
  const d = readJSON(path.join(ROOT, 'src/lib/i18n/' + l + '.json'));
  console.log(l + ':', Object.keys(d).length, 'keys');
});

// 8. status of working tree
console.log('\n=== git status ===');
console.log(execSync('git -C ' + ROOT + ' status -sb', { encoding: 'utf8' }));
