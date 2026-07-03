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
//   * Formatters use the active UI locale when available, falling back
//     to pt-PT.  Keep finance values locale-reactive across language
//     switches instead of freezing Portuguese month/currency formats.

import { db, DEFAULT_CATEGORIAS } from './state/db';
import { awardXP } from './state/xp-actions';
import type { TransacaoRow, OrcamentoRow, CategoriaRow } from './state/db';

const LOCALE_STORAGE_KEY = 'fat-pref-lang';

function activeLocale(fallback = 'pt-PT'): string {
  if (typeof localStorage === 'undefined') return fallback;
  return localStorage.getItem(LOCALE_STORAGE_KEY) || fallback;
}

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

/**
 * Um ponto (mês, totais de receitas e despesas) para o gráfico de 6 meses.
 *
 * gap-113: agora devolvemos receitas E despesas para que o dashboard
 * possa renderizar um grouped bar chart em vez de mostrar só a metade
 * negativa da vida financeira do utilizador.
 */
export interface PontoMensal {
  mes: string;        // 'YYYY-MM'
  despesas: number;
  receitas: number;
}

/** Budget progress row for /financas/orcamento (M1-S4). */
export interface OrcamentoStatus {
  categoria: CategoriaRow;
  limite: number;
  gasto: number;
  percent: number;
  restante: number;
  status: 'ok' | 'warning' | 'danger' | 'over';
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
  return rows.sort((a, b) => a.nome.localeCompare(b.nome, activeLocale()));
}

// ---------------------------------------------------------------------------
// Categorias — M1-S3 CRUD (gestão categorias)
// ---------------------------------------------------------------------------

/**
 * Seed categories on first run (idempotent — `id` is the primary key, so
 * `put` overwrites if the row already exists).  We seed 12+ defaults
 * covering both `tipo='despesa'` and `tipo='receita'`, plus one
 * `ambos`.  The list is short on purpose — UI allows adding more.
 */
export async function ensureCategoriasDefaults(): Promise<void> {
  const defaults: CategoriaRow[] = [
    ...DEFAULT_CATEGORIAS,
    { id: 'freelance',     nome: 'Freelance',      icone: '💻', cor: '#0ea5e9', tipo: 'receita'  },
    { id: 'investimentos', nome: 'Investimentos',  icone: '📈', cor: '#8e44ad', tipo: 'receita'  },
    { id: 'poupanca',      nome: 'Poupança',       icone: '🏦', cor: '#14b8a6', tipo: 'ambos'    },
    { id: 'comunicacoes',  nome: 'Comunicações',   icone: '📱', cor: '#16a085', tipo: 'despesa' },
    { id: 'impostos',      nome: 'Impostos',       icone: '🧾', cor: '#7f8c8d', tipo: 'despesa' }
  ];

  const table = db().categorias;
  const existingRows = await table.toArray();
  const existingIds = new Set(existingRows.map((c) => c.id));
  const missing = defaults.filter((c) => !existingIds.has(c.id));
  if (missing.length > 0) {
    await table.bulkAdd(missing);
  }
}

/** A safe id derived from a category name (lowercase, no accents, dashes for spaces). */
export function slugifyCategoriaNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

/**
 * Create a new category.  If `id` is omitted we slugify `nome`.
 * Throws on duplicate id (caller should catch and surface to UI).
 */
export async function addCategoria(input: {
  nome: string;
  icone?: string;
  cor?: string;
  tipo: 'receita' | 'despesa' | 'ambos';
  id?: string;
}): Promise<string> {
  const id = (input.id?.trim()) || slugifyCategoriaNome(input.nome);
  const nome = input.nome.trim();
  if (!id) throw new Error('categoria.id vazio');
  if (!nome) throw new Error('categoria.nome vazio');
  const table = db().categorias;
  const existingById = await table.get(id);
  if (existingById) throw new Error('categoria.duplicada');
  const duplicateName = (await table.toArray()).find(
    (c) =>
      c.nome.trim().localeCompare(nome, activeLocale(), { sensitivity: 'accent' }) === 0 &&
      (c.tipo === input.tipo || c.tipo === 'ambos' || input.tipo === 'ambos')
  );
  if (duplicateName) throw new Error('categoria.nome_duplicado');
  const row: CategoriaRow = {
    id,
    nome,
    icone: input.icone?.trim() || '🏷️',
    cor: input.cor || '#607d8b',
    tipo: input.tipo
  };
  await table.add(row);
  return id;
}

