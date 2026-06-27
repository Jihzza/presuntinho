# Adding a new sub-app

> Step-by-step recipe for shipping a 6th (7th, …) sub-app into the Presuntinho hub.

## Why

The sub-app **registry** in [`src/lib/registry.ts`](../../src/lib/registry.ts) is a flat array of `SubApp` entries. The hub ([`src/routes/+page.svelte`](../../src/routes/+page.svelte)) maps over it and feeds every entry to [`HubCard.svelte`](../../src/lib/components/HubCard.svelte). That means a new sub-app is **never a routing concern for the hub** — you register it once and the card, route link, and accent colour all light up automatically. Each sub-app is therefore a self-contained vertical slice: routes + helpers + (optionally) a Dexie table + i18n strings.

## Prerequisites

A new sub-app is worth shipping when it has:

- A clear data model (one or two collections, a handful of fields).
- ~3 routes: a list, a create form, a detail / edit page.
- A reason to live alongside the existing 5 — i.e. it complements Escola / Trabalhos / Finanças / Hábitos / Biblioteca rather than duplicating one of them.

Good candidates: **Saúde** (medicação, consultas, sintomas), **Receitas** (recipes + shopping list), **Viagens** (itinerários + documentos).

## Step 1 — Extend the Dexie schema

Open [`src/lib/state/db.ts`](../../src/lib/state/db.ts) and bump the schema version. The current schema is at **v4** (see the `this.version(4).stores({...})` block). The new version becomes v5:

```ts
// src/lib/state/db.ts
this.version(5).stores({
  // Re-declare every prior store — Dexie's version chain validates them.
  state:       'id',
  badges:      'id',
  visited:     'id',
  quizScores:  'id',
  secrets:     'id',
  settings:    'id',
  transacoes:  '++id, tipo, data, [tipo+data], categoria',
  orcamentos:  'id, mes',
  categorias:  'id, tipo',
  habitos:     '++id, createdAt',
  habit_logs:  '++id, [habitId+date], habitId, date, createdAt',
  biblioteca:  '++id, *tags, createdAt',
  // New collection — auto-incremented id, secondary index on createdAt.
  receitas:    '++id, createdAt, categoria'
});
```

Rules:

- **Every** version must re-declare **every** prior store. Missing a store breaks the upgrade.
- Add a row interface next to the others (see `ReceitaRow` for the shape):
  ```ts
  export interface ReceitaRow {
    id?: number;
    nome: string;
    categoria: string;
    tempoMin: number;
    createdAt: number;
  }
  ```
- If your migration needs to backfill or transform existing rows, add a `.upgrade(tx => { ... })` block. For brand-new tables no upgrade body is needed — Dexie just creates them.
- Append the new table to the `ReceitasDB` class declaration so TypeScript knows about it.

## Step 2 — Write the helpers

Create `src/lib/<slug>.ts` (e.g. `src/lib/receitas.ts`). Use the existing helpers as a template — [`src/lib/biblioteca.ts`](../../src/lib/biblioteca.ts) is the cleanest example:

- `listItems(filter?: ListFilter): Promise<Item[]>` — newest-first via the `createdAt` index.
- `addItem(input): Promise<number>` — returns the new id.
- `deleteItem(id): Promise<void>` — silent no-op when the row is already gone.
- `getItem(id): Promise<Item | null>` — null when the row was deleted between list render and detail mount.

Conventions:

- `db()` is called lazily so the module is **SSR-safe** — never call it at the top level.
- Normalise user input (trim, lower-case for tags, etc.) before writing.
- Re-export a `New<Slug>Input = Omit<<Slug>Row, 'id' | 'createdAt'>` so components import from one place.

```ts
// src/lib/receitas.ts
import { db } from './state/db';
import type { ReceitaRow } from './state/db';

export interface Receita extends ReceitaRow { id: number; }
export type NewReceitaInput = Omit<ReceitaRow, 'id' | 'createdAt'>;

export async function listReceitas() {
  const rows = await db().receitas.orderBy('createdAt').reverse().toArray();
  return rows.filter((r): r is Receita => typeof r.id === 'number');
}

export async function addReceita(input: NewReceitaInput): Promise<number> {
  return await db().receitas.add({ ...input, createdAt: Date.now() }) as number;
}

export async function deleteReceita(id: number) { await db().receitas.delete(id); }
export async function getReceita(id: number): Promise<Receita | null> {
  const r = await db().receitas.get(id);
  return r && typeof r.id === 'number' ? r as Receita : null;
}
```

## Step 3 — Register the sub-app

Append an entry to [`src/lib/registry.ts`](../../src/lib/registry.ts):

```ts
{
  id: 'receitas',
  name: 'Receitas',
  icon: '🍳',
  color: '#f97316',
  description: 'Receitas, ingredientes e lista de compras',
  route: '/receitas',
  enabled: true,
  order: 6
}
```

`order` controls the position in the hub grid; lower numbers come first. `enabled: false` hides the card without removing the route.

## Step 4 — Create the routes

Mirror the **biblioteca** layout (the cleanest 3-route example):

```
src/routes/receitas/
├── +page.svelte              ← list (cards + search + tag filters)
├── novo/+page.svelte         ← create form
└── receita/[id]/+page.svelte ← detail / edit / delete
```

Conventions:

