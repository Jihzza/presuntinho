// Seed list of Trabalhos (school assignments) for Fatma — Phase 11 / Escola.
//
// Mirrors the seed pattern in `db.ts` (DEFAULT_CATEGORIAS, DEFAULT_HABITOS):
// a frozen-in-time array of default rows that `ensureDefaults()` only
// inserts when the table is empty, so existing users keep their own
// assignments and brand-new users get a populated dashboard the first
// time they open `/trabalhos`.
//
// All copy is pt-PT to match the rest of the app's default UI language.
// Deadlines are computed at module load time as `Date.now() + N days`
// (between 30 and 60 days out) so a user opening the app weeks from
// now still sees fresh, non-stale deadlines — they aren't baked to a
// specific calendar date that would expire.  The base timestamp is
// also stamped into `createdAt`/`updatedAt` so the row renders with
// realistic ordering on first paint.

import type { AssignmentRow } from './db';

/** Number of milliseconds in a day — used to compute deadlines. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build the seed list with deadlines relative to `Date.now()` so a
 * fresh install on any date sees realistic, non-expired urgencies.
 *
 * The `now` parameter is injectable for tests; production callers
 * pass nothing and get `Date.now()`.
 */
export function buildDefaultAssignments(now: number = Date.now()): AssignmentRow[] {
  return [
    // --- Marketing Digital ----------------------------------------------
    {
      id: 'a1',
      title: 'Plano de Marketing para PME Tunisina',
      description:
        'Elabora um plano de marketing digital completo para uma PME local (café, loja de roupas, agência de viagens, à tua escolha): público-alvo, canais, calendário editorial, KPIs e orçamento mensal em dinar.',
      curso: 'marketing-digital',
      cadeira: 'Fundamentos',
      deadline: now + 45 * DAY_MS,
      status: 'pending',
      xpReward: 120,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'a2',
      title: 'Calendário Editorial Instagram 30 dias',
      description:
        'Cria um calendário editorial de 30 dias para o Instagram de uma marca real (não precisa ser tua): temas por dia, tipo de conteúdo (reel, carrossel, story), copy curta e hashtags relevantes.',
      curso: 'marketing-digital',
      cadeira: 'Redes Sociais',
      deadline: now + 35 * DAY_MS,
      status: 'pending',
      xpReward: 90,
      createdAt: now,
      updatedAt: now
    },

    // --- Branding --------------------------------------------------------
    {
      id: 'a3',
      title: 'Brand Book Startup Local',
      description:
        'Brand book mínimo (10-15 páginas) para uma startup tunisina fictícia: missão, valores, personalidade verbal, paleta de cores com hex, tipografia, logo em várias versões e exemplos de aplicação.',
      curso: 'branding',
      cadeira: 'Identidade',
      deadline: now + 50 * DAY_MS,
      status: 'pending',
      xpReward: 140,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'a4',
      title: 'Identidade Visual Restaurante',
      description:
        'Conceito de identidade visual para um restaurante tunisino (escolhe cozinha: tradicional, fusão, street food): logo, menu tipográfico, postais de mesa e tom de comunicação para Instagram.',
      curso: 'branding',
      cadeira: 'Visual',
      deadline: now + 40 * DAY_MS,
      status: 'pending',
      xpReward: 110,
      createdAt: now,
      updatedAt: now
    },

    // --- Estratégia ------------------------------------------------------
    {
      id: 'a5',
      title: 'Análise SWOT Empresa Real',
      description:
        'Análise SWOT (Forças, Fraquezas, Oportunidades, Ameaças) de uma empresa real da Tunísia ou Portugal — pode ser uma que conheças bem. Inclui 3-5 ações por quadrante com horizonte temporal.',
      curso: 'estrategia',
      cadeira: 'Diagnóstico',
      deadline: now + 30 * DAY_MS,
      status: 'pending',
      xpReward: 100,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'a6',
      title: 'Business Model Canvas',
      description:
        'Preenche o Business Model Canvas da Osterwalder para o teu próprio projeto (ou um que aches viável): segmentos de cliente, proposta de valor, canais, relacionamento, fontes de receita e estrutura de custos.',
      curso: 'estrategia',
      cadeira: 'Modelo de Negócio',
      deadline: now + 38 * DAY_MS,
      status: 'pending',
      xpReward: 100,
      createdAt: now,
      updatedAt: now
    },

    // --- Comportamental --------------------------------------------------
    {
      id: 'a7',
      title: 'Estudo de Caso Liderança',
      description:
        'Estudo de caso (2-3 páginas) sobre um líder real que admiras: contexto, decisões-chave, estilo de liderança observado, dilemas, e o que tiraste para a tua própria prática enquanto futura gestora.',
      curso: 'comportamento-organizacional',
      cadeira: 'Liderança',
      deadline: now + 55 * DAY_MS,
      status: 'pending',
      xpReward: 130,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'a8',
      title: 'Mapa de Empatia Cliente',
      description:
        'Mapa de empatia (o que vê, ouve, pensa/sente, diz/faz, dores, ganhos) para uma persona cliente do teu projeto. Usa um nome fictício, demografia real e cita frases entre aspas para tornar a persona viva.',
      curso: 'comportamento-do-consumidor',
      cadeira: 'Pesquisa de Mercado',
      deadline: now + 32 * DAY_MS,
      status: 'pending',
      xpReward: 80,
      createdAt: now,
      updatedAt: now
    },

    // --- Gestão ----------------------------------------------------------
    {
      id: 'a9',
      title: 'Fluxo de Caixa Trimestral',
      description:
        'Demonstração de fluxos de caixa projetada para um trimestre (3 meses): receitas previstas, despesas fixas e variáveis, saldo mensal e comentário final sobre o ponto de equilíbrio.',
      curso: 'gestao-financeira',
      cadeira: 'Contabilidade',
      deadline: now + 42 * DAY_MS,
      status: 'pending',
      xpReward: 115,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'a10',
      title: 'OKRs Q3 2026',
      description:
        'Define 3 Objectives e 3-5 Key Results por Objective para o Q3 2026 do teu projeto pessoal/profissional. Inclui métrica baseline, valor-alvo e data de check-in quinzenal.',
      curso: 'gestao-inovacao',
      cadeira: 'Gestão por Objetivos',
      deadline: now + 60 * DAY_MS,
      status: 'pending',
      xpReward: 150,
      createdAt: now,
      updatedAt: now
    }
  ];
}

/**
 * Frozen-at-module-load default list, kept for any callers that want
 * the array without computing fresh deadlines. Most code should call
 * `buildDefaultAssignments()` directly so deadlines stay realistic.
 */
export const DEFAULT_ASSIGNMENTS: AssignmentRow[] = buildDefaultAssignments();
