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
      tagline: 'SEO, SEM, redes sociais, paid media, funil, analytics e ROI',
      description: 'Marketing digital na prática: SEO, SEM, redes sociais, email, Google Ads, Meta Ads, funis de conversão e medição de ROI.',
      icon: '📱',
      color: '#06b6d4',
      lessons: [
        { slug: '01-fundamentos-marketing-digital', title: '1. Fundamentos de Marketing Digital: SEO, SEM, Email Marketing', summary: 'Os três pilares do marketing digital: SEO orgânico, SEM pago e email — a base que não muda com os algoritmos.', quizSlug: 'mdq', quizTitle: 'Quiz: Marketing Digital', estMinutes: 8 },
        { slug: '02-redes-sociais-e-conteudo', title: '2. Redes Sociais e Marketing de Conteúdo', summary: 'Escolher plataformas, planear calendário editorial e construir uma máquina de conteúdo que converte sem virar refém dos algoritmos.', quizSlug: 'mdq', quizTitle: 'Quiz: Marketing Digital', estMinutes: 7 },
        { slug: '03-publicidade-paga-e-funil', title: '3. Publicidade Paga: Google Ads, Meta Ads e Funil de Conversão', summary: 'Estrutura de campanhas, lances, audiências, creatives e como ligar tudo a um funil que transforma click em cliente.', quizSlug: 'mdq', quizTitle: 'Quiz: Marketing Digital', estMinutes: 8 },
        { slug: '04-analise-e-roi', title: '4. Analytics, KPIs e ROI em Marketing Digital', summary: 'Google Analytics 4, Meta Pixel, dashboards executivos e a diferença crucial entre métricas de vaidade e métricas de negócio (receita, LTV, ROAS).', quizSlug: 'mdq2', quizTitle: 'Quiz: Marketing Digital — Avançado', estMinutes: 9 }
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
              tagline: 'Business Administration · Pessoas, equipas, cultura e liderança',
              description:
                'Como as pessoas pensam, sentem e agem nas organizações: personalidade, motivação e percepção individual (Big Five, Maslow, Herzberg, McGregor, Self-Determination Theory), dinâmica de grupos e equipas (Tuckman, Belbin, groupthink, social loafing), estrutura, cultura e poder (Mintzberg, Schein, Hofstede, French-Raven), e liderança, empowerment e gestão de conflitos (Fiedler, Path-Goal, Bass, Thomas-Kilmann).',
              icon: '🧠',
              color: '#6d28d9',
              lessons: [
                { slug: 'comportamento-individual', title: '1. Comportamento Individual: Personalidade, Motivação e Percepção', summary: 'Big Five (OCEAN), Maslow, Herzberg, McGregor, SDT de Deci-Ryan, attribution biases.', quizSlug: 'coq', quizTitle: 'Quiz: Comportamento Organizacional', estMinutes: 9 },
                { slug: 'dinamica-grupo-equipas', title: '2. Dinâmica de Grupos e Equipas', summary: 'Tuckman (5 estágios), Belbin (9 papéis), groupthink, social loafing, tomada de decisão grupal.', quizSlug: 'coq', quizTitle: 'Quiz: Comportamento Organizacional', estMinutes: 9 },
                { slug: 'estrutura-organizacional-cultura-poder', title: '3. Estrutura Organizacional, Cultura e Poder', summary: 'Mintzberg (5 configurações), Schein (3 níveis), Hofstede (6 dimensões), French-Raven (5 bases).', quizSlug: 'coq', quizTitle: 'Quiz: Comportamento Organizacional', estMinutes: 10 },
                { slug: 'lideranca-poder-conflitos', title: '4. Liderança, Poder e Gestão de Conflitos', summary: 'Path-Goal de House, empowerment de Kahn/Spreitzer, Thomas-Kilmann (5 modos), BATNA/ZOPA.', quizSlug: 'coq', quizTitle: 'Quiz: Comportamento Organizacional', estMinutes: 10 }
              ]
            },
        'gestao-inovacao': {
              slug: 'gestao-inovacao',
              title: 'Gestão da Inovação e Tecnologia',
              tagline: 'Business Administration · Inovação, design thinking e ecossistemas',
              description:
                'Inovação não é só ideia: é sistema. Aprende gestão de inovação end-to-end — Drucker, Christensen, design thinking, lean startup, funil Stage-Gate, portfolio e ecossistemas.',
              icon: '💡',
              color: '#ca8a04',
              lessons: [
                { slug: '01-fundamentos-inovacao', title: '1. Fundamentos de Inovação: Drucker, Christensen, Foster, Chesbrough e Stage-Gate', summary: 'Fontes de inovação de Drucker, sustaining vs disruptive de Christensen, S-curve de Foster, open innovation de Chesbrough e funil Stage-Gate de Cooper.', quizSlug: 'giq', quizTitle: 'Quiz: Gestão da Inovação', estMinutes: 9 },
                { slug: '02-design-thinking-e-criatividade', title: '2. Design Thinking, Criatividade e Lean Startup: Brown, Double Diamond, Ries e MVPs', summary: '5 fases de Brown (Empathize/Define/Ideate/Prototype/Test), Double Diamond do Design Council, prototipagem e Build-Measure-Learn de Ries com MVPs.', quizSlug: 'giq', quizTitle: 'Quiz: Gestão da Inovação', estMinutes: 9 },
                { slug: '03-gestao-portfolio-inovacao', title: '3. Gestão de Portfolio de Inovação: Exploitation vs Exploration, Gating, Métricas e Real Options', summary: 'Exploitation vs exploration de March, critérios de seleção strategic fit, gating, métricas (R&D intensity, time-to-market, ROI), matriz BCG e real options.', quizSlug: 'giq', quizTitle: 'Quiz: Gestão da Inovação', estMinutes: 9 },
                { slug: '04-ecossistemas-e-tecnologia', title: '4. Ecossistemas de Inovação, Plataformas e Transformação Digital: Parker, Rogers e Kane', summary: 'Platform thinking de Parker/Van Alstyne, ecossistemas (Silicon Valley, Israel, Shenzhen), IP strategy, digital transformation de Kane/Phillips e curva de adopção de Rogers.', quizSlug: 'giq', quizTitle: 'Quiz: Gestão da Inovação', estMinutes: 9 }
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
          tagline: 'Business Administration · Processos, lean, six sigma, planeamento e controlo',
          description: 'Como desenhar, operar e melhorar os processos que transformam inputs em outputs: cadeia de valor de Porter e estratégia de operações (trade-offs custo/qualidade/velocidade/flexibilidade), design de processos e análise de fluxo (bottleneck, Little\'s Law, layouts), Toyota Production System e Six Sigma (DMAIC) para excelência operacional, e planeamento e controlo (MRP, EOQ, ABC, SPC, teoria das filas).',
          icon: '⚙️',
          color: '#0891b2',
          lessons: [
            { slug: '01-fundamentos-gestao-operacoes', title: '1. Fundamentos de Gestão de Operações: Processos, Cadeia de Valor de Porter e Estratégia Operacional', summary: 'Cadeia de valor de Porter, classificação de processos (MTS/MTO/ATO), prioridades competitivas e trade-offs custo/qualidade/velocidade/flexibilidade.', quizSlug: 'goq', quizTitle: 'Quiz: Gestão de Operações', estMinutes: 9 },
            { slug: '02-design-processos-layout-flow', title: '2. Design de Processos, Análise de Fluxo e Layout: Bottleneck, Throughput e Gestão de Capacidade', summary: 'SIPOC, BPMN, Little\'s Law, TOC de Goldratt, layouts (producto, processo, fixo, celular), takt time e gestão de capacidade.', quizSlug: 'goq', quizTitle: 'Quiz: Gestão de Operações', estMinutes: 9 },
            { slug: '03-lean-toyota-six-sigma', title: '3. Lean Production, Toyota Production System e Six Sigma (DMAIC): Eliminação Sistemática de Desperdício', summary: 'TPS (JIT + Jidoka), 7 wastes TIMWOOD, 5S, kanban, andon, kaizen, Six Sigma DMAIC e integração Lean Six Sigma.', quizSlug: 'goq', quizTitle: 'Quiz: Gestão de Operações', estMinutes: 9 },
            { slug: '04-planeamento-controlo-operacoes', title: '4. Planeamento e Controlo de Operações: MRP, EOQ, SPC e Teoria das Filas', summary: 'MPS, MRP, EOQ, safety stock, ABC, cartas Shewhart, Cp/Cpk, Taguchi loss function e teoria das filas M/M/1.', quizSlug: 'goq', quizTitle: 'Quiz: Gestão de Operações', estMinutes: 9 }
                      ]
                    },
                    'analise-investimentos': {
                      slug: 'analise-investimentos',
                      title: 'Análise de Investimentos',
                      tagline: 'Business Administration · Capital budgeting, VPL/TIR, risco, custo de capital',
                      description: 'Avaliação económica de projectos de investimento: cash flows, VPL, TIR, payback, análise de risco e incerteza (sensibilidade, Monte Carlo, opções reais), custo de capital WACC e estrutura óptima de financiamento.',
                      icon: '💰',
                      color: '#059669',
                      lessons: [
                        { slug: '01-fluxos-caixa-e-vpl-tir', title: '1. Fluxos de Caixa, Valor Actual Líquido (VPL) e Taxa Interna de Rendibilidade (TIR)', summary: 'Projecção de FCF, VPL/NPV com regra de decisão VPL>0, TIR/IRR, perfil de VPL, análise incremental para mutuamente exclusivos e inflação nominal vs real (regra de Fischer).', quizSlug: 'aiq', quizTitle: 'Quiz: Análise de Investimentos', estMinutes: 9 },
                        { slug: '02-payback-e-indicadores-complementares', title: '2. Payback, Payback Descontado, Índice de Rendibilidade, EAC e MIRR', summary: 'Payback simples e descontado, Profitability Index em racionamento de capital, Equivalent Annual Cost para vidas diferentes e Modified IRR (MIRR).', quizSlug: 'aiq', quizTitle: 'Quiz: Análise de Investimentos', estMinutes: 9 },
                        { slug: '03-analise-incerteza-risco', title: '3. Análise de Incerteza e Risco: Sensibilidade, Cenários, Monte Carlo, Árvores de Decisão e Opções Reais', summary: 'Tornado diagrams (OVAT), cenários base/best/worst, simulação Monte Carlo com 10k iterações, árvores de decisão com EMV, e opções reais com intuição Black-Scholes.', quizSlug: 'aiq', quizTitle: 'Quiz: Análise de Investimentos', estMinutes: 9 },
                        { slug: '04-custo-capital-estrutura', title: '4. Custo de Capital (WACC, CAPM) e Estrutura Óptima de Financiamento', summary: 'CAPM (Ke = Rf + β×MRP), custo da dívida after-tax, WACC ponderado, Modigliani-Miller, trade-off theory e pecking order de Myers-Majluf.', quizSlug: 'aiq', quizTitle: 'Quiz: Análise de Investimentos', estMinutes: 9 }
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
                          tagline: 'Business Administration · Tipos de pesquisa, métodos qualitativos e quantitativos, amostragem e relatórios',
                          description: 'Como planear, conduzir e interpretar pesquisa de mercado: exploratória vs descritiva vs causal, qualitativa vs quantitativa, amostragem e desenho de questionário, análise de dados e relatório executivo.',
                          icon: '🔬',
                          color: '#7c3aed',
                          lessons: [
                            { slug: '01-tipos-pesquisa', title: '1. Tipos de Pesquisa (Exploratória, Descritiva, Causal)', summary: 'Quando usar cada tipo e como se encadeiam.', quizSlug: 'pmq', quizTitle: 'Quiz: Pesquisa de Marketing', estMinutes: 8 },
                            { slug: '02-metodos-qualitativos-quantitativos', title: '2. Métodos Qualitativos vs Quantitativos', summary: 'Focus groups, entrevistas, surveys e métodos mistos.', quizSlug: 'pmq', quizTitle: 'Quiz: Pesquisa de Marketing', estMinutes: 8 },
                            { slug: '03-amostragem-questionario', title: '3. Amostragem e Desenho de Questionário', summary: 'Probabilística vs não-probabilística, margem de erro e boas práticas.', quizSlug: 'pmq', quizTitle: 'Quiz: Pesquisa de Marketing', estMinutes: 8 },
                            { slug: '04-analise-relatorio', title: '4. Análise de Dados e Relatório', summary: 'Da limpeza dos dados às recomendações accionáveis.', quizSlug: 'pmq', quizTitle: 'Quiz: Pesquisa de Marketing', estMinutes: 9 }
                          ]
                        },
                        'gestao-mudanca': {
                          slug: 'gestao-mudanca',
                          title: 'Gestão da Mudança Organizacional',
                          tagline: 'Business Administration · Modelos de Kotter, ADKAR, resistência e cultura',
                          description: 'Como planear, conduzir e ancorar a mudança em organizações: tipos de mudança, modelo de 8 passos de Kotter, ADKAR da Prosci, fontes de resistência (Kotter-Schlesinger) e cultura organizacional segundo Schein.',
                          icon: '🔄',
                          color: '#14b8a6',
                          lessons: [
                            { slug: '1-conceitos-mudanca', title: '1. Conceitos Fundamentais de Mudança', summary: 'O que é mudança organizacional, tipos e porque 70% falham.', quizSlug: 'gmq', quizTitle: 'Quiz: Gestão da Mudança Organizacional', estMinutes: 8 },
                            { slug: '2-modelos-mudanca', title: '2. Modelos de Mudança (Kotter 8 + ADKAR)', summary: 'Sequência de Kotter e letras do ADKAR.', quizSlug: 'gmq', quizTitle: 'Quiz: Gestão da Mudança Organizacional', estMinutes: 9 },
                            { slug: '3-resistencia-mudanca', title: '3. Resistência à Mudança', summary: 'Quatro fontes e 8 estratégias de Kotter-Schlesinger.', quizSlug: 'gmq', quizTitle: 'Quiz: Gestão da Mudança Organizacional', estMinutes: 8 },
                            { slug: '4-cultura-organizacional', title: '4. Cultura Organizacional e Ancoragem', summary: 'Três níveis de Schein e passo 8 de Kotter.', quizSlug: 'gmq', quizTitle: 'Quiz: Gestão da Mudança Organizacional', estMinutes: 9 }
                          ]
                        },
                        'negociacao': {
                          slug: 'negociacao',
                          title: 'Técnicas de Negociação Empresarial',
                          tagline: 'Business Administration · BATNA, ZOPA, princípios e cross-cultural',
                          description: 'Como negociar de forma eficaz: fundamentos, BATNA e ZOPA, negociação baseada em princípios de Fisher & Ury, comunicação (escuta activa e CNV) e negociação internacional cross-cultural (Hofstede, Hall).',
                          icon: '🤝',
                          color: '#0369a1',
                          lessons: [
                            { slug: '1-fundamentos-negociacao', title: '1. Fundamentos de Negociação', summary: 'Distributiva vs integrativa, três pilares da preparação.', quizSlug: 'neq', quizTitle: 'Quiz: Técnicas de Negociação Empresarial', estMinutes: 8 },
                            { slug: '2-estilos-negociacao', title: '2. BATNA, ZOPA e Estilos', summary: 'BATNA forte, ZOPA, 5 estilos de Thomas-Kilmann e Fisher & Ury.', quizSlug: 'neq', quizTitle: 'Quiz: Técnicas de Negociação Empresarial', estMinutes: 9 },
                            { slug: '3-comunicacao-negociacao', title: '3. Comunicação Eficaz em Negociação', summary: 'Escuta activa, CNV, silêncio e gestão de emoções.', quizSlug: 'neq', quizTitle: 'Quiz: Técnicas de Negociação Empresarial', estMinutes: 8 },
                            { slug: '4-negociacao-internacional', title: '4. Negociação Internacional Cross-Cultural', summary: 'Hofstede, Hall high/low-context, gestão de tempo.', quizSlug: 'neq', quizTitle: 'Quiz: Técnicas de Negociação Empresarial', estMinutes: 9 }
                          ]
                        },
                        'introducao-ao-direito': {
                          slug: 'introducao-ao-direito',
                          title: 'Introdução ao Direito',
                          tagline: 'Universidade · Fontes, pessoa, obrigações e responsabilidade civil',
                          description: 'Fundamentos jurídicos para gestores: fontes do Direito (Constituição, lei, costume, jurisprudência), pessoa e capacidade, obrigações e contratos, e responsabilidade civil. Essencial para contratos, riscos e compliance.',
                          icon: '⚖️',
                          color: '#7c2d12',
                          lessons: [
                            { slug: '1-fontes-do-direito', title: '1. Fontes do Direito', summary: 'Constituição, lei, costume, jurisprudência e pirâmide de Kelsen.', quizSlug: 'idq', quizTitle: 'Quiz: Introdução ao Direito', estMinutes: 8 },
                            { slug: '2-pessoa-e-capacidade', title: '2. Pessoa e Capacidade', summary: 'Personalidade jurídica, capacidade de gozo e de exercício.', quizSlug: 'idq', quizTitle: 'Quiz: Introdução ao Direito', estMinutes: 8 },
                            { slug: '3-obrigacoes-e-contratos', title: '3. Obrigações e Contratos', summary: 'Fontes das obrigações, elementos do contrato e regimes.', quizSlug: 'idq', quizTitle: 'Quiz: Introdução ao Direito', estMinutes: 9 },
                            { slug: '4-responsabilidade-civil', title: '4. Responsabilidade Civil', summary: 'Responsabilidade contratual e extracontratual, nexo causal e dano.', quizSlug: 'idq', quizTitle: 'Quiz: Introdução ao Direito', estMinutes: 9 }
                          ]
                        },
                        'logistica': {
                          slug: 'logistica',
                          title: 'Logística',
                          tagline: 'Universidade · Cadeia de suprimentos, stocks, transporte e internacional',
                          description: 'Gestão logística e da cadeia de suprimentos: supply chain end-to-end, gestão de estoques (just-in-time, EOQ), transporte e distribuição, e logística internacional (incoterms, alfândega).',
                          icon: '🚚',
                          color: '#0f766e',
                          lessons: [
                            { slug: '1-cadeia-de-suprimentos', title: '1. Cadeia de Suprimentos', summary: 'Supply chain end-to-end: fornecedores, produção, distribuição, cliente final.', quizSlug: 'lgq', quizTitle: 'Quiz: Logística', estMinutes: 8 },
                            { slug: '2-gestao-de-estoques', title: '2. Gestão de Estoques', summary: 'JIT, EOQ, stock de segurança e ponto de encomenda.', quizSlug: 'lgq', quizTitle: 'Quiz: Logística', estMinutes: 8 },
                            { slug: '3-transporte-e-distribuicao', title: '3. Transporte e Distribuição', summary: 'Modais, roteirização e otimização da distribuição.', quizSlug: 'lgq', quizTitle: 'Quiz: Logística', estMinutes: 9 },
                            { slug: '4-logistica-internacional', title: '4. Logística Internacional', summary: 'Incoterms, alfândega, documentos e câmbios.', quizSlug: 'lgq', quizTitle: 'Quiz: Logística', estMinutes: 9 }
                          ]
                        },
                        'sistemas-de-informacao': {
                          slug: 'sistemas-de-informacao',
                          title: 'Sistemas de Informação',
                          tagline: 'Universidade · Tipos de SI, ERP, CRM, BI e segurança da informação',
                          description: 'Sistemas de Informação nas empresas: tipos de SI (TPS, MIS, DSS, ESS), ERP e CRM como plataformas de integração, Business Intelligence para decisão, e segurança da informação (confidencialidade, integridade, disponibilidade).',
                          icon: '💻',
                          color: '#1e40af',
                          lessons: [
                            { slug: '1-tipos-de-si', title: '1. Tipos de Sistemas de Informação', summary: 'TPS, MIS, DSS, ESS — quem usa e para quê.', quizSlug: 'siq', quizTitle: 'Quiz: Sistemas de Informação', estMinutes: 8 },
                            { slug: '2-erp-crm', title: '2. ERP e CRM', summary: 'Plataformas de integração: processos, dados, pessoas.', quizSlug: 'siq', quizTitle: 'Quiz: Sistemas de Informação', estMinutes: 8 },
                            { slug: '3-business-intelligence', title: '3. Business Intelligence', summary: 'Data warehouse, ETL, dashboards e decisão data-driven.', quizSlug: 'siq', quizTitle: 'Quiz: Sistemas de Informação', estMinutes: 9 },
                            { slug: '4-seguranca-da-informacao', title: '4. Segurança da Informação', summary: 'CIA triad, GDPR, criptografia e gestão de risco.', quizSlug: 'siq', quizTitle: 'Quiz: Sistemas de Informação', estMinutes: 9 }
                          ]
                        },
                        'inovacao-empreendedorismo': {
                          slug: 'inovacao-empreendedorismo',
                          title: 'Inovação e Empreendedorismo',
                          tagline: 'Universidade · Mindset, design thinking, validação e financiamento',
                          description: 'De ideia a negócio: mindset empreendedor (resiliência, orientação para oportunidades), design thinking como método de inovação centrada no utilizador, validação de ideias com MVP, customer development e lean startup, e financiamento + pitch para escalar.',
                          icon: '💡',
                          color: '#ca8a04',
                          lessons: [
                            { slug: '1-mindset-empreendedor', title: '1. Mindset Empreendedor', summary: 'Resiliência, tolerância ao risco e orientação para oportunidades.', estMinutes: 7 },
                            { slug: '2-design-thinking', title: '2. Design Thinking', summary: 'Empatia, definição, ideação, prototipagem e teste.', estMinutes: 8 },
                            { slug: '3-validacao-de-ideias', title: '3. Validação de Ideias', summary: 'MVP, customer development e ciclos build-measure-learn.', estMinutes: 8 },
                            { slug: '4-financiamento-e-pitch', title: '4. Financiamento e Pitch', summary: 'Fontes de capital, pitch deck, métricas para investidores e como abordar business angels.', quizSlug: 'ieq', quizTitle: 'Quiz: Inovação e Empreendedorismo', estMinutes: 9 }
                          ]
                        },
                        'international-business': {
                          slug: 'international-business',
                          title: 'International Business',
                          tagline: 'Universidade · Globalização, modos de entrada e multinacionais',
                          description: 'Estratégias para operar além-fronteiras: globalização e seus drivers, instituições internacionais (OMC, FMI, Banco Mundial), modos de entrada (exportação, licenciamento, JV, subsidiária, M&A), gestão de multinacionais e finanças internacionais.',
                          icon: '🌐',
                          color: '#2563eb',
                          lessons: [
                            { slug: '1-globalizacao-e-mercado-global', title: '1. Globalização e Mercado Global', summary: 'O que é globalização, drivers e instituições (OMC, FMI, Banco Mundial).', estMinutes: 8 },
                            { slug: '2-estrategias-de-entrada', title: '2. Estratégias de Entrada', summary: 'Exportação, licenciamento, franchising, joint venture, subsidiária e M&A.', estMinutes: 9 },
                            { slug: '3-gestao-de-multinacionais', title: '3. Gestão de Multinacionais', summary: 'Estratégias global, multi-doméstica, transnacional e gestão cultural.', estMinutes: 9 },
                            { slug: '4-financas-internacionais', title: '4. Finanças Internacionais', summary: 'Risco cambial, hedge, transfer pricing e financiamento cross-border.', quizSlug: 'ibq', quizTitle: 'Quiz: International Business', estMinutes: 10 }
                          ]
                        },
                        'supply-chain': {
                          slug: 'supply-chain',
                          title: 'Supply Chain Management',
                          tagline: 'Universidade · Procurement, inventário, logística e última milha',
                          description: 'Desenho, planeamento e optimização da cadeia de abastecimento: elos upstream/midstream/downstream, modelo SCOR, sistemas push vs pull, gestão de inventário (EOQ, ABC, safety stock), procurement estratégico, transporte, distribuição e last-mile.',
                          icon: '📦',
                          color: '#b45309',
                          lessons: [
                            { slug: '1-fundamentos-supply-chain', title: '1. Fundamentos de Supply Chain', summary: 'Elos upstream/midstream/downstream, modelo SCOR, push vs pull.', estMinutes: 8 },
                            { slug: '2-gestao-de-inventarios', title: '2. Gestão de Inventários', summary: 'EOQ, classificação ABC, safety stock e ponto de encomenda.', estMinutes: 8 },
                            { slug: '3-logistica-e-distribuicao', title: '3. Logística e Distribuição', summary: 'Transporte, armazenagem, Incoterms e última milha.', estMinutes: 8 },
                            { slug: '4-procurement-e-relacoes', title: '4. Procurement e Relações com Fornecedores', summary: 'Procurement estratégico, TCO, sourcing e avaliação de fornecedores.', quizSlug: 'scmq', quizTitle: 'Quiz: Supply Chain Management', estMinutes: 9 }
                          ]
                        },
                        'data-analytics': {
                          slug: 'data-analytics',
                          title: 'Data Analytics for Business',
                          tagline: 'Universidade · Descriptive/diagnostic/predictive/prescriptive, KPIs e cultura data-driven',
                          description: 'Fundamentos de analytics para gestores: os quatro tipos (descriptive, diagnostic, predictive, prescriptive), KPIs e SMART, dashboards, cohort e funnel analysis, A/B testing, data literacy e cultura data-driven na organização.',
                          icon: '📊',
                          color: '#7c3aed',
                          lessons: [
                            { slug: '1-tipos-de-analytics', title: '1. Os 4 Tipos de Analytics', summary: 'Descriptive, diagnostic, predictive e prescriptive — o que cada um responde.', estMinutes: 7 },
                            { slug: '2-kpis-e-metricas', title: '2. KPIs e Métricas', summary: 'SMART, North Star Metric, leading vs lagging indicators.', estMinutes: 7 },
                            { slug: '3-visualizacao-e-dashboards', title: '3. Visualização e Dashboards', summary: 'Boas práticas de gráficos, dashboards operacionais vs estratégicos.', estMinutes: 7 },
                            { slug: '4-cultura-data-driven', title: '4. Cultura Data-Driven', summary: 'Data literacy, experimentação contínua, cohort/funnel/A/B testing.', quizSlug: 'dataq', quizTitle: 'Quiz: Data Analytics for Business', estMinutes: 8 }
                          ]
                        },
                        'project-management': {
                          slug: 'project-management',
                          title: 'Project Management',
                          tagline: 'Universidade · Triple constraint, PMBOK, Agile e gestão de risco',
                          description: 'Metodologias de gestão de projectos: triple constraint (scope/time/cost), ciclo de vida, WBS, Gantt, critical path, Earned Value, Scrum e Kanban, gestão de riscos e stakeholders.',
                          icon: '📋',
                          color: '#0d9488',
                          lessons: [
                            { slug: '1-fundamentos-pm', title: '1. Fundamentos de Gestão de Projectos', summary: 'Triple constraint, ciclo de vida e stakeholders.', estMinutes: 7 },
                            { slug: '2-pmbok-e-metodologias-tradicionais', title: '2. PMBOK e Metodologias Tradicionais', summary: 'WBS, Gantt, critical path, Earned Value.', estMinutes: 8 },
                            { slug: '3-metodologias-ageis', title: '3. Metodologias Ágeis', summary: 'Scrum, Kanban, sprints e cerimónias ágeis.', estMinutes: 7 },
                            { slug: '4-risk-e-stakeholders', title: '4. Gestão de Risco e Stakeholders', summary: 'Risk register, matrizes de probabilidade/impacto e plano de comunicação.', quizSlug: 'pmq', quizTitle: 'Quiz: Project Management', estMinutes: 8 }
                          ]
                        },
                        'gestao-financeira-empresarial': {
                          slug: 'gestao-financeira-empresarial',
                          title: 'Gestão Financeira Empresarial',
                          tagline: 'Business Administration · Demonstrações financeiras, rácios, orçamento de capital e WACC',
                          description: 'Finanças corporativas na prática: como ler e construir as três demonstrações financeiras (DRE, Balanço, DFC), analisar rácios de liquidez, rentabilidade e endividamento, avaliar projectos de investimento com VPL/TIR/payback e decidir a melhor estrutura de capital (WACC, equity vs. dívida).',
                          icon: '💼',
                          color: '#0e7490',
                          lessons: [
                            { slug: '01-demonstracoes-financeiras', title: '1. Demonstrações Financeiras: DRE, Balanço e Fluxo de Caixa', summary: 'As três peças que contam a história da empresa: performance, posição e liquidez.', quizSlug: 'gfeq', quizTitle: 'Quiz: Gestão Financeira Empresarial', estMinutes: 9 },
                            { slug: '02-analise-de-indices', title: '2. Análise de Índices: Liquidez, Rentabilidade e Endividamento', summary: 'Rácios para medir solvência, criação de valor e estrutura de capital (DuPont).', quizSlug: 'gfeq', quizTitle: 'Quiz: Gestão Financeira Empresarial', estMinutes: 9 },
                            { slug: '03-orcamento-de-capital', title: '3. Orçamento de Capital: CAPEX/OPEX, VPL, TIR e Payback', summary: 'Decidir se um investimento cria valor: DCF, VPL, TIR, payback e análise de cenários.', quizSlug: 'gfeq', quizTitle: 'Quiz: Gestão Financeira Empresarial', estMinutes: 10 },
                            { slug: '04-estrutura-de-capital', title: '4. Estrutura de Capital: WACC, Equity vs. Dívida', summary: 'Optimizar a ponderação entre capitais próprios e dívida — CAPM, trade-off e pecking order.', quizSlug: 'gfeq', quizTitle: 'Quiz: Gestão Financeira Empresarial', estMinutes: 10 }
                          ]
                        },
                        'contabilidade-gerencial': {
                          slug: 'contabilidade-gerencial',
                          title: 'Contabilidade Gerencial',
                          tagline: 'Business Administration · Custos, CVP, orçamento industrial e ABC',
                          description: 'Como os gestores usam informação de custos para decidir, planear e controlar: classificação de custos (fixos, variáveis, directos, indirectos), análise custo-volume-lucro (CVP) e break-even, orçamento industrial e controlo orçamental, ABC e Balanced Scorecard.',
                          icon: '📊',
                          color: '#b91c1c',
                          lessons: [
                            { slug: '01-custos-classificacao-e-comportamento', title: '1. Classificação e Comportamento dos Custos: Fixos, Variáveis, Directos e Indirectos', summary: 'A base da contabilidade gerencial: como os custos se comportam face ao volume e à estrutura da empresa.', quizSlug: 'cgeq', quizTitle: 'Quiz: Contabilidade Gerencial', estMinutes: 9 },
                            { slug: '02-cvp-e-analise-break-even', title: '2. Análise Custo-Volume-Lucro (CVP) e Decisão de Curto Prazo', summary: 'Break-even point, margem de contribuição, alavancagem operacional e decisão de aceitar ou recusar um pedido.', quizSlug: 'cgeq', quizTitle: 'Quiz: Contabilidade Gerencial', estMinutes: 9 },
                            { slug: '03-orcamento-industrial-e-custos-padrao', title: '3. Orçamento Industrial e Custos-Padrão: Planear, Comparar, Corrigir', summary: 'Ciclo orçamental anual, orçamento flexível, custos-padrão e análise de desvios (variance analysis).', quizSlug: 'cgeq', quizTitle: 'Quiz: Contabilidade Gerencial', estMinutes: 10 },
                            { slug: '04-custeio-baseado-em-atividades-abc', title: '4. Custeio Baseado em Actividades (ABC) e Balanced Scorecard', summary: 'ABC como alternativa ao absorption costing, drivers de custo, e o BSC como complemento da contabilidade de gestão.', quizSlug: 'cgeq', quizTitle: 'Quiz: Contabilidade Gerencial', estMinutes: 10 }
                          ]
                        },
                        'gestao-qualidade': {
                          slug: 'gestao-qualidade',
                          title: 'Gestão da Qualidade Total',
                          tagline: 'Business Administration · TQM, ferramentas, ISO 9001 e excelência em serviços',
                          description: 'Como construir uma cultura de qualidade que atravessa toda a organização: princípios de Deming, Juran, Ishikawa e Crosby, ferramentas (Pareto, fishbone, SPC, FMEA), sistemas de gestão ISO 9001/14001/45001 com PDCA e auditorias, e qualidade em serviços via ServQual, lean services, six sigma e modelo EFQM.',
                          icon: '🎯',
                          color: '#0ea5e9',
                          lessons: [
                            { slug: '01-principios-tqm', title: '1. Princípios da TQM: Deming, Juran, Ishikawa e o Custo da Não-Qualidade', summary: 'Os 4 gurus da qualidade, trilogia de Juran, kaizen, COPQ e ISO 9000 como sistema.', quizSlug: 'gqq', quizTitle: 'Quiz: Gestão da Qualidade Total', estMinutes: 9 },
                            { slug: '02-ferramentas-qualidade', title: '2. Ferramentas da Qualidade: Pareto, Ishikawa, SPC, FMEA e Análise de Causa Raiz', summary: 'As 7 ferramentas de Ishikawa, SPC com cartas de controlo, FMEA, 5 Whys e estudo de caso.', quizSlug: 'gqq', quizTitle: 'Quiz: Gestão da Qualidade Total', estMinutes: 10 },
                            { slug: '03-sistemas-gestao-iso', title: '3. Sistemas de Gestão ISO: ISO 9001, ISO 14001, PDCA, Auditorias e Integração', summary: 'ISO 9001:2015 (10 cláusulas), PDCA, ISO 14001, ISO 45001, integração SIG e auditorias de certificação.', quizSlug: 'gqq', quizTitle: 'Quiz: Gestão da Qualidade Total', estMinutes: 10 },
                            { slug: '04-qualidade-servicos-excelencia', title: '4. Qualidade em Serviços e Excelência Operacional: ServQual, Lean Services, Six Sigma e EFQM', summary: 'IHIP, ServQual, 5 gaps de Parasuraman, lean services, DMAIC, six sigma e modelo EFQM.', quizSlug: 'gqq', quizTitle: 'Quiz: Gestão da Qualidade Total', estMinutes: 10 }
                          ]
                        },
                        'lideranca-coaching': {
                          slug: 'lideranca-coaching',
                          title: 'Liderança e Coaching',
                          tagline: 'Business Administration · Liderança situacional, coaching executivo, inteligência emocional e sucessão',
                          description: 'Como liderar pessoas com eficácia na era moderna: fundamentos das teorias de liderança (traços, comportamentos, situacional — Fiedler, Hersey-Blanchard), prática do coaching executivo (modelo GROW de Whitmore, feedback SBI), inteligência emocional do líder (os 5 pilares de Goleman e a neurociência da auto-regulação), e desenvolvimento de sucessão (pipelines de liderança, mentoring, sponsorship e high-potential programs).',
                          icon: '🧭',
                          color: '#1e3a8a',
                          lessons: [
                            { slug: '01-fundamentos-lideranca', title: '1. Fundamentos de Liderança: Traços, Comportamentos e Teorias Situacionais (Fiedler, Hersey-Blanchard)', summary: 'Três tradições (traços, comportamentos, situacional), Fiedler LPC, Hersey-Blanchard maturidade, Kotter gestão vs liderança.', quizSlug: 'lcq', quizTitle: 'Quiz: Liderança e Coaching', estMinutes: 7 },
                            { slug: '02-coaching-executivo', title: '2. Coaching Executivo: GROW Model, Feedback Eficaz e Perguntas Poderosas (Whitmore, Berg & Starr)', summary: 'GROW de Whitmore, feedback SBI, perguntas poderosas, ICF Core Competencies e distinção mentoring/terapia.', quizSlug: 'lcq', quizTitle: 'Quiz: Liderança e Coaching', estMinutes: 7 },
                            { slug: '03-inteligencia-emocional-lider', title: '3. Inteligência Emocional do Líder: Os 5 Pilares de Goleman e a Ciência do Self-Management', summary: '5 pilares de Goleman (autoconsciência, autogestão, motivação, empatia, habilidades sociais) e neurociência da auto-regulação.', quizSlug: 'lcq', quizTitle: 'Quiz: Liderança e Coaching', estMinutes: 7 },
                            { slug: '04-desenvolvimento-sucessao', title: '4. Desenvolvimento de Sucessão: Pipelines de Liderança, Mentoring e High-Potential Programs (Chamorro-Premuzic, Kram, HBR)', summary: 'Pipelines de Charan, 9-box, Hogan assessments, mentoring vs sponsorship (Ibarra/Hewlett), modelo 70-20-10 e sucessão em PME.', quizSlug: 'lcq', quizTitle: 'Quiz: Liderança e Coaching', estMinutes: 7 }
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

    <section class="lessons" aria-label="{$t('a11y.aria.licoes_do_curso', { default: 'Lições do curso' })}">
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
