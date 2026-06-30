# gap-091 — Briefs Skander 2 (4 batches paralelos)

**Audit principal:** ver `.state/i18n-audit-gap-091.md` (relatório completo).
**Repo:** `C:\Users\rafaa\Documents\GitHub\presuntinho`
**HEAD base para começar:** dcdd99f (main)
**Working tree:** NÃO mexer em ficheiros não-listados abaixo (deixar modified `.state/watchdog-todos.json` e `static/quizzes/ccq.json` intactos).

**Convenções:**
- Cada batch é **independente e paralelizável** com os outros.
- Cada batch deve produzir **1 commit** com mensagem `fix(i18n): gap-091-batchN — <descrição>` e abrir caminho para PR ou push directo (decisão do Skander 2 conforme guidelines do repo).
- Antes de despachar este batch, **Skander 2 deve verificar** que os i18n keys propostos não colidem com chaves já existentes em `src/lib/i18n/*.json`. Se existir colisão, usar a chave existente e adicionar/ajustar tradução se necessário.
- **Cada batch inclui uma secção "Validação"** — Skander 2 deve correr esses checks antes de fazer commit.

---

## batch-1 — escola/* (13 findings, 5 ficheiros)

### Ficheiros a editar

1. `src/routes/escola/curso/[slug]/+page.svelte` — 2 fixes (linhas 623, 626) + 1 cleanup trivial (linha 255? não, 255 está em escola/curso/portugues, não neste ficheiro)
   - **linha 623**: `<p><a href="/escola/">← Voltar à Escola</a></p>` → `<p><a href="/escola/">{$t('escola.curso.back_to_school', { default: '← Voltar à Escola' })}</a></p>`
   - **linha 626**: `<p class="loading">A carregar curso…</p>` → `<p class="loading">{$t('escola.curso.loading', { default: 'A carregar curso…' })}</p>`

2. `src/routes/escola/curso/portugues/+page.svelte` — 2 fixes + 1 cleanup
   - **linha 255**: `<h1>{$t('escola.curso.pt.fallbackTitle', { default: '🇵🇹 Curso de Português' })}</h1>` → `<h1>{$t('escola.curso.pt.fallbackTitle')}</h1>` (remove default redundante; chave já existe)
   - **linha 267**: `<span>🎯 Badge: 🇵🇹 Lusófono (b11)</span>` → `<span>{$t('escola.curso.pt.badge_inline', { default: '🎯 Badge: 🇵🇹 Lusófono (b11)' })}</span>`
   - **linha 532**: `<span class="studied-text">✓ Marcado como estudado.</span>` → `<span class="studied-text">{$t('escola.curso.pt.marked_studied', { default: '✓ Marcado como estudado.' })}</span>`

3. `src/routes/escola/curso/portugues/quiz/+page.svelte` — 3 fixes
   - **linha 73**: `<h1>🇵🇹 Quiz de Português</h1>` → `<h1>{$t('escola.curso.pt.quiz.title', { default: '🇵🇹 Quiz de Português' })}</h1>`
   - **linha 74**: `<p class="sub">5 perguntas · Ganha a badge 🇵🇹 Lusófono (b11) com 5/5 certas.</p>` → `<p class="sub">{$t('escola.curso.pt.quiz.subtitle', { default: '5 perguntas · Ganha a badge 🇵🇹 Lusófono (b11) com 5/5 certas.' })}</p>`
   - **linha 96**: `<a href="/escola/curso/portugues/">← Voltar ao curso PT</a>` → `<a href="/escola/curso/portugues/">{$t('escola.curso.pt.quiz.back', { default: '← Voltar ao curso PT' })}</a>`

4. `src/routes/escola/quiz/[quizSlug]/+page.svelte` — 1 fix
   - **linha 43**: `<a href="/escola/curso/equivalenza/">← Voltar ao curso</a>` → `<a href="/escola/curso/equivalenza/">{$t('escola.quiz.back_to_course', { default: '← Voltar ao curso' })}</a>`

