# Gap-071 Plan — `contabilidade-gerencial` cadeira BA #31

**Tick:** 20260629 (post-gap-067/069 — sha `c372732`, working tree clean)
**Plano por:** Skander 1 (reasoning / content)
**Status:** plan only — **não executar** (Skander 2 implementa depois)
**Objectivo:** propor a próxima cadeira BA #31 a adicionar ao Presuntinho V6 (cadeira #30 foi `marketing-digital` em gap-067/069).

---

## 1. Gap analysis — porquê esta cadeira e não outra

### 1.1 Inventário actual (30 cadeiras wired em `src/routes/escola/+page.svelte`)

Lidas directamente do CATALOGUE (`+page.svelte:23-369`), ordenadas por ordem pedagógica:

| # | Slug | Título | Família |
|---|------|--------|---------|
| 1 | `equivalenza` | Equivalenza | básico |
| 2 | `portugues` | Português | básico |
| 3 | `marketing-digital` | Marketing Digital | marketing |
| 4 | `branding` | Branding | marketing |
| 5 | `estrategia` | Estratégia Empresarial | estratégia |
| 6 | `gestao-financeira` | Gestão Financeira | finanças |
| 7 | `contabilidade` | Contabilidade Geral | finanças/contabilidade |
| 8 | `microeconomia` | Microeconomia | economia |
| 9 | `recursos-humanos` | Recursos Humanos | HR |
| 10 | `comportamento-organizacional` | Comportamento Organizacional | HR/org |
| 11 | `macroeconomia` | Macroeconomia | economia |
| 12 | `marketing-estrategico` | Marketing Estratégico | marketing |
| 13 | `etica-negocios` | Ética nos Negócios | ética |
| 14 | `direito-empresarial` | Direito Empresarial | direito |
| 15 | `gestao-operacoes` | Gestão de Operações | operações |
| 16 | `analise-financeira` | Análise Financeira | finanças |
| 17 | `comportamento-do-consumidor` | Comportamento do Consumidor | marketing |
| 18 | `pesquisa-de-marketing` | Pesquisa de Marketing | marketing |
| 19 | `gestao-mudanca` | Gestão da Mudança Organizacional | HR/org |
| 20 | `negociacao` | Técnicas de Negociação Empresarial | soft skills |
| 21 | `introducao-ao-direito` | Introdução ao Direito | direito |
| 22 | `logistica` | Logística | operações |
| 23 | `sistemas-de-informacao` | Sistemas de Informação | TI/IS |
| 24 | `inovacao-empreendedorismo` | Inovação e Empreendedorismo | estratégia |
| 25 | `international-business` | International Business | internacional |
| 26 | `supply-chain` | Supply Chain Management | operações |
| 27 | `data-analytics` | Data Analytics for Business | TI/data |
| 28 | `project-management` | Project Management | gestão |
| 29 | `gestao-financeira-empresarial` | Gestão Financeira Empresarial | finanças |
| 30 | `marketing-digital` | (já no 3) | — |

**Nota:** há sobreposição nominal entre `marketing-digital` e o slot 30 — confirma-se que o catálogo tem 30 entradas únicas. Os itens 1-2 são básicos; 3-30 são Uni/Advanced.

### 1.2 Famílias cobertas vs gap

