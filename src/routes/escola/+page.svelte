<script lang="ts">
  // Escola hub — list of available courses. Phase 4 ships with one course
  // (Equivalenza); the registry below is the source of truth for the cards
  // shown here. New courses = add an entry to COURSES + create the lesson
  // JSONs under static/lessons/<slug>/.

  import { t } from 'svelte-i18n';

  interface Course {
    slug: string;
    title: string;
    tagline: string;
    description: string;
    icon: string;
    color: string;
    lessonCount: number;
    quizCount: number;
    badge?: string;
  }

  const COURSES: Course[] = [
    {
      slug: 'equivalenza',
      title: 'Equivalenza — The Scent of a Second Chance',
      tagline: 'BCOBM311 Mid-Term · Case study completo',
      description:
        'Deep dive na marca espanhola de fragrâncias affordable: SWOT, Buyer Persona, Marketing Problem (SCQA), TOWS e Recomendação Estratégica. Cinco lições + quatro quizzes.',
      icon: '🌸',
      color: '#ec4899',
      lessonCount: 5,
      quizCount: 4,
      badge: 'Atual'
    },
    {
      slug: 'portugues',
      title: 'Português de Portugal 🇵🇹',
      tagline: 'Mini-curso desenhado para Tunisianos',
      description:
        'Aprende Português de Portugal com comparações ao Árabe Tunisiano + Francês + Inglês. Vogais, vocabulário, diálogos, verbos essenciais e quiz rápido.',
      icon: '🇵🇹',
      color: '#10b981',
      lessonCount: 1,
      quizCount: 1,
      badge: 'Novo'
    },
    {
          slug: 'marketing-digital',
          title: 'Marketing Digital',
          tagline: 'Business Administration · SEO, SEM, redes sociais, paid media, funil, analytics e ROI',
          description:
            'Marketing digital na prática: como aparecer organicamente (SEO), pagar para aparecer (SEM), construir audiência em redes sociais e email, gerir campanhas pagas (Google Ads + Meta Ads), desenhar funis de conversão e medir tudo com KPIs que importam (CAC, LTV, ROAS).',
          icon: '📱',
          color: '#06b6d4',
          lessonCount: 4,
          quizCount: 2,
          badge: 'Uni'
        },
    {
      slug: 'branding',
      title: 'Branding',
      tagline: 'Identidade, posicionamento e voz da marca',
      description:
        'Aprende a construir uma marca reconhecível: sinais visuais, posicionamento, tom de voz e brand story.',
      icon: '✨',
      color: '#a855f7',
      lessonCount: 4,
      quizCount: 1,
      badge: 'Novo'
    },
    {
      slug: 'estrategia',
      title: 'Estratégia',
      tagline: 'Blue Ocean, growth, OKRs e execução',
      description:
        'Um mini-curso para transformar ideias em prioridades, métricas e execução semanal.',
      icon: '🧭',
      color: '#f97316',
      lessonCount: 4,
      quizCount: 1,
      badge: 'Novo'
    },
    {
      slug: 'estrategia-corporativa',
      title: 'Estratégia Corporativa Avançada',
      tagline: 'Business Administration Avançado · Análise externa (PESTEL, 5 Forces, value chain), análise interna (VRIO, McKinsey 7S), estratégias corporativas (Ansoff, BCG, integração) e implementação (BSC, OKRs)',
      description:
        'A cadeira avançada de estratégia para decisores C-level: análise externa profunda (PESTEL, Porter Five Forces, value chain, strategic groups), análise interna baseada em recursos (VRIO, RBV, SWOT estratégico, McKinsey 7S), estratégias corporativas (Ansoff, BCG e GE-McKinsey portfolio, integração vertical/horizontal, diversificação), e implementação (Balanced Scorecard, OKRs, McKinsey 7S, strategic control e change management).',
      icon: '🧭',
      color: '#f97316',
      lessonCount: 4,
      quizCount: 1,
      badge: 'Advanced'
    },
    {
      slug: 'gestao-financeira',
      title: 'Gestão Financeira',
      tagline: 'Business Administration · Demonstração de resultados, balanço, rácios e caixa',
      description:
        'Aprende a ler as contas de uma empresa: demonstração de resultados, balanço patrimonial, rácios financeiros e gestão de caixa. Conteúdo universitário de Business Administration.',
      icon: '💰',
      color: '#059669',
      lessonCount: 8,
      quizCount: 2,
      badge: 'Uni'
    },
    {
      slug: 'contabilidade',
      title: 'Contabilidade',
      tagline: 'Business Administration · Partida dobrada, diário, amortizações e IVA',
      description:
        'Domina os fundamentos da contabilidade: partida dobrada, lançamentos no diário, amortizações e provisões, IVA e impostos. Conceitos essenciais para qualquer gestor.',
      icon: '📊',
      color: '#2563eb',
      lessonCount: 8,
      quizCount: 2,
      badge: 'Uni'
    },
    {
      slug: 'microeconomia',
      title: 'Microeconomia',
      tagline: 'Business Administration · Oferta, procura, elasticidade e estruturas de mercado',
      description:
        'Compreende como os mercados funcionam: oferta e procura, elasticidade-preço, estruturas de mercado (monopólio, oligopólio, concorrência) e custos de produção.',
      icon: '📉',
      color: '#dc2626',
      lessonCount: 8,
      quizCount: 2,
      badge: 'Uni'
    },
    {
      slug: 'recursos-humanos',
      title: 'Gestão de Recursos Humanos',
      tagline: 'Business Administration · Recrutamento, motivação, avaliação e cultura',
      description:
        'Tudo sobre gestão de pessoas: recrutamento e seleção, teorias de motivação (Maslow, Herzberg, McGregor), avaliação de desempenho e cultura organizacional.',
      icon: '👥',
      color: '#7c3aed',
      lessonCount: 8,
      quizCount: 2,
      badge: 'Uni'
    },
    {
      slug: 'comportamento-organizacional',
      title: 'Comportamento Organizacional',
      tagline: 'Business Administration · Pessoas, equipas, cultura e liderança',
      description:
        'Como as pessoas pensam, sentem e agem nas organizações: personalidade, motivação e percepção individual (Big Five, Maslow, Herzberg, McGregor, Self-Determination Theory), dinâmica de grupos e equipas (Tuckman, Belbin, groupthink, social loafing), estrutura, cultura e poder (Mintzberg, Schein, Hofstede, French-Raven), e liderança, empowerment e gestão de conflitos (Fiedler, Path-Goal, Bass, Thomas-Kilmann).',
      icon: '🧠',
      color: '#6d28d9',
      lessonCount: 4,
      quizCount: 1,
      badge: 'Uni'
      },
    {
          slug: 'gestao-inovacao',
          title: 'Gestão da Inovação e Tecnologia',
          tagline: 'Business Administration · Inovação, design thinking e ecossistemas',
          description:
            'Inovação não é só ideia: é sistema. Aprende gestão de inovação end-to-end — Drucker, Christensen, design thinking, lean startup, funil Stage-Gate, portfolio e ecossistemas.',
          icon: '💡',
          color: '#ca8a04',
          lessonCount: 4,
          quizCount: 1,
          badge: 'Uni'
        },
        {
          slug: 'comercio-internacional',
          title: 'Comércio Internacional',
          tagline: 'Business Administration · Teorias do comércio, estratégias de entrada, finanças, logística e marketing internacional',
          description:
            'Porque é que os países trocam? Como escolher mercados externos e entrar neles? Como gerir câmbios, Incoterms, cartas de crédito? Como vender além-fronteiras? Teorias (Smith, Ricardo, Heckscher-Ohlin, Stolper-Samuelson), integração económica (OMC, GATT, blocos regionais), cadeias globais de valor (Gereffi), modos de entrada (exportação, licenciamento, franchising, JV, subsidiária, M&A), Uppsala, Born Globals, Incoterms 2020, UCP 600, trade finance, marketing internacional 4Ps, Hofstede, CISG e arbitragem ICC/UNCITRAL.',
          icon: '🌐',
          color: '#0e7490',
          lessonCount: 4,
          quizCount: 1,
          badge: 'Uni'
        },
    {
      slug: 'macroeconomia',
      title: 'Macroeconomia',
      tagline: 'Business Administration · PIB, inflação, política monetária e comércio internacional',
      description:
        'Vê a economia como um todo: como se mede o PIB, por que a inflação corrói o valor, como o banco central controla juros e moeda, e como países trocam bens e capitais.',
      icon: '🌍',
      color: '#0ea5e9',
      lessonCount: 4,
      quizCount: 1,
      badge: 'Uni'
    },
    {
      slug: 'marketing-estrategico',
      title: 'Marketing Estratégico',
      tagline: 'Business Administration · STP, mix marketing, posicionamento e brand equity',
      description:
        'Aprende a pensar marketing como sistema: segmentar o mercado, escolher onde competir (STP), desenhar o mix (4P) e construir brand equity que protege margem.',
      icon: '🎯',
      color: '#e11d48',
      lessonCount: 4,
      quizCount: 1,
      badge: 'Uni'
    },
    {
          slug: 'etica-negocios',
          title: 'Ética nos Negócios',
          tagline: 'Business Administration · Governança, responsabilidade social, sustentabilidade e compliance',
          description:
            'Decisões empresariais têm consequências humanas, sociais e ambientais. Aprende frameworks de governança, ESG, sustentabilidade e compliance para líderes responsáveis.',
          icon: '⚖️',
          color: '#16a34a',
          lessonCount: 4,
          quizCount: 1,
          badge: 'Uni'
        },
        {
          slug: 'direito-empresarial',
          title: 'Direito Empresarial',
          tagline: 'Business Administration · Tipos societários, contratos, propriedade intelectual e arbitragem',
          description:
            'Fundamentos jurídicos da empresa em Portugal: tipos societários (Lda., SA, Unipessoal), contratos comerciais e cláusulas essenciais, marcas, patentes e resolução de litígios.',
          icon: '⚖️',
          color: '#7e22ce',
          lessonCount: 4,
          quizCount: 1,
          badge: 'Uni'
        },
        {
          slug: 'gestao-operacoes',
          title: 'Gestão de Operações',
          tagline: 'Business Administration · Processos, qualidade, capacidade e supply chain',
          description:
            'Como desenhar, operar e melhorar processos que transformam inputs em outputs: estratégia operacional, qualidade e Six Sigma, capacidade e layout, supply chain e Lean.',
          icon: '🏭',
          color: '#ea580c',
          lessonCount: 4,
          quizCount: 1,
          badge: 'Uni'
        },
        {
                  slug: 'analise-financeira',
                  title: 'Análise Financeira',
                  tagline: 'Business Administration · Rácios, fluxos de caixa e valuation',
                  description:
                    'Como interpretar as demonstrações financeiras para avaliar desempenho e valor: rácios de liquidez, solvência e rentabilidade, free cash flow e métodos de valuation.',
                  icon: '📈',
                  color: '#0d9488',
                  lessonCount: 4,
                  quizCount: 1,
                  badge: 'Uni'
                },
                {
                  slug: 'comportamento-do-consumidor',
                  title: 'Comportamento do Consumidor',
                  tagline: 'Business Administration · Factores de decisão, jornada, segmentação e omnichannel',
                  description:
                    'Como e por que os consumidores escolhem, compram e usam produtos: factores culturais, sociais, pessoais e psicológicos, processo de decisão em 5 estágios, segmentação e personas, e comportamento digital.',
                  icon: '🛍️',
                  color: '#db2777',
                  lessonCount: 4,
                  quizCount: 1,
                  badge: 'Uni'
                },
                {
                                  slug: 'pesquisa-de-marketing',
                                  title: 'Pesquisa de Marketing',
                                  tagline: 'Business Administration · Tipos de pesquisa, métodos qualitativos e quantitativos, amostragem e relatórios',
                                  description:
                                    'Como planear, conduzir e interpretar pesquisa de mercado: exploratória vs descritiva vs causal, qualitativa vs quantitativa, amostragem e desenho de questionário, análise de dados e relatório executivo.',
                                  icon: '🔬',
                                  color: '#7c3aed',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'gestao-mudanca',
                                  title: 'Gestão da Mudança Organizacional',
                                  tagline: 'Business Administration · Modelos de Kotter, ADKAR, resistência e cultura',
                                  description:
                                    'Como planear, conduzir e ancorar a mudança em organizações: tipos de mudança, modelo de 8 passos de Kotter, ADKAR da Prosci, fontes de resistência (Kotter-Schlesinger) e cultura organizacional segundo Schein.',
                                  icon: '🔄',
                                  color: '#14b8a6',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'negociacao',
                                  title: 'Técnicas de Negociação Empresarial',
                                  tagline: 'Business Administration · BATNA, ZOPA, negociação de princípios e cross-cultural',
                                  description:
                                    'Como negociar de forma eficaz em contexto empresarial: fundamentos, BATNA e ZOPA, negociação baseada em princípios de Fisher & Ury, comunicação (escuta activa e CNV) e negociação internacional cross-cultural (Hofstede, Hall).',
                                  icon: '🤝',
                                  color: '#0369a1',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'introducao-ao-direito',
                                  title: 'Introdução ao Direito',
                                  tagline: 'Universidade · Fontes, pessoa, obrigações e responsabilidade civil',
                                  description:
                                    'Fundamentos jurídicos para gestores: fontes do Direito (Constituição, lei, costume, jurisprudência), pessoa e capacidade, obrigações e contratos, e responsabilidade civil. Essencial para contratos, riscos e compliance.',
                                  icon: '⚖️',
                                  color: '#7c2d12',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'logistica',
                                  title: 'Logística',
                                  tagline: 'Universidade · Cadeia de suprimentos, stocks, transporte e operações internacionais',
                                  description:
                                    'Gestão logística e da cadeia de suprimentos: supply chain end-to-end, gestão de estoques (just-in-time, EOQ), transporte e distribuição, e logística internacional (incoterms, alfândega).',
                                  icon: '🚚',
                                  color: '#0f766e',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'sistemas-de-informacao',
                                  title: 'Sistemas de Informação',
                                  tagline: 'Universidade · Tipos de SI, ERP, CRM, BI e segurança da informação',
                                  description:
                                    'Sistemas de Informação nas empresas: tipos de SI (TPS, MIS, DSS, ESS), ERP e CRM como plataformas de integração, Business Intelligence para decisão, e segurança da informação (confidencialidade, integridade, disponibilidade).',
                                  icon: '💻',
                                  color: '#1e40af',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'inovacao-empreendedorismo',
                                  title: 'Inovação e Empreendedorismo',
                                  tagline: 'Universidade · Mindset, design thinking, validação e financiamento',
                                  description:
                                    'De ideia a negócio: mindset empreendedor (resiliência, orientação para oportunidades), design thinking como método de inovação centrada no utilizador, validação de ideias com MVP, customer development e lean startup, e financiamento + pitch para escalar.',
                                  icon: '💡',
                                  color: '#ca8a04',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'international-business',
                                  title: 'International Business',
                                  tagline: 'Universidade · Globalização, modos de entrada e multinacionais',
                                  description:
                                    'Estratégias para operar além-fronteiras: globalização e seus drivers, instituições internacionais (OMC, FMI, Banco Mundial), modos de entrada (exportação, licenciamento, JV, subsidiária, M&A), gestão de multinacionais e finanças internacionais.',
                                  icon: '🌐',
                                  color: '#2563eb',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'supply-chain',
                                  title: 'Supply Chain Management',
                                  tagline: 'Universidade · Procurement, inventário, logística e última milha',
                                  description:
                                    'Desenho, planeamento e optimização da cadeia de abastecimento: elos upstream/midstream/downstream, modelo SCOR, sistemas push vs pull, gestão de inventário (EOQ, ABC, safety stock), procurement estratégico, transporte, distribuição e last-mile.',
                                  icon: '📦',
                                  color: '#b45309',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'data-analytics',
                                  title: 'Data Analytics for Business',
                                  tagline: 'Universidade · Descriptive/diagnostic/predictive/prescriptive, KPIs e cultura data-driven',
                                  description:
                                    'Fundamentos de analytics para gestores: os quatro tipos (descriptive, diagnostic, predictive, prescriptive), KPIs e SMART, dashboards, cohort e funnel analysis, A/B testing, data literacy e cultura data-driven na organização.',
                                  icon: '📊',
                                  color: '#7c3aed',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'project-management',
                                  title: 'Project Management',
                                  tagline: 'Universidade · Triple constraint, PMBOK, Agile e gestão de risco',
                                  description:
                                    'Metodologias de gestão de projectos: triple constraint (scope/time/cost), ciclo de vida, WBS, Gantt, critical path, Earned Value, Scrum e Kanban, gestão de riscos e stakeholders.',
                                  icon: '📋',
                                  color: '#0d9488',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'gestao-financeira-empresarial',
                                  title: 'Gestão Financeira Empresarial',
                                  tagline: 'Business Administration · Demonstrações financeiras, rácios, orçamento de capital e WACC',
                                  description:
                                    'Finanças corporativas na prática: como ler e construir as três demonstrações financeiras (DRE, Balanço, DFC), analisar rácios de liquidez, rentabilidade e endividamento, avaliar projectos de investimento com VPL/TIR/payback e decidir a melhor estrutura de capital (WACC, equity vs. dívida).',
                                  icon: '💼',
                                  color: '#0e7490',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'contabilidade-gerencial',
                                  title: 'Contabilidade Gerencial',
                                  tagline: 'Business Administration · Custos, CVP, orçamento industrial e ABC',
                                  description:
                                    'Como os gestores usam informação de custos para decidir, planear e controlar: classificação de custos (fixos, variáveis, directos, indirectos), análise custo-volume-lucro (CVP) e break-even, orçamento industrial e controlo orçamental, ABC e Balanced Scorecard.',
                                  icon: '📊',
                                  color: '#b91c1c',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'empreendedorismo',
                                  title: 'Empreendedorismo e Plano de Negócios',
                                  tagline: 'Business Administration · Mindset, BMC, MVP, pitch a investidores',
                                  description:
                                    'A cadeira mais prática da BA: como transformar uma ideia num negócio sustentável. Cobre mindset empreendedor (effectuation, journey, biases), Business Model Canvas, validação de problema e MVP (4 tipos), plano de negócios completo e pitch de 3-5 minutos para investidores.',
                                  icon: '🚀',
                                  color: '#e11d48',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'gestao-qualidade',
                                  title: 'Gestão da Qualidade Total',
                                  tagline: 'Business Administration · TQM, ferramentas, ISO 9001 e excelência em serviços',
                                  description:
                                    'Como construir uma cultura de qualidade que atravessa toda a organização: princípios de Deming, Juran, Ishikawa e Crosby, ferramentas (Pareto, fishbone, SPC, FMEA), sistemas de gestão ISO 9001/14001/45001 com PDCA e auditorias, e qualidade em serviços via ServQual, lean services, six sigma e modelo EFQM.',
                                  icon: '🎯',
                                  color: '#0ea5e9',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'lideranca-coaching',
                                  title: 'Liderança e Coaching',
                                  tagline: 'Business Administration · Liderança situacional, coaching executivo, inteligência emocional e sucessão',
                                  description:
                                    'Como liderar pessoas com eficácia na era moderna: fundamentos das teorias de liderança (traços, comportamentos, situacional — Fiedler, Hersey-Blanchard), prática do coaching executivo (modelo GROW de Whitmore, feedback SBI), inteligência emocional do líder (os 5 pilares de Goleman e a neurociência da auto-regulação), e desenvolvimento de sucessão (pipelines de liderança, mentoring, sponsorship e high-potential programs).',
                                  icon: '🧭',
                                  color: '#1e3a8a',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'gestao-operacoes',
                                  title: 'Gestão de Operações',
                                  tagline: 'Business Administration · Processos, lean, six sigma, planeamento e controlo',
                                  description:
                                    'Como desenhar, operar e melhorar os processos que transformam inputs em outputs: cadeia de valor de Porter e estratégia de operações (trade-offs custo/qualidade/velocidade/flexibilidade), design de processos e análise de fluxo (bottleneck, Little\'s Law, layouts), Toyota Production System e Six Sigma (DMAIC) para excelência operacional, e planeamento e controlo (MRP, EOQ, ABC, SPC, teoria das filas).',
                                  icon: '⚙️',
                                  color: '#0891b2',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'analise-investimentos',
                                  title: 'Análise de Investimentos',
                                  tagline: 'Business Administration · Capital budgeting, VPL/TIR, risco, custo de capital',
                                  description:
                                    'Avaliação económica de projectos de investimento: cash flows, VPL, TIR, payback, análise de risco e incerteza (sensibilidade, Monte Carlo, opções reais), custo de capital WACC e estrutura óptima de financiamento.',
                                  icon: '💰',
                                  color: '#059669',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                }
                              ];
