# Mini audit Presuntinho V6 — tick reasoning

Base verificada: HEAD `ee3410f`; `npm run build` passou. O working tree não está literalmente limpo porque há alterações em `.state/watchdog-todos.json` e `.state/scripts/`, mas não toquei em código. Li `+layout.svelte`, `/splash`, hub `/`, `/course`, `/dl`, `/escola`, `/pt`, `/escola/curso/portugues` e `+error`.

## Smoke URLs

- `/splash/`: HTTP 200 no preview local; funciona sem login e o layout exclui a chrome autenticada nesta rota.
- `/tn/`, `/fr/`, `/ar/`: HTTP 404. Isto é esperado: não há rotas por locale; o idioma é controlado pelo store `svelte-i18n`/`LanguageSwitcher`, não pelo path.
- `/pt/`, `/course/`, `/dl/`, `/escola/`, `/escola/curso/portugues/`: HTTP 200 no preview local.

## Achados

Decisão principal: `/pt/` é conteúdo PT-intencional/misto, não fallback global. O ficheiro declara “Aulas em PT” e contém matéria de marketing em português, mini-curso de Português, vogais, vocabulário, diálogos e verbos. A maior parte do hardcoded é Content/Lição. Há, porém, UI local dentro da própria rota PT-only: breadcrumb “Hub/PT”, tag, H1, headings, CTA e labels de tabelas. Como a rota é explicitamente PT-only, não recomendo abrir gap global de i18n para as 17 strings; só limparia UI se quisermos consistência estética, não por bloqueio de locale.

Classificação de PT-hardcoded remanescente:
- UI: `/pt` chrome local (“Lições em Português”, “Aulas de Marketing — em PT”, “Fazer o quiz”), `/course` heading/subtitle, `/dl` “Descarregar”/“outras faixas”, algumas strings em `/escola/curso/portugues`.
- Content: frameworks de marketing, exemplos Equivalenza, mini-curso PT, verbos, diálogos, vocabulário; defaults dos cursos em `/escola`.
- Nav: bottom nav está i18n-driven; `/pt` breadcrumb é local intencional.
- Error: `+error.svelte` está i18n-driven com defaults pt-PT.
- Tooltip/a11y: maioria i18n-driven; alguns defaults pt-PT permanecem mas as chaves existem nos 5 locales.

## Próximos gaps sugeridos

1. `fix-escola-duplicate-slug-gestao-operacoes` — high. `COURSES` tem `gestao-operacoes` duas vezes; como o `{#each}` é keyed por `course.slug`, isto pode rebentar em runtime ou renderizar estado errado.
2. `fix-i18n-escola-unkeyed-taglines` — medium. Oito `tagline:` em `/escola/+page.svelte` ainda são literais directos sem `$t(...)`.
3. `audit-tn-equals-en-copy` — low/medium. As 5 locales têm as mesmas 1228 chaves, mas 120 valores de `tn` são idênticos a `en`; alguns são nomes próprios/técnicos, outros podem ser fallback real.