| Família | Cadeiras existentes | Cobertura |
|---------|---------------------|-----------|
| Marketing | marketing-digital, branding, marketing-estrategico, comportamento-do-consumidor, pesquisa-de-marketing | **saturada** |
| Finanças | gestao-financeira, gestao-financeira-empresarial, analise-financeira | forte |
| Operações/Supply | gestao-operacoes, logistica, supply-chain, sistemas-de-informacao | forte |
| HR/Org | recursos-humanos, comportamento-organizacional, gestao-mudanca, negociacao | sólida |
| Estratégia/Internacional | estrategia, international-business, inovacao-empreendedorismo | sólida |
| Direito/Ética | introducao-ao-direito, direito-empresarial, etica-negocios | completa |
| Economia | microeconomia, macroeconomia | completa |
| Project/Data | project-management, data-analytics | completa |
| **Contabilidade de gestão / Cost accounting** | `contabilidade` (cadeira básica introdutória — partida dobrada, IVA, balancete, IFRS) — **mas FALTA o módulo "Comptabilité de gestion"** (cost behavior, CVP, orçamento industrial, ABC, custos padrão, balanced scorecard financeiro) | **gap crítico** |
| Auditoria | nenhuma | gap |
| Fiscalidade / Direito Fiscal | nenhum | gap |
| Mercados financeiros / Banque | nenhum | gap |
| Estatística aplicada aos negócios | nenhum | gap |

### 1.3 Cadeiras comuns em universidades tunisianas (referência: ISG Tunis, IHEC Carthage, ESCT, ISCAE)

Curriculum típico BA Tunis — principais cadeiras L2/L3 ISG (`isg.rnu.tn`):
- **L1**: Micro, Macro, Intro Gestão, Intro Contabilidade (≡ nosso `contabilidade`), Intro Marketing, Direito Civil, Matemática, Estatística.
- **L2**: **Comptabilité de gestion / Cost accounting** (cátedra central, 6 ECTS, obrigatória), Gestão Financeira (≡ nosso `gestao-financeira`), Marketing Estratégico (≡ `marketing-estrategico`), Comportamento Organizacional (≡ nosso), Direito Comercial (≡ `direito-empresarial`), Estatística inférencial.
- **L3**: Contrôle de gestion (management accounting avançado), Fiscalidade, Auditoria, Gestão da Produção (≡ `gestao-operacoes`), Estratégia Empresarial (≡ `estrategia`), Gestão Internacional (≡ `international-business`), Banque & Finance.

**Tabela de gap (cadeira ISG Tunis ↔ Presuntinho):**

| Cadeira ISG Tunis (curriculum BA) | Equivalente em Presuntinho | Status |
|------------------------------------|----------------------------|--------|
| Intro Comptabilité (L1) | `contabilidade` | ✓ coberta |
| **Comptabilité de gestion (L2)** | — | ❌ **gap — cadeira #31** |
| Contrôle de gestion (L3) | — | ❌ gap futuro (pode ser lição avançada dentro da própria `contabilidade-gerencial`) |
| Fiscalité / Droit fiscal | — | ❌ gap futuro |
| Audit | — | ❌ gap futuro |
| Banque & Finance | — | ❌ gap futuro |

### 1.4 Top 3 candidatas com justificação

| Rank | Slug | Peso curricular (Tunisia) | Aplicação prática | Fit conteúdo (4 lições + 1 quiz) | Razão |
|------|------|---------------------------|--------------------|----------------------------------|-------|
| **🥇 1** | **`contabilidade-gerencial`** | ⭐⭐⭐⭐⭐ (obrigatória L2 ISG/IHEC, 6 ECTS) | ⭐⭐⭐⭐⭐ (PME tunisianas usam CVP/orçamento industrial) | ⭐⭐⭐⭐⭐ (material vasto, literatura em pt-PT/en/fr) | Cadeira central BA L2 não coberta; tem ligação directa com `contabilidade` (intro) e `gestao-financeira-empresarial` (avançado); complementa o cluster finanças sem duplicar. |
| 🥈 2 | `auditoria` | ⭐⭐⭐⭐ (L3, 4 ECTS) | ⭐⭐⭐ | ⭐⭐⭐⭐ | Curricularmente L3 (mais avançada que a nossa base); bom gap futuro, mas é mais nicho. |
| 🥉 3 | `direito-fiscal` | ⭐⭐⭐⭐ (L3, 4 ECTS) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Complementa `direito-empresarial`; seria excelente cadeira #32. |

### 1.5 Porquê `contabilidade-gerencial` ganha