5. `src/routes/escola/walkthrough/[lessonSlug]/+page.svelte` — 3 fixes
   - **linha 135** (em `<meta name="description">`): `content="Audio walkthrough + transcrição + pontos-chave da lição {lessonSlug}."` → `content={$t('escola.walkthrough.meta_description', { lessonSlug }).replace('{lessonSlug}', lessonSlug)}` ou usar interpolation nativa (`content={`${$t('escola.walkthrough.meta_description')}`.replace('{lessonSlug}', lessonSlug)`) — seguir convenção já usada em `/aulas/+page.svelte:67-72`
   - **linha 141**: `<p class="state">A carregar walkthrough…</p>` → `<p class="state">{$t('escola.walkthrough.loading', { default: 'A carregar walkthrough…' })}</p>`
   - **linha 144**: `<p>⚠️ {loadError ?? 'Lição não encontrada.'}</p>` → `<p>⚠️ {loadError ?? $t('escola.walkthrough.not_found', { default: 'Lição não encontrada.' })}</p>`

### Chaves novas a adicionar (× 5 locales)

Adicionar nos 5 ficheiros `src/lib/i18n/{pt-PT,en,fr,tn,ar}.json`, no fim da secção correspondente (manter ordem alfabética dentro de cada locale; inserir antes da próxima chave de prefixo diferente).

| Chave                                       | pt-PT                                            | en                                                    | fr                                                       | tn                                                         | ar                                                       |
| ------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| `escola.curso.back_to_school`               | `← Voltar à Escola`                              | `← Back to School`                                    | `← Retour à l'École`                                     | `← Rjaa l-Madrasa`                                         | `← الرجوع إلى المدرسة`                                   |
| `escola.curso.loading`                      | `A carregar curso…`                              | `Loading course…`                                     | `Chargement du cours…`                                   | `Am n-chargui el-cours…`                                  | `جارٍ تحميل الدورة…`                                     |
| `escola.curso.pt.badge_inline`              | `🎯 Badge: 🇵🇹 Lusófono (b11)`                   | `🎯 Badge: 🇵🇹 Lusophone (b11)`                       | `🎯 Badge: 🇵🇹 Lusophone (b11)`                         | `🎯 Badge: 🇵🇹 Lusophone (b11)`                           | `🎯 Badge: 🇵🇹 ناطق بالبرتغالية (b11)`                     |
| `escola.curso.pt.marked_studied`            | `✓ Marcado como estudado.`                       | `✓ Marked as studied.`                                | `✓ Marqué comme étudié.`                                 | `✓ Tmarked khedmet-ha.`                                   | `✓ تم وسمه كمُدروس.`                                     |
| `escola.curso.pt.quiz.title`                | `🇵🇹 Quiz de Português`                          | `🇵🇹 Portuguese Quiz`                                 | `🇵🇹 Quiz de Portugais`                                  | `🇵🇹 Quiz mt3 el-Portugali`                                | `🇵🇹 اختبار البرتغالية`                                   |
| `escola.curso.pt.quiz.subtitle`             | `5 perguntas · Ganha a badge 🇵🇹 Lusófono (b11) com 5/5 certas.` | `5 questions · Earn the 🇵🇹 Lusophone badge (b11) with 5/5 correct.` | `5 questions · Gagne le badge 🇵🇹 Lusophone (b11) avec 5/5 correctes.` | `5 as2ila · Reb7 el-badge 🇵🇹 Lusophone (b11) b 5/5 s7i7.` | `5 أسئلة · اربح شارة 🇵🇹 ناطق بالبرتغالية (b11) بـ 5/5 صحيحة.` |
| `escola.curso.pt.quiz.back`                 | `← Voltar ao curso PT`                           | `← Back to PT course`                                 | `← Retour au cours PT`                                   | `← Rjaa l-cours PT`                                       | `← العودة لدورة PT`                                       |
| `escola.quiz.back_to_course`                | `← Voltar ao curso`                              | `← Back to course`                                    | `← Retour au cours`                                      | `← Rjaa l-cours`                                          | `← العودة للدورة`                                          |
| `escola.walkthrough.loading`                | `A carregar walkthrough…`                        | `Loading walkthrough…`                                | `Chargement du walkthrough…`                             | `Am n-chargui el-walkthrough…`                            | `جارٍ تحميل الشرح…`                                       |
| `escola.walkthrough.not_found`              | `Lição não encontrada.`                          | `Lesson not found.`                                   | `Leçon introuvable.`                                     | `El-leçon mech mawjoud.`                                  | `الدرس غير موجود.`                                         |
| `escola.walkthrough.meta_description` (com placeholder `{lessonSlug}`) | `Audio walkthrough + transcrição + pontos-chave da lição {lessonSlug}.` | `Audio walkthrough + transcript + key points from lesson {lessonSlug}.` | `Audio walkthrough + transcription + points-clés de la leçon {lessonSlug}.` | `Audio walkthrough + transcription + les-points clés mel-leçon {lessonSlug}.` | `شرح صوتي + نص + نقاط رئيسية من الدرس {lessonSlug}.` |