- All four routes use Svelte 5 runes — `$props()`, `$state()`, `$derived()`, `$effect()`.
- Wrap Dexie calls in `onMount(...)` (the hub + escola + biblioteca already do this). IndexedDB is undefined in SSR so `onMount` is the only safe place.
- Use `<a href="/receitas/{id}/">` for detail navigation. The `trailingSlash='always'` from `+layout.ts` means links should end in `/`.
- List page renders `<HubCard>`-style cards but can be simpler if you only show your own data. See [`src/routes/biblioteca/+page.svelte`](../../src/routes/biblioteca/+page.svelte) for the list pattern.

```svelte
<!-- src/routes/receitas/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { listReceitas, type Receita } from '$lib/receitas';

  let items = $state<Receita[]>([]);
  onMount(async () => { items = await listReceitas(); });
</script>

<svelte:head><title>Receitas — Presuntinho</title></svelte:head>

<section class="receitas">
  <header class="hero">
    <h1>🍳 Receitas</h1>
    <a href="/receitas/novo/" class="btn">+ Nova receita</a>
  </header>

  {#if items.length === 0}
    <p class="empty">Ainda não há receitas. <a href="/receitas/novo/">Adiciona a primeira</a>.</p>
  {:else}
    <ul class="grid">
      {#each items as r (r.id)}
        <li><a href="/receitas/receita/{r.id}/">{r.nome}</a></li>
      {/each}
    </ul>
  {/if}
</section>
```

## Step 5 — Add i18n strings

Edit both [`src/lib/i18n/pt-PT.json`](../../src/lib/i18n/pt-PT.json) **and** [`src/lib/i18n/en.json`](../../src/lib/i18n/en.json). Keep the keys identical and add the new strings under a section named after the slug:

```jsonc
// pt-PT.json
{
  "receitas": {
    "title": "Receitas",
    "empty": "Ainda não há receitas.",
    "add": "Nova receita",
    "form": {
      "nome": "Nome",
      "tempoMin": "Tempo (min)",
      "save": "Guardar"
    }
  }
}
```

Then call `$t('receitas.title')` in the route — pt-PT is the primary, `en.json` is the fallback. The locale store is initialised from `localStorage['fat-pref-lang']` (see [`src/lib/i18n/index.ts`](../../src/lib/i18n/index.ts)).

## Step 6 — Verify locally

Run the full quality gate before opening a PR:

```bash
npm run check    # svelte-kit sync + svelte-check (TS + Svelte)
npm run build    # vite build → build/ must succeed
npm test         # vitest run --passWithNoTests
```

If you added a Vitest spec, drop it next to the helpers as `src/lib/receitas.test.ts` — the `vitest.config` in `vite.config.ts` already includes `src/**/*.{test,spec}.{js,ts}`.

Smoke test in dev mode:

```bash
npm run dev
# open http://localhost:5173/receitas/, log in, add a row, refresh, confirm it persists.
```

## Step 7 — Commit & push

**The principal commits** — never push from a delegated agent. Stage your changes, write a Conventional Commits message, and push:

```bash
git add src/lib/db.ts src/lib/receitas.ts src/lib/registry.ts \
        src/lib/i18n/pt-PT.json src/lib/i18n/en.json \
        src/routes/receitas/

git commit -m "feat(receitas): add Receitas sub-app (v5 schema + 3 routes)"
git push origin main
```

Netlify will auto-deploy and the new card will show up on `/` within ~30 s.

## Common pitfalls

- **Generic arrow functions in `<script>`** — Svelte 5 runes only work inside *non-generic* function declarations. `let f = <T,>(x: T) => x` will break reactivity; declare a real `function f<T>(x: T)` instead.
- **Missing `$` on runes** — `$props`, `$state`, `$derived`, `$effect` are *runtime* identifiers. A typo (`$state()` written as `state()`) silently produces a regular variable that does not trigger re-renders.
- **Trailing slashes** — `trailingSlash='always'` is enforced globally; every `<a href>` to a sub-app route must end with `/`. Skipping it triggers a Netlify redirect that breaks deep links from notifications.
- **pt-PT everywhere user-visible** — Fatma's native language is pt-PT. UI strings, toast messages, button labels, placeholders, and 404 copy all stay in pt-PT by default. The `en.json` file is the safety net, never the primary.
- **Accessibility** — every interactive control needs a **44×44** minimum touch target, a visible `:focus-visible` ring (2px accent outline), and an `aria-label` when the visual label is ambiguous (icons, emoji-only buttons). See `.icon-btn` in `src/routes/+layout.svelte` for the reference style.
- **Reduced motion** — animations (confetti, body-pulse, heatmap pulse) MUST be guarded by `prefersReducedMotion()` from [`src/lib/components/events.ts`](../../src/lib/components/events.ts). Add the same guard to any new motion you introduce.
- **SSR safety** — Dexie throws in Node because `indexedDB` is undefined. Never call `db()` at module top level. Use `onMount` or guard with `if (typeof indexedDB !== 'undefined')`.
- **Migration idempotency** — adding a new Dexie version never mutates existing tables. Use a `.upgrade(tx => …)` callback only when you need to backfill or transform rows.
- **Don't break the legacy URL** — `/legacy/*` is preserved verbatim and the hub still shows the "Site V3" card. Touching `static/legacy/` is a Phase 11+ decision.