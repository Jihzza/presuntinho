# gap-091 — Auditoria i18n priorizada (PT hardcoded → 5 locales)

**Data:** 2026-06-30
**Autor:** Skander 1 (reasoning/audit)
**HEAD base:** dcdd99f (main)
**Fonte:** `.state/i18n-audit-raw.json` (62 findings em 59 ficheiros)
**Locales-alvo:** pt-PT, en, fr, tn, ar

---

## 1. Resumo executivo

| Severidade | Count | %    | Descrição                                                                                       |
| ---------- | ----- | ---- | ----------------------------------------------------------------------------------------------- |
| **ALTA**   | 29    | 46.8 % | PT hardcoded em UI chrome (sem `$t()`); precisa **nova chave** + tradução × 5 locales.          |
| **MÉDIA**  | 7     | 11.3 % | PT hardcoded **dentro** de fallback `$t(..., { default: '...' })`; a chave já existe → cleanup. |
| **BAIXA**  | 14    | 22.6 % | PT hardcoded em **código** (comparações JS `tipo === 'despesa'`, CSS vars, URL paths, comentários JSDoc). **Não precisa tradução** — são constantes de domínio. |
| **EXCLUIR**| 12    | 19.4 % | PT didáctico intencional em `src/routes/pt/+page.svelte` (curso de Português side-quest).      |
| **TOTAL**  | **62** | 100 % |                                                                                                |

### Veredicto

- **30 findings precisam de fix substantivo** (29 ALTA + 1 caso borderline — `/agente:195`): nova chave i18n em 5 locales.
- **6 findings precisam só de cleanup trivial** (remover default redundante de `$t()` já corretamente wired).
- **26 findings não precisam de qualquer acção** (BAIXA + EXCLUIR) — documentados para referência.

### Observação crítica sobre o audit bruto

O audit é **agressivo demais** — regex de PT literals apanha substrings dentro de `$t('key', { default: 'PT literal' })`. Após revisão manual contra o código-fonte:

- 5 findings marcadas ALTA no audit são na verdade **MÉDIA** (key já existe, `$t()` já é usado; default é redundante mas inofensivo).
- 2 findings marcadas MÉDIA no audit são na verdade **BAIXA** (`/dl:140`, `/financas/transacoes/[id]:145` — já estão totalmente wired em pt-PT/en/fr/tn/ar).
- 1 finding marcada MÉDIA (`/agente:195`) é na verdade **ALTA disfarçada** — o literal está num `onclick` handler, não num fallback `$t()`.

A classificação abaixo é a **canónica** (após revisão manual). O audit bruto serve apenas como input; este relatório é a verdade.

---

## 2. Lista priorizada (group by file)

### 2.1 EXCLUIR (12 — conteúdo didáctico PT intencional)

Ficheiro: `src/routes/pt/+page.svelte` (side-quest de Português)

| Linha | Snippet                                                                                  |
| ----- | ---------------------------------------------------------------------------------------- |
| 202   | 🇵🇹 Lições em Português                                                                  |
| 229   | 💡 Dica final para escrever                                                              |
| 242   | 🇵🇹 Mini-Curso de Português (side quest!)                                                |
| 252   | O Português tem 5 vogais orais (mais nasais, mas vamos com o básico):                   |
| 272   | Para ti (Tunisian):                                                                      |
| 272   | o Português é mais fonético que o Inglês. O                                             |
| 273   | é como                                                                                   |
| 273   | ; o                                                                                      |
| 346   | Eu sou a Fatma                                                                           |
| 346   | Estou a estudar                                                                          |
| 348   | Faço o trabalho amanhã                                                                   |
| 355   | Fazer o quiz 🇵🇹                                                                         |

**Acção:** nenhuma. Conteúdo pedagógico deve manter-se PT (a rota inteira é a side-quest de Português para falantes tn/ar).

---

### 2.2 BAIXA (14 — código/CSS/URL/comentários, não UI chrome)

Estas strings **não são texto visível ao utilizador** — são constantes internas de domínio (valores em DB, nomes de classe CSS, paths de routing, comentários). Não devem ser traduzidas.

