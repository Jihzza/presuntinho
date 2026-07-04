# Runbook — `CHAT_TOKEN_FATMA` + `CHAT_TOKEN_DANIEL` no Netlify

A função `/.netlify/functions/chat` autentica cada request via header `x-chat-token` (constant-time) contra os segredos `CHAT_TOKEN_FATMA` / `CHAT_TOKEN_DANIEL`. Sem estes env vars, `/mensagens/` não envia/recebe.

## Setup (≈3 min)

Pré: tokens já criados via `@BotFather` no Telegram (bot "Fatma" e bot "Daniel"). Acesso Owner ao site no `app.netlify.com`.

1. `https://app.netlify.com/` → site **`presuntinho`** → **`Site settings`** → **`Environment variables`** → **`Add a variable`** → **`Add a single variable`**.
2. Cria **`CHAT_TOKEN_FATMA`** (Key) com o token do bot Fatma (formato `123456789:ABC…`) em **Scopes: Production + Deploy previews + Branch deploys**. **Create variable**. Repete para **`CHAT_TOKEN_DANIEL`** com o token do bot Daniel.
3. **`Deploys`** → **`Trigger deploy`** → **`Deploy site`**. Espera **Live** (~60s).

## Smoke

```bash
# Função activa → 401 missing header
curl -i https://presuntinho.netlify.app/.netlify/functions/chat

# Token inválido → 401 invalid token (confirma env vars lidas)
curl -i -H "x-chat-token: test" https://presuntinho.netlify.app/.netlify/functions/chat
```

`401` esperado em ambos. **`500 Missing CHAT_TOKEN_FATMA`** → env vars não chegaram ao runtime → refazer passos 1-3 e redeploy.

## Troubleshooting

- **"Variable already exists"** → edita em vez de criar.
- **`500 Missing CHAT_TOKEN_DANIEL`** pós-redeploy → redeploy ficou em cache; **Trigger deploy** outra vez, espera **Live**.
- **`401 invalid token`** mas token parece certo → copia completa sem espaços; testa `echo -n "$TOKEN" | wc -c`.
- **`401 missing header`** com curl mas UI funciona → browser adiciona header via `src/lib/services/chat.ts`; confirma que lê `import.meta.env` em build.

## Onde no código

- Definição: `netlify/functions/chat.js:124-125`
- Header: `x-chat-token`
- Profiles: `'fatma' | 'daniel'`

**NÃO** commitar tokens reais. Vivem só no Netlify dashboard.