</script>

<svelte:head>
  <title>{$t('routes.escola.title', { default: 'Escola · Cursos e Quizzes' })} · Presuntinho</title>
  <meta name="description" content="Cursos, lições e quizzes da Fatma" />
  <meta property="og:title" content="Escola · Cursos e Quizzes" />
  <meta property="og:description" content="Cursos, lições e quizzes da Fatma" />
  <meta property="og:url" content="https://presuntinho.netlify.app/escola/" />
  <meta name="twitter:title" content="Escola · Cursos e Quizzes" />
  <meta name="twitter:description" content="Cursos, lições e quizzes da Fatma" />
</svelte:head>

<div class="escola">
  <header class="hero">
    <span class="hero-tag">{$t('escola.hero.tag', { default: '🎓 Escola' })}</span>
    <h1>{$t('escola.hero.title', { default: 'Cursos, lições e quizzes' })}</h1>
    <p class="sub">
      {$t('escola.hero.sub', { default: 'Aprende ao teu ritmo. Marca progresso. Faz quizzes para validar o que sabes.' })}
    </p>
  </header>

  <section class="courses" aria-label={$t('escola.section.courses.aria', { default: 'Cursos disponíveis' })}>
    <h2 class="section-title">{$t('escola.section.courses', { default: 'Cursos disponíveis' })}</h2>

    <div class="grid">
      {#each COURSES as course (course.slug)}
        <a
          class="card"
          href={`/escola/curso/${course.slug}/`}
          style="--course-color: {course.color};"
        >
          <div class="card-head">
            <span class="card-icon" aria-hidden="true">{course.icon}</span>
            {#if course.badge}
              <span class="badge">{course.badge}</span>
            {/if}
          </div>
          <h3>{course.title}</h3>
          <p class="tagline">{course.tagline}</p>
          <p class="desc">{course.description}</p>
          <div class="meta">
            <span>{$t('escola.card.lessons', { default: '📚 {n} lições' }).replace('{n}', String(course.lessonCount))}</span>
            <span>{$t('escola.card.quizzes', { default: '📝 {n} quizzes' }).replace('{n}', String(course.quizCount))}</span>
            <span class="open">{$t('escola.card.open', { default: 'Abrir curso →' })}</span>
          </div>
        </a>
      {/each}
    </div>
  </section>

  <section class="sections" aria-label={$t('escola.section.tools.aria', { default: 'Secções da escola' })}>
    <h2 class="section-title">{$t('escola.section.tools', { default: 'Ferramentas' })}</h2>
    <div class="grid sections-grid">
      <a class="section-card" href="/trabalhos/" style="--sc: #f59e0b;">
        <span class="sc-icon" aria-hidden="true">📝</span>
        <div class="sc-body">
          <h3>{$t('escola.tool.trabalhos', { default: 'Trabalhos' })}</h3>
          <p>{$t('escola.tool.trabalhos.desc', { default: 'SWOT, Buyer Persona, TOWS, assignments da escola.' })}</p>
        </div>
      </a>
      <a class="section-card" href="/biblioteca/" style="--sc: #8b5cf6;">
        <span class="sc-icon" aria-hidden="true">📚</span>
        <div class="sc-body">
          <h3>{$t('escola.tool.biblioteca', { default: 'Biblioteca' })}</h3>
          <p>{$t('escola.tool.biblioteca.desc', { default: 'Materiais, downloads e recursos para estudar.' })}</p>
        </div>
      </a>
      <a class="section-card" href="/escola/caderno/" style="--sc: #10b981;">
        <span class="sc-icon" aria-hidden="true">📓</span>
        <div class="sc-body">
          <h3>{$t('escola.tool.caderno', { default: 'Meu Caderno' })}</h3>
          <p>{$t('escola.tool.caderno.desc', { default: 'As tuas notas, áudios, textos e imagens.' })}</p>
        </div>
      </a>
    </div>
  </section>
</div>

<style>
  .escola {
    max-width: 960px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .hero { text-align: center; margin-bottom: 2rem; }
  .hero-tag {
    display: inline-block;
    padding: 0.2rem 0.7rem;
    background: rgba(59, 130, 246, 0.2);
    border: 1px solid rgba(59, 130, 246, 0.4);
    color: #bfdbfe;
    border-radius: 999px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.75rem;
  }
  .hero h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem;
    color: #fff;
  }
  .sub {
    color: var(--txt2, #cbd5e1);
    margin: 0;
    font-size: 1rem;
  }

  .section-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--txt3, #94a3b8);
    margin: 0 0 0.75rem 0.25rem;
    font-weight: 600;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .card {
    display: block;
    padding: 1.25rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-left: 4px solid var(--course-color, #ec4899);
    border-radius: 0.75rem;
    color: #fff;
    text-decoration: none;
    transition: background 0.15s, transform 0.15s;
  }
  .card:hover, .card:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
    outline: none;
  }

  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  .card-icon { font-size: 1.75rem; }
  .badge {
    padding: 0.1rem 0.55rem;
    background: rgba(236, 72, 153, 0.2);
    border: 1px solid rgba(236, 72, 153, 0.4);
    color: #fbcfe8;
    border-radius: 999px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .card h3 {
    margin: 0 0 0.25rem;
    color: #fff;
    font-size: 1.15rem;
  }
  .tagline {
    color: var(--course-color, #ec4899);
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
    font-weight: 500;
  }
  .desc {
    color: var(--txt2, #cbd5e1);
    margin: 0 0 1rem;
    font-size: 0.92rem;
    line-height: 1.5;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
    color: var(--txt3, #94a3b8);
    font-size: 0.85rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .open {
    margin-left: auto;
    color: var(--course-color, #ec4899);
    font-weight: 600;
  }
  .sections { margin-top: 2rem; }
  .sections-grid {
    grid-template-columns: 1fr;
  }
  .section-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.1rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-left: 4px solid var(--sc, #ec4899);
    border-radius: 0.75rem;
    color: #fff;
    text-decoration: none;
    transition: background 0.15s, transform 0.15s;
  }
  .section-card:hover, .section-card:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
    outline: none;
  }
  .sc-icon { font-size: 1.75rem; line-height: 1; flex-shrink: 0; }
  .sc-body h3 { margin: 0 0 0.15rem; font-size: 1rem; color: #fff; }
  .sc-body p { margin: 0; font-size: 0.85rem; color: var(--txt2, #cbd5e1); line-height: 1.4; }
  @media (min-width: 600px) {
    .sections-grid { grid-template-columns: 1fr 1fr; }
  }
</style>