| Ficheiro:linha                                   | Snippet                       | Razão                            |
| ------------------------------------------------ | ----------------------------- | -------------------------------- |
| `src/lib/components/EmptyState.svelte:14`        | `(renders <button>)`          | JSDoc comment                    |
| `src/lib/components/LanguageSwitcher.svelte:14`  | `the panel is a <ul role="menu">` | JSDoc comment                  |
| `src/routes/financas/categorias/+page.svelte:236` | `despesa`                   | JS comparison `tipoKey === 'despesa'` (data model) |
| `src/routes/financas/categorias/+page.svelte:236` | `receita`                   | JS comparison (idem)             |
| `src/routes/financas/nova/+page.svelte:163`      | `despesa`                     | JS `class:active={tipo === 'despesa'}` |
| `src/routes/financas/nova/+page.svelte:165`      | `despesa`                     | JS `onclick={() => (tipo = 'despesa')}` |
| `src/routes/financas/nova/+page.svelte:175`      | `receita`                     | JS `class:active={tipo === 'receita'}` |
| `src/routes/financas/nova/+page.svelte:177`      | `receita`                     | JS `onclick={() => (tipo = 'receita')}` |
| `src/routes/financas/transacoes/+page.svelte:357` | `receita`                   | JS `tx.tipo === 'receita'`       |
| `src/routes/financas/transacoes/+page.svelte:361` | `--cat-cor: #94a3b8`         | CSS var fallback                 |
| `src/routes/financas/transacoes/[id]/+page.svelte:176` | `valor`                  | JS `error?.includes('valor')` substring check |
| `src/routes/financas/transacoes/[id]/+page.svelte:216` | `/financas/transacoes`     | URL path (não traduzível)        |
| `src/routes/trabalhos/+page.svelte:175`          | `status status-{statuses[a.id] \|\| 'open'}` | CSS class dynamic (`'open'` é constante de domínio) |
| `src/routes/trabalhos/+page.svelte:222`          | `status status-{a.status}`    | CSS class dynamic                |

**Acção:** nenhuma. Constantes de domínio ficam PT (são IDs, não chrome).

---

### 2.3 MÉDIA (7 — cleanup trivial de defaults redundantes)

`$t()` já é correctamente chamado com chave existente em todos os 5 locales; o `default: 'PT literal'` é uma cópia redundante da chave. Fix: remover o `default: ...` (cosmético).

| Ficheiro:linha                                        | Snippet                                          | Chave i18n (já existe)                  |
| ----------------------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| `src/routes/agente/+page.svelte:223`                  | `{$t('agente.thinking', { default: 'a pensar…' })}` | `agente.thinking`                    |
| `src/routes/aulas/+page.svelte:68`                    | `{$t('aulas.subtitle', { default: '...' })}`     | `aulas.subtitle`                        |
| `src/routes/biblioteca/novo/+page.svelte:105`         | `{$t('biblioteca.novo.hero.title', { default: '➕ Novo marcador' })}` | `biblioteca.novo.hero.title` |
| `src/routes/dl/+page.svelte:140`                      | substring dentro de `{$t('dl.warning.p', { default: '... não podem usar IA ...' })}` | `dl.warning.p` (substring) |
| `src/routes/escola/curso/portugues/+page.svelte:255`  | `{$t('escola.curso.pt.fallbackTitle', { default: '🇵🇹 Curso de Português' })}` | `escola.curso.pt.fallbackTitle` |
| `src/routes/financas/transacoes/[id]/+page.svelte:145` | `aria-label="{$t('a11y.aria.voltar_a_lista', { default: 'Voltar à lista' })}"` | `a11y.aria.voltar_a_lista` |

**Acção:** trivial cleanup. Atribuir ao batch-4 (MÉDIA cleanup pass).

**Nota:** `/agente:195` foi classificada pelo audit como MÉDIA mas é na verdade **ALTA disfarçada** (ver 2.4). O botão `{$t('agente.cta.o_que_falta', ...)}` está traduzido, mas o **literal no JS handler** `input = 'o que falta?'` é hardcoded — quando o utilizador clica no botão numa locale EN, fica "what's missing?" no botão mas "o que falta?" no input do chat. Bug real.

---

### 2.4 ALTA (29 — chrome UI, precisam de **nova chave** + tradução × 5 locales)

#### `src/routes/biblioteca/novo/+page.svelte` (2 findings)

| Linha | Snippet                              | Chave i18n sugerida                  | Traduções                                                                                                  |
| ----- | ------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 181   | `'A criar…'` (ternary `submitting`)  | `biblioteca.novo.criando`            | pt: "A criar…" / en: "Creating…" / fr: "Création…" / tn: "Am n-creati…" / ar: "جارٍ الإنشاء…"            |
| 181   | `'Criar marcador'` (ternary)         | `biblioteca.novo.submit.criar`       | pt: "Criar marcador" / en: "Create bookmark" / fr: "Créer marque-page" / tn: "Cree marqueur" / ar: "إنشاء إشارة مرجعية" |

#### `src/routes/escola/curso/[slug]/+page.svelte` (2 findings)

