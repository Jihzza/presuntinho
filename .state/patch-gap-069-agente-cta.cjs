// Add 4 agente.cta.* keys to all 5 i18n locales
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/rafaa/Documents/GitHub/presuntinho';

const translations = {
  'pt-PT': {
    'agente.cta.o_que_falta': 'o que falta?',
    'agente.cta.resumo_financeiro': 'resumo financeiro',
    'agente.cta.habitos': 'hábitos',
    'agente.cta.progresso': 'progresso'
  },
  'en': {
    'agente.cta.o_que_falta': "what's missing?",
    'agente.cta.resumo_financeiro': 'finance summary',
    'agente.cta.habitos': 'habits',
    'agente.cta.progresso': 'progress'
  },
  'fr': {
    'agente.cta.o_que_falta': "qu'est-ce qui manque ?",
    'agente.cta.resumo_financeiro': 'résumé financier',
    'agente.cta.habitos': 'habitudes',
    'agente.cta.progresso': 'progrès'
  },
  'ar': {
    'agente.cta.o_que_falta': 'ما الناقص؟',
    'agente.cta.resumo_financeiro': 'ملخص مالي',
    'agente.cta.habitos': 'العادات',
    'agente.cta.progresso': 'التقدم'
  },
  'tn': {
    'agente.cta.o_que_falta': 'ch7al fiha؟',
    'agente.cta.resumo_financeiro': 'résumé financier',
    'agente.cta.habitos': 'les habitudes',
    'agente.cta.progresso': 'progress'
  }
};

for (const [locale, keys] of Object.entries(translations)) {
  const p = path.join(ROOT, 'src/lib/i18n/' + locale + '.json');
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  let added = 0;
  for (const [k, v] of Object.entries(keys)) {
    if (!(k in d)) {
      d[k] = v;
      added++;
    }
  }
  // Re-write with 2-space indent (matches existing format)
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n', 'utf8');
  console.log(locale + ': +' + added + ' keys (total: ' + Object.keys(d).length + ')');
}
