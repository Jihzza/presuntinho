// Finanças sub-app helpers — Phase 6.
//
// All functions are pure async wrappers around the Dexie tables defined
// in `$lib/state/db.ts` (v2 schema):
//   transacoes  — every income / expense entry
//   orcamentos  — per-category monthly spending limits
//   categorias  — lookup table seeded by ensureDefaults()
//
// Design notes:
//   * We never mutate the DB outside of these helpers — components
//     import from here so the schema is a single point of change.
//   * All date keys are 'YYYY-MM-DD' (transacoes) or 'YYYY-MM'
//     (orcamentos) in the user's LOCAL timezone.  We never use UTC
//     date components because a transaction logged at 23:50 in
//     Lisbon must still belong to "today" for the user, not tomorrow
//     in UTC.
//   * SSR safety: every helper calls `db()` lazily and the table
//     queries will throw in Node (no IndexedDB).  Callers MUST be
//     guarded behind an `onMount` / `browser` check, the same way the
//     splash route already does.
//   * `addTransacao` / `setOrcamento` stamp `createdAt` for us so
//     callers only pass user-facing fields.
//   * `formatValor` uses pt-PT locale with EUR currency — this matches
//     the "Língua: pt-PT" setting in Phase 9's i18n.

import { db } from './state/db';
import type { TransacaoRow, OrcamentoRow, CategoriaRow } from './state/db';

// ---------------------------------------------------------------------------
// Public types — re-exported so component code only imports from one place.
// ---------------------------------------------------------------------------

// Re-export the raw Dexie row types so callers don't need to also
// import from $lib/state/db (which keeps the schema boundary narrow).
export type { TransacaoRow, OrcamentoRow, CategoriaRow };

/** A saved transaction with the auto-incremented `id` resolved. */
export interface Transacao extends TransacaoRow {
  id: number;
}

/** Input shape for `addTransacao` — caller does NOT pass `id` or `createdAt`. */
export type NovaTransacaoInput = Omit<TransacaoRow, 'id' | 'createdAt'>;

/** Totais agregados de um mês (receitas, despesas, saldo). */
export interface TotaisMes {
  receitas: number;
  despesas: number;
  saldo: number;
}

/** Map<categoriaId, totalDespesa> — usado para gráficos / orçamentos. */
export type TotaisPorCategoria = Record<string, number>;

