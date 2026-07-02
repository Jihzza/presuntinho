import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const helper = readFileSync(join(ROOT, 'src/lib/financas.ts'), 'utf8');
const page = readFileSync(join(ROOT, 'src/routes/financas/orcamento/+page.svelte'), 'utf8');

let passed = 0;
let failed = 0;
function check(name, ok) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
  }
}

console.log('=== smoke: M1-S4 orçamento progresso ===');
check('exports OrcamentoStatus type', helper.includes('export interface OrcamentoStatus'));
check('exports getOrcamentoStatus helper', helper.includes('export async function getOrcamentoStatus'));
check('helper uses category budgets + month spend in parallel', helper.includes('listOrcamentos(mes)') && helper.includes('totaisPorCategoria(mes)'));
check('helper filters only positive budget limits', helper.includes('o.limite <= 0'));
check('helper maps 70/90/100 thresholds', helper.includes("percent > 100 ? 'over'") && helper.includes("percent >= 90 ? 'danger'") && helper.includes("percent >= 70 ? 'warning'"));
check('page imports getOrcamentoStatus', page.includes('getOrcamentoStatus'));
check('page shows empty state for no budgets', page.includes('financas.orcamento.empty.budgets'));
check('page shows remaining balance card', page.includes('financas.orcamento.summary.remaining'));
check('page renders danger/over alert', page.includes('financas.orcamento.alert.over') && page.includes('financas.orcamento.alert.danger'));
check('page uses colour-coded status classes', page.includes('class:warning') && page.includes('class:danger') && page.includes('class:over'));
check('page preserves inline budget editing', page.includes('onblur={(e) => saveLimite'));
check('page surfaces saved toast', page.includes('financas.orcamento.toast.saved'));

const requiredKeys = [
  'financas.orcamento.empty.categorias',
  'financas.orcamento.empty.budgets',
  'financas.orcamento.summary.remaining',
  'financas.orcamento.alert.over',
  'financas.orcamento.alert.danger',
  'financas.orcamento.status.ok',
  'financas.orcamento.status.warning',
  'financas.orcamento.status.danger',
  'financas.orcamento.status.over',
  'financas.orcamento.over_by',
  'financas.orcamento.near_limit',
  'financas.orcamento.toast.saved'
];
for (const loc of ['pt-PT', 'en', 'fr', 'ar', 'tn']) {
  const dict = JSON.parse(readFileSync(join(ROOT, `src/lib/i18n/${loc}.json`), 'utf8'));
  for (const key of requiredKeys) {
    check(`i18n[${loc}] ${key}`, Object.prototype.hasOwnProperty.call(dict, key));
  }
}

console.log(`\n=== Result: ${passed}/${passed + failed} PASS ===`);
process.exit(failed === 0 ? 0 : 1);
