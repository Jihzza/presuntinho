import { legacyCourseDetails } from './legacy-course-details';

export type SchoolCourseType = 'primary' | 'extra';

export interface SchoolLessonRef {
  slug: string;
  title: string;
  summary: string;
  quizSlug?: string;
  quizTitle?: string;
  estMinutes?: number;
  activityType?: 'theory' | 'quiz' | 'test' | 'assignment' | 'case';
  /** Override the default `/escola/licao/<unit>/<slug>/` link — for lessons
   *  whose content uses a bespoke renderer (e.g. the Português mini-curso,
   *  whose JSON schema differs from the standard section format). */
  href?: string;
}

export interface SchoolUnit {
  slug: string;
  title: string;
  icon: string;
  summary: string;
  color: string;
  lessons: SchoolLessonRef[];
  assignments?: string[];
}

export interface SchoolCourse {
  slug: string;
  title: string;
  icon: string;
  color: string;
  type: SchoolCourseType;
  tagline: string;
  summary: string;
  href: string;
  units: SchoolUnit[];
  extras?: SchoolUnit[];
}

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export interface SchoolCourseLessonDetail {
  slug: string;
  title: string;
  summary: string;
  quizSlug?: string;
  quizTitle?: string;
  estMinutes: number;
  activityType?: SchoolLessonRef['activityType'];
  href?: string;
}

export interface SchoolCourseDetail {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  icon: string;
  color: string;
  lessons: SchoolCourseLessonDetail[];
  /** Assignment ids from assignments-seed.ts (a1..a10) linked to this unit. */
  assignments?: string[];
}