| Linha | Snippet                          | Chave i18n sugerida           | Traduções                                                                              |
| ----- | -------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| 623   | `← Voltar à Escola` (link `<a>`) | `escola.curso.back_to_school` | pt: "← Voltar à Escola" / en: "← Back to School" / fr: "← Retour à l'École" / tn: "← Rjaa l-Madrasa" / ar: "← الرجوع إلى المدرسة" |
| 626   | `A carregar curso…`              | `escola.curso.loading`        | pt: "A carregar curso…" / en: "Loading course…" / fr: "Chargement du cours…" / tn: "Am n-chargui el-cours…" / ar: "جارٍ تحميل الدورة…" |

#### `src/routes/escola/curso/portugues/+page.svelte` (2 findings)

| Linha | Snippet                                            | Chave i18n sugerida             | Traduções                                                                                                                                              |
| ----- | -------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 267   | `🎯 Badge: 🇵🇹 Lusófono (b11)`                     | `escola.curso.pt.badge_inline`  | pt: "🎯 Badge: 🇵🇹 Lusófono (b11)" / en: "🎯 Badge: 🇵🇹 Lusophone (b11)" / fr: "🎯 Badge: 🇵🇹 Lusophone (b11)" / tn: "🎯 Badge: 🇵🇹 Lusophone (b11)" / ar: "🎯 Badge: 🇵🇹 ناطق بالبرتغالية (b11)" |
| 532   | `✓ Marcado como estudado.`                         | `escola.curso.pt.marked_studied` | pt: "✓ Marcado como estudado." / en: "✓ Marked as studied." / fr: "✓ Marqué comme étudié." / tn: "✓ Tmarked khedmet-ha." / ar: "✓ تم وسمه كمُدروس." |

#### `src/routes/escola/curso/portugues/quiz/+page.svelte` (3 findings)

| Linha | Snippet                                                                | Chave i18n sugerida                  | Traduções                                                                                                                                              |
| ----- | ---------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 73    | `<h1>🇵🇹 Quiz de Português</h1>`                                       | `escola.curso.pt.quiz.title`         | pt: "🇵🇹 Quiz de Português" / en: "🇵🇹 Portuguese Quiz" / fr: "🇵🇹 Quiz de Portugais" / tn: "🇵🇹 Quiz mt3 el-Portugali" / ar: "🇵🇹 اختبار البرتغالية" |
| 74    | `5 perguntas · Ganha a badge 🇵🇹 Lusófono (b11) com 5/5 certas.`        | `escola.curso.pt.quiz.subtitle`      | pt: "5 perguntas · Ganha a badge 🇵🇹 Lusófono (b11) com 5/5 certas." / en: "5 questions · Earn the 🇵🇹 Lusophone badge (b11) with 5/5 correct." / fr: "5 questions · Gagne le badge 🇵🇹 Lusophone (b11) avec 5/5 correctes." / tn: "5 as2ila · Reb7 el-badge 🇵🇹 Lusophone (b11) b 5/5 s7i7." / ar: "5 أسئلة · اربح شارة 🇵🇹 ناطق بالبرتغالية (b11) بـ 5/5 صحيحة." |
| 96    | `← Voltar ao curso PT`                                                 | `escola.curso.pt.quiz.back`          | pt: "← Voltar ao curso PT" / en: "← Back to PT course" / fr: "← Retour au cours PT" / tn: "← Rjaa l-cours PT" / ar: "← العودة لدورة PT"               |

#### `src/routes/escola/quiz/[quizSlug]/+page.svelte` (1 finding)

| Linha | Snippet                | Chave i18n sugerida       | Traduções                                                                                          |
| ----- | ---------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| 43    | `← Voltar ao curso`    | `escola.quiz.back_to_course` | pt: "← Voltar ao curso" / en: "← Back to course" / fr: "← Retour au cours" / tn: "← Rjaa l-cours" / ar: "← العودة للدورة" |

#### `src/routes/escola/walkthrough/[lessonSlug]/+page.svelte` (3 findings)

| Linha | Snippet                                                                | Chave i18n sugerida                          | Traduções                                                                                                                                            |
| ----- | ---------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 135   | `<meta name="description" content="Audio walkthrough + transcrição + pontos-chave da lição {lessonSlug}.">` | `escola.walkthrough.meta_description` (com `{lessonSlug}`) | pt: "Audio walkthrough + transcrição + pontos-chave da lição {lessonSlug}." / en: "Audio walkthrough + transcript + key points from lesson {lessonSlug}." / fr: "Audio walkthrough + transcription + points-clés de la leçon {lessonSlug}." / tn: "Audio walkthrough + transcription + les-points clés mel-leçon {lessonSlug}." / ar: "شرح صوتي + نص + نقاط رئيسية من الدرس {lessonSlug}." |
| 141   | `<p class="state">A carregar walkthrough…</p>`                         | `escola.walkthrough.loading`                 | pt: "A carregar walkthrough…" / en: "Loading walkthrough…" / fr: "Chargement du walkthrough…" / tn: "Am n-chargui el-walkthrough…" / ar: "جارٍ تحميل الشرح…" |
| 144   | `{loadError ?? 'Lição não encontrada.'}`                              | `escola.walkthrough.not_found`               | pt: "Lição não encontrada." / en: "Lesson not found." / fr: "Leçon introuvable." / tn: "El-leçon mech mawjoud." / ar: "الدرس غير موجود." |