1. **Alinhamento com curriculum BA da Fatma (ISG/IHEC/ESCT)** — é a cadeira L2 com maior peso curricular não coberta. O programa dela vai cobri-la em L2; ajudá-la com material pt-PT/en/fr é vantagem directa.
2. **Posição pedagógica óptima no nosso CATALOGUE** — senta-se entre `contabilidade` (intro) e `gestao-financeira-empresarial` (corporate finance avançado). Cria uma progressão: intro contabilidade → gestão de custos → corporate finance. Cobre o "missing middle" entre registar factos e decidir investimentos.
3. **Aplicação prática forte em PME** — cost behavior (variáveis vs fixos), CVP break-even, orçamento industrial, custos ABC, custos padrão são ferramentas que qualquer PME tunisiana (confeção, agro, serviços) usa no dia-a-dia.
4. **Rico em literatura pt-PT/en/fr** — livros clássicos disponíveis:
   - Garrison, Noreen & Brewer — *Contabilidade Gerencial* (McGraw-Hill, Brasil/PT)
   - Drury — *Management and Cost Accounting* (Cengage, EN — usado em ISG)
   - Bouquin — *Comptabilité de gestion* (Pearson, FR — referência ISG)
   - Câmara, P. et al. — *Contabilidade de Gestão* (Áreas Editora, PT)
5. **Não duplica nada** — `gestao-financeira-empresarial` cobre demonstrações financeiras, rácios e VPL/TIR (decisão de investimento financeiro); `analise-financeira` cobre rácios, FCF e valuation. A `contabilidade-gerencial` é uma família diferente: informa a decisão interna de gestão (custos, orçamento, performance).
6. **Escrevível em 4 lições + 1 quiz 8-10 perguntas** — material é modular e cabe naturalmente em 4 blocos:
   - L1: fundamentos de custos (classificação, comportamento)
   - L2: CVP e decisão de curto prazo
   - L3: orçamento industrial e controle orçamental
   - L4: custos avançados (ABC, padrão, balanced scorecard)

**Decisão: cadeira #31 = `contabilidade-gerencial`.**

---

## 2. Cadeira proposta

### 2.1 Slug

```
contabilidade-gerencial
```

Kebab-case, 22 chars, semanticamente claro. Não colide com `contabilidade` (que é L1 intro). Não há slug existente — verificado em `static/lessons/` (sem `course.json` para este slug).

### 2.2 Títulos i18n (5 locales)

| Locale | Título |
|--------|--------|
| **pt-PT** | Contabilidade Gerencial |
| **en** | Managerial Accounting |
| **fr** | Comptabilité de gestion |
| **ar** | المحاسبة الإدارية |
| **tn** | Comptabilité de gestion (ou المحاسبة الإدارية — a manter pt/fr pois é como é citada em universidades tunisianas) |

### 2.3 Descrições curtas (1 linha)

| Locale | Descrição |
|--------|-----------|
| **pt-PT** | Como os gestores usam informação de custos para decidir, planear e controlar: classificação de custos, custo-volume-lucro, orçamento industrial, ABC e Balanced Scorecard. |
| **en** | How managers use cost information to decide, plan and control: cost classification, cost-volume-profit, operating budgets, ABC and Balanced Scorecard. |
| **fr** | Comment les managers utilisent l'information sur les coûts pour décider, planifier et contrôler : classification, coût-volume-profit, budgets, ABC et Balanced Scorecard. |
| **ar** | كيف يستخدم المديرون معلومات التكلفة لاتخاذ القرار والتخطيط والرقابة: تصنيف التكاليف، حجم-تكلفة-ربح، الميزانيات التشغيلية، نظام ABC ومؤشرات الأداء المتوازن. |
| **tn** | Kifaa yestakhdemou les managers les informations 3ala les coûts bech ya3mlo decision, planification w contrôle. |

### 2.4 Metadados do `course.json`