const businessUnits: SchoolUnit[] = [
  {
    slug: 'marketing-digital',
    title: 'Marketing Digital',
    icon: '📱',
    color: '#06b6d4',
    summary: 'SEO, SEM, redes sociais, paid media, funis e ROI.',
    assignments: ['a1', 'a2'],
    lessons: [
      { slug: '01-fundamentos-marketing-digital', title: 'Fundamentos de Marketing Digital', summary: 'SEO orgânico, SEM pago e email marketing.', quizSlug: 'mdq', quizTitle: 'Quiz: Marketing Digital', estMinutes: 8, activityType: 'theory' },
      { slug: '02-redes-sociais-e-conteudo', title: 'Redes Sociais e Conteúdo', summary: 'Calendário editorial e conteúdo que converte.', quizSlug: 'mdq', quizTitle: 'Quiz: Marketing Digital', estMinutes: 7, activityType: 'theory' },
      { slug: '03-publicidade-paga-e-funil', title: 'Publicidade Paga e Funil', summary: 'Campanhas, audiências, criativos e funil.', quizSlug: 'mdq', quizTitle: 'Quiz: Marketing Digital', estMinutes: 8, activityType: 'theory' },
      { slug: '04-analise-e-roi', title: 'Analytics, KPIs e ROI', summary: 'Métricas de negócio, dashboards e ROI.', quizSlug: 'mdq2', quizTitle: 'Quiz avançado', estMinutes: 9, activityType: 'quiz' }
    ]
  },
  {
    slug: 'gestao-financeira',
    title: 'Gestão Financeira',
    icon: '💰',
    color: '#059669',
    summary: 'Demonstrações financeiras, rácios, orçamento e caixa.',
    assignments: ['a9'],
    lessons: [
      { slug: 'demonstracao-resultados', title: 'Demonstração de Resultados', summary: 'Receitas, custos e lucro.', quizSlug: 'gfq', estMinutes: 7, activityType: 'theory' },
      { slug: 'balanco', title: 'Balanço Patrimonial', summary: 'Activo, passivo e capital próprio.', quizSlug: 'gfq', estMinutes: 7, activityType: 'theory' },
      { slug: 'racios-financeiros', title: 'Rácios Financeiros', summary: 'Liquidez, rentabilidade e endividamento.', quizSlug: 'gfq', estMinutes: 7, activityType: 'quiz' },
      { slug: 'orcamento-empresarial', title: 'Orçamento e Caixa', summary: 'Cashflow, break-even e reserva.', quizSlug: 'gfq', estMinutes: 7, activityType: 'assignment' }
    ]
  },
  {
    slug: 'contabilidade',
    title: 'Contabilidade',
    icon: '📊',
    color: '#2563eb',
    summary: 'Partida dobrada, diário, amortizações, IVA e fecho.',
    lessons: [
      { slug: 'partida-dobrada', title: 'Sistema de Partida Dobrada', summary: 'Débito = crédito.', quizSlug: 'ctq', estMinutes: 7, activityType: 'theory' },
      { slug: 'lancamentos-contabeis', title: 'Lançamentos e Diário', summary: 'Do diário ao razão.', quizSlug: 'ctq', estMinutes: 7, activityType: 'theory' },
      { slug: 'amortizacoes', title: 'Amortizações e Provisões', summary: 'Custos ao longo da vida útil.', quizSlug: 'ctq', estMinutes: 7, activityType: 'quiz' },
      { slug: 'iva', title: 'IVA e Impostos', summary: 'IVA liquidado vs dedutível.', quizSlug: 'ctq', estMinutes: 7, activityType: 'test' }
    ]
  },
  {
    slug: 'microeconomia',
    title: 'Microeconomia',
    icon: '📉',
    color: '#dc2626',
    summary: 'Oferta, procura, elasticidade e estruturas de mercado.',
    lessons: [
      { slug: 'oferta-procura', title: 'Oferta e Procura', summary: 'A lei fundamental dos mercados.', quizSlug: 'meq', estMinutes: 7, activityType: 'theory' },
      { slug: 'elasticidade', title: 'Elasticidade Preço', summary: 'Sensibilidade da procura ao preço.', quizSlug: 'meq', estMinutes: 7, activityType: 'quiz' },
      { slug: 'estruturas-mercado', title: 'Estruturas de Mercado', summary: 'Concorrência, oligopólio e monopólio.', quizSlug: 'meq', estMinutes: 7, activityType: 'test' }
    ]
  },
  {
    slug: 'comportamento-organizacional',
    title: 'Comportamento Organizacional',
    icon: '🧠',
    color: '#6d28d9',
    summary: 'Motivação, equipas, cultura, liderança e conflitos.',
    assignments: ['a7'],
    lessons: [
      { slug: '01-comportamento-individual', title: 'Comportamento Individual', summary: 'Personalidade, motivação e percepção.', quizSlug: 'coq', estMinutes: 9, activityType: 'theory' },
      { slug: '02-dinamica-grupo-equipas', title: 'Dinâmica de Grupos e Equipas', summary: 'Tuckman, Belbin e tomada de decisão.', quizSlug: 'coq', estMinutes: 9, activityType: 'quiz' },
      { slug: '03-estrutura-organizacional-cultura-poder', title: 'Estrutura, Cultura e Poder', summary: 'Mintzberg, Schein, Hofstede e French-Raven.', quizSlug: 'coq', estMinutes: 10, activityType: 'test' },
      { slug: '04-lideranca-poder-conflitos', title: 'Liderança e Conflitos', summary: 'Poder, liderança e negociação.', quizSlug: 'coq', estMinutes: 10, activityType: 'assignment' }
    ]
  },
  {
    slug: 'marketing-internacional',
    title: 'Marketing Internacional',
    icon: '🌍',
    color: '#0ea5e9',
    summary: 'STP global, 4Ps internacionais e modos de entrada.',
    lessons: [
      { slug: '01-segmentacao-stp-global', title: 'Segmentação STP Global', summary: 'Country markets, targeting e posicionamento.', quizSlug: 'mkq', estMinutes: 10, activityType: 'theory' },
      { slug: '02-mix-global-4ps', title: 'Mix Global 4Ps', summary: 'Produto, preço, praça e promoção.', quizSlug: 'mkq', estMinutes: 10, activityType: 'quiz' },
      { slug: '03-estrategias-entrada-mercado', title: 'Estratégias de Entrada', summary: 'Exportação, JV, subsidiárias e FDI.', quizSlug: 'mkq', estMinutes: 10, activityType: 'test' }
    ]
  },
  {
    slug: 'contabilidade-gestao',
    title: 'Contabilidade de Gestão',
    icon: '📐',
    color: '#1d4ed8',
    summary: 'Sistemas de custeio, orçamentos, Balanced Scorecard e análise de desvios.',
    lessons: [
      { slug: 'custos', title: 'Sistemas de Custeio', summary: 'Custos directos, indirectos, custeio integral, variável e ABC.', quizSlug: 'cgq', quizTitle: 'Quiz: Contabilidade de Gestão', estMinutes: 9, activityType: 'theory' },
      { slug: 'orcamentos', title: 'Orçamentos e Controlo Orçamental', summary: 'Orçamento empresarial, controlo orçamental e orçamento base zero.', quizSlug: 'cgq', quizTitle: 'Quiz: Contabilidade de Gestão', estMinutes: 9, activityType: 'theory' },
      { slug: 'balanced-scorecard', title: 'Balanced Scorecard', summary: 'Perspectivas financeira, cliente, processos internos e aprendizagem.', quizSlug: 'cgq', quizTitle: 'Quiz: Contabilidade de Gestão', estMinutes: 9, activityType: 'quiz' },
      { slug: 'analise-desvios', title: 'Análise de Desvios', summary: 'Desvios de preço, quantidade, eficiência e interpretação de performance.', quizSlug: 'cgq', quizTitle: 'Quiz: Contabilidade de Gestão', estMinutes: 9, activityType: 'test' }
    ]
  },
  {
    slug: 'gestao-operacoes',
    title: 'Gestão de Operações',
    icon: '⚙️',
    color: '#0891b2',
    summary: 'Processos, capacidade, Lean, Six Sigma, MRP, EOQ, SPC e teoria das filas.',
    lessons: [
      { slug: '01-fundamentos-gestao-operacoes', title: 'Fundamentos de Gestão de Operações', summary: 'Processos, cadeia de valor de Porter e prioridades competitivas.', quizSlug: 'goq', quizTitle: 'Quiz: Gestão de Operações', estMinutes: 10, activityType: 'theory' },
      { slug: '02-design-processos-layout-flow', title: 'Design de Processos, Layout e Flow', summary: 'Bottleneck, throughput, Little’s Law, layout e gestão de capacidade.', quizSlug: 'goq', quizTitle: 'Quiz: Gestão de Operações', estMinutes: 10, activityType: 'theory' },
      { slug: '03-lean-toyota-six-sigma', title: 'Lean, Toyota Production System e Six Sigma', summary: 'TIMWOOD, 5S, kanban, JIT, jidoka, kaizen e DMAIC.', quizSlug: 'goq', quizTitle: 'Quiz: Gestão de Operações', estMinutes: 10, activityType: 'quiz' },
      { slug: '04-planeamento-controlo-operacoes', title: 'Planeamento e Controlo de Operações', summary: 'MRP, EOQ, classificação ABC, SPC, capacidade e teoria das filas.', quizSlug: 'goq', quizTitle: 'Quiz: Gestão de Operações', estMinutes: 10, activityType: 'test' }
    ]
  },
  {
    slug: 'direito-empresarial',
    title: 'Direito Empresarial',
    icon: '⚖️',
    color: '#7e22ce',
    summary: 'Fontes de direito, tipos societários, contratos, propriedade intelectual e litígios.',
    lessons: [
      { slug: '01-fontes-e-tipos-societarios', title: 'Fontes de Direito e Tipos Societários', summary: 'Fontes jurídicas da empresa e formas societárias em Portugal.', quizSlug: 'deq', quizTitle: 'Quiz: Direito Empresarial', estMinutes: 8, activityType: 'theory' },
      { slug: '02-contratos-comerciais', title: 'Contratos Comerciais e Obrigações', summary: 'Contratos, requisitos de validade, cláusulas essenciais e incumprimento.', quizSlug: 'deq', quizTitle: 'Quiz: Direito Empresarial', estMinutes: 8, activityType: 'theory' },
      { slug: '03-propriedade-intelectual', title: 'Propriedade Intelectual e Marcas', summary: 'Marcas, patentes, direitos de autor, segredos de negócio e concorrência desleal.', quizSlug: 'deq', quizTitle: 'Quiz: Direito Empresarial', estMinutes: 8, activityType: 'quiz' },
      { slug: '04-litigios-e-arbitragem', title: 'Resolução de Litígios e Arbitragem', summary: 'Tribunais, mediação, conciliação, arbitragem e cláusulas compromissórias.', quizSlug: 'deq', quizTitle: 'Quiz: Direito Empresarial', estMinutes: 8, activityType: 'test' }
    ]
  }
];

