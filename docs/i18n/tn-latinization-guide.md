# Guia de latinização TN

Este guia fixa o standard actual para a locale `tn` do Presuntinho.

## Regra principal

- `tn` usa escrita latina e direcção LTR.
- `tn` não deve conter caracteres Arabic-script.
- `ar` continua a ser a locale em árabe/RTL.
- Placeholders, emojis, URLs, setas e acrónimos técnicos devem ser preservados exactamente.

## Convenções de transliteração

| Som | Convenção TN | Nota |
| --- | --- | --- |
| ع | `3` | Ex.: `3andi` |
| ح | `7` | Ex.: `7aja` |
| ق | `9` | Ex.: `9al` |
| ش | `ch` | Ex.: `chwaya` |
| غ | `gh` | Ex.: `ghodwa` |
| خ | `kh` | Ex.: `khir` |

## Política de copy

- Preferir frases curtas, claras e seguras.
- Em UI crítica, é aceitável usar empréstimos franceses/ingleses quando evitam traduções fracas.
- Não inventar tunisino idiomático quando houver dúvida: usar uma formulação latina simples.
- Manter o tom Fatma/Presuntinho: carinhoso, directo e leve, sem formalidade excessiva.

## Checklist antes de aceitar uma key TN

1. A string não contém Arabic-script.
2. Todos os placeholders existem e mantêm o mesmo nome: `{count}`, `{date}`, `{title}`, etc.
3. Emojis e setas continuam iguais quando são parte da UI.
4. A string não mistura `ar` com `tn`.
5. Se for uma frase sensível ou idiomática, fica marcada para native review.

## Native review recomendado

Pedir revisão humana para:

- mensagens emocionais/românticas;
- copy de LoveLock, mood e rewards;
- frases longas de onboarding;
- termos académicos difíceis;
- qualquer tradução que tenha sido feita por aproximação.

## Validação obrigatória

```bash
node scripts/i18n-tn-no-arabic.test.mjs --strict
npm run check:i18n
```

O `--strict` tem de passar antes de qualquer commit que toque `src/lib/i18n/tn.json`.