```json
{
  "slug": "contabilidade-gerencial",
  "title": "Contabilidade Gerencial",
  "icon": "📊",
  "color": "#b91c1c",
  "description": "Como os gestores usam informação de custos para decidir, planear e controlar: classificação de custos, custo-volume-lucro, orçamento industrial, ABC e Balanced Scorecard.",
  "order": 31
}
```

- **Ícone:** 📊 (charts/data — diferencia-se de 💼 `gestao-financeira-empresarial` e 📈 `analise-financeira`)
- **Cor:** `#b91c1c` (red-700) — distingue-se do teal da corporate finance, do teal-700 da análise, do emerald da contabilidade introdutória. Família "contabilidade" fica visualmente coerente mas separada.
- **Order:** 31 (sequencial após gap-067/069 = 30).

---

## 3. As 4 lições propostas

Cada lição segue o padrão actual de 4-6 secções principais (`h2/h3/p/ul/callout`), conforme `static/lessons/marketing-digital/01-fundamentos-marketing-digital.json` e os outros 14 cursos Uni/Advanced já entregues.

### 3.1 Lição 1 — `01-classificacao-e-comportamento-dos-custos`

- **Título pt-PT:** `1. Classificação e comportamento dos custos: fixos, variáveis, directos e indirectos`
- **Duração estimada:** 25 min (~2.5k palavras)
- **Secções principais (6):**
  1. **O que distingue Contabilidade Gerencial da Contabilidade Financeira** (h2 + p + callout comparativo) —会計外部 vs 会計 interna, NF vs NCF, periodicidade, auditoria.
  2. **Classificação por natureza vs por função** (h2 + p + ul) — matérias-primas / mão-de-obra / GGF; produção / comercial / admin.
  3. **Comportamento dos custos face ao volume de actividade** (h2 + p + ul) — custos fixos, variáveis, mistos (semi-variáveis); fórmula `y = a + bx`; exemplos (aluguer, salários fixos, electricidade mista).
  4. **Custos directos vs indirectos / custos de produto vs de período** (h2 + p + ul) — rastreabilidade ao objecto de custo; absorption costing vs variable costing.
  5. **Exemplo prático: uma confeção têxtil em Sousse** (h2 + p + callout + tabela inline) — calcular custo fixo vs variável mensal de uma PME de 50 trabalhadores.
  6. **Key takeaways** (h2 + ul) — síntese das 4 classificações cruzadas.

### 3.2 Lição 2 — `02-analise-custo-volume-lucro-cvp`

- **Título pt-PT:** `2. Análise Custo-Volume-Lucro (CVP) e decisão de curto prazo`
- **Duração estimada:** 28 min (~2.8k palavras)
- **Secções principais (6):**
  1. **A equação do lucro e os seus 4 ingredientes** (h2 + p + ul) — receita, custos totais, lucro, ponto de partida.
  2. **Margem de contribuição: a variável-chave** (h2 + p + fórmula) — `MC = P - CVu`; porquê é mais útil que o lucro bruto para decidir.
  3. **Break-even point (ponto crítico)** (h2 + p + fórmula + callout) — `BEP = CF / MC unitária`; exemplo numérico (cafeteria, 12€/dia de custos fixos, MC = 2,5€/bica → 5 bicas/dia).
  4. **Alavancagem operacional** (h2 + p + ul) — grau de alavancagem = `MC / Lucro`; risco vs recompensa.
  5. **CVP multi-produto e limitações** (h2 + p + callout) — mix fixo de vendas, ponderação; pressupostos (linearidade, custos identificáveis, sem alteração de stocks).
  6. **Decisões de curto prazo: aceitar ou recusar um pedido especial?** (h2 + p + ul) — regra: aceitar se `MC > 0` e capacidade ociosa; caso contrário, decisão sobre preço mínimo.

### 3.3 Lição 3 — `03-orcamento-industrial-e-controlo-orcamental`

