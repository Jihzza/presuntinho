// Validate JSON files for gestao-conflitos deliverable
import fs from 'node:fs';
import path from 'node:path';

const files = [
  'src/lib/i18n/pt-PT.json',
  'src/lib/i18n/en.json',
  'src/lib/i18n/fr.json',
  'src/lib/i18n/ar.json',
  'src/lib/i18n/tn.json',
  'static/lessons/gestao-conflitos/course.json',
  'static/lessons/gestao-conflitos/1-natureza-e-fontes-do-conflito.json',
  'static/lessons/gestao-conflitos/2-estilos-e-processos.json',
  'static/lessons/gestao-conflitos/3-negociacao-mediacao-comunicacao.json',
  'static/lessons/gestao-conflitos/4-caso-de-estudo.json',
  'static/quizzes/gcq.json'
];

let allOK = true;
for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    let extra = '';
    if (f.includes('i18n/')) {
      const keys = Object.keys(d);
      const hasGc = keys.filter(k => k.includes('gestao-conflitos') || k.includes('gcq'));
      extra = ` (gc keys: ${hasGc.length})`;
    } else if (f.includes('course.json') || /^[0-9]-/.test(path.basename(f))) {
      extra = ` (lessons/sections: ${d.sections?.length || d.lessons?.length || 'n/a'})`;
    } else if (f.includes('gcq.json')) {
      extra = ` (questions: ${d.questions?.length})`;
    }
    console.log('OK', f + extra);
  } catch (e) {
    console.log('FAIL', f, e.message);
    allOK = false;
  }
}

console.log(allOK ? '\nALL VALID' : '\nSOME FAILED');