**Total batch-1:** 11 chaves novas × 5 locales = **55 entries novas** (correcção: 11, não 9 como no resumo — counted `escola.curso.loading`, `escola.walkthrough.meta_description` à parte).

### Validação

```sh
cd /c/Users/rafaa/Documents/GitHub/presuntinho
# 1. JSON validade × 5
for f in src/lib/i18n/{pt-PT,en,fr,tn,ar}.json; do python -m json.tool "$f" > /dev/null && echo "OK: $f"; done
# 2. Parity
for f in src/lib/i18n/{pt-PT,en,fr,tn,ar}.json; do python -c "import json; print('$f', len(json.load(open('$f'))))"; done
# (espera-se count uniforme em todos os 5)
# 3. Build (se aplicável)
npm run build
# 4. Smoke dev
npm run dev &
DEV_PID=$!
sleep 5
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/escola/curso/equivalenza/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/escola/curso/portugues/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/escola/curso/portugues/quiz/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/escola/quiz/equivalenza/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/escola/walkthrough/introducao/
kill $DEV_PID
```

### Commit

Mensagem: `fix(i18n): gap-091-batch1 — escola chrome PT hardcoded → 5 locales (11 chaves novas)`

Body:
```
- escola/curso/[slug]: 2 fixes (back_to_school, loading)
- escola/curso/portugues: 2 fixes (badge_inline, marked_studied) + 1 cleanup (fallbackTitle default)
- escola/curso/portugues/quiz: 3 fixes (title, subtitle, back)
- escola/quiz/[quizSlug]: 1 fix (back_to_course)
- escola/walkthrough/[lessonSlug]: 3 fixes (meta_description, loading, not_found)
- 11 new i18n keys × 5 locales (pt-PT, en, fr, tn, ar)
- Refs: gap-091 (Skander 1 audit)
```

---

## batch-2 — finanças/* (10 findings, 4 ficheiros)

### Ficheiros a editar

1. `src/routes/financas/nova/+page.svelte` — 1 fix
   - **linha 141**: `<h1>➕ Nova transação</h1>` → `<h1>{$t('financas.nova.hero.title', { default: '➕ Nova transação' })}</h1>`

2. `src/routes/financas/orcamento/+page.svelte` — 3 fixes
   - **linha 160**: `<h1>📊 Orçamento</h1>` → `<h1>{$t('financas.orcamento.hero.title', { default: '📊 Orçamento' })}</h1>`
   - **linha 250**: `<span class="percent-label muted">sem limite</span>` → `<span class="percent-label muted">{$t('financas.orcamento.sem_limite', { default: 'sem limite' })}</span>`
   - **linha 261**: `<span class="saving" aria-live="polite">A gravar…</span>` → `<span class="saving" aria-live="polite">{$t('financas.orcamento.gravando', { default: 'A gravar…' })}</span>`