#### `src/routes/financas/nova/+page.svelte` (1 finding)

| Linha | Snippet              | Chave i18n sugerida       | Traduções                                                                                       |
| ----- | -------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| 141   | `➕ Nova transação`   | `financas.nova.hero.title` | pt: "➕ Nova transação" / en: "➕ New transaction" / fr: "➕ Nouvelle transaction" / tn: "➕ Transaction jdida" / ar: "➕ معاملة جديدة" |

#### `src/routes/financas/orcamento/+page.svelte` (3 findings)

| Linha | Snippet                            | Chave i18n sugerida                  | Traduções                                                                              |
| ----- | ---------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| 160   | `<h1>📊 Orçamento</h1>`            | `financas.orcamento.hero.title`      | pt: "📊 Orçamento" / en: "📊 Budget" / fr: "📊 Budget" / tn: "📊 El-budget" / ar: "📊 الميزانية" |
| 250   | `<span class="percent-label muted">sem limite</span>` | `financas.orcamento.sem_limite`      | pt: "sem limite" / en: "no limit" / fr: "sans limite" / tn: "mech andou 7edd" / ar: "بلا حدود" |
| 261   | `<span class="saving">A gravar…</span>` | `financas.orcamento.gravando`        | pt: "A gravar…" / en: "Saving…" / fr: "Enregistrement…" / tn: "Am n-enregistri…" / ar: "جارٍ الحفظ…" |

#### `src/routes/financas/transacoes/+page.svelte` (3 findings)

| Linha | Snippet                                                      | Chave i18n sugerida                  | Traduções                                                                              |
| ----- | ------------------------------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------- |
| 240   | `<h1>📋 Transações</h1>`                                     | `financas.transacoes.hero.title`     | pt: "📋 Transações" / en: "📋 Transactions" / fr: "📋 Transactions" / tn: "📋 Les transactions" / ar: "📋 المعاملات" |
| 253   | `<a class="btn-primary" href="/financas/nova/">+ Nova transação</a>` | `financas.transacoes.cta.new`        | pt: "+ Nova transação" / en: "+ New transaction" / fr: "+ Nouvelle transaction" / tn: "+ Transaction jdida" / ar: "+ معاملة جديدة" |
| 367   | `{tx.descricao \|\| (c?.nome ?? 'Sem descrição')}`           | `financas.transacoes.sem_descricao`  | pt: "Sem descrição" / en: "No description" / fr: "Sans description" / tn: "Mech andou description" / ar: "بلا وصف" |

#### `src/routes/financas/transacoes/[id]/+page.svelte` (2 findings)

| Linha | Snippet                                                       | Chave i18n sugerida                       | Traduções                                                                              |
| ----- | ------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| 211   | `{submitting ? 'A guardar…' : 'Gravar'}`                      | `financas.transacoes.editar.guardando`    | pt: "A guardar…" / en: "Saving…" / fr: "Enregistrement…" / tn: "Am n-estena…" / ar: "جارٍ الحفظ…" |
| 228   | `{confirmarEliminar ? 'Confirmar?' : 'Eliminar'}`             | `financas.transacoes.editar.eliminar`     | pt: "Eliminar" / en: "Delete" / fr: "Supprimer" / tn: "Fasakh" / ar: "حذف"             |

#### `src/routes/habitos/novo/+page.svelte` (3 findings)

| Linha | Snippet                              | Chave i18n sugerida          | Traduções                                                                                       |
| ----- | ------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| 102   | `<h1>➕ Novo hábito</h1>`            | `habitos.novo.hero.title`    | pt: "➕ Novo hábito" / en: "➕ New habit" / fr: "➕ Nouvelle habitude" / tn: "➕ 3ada jdida" / ar: "➕ عادة جديدة" |
| 193   | `{submitting ? 'A criar…' : ...}`    | `habitos.novo.criando`       | pt: "A criar…" / en: "Creating…" / fr: "Création…" / tn: "Am n-creati…" / ar: "جارٍ الإنشاء…" |
| 193   | `... : 'Criar hábito'}`             | `habitos.novo.submit.criar`  | pt: "Criar hábito" / en: "Create habit" / fr: "Créer une habitude" / tn: "Cree 3ada" / ar: "إنشاء عادة" |

