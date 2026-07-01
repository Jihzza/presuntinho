// Finanças Pro — seed transactions for Fatma (task-038).
//
// Why a dedicated module instead of inline in ensureDefaults():
//   * The brief asks for 20+ realistic rows; an inline bulkPut would dwarf
//     the rest of the bootstrap helper and obscure what `ensureDefaults`
//     is doing (singleton rows + minimal category seed + habit seed).
//   * Keeping the seed declarative (typed rows in an array) makes it
//     trivial to edit values, add rows, or generate a report from the
//     same data set.
//   * When we eventually ship "Reset to demo data" in /definicoes, this
//     module is the single import to wire it to.
//
// What lives here:
//   - DEFAULT_TRANSACOES: 20 typed transactions (≥5 categories, two months
//     of history so the 6-month chart has real shape on first open).
//   - buildSeedTransacoes(now): pure helper that converts the static seed
//     into Dexie-shaped rows with `createdAt` deltas so the list renders
//     in a stable order without overwriting future user rows.
//
// What does NOT live here:
//   - Migration logic.  Seeding is idempotent via `count() === 0` in
//     ensureDefaults() — never bulkPut over a user's existing data.
//   - Realistic Tunisian BD prices.  These are *illustrative* numbers in
//     a generic currency (BRL-ish, the app's default — V4 doesn't switch
//     currency, the user just sees numeric values).  We picked values
//     that look believable for a young BA student in Tunis sharing an
//     apartment.

import type { TransacaoRow } from './db';

/**
 * Twenty seed transactions — two months of history for Fatma, a BA
 * student in Tunis.  Distribution:
 *   -  2× salario (receita)        — main + side gig
 *   -  4× habitacao  (despesa)     — rent + utilities
 *   -  4× alimentacao (despesa)    — supermarket + small shops
 *   -  3× transporte (despesa)     — monthly pass + taxi/Bolt
 *   -  3× educacao   (despesa)     — tuition + books + course
 *   -  2× lazer      (despesa)     — cinema + coffee with friends
 *   -  1× saude      (despesa)     — pharmacy
 *   -  1× beleza     (despesa)     — hairdresser
 *
 * Categories touched: salario, habitacao, alimentacao, transporte,
 * educacao, lazer, saude, beleza  (8 categories, brief asked for ≥5).
 *
 * Dates are ISO YYYY-MM-DD.  Offsets below are resolved to concrete
 * dates at runtime by `buildSeedTransacoes()` so the seed always lands
 * in the user's "current" month, not a stale one.
 */
export interface SeedTransacaoTemplate {
  tipo: TransacaoRow['tipo'];
  valor: number;
  categoria: string;
  descricao: string;
  /** Days BEFORE today.  Negative offsets (= future) are not used here. */
  offsetDias: number;
}

export const DEFAULT_TRANSACOES: readonly SeedTransacaoTemplate[] = Object.freeze([
  // --- Receitas (2) ---------------------------------------------------------
  { tipo: 'receita', valor: 2200, categoria: 'salario', descricao: 'Salário mensal — estágio BA',     offsetDias: 38 },
  { tipo: 'receita', valor: 2200, categoria: 'salario', descricao: 'Salário mensal — estágio BA',     offsetDias: 8 },
  { tipo: 'receita', valor: 350,  categoria: 'salario', descricao: 'Aulas particulares de inglês',    offsetDias: 18 },

  // --- Habitação (4) -------------------------------------------------------
  { tipo: 'despesa', valor: 750,  categoria: 'habitacao', descricao: 'Renda do apartamento (parte)',  offsetDias: 35 },
  { tipo: 'despesa', valor: 750,  categoria: 'habitacao', descricao: 'Renda do apartamento (parte)',  offsetDias: 5 },
  { tipo: 'despesa', valor: 65,   categoria: 'habitacao', descricao: 'Conta de luz',                  offsetDias: 22 },
  { tipo: 'despesa', valor: 42,   categoria: 'habitacao', descricao: 'Internet fibra',                offsetDias: 12 },

  // --- Alimentação (4) -----------------------------------------------------
  { tipo: 'despesa', valor: 95,   categoria: 'alimentacao', descricao: 'Supermercado — semana 1',     offsetDias: 33 },
  { tipo: 'despesa', valor: 88,   categoria: 'alimentacao', descricao: 'Supermercado — semana 2',     offsetDias: 19 },
  { tipo: 'despesa', valor: 24,   categoria: 'alimentacao', descricao: 'Padaria + legumes locais',    offsetDias: 10 },
  { tipo: 'despesa', valor: 18,   categoria: 'alimentacao', descricao: 'Café da manhã no campus',      offsetDias: 2 },

  // --- Transporte (3) ------------------------------------------------------
  { tipo: 'despesa', valor: 38,   categoria: 'transporte', descricao: 'Passe mensal de elétrico',      offsetDias: 30 },
  { tipo: 'despesa', valor: 14,   categoria: 'transporte', descricao: 'Bolt para a aula nocturna',     offsetDias: 16 },
  { tipo: 'despesa', valor: 9,    categoria: 'transporte', descricao: 'Táxi partilhado centro',        offsetDias: 4 },

  // --- Educação (3) --------------------------------------------------------
  { tipo: 'despesa', valor: 480,  categoria: 'educacao', descricao: 'Propina BA — mensalidade',      offsetDias: 28 },
  { tipo: 'despesa', valor: 75,   categoria: 'educacao', descricao: 'Livro "Gestão de Projectos"',   offsetDias: 14 },
  { tipo: 'despesa', valor: 30,   categoria: 'educacao', descricao: 'Curso online de Excel',         offsetDias: 1 },

  // --- Lazer (2) -----------------------------------------------------------
  { tipo: 'despesa', valor: 45,   categoria: 'lazer', descricao: 'Cinema com a Sara',                  offsetDias: 21 },
  { tipo: 'despesa', valor: 28,   categoria: 'lazer', descricao: 'Café com os colegas pós-aula',       offsetDias: 6 },

  // --- Saúde (1) + Beleza (1) ---------------------------------------------
  { tipo: 'despesa', valor: 24,   categoria: 'saude',  descricao: 'Farmácia — antigripal',          offsetDias: 11 },
  { tipo: 'despesa', valor: 60,   categoria: 'beleza', descricao: 'Cabeleireiro',                   offsetDias: 26 }
]);

/**
 * Convert the static templates into Dexie-shaped rows.  `now` is the
 * caller's reference timestamp; we add a per-index delta so the seed
 * list renders in the same order in which it was declared (no need for
 * the user to wonder why their seed is randomly shuffled).
 *
 * `createdAt` deltas start at +200 so they don't collide with the inline
 * seed in `db.ts` (which used +100..+105) — there's no schema reason for
 * this other than keeping older Dexie debugging output recognisable.
 */
export function buildSeedTransacoes(now: number): TransacaoRow[] {
  const day = 24 * 60 * 60 * 1000;
  const today = new Date();
  const iso = (offsetDays: number): string => {
    const d = new Date(today.getTime() - offsetDays * day);
    return d.toISOString().slice(0, 10);
  };
  return DEFAULT_TRANSACOES.map((t, i) => ({
    tipo: t.tipo,
    valor: t.valor,
    categoria: t.categoria,
    descricao: t.descricao,
    data: iso(t.offsetDias),
    createdAt: now + 200 + i
  }));
}