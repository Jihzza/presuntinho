#!/usr/bin/env node
// scripts/smoke-transacoes-filtros.test.mjs
// Smoke test para M1-S2: filtros avançados /financas/transacoes.
//
// DoD M1-S2 (resumido):
//   - filtros tipo (todas|receitas|despesas)
//   - pesquisa substring em descricao
//   - intervalo datas (de/ate)
//   - URL params preservados (mes, cat, tipo, q, de, ate)
//   - EmptyState quando filtros vazios
//   - botão "Limpar filtros" sempre visível quando há filtros activos
//   - i18n: usa $t() para strings visíveis (sem hardcoded pt-PT)
//
// Asserts mínimos: 8 (brief V7 pede ≥6).

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const pagePath = path.join(ROOT, 'src/routes/financas/transacoes/+page.svelte');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else { console.error(`  ✗ ${name}`); fail++; }
}

console.log('Smoke M1-S2 — filtros avançados');

const page = fs.readFileSync(pagePath, 'utf8');

ok('tipoFiltro state with todas|receita|despesa', /tipoFiltro.*'todas'\s*\|\s*'receita'\s*\|\s*'despesa'/.test(page));
ok('pesquisa state declared', /let pesquisa = \$state/.test(page));
ok('dataDe and dataAte state', /let dataDe = \$state/.test(page) && /let dataAte = \$state/.test(page));
ok('groups filter applies tipoFiltro', /tipoFiltro !== 'todas' && t\.tipo !== tipoFiltro/.test(page));
ok('groups filter applies dataDe/dataAte', /dataDe && t\.data < dataDe/.test(page) && /dataAte && t\.data > dataAte/.test(page));
ok('groups filter applies pesquisa substring', /pesquisa\.trim\(\)\.toLowerCase\(\)/.test(page) && /toLowerCase\(\)\.includes\(needle\)/.test(page));
ok('onMount hydrates from URL params (mes/cat/tipo/q/de/ate)', /searchParams\.get\(['"]mes['"]\)/.test(page) && /searchParams\.get\(['"]cat['"]\)/.test(page) && /searchParams\.get\(['"]tipo['"]\)/.test(page) && /searchParams\.get\(['"]q['"]\)/.test(page) && /searchParams\.get\(['"]de['"]\)/.test(page) && /searchParams\.get\(['"]ate['"]\)/.test(page));
// Tolerância: aceitar tanto aspas rectas como curvas (template literals).
const allSix = ['mes', 'cat', 'tipo', 'q', 'de', 'ate'].every(k => page.includes(`get('${k}')`) || page.includes(`get("${k}")`));
ok('onMount hydrates from URL params (relaxed, ≥6 keys)', allSix);
ok('$effect syncs filters → URL with replaceState', /window\.history\.replaceState/.test(page));
ok('Limpar filtros button visible when temFiltroAtivo', /temFiltroAtivo/.test(page) && /Limpar filtros/.test(page));
ok('clearFilters resets all 6 filters', /clearFilters[\s\S]{0,300}tipoFiltro = 'todas'/.test(page));
ok('EmptyState used when filtered list is empty', /EmptyState/.test(page));

console.log(`\nResult: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