const businessExtras: SchoolUnit[] = [
  {
    slug: 'equivalenza',
    title: 'Equivalenza — case personalizado',
    icon: '🌸',
    color: '#ec4899',
    summary: 'Case/trabalho aplicado dentro de Business Administration: SWOT, buyer persona, SCQA, TOWS e recomendação.',
    // NOTE: assignment refs must exist in assignments-seed.ts (a1..a10).
    // The old 'equivalenza-midterm' id never existed in the seed, so the
    // ref was removed (V8 reconciliation).
    lessons: [
      { slug: 'swot', title: 'Análise SWOT', summary: 'Diagnóstico estratégico da Equivalenza.', quizSlug: 'q1', activityType: 'case' },
      { slug: 'persona', title: 'Buyer Persona', summary: 'Marta, 27 — The Discerning Explorer.', quizSlug: 'q4', activityType: 'case' },
      { slug: 'problem', title: 'Problema de Marketing', summary: 'SCQA: Situation, Complication, Question, Answer.', quizSlug: 'q3', activityType: 'case' },
      { slug: 'tows', title: 'Matriz TOWS', summary: 'SO, WO, ST e WT.', quizSlug: 'q2', activityType: 'case' },
      { slug: 'recommendation', title: 'Recomendação Estratégica', summary: 'Síntese final e recomendação para o case.', quizSlug: 'q3', activityType: 'case' }
    ]
  }
];