#### `src/routes/trabalhos/assignment/[slug]/+page.svelte` (4 findings)

| Linha | Snippet                                                                                     | Chave i18n sugerida                       | Traduções                                                                              |
| ----- | ------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| 116   | `<p class="state">A carregar trabalho…</p>`                                                | `trabalhos.assignment.loading`            | pt: "A carregar trabalho…" / en: "Loading assignment…" / fr: "Chargement du devoir…" / tn: "Am n-chargui el-devoir…" / ar: "جارٍ تحميل المهمة…" |
| 122   | `<code>static/data/assignments/equivalenza.json</code>`                                    | `trabalhos.assignment.file_path`         | pt/en/fr/tn/ar: "static/data/assignments/equivalenza.json" (path é ID, não chrome)     |
| 124   | `<a class="back-link" href="/trabalhos/">← Voltar à lista de trabalhos</a>`                 | `trabalhos.assignment.back_to_list`       | pt: "← Voltar à lista de trabalhos" / en: "← Back to assignments list" / fr: "← Retour à la liste des devoirs" / tn: "← Rjaa l-liste mel-devoir" / ar: "← العودة لقائمة المهام" |
| 176   | `<a class="back-link" href="/trabalhos/">← Voltar à lista de trabalhos</a>` (footer)        | (reusa `trabalhos.assignment.back_to_list`) | (mesma chave acima)                                                              |

#### `src/routes/agente/+page.svelte` (1 finding — ALTA disfarçada de MÉDIA)

| Linha | Snippet                                                       | Chave i18n sugerida                  | Traduções                                                                              |
| ----- | ------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| 195   | `onclick={() => (input = 'o que falta?')}` — literal no handler JS | `agente.cta.o_que_falta.prompt`      | pt: "o que falta?" / en: "what's missing?" / fr: "que manque-t-il ?" / tn: "chnowa nekkes?" / ar: "ما الذي ينقص؟" |

**Contexto do bug:** o botão usa `{$t('agente.cta.o_que_falta', { default: 'o que falta?' })}` (correcto, mostra label traduzido). Mas quando clicado, faz `input = 'o que falta?'` — prompt em PT hardcoded. Em locale EN, o utilizador vê "what's missing?" no botão mas "o que falta?" no input do chat. Quebra UX.

---

## 3. Plano de fix (4 batches por afinidade de ficheiro)

### batch-1 — `escola/*` (13 findings, 5 ficheiros)

| #  | Ficheiro                                     | Linha | Tipo          | Acção                                                                                                                |
| -- | -------------------------------------------- | ----- | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1  | `src/routes/escola/curso/[slug]/+page.svelte` | 623   | ALTA substantive | wrap em `$t('escola.curso.back_to_school', { default: '...' })`; adicionar chave × 5 locales em `src/lib/i18n/*.json` |
| 2  | `src/routes/escola/curso/[slug]/+page.svelte` | 626   | ALTA substantive | wrap em `$t('escola.curso.loading', { default: '...' })`; adicionar chave × 5 locales                                |
| 3  | `src/routes/escola/curso/portugues/+page.svelte` | 267 | ALTA substantive | wrap em `$t('escola.curso.pt.badge_inline', ...)`; adicionar chave × 5 locales                                         |
| 4  | `src/routes/escola/curso/portugues/+page.svelte` | 255 | MÉDIA trivial  | remover `default: '...'` (chave `escola.curso.pt.fallbackTitle` já existe)                                            |
| 5  | `src/routes/escola/curso/portugues/+page.svelte` | 532 | ALTA substantive | wrap em `$t('escola.curso.pt.marked_studied', ...)`; adicionar chave × 5 locales                                       |
| 6  | `src/routes/escola/curso/portugues/quiz/+page.svelte` | 73 | ALTA substantive | wrap em `$t('escola.curso.pt.quiz.title', ...)`; adicionar chave × 5 locales                                          |
| 7  | `src/routes/escola/curso/portugues/quiz/+page.svelte` | 74 | ALTA substantive | wrap em `$t('escola.curso.pt.quiz.subtitle', ...)`; adicionar chave × 5 locales                                       |
| 8  | `src/routes/escola/curso/portugues/quiz/+page.svelte` | 96 | ALTA substantive | wrap em `$t('escola.curso.pt.quiz.back', ...)`; adicionar chave × 5 locales                                           |
| 9  | `src/routes/escola/quiz/[quizSlug]/+page.svelte` | 43 | ALTA substantive | wrap em `$t('escola.quiz.back_to_course', ...)`; adicionar chave × 5 locales                                          |
| 10 | `src/routes/escola/walkthrough/[lessonSlug]/+page.svelte` | 135 | ALTA substantive | wrap em `$t('escola.walkthrough.meta_description', { lessonSlug })`; adicionar chave × 5 locales com placeholder      |
| 11 | `src/routes/escola/walkthrough/[lessonSlug]/+page.svelte` | 141 | ALTA substantive | wrap em `$t('escola.walkthrough.loading', ...)`; adicionar chave × 5 locales                                          |
| 12 | `src/routes/escola/walkthrough/[lessonSlug]/+page.svelte` | 144 | ALTA substantive | wrap em `$t('escola.walkthrough.not_found', ...)`; adicionar chave × 5 locales                                        |
| 13 | (nenhum — todas as chaves `escola.curso.*` já existem em pt-PT/en/fr/tn/ar — verificar parity antes de despachar) | | | |

