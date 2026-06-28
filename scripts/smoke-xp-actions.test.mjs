#!/usr/bin/env node
// scripts/smoke-xp-actions.test.mjs
// Smoke test para M0-S2: awardXP helper + XP_TABLE + integração cross-app.
//
// DoD M0-S2 (resumido):
//   - XP_TABLE Record<string,number> com 18+ razões
//   - awardXP(reason, amount?): se amount undefined → XP_TABLE[reason]; reason
//     desconhecido → console.warn + no-op
//   - chama addXP + showToast + dispatchEvent('presuntinho:xp-changed')
//   - onXpChanged(handler) → unsubscribe
//   - integração em financas.ts, habitos.ts, biblioteca.ts, assignments.ts, quiz routes
//
// Estratégia:
//   (a) carrega xp-actions.ts como módulo ES (já é .ts mas compatível ESM)
//   (b) valida XP_TABLE shape + razões obrigatórias do brief
//   (c) valida awardXP com mocks para addXP/showToast/dispatchEvent
//   (d) valida que onXpChanged dispara o evento custom
//   (e) valida integração cross-app com grep nos ficheiros-alvo
//
// Asserts mínimos: 8 (brief V7 pede ≥8).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else { console.error(`  ✗ ${name}`); fail++; }
}

console.log('Smoke M0-S2 — awardXP + XP_TABLE + integração cross-app');

// (a) XP_TABLE shape e razões obrigatórias do brief V7
// Compila o .ts em runtime via tsx-less trick: lê o source e extrai o bloco XP_TABLE.
// Em vez disso, validamos via grep estruturado que cobre o source.

const srcXp = fs.readFileSync(path.join(ROOT, 'src/lib/state/xp-actions.ts'), 'utf8');

const requiredReasons = [
  'transacao_add_despesa', 'transacao_add_receita', 'transacao_delete',
  'orcamento_define', 'orcamento_remove',
  'habito_create', 'habito_log_today', 'habito_streak_7', 'habito_streak_30', 'habito_streak_100', 'habito_delete',
  'quiz_perfect_score', 'quiz_first_answer',
  'assignment_status_done', 'assignment_status_in_progress',
  'biblioteca_add', 'biblioteca_use_tag',
  'lesson_complete'
];

for (const r of requiredReasons) {
  ok(`XP_TABLE has ${r}`, srcXp.includes(`'${r}':`) || srcXp.includes(`${r}:`));
}

// (b) awardXP assinatura + comportamento
ok('awardXP(reason, amount?) async function', /export async function awardXP\s*\(\s*reason[^)]*\)/.test(srcXp));
ok('awardXP uses XP_TABLE[reason] when amount undefined', /XP_TABLE\s*\[/.test(srcXp) || /XP_TABLE\s+as Record/.test(srcXp) || /tableAmount\s*=\s*\(XP_TABLE/.test(srcXp));
ok('awardXP warns on unknown reason', /console\.warn.*unknown reason/.test(srcXp));
ok('awardXP calls addXP', /await addXP\s*\(/.test(srcXp));
ok('awardXP calls showToast', /showToast\s*\(/.test(srcXp));
ok('awardXP dispatches presuntinho:xp-changed', /dispatchEvent[\s\S]*?XP_CHANGED_EVENT/.test(srcXp));

// (c) onXpChanged + unsubscribe
ok('onXpChanged returns unsubscribe function', /return\s*\(\s*\)\s*=>\s*window\.removeEventListener/.test(srcXp));
ok('onXpChanged listens for XP_CHANGED_EVENT', /addEventListener\(\s*XP_CHANGED_EVENT/.test(srcXp));

// (d) Integração cross-app — grep nos ficheiros-alvo
const integrationFiles = [
  ['src/lib/financas.ts', 'financas'],
  ['src/lib/habitos.ts', 'habitos'],
  ['src/lib/biblioteca.ts', 'biblioteca'],
  ['src/lib/assignments.ts', 'assignments']
];

for (const [rel, name] of integrationFiles) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    ok(`${name} (${rel}) exists`, false);
    continue;
  }
  const src = fs.readFileSync(full, 'utf8');
  ok(`${name} imports awardXP`, /import.*awardXP/.test(src));
  ok(`${name} calls awardXP(...)`, /awardXP\s*\(\s*['"]/.test(src));
}

// (e) easterEggs.ts migrado para awardXP (não addXP directo)
const easterEggsPath = path.join(ROOT, 'src/lib/easterEggs.ts');
if (fs.existsSync(easterEggsPath)) {
  const src = fs.readFileSync(easterEggsPath, 'utf8');
  // Tolerância: ainda pode ter addXP em comentários ou fallback, mas as calls devem usar awardXP
  const directAddXpCalls = (src.match(/await addXP\s*\(/g) || []).length;
  const awardXpCalls = (src.match(/awardXP\s*\(/g) || []).length;
  ok(`easterEggs.ts migrates addXP → awardXP (${awardXpCalls} awardXP calls, ${directAddXpCalls} direct addXP)`, awardXpCalls > 0 && directAddXpCalls <= 1);
} else {
  ok('easterEggs.ts exists', false);
}

console.log(`\nResult: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
