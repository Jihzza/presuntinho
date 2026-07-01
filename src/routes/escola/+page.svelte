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
      title: $t('routes.escola.curso.equivalenza.title', { default: "Equivalenza — The Scent of a Second Chance" }),
      tagline: $t('routes.escola.curso.equivalenza.tagline', { default: "BCOBM311 Mid-Term · Case study completo" }),
      description: $t('routes.escola.curso.equivalenza.description', { default: "Deep dive na marca espanhola de fragrâncias affordable: SWOT, Buyer Persona, Marketing Problem (SCQA), TOWS e Recomendação Estratégica. Cinco lições + quatro quizzes." }),
      icon: '🌸',
      color: '#ec4899',
      lessonCount: 5,
      quizCount: 4,
      badge: $t('routes.escola.curso.equivalenza.badge', { default: "Atual" })
    },
    {
      slug: 'portugues',
      title: $t('routes.escola.curso.portugues.title', { default: "Português de Portugal 🇵🇹" }),
      tagline: $t('routes.escola.curso.portugues.tagline', { default: "Mini-curso desenhado para Tunisianos" }),
      description: $t('routes.escola.curso.portugues.description', { default: "Aprende Português de Portugal com comparações ao Árabe Tunisiano + Francês + Inglês. Vogais, vocabulário, diálogos, verbos essenciais e quiz rápido." }),
      icon: '🇵🇹',
      color: '#10b981',
      lessonCount: 1,
      quizCount: 1,
      badge: $t('routes.escola.curso.portugues.badge', { default: "Novo" })
    },
    {
          slug: 'marketing-digital',
          title: $t('routes.escola.curso.marketing-digital.title', { default: "Marketing Digital" }),
          tagline: $t('routes.escola.curso.marketing-digital.tagline', { default: "Business Administration · SEO, SEM, redes sociais, paid media, funil, analytics e ROI" }),
          description: $t('routes.escola.curso.marketing-digital.description', { default: "Marketing digital na prática: como aparecer organicamente (SEO), pagar para aparecer (SEM), construir audiência em redes sociais e email, gerir campanhas pagas (Google Ads + Meta Ads), desenhar funis de conversão e medir tudo com KPIs que importam (CAC, LTV, ROAS)." }),
          icon: '📱',
          color: '#06b6d4',
          lessonCount: 4,
          quizCount: 2,
          badge: $t('routes.escola.curso.marketing-digital.badge', { default: "Uni" })
        },
    {
      slug: 'branding',
      title: $t('routes.escola.curso.branding.title', { default: "Branding" }),
      tagline: $t('routes.escola.curso.branding.tagline', { default: "Identidade, posicionamento e voz da marca" }),
      description: $t('routes.escola.curso.branding.description', { default: "Aprende a construir uma marca reconhecível: sinais visuais, posicionamento, tom de voz e brand story." }),
      icon: '✨',
      color: '#a855f7',
      lessonCount: 4,
      quizCount: 1,
      badge: $t('routes.escola.curso.branding.badge', { default: "Novo" })
    },
    {
      slug: 'estrategia',
      title: $t('routes.escola.curso.estrategia.title', { default: "Estratégia" }),
      tagline: $t('routes.escola.curso.estrategia.tagline', { default: "Blue Ocean, growth, OKRs e execução" }),
      description: $t('routes.escola.curso.estrategia.description', { default: "Um mini-curso para transformar ideias em prioridades, métricas e execução semanal." }),
      icon: '🧭',
      color: '#f97316',
      lessonCount: 4,
      quizCount: 1,
      badge: $t('routes.escola.curso.estrategia.badge', { default: "Novo" })
    },
    {
          slug: 'estrategia-corporativa',
          title: $t('routes.escola.curso.estrategia-corporativa.title', { default: "Estratégia Corporativa Avançada" }),
          tagline: $t('routes.escola.curso.estrategia-corporativa.tagline', { default: "Business Administration Avançado · Análise externa (PESTEL, 5 Forces, value chain), análise interna (VRIO, McKinsey 7S), estratégias corporativas (Ansoff, BCG, integração) e implementação (BSC, OKRs)" }),
          description: $t('routes.escola.curso.estrategia-corporativa.description', { default: "A cadeira avançada de estratégia para decisores C-level: análise externa profunda (PESTEL, Porter Five Forces, value chain, strategic groups), análise interna baseada em recursos (VRIO, RBV, SWOT estratégico, McKinsey 7S), estratégias corporativas (Ansoff, BCG e GE-McKinsey portfolio, integração vertical/horizontal, diversificação), e implementação (Balanced Scorecard, OKRs, McKinsey 7S, strategic control e change management)." }),
          icon: '🧭',
          color: '#f97316',
          lessonCount: 4,
          quizCount: 1,
          badge: 'Advanced'
        },
        {
          slug: 'marketing-internacional',
          title: $t('routes.escola.curso.marketing-internacional.title', { default: "Marketing Internacional" }),
          tagline: $t('routes.escola.curso.marketing-internacional.tagline', { default: "Business Administration · STP global, mix 4Ps internacional, modos de entrada, Hofstede e diplomacia corporativa" }),
          description: $t('routes.escola.curso.marketing-internacional.description', { default: "A cadeira aplicada de marketing internacional: como segmentar mercados-país (country markets, intermarket vs intra-market), targeting (undifferentiated, concentrated, differentiated, micromarketing mix) e posicionamento global. Como adaptar o marketing-mix a múltiplos países — produto (adaptação vs padronização, country-of-origin effects), preço (dumping, transfer pricing, currency hedging, PPP), praça (exportação indirecta/direta, JV, subsidiárias) e promoção (glocal messaging). Como escolher modos de entrada (exportação, licensing, franchising, joint ventures, subsidiárias integrais, FDI greenfield vs acquisition, alliances, born globals), enquadrados pelos modelos Uppsala e transaction cost analysis. E como navegar diferenças culturais em negócios internacionais — Hofstede 6 dimensões (PDI, IDV, MAS, UAI, LTO, IND), CSAs (cultural sensitives), estratégias glocal, diplomacia corporativa e soft power." }),
          icon: '🌍',
          color: '#0ea5e9',
          lessonCount: 4,
          quizCount: 1,
          badge: 'Uni'
        },
    {
      slug: 'gestao-financeira',
      title: $t('routes.escola.curso.gestao-financeira.title', { default: "Gestão Financeira" }),
      tagline: $t('routes.escola.curso.gestao-financeira.tagline', { default: "Business Administration · Demonstração de resultados, balanço, rácios e caixa" }),
      description: $t('routes.escola.curso.gestao-financeira.description', { default: "Aprende a ler as contas de uma empresa: demonstração de resultados, balanço patrimonial, rácios financeiros e gestão de caixa. Conteúdo universitário de Business Administration." }),
      icon: '💰',
      color: '#059669',
      lessonCount: 8,
      quizCount: 2,
      badge: $t('routes.escola.curso.gestao-financeira.badge', { default: "Uni" })
    },
    {
      slug: 'contabilidade',
      title: $t('routes.escola.curso.contabilidade.title', { default: "Contabilidade" }),
      tagline: $t('routes.escola.curso.contabilidade.tagline', { default: "Business Administration · Partida dobrada, diário, amortizações e IVA" }),
      description: $t('routes.escola.curso.contabilidade.description', { default: "Domina os fundamentos da contabilidade: partida dobrada, lançamentos no diário, amortizações e provisões, IVA e impostos. Conceitos essenciais para qualquer gestor." }),
      icon: '📊',
      color: '#2563eb',
      lessonCount: 8,
      quizCount: 2,
      badge: $t('routes.escola.curso.contabilidade.badge', { default: "Uni" })
    },
    {
      slug: 'microeconomia',
      title: $t('routes.escola.curso.microeconomia.title', { default: "Microeconomia" }),
      tagline: $t('routes.escola.curso.microeconomia.tagline', { default: "Business Administration · Oferta, procura, elasticidade e estruturas de mercado" }),
      description: $t('routes.escola.curso.microeconomia.description', { default: "Compreende como os mercados funcionam: oferta e procura, elasticidade-preço, estruturas de mercado (monopólio, oligopólio, concorrência) e custos de produção." }),
      icon: '📉',
      color: '#dc2626',
      lessonCount: 8,
      quizCount: 2,
      badge: $t('routes.escola.curso.microeconomia.badge', { default: "Uni" })
    },
    {
      slug: 'recursos-humanos',
      title: $t('routes.escola.curso.recursos-humanos.title', { default: "Gestão de Recursos Humanos" }),
      tagline: $t('routes.escola.curso.recursos-humanos.tagline', { default: "Business Administration · Recrutamento, motivação, avaliação e cultura" }),
      description: $t('routes.escola.curso.recursos-humanos.description', { default: "Tudo sobre gestão de pessoas: recrutamento e seleção, teorias de motivação (Maslow, Herzberg, McGregor), avaliação de desempenho e cultura organizacional." }),
      icon: '👥',
      color: '#7c3aed',
      lessonCount: 8,
      quizCount: 2,
      badge: $t('routes.escola.curso.recursos-humanos.badge', { default: "Uni" })
    },
    {
      slug: 'comportamento-organizacional',
      title: $t('routes.escola.curso.comportamento-organizacional.title', { default: "Comportamento Organizacional" }),
      tagline: $t('routes.escola.curso.comportamento-organizacional.tagline', { default: "Business Administration · Pessoas, equipas, cultura e liderança" }),
      description: $t('routes.escola.curso.comportamento-organizacional.description', { default: "Como as pessoas pensam, sentem e agem nas organizações: personalidade, motivação e percepção individual (Big Five, Maslow, Herzberg, McGregor, Self-Determination Theory), dinâmica de grupos e equipas (Tuckman, Belbin, groupthink, social loafing), estrutura, cultura e poder (Mintzberg, Schein, Hofstede, French-Raven), e liderança, empowerment e gestão de conflitos (Fiedler, Path-Goal, Bass, Thomas-Kilmann)." }),
      icon: '🧠',
      color: '#6d28d9',
      lessonCount: 4,
      quizCount: 1,
      badge: 'Uni'
      },
    {
          slug: 'gestao-inovacao',
          title: $t('routes.escola.curso.gestao-inovacao.title', { default: "Gestão da Inovação e Tecnologia" }),
          tagline: $t('routes.escola.curso.gestao-inovacao.tagline', { default: "Business Administration · Inovação, design thinking e ecossistemas" }),
          description: $t('routes.escola.curso.gestao-inovacao.description', { default: "Inovação não é só ideia: é sistema. Aprende gestão de inovação end-to-end — Drucker, Christensen, design thinking, lean startup, funil Stage-Gate, portfolio e ecossistemas." }),
          icon: '💡',
          color: '#ca8a04',
          lessonCount: 4,
          quizCount: 1,
          badge: 'Uni'
        },
        {
          slug: 'comercio-internacional',
          title: $t('routes.escola.curso.comercio-internacional.title', { default: "Comércio Internacional" }),
          tagline: $t('routes.escola.curso.comercio-internacional.tagline', { default: "Business Administration · Teorias do comércio, estratégias de entrada, finanças, logística e marketing internacional" }),
          description: $t('routes.escola.curso.comercio-internacional.description', { default: "Porque é que os países trocam? Como escolher mercados externos e entrar neles? Como gerir câmbios, Incoterms, cartas de crédito? Como vender além-fronteiras? Teorias (Smith, Ricardo, Heckscher-Ohlin, Stolper-Samuelson), integração económica (OMC, GATT, blocos regionais), cadeias globais de valor (Gereffi), modos de entrada (exportação, licenciamento, franchising, JV, subsidiária, M&A), Uppsala, Born Globals, Incoterms 2020, UCP 600, trade finance, marketing internacional 4Ps, Hofstede, CISG e arbitragem ICC/UNCITRAL." }),
          icon: '🌐',
          color: '#0e7490',
          lessonCount: 4,
          quizCount: 1,
          badge: 'Uni'
        },
    {
      slug: 'macroeconomia',
      title: $t('routes.escola.curso.macroeconomia.title', { default: "Macroeconomia" }),
      tagline: $t('routes.escola.curso.macroeconomia.tagline', { default: "Business Administration · PIB, inflação, política monetária e comércio internacional" }),
      description: $t('routes.escola.curso.macroeconomia.description', { default: "Vê a economia como um todo: como se mede o PIB, por que a inflação corrói o valor, como o banco central controla juros e moeda, e como países trocam bens e capitais." }),
      icon: '🌍',
      color: '#0ea5e9',
      lessonCount: 4,
      quizCount: 1,
      badge: $t('routes.escola.curso.macroeconomia.badge', { default: "Uni" })
    },
    {
      slug: 'marketing-estrategico',
      title: $t('routes.escola.curso.marketing-estrategico.title', { default: "Marketing Estratégico" }),
      tagline: $t('routes.escola.curso.marketing-estrategico.tagline', { default: "Business Administration · STP, mix marketing, posicionamento e brand equity" }),
      description: $t('routes.escola.curso.marketing-estrategico.description', { default: "Aprende a pensar marketing como sistema: segmentar o mercado, escolher onde competir (STP), desenhar o mix (4P) e construir brand equity que protege margem." }),
      icon: '🎯',
      color: '#e11d48',
      lessonCount: 4,
      quizCount: 1,
      badge: $t('routes.escola.curso.marketing-estrategico.badge', { default: "Uni" })
    },
    {
          slug: 'etica-negocios',
          title: $t('routes.escola.curso.etica-negocios.title', { default: "Ética nos Negócios" }),
          tagline: $t('routes.escola.curso.etica-negocios.tagline', { default: "Business Administration · Governança, responsabilidade social, sustentabilidade e compliance" }),
          description: $t('routes.escola.curso.etica-negocios.description', { default: "Decisões empresariais têm consequências humanas, sociais e ambientais. Aprende frameworks de governança, ESG, sustentabilidade e compliance para líderes responsáveis." }),
          icon: '⚖️',
          color: '#16a34a',
          lessonCount: 4,
          quizCount: 1,
          badge: $t('routes.escola.curso.etica-negocios.badge', { default: "Uni" })
        },
        {
          slug: 'direito-empresarial',
          title: $t('routes.escola.curso.direito-empresarial.title', { default: "Direito Empresarial" }),
          tagline: $t('routes.escola.curso.direito-empresarial.tagline', { default: "Business Administration · Tipos societários, contratos, propriedade intelectual e arbitragem" }),
          description: $t('routes.escola.curso.direito-empresarial.description', { default: "Fundamentos jurídicos da empresa em Portugal: tipos societários (Lda., SA, Unipessoal), contratos comerciais e cláusulas essenciais, marcas, patentes e resolução de litígios." }),
          icon: '⚖️',
          color: '#7e22ce',
          lessonCount: 4,
          quizCount: 1,
          badge: 'Uni'
        },
        {
                                  slug: 'gestao-conflitos',
                                  title: $t('routes.escola.curso.gestao-conflitos.title', { default: "Gestão de Conflitos" }),
                                  tagline: $t('routes.escola.curso.gestao-conflitos.tagline', { default: "Business Administration · Fontes do conflito, estilos de resposta, negociação integrativa e mediação" }),
                                  description: $t('routes.escola.curso.gestao-conflitos.description', { default: "Gestão de conflitos aplicada à gestão: natureza e fontes do conflito organizacional (tarefas, relações, processos, valores), estilos de resposta (Thomas-Kilmann: competição, colaboração, compromisso, evitamento, acomodação), modelos de processo (posições vs interesses, BATNA/ZOPA), mediação e negociação integrativa, comunicação não-violenta, gestão de conflitos em equipas híbridas e multi-culturais, e o papel do líder como gestor construtivo de divergências." }),
                                  icon: '🕊️',
                                  color: '#65a30d',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'estrategia-internacional',
                                  title: $t('routes.escola.curso.estrategia-internacional.title', { default: "Estratégia Internacional" }),
                                  tagline: $t('routes.escola.curso.estrategia-internacional.tagline', { default: "Business Administration · Drivers de internacionalização, modos de entrada, estratégias multi-doméstica/global/transnacional e gestão de risco internacional" }),
                                  description: $t('routes.escola.curso.estrategia-internacional.description', { default: "Estratégia internacional aplicada à gestão: porquê internacionalizar (drivers de procura, oferta, custos, governo e concorrentes), modos de entrada (exportação, licenciamento, franchising, joint ventures, subsidiária de capital próprio, aquisições), escolha entre globalização vs multi-doméstico vs transnacional vs internacional, localização e vantagens específicas, decisões de coordenação e configuração da cadeia de valor (Hofstede e distância cultural, Bartlett & Ghoshal), timing de entrada, gestão de risco cambial e político, e os trade-offs entre integração global e resposta local em empresas multinacionais." }),
                                  icon: '🌍',
                                  color: '#0ea5e9',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
        {
                  slug: 'analise-financeira',
                  title: $t('routes.escola.curso.analise-financeira.title', { default: "Análise Financeira" }),
                  tagline: $t('routes.escola.curso.analise-financeira.tagline', { default: "Business Administration · Rácios, fluxos de caixa e valuation" }),
                  description: $t('routes.escola.curso.analise-financeira.description', { default: "Como interpretar as demonstrações financeiras para avaliar desempenho e valor: rácios de liquidez, solvência e rentabilidade, free cash flow e métodos de valuation." }),
                  icon: '📈',
                  color: '#0d9488',
                  lessonCount: 4,
                  quizCount: 1,
                  badge: 'Uni'
                },
                {
                  slug: 'comportamento-do-consumidor',
                  title: $t('routes.escola.curso.comportamento-do-consumidor.title', { default: "Comportamento do Consumidor" }),
                  tagline: $t('routes.escola.curso.comportamento-do-consumidor.tagline', { default: "Business Administration · Factores de decisão, jornada, segmentação e omnichannel" }),
                  description: $t('routes.escola.curso.comportamento-do-consumidor.description', { default: "Como e por que os consumidores escolhem, compram e usam produtos: factores culturais, sociais, pessoais e psicológicos, processo de decisão em 5 estágios, segmentação e personas, e comportamento digital." }),
                  icon: '🛍️',
                  color: '#db2777',
                  lessonCount: 4,
                  quizCount: 1,
                  badge: 'Uni'
                },
                {
                  slug: 'pesquisa-de-marketing',
                  title: $t('routes.escola.curso.pesquisa-de-marketing.title', { default: "Pesquisa de Marketing" }),
                  tagline: $t('routes.escola.curso.pesquisa-de-marketing.tagline', { default: "Business Administration · Processo de pesquisa, qualitativa vs quantitativa, amostragem, métodos de recolha e análise de dados" }),
                  description: $t('routes.escola.curso.pesquisa-de-marketing.description', { default: "Como planear, conduzir e interpretar pesquisa de marketing: processo de pesquisa em 6 passos, dados primários vs secundários, qualitativa vs quantitativa, métodos de recolha quantitativos (surveys, Likert, amostragem, margem de erro), métodos qualitativos (focus groups, entrevistas, etnografia, netnografia, laddering, ZMET), análise de dados (SPSS, R, Python, regressão, clusters, conjoint) e relatório final." }),
                  icon: '📊',
                  color: '#7c3aed',
                  lessonCount: 4,
                  quizCount: 1,
                  badge: 'Uni'
                },
                                {
                                  slug: 'gestao-mudanca',
                                  title: $t('routes.escola.curso.gestao-mudanca.title', { default: "Gestão da Mudança Organizacional" }),
                                  tagline: $t('routes.escola.curso.gestao-mudanca.tagline', { default: "Business Administration · Modelos de Kotter, ADKAR, resistência e cultura" }),
                                  description: $t('routes.escola.curso.gestao-mudanca.description', { default: "Como planear, conduzir e ancorar a mudança em organizações: tipos de mudança, modelo de 8 passos de Kotter, ADKAR da Prosci, fontes de resistência (Kotter-Schlesinger) e cultura organizacional segundo Schein." }),
                                  icon: '🔄',
                                  color: '#14b8a6',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'negociacao',
                                  title: $t('routes.escola.curso.negociacao.title', { default: "Técnicas de Negociação Empresarial" }),
                                  tagline: $t('routes.escola.curso.negociacao.tagline', { default: "Business Administration · BATNA, ZOPA, negociação de princípios e cross-cultural" }),
                                  description: $t('routes.escola.curso.negociacao.description', { default: "Como negociar de forma eficaz em contexto empresarial: fundamentos, BATNA e ZOPA, negociação baseada em princípios de Fisher & Ury, comunicação (escuta activa e CNV) e negociação internacional cross-cultural (Hofstede, Hall)." }),
                                  icon: '🤝',
                                  color: '#0369a1',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'introducao-ao-direito',
                                  title: $t('routes.escola.curso.introducao-ao-direito.title', { default: "Introdução ao Direito" }),
                                  tagline: $t('routes.escola.curso.introducao-ao-direito.tagline', { default: "Universidade · Fontes, pessoa, obrigações e responsabilidade civil" }),
                                  description: $t('routes.escola.curso.introducao-ao-direito.description', { default: "Fundamentos jurídicos para gestores: fontes do Direito (Constituição, lei, costume, jurisprudência), pessoa e capacidade, obrigações e contratos, e responsabilidade civil. Essencial para contratos, riscos e compliance." }),
                                  icon: '⚖️',
                                  color: '#7c2d12',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'logistica',
                                  title: $t('routes.escola.curso.logistica.title', { default: "Logística" }),
                                  tagline: $t('routes.escola.curso.logistica.tagline', { default: "Universidade · Cadeia de suprimentos, stocks, transporte e operações internacionais" }),
                                  description: $t('routes.escola.curso.logistica.description', { default: "Gestão logística e da cadeia de suprimentos: supply chain end-to-end, gestão de estoques (just-in-time, EOQ), transporte e distribuição, e logística internacional (incoterms, alfândega)." }),
                                  icon: '🚚',
                                  color: '#0f766e',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'economia-comportamental',
                                  title: $t('routes.escola.curso.economia-comportamental.title', { default: "Economia Comportamental" }),
                                  tagline: $t('routes.escola.curso.economia-comportamental.tagline', { default: "Business Administration · Heurísticas, vieses, prospect theory, nudges e decisão empresarial" }),
                                  description: $t('routes.escola.curso.economia-comportamental.description', { default: "Economia comportamental aplicada à gestão: racionalidade limitada, heurísticas, vieses cognitivos, prospect theory, aversão à perda, efeito dotação, mental accounting, nudges, arquitectura da escolha, ética e aplicações em marketing, finanças, pricing, UX e decisão empresarial." }),
                                  icon: '🧠',
                                  color: '#7c3aed',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'sistemas-de-informacao',
                                  title: $t('routes.escola.curso.sistemas-de-informacao.title', { default: "Sistemas de Informação" }),
                                  tagline: $t('routes.escola.curso.sistemas-de-informacao.tagline', { default: "Universidade · Tipos de SI, ERP, CRM, BI e segurança da informação" }),
                                  description: $t('routes.escola.curso.sistemas-de-informacao.description', { default: "Sistemas de Informação nas empresas: tipos de SI (TPS, MIS, DSS, ESS), ERP e CRM como plataformas de integração, Business Intelligence para decisão, e segurança da informação (confidencialidade, integridade, disponibilidade)." }),
                                  icon: '💻',
                                  color: '#1e40af',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'inovacao-empreendedorismo',
                                  title: $t('routes.escola.curso.inovacao-empreendedorismo.title', { default: "Inovação e Empreendedorismo" }),
                                  tagline: $t('routes.escola.curso.inovacao-empreendedorismo.tagline', { default: "Universidade · Mindset, design thinking, validação e financiamento" }),
                                  description: $t('routes.escola.curso.inovacao-empreendedorismo.description', { default: "De ideia a negócio: mindset empreendedor (resiliência, orientação para oportunidades), design thinking como método de inovação centrada no utilizador, validação de ideias com MVP, customer development e lean startup, e financiamento + pitch para escalar." }),
                                  icon: '💡',
                                  color: '#ca8a04',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'international-business',
                                  title: $t('routes.escola.curso.international-business.title', { default: "International Business" }),
                                  tagline: $t('routes.escola.curso.international-business.tagline', { default: "Universidade · Globalização, modos de entrada e multinacionais" }),
                                  description: $t('routes.escola.curso.international-business.description', { default: "Estratégias para operar além-fronteiras: globalização e seus drivers, instituições internacionais (OMC, FMI, Banco Mundial), modos de entrada (exportação, licenciamento, JV, subsidiária, M&A), gestão de multinacionais e finanças internacionais." }),
                                  icon: '🌐',
                                  color: '#2563eb',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: $t('routes.escola.curso.international-business.badge', { default: "Uni" })
                                },
                                {
                                  slug: 'supply-chain',
                                  title: $t('routes.escola.curso.supply-chain.title', { default: "Supply Chain Management" }),
                                  tagline: $t('routes.escola.curso.supply-chain.tagline', { default: "Universidade · Procurement, inventário, logística e última milha" }),
                                  description: $t('routes.escola.curso.supply-chain.description', { default: "Desenho, planeamento e optimização da cadeia de abastecimento: elos upstream/midstream/downstream, modelo SCOR, sistemas push vs pull, gestão de inventário (EOQ, ABC, safety stock), procurement estratégico, transporte, distribuição e last-mile." }),
                                  icon: '📦',
                                  color: '#b45309',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: $t('routes.escola.curso.supply-chain.badge', { default: "Uni" })
                                },
                                {
                                  slug: 'data-analytics',
                                  title: $t('routes.escola.curso.data-analytics.title', { default: "Data Analytics for Business" }),
                                  tagline: $t('routes.escola.curso.data-analytics.tagline', { default: "Universidade · Descriptive/diagnostic/predictive/prescriptive, KPIs e cultura data-driven" }),
                                  description: $t('routes.escola.curso.data-analytics.description', { default: "Fundamentos de analytics para gestores: os quatro tipos (descriptive, diagnostic, predictive, prescriptive), KPIs e SMART, dashboards, cohort e funnel analysis, A/B testing, data literacy e cultura data-driven na organização." }),
                                  icon: '📊',
                                  color: '#7c3aed',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: $t('routes.escola.curso.data-analytics.badge', { default: "Uni" })
                                },
                                {
                                  slug: 'project-management',
                                  title: $t('routes.escola.curso.project-management.title', { default: "Project Management" }),
                                  tagline: $t('routes.escola.curso.project-management.tagline', { default: "Universidade · Triple constraint, PMBOK, Agile e gestão de risco" }),
                                  description: $t('routes.escola.curso.project-management.description', { default: "Metodologias de gestão de projectos: triple constraint (scope/time/cost), ciclo de vida, WBS, Gantt, critical path, Earned Value, Scrum e Kanban, gestão de riscos e stakeholders." }),
                                  icon: '📋',
                                  color: '#0d9488',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: $t('routes.escola.curso.project-management.badge', { default: "Uni" })
                                },
                                {
                                  slug: 'gestao-financeira-empresarial',
                                  title: $t('routes.escola.curso.gestao-financeira-empresarial.title', { default: "Gestão Financeira Empresarial" }),
                                  tagline: $t('routes.escola.curso.gestao-financeira-empresarial.tagline', { default: "Business Administration · Demonstrações financeiras, rácios, orçamento de capital e WACC" }),
                                  description: $t('routes.escola.curso.gestao-financeira-empresarial.description', { default: "Finanças corporativas na prática: como ler e construir as três demonstrações financeiras (DRE, Balanço, DFC), analisar rácios de liquidez, rentabilidade e endividamento, avaliar projectos de investimento com VPL/TIR/payback e decidir a melhor estrutura de capital (WACC, equity vs. dívida)." }),
                                  icon: '💼',
                                  color: '#0e7490',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'contabilidade-gerencial',
                                  title: $t('routes.escola.curso.contabilidade-gerencial.title', { default: "Contabilidade Gerencial" }),
                                  tagline: $t('routes.escola.curso.contabilidade-gerencial.tagline', { default: "Business Administration · Custos, CVP, orçamento industrial e ABC" }),
                                  description: $t('routes.escola.curso.contabilidade-gerencial.description', { default: "Como os gestores usam informação de custos para decidir, planear e controlar: classificação de custos (fixos, variáveis, directos, indirectos), análise custo-volume-lucro (CVP) e break-even, orçamento industrial e controlo orçamental, ABC e Balanced Scorecard." }),
                                  icon: '📊',
                                  color: '#b91c1c',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'empreendedorismo',
                                  title: $t('routes.escola.curso.empreendedorismo.title', { default: "Empreendedorismo e Plano de Negócios" }),
                                  tagline: $t('routes.escola.curso.empreendedorismo.tagline', { default: "Business Administration · Mindset, BMC, MVP, pitch a investidores" }),
                                  description: $t('routes.escola.curso.empreendedorismo.description', { default: "A cadeira mais prática da BA: como transformar uma ideia num negócio sustentável. Cobre mindset empreendedor (effectuation, journey, biases), Business Model Canvas, validação de problema e MVP (4 tipos), plano de negócios completo e pitch de 3-5 minutos para investidores." }),
                                  icon: '🚀',
                                  color: '#e11d48',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'gestao-qualidade',
                                  title: $t('routes.escola.curso.gestao-qualidade.title', { default: "Gestão da Qualidade Total" }),
                                  tagline: $t('routes.escola.curso.gestao-qualidade.tagline', { default: "Business Administration · TQM, ferramentas, ISO 9001 e excelência em serviços" }),
                                  description: $t('routes.escola.curso.gestao-qualidade.description', { default: "Como construir uma cultura de qualidade que atravessa toda a organização: princípios de Deming, Juran, Ishikawa e Crosby, ferramentas (Pareto, fishbone, SPC, FMEA), sistemas de gestão ISO 9001/14001/45001 com PDCA e auditorias, e qualidade em serviços via ServQual, lean services, six sigma e modelo EFQM." }),
                                  icon: '🎯',
                                  color: '#0ea5e9',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'lideranca-coaching',
                                  title: $t('routes.escola.curso.lideranca-coaching.title', { default: "Liderança e Coaching" }),
                                  tagline: $t('routes.escola.curso.lideranca-coaching.tagline', { default: "Business Administration · Liderança situacional, coaching executivo, inteligência emocional e sucessão" }),
                                  description: $t('routes.escola.curso.lideranca-coaching.description', { default: "Como liderar pessoas com eficácia na era moderna: fundamentos das teorias de liderança (traços, comportamentos, situacional — Fiedler, Hersey-Blanchard), prática do coaching executivo (modelo GROW de Whitmore, feedback SBI), inteligência emocional do líder (os 5 pilares de Goleman e a neurociência da auto-regulação), e desenvolvimento de sucessão (pipelines de liderança, mentoring, sponsorship e high-potential programs)." }),
                                  icon: '🧭',
                                  color: '#1e3a8a',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'gestao-operacoes',
                                  title: $t('routes.escola.curso.gestao-operacoes.title', { default: "Gestão de Operações" }),
                                  tagline: $t('routes.escola.curso.gestao-operacoes.tagline', { default: "Business Administration · Processos, lean, six sigma, planeamento e controlo" }),
                                  description: $t('routes.escola.curso.gestao-operacoes.description', { default: "Como desenhar, operar e melhorar os processos que transformam inputs em outputs: cadeia de valor de Porter e estratégia de operações (trade-offs custo/qualidade/velocidade/flexibilidade), design de processos e análise de fluxo (bottleneck, Little's Law, layouts), Toyota Production System e Six Sigma (DMAIC) para excelência operacional, e planeamento e controlo (MRP, EOQ, ABC, SPC, teoria das filas)." }),
                                  icon: '⚙️',
                                  color: '#0891b2',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                  slug: 'gestao-risco',
                                  title: $t('routes.escola.curso.gestao-risco.title', { default: "Gestão de Risco" }),
                                  tagline: $t('routes.escola.curso.gestao-risco.tagline', { default: "Business Administration · ISO 31000, COSO ERM, Basileia III e TCFD — identificar, analisar e responder a riscos empresariais" }),
                                  description: $t('routes.escola.curso.gestao-risco.description', { default: "Gestão de risco aplicada à gestão empresarial: fundamentos (definição de risco segundo Knight, tipologia estratégica/operacional/financeira/compliance, apetite vs tolerância), identificação e análise (brainstorming, Delphi, SWOT, análise de cenários, matrizes probabilidade×impacto, heatmaps), resposta e mitigação (estratégia 4T — Tolerate, Treat, Transfer, Terminate — seguros, hedging, diversificação, BCP/DRP), e os principais frameworks e normas (ISO 31000 com processo em 5 etapas, COSO ERM 2017 com 5 componentes e 20 princípios, Basileia III para risco de crédito/mercado/operacional, e reporting ESG/clima via TCFD e CSRD)." }),
                                  icon: '⚠️',
                                  color: '#dc2626',
                                  lessonCount: 4,
                                  quizCount: 1,
                                  badge: 'Uni'
                                },
                                {
                                      slug: 'analise-investimentos',
                                      title: $t('routes.escola.curso.analise-investimentos.title', { default: "Análise de Investimentos" }),
                                      tagline: $t('routes.escola.curso.analise-investimentos.tagline', { default: "Business Administration · Capital budgeting, VPL/TIR, risco, custo de capital" }),
                                      description: $t('routes.escola.curso.analise-investimentos.description', { default: "Avaliação económica de projectos de investimento: cash flows, VPL, TIR, payback, análise de risco e incerteza (sensibilidade, Monte Carlo, opções reais), custo de capital WACC e estrutura óptima de financiamento." }),
                                      icon: '💰',
                                      color: '#059669',
                                      lessonCount: 4,
                                      quizCount: 1,
                                      badge: 'Uni'
                                    },
                                    {
                                      slug: 'gestao-projectos',
                                      title: $t('routes.escola.curso.gestao-projectos.title', { default: "Gestão de Projectos" }),
                                      tagline: $t('routes.escola.curso.gestao-projectos.tagline', { default: "Business Administration · PMBOK, Scrum, Kanban, WBS, caminho crítico, EVM e certificações PMP/PRINCE2 — do planeamento à entrega" }),
                                      description: $t('routes.escola.curso.gestao-projectos.description', { default: "Gestão de projectos aplicada à gestão empresarial: fundamentos (definição de projecto, triângulo de ferro scope/time/cost/quality, stakeholders, ciclo de vida em 5 fases, charter), frameworks tradicionais (PMBOK do PMI em 5 grupos de processos × 10 áreas de conhecimento, WBS, Gantt, caminho crítico, EVM, compressão), metodologias ágeis (Manifesto Ágil, Scrum com 3 papéis e 5 eventos, Kanban com WIP limits, Extreme Programming, scaling com SAFe/LeSS/Nexus), e ferramentas práticas e gestão (MS Project, Primavera, Jira; risk management de projecto com estratégia 4T; stakeholder mapping; casos paradigmáticos como Apollo, iPhone, NHS NPfIT, Boeing 787; certificações PMP/PRINCE2/CSM)." }),
                                      icon: '📋',
                                      color: '#0d9488',
                                      lessonCount: 4,
                                      quizCount: 1,
                                      badge: 'Uni'
                                    },
                                    {
                                      slug: 'sociologia-organizacoes',
                                      title: $t('routes.escola.curso.sociologia-organizacoes.title', { default: "Sociologia das Organizações" }),
                                      tagline: $t('routes.escola.curso.sociologia-organizacoes.tagline', { default: "Business Administration · Teorias, burocracia, cultura, poder e instituições — do Taylorismo ao Neo-Institucionalismo" }),
                                      description: $t('routes.escola.curso.sociologia-organizacoes.description', { default: "Sociologia das organizações aplicada à gestão empresarial: fundamentos (organização como sistema social, burocracia weberiana, controlo e poder), teorias clássicas (Taylor, Fayol, Mayo e Barnard), teorias contemporâneas (Merton, Trist, Ouchi, Schein, neo-institucionalismo e garbage can model) e temas aplicados (identidade profissional, género, diversidade cultural, ética e responsabilidade social corporativa)." }),
                                      icon: '🧩',
                                      color: '#9333ea',
                                      lessonCount: 4,
                                      quizCount: 1,
                                      badge: 'Uni'
                                    }
                                  ];
</script>

<svelte:head>
  <title>{$t('routes.escola.title', { default: 'Escola · Cursos e Quizzes' })} · Presuntinho</title>
  <meta name="description" content={$t('routes.escola.meta.description', { default: 'Cursos, lições e quizzes da Fatma' })} />
  <meta property="og:title" content={$t('routes.escola.meta.og_title', { default: 'Escola · Cursos e Quizzes' })} />
  <meta property="og:description" content={$t('routes.escola.meta.og_description', { default: 'Cursos, lições e quizzes da Fatma' })} />
  <meta property="og:url" content="https://presuntinho.netlify.app/escola/" />
  <meta name="twitter:title" content={$t('routes.escola.meta.twitter_title', { default: 'Escola · Cursos e Quizzes' })} />
  <meta name="twitter:description" content={$t('routes.escola.meta.twitter_description', { default: 'Cursos, lições e quizzes da Fatma' })} />
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
    grid-template-columns: minmax(0, 1fr);
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
    grid-template-columns: minmax(0, 1fr);
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
    .sections-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  }
</style>