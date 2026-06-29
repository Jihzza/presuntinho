const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/rafaa/Documents/GitHub/presuntinho';

const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/lib/i18n/pt-PT.json'), 'utf8'));
const ks = Object.keys(d);
console.log('agente keys:', ks.filter(k => k.startsWith('agente')));
console.log('all keys (last 30):', ks.slice(-30));
console.log('total:', ks.length);