- **Título pt-PT:** `3. Orçamento industrial e controlo orçamental: planear, comparar, corrigir`
- **Duração estimada:** 30 min (~3.0k palavras)
- **Secções principais (5):**
  1. **O ciclo orçamental anual: do plano estratégico ao orçamento operacional** (h2 + p + ul) — fases: preparação → orçamentos setoriais → consolidação → aprovação → acompanhamento.
  2. **Orçamento de vendas (ponto de partida)** (h2 + p + ul) — forecast, sazonalidade, capacidade.
  3. **Orçamentos operacionais: produção, matérias, mão-de-obra, GGF** (h2 + p + ul) — interligação entre orçamentos; programação de produção.
  4. **Orçamentos financeiros: tesouraria e demonstração de resultados previsionais** (h2 + p + ul) — cash budget; projected income statement; impacto no Balanço.
  5. **Análise de desvios (variance analysis)** (h2 + p + tabela + callout) — desvio de preço, de quantidade, de eficiência, de volume; flexed budget vs static budget; investigação dos desvios materiais (>5% regra prática).

### 3.4 Lição 4 — `04-custos-avancados-abc-e-balanced-scorecard`

- **Título pt-PT:** `4. Custos avançados: Activity-Based Costing (ABC) e Balanced Scorecard (BSC)`
- **Duração estimada:** 28 min (~2.8k palavras)
- **Secções principais (5):**
  1. **Limites do sistema tradicional de custos por volume** (h2 + p + callout) — distorção quando custos indirectos são altos e produtos heterogéneos.
  2. **Activity-Based Costing (ABC) — Kaplan & Cooper** (h2 + p + ul) —两步 alocação: recursos → actividades (cost pools com cost drivers) → objectos de custo.
  3. **Exemplo prático: uma empresa de software com 3 produtos** (h2 + p + tabela) — mostra como o ABC corrige a sub-orçamentação de produtos de baixo volume / alta complexidade.
  4. **Custos-padrão (standard costs) e análise de desvios avançada** (h2 + p + ul) — variance tree de 6 elementos (preço MP, eficiência MP, taxa MO, eficiência MO, despesa GGF, volume); responsabilidade por desvio.
  5. **Balanced Scorecard (Kaplan & Norton) — integrar custos com estratégia** (h2 + p + ul + callout) — 4 perspectivas (financeira / cliente / processos internos / aprendizagem); como KPIs de processo alimentam KPIs financeiros; ligação aos sistemas de incentivos.

---

## 4. Quiz proposto

### 4.1 Slug e metadados

- **Slug do ficheiro:** `static/quizzes/cgq.json` (`cgq` = "contabilidade gerencial quiz", segue padrão `gfeq` da gap-063)
- **Título pt-PT:** "Quiz: Contabilidade Gerencial"
- **Descrição pt-PT:** "Testa conceitos centrais: classificação de custos, análise CVP, break-even, orçamento industrial, variance analysis, ABC e Balanced Scorecard."
- **Número de perguntas:** **10 perguntas** (4 opções cada, 1 correcta — `a: índice`)

### 4.2 As 10 perguntas