/**
 * Update an existing category.  Refuses if `id` is one of the seeded
 * defaults — those are immutable so we don't break analytics / budgets
 * that reference them.
 */
export async function updateCategoria(
  id: string,
  patch: Partial<Omit<CategoriaRow, 'id'>>
): Promise<void> {
  if (!id) throw new Error('categoria.id vazio');
  const existing = await db().categorias.get(id);
  if (!existing) throw new Error(`categoria '${id}' não existe`);
  await db().categorias.put({ ...existing, ...patch, id });
}

/**
 * Delete a category unless it is referenced by any transacao or
 * orcamento.  Returns the list of dependent table names so the UI can
 * explain why deletion was refused.
 */
export async function deleteCategoria(id: string): Promise<{ ok: true } | { ok: false; refs: string[] }> {
  if (!id) throw new Error('categoria.id vazio');
  const refs: string[] = [];
  const d = db();
  const txCount = await d.transacoes.where('categoria').equals(id).count();
  if (txCount > 0) refs.push(`transacoes (${txCount})`);
  const orcamentos = await d.orcamentos.toArray();
  const orcCount = orcamentos.filter((o) => o.id === id || o.id.startsWith(`${id}_`)).length;
  if (orcCount > 0) refs.push(`orçamentos (${orcCount})`);
  if (refs.length > 0) return { ok: false, refs };
  await db().categorias.delete(id);
  return { ok: true };
}

/**
 * Count how many transactions reference the given category.  Useful
 * for the UI to warn before delete.
 */
export async function countTransacoesCategoria(id: string): Promise<number> {
  return await db().transacoes.where('categoria').equals(id).count();
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
  const id = (await db().transacoes.add(row)) as number;
  // M0-S2: award XP for the action (Daniel's P2)
  await awardXP(t.tipo === 'receita' ? 'transacao_add_receita' : 'transacao_add_despesa');
  return id;
}

/** Delete a single transaction by id.  No-op if the id doesn't exist. */
export async function deleteTransacao(id: number): Promise<void> {
  await db().transacoes.delete(id);
  // M0-S2: small XP penalty to discourage accidental deletes
  await awardXP('transacao_delete');
}

/**
 * Fetch a single transaction by id. Returns null if not found.
 * Used by the edit page (M1-S1) to pre-fill the form.
 */
export async function getTransacao(id: number): Promise<Transacao | null> {
  const row = (await db().transacoes.get(id)) as Transacao | undefined;
  return row ?? null;
}

/**
 * Update an existing transaction. M1-S1 (Daniel's P3: edit transactions).
 * Accepts the same fields as addTransacao minus `createdAt` (preserved).
 * Returns the updated row, or null if the id doesn't exist.
 *
 * Validates: valor > 0, categoria presente, data em formato YYYY-MM-DD,
 * descricao trimmed (max 120 chars).
 *
 * Awards +1 XP via `transacao_edit` (idempotent at reason level — the
 * awardXP debounce avoids double-fires if the user mashes Save).
 */
