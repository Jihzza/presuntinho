// Seed list of bookmarks for the Biblioteca sub-app (Phase 8 + task-025).
//
// Mirrors the seed pattern in `assignments-seed.ts` and the existing
// `DEFAULT_CATEGORIAS` / `DEFAULT_HABITOS` arrays in db.ts: a
// frozen-in-time list of default rows that the integrator calls ONLY
// when the `biblioteca` table is empty (so existing users keep their
// own bookmarks and brand-new users get a populated list the first
// time they open `/biblioteca`).
//
// All seed rows target the Fatma profile (PT UI, school / marketing /
// gestão / risco topics) and are wired to four of the Escola slug
// cursors and to five of the assignment ids (`a1`..`a10`) from
// `assignments-seed.ts`.  `curso_id` and `assignment_id` are stored on
// the row (introduced by task-025) but the seed function does NOT
// auto-insert — that's the integrator's call (so a fresh install on
// any date sees realistic `createdAt` timestamps without forcing
// every Fatma device to inherit the same preset list).
//
// Why pass `now` as an argument: same rationale as
// `assignments-seed.ts` — lets tests stamp deterministic timestamps.
// Production callers pass nothing and get `Date.now()`.

import type { BibliotecaRow } from './db';

/**
 * Build the seed list of 10 Biblioteca bookmarks with timestamps
 * relative to `now` so a fresh install always sees a realistic
 * "newest-first" ordering.  Returns plain `BibliotecaRow[]` (no `id`,
 * no Dexie write) — the integrator decides where/when to `bulkPut`.
 *
 * `curso_id` matches slugs from `src/routes/escola/+page.svelte`
 * COURSES array (marketing-digital, branding, estrategia,
 * gestao-financeira, gestao-risco) and `assignment_id` matches the
 * `a1`..`a10` ids from `assignments-seed.ts`.
 */
