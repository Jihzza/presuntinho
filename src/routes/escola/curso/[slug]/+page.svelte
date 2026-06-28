<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  // Course detail. Phase 4 ships with one course (Equivalenza) hardcoded
  // here. When a 2nd course ships, move this into static/courses.json
  // and fetch it; until then the inline catalogue keeps the route simple.

  interface LessonRef {
    slug: string;
    title: string;
    summary: string;
    quizSlug?: string;
    quizTitle?: string;
    estMinutes: number;
  }
  interface CourseDetail {
    slug: string;
    title: string;
    tagline: string;
    description: string;
    icon: string;
    color: string;
    lessons: LessonRef[];
  }

  // Hardcoded catalogue for Phase 4 (matches static/lessons/equivalenza/*.json).
  const CATALOGUE: Record<string, CourseDetail> = {

    'marketing-digital': {
      slug: 'marketing-digital',
      title: 'Marketing Digital',
      tagline: 'Inbound, conteúdo, funis e métricas',
      description: 'Quatro lições práticas para perceber como atrair, converter e medir clientes online.',
      icon: '📱',
      color: '#06b6d4',
      lessons: [
        { slug: 'inbound', title: '1. Inbound Marketing', summary: 'Atrair clientes com conteúdo útil em vez de interromper.', quizSlug: 'mdq', quizTitle: 'Quiz: Marketing Digital', estMinutes: 6 },
        { slug: 'conteudo', title: '2. Marketing de Conteúdo', summary: 'Criar conteúdo útil, consistente e mensurável.', quizSlug: 'mdq', quizTitle: 'Quiz: Marketing Digital', estMinutes: 6 },
        { slug: 'funis', title: '3. Funis de Conversão', summary: 'Transformar atenção em relação e decisão.', quizSlug: 'mdq', quizTitle: 'Quiz: Marketing Digital', estMinutes: 6 },
        { slug: 'metricas', title: '4. Métricas Digitais', summary: 'Escolher números que orientam decisões reais.', quizSlug: 'mdq', quizTitle: 'Quiz: Marketing Digital', estMinutes: 6 }
      ]
    },
    branding: {
      slug: 'branding',
      title: 'Branding',
      tagline: 'Identidade, posicionamento e voz da marca',
      description: 'Quatro lições para construir uma marca clara, memorável e coerente.',
      icon: '✨',
      color: '#a855f7',
      lessons: [
        { slug: 'brand-identity', title: '1. Identidade de Marca', summary: 'Sinais que tornam uma marca reconhecível.', quizSlug: 'brq', quizTitle: 'Quiz: Branding', estMinutes: 6 },
        { slug: 'posicionamento', title: '2. Posicionamento', summary: 'O espaço mental que a marca quer ocupar.', quizSlug: 'brq', quizTitle: 'Quiz: Branding', estMinutes: 6 },
        { slug: 'tom-de-voz', title: '3. Tom de Voz', summary: 'Como a marca fala e se comporta.', quizSlug: 'brq', quizTitle: 'Quiz: Branding', estMinutes: 6 },
        { slug: 'brand-story', title: '4. Brand Story', summary: 'A narrativa emocional que liga marca e cliente.', quizSlug: 'brq', quizTitle: 'Quiz: Branding', estMinutes: 6 }
      ]
    },
    estrategia: {
      slug: 'estrategia',
      title: 'Estratégia',
      tagline: 'Blue Ocean, growth, OKRs e execução',
      description: 'Quatro lições para transformar ideias em escolhas, métricas e execução.',
      icon: '🧭',
      color: '#f97316',
      lessons: [
        { slug: 'blue-ocean', title: '1. Blue Ocean Strategy', summary: 'Criar espaço novo em vez de competir igual.', quizSlug: 'esq', quizTitle: 'Quiz: Estratégia', estMinutes: 6 },
        { slug: 'growth', title: '2. Growth Strategy', summary: 'Crescer com hipóteses e ciclos curtos.', quizSlug: 'esq', quizTitle: 'Quiz: Estratégia', estMinutes: 6 },
        { slug: 'okrs', title: '3. OKRs', summary: 'Objectivos inspiradores e resultados mensuráveis.', quizSlug: 'esq', quizTitle: 'Quiz: Estratégia', estMinutes: 6 },
        { slug: 'execution', title: '4. Execução Estratégica', summary: 'Prioridades, donos, rituais e feedback.', quizSlug: 'esq', quizTitle: 'Quiz: Estratégia', estMinutes: 6 }
      ]
    },
    'gestao-financeira': {
      slug: 'gestao-financeira',
      title: 'Gestão Financeira',
      tagline: 'Business Administration · Finanças empresariais',
      description: 'Aprende a ler as contas de uma empresa: demonstração de resultados, balanço, rácios e gestão de caixa.',
      icon: '💰',
      color: '#059669',
      lessons: [
        { slug: 'demonstracao-resultados', title: '1. Demonstração de Resultados', summary: 'Receitas, custos, lucro bruto, operacional e líquido.', quizSlug: 'gfq', quizTitle: 'Quiz: Gestão Financeira — Base', estMinutes: 7 },
        { slug: 'balanco', title: '2. Balanço Patrimonial', summary: 'Ativo, Passivo e Capital Próprio — a equação fundamental.', quizSlug: 'gfq', quizTitle: 'Quiz: Gestão Financeira — Base', estMinutes: 7 },
        { slug: 'racios-financeiros', title: '3. Rácios Financeiros', summary: 'Liquidez, rentabilidade e endividamento.', quizSlug: 'gfq', quizTitle: 'Quiz: Gestão Financeira — Base', estMinutes: 7 },
        { slug: 'orcamento-empresarial', title: '4. Orçamento e Gestão de Caixa', summary: 'Fluxo de caixa, break-even e reserva de emergência.', quizSlug: 'gfq', quizTitle: 'Quiz: Gestão Financeira — Base', estMinutes: 7 },
        { slug: 'fluxos-caixa', title: '5. Demonstração de Fluxos de Caixa', summary: 'Operacional, investimento e financiamento — caixa ≠ lucro.', quizSlug: 'gfq2', quizTitle: 'Quiz: Gestão Financeira — Avançado', estMinutes: 8 },
        { slug: 'ponto-equilibrio', title: '6. Break-even e Margem de Segurança', summary: 'Volume mínimo e resiliência a quedas de vendas.', quizSlug: 'gfq2', quizTitle: 'Quiz: Gestão Financeira — Avançado', estMinutes: 8 },
        { slug: 'custo-capital', title: '7. Custo de Capital e WACC', summary: 'Taxa de hurdle mínima para projetos criarem valor.', quizSlug: 'gfq2', quizTitle: 'Quiz: Gestão Financeira — Avançado', estMinutes: 8 },
        { slug: 'valorizacao-empresa', title: '8. Valorização de Empresas (Valuation)', summary: 'DCF, múltiplos e valor patrimonial.', quizSlug: 'gfq2', quizTitle: 'Quiz: Gestão Financeira — Avançado', estMinutes: 9 }
      ]
    },
        contabilidade: {
      slug: 'contabilidade',
      title: 'Contabilidade',
      tagline: 'Business Administration · Sistemas contabilísticos',
      description: 'Partida dobrada, diário, amortizações, provisões e IVA.',
      icon: '📊',
      color: '#2563eb',
      lessons: [
        { slug: 'partida-dobrada', title: '1. Sistema de Partida Dobrada', summary: 'Débito = Crédito. A base de toda a contabilidade.', quizSlug: 'ctq', quizTitle: 'Quiz: Contabilidade — Base', estMinutes: 7 },
        { slug: 'lancamentos-contabeis', title: '2. Lançamentos e Diário', summary: 'Do diário ao razão: registar operações.', quizSlug: 'ctq', quizTitle: 'Quiz: Contabilidade — Base', estMinutes: 7 },
        { slug: 'amortizacoes', title: '3. Amortizações e Provisões', summary: 'Distribuir custos ao longo da vida útil.', quizSlug: 'ctq', quizTitle: 'Quiz: Contabilidade — Base', estMinutes: 7 },
        { slug: 'iva', title: '4. IVA e Impostos', summary: 'IVA liquidado vs. dedutível, taxas e contabilização.', quizSlug: 'ctq', quizTitle: 'Quiz: Contabilidade — Base', estMinutes: 7 },
        { slug: 'balancete-razonetes', title: '5. Balancete e Razonetes', summary: 'Verificação débitos = créditos e representação em T.', quizSlug: 'ctq2', quizTitle: 'Quiz: Contabilidade — Avançado', estMinutes: 8 },
        { slug: 'inventario-permanente', title: '6. Inventário Permanente', summary: 'FIFO, LIFO e custo médio ponderado.', quizSlug: 'ctq2', quizTitle: 'Quiz: Contabilidade — Avançado', estMinutes: 8 },
        { slug: 'fecho-exercicio', title: '7. Fecho do Exercício', summary: 'Apuramento de resultados e demonstrações finais.', quizSlug: 'ctq2', quizTitle: 'Quiz: Contabilidade — Avançado', estMinutes: 8 },
        { slug: 'normas-ifrs', title: '8. Normas SNC e IFRS', summary: 'Padrões contabilísticos que garantem comparabilidade.', quizSlug: 'ctq2', quizTitle: 'Quiz: Contabilidade — Avançado', estMinutes: 9 }
      ]
    },
        microeconomia: {
      slug: 'microeconomia',
      title: 'Microeconomia',
      tagline: 'Business Administration · Mercados e preços',
      description: 'Oferta, procura, elasticidade, estruturas de mercado e custos.',
      icon: '📉',
      color: '#dc2626',
      lessons: [
        { slug: 'oferta-procura', title: '1. Oferta e Procura', summary: 'A lei fundamental dos mercados.', quizSlug: 'meq', quizTitle: 'Quiz: Microeconomia — Base', estMinutes: 7 },
        { slug: 'elasticidade', title: '2. Elasticidade Preço', summary: 'Sensibilidade da procura ao preço.', quizSlug: 'meq', quizTitle: 'Quiz: Microeconomia — Base', estMinutes: 7 },
        { slug: 'estruturas-mercado', title: '3. Estruturas de Mercado', summary: 'Concorrência perfeita, monopolística, oligopólio, monopólio.', quizSlug: 'meq', quizTitle: 'Quiz: Microeconomia — Base', estMinutes: 7 },
        { slug: 'custos-producao', title: '4. Custos de Produção', summary: 'Fixos, variáveis, marginais e economias de escala.', quizSlug: 'meq', quizTitle: 'Quiz: Microeconomia — Base', estMinutes: 7 },
        { slug: 'utilidade-escolha', title: '5. Teoria do Consumidor', summary: 'Utilidade, curvas de indiferença e utilidade marginal.', quizSlug: 'meq2', quizTitle: 'Quiz: Microeconomia — Avançado', estMinutes: 8 },
        { slug: 'teoria-producao', title: '6. Teoria da Produção', summary: 'Rendimentos de escala, curto vs longo prazo.', quizSlug: 'meq2', quizTitle: 'Quiz: Microeconomia — Avançado', estMinutes: 8 },
        { slug: 'externalidades', title: '7. Externalidades e Falhas de Mercado', summary: 'Custos e benefícios não refletidos nos preços.', quizSlug: 'meq2', quizTitle: 'Quiz: Microeconomia — Avançado', estMinutes: 8 },
        { slug: 'bens-publicos', title: '8. Bens Públicos e Comuns', summary: 'Não-rivais, não-exclusivos e o problema do free-rider.', quizSlug: 'meq2', quizTitle: 'Quiz: Microeconomia — Avançado', estMinutes: 9 }
      ]
    },
        'recursos-humanos': {
      slug: 'recursos-humanos',
      title: 'Gestão de Recursos Humanos',
      tagline: 'Business Administration · Gestão de pessoas',
      description: 'Recrutamento, motivação, avaliação de desempenho e cultura.',
      icon: '👥',
      color: '#7c3aed',
      lessons: [
        { slug: 'recrutamento-selecao', title: '1. Recrutamento e Seleção', summary: 'Encontrar as pessoas certas para o cargo.', quizSlug: 'rhq', quizTitle: 'Quiz: Recursos Humanos — Base', estMinutes: 7 },
        { slug: 'motivacao', title: '2. Teorias de Motivação', summary: 'Maslow, Herzberg e McGregor.', quizSlug: 'rhq', quizTitle: 'Quiz: Recursos Humanos — Base', estMinutes: 7 },
        { slug: 'avaliacao-desempenho', title: '3. Avaliação de Desempenho', summary: '360°, MBO e objetivos SMART.', quizSlug: 'rhq', quizTitle: 'Quiz: Recursos Humanos — Base', estMinutes: 7 },
        { slug: 'cultura-organizacional', title: '4. Cultura Organizacional', summary: 'Valores, rituais e liderança pelo exemplo.', quizSlug: 'rhq', quizTitle: 'Quiz: Recursos Humanos — Base', estMinutes: 7 },
        { slug: 'treinamento-desenvolvimento', title: '5. Treinamento e Desenvolvimento', summary: 'T&D e o modelo de Kirkpatrick para medir impacto.', quizSlug: 'rhq2', quizTitle: 'Quiz: Recursos Humanos — Avançado', estMinutes: 8 },
        { slug: 'remuneracao-beneficios', title: '6. Remuneração e Benefícios', summary: 'Compensação total: salário, variáveis, benefícios, flexibilidade.', quizSlug: 'rhq2', quizTitle: 'Quiz: Recursos Humanos — Avançado', estMinutes: 8 },
        { slug: 'clima-engajamento', title: '7. Clima e Engajamento', summary: 'Drivers de comprometimento e como medir com responsabilidade.', quizSlug: 'rhq2', quizTitle: 'Quiz: Recursos Humanos — Avançado', estMinutes: 8 },
        { slug: 'relacoes-laborais', title: '8. Relações Laborais e Sindicalismo', summary: 'Contratos coletivos, comissões e diálogo social.', quizSlug: 'rhq2', quizTitle: 'Quiz: Recursos Humanos — Avançado', estMinutes: 9 }
      ]
    },
        'comportamento-organizacional': {
      slug: 'comportamento-organizacional',
      title: 'Comportamento Organizacional',
      tagline: 'Business Administration · Comportamento nas organizações',
      description: 'Liderança, dinâmica de equipas, comunicação e gestão da mudança.',
      icon: '🧠',
      color: '#0891b2',
      lessons: [
        { slug: 'lideranca', title: '1. Estilos de Liderança', summary: 'Autocrático, democrático, situacional, transformacional.', quizSlug: 'coq', quizTitle: 'Quiz: Comportamento Organizacional — Base', estMinutes: 7 },
        { slug: 'trabalho-equipa', title: '2. Dinâmica de Equipas', summary: 'Tuckman: Forming → Storming → Norming → Performing.', quizSlug: 'coq', quizTitle: 'Quiz: Comportamento Organizacional — Base', estMinutes: 7 },
        { slug: 'comunicacao', title: '3. Comunicação e Negociação', summary: 'Escuta ativa, win-win e BATNA.', quizSlug: 'coq', quizTitle: 'Quiz: Comportamento Organizacional — Base', estMinutes: 7 },
        { slug: 'gestao-mudanca', title: '4. Gestão da Mudança', summary: 'Modelo Kotter (8 passos) e curva da mudança.', quizSlug: 'coq', quizTitle: 'Quiz: Comportamento Organizacional — Base', estMinutes: 7 },
        { slug: 'motivacao-teorias', title: '5. Teorias da Motivação', summary: 'Maslow, Herzberg, McGregor e auto-determinação.', quizSlug: 'coq2', quizTitle: 'Quiz: Comportamento Organizacional — Avançado', estMinutes: 8 },
        { slug: 'conflito-negociacao', title: '6. Conflito e Negociação', summary: 'Tipos de conflito, negociação integrativa e BATNA.', quizSlug: 'coq2', quizTitle: 'Quiz: Comportamento Organizacional — Avançado', estMinutes: 8 },
        { slug: 'poder-politica', title: '7. Poder e Política nas Organizações', summary: 'Fontes de poder formais e informais.', quizSlug: 'coq2', quizTitle: 'Quiz: Comportamento Organizacional — Avançado', estMinutes: 8 },
        { slug: 'bem-estar-organizacional', title: '8. Bem-Estar e Saúde Mental', summary: 'Sinais de burnout e ações concretas do líder.', quizSlug: 'coq2', quizTitle: 'Quiz: Comportamento Organizacional — Avançado', estMinutes: 9 }
      ]
    },
    equivalenza: {
      slug: 'equivalenza',
      title: 'Equivalenza — The Scent of a Second Chance',
      tagline: 'BCOBM311 Mid-Term · Case study completo',
      description:
        'Cinco lições + quatro quizzes para dominares o case Equivalenza: da análise SWOT à recomendação estratégica final. Tudo com audio walkthrough em PT.',
      icon: '🌸',
      color: '#ec4899',
      lessons: [
        {
          slug: 'swot',
          title: '1. Análise SWOT',
          summary: 'Strengths, Weaknesses, Opportunities, Threats — o diagnóstico estratégico da Equivalenza.',
          quizSlug: 'q1',
          quizTitle: 'Q1 — SWOT (Verdadeiro/Falso)',
          estMinutes: 8
    },
        {
          slug: 'persona',
          title: '2. Buyer Persona',
          summary: 'Marta, 27 — The Discerning Explorer. Três camadas: demográfica, psicográfica, comportamental.',
          quizSlug: 'q4',
          quizTitle: 'Q4 — Buyer Persona',
          estMinutes: 7
    },
        {
          slug: 'problem',
          title: '3. Problema de Marketing (SCQA)',
          summary: 'Situation → Complication → Question → Answer. Onde a análise vira problema formulado.',
          quizSlug: 'q3',
          quizTitle: 'Q3 — Case Knowledge',
          estMinutes: 6
    },
        {
          slug: 'tows',
          title: '4. Matriz TOWS',
          summary: 'SO, WO, ST, WT — quatro tipos de estratégia. Apresentação em matriz 2×2.',
          quizSlug: 'q2',
          quizTitle: 'Q2 — TOWS Quadrants',
          estMinutes: 7
    },
        {
          slug: 'recommendation',
          title: '5. Recomendação Estratégica',
          summary: 'Defende uma TOWS. Viabilidade + plano de implementação. Última lição — não tem quiz.',
          estMinutes: 9
        }
      ]
    },
    macroeconomia: {
      slug: 'macroeconomia',
      title: 'Macroeconomia',
      tagline: 'Business Administration · A economia como um todo',
      description: 'PIB, inflação, política monetária e comércio internacional — os quatro blocos que todo gestor precisa de entender.',
      icon: '🌍',
      color: '#0ea5e9',
      lessons: [
        { slug: 'pib', title: '1. PIB (Produto Interno Bruto)', summary: 'Como se mede a riqueza gerada por um país.', quizSlug: 'mceq', quizTitle: 'Quiz: Macroeconomia', estMinutes: 8 },
        { slug: 'inflacao', title: '2. Inflação e Índice de Preços', summary: 'Por que o dinheiro perde valor e como se mede.', quizSlug: 'mceq', quizTitle: 'Quiz: Macroeconomia', estMinutes: 8 },
        { slug: 'politica-monetaria', title: '3. Política Monetária', summary: 'Banco central, taxa de juro, oferta de moeda.', quizSlug: 'mceq', quizTitle: 'Quiz: Macroeconomia', estMinutes: 8 },
        { slug: 'comercio-internacional', title: '4. Comércio Internacional', summary: 'Balança de pagamentos, câmbios, protecionismo e livre-câmbio.', quizSlug: 'mceq', quizTitle: 'Quiz: Macroeconomia', estMinutes: 9 }
      ]
    },
    'marketing-estrategico': {
      slug: 'marketing-estrategico',
      title: 'Marketing Estratégico',
      tagline: 'Business Administration · Pensar marketing como sistema',
      description: 'STP, mix marketing (4P), posicionamento e brand equity.',
      icon: '🎯',
      color: '#e11d48',
      lessons: [
        { slug: 'stp', title: '1. Segmentação, Targeting e Positioning (STP)', summary: 'Dividir o mercado, escolher onde competir, ocupar um espaço.', quizSlug: 'meq-est', quizTitle: 'Quiz: Marketing Estratégico', estMinutes: 8 },
        { slug: 'mix-marketing', title: '2. Mix Marketing (4P)', summary: 'Produto, preço, praça e promoção como alavancas.', quizSlug: 'meq-est', quizTitle: 'Quiz: Marketing Estratégico', estMinutes: 8 },
        { slug: 'posicionamento', title: '3. Posicionamento Estratégico', summary: 'Linha de valor e reason-to-believ na cabeça do cliente.', quizSlug: 'meq-est', quizTitle: 'Quiz: Marketing Estratégico', estMinutes: 8 },
        { slug: 'brand-equity', title: '4. Brand Equity', summary: 'Awareness, associações, qualidade percebida e lealdade.', quizSlug: 'meq-est', quizTitle: 'Quiz: Marketing Estratégico', estMinutes: 9 }
      ]
    },
    'etica-negocios': {
          slug: 'etica-negocios',
          title: 'Ética nos Negócios',
          tagline: 'Business Administration · Decisões responsáveis',
          description: 'Governança, responsabilidade social, sustentabilidade e compliance.',
          icon: '⚖️',
          color: '#16a34a',
          lessons: [
            { slug: 'governanca-corporativa', title: '1. Governança Corporativa', summary: 'Conselho de administração, agência, transparência e accountability.', quizSlug: 'enq', quizTitle: 'Quiz: Ética nos Negócios', estMinutes: 8 },
            { slug: 'responsabilidade-social', title: '2. Responsabilidade Social Empresarial (RSE)', summary: 'Caroll, pirâmide de Carroll e stakeholder theory.', quizSlug: 'enq', quizTitle: 'Quiz: Ética nos Negócios', estMinutes: 8 },
            { slug: 'sustentabilidade', title: '3. Sustentabilidade e ESG', summary: 'Ambiental, social e governance — do greenwashing à estratégia.', quizSlug: 'enq', quizTitle: 'Quiz: Ética nos Negócios', estMinutes: 8 },
            { slug: 'compliance', title: '4. Compliance e Programas de Integridade', summary: 'Políticas, controlos, canal de denúncias e cultura ética.', quizSlug: 'enq', quizTitle: 'Quiz: Ética nos Negócios', estMinutes: 9 }
          ]
        },
        'direito-empresarial': {
          slug: 'direito-empresarial',
          title: 'Direito Empresarial',
          tagline: 'Business Administration · Direito das empresas',
          description: 'Tipos societários, contratos comerciais, propriedade intelectual e arbitragem em Portugal.',
          icon: '⚖️',
          color: '#7e22ce',
          lessons: [
            { slug: '01-fontes-e-tipos-societarios', title: '1. Fontes de Direito e Tipos Societários', summary: 'Onde se encontra o direito das empresas e que formas jurídicas pode assumir.', quizSlug: 'deq', quizTitle: 'Quiz: Direito Empresarial', estMinutes: 8 },
            { slug: '02-contratos-comerciais', title: '2. Contratos Comerciais e Obrigações', summary: 'Requisitos de validade, cláusulas essenciais e resolução por incumprimento.', quizSlug: 'deq', quizTitle: 'Quiz: Direito Empresarial', estMinutes: 8 },
            { slug: '03-propriedade-intelectual', title: '3. Propriedade Intelectual e Marcas', summary: 'Marcas no INPI, patentes, direitos de autor e concorrência desleal.', quizSlug: 'deq', quizTitle: 'Quiz: Direito Empresarial', estMinutes: 8 },
            { slug: '04-litigios-e-arbitragem', title: '4. Resolução de Litígios e Arbitragem', summary: 'Tribunais, mediação, arbitragem e cláusula compromissória.', quizSlug: 'deq', quizTitle: 'Quiz: Direito Empresarial', estMinutes: 9 }
          ]
        },
        'gestao-operacoes': {
          slug: 'gestao-operacoes',
          title: 'Gestão de Operações',
          tagline: 'Business Administration · Processos e supply chain',
          description: 'Estratégia operacional, qualidade, capacidade e supply chain.',
          icon: '🏭',
          color: '#ea580c',
          lessons: [
            { slug: '01-conceitos-e-estrategia-operacional', title: '1. Conceitos e Estratégia de Operações', summary: 'Tipos de processos, prioridades competitivas e servitização.', quizSlug: 'goq', quizTitle: 'Quiz: Gestão de Operações', estMinutes: 8 },
            { slug: '02-qualidade-e-melhoria-continua', title: '2. Qualidade, Kaizen e Six Sigma', summary: 'Deming, PDCA, DMAIC e ferramentas de melhoria contínua.', quizSlug: 'goq', quizTitle: 'Quiz: Gestão de Operações', estMinutes: 8 },
            { slug: '03-capacidade-e-planeamento', title: '3. Capacidade, Layout e Planeamento', summary: 'Capacidade efectiva, layouts, MPS/MRP e push vs. pull.', quizSlug: 'goq', quizTitle: 'Quiz: Gestão de Operações', estMinutes: 8 },
            { slug: '04-supply-chain-e-lean', title: '4. Supply Chain e Lean Management', summary: 'Os sete desperdícios, EOQ e integração Lean/Agile.', quizSlug: 'goq', quizTitle: 'Quiz: Gestão de Operações', estMinutes: 9 }
          ]
        },
        'analise-financeira': {
                  slug: 'analise-financeira',
                  title: 'Análise Financeira',
                  tagline: 'Business Administration · Interpretar demonstrações financeiras',
                  description: 'Rácios, fluxos de caixa e valuation — como ler as contas de uma empresa.',
                  icon: '📈',
                  color: '#0d9488',
                  lessons: [
                    { slug: '01-racios-de-liquidez', title: '1. Rácios de Liquidez e Solvência', summary: 'Liquidez geral, reduzida, imediata e estrutura de capital.', quizSlug: 'afq', quizTitle: 'Quiz: Análise Financeira', estMinutes: 8 },
                    { slug: '02-racios-de-rentabilidade', title: '2. Rácios de Rentabilidade e Eficiência', summary: 'Margens, ROE, ROA e a decomposição DuPont.', quizSlug: 'afq', quizTitle: 'Quiz: Análise Financeira', estMinutes: 8 },
                    { slug: '03-analise-de-fluxos-caixa', title: '3. Análise de Fluxos de Caixa e FCF', summary: 'Demonstração de fluxos, Free Cash Flow, EBITDA e conversão.', quizSlug: 'afq', quizTitle: 'Quiz: Análise Financeira', estMinutes: 8 },
                    { slug: '04-valuation-dcf-e-multiplos', title: '4. Valuation: DCF e Múltiplos', summary: 'Discounted Cash Flow, WACC, PER e margem de segurança.', quizSlug: 'afq', quizTitle: 'Quiz: Análise Financeira', estMinutes: 9 }
                  ]
                },
                'comportamento-do-consumidor': {
                  slug: 'comportamento-do-consumidor',
                  title: 'Comportamento do Consumidor',
                  tagline: 'Business Administration · Factores de decisão e jornada omnichannel',
                  description: 'Porque é que os consumidores escolhem, compram e usam produtos — do modelo de Kotler à experiência omnichannel.',
                  icon: '🛍️',
                  color: '#db2777',
                  lessons: [
                    { slug: '01-fatores-influencia-decisao', title: '1. Factores que Influenciam a Decisão de Compra', summary: 'Culturais, sociais, pessoais e psicológicos.', quizSlug: 'ccq', quizTitle: 'Quiz: Comportamento do Consumidor', estMinutes: 8 },
                    { slug: '02-processo-decisao', title: '2. Processo de Decisão (5 Estágios)', summary: 'Reconhecimento, pesquisa, avaliação, decisão e pós-compra.', quizSlug: 'ccq', quizTitle: 'Quiz: Comportamento do Consumidor', estMinutes: 8 },
                    { slug: '03-segmentacao-personas', title: '3. Segmentação e Personas', summary: 'Critérios de segmentação, STP e construção de personas.', quizSlug: 'ccq', quizTitle: 'Quiz: Comportamento do Consumidor', estMinutes: 8 },
                    { slug: '04-comportamento-digital', title: '4. Comportamento Digital e Omnichannel', summary: 'Mobile-first, social commerce e integração de canais.', quizSlug: 'ccq', quizTitle: 'Quiz: Comportamento do Consumidor', estMinutes: 9 }
                  ]
                },
                'pesquisa-de-marketing': {
                  slug: 'pesquisa-de-marketing',
                  title: 'Pesquisa de Marketing',
                  tagline: 'Business Administration · Explorar, descrever e testar em marketing',
                  description: 'Pesquisa de mercado do planeamento ao relatório — exploratória, descritiva, causal e análise de dados.',
                  icon: '🔬',
                  color: '#7c3aed',
                  lessons: [
                    { slug: '01-tipos-pesquisa', title: '1. Tipos de Pesquisa (Exploratória, Descritiva, Causal)', summary: 'Quando usar cada tipo e como se encadeiam.', quizSlug: 'pmq', quizTitle: 'Quiz: Pesquisa de Marketing', estMinutes: 8 },
                    { slug: '02-metodos-qualitativos-quantitativos', title: '2. Métodos Qualitativos vs Quantitativos', summary: 'Focus groups, entrevistas, surveys e métodos mistos.', quizSlug: 'pmq', quizTitle: 'Quiz: Pesquisa de Marketing', estMinutes: 8 },
                    { slug: '03-amostragem-questionario', title: '3. Amostragem e Desenho de Questionário', summary: 'Probabilística vs não-probabilística, margem de erro e boas práticas.', quizSlug: 'pmq', quizTitle: 'Quiz: Pesquisa de Marketing', estMinutes: 8 },
                    { slug: '04-analise-relatorio', title: '4. Análise de Dados e Relatório', summary: 'Da limpeza dos dados às recomendações accionáveis.', quizSlug: 'pmq', quizTitle: 'Quiz: Pesquisa de Marketing', estMinutes: 9 }
                  ]
                }
              };

  let courseSlug = $derived(page.params.slug ?? '');
  let course = $derived<CourseDetail | undefined>(CATALOGUE[courseSlug]);
  let loadError = $state<string | null>(null);

  onMount(() => {
    if (!course) loadError = `Curso "${courseSlug}" não encontrado.`;
  });

  // SEO — used by <svelte:head> below.  The catalogue is hardcoded so
  // the title is stable per slug; falls back to a generic literal
  // until the catalogue loads.
  // i18n: wrap catalogue literals in $t() with PT fallback so that future
    // locales can override them via routes.escola.curso.<slug>.{title,description,tagline}
    // without touching the CATALOGUE constant.
    let courseTitle = $derived(
      course ? $t(`routes.escola.curso.${course.slug}.title`, { default: course.title }) : ''
    );
    let courseTagline = $derived(
      course ? $t(`routes.escola.curso.${course.slug}.tagline`, { default: course.tagline }) : ''
    );
    let courseDescription = $derived(
      course ? $t(`routes.escola.curso.${course.slug}.description`, { default: course.description }) : ''
    );

    let pageTitle = $derived(
      course ? `${courseTitle} · Curso · Escola` : 'Curso · Escola'
    );
    let description = $derived(
      courseDescription?.slice(0, 160) || 'Curso e lições'
    );
