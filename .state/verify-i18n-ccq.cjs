const fs = require('fs');
const keys = [
  'routes.escola.curso.comportamento-do-consumidor.title',
  'routes.escola.curso.comportamento-do-consumidor.description',
  'routes.escola.curso.comportamento-do-consumidor.tagline',
  'routes.aulas.curso.comportamento-do-consumidor.title',
  'routes.aulas.curso.comportamento-do-consumidor.tagline',
  'routes.escola.quiz.ccq.title',
  'routes.escola.quiz.ccq.description'
];
for (const loc of ['pt-PT', 'en', 'fr', 'tn', 'ar']) {
  const p = 'src/lib/i18n/' + loc + '.json';
  let raw, d;
  try {
    raw = fs.readFileSync(p, 'utf8');
    d = JSON.parse(raw);
  } catch (e) {
    console.log(`${loc}: INVALID JSON -> ${e.message}`);
    continue;
  }
  const present = keys.filter(k => k in d);
  const missing = keys.filter(k => !(k in d));
  console.log(`=== ${loc} === present=${present.length}/${keys.length} missing=[${missing.join(', ')}]`);
}
