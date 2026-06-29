# gap-068 — i18n final audit (mass sweep)

**Date:** 2026-06-29 (tick-2026-06-29-06)
**Method:** grep over `src/routes/` and `src/lib/components/` for hardcoded PT literals
**Status:** ⚠️ 2 entries from the 4 specified regexes — **but broader sweep reveals ~20+ additional untranslated PT literals** missed by the narrow regex set (see "Extended sweep" section below).

---

## Primary audit — 4 specified regexes

| File | Line | String | Type |
|---|---|---|---|
| `src/routes/pt/+page.svelte` | 258 | `<th>Truque mnemónico</th>` | text (`<th>`) |
| `src/routes/financas/categorias/+page.svelte` | 196 | `<EmptyState emoji="⚠️" title="Erro" description={error} />` | title (component prop) |

**Total entries (specified regexes):** 2

### Regex-by-regex breakdown

| # | Regex | Hits |
|---|---|---|
| 1 | `>[A-ZÀ-Ú][a-zà-ú]+ [a-zà-ú]+[ ]?<` (multi-word text nodes) | 1 |
| 2 | `placeholder=["'][A-ZÀ-Úa-zà-ú]` | 0 |
| 3 | `title=["'][A-ZÀ-Ú]` | 1 |
| 4 | `aria-label=["'][A-ZÀ-Úa-zà-ú]` | 0 |

---

## Extended sweep — broader patterns the spec regexes missed

The 4 specified regexes only catch multi-word text and a subset of attrs. A broader sweep
over the same scope reveals additional hardcoded PT strings NOT wrapped in `$t()`.

### Single-word `<th>` PT (not caught by regex #1)
| File | Line | String |
|---|---|---|
| `src/routes/pt/+page.svelte` | 256 | `<th>Vogal</th>` |
| `src/routes/pt/+page.svelte` | 324 | `<th>Verbo</th>` |

### `<h2>` / `<h3>` PT headings
| File | Line | String |
|---|---|---|
| `src/routes/escola/curso/portugues/+page.svelte` | 493 | `<h3 class="examples-h">Exemplos</h3>` |
| `src/routes/habitos/habit/[slug]/+page.svelte` | 211 | `<h2 class="section-title">Últimos 90 dias</h2>` |

### `<p>` PT copy
| File | Line | String |
|---|---|---|
| `src/routes/financas/nova/+page.svelte` | 142 | `<p class="sub">Adiciona uma receita ou despesa.</p>` |
| `src/routes/pt/+page.svelte` | 204 | `<p class="sub">Para estudares na tua língua materna.</p>` |
| `src/routes/pt/+page.svelte` | 230 | `<p>Quando reescreveres o assignment na tua voz, lembra-te:</p>` |
| `src/routes/pt/+page.svelte` | 279 | `<p class="mini-intro">Em 7 categorias:</p>` |
| `src/routes/pt/+page.svelte` | 354 | `<p>Testa o que aprendeste com o mini-curso.</p>` |
| `src/routes/secrets/+page.svelte` | 157 | `<p class="sub">As dicas estão sempre visíveis. As recompensas desbloqueiam à medida que descobres cada easter egg.</p>` |
| `src/routes/write/+page.svelte` | 87 | `<p class="sub">Como escrever Q3-Q5 que soem a ti, não a um bot.</p>` |

### `<span>` / `<label>` / `<li>` PT
| File | Line | String |
|---|---|---|
| `src/routes/course/+page.svelte` | 68 | `<span class="tag">Módulo 2</span>` |
| `src/routes/course/+page.svelte` | 85 | `<span class="fw-cta">Abrir lição →</span>` |
| `src/routes/dl/+page.svelte` | 97 | `<span class="tag">Módulo 6</span>` |
| `src/routes/habitos/novo/+page.svelte` | 116 | `<label for="habit-name">Nome <span aria-hidden="true">*</span></label>` |
| `src/routes/pt/+page.svelte` | 232 | `<li>Usa contrações: não, é, estou, vamos</li>` |
| `src/routes/pt/+page.svelte` | 233 | `<li>Opiniões pessoais: "eu recomendaria", "na minha leitura"</li>` |
| `src/routes/pt/+page.svelte` | 234 | `<li>Hedging: "parece-me", "sugere que", "talvez"</li>` |
| `src/routes/pt/+page.svelte` | 235 | `<li>Exemplos específicos do caso (não generalidades)</li>` |
| `src/routes/pt/+page.svelte` | 236 | `<li>Varia o comprimento das frases</li>` |
| `src/routes/trabalhos/assignment/[slug]/+page.svelte` | 170 | `<li class="muted">Sem recursos associados.</li>` |
| `src/routes/write/+page.svelte` | 85 | `<span class="tag">Módulo 5</span>` |

**Extended-sweep total: ~21 additional untranslated PT literals.**

---

## Top files by untranslated PT count (extended sweep)

| Rank | File | Count |
|---|---|---|
| 1 | `src/routes/pt/+page.svelte` | 9 |
| 2 | `src/routes/course/+page.svelte` | 2 |
| 2 | `src/routes/write/+page.svelte` | 2 |
| 4 | `src/routes/dl/+page.svelte` | 1 |
| 4 | `src/routes/escola/curso/portugues/+page.svelte` | 1 |
| 4 | `src/routes/financas/nova/+page.svelte` | 1 |
| 4 | `src/routes/habitos/habit/[slug]/+page.svelte` | 1 |
| 4 | `src/routes/habitos/novo/+page.svelte` | 1 |
| 4 | `src/routes/secrets/+page.svelte` | 1 |
| 4 | `src/routes/trabalhos/assignment/[slug]/+page.svelte` | 1 |

(Plus the 2 entries from the specified regexes — `src/routes/pt/+page.svelte` +1 and
`src/routes/financas/categorias/+page.svelte` +1 — already counted above.)

---

## Conclusion

- **Strict audit (4 specified regexes):** 2 remaining PT literals → i18n ~99.9% but not 100%.
- **Extended sweep:** ~21 more PT literals remain untranslated across 10+ files.
- **i18n is NOT 100% confirmed.** gap-069 should be opened to address the remaining literals,
  with priority on `src/routes/pt/+page.svelte` (9 entries — ironically the PT-language
  study page itself).