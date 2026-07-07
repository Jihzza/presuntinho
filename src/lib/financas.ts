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
import type {
  TransacaoRow as TransacaoRowBase,
  OrcamentoRow,
  CategoriaRow,
  MetaRow
} from './state/db';

const LOCALE_STORAGE_KEY = 'fat-pref-lang';

function activeLocale(fallback = 'pt-PT'): string {
  if (typeof localStorage === 'undefined') return fallback;
  return localStorage.getItem(LOCALE_STORAGE_KEY) || fallback;
}

// ── Moeda (V11) — escolhível em /definicoes; default EUR ────────────────────
const CURRENCY_STORAGE_KEY = 'fat-pref-currency';

/** Moedas suportadas na app (código ISO 4217 + rótulo amigável). */
export const SUPPORTED_CURRENCIES = [
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'BRL', label: 'Real (R$)' },
  { code: 'TND', label: 'Dinar tunisino (DT)' }
] as const;

const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code) as readonly string[];

/** Moeda ativa (código ISO). Lida do localStorage; default EUR. */
export function activeCurrency(fallback = 'EUR'): string {
  if (typeof localStorage === 'undefined') return fallback;
  const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
  return stored && CURRENCY_CODES.includes(stored) ? stored : fallback;
}

/** Persistir a moeda escolhida (usado por /definicoes). */
export function setCurrency(code: string): void {
  if (typeof localStorage === 'undefined') return;
  if (CURRENCY_CODES.includes(code)) localStorage.setItem(CURRENCY_STORAGE_KEY, code);
}

