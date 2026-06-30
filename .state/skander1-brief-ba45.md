# gap-104 — BA #45 Brief para Skander 2

## Contexto

**Repo:** `C:\Users\rafaa\Documents\GitHub\presuntinho`  
**HEAD observado:** `d3e8a1e` — `chore(state): close gap-101 ... + gap-104 (BA #45 brief Skander1 ...)`  
**Base académica:** app Presuntinho já tem 44 cadeiras BA entregues; última BA completa mencionada no briefing: `2d09a97` — Sistemas de Informação Gerencial (#44).  
**Working tree:** existem alterações/untracked fora deste brief; **Skander 2 não deve tocar** em ficheiros não-listados. Observado: `static/quizzes/ccq.json` modificado e vários `.state/*` untracked.  
**Nota de realidade do repo:** o briefing menciona `src/lib/data/catalogue.ts`, mas no checkout actual o catálogo de cursos está inline em `src/routes/escola/+page.svelte` e duplicado/espelhado em `src/routes/escola/curso/[slug]/+page.svelte` + `src/routes/aulas/+page.server.ts`. Usar esses 3 ficheiros como source-of-truth operacional.

**Verificação de catálogo:** inspeccionado `src/routes/escola/+page.svelte` e slugs existentes. Já existem, entre outros: `estrategia`, `estrategia-corporativa`, `marketing-internacional`, `gestao-financeira`, `contabilidade`, `microeconomia`, `macroeconomia`, `recursos-humanos`, `comportamento-organizacional`, `gestao-inovacao`, `comercio-internacional`, `etica-negocios`, `direito-empresarial`, `gestao-operacoes`, `analise-financeira`, `comportamento-do-consumidor`, `pesquisa-de-marketing`, `gestao-mudanca`, `negociacao`, `introducao-ao-direito`, `logistica`, `sistemas-de-informacao`, `inovacao-empreendedorismo`, `international-business`, `supply-chain`, `data-analytics`, `project-management`, `gestao-financeira-empresarial`, `contabilidade-gerencial`, `empreendedorismo`, `gestao-qualidade`, `lideranca-coaching`, `analise-investimentos`.

**Pesquisa curricular / rationale:** programas típicos de Business Administration/BBA nos EUA, Europa e espaço lusófono costumam ter um bloco quantitativo/económico (Micro/Macro/Economics), um bloco de gestão funcional (Marketing, Finance, Operations, HR, Strategy) e electives contemporâneos em decisão, comportamento do consumidor, analytics, inovação e ética. Uma lacuna clara no Presuntinho é **Behavioral Economics / Managerial Decision Making**: não é apenas Microeconomia, nem Comportamento Organizacional, nem Comportamento do Consumidor. É a disciplina que explica como pessoas reais tomam decisões sob incerteza, como vieses distorcem escolhas e como empresas/governos desenham ambientes de escolha mais eficazes.

---

## Cadeira escolhida

- **Slug:** `economia-comportamental`
- **Quiz slug:** `beq` (`ecq` já existe: Estratégia Corporativa Avançada)
- **Título PT:** `Economia Comportamental`
- **Título EN:** `Behavioral Economics`
- **Icon/color sugeridos:** `🧠` / `#7c3aed`
- **Ordem sugerida:** `45`
- **Tagline PT:** `Business Administration · Heurísticas, vieses, prospect theory, nudges e decisão empresarial`
- **Tagline EN:** `Business Administration · Heuristics, biases, prospect theory, nudges and managerial decision-making`

### Justificação

**Economia Comportamental** é uma cadeira BA muito complementar ao catálogo actual: parte da base de `microeconomia`, conversa com `comportamento-do-consumidor`, melhora `negociacao`, informa `marketing-estrategico`, ajuda `lideranca-coaching` e dá ferramentas práticas para decisões empresariais sob risco. Para a Fatma (20 anos, BA), é altamente útil porque transforma teoria em situações do dia-a-dia: pricing, promoções, poupança, contratação, avaliação de investimentos, desenho de apps, UX, políticas internas e gestão de equipas. A disciplina tem forte densidade académica (Simon, Kahneman, Tversky, Thaler, Ariely, Sunstein) e é suficientemente distinta para não duplicar cursos existentes.

---

## 4 Lições — temas + conteúdo

### Lição 1: Racionalidade Limitada, Heurísticas e Vieses

- **File:** `static/lessons/economia-comportamental/1-racionalidade-limitada-vieses.json`
- **Title PT:** `Racionalidade Limitada, Heurísticas e Vieses`
- **Title EN:** `Bounded Rationality, Heuristics and Biases`
- **Resumo:** introduzir a ruptura entre o agente económico perfeitamente racional e a pessoa real que decide com informação incompleta, tempo limitado, emoções e atalhos mentais.

**Key concepts (3-5):**
1. **Racionalidade limitada (bounded rationality):** Herbert Simon mostrou que gestores raramente maximizam; normalmente procuram soluções satisfatórias (`satisficing`) sob limites cognitivos, tempo e informação incompleta.
2. **Heurísticas como atalhos úteis:** disponibilidade, representatividade e ancoragem reduzem esforço cognitivo, mas podem gerar erros sistemáticos quando aplicadas fora de contexto.
3. **Vieses cognitivos sistemáticos:** excesso de confiança, confirmação, hindsight bias e framing effects alteram julgamentos empresariais, previsões de vendas, recrutamento e avaliação de projectos.
4. **Sistema 1 vs Sistema 2:** Kahneman distingue pensamento rápido/intuitivo e pensamento lento/analítico; ambos são úteis, mas devem ser usados conscientemente.
5. **Debiasing e decision hygiene:** pré-mortem, red team, base rates, checklists e separação entre quem propõe e quem avalia reduzem erros recorrentes.

**Exemplos práticos/empresariais reais:**
- **Startups e excesso de confiança:** fundadores sobrestimam TAM, velocidade de adopção e capacidade de execução; uma prática de pré-mortem ajuda a identificar hipóteses frágeis antes de gastar capital.
- **Recrutamento e viés de confirmação:** entrevistadores formam uma impressão nos primeiros minutos e depois procuram provas para a confirmar; entrevistas estruturadas reduzem esse efeito.
- **Previsão de vendas no retalho:** equipas podem ancorar-se no mês anterior e ignorar sazonalidade, concorrência ou mudança de preço; usar base rates históricos corrige a previsão.

**Referências teóricas clássicas:**
- Herbert A. Simon — `Administrative Behavior`, bounded rationality, satisficing.
- Daniel Kahneman & Amos Tversky — heuristics and biases program.
- Daniel Kahneman — `Thinking, Fast and Slow`.
- Max Bazerman & Don Moore — decision-making and judgement in management.

---

### Lição 2: Teoria da Perspectiva, Perdas e Risco

- **File:** `static/lessons/economia-comportamental/2-prospect-theory-risco.json`
- **Title PT:** `Teoria da Perspectiva, Perdas e Risco`
- **Title EN:** `Prospect Theory, Losses and Risk`
- **Resumo:** explicar como pessoas avaliam ganhos/perdas relativamente a um ponto de referência, por que perdas doem mais que ganhos equivalentes e como isso afecta preços, investimentos e negociação.

**Key concepts (3-5):**
1. **Prospect Theory:** Kahneman e Tversky propõem que decisões sob risco dependem de ganhos e perdas percebidos, não apenas de riqueza final absoluta.
2. **Aversão à perda:** perdas têm peso psicológico superior a ganhos equivalentes; isto explica resistência a cortes, medo de vender activos em perda e reacções fortes a fees.
3. **Ponto de referência:** preço anterior, salário esperado, orçamento inicial ou meta de vendas alteram a percepção de valor; gerir referências é central em pricing e negociação.
4. **Efeito dotação (endowment effect):** pessoas valorizam mais aquilo que já possuem; relevante para trials, freemium, devoluções e retenção de clientes.
5. **Mental accounting:** consumidores e gestores separam dinheiro em “contas mentais” (budget de férias, marketing, emergência), mesmo quando o dinheiro é fungível.

**Exemplos práticos/empresariais reais:**
- **Netflix/Spotify e trials:** quando o utilizador passa a “ter” acesso ao serviço, cancelar é percebido como perda; o efeito dotação aumenta retenção.
- **Black Friday e reference pricing:** descontos parecem maiores quando comparados com um preço de referência alto; se o consumidor considera esse preço credível, a promoção ganha força.
- **Investidores que seguram acções perdedoras:** aversão à perda e disposition effect levam a vender vencedoras cedo e manter perdedoras demasiado tempo.

**Referências teóricas clássicas:**
- Daniel Kahneman & Amos Tversky — `Prospect Theory: An Analysis of Decision under Risk` (1979).
- Richard Thaler — mental accounting, endowment effect, behavioral finance.
- Jack Knetsch — experiments on endowment effect.
- Hersh Shefrin & Meir Statman — disposition effect in finance.

---

### Lição 3: Nudges, Arquitectura da Escolha e Ética

- **File:** `static/lessons/economia-comportamental/3-nudges-arquitectura-escolha.json`
- **Title PT:** `Nudges, Arquitectura da Escolha e Ética`
- **Title EN:** `Nudges, Choice Architecture and Ethics`
- **Resumo:** mostrar como pequenas mudanças no ambiente de decisão alteram comportamentos sem remover liberdade de escolha, e discutir os limites éticos entre ajudar, persuadir e manipular.

**Key concepts (3-5):**
1. **Nudge:** intervenção leve que altera comportamento previsivelmente sem proibir opções nem alterar incentivos económicos de forma significativa.
2. **Arquitectura da escolha:** ordem, default, saliência, fricção, feedback, simplificação e timing influenciam decisões de clientes e colaboradores.
3. **Defaults e opt-out:** opções predefinidas são poderosas porque exploram inércia, procrastinação e custo cognitivo de mudar.
4. **Saliência e feedback:** tornar consequências visíveis no momento certo (ex.: custo total, emissões, risco, progresso) aumenta qualidade da decisão.
5. **Ética dos nudges:** transparência, autonomia, welfare do utilizador e reversibilidade distinguem um nudge legítimo de dark patterns.

**Exemplos práticos/empresariais reais:**
- **Planos de pensões com inscrição automática:** defaults de opt-out aumentam adesão à poupança sem obrigar ninguém a participar.
- **Checkout de e-commerce:** simplificar etapas reduz abandono de carrinho; mas esconder custos até ao fim pode virar dark pattern antiético.
- **Cantinas e disposição de produtos:** colocar fruta ao nível dos olhos aumenta escolhas saudáveis sem retirar sobremesas.

**Referências teóricas clássicas:**
- Richard Thaler & Cass Sunstein — `Nudge`, libertarian paternalism.
- Cass Sunstein — choice architecture and public policy.
- Eric Johnson & Daniel Goldstein — defaults and organ donation.
- OECD / Behavioural Insights Team — aplicação institucional de behavioral insights.

---

### Lição 4: Aplicações em Marketing, Finanças e Gestão

- **File:** `static/lessons/economia-comportamental/4-aplicacoes-negocios.json`
- **Title PT:** `Aplicações em Marketing, Finanças e Gestão`
- **Title EN:** `Applications in Marketing, Finance and Management`
- **Resumo:** consolidar a cadeira em decisões empresariais: pricing, UX, negociação, avaliação de performance, orçamento, poupança, crédito, gestão de equipas e experimentação.

**Key concepts (3-5):**
1. **Behavioral pricing:** preço âncora, decoy effect, bundles, assinatura, gratuidade e escassez afectam percepção de valor e conversão.
2. **Behavioral finance:** overconfidence, herd behavior, recency bias e loss aversion explicam bolhas, pânico e decisões de carteira.
3. **Gestão e performance:** metas, incentivos, rankings e feedback podem motivar ou distorcer comportamento; Goodhart’s Law alerta que métricas viram alvo e podem perder valor.
4. **Experimentação A/B:** decisões comportamentais devem ser testadas; hipóteses sobre UX, mensagens e defaults precisam de dados, não apenas intuição.
5. **Cultura de decisão:** organizações boas criam processos para documentar hipóteses, separar decisão de resultado e aprender com erros sem caça às bruxas.

**Exemplos práticos/empresariais reais:**
- **The Economist decoy pricing:** adicionar uma opção “print only” tornava a opção “print + digital” mais atractiva, ilustrando o efeito isco/decoy.
- **Amazon/Booking e escassez:** mensagens de disponibilidade e urgência podem ajudar decisão, mas se falsas tornam-se manipulação e risco reputacional/regulatório.
- **Bancos e cartões de crédito:** pagamentos mínimos salientados podem ancorar consumidores em pagamentos baixos, prolongando dívida; disclosure claro ajuda escolha responsável.

**Referências teóricas clássicas:**
- Dan Ariely — irrationality, decoy effects, experiments on pricing.
- Richard Thaler — behavioral finance, mental accounting.
- Robert Shiller — irrational exuberance and market narratives.
- Colin Camerer — behavioral game theory and managerial applications.

---

## Quiz — 10 perguntas

**Ficheiro:** `static/quizzes/beq.json`  
**ID:** `beq`  
**Título PT:** `Quiz: Economia Comportamental`  
**Descrição PT:** `Heurísticas, vieses, prospect theory, aversão à perda, nudges, arquitectura da escolha e aplicações em marketing, finanças e gestão.`

> Formato esperado no JSON: `questions: [{ q, opts: [..4], a, explanation? }]`. Os quizzes recentes aceitam/contêm `explanation`; se Skander 2 quiser manter o mínimo histórico, pode omitir explanations, mas recomenda-se incluir.

1. **O que significa “racionalidade limitada” na decisão empresarial?**
   - A. Gestores são sempre irracionais e não conseguem decidir
   - B. Gestores decidem com limites de informação, tempo e capacidade cognitiva
   - C. Empresas devem ignorar dados quantitativos
   - D. A melhor decisão é sempre a que maximiza lucro de curto prazo
   - **Correcta:** B
   - **Cobertura:** Lição 1

2. **Qual heurística ocorre quando uma pessoa estima a probabilidade de um evento com base em exemplos fáceis de lembrar?**
   - A. Disponibilidade
   - B. Contabilidade mental
   - C. Aversão à perda
   - D. Efeito dotação
   - **Correcta:** A
   - **Cobertura:** Lição 1

3. **Numa entrevista, o avaliador gosta do candidato nos primeiros minutos e depois interpreta todas as respostas como confirmação dessa primeira impressão. Isto é sobretudo:**
   - A. Viés de confirmação
   - B. Mental accounting
   - C. Prospect theory
   - D. Herd behavior
   - **Correcta:** A
   - **Cobertura:** Lição 1

4. **Segundo a Teoria da Perspectiva, as pessoas avaliam decisões principalmente em relação a:**
   - A. Ganhos e perdas face a um ponto de referência
   - B. Riqueza final absoluta apenas
   - C. Lucro contabilístico da empresa
   - D. Preços médios do mercado accionista
   - **Correcta:** A
   - **Cobertura:** Lição 2

5. **Aversão à perda significa que:**
   - A. Pessoas nunca assumem riscos
   - B. Perdas tendem a pesar psicologicamente mais do que ganhos equivalentes
   - C. Todos os consumidores preferem produtos baratos
   - D. Empresas devem evitar qualquer investimento incerto
   - **Correcta:** B
   - **Cobertura:** Lição 2

6. **O efeito dotação (endowment effect) ajuda a explicar por que:**
   - A. Pessoas valorizam mais algo depois de o possuírem
   - B. Pessoas esquecem preços antigos
   - C. Investidores compram sempre activos subvalorizados
   - D. Empresas preferem dívida a capital próprio
   - **Correcta:** A
   - **Cobertura:** Lição 2

7. **Um nudge é melhor definido como:**
   - A. Uma lei que proíbe alternativas ruins
   - B. Um incentivo financeiro muito elevado
   - C. Uma alteração no ambiente de escolha que orienta comportamento sem retirar liberdade
   - D. Uma técnica para enganar consumidores
   - **Correcta:** C
   - **Cobertura:** Lição 3

8. **Qual exemplo ilustra um default/opt-out legítimo?**
   - A. Esconder taxas obrigatórias até ao último passo do checkout
   - B. Inscrever automaticamente colaboradores num plano de poupança, permitindo saída fácil
   - C. Bloquear a opção de cancelar assinatura
   - D. Aumentar preços sem informar clientes
   - **Correcta:** B
   - **Cobertura:** Lição 3

9. **No behavioral pricing, uma opção “isca” (decoy) serve para:**
   - A. Tornar uma opção-alvo relativamente mais atractiva por comparação
   - B. Reduzir todos os preços da empresa
   - C. Eliminar a necessidade de segmentação
   - D. Garantir lucro sem custos
   - **Correcta:** A
   - **Cobertura:** Lição 4

10. **Por que a experimentação A/B é importante em aplicações de economia comportamental?**
    - A. Porque elimina todos os vieses humanos automaticamente
    - B. Porque transforma hipóteses sobre comportamento em evidência observável
    - C. Porque substitui estratégia empresarial
    - D. Porque só funciona em empresas tecnológicas
    - **Correcta:** B
    - **Cobertura:** Lição 4

---

## Ficheiros a criar/modificar

### Criar conteúdo estático

1. `static/lessons/economia-comportamental/1-racionalidade-limitada-vieses.json`
2. `static/lessons/economia-comportamental/2-prospect-theory-risco.json`
3. `static/lessons/economia-comportamental/3-nudges-arquitectura-escolha.json`
4. `static/lessons/economia-comportamental/4-aplicacoes-negocios.json`
5. `static/lessons/economia-comportamental/course.json`
6. `static/quizzes/beq.json`

> Nota: o briefing inicial menciona `static/courses/<slug>.json`, mas o repo actual usa `static/lessons/<slug>/course.json`. Seguir o padrão real do repo.

### Modificar i18n — 5 locales

Adicionar as seguintes 7 chaves em cada locale `src/lib/i18n/{pt-PT,en,fr,tn,ar}.json`:

1. `routes.escola.curso.economia-comportamental.title`
2. `routes.escola.curso.economia-comportamental.description`
3. `routes.escola.curso.economia-comportamental.tagline`
4. `routes.aulas.curso.economia-comportamental.title`
5. `routes.aulas.curso.economia-comportamental.tagline`
6. `routes.escola.quiz.beq.title`
7. `routes.escola.quiz.beq.description`

**Total:** 7 chaves × 5 locales = **35 entries**.  
O briefing original diz “5 chaves × 5 locales = 25 entries”, mas também lista chaves de quiz; no padrão real recente (ex.: `sistemas-de-informacao`) são 7 chaves por locale quando inclui quiz.

#### Textos sugeridos — pt-PT

- `routes.escola.curso.economia-comportamental.title`: `Economia Comportamental`
- `routes.escola.curso.economia-comportamental.description`: `Economia comportamental aplicada à gestão: racionalidade limitada, heurísticas, vieses cognitivos, prospect theory, aversão à perda, efeito dotação, mental accounting, nudges, arquitectura da escolha, ética e aplicações em marketing, finanças, pricing, UX e decisão empresarial.`
- `routes.escola.curso.economia-comportamental.tagline`: `Business Administration · Heurísticas, vieses, prospect theory, nudges e decisão empresarial`
- `routes.aulas.curso.economia-comportamental.title`: `Economia Comportamental`
- `routes.aulas.curso.economia-comportamental.tagline`: `Business Administration · Heurísticas, vieses, prospect theory, nudges e decisão empresarial`
- `routes.escola.quiz.beq.title`: `Quiz: Economia Comportamental`
- `routes.escola.quiz.beq.description`: `Testa os teus conhecimentos em economia comportamental: racionalidade limitada, heurísticas, vieses, prospect theory, aversão à perda, efeito dotação, mental accounting, nudges, arquitectura da escolha, ética e aplicações em marketing, finanças e gestão. 10 perguntas, 4 opções cada.`

#### Textos sugeridos — en

- `routes.escola.curso.economia-comportamental.title`: `Behavioral Economics`
- `routes.escola.curso.economia-comportamental.description`: `Behavioral economics applied to management: bounded rationality, heuristics, cognitive biases, prospect theory, loss aversion, endowment effect, mental accounting, nudges, choice architecture, ethics and applications in marketing, finance, pricing, UX and managerial decision-making.`
- `routes.escola.curso.economia-comportamental.tagline`: `Business Administration · Heuristics, biases, prospect theory, nudges and managerial decision-making`
- `routes.aulas.curso.economia-comportamental.title`: `Behavioral Economics`
- `routes.aulas.curso.economia-comportamental.tagline`: `Business Administration · Heuristics, biases, prospect theory, nudges and managerial decision-making`
- `routes.escola.quiz.beq.title`: `Quiz: Behavioral Economics`
- `routes.escola.quiz.beq.description`: `Test your knowledge of behavioral economics: bounded rationality, heuristics, biases, prospect theory, loss aversion, endowment effect, mental accounting, nudges, choice architecture, ethics and applications in marketing, finance and management. 10 questions, 4 options each.`

#### Textos sugeridos — fr

- `routes.escola.curso.economia-comportamental.title`: `Économie Comportementale`
- `routes.escola.curso.economia-comportamental.description`: `Économie comportementale appliquée à la gestion : rationalité limitée, heuristiques, biais cognitifs, théorie des perspectives, aversion à la perte, effet de dotation, comptabilité mentale, nudges, architecture du choix, éthique et applications en marketing, finance, pricing, UX et décision managériale.`
- `routes.escola.curso.economia-comportamental.tagline`: `Business Administration · Heuristiques, biais, théorie des perspectives, nudges et décision managériale`
- `routes.aulas.curso.economia-comportamental.title`: `Économie Comportementale`
- `routes.aulas.curso.economia-comportamental.tagline`: `Business Administration · Heuristiques, biais, théorie des perspectives, nudges et décision managériale`
- `routes.escola.quiz.beq.title`: `Quiz : Économie Comportementale`
- `routes.escola.quiz.beq.description`: `Teste tes connaissances en économie comportementale : rationalité limitée, heuristiques, biais, théorie des perspectives, aversion à la perte, effet de dotation, comptabilité mentale, nudges, architecture du choix, éthique et applications en marketing, finance et gestion. 10 questions, 4 options chacune.`

#### Textos sugeridos — tn

- `routes.escola.curso.economia-comportamental.title`: `Économie Comportementale`
- `routes.escola.curso.economia-comportamental.description`: `Économie comportementale appliquée lel-management : rationalité limitée, heuristiques, biais cognitifs, théorie des perspectives, aversion lel-perte, effet de dotation, comptabilité mentale, nudges, architecture du choix, éthique w applications fi marketing, finance, pricing, UX w décisions managériales.`
- `routes.escola.curso.economia-comportamental.tagline`: `Business Administration · Heuristiques, biais, prospect theory, nudges w décision managériale`
- `routes.aulas.curso.economia-comportamental.title`: `Économie Comportementale`
- `routes.aulas.curso.economia-comportamental.tagline`: `Business Administration · Heuristiques, biais, prospect theory, nudges w décision managériale`
- `routes.escola.quiz.beq.title`: `Quiz : Économie Comportementale`
- `routes.escola.quiz.beq.description`: `Teste tes connaissances fi économie comportementale : rationalité limitée, heuristiques, biais, prospect theory, aversion lel-perte, effet de dotation, mental accounting, nudges, architecture du choix, éthique w applications fi marketing, finance w management. 10 questions, 4 options kol wahda.`

#### Textos sugeridos — ar

- `routes.escola.curso.economia-comportamental.title`: `الاقتصاد السلوكي`
- `routes.escola.curso.economia-comportamental.description`: `الاقتصاد السلوكي المطبّق على الإدارة: العقلانية المحدودة، الاختصارات الذهنية، الانحيازات المعرفية، نظرية التوقع، النفور من الخسارة، أثر الملكية، المحاسبة الذهنية، الدفعات السلوكية، هندسة الاختيار، الأخلاقيات وتطبيقات في التسويق والمالية والتسعير وتجربة المستخدم واتخاذ القرار الإداري.`
- `routes.escola.curso.economia-comportamental.tagline`: `إدارة الأعمال · الاختصارات الذهنية، الانحيازات، نظرية التوقع، الدفعات السلوكية واتخاذ القرار الإداري`
- `routes.aulas.curso.economia-comportamental.title`: `الاقتصاد السلوكي`
- `routes.aulas.curso.economia-comportamental.tagline`: `إدارة الأعمال · الاختصارات الذهنية، الانحيازات، نظرية التوقع، الدفعات السلوكية واتخاذ القرار الإداري`
- `routes.escola.quiz.beq.title`: `اختبار: الاقتصاد السلوكي`
- `routes.escola.quiz.beq.description`: `اختبر معرفتك بالاقتصاد السلوكي: العقلانية المحدودة، الاختصارات الذهنية، الانحيازات، نظرية التوقع، النفور من الخسارة، أثر الملكية، المحاسبة الذهنية، الدفعات السلوكية، هندسة الاختيار، الأخلاقيات وتطبيقات في التسويق والمالية والإدارة. 10 أسئلة، 4 خيارات لكل سؤال.`

### Modificar wiring — 3 ficheiros

1. `src/routes/escola/+page.svelte`
   - Inserir entry em `COURSES` com:
     - `slug: 'economia-comportamental'`
     - `title: 'Economia Comportamental'`
     - `tagline: 'Business Administration · Heurísticas, vieses, prospect theory, nudges e decisão empresarial'`
     - `description: <descrição pt-PT acima>`
     - `icon: '🧠'`
     - `color: '#7c3aed'`
     - `lessonCount: 4`
     - `quizCount: 1`
     - `badge: 'Uni'`
   - Preferência de posição: após `microeconomia`/`macroeconomia` ou perto de `comportamento-do-consumidor`, por afinidade académica.

2. `src/routes/escola/curso/[slug]/+page.svelte`
   - Inserir course metadata e lessons:
     - `slug: 'economia-comportamental'`
     - `title: 'Economia Comportamental'`
     - `tagline`, `description`, `icon`, `color`
     - `lessons`:
       1. `{ slug: '1-racionalidade-limitada-vieses', title: '1. Racionalidade Limitada, Heurísticas e Vieses', summary: 'Como gestores decidem com informação incompleta, tempo limitado e atalhos cognitivos.', quizSlug: 'beq', quizTitle: 'Quiz: Economia Comportamental', estMinutes: 8 }`
       2. `{ slug: '2-prospect-theory-risco', title: '2. Teoria da Perspectiva, Perdas e Risco', summary: 'Ganhos, perdas, pontos de referência, aversão à perda, efeito dotação e mental accounting.', quizSlug: 'beq', quizTitle: 'Quiz: Economia Comportamental', estMinutes: 9 }`
       3. `{ slug: '3-nudges-arquitectura-escolha', title: '3. Nudges, Arquitectura da Escolha e Ética', summary: 'Defaults, saliência, fricção, feedback e limites éticos entre ajudar e manipular.', quizSlug: 'beq', quizTitle: 'Quiz: Economia Comportamental', estMinutes: 9 }`
       4. `{ slug: '4-aplicacoes-negocios', title: '4. Aplicações em Marketing, Finanças e Gestão', summary: 'Pricing, UX, behavioral finance, incentivos, métricas e experimentação A/B.', quizSlug: 'beq', quizTitle: 'Quiz: Economia Comportamental', estMinutes: 8 }`

3. `src/routes/aulas/+page.server.ts`
   - Inserir em `COURSE_META`:
     - `'economia-comportamental': { slug: 'economia-comportamental', title: 'Economia Comportamental', icon: '🧠', color: '#7c3aed' }`

---

## Estrutura JSON sugerida

### `static/lessons/economia-comportamental/course.json`

```json
{
  "slug": "economia-comportamental",
  "title": "Economia Comportamental",
  "icon": "🧠",
  "color": "#7c3aed",
  "description": "Economia comportamental aplicada à gestão: racionalidade limitada, heurísticas, vieses cognitivos, prospect theory, aversão à perda, efeito dotação, mental accounting, nudges, arquitectura da escolha, ética e aplicações em marketing, finanças, pricing, UX e decisão empresarial.",
  "order": 45
}
```

### Lesson JSON padrão

Cada lição deve seguir o padrão real visto em `static/lessons/sistemas-de-informacao/1-tipos-de-si.json`:

```json
{
  "id": "1-racionalidade-limitada-vieses",
  "courseSlug": "economia-comportamental",
  "title": "Racionalidade Limitada, Heurísticas e Vieses",
  "audio": "Lição sobre economia comportamental, racionalidade limitada, heurísticas e vieses.<break/><break/>Vamos começar.",
  "audioLabel": "🎧 Lição em áudio (TTS)",
  "sections": [
    { "type": "h2", "text": "..." },
    { "type": "p", "text": "..." },
    { "type": "ul", "items": ["...", "...", "..."] },
    { "type": "callout", "variant": "example", "text": "..." }
  ],
  "keyPoints": ["...", "...", "...", "...", "..."],
  "quizSlug": "beq",
  "nextLesson": "2-prospect-theory-risco",
  "prevLesson": null
}
```

Navigation esperada:
- Lição 1: `nextLesson: "2-prospect-theory-risco"`, `prevLesson: null`
- Lição 2: `nextLesson: "3-nudges-arquitectura-escolha"`, `prevLesson: "1-racionalidade-limitada-vieses"`
- Lição 3: `nextLesson: "4-aplicacoes-negocios"`, `prevLesson: "2-prospect-theory-risco"`
- Lição 4: `nextLesson: null`, `prevLesson: "3-nudges-arquitectura-escolha"`

---

## Validação

Skander 2 deve executar **após implementar**:

```sh
cd /c/Users/rafaa/Documents/GitHub/presuntinho

# 1) Garantir que não tocou em ficheiros fora do scope
git status --short

# 2) JSON válido para novos ficheiros e i18n
python -m json.tool static/lessons/economia-comportamental/course.json > /dev/null
for f in static/lessons/economia-comportamental/*.json; do python -m json.tool "$f" > /dev/null && echo "OK: $f"; done
python -m json.tool static/quizzes/beq.json > /dev/null
for f in src/lib/i18n/{pt-PT,en,fr,tn,ar}.json; do python -m json.tool "$f" > /dev/null && echo "OK: $f"; done

# 3) Confirmar 4 lições + course.json
ls static/lessons/economia-comportamental/

# 4) Confirmar quiz com 10 perguntas
python - <<'PY'
import json
q=json.load(open('static/quizzes/beq.json', encoding='utf-8'))
assert q['id']=='beq'
assert len(q['questions'])==10, len(q['questions'])
for i,item in enumerate(q['questions'],1):
    assert len(item['opts'])==4, i
    assert item['a'] in range(4), i
print('OK beq 10 questions')
PY

# 5) Confirmar i18n parity dos novos keys
python - <<'PY'
import json
keys = [
 'routes.escola.curso.economia-comportamental.title',
 'routes.escola.curso.economia-comportamental.description',
 'routes.escola.curso.economia-comportamental.tagline',
 'routes.aulas.curso.economia-comportamental.title',
 'routes.aulas.curso.economia-comportamental.tagline',
 'routes.escola.quiz.beq.title',
 'routes.escola.quiz.beq.description',
]
for loc in ['pt-PT','en','fr','tn','ar']:
    data=json.load(open(f'src/lib/i18n/{loc}.json', encoding='utf-8'))
    missing=[k for k in keys if k not in data]
    assert not missing, (loc, missing)
print('OK i18n keys economia-comportamental/beq in 5 locales')
PY

# 6) Build
npm run build

# 7) Smoke local
npm run dev &
DEV_PID=$!
sleep 5
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/escola/curso/economia-comportamental/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/escola/licao/economia-comportamental/1-racionalidade-limitada-vieses/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/escola/quiz/beq/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/aulas/
kill $DEV_PID
```

### Smoke URLs de produção esperadas após entrega

Estas URLs devem deixar de ser 404 e passar a 200 após o gap ser implementado/deployado:

1. `/escola/curso/economia-comportamental/`
2. `/escola/licao/economia-comportamental/1-racionalidade-limitada-vieses/`
3. `/escola/quiz/beq/`

---

## Mensagem de commit sugerida

```txt
feat(escola): gap-104 — Economia Comportamental (BA #45, 4 lições + beq quiz + i18n 5 locales + catálogo wired)
```

Body sugerido:

```txt
- add BA #45 Economia Comportamental / Behavioral Economics
- add 4 lessons: bounded rationality & biases, prospect theory & risk, nudges & choice architecture, business applications
- add beq quiz with 10 MCQ questions
- add course metadata under static/lessons/economia-comportamental/course.json
- add i18n keys for course + aulas + quiz across pt-PT/en/fr/tn/ar
- wire course in escola catalogue, curso/[slug], and aulas server meta
- Refs: gap-104
```
