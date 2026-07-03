// Context bridge — Hermes runs outside the browser and cannot see the
// app's IndexedDB, so every chat turn ships a compact, data-only snapshot
// built from the existing read-only tools. Kept to ~1 KB: one framing line
// plus one line per area; a failing tool simply omits its line.

import {
  toolProfileSummary,
  toolHabitsOverview,
  toolFinanceSummary,
  toolAssignmentsPending,
  toolWeeklySummary
} from './tools';
import type { ProfileId } from '../auth/hash';

export async function buildContextSummary(profile: ProfileId): Promise<string> {
  const lines: string[] = [
    `[Contexto da app Presuntinho — dados locais do perfil ${profile}, ${new Date().toISOString()}]`
  ];

  const p = await toolProfileSummary().catch(() => null);
  if (p?.ok) {
    lines.push(
      `XP: ${p.data.xp} · badges: ${p.data.badgesUnlocked} · secrets: ${p.data.secretsDiscovered}`
    );
  }

  const h = await toolHabitsOverview().catch(() => null);
  if (h?.ok && h.data.totalHabitos > 0) {
    const porMarcar = h.data.lista.filter((x) => !x.loggedToday).map((x) => x.name);
    lines.push(
      `Hábitos hoje: ${h.data.ativosHoje}/${h.data.totalHabitos} marcados` +
        (porMarcar.length ? ` (por marcar: ${porMarcar.slice(0, 5).join(', ')})` : '')
    );
  }

  const f = await toolFinanceSummary().catch(() => null);
  if (f?.ok) {
    lines.push(
      `Finanças ${f.data.mes}: receitas ${f.data.receitas}, despesas ${f.data.despesas}, saldo ${f.data.saldo}`
    );
  }

  const a = await toolAssignmentsPending().catch(() => null);
  if (a?.ok && a.data.total > 0) {
    const preview = a.data.pendentes
      .slice(0, 4)
      .map((t) => `${t.title} (${t.daysLeft}d)`)
      .join('; ');
    lines.push(`Trabalhos pendentes: ${a.data.total} — ${preview}`);
  }

  const w = await toolWeeklySummary().catch(() => null);
  if (w?.ok) {
    lines.push(
      `Últimos 7d: despesas ${w.data.financas.despesas}, receitas ${w.data.financas.receitas}, ` +
        `hábitos ${w.data.habitos.completionPct}% completos, ${w.data.trabalhos.proximos7d} deadlines próximos`
    );
  }

  return lines.join('\n');
}