export const schoolCourses: SchoolCourse[] = [
  {
    slug: 'business-administration',
    title: 'Business Administration',
    icon: '🎓',
    color: '#3b82f6',
    type: 'primary',
    tagline: 'Curso universitário',
    summary: 'Cadeiras de gestão, marketing, finanças, economia, operações e estratégia.',
    href: '/escola/curso/business-administration/',
    units: businessUnits,
    extras: businessExtras
  },
  {
    slug: 'portugues',
    title: 'Português de Portugal',
    icon: '🇵🇹',
    color: '#10b981',
    type: 'primary',
    tagline: 'Curso independente',
    summary: 'Português separado de Business Administration, com vocabulário, diálogos, verbos e quiz.',
    href: '/escola/curso/portugues/',
    units: [
      {
        slug: 'portugues-base',
        title: 'Português base',
        icon: '🇵🇹',
        color: '#10b981',
        summary: 'Vogais, vocabulário, diálogos, verbos e quiz rápido.',
        lessons: [
          { slug: 'curso', title: 'Mini-curso de Português', summary: 'Vogais, vocabulário, diálogos, verbos e quiz.', quizSlug: 'ptq', activityType: 'theory', href: '/escola/curso/portugues/curso/' }
        ]
      }
    ]
  }
];

export const mainSchoolCourses = schoolCourses.filter((course) => course.type === 'primary');
export const businessAdministration = schoolCourses.find((course) => course.slug === 'business-administration')!;
export const portugueseCourse = schoolCourses.find((course) => course.slug === 'portugues')!;
export const businessSubjects = businessAdministration.units;
export const businessCustomLessons = businessAdministration.extras ?? [];

export function findSchoolUnit(slug: string): SchoolUnit | undefined {
  return schoolCourses.flatMap((course) => [...course.units, ...(course.extras ?? [])]).find((unit) => unit.slug === slug);
}