/** Um ponto (mês, total de despesas) para o gráfico de 6 meses. */
export interface PontoMensal {
  mes: string;        // 'YYYY-MM'
  despesas: number;
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

/**
 * List every category.  Ordered by `nome` so the UI dropdown doesn't
 * shuffle every render.  Returned rows are the raw `CategoriaRow`
 * shape — no extra fields are computed.
 */
export async function listCategorias(): Promise<CategoriaRow[]> {
  const rows = await db().categorias.toArray();
  return rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-PT'));
}

// ---------------------------------------------------------------------------
// Transações — listagem
// ---------------------------------------------------------------------------

/**
 * List every transaction, newest-first.  Uses the `data` index so the
 * sort is index-driven rather than a table scan.
 */
export async function listTransacoes(): Promise<Transacao[]> {
  const rows = await db().transacoes.orderBy('data').reverse().toArray();
  return rows.filter((r): r is Transacao => typeof r.id === 'number');
}

/**
 * List transactions whose `data` falls inside the given month
 * ('YYYY-MM'), newest-first.  Uses the `data` index with a between()
 * range; the inclusive bounds cover both '-01' and '-31' so any
 * date in the month is hit.
 *
 * Note: YYYY-MM-31 covers months with 28/29/30 days safely — Dexie's
 * string comparison is lexicographic and a non-existent date (e.g.
 * '2024-02-31') would simply not match any row.
 */
export async function listTransacoesMes(mes: string): Promise<Transacao[]> {
  const inicio = `${mes}-01`;
  const fim = `${mes}-31`;
  const rows = await db().transacoes
    .where('data')
    .between(inicio, fim, true, true)
    .reverse()
    .sortBy('data');
  return rows.filter((r): r is Transacao => typeof r.id === 'number');
}

// ---------------------------------------------------------------------------
// Transações — mutações
// ---------------------------------------------------------------------------

/**
 * Insert a new transaction.  Returns the auto-assigned id so the caller
 * can navigate to the detail/list route immediately.  `createdAt` is
 * stamped here (not by the caller) so it can't be back-dated.
 */
export async function addTransacao(t: NovaTransacaoInput): Promise<number> {
  const row: TransacaoRow = {
    tipo: t.tipo,
    valor: Number(t.valor),
    categoria: t.categoria,
    descricao: t.descricao.trim(),
    data: t.data,
    createdAt: Date.now()
  };
  return await db().transacoes.add(row) as number;
}

/** Delete a single transaction by id.  No-op if the id doesn't exist. */
export async function deleteTransacao(id: number): Promise<void> {
  await db().transacoes.delete(id);
}

// ---------------------------------------------------------------------------
// Agregações
// ---------------------------------------------------------------------------

/**
 * Compute the receitas / despesas / saldo totals for a given month
 * ('YYYY-MM').  Uses the same `listTransacoesMes` query as the list
 * page so the dashboard and the list always agree.
 */
export async function totalMes(mes: string): Promise<TotaisMes> {
  const trans = await listTransacoesMes(mes);
  let receitas = 0;
  let despesas = 0;
  for (const t of trans) {
    if (t.tipo === 'receita') receitas += t.valor;
    else if (t.tipo === 'despesa') despesas += t.valor;
  }
  return { receitas, despesas, saldo: receitas - despesas };
}

/**
 * Build a Map<categoriaId, totalDespesa> for the given month.  Only
 * 'despesa' rows contribute — receitas are not bucketed by category
 * for the budget view.
 */
export async function totaisPorCategoria(mes: string): Promise<TotaisPorCategoria> {
  const trans = await listTransacoesMes(mes);
  const result: TotaisPorCategoria = {};
  for (const t of trans) {
    if (t.tipo === 'despesa') {
      result[t.categoria] = (result[t.categoria] || 0) + t.valor;
    }
  }
  return result;
}

/**
 * Return the last 6 calendar months (oldest → newest) with their total
 * despesas.  Used by the dashboard bar chart.  The current month is
 * the last entry in the returned array.
 */
export async function totaisPorMesUltimos6(): Promise<PontoMensal[]> {
  const result: PontoMensal[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const total = await totalMes(mes);
    result.push({ mes, despesas: total.despesas });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Orçamentos (Phase 6 — per-category monthly limits)
// ---------------------------------------------------------------------------

/**
 * Composite primary key: `${categoriaId}_${mes}`.  This lets us store a
 * different limit per (category, month) without a complex schema — the
 * same categoria can have its limit evolve over time without losing
 * history.
 */
function orcamentoId(categoriaId: string, mes: string): string {
  return `${categoriaId}_${mes}`;
}

/**
 * Read the budget for a single category in a given month, or `null` if
 * the user hasn't set one yet.
 */
export async function getOrcamento(
  categoriaId: string,
  mes: string
): Promise<OrcamentoRow | null> {
  const row = await db().orcamentos.get(orcamentoId(categoriaId, mes));
  return row ?? null;
}

/**
 * Set (or overwrite) the budget for a single category in a given month.
 * The composite key means this is a single `put()` — no diffing needed.
 */
export async function setOrcamento(
  categoriaId: string,
  limite: number,
  mes: string
): Promise<void> {
  await db().orcamentos.put({
    id: orcamentoId(categoriaId, mes),
    limite: Number(limite),
    mes
  });
}

/**
 * List every budget set for a given month.  Uses the `mes` secondary
 * index — a single index hit, no table scan.
 */
export async function listOrcamentos(mes: string): Promise<OrcamentoRow[]> {
  return await db().orcamentos.where('mes').equals(mes).toArray();
}

// ---------------------------------------------------------------------------
// Date / value formatters (pt-PT locale)
// ---------------------------------------------------------------------------

/** Today as a 'YYYY-MM' key, in the user's local timezone. */
export function getMesAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Today as a 'YYYY-MM-DD' key, in the user's local timezone. */
export function getHojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Format a 'YYYY-MM' key as a pt-PT long month + year, e.g. "junho de 2026". */
export function formatMes(mes: string): string {
  const [y, m] = mes.split('-');
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return date.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
}

/** Short month label — used by the 6-month chart axis, e.g. "jun/26". */
export function formatMesCurto(mes: string): string {
  const [y, m] = mes.split('-');
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return date.toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' });
}

/** Format a 'YYYY-MM-DD' key as e.g. "27 jun 2026" in pt-PT. */
export function formatData(data: string): string {
  const [y, m, d] = data.split('-');
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  return date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Format a number as a EUR currency string in pt-PT (e.g. "12,50 €"). */
export function formatValor(v: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR'
  }).format(v);
}