**Output esperado (batch-1):**
- 5 ficheiros `.svelte` editados
- 9 chaves novas × 5 locales = **45 entries novas** em `src/lib/i18n/{pt-PT,en,fr,tn,ar}.json`
- 1 cleanup trivial (linha 255)
- Smoke test: navegar `/escola/`, `/escola/curso/equivalenza/`, `/escola/curso/portugues/`, `/escola/curso/portugues/quiz/`, `/escola/walkthrough/introducao/`, mudar locale en/fr/tn/ar — verificar chrome em cada locale.

**Brief detalhado:** ver `.state/skander1-batches-gap-091.md` § batch-1.

---

### batch-2 — `financas/*` (10 findings, 4 ficheiros)

| #  | Ficheiro                                       | Linha | Tipo          | Acção                                                                                                              |
| -- | ---------------------------------------------- | ----- | ------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1  | `src/routes/financas/nova/+page.svelte`        | 141   | ALTA substantive | wrap em `$t('financas.nova.hero.title', ...)`; adicionar chave × 5 locales                                          |
| 2  | `src/routes/financas/orcamento/+page.svelte`   | 160   | ALTA substantive | wrap em `$t('financas.orcamento.hero.title', ...)`; adicionar chave × 5 locales                                     |
| 3  | `src/routes/financas/orcamento/+page.svelte`   | 250   | ALTA substantive | wrap em `$t('financas.orcamento.sem_limite', ...)`; adicionar chave × 5 locales                                     |
| 4  | `src/routes/financas/orcamento/+page.svelte`   | 261   | ALTA substantive | wrap em `$t('financas.orcamento.gravando', ...)`; adicionar chave × 5 locales                                      |
| 5  | `src/routes/financas/transacoes/+page.svelte`  | 240   | ALTA substantive | wrap em `$t('financas.transacoes.hero.title', ...)`; adicionar chave × 5 locales                                   |
| 6  | `src/routes/financas/transacoes/+page.svelte`  | 253   | ALTA substantive | wrap em `$t('financas.transacoes.cta.new', ...)`; adicionar chave × 5 locales                                       |
| 7  | `src/routes/financas/transacoes/+page.svelte`  | 367   | ALTA substantive | wrap em `$t('financas.transacoes.sem_descricao', ...)`; adicionar chave × 5 locales                                |
| 8  | `src/routes/financas/transacoes/[id]/+page.svelte` | 145 | MÉDIA trivial | remover `default: 'Voltar à lista'` (chave `a11y.aria.voltar_a_lista` já existe)                                    |
| 9  | `src/routes/financas/transacoes/[id]/+page.svelte` | 211 | ALTA substantive | wrap em `$t('financas.transacoes.editar.guardando', ...)`; adicionar chave × 5 locales                             |
| 10 | `src/routes/financas/transacoes/[id]/+page.svelte` | 228 | ALTA substantive | wrap em `$t('financas.transacoes.editar.eliminar', ...)`; adicionar chave × 5 locales                              |

**Output esperado (batch-2):**
- 4 ficheiros `.svelte` editados
- 9 chaves novas × 5 locales = **45 entries novas** em `src/lib/i18n/{pt-PT,en,fr,tn,ar}.json`
- 1 cleanup trivial (linha 145)
- Smoke test: `/financas/`, `/financas/orcamento/`, `/financas/transacoes/`, `/financas/transacoes/<id>/`, `/financas/nova/` em 5 locales.

**Brief detalhado:** ver `.state/skander1-batches-gap-091.md` § batch-2.

---

### batch-3 — `habitos/*` + `trabalhos/*` (7 findings, 2 ficheiros)

