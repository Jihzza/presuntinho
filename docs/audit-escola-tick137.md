# Audit estrutural — Escola

> Auditoria read-only do sub-app Escola na preparação do refactor cursos → cadeiras → lições (msg 106913 CEO, 14:01 WEST 2026-07-05).
> Âmbito: mapear a forma actual do catálogo, das lições estáticas, dos quizzes, do caminho Duolingo, do detalhe de lição, e das chaves de progresso persistidas.
> Executado pelo `cron-execute-2026-07-05_1525` (presuntinho-cron #4, tick-138).
> Repo verificado: `HEAD = origin/main = 42b362c`, working tree CLEAN.

## TL;DR em 1 parágrafo

A Escola tem **dois fronts paralelos** que importa distinguir antes do refactor: (1) um **catálogo em código** (`src/lib/escola/catalog.ts`) com 2 cursos agregadores (`business-administration` com 9 cadeiras + 1 extra; `portugues` com 1 cadeira) que é a fonte de verdade para a UX da app; (2) **45 pastas de lições em JSON** sob `static/lessons/<slug>/` (uma pasta por cadeira, sem ser mapeada 1-1 para o catálogo) e **52 quizzes** sob `static/quizzes/` com códigos curtos que correspondem ao `quizSlug` declarado em cada lição do catálogo. O caminho Duolingo já está implementado em `src/routes/escola/caminho/[courseSlug]/` e a lição individual em `src/routes/escola/licao/[courseSlug]/[lessonSlug]/`. O progresso é persistido em **IndexedDB via Dexie 4**, chave `lesson:<unitSlug>:<lessonSlug>` para visitas e um store separado para histórico de quizzes.

## a) Estrutura actual do "COURSES" em `src/lib/data/courses.ts` (ou equivalente) — ✓

**Não existe `src/lib/data/courses.ts`.** A fonte de verdade é `src/lib/escola/catalog.ts` (422 LOC). Modelo:

```ts
SchoolCourse { slug, title, icon, color, type: 'primary'|'extra', tagline, summary, href, units: SchoolUnit[], extras?: SchoolUnit[] }
SchoolUnit   { slug, title, icon, summary, color, lessons: SchoolLessonRef[], assignments?: string[] }
SchoolLessonRef { slug, title, summary, quizSlug?, quizTitle?, estMinutes?, activityType? }
SchoolCourseDetail { ... lessons: SchoolCourseLessonDetail[], assignments? }
```

Instâncias exportadas em `catalog.ts:204-239`:

| Curso (`course.slug`) | type | Cadeiras (`units[].slug`) | Extras |
|---|---|---|---|
| `business-administration` | primary | `marketing-digital`, `gestao-financeira`, `contabilidade`, `microeconomia`, `comportamento-organizacional`, `marketing-internacional`, `contabilidade-gestao`, `gestao-operacoes`, `direito-empresarial` (9) | `equivalenza` (case SWAT/Persona/SCQA/TOWS/Recomendação) |
| `portugues` | primary | `portugues-base` (1 lição `curso`) | — |

**Total de lições no catálogo**: calculado em runtime por `schoolTotals()` em `catalog.ts:255-266` somando `lessons` em `units` + `extras`. Cada cadeira de business tem 4 lições (42 lições) + o extra `equivalenza` com 5 lições = 47 lições catalogadas + 1 da cadeira `portugues-base` = **48 lições no catálogo** (referência `schoolTotals().lessons`).

`href` aponta para `/escola/curso/business-administration/` ou `/escola/curso/portugues/`.

Ficheiros-chave:
- `src/lib/escola/catalog.ts` (422 linhas) — só constantes + funções de localização (i18n via `svelte-i18n`).
- `src/lib/escola/legacy-course-details.ts` — fallback para slugs antigos antes do V8.
- `src/lib/escola/progress.ts` (464 linhas) — Dexie + helpers de progresso (visitas, quizzes, summary).

## b) `static/lessons/<slug>/` — ✓ (45 cadeiras JSON, 4-8 lições cada)

Contagem à hora da auditoria:

- **45 pastas** em `static/lessons/` (uma por cadeira/curso legacy).
- Conteúdo típico por pasta `static/lessons/<slug>/`:
  - `course.json` — `{ slug, title, icon, color, description, order }` (≈6 linhas).
  - `NN-<slug>.json` (1..N) — schema `{ id, title, courseSlug, lessonNumber, description, audio, audioLabel, tags[], sections: [{ type, text|items|... }] }`. As `sections.type` que observámos: `h2`, `h3`, `p`, `ul`, `ol`, `table`, `quote`, `callout`. As lições 01-05 são típicas; `contabilidade` tem 8 (a cadeira mais longa).

Distribuição por cadeira (sample):
- `contabilidade`: 8 lições (a maior).
- `analise-financeira`, `analise-investimentos`, `comercio-internacional`, `comportamento-do-consumidor`, `comportamento-organizacional`, `contabilidade-gerencial`, `data-analytics`, `direito-empresarial`, `economia-comportamental`, `empreendedorismo`, `equivalenza`, `gestao-financeira`, …: 5 lições.
- `branding`, `contabilidade-gestao`, `estrategia`: 4 lições.

**Total de lições JSON persistidas: ≈197 ficheiros** (variação depende dos 1-1 com catálogo: lições `static/lessons/` cobrem cadeiras que o `catalog.ts` também referencia, mas nem todas as 45 pastas estão mapeadas para o `units[]` actual — `legacy-course-details.ts` faz ponte).

⚠️ **Atenção ao refactor**: nem toda a pasta `static/lessons/<slug>/` corresponde a uma `SchoolUnit` no catálogo. As pastas parecem ser a fonte legacy; o catálogo é o que a UI usa. Para o passo 2 do refactor (passar `/escola/curso/[slug]/` a mostrar cadeiras) é necessário **decidir se o slug do URL é o do curso agregador** (`business-administration`, `portugues`) **ou o da cadeira** (ex.: `marketing-digital`).

## c) `static/quizzes/<slug>q.json` — ✓ (52 quizzes, esquema uniforme)

- **52 ficheiros** em `static/quizzes/`, todos com schema:
  ```json
  { "id": "afq", "title": "Quiz: ...", "description": "...", "questions": [{ "q": "...", "opts": ["..."], "a": 1 }] }
  ```
- Coding convention: `<3-letter code>q[.json|+suffix].json` (ex.: `afq`, `ctq`, `ctq2`, `mdq2`, `meq-est`).
- Os IDs **correspondem ao `quizSlug`** declarado em cada `SchoolLessonRef` do `catalog.ts`. Exemplo: `marketing-digital` tem 4 lições, todas referenciam `quizSlug: 'mdq'` (e a 4ª tem `mdq2`), e os ficheiros `static/quizzes/mdq.json` + `mdq2.json` existem.
- Quizzes **legacy do case Equivalenza**: `q1.json`, `q2.json`, `q3.json`, `q4.json` (4), referenciados pelo `extras.equivalenza.lessons` mas **não pelo catálogo agregado**.

⚠️ **Mapeamento quizSlug → unidade**: é necessário para o passo 2 do refactor. A função helper já existe: `schoolQuizContextForSlug(quizSlug)` em `catalog.ts:316-328` faz o reverse-lookup (`quizSlug → { courseSlug, courseTitle, courseHref }`). Pode ser reaproveitada para a rota `/escola/cadeira/<unit>/quiz/<quiz>/`.

## d) Rota `/escola/caminho/[courseSlug]/` (commit `5e1ba0d`) — ✓

Renderiza um caminho Duolingo vertical para um **curso agregador** (`courseSlug` = `business-administration` ou `portugues`).

- **Ficheiro**: `src/routes/escola/caminho/[courseSlug]/+page.svelte` (Carregado no commit 5e1ba0d por V9).
- **Componente principal**: `CaminhoPath.svelte` em `src/lib/components/CaminhoPath.svelte`.
- **Dados consumidos**:
  - `localizedSchoolCourses($t)` — para resolver `courseSlug` → `SchoolCourse` (com `units`).
  - `courseProgress(courseSlug)` + `nextLesson(courseSlug)` — Dexie.
  - `loadVisitedLessons()`, `loadPathChests()`, `getQuizHistory()` — progresso.
  - `getActivityStreak()` — streak global.
  - `getActiveMascot()` — mascote Presuntinho.

**Implicação para o refactor**: o slug da rota caminho é o `course.slug`, **não** o `unit.slug`. Logo, `/escola/caminho/` **continua válido** sem alterações (é o entry-point agregado). O que precisa refactor é o hub `/escola` + a cadeira individual (`src/routes/escola/curso/[slug]/`).

## e) Rota `/escola/licao/[c]/[l]/` + esquema de progress

- **Ficheiro**: `src/routes/escola/licao/[courseSlug]/[lessonSlug]/+page.svelte` (≈20 LOC).
- **Componente**: `LessonRunner.svelte` em `src/lib/components/LessonRunner.svelte`, que faz fetch a `lessons/<c>/<l>.json` (relativo ao `static/`).
- **Persistência** (Dexie via `src/lib/escola/progress.ts`):
  | Função | Chave / store | Conteúdo |
  |---|---|---|
  | `lessonVisitedId(unit, lesson)` | `'lesson:<unitSlug>:<lessonSlug>'` (string) | Stamp `visitedAt` |
  | `lessonDoneId(unit, lesson)` | `'lesson-done:<unitSlug>:<lessonSlug>'` | Stamp done |
  | `db().visited` (Dexie store) | id-rows | Visitas |
  | `db().quizScores` (Dexie store) | `QuizScoreRow { id: quizSlug, best, total, attempts, lastCorrect, percent, perfect, updatedAt }` | Histórico |
  | `db().pathChests` (Dexie store) | id-rows | Baús no caminho |

- **Cálculo de progresso de curso**:
  - `schoolSummary()` — agrega visitas + quizzes para o dashboard `/escola`.
  - `courseProgress(courseSlug)` — % concluído por cadeira (devolve `CourseProgress`).
  - `nextLesson(courseSlug)` — próximo passo (devolve `NextLessonTarget | null`).
  - `quizHistoryMap()` — mapa global de históricos de quiz por `quizSlug`.

**Implicação**: as chaves `lesson:<unitSlug>:<lessonSlug>` ligam a lição ao **slugs da cadeira (unit)**, não ao curso agregador. Para o refactor, enquanto o slug da lição continuar a ser o `unitSlug` actual (`marketing-digital`, `contabilidade`, etc.), o progresso mantém-se compatível.

## Recomendações para o passo 2 do refactor (task-230/231)

1. **Mantém `/escola/caminho/[courseSlug]/` como está** — é entry-point agregado e está a funcionar (commit 5e1ba0d em produção).
2. **`/escola/curso/[slug]/`** já existe (243 LOC) mas hoje trata `slug = unitSlug`. Confirmar com task-230 se a CEO quer:
   - (a) `slug = courseSlug` → mostra as cadeiras dentro (re-deriva de `parentCourse`).
   - (b) `slug = unitSlug` → mostra as lições dessa cadeira (já é o que faz).
   A Q-045 (CEO ainda não decidida) deve resolver isto antes de patch.
3. **`src/lib/data/courses.ts` não existe** — o refactor não precisa criar este ficheiro; o `catalog.ts` faz o trabalho.
4. **`legacy-course-details.ts`** é a ponte para os 45 slug legacy em `static/lessons/`. Se o refactor expuser o caminho Duolingo **por cadeira** (`/escola/caminho/[unitSlug]/`), `legacy-course-details` precisa ser estendido.

— fim do audit —