3. `src/routes/financas/transacoes/+page.svelte` — 3 fixes
   - **linha 240**: `<h1>📋 Transações</h1>` → `<h1>{$t('financas.transacoes.hero.title', { default: '📋 Transações' })}</h1>`
   - **linha 253**: `<a class="btn-primary" href="/financas/nova/">+ Nova transação</a>` → `<a class="btn-primary" href="/financas/nova/">{$t('financas.transacoes.cta.new', { default: '+ Nova transação' })}</a>`
   - **linha 367**: `{tx.descricao || (c?.nome ?? 'Sem descrição')}` → `{tx.descricao || (c?.nome ?? $t('financas.transacoes.sem_descricao', { default: 'Sem descrição' }))}`

4. `src/routes/financas/transacoes/[id]/+page.svelte` — 2 fixes + 1 cleanup
   - **linha 145**: `<a ... aria-label="{$t('a11y.aria.voltar_a_lista', { default: 'Voltar à lista' })}">` → `<a ... aria-label="{$t('a11y.aria.voltar_a_lista')}">` (remove default)
   - **linha 211**: `{submitting ? 'A guardar…' : 'Gravar'}` → `{submitting ? $t('financas.transacoes.editar.guardando', { default: 'A guardar…' }) : 'Gravar'}` (e idealmente adicionar `financas.transacoes.editar.submit` para "Gravar" também, mas não é parte do scope gap-091 — pode ficar para batch futuro)
   - **linha 228**: `{confirmarEliminar ? 'Confirmar?' : 'Eliminar'}` → `{confirmarEliminar ? $t('common.confirm_short', { default: 'Confirmar?' }) : $t('financas.transacoes.editar.eliminar', { default: 'Eliminar' })}` (reusa `common.confirm_short` que já existe; só cria chave nova para `eliminar`)

### Chaves novas a adicionar (× 5 locales)

| Chave                                          | pt-PT                       | en                          | fr                              | tn                                       | ar                              |
| ---------------------------------------------- | --------------------------- | --------------------------- | ------------------------------- | ---------------------------------------- | ------------------------------- |
| `financas.nova.hero.title`                     | `➕ Nova transação`          | `➕ New transaction`         | `➕ Nouvelle transaction`        | `➕ Transaction jdida`                    | `➕ معاملة جديدة`               |
| `financas.orcamento.hero.title`                | `📊 Orçamento`              | `📊 Budget`                 | `📊 Budget`                     | `📊 El-budget`                           | `📊 الميزانية`                  |
| `financas.orcamento.sem_limite`                | `sem limite`                | `no limit`                  | `sans limite`                   | `mech andou 7edd`                        | `بلا حدود`                      |
| `financas.orcamento.gravando`                  | `A gravar…`                 | `Saving…`                   | `Enregistrement…`               | `Am n-enregistri…`                       | `جارٍ الحفظ…`                   |
| `financas.transacoes.hero.title`               | `📋 Transações`             | `📋 Transactions`           | `📋 Transactions`               | `📋 Les transactions`                    | `📋 المعاملات`                  |
| `financas.transacoes.cta.new`                  | `+ Nova transação`          | `+ New transaction`         | `+ Nouvelle transaction`        | `+ Transaction jdida`                    | `+ معاملة جديدة`               |
| `financas.transacoes.sem_descricao`            | `Sem descrição`             | `No description`            | `Sans description`              | `Mech andou description`                 | `بلا وصف`                       |
| `financas.transacoes.editar.guardando`         | `A guardar…`                | `Saving…`                   | `Enregistrement…`               | `Am n-estena…`                           | `جارٍ الحفظ…`                   |
| `financas.transacoes.editar.eliminar`          | `Eliminar`                  | `Delete`                    | `Supprimer`                     | `Fasakh`                                 | `حذف`                            |

**Total batch-2:** 9 chaves novas × 5 locales = **45 entries novas**.

### Validação