/** Símbolo curto da moeda ativa (€, $, £, R$, DT) para sufixos de inputs. */
export function currencySymbol(loc = activeLocale(), currency = activeCurrency()): string {
  try {
    const parts = new Intl.NumberFormat(loc, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol'
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

// ---------------------------------------------------------------------------
// Public types — re-exported so component code only imports from one place.
// ---------------------------------------------------------------------------

// Re-export the raw Dexie row types so callers don't need to also
// import from $lib/state/db (which keeps the schema boundary narrow).
export type { OrcamentoRow, CategoriaRow, MetaRow };

/**
 * V8 — recurring transactions.  The extra fields are written straight on
 * `transacoes` rows (non-indexed, so no schema change in db.ts):
 *   recorrente   — 'mensal' marks the row as a monthly template.
 *   recorrenteDe — set on materialised copies, pointing at the template id.
 */
export interface TransacaoRow extends TransacaoRowBase {
  recorrente?: 'mensal';
  recorrenteDe?: number;
  /** Meses ('YYYY-MM') em que o utilizador apagou a cópia — impede que
   *  `ensureRecorrentes` a volte a criar (o template guarda esta lista). */
  recorrenteSkip?: string[];
  /** Liga uma transação a uma meta de poupança (movimento gerado por um
   *  depósito/levantamento na meta), para o saldo refletir o dinheiro posto
   *  de lado. Não-indexado, aditivo. */
  metaId?: number;
}

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
  // O id do orçamento é `${categoriaId}_${YYYY-MM}`. Um startsWith(`${id}_`)
  // ingénuo apanha categorias que só PARTILHAM prefixo (ex.: apagar `conta`
  // ficava bloqueado por um orçamento de `conta_poupanca`). Exigir que o
  // sufixo seja exactamente um mês garante que só contamos ESTA categoria.
  const orcCount = orcamentos.filter((o) => {
    if (!o.id.startsWith(`${id}_`)) return false;
    return /^\d{4}-\d{2}$/.test(o.id.slice(id.length + 1));
  }).length;
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

/**
 * V8 — list transactions inside an arbitrary [de, ate] date range
 * ('YYYY-MM-DD', both inclusive; either bound may be '' = open).
 * Uses the same `data` index as `listTransacoesMes` so cross-month
 * filters on /financas/transacoes don't fall back to a table scan.
 */
export async function listTransacoesRange(de: string, ate: string): Promise<Transacao[]> {
  const inicio = de || '0000-01-01';
  const fim = ate || '9999-12-31';
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
  // V8 — recurring flags are optional; only persist them when present so
  // older rows stay byte-identical.
  if (t.recorrente === 'mensal') row.recorrente = 'mensal';
  if (typeof t.recorrenteDe === 'number') row.recorrenteDe = t.recorrenteDe;
  const id = (await db().transacoes.add(row)) as number;
  // M0-S2: award XP for the action (Daniel's P2)
  await awardXP(t.tipo === 'receita' ? 'transacao_add_receita' : 'transacao_add_despesa');
  return id;
}

/** Delete a single transaction by id.  No-op if the id doesn't exist. */
export async function deleteTransacao(id: number): Promise<void> {
  const d = db();
  const row = (await d.transacoes.get(id)) as TransacaoRow | undefined;
  // Se for uma CÓPIA materializada de uma recorrência, registar o mês como
  // ignorado no template — senão a próxima visita ao dashboard ressuscita-a.
  if (row && typeof row.recorrenteDe === 'number') {
    const mes = row.data.slice(0, 7);
    const tpl = (await d.transacoes.get(row.recorrenteDe)) as TransacaoRow | undefined;
    if (tpl) {
      const skip = new Set(tpl.recorrenteSkip ?? []);
      skip.add(mes);
      await d.transacoes.update(row.recorrenteDe, { recorrenteSkip: [...skip] } as Partial<TransacaoRow>);
    }
  }
  await d.transacoes.delete(id);
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
  patch: Partial<Omit<NovaTransacaoInput, 'recorrente'>> & { recorrente?: 'mensal' | null }
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

  // V8 — recurring toggle: 'mensal' sets the flag, `null` clears it,
  // `undefined` leaves the stored value untouched.
  if (patch.recorrente === 'mensal') updated.recorrente = 'mensal';
  else if (patch.recorrente === null) delete updated.recorrente;

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
// V8 — Recurring transactions (recorrente: 'mensal')
// ---------------------------------------------------------------------------

/**
 * Materialise this month's copy of every recurring template transaction.
 *
 * A "template" is any row with `recorrente === 'mensal'`.  For each one:
 *   - if the template itself is dated inside `mes`, nothing to do;
 *   - if a copy (`recorrenteDe === template.id`) already exists in `mes`,
 *     nothing to do (idempotent — safe to call on every dashboard load);
 *   - otherwise a copy is created on the same day-of-month (clamped to
 *     the month's length), marked with `recorrenteDe` so it never spawns
 *     copies of its own and can be traced back to the template.
 *
 * Returns the number of rows created (0 on the happy re-entry path).
 * No XP is awarded — this is housekeeping, not a user action.
 */
export async function ensureRecorrentes(mes: string): Promise<number> {
  const d = db();
  const all = (await d.transacoes.toArray()) as TransacaoRow[];
  const templates = all.filter(
    (t): t is Transacao => t.recorrente === 'mensal' && typeof t.id === 'number'
  );
  if (templates.length === 0) return 0;

  const doMes = all.filter((t) => t.data.startsWith(`${mes}-`));
  const [y, m] = mes.split('-').map((n) => parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 0;
  const ultimoDia = new Date(y, m, 0).getDate();

  let created = 0;
  for (const tpl of templates) {
    if (tpl.data.startsWith(`${mes}-`)) continue;
    // O utilizador apagou a cópia deste mês — respeitar e não recriar.
    if ((tpl as TransacaoRow).recorrenteSkip?.includes(mes)) continue;
    const jaExiste = doMes.some((t) => (t as TransacaoRow).recorrenteDe === tpl.id);
    if (jaExiste) continue;
    const dia = Math.min(parseInt(tpl.data.slice(8, 10), 10) || 1, ultimoDia);
    const copia: TransacaoRow = {
      tipo: tpl.tipo,
      valor: tpl.valor,
      categoria: tpl.categoria,
      descricao: tpl.descricao,
      data: `${mes}-${String(dia).padStart(2, '0')}`,
      createdAt: Date.now(),
      recorrenteDe: tpl.id
    };
    await d.transacoes.add(copia);
    created++;
  }
  return created;
}

// ---------------------------------------------------------------------------
// V8 — Month helpers + budget copy + category comparison
// ---------------------------------------------------------------------------

/** Previous calendar month of a 'YYYY-MM' key, as 'YYYY-MM'. */
export function mesAnterior(mes: string): string {
  const [y, m] = mes.split('-').map((n) => parseInt(n, 10));
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Copy every positive budget limit from the previous month into `mes`.
 * Existing limits in `mes` are never overwritten (the user's newer intent
 * wins).  Awards a single `orcamento_define` when at least one row was
 * copied.  Returns the number of budgets copied.
 */
export async function copiarOrcamentosMesAnterior(mes: string): Promise<number> {
  const prev = mesAnterior(mes);
  const anteriores = await listOrcamentos(prev);
  if (anteriores.length === 0) return 0;

  const d = db();
  let copiados = 0;
  for (const o of anteriores) {
    if (!Number.isFinite(o.limite) || o.limite <= 0) continue;
    const sep = o.id.lastIndexOf('_');
    const categoriaId = sep >= 0 ? o.id.slice(0, sep) : o.id;
    const idNovo = orcamentoId(categoriaId, mes);
    const existente = await d.orcamentos.get(idNovo);
    if (existente && existente.limite > 0) continue;
    await d.orcamentos.put({ id: idNovo, limite: o.limite, mes });
    copiados++;
  }
  if (copiados > 0) await awardXP('orcamento_define');
  return copiados;
}

/** One category's month-over-month expense movement (relatórios V8). */
export interface DeltaCategoria {
  categoriaId: string;
  atual: number;
  anterior: number;
  delta: number;              // atual - anterior (positive = spent more)
  /** % change vs previous month; null when previous was 0 (new spending). */
  percent: number | null;
}

/**
 * Compare per-category expense totals for `mes` vs the previous month.
 * Sorted by absolute delta (top movers first).  Categories with zero in
 * both months are omitted.
 */
export async function comparativoCategorias(mes: string): Promise<DeltaCategoria[]> {
  const prev = mesAnterior(mes);
  const [atual, anterior] = await Promise.all([
    totaisPorCategoria(mes),
    totaisPorCategoria(prev)
  ]);
  const ids = new Set([...Object.keys(atual), ...Object.keys(anterior)]);
  const rows: DeltaCategoria[] = [];
  for (const id of ids) {
    const a = atual[id] || 0;
    const b = anterior[id] || 0;
    if (a === 0 && b === 0) continue;
    rows.push({
      categoriaId: id,
      atual: a,
      anterior: b,
      delta: a - b,
      percent: b > 0 ? ((a - b) / b) * 100 : a > 0 ? null : 0
    });
  }
  return rows.sort((x, z) => Math.abs(z.delta) - Math.abs(x.delta));
}

// ---------------------------------------------------------------------------
// V8 — Metas de poupança (savings goals, Dexie v8 `metas` table)
// ---------------------------------------------------------------------------

/** A saved goal with the auto-incremented `id` resolved. */
export interface Meta extends MetaRow {
  id: number;
}

/** Input shape for `addMeta` — caller does NOT pass id/poupado/createdAt. */
export interface NovaMetaInput {
  nome: string;
  alvo: number;
  icone?: string;
  cor?: string;
  prazo?: string;   // 'YYYY-MM'
}

/** List every savings goal, active first (no doneAt), then newest-first. */
export async function listMetas(): Promise<Meta[]> {
  const rows = (await db().metas.orderBy('createdAt').reverse().toArray()) as Meta[];
  return rows
    .filter((r) => typeof r.id === 'number')
    .sort((a, b) => Number(Boolean(a.doneAt)) - Number(Boolean(b.doneAt)) || b.createdAt - a.createdAt);
}

/** Fetch a single goal by id, or null. */
export async function getMeta(id: number): Promise<Meta | null> {
  const row = (await db().metas.get(id)) as Meta | undefined;
  return row ?? null;
}

/** Create a savings goal.  Awards +3 XP (`meta_add`). */
export async function addMeta(input: NovaMetaInput): Promise<number> {
  const nome = input.nome.trim();
  const alvo = Number(input.alvo);
  if (!nome) throw new Error('meta_nome_vazio');
  if (!Number.isFinite(alvo) || alvo <= 0) throw new Error('meta_alvo_invalido');
  const row: MetaRow = {
    nome: nome.slice(0, 80),
    alvo,
    poupado: 0,
    icone: input.icone?.trim() || '🎯',
    cor: input.cor,
    prazo: input.prazo || undefined,
    createdAt: Date.now()
  };
  const id = (await db().metas.add(row)) as number;
  await awardXP('meta_add');
  return id;
}

/**
 * Update goal fields (nome / alvo / icone / cor / prazo).  Recomputes
 * `doneAt` if the target changed relative to the amount saved.
 */
export async function updateMeta(
  id: number,
  patch: Partial<NovaMetaInput>
): Promise<Meta | null> {
  const existing = (await db().metas.get(id)) as Meta | undefined;
  if (!existing) return null;
  const updated: Meta = {
    ...existing,
    nome: (patch.nome ?? existing.nome).trim().slice(0, 80) || existing.nome,
    alvo: Number(patch.alvo ?? existing.alvo),
    icone: patch.icone !== undefined ? (patch.icone.trim() || '🎯') : existing.icone,
    cor: patch.cor !== undefined ? patch.cor : existing.cor,
    prazo: patch.prazo !== undefined ? (patch.prazo || undefined) : existing.prazo
  };
  if (!Number.isFinite(updated.alvo) || updated.alvo <= 0) throw new Error('meta_alvo_invalido');
  if (updated.poupado >= updated.alvo) {
    if (!updated.doneAt) updated.doneAt = Date.now();
  } else {
    delete updated.doneAt;
  }
  await db().metas.put(updated);
  return updated;
}

/** Delete a savings goal.  No XP change — never punish tidying up. */
export async function deleteMeta(id: number): Promise<void> {
  await db().metas.delete(id);
}

/**
 * Add (or, with a negative value, correct) money on a goal.
 * `poupado` is clamped at ≥ 0.  Awards:
 *   - `meta_reached` (+25) the first time poupado crosses the target;
 *   - `meta_progress` (+1) for any other positive deposit.
 * Returns the updated row plus a `reached` flag so the UI can fire
 * confetti exactly once.
 */
export async function addDinheiroMeta(
  id: number,
  valor: number
): Promise<{ meta: Meta; reached: boolean } | null> {
  const existing = (await db().metas.get(id)) as Meta | undefined;
  if (!existing) return null;
  const delta = Number(valor);
  if (!Number.isFinite(delta) || delta === 0) throw new Error('meta_valor_invalido');

  // Clamp real: nunca poupar mais do que o saldo já poupado permite retirar.
  const novoPoupado = Math.max(0, Math.round((existing.poupado + delta) * 100) / 100);
  const movimento = Math.round((novoPoupado - existing.poupado) * 100) / 100;
  const updated: Meta = { ...existing, poupado: novoPoupado };
  const reached = !existing.doneAt && updated.poupado >= updated.alvo;
  if (reached) updated.doneAt = Date.now();
  if (updated.poupado < updated.alvo) delete updated.doneAt;

  await db().metas.put(updated);

  // Reconciliar com o ledger: pôr dinheiro de lado é uma saída do saldo
  // gastável (despesa em 'poupança'); levantar é uma entrada (receita). Sem
  // isto, o saldo e as metas contradiziam-se. Escrevemos direto (sem awardXP)
  // para não duplicar XP com meta_progress/meta_reached.
  if (movimento !== 0) {
    try {
      const n = new Date();
      const hoje = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
      const linked: TransacaoRow = {
        tipo: movimento > 0 ? 'despesa' : 'receita',
        valor: Math.abs(movimento),
        categoria: 'poupanca',
        descricao:
          movimento > 0
            ? `Poupança: ${existing.nome}`.slice(0, 120)
            : `Levantamento: ${existing.nome}`.slice(0, 120),
        data: hoje,
        createdAt: Date.now(),
        metaId: id
      };
      await db().transacoes.add(linked);
    } catch (e) {
      // Um falho na reconciliação nunca deve reverter o depósito na meta.
      console.warn('[financas] linked meta transaction failed (non-fatal)', e);
    }
  }

  if (reached) await awardXP('meta_reached');
  else if (delta > 0) await awardXP('meta_progress');
  return { meta: updated, reached };
}

// ---------------------------------------------------------------------------
// V8 — Chart theming (colors from CSS custom properties, not hardcoded hex)
// ---------------------------------------------------------------------------

/** Resolved theme colors for chart.js — read live from CSS variables. */
export interface ChartTheme {
  txt: string;
  txt2: string;
  txt3: string;
  grid: string;
  success: string;
  successBg: string;
  error: string;
  errorBg: string;
  accent: string;
  accentBg: string;
  border: string;
}

const CHART_THEME_FALLBACK: ChartTheme = {
  txt: 'rgb(226, 232, 240)',
  txt2: 'rgb(203, 213, 225)',
  txt3: 'rgb(148, 163, 184)',
  grid: 'rgba(148, 163, 184, 0.15)',
  success: 'rgb(16, 185, 129)',
  successBg: 'rgba(16, 185, 129, 0.7)',
  error: 'rgb(239, 68, 68)',
  errorBg: 'rgba(239, 68, 68, 0.7)',
  accent: 'rgb(236, 72, 153)',
  accentBg: 'rgba(236, 72, 153, 0.7)',
  border: 'rgba(148, 163, 184, 0.25)'
};

/**
 * Apply an alpha channel to a CSS color string.  Handles #rgb / #rrggbb
 * and rgb()/rgba() forms; anything else is returned untouched (canvas
 * fillStyle can't evaluate color-mix()/var(), so we keep it simple).
 */
export function chartColorWithAlpha(color: string, alpha: number): string {
  const c = color.trim();
  const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (hex3) {
    const [r, g, b] = [hex3[1], hex3[2], hex3[3]].map((h) => parseInt(h + h, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const hex6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(c);
  if (hex6) {
    const [r, g, b] = [hex6[1], hex6[2], hex6[3]].map((h) => parseInt(h, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (rgb) {
    const parts = rgb[1].split(',').map((p) => p.trim()).slice(0, 3);
    if (parts.length === 3) return `rgba(${parts.join(', ')}, ${alpha})`;
  }
  return c;
}

/**
 * Read the active theme's chart palette from CSS custom properties on
 * <html>.  Falls back to the dark palette during SSR or when a token is
 * missing.  Call this INSIDE the render function so a re-render after a
 * theme change picks up fresh values.
 */
export function getChartTheme(): ChartTheme {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
    return CHART_THEME_FALLBACK;
  }
  const cs = getComputedStyle(document.documentElement);
  const read = (name: string, fb: string): string => {
    const v = cs.getPropertyValue(name).trim();
    return v || fb;
  };
  const success = read('--success', CHART_THEME_FALLBACK.success);
  const error = read('--error', CHART_THEME_FALLBACK.error);
  const accent = read('--accent', CHART_THEME_FALLBACK.accent);
  const txt3 = read('--txt3', CHART_THEME_FALLBACK.txt3);
  return {
    txt: read('--txt', CHART_THEME_FALLBACK.txt),
    txt2: read('--txt2', CHART_THEME_FALLBACK.txt2),
    txt3,
    grid: chartColorWithAlpha(txt3, 0.15),
    success,
    successBg: chartColorWithAlpha(success, 0.7),
    error,
    errorBg: chartColorWithAlpha(error, 0.7),
    accent,
    accentBg: chartColorWithAlpha(accent, 0.7),
    border: chartColorWithAlpha(txt3, 0.25)
  };
}

/**
 * Subscribe to theme changes: watches the `data-theme` attribute the
 * settings page writes on <html> AND the OS-level color-scheme (for the
 * 'auto' theme).  Returns an unsubscribe function for onMount cleanup.
 */
export function onThemeChange(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const observer = new MutationObserver(() => callback());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class']
  });
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onMq = (): void => callback();
  mq.addEventListener('change', onMq);
  return () => {
    observer.disconnect();
    mq.removeEventListener('change', onMq);
  };
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

/** Format a number as a currency string in the active UI locale + chosen
 *  currency (default EUR). Currency is user-selectable in /definicoes. */
export function formatValor(v: number, loc = activeLocale(), currency = activeCurrency()): string {
  return new Intl.NumberFormat(loc, {
    style: 'currency',
    currency
  }).format(v);
}

/**
 * Compact EUR formatter for tight spaces (mobile chart y-axis ticks):
 * 1500 → "1,5 mil €" (pt-PT) / "€1.5K" (en).  Falls back to the plain
 * formatter on very old engines without `notation: 'compact'`.
 */
export function formatValorCompacto(v: number, loc = activeLocale(), currency = activeCurrency()): string {
  try {
    return new Intl.NumberFormat(loc, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(v);
  } catch {
    return formatValor(v, loc, currency);
  }
}