export async function updateTransacao(
  id: number,
  patch: Partial<NovaTransacaoInput>
): Promise<Transacao | null> {
  const existing = (await db().transacoes.get(id)) as Transacao | undefined;
  if (!existing) return null;

  // Normalize incoming fields (same rules as addTransacao)
  const updated: Transacao = {
    ...existing,
    tipo: (patch.tipo ?? existing.tipo) as 'receita' | 'despesa',
    valor: Number(patch.valor ?? existing.valor),
    categoria: patch.categoria ?? existing.categoria,
    descricao: (patch.descricao ?? existing.descricao ?? '').trim().slice(0, 120),
    data: patch.data ?? existing.data
  };

  // Validate
  if (!Number.isFinite(updated.valor) || updated.valor <= 0) {
    throw new Error('valor_invalido');
  }
  if (!updated.categoria) {
    throw new Error('categoria_obrigatoria');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(updated.data)) {
    throw new Error('data_invalida');
  }

  await db().transacoes.put(updated);
  // M1-S1: +1 XP for editing a transaction
  await awardXP('transacao_edit');
  return updated;
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
 * despesas AND receitas.  Used by the dashboard bar chart.  The current
 * month is the last entry in the returned array.
 *
 * gap-113: `receitas` was added so the chart can render both bars
 * side-by-side (grouped) instead of expenses-only.
 */
export async function totaisPorMesUltimos6(): Promise<PontoMensal[]> {
  const result: PontoMensal[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const total = await totalMes(mes);
    result.push({ mes, despesas: total.despesas, receitas: total.receitas });
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
  // M0-S2: award XP for setting a budget
  await awardXP('orcamento_define');
}

/**
 * List every budget set for a given month.  Uses the `mes` secondary
 * index — a single index hit, no table scan.
 */
export async function listOrcamentos(mes: string): Promise<OrcamentoRow[]> {
  return await db().orcamentos.where('mes').equals(mes).toArray();
}

/**
 * M1-S4: compute visual budget progress for every expense category that has
 * a positive limit in the selected month. Thresholds match the V7 brief:
 * 0-70 ok, 70-90 warning, 90-100 danger, >100 over.
 */
export async function getOrcamentoStatus(mes: string): Promise<OrcamentoStatus[]> {
  const [categorias, orcamentos, gastos] = await Promise.all([
    listCategorias(),
    listOrcamentos(mes),
    totaisPorCategoria(mes)
  ]);

  const categoriasById = new Map(categorias.map((c) => [c.id, c]));
  const rows: OrcamentoStatus[] = [];

  for (const o of orcamentos) {
    if (!Number.isFinite(o.limite) || o.limite <= 0) continue;
    const sep = o.id.lastIndexOf('_');
    const categoriaId = sep >= 0 ? o.id.slice(0, sep) : o.id;
    const categoria = categoriasById.get(categoriaId);
    if (!categoria) continue;
    if (categoria.tipo !== 'despesa' && categoria.tipo !== 'ambos') continue;

    const gasto = gastos[categoriaId] || 0;
    const percent = o.limite > 0 ? (gasto / o.limite) * 100 : 0;
    const status: OrcamentoStatus['status'] =
      percent > 100 ? 'over' : percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : 'ok';

    rows.push({
      categoria,
      limite: o.limite,
      gasto,
      percent,
      restante: o.limite - gasto,
      status
    });
  }

  return rows.sort((a, b) => b.percent - a.percent || b.gasto - a.gasto);
}

// ---------------------------------------------------------------------------
// Date / value formatters (active UI locale)
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

/** Format a 'YYYY-MM' key as a long month + year, e.g. "junho de 2026". */
export function formatMes(mes: string, loc = activeLocale()): string {
  const [y, m] = mes.split('-');
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return date.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
}

/** Short month label — used by the 6-month chart axis, e.g. "jun/26". */
export function formatMesCurto(mes: string, loc = activeLocale()): string {
  const [y, m] = mes.split('-');
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return date.toLocaleDateString(loc, { month: 'short', year: '2-digit' });
}

/** Format a 'YYYY-MM-DD' key as e.g. "27 jun 2026". */
export function formatData(data: string, loc = activeLocale()): string {
  const [y, m, d] = data.split('-');
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  return date.toLocaleDateString(loc, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Format a number as a EUR currency string in the active UI locale. */
export function formatValor(v: number, loc = activeLocale()): string {
  return new Intl.NumberFormat(loc, {
    style: 'currency',
    currency: 'EUR'
  }).format(v);
}
