# gap-107 — BA #45 Brief para Skander 2

## Contexto

- **Repo:** `C:\Users\rafaa\Documents\GitHub\presuntinho`
- **HEAD observado:** `55e240e` — `fix(i18n): gap-091 batch-1+2 — escola/* chrome PT→$t() + finanças chrome 9 chaves × 5 locales`
- **Estado:** 44 cadeiras BA entregues (última `2d09a97` BA #44 Sistemas de Informação Gerencial). gap-091 batches 3+4 em background (deleg_da34fa09). gap-104 tem brief pronto sobre Economia Comportamental (BEQ) mas ainda não implementado — manter como opção #50 do roadmap, mas não re-briefar.
- **Cadeiras já existentes em `static/lessons/`:** analise-financeira, analise-investimentos, branding, comercio-internacional, comportamento-do-consumidor, comportamento-organizacional, contabilidade, contabilidade-gerencial, data-analytics, direito-empresarial, empreendedorismo, estrategia, estrategia-corporativa, etica-negocios, gestao-financeira, gestao-financeira-empresarial, gestao-inovacao, gestao-mudanca, gestao-operacoes, gestao-qualidade, inovacao-empreendedorismo, international-business, introducao-ao-direito, lideranca-coaching, logistica, macroeconomia, marketing-digital, marketing-estrategico, marketing-internacional, microeconomia, negociacao, pesquisa-de-marketing, project-management, recursos-humanos, sistemas-de-informacao, supply-chain. **Faltam:** auditoria-controladoria, responsabilidade-social (standalone), empreendedorismo-social, economia-comportamental.
- **Notas operacionais:** source-of-truth operacional do catálogo: `src/routes/escola/+page.svelte` (COURSES inline) + `src/routes/aulas/+page.server.ts` (COURSE_META map) + `src/routes/escola/curso/[slug]/+page.svelte` (detalhe). Padrão de ficheiros: `static/lessons/<slug>/{course.json,1-*.json,…,4-*.json}` + `static/quizzes/<sigla>q.json`.

## Decisão

**Cadeira escolhida: #45 Auditoria e Controladoria** (`slug: auditoria-controladoria`, `quiz slug: adq`).

**Justificação da escolha entre os candidatos #45-50:**

| # | Título | Estado actual | Veredicto |
|---|---|---|---|
| 45 | Auditoria e Controladoria | Inexistente | ✅ **PICK** |
| 46 | Direito Empresarial | Já existe (`static/lessons/direito-empresarial/` com 4 lições + `course.json`) | ❌ já shipped |
| 47 | Ética nos Negócios | Já existe (`static/lessons/etica-negocios/` com 4 lições) | ❌ já shipped |
| 48 | Responsabilidade Social | Inexistente (mas já há lição `responsabilidade-social` dentro de `etica-negocios`) | 🟡 risco de overlap |
| 49 | Empreendedorismo Social | Inexistente | 🟡 nicho, baixa procura BBA |
| 50 | Economia Comportamental | Brief pronto em `.state/skander1-brief-ba45.md` (gap-104, não implementado) | ⏸️ manter em fila, não duplicar brief |

**Porquê Auditoria e Controladoria agora (e não depois):**

1. **Lacuna real na trilha contabilístico-financeira:** o Presuntinho tem 4 cadeiras fortes (`contabilidade`, `contabilidade-gerencial`, `analise-financeira`, `analise-investimentos`) mas nenhuma cobre **auditoria** — cadeira obrigatória em qualquer currículo BBA lusófono (ISCAL, ISEG, FGV, EAESP, IPAM) e anglo-saxónico (AACSB-accredited BBA).
2. **Complementaridade com cadeiras existentes:** dialoga com `contabilidade` (demonstrações auditadas), `contabilidade-gerencial` (controlo interno vs auditoria interna), `etica-negocios` (independência do auditor), `direito-empresarial` (obrigações legais de auditoria no Código das Sociedades Comerciais / CSC), `analise-financeira` (uso de relatórios auditados), `gestao-operacoes` (auditoria de processos).
3. **Relevância para a Fatma (20 anos, BA):** porque vai encontrá-la em qualquer estágio em contabilidade/auditoria (Big 4, PMEs, sector público), porque explica o que são relatórios "com reservas" / "sem reservas" que vê no jornal, e porque é cadeira obrigatória em vários mestrados de contabilidade/finanças que ela possa querer seguir.
4. **Relevância para a audio spec do Daniel ("tudo que souber a cadeiras da universidade"):** enquadra-se claramente como cadeira universitária, distinta das cadeiras de gestão já existentes, com vocabulário próprio (ISA, ISAs, COSO, COBIT, SOX, opinião do auditor).
5. **Evita duplicação:** os candidatos #46 e #47 já estão entregues (podemos fechar gap-107 sem lhes tocar). #50 já tem brief noutro gap. #48/#49 são temas nobres mas com público mais estreito; deixamos para gap-108/109.
6. **Não-reordenação do gap-104:** o brief de Economia Comportamental em `.state/skander1-brief-ba45.md` mantém-se válido e será despachado quando o gap-104 for consumido (não se reescreve nem se mistura com gap-107).

**Tagline curta:**
- PT: `Business Administration · Auditoria interna e externa, normas ISA, controlo interno, risco e governance`
- EN: `Business Administration · Internal and external audit, ISA standards, internal control, risk and governance`

**Icon/color sugeridos:** `🔍` / `#b45309`

---

## Cadeira

- **Slug:** `auditoria-controladoria`
- **Quiz slug:** `adq` (`auditoria e controladoria` → sigla `adq`; verificar se já existe — não consta em `static/quizzes/`)
- **Título PT:** `Auditoria e Controladoria`
- **Título EN:** `Auditing and Controllership`
- **Ordem sugerida:** 45
- **Icon/color:** `🔍` / `#b45309`
- **Tagline PT:** `Business Administration · Auditoria interna e externa, normas ISA, controlo interno, risco e governance`
- **Tagline EN:** `Business Administration · Internal and external audit, ISA standards, internal control, risk and governance`

---

## 4 Lições — temas + conteúdo

### Lição 1: Fundamentos de Auditoria e Papéis Profissionais

- **File:** `static/lessons/auditoria-controladoria/1-fundamentos-auditoria.json`
- **Title PT:** `Fundamentos de Auditoria e Papéis Profissionais`
- **Title EN:** `Audit Fundamentals and Professional Roles`
- **Resumo:** o que é auditoria, quem a faz e porquê — distinguindo auditoria externa (independente, opinião sobre demonstrações financeiras), auditoria interna (função organizacional de assurance) e auditoria de conformidade/operacional. Cobre o enquadramento legal em Portugal (Código das Sociedades Comerciais, ROC/CMVM, OROC) e as normas profissionais (IFAC/IAASB, IESBA, ISA/ISAs).

**Key concepts (3-5):**
1. **Definição e objectivos:** auditoria é um processo sistemático de obter e avaliar evidências sobre afirmações (assertions) feitas por quem preparou informação financeira ou operacional, para expressar uma opinião fundamentada.
2. **Auditoria externa vs interna:** a externa é independente, contratada pelos accionistas/sócios, regulada (ISA, IESBA Code) e dá opinião sobre se as DF estão isentas de distorções materiais; a interna é função da gestão, segue IPPF do IIA e dá assurance sobre risco, controlo e governança.
3. **Revisor Oficial de Contas (ROC):** em Portugal, o ROC é o auditor legal das sociedades que ultrapassam limiares do CSC; está registado na CMVM e sujeito a normas OROC/IFAC.
4. **Papel da controladoria:** complementar e distinto — é uma função interna de planeamento, orçamentação, controlo de gestão, custos e informação para decisão, alinhada com estratégia e compliance.
5. **Ética e independência:** ameaças (auto-revisão, interesse próprio, familiaridade, intimidação) e salvaguardas; rotação de sócio, fee dependency, presentação de serviços não-auditoria ao cliente auditado.

**Exemplos práticos/empresariais reais:**
- **Big 4 (Deloitte, PwC, EY, KPMG):** auditem demonstrações de empresas cotadas; usam metodologia global baseada em ISA e publícam transparências sobre独立性.
- **PT:** CTT, EDP, Galp — relatórios anuais com "opinião sem reservas" do ROC independente; em 2023-2024 várias empresas portuguesas emitiram sustainability reports com assurance limitada, alargando o papel do auditor.
- **Caso Wirecard (2020):** colapso de um unicórnio alemão após se descobrir fraude de ~€1.9B; EY foi criticada por falhas na auditoria — exemplo da importância de cepticismo profissional e de normas de combate à fraude (ISA 240).

**Referências teóricas clássicas:**
- IFAC / IAASB — International Standards on Auditing (ISA) 200, 230, 240, 315, 320, 330, 450, 700.
- IESBA — Code of Ethics for Professional Accountants.
- IIA (Institute of Internal Auditors) — International Standards for the Professional Practice of Internal Auditing (IPPF).
- CNV/CMVM Portugal — regulação ROC.
- OROC — Ordem dos Revisores Oficiais de Contas.
- COSO — Internal Control – Integrated Framework (2013).
- Arens, Elder & Beasley — *Auditing and Assurance Services*.

---

### Lição 2: Planeamento, Materialidade e Risco de Auditoria

- **File:** `static/lessons/auditoria-controladoria/2-planeamento-materialidade-risco.json`
- **Title PT:** `Planeamento, Materialidade e Risco de Auditoria`
- **Title EN:** `Planning, Materiality and Audit Risk`
- **Resumo:** como o auditor planeia uma auditoria de demonstrações financeiras — desde a aceitação do cliente até à estratégia de auditoria, determinação de materialidade, avaliação do risco de distorção material (ISA 315/ISA 330), e desenho de respostas (testes de controlos + procedimentos substantivos).

**Key concepts (3-5):**
1. **Aceitação e continuidade:** avaliação do cliente (integridade da gestão, competência, recursos, risco de engagement), compliance com ética, e decisão de aceitar/continuar.
2. **Materialidade (ISA 320 / ISA 450):** informação é material se a sua omissão/distorção puder influenciar decisões de utilizadores; calculada sobre referência (ex.: 5% do lucro antes de impostos, 0.5%-1% da receita ou activos), com Performance Materiality a ~50-85% desta.
3. **Risco de auditoria = Risco inerente × Risco de controlo × Risco de detecção (modelo clássico).** ISA 315 obriga a avaliar risco de distorção material ao nível das DF e ao nível de asserções (existência, plenitude, direitos, valorização, exactidão, classificação, corte).
4. **Estratégia e plano de auditoria:** âmbito, timing, direcção, recursos; mapeamento para assertions; identificação de Significant Risk e áreas-chave de auditoria (KAM — Key Audit Matters).
5. **Respostas ao risco:** testes de controlos quando se espera eficácia operativa; procedimentos substantivos (testes de detalhe + analytical procedures) sempre; maior extensão quanto maior o risco avaliado.

**Exemplos práticos/empresariais reais:**
- **Oscilação de materialidade em crises:** durante a COVID-19 (2020), muitos auditores desceram limiares de performance materiality para fazer face a maior incerteza de estimativas (going concern, imparidades).
- **KAM nos relatórios:** nos relatórios de auditoria a empresas cotadas, KAMs passaram a destacar áreas como "Imparidade de goodwill", "Provisões para litígios", "Reconhecimento de receita de contratos complexos" — como visto nos relatórios da EDP ou da Sonae.
- **Caso Tesco (2014):** overstatement de £263M de lucro levou a que o auditor (PwC) tivesse que aumentar scope substantivo sobre reconhecimento de receita e rever testing de controlos do ICFR — exemplo de resposta ao risco.

**Referências teóricas clássicas:**
- ISA 300 — Planning an Audit of Financial Statements.
- ISA 315 (revised 2019) — Identifying and Assessing the Risks of Material Misstatement.
- ISA 320 — Materiality in Planning and Performing an Audit.
- ISA 330 — The Auditor's Responses to Assessed Risks.
- ISA 701 — Key Audit Matters.
- ISA 600 — Audits of Group Financial Statements.
- Messier, Glover & Prawitt — *Auditing: A Systematic Approach*.

---

### Lição 3: Evidência, Procedimentos e Controlo Interno (COSO)

- **File:** `static/lessons/auditoria-controladoria/3-evidencia-controlo-interno.json`
- **Title PT:** `Evidência, Procedimentos e Controlo Interno (COSO)`
- **Title EN:** `Evidence, Procedures and Internal Control (COSO)`
- **Resumo:** como o auditor recolhe evidência suficiente e apropriada (ISA 500) — inspecção, observação, confirmação externa, recálculo, reexecução, analytical procedures, indagações — e como testa a eficácia do controlo interno da entidade usando o modelo COSO (5 componentes: Ambiente de controlo, Avaliação de risco, Actividades de controlo, Informação e comunicação, Actividades de monitorização).

**Key concepts (3-5):**
1. **Evidência de auditoria (ISA 500):** suficiência (quantidade) e apropriação (qualidade: relevância + fiabilidade). Documentos originais são mais fiáveis do que cópias; confirmações externas mais do que internas.
2. **Procedimentos de auditoria:** inspecção de documentos/activos, observação, confirmação externa (circularização de saldos — bancos, clientes, fornecedores), recálculo, reexecução, analytical procedures (comparações, ratios, regressões), indagações.
3. **Controlo interno — modelo COSO 2013:** 5 componentes inter-relacionados e 17 princípios; base para auditoria interna e compliance (Sarbanes-Oxley §404).
4. **Testes de controlos vs procedimentos substantivos:** testes de controlos para reduzir risco de detecção quando se confia no controlo; procedimentos substantivos (de detalhe + analíticos) sempre exigidos em áreas materiais.
5. **Amostragem de auditoria:** estatística (com base em tabelas/random selection) ou não-estatística (julgamento); estratificação; extrapolação de distorções detectadas para a população.

**Exemplos práticas/empresariais reais:**
- **Circularização de bancos:** todos os anos, auditores enviam cartas-standard aos bancos dos clientes a confirmar saldos e contratos — exemplo clássico de evidência externa altamente fiável.
- **Separação de funções (COSO — actividade de controlo):** empresa que permite ao mesmo operador registar encomendas, receber mercadoria e processar pagamento tem risco elevado; empresa com segregação de funções tem risco baixo e pode confiar em testes de controlos.
- **Caso Satyam (2009):** empresa indiana de TI com fraude de ~$1.5B em caixa e saldos bancários falsificados; o auditor (PricewaterhouseCoopers India) falhou em confirmar electronicamente saldos com bancos — exemplo de evidência inadequada.
- **SOX 404 / ICFR:** empresas cotadas nos EUA (europeias com listings US) têm que manter e auditor o Internal Control over Financial Reporting (ICFR); aplicável a subsidiárias europeias como a Jerónimo Martins Martins (após listing dual).

**Referências teóricas clássicas:**
- ISA 500 — Audit Evidence.
- ISA 501 — Audit Evidence — Specific Considerations for Selected Items.
- ISA 530 — Audit Sampling.
- ISA 540 (revised) — Auditing Accounting Estimates and Related Disclosures.
- COSO — *Internal Control – Integrated Framework* (2013).
- Turnbull Report (UK) / Combined Code — guidance para controlo interno em listed companies.
- Knechel & Salterio — *Auditing: Assurance and Risk* (definições e evidência).

---

### Lição 4: Relatório de Auditoria, Governance e Tendências (ESG, IA, Fraude)

- **File:** `static/lessons/auditoria-controladoria/4-relatorio-governance-tendencias.json`
- **Title PT:** `Relatório de Auditoria, Governance e Tendências (ESG, IA, Fraude)`
- **Title EN:** `Audit Report, Governance and Trends (ESG, AI, Fraud)`
- **Resumo:** como se escreve o relatório de auditoria (ISA 700, 701, 705, 706) — opinião não modificada (limpa), com reservas, adversa ou disclaimer — e quais as tendências contemporâneas que mudam a profissão: auditoria de informação de sustentabilidade (ISSA 5000), uso de inteligência artificial e data analytics, combate à fraude (ISA 240) e governance ESG.

**Key concepts (3-5):**
1. **Opinião do auditor (ISA 700/705):** não modificada (clean opinion), com reservas (qualified), adversa (adverse — DF estão materialmente distorcidas), ou disclaimer (impossibilidade de obter evidência).
2. **Key Audit Matters (KAM, ISA 701):** matérias de maior risco/significância comunicadas no relatório para utilizadores da informação; exemplos: imparidade de goodwill, provisões, estimativa de retorno de pensões.
3. **Governance e Corporate Governance Code:** papel do comité de auditoria (independent non-execs, financial expert), nomeação e rotação do auditor, separação entre auditoria e consultoria.
4. **Auditoria de sustentabilidade:** Corporate Sustainability Reporting Directive (CSRD) na UE obriga assurance limitada (e em breve razoável) sobre relatórios ESG; ISSA 5000 (IAASB, 2024) é o novo framework. Auditores ampliam scope para GHG, due diligence, double materiality.
5. **Tendências tecnológicas:** continuous auditing, data analytics (full-population testing em vez de amostragem), IA generativa para risk assessment, drones/inventários remotos, blockchain para confirmar provenance; novos riscos (deepfakes, fraud-as-a-service).

**Exemplos práticos/empresariais reais:**
- **Opinião com reservas da Wirecard (2020):** EY acabou por emitir disclaimer quando não conseguiu confirmar saldos bancários em trustee accounts — exemplo dramático de disclaimer.
- **CSRD na UE:** desde 2024-2025, grandes empresas europeias (incluindo Portugal) precisam assurance limitada sobre ESG; KPMG/Deloitte/PwC/EY já estruturaram Sustainability Assurance Practices.
- **Data analytics no Big 4:** auditoria 100% de transações (em vez de amostras) é já realidade para ciclos de alta volumetria (vendas, payroll) — exemplificado pelo "audit.ai" da PwC ou "Mind Bridge" usado pela BDO.
- **Caso Luckin Coffee (2020):** fraude de $310M inflando vendas; auditor (Ernst & Young) teve que reavaliar controlos sobre point-of-sale data e envolver forensic — exemplo de ISA 240 (responsabilidade do auditor sobre fraude).

**Referências teóricas clássicas:**
- ISA 700 — Forming an Opinion on Financial Statements.
- ISA 701 — Key Audit Matters in the Independent Auditor's Report.
- ISA 705 — Modifications to the Opinion in the Independent Auditor's Report.
- ISA 706 — Emphasis-of-Matter Paragraphs and Other-Matter Paragraphs.
- ISA 240 — The Auditor's Responsibilities Relating to Fraud in an Audit of Financial Statements.
- ISSA 5000 (IAASB, 2024) — General Requirements for Sustainability Assurance Engagements.
- CSRD (UE 2022/2464) e ESRS — European Sustainability Reporting Standards.
- SOX (Sarbanes-Oxley Act, 2002) — secções 302 e 404.
- IFAC — *The Future of Audit* (position papers).

---

## Quiz — 10 perguntas

**Ficheiro:** `static/quizzes/adq.json`
**ID:** `adq`
**Título PT:** `Quiz: Auditoria e Controladoria`
**Descrição PT:** `Fundamentos de auditoria externa e interna, planeamento, materialidade, risco, controlo interno (COSO), evidência, relatório de opinião, KAM, governance, fraude, ESG e tendências em IA e data analytics. 10 perguntas, 4 opções cada.`

> Formato JSON esperado: `questions: [{ q, opts: [..4], a, explanation? }]`. Manter consistência com quizzes recentes.

1. **Qual é a principal diferença entre auditoria externa e auditoria interna?**
   - A. A auditoria externa é realizada por funcionários da empresa, a interna por uma empresa independente
   - B. A auditoria externa é independente e regulada por normas profissionais (ISA), a interna é função da gestão que segue IPPF do IIA
   - C. A auditoria externa analisa apenas questões fiscais, a interna apenas questões operacionais
   - D. Não existe diferença significativa — são sinónimos
   - **Correcta:** B
   - **Cobertura:** Lição 1

2. **Em Portugal, qual entidade regula o Revisor Oficial de Contas (ROC)?**
   - A. Banco de Portugal
   - B. Ordem dos Revisores Oficiais de Contas (OROC) e CMVM
   - C. Instituto Nacional de Estatística (INE)
   - D. Autoridade Tributária
   - **Correcta:** B
   - **Cobertura:** Lição 1

3. **Qual é a definição correcta de "materialidade" em auditoria (ISA 320)?**
   - A. Toda a informação presente nas demonstrações financeiras é material
   - B. A materialidade é determinada exclusivamente pela percentagem de lucro
   - C. Informação é material se a sua omissão ou distorção puder influenciar decisões económicas dos utilizadores das DF
   - D. Materialidade é fixa em €10.000 para todas as empresas
   - **Correcta:** C
   - **Cobertura:** Lição 2

4. **O modelo clássico de risco de auditoria é:**
   - A. Risco de auditoria = Risco inerente + Risco de controlo + Risco de detecção
   - B. Risco de auditoria = Risco inerente × Risco de controlo × Risco de detecção
   - C. Risco de auditoria = Risco de mercado + Risco operacional
   - D. Risco de auditoria = Risco fiscal + Risco cambial
   - **Correcta:** B
   - **Cobertura:** Lição 2

5. **Que documento do IAASB define o quadro de identificação e avaliação de riscos de distorção material?**
   - A. ISA 240
   - B. ISA 315 (revised 2019)
   - C. ISA 700
   - D. ISA 999
   - **Correcta:** B
   - **Cobertura:** Lição 2

6. **Qual dos seguintes é considerado o procedimento de auditoria MAIS fiável para confirmar saldos bancários?**
   - A. Indagação ao tesoureiro
   - B. Confirmação externa (circularização) directamente ao banco
   - C. Observação do extracto bancário impresso
   - D. Recálculo manual dos juros
   - **Correcta:** B
   - **Cobertura:** Lição 3

7. **O modelo COSO de controlo interno (2013) tem quantos componentes?**
   - A. 3 componentes
   - B. 5 componentes
   - C. 7 componentes
   - D. 12 componentes
   - **Correcta:** B
   - **Cobertura:** Lição 3

8. **Que tipo de opinião o auditor emite quando existem distorções materiais mas não generalizadas nas demonstrações financeiras?**
   - A. Opinião não modificada (limpa)
   - B. Opinião com reservas (qualified)
   - C. Opinião adversa (adverse)
   - D. Disclaimer (impossibilidade)
   - **Correcta:** B
   - **Cobertura:** Lição 4

9. **O que são Key Audit Matters (KAM, ISA 701)?**
   - A. Matérias de menor risco seleccionadas pelo auditor para omitir do relatório
   - B. Matérias de maior significância na auditoria, comunicadas no relatório para utilizadores
   - C. Lista de clientes do auditor
   - D. Recomendações operacionais à gestão
   - **Correcta:** B
   - **Cobertura:** Lição 4

10. **Qual directiva europeia obriga (desde 2024-2025) grandes empresas a obter assurance limitada sobre relatórios de sustentabilidade?**
    - A. GDPR
    - B. MiFID II
    - C. CSRD (Corporate Sustainability Reporting Directive)
    - D. Basel III
    - **Correcta:** C
    - **Cobertura:** Lição 4

---

## Ficheiros a criar/modificar

### Criar conteúdo estático

1. `static/lessons/auditoria-controladoria/course.json`
2. `static/lessons/auditoria-controladoria/1-fundamentos-auditoria.json`
3. `static/lessons/auditoria-controladoria/2-planeamento-materialidade-risco.json`
4. `static/lessons/auditoria-controladoria/3-evidencia-controlo-interno.json`
5. `static/lessons/auditoria-controladoria/4-relatorio-governance-tendencias.json`
6. `static/quizzes/adq.json`

### Modificar i18n — 5 locales

Adicionar 7 chaves em cada `src/lib/i18n/{pt-PT,en,fr,tn,ar}.json`:

1. `routes.escola.curso.auditoria-controladoria.title`
2. `routes.escola.curso.auditoria-controladoria.description`
3. `routes.escola.curso.auditoria-controladoria.tagline`
4. `routes.aulas.curso.auditoria-controladoria.title`
5. `routes.aulas.curso.auditoria-controladoria.tagline`
6. `routes.escola.quiz.adq.title`
7. `routes.escola.quiz.adq.description`

**Total:** 7 chaves × 5 locales = **35 entries**.

#### Textos sugeridos — pt-PT

- `routes.escola.curso.auditoria-controladoria.title`: `Auditoria e Controladoria`
- `routes.escola.curso.auditoria-controladoria.description`: `Auditoria e controladoria aplicadas à gestão empresarial: fundamentos da auditoria externa (ISA) e interna (IPPF/IIA), planeamento de auditoria, materialidade e risco de distorção (ISA 315/330), evidência suficiente e apropriada, modelo COSO de controlo interno, relatório de opinião e Key Audit Matters (KAM, ISA 700/701), governance, fraude (ISA 240), auditoria de sustentabilidade (ISSA 5000, CSRD) e tendências em data analytics e IA.`
- `routes.escola.curso.auditoria-controladoria.tagline`: `Business Administration · Auditoria interna e externa, normas ISA, controlo interno, risco e governance`
- `routes.aulas.curso.auditoria-controladoria.title`: `Auditoria e Controladoria`
- `routes.aulas.curso.auditoria-controladoria.tagline`: `Business Administration · Auditoria interna e externa, normas ISA, controlo interno, risco e governance`
- `routes.escola.quiz.adq.title`: `Quiz: Auditoria e Controladoria`
- `routes.escola.quiz.adq.description`: `Testa os teus conhecimentos de auditoria e controladoria: auditoria externa e interna, ROC/OROC, planeamento, materialidade (ISA 320), risco de distorção (ISA 315/330), evidência (ISA 500), modelo COSO, relatório de opinião e KAM (ISA 700/701), fraude (ISA 240), CSRD/ESG e tendências em IA e data analytics. 10 perguntas, 4 opções cada.`

#### Textos sugeridos — en

- `routes.escola.curso.auditoria-controladoria.title`: `Auditing and Controllership`
- `routes.escola.curso.auditoria-controladoria.description`: `Auditing and controllership applied to business management: external (ISA) and internal audit (IPPF/IIA) fundamentals, audit planning, materiality and misstatement risk (ISA 315/330), sufficient appropriate audit evidence, COSO internal control framework, opinion report and Key Audit Matters (ISA 700/701), governance, fraud (ISA 240), sustainability assurance (ISSA 5000, CSRD) and trends in data analytics and AI.`
- `routes.escola.curso.auditoria-controladoria.tagline`: `Business Administration · Internal and external audit, ISA standards, internal control, risk and governance`
- `routes.aulas.curso.auditoria-controladoria.title`: `Auditing and Controllership`
- `routes.aulas.curso.auditoria-controladoria.tagline`: `Business Administration · Internal and external audit, ISA standards, internal control, risk and governance`
- `routes.escola.quiz.adq.title`: `Quiz: Auditing and Controllership`
- `routes.escola.quiz.adq.description`: `Test your knowledge of auditing and controllership: external and internal audit, planning, materiality (ISA 320), misstatement risk (ISA 315/330), evidence (ISA 500), COSO framework, opinion report and KAM (ISA 700/701), fraud (ISA 240), CSRD/ESG assurance and trends in AI and data analytics. 10 questions, 4 options each.`

#### Textos sugeridos — fr

- `routes.escola.curso.auditoria-controladoria.title`: `Audit et Contrôle de Gestion`
- `routes.escola.curso.auditoria-controladoria.description`: `Audit et contrôle de gestion appliqués à la gestion d'entreprise : fondamentaux de l'audit externe (ISA) et interne (IPPF/IIA), planification d'audit, matérialité et risque d'anomalies significatives (ISA 315/330), éléments probants suffisants et appropriés, cadre COSO de contrôle interne, rapport d'opinion et Key Audit Matters (ISA 700/701), gouvernance, fraude (ISA 240), assurance durabilité (ISSA 5000, CSRD) et tendances en data analytics et IA.`
- `routes.escola.curso.auditoria-controladoria.tagline`: `Business Administration · Audit interne et externe, normes ISA, contrôle interne, risque et gouvernance`
- `routes.aulas.curso.auditoria-controladoria.title`: `Audit et Contrôle de Gestion`
- `routes.aulas.curso.auditoria-controladoria.tagline`: `Business Administration · Audit interne et externe, normes ISA, contrôle interne, risque et gouvernance`
- `routes.escola.quiz.adq.title`: `Quiz : Audit et Contrôle de Gestion`
- `routes.escola.quiz.adq.description`: `Teste tes connaissances en audit et contrôle de gestion : audit externe et interne, planification, matérialité (ISA 320), risque d'anomalies (ISA 315/330), éléments probants (ISA 500), cadre COSO, rapport d'opinion et KAM (ISA 700/701), fraude (ISA 240), assurance CSRD/ESG et tendances en IA et data analytics. 10 questions, 4 options chacune.`

#### Textos sugeridos — tn

- `routes.escola.curso.auditoria-controladoria.title`: `Audit w Contrôle de Gestion`
- `routes.escola.curso.auditoria-controladoria.description`: `Audit w contrôle de gestion appliqués lel-gestion d'entreprise : fondamentaux mtaa l'audit externe (ISA) w interne (IPPF/IIA), planification d'audit, matérialité w risque d'anomalies significatives (ISA 315/330), éléments probants suffisants w appropriés, cadre COSO mtaa contrôle interne, rapport d'opinion w Key Audit Matters (ISA 700/701), gouvernance, fraude (ISA 240), assurance durabilité (ISSA 5000, CSRD) w tendances fi data analytics w IA.`
- `routes.escola.curso.auditoria-controladoria.tagline`: `Business Administration · Audit interne w externe, normes ISA, contrôle interne, risque w gouvernance`
- `routes.aulas.curso.auditoria-controladoria.title`: `Audit w Contrôle de Gestion`
- `routes.aulas.curso.auditoria-controladoria.tagline`: `Business Administration · Audit interne w externe, normes ISA, contrôle interne, risque w gouvernance`
- `routes.escola.quiz.adq.title`: `Quiz : Audit w Contrôle de Gestion`
- `routes.escola.quiz.adq.description`: `Teste connaisances mtaaek fi audit w contrôle de gestion : audit externe w interne, planification, matérialité (ISA 320), risque d'anomalies (ISA 315/330), éléments probants (ISA 500), cadre COSO, rapport d'opinion w KAM (ISA 700/701), fraude (ISA 240), assurance CSRD/ESG w tendances fi IA w data analytics. 10 questions, 4 options kol wahda.`

#### Textos sugeridos — ar

- `routes.escola.curso.auditoria-controladoria.title`: `التدقيق والرقابة الإدارية`
- `routes.escola.curso.auditoria-controladoria.description`: `التدقيق والرقابة الإدارية المطبّقان على إدارة الأعمال: أساسيات التدقيق الخارجي (معايير ISA) والداخلي (IPPF/IIA)، تخطيط التدقيق، الأهمية النسبية ومخاطر التحريف الجوهري (ISA 315/330)، أدلة تدقيق كافية وملائمة، إطار COSO للرقابة الداخلية، تقرير الرأي والمسائل الرئيسية للتدقيق KAM (ISA 700/701)، الحوكمة، الاحتيال (ISA 240)، التأكيد على الاستدامة (ISSA 5000، CSRD) والاتجاهات في تحليل البيانات والذكاء الاصطناعي.`
- `routes.escola.curso.auditoria-controladoria.tagline`: `إدارة الأعمال · التدقيق الداخلي والخارجي، معايير ISA، الرقابة الداخلية، المخاطر والحوكمة`
- `routes.aulas.curso.auditoria-controladoria.title`: `التدقيق والرقابة الإدارية`
- `routes.aulas.curso.auditoria-controladoria.tagline`: `إدارة الأعمال · التدقيق الداخلي والخارجي، معايير ISA، الرقابة الداخلية، المخاطر والحوكمة`
- `routes.escola.quiz.adq.title`: `اختبار: التدقيق والرقابة الإدارية`
- `routes.escola.quiz.adq.description`: `اختبر معرفتك بالتدقيق والرقابة الإدارية: التدقيق الخارجي والداخلي، التخطيط، الأهمية النسبية (ISA 320)، مخاطر التحريف (ISA 315/330)، أدلة التدقيق (ISA 500)، إطار COSO، تقرير الرأي والمسائل الرئيسية KAM (ISA 700/701)، الاحتيال (ISA 240)، التأكيد CSRD/ESG والاتجاهات في الذكاء الاصطناعي وتحليل البيانات. 10 أسئلة، 4 خيارات لكل سؤال.`

### Modificar wiring — 3 ficheiros

1. `src/routes/escola/+page.svelte` (COURSES array)
   - Inserir entry com:
     - `slug: 'auditoria-controladoria'`
     - `title: 'Auditoria e Controladoria'`
     - `tagline: 'Business Administration · Auditoria interna e externa, normas ISA, controlo interno, risco e governance'`
     - `description: <descrição pt-PT acima>`
     - `icon: '🔍'`
     - `color: '#b45309'`
     - `lessonCount: 4`
     - `quizCount: 1`
     - `badge: 'Uni'`
   - **Posição sugerida:** após `analise-investimentos` (última cadeira do bloco contabilístico-financeiro) ou junto a `analise-financeira`/`analise-investimentos` — afinidade temática.

2. `src/routes/escola/curso/[slug]/+page.svelte`
   - Inserir course metadata e lessons:
     - `slug: 'auditoria-controladoria'`
     - `title: 'Auditoria e Controladoria'`
     - `tagline`, `description`, `icon`, `color`
     - `lessons`:
       1. `{ slug: '1-fundamentos-auditoria', title: '1. Fundamentos de Auditoria e Papéis Profissionais', summary: 'Auditoria externa vs interna, ROC/OROC, CMVM, normas ISA, IESBA, IPPF do IIA.', quizSlug: 'adq', quizTitle: 'Quiz: Auditoria e Controladoria', estMinutes: 9 }`
       2. `{ slug: '2-planeamento-materialidade-risco', title: '2. Planeamento, Materialidade e Risco de Auditoria', summary: 'Aceitação do cliente, materialidade (ISA 320), risco inerente/controlo/detecção, ISA 315/330, KAM.', quizSlug: 'adq', quizTitle: 'Quiz: Auditoria e Controladoria', estMinutes: 10 }`
       3. `{ slug: '3-evidencia-controlo-interno', title: '3. Evidência, Procedimentos e Controlo Interno (COSO)', summary: 'ISA 500 evidência suficiente e apropriada, procedimentos, modelo COSO 5 componentes, amostragem.', quizSlug: 'adq', quizTitle: 'Quiz: Auditoria e Controladoria', estMinutes: 10 }`
       4. `{ slug: '4-relatorio-governance-tendencias', title: '4. Relatório de Auditoria, Governance e Tendências (ESG, IA, Fraude)', summary: 'ISA 700/701/705, KAM, opinião limpa/com reservas/adversa, CSRD, ISSA 5000, IA, fraude (ISA 240).', quizSlug: 'adq', quizTitle: 'Quiz: Auditoria e Controladoria', estMinutes: 9 }`

3. `src/routes/aulas/+page.server.ts`
   - Inserir em `COURSE_META`:
     - `'auditoria-controladoria': { slug: 'auditoria-controladoria', title: 'Auditoria e Controladoria', icon: '🔍', color: '#b45309' }`

---

## Estrutura JSON sugerida

### `static/lessons/auditoria-controladoria/course.json`

```json
{
  "slug": "auditoria-controladoria",
  "title": "Auditoria e Controladoria",
  "icon": "🔍",
  "color": "#b45309",
  "description": "Auditoria e controladoria aplicadas à gestão empresarial: fundamentos da auditoria externa (ISA) e interna (IPPF/IIA), planeamento de auditoria, materialidade e risco de distorção (ISA 315/330), evidência suficiente e apropriada, modelo COSO de controlo interno, relatório de opinião e Key Audit Matters (KAM, ISA 700/701), governance, fraude (ISA 240), auditoria de sustentabilidade (ISSA 5000, CSRD) e tendências em data analytics e IA.",
  "order": 45
}
```

### Lesson JSON padrão

```json
{
  "id": "1-fundamentos-auditoria",
  "courseSlug": "auditoria-controladoria",
  "title": "Fundamentos de Auditoria e Papéis Profissionais",
  "audio": "Lição sobre auditoria e controladoria, fundamentos de auditoria externa e interna, ROC e normas profissionais.<break/><break/>Vamos começar.",
  "audioLabel": "🎧 Lição em áudio (TTS)",
  "sections": [
    { "type": "h2", "text": "..." },
    { "type": "p", "text": "..." },
    { "type": "ul", "items": ["...", "...", "..."] },
    { "type": "callout", "variant": "example", "text": "..." }
  ],
  "keyPoints": ["...", "...", "...", "...", "..."],
  "quizSlug": "adq",
  "nextLesson": "2-planeamento-materialidade-risco",
  "prevLesson": null
}
```

**Navigation esperada:**
- Lição 1: `nextLesson: "2-planeamento-materialidade-risco"`, `prevLesson: null`
- Lição 2: `nextLesson: "3-evidencia-controlo-interno"`, `prevLesson: "1-fundamentos-auditoria"`
- Lição 3: `nextLesson: "4-relatorio-governance-tendencias"`, `prevLesson: "2-planeamento-materialidade-risco"`
- Lição 4: `nextLesson: null`, `prevLesson: "3-evidencia-controlo-interno"`

---

## Validação

Skander 2 deve executar **após implementar**:

```sh
cd /c/Users/rafaa/Documents/GitHub/presuntinho

# 1) Garantir que não tocou em ficheiros fora do scope
git status --short

# 2) JSON válido para novos ficheiros e i18n
python -m json.tool static/lessons/auditoria-controladoria/course.json > /dev/null
for f in static/lessons/auditoria-controladoria/*.json; do python -m json.tool "$f" > /dev/null && echo "OK: $f"; done
python -m json.tool static/quizzes/adq.json > /dev/null
for f in src/lib/i18n/{pt-PT,en,fr,tn,ar}.json; do python -m json.tool "$f" > /dev/null && echo "OK: $f"; done

# 3) Confirmar 4 lições + course.json
ls static/lessons/auditoria-controladoria/

# 4) Confirmar quiz com 10 perguntas
python - <<'PY'
import json
q=json.load(open('static/quizzes/adq.json', encoding='utf-8'))
assert q['id']=='adq'
assert len(q['questions'])==10, len(q['questions'])
for i,item in enumerate(q['questions'],1):
    assert len(item['opts'])==4, i
    assert item['a'] in range(4), i
print('OK adq 10 questions')
PY

# 5) Confirmar i18n parity dos novos keys
python - <<'PY'
import json
keys = [
 'routes.escola.curso.auditoria-controladoria.title',
 'routes.escola.curso.auditoria-controladoria.description',
 'routes.escola.curso.auditoria-controladoria.tagline',
 'routes.aulas.curso.auditoria-controladoria.title',
 'routes.aulas.curso.auditoria-controladoria.tagline',
 'routes.escola.quiz.adq.title',
 'routes.escola.quiz.adq.description',
]
for loc in ['pt-PT','en','fr','tn','ar']:
    data=json.load(open(f'src/lib/i18n/{loc}.json', encoding='utf-8'))
    missing=[k for k in keys if k not in data]
    assert not missing, (loc, missing)
print('OK i18n keys auditoria-controladoria/adq in 5 locales')
PY

# 6) Confirmar que NÃO há duplicação de slug existente
python - <<'PY'
import json
courses=json.load(open('src/routes/escola/+page.svelte' if False else 'src/routes/escola/+page.svelte', encoding='utf-8'))
PY

# 7) Build
npm run build

# 8) Smoke local
npm run dev &
DEV_PID=$!
sleep 5
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/escola/curso/auditoria-controladoria/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/escola/licao/auditoria-controladoria/1-fundamentos-auditoria/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/escola/quiz/adq/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/aulas/
kill $DEV_PID
```

### Smoke URLs de produção esperadas após entrega

Estas URLs devem deixar de ser 404 e passar a 200 após o gap ser implementado/deployado:

1. `/escola/curso/auditoria-controladoria/`
2. `/escola/licao/auditoria-controladoria/1-fundamentos-auditoria/`
3. `/escola/quiz/adq/`

---

## Mensagem de commit sugerida

```txt
feat(escola): gap-107 — Auditoria e Controladoria (BA #45, 4 lições + adq quiz + i18n 5 locales + catálogo wired)
```

Body sugerido:

```txt
- add BA #45 Auditoria e Controladoria / Auditing and Controllership
- add 4 lessons: audit fundamentals & roles, planning/materiality/risk, evidence & COSO internal control, report/governance/trends (ESG/AI/fraud)
- add adq quiz with 10 MCQ questions
- add course metadata under static/lessons/auditoria-controladoria/course.json
- add i18n keys for course + aulas + quiz across pt-PT/en/fr/tn/ar
- wire course in escola catalogue, curso/[slug], and aulas server meta
- Refs: gap-107
```

---

## Resumo da decisão (1 parágrafo)

Para gap-107, escolhi **BA #45 Auditoria e Controladoria** (`slug: auditoria-controladoria`, quiz `adq`) entre os candidatos #45-50: dos seis propostos pelo watchdog (#45 Auditoria e Controladoria, #46 Direito Empresarial, #47 Ética nos Negócios, #48 Responsabilidade Social, #49 Empreendedorismo Social, #50 Economia Comportamental), dois (#46 e #47) já têm conteúdo e CATALOGUE wired em `static/lessons/` (não se pode re-briefar), um (#50) já tem brief pronto em gap-104 que continua na fila (não se duplica), e os restantes dois (#48 Responsabilidade Social e #49 Empreendedorismo Social) ou se sobrepõem ao conteúdo já existente em `etica-negocios` ou são nicho mais estreito num currículo BBA. **Auditoria e Controladoria** fecha uma lacuna real na trilha contabilístico-financeira (o Presuntinho tem `contabilidade`, `contabilidade-gerencial`, `analise-financeira`, `analise-investimentos` mas nenhuma cadeira de auditoria), é cadeira obrigatória em praticamente todos os programas BBA lusófonos e anglo-saxónicos, é directamente relevante para a Fatma (20 anos, BA, com estágios frequentes em Big 4 / PMEs / sector público) e serve a audio spec do Daniel ("tudo que souber a cadeiras da universidade") por ser cadeira universitária canónica com vocabulário próprio (ISA, COSO, COBIT, SOX, ROC, opinião do auditor, KAM, ISSA 5000, CSRD) e grande actualidade (ESG assurance, IA em auditoria, combate à fraude). O brief abaixo entrega slug, 4 lições com conteúdo programático, 10 perguntas de quiz, i18n em 5 locales (7 chaves × 5 locales = 35 entries) e o plano de wiring nos 3 ficheiros source-of-truth.