export function courseForUnit(slug: string): SchoolCourse | undefined {
  return schoolCourses.find((course) => [...course.units, ...(course.extras ?? [])].some((unit) => unit.slug === slug));
}

export function schoolTotals() {
  const units = schoolCourses.flatMap((course) => course.units);
  const extras = schoolCourses.flatMap((course) => course.extras ?? []);
  const allUnits = [...units, ...extras];
  return {
    primaryCourses: mainSchoolCourses.length,
    businessSubjects: businessSubjects.length,
    extras: extras.length,
    lessons: allUnits.reduce((sum, unit) => sum + unit.lessons.length, 0),
    quizzes: allUnits.reduce((sum, unit) => sum + unit.lessons.filter((lesson) => Boolean(lesson.quizSlug)).length, 0)
  };
}

export function schoolLessonDirectoryOrder(): string[] {
  return [
    ...businessCustomLessons.map((unit) => unit.slug),
    portugueseCourse.slug,
    ...businessSubjects.map((unit) => unit.slug)
  ];
}

export function schoolMetaForSlug(slug: string): Pick<SchoolUnit, 'slug' | 'title' | 'icon' | 'color'> | undefined {
  const course = schoolCourses.find((item) => item.slug === slug);
  if (course) {
    return { slug: course.slug, title: course.title, icon: course.icon, color: course.color };
  }
  const unit = findSchoolUnit(slug);
  if (unit) {
    return { slug: unit.slug, title: unit.title, icon: unit.icon, color: unit.color };
  }
  return undefined;
}


function detailFromSchoolUnit(unit: SchoolUnit): SchoolCourseDetail {
  const parent = courseForUnit(unit.slug);
  return {
    slug: unit.slug,
    title: unit.title,
    tagline: parent?.slug === 'business-administration' ? 'Business Administration · cadeira/extra' : (parent?.tagline ?? 'Curso'),
    description: unit.summary,
    icon: unit.icon,
    color: unit.color,
    lessons: unit.lessons.map((lesson) => ({
      slug: lesson.slug,
      title: lesson.title,
      summary: lesson.summary,
      quizSlug: lesson.quizSlug,
      quizTitle: lesson.quizTitle,
      estMinutes: lesson.estMinutes ?? 8,
      activityType: lesson.activityType,
      href: lesson.href
    })),
    assignments: unit.assignments
  };
}

export function schoolCourseDetailForSlug(slug: string): SchoolCourseDetail | undefined {
  const unit = findSchoolUnit(slug);
  return unit ? detailFromSchoolUnit(unit) : legacyCourseDetails[slug];
}

export function schoolQuizContextForSlug(quizSlug: string): { courseSlug: string; courseTitle: string; courseHref: string } | undefined {
  const catalogueDetails = schoolCourses.flatMap((course) => [...course.units, ...(course.extras ?? [])]).map(detailFromSchoolUnit);
  const details = [...catalogueDetails, ...Object.values(legacyCourseDetails)];
  const match = details.find((detail) => detail.lessons.some((lesson) => lesson.quizSlug === quizSlug));

  if (!match) return undefined;

  return {
    courseSlug: match.slug,
    courseTitle: match.title,
    courseHref: `/escola/curso/${match.slug}/`
  };
}

function trCatalog(t: TranslateFn, key: string, fallback: string): string {
  return t(`school.catalog.${key}`, { default: fallback });
}

function localizeLesson(t: TranslateFn, unitSlug: string, lesson: SchoolLessonRef): SchoolLessonRef {
  return {
    ...lesson,
    title: trCatalog(t, `units.${unitSlug}.lessons.${lesson.slug}.title`, lesson.title),
    summary: trCatalog(t, `units.${unitSlug}.lessons.${lesson.slug}.summary`, lesson.summary),
    quizTitle: lesson.quizTitle
      ? trCatalog(t, `units.${unitSlug}.lessons.${lesson.slug}.quizTitle`, lesson.quizTitle)
      : lesson.quizTitle
  };
}

