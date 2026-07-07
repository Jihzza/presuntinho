# Orphan Routes

Routes that exist but are **not linked** from the bottom-nav or Hub. They are
reachable only by direct URL (or, for `/secrets/`, via 7 clicks on the logo).

## Preserved easter eggs

| Rota | Path | Conteúdo |
|---|---|---|
| `/write/` | `src/routes/write/+page.svelte` | Editor de notas rápidas |
| `/walk/` | `src/routes/walk/+page.svelte` | Walkthrough / tour guiado |
| `/secrets/` | `src/routes/secrets/+page.svelte` | Secret room (7 cliques no logo) |

## Legacy Equivalenza case study (superseded)

| Rota | Path | Estado |
|---|---|---|
| `/case/` | `src/routes/case/+page.svelte` | Deep-dive da Equivalenza |
| `/course/` | `src/routes/course/+page.svelte` | Teoria de frameworks (SWOT/TOWS/SCQA/persona) |
| `/pt/` | `src/routes/pt/+page.svelte` | Aulas em português (versão V3) |
| `/escola/walkthrough/[lessonSlug]/` | dynamic | Áudio-first das lições Equivalenza |

Estas páginas foram **substituídas** pela Escola genérica multi-curso
(`/escola/`, com o próprio curso `equivalenza` em `/escola/caminho/equivalenza/`).
Continuam acessíveis por URL directo mas **já não são anunciadas** no
`sitemap.xml` — deixaram de fazer sentido como páginas públicas indexáveis
num lançamento multi-tenant.

## Notas

- `/dl/` (download hub) e `/legacy/` (iframe do site V3) foram **removidas**.
- `/secrets/` foi retirada do `sitemap.xml` — uma "secret room" anunciada no
  sitemap deixa de ser secreta.
- Os exports mortos `v3Content` e `legacySubApp` (que renderizavam estas
  páginas em cards do Hub) foram removidos de `src/lib/registry.ts`.

## Como desactivar no futuro

```bash
git rm -r src/routes/course src/routes/case src/routes/pt \
         src/routes/escola/walkthrough
npm run check && npm run build
```
