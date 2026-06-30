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
import { getMesAtual, totalMes, listOrcamentos, listTransacoesMes } from '../financas';
import { listHabitos } from '../habitos';

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
}>> {
  try {
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

    return { ok: true, data: { pending, suggestions } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}