export function buildDefaultBookmarks(now: number = Date.now()): BibliotecaRow[] {
  // 1 day = 86_400_000 ms — we spread `createdAt` across the last ~10 days
  // so the list renders newest-first with a non-bunchy ordering on first paint.
  const day = 24 * 60 * 60 * 1000;
  // baseStamp = 10 days ago, then each row increments by 1 day
  const baseStamp = now - 10 * day;

  return [
    // --- Marketing Digital (curso: marketing-digital, 2 bookmarks) ---
    {
      title: 'Kotler & Keller — Marketing Management (15ª ed.)',
      url: 'https://www.pearson.com/en-us/subject-catalog/p/marketing-management-the-edition-pearson-international-edition/P200000003509/9780137736487',
      description:
        'Bíblia do marketing. Para a cadeira de Fundamentos e para qualquer trabalho que envolva STP, 4Ps ou estratégia. Recomendo o cap. 2 (marketing management), 7 (criação valor) e 10 (segmentação).',
      tags: ['marketing', 'livro', 'referência'],
      curso_id: 'marketing-digital',
      assignment_id: 'a1',
      createdAt: baseStamp
    },
    {
      title: 'Google — Think with Google: Marketing Insights',
      url: 'https://www.thinkwithgoogle.com/intl/en-145/',
      description:
        'Case studies reais de campanhas digitais com resultados auditados. Útil para justificar decisões em Trabalhos sobre SEO, SEM, redes sociais ou paid media.',
      tags: ['marketing-digital', 'case-studies'],
      curso_id: 'marketing-digital',
      assignment_id: 'a2',
      createdAt: baseStamp + 1 * day
    },

    // --- Branding (curso: branding) ---
    {
      title: 'Wally Olins — Brand New: The Shape of Brands to Come',
      url: 'https://www.amazon.com/dp/0500289147',
      description:
        'Visão antiga mas brilhante sobre como marcas nacionais se tornam globais. Tem uma secção inteira sobre Tunisia Telecom e outras marcas do Magrebe — material raro para o trabalho de brand book.',
      tags: ['branding', 'livro', 'magrebe'],
      curso_id: 'branding',
      createdAt: baseStamp + 2 * day
    },

    // --- Estratégia ---
    {
      title: 'Harvard Business Review — SWOT Analysis (artigo)',
      url: 'https://hbr.org/2005/12/the-essentials-of-successful-strategic-planning',
      description:
        'Artigo curto, denso, sobre como escolher os critérios certos para uma SWOT. Ao lado do exercício prático do trabalho a5.',
      tags: ['estratégia', 'swot', 'artigo'],
      curso_id: 'estrategia',
      assignment_id: 'a5',
      createdAt: baseStamp + 3 * day
    },
    {
      title: 'Strategyzer — Business Model Canvas (template PDF)',
      url: 'https://www.strategyzer.com/library/the-business-model-canvas',
      description:
        'Template oficial imprimível do Osterwalder Pigneur. Para usar como base do trabalho a6 sobre Business Model Canvas.',
      tags: ['estratégia', 'canvas', 'template'],
      curso_id: 'estrategia',
      assignment_id: 'a6',
      createdAt: baseStamp + 4 * day
    },

    // --- Comportamento Organizacional ---
    {
      title: 'Kotter — What Leaders Really Do (HBR 1990)',
      url: 'https://hbr.org/1990/05/what-leaders-really-do',
      description:
        'Curto (~7 min de leitura). Para o trabalho a7 sobre estudo de caso de liderança. Mostra a diferença entre management e leadership de forma clara.',
      tags: ['liderança', 'hbr', 'artigo'],
      assignment_id: 'a7',
      createdAt: baseStamp + 5 * day
    },

    // --- Gestão Financeira ---
    {
      title: 'Investopedia — Cash Flow Statement (guia)',
      url: 'https://www.investopedia.com/terms/c/cashflowstatement.asp',
      description:
        'Definições e exemplos de operating / investing / financing cash flows. Material de apoio para o trabalho a9 sobre fluxo de caixa trimestral.',
      tags: ['finanças', 'contabilidade', 'guia'],
      curso_id: 'gestao-financeira',
      assignment_id: 'a9',
      createdAt: baseStamp + 6 * day
    },

    // --- Gestão de Risco ---
    {
      title: 'COSO — ERM Framework (resumo executivo, PDF)',
      url: 'https://www.coso.org/Documents/2017-COSO-ERM-Integrating-with-Strategy-and-Performance-Executive-Summary.pdf',
      description:
        '30 páginas — a forma como o framework define risco, apetite ao risco e resposta (avoid/reduce/share/accept). Bom complemento para capítulos sobre gestão de risco.',
      tags: ['risco', 'coso', 'framework', 'pdf'],
      curso_id: 'gestao-risco',
      createdAt: baseStamp + 7 * day
    },

    // --- Sem curso / bookmark pessoal ---
    {
      title: 'Notion — Como escrever OKRs que funcionam (template grátis)',
      url: 'https://www.notion.so/templates/okr-template',
      description:
        'Template simples com 3 Objectives + 4 KRs por objective. Boa base para o trabalho a10 sobre OKRs Q3.',
      tags: ['okr', 'template', 'gestão'],
      assignment_id: 'a10',
      createdAt: baseStamp + 8 * day
    },
    {
      title: 'Vale do Silício — Newsletter Lenny Rachitsky',
      url: 'https://www.lennysnewsletter.com/',
      description:
        'Product management / growth. Sai todo Domingo. Para inspiração geral sobre como pensar métricas, experiments e storytelling de produto.',
      tags: ['newsletter', 'product', 'growth'],
      createdAt: baseStamp + 9 * day
    }
  ];
}

/**
 * Frozen-at-module-load default list, kept for any callers that want
 * the array without computing fresh timestamps.  Most code should
 * call `buildDefaultBookmarks()` directly so createdAt stays recent.
 */
export const DEFAULT_BOOKMARKS: BibliotecaRow[] = buildDefaultBookmarks();