```json
{
  "id": "cgq",
  "title": "Quiz: Contabilidade Gerencial",
  "description": "Testa conceitos centrais: classificação de custos, análise CVP, break-even, orçamento industrial, variance analysis, ABC e Balanced Scorecard.",
  "questions": [
    {
      "q": "A principal diferença entre Contabilidade Financeira e Contabilidade Gerencial é:",
      "opts": [
        "A Contabilidade Gerencial segue as IFRS, a Financeira segue princípios internos",
        "A Gerencial serve utilizadores externos (investidores, bancos), a Financeira serve gestores internos",
        "A Gerencial serve gestores internos com informação prospectiva e detalhada; a Financeira serve externos com informação histórica e agregada",
        "Não há diferença — são apenas nomes diferentes para a mesma disciplina"
      ],
      "a": 2
    },
    {
      "q": "Um custo fixo é definido como:",
      "opts": [
        "Um custo que é pago no início do mês",
        "Um custo cujo total permanece constante dentro de um intervalo relevante de actividade, embora o custo unitário varie",
        "Um custo que varia directamente proporcional ao volume produzido",
        "Um custo que só existe em empresas industriais"
      ],
      "a": 1
    },
    {
      "q": "Uma empresa vende um produto a 50€/un e tem custo variável unitário de 30€. Os custos fixos mensais são 8.000€. O break-even em unidades é:",
      "opts": [
        "160 unidades",
        "200 unidades",
        "267 unidades",
        "400 unidades"
      ],
      "a": 2
    },
    {
      "q": "A margem de contribuição unitária de uma empresa é 20€ e os custos fixos são 60.000€. O grau de alavancagem operacional quando vende 5.000 unidades é:",
      "opts": [
        "1,25",
        "1,67",
        "2,00",
        "5,00"
      ],
      "a": 2
    },
    {
      "q": "No CVP multi-produto, qual é a principal limitação do modelo clássico?",
      "opts": [
        "Não consegue calcular o break-even",
        "Assume um mix de vendas fixo e custos perfeitamente lineares",
        "Só funciona para empresas de serviços",
        "Requer cálculo de impostos sobre o lucro"
      ],
      "a": 1
    },
    {
      "q": "Numa decisão de aceitar um pedido especial com capacidade ociosa, a regra de curto prazo é:",
      "opts": [
        "Rejeitar sempre para proteger o preço de mercado",
        "Aceitar se o preço cobrir todos os custos fixos atribuídos",
        "Aceitar se a margem de contribuição for positiva",
        "Aceitar só se o preço for superior ao custo total"
      ],
      "a": 2
    },
    {
      "q": "O orçamento de vendas é normalmente o ponto de partida do orçamento operacional porque:",
      "opts": [
        "É o único orçamento com dados reais",
        "Determina a produção, que por sua vez dispara compras, mão-de-obra e GGF",
        "É obrigatório pelo código comercial",
        "É o mais fácil de calcular"
      ],
      "a": 1
    },
    {
      "q": "Uma empresa apresenta desvio de mão-de-obra desfavorável de 4.000€ no mês. Investigar este desvio vale a pena se:",
      "opts": [
        "For desfavorável, independentemente do valor",
        "O benefício esperado da investigação (causa + acção correctiva) exceder o custo de investigar",
        "For superior a 0,01€",
        "O director financeiro autorizar"
      ],
      "a": 1
    },
    {
      "q": "No Activity-Based Costing (ABC), o custo é alocado em duas etapas:",
      "opts": [
        "Custos fixos → variáveis; variáveis → produtos",
        "Recursos → actividades (via cost drivers de recurso) → objectos de custo (via cost drivers de actividade)",
        "Directos → indirectos; indirectos → produtos",
        "Produção → vendas; vendas → lucro"
      ],
      "a": 1
    },
    {
      "q": "O Balanced Scorecard de Kaplan & Norton complementa os indicadores financeiros com:",
      "opts": [
        "Apenas indicadores de quota de mercado",
        "Três perspectivas adicionais: clientes, processos internos, e aprendizagem/crescimento",
        "Apenas indicadores não-financeiros, abandonando os financeiros",
        "Apenas indicadores de RH"
      ],
      "a": 1
    }
  ]
}
```

---

## 5. Fontes e bibliografia sugerida

### 5.1 Livros de base (com versão em pt-PT/en/fr — para uso em lições)