</script>

<svelte:head>
  <title>{pageTitle} · Presuntinho</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content="https://presuntinho.netlify.app/escola/curso/" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={description} />
</svelte:head>

{#if loadError}
  <div class="course">
    <p class="error">{loadError}</p>
    <p><a href="/escola/">← Voltar à Escola</a></p>
  </div>
{:else if !course}
  <p class="loading">A carregar curso…</p>
{:else}
  <div class="course" style="--course-color: {course.color};">
    <header class="course-head">
      <p class="breadcrumb">
        <a href="/escola/">{$t('lesson.breadcrumb.escola', { default: 'Escola' })}</a>
        <span class="sep">›</span>
        <span>{courseTitle}</span>
      </p>
      <div class="title-row">
        <span class="icon" aria-hidden="true">{course.icon}</span>
        <div>
          <span class="tag">{$t('escola.curso.slug.tag', { default: 'Curso' })}</span>
          <h1>{courseTitle}</h1>
                    <p class="tagline">{courseTagline}</p>
                  </div>
                </div>
                <p class="desc">{courseDescription}</p>
      <p class="meta">
        <span>📚 {course.lessons.length} lições</span>
        <span>⏱ ~{course.lessons.reduce((a, l) => a + l.estMinutes, 0)} min no total</span>
      </p>
    </header>

    <section class="lessons" aria-label="Lições do curso">
      <h2 class="section-title">{$t('escola.curso.plan.title', { default: 'Plano de aulas' })}</h2>
      <ol class="lesson-list">
        {#each course.lessons as lesson, i (lesson.slug)}
          <li class="lesson-item">
            <a class="lesson-link" href={`/escola/licao/${course.slug}/${lesson.slug}/`}>
              <div class="lesson-num" aria-hidden="true">{i + 1}</div>
              <div class="lesson-meta">
                <h3>{lesson.title}</h3>
                <p>{lesson.summary}</p>
                <span class="lesson-time">⏱ ~{lesson.estMinutes} min</span>
              </div>
              <span class="lesson-cta" aria-hidden="true">→</span>
            </a>
    {#if lesson.quizSlug}
              <a
                class="quiz-link"
                href={`/escola/quiz/${lesson.quizSlug}/`}
                title={lesson.quizTitle ?? 'Quiz'}
              >
                📝 {lesson.quizTitle ?? 'Quiz'}
              </a>
    {/if}
          </li>
        {/each}
      </ol>
    </section>
  </div>
{/if}

<style>
  .course {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .breadcrumb {
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    margin: 0 0 0.5rem;
  }
  .breadcrumb a { color: var(--accent, #ec4899); text-decoration: none; }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }

  .tag {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    background: rgba(59, 130, 246, 0.25);
    border: 1px solid rgba(59, 130, 246, 0.5);
    color: #bfdbfe;
    border-radius: 999px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  .icon { font-size: 3rem; }
  .course-head h1 { color: #fff; margin: 0.25rem 0; font-size: 1.75rem; }
  .tagline { color: var(--course-color, #ec4899); margin: 0; font-weight: 500; }
  .desc {
    color: var(--txt2, #cbd5e1);
    line-height: 1.5;
    margin: 0 0 0.75rem;
  }
  .meta {
    display: flex;
    gap: 1rem;
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    margin: 0;
  }

  .section-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3, #94a3b8);
    margin: 2rem 0 0.75rem 0.25rem;
    font-weight: 600;
  }

  .lesson-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }
  .lesson-item {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.6rem;
    overflow: hidden;
  }
  .lesson-link {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.9rem 1rem;
    color: #fff;
    text-decoration: none;
    transition: background 0.15s;
  }
  .lesson-link:hover, .lesson-link:focus-visible {
    background: rgba(255, 255, 255, 0.06);
    outline: none;
  }
  .lesson-num {
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--course-color, #ec4899);
    color: #fff;
    border-radius: 50%;
    font-weight: 700;
    font-size: 0.95rem;
  }
  .lesson-meta { flex: 1; min-width: 0; }
  .lesson-meta h3 { margin: 0 0 0.2rem; font-size: 1rem; color: #fff; }
  .lesson-meta p { margin: 0 0 0.3rem; color: var(--txt2, #cbd5e1); font-size: 0.88rem; }
  .lesson-time { color: var(--txt3, #94a3b8); font-size: 0.78rem; }
  .lesson-cta {
    color: var(--course-color, #ec4899);
    font-size: 1.4rem;
    font-weight: 600;
  }

  .quiz-link {
    display: block;
    padding: 0.55rem 1rem;
    background: rgba(236, 72, 153, 0.08);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    color: #fbcfe8;
    text-decoration: none;
    font-size: 0.85rem;
    transition: background 0.15s;
  }
  .quiz-link:hover { background: rgba(236, 72, 153, 0.16); }

  .loading, .error {
    color: rgba(255, 255, 255, 0.7);
    text-align: center;
    padding: 2rem 0;
  }
  .error { color: #ff8888; }
</style>
