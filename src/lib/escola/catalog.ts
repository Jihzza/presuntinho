export type SchoolCourseType = 'primary' | 'extra';

export interface SchoolLessonRef {
  slug: string;
  title: string;
  summary: string;
  quizSlug?: string;
  quizTitle?: string;
  estMinutes?: number;
  activityType?: 'theory' | 'quiz' | 'test' | 'assignment' | 'case';
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
  }
];

const businessExtras: SchoolUnit[] = [
  {
    slug: 'equivalenza',
    title: 'Equivalenza — case personalizado',
    icon: '🌸',
    color: '#ec4899',
    summary: 'Case/trabalho aplicado dentro de Business Administration: SWOT, buyer persona, SCQA, TOWS e recomendação.',
    assignments: ['equivalenza-midterm'],
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
          { slug: 'curso', title: 'Mini-curso de Português', summary: 'Português de Portugal para a Fatma.', quizSlug: 'ptq', activityType: 'theory' }
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
