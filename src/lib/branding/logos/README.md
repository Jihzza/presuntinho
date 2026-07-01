# Presuntinho — Variantes Logo (task-028)

3 variantes SVG minimalistas fofas para CEO escolher via áudio.

| Ficheiro                     | Variante                | Tom dominante                                | Uso sugerido                  |
|------------------------------|-------------------------|----------------------------------------------|-------------------------------|
| `presuntinho-pig.svg`        | (a) Porquinho rosa fofo | Rosa #fbcfe8 + accent #ec4899                 | Mascote geral / avatar        |
| `presuntinho-heart.svg`      | (b) Coração "Presuntinho" | Gradiente #f9a8d4 → #ec4899 + texto inline   | Splash / login / love brand   |
| `presuntinho-ham.svg`        | (c) Presunto kawaii     | #fda4af (presunto) + #be123c (contorno)      | Hambúrguer / mascote-grelhado |

Todas usam `viewBox="0 0 64 64"` + `preserveAspectRatio="xMidYMid meet"` → escalam
fluido de 16×16 (favicon) até 512×512 (PWA icon sem perda).

## Como activar (após decisão CEO)

```ts
// src/lib/branding/current.ts
export const currentLogo = 'pig'; // ou 'heart' | 'ham'
```

E em `src/app.html`, depois de CEO decidir, substituir o link:

```html
<link rel="icon" type="image/svg+xml" href="/logos/presuntinho-{pig|heart|ham}.svg" />
```

(Em SvelteKit, copiar o ficheiro escolhido para `static/logos/presuntinho-current.svg`
para que o manifest PWA possa referenciá-lo sem build extra.)

## Pendente CEO (decidir por áudio)

1. **Qual das 3 variantes** adoptar como logo oficial? (pig / heart / ham)
2. **Nome dentro do logo** (estilo (b)) ou só imagem limpa (estilo (a) e (c))?
3. **Cor de fundo PWA** — manter `#1f2e4a` (azul escuro / `--bg`) ou passar
   para tom rosa claro coerente com `--accent` #ec4899?
