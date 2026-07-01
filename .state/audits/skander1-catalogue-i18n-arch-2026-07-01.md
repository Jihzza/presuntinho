# gap-catalogue-i18n-architecture — Skander 1 recommendation (tick-20, 2026-07-01T19:15Z)

## Recommendation: Option (c) — Single JSON with nested i18n

### A vs B vs C

**(a) Inline PT-only + JSON fallback**
- Rápido mas falso i18n: mantém PT hardcoded, duplica strings em JSON
- SEO/accessibility quebrados: HTML ainda em PT, apenas UI traduzido
- Dupla manutenção: alterações em componente + sincronização JSON
- Overhead de fallback PT para todos os locales ≠ en
- Non-negotiable falha de requisitos reais

**(b) JSON estático + i18n split** (`static/courses/<slug>/{pt-PT,en,fr,ar,tn}.json`)
- Separação limpa, tradutores trabalham por ficheiro
- SEO-friendly, escalável para catálogos grandes
- Crítico: 44 cursos × 5 locales = 220+ ficheiros + indexes
- Overhead de fetch múltiplo, complexidade filesystem
- Sobre-engenharia para 44 cursos

**(c) JSON único + nested i18n** (`static/courses-{locale}.json`)
- Única fonte de verdade, ≤6 ficheiros (5 locales + index)
- Lookup simples: `courses[slug].title[locale]`
- Fácil validar paridade, tradutores trabalham por locale
- Cabe numa sprint, escala até 100+ cursos
- Build-friendly: pode gerar páginas estáticas por locale

### Recommendation (5 linhas)

Opção (c) — JSON único com nested i18n. Separação limpa com overhead mínimo. i18n real com dados por locale. Lookup direto (`courses[slug].title[locale]`). Fácil validar paridade. Cabe numa sprint e escala.

### Plano de execução em 3 passos

1. **Extrair PT para `static/courses-pt-PT.json`** — Mover todo o CATALOGUE hardcoded do componente para JSON com estrutura nested (`title: { pt-PT: "...", en: "", ... }`). Criar a fonte única de verdade.
2. **Adicionar lookup i18n ao componente** — Actualizar `src/routes/escola/curso/[slug]/+page.svelte` para fazer fetch de `static/courses-${locale}.json` e lookup `courses[slug].title[locale]` com fallback PT. Verificar que 'portugues' 404s correctamente.
3. **Traduzir locales restantes + validar paridade** — Preencher en/fr/ar/tn nos JSON files, ou adicionar fallback chain (pt-PT → en → vazio). Executar checker de paridade i18n (comparar contagem de keys nos 5 ficheiros) e corrigir diferenças.

## Source
- Session: `20260701_173228_627285`
- Profile: skander1
- Wall time: 1m 6s
- Tool calls: 0 (pure reasoning)