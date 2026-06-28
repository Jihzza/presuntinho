#!/usr/bin/env node
// scripts/smoke-transacoes-edit.test.mjs
// Smoke test para M1-S1: editar transação.
//
// DoD M1-S1 (resumido):
//   - src/routes/financas/transacoes/[id]/+page.svelte existe
//   - updateTransacao(id, patch) em $lib/financas com validação (valor>0, categoria, data)
//   - awardXP('transacao_edit') chamado em updateTransacao
//   - getTransacao(id) existe
//   - rota tem botões Cancelar + Eliminar (com confirm)
//   - a11y: aria-invalid, aria-label, focus no primeiro inválido (classe error)
//   - i18n: NÃO strings hardcoded em pt-PT (usa get(t)())
//
// Asserts mínimos: 8 (brief V7 pede ≥6).

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const financasPath = path.join(ROOT, 'src/lib/financas.ts');
const pagePath = path.join(ROOT, 'src/routes/financas/transacoes/[id]/+page.svelte');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else { console.error(`  ✗ ${name}`); fail++; }
}

console.log('Smoke M1-S1 — editar transação');

const financas = fs.readFileSync(financasPath, 'utf8');
const page = fs.readFileSync(pagePath, 'utf8');

ok('updateTransacao(id, patch) exported', /export async function updateTransacao\s*\(\s*id:\s*number,\s*patch:/.test(financas));
ok('updateTransacao awards transacao_edit XP', /awardXP\(['"]transacao_edit['"]\)/.test(financas));
ok('updateTransacao validates valor > 0', /valor_invalido/.test(financas) || /valor.*>\s*0/.test(financas));
ok('updateTransacao validates categoria required', /categoria_obrigatoria/.test(financas));
ok('updateTransacao validates data formato YYYY-MM-DD', /data_invalida/.test(financas) || /\d{4}-\d{2}-\d{2}/.test(financas));
ok('updateTransacao returns null if id missing', /return null/.test(financas));
ok('getTransacao(id) exported', /export async function getTransacao\s*\(\s*id:\s*number\s*\)/.test(financas));

// Page checks
ok('[id]/+page.svelte exists', fs.existsSync(pagePath));
ok('page loads transacao via getTransacao', /getTransacao\(/.test(page));
ok('page calls updateTransacao on save', /updateTransacao\(/.test(page));
ok('page has Cancelar button', /Cancelar/.test(page));
ok('page has Eliminar button', /Eliminar/.test(page));
ok('page has confirm before delete', /confirmarEliminar/.test(page));
ok('page uses aria-invalid on error', /aria-invalid/.test(page));
ok('page has back-link with aria-label', /aria-label="Voltar/.test(page));
ok('page redirects to /financas/transacoes after save', /goto\(['"]\/financas\/transacoes['"]\)/.test(page));

console.log(`\nResult: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