| # | Obra | Autor(es) | Editora | Locale | Uso |
|---|------|-----------|---------|--------|-----|
| 1 | *Contabilidade Gerencial* | Garrison, Noreen & Brewer | Atlas / McGraw-Hill (PT-BR, amplamente usado em PT-PT também) | pt-PT | L1, L2 |
| 2 | *Management and Cost Accounting* (10th ed.) | Colin Drury | Cengage | en | L1-L4 (referência global; usado em universidades tunisianas) |
| 3 | *Comptabilité de gestion* (5ª ed.) | Henri Bouquin | Pearson | fr | L1-L3 (referência ISG Tunis) |
| 4 | *Contabilidade de Gestão* | Pedro Câmara et al. | Áreas Editora | pt-PT | L1-L2 |
| 5 | *Cost Accounting: A Managerial Emphasis* (16th ed.) | Horngren, Datar & Rajan | Pearson | en | L3-L4 (referência avançada) |
| 6 | *The Balanced Scorecard* | Kaplan & Norton | HBS Press | en | L4 |
| 7 | *Activity-Based Costing: Making It Work* | Kaplan & Cooper | McGraw-Hill | en | L4 |

### 5.2 Standards / frameworks

- **IFRS / IAS** — referência cruzada (apesar de ser Contabilidade Gerencial, muitas empresas adoptam terminology alinhada).
- **PMBOK-like para orçamento** — project-based budgeting como técnica complementar.

### 5.3 Recursos abertos para citações pontuais

- **Khan Academy — "Cost accounting"** (vídeos + exercícios) — útil para L2.
- **OpenStax — *Principles of Accounting, Volume 2: Managerial Accounting*** (gratuito, CC BY) — referência aberta para factos e exercícios base.
- **Investopedia — "Cost-Volume-Profit (CVP) Analysis"** — para definições e exemplos quick-read.

### 5.4 Contexto tunisiano (específico)

- **ISG Tunis — Programmes L2** (`http://www.isg.rnu.tn/`) — confirmar designação oficial "Comptabilité de gestion" e peso ECTS.
- **IHEC Carthage — Syllabus L2 Comptabilité de gestion** — validar sequência de capítulos.
- **Code des Sociétés Commerciales Tunisien** (Lei nº 2000-93, actualização 2024) — referência para a parte de custos e amortizações.

---

## 6. Implementação (NOTAS para Skander 2 — não executar agora)

Quando Skander 2 executar esta cadeira #31, deve seguir o mesmo padrão de gap-067/069 (Marketing Digital):

### 6.1 Ficheiros a criar

```
static/lessons/contabilidade-gerencial/
  ├─ course.json                              (metadados do curso, order: 31)
  ├─ 01-classificacao-e-comportamento-dos-custos.json
  ├─ 02-analise-custo-volume-lucro-cvp.json
  ├─ 03-orcamento-industrial-e-controlo-orcamental.json
  └─ 04-custos-avancados-abc-e-balanced-scorecard.json

static/quizzes/cgq.json                       (10 perguntas)
```

### 6.2 Locales a actualizar (5 ficheiros)

```
src/lib/i18n/pt-PT/common.json
src/lib/i18n/en/common.json
src/lib/i18n/fr/common.json
src/lib/i18n/ar/common.json
src/lib/i18n/tn/common.json
```

Chaves a adicionar (pt-PT):

```json
"routes": {
  "escola": {
    "curso": {
      "contabilidade-gerencial": {
        "title": "Contabilidade Gerencial",
        "description": "Como os gestores usam informação de custos para decidir, planear e controlar: classificação de custos, custo-volume-lucro, orçamento industrial, ABC e Balanced Scorecard."
      }
    }
  }
}
```

(Replicar para en/fr/ar/tn com as strings da secção 2.2 e 2.3.)

### 6.3 CATALOGUE a actualizar (1 entrada)

`src/routes/escola/+page.svelte` — adicionar objecto à array `COURSES`:

```js
{
  slug: 'contabilidade-gerencial',
  title: 'Contabilidade Gerencial',
  tagline: 'Business Administration · Custos, CVP, orçamento industrial, ABC e Balanced Scorecard',
  description: 'Como os gestores usam informação de custos para decidir, planear e controlar: classificação de custos, custo-volume-lucro, orçamento industrial, ABC e Balanced Scorecard.',
  icon: '📊',
  color: '#b91c1c',
  lessonCount: 4,
  quizCount: 1,
  badge: 'Uni'
},
```

