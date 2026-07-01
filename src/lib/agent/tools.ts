// Agent tools — read-only queries against Dexie that the in-app agent can call.
//
// Every tool returns a JSON-serialisable object the engine turns into a
// localised reply. Tools never mutate state; they only read.
//
// i18n: structured "pending" / "suggestion" payloads carry a `key` + raw
// data; the engine layer (`engine.ts`) wraps them via `get(t)()` from
// svelte-i18n before they reach the user. This keeps tools.ts dependency
// light (no svelte-i18n import) and trivially unit-testable.

import { db } from '../state/db';
import { getMesAtual, totalMes, listOrcamentos, listTransacoesMes, listTransacoes } from '../financas';
import { listHabitos } from '../habitos';
import { listAssignments } from '../trabalhos';

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** A pending item / suggestion that the engine formats via i18n. */
export interface Localised {
  /** routes.agente.tools.* key used by engine.ts to look up the message. */
  key: string;
  /** Parameters for the {placeholders} in the translation template. */
  params: Record<string, string | number>;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- Finanças ----------

export async function toolFinanceSummary(): Promise<ToolResult<{
  mes: string;
  receitas: number;
  despesas: number;
  saldo: number;
  orcamentosAtivos: number;
}>> {
  try {
    const mes = getMesAtual();
    const totais = await totalMes(mes);
    const orc = await listOrcamentos(mes);
    return {
      ok: true,
      data: {
        mes,
        receitas: totais.receitas,
        despesas: totais.despesas,
        saldo: totais.saldo,
        orcamentosAtivos: orc.length
      }
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function toolFinanceMonth(mes?: string): Promise<ToolResult<{
  mes: string;
  transacoes: number;
  totalDespesa: number;
  totalReceita: number;
}>> {
  try {
    const m = mes || getMesAtual();
    const trans = await listTransacoesMes(m);
    let despesa = 0;
    let receita = 0;
    for (const t of trans) {
      if (t.tipo === 'despesa') despesa += t.valor;
      else receita += t.valor;
    }
    return {
      ok: true,
      data: { mes: m, transacoes: trans.length, totalDespesa: despesa, totalReceita: receita }
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---------- Hábitos ----------

export async function toolHabitsOverview(): Promise<ToolResult<{
  totalHabitos: number;
  ativosHoje: number;
  lista: Array<{ id: number; name: string; icon: string; loggedToday: boolean }>;
}>> {
  try {
    const habits = await listHabitos();
    const today = todayISO();
    const lista: Array<{ id: number; name: string; icon: string; loggedToday: boolean }> = [];
    let ativosHoje = 0;
    for (const h of habits) {
      if (typeof h.id !== 'number') continue;
      const logs = await db().habit_logs
        .where('[habitId+date]')
        .equals([h.id, today])
        .toArray();
      const logged = logs.length > 0;
      if (logged) ativosHoje++;
      lista.push({ id: h.id, name: h.name, icon: h.icon, loggedToday: logged });
    }
    return {
      ok: true,
      data: { totalHabitos: habits.length, ativosHoje, lista }
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---------- Escola ----------

export async function toolSchoolProgress(): Promise<ToolResult<{
  badges: number;
  badgesTotal: number;
  quizzesFeitos: number;
  quizzesTotal: number;
  xpTotal: number;
}>> {
  try {
    const badgesRows = await db().badges.toArray();
    const unlocked = badgesRows.filter((b) => b.unlocked).length;
    const quizRows = await db().quizScores.toArray();
    const quizzesFeitos = quizRows.filter((q) => q.score > 0 || q.answered.length > 0).length;
    const state = await db().state.get('main');
    return {
      ok: true,
      data: {
        badges: unlocked,
        badgesTotal: badgesRows.length,
        quizzesFeitos,
        quizzesTotal: quizRows.length,
        xpTotal: state?.xp ?? 0
      }
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---------- Visited pages ----------

export async function toolVisitedPages(): Promise<ToolResult<{
  visited: string[];
  notVisited: string[];
}>> {
  try {
    const known = ['case', 'course', 'walk', 'secrets', 'quiz', 'write', 'pt', 'dl', 'home'];
    const rows = await db().visited.toArray();
    const map = new Map(rows.map((r) => [r.id, r.visited]));
    const visited: string[] = [];
    const notVisited: string[] = [];
    for (const k of known) {
      if (map.get(k)) visited.push(k);
      else notVisited.push(k);
    }
    return { ok: true, data: { visited, notVisited } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---------- XP / profile ----------

export async function toolProfileSummary(): Promise<ToolResult<{
  xp: number;
  heartClicks: number;
  badgesUnlocked: number;
  secretsDiscovered: number;
}>> {
  try {
    const state = await db().state.get('main');
    const badgesRows = await db().badges.toArray();
    const secretsRows = await db().secrets.toArray();
    return {
      ok: true,
      data: {
        xp: state?.xp ?? 0,
        heartClicks: state?.heartClicks ?? 0,
        badgesUnlocked: badgesRows.filter((b) => b.unlocked).length,
        secretsDiscovered: secretsRows.filter((s) => s.discovered).length
      }
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---------- Smart "what's missing" aggregator ----------
//
// pending[] and suggestions[] carry i18n keys + params. The engine layer
// (engine.ts) calls get(t)() on each to produce the final user-facing
// string. Keeping the formatting in tools.ts away from svelte-i18n makes
// this module a pure data layer that's trivial to unit-test.

export async function toolWhatsMissing(): Promise<ToolResult<{
  pending: Localised[];
  suggestions: Localised[];
}>> {  try {
    const pending: Localised[] = [];
    const suggestions: Localised[] = [];

    // Escola: páginas não visitadas
    const v = await toolVisitedPages();
    if (v.ok && v.data.notVisited.length > 0) {
      pending.push({
        key: 'routes.agente.tools.pending_pages_escola',
        params: { n: v.data.notVisited.length, lista: v.data.notVisited.join(', ') }
      });
    }

    // Escola: quizzes não feitos
    const s = await toolSchoolProgress();
    if (s.ok && s.data.quizzesFeitos < s.data.quizzesTotal) {
      const falta = s.data.quizzesTotal - s.data.quizzesFeitos;
      const pluralKey = falta === 1 ? 'routes.agente.tools.pending_quizzes_one' : 'routes.agente.tools.pending_quizzes_other';
      pending.push({ key: pluralKey, params: { n: falta } });
      suggestions.push({
        key: 'routes.agente.tools.suggestion_open_escola',
        params: {}
      });
    }

    // Hábitos: o que não foi marcado hoje
    const h = await toolHabitsOverview();
    if (h.ok && h.data.totalHabitos > 0 && h.data.ativosHoje < h.data.totalHabitos) {
      const falta = h.data.totalHabitos - h.data.ativosHoje;
      const nomes = h.data.lista.filter((x) => !x.loggedToday).map((x) => x.name).slice(0, 3);
      const pluralKey = falta === 1 ? 'routes.agente.tools.pending_habits_one' : 'routes.agente.tools.pending_habits_other';
      pending.push({
        key: pluralKey,
        params: { n: falta, lista: nomes.join(', '), suffix: falta > 3 ? '…' : '' }
      });
      suggestions.push({
        key: 'routes.agente.tools.suggestion_open_habitos',
        params: {}
      });
    }

    // Finanças: orçamento do mês corrente
    const f = await toolFinanceSummary();
    if (f.ok && f.data.orcamentosAtivos === 0 && (f.data.receitas > 0 || f.data.despesas > 0)) {
      pending.push({
        key: 'routes.agente.tools.pending_no_budget',
        params: {}
      });
      suggestions.push({
        key: 'routes.agente.tools.suggestion_open_orcamento',
        params: {}
      });
    }

    // Trabalhos (assignments) com status 'pending' ou 'in_progress'.
    const a = await toolAssignmentsPending();
    if (a.ok && a.data.total > 0) {
      const falta = a.data.total;
      const pluralKey = falta === 1 ? 'routes.agente.tools.pending_assignments_one' : 'routes.agente.tools.pending_assignments_other';
      pending.push({ key: pluralKey, params: { n: falta, lista: a.data.titulosPreview.join(', ') } });
      suggestions.push({ key: 'routes.agente.tools.suggestion_open_trabalhos', params: {} });
    }

    return { ok: true, data: { pending, suggestions } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Trabalhos (Escola sub-app) — assignments pendentes
// ---------------------------------------------------------------------------

/**
 * Lista assignments com status 'pending' ou 'in_progress', ordenados
 * pelo `deadline` ascendente (urgência). Devolve também um preview dos
 * títulos para o motor de i18n.
 *
 * Reutiliza `listAssignments()` (índice secundário `deadline`) para
 * evitar um `toArray()` na tabela toda quando só queremos os
 * primeiros N.
 */
export async function toolAssignmentsPending(): Promise<ToolResult<{
  total: number;
  pendentes: Array<{ id: string; title: string; curso: string; status: string; deadline: number; daysLeft: number }>;
  titulosPreview: string[];
}>> {
  try {
    const all = await listAssignments();
    const agora = Date.now();
    const pendentes = all
      .filter((r) => r.status === 'pending' || r.status === 'in_progress')
      .map((r) => ({
        id: r.id,
        title: r.title,
        curso: r.curso,
        status: r.status,
        deadline: r.deadline,
        daysLeft: Math.ceil((r.deadline - agora) / (24 * 60 * 60 * 1000))
      }));
    return {
      ok: true,
      data: {
        total: pendentes.length,
        pendentes,
        titulosPreview: pendentes.slice(0, 5).map((p) => p.title)
      }
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Resumo semanal — finanças 7d + completion de hábitos 7d + assignments 7d
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Agrega os últimos 7 dias (incluindo hoje):
 *   - Finanças: total de despesas e receitas
 *   - Hábitos: % de completion (logs / (hábitos * 7))
 *   - Trabalhos: assignments cujo `deadline` cai nos próximos 7 dias
 *
 * Lê directo da Dexie — sem invocar outros tools — para manter o
 * output coerente mesmo quando algum tool dependente falha.
 */
export async function toolWeeklySummary(): Promise<ToolResult<{
  windowStart: string;
  windowEnd: string;
  financas: { despesas: number; receitas: number; transacoes: number };
  habitos: { total: number; logsUltimos7d: number; completionPct: number };
  trabalhos: { total: number; proximos7d: number; titulosPreview: string[] };
}>> {
  try {
    const d = db();
    const end = new Date();
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000); // inclui hoje
    const startISO = isoDate(start);
    const endISO = isoDate(end);

    // Finanças: filtra por data ISO 'YYYY-MM-DD'.
    const trans = await listTransacoes();
    let despesas = 0;
    let receitas = 0;
    let count = 0;
    for (const t of trans) {
      if (typeof t.data !== 'string') continue;
      if (t.data < startISO || t.data > endISO) continue;
      count++;
      if (t.tipo === 'despesa') despesas += t.valor;
      else if (t.tipo === 'receita') receitas += t.valor;
    }

    // Hábitos: contagem de logs nos últimos 7d.
    const habits = await listHabitos();
    const logs7d = await d.habit_logs.where('date').between(startISO, endISO, true, true).toArray();
    const totalHab = habits.length;
    const completionsPct = totalHab === 0 ? 0 : Math.round((logs7d.length / (totalHab * 7)) * 100);

    // Trabalhos: assignments com deadline nos próximos 7d (incluindo hoje).
    const allAssignments = await listAssignments();
    const horizon = end.getTime() + 7 * 24 * 60 * 60 * 1000;
    const proximos = allAssignments
      .filter((r) => r.status !== 'submitted' && r.status !== 'graded')
      .filter((r) => r.deadline >= end.getTime() && r.deadline <= horizon);
    return {
      ok: true,
      data: {
        windowStart: startISO,
        windowEnd: endISO,
        financas: { despesas, receitas, transacoes: count },
        habitos: { total: totalHab, logsUltimos7d: logs7d.length, completionPct: completionsPct },
        trabalhos: {
          total: allAssignments.filter((r) => r.status === 'pending' || r.status === 'in_progress').length,
          proximos7d: proximos.length,
          titulosPreview: proximos.slice(0, 4).map((p) => p.title)
        }
      }
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}