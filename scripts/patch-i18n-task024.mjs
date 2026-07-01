#!/usr/bin/env node
/**
 * scripts/patch-i18n-task024.mjs
 *
 * Task-024: Adds the new i18n keys (chip labels + engine strings) to
 * each of the 5 supported locales. PT-PT is the source of truth; the
 * other locales reuse the PT value as a placeholder so the
 * svelte-i18n `.t(key)` lookup resolves even before the human
 * translator cleans it up (same pattern as the existing engine
 * fallbacks `{ default: 'PT' }`).
 *
 * Keys added (all rooted under the existing `agente.*` /
 * `routes.agente.*` namespaces so we don't create new top-level
 * buckets — keeps the diff small).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const i18nDir = path.join(root, 'src', 'lib', 'i18n');

const NEW_KEYS = {
  // -- UI chrome --
  'agente.chips.xp': 'Quanto XP tenho?',
  'agente.chips.habitos_hoje': 'Hábitos de hoje',
  'agente.chips.trabalhos': 'Trabalhos pendentes',
  'agente.chips.semana': 'Resumo da semana',
  'agente.chips.label': 'Sugestões rápidas',
  'agente.placeholder_chips': 'ou escreve aqui a tua pergunta…',
  'agente.empty_prompt': 'Pergunta qualquer coisa — eu leio da app.',

  // -- Engine: XP quick action --
  'routes.agente.engine.xp_only.title': '⭐ XP atual',
  'routes.agente.engine.xp_only.line_total': '• Tens {xp} XP acumulados.',
  'routes.agente.engine.xp_only.line_breakdown': '• {badges} badges desbloqueadas · {secrets} secrets.',

  // -- Engine: Habits today --
  'routes.agente.engine.habits_today.header': '🌱 Hábitos de hoje ({ativos}/{total})',
  'routes.agente.engine.habits_today.done_label': 'Marcados:',
  'routes.agente.engine.habits_today.todo_label': 'Por marcar:',

  // -- Engine: Assignments pending --
  'routes.agente.engine.assignments.error': 'Erro a ler trabalhos. Tenta outra vez.',
  'routes.agente.engine.assignments.empty': '🎉 Não tens trabalhos pendentes. Tudo entregue (ou por começar).',
  'routes.agente.engine.assignments.header_one': '📚 {n} trabalho pendente',
  'routes.agente.engine.assignments.header_other': '📚 {n} trabalhos pendentes',
  'routes.agente.engine.assignments.item': '• {title} — {days}',
  'routes.agente.engine.assignments.days_overdue': 'atrasado {n}d',
  'routes.agente.engine.assignments.days_today': 'entrega hoje',
  'routes.agente.engine.assignments.days_left': 'faltam {n}d',
  'routes.agente.engine.assignments.more': '…e mais {n}.',

  // -- Engine: Weekly summary --
  'routes.agente.engine.weekly.error': 'Erro a agregar o resumo semanal. Tenta outra vez.',
  'routes.agente.engine.weekly.title': '🗓️ Resumo da semana ({start} → {end})',
  'routes.agente.engine.weekly.finance_header': '💸 Finanças (7d)',
  'routes.agente.engine.weekly.finance_despesas': '• Despesas: {valor}',
  'routes.agente.engine.weekly.finance_receitas': '• Receitas: {valor}',
  'routes.agente.engine.weekly.finance_transacoes': '• {n} transações',
  'routes.agente.engine.weekly.habits_header': '🌱 Hábitos (7d)',
  'routes.agente.engine.weekly.habits_line': '• {done} logs · {pct}% completion ({total} hábitos)',
  'routes.agente.engine.weekly.habits_none': '• Sem hábitos configurados.',
  'routes.agente.engine.weekly.assignments_header': '📚 Trabalhos (próx. 7d)',
  'routes.agente.engine.weekly.assignments_line': '• {n} com deadline esta semana: {lista}',
  'routes.agente.engine.weekly.assignments_none': '• Sem entregas nesta semana.',

  // -- Tools: Assignments appear in the whats-missing list --
  'routes.agente.tools.pending_assignments_one': '{n} trabalho pendente ({lista})',
  'routes.agente.tools.pending_assignments_other': '{n} trabalhos pendentes ({lista})',
  'routes.agente.tools.suggestion_open_trabalhos': 'Abrir /trabalhos e ver a lista filtrável'
};

const LOCALES = ['pt-PT', 'tn', 'en', 'fr', 'ar'];

let totalInserted = 0;
for (const locale of LOCALES) {
  const file = path.join(i18nDir, `${locale}.json`);
  const raw = fs.readFileSync(file, 'utf8');
  const obj = JSON.parse(raw);
  let inserted = 0;
  for (const [k, ptValue] of Object.entries(NEW_KEYS)) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) continue;
    obj[k] = ptValue; // use PT as fallback for non-PT locales per the brief
    inserted++;
  }
  // 2-space indent matches the existing style across all five files.
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log(`✓ ${locale}.json  (+${inserted})`);
  totalInserted += inserted;
}
console.log(`\nTotal keys inserted: ${totalInserted}`);
