# Orphan Routes — Easter Eggs Preserved

Status: **mantidas** como easter eggs escondidos (opção (c) do pacote CEO task-056).

## Rotas preservadas

| Rota | Path | Conteúdo |
|---|---|---|
| `/course/` | `src/routes/course/+page.svelte` | Curso genérico (placeholder) |
| `/dl/` | `src/routes/dl/+page.svelte` | Download hub (placeholder) |
| `/write/` | `src/routes/write/+page.svelte` | Editor de notas rápidas |
| `/walk/` | `src/routes/walk/+page.svelte` | Walkthrough / tour guiado |
| `/secrets/` | `src/routes/secrets/+page.svelte` | Secret room (7 cliques no logo) |

## Critério de preservação

- **Não linkadas** na bottom-nav nem em cards do Hub.
- **Acessiveis** via URL directa ou via "secret room" (`/secrets/`) acedida por 7 cliques no logo.
- **HTTP 200** confirmado em todas (smoke tick 25 via `curl -s -o /dev/null -w "%{http_code}"`).
- **Zero impacto funcional** no fluxo principal do CEO.

## Porquê não apagar?

- Apagar remove URLs que podem estar em bookmarks externos / screenshots antigos do CEO.
- Manter permite futura reactivação sem reescrever do zero.
- Volume de código é mínimo (1 ficheiro cada, ~50 linhas).

## Como desactivar no futuro

Se CEO decidir apagar:
```bash
git rm -r src/routes/course src/routes/dl src/routes/write src/routes/walk src/routes/secrets
npm run check && npm run build
```

Se CEO decidir reactivar:
- Adicionar entradas na bottom-nav em `src/routes/+layout.svelte` OU
- Adicionar cards no Hub em `src/routes/+page.svelte`.

---

Referência: `tasks.html` task-056 (decisão CEO pacote 47231).