```sh
cd /c/Users/rafaa/Documents/GitHub/presuntinho
for f in src/lib/i18n/{pt-PT,en,fr,tn,ar}.json; do python -m json.tool "$f" > /dev/null && echo "OK: $f"; done
for f in src/lib/i18n/{pt-PT,en,fr,tn,ar}.json; do python -c "import json; print('$f', len(json.load(open('$f'))))"; done
npm run build
npm run dev &
DEV_PID=$!
sleep 5
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/financas/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/financas/nova/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/financas/orcamento/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/financas/transacoes/
# pick the first id from localStorage or DB
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/financas/transacoes/test/
kill $DEV_PID
```

### Commit

Mensagem: `fix(i18n): gap-091-batch2 — finanças chrome PT hardcoded → 5 locales (9 chaves novas)`

Body:
```
- financas/nova: 1 fix (hero.title)
- financas/orcamento: 3 fixes (hero.title, sem_limite, gravando)
- financas/transacoes: 3 fixes (hero.title, cta.new, sem_descricao)
- financas/transacoes/[id]: 2 fixes (editar.guardando, editar.eliminar) + 1 cleanup (a11y.aria.voltar_a_lista default)
- 9 new i18n keys × 5 locales (pt-PT, en, fr, tn, ar)
- Refs: gap-091 (Skander 1 audit)
```

---

## batch-3 — hábitos/* + trabalhos/* (7 findings, 2 ficheiros)

### Ficheiros a editar

1. `src/routes/habitos/novo/+page.svelte` — 3 fixes
   - **linha 102**: `<h1>➕ Novo hábito</h1>` → `<h1>{$t('habitos.novo.hero.title', { default: '➕ Novo hábito' })}</h1>`
   - **linha 193**: `{submitting ? 'A criar…' : 'Criar hábito'}` → `{submitting ? $t('habitos.novo.criando', { default: 'A criar…' }) : $t('habitos.novo.submit.criar', { default: 'Criar hábito' })}`

2. `src/routes/trabalhos/assignment/[slug]/+page.svelte` — 4 fixes
   - **linha 116**: `<p class="state">A carregar trabalho…</p>` → `<p class="state">{$t('trabalhos.assignment.loading', { default: 'A carregar trabalho…' })}</p>`
   - **linha 122**: `<code>static/data/assignments/equivalenza.json</code>` → `<code>{$t('trabalhos.assignment.file_path', { default: 'static/data/assignments/equivalenza.json' })}</code>`
   - **linha 124**: `<a class="back-link" href="/trabalhos/">← Voltar à lista de trabalhos</a>` → `<a class="back-link" href="/trabalhos/">{$t('trabalhos.assignment.back_to_list', { default: '← Voltar à lista de trabalhos' })}</a>`
   - **linha 176**: `<a class="back-link" href="/trabalhos/">← Voltar à lista de trabalhos</a>` → `<a class="back-link" href="/trabalhos/">{$t('trabalhos.assignment.back_to_list', { default: '← Voltar à lista de trabalhos' })}</a>` (mesma chave — reusa)

### Chaves novas a adicionar (× 5 locales)

| Chave                                       | pt-PT                                            | en                                                  | fr                                                  | tn                                                | ar                                              |
| ------------------------------------------- | ------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| `habitos.novo.hero.title`                   | `➕ Novo hábito`                                 | `➕ New habit`                                       | `➕ Nouvelle habitude`                              | `➕ 3ada jdida`                                   | `➕ عادة جديدة`                                 |
| `habitos.novo.criando`                      | `A criar…`                                       | `Creating…`                                         | `Création…`                                         | `Am n-creati…`                                    | `جارٍ الإنشاء…`                                 |
| `habitos.novo.submit.criar`                 | `Criar hábito`                                   | `Create habit`                                      | `Créer une habitude`                                | `Cree 3ada`                                       | `إنشاء عادة`                                    |
| `trabalhos.assignment.loading`              | `A carregar trabalho…`                           | `Loading assignment…`                               | `Chargement du devoir…`                             | `Am n-chargui el-devoir…`                         | `جارٍ تحميل المهمة…`                             |
| `trabalhos.assignment.file_path`            | `static/data/assignments/equivalenza.json`       | `static/data/assignments/equivalenza.json`           | `static/data/assignments/equivalenza.json`           | `static/data/assignments/equivalenza.json`         | `static/data/assignments/equivalenza.json`     |
| `trabalhos.assignment.back_to_list`         | `← Voltar à lista de trabalhos`                  | `← Back to assignments list`                         | `← Retour à la liste des devoirs`                   | `← Rjaa l-liste mel-devoir`                       | `← العودة لقائمة المهام`                        |