| #  | Ficheiro                                          | Linha | Tipo          | Acção                                                                                                                |
| -- | ------------------------------------------------- | ----- | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1  | `src/routes/habitos/novo/+page.svelte`            | 102   | ALTA substantive | wrap em `$t('habitos.novo.hero.title', ...)`; adicionar chave × 5 locales                                            |
| 2  | `src/routes/habitos/novo/+page.svelte`            | 193   | ALTA substantive | wrap em `$t('habitos.novo.criando', ...)`; adicionar chave × 5 locales                                               |
| 3  | `src/routes/habitos/novo/+page.svelte`            | 193   | ALTA substantive | wrap em `$t('habitos.novo.submit.criar', ...)`; adicionar chave × 5 locales                                          |
| 4  | `src/routes/trabalhos/assignment/[slug]/+page.svelte` | 116 | ALTA substantive | wrap em `$t('trabalhos.assignment.loading', ...)`; adicionar chave × 5 locales                                        |
| 5  | `src/routes/trabalhos/assignment/[slug]/+page.svelte` | 122 | ALTA substantive | wrap em `$t('trabalhos.assignment.file_path', ...)`; adicionar chave × 5 locales (path literal — manter PT em todos os locales, key serve só para documentação/grep) |
| 6  | `src/routes/trabalhos/assignment/[slug]/+page.svelte` | 124 | ALTA substantive | wrap em `$t('trabalhos.assignment.back_to_list', ...)`; adicionar chave × 5 locales                                  |
| 7  | `src/routes/trabalhos/assignment/[slug]/+page.svelte` | 176 | ALTA substantive | reusa chave do # 6                                                                                                  |

**Output esperado (batch-3):**
- 2 ficheiros `.svelte` editados
- 6 chaves novas × 5 locales = **30 entries novas** em `src/lib/i18n/{pt-PT,en,fr,tn,ar}.json`
- Smoke test: `/habitos/novo/`, `/trabalhos/assignment/equivalenza/` (slug real), `/trabalhos/assignment/inexistente/` (caminho de erro).

**Brief detalhado:** ver `.state/skander1-batches-gap-091.md` § batch-3.

---

### batch-4 — `agente/*` + `biblioteca/novo/*` + `aulas/*` + `dl/*` (7 findings, 4 ficheiros)

| #  | Ficheiro                                       | Linha | Tipo          | Acção                                                                                                              |
| -- | ---------------------------------------------- | ----- | ------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1  | `src/routes/agente/+page.svelte`               | 195   | ALTA substantive | wrap em `$t('agente.cta.o_que_falta.prompt', ...)`; adicionar chave × 5 locales (substitui o JS literal `'o que falta?'` por lookup da chave) |
| 2  | `src/routes/agente/+page.svelte`               | 223   | MÉDIA trivial | remover `default: 'a pensar…'` (chave `agente.thinking` já existe)                                                |
| 3  | `src/routes/aulas/+page.svelte`                | 68    | MÉDIA trivial | remover `default: '...'` (chave `aulas.subtitle` já existe)                                                       |
| 4  | `src/routes/dl/+page.svelte`                   | 140   | MÉDIA trivial | remover `default: '...'` (chave `dl.warning.p` já existe)                                                         |
| 5  | `src/routes/biblioteca/novo/+page.svelte`      | 105   | MÉDIA trivial | remover `default: '➕ Novo marcador'` (chave `biblioteca.novo.hero.title` já existe)                                |
| 6  | `src/routes/biblioteca/novo/+page.svelte`      | 181   | ALTA substantive | wrap em `$t('biblioteca.novo.criando', ...)`; adicionar chave × 5 locales                                          |
| 7  | `src/routes/biblioteca/novo/+page.svelte`      | 181   | ALTA substantive | wrap em `$t('biblioteca.novo.submit.criar', ...)`; adicionar chave × 5 locales                                     |

**Output esperado (batch-4):**
- 4 ficheiros `.svelte` editados
- 3 chaves novas × 5 locales = **15 entries novas** em `src/lib/i18n/{pt-PT,en,fr,tn,ar}.json`
- 4 cleanups triviais (linhas 223, 68, 140, 105)
- Smoke test: `/agente/` (clicar botão "what's missing?" em en → input deve ficar "what's missing?", não "o que falta?"), `/aulas/`, `/dl/`, `/biblioteca/novo/`.

**Brief detalhado:** ver `.state/skander1-batches-gap-091.md` § batch-4.

---

## 4. Resumo de impacto