function localizeUnit(t: TranslateFn, unit: SchoolUnit): SchoolUnit {
  return {
    ...unit,
    title: trCatalog(t, `units.${unit.slug}.title`, unit.title),
    summary: trCatalog(t, `units.${unit.slug}.summary`, unit.summary),
    lessons: unit.lessons.map((lesson) => localizeLesson(t, unit.slug, lesson))
  };
}

export function localizeSchoolCourse(t: TranslateFn, course: SchoolCourse): SchoolCourse {
  return {
    ...course,
    title: trCatalog(t, `courses.${course.slug}.title`, course.title),
    tagline: trCatalog(t, `courses.${course.slug}.tagline`, course.tagline),
    summary: trCatalog(t, `courses.${course.slug}.summary`, course.summary),
    units: course.units.map((unit) => localizeUnit(t, unit)),
    extras: course.extras?.map((unit) => localizeUnit(t, unit))
  };
}

export function localizedSchoolCourses(t: TranslateFn): SchoolCourse[] {
  return schoolCourses.map((course) => localizeSchoolCourse(t, course));
}

export function localizedMainSchoolCourses(t: TranslateFn): SchoolCourse[] {
  return localizedSchoolCourses(t).filter((course) => course.type === 'primary');
}

export function localizedBusinessAdministration(t: TranslateFn): SchoolCourse {
  return localizedSchoolCourses(t).find((course) => course.slug === 'business-administration')!;
}

export function localizedPortugueseCourse(t: TranslateFn): SchoolCourse {
  return localizedSchoolCourses(t).find((course) => course.slug === 'portugues')!;
}

export function localizedBusinessSubjects(t: TranslateFn): SchoolUnit[] {
  return localizedBusinessAdministration(t).units;
}

export function localizedBusinessCustomLessons(t: TranslateFn): SchoolUnit[] {
  return localizedBusinessAdministration(t).extras ?? [];
}

export function localizedSchoolMetaForSlug(t: TranslateFn, slug: string): Pick<SchoolUnit, 'slug' | 'title' | 'icon' | 'color'> | undefined {
  const course = localizedSchoolCourses(t).find((item) => item.slug === slug);
  if (course) return { slug: course.slug, title: course.title, icon: course.icon, color: course.color };
  const unit = localizedSchoolCourses(t)
    .flatMap((item) => [...item.units, ...(item.extras ?? [])])
    .find((item) => item.slug === slug);
  if (unit) return { slug: unit.slug, title: unit.title, icon: unit.icon, color: unit.color };
  const legacy = localizedSchoolCourseDetailForSlug(t, slug);
  if (legacy) return { slug: legacy.slug, title: legacy.title, icon: legacy.icon, color: legacy.color };
  return undefined;
}

export function localizedSchoolCourseDetailForSlug(t: TranslateFn, slug: string): SchoolCourseDetail | undefined {
  const unit = schoolCourses
    .flatMap((course) => [...course.units, ...(course.extras ?? [])])
    .find((item) => item.slug === slug);
  if (unit) return detailFromSchoolUnit(localizeUnit(t, unit));
  const legacy = legacyCourseDetails[slug];
  if (!legacy) return undefined;
  return {
    ...legacy,
    title: trCatalog(t, `legacy.${legacy.slug}.title`, legacy.title),
    tagline: trCatalog(t, `legacy.${legacy.slug}.tagline`, legacy.tagline),
    description: trCatalog(t, `legacy.${legacy.slug}.description`, legacy.description),
    lessons: legacy.lessons.map((lesson) => ({
      ...lesson,
      title: trCatalog(t, `legacy.${legacy.slug}.lessons.${lesson.slug}.title`, lesson.title),
      summary: trCatalog(t, `legacy.${legacy.slug}.lessons.${lesson.slug}.summary`, lesson.summary),
      quizTitle: lesson.quizTitle
        ? trCatalog(t, `legacy.${legacy.slug}.lessons.${lesson.slug}.quizTitle`, lesson.quizTitle)
        : lesson.quizTitle
    }))
  };
}
