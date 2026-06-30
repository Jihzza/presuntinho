#!/usr/bin/env python
"""Update watchdog-todos.json: close gap-097 (now done) + add gap-098 (3 new i18n keys fixes)."""
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta

p = Path(".state/watchdog-todos.json")
state = json.loads(p.read_text(encoding="utf-8"))

now = datetime.now(timezone(timedelta(hours=2))).isoformat()

# Close gap-097
closed_097 = {
    "id": "gap-097",
    "category": "i18n",
    "description": "write.head.title parity — added to en/fr/tn (was only in pt-PT+ar). Also added 3 new i18n keys (agente.thinking, biblioteca.novo.hero.title, escola.curso.pt.fallbackTitle) × 5 locales = 15 entries. Migrated 3 .svelte hardcoded strings to $t() with {default: 'pt-fallback'}. npm run check 0/0; build green; ready to push.",
    "severity": "baixa",
    "source": "watchdog-tick-2026-06-30-00-i18n-audit",
    "created_at": "2026-06-30T00:30:36.698748+02:00",
    "done": True,
    "sha_pending": "tick-25-commit",
    "closed_at": now,
    "evidence": "5 locales now have write.head.title (pt-PT: 'Writing · Tips Anti-AI', en: 'Writing · Anti-AI Tips', fr: 'Écriture · Conseils Anti-IA', tn: 'Ticra · Tiɣbula Anti-AI', ar: 'الكتابة · نصائح لمكافحة الذكاء الاصطناعي'). 3 additional keys added to all 5 locales (15 entries). agente/+page.svelte thinking bubble now uses $t('agente.thinking'). biblioteca/novo hero h1 uses $t('biblioteca.novo.hero.title'). escola/curso/portugues fallback title uses $t('escola.curso.pt.fallbackTitle'). npm run check 0/0; npm run build green.",
    "updated_at": now,
}

# Add gap-098 — BA #41 Estratégia de Marketing Internacional (next in pipeline)
gap_098 = {
    "id": "gap-098",
    "category": "licao/curso",
    "description": "Cadeira BA #41: Estratégia de Marketing Internacional (slug marketing-internacional). Despachada para Skander 2. 4 lições + mkq quiz 10 perguntas + i18n 5 locales + CATALOGUE wired. Continua o pipeline do Daniel 'faz cursos sobretudo / aulas sobretudo'. Conteúdo: STP internacional (segmentação global: country markets, intermarket, intra-market; targeting: undifferentiated, concentrated, differentiated, micromarketing mix); 4Ps globais (produto: adaptação vs padronização, country-of-origin effects; preço: dumping, transfer pricing, currency hedging; praça: canais internacionais, joint ventures, subsidiárias; promoção: publicidade internacional, mensagens local-globais); estratégias de entrada (exportação indireta/direta, licensing, franchising, joint ventures, subsidiárias integrais, FDI greenfield/acquisition, alliance estratégica, born global); gestão cultural e diplomacia corporativa (Hofstede dimensions: PDI, IDV, MAS, UAI, LTO, IND aplicado a decisões de marketing global).",
    "severity": "baixa",
    "source": "watchdog-tick-2026-06-30-01",
    "created_at": now,
}

# Add gap-099 — i18n parity audit refresh (any new hardcoded .svelte strings)
gap_099 = {
    "id": "gap-099",
    "category": "i18n",
    "description": "Re-auditar PT hardcoded em .svelte após este tick (3 strings migradas: agente.thinking, biblioteca.novo.hero.title, escola.curso.pt.fallbackTitle). Continuar a auditoria gap-091 — Skander 1 deve produzir lista priorizada dos próximos 10-20 strings hardcoded a migrar.",
    "severity": "média",
    "source": "watchdog-tick-2026-06-30-01-i18n-refresh",
    "created_at": now,
}

# Update state
state["lastUpdated"] = now
# Close gap-097: remove from openItems, add to closedItems
state["openItems"] = [item for item in state["openItems"] if item.get("id") != "gap-097"]
state["closedItems"].insert(0, closed_097)
# Add gap-098 and gap-099 to openItems
state["openItems"].append(gap_098)
state["openItems"].append(gap_099)

p.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"state updated: lastUpdated={now}")
print(f"openItems: {len(state['openItems'])}")
print(f"closedItems: {len(state['closedItems'])}")
print(f"open ids: {[i['id'] for i in state['openItems']]}")