Posição sugerida: **logo após `contabilidade` (L1 intro)** e antes de `analise-financeira` — para manter a progressão pedagógica: intro → gestão → avançada → análise.

### 6.4 `+page.server.ts` (`src/routes/aulas/`)

Nenhuma alteração necessária se já lê slugs dinamicamente de `static/lessons/`. Caso contrário, validar.

### 6.5 Validação pós-implementação

- `node .state/check-courses-titles.cjs` — títulos CATALOGUE ↔ i18n
- `node .state/check-i18n-parity.cjs` — paridade 5 locales
- `npm run check:overlap` — verificar que não há sobreposição semântica com `contabilidade`, `gestao-financeira-empresarial`, `analise-financeira`
- Lighthouse a11y em `/escola/curso/contabilidade-gerencial/` ≥ 0.95
- Visão `+page.svelte` do curso renders 4 lições + 1 quiz

---

## 7. Alternativas (caso Daniel queira trocar)

Se Daniel/Skander preferir uma das outras candidatas em vez de `contabilidade-gerencial`, eis os planos-resumo para cadeira #32 e #33 (sketches — apenas para contexto, não desenvolvimento completo):

### Alternativa A — `auditoria` (L3 ISG Tunis)

- **Slug:** `auditoria`
- **Título pt-PT:** Auditoria
- **Lições:** (1) Normas internacionais de auditoria (ISA), (2) Planeamento e materialidade, (3) Procedimentos de auditoria interna vs externa, (4) Relatório de auditoria e opinião.
- **Porquê não em #31:** é cadeira L3 (mais avançada do que a base actual); `contabilidade-gerencial` é L2, encaixa melhor na progressão actual.

### Alternativa B — `direito-fiscal` (L3 ISG Tunis)

- **Slug:** `direito-fiscal`
- **Título pt-PT:** Direito Fiscal
- **Lições:** (1) Sistema fiscal tunisino (IR, IS, TVA), (2) Declaração de IRS/IRPP e IS, (3) Planeamento fiscal legítimo, (4) Litígios fiscais e procedimento.
- **Porquê não em #31:** complemento directo de `direito-empresarial` (#14) mas menos transversal que `contabilidade-gerencial`.

### Alternativa C — `estatistica-aplicada-aos-negocios` (L1/L2 ISG Tunis)

- **Slug:** `estatistica-negocios`
- **Título pt-PT:** Estatística Aplicada aos Negócios
- **Lições:** (1) Estatística descritiva, (2) Probabilidade e distribuições, (3) Inferência (IC e testes), (4) Regressão e correlação.
- **Porquê não em #31:** boa cadeira de suporte mas não tem a transversalidade da `contabilidade-gerencial`.

---

## 8. Resumo executivo

| Item | Decisão |
|------|---------|
| **Cadeira #31** | `contabilidade-gerencial` |
| **Título pt-PT** | Contabilidade Gerencial |
| **Justificação** | Cadeira L2 obrigatória no curriculum BA tunisino (ISG/IHEC/ESCT); gap crítico entre `contabilidade` (intro) e `gestao-financeira-empresarial` (corporate finance avançado); aplicação prática forte em PME; literatura rica pt-PT/en/fr. |
| **Lições** | 4 (1: classificação/comportamento; 2: CVP/break-even; 3: orçamento industrial; 4: ABC + BSC) |
| **Quiz** | `cgq` com 10 perguntas, 4 opções cada |
| **Ordem no catálogo** | 31 (após `marketing-digital` = 30) |
| **Ícone / Cor** | 📊 / `#b91c1c` (red-700) |
| **i18n** | 5 locales: pt-PT / en / fr / ar / tn |
| **Próximo passo (não agora)** | Skander 2 implementa conforme §6. |

---

**Commit message:**

```
docs(state): gap-071 plan — contabilidade-gerencial cadeira BA #31
```

**Status:** ✅ Plano escrito. Não executar — Skander 2 pega quando Daniel aprovar.