| Batch                  | Ficheiros editados | Chaves novas × 5 locales | Cleanups triviais | Findings totais |
| ---------------------- | ------------------ | ------------------------ | ----------------- | --------------- |
| batch-1 (escola)       | 5                  | 9 × 5 = **45**           | 1                 | 13              |
| batch-2 (finanças)     | 4                  | 9 × 5 = **45**           | 1                 | 10              |
| batch-3 (hábitos+trab) | 2                  | 6 × 5 = **30**           | 0                 | 7               |
| batch-4 (agente+bibl)  | 4                  | 3 × 5 = **15**           | 4                 | 7               |
| **TOTAL**              | **15**             | **135 entries**          | **6**             | **37**          |

**Total de entries novas a adicionar aos 5 ficheiros i18n:** 135 (de 30 chaves novas × 5 locales; 3 chaves têm o mesmo valor em todos os locales — `trabalhos.assignment.file_path`).

**Convenção alfabética para chaves novas** (ordem alfabética dentro do locale, inserção no fim do bloco correspondente):
- `agente.cta.*` antes de `agente.*` no fim da secção `agente`
- `biblioteca.novo.criando` antes de `biblioteca.novo.hero.*` no fim da secção `biblioteca`
- `biblioteca.novo.submit.*` no fim da secção `biblioteca`
- `escola.curso.back_to_school`, `escola.curso.loading` no fim da secção `escola.curso`
- `escola.curso.pt.badge_inline`, `escola.curso.pt.marked_studied`, `escola.curso.pt.quiz.back`, `escola.curso.pt.quiz.subtitle`, `escola.curso.pt.quiz.title` no fim da secção `escola.curso.pt`
- `escola.quiz.back_to_course` no fim da secção `escola.quiz`
- `escola.walkthrough.*` no fim da secção `escola.walkthrough` (3 chaves)
- `financas.nova.hero.title` no fim da secção `financas.nova`
- `financas.orcamento.hero.title`, `financas.orcamento.sem_limite`, `financas.orcamento.gravando` no fim da secção `financas.orcamento`
- `financas.transacoes.hero.title`, `financas.transacoes.cta.new`, `financas.transacoes.sem_descricao` no fim da secção `financas.transacoes`
- `financas.transacoes.editar.guardando`, `financas.transacoes.editar.eliminar` no fim da secção `financas.transacoes.editar`
- `habitos.novo.criando`, `habitos.novo.hero.title`, `habitos.novo.submit.criar` no fim da secção `habitos.novo`
- `trabalhos.assignment.loading`, `trabalhos.assignment.back_to_list`, `trabalhos.assignment.file_path` no fim da secção `trabalhos.assignment`

---

## 5. Validação pós-fix (smoke test recommended por batch)

Após cada batch, o Skander 2 deve:

1. Confirmar que os 5 ficheiros `src/lib/i18n/*.json` parseiam como JSON válido (`python -m json.tool src/lib/i18n/pt-PT.json > /dev/null && echo OK` × 5).
2. Confirmar parity 5/5 nas chaves adicionadas:
   ```sh
   for f in src/lib/i18n/*.json; do
     python -c "import json; d=json.load(open('$f')); print('$f', len(d))"
   done
   ```
   Espera-se mesmo count em todos os 5 (+ 27 chaves = pt-PT atual 903 + 27 = 930). Nota: 3 chaves têm valor idêntico em todos os locales (`trabalhos.assignment.file_path`), então o count é uniforme.
3. `npm run check` ou `npm run build` — garantir que nenhum $t() mal formado.
4. `npm run dev` — abrir browser em `/escola/`, `/financas/orcamento/`, `/habitos/novo/`, `/agente/`, mudar locale en/fr/tn/ar via LanguageSwitcher, confirmar chrome traduzido.

---

## 6. Não-acções (26 findings)

| Categoria  | Count | Razão                                                                                              |
| ---------- | ----- | -------------------------------------------------------------------------------------------------- |
| EXCLUIR    | 12    | `src/routes/pt/+page.svelte` — conteúdo didáctico PT intencional (side-quest de Português).        |
| BAIXA      | 14    | Constantes de domínio (JS comparisons `=== 'despesa'`, CSS classes, URL paths, comentários JSDoc). |

Estes 26 findings **não devem gerar qualquer mudança de código** — são falsos positivos do audit ou conteúdo intencional. Estão listados aqui para referência e para que futuros audits saibam que já foram triados.

---

## 7. Recomendação de despacho

Recomendo **despachar os 4 batches em paralelo** para sub-tasks Skander 2 (uma por batch):

- Cada batch é **auto-contido** (5-15 ficheiros no total, 1 área de produto).
- Cada batch pode ser testado independentemente.
- Smoke test global (5/5 locales × todas as rotas tocadas) pode correr no fim do batch-4.

Os briefs detalhados para Skander 2 estão em `.state/skander1-batches-gap-091.md`.