**Total batch-3:** 6 chaves novas × 5 locales = **30 entries novas**.

**Nota sobre `trabalhos.assignment.file_path`:** o valor é idêntico em todos os 5 locales (é um path de ficheiro, não chrome). A chave serve apenas para grep-ability e para tornar a i18n table completa; tecnicamente poderia ser um constant em código mas seguir a convenção `$t()` é mais consistente.

### Validação

```sh
cd /c/Users/rafaa/Documents/GitHub/presuntinho
for f in src/lib/i18n/{pt-PT,en,fr,tn,ar}.json; do python -m json.tool "$f" > /dev/null && echo "OK: $f"; done
for f in src/lib/i18n/{pt-PT,en,fr,tn,ar}.json; do python -c "import json; print('$f', len(json.load(open('$f'))))"; done
npm run build
npm run dev &
DEV_PID=$!
sleep 5
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/habitos/novo/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/trabalhos/assignment/equivalenza/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/trabalhos/assignment/inexistente/  # 404 path
kill $DEV_PID
```

### Commit

Mensagem: `fix(i18n): gap-091-batch3 — hábitos + trabalhos chrome PT hardcoded → 5 locales (6 chaves novas)`

Body:
```
- habitos/novo: 3 fixes (hero.title, criando, submit.criar)
- trabalhos/assignment/[slug]: 4 fixes (loading, file_path, back_to_list ×2 footer+error)
- 6 new i18n keys × 5 locales (pt-PT, en, fr, tn, ar)
- Refs: gap-091 (Skander 1 audit)
```

---

## batch-4 — agente + biblioteca + aulas + dl (7 findings, 4 ficheiros)

### Ficheiros a editar

1. `src/routes/agente/+page.svelte` — 1 fix + 1 cleanup
   - **linha 195**: `<button type="button" onclick={() => (input = 'o que falta?')}>{$t('agente.cta.o_que_falta', { default: 'o que falta?' })}</button>` → `<button type="button" onclick={() => (input = $t('agente.cta.o_que_falta.prompt', { default: 'o que falta?' }))}>{$t('agente.cta.o_que_falta', { default: 'o que falta?' })}</button>`
     - Adicionar `$t` import se ainda não estiver no scope (verificar — geralmente já está).
   - **linha 223**: `<div class="bubble thinking">{$t('agente.thinking', { default: 'a pensar…' })}</div>` → `<div class="bubble thinking">{$t('agente.thinking')}</div>` (remove default)

2. `src/routes/aulas/+page.svelte` — 1 cleanup
   - **linha 67-71**: bloco `{$t('aulas.subtitle', { default: '...' }).replace(...)}` → `{$t('aulas.subtitle').replace('{lessons}', String(totalLessons)).replace('{courses}', String(totalCourses))}` (remove default)

3. `src/routes/dl/+page.svelte` — 1 cleanup
   - **linha 140**: `<p>{$t('dl.warning.p', { default: 'Q3 (Marketing Problem)...' })}</p>` → `<p>{$t('dl.warning.p')}</p>` (remove default)

4. `src/routes/biblioteca/novo/+page.svelte` — 2 fixes + 1 cleanup
   - **linha 105**: `<h1>{$t('biblioteca.novo.hero.title', { default: '➕ Novo marcador' })}</h1>` → `<h1>{$t('biblioteca.novo.hero.title')}</h1>` (remove default)
   - **linha 181**: `{submitting ? 'A criar…' : 'Criar marcador'}` → `{submitting ? $t('biblioteca.novo.criando', { default: 'A criar…' }) : $t('biblioteca.novo.submit.criar', { default: 'Criar marcador' })}`

### Chaves novas a adicionar (× 5 locales)

| Chave                                | pt-PT           | en                | fr                | tn                | ar                |
| ------------------------------------ | --------------- | ----------------- | ----------------- | ----------------- | ----------------- |
| `agente.cta.o_que_falta.prompt`      | `o que falta?`  | `what's missing?` | `que manque-t-il ?` | `chnowa nekkes?` | `ما الذي ينقص؟`   |
| `biblioteca.novo.criando`            | `A criar…`      | `Creating…`       | `Création…`       | `Am n-creati…`    | `جارٍ الإنشاء…`   |
| `biblioteca.novo.submit.criar`       | `Criar marcador` | `Create bookmark` | `Créer marque-page` | `Cree marqueur`  | `إنشاء إشارة مرجعية` |

**Total batch-4:** 3 chaves novas × 5 locales = **15 entries novas**.

**Plus 4 cleanups triviais** (linhas 223, 67-71, 140, 105) — remover `default: '...'` de chamadas `$t()` que já têm a chave correctamente traduzida.

### Validação

```sh
cd /c/Users/rafaa/Documents/GitHub/presuntinho
for f in src/lib/i18n/{pt-PT,en,fr,tn,ar}.json; do python -m json.tool "$f" > /dev/null && echo "OK: $f"; done
for f in src/lib/i18n/{pt-PT,en,fr,tn,ar}.json; do python -c "import json; print('$f', len(json.load(open('$f'))))"; done
npm run build
npm run dev &
DEV_PID=$!
sleep 5
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/agente/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/aulas/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/dl/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/biblioteca/novo/
# Test crítico: clicar botão "what's missing?" em locale EN → input deve ficar "what's missing?" (não "o que falta?")
# (manual via browser ou via Playwright se disponível)
kill $DEV_PID
```

### Commit

Mensagem: `fix(i18n): gap-091-batch4 — agente prompt + biblioteca + aulas + dl cleanup → 5 locales (3 chaves novas + 4 cleanups)`

Body:
```
- agente: 1 fix (cta.o_que_falta.prompt — JS literal no onclick handler) + 1 cleanup (thinking default)
- aulas: 1 cleanup (subtitle default)
- dl: 1 cleanup (warning.p default)
- biblioteca/novo: 2 fixes (criando, submit.criar) + 1 cleanup (hero.title default)
- 3 new i18n keys × 5 locales (pt-PT, en, fr, tn, ar)
- 4 trivial cleanups (remove redundant $t() defaults)
- Refs: gap-091 (Skander 1 audit)
```

---

## Resumo global (todos os batches)

| Batch   | Ficheiros | Chaves novas | Cleanups | Entries i18n novas | Commit msg prefix                              |
| ------- | --------- | ------------ | -------- | ------------------ | ---------------------------------------------- |
| batch-1 | 5         | 11           | 1        | 55                 | `fix(i18n): gap-091-batch1 — escola`           |
| batch-2 | 4         | 9            | 1        | 45                 | `fix(i18n): gap-091-batch2 — finanças`         |
| batch-3 | 2         | 6            | 0        | 30                 | `fix(i18n): gap-091-batch3 — hábitos+trabalhos` |
| batch-4 | 4         | 3            | 4        | 15                 | `fix(i18n): gap-091-batch4 — agente+biblioteca+aulas+dl` |
| **TOTAL** | **15** | **29**      | **6**    | **145**            |                                                |

**Ordem de despacho recomendada (paralela, mas com dependência):**
- Os 4 batches são **independentes** entre si — não há dependências de código.
- Recomendação: despachar todos os 4 em paralelo (4 sub-tasks Skander 2 simultâneas).
- Smoke test consolidado pode correr no fim do último batch.

**NÃO TOCAR (em qualquer batch):**
- `.state/watchdog-todos.json`
- `static/quizzes/ccq.json`
- `/legacy/`
- Quaisquer outros ficheiros não-listados neste brief.

Se Skander 2 encontrar conflitos (e.g., outro agente tocou no mesmo ficheiro entre o despacho e a execução), parar e reportar ao watchdog.
